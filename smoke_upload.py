"""Temporary smoke test for the /upload-image endpoint."""
from __future__ import annotations

import sys
from fastapi.testclient import TestClient

from api.orchestrator import app


def main() -> int:
    client = TestClient(app)
    with open("smoke-upload.png", "rb") as f:
        files = {"file": ("smoke-upload.png", f, "image/png")}
        resp = client.post("/upload-image", files=files)
    print("STATUS:", resp.status_code)
    if resp.status_code != 200:
        print("BODY:", resp.text[:800])
        return 1
    data = resp.json()
    svg = data["composedSVG"]
    print("requestId:", data["requestId"])
    print("layer roles:", [l["role"] for l in data["svgLayers"]])
    print("data-mode:", "layered-extract" if "layered-extract" in svg else ("overlay-edit" if "overlay-edit" in svg else "?"))
    print("SVG bytes:", len(svg.encode("utf-8")))
    ok = svg.lstrip().startswith("<svg") and svg.rstrip().endswith("</svg>") and 'data-printrocket="true"' in svg
    print("[PASS] valid svg" if ok else "[FAIL] invalid svg")
    with open("smoke-upload-response.svg", "w", encoding="utf-8") as out:
        out.write(svg)
    print("Wrote smoke-upload-response.svg")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
