# 第 08 篇：内部可变性、`Mutex` 与通道——`&self` 凭什么能改数据

## 一、两个看起来都不可能的签名

上一篇结尾我们说，要回到 `tokio_process.rs`，看 `TokioProcessSpawner` 和 `TokioManagedProcess` 怎么把第五篇那套 `ManagedProcess` 接口真正实现出来。下面就是其中最值得琢磨的一个方法——`wait`：

```rust
fn wait(&self) -> impl Future<Output = io::Result<ExitStatus>> + Send + '_ {
    drop(
        self.stdin
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take(),
    );
    // ...随后等待子进程退出
}
```

先别管细节，盯住两件事。

第一，`wait` 的接收者是 `&self`——一个**共享借用**。第六篇我们刚立过规矩"共享（`&`）就不可变，可变（`&mut`）就不共享"。可这里 `wait` 明明通过 `&self`，调了 `self.stdin.lock()...take()`——它**改了** `self.stdin`。一个 `&self` 方法，怎么能改自己的字段？

第二，等我们把 `TokioManagedProcess` 的字段列出来，会发现一个更怪的细节：它**根本没有 `Child` 字段**：

```rust
pub struct TokioManagedProcess {
    id: Option<u32>,
    stdin: Mutex<Option<ChildStdin>>,
    stdout: Option<ChildStdout>,
    stderr: Option<ChildStderr>,
    exit_rx: watch::Receiver<Option<ExitState>>,
    kill_tx: mpsc::UnboundedSender<KillRequest>,
    drop_tx: Option<oneshot::Sender<()>>,
}
```

那个真正代表子进程的 `Child`（tokio 的进程句柄）去哪了？`wait` 要等它退出、`kill` 要杀它，可把手自己不持有它，它靠什么做到？

这两个"不可能"，对应 Rust 里两套搬动和共享数据的机制：**内部可变性**（解决"`&self` 怎么改"）和**通道**（解决"数据不在手里，怎么指挥它"）。我们一个个拆。

## 二、先回顾：普通字段为什么不能通过 `&self` 改

在回答"`&self` 怎么能改"之前，先确认"普通情况为什么不能改"。看 `stdout` 字段——它是普通的 `Option<ChildStdout>`，没有 `Mutex`。它对应的取用方法是：

```rust
fn take_stdout(&mut self) -> Option<Self::Stdout> {
    self.stdout.take()
}
```

注意接收者是 `&mut self`——**可变借用**。正因为 `take` 要改 `self.stdout`（把里面的管道 move 出来、原地留下 `None`），它必须拿可变借用，编译器才放行。这一切和第六篇的规矩完全一致：要改，就得 `&mut`。

那么问题就聚焦在 `wait` 身上了：它也是要"取走 stdin、留个 `None`"，做的事和 `take_stdout` 同类，为什么它的接收者是 `&self` 而不是 `&mut self`？`ManagedProcess::wait` 的函数签名是 `&self`，`kill` 也是 `&self`。这是接口设计者定下的契约：等待、终止这些操作不该要求独占把手，调用方拿着一个共享引用也该能 `wait`。可一旦签名定成 `&self`，方法体里就不能用 `&mut self` 了——而我们偏偏需要改 `stdin`。规则和需求，在这里冲突了。

解铃还须系铃人：问题出在"普通字段只能通过 `&mut` 改"这条限制上。那有没有一种字段，**允许你拿着 `&` 也能改它**？有。它就是这一篇的核心——**内部可变性**。

## 三、内部可变性：在共享引用背后改东西

**内部可变性（interior mutability）**是一种"反着来"的设计：类型的**外部**表现得像个不可变值（拿到 `&T` 就能操作），但它的**内部**偷偷提供了修改的能力。说得通俗点，它像一个上了锁的保险柜——你只要能"看见"这个柜子（拿到 `&`），就能去拧锁、往里放东西；能不能拧开，不看你拿的是 `&` 还是 `&mut`，而看柜子自己的锁机制。

