# Post 03: mut, ProcessSpec, and Vec with Tuples

## 1. That `mut` we have been skipping all along

At the end of the last post I left a loose end: `mut`. Look back at the `ProcessStdio` code and you can barely find it — the enum itself is a few read-only values, and `as_stdio(self)` just "reads" the incoming value and computes a result. But the moment you shift your gaze to `ProcessSpec`, `mut` erupts everywhere:

```rust
pub fn new(program: impl Into<OsString>) -> Self { ... }

pub fn stdin(mut self, stdin: ProcessStdio) -> Self {
    self.stdin = stdin;
    self
}

pub fn env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Self {
    self.envs.push((key.into(), value.into()));
    self
}
```

`mut self`, `self.stdin = ...`, `self.envs.push(...)` — these patterns all hint at the same thing: **data here is going to be changed.** So what exactly is `mut`? What makes it worth its own keyword in Rust? In this post we will first make it clear, then step into the `ProcessSpec` "spec list" itself — and you will find that `mut` is exactly the key to understanding how the entire list gets assembled piece by piece.

## 2. Immutable by default: a safety net that catches problems before they happen

Let us start with the most counter-intuitive bit: **in Rust, variables are immutable by default.** You write:

```rust
let x = 5;
x = 6;          // compile error: cannot assign twice to immutable variable `x`
```

This code does not compile. To make `x` mutable, you must **explicitly** tell the compiler:

```rust
let mut x = 5;
x = 6;          // now OK
```

If you have written C, Java, or JavaScript, this is the exact opposite of your intuition — in those languages, variables are mutable by default. Why does Rust flip it? Because "cannot-change-by-default" is a huge safety net.

Imagine you are reading someone else's code and see a variable `config`. In JS, has some function secretly mutated it? You do not know — you have to go dig through every call's source. But in Rust, as long as `config` lacks `mut`, you can be **one hundred percent sure**: from creation until leaving scope, not a hair on it will be touched. When reading code, which values are "fixed" and which are "mutable" can be identified at a glance. A vast number of production bugs come from "a value got changed somewhere you did not notice" — Rust squashes that possibility at compile time.

## 3. `mut` makes mutation visible in broad daylight

`mut`'s second benefit is that it makes "modifying data" **highly explicit**.

Seeing `let mut x = 5;`, anyone reading the code (including yourself a few months later) immediately becomes alert: heads up, this value will change later. In other words, those three letters `mut` are themselves a line of documentation — they spell out "mutation happens here" right on the variable declaration.

The reverse also holds: if you label something `mut` but never actually mutate the variable, the Rust compiler will nag you in return:

```text
warning: variable does not need to be mutable
    let mut y = 5;
        ----^
        help: remove this `mut`
```

It suggests deleting the unnecessary `mut`. `mut` is not meant to be a decoration you casually tack on — it is a solemn declaration that "this really will be changed." The compiler watches to make sure you do not label things recklessly.

## 4. The iron law "shared XOR mutable," and a first meeting with the borrow checker

The real weight of `mut` lies behind an iron law of Rust:

> **Shared XOR mutable.** You can either have multiple **read-only** borrows, or exactly **one** writable borrow — never both at the same time.

A new term appears here: **borrow**. A borrow means using a value temporarily without taking its ownership, and it comes in two kinds: read-only `&` (shared borrow) and writable `&mut` (mutable borrow). Those `&self` / `&mut self` symbols from the last post are exactly this.

This iron law is not a document you are expected to follow on your own — it is enforced **at compile time** by something called the **borrow checker**. It watches every borrow in your code, and the moment it detects a conflict like "multiple places want to read while one place wants to write," it refuses to compile:

```rust
let mut s = String::from("hi");
let r1 = &s;          // read-only borrow
let r2 = &mut s;      // mutable borrow — compiler rejects (E0502)
println!("{} {}", r1, r2);
```

`r1` is still borrowing `s` to read, and `r2` also wants to borrow `s` to write — on the same value, reading and writing collide, and the borrow checker does not allow it.

Why is this rule so important? Because it eradicates at the root two disasters that torment multi-threaded programmers:

- **Data races**: multiple threads simultaneously read and write the same memory, producing unpredictable results. With this rule, such conflicts are stopped at compile time — they never even reach runtime.
- **Iterator invalidation**: iterating over a collection while modifying it inside the loop easily crashes the program. The same conflict gets flagged by the borrow checker ahead of time.

This JS-vs-Rust comparison gives you a visceral sense of the rule's weight:

```javascript
// JavaScript: will the passed-in user be secretly mutated? You have to go read the source.
let user = { name: "Alice", role: "admin" };
doSomething(user);
```

```rust
// Rust: read-only borrow &user — the caller can be confident user will not be changed
print_role(&user);

// To mutate, you must explicitly borrow as mutable — this line literally says &mut
let mut settings = Settings::new();
apply_defaults(&mut settings);
```

