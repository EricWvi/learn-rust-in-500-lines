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
