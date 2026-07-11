# 第 01 篇：看懂一个 Rust 项目的骨架（crate、模块与 Cargo.toml）

## 一、先认识这个 crate 的"门面"

我们不急着讲概念。先把这个叫 `process` 的东西能做什么，用一堆名字串起来看一看——你暂时不用理解这些名字背后是什么，先在脑子里有个整体的画面就好。

你想启动一个子进程，第一步是准备一份"清单"，它的名字叫 `ProcessSpec`。这份清单上能填的东西不少：

- `arg` 和 `args`：往命令行里加参数；
- `cwd`：设定子进程的工作目录；
- `env`：设定环境变量；
- `stdin`、`stdout`、`stderr`：设定三条标准输入输出流的策略，每条都可以选 `Piped`、`Inherit`、`Null` 三种之一（这三样打包在一个叫 `ProcessStdio` 的名字下）；
- `kill_on_drop` 和 `keep_alive_on_drop`：决定这份清单"丢掉"的时候，子进程该被杀掉还是继续活着。

清单写好了，交给一个叫 `ProcessSpawner` 的"启动器"，喊一声它的 `spawn`，你会拿回一个 `ManagedProcess`。这个 `ManagedProcess` 就是子进程的"把手"，它能让你：

- 用 `id` 看进程号；
- 用 `take_stdin`、`take_stdout`、`take_stderr` 把三条管道取出来自己用；
- 用 `try_wait` 偷瞄一眼它退没退出；
- 用 `wait` 一直等到它结束；
- 用 `kill` 强行把它终止。

最后，这套清单和把手还分别有一个"现成的具体实现"：`TokioProcessSpawner` 和 `TokioManagedProcess`——名字里的 `Tokio` 暗示了它们背后靠的是 `tokio` 这个东西，但那不是今天的重点。

把上面这一串名字过一遍就够了。这一整套——`ProcessSpec`、`ProcessStdio`、`ProcessSpawner`、`ManagedProcess`，加上 `TokioProcessSpawner`、`TokioManagedProcess`——就是 `process` 摆在外面的全部"门面"。那么问题来了：这么一堆名字，到底被装在哪里？我们走进去看一眼。

## 二、crate：装着这一切的"木箱"

上面那一堆名字，连同它们背后的实现，统统被装在一个叫 **crate**（木箱、板条箱）的东西里。它是 Rust 里最大的组织单位。

打个比方：crate 就像一只**打包好的木箱**。你把一堆零件（代码）装进木箱，封好，贴上标签（名字、版本号），然后整箱运出去。别人要用你的成果，不是来你这儿零拿一个零件，而是**整箱引用**。一只木箱最后只会被编译成**一个**成品——要么是一份别人能引用的"工具库"，要么是一个能直接跑起来的"可执行程序"。

这就引出两种 crate：

- **库 crate（library crate）**：像一本**工具书**或一个**零件柜**。它本身不会自己跑起来，它的存在是为了被别的程序"翻阅、取用"。Rust 规定这种 crate 的"正门"文件叫 **`lib.rs`**——所有来找它的人，都从这个门进。
- **二进制 crate（binary crate）**：像一台**能按下开机键的机器**。它自己就能跑，跑起来的入口文件叫 **`main.rs`**。

那么我们这个 `process` 是哪一种？打开它的目录看一眼，会看到 `src/lib.rs`，而**没有** `main.rs`。答案就清楚了：`process` 是一个**库 crate**。它不打算自己运行，它的使命是被别的程序拿去用——比如某个上层程序需要管一堆子进程时，就引用 `process`，调用我们刚才看到的那一串名字。

> 等一下，这里有个细节：你可能在别的 Rust 项目里见过又写 `lib.rs` 又写 `main.rs` 的情况。那通常是一个项目既提供库、又附带一个用来演示或直接运行的小程序。但最小、最干净的情况是二选一——像 `process` 这样只做库。

