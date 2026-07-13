# Post 07: `impl Trait` in Two Positions — Static Dispatch and Opaque Return Types

## 1. Two methods we have been skipping

Back in Post 03, when we opened `spec.rs` to read `ProcessSpec`, we covered its fields and its "modify-and-return-self" builder pattern. But there were two signatures I glossed over entirely:

```rust
pub fn arg(mut self, arg: impl Into<OsString>) -> Self {
    self.args.push(arg.into());
    self
}

pub fn envs(&self) -> impl Iterator<Item = (&OsStr, &OsStr)> {
    self.envs
        .iter()
        .map(|(key, value)| (key.as_os_str(), value.as_os_str()))
}
```

First line, `arg`: the parameter is `impl Into<OsString>`.
Second line, `envs`: the return type is `impl Iterator<Item = (&OsStr, &OsStr)>`.

Both methods use the `impl` keyword — they look like family. But today we are going to see something counter-intuitive: **these two `impl`s, though identical in appearance, point in opposite directions** — one hands the "power to choose the type" to the caller, the other keeps it in the implementor's hands. Once you grasp this difference, you unlock two high-frequency Rust concepts: **static dispatch** and **opaque return types**.

## 2. The same `impl`, opposite directions

The `impl Trait` syntax literally means "some type that implements `Trait`." But depending on where it appears in a function signature, its meaning is completely different. Here is the core comparison:

|  | `impl Trait` in input position (parameters) | `impl Trait` in return position |
| --- | --- | --- |
| Example | `arg: impl Into<OsString>` | `-> impl Iterator<...>` |
| Who decides the concrete type? | **The caller** | **The function's implementor** |
| Essence | A kind of generic | Opaque return type |
| Dispatch | Static dispatch | Also static dispatch |

This table is the skeleton of the whole article. Same `impl`, one delegates type choice outward, the other hides it inward. The next three sections unpack each in detail.

## 3. `impl Trait` in input position: a kind of generic

### It is basically a generic

`arg: impl Into<OsString>` — this `impl Trait` in **parameter type** position is essentially syntactic sugar for a **generic**. It is equivalent to:

```rust
pub fn arg<T: Into<OsString>>(mut self, arg: T) -> Self {
    self.args.push(arg.into());
    self
}
```

Back in Post 03, when we saw `Vec<OsString>`, you already encountered generic types; here we have a **generic function**. `<T: Into<OsString>>` declares a type parameter `T`, and after the colon comes the constraint — `T` must implement `Into<OsString>`. `impl Into<OsString>` simply merges "declare a type parameter + add a constraint" into one line, saving you from naming it. The two forms are almost entirely equivalent.

So who decides what `T` actually is? The answer is **the caller**:

```rust
spec.arg("--verbose")            // compiler infers T = &str
    .arg(String::from("hello")); // compiler infers T = String
```

Two calls, and `arg`'s `T` is inferred as `&str` and `String` respectively — as long as both implement `Into<OsString>`, they are accepted. The power to choose the type lies with the caller; the function itself only declares "here is what I can accept."

> An analogy: `impl Trait` in input position is like a checkpoint that says "members only" — whoever comes (which concrete type) is up to you, as long as you have the card (implement that trait).

### Why write it this way: `Into` makes the API more forgiving

This also answers a question that has been overdue: why take the parameter as `impl Into<OsString>` instead of just `OsString`?

Because `Into<OsString>` is a **contract**, and the standard library already implements `OsString: From<&str>` and `OsString: From<String>` for the common types — and with `From`, you automatically get the corresponding `Into` (this is a built-in rule of the `From`/`Into` trait pair), so both `&str` and `String` satisfy the contract. By accepting the parameter as `impl Into<OsString>`, callers can directly pass a string literal or a `String`, without manually calling `.into()` each time. This is why `ProcessSpec::new("echo")` can directly take a `&str` — if the parameter were rigidly typed as `OsString`, every call site would need `OsString::from("...")`, which would be much more tedious.

This pattern runs through all of `ProcessSpec`: `new(impl Into<OsString>)`, `cwd(impl Into<PathBuf>)`, `env(impl Into<OsString>, impl Into<OsString>)` — all using `Into` to widen the entry point. The `arg.into()` inside `arg`'s body is precisely "converting the incoming `T` into the uniform `OsString`."

### Static dispatch and monomorphization

This brings us to the second keyword of this post: **static dispatch**.

Above, the two `arg` calls pass in different types. The compiler does not actually generate a single "universal `arg`" that figures out the type at runtime. What it does is called **monomorphization** — for each concrete type actually passed in, it "copies" a dedicated version of `arg`: one specialized for `&str`, one specialized for `String`. In each copy, `T` is replaced by a concrete type, and `.into()` becomes a definite, direct function call targeting that specific type.

The result: at runtime, there is never any "figure out what `T` is and which `into` to call" step — that was nailed down at compile time. Every call in each copy is a straightforward, direct jump. This approach — where which method to call is decided at compile time, resulting in a direct jump — is **static dispatch**. It carries zero runtime overhead, and is exactly the **zero-cost abstraction** we mentioned in Post 03, applied to dispatch.

