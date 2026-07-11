# Post 01: Reading the Skeleton of a Rust Project (crates, modules, and Cargo.toml)

## First, meet this crate's "storefront"

We are not rushing into concepts. First, let us string together — by name — what this thing called `process` can do. You do not need to understand what lies behind these names yet; just get the overall picture in your head.

To spawn a child process, the first step is to prepare a "spec list." Its name is `ProcessSpec`. This list lets you fill in quite a few things:

- `arg` and `args`: add arguments to the command line;
- `cwd`: set the child process's working directory;
- `env`: set environment variables;
- `stdin`, `stdout`, `stderr`: set the policy for the three standard I/O streams, each of which can be `Piped`, `Inherit`, or `Null` (these three are bundled together under the name `ProcessStdio`);
- `kill_on_drop` and `keep_alive_on_drop`: decide whether the child process should be killed or kept alive when this list is "dropped."

Once the list is ready, you hand it to a "spawner" called `ProcessSpawner`, call its `spawn`, and you get back a `ManagedProcess`. This `ManagedProcess` is the "handle" to the child process. It lets you:

- check the process id with `id`;
- pull the three pipes out for your own use with `take_stdin`, `take_stdout`, `take_stderr`;
- take a quick peek at whether it has exited with `try_wait`;
- wait until it finishes with `wait`;
- force it to terminate with `kill`.

Finally, both the spec list and the handle each have a "ready-made concrete implementation": `TokioProcessSpawner` and `TokioManagedProcess`. The `Tokio` in the name hints that they rely on `tokio` under the hood, but that is not today's focus.

That is enough — run through this string of names once. This whole set — `ProcessSpec`, `ProcessStdio`, `ProcessSpawner`, `ManagedProcess`, plus `TokioProcessSpawner` and `TokioManagedProcess` — is the entire "storefront" that `process` puts on display. So the question is: where exactly is this pile of names stored? Let us step inside and take a look.

## crate: the "wooden crate" that holds all of this

That pile of names, along with the implementations behind them, is all packed inside something called a **crate** (a wooden shipping crate). It is the largest unit of organization in Rust.

An analogy: a crate is like a **packed wooden crate**. You put a bunch of parts (code) into the crate, seal it, slap on a label (name, version number), and ship the whole thing out. When someone else wants to use your work, they do not come to you to pick up a single part — they **reference the entire crate**. One crate ultimately compiles into **one** finished product: either a "library" that others can reference, or an "executable program" that can run directly.

This gives rise to two kinds of crates:

- **Library crate**: like a **reference book** or a **parts cabinet**. It does not run on its own; its purpose is to be "consulted and drawn from" by other programs. Rust dictates that the "front door" file of this kind of crate is called **`lib.rs`** — everyone who comes looking enters through this door.
- **Binary crate**: like a **machine with a power button**. It runs on its own, and its entry file is called **`main.rs`**.

So which kind is our `process`? Open its directory and you will see `src/lib.rs`, and **no** `main.rs`. The answer is clear: `process` is a **library crate**. It has no intention of running itself; its mission is to be picked up and used by other programs — for example, when some upstream program needs to manage a bunch of child processes, it references `process` and calls the string of names we just saw.

> One detail worth pausing on: you may have seen Rust projects that have both a `lib.rs` and a `main.rs`. That is usually a project that provides a library and also ships a small program for demonstration or direct execution. But the minimal, cleanest case is to pick one — as `process` does, being only a library.

One comparison worth remembering: if you have written Go, you can roughly think of a crate as "a package inside a module"; if you have written JS/Node, you can think of it as "a package (corresponding to one `package.json`)." It is not exactly the same, but this picture helps you build intuition.

## mod and use: dividing the inside of the crate into drawers

A crate is a wooden crate, but you cannot just dump all the parts into it in one heap — too messy. You need **drawers** to group related parts together. In Rust, this "drawer" is called a **module**, and the keyword written out is `mod`.

Picture it again: a module is like **a room in a building**, or **a drawer in a filing cabinet**. Each drawer holds one category of things (`spec.rs` holds the spec list, `traits.rs` holds the interface contracts, `tokio_process.rs` holds the concrete implementation), and each drawer has its own **label** (name). So even if two drawers contain things with the same name, they will not clash — because their full name is "drawer name + thing name."

Writing the full name every time gets tiring when names are that long. That is where **`use`** comes in. The job of `use` is like **saving a long phone number as a short nickname** in your contacts: once saved, you just say the nickname to dial, without typing out that long string every time.

Abstract talk is useless — let us look at what is **actually** written in this crate's "front door," `src/lib.rs`:

```rust
mod spec;
mod tokio_process;
mod traits;

pub use spec::{ProcessSpec, ProcessStdio};
pub use tokio_process::{TokioManagedProcess, TokioProcessSpawner};
pub use traits::{ManagedProcess, ProcessSpawner};
```

Reading it piece by piece:

- `mod spec;` — this line says: "I have a drawer here called `spec`." Rust will automatically look for the file `spec.rs` and treat it as the contents of the `spec` drawer. So you do **not** need to "register" `spec.rs` anywhere else — the line `mod spec;` is the registration. The next two lines work the same way, corresponding to `tokio_process.rs` and `traits.rs` respectively.
- `pub use spec::{ProcessSpec, ProcessStdio};` — "take `ProcessSpec` and `ProcessStdio` from the `spec` drawer, set them out at the front door, and allow people outside to see them." Here `use` does the "take it out and set it down," and `pub` does the "allow others to see." Without `pub`, the items are set out but the door stays shut — people outside still cannot reach them.