为什么 Rust 能允许这种"破例"？因为这类类型把"修改时的安全性检查"从**编译期**挪到了**运行时**。编译器看到的是 `&T`，按规矩它确实只读；但类型内部用了一点底层技巧（标准库的 `UnsafeCell`）绕过了这个假设，并在运行时亲自保证"同时只有一个修改者"，从而把安全责任揽到自己身上。对使用者来说，你拿到的就是一个**安全的 API**，不用操心它内部怎么做到的。

> 类比：普通字段像一本**摊在桌上的笔记本**——大家都能看（`&`），但谁要往上写，必须先把本子独占过来（`&mut`），免得两个人同时写串行。而内部可变类型像一本**带锁的共享登记簿**——大家都能过来登记（只要拿到 `&` 就能操作），但簿子上挂着一把锁，一次只让一个人动笔，排队来就行。Rust 把"管锁"这件麻烦事交给了类型自己。

标准库给了一整套这样的类型，按"单线程 / 多线程"分两路：

- **单线程**：`Cell<T>`（整体替换，简单值）、`RefCell<T>`（运行时借用检查，能拿到 `&mut`）。它们轻量，但**不能**跨线程共享。
- **多线程**：`Mutex<T>`（互斥锁，一次一个）、`RwLock<T>`（读写锁，多读一写）。它们自带线程同步，能在多线程/多任务间安全共享。

这些 “Cell” 现在只需要留个印象，我们留到以后专门讲解。

我们的 `tokio_process.rs` 跑在 tokio 的多线程运行时上，`wait` 可能在任意一个工作线程上被调用，所以这里用的是多线程那一档——`Mutex`。下面就看它。

## 四、`Mutex<T>`：拿 `&self` 锁一锁，就能改

`stdin` 字段是 `Mutex<Option<ChildStdin>>`——把 `Option<ChildStdin>` 整个装进了一把互斥锁里。`wait` 改它的完整步骤是：

```rust
self.stdin                       // &Mutex<Option<ChildStdin>>
    .lock()                      // 拿锁：返回 Result<MutexGuard, PoisonError>
    .unwrap_or_else(PoisonError::into_inner)  // 取出 MutexGuard（含中毒情况）
    .take()                      // 把 Option<ChildStdin> 里的管道 move 出来，原地留下 None，如果是 None，拿到的也是 None
```

逐步看清三件事。

**第一，`lock()` 的接收者是 `&self`——这把锁本身就是内部可变类型。** `Mutex::lock(&self)` 只要一个共享引用就能调，因为它内部自己管锁。这正是"`&self` 改数据"得以成立的根基：被改的不是普通字段，而是 `Mutex`，而 `Mutex` 允许通过 `&` 操作。

**第二，`lock()` 返回一个 `MutexGuard`（守卫）。** 你可以把它想成"开锁后到手的那把钥匙牌"——只要钥匙牌在手上，锁就一直为你独占；你通过钥匙牌去读写里面的数据。`MutexGuard` 实现了 `Deref` / `DerefMut`（自动解引用，第四篇见过），所以你能在它上面直接调 `Option::take`，就像是在直接操作里面的 `Option<ChildStdin>`。

**第三，守卫一旦离开作用域，锁自动释放。** 这又是一次所有权机制在干活（第六篇）：`MutexGuard` 被 drop 时，它的 `Drop` 实现会自动解锁。所以你不必手写"用完记得 unlock"——把守卫用完、它一离开作用域，锁就还回去了。把 `wait` 里那行放进 `drop(...)`，正是为了**立刻拿走 stdin、立刻 drop 掉守卫、立刻还锁**，绝不拖延（这一点到第六节"常见的坑"里会专门讲为什么不能拖）。

到这里，第一个"不可能"就破解了：`wait` 能改 `self.stdin`，是因为 `stdin` 不是普通字段，而是 `Mutex`——内部可变类型允许你拿着 `&self` 去锁它、再改它。

### 一个细节：为什么只有 `stdin` 用 `Mutex`，`stdout` / `stderr` 不用？

回头看字段表，会发现一个不对称：

```rust
stdin:  Mutex<Option<ChildStdin>>,   // 套了 Mutex
stdout: Option<ChildStdout>,        // 普通字段
stderr: Option<ChildStderr>,        // 普通字段
```

