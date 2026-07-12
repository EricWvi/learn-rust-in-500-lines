# 第 02 篇：读懂一个枚举：derive、self/Self 与 match（Rust 是表达式语言）

## 一、先看这段真实代码

这一篇我们走进 `spec.rs`，看 `ProcessSpec` 这份"清单"是怎么搭起来的。不过在动手拆 `ProcessSpec` 之前，清单里反复用到的一个小类型——`ProcessStdio`——本身就值得单独用一整篇来聊。它只有十几行，却把 Rust 里好几个最关键的概念都串在了一起。

我们先把它的定义原样搬出来：

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

如果你第一次读 Rust，这段代码看起来会很"密集"。短短十几行里塞满了让人皱眉的符号：

- 第一行 `#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]`——这一串大写名字像念咒一样，各自在说什么？
- `Piped` 头上的 `#[default]` 又是做什么用的？
- `as_stdio(self)` 里的 `self`（小写），和函数体里 `Self::Piped` 的 `Self`（大写），看起来只差一个大小写，意思一样吗？
- 最让人困惑的：`as_stdio` 明明声明返回 `Stdio`，可函数体里既没有 `return`，最后那个 `match` 块也没加分号——它怎么就"返回"了？

这些问题各自独立，但答案会汇到同一个地方：**Rust 是一门以"表达式（expression）"为核心的语言**。我们先从最扎眼的那行 `#[derive(...)]` 开始拆。

## 二、enum 与 impl：先看清这两块的形状

在解释 `#[derive(...)]` 之前，先花一小段把这块代码的整体形状交代清楚，免得后面的细节没有着落。

`enum ProcessStdio { ... }` 定义的是一个**枚举（enum）**。写过 C、Java 或 TypeScript 的人对它不会陌生：它是一种"这个类型的取值，只能是这里列出的几种之一"的类型。`ProcessStdio` 这个类型只有三个可能的值：`Piped`、`Inherit`、`Null`——分别表示子进程的某条标准流是"建一根管道"、"继承父进程的"、还是"接到空设备上"。

在 Rust 里，这些"几种之一"里的每一种，叫作一个**变体（variant）**。注意是"变体"而不是"实例"：`Piped`、`Inherit`、`Null` 是 `ProcessStdio` 的三个变体。

下面的 `impl ProcessStdio { ... }` 是一块**实现块（impl block）**。它的作用是：给 `ProcessStdio` 这个类型"挂上"一些它自己的函数。比如 `as_stdio` 就是挂上去的一个函数——它把三种 stdio 策略，转换成标准库 `std::process::Stdio` 需要的对应配置。

> 一个小区分：`impl` 块里写的函数，统称**关联函数（associated function）**。如果它的第一个参数是 `self`（小写），我们习惯叫它**方法（method）**，要用 `值.方法名()` 的形式调用；如果第一个参数不是 `self`，它更接近别的语言里的"静态方法"或"构造函数"，要用 `类型名::函数名()` 调用。这里的 `as_stdio(self)` 是方法。

整体形状清楚了，我们回到那行扎眼的 `#[derive(...)]`。

## 三、一行 derive 背后：六个名字各自在做什么

`#[derive(...)]` 是一种**属性（attribute）**——写在类型定义上方、用 `#[...]` 包起来的一行"指令"。`derive` 的意思是"派生"：它的作用是请编译器**自动帮这个类型实现**括号里列出的那一堆能力。括号里的每个名字（`Debug`、`Clone`、……）都是一个 **trait**——你可以暂时把 trait 理解成"一种能力契约"或"一个接口"。所以这行的整体意思是：

> "编译器，请你按默认规则，给 `ProcessStdio` 自动实现 `Debug`、`Clone`、`Copy`、`Default`、`PartialEq`、`Eq` 这六种能力。"

否则，这些能力你都得自己手写一大段代码。`derive` 就是帮你省掉这些样板。下面我们逐个看这六种能力分别是什么。

**`Debug`：让它能被打印。** 加了 `Debug`，你就能用 `{:?}` 把值打印出来调试：

```rust
println!("{:?}", ProcessStdio::Piped); // 打印：Piped
```

没有它，`println!` 会直接拒绝你。

**`Clone`：让它能被显式复制。** 加了 `Clone`，你就能调用 `.clone()` 造出一份新的副本：

