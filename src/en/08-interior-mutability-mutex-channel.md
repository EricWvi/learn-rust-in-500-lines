# Post 08: Interior Mutability, `Mutex`, and Channels — How Can `&self` Modify Data?

## 1. Two Signatures That Look Impossible

At the end of the previous post, we said we would return to `tokio_process.rs` to see how `TokioProcessSpawner` and `TokioManagedProcess` actually implement the `ManagedProcess` interface from Post 05. Here is the most intriguing method among them — `wait`:

```rust
fn wait(&self) -> impl Future<Output = io::Result<ExitStatus>> + Send + '_ {
    drop(
        self.stdin
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take(),
    );
    // ... then waits for the child process to exit
}
```

Ignore the details for now and focus on two things.

First, `wait`'s receiver is `&self` — a **shared borrow**. In Post 06 we just established the rule "shared (`&`) means immutable, mutable (`&mut`) means unshared." Yet here `wait`, through `&self`, calls `self.stdin.lock()...take()` — it **modifies** `self.stdin`. How can a `&self` method modify its own field?

Second, when we list out the fields of `TokioManagedProcess`, we find an even stranger detail: it has **no `Child` field at all**:

```rust
pub struct TokioManagedProcess {
    id: Option<u32>,
    stdin: Mutex<Option<ChildStdin>>,
    stdout: Option<ChildStdout>,
    stderr: Option<ChildStderr>,
    exit_rx: watch::Receiver<Option<ExitState>>,
    kill_tx: mpsc::UnboundedSender<KillRequest>,
    drop_tx: Option<oneshot::Sender<()>>,
}
```

