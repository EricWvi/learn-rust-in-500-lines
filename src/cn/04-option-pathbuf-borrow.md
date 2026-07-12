# 第 04 篇：Option、PathBuf 与更进一步的借用

## 一、一个字段里藏着的两个新面孔

上一篇扫 `ProcessSpec` 的字段时，我对 `cwd` 这一行刻意只字未提：

```rust
cwd: Option<PathBuf>,
```

它表示"子进程的工作目录"。但你看它的类型——短短一行同时塞进了两个我们还没正式认识的东西：`Option` 和 `PathBuf`。更有意思的是，访问它的那个方法签名长这样：

```rust
pub fn cwd_path(&self) -> Option<&Path> {
    self.cwd.as_deref()
}
```

字段里明明是 `Option<PathBuf>`，方法返回的却变成了 `Option<&Path>`——`PathBuf` 不知怎么变成了 `&Path`。这一连串符号各自在说什么？我们先从最关键、也最值得单独认识的概念开始：`Option`。

## 二、Option：用一个类型把"可能没有"说清楚

### 它是什么

`Option<T>` 是标准库提供的一个**枚举**——对，就是第二篇讲过的那种 enum，只不过它是标准库预先帮你定义好的。它只有两个变体：

```rust
enum Option<T> {
    Some(T),   // 有一个值，类型是 T
    None,      // 没有
}
```

意思是：一个 `Option<T>` 类型的值，要么是 `Some(里面装着一个 T)`，要么干脆就是 `None`（什么都没有）。比如 `cwd: Option<PathBuf>`——工作目录要么设了（`Some(某个路径)`），要么没设（`None`）。再比如 `traits.rs` 里 `id(&self) -> Option<u32>`——一个进程的 PID 要么能拿到（`Some(123)`），要么拿不到（`None`）。

`Option<T>` 里的那个 `<T>`，是上一篇讲过的**泛型**：`Option` 不限定装什么类型，由你指定——`Option<u32>`、`Option<PathBuf>`、`Option<String>`，随你。

### 为什么 Rust 要专门发明它

写过 Python、JS、Java 或 Go 的人，对"没有"这件事太熟悉了：Python 的 `None`、JS 的 `null` / `undefined`、Java 的 `null`、Go 的 `nil`。它们都有一个共同的毛病——**任何变量，不管类型怎么声明，都可能突然是"空"的**。你拿到一个 `User` 对象，调用 `user.name`，结果 `user` 其实是 `null`，程序当场崩给你看（Java 的 `NullPointerException`、Python 的 `'NoneType' object has no attribute`）。业界把"空引用"戏称为"十亿美元的错误"——因为它造成的崩溃和 bug，损失加起来恐怕远不止这个数。

Rust 干脆**没有 null**。在 Rust 里，"可能没有"必须用 `Option` 明确写出来，而且——这是关键——**类型系统会逼着你在用之前，先把"没有"的情况处理掉**。一个 `Option<PathBuf>`，你没法直接当 `PathBuf` 用；编译器会拦住你，要求你先确认它到底是 `Some` 还是 `None`。于是"忘了判空导致的崩溃"这一整类问题，在 Rust 里基本不存在了。

### 怎么用它

`Option` 有一套配套的工具，挑最常用的几个认识一下。

**最完整的写法是 `match`**（第二篇的老朋友），它强迫你两个分支都想清楚：

```rust
let msg = match spec.cwd_path() {
    Some(path) => format!("工作目录是 {}", path.display()),
    None        => "没设工作目录".to_string(),
};
```

**如果你只关心"有"的情况**，写 `if let` 更省事——它是 `match` 的精简版，只在匹配到某个模式时才执行：

```rust
if let Some(cwd) = spec.cwd_path() {
    command.current_dir(cwd);   // 只有真有路径时，才去设置
}
```

这段不是杜撰——`tokio_process.rs` 里真正启动子进程的代码，处理工作目录时写的正是这几行。`if let Some(cwd)` 把"如果有，就把它解出来叫 `cwd`"一气呵成；`None` 时整段直接跳过。

**如果你想把"没有"的责任交给上层**，用 `?` 操作符：它遇到 `None` 就立刻从当前函数返回 `None`，遇到 `Some(x)` 就把 `x` 取出来继续往下走。（`?` 同样能用在处理错误的 `Result` 类型上，那个我们以后讲错误处理时再细说。）

