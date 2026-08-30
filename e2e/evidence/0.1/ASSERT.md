# 切片 0.1 断言

| # | 断言 | 结果 | 实际值 |
|---|---|---|---|
| 1 | 世界文件/数据目录存在 | pass | TestHarness temp_path 存在 |
| 2 | world_at(0) 正在演的场=[] | pass | playing empty |
| 3 | world_at(0) 情状窗口=[] | pass | states empty |
| 4 | 未 seed 时无阿禾 | pass | nodes 无 ahe |
| 5 | seed 后身份有阿禾、仍无正史场 | pass | nodes 含 阿禾；playing empty |
| 6 | 未走写入正史 | pass | 无 commit 调用 |

测试：`empty_world_has_no_playing_beats` ok；`ferry_cast_is_identity_not_canon` ok。
`setting_empty_world` 7 passed; 0 failed（含 harness 既有探测）。