Where did the `Child` (tokio's process handle) that actually represents the child process go? `wait` needs to wait for it to exit, `kill` needs to kill it, yet the handle itself doesn't own it — how does it manage?

These two "impossibilities" correspond to two mechanisms in Rust for moving and sharing data: **interior mutability** (solving "how can `&self` modify") and **channels** (solving "how to command data when you don't hold it"). Let's unpack them one by one.

## 2. Review: Why Ordinary Fields Cannot Be Modified Through `&self`

Before answering "how can `&self` modify," let's confirm "why the ordinary case cannot." Look at the `stdout` field — it's a plain `Option<ChildStdout>`, no `Mutex`. Its corresponding accessor method is:

```rust
fn take_stdout(&mut self) -> Option<Self::Stdout> {
    self.stdout.take()
}
```

Notice the receiver is `&mut self` — **mutable borrow**. Precisely because `take` needs to modify `self.stdout` (moving the pipe out and leaving `None` in its place), it must take a mutable borrow for the compiler to approve. All of this is perfectly consistent with the rules from Post 06: to modify, you need `&mut`.

Then the question focuses on `wait`: it also wants to "take stdin, leave `None`," doing the same kind of thing as `take_stdout`, so why is its receiver `&self` rather than `&mut self`? The signatures of `ManagedProcess::wait` and `kill` are both `&self`. This is a contract set by the interface designer: operations like waiting and terminating should not require exclusive access to the handle; a caller holding a shared reference should also be able to `wait`. But once the signature is fixed as `&self`, the method body cannot use `&mut self` — yet we need to modify `stdin`. Rules and requirements collide here.

The answer lies in the problem itself: the limitation is that "ordinary fields can only be modified through `&mut`." Is there a kind of field that **allows you to modify it even with a `&`**? Yes. That is the core of this post — **interior mutability**.

## 3. Interior Mutability: Modifying Things Behind a Shared Reference

**Interior mutability** is an "inverted" design: the type's **exterior** behaves like an immutable value (you can operate on it with just a `&T`), but its **interior** secretly provides the ability to mutate. In plain terms, it's like a **locked safe** — as long as you can "see" the safe (get a `&`), you can turn the lock and put things inside. Whether you can unlock it depends not on whether you hold `&` or `&mut`, but on the safe's own locking mechanism.

Why does Rust permit this "exception"? Because these types shift the safety check for mutation from **compile time** to **runtime**. The compiler sees `&T` and, by the rules, treats it as read-only. But the type internally uses a bit of low-level trickery (the standard library's `UnsafeCell`) to bypass this assumption, and at runtime personally guarantees "only one mutator at a time," thereby taking the safety responsibility onto itself. For the user, what you get is a **safe API** — you don't need to worry about how it works internally.

> Analogy: an ordinary field is like an **open notebook on a desk** — everyone can look (`&`), but if someone wants to write on it, they must first take exclusive possession (`&mut`) to avoid two people writing over each other. An interior-mutable type, by contrast, is like a **shared register with a lock** — everyone can come and make entries (just get a `&` and you can operate), but the register has a lock on it; only one person writes at a time, they just queue up. Rust hands the trouble of "managing the lock" to the type itself.

The standard library provides a whole family of such types, divided into two paths by "single-threaded / multi-threaded":

- **Single-threaded**: `Cell<T>` (whole-value replacement, simple values), `RefCell<T>` (runtime borrow checking, gives you a `&mut`). They are lightweight but **cannot** be shared across threads.
- **Multi-threaded**: `Mutex<T>` (mutual exclusion lock, one at a time), `RwLock<T>` (read-write lock, many readers or one writer). They come with thread synchronization and can be safely shared across threads / tasks.

We only need to file away these "Cell" names for now — we'll cover them in a dedicated post later.

Our `tokio_process.rs` runs on tokio's multi-threaded runtime; `wait` could be called from any worker thread, so the multi-threaded tier applies here — `Mutex`. Let's look at it.

## 4. `Mutex<T>`: Lock Through `&self`, Then Modify

The `stdin` field is `Mutex<Option<ChildStdin>>` — the entire `Option<ChildStdin>` is wrapped inside a mutex. The full steps by which `wait` modifies it are:

```rust
self.stdin                       // &Mutex<Option<ChildStdin>>
    .lock()                      // acquire lock: returns Result<MutexGuard, PoisonError>
    .unwrap_or_else(PoisonError::into_inner)  // extract MutexGuard (including poisoned case)
    .take()                      // move the pipe out of Option<ChildStdin>, leave None in place; if None, you get None
```

Let's unpack three things step by step.

**First, `lock()`'s receiver is `&self` — the mutex itself is an interior-mutable type.** `Mutex::lock(&self)` can be called with just a shared reference because it manages the lock internally. This is the very foundation that makes "`&self` can modify data" possible: what is being modified is not an ordinary field, but a `Mutex`, and `Mutex` allows operations through `&`.

**Second, `lock()` returns a `MutexGuard` (a guard).** You can think of it as the "key tag" you get after unlocking — as long as the key tag is in your hand, the lock remains exclusively yours; you read and write the data inside through the key tag. `MutexGuard` implements `Deref` / `DerefMut` (automatic dereference, seen in Post 04), so you can directly call `Option::take` on it, as if you were operating directly on the inner `Option<ChildStdin>`.

**Third, the moment the guard leaves scope, the lock is automatically released.** This is ownership at work once again (Post 06): when `MutexGuard` is dropped, its `Drop` implementation automatically unlocks. So you don't need to manually write "remember to unlock when done" — use up the guard, it leaves scope, and the lock is returned. The `drop(...)` wrapping that line in `wait` exists precisely to **immediately take stdin, immediately drop the guard, immediately return the lock**, with no delay (the pitfall section will explain why you must not delay).

At this point, the first "impossibility" is resolved: `wait` can modify `self.stdin` because `stdin` is not an ordinary field but a `Mutex` — interior-mutable types allow you to lock and then modify it while holding `&self`.

### A detail: why only `stdin` uses `Mutex`, and not `stdout` / `stderr`?

Look back at the field list and you'll see an asymmetry:

```rust
stdin:  Mutex<Option<ChildStdin>>,   // wrapped in Mutex
stdout: Option<ChildStdout>,         // ordinary field
stderr: Option<ChildStderr>,         // ordinary field
```

Three pipes — why is stdin special? Because `wait` (a `&self` method) needs to **close stdin** — it must take stdin out and drop it, so that child processes driven by stdin (like `cat`, `grep`) read EOF, know that input has ended, and exit on their own, rather than hanging forever waiting for input. In contrast, `stdout` and `stderr` are **not touched at all** in `wait`; they are only taken in `take_stdout` / `take_stderr`, and those two methods take `&mut self` — an exclusive borrow, modifying ordinary fields is perfectly natural, no `Mutex` needed.

In other words: **only state that needs to be modified under `&self` requires the `Mutex` layer of interior mutability; for things only modified under `&mut self`, ordinary fields suffice.** This criterion is practical — you can apply it directly when writing code.

### Poisoning: what `PoisonError` is about

`lock()` returns a `Result`, meaning it can fail — but the reason for failure is not "the lock is broken," but **poisoning**. When a thread panics (crashes) while holding the lock, the lock is marked as "poisoned," because the data inside may have been mutated halfway through, left in an indeterminate state. Thereafter, anyone else calling `lock()` gets `Err(PoisonError)`.

`wait` uses `.unwrap_or_else(PoisonError::into_inner)` here — meaning "even if poisoned, extract the guard and use it anyway." The comment above that line explains the reason: poisoning only means "a previous holder panicked while holding the lock"; the guard itself is still usable. Rather than propagating this error to the caller and dragging the entire call chain into poisoning, it's better to recover the data inside and continue. This is a pragmatic choice born of trade-offs (and indeed a common pattern for handling `std::sync::Mutex` poisoning): we care more about "still being able to take stdin" than about "whether the previous lock holder exited gracefully."

> While we're at it, let's tie up a loose thread: the `impl Future<...> + Send + '_` returned by `wait` — that `'_` means this future borrows `&self` (its lifetime is tied to this call); `+ Send` means it can be moved across threads (`Send` from Post 05), so it can be tossed onto tokio's multi-threaded runtime. The meaning of `impl Trait` in return position was thoroughly covered in Post 07 — the implementor decides the concrete type, the caller only sees its trait.

## 5. Channels: the Handle Doesn't Hold the Process, It Commands Through "Messaging"

The first "impossibility" is resolved. The second remains: `TokioManagedProcess` has no `Child` field, so how does it `wait`, how does it `kill`?

The answer: **`Child` is moved into a standalone background task, and the handle and this task communicate via "channels."** The handle never touches the process directly; instead, it sends commands to the background task and receives receipts back.

This way of thinking has a name: **share by communicating** — the exact opposite of the instinctive "share a piece of memory among everyone" (communicate by sharing). Rob Pike, one of the Go language authors, famously summarized Go's channel concurrency model: "Do not communicate by sharing memory; instead, share memory by communicating." In this file, the handle and the background task pass messages back and forth through channels, rather than jointly holding the same `Child`.

### The background task: the loop that holds `Child`

Return to the `spawn` method (seen in Post 05; this is its implementation). Right before creating the handle, it quietly does one thing:

```rust
handle.spawn(run_process_lifecycle(child, kill_rx, drop_rx, exit_tx));
```

`handle.spawn(...)` launches a **background task** on the tokio runtime, letting it run independently. This task receives the **real `child`** (ownership transferred to it), plus three channel endpoints. Its core is a loop that simultaneously watches several things with `tokio::select!` — whichever happens first gets handled:

```rust
// heavily simplified, omitting retries and error handling
loop {
    tokio::select! {
        status = child.wait() => {            // the child process exited on its own
            publish_exit(status, &exit_tx);   // send exit status through the channel
            return;                            // task ends
        }
        request = kill_rx.recv() => {          // received a "kill process" command from the handle
            handle_kill_request(&mut child, request, ...);
        }
        _ = drop_signal => {                   // received "the handle was dropped" signal
            let _ = child.start_kill();        // initiate kill
        }
    }
}
```

`tokio::select!` (multiplexing) is a very common tool in async Rust: it places several async operations side by side and **runs whichever branch is ready first**, discarding the rest. Here it simultaneously watches "process exit," "received kill command," and "received drop signal" — whichever arrives first gets a response. Its full mechanism (including branch cancellation, `if` guards, etc.) will be covered separately later. For now, just understand it as "a switch that waits for several things at once."

Note a subtlety: after receiving the drop signal, the task does not immediately `return` — instead it first calls `start_kill`, then **stays in the loop** to wait for `child.wait()` to actually return. That's because it must obtain the final exit status and send it to the handle through `exit_tx`; otherwise the handle's `wait` would wait forever without a result. This "send the signal first, then stay to finish up" design is precisely what ensures the handle's `wait` can always get a definitive result.

### Three channels, each responsible for one thing

Three channels are set up between the handle and the task, each using a **different** channel type. This is not arbitrary — each matches a distinct communication pattern:

```rust
let (exit_tx, exit_rx) = watch::channel(None);            // ① exit status
let (kill_tx, kill_rx) = mpsc::unbounded_channel();       // ② kill commands
let (drop_tx, drop_rx) = oneshot::channel();              // ③ drop signal
```

First, let's decode a naming convention so that this string of `exit_tx`, `exit_rx` doesn't feel dizzying. In Rust channel code, **`tx` stands for transmitter (sending end), `rx` stands for receiver (receiving end)** — derived from the old serial communication habit of transmitter / receiver. Constructors like `watch::channel(...)` and `oneshot::channel()` all return a `(tx, rx)` tuple: the first half is responsible for sending, the second for receiving. So the names become self-explanatory: `exit_tx` is the sending end of the "exit status" channel, `exit_rx` is its receiving end; the `exit` / `kill` / `drop` prefixes simply label which concern each channel handles. To put a message into a channel, you hold `tx`; to wait for a message, you guard `rx` — every channel is always a matched pair of sender and receiver.

| Channel | Direction | Type | Why this type? |
| --- | --- | --- | --- |
| ① exit status | task → handle | `watch` | Everyone wants to "glance at the current state," and may check at any time; `watch` lets every receiver instantly see the latest value and get notified on changes |
| ② kill commands | handle → task | `mpsc` (multiple-producer, single-consumer) | kill may be called several times, from several places; `mpsc` is a **stream** that can buffer a sequence of requests |
| ③ drop signal | handle → task | `oneshot` (one-shot) | a handle is only dropped once; `oneshot` sends one value, used once and discarded — the most fitting |

Let's go through each.

**`watch` (① exit status)** is like an **electronic bulletin board**: it always displays the "current latest" exit status. The handle can check at any time (`try_wait` takes a non-blocking glance, `wait`/`kill` first peek to see if it already exited) and instantly read the value on the board, no waiting needed. When the process exits, the task updates the bulletin board once (`exit_tx.send(Some(...))`), and everyone watching the board is notified. The implementation of `try_wait` directly reflects this — it just borrows a glance at the board, returns a result if there is one, returns `None` if not, never waits:

```rust
fn try_wait(&self) -> io::Result<Option<ExitStatus>> {
    match exit_result(&self.exit_rx.borrow()) {   // glance at the bulletin board's current value
        Some(result) => result.map(Some),
        None => Ok(None),
    }
}
```

The trickiest part of this snippet is `result.map(Some)`. `.map()` is a common method on `Result` (and `Option`): you pass it a function, and it applies that function **only to the success value**, passing errors through unchanged — `Ok(x).map(f)` becomes `Ok(f(x))`, while `Err(e).map(f)` stays `Err(e)`. Here `Some` is `Option`'s constructor; Rust allows using constructors as functions (`Some`'s type is `fn(T) -> Option<T>`). So `result.map(Some)` means quite straightforwardly: wrap `Ok(ExitStatus)` into `Ok(Some(ExitStatus))`, and if there's an error, pass it through transparently. This wrapping is precisely what makes the return type match `try_wait`'s declared `io::Result<Option<ExitStatus>>`.

As for `None => Ok(None)`, that's the other branch: the bulletin board has no value yet (the process hasn't exited), so return `Ok(None)` — "no error, just hasn't exited yet." Thus these two layers of nesting `io::Result<Option<...>>` express three states in one go: `Ok(Some(...))` is "already exited," `Ok(None)` is "not yet exited," and `Err(...)` is "something went wrong."