```rust
let a = ProcessStdio::Piped;
let b = a.clone(); // a 还在，b 是一份新拷贝
```

**`Copy`：让它在赋值时被"复制"而非"移动"。** 这一条要多解释两句。在 Rust 里，把一个值赋给另一个变量、或者把它传进函数，默认行为是**转移（move）**——所有权从原来的地方"搬走"，原来的名字就不能再用了。但如果一个类型实现了 `Copy`，赋值时就会变成安安静静地**复制**一份，原来的名字照样能用：

```rust
let a = ProcessStdio::Piped;
let b = a;          // 因为 ProcessStdio 是 Copy，这里复制而非转移
let c = a;          // a 还能用，没问题
```

至于"为什么 Rust 要专门区分'复制'和'转移'这回事、它和所有权（ownership）系统又是什么关系"——这是一整块硬骨头，我们留到以后专门一篇讲。现在你只要记住结论：像 `ProcessStdio` 这样内部不装任何数据的小枚举，复制它代价极小，所以加上 `Copy` 是合理且常见的做法。

**`PartialEq`：让它能用 `==` 和 `!=` 比较。** 加了它，两个 `ProcessStdio` 值就能比相等：

```rust
if some_stdio == ProcessStdio::Piped { ... }
```

**`Eq`：声明这种相等是"完全的"。** `PartialEq` 让你"能比较"，`Eq` 则是给类型盖个章："我的相等关系是严格的自反、对称、传递"——对枚举来说这几乎是显然成立的。两者一起 derive 是固定搭配。`PartialEq` 和 `Eq` 为何要分开，要等讲到浮点数（`f32`/`f64` 的 `NaN` 不满足自反性，所以不能 derive `Eq`）时才说得清，现在把它当成"`PartialEq + Eq` = 完整相等"即可。

**`Default`：让它有一个"默认值"。** 加了它，就能用 `ProcessStdio::default()` 拿到一个默认实例。但枚举有好几个变体，编译器怎么知道默认该选哪个？这就轮到 `Piped` 头上那行 `#[default]` 上场了：

```rust
#[default]
Piped,
```

`#[default]` 是一个标记，告诉编译器："`derive(Default)` 时，就返回这个变体。" 于是：

```rust
let d = ProcessStdio::default();
assert_eq!(d, ProcessStdio::Piped); // 成立
```

> ⚠️ 如果你 `#[derive(Default)]` 了一个枚举，却忘了在任何一个变体上标 `#[default]`，编译器会直接报错。一个枚举的 `Default` 必须明确指向一个变体，不能让编译器去猜。

把六种能力和 `#[default]` 串起来，那行看似念咒的 `#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]`，意思就很朴素了：让这个枚举能被打印、能被复制、赋值时复制而非转移、有默认值、能被比较相等。每一项都是日常用得上的能力，`derive` 只是把它们打包自动生成了。

## 四、self 与 Self：小写是"值"，大写是"类型"

下面回到方法本身。`as_stdio` 的签名是：

```rust
pub(crate) fn as_stdio(self) -> Stdio
```

这里有 `self`（小写）；而函数体里又出现了 `Self`（大写）：

```rust
match self {
    Self::Piped => ...,
    ...
}
```

这一大一小，是两回事。

**`self`（小写）是"值"。** 它是方法被调用时、那个被调用对象的值本身。你写 `my_stdio.as_stdio()`，那么 `as_stdio` 里的 `self` 就代表 `my_stdio` 这个值。在别的语言里，这个角色通常叫 `this`（Java/C++/C#）或 `self`（Python），只是 Rust 把它显式写在了参数列表的第一个位置。

`self` 在 Rust 里有三种写法，差别很重要，值得一次记全：

| 写法 | 含义 | 调用后原值还能用吗 |
| --- | --- | --- |
| `self` | 直接拿走这个值（转移所有权） | 不能，它被消耗了 |
| `&self` | 借用，只读不改 | 能，原值不动 |
| `&mut self` | 借用，可以改 | 能，但调用期间独占 |

回头看代码，`as_stdio(self)` 用的是第一种 `self`——直接拿走值。对一个 `Copy` 类型来说这无所谓（反正会被复制），但语义上它表示"我消费掉这个值、用它算出结果"。而在 `ProcessSpec` 的实现块里你会看到另外两种的大量用例：

