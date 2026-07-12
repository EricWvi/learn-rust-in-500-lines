# 第 03 篇：mut、ProcessSpec 与装着元组的 Vec

## 一、那个一直被我们略过的 `mut`

上一篇结尾我留了个小尾巴：`mut`。回看一下 `ProcessStdio` 的代码，你几乎找不到它——enum 本身是几个只读的取值，`as_stdio(self)` 也只是"读"一下传入的值再算出结果。可一旦把目光移到 `ProcessSpec`，`mut` 立刻铺天盖地地冒出来：

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

`mut self`、`self.stdin = ...`、`self.envs.push(...)`——这些写法都在暗示同一件事：**这里的数据要被改动了**。那么 `mut` 到底是什么？它为什么值得 Rust 单独给它一个关键字？这一篇我们先把它说清楚，再顺势走进 `ProcessSpec` 这份"清单"本身——你会发现，`mut` 正是理解整份清单怎么被一点点搭起来的钥匙。

## 二、默认不可变：一道防患于未然的安全网

先从最反直觉的一条说起：**在 Rust 里，变量默认是不可变的（immutable）。** 你写：

```rust
let x = 5;
x = 6;          // 编译错误：cannot assign twice to immutable variable `x`
```

这段代码编译不过。要让 `x` 能被改，你必须**显式**地告诉编译器：

```rust
let mut x = 5;
x = 6;          // 现在 OK
```

如果你写过 C、Java 或 JavaScript，这刚好和你的直觉相反——那些语言里变量默认就能改。Rust 为什么反过来？因为"默认不能改"是一张极大的安全网。

设想你读一段别人的代码，看到一个变量 `config`。在 JS 里，它有没有被某个函数偷偷改过？你不知道，只能去翻每个调用的源码。但在 Rust 里，只要 `config` 没有 `mut`，你可以**百分之百确定**：它从被创建到离开作用域，谁也动不了它的一根毫毛。读代码时，哪些值是"定死的"、哪些值是"会变的"，一眼就能分清。大量线上 bug 来自"某个值在你不注意的地方被改了"——Rust 直接在编译期把这种可能性堵死。

## 三、`mut` 让"改变"暴露在阳光下

`mut` 的第二个好处，是它让"修改数据"这件事变得**高度显式**。

看到 `let mut x = 5;`，任何读代码的人（包括几个月后的你自己）都会立刻警觉：注意，这个值后面会变。换句话说，`mut` 这三个字母本身就是一行文档——它把"这里会发生改变"白纸黑字地写在了变量声明上。

反过来也成立：如果你标了 `mut`，但全程从没改过这个变量，Rust 编译器会反过来唠叨你：

```text
warning: variable does not need to be mutable
    let mut y = 5;
        ----^
        help: remove this `mut`
```

它建议你把多余的 `mut` 删掉。`mut` 不该是顺手加上去的装饰，而是"这里确实要改"的郑重声明——编译器会帮你盯着，不让你乱标。

## 四、铁律"共享不可变，可变不共享"，与 borrow checker 的初见

`mut` 真正的分量，藏在一条 Rust 铁律背后：

> ⚠️ **共享不可变，可变不共享。** 你要么同时拥有多个**只读**的借用，要么只拥有**一个**可写的借用——两者不可兼得。

这里出现了一个新词：**借用（borrow）**。借用，就是不夺走一个值的所有权、只是临时借用它来用，分两种：只读的 `&`（共享借用）和可写的 `&mut`（可变借用）。上一篇 `&self` / `&mut self` 里那两个符号，就是这个意思。

这条铁律不是写在文档里靠你自觉遵守的，而是被一个叫 **borrow checker（借用检查器）** 的东西在**编译期**强制执行的。它会盯着你代码里每一处借用，一旦发现"既想多个地方读、又想某个地方写"的冲突，直接拒绝编译：

```rust
let mut s = String::from("hi");
let r1 = &s;          // 只读借用
let r2 = &mut s;      // 可变借用 —— 编译器拒绝（E0502）
println!("{} {}", r1, r2);
```

`r1` 还在借走 `s` 去读，`r2` 又想借走 `s` 去改——同一个值上，读和写撞车了，borrow checker 不答应。

为什么这条规则如此重要？因为它从根上消灭了两类让多线程程序员非常头疼的灾难：

- **数据竞争（data race）**：多个线程同时读写同一块内存，结果不可预测。有了这条规则，这种冲突在编译期就被拦下，根本进不到运行时。
- **迭代器失效（iterator invalidation）**：一边遍历一个集合、一边在循环里改它，程序很容易崩溃。同样的冲突，borrow checker 也会提前报错。

下面这个 JS 与 Rust 的对比，能让你直观感受这条规则的分量：