**`mpsc` (② kill commands)** is like a **one-way conveyor belt**: the handle puts kill requests onto it, and the task takes them off one by one. `mpsc` stands for multiple-producer, single-consumer — meaning the sending end can be `.clone()`d into multiple copies (multiple "producers" can all put things on the belt), but the receiving end is singular (the task side consumes them sequentially). The handle clones `kill_tx` into the future returned by the `kill` method, so "each call to kill puts a request onto the belt," and the task side's `kill_rx.recv()` takes them off one by one to execute. Why not `oneshot`? Because kill is not a one-shot affair — you might kill, then if it hasn't died, kill again; a conveyor belt can carry a sequence of requests, a one-shot channel cannot.

**`oneshot` (③ drop signal)** is like a **one-time telegram**: send once, receive once, and after sending the slip is void. The handle's `Drop` implementation uses it — when the handle is reclaimed, it sends a telegram to the task:

```rust
impl Drop for TokioManagedProcess {
    fn drop(&mut self) {
        if let Some(drop_tx) = self.drop_tx.take() {
            let _ = drop_tx.send(());   // send telegram: I'm gone, handle the process as agreed
        }
    }
}
```

`drop_tx`'s type is `Option<oneshot::Sender<()>>` — why the `Option` wrapper? Because of `Option::take` learned in Post 06: extract the sender, leave `None` in place, ensuring that even if the handle's `drop` is theoretically called multiple times, the signal is sent only once. This channel is only created when `kill_on_drop` is enabled (see the `if spec.should_kill_on_drop()` in `spawn`); for handles that don't need to reclaim the process, `drop_tx` starts as `None`, and that line `take()` in `Drop` extracts `None` and does nothing — clean and tidy.

