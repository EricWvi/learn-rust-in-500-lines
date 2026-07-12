# Post 02: Understanding an Enum: derive, self/Self, and match (Rust Is an Expression Language)

## 1. First, take a look at this real code

In this post we step into `spec.rs` to see how the "spec list" called `ProcessSpec` is put together. But before we tackle `ProcessSpec`, one small type that appears repeatedly throughout the list — `ProcessStdio` — is worth an entire post on its own. It is only a dozen or so lines, yet it ties together several of the most critical concepts in Rust.

Let us pull its definition out as-is:

```rust
/// Stdio policy used when spawning a child process.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ProcessStdio {
    /// Create an owned async pipe that callers can take from the managed process.
    #[default]
    Piped,
    /// Inherit the corresponding stdio stream from the parent process.
    Inherit,
    /// Connect the corresponding stdio stream to the platform null device.
    Null,
}

impl ProcessStdio {
    pub(crate) fn as_stdio(self) -> Stdio {
        match self {
            Self::Piped => Stdio::piped(),
            Self::Inherit => Stdio::inherit(),
            Self::Null => Stdio::null(),
        }
    }
}
```

If you are reading Rust for the first time, this code looks dense. A dozen lines crammed with symbols that make you frown:

- The first line `#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]` — this string of capitalized names reads like an incantation. What is each one saying?
- What does `#[default]` above `Piped` actually do?
- `self` (lowercase) inside `as_stdio(self)`, versus `Self::Piped` (uppercase) inside the function body — they look like the same thing with a shift key. Are they?
- Most confusing of all: `as_stdio` clearly declares that it returns `Stdio`, yet there is no `return` in the body, and the final `match` block has no semicolon — how does it "return" anything?

These questions each stand on their own, but their answers converge on a single place: **Rust is a language built around "expressions."** Let us start by unpacking the most eye-catching piece — that `#[derive(...)]` line.

## 2. enum and impl: first, make out the shapes of these two pieces

Before explaining `#[derive(...)]`, let us quickly get the overall shape of this code clear, so the details that follow have somewhere to land.

`enum ProcessStdio { ... }` defines an **enum**. Anyone who has written C, Java, or TypeScript will not find it unfamiliar: it is a type whose "value can only be one of a few listed possibilities." The type `ProcessStdio` has only three possible values: `Piped`, `Inherit`, and `Null` — meaning, respectively, that a child process's standard stream is "create a pipe," "inherit from the parent," or "connect to the null device."

In Rust, each of these "one-of-a-few" possibilities is called a **variant**. Note: "variant," not "instance." `Piped`, `Inherit`, `Null` are the three variants of `ProcessStdio`.

Below that, `impl ProcessStdio { ... }` is an **impl block**. Its job: "attach" some functions to the type `ProcessStdio`. For example, `as_stdio` is one such attached function — it converts the three stdio policies into the corresponding settings that the standard library's `std::process::Stdio` needs.

> A small distinction: functions written inside an `impl` block are collectively called **associated functions**. If the first parameter is `self` (lowercase), we habitually call it a **method**, invoked with `value.method_name()`. If the first parameter is not `self`, it is closer to what other languages call a "static method" or "constructor," and you call it with `TypeName::function_name()`. Here, `as_stdio(self)` is a method.

With the overall shape clear, let us return to that eye-catching `#[derive(...)]` line.

## 3. Behind that one derive line: what each of the six names does

`#[derive(...)]` is a kind of **attribute** — a line of directives wrapped in `#[...]`, written above a type definition. `derive` means "to derive": its job is to ask the compiler to **automatically implement** for this type the set of capabilities listed inside the parentheses. Each name inside (`Debug`, `Clone`, ...) is a **trait** — you can think of a trait for now as "a capability contract" or "an interface." So the overall meaning of this line is:

> "Compiler, please auto-implement the six capabilities `Debug`, `Clone`, `Copy`, `Default`, `PartialEq`, and `Eq` for `ProcessStdio`, using the default rules."

Otherwise, you would have to hand-write a large chunk of code for each of these capabilities. `derive` saves you all that boilerplate. Let us go through these six capabilities one by one.

