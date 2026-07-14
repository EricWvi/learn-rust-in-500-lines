# 术语表

每篇文章首次引入的术语及对应篇号。

| 术语 | 含义（简述） | 首次出现 |
| --- | --- | --- |
| `crate` | Rust 中最大的组织单位，编译为一个成品（库或可执行程序）。 | 01 |
| library crate（库 crate） | 供其他代码使用的 crate，根文件为 `lib.rs`。 | 01 |
| binary crate（二进制 crate） | 可独立运行的 crate，入口文件为 `main.rs`。 | 01 |
| `lib.rs` | 库 crate 的"正门"。 | 01 |
| `main.rs` | 二进制 crate 的入口文件。 | 01 |
| module（`mod`，模块） | crate 内部的一组命名代码；文件名对应模块名（如 `spec` → `spec.rs`）。 | 01 |
| `use` | 将某个名称引入当前作用域，以便用短名引用。 | 01 |
| re-export（`pub use`，重导出） | 使用 `use` 加 `pub` 把嵌套模块中的名称暴露到更上层路径。 | 01 |
| visibility（`pub`，可见性） | 控制一个项能否在模块之外被看到，默认为私有。 | 01 |
| `Cargo` | Rust 的构建工具和包管理器。 | 01 |
| `Cargo.toml` | crate 的清单文件：名称、版本、edition、依赖。 | 01 |
| edition | Rust 语言的一组默认设置（如 `2024`），与编译器版本不同。 | 01 |
| dependency（`[dependencies]`，依赖） | crate 构建和运行所需的其他 crate。 | 01 |
| `[dev-dependencies]` | 仅在测试、示例和基准测试中使用的依赖。 | 01 |
| `Cargo.lock` | Cargo 自动生成的文件，用于钉死依赖的精确版本。 | 01 |
| `enum`（枚举） | 一种"取值只能是列出的几种之一"的类型。 | 02 |
| variant（变体） | `enum` 中列出的每一种可能取值。 | 02 |
| `impl` block（实现块） | 给一个类型挂上关联函数/方法的代码块。 | 02 |
| associated function（关联函数）/ method（方法） | `impl` 块里的函数；首个参数为 `self` 的叫方法。 | 02 |
| attribute（属性，`#[...]`） | 写在项上方的 `#[...]` 指令，如 `#[derive(...)]`、`#[default]`。 | 02 |
| `derive`（派生） | 让编译器按默认规则自动实现一组 trait 的属性。 | 02 |
| trait | 一种能力契约（类似接口）；如 `Debug`、`Clone`、`Copy`、`Default`、`PartialEq`、`Eq`。 | 02 |
| `self` / `Self` | 小写 `self` 是方法被调用时的值（接收者）；大写 `Self` 是当前类型别名。 | 02 |
| expression（表达式）/ statement（语句） | 表达式会求值；语句不产生值。Rust 几乎一切皆表达式（`let` 等除外）。 | 02 |
| `match` / pattern matching（模式匹配） | 按模式分支并求值的表达式；强制穷尽枚举变体。 | 02 |
| mutable / immutable（可变 / 不可变） | Rust 变量默认不可变；`mut` 关键字标记可变。 | 03 |
| `mut` | 标记变量或借用为"可改"的关键字。 | 03 |
| borrow（借用，`&` / `&mut`） | 不夺走所有权地临时使用一个值；`&` 只读共享，`&mut` 可写独占。 | 03 |
| borrow checker（借用检查器） | 编译期强制"共享不可变、可变不共享"的组件，杜绝数据竞争与迭代器失效。 | 03 |
| zero-cost abstraction（零成本抽象） | 使用某种抽象不带来额外的运行时开销。 | 03 |
| `OsString` | 操作系统原生字符串，不保证合法 UTF-8，用于命令行参数与环境变量。 | 03 |
| `Vec` | 可变长度的堆数组（类似 JS `Array` / Java `ArrayList` / Go slice）。 | 03 |
| generic（泛型，`<>`） | 用类型参数表示"装什么类型"，如 `Vec<OsString>`。 | 03 |
| tuple（元组，`(A, B)`） | 把几个值按固定顺序打包成一个值。 | 03 |
| `Option<T>` / `Some` / `None` | 标准库枚举，表达"可能有值也可能没有"；Rust 用它取代 null。 | 04 |
| `if let` | `match` 的精简版，只在匹配到某个模式时执行分支。 | 04 |
| `?`（问号操作符） | 遇 `None`/`Err` 立刻提前返回，遇 `Some`/`Ok` 取出值继续。 | 04 |
| `panic` | 程序直接崩溃退出（不可恢复的错误）。 | 04 |
| `unwrap` / `expect` | 强行取出 `Option`/`Result` 里的值，为空则 panic。 | 04 |
| `PathBuf` / `Path` | 跨平台路径的"拥有型"（可拼接）与"借用型"（只读切片），底层基于 `OsStr`。 | 04 |
| `deref` / `as_deref` | 把拥有型（如 `PathBuf`）降级为借用引用（如 `&Path`）。 | 04 |
| lifetime（生命周期） | 编译期保证引用不"活得比它指向的数据还长"的机制（本系列后续详讲）。 | 04 |
| trait（特征） | "能力契约"（类似 interface），声明类型必须提供的方法。 | 05 |
| `impl Trait for Type` | 为某个类型实现某 trait 的语法。 | 05 |
| associated type（关联类型，`type T;`） | trait 留给实现者填的占位类型，用 `Self::T` 引用。 | 05 |
| trait bound（约束，`:` / `+`） | 要求某类型满足若干 trait。 | 05 |
| `Result<T, E>` / `Ok` / `Err` | "成功或失败"的枚举，失败时携带错误原因。 | 05 |
| type alias（类型别名） | 给类型起的简写名，如 `io::Result<T> = Result<T, io::Error>`。 | 05 |
| `Send` | 类型可安全跨线程移动的标记 trait。 | 05 |
| `'static` | "活到程序结束 / 不借用短命数据"的生命周期。 | 05 |
| ownership（所有权） | 每份数据任一时刻只有一个所有者；所有者离开作用域时数据被 drop。 | 06 |
| owner / drop | 数据的所有者；所有者离开作用域时自动释放数据（drop）。 | 06 |
| move（转移） | 非 `Copy` 类型在赋值/传参时所有权搬走、旧名作废。 | 06 |
| borrow（借用，`&` / `&mut` / `*`） | 不转移所有权地使用数据；`&` 共享只读、`&mut` 独占可写、`*` 解引用。 | 06 |
| dangling pointer（悬空指针）/ use-after-free | 引用指向已释放的内存；Rust 借生命周期在编译期杜绝。 | 06 |
| lifetime（生命周期，`'a`） | 引用的"保质期"，编译期保证引用不比数据活得久；可用 `'a` 显式标注或被 elision 省略。 | 06 |
| lifetime elision（省略） | 编译器按默认规则自动补全常见生命周期，免手写。 | 06 |
| NLL（非词法生命周期） | 借用在"最后一次使用"处结束，而非作用域末尾；让合法借用更早释放。 | 06 |
| `impl Trait`（输入位置 / 参数位置） | 写在参数类型上的 `impl Trait`，是泛型的语法糖；由调用者决定具体类型。 | 07 |
| static dispatch（静态分发） | 编译期为每种类型单态化出专门代码、方法调用直接跳转的方式，零运行时开销。 | 07 |
| monomorphization（单态化） | 编译器对每种实际类型各"复印"一份专门代码的过程，是静态分发的实现手段。 | 07 |
| opaque return type（不透明返回类型）/ `impl Trait`（返回位置）/ RPIT | 返回位置的 `impl Trait`；由实现者决定具体类型，调用者只见其 trait；仍是静态分发。 | 07 |
| trait object（trait 对象，`dyn Trait`） | 运行时才确定具体类型的值，能统一收纳多种类型；走动态分发。 | 07 |
| dynamic dispatch（动态分发） | 运行时通过虚表查找方法地址再调用的方式，有一次间接开销。 | 07 |
| vtable（虚表） | 记录某类型各方法地址的表；trait 对象靠它实现动态分发。 | 07 |
| interior mutability（内部可变性） | 类型外部表现得像不可变（拿到 `&T` 即可操作），内部却允许修改；把安全性检查从编译期挪到运行时（如 `Mutex`、`RefCell`、`Cell`）。 | 08 |
| `Mutex<T>` / `MutexGuard` | 互斥锁；`lock()` 返回守卫 `MutexGuard`，在守卫上可读写内部数据，守卫离开作用域自动还锁。 | 08 |
| poisoning（中毒）/ `PoisonError` | 持锁期间线程 panic 会让 `Mutex` 标记为"中毒"，此后 `lock()` 返回 `Err`；可用 `PoisonError::into_inner` 取出守卫。 | 08 |
| channel（通道） | 在任务/线程之间单向传递消息的管道，两端分别持有发送端与接收端；体现"靠通信来共享"。 | 08 |
| `watch` / `mpsc` / `oneshot` | tokio 三种通道：`watch` 广播单一可变最新值（公告牌）、`mpsc` 多生产者单消费者的流（传送带）、`oneshot` 一次性单值（电报）。 | 08 |
| `tokio::select!` | 异步多路复用：把多个异步操作并排放着，谁先就绪就跑谁的分支。 | 08 |
| `Arc<T>`（原子引用计数） | 实现共享所有权的类型：多个 `Arc` 经 `clone` 共同拥有同一份数据，计数归零才回收；常与 `Mutex` 成对写作 `Arc<Mutex<T>>`。 | 08 |
| share by communicating（靠通信来共享） | 用通道传递消息来协调，而非共享同一块内存；与"communicate by sharing"相对。 | 08 |
