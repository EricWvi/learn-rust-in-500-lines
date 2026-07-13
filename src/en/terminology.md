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
| `enum` | A type whose value can only be one of a few listed possibilities. | 02 |
| variant | Each possible value listed in an `enum`. | 02 |
| `impl` block | A code block that attaches associated functions/methods to a type. | 02 |
| associated function / method | A function inside an `impl` block; one whose first parameter is `self` is called a method. | 02 |
| attribute (`#[...]`) | A `#[...]` directive written above an item, e.g. `#[derive(...)]`, `#[default]`. | 02 |
| `derive` | An attribute that tells the compiler to auto-implement a set of traits using default rules. | 02 |
| trait | A capability contract (like an interface); e.g. `Debug`, `Clone`, `Copy`, `Default`, `PartialEq`, `Eq`. | 02 |
| `self` / `Self` | Lowercase `self` is the value the method was called on (receiver); uppercase `Self` is a type alias for the current type. | 02 |
| expression / statement | An expression evaluates to a value; a statement does not. In Rust almost everything is an expression (except `let`, etc.). | 02 |
| `match` / pattern matching | An expression that branches on patterns and evaluates; forces exhaustive coverage of enum variants. | 02 |
| mutable / immutable | Rust variables are immutable by default; the `mut` keyword marks something as mutable. | 03 |
| `mut` | Keyword that marks a variable or borrow as "can be changed". | 03 |
| borrow (`&` / `&mut`) | Temporarily use a value without taking ownership; `&` shared read-only, `&mut` exclusive writable. | 03 |
| borrow checker | A compile-time component that enforces "shared XOR mutable", eliminating data races and iterator invalidation. | 03 |
| zero-cost abstraction | Using an abstraction imposes no extra runtime cost. | 03 |
| `OsString` | An OS-native string, not guaranteed to be valid UTF-8, used for CLI arguments and environment variables. | 03 |
| `Vec` | A heap-allocated growable array (similar to JS `Array` / Java `ArrayList` / Go slice). | 03 |
| generic (`<>`) | A type parameter expressing "what type is inside", e.g. `Vec<OsString>`. | 03 |
| tuple (`(A, B)`) | Packs several values together in a fixed order into one value. | 03 |
| `Option<T>` / `Some` / `None` | Standard library enum expressing "there may be a value or not"; Rust uses it instead of null. | 04 |
| `if let` | A concise version of `match` that executes a branch only when a single pattern matches. | 04 |
| `?` (question mark operator) | On `None`/`Err` immediately returns early; on `Some`/`Ok` unwraps the value and continues. | 04 |
| `panic` | The program crashes and exits immediately (unrecoverable error). | 04 |
| `unwrap` / `expect` | Forcibly extracts the value inside `Option`/`Result`; panics if empty. | 04 |
| `PathBuf` / `Path` | Cross-platform path types: owned (mutable, appendable) vs. borrowed (read-only slice), backed by `OsStr`. | 04 |
| `deref` / `as_deref` | Downgrades an owned type (e.g. `PathBuf`) to a borrowed reference (e.g. `&Path`). | 04 |
| lifetime | A compile-time mechanism that guarantees a reference does not "outlive the data it points to" (covered in depth later in this series). | 04 |
| trait | A "capability contract" (like an interface), declaring methods a type must provide. | 05 |
| `impl Trait for Type` | Syntax for implementing a trait for a type. | 05 |
| associated type (`type T;`) | A placeholder type in a trait that the implementor fills in; referenced as `Self::T`. | 05 |
| trait bound (`:` / `+`) | Requires a type to satisfy one or more traits. | 05 |
| `Result<T, E>` / `Ok` / `Err` | The "success or failure" enum; on failure carries an error reason. | 05 |
| type alias | A shorthand name for a type, e.g. `io::Result<T> = Result<T, io::Error>`. | 05 |
| `Send` | A marker trait indicating a type is safe to move across threads. | 05 |
| `'static` | The "lives until the program ends / does not borrow short-lived data" lifetime. | 05 |
| ownership | Each piece of data has exactly one owner at any time; when the owner goes out of scope, the data is dropped. | 06 |
| owner / drop | The owner of data; when the owner goes out of scope, the data is automatically released (dropped). | 06 |
| move | For non-`Copy` types, assignment/passing moves ownership away and invalidates the old name. | 06 |
| borrow (`&` / `&mut` / `*`) | Using data without transferring ownership; `&` shared read-only, `&mut` exclusive writable, `*` dereferences. | 06 |
| dangling pointer / use-after-free | A reference pointing to freed memory; Rust eliminates this at compile time via lifetimes. | 06 |
| lifetime (`'a`) | The "shelf life" of a reference; compile-time guarantee that a reference does not outlive its data; can be annotated explicitly with `'a` or elided. | 06 |
| lifetime elision | The compiler auto-fills common lifetimes according to default rules, saving you from writing them. | 06 |
| NLL (Non-Lexical Lifetimes) | Borrows end at the "last use" instead of the end of scope, allowing legitimate borrows to be released earlier. | 06 |
| `impl Trait` (input position / parameter position) | `impl Trait` in parameter type position, syntactic sugar for generics; the caller decides the concrete type. | 07 |
| static dispatch | The approach where the compiler monomorphizes dedicated code for each type and method calls are direct jumps; zero runtime overhead. | 07 |
| monomorphization | The process where the compiler "copies" a dedicated version of code for each concrete type; the implementation mechanism of static dispatch. | 07 |
| opaque return type / `impl Trait` (return position) / RPIT | `impl Trait` in return position; the implementor decides the concrete type, the caller only sees its trait; still static dispatch. | 07 |
| trait object (`dyn Trait`) | A value whose concrete type is determined at runtime; can unify multiple types into a single container; uses dynamic dispatch. | 07 |
| dynamic dispatch | The approach where a method's address is looked up at runtime via a vtable; incurs one level of indirection overhead. | 07 |
| vtable | A table recording the method addresses for a given type; trait objects use it to achieve dynamic dispatch. | 07 |
