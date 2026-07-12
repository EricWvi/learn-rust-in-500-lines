# Post 05: trait, Associated Types, and Result — Two Traits Define the Whole Interface Contract

## 1. traits.rs has only two traits, yet they nail everything down

In the first four posts we kept circling inside `spec.rs`: first `ProcessStdio`, then `ProcessSpec`. Now let us switch files and open `traits.rs`. This file is short — it defines only two **traits**, `ProcessSpawner` and `ManagedProcess` — but together they pin down the entire **interface contract** for the roles of "spawner" and "process handle." Let us pull the original out first:

```rust
use std::future::Future;
use std::io;
use std::process::ExitStatus;

use tokio::io::{AsyncRead, AsyncWrite};

use crate::ProcessSpec;

pub trait ProcessSpawner {
    type Process: ManagedProcess;

    fn spawn(&self, spec: ProcessSpec) -> io::Result<Self::Process>;
}

pub trait ManagedProcess {
    type Stdin: AsyncWrite + Unpin + Send + 'static;
    type Stdout: AsyncRead + Unpin + Send + 'static;
    type Stderr: AsyncRead + Unpin + Send + 'static;

    fn id(&self) -> Option<u32>;
    fn take_stdin(&mut self) -> Option<Self::Stdin>;
    fn take_stdout(&mut self) -> Option<Self::Stdout>;
    fn take_stderr(&mut self) -> Option<Self::Stderr>;
    fn try_wait(&self) -> io::Result<Option<ExitStatus>>;
    fn wait(&self) -> impl Future<Output = io::Result<ExitStatus>> + Send + '_;
    fn kill(&self) -> impl Future<Output = io::Result<()>> + Send + '_;
}
```

Only a few dozen lines, yet a fair number of new things burst out: `trait` itself, `type Process: ManagedProcess`, `Self::Process`, `io::Result`, `'static`, `Send`, `impl Future`... Do not be intimidated. Most of them orbit around the same core — **trait**. We start by unpacking this most important concept.

(As a side note on the first line `use crate::ProcessSpec;`: `crate::` means "start from the root of this crate" — it pulls in the `ProcessSpec` that was placed at the front door via `pub use` back in Post 01.)

## 2. trait: a "capability contract"

A **trait** is Rust's tool for defining a "capability contract" — it declares: "any type that wants to claim it has this capability must provide these methods." If you have written Java or Go, you can think of it as an **interface**; if you have written TypeScript, think of `interface` as a "shape contract." In fact, we already brushed against traits back in Post 02: every name inside `#[derive(Debug, Clone, Copy, ...)]` — `Debug`, `Clone`, `Copy` — each is a trait; it is just that the compiler implemented them for us automatically back then. Now, we are going to **define** a trait ourselves.

Defining a trait is essentially listing a "required methods checklist":

```rust
pub trait ProcessSpawner {
    fn spawn(&self, spec: ProcessSpec) -> ...;
}
```

Note that only the method's **signature** (name, parameters, return type) is written here, no body — this is exactly what a contract should look like: **a trait only stipulates "what methods must exist," not "how to implement them specifically."** How to implement is each concrete type's own business.

`ManagedProcess` is the same: it lists what a "process handle" must be able to do — report its PID (`id`), hand over the three pipes (`take_stdin` / `take_stdout` / `take_stderr`), peek at whether it has exited (`try_wait`), wait for it to exit (`wait`), force-terminate (`kill`). Whoever can do these things qualifies as a `ManagedProcess`.

## 3. How to "implement" a trait: impl Trait for Type

A contract alone is not enough — someone has to fulfill it. In Rust, the syntax for "fulfilling" a trait is **`impl Trait for Type`** — "I, this `Type`, promise to implement all the methods required by `Trait`." The actual fulfillment code is in `tokio_process.rs`:

```rust
impl ProcessSpawner for TokioProcessSpawner {
    type Process = TokioManagedProcess;

    fn spawn(&self, spec: ProcessSpec) -> io::Result<Self::Process> {
        // ... the concrete logic that actually launches a child process ...
    }
}
```

This is saying: "the type `TokioProcessSpawner` officially applies for the `ProcessSpawner` position," and provides a concrete implementation of the `spawn` method. Once fulfilled, you can call `.spawn(...)` on a `TokioProcessSpawner` — because the compiler sees this `impl` and knows it truly has that method.

Fulfilling `ManagedProcess` follows the same pattern:

