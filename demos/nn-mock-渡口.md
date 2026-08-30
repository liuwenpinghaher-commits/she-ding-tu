## Story
title: 渡口（功能演示）
author: 设定图对照 mock
genre: 世情 / 公案边角
tense: past
pov_default: 3rd Person Limited
language: 中文
tags: mock, 功能演示, 渡口
chapter_label: 章
act_label: 幕
time_tracking: on
time_format: 24h
week_start: monday


## Preset Lists

### List: 立场
- 过路客
- 船家
- 公门
- 漕帮

### List: 天气
- 晴
- 江雾
- 夜雨


## Custom Categories

### Category: 规矩
description: 地方上的活规矩，不是某一场戏，是能被触发的约束。
colour: #8b6914

### Category: 天候
description: 有名字的气象，故事会反复提到。
colour: #5b7c99


## Chapters

### Chapter: 交托
colour: #b1321f

### Chapter: 一夜

### Chapter: 城里
colour: #3d405b

### Chapter: 河上
colour: #81b29a


## Acts

### Act: 托出
chapters: 交托, 一夜

### Act: 被问
chapters: 城里, 河上
colour: #6b4f3a


## Characters

### Character: 阿禾
colour: #c45c26
description: 从上游下来的过路客。要把一封信带进城，又不敢自己带着进。
aliases: 那个过河的
notes: 演示角色：全套属性、知情差、托付关系。
awareness_scale: binary
name_awareness_scale: full

#### Attributes
- text: 口音 = "上游码头腔"
- preset: 立场 = "过路客" (from "立场")
- number: 年龄 = 27
- text_list: 随身 = ["油布包", "铜钱十几枚"]
- entity_list: 此刻在意 = [密信, 船娘]
- circumstance: "身无官凭" [moderate] : "进城查人时拿不出腰牌。"
- motivator: "活着进城" [strong] : "把信脱手，装作不知道。"

### Character: 船娘
colour: #2a9d8f
description: 渡口摆渡。袖里能藏客货，也藏得住祸。
aliases: 河上那位
notes: 演示角色：漕帮成员、拆信那场的 POV。
awareness_scale: full
name_awareness_scale: full

#### Attributes
- preset: 立场 = "船家" (from "立场")
- number: 年龄 = 34
- circumstance: "袖里有货" [mild] : "过河规矩允许她经手客货，不许她拆。"
- motivator: "河上不惹事" [moderate] : "捕快一到，她就要选。"

### Character: 捕快林三
colour: #3d405b
description: 城里来的捕快。查的是渡口那封信，不是过路客本人。
notes: 演示角色：公门成员、审讯场。
awareness_scale: full
name_awareness_scale: full

#### Attributes
- preset: 立场 = "公门" (from "立场")
- text: 腰牌 = "林字三号"
- motivator: "把信追回来" [strong] : "信不在过路客身上，就要去河上。"


## Locations

### Location: 渡口
colour: #6d6875
description: 城外渡口。船在，雾在，规矩在。
awareness_scale: binary

#### Attributes
- preset: 天气 = "江雾" (from "天气")

### Location: 城里
colour: #4a4e69
description: 城门以里。捕快的地面。

### Location: 客栈大堂
colour: #9a8c98
description: 城里第一家客栈的大堂。茶热，腰牌响。
parent: 城里

### Location: 客栈后院
colour: #c9ada7
description: 堆柴的后院。适合一个人把刚才的问话再过一遍。
parent: 城里


## Items

### Item: 密信
colour: #e9c46a
description: 油布包着的一封信。进城不许拆。
notes: 演示物：托付关系里的第三者。

#### Attributes
- text: 封口 = "火漆未动"
- number: 页数 = 1

### Item: 腰牌
colour: #778da9
description: 林三拍在桌上的那块。证明他是公门的人。

#### Attributes
- text: 字号 = "林字三号"


## Factions

### Faction: 漕帮
colour: #bc6c25
description: 河上的帮。船娘的名册在这里。成员不写在本条，写在关系「漕帮名册」。

### Faction: 公门
colour: #415a77
description: 城里捕快所属。林三的名册在「公门名册」。


## Customs