Looking at these three channels together with the `Mutex` from the previous section, the entire handle design becomes clear: **`Mutex` solves "safely modify local state (stdin) under `&self`"; channels solve "ferry commands and state to and from the background task."** One faces inward, the other outward.

## 6. What About `Arc`? We Mentioned It in the Preview

At the end of Post 07, I previewed that this post would encounter `Arc`, `Mutex`, and channels. `Mutex` and channels have all made their appearance — only `Arc` hasn't. I should be honest about this: **this code genuinely has no `Arc`, and that is a deliberate choice worth explaining.**

`Arc<T>` (atomically reference-counted) is Rust's type for implementing **shared ownership**. In Post 06, we said each piece of data has exactly one owner; `Arc` is the "legitimate exception" to this rule — it internally maintains an atomic counter; each `clone()` increments the count by one, and when each clone drops, the count decrements by one; when it reaches zero, the data is truly reclaimed. Several `Arc<T>` values each hold one reference, meaning they **jointly own** the same piece of data. It commonly appears paired with `Mutex`: if you want several threads to simultaneously read and write the same piece of shared data, you use `Arc<Mutex<T>>` — `Arc` handles shared ownership, `Mutex` handles mutual exclusion.

So why does this handle not need `Arc`? Because the handle **has only one owner to begin with** — whoever calls `spawn` gets it, it's never cloned to be shared among multiple tasks. It needs `Mutex` purely for modifying `stdin` under `&self` (interior mutability), not for sharing `stdin` across threads; single-thread-sense interior mutability and multi-thread sharing are two different things. As for the need of "multiple call sites all want to kill," the code satisfies it by **cloning the channel's sending end** (`kill_tx.clone()`) — every place that wants to send a command gets a copy of the sender, while behind the scenes the same task receives. This is lighter than "wrapping a shared handle in `Arc`": cloning a channel sender is far lighter than maintaining a shared-ownership handle.