一个值得记住的对比：写过 Go 的人，可以把 crate 大致想成"一个 module 里的一个 package"；写过 JS/Node 的人，可以把它想成"一个 package（对应一个 `package.json`）"。不完全一样，但这个画面对你建立直觉有帮助。

## 三、mod 与 use：把木箱内部分成抽屉

crate 是木箱，但木箱不能把所有零件一股脑倒进去——太乱了。你需要**抽屉**把相关的零件归到一起。在 Rust 里，这个"抽屉"叫 **模块（module）**，写出来的关键字是 `mod`。

再看一个画面：模块就像**一栋大楼里的房间**，或者**文件柜里的一个个抽屉**。每个抽屉装一类东西（`spec.rs` 装清单、`traits.rs` 装接口约定、`tokio_process.rs` 装具体实现），每个抽屉都有自己的**标签**（名字）。于是不同抽屉里哪怕有重名的东西也不会打架——因为它们的全名是"抽屉名 + 东西名"。

名字那么长，每次都要写全名太累。这就轮到 **`use`** 上场了。`use` 的作用，就像手机通讯录里**把一个长号码存成一个短昵称**：存好之后，你直接喊昵称就能拨号，不用每次都输入那一长串。

光说抽象的没用，我们直接看这个 crate 的"正门" `src/lib.rs` 里**真实**写了什么：

```rust
mod spec;
mod tokio_process;
mod traits;

pub use spec::{ProcessSpec, ProcessStdio};
pub use tokio_process::{TokioManagedProcess, TokioProcessSpawner};
pub use traits::{ManagedProcess, ProcessSpawner};
```

逐段读一遍：

- `mod spec;`——这一句在说："我这里有个抽屉叫 `spec`。" Rust 会自动去找 `spec.rs` 这个文件，把它当成 `spec` 抽屉的内容。所以你**不需要**在别的地方再"注册"一次 `spec.rs`——`mod spec;` 这一句就是注册。下面两行同理，分别对应 `tokio_process.rs` 和 `traits.rs`。
- `pub use spec::{ProcessSpec, ProcessStdio};`——"把 `spec` 抽屉里的 `ProcessSpec` 和 `ProcessStdio` 这两样，摆到正门门口，并且允许外面的人看到。" 其中 `use` 负责"取出来摆好"，`pub` 负责"允许别人看"。少了 `pub`，东西摆了但门没开，外面的人照样摸不着。

💡 回头看第一节那张"门面"清单——`ProcessSpec`、`ProcessStdio`、`ProcessSpawner`、`ManagedProcess`、`TokioProcessSpawner`、`TokioManagedProcess`，正好就是这里通过 `pub use` 摆到门口的六个名字。一节对一节，严丝合缝。这六个名字之外的任何东西（比如 `tokio_process.rs` 里那个 `run_process_lifecycle`），都还闷在抽屉里，外面看不见、也碰不到——这正是模块化想要的效果。

## 四、Cargo.toml：这只木箱的"装箱单"

木箱做好了，外面还要贴一张标签，写清楚：这箱东西叫什么名字、第几版、需要哪些别的木箱配合。这张标签就是 **`Cargo.toml`** 文件。

而**发放、管理、搬运这些木箱的工具**叫 **Cargo**——它同时是你的**编译器调度员**和**包管理器**：你只要在 `Cargo.toml` 里声明"我需要 `tokio` 这只箱子"，Cargo 就会自动帮你下载、编译、拼好。写过 Node 的人，可以把 Cargo 理解成 `npm` + 构建工具的合体，`Cargo.toml` 就是它对应的 `package.json`。

我们来看这个 crate 真实的 `Cargo.toml`：

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

一段段拆开：

