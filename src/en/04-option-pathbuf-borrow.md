# Post 04: Option, PathBuf, and Deeper Borrowing

## 1. Two new faces hidden in a single field

Last time, when scanning through `ProcessSpec`'s fields, I deliberately said nothing about `cwd`:

```rust
cwd: Option<PathBuf>,
```

It represents "the child process's working directory." But look at its type — one short line crams in two things we have not formally met: `Option` and `PathBuf`. Even more interesting is the method that accesses it:

```rust
pub fn cwd_path(&self) -> Option<&Path> {
    self.cwd.as_deref()
}
```

The field is clearly `Option<PathBuf>`, yet the method returns `Option<&Path>` — `PathBuf` somehow turned into `&Path`. What is this string of symbols saying? We start with the concept that is most critical and most worth understanding on its own merits: `Option`.

## 2. Option: using a type to clearly express "might not be there"

### What it is

`Option<T>` is an **enum** provided by the standard library — yes, the same kind of enum we covered in Post 02, except that the standard library pre-defined this one for you. It has only two variants:

```rust
enum Option<T> {
    Some(T),   // there is a value, of type T
    None,      // nothing
}
```

Meaning: a value of type `Option<T>` is either `Some(containing a T inside)`, or simply `None` (nothing at all). For instance, `cwd: Option<PathBuf>` — the working directory is either set (`Some(some path)`) or not (`None`). Or in `traits.rs`, `id(&self) -> Option<u32>` — a process's PID is either obtainable (`Some(123)`) or not (`None`).

The `<T>` inside `Option<T>` is the **generic** we covered last time: `Option` does not restrict what type it holds; you specify it — `Option<u32>`, `Option<PathBuf>`, `Option<String>`, as you like.

### Why Rust invented it

People who have written Python, JS, Java, or Go know "nothing" all too well: Python's `None`, JS's `null` / `undefined`, Java's `null`, Go's `nil`. They all share a common flaw — **any variable, no matter how its type is declared, can suddenly be "empty."** You get a `User` object, call `user.name`, and `user` turns out to be `null` — the program crashes in your face (Java's `NullPointerException`, Python's `'NoneType' object has no attribute`). The industry calls null references "the billion-dollar mistake" — because the crashes and bugs they cause have probably cost far more than that.

Rust simply **has no null**. In Rust, "might not be there" must be explicitly written as `Option`, and — this is the key — **the type system forces you to handle the "nothing" case before you use it.** You cannot treat an `Option<PathBuf>` as a `PathBuf`; the compiler stops you and demands you first confirm whether it is `Some` or `None`. So the entire class of "forgot to check for null → crash" problems basically does not exist in Rust.

### How to use it

`Option` comes with a set of companion tools. Let us meet the most commonly used ones.

**The most thorough way is `match`** (our old friend from Post 02). It forces you to think through both branches:

```rust
let msg = match spec.cwd_path() {
    Some(path) => format!("working directory is {}", path.display()),
    None        => "no working directory set".to_string(),
};
```

**If you only care about the "present" case**, writing `if let` is simpler — it is a concise version of `match` that only executes when a single pattern matches:

```rust
if let Some(cwd) = spec.cwd_path() {
    command.current_dir(cwd);   // only set the directory when there really is one
}
```

This is not made up — the code that actually launches a child process in `tokio_process.rs` writes exactly these lines when handling the working directory. `if let Some(cwd)` does "if present, extract it and call it `cwd`" in one shot; on `None` the whole block simply skips.

**If you want to pass the "nothing" responsibility up the call chain**, use the `?` operator: on `None` it immediately returns `None` from the current function; on `Some(x)` it extracts `x` and carries on. (`?` also works on the `Result` type for error handling, which we will go into when we cover error handling.)

**If you just want to ask a yes/no question**, use `is_some()` / `is_none()`:

```rust
if spec.cwd_path().is_none() { /* no working directory set */ }
```