**如果你想问一个是非题**，用 `is_some()` / `is_none()`：

```rust
if spec.cwd_path().is_none() { /* 没设工作目录 */ }
```

**如果你有十足的把握"这里一定是 Some"**，用 `unwrap()` 或 `expect("说明")` 直接把里面的值拽出来：

```rust
let path = spec.cwd_path().unwrap();   // 是 None 的话，程序会 panic
```

> ⚠️ `unwrap` 是个需要警惕的工具：遇到 `None` 它会让程序 **panic**（直接崩溃退出）。写示例、写测试时随手用没问题；但在正式代码里，最好用 `match` / `if let` / `?` 把"没有"的情况老老实实处理掉，而不是赌它"应该不会是 None"。

还有 `unwrap_or(默认值)`（没有就给个兜底）、`map(函数)`（对里面的值做变换，是 `None` 就保持 `None`）等"组合子"方法，这里先做个了解，用到时再展开。

### 一个把 Option 用得淋漓尽致的例子：take

`Option` 还有一个特别能体现它设计巧思的用法，就在 `traits.rs` 里。看 `ManagedProcess` 这几个方法：

```rust
fn take_stdin(&mut self)  -> Option<Self::Stdin>;
fn take_stdout(&mut self) -> Option<Self::Stdout>;
fn take_stderr(&mut self) -> Option<Self::Stderr>;
```

子进程的三条管道，可以"取走"。第一次取，拿到 `Some(管道)`；再取一次，同一个槽位已经被掏空了，就变成 `None`。**"这里曾经有东西，但被拿走了，现在空了"——这件事，恰好就是 `Option` 天生擅长表达的。** 取走这个动作，对应的正是 `Option` 的 `.take()` 方法：它把 `Some(x)` 变成 `None`，同时把那个 `x` 还给你：

```rust
let mut pipe: Option<String> = Some("stdout 管道".to_string());
let got = pipe.take();          // 拿走：got = Some("stdout 管道")
// 现在 pipe 是 None 了，再取一次只会拿到 None
```

用别的语言，你得靠"设成 null 之后每次都记得检查"来模拟这种"取走即空"的语义；而 Rust 用一个类型就把它表达得清清楚楚，并且让编译器盯着你每次使用前都先判断。

## 三、PathBuf：为"路径"量身定做的字符串

说回那个 `cwd` 字段的另一半：`PathBuf`。

你可能已经注意到，Rust 里"字符串"成对出现：拥有所有权的 `String`，和它的只读切片 `str`；上一篇认识的 `OsString` 和 `OsStr` 也是一对。`PathBuf` 和 `Path` 是同一套思路的第三对：

- **`PathBuf`（path buffer）** 是**拥有所有权、可增长**的路径，类比 `String` / `OsString`。你可以往里拼接：`PathBuf::from("/etc").join("hosts")` 会得到一个新的 `PathBuf`，内容是 `/etc/hosts`。
- **`Path`** 是**只读的路径切片**，类比 `str` / `OsStr`，通常以借用形式 `&Path` 出现。