三根管道，为什么偏偏 stdin 特殊？因为 `wait`（一个 `&self` 方法）需要**关闭 stdin**——它要把 stdin 取走并 drop 掉，好让靠 stdin 驱动的子进程（`cat`、`grep` 这类）读到 EOF、知道输入结束、自行退出，而不是傻等输入卡死。而 `stdout`、`stderr` 在 `wait` 里**完全不被碰**，它们只在 `take_stdout` / `take_stderr` 里被取用，而那两个方法是 `&mut self`——独占借用，改普通字段天经地义，用不着 `Mutex`。

换句话说：**凡是需要在 `&self` 下被修改的状态，才需要 `Mutex` 这层内部可变性；只在 `&mut self` 下修改的，普通字段就够了。** 这条判据很实用，写代码时可以直接套用。

### 中毒：`PoisonError` 是怎么回事

`lock()` 返回的是 `Result`，意味着它可能失败——但失败的原因不是"锁坏了"，而是**中毒（poisoning）**。当一个线程正持有锁时突然 panic（崩溃退出），锁就会被标记成"中毒"状态，因为里面的数据可能正被改到一半，处于不确定的状态。此后别人再 `lock()`，拿到的就是 `Err(PoisonError)`。

`wait` 这里用的是 `.unwrap_or_else(PoisonError::into_inner)`——意思是"即使中毒了，也照样把守卫取出来用"。代码上方那句注释解释了原因：中毒只代表"之前某个持有者在持锁时崩了"，守卫本身仍是可用的，与其把这个错误抛给调用方、让整条调用链跟着中毒，不如恢复出里面的数据继续。这是一个经过权衡的务实选择（也确实是处理 `std::sync::Mutex` 中毒的常见写法）：我们更在意"能继续取到 stdin"，而不是纠结"上一个持锁者是不是体面地退出的"。

> 顺带把之前埋的线接上：`wait` 返回的 `impl Future<...> + Send + '_`，那个 `'_` 是说这个 future 借用了 `&self`（生命周期绑定到本次调用），`+ Send` 是说它能跨线程移动（第五篇的 `Send`），以便丢到 tokio 多线程运行时上去跑。`impl Trait` 在返回位置的含义，第七篇已经讲透——实现者决定具体类型，调用者只见其 trait。

## 五、通道：把手不持有进程，靠"传话"来指挥

第一个"不可能"解决了。第二个还在：`TokioManagedProcess` 没有 `Child` 字段，那它怎么 `wait`、怎么 `kill`？

答案是：**`Child` 被搬进了一个独立的后台任务里，把手和这个任务之间靠"通道"互相传话。** 把手不直接碰进程，而是给后台任务发指令、收回执。

这种思路有个名字，叫 **share by communicating（靠通信来共享）**——和直觉里的"大家共享同一块内存"（communicate by sharing）正好相反。Go 语言作者之一的 Rob Pike 总结 Go 的 channel 并发模型时说道：“Do not communicate by sharing memory; instead, share memory by communicating.”（不要靠共享内存来通信；相反，要靠通信来共享内存）。在这个文件里，把手和后台任务就是用通道把消息传来传去，而不是共同持有同一个 `Child`。

### 后台任务：抱着 `Child` 的那个循环

回看 `spawn` 方法（第五篇见过 `spawn`，这里是它的实现），它在创建完把手之前，悄悄做了一件事：

```rust
handle.spawn(run_process_lifecycle(child, kill_rx, drop_rx, exit_tx));
```

`handle.spawn(...)` 在 tokio 运行时上启动一个**后台任务（task）**，让它独立运行。这个任务拿到了**真正的 `child`**（所有权转移给它了），外加三个通道的端口。它的核心是一个循环，用 `tokio::select!` 同时盯着好几件事——哪件先发生，就处理哪件：

```rust
// 极度简化，省去了重试与错误处理
loop {
    tokio::select! {
        status = child.wait() => {            // 子进程自己退出了
            publish_exit(status, &exit_tx);   // 把退出状态通过通道发出去
            return;                            // 任务结束
        }
        request = kill_rx.recv() => {          // 收到一把手发来的"杀进程"指令
            handle_kill_request(&mut child, request, ...);
        }
        _ = drop_signal => {                   // 收到"把手被 drop 了"的信号
            let _ = child.start_kill();        // 发起 kill
        }
    }
}
```

