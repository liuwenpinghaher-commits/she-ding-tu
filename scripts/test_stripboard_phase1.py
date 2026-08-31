#!/usr/bin/env python3
"""Phase 1 stripboard UI: zero-dep parse of the shipped HTML + handler source."""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "apps" / "stripboard" / "index.html"
API_PATH = ROOT / "vendor" / "narra" / "src" / "bin" / "setting_api.rs"
EMPTY = "还没有一场戏。可以先只写人物、地点、规则。"
MODES = ["本场", "这场·它", "档案", "这一刻", "写下一场", "新建", "讨论"]


def fail(msg: str) -> None:
    print("FAIL", msg)
    sys.exit(1)


def main() -> None:
    html = HTML_PATH.read_text(encoding="utf-8")
    api = API_PATH.read_text(encoding="utf-8")

    if EMPTY not in html:
        fail("empty-book sentence missing")
    print("ok empty-book sentence")

    for tid in ('data-testid="write-next"', 'data-testid="commit"', 'data-testid="confirm-change"'):
        if tid not in html:
            fail("missing " + tid)
    print("ok write-next commit confirm-change")

    m = re.search(r"<header\b[^>]*>(.*?)</header>", html, re.S)
    if not m:
        fail("no header")
    header = m.group(1)
    if 'data-testid="write-next"' not in header:
        fail("write-next not in header")
    more_at = header.find('id="more-menu"')
    if more_at < 0:
        fail("more-menu missing")
    for tid, label in (
        ('data-testid="add-column"', "add-column"),
        ('data-testid="plant-promise"', "plant-promise"),
    ):
        pos = header.find(tid)
        if pos < 0:
            fail(label + " missing from more menu")
        if pos < more_at:
            fail(label + " is a header sibling of write-next, not inside more-menu")
    if 'data-testid="place-id"' in header:
        fail("place-id still always-visible in header")
    print("ok header slim / more-menu")

    for var in ("--night", "--panel", "--cream", "--mute", "--line", "--brass", "--warn"):
        if var not in html:
            fail("missing CSS var " + var)
    if "fonts.googleapis" in html or "cdn.jsdelivr" in html:
        fail("CDN/webfont present")
    print("ok theme tokens, no CDN")

    if "selectionToMode" not in html or "renderSide" not in html:
        fail("mode machine functions missing")
    for name in MODES:
        if name not in html:
            fail("mode name missing: " + name)
    print("ok seven modes")

    def inner(tag_id: str) -> str:
        m = re.search(rf'<div id="{tag_id}"[^>]*>(.*?)</div>\s*<div id="mode-', html, re.S)
        if m:
            return m.group(1)
        m = re.search(rf'<div id="{tag_id}"[^>]*>(.*?)</div>\s*</aside>', html, re.S)
        return m.group(1) if m else ""

    write_inner = inner("mode-write")
    talk_inner = inner("mode-talk")
    if 'id="intent"' not in write_inner and 'data-testid="intent"' not in write_inner:
        fail("本场任务/intent not in 写下一场 panel source")
    if 'data-testid="write-box"' not in talk_inner and 'id="write-box"' not in talk_inner:
        fail("写入此框/write-box not in 讨论 panel source")
    scene_open = html.find('id="mode-scene"')
    sidebar_at = html.find('data-testid="sidebar"')
    if sidebar_at < 0:
        fail("sidebar missing")
    if sidebar_at > scene_open and html.find('id="mode-about"') > sidebar_at:
        fail("sidebar still buried in 本场 panel")
    if "parkSharedFields" not in html:
        fail("parkSharedFields missing")
    print("ok intent in write mode, write-box in talk, sidebar visible")

    now = re.search(r'<div id="mode-now"[^>]*>', html)
    if not now:
        fail("mode-now missing")
    if "hidden" not in now.group(0):
        fail("mode-now not hidden by default")
    world = re.search(r'<pre id="world"[^>]*>', html)
    if not world:
        fail("world pre missing")
    # standing default pane is mode-scene; world dump lives only in hidden 这一刻
    scene = re.search(r'<div id="mode-scene"[^>]*>(.*?)</div>\s*<div id="mode-about"', html, re.S)
    if scene and 'id="world"' in scene.group(1):
        fail("world JSON still standing in default 本场 pane")
    print("ok world JSON not default pane")

    if ".card.draft { border-style: dashed" not in html and ".card.draft { border-style: dashed;" not in html.replace("\n", " "):
        if "border-style: dashed" not in html:
            fail("draft cards not dashed")
    print("ok draft dashed / canon solid")

    if 'route("/api/write-next", post(write_next))' not in api:
        fail("write-next route missing")
    if 'route("/api/commit", post(do_commit))' not in api:
        fail("commit route missing")
    if 'route("/api/structure/preview", post(structure_preview))' not in api:
        fail("structure/preview route missing")
    if 'route("/api/structure/confirm", post(structure_confirm))' not in api:
        fail("structure/confirm route missing")
    if "没有本场任务不准写下一场" not in api:
        fail("empty intent still must error")
    print("ok API handlers untouched")

    print("PHASE1_OK")


if __name__ == "__main__":
    main()