Zero overhead is the upside. What is the cost? **Binary size**: for every type used, you get an extra copy of the code. The compiled binary grows. For a tiny function like `arg`, it hardly matters, but for large generic functions, monomorphization can visibly bloat the binary. This is a common Rust trade-off — trading space for zero runtime cost.

### A subtle but important difference

There is one practical difference between input-position `impl Trait` and named generics `<T: ...>`: with `impl Trait`, the type parameter is **anonymous** — you cannot refer to its name. This imposes a limitation: when you need "two parameters must be the same type," `impl Trait` cannot do it:

```rust
// With impl Trait: a and b can be different types
fn both(a: impl PartialEq, b: impl PartialEq) {}

// You must use a named generic to enforce a and b having the same type
fn both_same<T: PartialEq>(a: T, b: T) {}
```

In `both`, the two `impl PartialEq` are independent anonymous types, unrelated to each other. `both_same` uses a single named `T` to bind them to the same type. So `impl Trait` saves keystrokes but sacrifices the ability to name the type. This difference will come up again in the pitfalls section.

## 4. `impl Trait` in return position: opaque return types

Now let's look at `envs`:

```rust
pub fn envs(&self) -> impl Iterator<Item = (&OsStr, &OsStr)> {
    self.envs
        .iter()
        .map(|(key, value)| (key.as_os_str(), value.as_os_str()))
}
```

The `impl Iterator<...>` on the return type looks like the parameter `impl Trait`, but they are not the same thing. This is called an **opaque return type** — also known as RPIT (Return-Position Impl Trait).

### Who decides the concrete type? The implementor

This time, the power to choose the type lies with **the function's implementor** (the person writing the function). The concrete type returned by the function body is whatever `self.envs.iter().map(...)` actually evaluates to. But the external caller **cannot see** this concrete type — the signature only tells you "it returns something that implements `Iterator`, yielding a `(&OsStr, &OsStr)` each iteration."

If we had to spell out that hidden concrete type in full, it would look roughly like:

```rust
// Heavily simplified: the real type wraps a closure inside Map
std::slice::Iter<'_, (OsString, OsString)>
```

And the closure type inside `.map(...)` — the Rust compiler generates a unique **anonymous type** for every closure, a type you simply cannot name in source code. So the real return type is genuinely unwritable in a signature. `impl Iterator` neatly sidesteps the problem: **I guarantee the returned thing implements `Iterator`; don't worry about what concretely it is.**

### Why hide it

Hiding the type brings two concrete benefits.

First, **encapsulation**. The caller only depends on the contract "it is an `Iterator`," not on the concrete type. If someday `envs`'s internal implementation changes — say, constructing the iterator differently — as long as the new type still implements `Iterator` and yields `(&OsStr, &OsStr)`, not a single line of caller code needs to change. The concrete type is walled off inside the API boundary; the author can swap it at will. That is the freedom encapsulation provides.

Second, **avoid writing unnamable or inconvenient type names**. The sort of long, closure-laden types shown above are ugly to write by hand and error-prone; closure types are fundamentally unnamable. `impl Trait` spares the author from exposing these internal details in the signature.

> Analogy: `impl Trait` in return position is like a "dispensing slot" — you only care that what comes out is "something iterable" (satisfies `Iterator`). Which assembly line the factory uses internally is the factory's business, not yours.

### Its restriction: only one concrete type per invocation

Opaque return types have a hard rule: **a single invocation can only return one definite concrete type**. That means you cannot return different concrete types from different branches based on a runtime condition:

```rust
fn make_iter(flag: bool) -> impl Iterator<Item = i32> {
    if flag {
        vec![1, 2, 3].into_iter()   // concrete type A: std::vec::IntoIter<i32>
    } else {
        [4, 5].into_iter()           // concrete type B: a different iterator type — compiler rejects
    }
}
```

The two branches return different concrete types, and the compiler rejects it outright — because `impl Trait` promises "one specific concrete type," not "pick one from several." If you genuinely need "return a different type depending on the runtime situation," you need a different tool: the `dyn Trait` (trait object) covered in the next section.

💡 Worth clarifying a common point of confusion: **return-position `impl Trait` does not introduce dynamic dispatch**. The concrete type is known at compile time (crystal clear to the author), just hidden from the caller. Calling its methods is still a direct-jump static dispatch, zero overhead. What actually introduces runtime overhead is explicitly writing `dyn` — that is the next section's topic.

## 5. Static dispatch vs. dynamic dispatch: `impl Trait` and `dyn Trait`

Earlier we said input-position `impl Trait` (and generics) use **static dispatch** — the compiler copies a version of the code for each type. So is there a "don't copy, decide at runtime" approach? Yes: the **trait object**, written as `dyn Trait`. It uses **dynamic dispatch**.

A side-by-side comparison:

```rust
use std::fmt::Debug;

// Static dispatch: one code copy per type, method calls are direct jumps
fn print_static(value: &impl Debug) {
    println!("{:?}", value);
}

// Dynamic dispatch: a single copy of code, method address looked up at runtime
fn print_dyn(value: &dyn Debug) {
    println!("{:?}", value);
}
```

The `dyn` in `dyn Debug` stands for "dynamic." It means "some type implementing the `Debug` trait, but which one specifically is only known at runtime." The mechanism behind it is called a **vtable**: for every type that implements `Debug`, the compiler prepares a "method address table." A `&dyn Debug` actually carries two pointers — one to the data itself, one to that vtable. When a method is called, it first consults the vtable for "where is this type's `Debug` method," then jumps to execute. That extra table lookup and indirect jump is the **runtime overhead of dynamic dispatch**.

So when should you actually use `dyn`? Generally in two cases:

1. **The set of types is unknown at compile time, or is very large**. For example, a collection holding several different kinds of "animals" — `Vec<Box<dyn Animal>>` — in this case you cannot monomorphize a generic for every animal (the types may not even be exhaustively known at compile time), so `dyn` is the only way to unify them. (`Box` is a smart pointer that "boxes a value onto the heap"; here it ensures each element in the collection has a uniform size. Details in a later post.)
2. **You want to shrink the binary**. Earlier we said monomorphization bloats code; if you find a generic instantiated for dozens of types and the binary is ballooning, switching to `dyn` can merge dozens of copies into one, at the cost of one extra lookup per call.

In this `process` crate, everything so far has been generics (static dispatch) — `Mutex<Option<ChildStdin>>`, `Vec<(OsString, OsString)>`, the various `impl Trait` uses, all of them. `dyn` won't appear heavily until we encounter "a single collection holding many different types" scenarios, which typically show up in async task scheduling, plugin systems, and the like — we will save that for later.

> This trade-off runs through all of Rust: when you can use static dispatch (generics / `impl Trait`), use it — zero overhead is the default goal. Only when you genuinely need "an array that accepts everything" or "objects whose types cannot be known at compile time" do you step back to `dyn`, trading one table lookup for flexibility.

## 6. Common pitfalls

**Pitfall 1: When returning `impl Trait`, every branch must return the same concrete type.** The `make_iter` in section 4 is the cautionary example. Beginners most commonly hit this when trying to "return two different iterators / futures depending on a condition." The fix is either to unify both branches into the same concrete type, or switch to `Box<dyn Trait>` (trait object + boxing) and let runtime decide.

**Pitfall 2: Multiple `impl Trait` in input position are independent types.** The end of section 3 mentioned this: in `fn both(a: impl PartialEq, b: impl PartialEq)`, `a` and `b` each have their own anonymous type parameter, unrelated to each other. If your intent is "both parameters must be the same type," writing it this way won't catch the mistake — you must fall back to a named generic: `fn both<T: PartialEq>(a: T, b: T)`.

**Pitfall 3 (a reminder): Input `impl Trait` increases binary size.** Every additional type passed in produces one more code copy. For small, high-frequency methods like `arg`, if call sites pass in a dozen different types, monomorphization generates a dozen copies. Most of the time this is not worth worrying about, but if you are doing size-sensitive embedded development, it is something to keep in mind.

## 7. Recap

- In `ProcessSpec`, `arg`'s parameter `impl Into<OsString>` and `envs`'s return type `impl Iterator<Item = (&OsStr, &OsStr)>` both use the `impl` keyword, but in opposite directions.
- **`impl Trait` in input position** (on parameters) is essentially syntactic sugar for **generics**, equivalent to `<T: Trait>`; the **caller** decides the concrete type. It uses **static dispatch**: at compile time, a dedicated copy of the code is **monomorphized** for each concrete type, with zero runtime overhead, at the potential cost of larger binary size. Its only practical difference from named generics is that the type parameter is anonymous and cannot be shared across multiple parameter positions.
- **`impl Trait` in return position** (on return types) is called an **opaque return type** (RPIT); the **implementor** decides the concrete type, which the caller cannot see — only that it satisfies a given trait. The benefits are **encapsulation** (the internal implementation can be swapped at any time) and **not having to write complex or unnamable type names** (such as closure-laden iterator types). It is still static dispatch, zero overhead; the hard rule is that only one concrete type can be returned per invocation.
- The counterpart to `impl Trait`/generics is **`dyn Trait` (trait objects)**, which uses **dynamic dispatch**: a **vtable** is consulted at runtime to find the method address, incurring an indirect call overhead, but it can unify types that are unknown or too numerous at compile time into a single container (e.g., `Vec<Box<dyn Trait>>`).

In the next post, armed with this understanding of "who chooses the type," we return to `tokio_process.rs` and see how `TokioProcessSpawner` and `TokioManagedProcess` actually implement the interface contract from Post 05 — where we will encounter `Arc`, `Mutex`, and channels, and with ownership, borrowing, and `impl Trait` already under our belt, they will read much more smoothly.