为什么要专门为"路径"做一个类型，而不直接用字符串？两个原因。一是**跨平台**：Windows 用 `\` 当分隔符，Unix 用 `/`，`PathBuf::join` 会自动按当前系统来拼接，你不用自己操心。二是**路径也不保证是合法 UTF-8**——`PathBuf` 底层就建立在 `OsStr` 之上，所以文件系统里那些奇奇怪怪的名字它都能装。

所以 `cwd: Option<PathBuf>` 合起来的意思就很顺：一个**可能有、也可能没有**的、**可拼接的跨平台工作目录**。

## 四、把借用再往前推一步：为什么 accessor 返回 `&Path`

现在回到那个让我们起疑的细节：字段是 `Option<PathBuf>`，访问方法却返回 `Option<&Path>`。这是为什么？

先看答案——`cwd_path` 的函数体只有一行：

```rust
pub fn cwd_path(&self) -> Option<&Path> {
    self.cwd.as_deref()
}
```

关键词是"借用"。上一篇我们认识了 borrow checker 的铁律"共享不可变，可变不共享"，但当时只是听了个规则。现在借这个方法，我们看看借用在真实代码里到底长什么样。

**`cwd_path` 拿的是 `&self`——整个 `ProcessSpec` 的只读借用。** 既然只是读，不打算改，它当然没必要把那个 `PathBuf` 整个复制一份再还给你（复制路径字符串是有开销的）。它直接**借出**一条指向自己内部 `cwd` 字段的只读引用 `&Path`，让你顺着这条引用去看那个路径。零拷贝，非常划算。

这里正好把上一篇的规则落到实处。`&self` 是一个**只读借用**，而铁律允许"多个只读借用同时存在"。所以下面这种用法在 Rust 里完全没问题——你可以把同一个 `spec` 的好几个只读访问器一起调用，它们的借用同时活着：

```rust
let prog = spec.program();       // 只读借用 1：返回 &OsStr
let cwd  = spec.cwd_path();     // 只读借用 2：返回 Option<&Path>
// 两个借用都只是"读"，同时存在，互不冲突
```

（换成在中间穿插一次 `&mut spec` 的修改，borrow checker 才会跳出来拦你——因为那会违反"可变不共享"。）

那 `as_deref()` 又干了什么？它负责把 `Option<PathBuf>` 变成 `Option<&Path>`。`deref` 是"解引用"的意思，这里的效果是：把拥有所有权的 `PathBuf` **"降级"成只读的 `&Path`**（因为 `PathBuf` 实现了一个叫 `Deref` 的 trait，能把自己当作 `Path` 来借出）。`as_deref` 把这个"降级"应用到 `Option` 内部：`Some(路径)` 变成 `Some(借出的 &Path)`，`None` 还是 `None`。于是字段里的 `Option<PathBuf>`，对外就变成了 `Option<&Path>`。

> 💡 把这一节和前面 `String`/`str`、`OsString`/`OsStr`、`PathBuf`/`Path` 的回顾连起来，你会发现 Rust 反复出现"一个拥有型 + 一个借用型"的成对类型。这不是巧合，而是借用思想深深刻进类型系统（Type System）的体现：**在 Rust 里，"你是拥有它、还是只是借用它"是类型本身要回答的问题。** borrow checker 之所以能工作，正是因为这些类型把"所有权关系"写在了明面上。

最后埋下一颗种子：`cwd_path` 返回的那个 `&Path`，指向的是 `spec` 内部的内存。也就是说，**它不能比 `spec` 活得更久**——一旦 `spec` 被销毁，这条引用就成了悬空指针。Rust 编译器靠一套叫**生命周期（lifetime）**的机制，在编译期就保证引用永远不会"活得比它指的数据还长"。你可能注意到 `cwd_path(&self) -> Option<&Path>` 的签名里并没有把生命周期写出来——那是编译器按一套默认规则帮你**省略（elision）**了。生命周期的完整规则又是一块硬骨头，我们留到以后专门讲；今天你只要感受到一件事：**返回的 `&Path` 和 `self` 是绑定的，它"借"自 `self`。**

## 五、小结

- **`Option<T>`** 是标准库的枚举，两个变体 `Some(T)` / `None`，专门表达"可能没有"。Rust **没有 null**，所有"可能为空"的情况都必须用 `Option` 表示，并由类型系统逼你在使用前处理 `None`——空指针崩溃这一整类问题因此基本消失。
- 处理 `Option` 的常用工具：`match`、`if let Some(x)`、`?`（向上传递 `None`）、`is_some()` / `is_none()`、`unwrap()` / `expect()`（遇 `None` 会 panic，慎用于正式代码）、`unwrap_or` / `map` 等。`.take()` 配合 `Option` 还能优雅地表达"取走即空"的语义。
- **`PathBuf`** 是拥有、可拼接的跨平台路径（类比 `String`），**`Path`** 是它的只读切片（类比 `str`，常以 `&Path` 出现）。`PathBuf` 底层基于 `OsStr`，不要求合法 UTF-8。
- `cwd_path(&self) -> Option<&Path>` 返回的是**借用**而非拷贝：`&self` 是只读借用，多个只读借用可以共存（"共享不可变"）；`as_deref()` 把 `Option<PathBuf>` 降级成 `Option<&Path>`。
- Rust 里"拥有型 + 借用型"成对出现（`String`/`str`、`OsString`/`OsStr`、`PathBuf`/`Path`），是借用思想写在类型系统里的体现。返回的 `&Path` 与 `self` **生命周期绑定**——完整规则留待以后介绍。

下一篇，我们会离开 `spec.rs`，走进 `traits.rs`，看看 `ProcessSpawner` 和 `ManagedProcess` 这两个 trait 如何定义出整套启动器与进程把手的"接口约定"。