**`Debug`:** makes it printable. With `Debug`, you can print the value for debugging with `{:?}`:

```rust
println!("{:?}", ProcessStdio::Piped); // prints: Piped
```

Without it, `println!` flatly refuses.

**`Clone`:** makes it explicitly copyable. With `Clone`, you can call `.clone()` to make a fresh copy:

```rust
let a = ProcessStdio::Piped;
let b = a.clone(); // a is still valid; b is a new copy
```

**`Copy`:** makes it "copy" rather than "move" on assignment. This one deserves a bit more explanation. In Rust, assigning a value to another variable, or passing it into a function, defaults to a **move** — ownership is "relocated" from the original place, and the original name can no longer be used. But if a type implements `Copy`, assignment quietly **copies** it instead, and the original name remains usable:

```rust
let a = ProcessStdio::Piped;
let b = a;          // because ProcessStdio is Copy, this copies rather than moves
let c = a;          // a is still usable — no problem
```

As for "why Rust specifically distinguishes between 'copy' and 'move,' and how this relates to the ownership system" — that is a whole tough subject, and we will devote a dedicated post to it later. For now, just remember the conclusion: small enums like `ProcessStdio` that carry no data internally are dirt cheap to copy, so adding `Copy` is both reasonable and common practice.

**`PartialEq`:** makes it comparable with `==` and `!=`. With it, two `ProcessStdio` values can be compared for equality:

```rust
if some_stdio == ProcessStdio::Piped { ... }
```

