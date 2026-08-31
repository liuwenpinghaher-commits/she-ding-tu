# 库内检验（非点击）

本项不是独立点击。
1.1–1.20 原先共用同一份别人机器上的 cargo test 整包输出。
库内故事检验见 vendor/narra/tests/setting_wave1.rs。
运行记录只保留 e2e/evidence/1.1/log.txt（一次整包）。
status=library

----
# 切片 1.17 入伙须本场变化

公共入口 `SettingBook.commit` / `world_at` / `given_circumstances` / `constrain_draft`。
命令：`cd vendor/narra && cargo test --test setting_wave1 s1_17_ -- --nocapture`