### Custom: 过河不拆客货
category: 规矩
colour: #8b6914
description: 渡口活规矩：客货经手可以，拆开不行。拆了，船和客一起倒霉。
notes: 演示 Custom：不是人、不是地、不是一件具体的信。

### Custom: 江雾
category: 天候
colour: #5b7c99
description: 第三日黄昏常有的江雾。遮船，也遮袖口。
label: 第三日


## Relationships

### Relationship: 托付之约
description: 阿禾把密信交给船娘，约定进城再拆。三人（两人一物）绑在一起。
participants:
  - 阿禾: perception "她若是漕帮的人，今晚就会报官。"; role "托付者"
  - 船娘: perception "袖里那封信比船沉。"; role "经手人"
  - 密信: perception ""; role "被托之物"

### Relationship: 过河之谊
description: 阿禾与船娘之间暂时的上下手关系。用来演示层级。
participants:
  - 船娘: perception "过河的规矩我懂。"; role "摆渡"
  - 阿禾: perception "只能信她一回。"; role "过客"
hierarchy:
  root: 船娘
  order: 船娘, 阿禾

### Relationship: 漕帮名册
description: 漕帮成员名册。故事开始时船娘已在册。
participants:
  - 船娘: perception ""; role "外水"
membership_of: 漕帮

### Relationship: 公门名册
description: 公门成员名册。林三一开始就在。
participants:
  - 捕快林三: perception ""; role "捕快"
membership_of: 公门


## Knowledge

### Knowledge: 信不能在城里拆开
colour: #e76f51
description: 阿禾对船娘立下的约束：信进了城也不能拆。读者见过这句，故事欠一次兑现或背叛。
notes: 演示 Knowledge：二进制知情。开场阿禾知道、船娘知道、林三不知道。
awareness_scale: binary
awareness:
  - 阿禾: aware
  - 船娘: aware
  - 捕快林三: unaware

### Knowledge: 漕帮在查渡口
colour: #9b2226
description: 河上有人在盯过路客。知情程度不一。
awareness_scale: full
awareness:
  - 船娘: partial
  - 阿禾: unaware
  - 捕快林三: name-only


## Scenes

### Scene: 把信交出去
chapter: 交托
description: 第三日黄昏，渡口。阿禾把油布包着的信塞进船娘袖里，嘱咐进城再拆。江雾起。托付之约在这一场成立。
pov: 阿禾
characters: 阿禾, 船娘
locations: 渡口
items: 密信
factions: 漕帮
customs: 过河不拆客货, 江雾
time_of_day: evening
weekday: Monday
season: autumn
date: October 3
duration: 20 minutes

#### Circumstances
- "江雾" [moderate] : "对岸看不清，袖口也看不清。"

content:
```
阿禾把油布包塞进船娘袖里，说：「进城再拆。拆了你我都活不成。」
船娘袖子一收，没看他：「过河的规矩，我懂。」
```

#### Changes at this scene
- 阿禾: add attribute (circumstance) "信已托出" [strong] : "信不在自己身上了。"
- 阿禾: add temporary circumstance "不信任她" [mild] : "她若是漕帮的人，今晚就会报官。"
- 阿禾: drop from attribute "随身": "油布包"
- 船娘: modify attribute "袖里有货" intensity to strong
- 船娘: modify attribute "袖里有货" description to "袖里是那封信。"
- relationship "托付之约": activate
- relationship "过河之谊": activate
- 阿禾: gains awareness of 船娘
- 阿禾: gains awareness of 船娘's name
- 船娘: gains awareness of 阿禾
- 船娘: gains awareness of 阿禾's name
- 船娘: gains awareness of 密信
- knowledge "信不能在城里拆开": 阿禾 gains awareness (aware)
- knowledge "信不能在城里拆开": 船娘 gains awareness (aware)


### Scene: 跨过一夜
chapter: 一夜
description: 时间在走，不当场演。阿禾进城，船娘仍在河上。信还在袖里。这一场用来演示 gap 和过夜时长。
pov: 阿禾
characters: 阿禾
locations: 渡口, 城里
time_of_day: night
weekday: Monday
season: autumn
date: October 3
duration: all night
gap: 2 hours