> A one-line rule to remember the boundary: **use `Arc<Mutex<T>>` when you need "multiple places jointly owning and jointly reading/writing the same piece of data"; when it's just "inside a single owner, need to modify under `&self`," a plain `Mutex<T>` is enough.** The `stdin` in this post belongs to the latter, so there is no `Arc`. When we later encounter "several tasks need to share the same cache, the same connection pool," `Arc` will naturally make its entrance.

## 7. Common Pitfalls

**Pitfall 1: forgetting to handle a closed channel.** When one end of a channel is dropped, operations on the other end will fail: if the sender is gone, `recv()` returns `None`; if the receiver is gone, `send()` returns `Err`. Throughout the code in this post, there are `let _ = ...send(...)` patterns and `match` on `recv` / `changed` return values — these are carefully handling the "the other side may already be gone" case. If you write channels without checking these return values, you can easily silently lose messages at runtime, or get stuck waiting on something that will never be responded to.

**Pitfall 2: mistakenly thinking `&self` methods can casually modify fields.** After reading this post, don't slide to the opposite extreme — thinking interior mutability is "a free pass to modify fields anytime, anywhere." Ordinary fields must still be modified through `&mut self`; only fields **explicitly** wrapped in interior-mutable types like `Mutex` / `RefCell` / `Cell` can be modified through `&self`. Whether to use `Mutex` is a design decision made on demand (see the criterion in section 4), not the default.