`tokio::select!`（多路复用）是异步 Rust 里很常用的工具：它把好几个异步操作并排放着，**谁先就绪就跑谁的分支**，其余的丢掉。这里它同时盯着"进程退出"，"收到 kill 指令"，"收到 drop 信号"三件事，谁先来就响应谁。它的完整机制（包括分支取消、`if` 守卫等）以后单独讲，这里你只要把它理解成"同时等好几件事的开关"就够了。

注意一个精妙之处：收到 drop 信号后，任务并没有立刻 `return`，而是先 `start_kill`、然后**继续留在循环里**等 `child.wait()` 真正返回——因为它得拿到最终退出状态，通过 `exit_tx` 发给把手，否则把手的 `wait` 会一直等不到结果。这种"先发信号、再留守到收尾"的设计，正是为了让把手的 `wait` 永远能等到一个确定的结果。

### 三种通道，各管一件事

把手和任务之间一共架了三条通道，每条都用了一个**不同的**通道类型。这不是随便选的，而是各自匹配了不同的通信模式：

```rust
let (exit_tx, exit_rx) = watch::channel(None);            // ① 退出状态
let (kill_tx, kill_rx) = mpsc::unbounded_channel();       // ② kill 指令
let (drop_tx, drop_rx) = oneshot::channel();              // ③ drop 信号
```

先解开一个命名约定，免得这一串 `exit_tx`、`exit_rx` 看着眼晕。Rust 通道的代码里，**`tx` 是 transmitter（发送端）、`rx` 是 receiver（接收端）的缩写**——源自串口通信里 transmitter / receiver 的老习惯。`watch::channel(...)`、`oneshot::channel()` 这些构造函数都会返回一个 `(tx, rx)` 元组：前半截负责发、后半截负责收。于是名字就一目了然了：`exit_tx` 是"退出状态通道"的发送端，`exit_rx` 是它的接收端；前面的 `exit` / `kill` / `drop` 前缀，只是标明这条通道分管哪件事。你要往通道里放消息，就握着 `tx`；要等消息，就守着 `rx`——一条通道，永远是一对配好的发、收两端。

| 通道 | 方向 | 类型 | 为什么是它 |
| --- | --- | --- | --- |
| ① 退出状态 | 任务 → 把手 | `watch` | 大家都想"瞄一眼当前状态"，且随时可能查；`watch` 让每个接收者立刻看到最新值，变化时再通知 |
| ② kill 指令 | 把手 → 任务 | `mpsc`（多生产者单消费者） | kill 可能被调好几次、从好几处发起；`mpsc` 是一条**流**，能缓冲一连串请求 |
| ③ drop 信号 | 把手 → 任务 | `oneshot`（一次性） | 一个把手只会被 drop 一次；`oneshot` 发一个值、用一次即弃，最贴切 |

我们逐条来看。

**`watch`（① 退出状态）** 像一块**电子公告牌**：上面始终显示"当前最新"的退出状态。把手任何时候想查（`try_wait` 不阻塞地瞄一眼、`wait`/`kill` 先看一眼是不是已经退出了），都能立刻读到牌上的值，不必等。任务在进程退出时把公告牌更新一次（`exit_tx.send(Some(...))`），所有盯着这块牌的人就被通知到。`try_wait` 的实现就直白地体现了这一点——它只是借了公告牌看一眼，有结果就返回、没有就返回 `None`，绝不等待：

```rust
fn try_wait(&self) -> io::Result<Option<ExitStatus>> {
    match exit_result(&self.exit_rx.borrow()) {   // 看一眼公告牌当前值
        Some(result) => result.map(Some),
        None => Ok(None),
    }
}
```