Now, the exact mechanism of how the borrow checker works — that entire "ownership + lifetime" system behind it — is a whole tough subject, and I will spend a dedicated post (maybe even several) slowly taking it apart later. For today, you only need to remember three things: it exists, it watches "shared XOR mutable," and it eliminates an entire class of bugs at compile time. We are just planting the seed here; we will let it sprout later.

## 5. Why not make everything immutable: the performance case for `mut`

At this point you might ask: if immutability is this safe, why does not Rust just go full functional language and make everything absolutely immutable?

The answer is **performance**. The bottom layer of a computer — CPU and memory — is fundamentally mutable hardware. If everything were truly immutable, then every "modification" of a value would require allocating a new block of memory and copying the old data over — the overhead would be enormous. Rust chooses to give you the protection of "immutable by default" where you need safety, while also letting you use `mut` to **mutate in place** where you need performance, without copying.

This is what Rust calls a **zero-cost abstraction**: with `mut`, you get the "sense of safety" of functional programming while retaining the "high performance" of imperative languages' "direct memory manipulation, in-place mutation" — both, with neither compromised.

## 6. Walking into ProcessSpec: what this "spec list" looks like

With `mut` as our new lens, let us formally open the definition of `ProcessSpec`. This is the "spec list" for configuring a child process from the last chapter:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessSpec {
    program: OsString,
    args: Vec<OsString>,
    cwd: Option<PathBuf>,
    envs: Vec<(OsString, OsString)>,
    stdin: ProcessStdio,
    stdout: ProcessStdio,
    stderr: ProcessStdio,
    kill_on_drop: bool,
}
```

That `#[derive(Debug, Clone, PartialEq, Eq)]` line we already covered last time — makes the struct printable, clonable, and equality-comparable. No need to repeat it. Let us scan through the fields to get an overall picture, then pick the key ones to unpack:

- `program: OsString` — the executable to launch (e.g. `"echo"`);
- `args: Vec<OsString>` — command-line arguments, a list;
- `cwd: Option<PathBuf>` — working directory, maybe set or not (this `Option` we save for the next post);
- `envs: Vec<(OsString, OsString)>` — environment variables, a list of "key=value" pairs, the main subject of this post;
- `stdin` / `stdout` / `stderr: ProcessStdio` — the three standard stream policies, last chapter's enum;
- `kill_on_drop: bool` — should the child process be killed when this spec is dropped?

Most of these types you can probably already guess the gist of, but two new faces need a formal introduction: `OsString`, and that somewhat intimidating `Vec<(OsString, OsString)>`.

## 7. First, meet a new face: OsString

`OsString` comes from the standard library's `std::ffi` module (`ffi` is short for foreign function interface, roughly meaning "the part that talks to the operating system"). It is an **OS-native string**.

Why does such a string need to exist separately? Because the `String` we normally use has Rust's guarantee that it contains **valid UTF-8 text** — which suffices for most applications — but two things, command-line arguments and environment variables, are not guaranteed by the operating system to be valid UTF-8 (on certain systems and in certain language environments, filenames and environment variables can contain non-UTF-8 bytes). So for strings that "directly interact with the OS," Rust uses `OsString` instead of `String`.

For now, just think of it as "a `String` tailor-made for command lines and environment variables." Deeper distinctions we can expand on when we need them.

## 8. The key breakdown: `Vec<(OsString, OsString)>`

This is the main act of the second half of this post. The type of the `envs` field, `Vec<(OsString, OsString)>`, wraps three layers from outside in: `Vec`, `<>`, and the inner tuple `(OsString, OsString)`. Let us peel them one by one.

**First layer: what is `Vec`?** `Vec` (pronounced "vector") is the most commonly used **growable array** in Rust — like JavaScript's `Array`, Java's `ArrayList`, Go's slice, Python's `list`: it holds a sequence of values of the same type, and its length can grow at any time. An empty one is created with `Vec::new()`, and `.push()` appends to the end:

```rust
let mut args: Vec<OsString> = Vec::new();   // an empty list
args.push(OsString::from("hello"));          // add one
args.push(OsString::from("world"));          // add another
```

Note `mut` appearing here: the list itself needs to be mutable to be `push`ed, so it is declared `let mut args`.

**Second layer: what is `<>`?** The `OsString` inside the angle brackets after `Vec` is a **generic parameter**. Its meaning: "this `Vec` holds items of type `OsString`." `Vec` is a universal container; what type it holds is specified by you in angle brackets — `Vec<i32>` holds integers, `Vec<String>` holds strings, and `Vec<OsString>` holds `OsString`s. So `args` is "a list of `OsString`s."

**Third layer: what is the tuple `(OsString, OsString)` inside?** The parentheses wrapping `(A, B)` form a **tuple**, whose job is to **pack several values together in a fixed order into a single value**. `(OsString, OsString)` is one tuple containing two `OsString`s — a natural fit for representing "a key, a value" pair.

Combine all three layers, and the meaning of `Vec<(OsString, OsString)>` becomes clear: **a list of tuples, where each tuple is a `(key, value)` pair.** That is exactly `envs` — a set of environment variables.

