"""故事本体 v2 · 纵切片内核(内存版)。

四类一等公民,持续体/发生体分明(BFO/DOLCE 红线):
  Entity        持续体(角色/物件/地点/阵营)—— 无时间部分,跨章同一身份
  Event         发生体 —— 有时间部分,占故事时刻;effect 改世界状态
  Fact          quality —— 随时间索引地 inhere 于某 Entity(状态@章)
  KnowledgeEdge 某 knower 对某 Fact 的视角(belief base,显式、可错、非闭包)

切片用内存 dict;字段保留双时态(valid/tx)骨架,full build 落 SurrealDB 双时态日志。
唯一改世界状态的入口是 World.add_fact / see_event(对齐"渲染只读"原则)。
"""
from __future__ import annotations

from dataclasses import dataclass, field

#: 命题主语只能是这三类。`fact:` / `ev:` 在本体里另有其表，不做命题主语。
#: 势力走 faction 表、不进 entity，但在命题里仍用 `org:` 指称。
SUBJECT_PREFIXES = ("role", "place", "org")

#: 模型笔误的等价写法。提示词已写死只许用上面三个，实测仍会零星写 `loc:`。
_PREFIX_ALIAS = {
    "loc": "place", "location": "place", "site": "place", "地点": "place",
    "char": "role", "person": "role", "people": "role", "人物": "role",
    "faction": "org", "group": "org", "organization": "org", "势力": "org",
}


def canon_oid(oid: str) -> str | None:
    """把实体 id 归到本体里，认不出返回 None。

    认不出的绝不能放行：`loc:` / `world:` / `hist:` 曾这样混进 20 条命题——
    能被字符串统计到、却永远关联不上实体，一致性检查和限知帧全都照不到。
    """
    oid = (oid or "").strip()
    if not oid or ":" not in oid:
        return None
    prefix, name = oid.split(":", 1)
    prefix, name = prefix.strip().lower(), name.strip()
    if not name:
        return None
    prefix = _PREFIX_ALIAS.get(prefix, prefix)
    return f"{prefix}:{name}" if prefix in SUBJECT_PREFIXES else None


@dataclass
class Entity:
    id: str
    kind: str                       # character / item / place / faction
    name: str
    traits: dict = field(default_factory=dict)


@dataclass
class Fact:
    """状态@时间:value 是 entity 的 attribute 在 [valid_from, valid_to) 期间的取值。
    secret=True 表示私密底细(泄露给非持有者=POV 穿帮);它是 verify 的元数据,
    不是投影门控——投影门控只看有没有 KnowledgeEdge。"""
    id: str
    entity_id: str
    attribute: str
    value: str
    valid_from: int                 # 故事内生效起点(章)
    valid_to: int | None = None     # null=惯性持续
    secret: bool = False
    leak_markers: list[str] = field(default_factory=list)  # 私密的"破绽词":出现在非持有者视角散文里=穿帮
    caused_by_event: str | None = None
    tx_from: int = 0                 # 草稿版本(切片恒 0)
    tx_to: int | None = None
    injection_mode: str | None = None  # M6 设定三态注入:always/detected/never(None=detected)
    priority: int | None = None        # M6 预算裁剪优先级(越大越先保)
    source: str | None = None          # PR-4: proposition.source（codex_bridge/ingest/author/…）


@dataclass
class KnowledgeEdge:
    """knower 知道 proposition(=Fact.id)。无隐式闭包:不自动知道逻辑后果。"""
    knower_id: str                  # role:焦三 / reader / world
    proposition_id: str
    polarity: bool = True           # False=误信;有生产消费(knowledge 投影只取 polarity=True 的边)
    certainty: float = 1.0          # 疑似死(P2-15):write→read roundtrip + test_store 断言,但无行为消费方;保留待确认
    since_chapter: int = 0
    until_chapter: int | None = None
    acquired_via: str = "given"     # saw / told / inferred / given


@dataclass
class Event:
    """发生体。effect 列出本事件初始化的 Fact id(看见即知道据此发边)。
    causal_in / motivated_by_goal 是连贯性的硬约束(verify.causal_complete 查)。"""
    id: str
    type: str
    participants: dict = field(default_factory=dict)   # role -> entity_id
    location: str | None = None
    story_time: int = 0                                # 章
    # preconditions:疑似死(P2-15):write+read roundtrip(P3-e1 Fix3 已接读回)+ test,但
    #   无行为消费方,且无 API/ingest 生产入口(ingest 恒写 []);保留待确认(移除牵动 schema+2测试)。
    preconditions: list[str] = field(default_factory=list)
    effects: list[str] = field(default_factory=list)   # Fact ids
    causal_in: list = field(default_factory=list)      # [(event_id, type)]
    # 同章可有多个独立场景根事件。非首且没有 causal_in 时必须写明为什么另起一条链，
    # 否则 causal_complete 仍按断链处理。
    causal_root_reason: str | None = None
    motivated_by_goal: str | None = None
    is_executed: bool = True
    narrative_position: int | None = None              # 叙事位(可空):事件在叙事顺序里的位置;
    #   null = 回退 story_time(线性叙事);非 null = 倒叙/闪回独立坐标(spec §3.1)。


class World:
    """fabula 唯一事实源 + 知识边集合。三帧都是其上按 knower 的投影。"""

    def __init__(self) -> None:
        self.entities: dict[str, Entity] = {}
        self.facts: dict[str, Fact] = {}
        self.events: dict[str, Event] = {}
        self.knowledge: list[KnowledgeEdge] = []

    # --- 写入(唯一改状态入口)---
    def add_entity(self, e: Entity) -> Entity:
        self.entities[e.id] = e
        return e

    def add_fact(self, f: Fact) -> Fact:
        self.facts[f.id] = f
        return f

    def add_event(self, ev: Event) -> Event:
        self.events[ev.id] = ev
        return ev

    def add_knowledge(self, k: KnowledgeEdge) -> KnowledgeEdge:
        self.knowledge.append(k)
        return k

    def grant_public(self, fact_id: str, chapter: int) -> None:
        """公开事实:给当前所有角色发一条 KnowledgeEdge(人人皆知)。"""
        for e in self.entities.values():
            if e.kind == "character":
                self.add_knowledge(KnowledgeEdge(e.id, fact_id, since_chapter=chapter,
                                                 acquired_via="given"))

    # --- 读取 ---
    def entity(self, eid: str) -> Entity | None:
        return self.entities.get(eid)

    def fact(self, fid: str) -> Fact | None:
        return self.facts.get(fid)

    def event(self, eid: str) -> Event | None:
        return self.events.get(eid)

    def facts_at(self, chapter: int) -> list[Fact]:
        """在 chapter 故事时刻有效的事实(双时态单点区间查,tx 取当前草稿)。"""
        return [f for f in self.facts.values()
                if f.valid_from <= chapter and (f.valid_to is None or f.valid_to > chapter)
                and f.tx_to is None]

    def characters(self) -> list[Entity]:
        return [e for e in self.entities.values() if e.kind == "character"]

    def events_at(self, chapter: int) -> list[Event]:
        return [ev for ev in self.events.values() if ev.story_time == chapter]

    def list_craft_rules(self) -> list[dict]:
        """内存 World 无题材层;真库由 SurrealStore 覆盖。"""
        return []