```rust
// ProcessSpec 的实现块里
pub fn new(program: impl Into<OsString>) -> Self { ... }

pub fn stdin(mut self, stdin: ProcessStdio) -> Self {
    self.stdin = stdin;
    self
}

pub fn stdin_policy(&self) -> ProcessStdio {
    self.stdin
}
```

`stdin(mut self) -> Self` 拿走旧的 `self`、改一改、再返回一个新的——这是 Rust 里非常常见的**建造者模式（builder pattern）**写法：每个配置方法都"消耗旧值、返回新值"，于是你可以一路点下去：

```rust
let spec = ProcessSpec::new("echo")
    .arg("hello")
    .stdin(ProcessStdio::Null)
    .stdout(ProcessStdio::Piped);
```

而 `stdin_policy(&self)` 用的是 `&self`——只借用它来读取，不会消耗 `spec`，调用完 `spec` 还在。

**`Self`（大写）是"类型"。** 它是"当前所在 `impl` 块的那个类型"的一个别名。在 `impl ProcessStdio` 块里，`Self` 就等价于 `ProcessStdio`。所以函数体里写 `Self::Piped` 和写 `ProcessStdio::Piped` 完全一样，只是更短、而且以后改类型名时不用跟着改。同理，`stdin(...) -> Self` 表示"返回一个 `ProcessSpec`"，`new(...) -> Self` 也是。

一句话记住：**`self` 是"我这个值"，`Self` 是"我这个类型"。**

## 五、match 不加分号，怎么就"返回"了？

这是这段代码里最反直觉、也最值得想通的一点。`as_stdio` 声明返回 `Stdio`，可函数体长这样：

```rust
pub(crate) fn as_stdio(self) -> Stdio {
    match self {
        Self::Piped => Stdio::piped(),
        Self::Inherit => Stdio::inherit(),
        Self::Null => Stdio::null(),
    }
}
```

没有 `return`，最后一个 `match` 也没加分号——它怎么就成了返回值？

答案在于一句概括：**Rust 是一门以"表达式（expression）"为核心的语言。** 在别的很多语言里，`match`/`switch` 只是一个"根据情况执行不同分支"的**语句（statement）**——它执行完就算了，不产生值。但在 Rust 里，`match` 是一个**表达式**——它会**算出一个值**。每个 `=>` 右边都是一个表达式，`match` 整体就求值为命中分支那个表达式的结果。

既然 `match` 是个表达式、会求值，那它本身就能当函数的返回值用——**只要它是函数体里最后一个表达式，且后面不加分号**。Rust 的规则是：函数体（或任何代码块）里最后一个表达式，自动成为这个函数（或块）的返回值，不需要写 `return`。所以上面三行 `Stdio::piped()` 等，哪一个被命中，`match` 就求值成对应的 `Stdio`，整个函数就返回它。

这个"不加分号就是值"的规则，不限于 `match`。一旦你接受它，Rust 的很多写法就突然说得通了：

**`if` 也是表达式：**

```rust
let x = if condition { 1 } else { 2 };
```

在 Rust 里，`if` 直接产生一个值，可以赋给变量。这在 Python/Java 里是做不到的（那里的 `if` 是纯语句，不产生值）。

**代码块 `{}` 也是表达式：** 一个 `{}` 块会求值为它**最后一个不带分号的表达式**：

```rust
let result = {
    let a = 3;
    let b = 4;
    a + b          // 注意：没有分号
};                 // result = 7
```

那么分号到底起了什么作用？这正是关键：**在 Rust 里，给一个表达式加上分号，就把它变成了一个"语句"——它照常执行，但它的值被丢弃了。** 你可以亲手感受一下区别：

```rust
let a = { 5 };    // 块的最后一个表达式是 5（无分号），a = 5
let b = { 5; };   // 最后是一个 "5;" 语句，块的值被丢弃，b 拿到的是空值 ()
```

第二行那个 `()`（读作 unit，可以理解成"没有有意义的值"），就是加错分号的代价。

💡 所以可以总结成一条几乎覆盖全部的判断：**Rust 里几乎"一切皆表达式"，只有两类例外——一是 `let` 这类变量声明（它们是语句，不产生值），二是任何"表达式后面加了分号"（一加分号，就从表达式降级成了语句，值被丢弃）。** 把这两类排除掉，剩下的——`if`、`match`、代码块、函数体——都是会求值的表达式。这就是"Rust 是表达式语言"的真正含义。