## 8. Recap

- `ManagedProcess::wait` and `kill`'s receivers are `&self`, yet `wait`'s implementation needs to modify `stdin` — this appears to violate Post 06's "shared means immutable" rule. The breakthrough is **interior mutability**: certain types allow you to modify their contents while holding `&`, shifting safety checks from compile time to runtime.
- `stdin` is `Mutex<Option<ChildStdin>>`; `wait` calls `self.stdin.lock()` to obtain a `MutexGuard` (guard), then calls `.take()` on the guard to modify data. `Mutex` itself is an interior-mutable type; `lock(&self)` only requires a shared reference — this is the foundation for "`&self` can modify." The guard automatically releases the lock when it leaves scope. Only `stdin` is wrapped in `Mutex` because it is modified in a `&self` method; `stdout` / `stderr` are only modified in `&mut self` methods — ordinary fields suffice.
- `Mutex::lock` returns `Result`; `Err` indicates **poisoning** — the previous lock holder panicked. `.unwrap_or_else(PoisonError::into_inner)` chooses to ignore poisoning and extract the guard anyway — a pragmatic trade-off.
- `TokioManagedProcess` has no `Child` field: the real `Child` is moved into a background task (`handle.spawn(run_process_lifecycle(...))`), and the handle communicates with it via **channels** — this is **share by communicating**.
- Three channels, each with its own role: `watch` (task → handle, sends exit status, like an electronic bulletin board you can glance at anytime) suits `try_wait` / `wait` / `kill` checking status; `mpsc` (handle → task, kill commands, like a one-way conveyor belt that can carry multiple requests); `oneshot` (handle → task, drop signal, a one-time telegram, guaranteed single-send via `Option::take`). The background task uses `tokio::select!` to simultaneously watch "process exit / kill command / drop signal," handling whichever arrives first.
- This post has no `Arc`: the handle has only one owner; it needs `Mutex` (for interior mutability), not shared ownership. When you genuinely need "multiple tasks to jointly own and read/write the same data," use `Arc<Mutex<T>>` — `Arc` manages shared ownership, `Mutex` manages mutual exclusion.
- When one end of a channel closes, operations on the other end will fail — always check return values. Ordinary fields still require `&mut self` to modify; interior mutability is not a free pass to modify fields casually.
