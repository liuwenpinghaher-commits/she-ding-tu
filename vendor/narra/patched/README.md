# patched crates

`surrealdb-core-2.6.0` 是 crates.io 原包 + 一处本地补丁。

## 为什么

Surreal 2.6 的 `MutableContext::new_concurrent` 会把 `IndexBuilder` 拷进后台建索引任务。
该任务又活在 `IndexBuilder` 自己的 HashMap 里，形成 Arc 环。
`DEFINE INDEX` 之后 `Datastore` / RocksDB 句柄永不 Drop（surrealdb#7304）。
setting-api 每开一本书都 `apply_schema`，所以删书/换书 RSS 不回落。

官方 3.1.0 用同一改法修了（commit `36b421e`）。2.6 没有 backport，这里原样打上。

## 改了哪一行

`src/ctx/context.rs`：`new_concurrent` 里 `index_builder: from.index_builder.clone()` → `None`。