```javascript
// JavaScript：传进去的 user 会不会被偷偷改？你只能去翻源码
let user = { name: "Alice", role: "admin" };
doSomething(user);
```

```rust
// Rust：只读借用 &user —— 调用方可以确信 user 不会被改动
print_role(&user);

// 要改，就必须显式地借成可变 —— 这一行字面写着 &mut
let mut settings = Settings::new();
apply_defaults(&mut settings);
```

💡 不过，borrow checker 具体是怎么工作的、它背后那套"所有权 + 生命周期"的机制到底长什么样——这是一整块硬骨头，我会在后面专门用一篇（甚至几篇）来慢慢拆。今天你只需要记住三件事：它存在、它盯的就是"共享不可变，可变不共享"这条规则、它把一整类 bug 消灭在了编译期。我们这里先埋下这颗种子，后面再让它发芽。

## 五、为什么不全做成不可变：`mut` 的性能账

讲到这里你可能会问：既然不可变这么安全，Rust 为什么不干脆学纯函数式语言，把所有东西都做成绝对不可变？

答案是**性能**。计算机的底层——CPU 和内存——本质上是可变的硬件。如果真的完全不可变，那么每次"修改"一个值，都得另外分配一块新内存、把旧数据复制过去，开销会非常大。Rust 选择让你在需要安全的地方享受"默认不可变"的保护，又允许你用 `mut` 在需要性能的地方**原地修改（in-place）**数据，不必复制。

这就是 Rust 常说的**零成本抽象（zero-cost abstraction）**：用 `mut`，你既拿到了函数式编程的"安全感"，又保留了命令式语言"直接操作内存、原地改"的"高性能"，两样都不耽误。

## 六、走进 ProcessSpec：这份"清单"长什么样

带着 `mut` 这个新视角，我们正式打开 `ProcessSpec` 的定义。这是上一章里那份用来配置一个子进程的"清单"：

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

那一行 `#[derive(Debug, Clone, PartialEq, Eq)]` 上一篇已经讲过了——让这个结构体能被打印、能被克隆、能比较相等，这里不重复。我们逐个字段扫一眼，先有个整体印象，再挑重点拆：

- `program: OsString`——要启动的可执行程序（比如 `"echo"`）；
- `args: Vec<OsString>`——命令行参数，一个列表；
- `cwd: Option<PathBuf>`——工作目录，可能设了也可能没设（这个 `Option`，我们留到下一篇专门讲）；
- `envs: Vec<(OsString, OsString)>`——环境变量，一串"键=值"对，这是本篇要重点拆的对象；
- `stdin` / `stdout` / `stderr: ProcessStdio`——三条标准流策略，上一章那个枚举；
- `kill_on_drop: bool`——清单被丢弃时，子进程该不该被杀掉。

这里面大多数类型你应该已经能猜出大意，但有两个新面孔必须正式认识：`OsString`，以及那个看起来有点吓人的 `Vec<(OsString, OsString)>`。

## 七、先认一个新面孔：OsString

`OsString` 来自标准库的 `std::ffi` 模块（`ffi` 是 foreign function interface 的缩写，大致是"和操作系统打交道"的意思）。它是一种**操作系统原生的字符串**。

为什么要专门有这么一种字符串？因为我们平时用的 `String`，Rust 保证它里面存的是**合法的 UTF-8 文本**——这对大多数应用够了，但命令行参数和环境变量这两样东西，操作系统并不保证它们一定是合法 UTF-8（在某些系统和某些语言环境下，文件名、环境变量里可能出现非 UTF-8 的字节）。所以涉及"直接和操作系统打交道"的字符串，Rust 用 `OsString` 而不是 `String`。

你暂时把它理解成"为命令行和环境变量量身定做的 `String`"就够了，更深入的区别等用到时再展开。

## 八、重点拆解：`Vec<(OsString, OsString)>`

这是本篇下半场的主角。`envs` 字段的类型 `Vec<(OsString, OsString)>`，从外到内套了三层东西：`Vec`、`<>`、以及里面的元组 `(OsString, OsString)`。我们一层层拆开。

**第一层：`Vec` 是什么？** `Vec`（读作 "vector"，向量）是 Rust 里最常用的**可变长度数组**——就像 JavaScript 的 `Array`、Java 的 `ArrayList`、Go 的 slice、Python 的 `list`：它能装一串同类型的值，长度可以随时增长。空的一个可以用 `Vec::new()` 创建，用 `.push()` 往末尾追加：

```rust
let mut args: Vec<OsString> = Vec::new();   // 一个空列表
args.push(OsString::from("hello"));          // 往里加一个
args.push(OsString::from("world"));          // 再加一个
```

注意这里出现了 `mut`：列表本身要能被 `push` 改动，所以声明成 `let mut args`。

