#!/usr/bin/env bash
#
# build-engine.sh — configure, build and test the native Pydee engine.
#
# Requires that engine/scripts/bootstrap-skia.sh has already produced the Skia
# static libraries. Needs no root.
#
# The build directory lives on the Linux filesystem, not under /mnt/h: compiling
# across the Windows drive mount is dramatically slower, and the outputs are
# reproducible artifacts rather than source.
#
# Usage:
#   bash engine/scripts/build-engine.sh            # configure + build + test
#   CLEAN=1 bash engine/scripts/build-engine.sh    # discard the build dir first
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_DIR="${BUILD_DIR:-${HOME}/pydee-engine-build}"
SKIA_DIR="${SKIA_DIR:-${HOME}/dev/skia}"
BUILD_TYPE="${BUILD_TYPE:-Release}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\n\033[1;31m[fail] %s\033[0m\n' "$*" >&2; exit 1; }

command -v cmake >/dev/null || die "cmake not installed. Run engine/scripts/preflight.sh."
command -v ninja >/dev/null || die "ninja not installed. Run engine/scripts/preflight.sh."
[ -f "${SKIA_DIR}/out/native-release/libskia.a" ] \
  || die "Skia native libs missing. Run: bash engine/scripts/bootstrap-skia.sh"

if [ "${CLEAN:-0}" = "1" ]; then
  log "Removing ${BUILD_DIR}"
  rm -rf "${BUILD_DIR}"
fi

log "Configuring (${BUILD_TYPE})"
cmake -S "${REPO_ROOT}/engine" -B "${BUILD_DIR}" -G Ninja \
  -DCMAKE_BUILD_TYPE="${BUILD_TYPE}" \
  -DSKIA_DIR="${SKIA_DIR}"

log "Building"
cmake --build "${BUILD_DIR}"

log "Running engine tests"
"${BUILD_DIR}/pydee_engine_tests"

log "Done"
info "Static library : ${BUILD_DIR}/libpydee_engine.a"
info "Test binary    : ${BUILD_DIR}/pydee_engine_tests"
