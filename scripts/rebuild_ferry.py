#!/usr/bin/env python3
"""本机重建《渡口》：走 8787 API（建书 / 设定 / 草稿 / 写入正史），幂等。

测试依赖（aeon-acceptance 打开渡口、aeon-timeline、contract26 #24 书架上须留一本不删的书、
ferry.retain 场次与 last_intent）都写在这里，不改 e2e 断言。
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("SETTING_URL", "http://127.0.0.1:8787").rstrip("/")
BOOK = "渡口"
PREMISE = "渡口夜里，铜牌三日，刀在抽屉。"
DRAFT_INTENT = "阿禾在城门口等到天亮"


def req(method: str, path: str, body=None, expect=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            if (resp.headers.get("content-type") or "").startswith("application/json"):
                return json.loads(raw) if raw else {}
            return raw
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        if expect is not None and e.code == expect:
            return {"_http": e.code, "_err": err}
        raise SystemExit(f"{method} {path} -> {e.code} {err[:800]}")


def enc(name: str) -> str:
    return urllib.parse.quote(name, safe="")


def state():
    return req("GET", "/api/state")


def books():
    return req("GET", "/api/books")


def drop_if_exists():
    listing = books()
    names = listing.get("books") or []
    if BOOK not in names:
        return
    req("DELETE", f"/api/books/{enc(BOOK)}?confirm={enc(BOOK)}")
    left = books().get("books") or []
    if BOOK in left:
        raise SystemExit("删《渡口》失败，还在书架上")


def add_ent(kind: str, name: str, profile: dict | None = None):
    body = {"id": name, "kind": kind, "name": name}
    if profile:
        body["profile"] = profile
    req("POST", "/api/entities", body)


def presence(draft_id: str, entity_id: str):
    req("POST", "/api/presence", {"draft_id": draft_id, "entity_id": entity_id, "action": "add"})


def write_next(intent: str, place: str):
    time.sleep(0.02)
    r = req("POST", "/api/write-next", {"intent": intent, "place_id": place})
    did = r.get("id")
    if not did:
        raise SystemExit(f"写下一场无 id: {r}")
    return did, r.get("column_id")


def write_parallel(intent: str, place: str, column_id: str):
    time.sleep(0.02)
    r = req("POST", "/api/write-parallel", {"intent": intent, "place_id": place, "column_id": column_id})
    did = r.get("id")
    if not did:
        raise SystemExit(f"并列无 id: {r}")
    return did, r.get("column_id")


def patch(draft_id: str, **fields):
    body = {"id": draft_id, **fields}
    return req("POST", "/api/drafts/patch", body)


def commit(draft_id: str):
    r = req("POST", "/api/commit", {"id": draft_id})
    if r.get("ok") is not True:
        raise SystemExit(f"写入正史失败 {draft_id}: {r}")
    return r


def scene(
    intent: str,
    place: str,
    people: list[str],
    *,
    do_text: str = "",
    say_text: str = "",
    think_text: str = "",
    value_shift: str = "",
    extras: list[str] | None = None,
    deltas: list[dict] | None = None,
    knows: list[dict] | None = None,
    ellipsis: bool = False,
    parallel_col: str | None = None,
    keep_draft: bool = False,
    visible_to: list[str] | None = None,
):
    if parallel_col:
        did, col = write_parallel(intent, place, parallel_col)
    else:
        did, col = write_next(intent, place)
    for eid in people + (extras or []):
        presence(did, eid)
    st = state()
    d = next((x for x in (st.get("drafts") or []) if x.get("id") == did), None)
    if not d:
        raise SystemExit(f"草稿不见了 {did}")
    clock = d["draft"]["clock_from"]
    patched_deltas = []
    for x in deltas or []:
        patched_deltas.append(
            {
                "entity_id": x["entity_id"],
                "attr": x["attr"],
                "value": x["value"],
                "clock_from": x.get("clock_from", clock),
                "clock_to": x.get("clock_to"),
            }
        )
    if ellipsis:
        req("POST", "/api/ellipsis", {"id": did})
    fields = {
        "intent": intent,
        "place_id": place,
        "value_shift": value_shift,
    }
    if not ellipsis:
        fields["do_text"] = do_text
        fields["say_text"] = say_text
        fields["think_text"] = think_text
    if patched_deltas:
        fields["deltas"] = patched_deltas
    if knows:
        fields["knowledge_writes"] = knows
    if visible_to is not None:
        fields["visible_to"] = visible_to
    patch(did, **fields)
    if keep_draft:
        return did, col, None
    c = commit(did)
    return did, col, c


def add_empty_column():
    req("POST", "/api/structure/preview", {"op": "add_column"})
    r = req("POST", "/api/structure/confirm", {"choice": "empty_col"})
    return r


def main():
    health = req("GET", "/health")
    if str(health).strip() != "ok":
        raise SystemExit(f"8787 不健康: {health}")
    print("health", health)

    drop_if_exists()
    req("POST", "/api/books", {"name": BOOK, "premise": PREMISE, "clock_origin_label": "第一天 20:00"})
    opened = req("POST", f"/api/books/{enc(BOOK)}/open", {})
    if BOOK not in (opened.get("books") or []):
        raise SystemExit(f"建书后书架没有《渡口》: {opened}")

    add_ent(
        "person",
        "阿禾",
        {
            "setup": "渡口帮跑腿的年轻人。认得城里门房，却不敢在城门口久站。",
            "role": "跑腿",
            "appearance": "瘦，裤脚常湿",
            "voice": "话短，叫人时先看一眼再开口",
            "desire": "把铜牌送进城，自己不沾祸",
            "need": "被人当自己人",
            "fear": "帮里拿他当弃子",
            "secret": "铜牌不是他自己的",
            "ties": "听阿福的；欠阿莲一句实话",
        },
    )
    add_ent(
        "person",
        "阿福",
        {
            "setup": "渡口柜台里的人。抽屉是他的边界。",
            "role": "柜台",
            "appearance": "手指有油布味",
            "voice": "慢，能把「没看见」说成事实",
            "desire": "看住抽屉，不让阿莲看见刀",
            "need": "把祸事关在自己这一侧",
            "wound": "上回开抽屉开早了，帮里有人没回来",
            "secret": "刀是替谁收的，他没问完",
            "limit": "不当着阿莲开抽屉",
        },
    )
    add_ent(
        "person",
        "阿莲",
        {
            "setup": "从城里来渡口找铜牌的人。铜牌是进城的凭证，也是她要回来的东西。",
            "role": "来找东西的人",
            "appearance": "袖口有城门灰",
            "voice": "问句多，不解释自己",
            "desire": "找回铜牌",
            "need": "确认渡口还认她",
            "fear": "铜牌已经换了手",
            "secret": "铜牌上的名字不是现在这个",
        },
    )
    add_ent(
        "place",
        "渡口",
        {
            "setup": "江边夜船停靠处。柜台后有抽屉，帮里有仓。",
            "place_kind": "码头/室内柜台",
            "atmosphere": "潮、油灯、脚步声停在门槛外",
            "senses": "湿木、煤油、远处缆绳",
            "function": "交割、藏东西、等人",
            "access": "帮里的人进柜台；外人停在柜面",
        },
    )
    add_ent(
        "place",
        "城里",
        {
            "setup": "城门内。阿禾不敢问渡口的事。",
            "place_kind": "城门内",
            "atmosphere": "灯多、问话少",
            "function": "铜牌该抵达的地方",
            "access": "有铜牌才过得去",
        },
    )
    add_ent(
        "thing",
        "刀",
        {
            "setup": "短刀，油布裹着，不该出现在柜台抽屉。",
            "appearance": "短、有油",
            "function": "把柄",
            "owner_setup": "原不该有主",
            "place_setup": "渡口柜台抽屉",
            "symbol": "谁开抽屉谁就沾上祸",
        },
    )
    add_ent(
        "thing",
        "铜牌",
        {
            "setup": "进城凭证。阿莲要找回来的那一块。",
            "function": "过城门",
            "owner_setup": "阿莲",
            "place_setup": "不知所终",
            "symbol": "三日期限",
        },
    )
    add_ent(
        "faction",
        "渡口帮",
        {
            "setup": "管夜船和柜台抽屉的组织。",
            "creed": "夜船的事不过柜面",
            "public_face": "渡口上的人",
            "private_line": "抽屉里的东西不登记",
            "leader_setup": "不上场的人",
        },
    )
    add_ent(
        "rule",
        "渡口夜间不得开船",
        {
            "setup": "夜里不得开船。省略场里可以赶路，不能当众开船。",
            "capability": "挡夜航",
            "cost": "误了城门的人只能等",
            "limit": "帮里私自解缆算穿帮",
            "enforcement": "标黄",
            "scope": "渡口、入夜之后",
        },
    )
    print("entities ok")

    _, col0, c1 = scene(
        "阿福发现刀在抽屉",
        "渡口",
        ["阿福"],
        extras=["刀"],
        do_text="阿福拉开柜台抽屉，油布里躺着一把短刀。他看了一眼，把油布重新盖上。",
        think_text="阿莲今晚来找铜牌。抽屉不能开给她看。",
        value_shift="无知→把柄",
        deltas=[{"entity_id": "刀", "attr": "holder", "value": "阿福"}],
        knows=[{"person_id": "阿福", "fact": "刀在抽屉", "certainty": "knows"}],
        visible_to=["阿福"],
    )
    print("canon1", c1.get("id"), "col", col0)

    req(
        "POST",
        "/api/promises",
        {
            "id": "token_due",
            "name": "铜牌三日",
            "related": ["阿禾", "铜牌", "阿莲"],
            "plant_clock": 0,
            "deadline_clock": 180,
        },
    )

    _, col1, c2 = scene(
        "阿莲来找东西",
        "渡口",
        ["阿莲", "阿福"],
        do_text="阿莲翻柜找铜牌，手没碰抽屉。阿福挡在柜台里侧，把油灯往自己这边拨。",
        say_text="阿莲：我的铜牌呢。阿福：没看见。",
        think_text="阿福：别让她开抽屉。阿莲：铜牌不在柜面。",
        value_shift="寻找→落空",
    )
    print("canon2", c2.get("id"), "col", col1)

    # aeon 点条认这场：阿禾在城里等信。并列在阿莲那一列，故事时重叠、人不撞。
    _, col_he, c3 = scene(
        "阿禾在城里等信",
        "城里",
        ["阿禾"],
        do_text="阿禾在城门内来回走，不敢问渡口的事。口袋里没有铜牌。",
        think_text="铜牌若还在渡口，今晚过不了城门。",
        value_shift="等待→焦灼",
        deltas=[{"entity_id": "阿禾", "attr": "where", "value": "城里"}],
        parallel_col=col1,
    )
    print("canon3", c3.get("id"), "col", col_he)

    _, col2, c4 = scene(
        "阿莲连夜赶回城里",
        "城里",
        ["阿莲"],
        value_shift="渡口→城里",
        deltas=[{"entity_id": "阿莲", "attr": "where", "value": "城里"}],
        ellipsis=True,
    )
    print("canon4 ellipsis", c4.get("id"), "col", col2)

    _, col3, c5 = scene(
        "阿福把刀藏进帮里仓",
        "渡口",
        ["阿福"],
        extras=["刀", "渡口帮"],
        do_text="阿福把油布卷紧，从柜台后绕进帮里仓，把刀塞进最底层的网里。",
        think_text="抽屉空了。阿莲再来也翻不到。",
        value_shift="把柄→收藏",
        deltas=[{"entity_id": "刀", "attr": "where", "value": "渡口帮仓"}],
        knows=[{"person_id": "阿福", "fact": "刀在帮里仓", "certainty": "knows"}],
        visible_to=["阿福"],
    )
    print("canon5", c5.get("id"), "col", col3)

    # 正史里也要有「阿禾在城门口等到天亮」，书架 last_intent 另用草稿同句。
    _, col4, c6 = scene(
        DRAFT_INTENT,
        "城里",
        ["阿禾"],
        do_text="阿禾靠着城门洞的墙，看着来人袖口。没有铜牌的人他不敢认。",
        think_text="三日到了没有？阿莲有没有出渡口？",
        value_shift="焦灼→空等",
    )
    print("canon6", c6.get("id"), "col", col4)

    st = state()
    n_cols = len(st.get("columns") or [])
    while n_cols < 7:
        add_empty_column()
        st = state()
        n_cols = len(st.get("columns") or [])
        print("add_column ->", n_cols)
    if n_cols != 7:
        raise SystemExit(f"列数应为 7，得到 {n_cols}")

    cols_sorted = sorted(st.get("columns") or [], key=lambda c: c.get("display_ord", 0))
    hide_col = col3 or (cols_sorted[3]["id"] if len(cols_sorted) > 3 else "col3")
    req(
        "POST",
        "/api/craft",
        {
            "premise": PREMISE,
            "clock_origin_label": "第一天 20:00",
            "chapters": [
                {"id": "ch-drawer", "title": "抽屉", "start_column": col0 or "col0"},
                {"id": "ch-store", "title": "藏仓", "start_column": hide_col},
            ],
        },
    )

    draft_id, draft_col, _ = scene(
        DRAFT_INTENT,
        "城里",
        ["阿禾"],
        do_text="阿禾靠着城门洞的墙，看着来人袖口。没有铜牌的人他不敢认。",
        think_text="三日到了没有？阿莲有没有出渡口？",
        value_shift="焦灼→空等",
        keep_draft=True,
    )
    print("draft", draft_id, "col", draft_col)

    # 打开一次，刷新 meta 列数 / 正史场数。
    req("POST", f"/api/books/{enc(BOOK)}/open", {})
    st = state()
    listing = books()
    item = next((x for x in (listing.get("items") or []) if x.get("name") == BOOK), None) or {}
    committed = st.get("committed") or []
    drafts = st.get("drafts") or []
    entities = {e.get("id") for e in (st.get("all_entities") or st.get("entities") or [])}
    cols = st.get("columns") or []
    craft = req("GET", "/api/craft")
    intents = [b.get("intent") or "" for b in committed]
    want_ent = {"阿禾", "阿福", "阿莲", "渡口", "城里", "刀", "铜牌", "渡口帮", "渡口夜间不得开船"}
    missing = want_ent - entities
    if missing:
        raise SystemExit(f"设定不全 {missing}")
    if len(cols) != 7:
        raise SystemExit(f"列数 {len(cols)} 不是 7")
    if not any("阿禾在城里等信" in i for i in intents):
        raise SystemExit(f"正史缺「阿禾在城里等信」 {intents}")
    if not any(DRAFT_INTENT in i for i in intents):
        raise SystemExit(f"正史缺「{DRAFT_INTENT}」 {intents}")
    if not any((d.get("draft") or {}).get("intent") == DRAFT_INTENT for d in drafts):
        raise SystemExit("没有草稿场「阿禾在城门口等到天亮」")
    if (craft.get("premise") or "") != PREMISE:
        raise SystemExit(f"主脑不对 {craft.get('premise')!r}")
    chap_titles = [c.get("title") for c in (craft.get("chapters") or [])]
    if "抽屉" not in chap_titles or "藏仓" not in chap_titles:
        raise SystemExit(f"章回不对 {chap_titles}")
    last_intent = item.get("last_intent") or ""
    if DRAFT_INTENT not in last_intent:
        raise SystemExit(f"last_intent 应为草稿场：{last_intent!r}")

    summary = {
        "book": st.get("book"),
        "columns": len(cols),
        "committed": len(committed),
        "drafts": len(drafts),
        "intents": intents,
        "draft_intents": [(d.get("draft") or {}).get("intent") for d in drafts],
        "last_intent": last_intent,
        "premise": craft.get("premise"),
        "chapters": chap_titles,
        "entities": sorted(entities),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("FERRY_REBUILD_OK")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