这段里最绕的是 `result.map(Some)`，`.map()` 是 `Result`（和 `Option`）上的一个常用方法：传给它一个函数，它**只对成功值**套用这个函数，错误则原样放过——`Ok(x).map(f)` 变成 `Ok(f(x))`，而 `Err(e).map(f)` 还是 `Err(e)`。这里的 `Some` 是 `Option` 的构造器，Rust 允许把这种构造器当函数来用（`Some` 的类型就是 `fn(T) -> Option<T>`）。于是 `result.map(Some)` 的意思就很直白了：把 `Ok(ExitStatus)` 包成 `Ok(Some(ExitStatus))`，出错时错误原样透传。这层包装，正是为了让返回类型对上 `try_wait` 声明的 `io::Result<Option<ExitStatus>>`。

至于 `None => Ok(None)`，那是另一头：公告牌上还没值（进程没退出），返回 `Ok(None)`——"没出错，只是还没退出"。于是这层两层嵌套 `io::Result<Option<...>>` 一口气表达了三种状态：`Ok(Some(...))` 是已退出、`Ok(None)` 是还没退、`Err(...)` 是出错了。

**`mpsc`（② kill 指令）** 像一条**单向传送带**：把手这头往上传 kill 请求，任务那头一个个接。`mpsc` 是 multiple-producer, single-consumer（多生产者、单消费者）的缩写——意思是发送端可以 `.clone()` 出好几份（多个"生产者"都能往上传），但接收端只有一个（任务这边依次消费）。把手把 `kill_tx` 克隆一份塞进 `kill` 方法返回的 future 里，于是"调一次 kill 就往传送带上放一个请求"，任务那头 `kill_rx.recv()` 一个个取出来执行。为什么不用 `oneshot`？因为 kill 不是一次性的事——你可能先 kill、没死透再 kill，传送带能承载一串请求，一次性通道做不到。

**`oneshot`（③ drop 信号）** 像一张**一次性电报**：发一次、收一次，发完这张就作废。把手的 `Drop` 实现就是用它——把手被回收时，往任务那边拍一封电报：

```rust
impl Drop for TokioManagedProcess {
    fn drop(&mut self) {
        if let Some(drop_tx) = self.drop_tx.take() {
            let _ = drop_tx.send(());   // 拍电报：我没了，按约定处理进程
        }
    }
}
```

`drop_tx` 类型是 `Option<oneshot::Sender<()>>`——为什么套一层 `Option`？因为第六篇学过的 `Option::take`：取出发送端、原地留 `None`，保证一个把手即便 `drop` 被理论上调多次，也只发一次信号。这条通道只在 `kill_on_drop` 开启时才创建（看 `spawn` 里那个 `if spec.should_kill_on_drop()`），那些不需要回收进程的把手，`drop_tx` 一开始就是 `None`，`Drop` 里那行 `take()` 取出 `None`、什么都不做，干净利落。

把这三条通道和上一节的 `Mutex` 合起来看，整个把手的设计就通透了：**`Mutex` 解决"在 `&self` 下安全地改局部状态（stdin）"，通道解决"和后台任务之间搬指令和状态"。** 一个对内，一个对外。

## 六、那 `Arc` 呢？预告里提过它

第七篇结尾我预告说这一篇会碰到 `Arc`、`Mutex` 和通道。`Mutex` 和通道都登场了，唯独 `Arc` 没出现——我得如实说明：**这份代码里确实没有 `Arc`，而且这是个有意为之、值得讲清楚的选择。**

`Arc<T>`（atomically reference-counted，原子引用计数）是 Rust 里实现**共享所有权**的类型。第六篇我们说每份数据只有一个所有者；`Arc` 是这条规则的"合法例外"——它内部维护一个原子计数器，`clone()` 一次计数加一，每个 `clone` Drop 时计数减一，减到零才真正回收数据。好几个 `Arc<T>` 各拿一个引用，就等于**共同拥有**同一份数据。它通常和 `Mutex` 成对出现：你想让好几个线程同时读写同一块共享数据，就用 `Arc<Mutex<T>>`——`Arc` 负责共享所有权，`Mutex` 负责互斥访问。

