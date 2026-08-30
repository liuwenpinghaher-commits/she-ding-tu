#!/usr/bin/env python3
"""Serve Narra preview UI. Not 设定图. Not Narra source."""
from __future__ import annotations

import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("NARRA_PREVIEW_PORT", "8766"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def log_message(self, fmt, *args):
        print(f"narra-preview: {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    os.chdir(HERE)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Narra 预览 http://127.0.0.1:{PORT}/")
    print("这是 CLI 快照的网页，不是 Narra 官方 UI，也不是设定图。")
    httpd.serve_forever()
