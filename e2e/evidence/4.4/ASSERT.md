# 切片 4.4

脚本 `e2e/playwright/s34-44.click.mjs`。书 `s3444-1788112930141`。

| 断言 | 结果 | 实际值 |
|---|---|---|
| 顶栏 + ≠ 加故事列 | pass | N 1→2；columns 仍 1 |
| 中间加列走确认变更 | pass | 建议：空列 / 空场 / 后移 / 借时间 / 取消；取消后钟仍 col0 0–60 |
| empty_col 不改已有列钟 | pass | 加后 col0 0–60、col1 60–120 |
| shift 后续列后移，与 empty_col 不同 | pass | 原 col1 60–120 → 120–180；新插入 col2 60–120 |
| 新场未自动正史 | pass | 仅加列，无新 committed |
