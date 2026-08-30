# 切片 2.5 实际步骤

同一点击脚本在 2.4 之后：

1. 记下 GET /api/world?t=0 的 playing 与 committed 场数、window_start。
2. 点 ›。
3. 再 GET world 与 committed 场数。
4. 点 tooth-0。
5. 确认 window_start 回到 0，算出与正史场数不变。
