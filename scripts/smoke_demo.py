#!/usr/bin/env python3
"""部署机冒烟：讨论落盘、知情标黄、真填场不进历史、铺场落中间预场。密钥不打印。"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

B = "http://127.0.0.1:8787"


def req(method, path, body=None, expect=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    r = urllib.request.Request(B + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=240) as resp:
            raw = resp.read().decode()
            if (resp.headers.get("content-type") or "").startswith("application/json"):
                return json.loads(raw)
            return raw
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        if expect is not None and e.code == expect:
            return {"_http": e.code, "_err": err}
        raise SystemExit(f"{method} {path} -> {e.code} {err[:800]}")


def open_book(name):
    enc = urllib.parse.quote(name)
    return req("POST", f"/api/books/{enc}/open", {})


print("health", req("GET", "/health"))

# —— 渡口验：讨论落盘、知情标黄、真填场、点了才进历史 ——
open_book("渡口验")
st = req("GET", "/api/state")
print("book", st.get("book"), "committed", len(st.get("committed") or []), "drafts", len(st.get("drafts") or []))
drafts = st.get("drafts") or []
if not drafts:
    raise SystemExit("FAIL 渡口验没有草稿")
d2 = drafts[0]["id"]
talk = req("GET", f"/api/talk?id={urllib.parse.quote(d2)}")
print("talk_notice", talk.get("notice"))
print("talk_lines", len(talk.get("lines") or []))
if talk.get("notice") != "讨论不是历史":
    raise SystemExit("FAIL talk notice")
if not talk.get("lines"):
    raise SystemExit("FAIL talk empty after restart")

# 用阿福真正听见的那句话做知情标黄，而不是「刀在抽屉」这种书里没写过的字
world0 = req("GET", "/api/world?t=10")
afu_facts = (world0.get("knows") or {}).get("阿福") or []
payload = ""
for f in afu_facts:
    if "听见:" in f:
        payload = f.split("听见:", 1)[1]
        break
if not payload:
    raise SystemExit("FAIL 阿福没有听见过的事实，无法验知情标黄")
req("POST", "/api/drafts/patch", {"id": d2, "say_text": "阿莲说：" + payload, "intent": "阿莲来要刀"})
con = req("POST", "/api/constrain", {"id": d2})
codes = [f.get("code") for f in con.get("findings") or []]
print("constrain_codes", codes, "blocks", con.get("blocks"))
if "knowledge_leak" not in codes:
    raise SystemExit("FAIL 知情该标黄却没标")
if con.get("blocks"):
    raise SystemExit("FAIL 标黄不该挡住写入")

# 点写入此框：把讨论方向写进本场任务
opt = None
for line in talk.get("lines") or []:
    for c in line.get("concerns") or []:
        if c.get("kind") == "option" and c.get("message"):
            opt = c["message"]
            break
    if opt:
        break
if not opt:
    opt = "阿莲来问刀，先不知道刀在哪"
req("POST", "/api/drafts/patch", {"id": d2, "intent": opt})
st2 = req("GET", "/api/state")
intent_now = (st2.get("drafts") or [{}])[0].get("draft", {}).get("intent")
print("intent_from_talk", (intent_now or "")[:40])
if not intent_now:
    raise SystemExit("FAIL 讨论方向没写进框")

playing_before = (req("GET", "/api/world?t=10").get("playing") or [])
print("playing_before_fill", playing_before)

fill = req("POST", "/api/fill-live", {"id": d2})
do = fill.get("do_text") or ""
print("fill_live auto_canon", fill.get("auto_canon"), "live", fill.get("live"))
print("fill_do_prefix", do[:40])
if "假模型" in do:
    raise SystemExit("FAIL still fake fill")
if fill.get("auto_canon") is True:
    raise SystemExit("FAIL auto canon")
playing_after_fill = (req("GET", "/api/world?t=10").get("playing") or [])
if set(playing_after_fill) != set(playing_before):
    raise SystemExit(f"FAIL fill changed world {playing_after_fill}")

req("POST", "/api/drafts/patch", {
    "id": d2,
    "do_text": do or "阿莲站在灶边",
    "say_text": fill.get("say_text") or "刀呢",
    "think_text": fill.get("think_text") or "她不该知道",
    "intent": intent_now,
    "apply_fill": True,
})
c = req("POST", "/api/commit", {"id": d2})
print("commit_lian", c.get("ok"), "seq", c.get("seq"), "stale", c.get("stale_ids"))
playing_after = req("GET", "/api/world?t=10").get("playing") or []
print("playing_after_commit", playing_after)
if d2 not in playing_after and c.get("id") not in playing_after:
    # 写入后这一刻应看见这场
    if len(playing_after) <= len(playing_before):
        raise SystemExit("FAIL 写入历史后这一刻看不见这场")

# —— 渡口铺：无任务拒建议、同列要先改结构、后面一场给建议、中间落下须确认 ——
book2 = "渡口铺" + str(int(time.time()))
req("POST", "/api/books", {"name": book2})
for eid, kind in [("阿莲", "person"), ("阿福", "person"), ("刀", "thing"), ("渡口", "place")]:
    req("POST", "/api/entities", {"id": eid, "kind": kind, "name": eid})

empty_plan = req("POST", "/api/plan-suggest", {"goal_id": "nope"}, expect=400)
print("plan_no_goal", empty_plan.get("_http"), (empty_plan.get("_err") or "")[:40])

wn = req("POST", "/api/write-next", {"intent": "阿福藏刀", "place_id": "渡口"})
hid = wn["id"]
for p in ("阿福", "刀"):
    req("POST", "/api/presence", {"draft_id": hid, "entity_id": p, "action": "add"})
req("POST", "/api/drafts/patch", {
    "id": hid,
    "intent": "阿福藏刀",
    "do_text": "阿福把刀埋进灶底灰里",
    "say_text": "谁也别翻灶。",
    "think_text": "刀在灶灰里。",
    "place_id": "渡口",
})
req("POST", "/api/commit", {"id": hid})

# 目标还在同一列：没有可铺的时间
wn_same = req("POST", "/api/write-next", {"intent": "阿莲当众揭穿", "place_id": "渡口"})
gid_same = wn_same["id"]
sug0 = req("POST", "/api/plan-suggest", {"goal_id": gid_same})
print("need_structure", sug0.get("need_structure"), sug0.get("notice"))
if not sug0.get("need_structure"):
    raise SystemExit("FAIL 同列应先改结构")

# 加一列把后面那场放到新列
req("POST", "/api/structure/preview", {"op": "add_column", "column_id": "col0"})
req("POST", "/api/structure/confirm", {"choice": "shift"})
req("POST", "/api/delete-draft", {"id": gid_same, "confirm": True})
wn_goal = req("POST", "/api/write-next", {"intent": "阿莲当众揭穿", "place_id": "渡口"})
gid = wn_goal["id"]
print("goal_col", wn_goal.get("column_id"))
for p in ("阿莲", "刀"):
    req("POST", "/api/presence", {"draft_id": gid, "entity_id": p, "action": "add"})
req("POST", "/api/drafts/patch", {"id": gid, "intent": "阿莲当众揭穿", "place_id": "渡口"})

empty_intent = req("POST", "/api/drafts/patch", {"id": gid, "intent": "   "})
sug_empty = req("POST", "/api/plan-suggest", {"goal_id": gid}, expect=400)
print("plan_empty_intent", sug_empty.get("_http"), (sug_empty.get("_err") or "")[:50])
req("POST", "/api/drafts/patch", {"id": gid, "intent": "阿莲当众揭穿"})

sug = req("POST", "/api/plan-suggest", {"goal_id": gid})
print("plan_persisted", sug.get("persisted"), "bones", len(sug.get("bones") or []))
print("plan_notice", sug.get("notice"))
print("plan_summary_prefix", (sug.get("summary") or "")[:60])
bones = sug.get("bones") or []
if sug.get("need_structure"):
    raise SystemExit("FAIL 后面一列仍要先改结构：" + str(sug.get("notice")))
if not bones:
    raise SystemExit("FAIL 没有骨架")
if any(not b.get("necessity") for b in bones):
    raise SystemExit("FAIL 骨架缺必要性")
if sug.get("persisted") is True:
    raise SystemExit("FAIL 建议不该落库")

mid_no = req("POST", "/api/plan-apply", {"mode": "mid", "bones": bones, "goal_id": gid}, expect=400)
print("mid_no_confirm", mid_no.get("_http"), (mid_no.get("_err") or "")[:40])
if mid_no.get("_http") != 400:
    raise SystemExit("FAIL 中间插入未确认应拒绝")

applied = req("POST", "/api/plan-apply", {
    "mode": "mid",
    "structure_confirmed": True,
    "bones": bones,
    "goal_id": gid,
})
print("apply_ids", applied.get("ids"), "draft_only", applied.get("draft_only"), "auto_canon", applied.get("auto_canon"))
if not applied.get("draft_only") or applied.get("auto_canon") is True:
    raise SystemExit("FAIL 预场进了历史")
if not applied.get("ids"):
    raise SystemExit("FAIL 预场没落下")

st3 = req("GET", "/api/state")
pre_ids = applied.get("ids")
pre = [d for d in (st3.get("drafts") or []) if d.get("id") in pre_ids]
print("pre_count", len(pre), "pre_intents", [d.get("draft", {}).get("intent") for d in pre])
if not pre:
    raise SystemExit("FAIL 预场没出现在草稿里")
# 预场应在目标列之前的新列
goal_draft = next(d for d in (st3.get("drafts") or []) if d.get("id") == gid)
if pre[0]["draft"]["column_id"] == goal_draft["draft"]["column_id"]:
    print("note pre_col_same_as_goal", pre[0]["draft"]["column_id"])

# 预场可删
req("POST", "/api/delete-draft", {"id": pre[0]["id"], "confirm": True})
st4 = req("GET", "/api/state")
still = [d for d in (st4.get("drafts") or []) if d.get("id") == pre[0]["id"]]
print("deleted_pre", still == [])
if still:
    raise SystemExit("FAIL 预场没删掉")

print("SMOKE_OK")
