# 4.3-live

| 断言 | 结果 | 实际值 |
|---|---|---|
| 缺密钥 blocked | blocked | SETTING_LLM_API_KEY 未设置 |
| 代码不再对有密钥返回未实现 | pass | fill_live 会 POST chat/completions |
| 不挡 4.3 假模型 | pass | 4.3 仍是假模型档 |
