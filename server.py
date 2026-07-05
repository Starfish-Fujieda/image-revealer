#!/usr/bin/env python3
"""Tiny static server for the Slow Reveal app.

Serves this folder plus one JSON endpoint:
    GET /api/images  ->  {"images": ["photo1.jpg", ...]}
which lists the images/ folder so the app never needs a manifest.
"""

import json
import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(ROOT, "images")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path.rstrip("/") == "/api/images":
            try:
                names = sorted(
                    f for f in os.listdir(IMAGES_DIR)
                    if not f.startswith(".")
                    and os.path.splitext(f)[1].lower() in IMAGE_EXTS
                )
            except FileNotFoundError:
                names = []
            body = json.dumps({"images": names}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        # keep the image list and app fresh during a lesson
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the terminal calm


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # no traffic actually sent
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    os.makedirs(IMAGES_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("Slow Reveal is running.")
    print(f"  On this Mac:       http://localhost:{PORT}")
    print(f"  On the Chromebook: http://{lan_ip()}:{PORT}")
    print("Drop photos into images/ and press Refresh in the app. Ctrl-C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