> 顺带一提：Rust 也允许你显式写 `return 值;` 来提前返回，函数中间想中途退出时尤其有用。只是函数末尾的返回值，按惯例用"不加分号的最后一个表达式"来表达，更简洁。

## 六、回到 match：模式匹配到底强在哪

既然 `match` 是会求值的表达式，我们再回头看它的"模式匹配（pattern matching）"本身——为什么 Rust 程序员这么喜欢它？

**第一，它强迫你"列全所有情况"。** 看回 `as_stdio` 的 `match`，三个变体 `Piped`、`Inherit`、`Null` 一个不漏地列了出来。这不是作者自觉，而是编译器**强制要求**：枚举有多少个变体，你的 `match` 就必须覆盖多少个。漏掉一个，编译器直接拒绝编译。这意味着将来有人给 `ProcessStdio` 加了第四个变体，所有用到 `match` 的地方都会立刻被编译器揪出来，提醒你补上新分支——这在维护大型项目时是救命的能力。

如果你确实只关心其中几种、其余都想"打包处理"，可以用下划线通配符 `_`：

```rust
match stdio {
    ProcessStdio::Piped => "建管道",
    _ => "其它情况",          // 通配，兜住 Inherit 和 Null
}
```

但用了 `_` 也就放弃了"新增变体时提醒我"的好处，所以像 `as_stdio` 这种每个分支都该有不同行为的场景，老老实实把每个变体写全才稳妥。

**第二，它不只能匹配枚举。** `match` 的模式可以是整数、字符串字面量、元组、结构体，甚至能一边匹配一边拆解出内部数据。几个例子：

```rust
// 匹配整数
let label = match exit_code {
    0 => "成功",
    _ => "失败",
};

// 匹配元组，同时比较两个值
let both = match (a_ready, b_ready) {
    (true, true) => "都就绪",
    (false, false) => "都没就绪",
    _ => "一个就绪",
};

// 匹配并拆解结构体
struct Point { x: i32, y: i32 }
match point {
    Point { x: 0, y } => println!("在 y 轴上，y = {}", y),
    Point { x, y }    => println!("普通点 ({}, {})", x, y),
}

// 带守卫（guard）：在模式后加额外条件
let kind = match n {
    v if v < 0 => "负数",
    0          => "零",
    _          => "正数",
};
```

注意第三个例子里 `Point { x: 0, y }`——它同时做了两件事：要求 `x` 正好等于 0，并且把 `y` 的值"绑定"到一个同名变量上，供这个分支里使用。**"一边判断、一边拆解、一边取值"全都写在模式这一行里**，这正是 `match` 比一般 `switch` 强大得多的地方。

把这些合起来看，`as_stdio` 里那个看起来朴素的三分支 `match`，其实同时动用了"枚举穷尽匹配"和"按变体各自求出一个 `Stdio` 值"两件本事——前者是编译器帮你盯着的正确性保证，后者是表达式语言带来的简洁返回方式。

## 七、小结

- `ProcessStdio` 是一个**枚举（enum）**，有三个**变体** `Piped`/`Inherit`/`Null`；`impl` 块负责给类型挂上方法，例如 `as_stdio`。
- `#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]` 让编译器自动实现六种能力：`Debug`（可打印）、`Clone`（可显式复制）、`Copy`（赋值时复制而非转移，所有权细节留待以后讨论）、`PartialEq + Eq`（可比较相等）、`Default`（有默认值）。`#[default]` 指明 `Default` 默认取 `Piped` 这个变体。
- **`self`（小写）是值**，是方法被调用时的那个对象，有 `self`/`&self`/`&mut self` 三种形式（对应消耗、只读借用、可变借用）；**`Self`（大写）是类型**，是当前 `impl` 块那个类型的别名。
- `match` 不加分号就当返回值，是因为 **Rust 是表达式语言**：`match`、`if`、代码块 `{}`、函数体都是会求值的**表达式**；只有 `let` 这类**声明**、以及**加了分号的表达式**才降级为**语句**。
- `match` 的强大来自**模式匹配**：编译器强制枚举穷尽、可用 `_` 通配、能匹配整数/元组/结构体、能一边匹配一边拆解绑定、还能加 `guard` 守卫。

下一篇，我们会讨论一下本篇一直没提的一个小尾巴，`mut`。