- **`[package]`**：这只木箱的"身份证"。`name = "process"` 是它的名字，别人引用它时就用这个名字；`version = "0.1.0"` 是版本号；`edition = "2024"` 是它使用的 **Rust edition**——可以理解成"Rust 语言的一个版本档"。每隔几年 Rust 会整理一批新习惯、新规则，打包成一个 edition，`2024` 是写作本文时最新的一档。注意 edition **不等于**编译器版本，它更像是一套"默认开关"：同一个编译器，只要你声明不同的 edition，就会启用不同的语言规则。
- **`[lib]`**：明确告诉 Cargo"这是一只库 crate，它的正门在 `src/lib.rs`"。其实就算不写这段，Cargo 默认也会去找 `src/lib.rs`，这里写出来是为了清楚。如果你做的是二进制 crate，对应的入口会是 `src/main.rs`，那段通常写成 `[bin]`，或者干脆省略（默认找 `src/main.rs`）。
- **`[dependencies]`**：这只木箱**正常运行**所依赖的别的箱子。这里只列了一个 `tokio`，`features` 里那一串是"我只打开 tokio 的这几个功能模块"——tokio 体量很大，按需勾选能省下不少编译时间和体积。
- **`[dev-dependencies]`**：只在**写测试、写示例**时才需要的箱子，不会算进正式发布给别人的依赖里。注意 `tokio` 在这里又出现了一次，`features` 多了 `rt-multi-thread` 和 `time`——因为测试需要多线程运行时和计时功能，而正式库里用不到。

> 顺带一提：目录里还有个 `Cargo.lock`，它**不是**你手写的，而是 Cargo 自动生成的"依赖版本钉死单"，记录每个依赖最终用的精确版本。库 crate 通常会把它放进 `.gitignore`，交给使用方去锁定；二进制 crate 则一般要提交它，以保证每个人编出来的版本一致。

## 五、新手最容易踩的两个坑

1. **"为什么外面找不到我写的东西？"——多半是忘了 `pub`。**
   Rust 的默认脾气是"关着门"：一个抽屉里的东西，不主动 `pub`，外面就看不见。你明明在 `spec.rs` 里写了 `ProcessSpec`，但只要 `lib.rs` 里没有 `pub use` 把它请到门口，别人引用 `process::ProcessSpec` 时就会被告知"没这东西"。记住这条规则：**写在文件里 ≠ 对外可见**。

2. **"我在哪儿注册了 `spec.rs`？"——就是 `mod spec;` 那一句。**
   从 Python / JS 过来的人常常会去找一个"导入文件"的动作，结果发现 Rust 里好像"没导入就用了"。其实 `src/lib.rs` 里的 `mod spec;` 就是导入加注册二合一的那一句；而且 Rust 会按文件名去找对应文件（`spec` → `spec.rs`）。另外提一句：Rust 还有一种更老的模块文件写法是 `spec/mod.rs`，现在推荐的是 `spec.rs` 这种——你在这个项目里看到的就是新风格。

## 六、小结

- 一个 **crate** 是 Rust 里最大的组织单位，像一只封好的**木箱**，最终编译成一个成品：要么是库（正门 `lib.rs`），要么是可执行程序（入口 `main.rs`）。`process` 是一只**库 crate**。
- **`mod`** 把木箱内部分成一个个"抽屉"（模块），文件名即模块名；**`use`** 把某个抽屉里的名字取出来用，`pub` 决定它能不能被外面看到。
- `src/lib.rs` 里那几行 `mod ...;` + `pub use ...;`，正好把第一节看到的六个"门面"名字摆到了正门口。
- **`Cargo.toml`** 是木箱的装箱单：`[package]` 是身份证（名字、版本、edition），`[lib]` 指明正门，`[dependencies]` 是正式依赖，`[dev-dependencies]` 是只在测试时才需要的依赖。
- **Cargo** 是搬运、下载、编译这些木箱的工具；`Cargo.lock` 是它自动生成的版本钉死单，不需要你手写。

下一篇，我们会真正走进 `spec.rs`，看看 `ProcessSpec` 这份"清单"是怎么一点点搭起来的——届时会碰到 Rust 里几个非常关键、也非常反直觉的概念。第一次读可能会皱眉，没关系，我们到时候一步步拆。
