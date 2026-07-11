# Terminology

Terms introduced in each blog post, paired with the post number that first introduces them. 

| Term | Meaning (short) | First introduced |
| --- | --- | --- |
| `crate` | The largest unit of organization in Rust; compiles into one artifact (a library or a binary). | 01 |
| library crate | A crate meant to be used by other code; its root file is `lib.rs`. | 01 |
| binary crate | A crate that runs on its own; its entry file is `main.rs`. | 01 |
| `lib.rs` | The root / "front door" of a library crate. | 01 |
| `main.rs` | The entry point of a binary crate. | 01 |
| module (`mod`) | A named grouping of code inside a crate; the file name maps to the module name (e.g. `spec` -> `spec.rs`). | 01 |
| `use` | Brings a name into scope so it can be referred to by its short name. | 01 |
| re-export (`pub use`) | Exposes a name from a nested module at a higher path, via `use` combined with `pub`. | 01 |
| visibility (`pub`) | Controls whether an item can be seen from outside its module; the default is private. | 01 |
| `Cargo` | Rust's build tool and package manager. | 01 |
| `Cargo.toml` | The manifest / "packing list" of a crate: name, version, edition, dependencies. | 01 |
| edition | A bundled set of language defaults (e.g. `2024`); not the same as the compiler version. | 01 |
| dependency (`[dependencies]`) | Other crates required for the crate to build and run. | 01 |
| `[dev-dependencies]` | Dependencies used only for tests, examples, and benchmarks. | 01 |
| `Cargo.lock` | Auto-generated file pinning exact dependency versions; not hand-written. | 01 |