**If you are absolutely certain "this is definitely Some"**, use `unwrap()` or `expect("explanation")` to yank the value out directly:

```rust
let path = spec.cwd_path().unwrap();   // if it's None, the program will panic
```

> `unwrap` is a tool to be wary of: on `None` it causes the program to **panic** (crash and exit immediately). In examples and tests, using it casually is fine; but in production code, prefer `match` / `if let` / `?` to properly handle the "nothing" case, rather than gambling that "it should not be None."

There are also "combinator" methods like `unwrap_or(default)` (give a fallback if absent) and `map(function)` (transform the value inside, staying `None` if it was `None`) — just keep them in mind for now; we will expand on them when needed.

### An example where Option is used to its fullest: take

`Option` also has one usage that especially showcases the cleverness of its design, right in `traits.rs`. Look at these `ManagedProcess` methods:

```rust
fn take_stdin(&mut self)  -> Option<Self::Stdin>;
fn take_stdout(&mut self) -> Option<Self::Stdout>;
fn take_stderr(&mut self) -> Option<Self::Stderr>;
```

The child process's three pipes can be "taken." The first time, you get `Some(pipe)`; a second time, the same slot has been emptied, so it becomes `None`. **"Something used to be here, but it was taken — now it is empty" — this is exactly what `Option` is inherently good at expressing.** The act of taking corresponds precisely to `Option`'s `.take()` method: it turns `Some(x)` into `None` while handing that `x` back to you:

```rust
let mut pipe: Option<String> = Some("stdout pipe".to_string());
let got = pipe.take();          // take: got = Some("stdout pipe")
// now pipe is None; taking again only yields None
```

In other languages you would have to simulate this "taken-now-empty" semantics by "setting to null and remembering to check every time"; Rust expresses it cleanly with one type, and has the compiler watch to make sure you check before every use.

## 3. PathBuf: a string purpose-built for "paths"

Back to the other half of that `cwd` field: `PathBuf`.

You may have noticed that in Rust, "strings" come in pairs: the owning `String` and its read-only slice `str`; the `OsString` and `OsStr` we met last time are another pair. `PathBuf` and `Path` are a third pair following the same pattern:

- **`PathBuf` (path buffer)** is an **owning, growable** path, analogous to `String` / `OsString`. You can append to it: `PathBuf::from("/etc").join("hosts")` produces a new `PathBuf` with the content `/etc/hosts`.
- **`Path`** is a **read-only path slice**, analogous to `str` / `OsStr`, typically appearing as the borrow `&Path`.