```rust
impl ManagedProcess for TokioManagedProcess {
    type Stdin = ChildStdin;
    type Stdout = ChildStdout;
    type Stderr = ChildStderr;

    fn id(&self) -> Option<u32> { ... }
    fn take_stdin(&mut self) -> Option<Self::Stdin> { ... }
    // ... the remaining methods ...
}
```

Here, each line `type Stdin = ChildStdin;` is "filling in a blank" — the blank being the **associated type** left open in the trait. Which brings us to the next concept.

## 4. Associated types: `type Process` leaves a "blank"

Look again at this line in the trait definition:

```rust
pub trait ProcessSpawner {
    type Process: ManagedProcess;
    fn spawn(&self, spec: ProcessSpec) -> io::Result<Self::Process>;
}
```

`type Process;` is called an **associated type**. It is a "blank" that the trait leaves for the implementor — a placeholder type, to be filled in by each concrete implementation. `ProcessSpawner` is saying here: "I only care that after spawning you return 'some process handle type'; which specific handle type, that is up to you." In the previous section, `type Process = TokioManagedProcess;` is `TokioProcessSpawner` filling that blank with `TokioManagedProcess`.

So what is `Self::Process`? Remember Post 02 where we said `Self` is "this current type"? `Self::Process` is "my own associated type `Process`." So `fn spawn(...) -> io::Result<Self::Process>` has a return type of "the kind of process handle that I myself define" — for `TokioProcessSpawner`, that is `TokioManagedProcess`.

The colon `: ManagedProcess` after `type Process` is a **bound** — it demands: "the `Process` type you fill in must itself also implement the `ManagedProcess` trait." In other words, the handle returned by the spawner must be a genuine `ManagedProcess`. We will go into bounds in more detail shortly.

Why use an associated type rather than making `Process` a generic parameter on the trait (like `ProcessSpawner<P>`)? The distinction in one sentence: **an associated type means "each implementation has exactly one choice"** — one spawner corresponds to exactly one handle type, filled once and fixed. Generics, by contrast, allow the same type to be implemented repeatedly with different type parameters. Here, the "one spawner, one kind of handle" relationship is best expressed with an associated type; the more nuanced comparison with generics is left for a future post on generics.

`ManagedProcess`'s `type Stdin`, `type Stdout`, `type Stderr` are also associated types, respectively meaning "what concrete type are the three pipes this handle exposes to the outside" — `TokioManagedProcess` fills them in as tokio's `ChildStdin` / `ChildStdout` / `ChildStderr`. The `take_stdin(&mut self) -> Option<Self::Stdin>` we saw in Post 04 returns "my own kind of pipe," possibly `Some` (not yet taken) or `None` (already taken).

## 5. Result: turning "might fail" into a type as well

The `io::Result<...>` that appears repeatedly in the definitions deserves a formal introduction too. I mentioned `Result` briefly when talking about the `?` operator in Post 04; now let us make it clear.

`Result` is also a standard library enum, looking extremely similar to `Option`, except the "no value" branch carries an extra **error reason**:

```rust
enum Result<T, E> {
    Ok(T),    // success, carrying a value T
    Err(E),   // failure, carrying an error E
}
```

Compare: `Option<T>` is "present / absent," while `Result<T, E>` is "success / failure, and on failure it tells you why." `io::Result<T>` is a **type alias** for `Result<T, io::Error>` — a shorthand convenient to write, specifically for "IO operations that might fail."

Behind this lies a fundamental choice of Rust: **Rust has no exceptions.** In Java/Python, a function can "return normally" or "throw an exception" — and what exceptions it might throw cannot be seen from the function signature; you have to dig through docs or source. Rust writes "might fail" directly into the return type: `fn spawn(...) -> io::Result<Self::Process>` tells you plainly — "I might successfully spawn and return a handle; or I might fail and return an error." Failure is an **ordinary value**, must be handled, and cannot be escaped.

The tools for handling `Result` are almost identical to those for `Option`: `match` handles both branches; `?` on `Err` returns early, on `Ok` extracts the value and continues. The `?` we met in Post 04, when used on `Result`, means "propagate the error to the caller."

> As with handling `Option`: `Result` has `.unwrap()` / `.expect()`, which likewise panic on `Err`. In production code, prefer `match` or `?` to properly handle errors rather than gambling that "this should not fail."

