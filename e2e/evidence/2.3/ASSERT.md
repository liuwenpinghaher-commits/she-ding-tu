# 切片 2.3

| 断言 | 结果 | 实际值 |
|---|---|---|
| 打开书名是 A | pass | book=openA-1788109251477 |
| 正史卡可见 | pass | canonCards=1，committed id=d1 status=committed |
| 草稿卡可见 | pass | draftCards=1，drafts=["d1"] |
| 有正史列齿色 canon | pass | tooth-0 className="tooth canon" |
| 只有草稿的列齿色 draft，不是 canon | pass | tooth-1 className="tooth draft" |
| 草稿未进算出这一刻 | pass | afterOpen.playing=[]（该快照 t 落在草稿列）；world?t=0 的正史场仍是 committed 的 d1 |

S23_25_PASS。