Why make a dedicated type for "paths" instead of just using strings? Two reasons. First, **cross-platform**: Windows uses `\` as the separator, Unix uses `/`; `PathBuf::join` automatically splices according to the current system — you do not need to worry about it yourself. Second, **paths are also not guaranteed to be valid UTF-8** — `PathBuf` is built on top of `OsStr`, so it can hold all those funky names that file systems throw at you.

So `cwd: Option<PathBuf>` combined reads very naturally: a **possibly-present, possibly-absent**, **appendable, cross-platform working directory**.

## 4. Pushing borrowing one step further: why the accessor returns `&Path`

Now back to the detail that raised our suspicion: the field is `Option<PathBuf>`, yet the access method returns `Option<&Path>`. Why?

First, the answer — `cwd_path`'s body is a single line:

```rust
pub fn cwd_path(&self) -> Option<&Path> {
    self.cwd.as_deref()
}
```

The keyword is "borrowing." Last time we learned the borrow checker's iron law "shared XOR mutable," but that was just hearing a rule. Now, using this method, let us see what borrowing actually looks like in real code.

**`cwd_path` takes `&self` — a read-only borrow of the entire `ProcessSpec`.** Since it only reads and has no intention to change, it naturally has no reason to copy that entire `PathBuf` and then hand it back to you (copying a path string has a cost). It directly **lends out** a read-only reference `&Path` that points to its own internal `cwd` field — follow that reference and you can see the path. Zero copy, very cost-effective.

This also makes last post's rule concrete. `&self` is a **read-only borrow**, and the iron law permits "multiple read-only borrows to coexist." So usage like the following is perfectly fine in Rust — you can call several read-only accessors on the same `spec` simultaneously, and their borrows coexist:

```rust
let prog = spec.program();       // read-only borrow 1: returns &OsStr
let cwd  = spec.cwd_path();     // read-only borrow 2: returns Option<&Path>
// both borrows are just "reading"; they coexist, no conflict
```

(Interleave a `&mut spec` mutation in the middle, and the borrow checker would jump out to stop you — because that would violate "mutable means not shared.")

So what does `as_deref()` do? It is responsible for turning `Option<PathBuf>` into `Option<&Path>`. `deref` means "dereference"; the effect here: **"downgrade"** the owning `PathBuf` into a read-only `&Path` (because `PathBuf` implements a trait called `Deref`, allowing it to lend itself out as a `Path`). `as_deref` applies this "downgrade" inside the `Option`: `Some(a path)` becomes `Some(the borrowed &Path)`, and `None` stays `None`. So the field's `Option<PathBuf>`, seen from outside, becomes `Option<&Path>`.

> If you connect this section back with the earlier review of `String`/`str`, `OsString`/`OsStr`, `PathBuf`/`Path`, you will notice a recurring pattern in Rust: **"one owning type + one borrowing type"** appearing in pairs. This is not a coincidence — it is a manifestation of the borrowing philosophy carved deep into the type system: **in Rust, "do you own it, or are you just borrowing it" is a question the type itself answers.** The borrow checker can do its job precisely because these types put ownership relationships on the table in plain sight.

Finally, one more seed to plant: the `&Path` returned by `cwd_path` points to memory inside `spec`. That means **it cannot outlive `spec`** — once `spec` is destroyed, that reference becomes a dangling pointer. The Rust compiler uses a mechanism called **lifetimes** to guarantee at compile time that a reference never "lives longer than the data it points to." You may have noticed that the signature `cwd_path(&self) -> Option<&Path>` does not write out any lifetime — that is because the compiler **elides** it according to a set of default rules. The full rules of lifetimes are another tough subject, saved for later; today just internalize one thing: **the returned `&Path` is bound to `self` — it is "borrowed from" `self`.**

## 5. Recap

- **`Option<T>`** is a standard library enum with two variants `Some(T)` / `None`, purpose-built to express "might not be there." Rust **has no null**; every "could be absent" situation must be expressed with `Option`, and the type system forces you to handle `None` before use — the entire class of null-pointer crashes is thereby essentially eliminated.
- Common tools for handling `Option`: `match`, `if let Some(x)`, `?` (propagate `None` upward), `is_some()` / `is_none()`, `unwrap()` / `expect()` (panics on `None` — use sparingly in production), `unwrap_or` / `map` etc. `.take()` in combination with `Option` also elegantly expresses "taken-now-empty" semantics.
- **`PathBuf`** is an owning, appendable, cross-platform path (like `String`); **`Path`** is its read-only slice (like `str`, often appearing as `&Path`). `PathBuf` is built on top of `OsStr` and does not require valid UTF-8.
- `cwd_path(&self) -> Option<&Path>` returns a **borrow**, not a copy: `&self` is a read-only borrow, and multiple read-only borrows can coexist ("shared"); `as_deref()` downgrades `Option<PathBuf>` to `Option<&Path>`.
- Rust's "owning type + borrowing type" pairs (`String`/`str`, `OsString`/`OsStr`, `PathBuf`/`Path`) reflect the borrowing philosophy in the type system. The returned `&Path` is **lifetime-bound** to `self` — full rules deferred.

In the next post, we will leave `spec.rs` behind and step into `traits.rs` to see how the two traits `ProcessSpawner` and `ManagedProcess` define the entire "interface contract" for the spawner and process handle roles.
