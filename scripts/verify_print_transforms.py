"""Does the print-export pass preserve gesture-committed matrices?

Run:  venv\\Scripts\\python.exe scripts\\verify_print_transforms.py

`services.svg.apply_print_meta` is the only backend stage that touches an
already-composed Canonical_SVG, and it is what every print export goes through
(`api/orchestrator.py` -> `POST /export-print`). The editor commits transforms as
`matrix(a b c d e f)` rather than appending `rotate(deg cx cy)`, so a print pass
that reformatted, dropped or partially rewrote a matrix would move every rotated
object on the printed sheet while leaving the on-screen document correct.

There is no pytest suite in this repository, so this is a standalone script with a
nonzero exit status on failure — runnable by hand and by CI without adding a test
framework to a backend that has none.

What is deliberately NOT asserted: that `hex_to_cmyk_safe` changes the colours. It
is an RGB -> CMYK -> RGB round-trip, which for any in-gamut sRGB hex is the identity
up to integer rounding, so it is a no-op on well-formed input by construction. The
useful properties are that it preserves colours rather than corrupting them, and
that a second export of an already-exported file does not drift the palette.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.svg import apply_print_meta  # noqa: E402

MATRIX_ROTATE = "matrix(0.9659258263 0.2588190451 -0.2588190451 0.9659258263 12.5 -8.25)"
MATRIX_FLIP = "matrix(-1.5 0 0 2.25 -0.0625 480)"

COMPOSED = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" '
    'data-printrocket="true" data-version="1.0">'
    "<defs></defs>"
    '<g data-role="shapes" data-editable="true" data-layer-id="shapes" '
    f'transform="{MATRIX_ROTATE}">'
    '<rect data-field="shape" data-element-id="box-1" x="10" y="20" width="200" '
    'height="100" fill="#FF6B00"/>'
    "</g>"
    '<g data-role="headline" data-editable="true" data-layer-id="headline">'
    f'<text data-field="headline" x="540" y="80" fill="#123456" '
    f'transform="{MATRIX_FLIP}">50% OFF</text>'
    "</g>"
    '<g data-role="print-marks" data-editable="false" data-layer-id="print-marks" '
    'visibility="hidden"></g>'
    "</svg>"
)

failures: list[str] = []


def check(label: str, condition: bool) -> None:
    print(f"[{'ok  ' if condition else 'FAIL'}] {label}")
    if not condition:
        failures.append(label)


try:
    printed = apply_print_meta(COMPOSED, 3.0)
except Exception as exc:  # noqa: BLE001 - surface the failure, never mask it
    print(f"[FAIL] apply_print_meta raised: {exc!r}")
    sys.exit(1)

check("rotation matrix survives byte-for-byte", MATRIX_ROTATE in printed)
check("flip/scale matrix survives byte-for-byte", MATRIX_FLIP in printed)
check("no matrix component was reformatted", printed.count("matrix(") == 2)
check("bleed metadata was injected", "bleed-box: 3mm" in printed)
check("trim marks were injected", "trim-marks" in printed)
check("output still has exactly one root svg", printed.count("<svg") == 1)
check("shape fill is preserved, not corrupted", "#FF6B00" in printed)
check("text fill is preserved, not corrupted", "#123456" in printed)
check("print pass is idempotent", apply_print_meta(printed, 3.0) == printed)

# The CMYK rewrite matches `#[0-9a-fA-F]{6}` with no boundary check, so an id whose
# first six characters were all hex WOULD be rewritten and the reference broken. Every
# id this codebase generates is prefixed (`printrocket-`, `gradient-`), which is what
# makes that safe — so the prefixes are asserted rather than assumed.
ID_SVG = COMPOSED.replace(
    'fill="#FF6B00"',
    'fill="url(#printrocket-gradient-1a2b3c)" clip-path="url(#printrocket-clip-61-62)"',
)
printed_ids = apply_print_meta(ID_SVG, 3.0)
check("gradient id reference is untouched", "url(#printrocket-gradient-1a2b3c)" in printed_ids)
check("clip-path id reference is untouched", "url(#printrocket-clip-61-62)" in printed_ids)

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    sys.exit(1)
print("all print-transform checks passed")
