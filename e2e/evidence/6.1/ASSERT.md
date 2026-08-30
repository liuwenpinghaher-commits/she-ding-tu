# 切片 6.1

脚本 `e2e/playwright/f40.click.mjs` 输出 `F40_CLICK_PASS`。书 `f40-1788112943011`。同一条轴，不是 remaining.click 另一本书。

| 断言 | 结果 | 实际值 |
|---|---|---|
| 空书 N=1 | pass | N=1；书 f40-1788112943011 |
| 空任务不准写 | pass | `没有本场任务不准写下一场` |
| 写入此框仍草稿；算出无草稿 | pass | draft count=1；world playing 在写入正史前为空 |
| 写入正史 / 看这一刻 | pass | playing=`["d1788112944029"]`；where 阿福=渡口；seq=`[1]` |
| 下一场规定情境见上场历史 | pass | `当场利害：阿福.where=渡口`；`知情差：阿莲 不知道 阿福.where=渡口`；`上场价值转折：本场变化`；`未收伏笔：铜牌三日` |
| 伏笔建议可忽略、不自动正史 | pass | `建议：payoff token_due`；模型填后 committed 仍 1 |
| 同人两地挡 | pass | HTTP 400 `阿福 同一列两个地点` |
| 省略场 | pass | id `d1788112947128` kind=ellipsis |
| 细条跳走再回来不改正史 | pass | start 0→1→0；committed 仍 `d1788112944029`,`d1788112944962` |
| 写下一场仍最后 | pass | lastCol=col1 newestCol=col1 |
| 改已正史 | pass | 影响清单含故事时间空洞等；seq `[1,2]` → 留下 `[2]` |
| 导出含正史+草稿 | pass | 正文有 `状态：正史` 与 `状态：草稿` |