那为什么这个把手用不上 `Arc`？因为把手**本来就只有一个所有者**——谁 `spawn` 出来谁拿着，没有被克隆到多个任务里去共享。它需要 `Mutex`，纯粹是为了在 `&self` 下改 stdin（内部可变性），不是为了在多线程间共享 stdin；单线程意义上的内部可变性，和多线程共享，是两回事。至于"多个调用点都想 kill"这种需求，代码是用**克隆通道的发送端**（`kill_tx.clone()`）来满足的——每个想发指令的地方拿一份发送端副本，背后还是同一个任务在收。这比"`Arc` 包一个共享把手"更轻：克隆一个通道发送端，远比维护一份共享所有权轻量。

> 一句话记住这条分界：**需要"多个地方共同拥有、共同读写同一块数据"时才上 `Arc<Mutex<T>>`；只是"一个所有者内部、要在 `&self` 下改自己"时，一个 `Mutex<T>` 就够。** 本篇的 `stdin` 属于后者，所以没有 `Arc`。等以后碰到"好几个任务要共享同一个缓存、同一个连接池"时，`Arc` 自然就会登场。

## 七、常见的坑

**坑一：忘了处理通道关闭。** 通道的某一端被 drop 后，另一端再操作就会失败：发送端没了，`recv()` 返回 `None`；接收端没了，`send()` 返回 `Err`。本篇代码里到处是 `let _ = ...send(...)`、以及对 `recv` / `changed` 返回值的 `match`，就是在认真处理"对面可能已经走了"的情况。如果你写了通道却不检查这些返回值，很可能在运行时悄悄丢失消息、或卡在一个永远不会有人响应的等待上。

**坑二：误以为 `&self` 方法可以随便改字段。** 看完本篇，别滑向另一个极端——以为内部可变性是"随时随地改字段的通行证"。普通字段仍然必须靠 `&mut self` 改；只有**显式**包在 `Mutex` / `RefCell` / `Cell` 这类内部可变类型里的字段，才能通过 `&self` 改。是否上 `Mutex`，是个要按需做的设计决定（见第四节那条判据），不是默认。

## 八、小结

- `ManagedProcess::wait` 和 `kill` 的接收者是 `&self`，可 `wait` 的实现需要改 `stdin`——这看似违背第六篇"共享即不可变"的规矩。突破口是**内部可变性（interior mutability）**：某些类型允许你拿着 `&` 去改其内容，把安全性检查从编译期挪到运行时。
- `stdin` 是 `Mutex<Option<ChildStdin>>`，`wait` 通过 `self.stdin.lock()` 拿到一个 `MutexGuard`（守卫），在守卫上 `.take()` 改数据。`Mutex` 自身是内部可变类型，`lock(&self)` 只要共享引用，这是"`&self` 能改"的根基；守卫离开作用域自动还锁。只有 `stdin` 套了 `Mutex`，因为它是在 `&self` 方法里被改的；`stdout` / `stderr` 只在 `&mut self` 方法里改，普通字段足矣。
- `Mutex::lock` 返回 `Result`，`Err` 表示**中毒（poisoning）**——上次持锁者 panic 了。`.unwrap_or_else(PoisonError::into_inner)` 选择无视中毒、照常取出守卫，是务实的取舍。
- `TokioManagedProcess` 没有 `Child` 字段：真正的 `Child` 被搬进了一个后台任务（`handle.spawn(run_process_lifecycle(...))`），把手和它靠**通道**传话，这就是 **share by communicating（靠通信来共享）**。
- 三种通道各司其职：`watch`（任务→把手，发退出状态，像电子公告牌，可随时瞄一眼）适合 `try_wait` / `wait` / `kill` 查状态；`mpsc`（把手→任务，kill 指令，像单向传送带，可承载多次请求）；`oneshot`（把手→任务，drop 信号，一次性电报，靠 `Option::take` 保证只发一次）。后台任务用 `tokio::select!` 同时盯着"进程退出 / kill 指令 / drop 信号"，先到先处理。
- 本篇没有 `Arc`：把手只有一个所有者，需要的是 `Mutex`（内部可变性）而非共享所有权。当真要"多个任务共同拥有并读写同一块数据"时，才用 `Arc<Mutex<T>>`——`Arc` 管共享所有权，`Mutex` 管互斥访问。
- 通道一端关闭后另一端操作会失败，务必检查返回值；普通字段仍须 `&mut self` 改，内部可变性不是随意改字段的通行证。
