#!/usr/bin/env python3
"""界面交互全面优化：对照方案第 5、8、9 节检查已上线的 HTML + 填场解析。"""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = (ROOT / "apps" / "stripboard" / "index.html").read_text(encoding="utf-8")
FILL = (ROOT / "vendor" / "narra" / "src" / "services" / "fill.rs").read_text(encoding="utf-8")
WORLD = (ROOT / "vendor" / "narra" / "src" / "services" / "world.rs").read_text(encoding="utf-8")


def fail(msg: str) -> None:
    print("FAIL", msg)
    sys.exit(1)


def need(hay: str, needle: str, label: str) -> None:
    if needle not in hay:
        fail(label + " missing: " + needle)


def main() -> None:
    need(HTML, "还没有一场戏。可以先只写人物、地点、规则。", "empty-book")
    need(HTML, "这段故事时间没有戏。空场次 ≠ 省略场。", "empty-col")
    need(HTML, 'data-testid="tracks"', "tracks host")
    need(HTML, "track-block", "track-block css")
    need(HTML, "function renderTracks", "renderTracks")
    need(HTML, 'data-testid="now-human"', "now-human")
    need(HTML, "function renderNow", "renderNow")
    need(HTML, 'data-testid="filter-banner"', "filter-banner")
    need(HTML, "正在只看：", "filter copy")
    need(HTML, "win-box", "window box")
    need(HTML, "cover-dots", "coverage dots")
    need(HTML, "col-lens", "lens bar")
    need(HTML, "card.ellipsis", "ellipsis hatch")
    need(HTML, "card.flashback", "flashback indent")
    need(HTML, "card.off-reader", "off-reader fade")
    need(HTML, "card.draft { border-style: dashed", "draft dashed")
    need(HTML, "concern", "concern cards")
    need(HTML, "dialog[data-wide", "wide confirm")
    need(HTML, "用「", "search create")
    need(HTML, "selectionToMode", "mode machine")
    for name in ["本场", "这场·它", "档案", "这一刻", "写下一场", "新建", "讨论"]:
        need(HTML, name, "mode " + name)
    need(HTML, "fonts.googleapis", "must not") if False else None
    if "fonts.googleapis" in HTML or "cdn.jsdelivr" in HTML:
        fail("CDN/webfont present")
    need(WORLD, "pub struct PersonTrack", "PersonTrack")
    need(WORLD, "pub fn flatten_tracks", "flatten_tracks")
    need(FILL, "tracks", "fill tracks")
    need(FILL, "parse_tracks_flattens_scene_text", "fill track test")
    print("ok structure")

    r = subprocess.run(
        ["cargo", "test", "-q", "--manifest-path", str(ROOT / "vendor" / "narra" / "Cargo.toml"),
         "--lib", "parse_tracks_flattens_scene_text"],
        cwd=ROOT / "vendor" / "narra",
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        print(r.stdout)
        print(r.stderr)
        fail("fill track unit test")
    print("ok fill track unit")
    print("UI_PLAN_OK")


if __name__ == "__main__":
    main()