**`Eq`:** declares that this equality is "total." `PartialEq` lets you "do the comparison"; `Eq` stamps the type with "my equality relation is strictly reflexive, symmetric, and transitive" — which is almost trivially true for enums. Deriving both together is standard practice. Why `PartialEq` and `Eq` need to be separate will only make sense when we get to floating-point numbers (`f32`/`f64`'s `NaN` does not satisfy reflexivity, so you cannot derive `Eq`). For now, treat "`PartialEq + Eq` = full equality."

**`Default`:** gives it a "default value." With it, you can use `ProcessStdio::default()` to get a default instance. But an enum has several variants — how does the compiler know which one should be the default? That is where that `#[default]` line above `Piped` comes in:

```rust
#[default]
Piped,
```

`#[default]` is a marker that tells the compiler: "when `derive(Default)`, return this variant." So:

```rust
let d = ProcessStdio::default();
assert_eq!(d, ProcessStdio::Piped); // holds
```

> If you `#[derive(Default)]` an enum but forget to mark any variant with `#[default]`, the compiler will flat-out error. An enum's `Default` must explicitly point to one variant — the compiler will not guess.

Stringing the six capabilities and `#[default]` together: that incantation-like line `#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]` says something perfectly plain: make this enum printable, copyable, copied-on-assignment-not-moved, defaultable, and equality-comparable. Each one is an everyday capability; `derive` just bundles them up and auto-generates the code.

## 4. self and Self: lowercase is "the value," uppercase is "the type"

Now back to the method itself. The signature of `as_stdio` is:

```rust
pub(crate) fn as_stdio(self) -> Stdio
```

Here we have `self` (lowercase); and inside the function body we see `Self` (uppercase):

```rust
match self {
    Self::Piped => ...,
    ...
}
```

These two — one capital, one lowercase — are different things.

**`self` (lowercase) is "the value."** It is the value that the method was called on. When you write `my_stdio.as_stdio()`, the `self` inside `as_stdio` represents that value `my_stdio`. In other languages, this role is usually called `this` (Java/C++/C#) or `self` (Python); Rust just writes it explicitly as the first parameter.

There are three ways to write `self` in Rust, and the differences matter enough to learn them all at once:

| Form | Meaning | Can the original value still be used after the call? |
| --- | --- | --- |
| `self` | Takes the value directly (moves ownership) | No, it is consumed |
| `&self` | Borrows, read-only without modifying | Yes, the original is untouched |
| `&mut self` | Borrows, can be modified | Yes, but exclusively during the call |

Look back at the code. `as_stdio(self)` uses the first form, `self` — it directly takes the value. For a `Copy` type this does not matter (it will be copied anyway), but semantically it says "I consume this value and use it to compute a result." In `ProcessSpec`'s impl block you will see heavy use of the other two:

```rust
// Inside ProcessSpec's impl block
pub fn new(program: impl Into<OsString>) -> Self { ... }

pub fn stdin(mut self, stdin: ProcessStdio) -> Self {
    self.stdin = stdin;
    self
}

pub fn stdin_policy(&self) -> ProcessStdio {
    self.stdin
}
```

`stdin(mut self) -> Self` takes the old `self`, modifies it, and returns a new one — this is the very common **builder pattern** in Rust: each configuration method "consumes the old value, returns the new one," so you can chain them:

```rust
let spec = ProcessSpec::new("echo")
    .arg("hello")
    .stdin(ProcessStdio::Null)
    .stdout(ProcessStdio::Piped);
```

And `stdin_policy(&self)` uses `&self` — it only borrows to read, does not consume `spec`, so `spec` survives the call.

**`Self` (uppercase) is "the type."** It is an alias for "the type of the current `impl` block." Inside `impl ProcessStdio`, `Self` is equivalent to `ProcessStdio`. So writing `Self::Piped` in the function body is exactly the same as writing `ProcessStdio::Piped` — just shorter, and you do not need to chase down every usage if the type name changes later. Similarly, `stdin(...) -> Self` means "returns a `ProcessSpec`," and `new(...) -> Self` does too.

One sentence to remember: **`self` is "this value of mine," `Self` is "this type of mine."**

## 5. How does match without a semicolon "return" a value?

This is the most counter-intuitive, yet most worth-understanding, part of this code. `as_stdio` declares that it returns `Stdio`, yet the function body looks like this:

```rust
pub(crate) fn as_stdio(self) -> Stdio {
    match self {
        Self::Piped => Stdio::piped(),
        Self::Inherit => Stdio::inherit(),
        Self::Null => Stdio::null(),
    }
}
```

No `return`. The final `match` has no semicolon. How does it become the return value?

The answer lies in one summary: **Rust is a language built around "expressions."** In many other languages, `match`/`switch` is merely a **statement** — "execute a different branch depending on the situation" — it runs and is done, producing no value. But in Rust, `match` is an **expression** — it **evaluates to a value**. Each `=>` right-hand side is an expression, and the `match` as a whole evaluates to the result of whichever branch is taken.

Since `match` is an expression that evaluates, it can serve as the return value of a function all by itself — **as long as it is the last expression in the function body, and there is no semicolon after it.** The Rust rule is: the last expression in a function body (or any code block) automatically becomes the return value of that function (or block). No `return` needed. So whichever of the three `Stdio::piped()` etc. gets hit, the `match` evaluates to the corresponding `Stdio`, and the entire function returns it.

This "no semicolon means a value" rule is not limited to `match`. Once you accept it, many Rust idioms suddenly click:

**`if` is also an expression:**

```rust
let x = if condition { 1 } else { 2 };
```

In Rust, `if` directly produces a value and can be assigned to a variable. This is not possible in Python or Java (where `if` is a pure statement that produces no value).

**A code block `{}` is also an expression:** a `{}` block evaluates to its **last expression without a semicolon**:

```rust
let result = {
    let a = 3;
    let b = 4;
    a + b          // note: no semicolon
};                 // result = 7
```

So what exactly does the semicolon do? This is the key: **in Rust, putting a semicolon after an expression turns it into a "statement" — it still executes, but its value is discarded.** You can feel the difference for yourself:

```rust
let a = { 5 };    // the block's last expression is 5 (no semicolon), a = 5
let b = { 5; };   // the last thing is a "5;" statement, block value discarded, b gets ()
```

The `()` (pronounced "unit," think "no meaningful value") on the second line is the price of an extraneous semicolon.

So you can summarize it with a rule that covers almost everything: **in Rust almost "everything is an expression," with only two categories of exception — `let` and other variable declarations (they are statements, producing no value), and any "expression with a semicolon added" (adding a semicolon demotes an expression to a statement; its value is discarded).** Exclude those two, and everything else — `if`, `match`, code blocks, function bodies — are expressions that evaluate. That is the real meaning of "Rust is an expression language."

> As an aside: Rust also allows you to explicitly write `return value;` for early returns, which is especially useful when you need to bail out mid-function. It is just that returning at the end of a function is conventionally expressed as "the last expression without a semicolon" — cleaner.

## 6. Back to match: what makes pattern matching so powerful

Since `match` is an evaluating expression, let us look back at the "pattern matching" part itself — why do Rust programmers like it so much?

**First, it forces you to "cover all cases."** Look back at `as_stdio`'s `match`: the three variants `Piped`, `Inherit`, `Null` are all listed, not one missed. That is not the author being diligent — it is the compiler **enforcing** it: however many variants an enum has, your `match` must cover that many. Miss one, and the compiler refuses to compile. This means that if someone later adds a fourth variant to `ProcessStdio`, every single place that uses `match` on it will immediately be flagged by the compiler, reminding you to add the new branch — a life-saving capability when maintaining large projects.

If you genuinely only care about a few cases and want to "batch handle" the rest, use the underscore wildcard `_`:

```rust
match stdio {
    ProcessStdio::Piped => "create a pipe",
    _ => "other cases",          // wildcard, catches Inherit and Null
}
```

But using `_` also gives up the benefit of "remind me when new variants are added," so in situations like `as_stdio` where every branch should have different behavior, writing out every variant explicitly is the safe choice.

**Second, it matches more than just enums.** `match` patterns can be integers, string literals, tuples, structs — and can even destructure and bind inner data while matching. A few examples:

```rust
// Matching integers
let label = match exit_code {
    0 => "success",
    _ => "failure",
};

// Matching tuples — compares two values at once
let both = match (a_ready, b_ready) {
    (true, true) => "both ready",
    (false, false) => "neither ready",
    _ => "one ready",
};

// Matching and destructuring a struct
struct Point { x: i32, y: i32 }
match point {
    Point { x: 0, y } => println!("on the y-axis, y = {}", y),
    Point { x, y }    => println!("ordinary point ({}, {})", x, y),
}

// With a guard: extra condition after the pattern
let kind = match n {
    v if v < 0 => "negative",
    0          => "zero",
    _          => "positive",
};
```

Notice in the third example, `Point { x: 0, y }` — it simultaneously does two things: requires that `x` exactly equals 0, and **binds** the value of `y` to a variable of the same name for use inside that branch. **"Judge, destructure, and extract" all written into that single line of pattern** — this is what makes `match` far more powerful than an ordinary `switch`.

Putting it all together: that plain-looking three-branch `match` in `as_stdio` actually wields two abilities at once — "exhaustive enum matching" (a correctness guarantee the compiler watches over) and "evaluating to a `Stdio` value per variant" (the concise return style made possible by an expression language).

## 7. Recap

- `ProcessStdio` is an **enum** with three **variants** `Piped`/`Inherit`/`Null`; the `impl` block attaches methods to the type, e.g. `as_stdio`.
- `#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]` tells the compiler to auto-implement six capabilities: `Debug` (printable), `Clone` (explicitly copyable), `Copy` (copy on assignment, not move — ownership details deferred), `PartialEq + Eq` (equality comparable), `Default` (has a default value). `#[default]` specifies that `Default` picks the `Piped` variant.
- **`self` (lowercase) is the value**, the object on which the method was called, with three forms: `self`/`&self`/`&mut self` (consume, read-only borrow, mutable borrow). **`Self` (uppercase) is the type**, an alias for the current `impl` block's type.
- `match` without a semicolon becomes the return value because **Rust is an expression language**: `match`, `if`, code blocks `{}`, and function bodies are all **expressions** that evaluate. Only `let` declarations and **expressions with a semicolon** are **statements**.
- `match`'s power comes from **pattern matching**: the compiler enforces exhaustive coverage, `_` acts as a wildcard, it matches integers/tuples/structs, can destructure and bind while matching, and supports `guard` conditions.

In the next post, we will discuss that little loose end we have been avoiding this whole time — `mut`.
