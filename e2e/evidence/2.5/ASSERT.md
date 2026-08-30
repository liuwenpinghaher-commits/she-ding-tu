# 切片 2.5

| 断言 | 结果 | 实际值 |
|---|---|---|
| › 只改窗口起点 | pass | start 0→1 |
| › 不改正史场数 | pass | committed 始终=1 |
| › 不改算出这一刻 | pass | playing 始终 ["d1"] |
| 点齿跳回起点 | pass | afterTooth.start=0，playing 仍 ["d1"] |

S23_25_PASS。