💡 Look back at the "storefront" list from the first section — `ProcessSpec`, `ProcessStdio`, `ProcessSpawner`, `ManagedProcess`, `TokioProcessSpawner`, `TokioManagedProcess`. They are exactly the six names set out at the front door here through `pub use`. Section matches section, perfectly. Anything beyond these six names (for example, the `run_process_lifecycle` inside `tokio_process.rs`) stays shut away in its drawer — invisible and untouchable from the outside. That is precisely the effect modularity is after.

## Cargo.toml: the "packing slip" for this crate

The crate is built, but on the outside you still need to stick on a label that states clearly: what is this crate called, what version is it, and which other crates does it need to work with. This label is the **`Cargo.toml`** file.

And **the tool that ships, manages, and moves these crates around** is called **Cargo** — it is simultaneously your **compiler dispatcher** and your **package manager**: you just declare in `Cargo.toml` "I need the `tokio` crate," and Cargo automatically downloads, compiles, and assembles it for you. If you have written Node, you can think of Cargo as `npm` plus a build tool combined, and `Cargo.toml` as its corresponding `package.json`.

Let us look at this crate's real `Cargo.toml`:

```toml
[package]
name = "process"
version = "0.1.0"
edition = "2024"

[lib]
name = "process"
path = "src/lib.rs"

[dependencies]
tokio = { version = "1", features = ["io-util", "macros", "process", "rt", "sync"] }

[dev-dependencies]
pretty_assertions = { version = "1" }
tempfile = { version = "3" }
tokio = { version = "1", features = ["io-util", "macros", "process", "rt-multi-thread", "time"] }
```

Taking it apart section by section:

- **`[package]`**: the "ID card" for this crate. `name = "process"` is its name, what others use when they reference it; `version = "0.1.0"` is the version number; `edition = "2024"` is the **Rust edition** it uses — you can think of this as "a version profile of the Rust language." Every few years Rust gathers up a batch of new habits and new rules and bundles them into an edition; `2024` is the latest profile at the time of writing. Note that an edition is **not the same as** the compiler version — it is more like a set of "default switches": the same compiler, given a different edition, turns on a different set of language rules.
- **`[lib]`**: this tells Cargo explicitly "this is a library crate, and its front door is at `src/lib.rs`." In fact, even without this section, Cargo looks for `src/lib.rs` by default; writing it out here is just for clarity. If you were making a binary crate, the corresponding entry would be `src/main.rs`, and that section would usually be written as `[bin]`, or simply omitted (defaulting to `src/main.rs`).
- **`[dependencies]`**: the other crates that this crate depends on to **run normally**. Only one is listed here, `tokio`; the string in `features` means "I only turn on these few feature modules of tokio" — tokio is large, and selecting on demand saves a fair amount of compile time and binary size.
- **`[dev-dependencies]`**: crates needed only when **writing tests and examples**; they do not count toward the dependencies you publish to others. Note that `tokio` shows up here again, with `rt-multi-thread` and `time` added to its `features` — because the tests need a multi-threaded runtime and timing functionality, which the actual library does not use.

> By the way: there is also a `Cargo.lock` in the directory. It is **not** something you write by hand — it is a "dependency version lock list" that Cargo generates automatically, recording the exact version each dependency ended up using. Library crates usually put it in `.gitignore` and leave locking to the consumer; binary crates generally commit it, so that everyone builds the same versions.

## The two pitfalls beginners hit most easily

1. **"Why can't the outside find what I wrote?" — most likely you forgot `pub`.**
   Rust's default temperament is "door shut": anything inside a drawer, unless you actively `pub` it, is invisible from the outside. You clearly wrote `ProcessSpec` in `spec.rs`, but as long as `lib.rs` does not have a `pub use` to bring it to the front door, anyone referencing `process::ProcessSpec` will be told "no such thing." Remember this rule: **written in a file ≠ visible to the outside.**

2. **"Where did I register `spec.rs`?" — it is that one line, `mod spec;`.**
   People coming from Python / JS often go looking for an "import the file" action, only to find that Rust seems to "use it without importing." In truth, the `mod spec;` line in `src/lib.rs` is the all-in-one import-and-register line; and Rust looks for the corresponding file by name (`spec` → `spec.rs`). One more note: Rust also has an older module-file style, `spec/mod.rs`; the recommended style nowadays is `spec.rs` — which is exactly the new style you see in this project.

## Recap

- A **crate** is the largest unit of organization in Rust, like a sealed **wooden crate**, ultimately compiled into one finished product: either a library (front door `lib.rs`) or an executable program (entry `main.rs`). `process` is a **library crate**.
- **`mod`** divides the inside of the crate into "drawers" (modules), where the file name is the module name; **`use`** brings a name out of a drawer to be used, and `pub` decides whether it can be seen from the outside.
- The few lines of `mod ...;` + `pub use ...;` in `src/lib.rs` are exactly what place the six "storefront" names from the first section at the front door.
- **`Cargo.toml`** is the crate's packing slip: `[package]` is the ID card (name, version, edition), `[lib]` points to the front door, `[dependencies]` is the real dependencies, and `[dev-dependencies]` is the dependencies needed only for tests.
- **Cargo** is the tool that ships, downloads, and compiles these crates; `Cargo.lock` is the version lock list it generates automatically — you do not write it by hand.

In the next post, we will actually step inside `spec.rs` and see how the "spec list" that `ProcessSpec` represents is put together piece by piece — and along the way we will run into a few concepts in Rust that are very important and very counter-intuitive. The first read may make you frown, and that is fine; we will take them apart step by step when we get there.
