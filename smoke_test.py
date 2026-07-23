"""Temporary smoke test: exercises the full /generate-design pipeline in-process."""
from __future__ import annotations

import sys
from fastapi.testclient import TestClient

from api.orchestrator import app

PAYLOAD = {
    "prompt": "Diwali sale poster 50% off electronics bold style",
    "brandKit": {
        "primaryColor": "#FF6B00",
        "secondaryColor": "#FFD700",
        "fontFamily": "Arial",
        "logoUrl": "https://example.com/logo.png",
        "tone": "festive",
    },
    "targetSize": {"width": 1080, "height": 1080, "unit": "px"},
    "outputFormat": "svg",
    "sessionHistory": [],
}


def main() -> int:
    client = TestClient(app)
    resp = client.post("/generate-design", json=PAYLOAD)
    print("STATUS:", resp.status_code)
    if resp.status_code != 200:
        print("BODY:", resp.text[:1000])
        return 1
    data = resp.json()
    svg = data["composedSVG"]
    print("requestId:", data["requestId"])
    print("layer count:", len(data["svgLayers"]))
    print("layer roles:", [l["role"] for l in data["svgLayers"]])
    print("backgroundImageUrl prefix:", (data.get("backgroundImageUrl") or "")[:40])
    print("printMeta:", data["printMeta"])
    print("SVG bytes:", len(svg.encode("utf-8")))
    checks = {
        "starts with <svg": svg.lstrip().startswith("<svg"),
        "ends with </svg>": svg.rstrip().endswith("</svg>"),
        "has data-printrocket": 'data-printrocket="true"' in svg,
        "has headline layer": 'data-role="headline"' in svg,
        "has print-marks layer": 'data-role="print-marks"' in svg,
    }
    for k, v in checks.items():
        print(f"  [{'PASS' if v else 'FAIL'}] {k}")
    with open("smoke-response.svg", "w", encoding="utf-8") as f:
        f.write(svg)
    print("Wrote smoke-response.svg")
    return 0 if all(checks.values()) else 2


if __name__ == "__main__":
    sys.exit(main())
