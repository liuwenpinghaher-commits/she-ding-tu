# 库内检验（非点击）

1.1–1.20 共享这一次 cargo test --test setting_wave1 整包输出。不是 20 次独立 E2E。增量折未接线，1.11 实际测的是物化缓存对比全量。1.13 实际测两书不串，不是中文全文。

# 切片 1.1 草稿不进算出这一刻

公共入口 `SettingBook.commit` / `world_at` / `given_circumstances` / `constrain_draft`。
命令：`cd vendor/narra && cargo test --test setting_wave1 s1_1_ -- --nocapture`
