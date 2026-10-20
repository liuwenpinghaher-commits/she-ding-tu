#!/usr/bin/env python3
"""8787 入口：转给 setting-api，给书架卡补上最后一场名。"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

UPSTREAM = os.environ.get("SETTING_UPSTREAM", "http://127.0.0.1:8788")
BIND = os.environ.get("SETTING_PROXY_BIND", "127.0.0.1:8790")
DATA = Path(os.environ.get("SETTING_DATA", str(Path(__file__).resolve().parents[1] / "data" / "books")))
HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
}


def scene_name_of(name: str) -> str:
    book = DATA / name
    stored = ""
    mp = book / "meta.json"
    if mp.is_file():
        try:
            stored = str((json.loads(mp.read_text()) or {}).get("last_intent") or "").strip()
        except (OSError, json.JSONDecodeError, TypeError):
            stored = ""
    dp = book / "drafts.json"
    if dp.is_file():
        try:
            raw = json.loads(dp.read_text())
        except (OSError, json.JSONDecodeError):
            raw = []
        if isinstance(raw, list) and raw and isinstance(raw[-1], dict):
            last = raw[-1]
            title = str(last.get("title") or "").strip()
            intent = str((last.get("draft") or {}).get("intent") or "").strip()
            if title and title != "下一场":
                return title
            if intent:
                return intent
    return stored


def inject_books(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload
    items = payload.get("items")
    if not isinstance(items, list):
        return payload
    out = []
    for it in items:
        if not isinstance(it, dict):
            out.append(it)
            continue
        row = dict(it)
        name = str(row.get("name") or "")
        if name:
            row["last_intent"] = scene_name_of(name)
        out.append(row)
    payload = dict(payload)
    payload["items"] = out
    return payload


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        import sys

        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _proxy(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        url = UPSTREAM + self.path
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        headers["Accept-Encoding"] = "identity"
        req = Request(url, data=body if body else None, method=self.command, headers=headers)
        try:
            with urlopen(req, timeout=60) as resp:
                raw = resp.read()
                status = resp.status
                resp_headers = dict(resp.headers.items())
        except HTTPError as e:
            raw = e.read()
            status = e.code
            resp_headers = dict(e.headers.items()) if e.headers else {}
        except URLError as e:
            msg = str(e.reason or e).encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return
        path_only = self.path.split("?", 1)[0]
        if self.command == "GET" and path_only == "/api/books":
            try:
                data = json.loads(raw.decode("utf-8"))
                raw = json.dumps(inject_books(data), ensure_ascii=False).encode("utf-8")
                resp_headers["Content-Type"] = "application/json; charset=utf-8"
            except (UnicodeDecodeError, json.JSONDecodeError):
                pass
        self.send_response(status)
        skip = HOP | {"content-length", "content-encoding", "content-length"}
        for k, v in resp_headers.items():
            if k.lower() in skip:
                continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] != "/api/books":
            msg = b"only /api/books"
            self.send_response(404)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return
        self._proxy()

    def do_POST(self) -> None:
        self._proxy()


def main() -> None:
    host, port_s = BIND.rsplit(":", 1)
    httpd = ThreadingHTTPServer((host, int(port_s)), Handler)
    print(f"last_intent_proxy {BIND} -> {UPSTREAM} data={DATA}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
