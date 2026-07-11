# Post 00: Before We Begin — Why "500 Lines"

## This series takes a third path

You have probably seen two kinds of Rust tutorials. One starts with `fn main()` and `println!`, teaching the syntax through disconnected snippets — when you finish, you remember a pile of fragments but have no idea how to assemble them into a real project. The other throws a codebase of tens of thousands of lines at you and says "read the source" — except you cannot even find the entrance.

This series takes a third path: **we read exactly one project — real, complete, but only about 500 lines long — from its first line to its last.** The concepts in Rust that give people the most headaches — ownership, lifetimes, `trait`, async, channels — do not appear out of thin air to scare you. Each one shows up in these 500 lines **to solve a specific problem**, and we meet each one right at the scene of that problem.

## Where the "500 lines" comes from

First, where the number comes from. The project the whole series is built around is a small crate called `process` in the `code/` directory — its job is to "help you spawn and manage child processes." Excluding tests, its core source totals **512 lines**:

- `src/lib.rs` — 7 lines, the front door of the whole crate;
- `src/spec.rs` — 153 lines, describes "what kind of child process to spawn";
- `src/traits.rs` — 53 lines, defines the interface contract exposed to the outside;
- `src/tokio_process.rs` — 299 lines, the implementation that actually does the work.

512, roughly 500 — that is where the series gets its name.

Why pick this size in particular? Because it lands on a sweet spot:

- **Small enough to hold in your head.** You can read 500 lines end to end and remember what each file is responsible for, without being overwhelmed by scale.
- **Big enough to be real.** It is not a toy stitched together only for teaching — it has clear layering (description / interface / implementation), genuinely tricky concurrency problems (waiting at the same time for the child to exit, for a "kill" command, and for a "drop" signal), and the compromises and comments made for the sake of correctness. In other words, **it forces you to grapple with the hard parts of Rust.**

In one sentence: 500 lines is small enough to finish, and real enough to be useful once you do.

## You may not even need to open an IDE

The unspoken assumption of many tutorials is "clone the repo, open it in an IDE, and follow along with the source." This series does not ask you to do that.

In every article, **the relevant code is pasted into the body verbatim and explained line by line.** You can read on your phone from a couch, on a tablet, or printed on paper — never touching a computer, installing a single tool, or cloning anything — and still follow exactly what each line is doing.

Of course, if you want to get your hands dirty — this code is real, and it compiles and runs. The `code/` directory in the repo is the crate itself; run `cargo test` and every test passes. When a passage makes you curious, you can always open an IDE, change a couple of lines, and see what happens. But that is a **bonus**, not an **entry requirement**.

## From shallow to deep: how the path runs

The order of this series is deliberately arranged "outside in, easy to hard." The rough route looks like this:

1. **Meet the skeleton first.** What does a Rust project look like? What are `crate`, `lib.rs`, `mod`, and `Cargo.toml`? We lay the map out first.
2. **Then read the data.** How is the "spec list" that `ProcessSpec` represents put together? This is where we meet `struct`, fields, methods, and Rust's most distinctive feature — **ownership**.
3. **Then read the contracts.** How are the two interfaces, `ProcessSpawner` and `ManagedProcess`, defined? This is where we meet `trait` — Rust's way of expressing a "shared capability."
4. **Finally, read the implementation.** In those 299 lines of `tokio_process.rs`, how do async and channels come together to manage the entire lifecycle of a child process? This is the hardest stretch — but by the time you arrive, you have already built up every prerequisite concept.

You will notice that each article adds only one more layer on top of the previous one's foundation. **No article ever uses something it has not yet taught.** That is this series' promise to you: read it in order, and you will never suddenly run into an unexplained wall.

## How to read effectively

- **Read in order.** Concepts are layered one on top of the next; skimming ahead makes it easy to lose your footing by the third layer.
- **Each term is defined only once.** The first time a term appears, I explain it thoroughly with an everyday analogy and record it in the glossary, `terminology.md`. From then on I use it freely instead of redefining it. So if a term slips your mind, look it up in that table.
- **The code is the main character.** Every article starts from a real piece of code and returns, at the end, to understanding that code. As you read, keep asking yourself: "what problem is this line here to solve?"

When you are ready, let us begin with Post 01: understanding the skeleton of a Rust project.