One detail worth discussing: `try_wait`'s return type is `io::Result<Option<ExitStatus>>` — a `Result` wrapping an `Option`. This is not to be scary, but because two kinds of "uncertainty" are stacked: the outer `Result` means "the query itself might fail" (e.g. a system call error), the inner `Option` means "the query succeeded, but the process might not have exited yet." **"Error" and "not exited" are two different things**, so they are expressed with two layers. Being able to read this kind of nesting means you have already gotten comfortable with both `Result` and `Option`.

## 6. Trait bounds: what the colons and plus signs are saying

Finally, let us unpack those intimidating `:` and `+`. Take this line as an example:

```rust
type Stdin: AsyncWrite + Unpin + Send + 'static;
```

The `AsyncWrite + Unpin + Send + 'static` after `type Stdin` is a chain of **bounds**. The colon reads as "must satisfy," and `+` reads as "and." The whole line means: "the `Stdin` type you fill in must simultaneously satisfy: implement `AsyncWrite`, implement `Unpin`, implement `Send`, and be `'static`." Miss one, and the compiler rejects your `impl`.

The colon in the earlier section `type Process: ManagedProcess;` is the same kind of bound — it just requires only one trait. Bounds allow traits to **combine** with each other: one trait can require "my associated types must themselves satisfy some other traits."

## 7. The async boundary: a preview (saved for later discussion)

So what are `AsyncWrite`, `Unpin`, `Send`, `'static`, and the `impl Future<...>` in the method return types? They are all related to **async and concurrency**. I will not expand on them in this post (that is a whole block of content for later), but let me give you a rough orientation so you know what each is responsible for:

- **`AsyncRead` / `AsyncWrite`**: async I/O traits provided by tokio — types that have them can **asynchronously** read or write (without blocking the entire thread waiting for data). The three pipes must satisfy them.
- **`Send`**: a "thread safety" marker — types satisfying `Send` can safely be **moved from one thread to another**. Remember data races from Post 03? `Send` is exactly one of the ways Rust manages thread safety at the type level.
- **`Unpin`**: a detail related to "pinning" in async; skip it for now.
- **`'static`**: this is a **lifetime** — we planted this seed in Post 04. `'static` means "this type does not borrow any short-lived data" and can live until the program ends. This is the first concrete lifetime you have met; the full lifetime rules we will cover separately.
- **`impl Future<Output = ...>`**: `impl Trait` in return position, meaning "returns some type that implements `Future`"; `Output = ...` specifies what this future ultimately produces. `wait` and `kill` return `Future` because "waiting for exit" and "terminating a process" are operations that may take time, best expressed as an async future. The full `async`/`await` story is left for the async post.

> So when reading that big block of bounds in `ManagedProcess`, you can temporarily understand the whole thing as one sentence: **"These three pipe types, and this handle itself, must be async-friendly and thread-safe."** As for the precise meaning of each term, we will cash them in one by one when we reach the async post.

## 8. Recap

- **trait** is Rust's "capability contract," similar to Java/Go's interface. It lists only method signatures (may have no body), stipulating "what methods must exist," not "how to implement them." The `Debug`/`Clone`/`Copy` names inside `#[derive(...)]` are all traits.
- The syntax for implementing a trait is **`impl Trait for Type { ... }`**; once fulfilled, the type gains the methods the trait promises. `TokioProcessSpawner` implements `ProcessSpawner`; `TokioManagedProcess` implements `ManagedProcess`.
- **Associated types (`type T;`)** are placeholder types a trait leaves for implementors to fill; reference them with **`Self::T`**. The colon in `type Process: ManagedProcess;` is a **bound**, demanding that the filled-in type must also implement `ManagedProcess`.
- **`Result<T, E>`** (`Ok(T)` / `Err(E)`) is the "success or failure" enum, carrying one more piece of information than `Option` — the error reason. `io::Result<T>` is a type alias for it. Rust has no exceptions; failure is a value written into the return type that must be handled. Handling tools are consistent with `Option` (`match`, `?`, `unwrap`, etc.). `io::Result<Option<ExitStatus>>` shows "two layers of uncertainty" stacked.
- **Bounds** are introduced with `:` and combined with `+`, requiring a type to satisfy multiple traits. `Send` (thread safety), `AsyncRead/Write` (async I/O), `'static` (lifetime) are all bounds related to async and concurrency — collectively deferred to the async post.

In the next post, we will finally tackle head-on the ownership, borrowing, and lifetimes that we have been building toward since Post 03 — they are the real mechanism behind the borrow checker, and the prerequisite for understanding the `Arc`, `Mutex`, and channel passing that appear later in `tokio_process.rs`.