#### Circumstances
- "江上无事" [faint] : "没有人追上来。"

#### Changes at this scene
- 阿禾: add temporary circumstance "进城了" [moderate] : "城门过了，信不在身上。"


### Scene: 信被问起
chapter: 城里
description: 次日申时，客栈大堂。林三把腰牌拍在桌上，问渡口那封信还在不在阿禾身上。阿禾倒茶，手没抖。同列另一场在河上。
pov: 阿禾
characters: 阿禾, 捕快林三
locations: 客栈大堂
items: 腰牌
factions: 公门
time_of_day: 15:00
weekday: Tuesday
season: autumn
date: October 4
duration: 40 minutes
gap: 10 hours

#### Circumstances
- "大堂人多" [mild] : "问话像闲聊，只有他们两个知道不是。"

content:
```
林三把腰牌拍在桌上：「渡口那封信，还在不在你身上。」
阿禾倒茶，手没抖：「什么信。」
```

#### Changes at this scene
- 阿禾: add temporary circumstance "被审讯" [intense] : "必须用不知情活过这一问。"
- 捕快林三: gains awareness of 阿禾
- 捕快林三: gains awareness of 阿禾's name
- knowledge "信不能在城里拆开": 捕快林三 gains awareness (name-only)
- knowledge "漕帮在查渡口": 捕快林三 gains awareness (partial)
- 阿禾: gains awareness of 捕快林三
- 阿禾: gains awareness of 捕快林三's name
- 阿禾: gains awareness of 腰牌


### Scene: 河上拆信
chapter: 河上
description: 同一故事时刻，渡口。船娘停桨，几乎拆开油布。演示并行场、另一 POV、以及「差点背叛」。
pov: 船娘
characters: 船娘
locations: 渡口
items: 密信
factions: 漕帮
customs: 过河不拆客货
time_of_day: 15:00
weekday: Tuesday
season: autumn
date: October 4
duration: 15 minutes

#### Circumstances
- "河上无人看见" [strong] : "拆不拆，只有她自己知道。"

#### Changes at this scene
- 船娘: add temporary circumstance "要不要拆" [intense] : "城里有捕快。信留在袖里是祸。"
- 船娘: add attribute (motivator) "把信脱手" [strong] : "她开始盘算交给谁。"
- 密信: change description to "油布松了一角，火漆仍在。"
- knowledge "漕帮在查渡口": 船娘 gains awareness (aware)
- 船娘: modify attribute "河上不惹事" intensity to intense


### Scene: 后院决定
chapter: 城里
description: 同日酉时，客栈后院。阿禾一个人。演示草稿感：意图还在，价值变化空着，三轨只有想。
pov: 阿禾
characters: 阿禾
locations: 客栈后院
time_of_day: 18:00
weekday: Tuesday
season: autumn
date: October 4
duration: 25 minutes
gap: 2 hours

#### Changes at this scene
- 阿禾: add attribute (motivator) "回去找船娘" [moderate] : "要不要回去找她。"
- 阿禾: remove attribute "信已托出"
- 阿禾: add attribute (circumstance) "信不知下落" [strong] : "信应在船上。她拆了没有。"
- 阿禾: add alias "客栈那个倒茶的"


### Scene: 渡口那一幕（闪回）
flashback_of: 把信交出去
description: 阿禾在后院里把黄昏渡口又过一遍。闪回继承父场芯片与状态，只用来演示 flashback_of。
chapter: 城里
time_of_day: evening


### Scene: 漕帮夜报
chapter: 河上
description: 不当场演给读者看的一场：漕帮内部接到线报。无 POV，演示画布上的 off-screen 格。
characters: 船娘
locations: 渡口
factions: 漕帮
customs: 江雾
time_of_day: night
weekday: Tuesday
season: autumn
date: October 4
duration: 10 minutes

#### Changes at this scene
- knowledge "漕帮在查渡口": 船娘 gains awareness (aware)
- relationship "漕帮名册": 船娘's role becomes "外水·盯梢"
- 船娘: add temporary circumstance "今晚要回话" [moderate] : "帮里问她袖里是什么。"