So how does this list get filled up? Look at the `env` configuration method:

```rust
pub fn env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Self {
    self.envs.push((key.into(), value.into()));
    self
}
```

Every time you call `.env("PATH", "/usr/bin")`, the method body `push`es one `(key, value)` pair to the tail of `envs`. Call it three times, and `envs` contains three pairs.

> Wait — there is a design choice here worth a second look: why are environment variables stored as `Vec<(key, value)>` rather than a map (like JS's `Map` or Python's `dict`)? Because this spec list needs to **preserve the order you set**, and also **allow the same key to appear multiple times** — a later entry overrides an earlier one, which perfectly matches the "environment variable override" semantics. With `Vec<(key, value)>`, both ordering and duplication come naturally; most map types automatically deduplicate and do not guarantee order, making them a worse fit.

## 9. ProcessSpec's implementation: builder and accessor

With the definition clear, look at the methods on `impl ProcessSpec` and you will see they split neatly into two groups.

**The first group is "configuration" methods, forming the so-called builder pattern:**

```rust
pub fn new(program: impl Into<OsString>) -> Self { ... }

pub fn arg(mut self, arg: impl Into<OsString>) -> Self { ... }
pub fn args<Args, Arg>(mut self, args: Args) -> Self where ... { ... }
pub fn cwd(mut self, cwd: impl Into<PathBuf>) -> Self { ... }
pub fn env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Self { ... }
pub fn stdin(mut self, stdin: ProcessStdio) -> Self { ... }
pub fn stdout(mut self, stdout: ProcessStdio) -> Self { ... }
pub fn stderr(mut self, stderr: ProcessStdio) -> Self { ... }
pub fn kill_on_drop(mut self) -> Self { ... }
pub fn keep_alive_on_drop(mut self) -> Self { ... }
```

Their signatures all look nearly identical: `mut self -> Self` — take the old `self`, modify it, return a new one. Revisiting `mut` from the beginning of this post: each of these methods needs to **modify** some field of `self`, so the receiver must be `mut self`. And precisely because each method returns a new `Self`, you can chain them:

```rust
let spec = ProcessSpec::new("echo")
    .arg("hello")
    .env("RUST_LOG", "debug")
    .stdout(ProcessStdio::Piped);
```

> As an aside on that `<Args, Arg>` and trailing `where ...` in `args`'s signature: that is how generic methods are written, meaning "my method can accept anything that can be iterated to produce elements that can be converted into `OsString`." This is advanced Rust generics; for today, just recognize the shape. A deeper introduction will come later.

**The second group is "access" methods**, all using `&self`, read-only and non-mutating:

```rust
pub fn program(&self) -> &OsStr { ... }
pub fn args_iter(&self) -> impl Iterator<Item = &OsStr> { ... }
pub fn cwd_path(&self) -> Option<&Path> { ... }
pub fn envs(&self) -> impl Iterator<Item = (&OsStr, &OsStr)> { ... }
pub fn stdin_policy(&self) -> ProcessStdio { ... }
pub fn stdout_policy(&self) -> ProcessStdio { ... }
pub fn stderr_policy(&self) -> ProcessStdio { ... }
pub fn should_kill_on_drop(&self) -> bool { ... }
```

They do not consume `self` (using `&self`, echoing last chapter's "borrow" concept); they only **look up** the contents written into the spec list and show them to you. Configuration and access, clearly separated responsibilities: one group handles "editing the list," using `mut self`; the other group handles "reading the list," using `&self`.

## 10. Recap

- **Rust variables are immutable by default**; to mutate, you must explicitly write `mut`. This default rule both prevents "accidental mutation" bugs and makes "which values change" obvious when reading code. Excess `mut` will even trigger a compiler warning telling you to remove it.
- Rust's iron law is **"shared XOR mutable"**: either multiple read-only borrows `&`, or one mutable borrow `&mut` — never both. This rule is enforced at compile time by the **borrow checker**, eradicating data races and iterator invalidation at the root. Its full mechanism we save for a future deep dive.
- `mut` lets you enjoy the safety of "immutable by default" while also **mutating in place** when needed, combining functional safety with imperative performance (zero-cost abstraction).
- `ProcessSpec` is a "spec list" for configuring a child process. Its fields include `OsString` (OS-native string, for command lines/environment variables) and `Vec<(OsString, OsString)>` (a list of key-value pairs, preserving order and allowing duplicate-override).
- `Vec` is a growable array; angle brackets `<>` hold the **generic parameter** specifying what type the container holds; parentheses `(A, B)` form a **tuple**, packing values in a fixed order.
- `ProcessSpec`'s methods split into two groups: **builder** configuration methods use `mut self -> Self`, achieving chainable calls by returning a new `Self`; **accessor** methods use `&self`, read-only and non-mutating.

In the next post, we will tackle two types in `ProcessSpec` that we have not yet touched — `Option` and `PathBuf` — and push today's brief taste of the borrow checker one step further.
