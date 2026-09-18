#!/usr/bin/env bash
#
# build-engine-wasm.sh — compile the Pydee engine to WebAssembly.
#
# Uses Skia's OWN vendored Emscripten SDK from third_party/externals/emsdk. That
# is deliberate: the Skia wasm static libraries we link against were compiled
# with exactly that SDK, and linking objects built by a different emsdk version
# is a silent ABI mismatch waiting to happen.
#
# Requires that bootstrap-skia.sh has produced out/canvaskit_wasm. Needs no root.
#
# Usage:
#   bash engine/scripts/build-engine-wasm.sh
#   CLEAN=1 bash engine/scripts/build-engine-wasm.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKIA_DIR="${SKIA_DIR:-${HOME}/dev/skia}"
BUILD_DIR="${BUILD_DIR:-${HOME}/pydee-engine-wasm-build}"
ARTIFACT_DIR="${REPO_ROOT}/engine/artifacts"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\n\033[1;31m[fail] %s\033[0m\n' "$*" >&2; exit 1; }

[ -d "${SKIA_DIR}/out/canvaskit_wasm" ] \
  || die "Skia wasm build missing. Run: bash engine/scripts/bootstrap-skia.sh"
[ -f "${SKIA_DIR}/out/canvaskit_wasm/libskia.a" ] \
  || die "libskia.a for wasm not found in ${SKIA_DIR}/out/canvaskit_wasm"

log "Activating Skia's vendored Emscripten SDK"
EMSDK_ENV="${SKIA_DIR}/third_party/externals/emsdk/emsdk_env.sh"
[ -f "${EMSDK_ENV}" ] || die "Vendored emsdk env script missing at ${EMSDK_ENV}"

# emsdk_env.sh dereferences unset variables and returns non-zero in normal
# operation, so strict mode has to be relaxed just for the source.
set +eu
# shellcheck disable=SC1090,SC1091
source "${EMSDK_ENV}" >/dev/null 2>&1
set -eu

command -v emcc >/dev/null || die "emcc not on PATH after activating emsdk."
command -v emcmake >/dev/null || die "emcmake not on PATH after activating emsdk."
info "emcc: $(emcc --version | head -1)"

if [ "${CLEAN:-0}" = "1" ]; then
  log "Removing ${BUILD_DIR}"
  rm -rf "${BUILD_DIR}"
fi

log "Configuring with the Emscripten toolchain"
emcmake cmake -S "${REPO_ROOT}/engine" -B "${BUILD_DIR}" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DSKIA_DIR="${SKIA_DIR}"

log "Building pydee-engine.wasm"
BUILD_LOG="${BUILD_DIR}/build-output.log"
cmake --build "${BUILD_DIR}" 2>&1 | tee "${BUILD_LOG}"

# A wasm-ld signature mismatch means our translation units disagree with Skia's
# about a function's ABI, which is undefined behaviour at the call site rather
# than a cosmetic warning. Treat it as a build failure so it can never ship.
if grep -q 'signature mismatch' "${BUILD_LOG}"; then
  printf '\n'
  grep -A2 'signature mismatch' "${BUILD_LOG}" || true
  die "ABI signature mismatch against Skia. Compile flags/defines must match the Skia wasm build."
fi

WASM_FILE="${BUILD_DIR}/pydee-engine.wasm"
JS_FILE="${BUILD_DIR}/pydee-engine.mjs"
[ -f "${WASM_FILE}" ] || die "Build finished but ${WASM_FILE} is missing."
[ -f "${JS_FILE}" ] || die "Build finished but ${JS_FILE} is missing."

log "Collecting artifacts"
mkdir -p "${ARTIFACT_DIR}"
cp "${WASM_FILE}" "${JS_FILE}" "${ARTIFACT_DIR}/"

# Publish a font alongside the module.
#
# The engine draws no text until a font is registered, because the browser gives
# WASM no system font enumeration. Rather than commit a binary, take the one from
# the pinned Skia checkout: it is the same font the engine tests use, so the
# browser overlay and the test suites all shape text with identical data.
#
# A real per-family font pipeline is a later milestone; this makes text visible
# and measurable now, and the overlay reports any family it could not resolve.
TEST_FONT="${SKIA_DIR}/resources/fonts/Roboto-Regular.ttf"
if [ -f "${TEST_FONT}" ]; then
  mkdir -p "${ARTIFACT_DIR}/fonts"
  cp "${TEST_FONT}" "${ARTIFACT_DIR}/fonts/"
  info "Published font: $(basename "${TEST_FONT}")"
else
  die "Font not found at ${TEST_FONT}; text could not be verified or rendered."
fi

# Also publish into the frontend's static directory so Vite can serve the module
# at /engine/... for the flag-gated Skia renderer. These are build outputs and
# are gitignored; the editor degrades to the SVG renderer when they are absent.
PUBLIC_DIR="${REPO_ROOT}/frontend/public/engine"
mkdir -p "${PUBLIC_DIR}/fonts"
cp "${WASM_FILE}" "${JS_FILE}" "${PUBLIC_DIR}/"
cp "${TEST_FONT}" "${PUBLIC_DIR}/fonts/"
info "Published to frontend/public/engine/"

RAW_BYTES="$(stat -c '%s' "${ARTIFACT_DIR}/pydee-engine.wasm")"
BROTLI_BYTES="$(brotli -c -q 11 "${ARTIFACT_DIR}/pydee-engine.wasm" 2>/dev/null | wc -c || echo 0)"

# Verify the module actually runs. Uses the Node that ships with Skia's vendored
# emsdk, so no separate Node installation is required and the runtime matches the
# toolchain that produced the module.
log "Running headless smoke test"
NODE_BIN="$(find "${SKIA_DIR}/third_party/externals/emsdk/node" -maxdepth 3 -name node -type f 2>/dev/null | head -1)"
if [ -n "${NODE_BIN}" ]; then
  info "node: ${NODE_BIN}"
  "${NODE_BIN}" "${REPO_ROOT}/engine/tests/wasm_smoke_test.mjs" \
    || die "The module built but failed its smoke test."
else
  die "No Node found in the vendored emsdk; cannot verify the module runs."
fi

log "Done"
info "pydee-engine.wasm raw:    $((RAW_BYTES / 1024)) KB"
if [ "${BROTLI_BYTES}" -gt 0 ]; then
  info "pydee-engine.wasm brotli: $((BROTLI_BYTES / 1024)) KB  <-- shipped cost"
fi
info "Artifacts: ${ARTIFACT_DIR}"
