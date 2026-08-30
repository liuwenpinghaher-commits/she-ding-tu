# 切片 0.1 实际步骤

1. `TestHarness::new()` 创建一书一嵌入式 Narra 文件（`vendor/narra/tests/common/harness.rs`）。
2. `SettingBook::new(db).world_at(0, None)` 公共查询入口。
3. 断言正在演的场空、情状窗口空、无阿禾。
4. `ferry::seed_cast` 写入设定（身份），再 `world_at`：有阿禾，仍无正史场。

命令：`cd vendor/narra && cargo test --test setting_empty_world -- --nocapture`
