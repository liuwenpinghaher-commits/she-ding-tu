# 切片 6.1

脚本 `e2e/playwright/f40.click.mjs` 输出 `F40_CLICK_PASS`。书 `f40-1788156023953`。同一条轴，中途不重灌。禁止 fetch 写正史、禁止 mousedown 冒充拖列、禁止删正史冒充改已正史。

| 步 | 断言 | 结果 | 实际值 |
|---|---|---|---|
| 2 | 空书 N=1 | pass | N=1 |
| 4 | 空任务不准写 | pass | `没有本场任务不准写下一场` |
| 6 | 未点写入此框则动作框空 | pass | do-text 仍空 |
| 7 | 写入此框仍草稿；细轨不亮 | pass | playing=[] |
| 8 | 草稿在场不算进算出 | pass | chip 有；where 无阿福 |
| 9 | 写入正史 seq=1；点列看这一刻 | pass | 阿福在渡口；阿福知道刀在抽屉 |
| 10 | 写下一场追加最后 | pass | col1 |
| 11 | 模型填不进框、不自动正史 | pass | committed 仍 1 |
| 13 | 空转折标黄仍可写 | pass | unwritten-shift 可见 |
| 14 | 并列不是阿莲 | pass | 阿禾在城里 col0 |
| 15 | 省略场 | pass | kind=ellipsis |
| 16 | 改已正史晚到；seq 不新分配；旧场对白不变 | pass | seq=1；对白「在这儿。」 |
| 17 | 铜牌三日进规定情境；不兑现可写 | pass | 未收伏笔：铜牌三日 |
| 18 | 同人两地挡住 | pass | HTTP 400 `阿莲 同一列两个地点` |
| 19 | 细条跳走再回来不改正史 | pass | start 0→9→0 |
| 20 | 写下一场仍最后 | pass | col9 |
| 21 | 顶栏 + ≠ 加列 | pass | N 4→5；列 10→11 来自中间加列 |
| 22 | 减列有正史拒绝只丢 | pass | suggest-refuse |
| 23 | 删已正史补洞；seq 不重编号 | pass | 留下 `[1,4,3]` |
| 24 | 导出含正史+草稿 | pass | 状态：正史 / 状态：草稿 |
| 25 | 飞出层点格跳列 | pass | 无改格；POST occupancy 只读 |
| 26 | 按读序排算出不变 | pass | aria-pressed=true；world t=0 |