**第二层：`<>` 是什么？** `Vec` 后面尖括号里的 `OsString`，叫作**泛型参数（generic）**。它的意思是"这个 `Vec` 里装的是 `OsString` 类型"。`Vec` 是一个通用容器，装什么类型由你用尖括号指定——`Vec<i32>` 装整数，`Vec<String>` 装字符串，而 `Vec<OsString>` 装 `OsString`。所以 `args` 是"一串 `OsString`"。

**第三层：里面的元组 `(OsString, OsString)` 是什么？** 圆括号包起来的 `(A, B)` 叫**元组（tuple）**，它的作用是把几个值**按固定顺序打包成一个值**。`(OsString, OsString)` 就是一个装着两个 `OsString` 的元组——天然适合表示"一个键、一个值"这种成对的东西。

把三层合起来，`Vec<(OsString, OsString)>` 的意思就清楚了：**一串元组，每个元组是一对 `(键, 值)`**。这正是 `envs`——一组环境变量。

那么这个列表是怎么被一点点填满的？看 `env` 这个配置方法：

```rust
pub fn env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Self {
    self.envs.push((key.into(), value.into()));
    self
}
```

每次你调用 `.env("PATH", "/usr/bin")`，方法体就 `push` 一对 `(键, 值)` 到 `envs` 末尾。调用三次，`envs` 里就有三对。

> 等一下，这里有个设计选择值得多看一眼：为什么环境变量用 `Vec<(键, 值)>`，而不是用一个映射表（类似 JS 的 `Map` 或 Python 的 `dict`）？因为这份清单需要**保留你设置的顺序**，而且**允许同一个键重复出现**——后设的会覆盖先设的，这正好对应"环境变量覆盖"的语义。用 `Vec<(键, 值)>`，顺序和重复都自然成立；而大多数映射表会自动去重、不保证顺序，反而不合用。

## 九、ProcessSpec 的实现：builder 与 accessor

把定义看清了，再看 `impl ProcessSpec` 里挂的方法，你会发现它们清晰地分成两组。

**第一组是"配置"方法，构成所谓的建造者模式（builder pattern）**：

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

它们的签名长得几乎一模一样：都是 `mut self -> Self`——拿走旧的 `self`、改一改、再返回一个新的。回扣本篇开头讲的 `mut`：这里每个方法都要**改动** `self` 里的某个字段，所以接收者必须是 `mut self`。也正因为每个方法都返回新的 `Self`，你才能把它们一路点下去：

```rust
let spec = ProcessSpec::new("echo")
    .arg("hello")
    .env("RUST_LOG", "debug")
    .stdout(ProcessStdio::Piped);
```

> 顺带提一句 `args` 那行签名里的 `<Args, Arg>` 和末尾的 `where ...`：那是泛型方法的写法，意思是"我这个方法能接受任何'可以迭代出、且能转换成 `OsString` 的元素'的东西"。这是 Rust 泛型的进阶用法，今天先认识它的样子，深入介绍留到以后。

**第二组是"访问"方法**，全是 `&self`，只读不改：

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

它们不消耗 `self`（用的是 `&self`，呼应上一章"借用"的概念），只是把清单里写好的内容**查出来**给你看。配置和访问，职责分得清清楚楚：一组负责"改清单"，用 `mut self`；一组负责"读清单"，用 `&self`。

## 十、小结

- **Rust 变量默认不可变**，要改必须显式写 `mut`；这条默认规则既防"意外修改"的 bug，也让读代码时"哪些值会变"一目了然。多余的 `mut` 还会被编译器警告提醒删掉。
- Rust 的铁律是**"共享不可变，可变不共享"**：要么多个只读借用 `&`，要么一个可变借用 `&mut`，不可兼得。这条规则由 **borrow checker** 在编译期强制执行，从根上消灭数据竞争和迭代器失效。它的完整工作机制我们留到以后专门展开。
- `mut` 让你既能享受"默认不可变"的安全，又能在需要时**原地修改**数据，兼顾函数式的安全感和命令式的性能（零成本抽象）。
- `ProcessSpec` 是配置子进程的"清单"，字段里出现了 `OsString`（OS 原生字符串，用于命令行/环境变量）和 `Vec<(OsString, OsString)>`（一串键值对，保留顺序、允许重复覆盖）。
- `Vec` 是可变长度的数组；尖括号 `<>` 是**泛型参数**，指明容器装什么类型；圆括号 `(A, B)` 是**元组**，把几个值按顺序打包。
- `ProcessSpec` 的方法分两组：**builder** 配置方法用 `mut self -> Self`，靠返回新 `Self` 实现链式调用；**accessor** 访问方法用 `&self`，只读不改。

下一篇，我们会回来啃 `ProcessSpec` 里还没碰的两个类型——`Option` 和 `PathBuf`——顺便把今天点到为止的 borrow checker 再往前推一步。
