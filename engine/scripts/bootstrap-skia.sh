#!/usr/bin/env bash
#
# bootstrap-skia.sh — provision and build Skia for the Pydee engine.
#
# Runs inside WSL2 Ubuntu. Idempotent: every stage is skipped when it is already
# satisfied, so it is safe to re-run after a failure or a reboot.
#
# Stages:
#   1. Verify host prerequisites (Linux, non-root, disk space, RAM).
#   2. Install the apt build toolchain.
#   3. Clone Skia and PIN it to an exact commit (recorded in engine/skia.revision).
#   4. Sync Skia's third-party deps. This also activates Skia's own vendored
#      Emscripten SDK, which is the ONLY emsdk we use — a separately installed
#      emsdk would drift from the version Skia's wasm libs were built with.
#   5. Build native static libs (Linux/clang) for engine unit tests + profiling.
#   6. Build Skia's own CanvasKit as a WASM baseline. This proves the whole
#      Emscripten toolchain works end to end BEFORE we introduce our own
#      bindings, and produces the wasm static libs our engine links against.
#   7. Report artifact locations and real measured sizes.
#
# Deliberately NOT installed: depot_tools (git clone + tools/git-sync-deps is
# sufficient; gclient/git-cl are not used) and bazelisk (only needed to
# regenerate Skia's own BUILD.bazel files, which we never modify).
#
# Usage:
#   bash engine/scripts/bootstrap-skia.sh
#   SKIA_REF=origin/main JOBS=8 bash engine/scripts/bootstrap-skia.sh
#
set -euo pipefail

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REVISION_FILE="${REPO_ROOT}/engine/skia.revision"
ARTIFACT_DIR="${REPO_ROOT}/engine/artifacts"

SKIA_DIR="${SKIA_DIR:-${HOME}/dev/skia}"
SKIA_REPO="${SKIA_REPO:-https://skia.googlesource.com/skia.git}"
SKIA_REF="${SKIA_REF:-origin/main}"

# Linking Skia is memory-hungry. This machine has ~16 GB total and WSL2 is
# capped below that, so default to fewer jobs than logical cores to avoid the
# OOM killer terminating wasm-ld halfway through a 40-minute build.
JOBS="${JOBS:-8}"

NATIVE_OUT="${SKIA_DIR}/out/native-release"
WASM_OUT_DIR="${SKIA_DIR}/out/canvaskit_wasm"

REQUIRED_FREE_GB="${REQUIRED_FREE_GB:-35}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\n\033[1;33m[warn] %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m[fail] %s\033[0m\n' "$*" >&2; exit 1; }

# Retry a command with exponential backoff.
#
# Skia's dependency sync fans out to many googlesource.com repositories at once
# and anonymous access is rate limited server-side, so HTTP 429
# ("Short term server-time rate limit exceeded") is expected rather than
# exceptional on a first sync. Every operation wrapped here is idempotent and
# resumable: already-fetched repositories are skipped, so each attempt makes
# forward progress instead of restarting from zero.
#
# Usage: retry <max_attempts> <initial_delay_seconds> <description> <command...>
retry() {
  local max_attempts="$1"; shift
  local delay="$1"; shift
  local description="$1"; shift
  local attempt=1

  while true; do
    if "$@"; then
      [ "${attempt}" -gt 1 ] && info "${description}: succeeded on attempt ${attempt}."
      return 0
    fi
    if [ "${attempt}" -ge "${max_attempts}" ]; then
      warn "${description}: giving up after ${max_attempts} attempts."
      return 1
    fi
    warn "${description}: attempt ${attempt}/${max_attempts} failed. Waiting ${delay}s before retrying (partial progress is kept)."
    sleep "${delay}"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
    [ "${delay}" -gt 600 ] && delay=600
  done
}

# --------------------------------------------------------------------------- #
# Stage 1 — host prerequisites
# --------------------------------------------------------------------------- #

stage_prereqs() {
  log "Stage 1/7  Verifying host"

  [ "$(uname -s)" = "Linux" ] \
    || die "This script must run inside WSL2 Ubuntu, not Windows. Open the Ubuntu shell first."
  [ "$(id -u)" -ne 0 ] \
    || die "Do not run as root. Skia's sync step must not create root-owned files in \$HOME."

  local free_gb
  free_gb="$(df -BG --output=avail "${HOME}" | tail -1 | tr -dc '0-9')"
  info "Free space in \$HOME: ${free_gb} GB (need ~${REQUIRED_FREE_GB} GB)"
  [ "${free_gb}" -ge "${REQUIRED_FREE_GB}" ] \
    || die "Not enough free space. Free up space or move \$HOME to a larger volume."

  local total_ram_mb
  total_ram_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
  info "RAM available to WSL2: ${total_ram_mb} MB"
  info "Parallel build jobs: ${JOBS}"
  if [ "${total_ram_mb}" -lt 8000 ]; then
    warn "Under 8 GB is tight for linking Skia. Raise 'memory=' in C:\\Users\\<you>\\.wslconfig, then 'wsl --shutdown'."
  fi

  info "CPU threads: $(nproc)"
}

# --------------------------------------------------------------------------- #
# Stage 2 — apt toolchain
# --------------------------------------------------------------------------- #

stage_apt() {
  log "Stage 2/7  Installing apt build toolchain"

  # Skia requires a C++20-capable compiler and recommends Clang. Ninja and GN
  # are fetched from the Skia tree itself in stage 4, not from apt, so the
  # versions always match the pinned revision.
  local packages=(
    build-essential   # C/C++ toolchain + make
    clang             # Skia's recommended compiler
    lld               # fast linker, needed for large static libs
    git
    python3           # tools/git-sync-deps, bin/fetch-gn, bin/fetch-ninja
    curl
    unzip
    ccache            # makes rebuilds after a Skia bump minutes instead of an hour
    pkg-config
    brotli            # measures the real compressed size of the shipped wasm
    cmake             # builds the Pydee engine itself (engine/CMakeLists.txt)
    ninja-build       # generator used for the engine build
  )

  local missing=()
  for package in "${packages[@]}"; do
    dpkg -s "${package}" >/dev/null 2>&1 || missing+=("${package}")
  done

  if [ "${#missing[@]}" -eq 0 ]; then
    info "All packages already present; skipping apt."
    return
  fi

  info "Installing: ${missing[*]}"
  sudo apt-get update -y
  sudo apt-get install -y "${missing[@]}"
}

# --------------------------------------------------------------------------- #
# Stage 3 — clone and pin Skia
# --------------------------------------------------------------------------- #

stage_clone() {
  log "Stage 3/7  Cloning and pinning Skia"

  if [ ! -d "${SKIA_DIR}/.git" ]; then
    info "Cloning into ${SKIA_DIR} (this downloads a few GB)"
    mkdir -p "$(dirname "${SKIA_DIR}")"
    retry 5 30 "git clone skia" git clone "${SKIA_REPO}" "${SKIA_DIR}" \
      || die "Could not clone Skia after repeated attempts. Check connectivity and re-run."
  else
    info "Existing checkout found at ${SKIA_DIR}"
  fi

  cd "${SKIA_DIR}"
  retry 5 30 "git fetch skia" git fetch --tags origin \
    || die "Could not fetch from ${SKIA_REPO}."

  local pinned
  if [ -f "${REVISION_FILE}" ]; then
    # Reproducible path: every later run rebuilds the exact same Skia.
    pinned="$(tr -d '[:space:]' < "${REVISION_FILE}")"
    info "Using pinned revision from engine/skia.revision: ${pinned}"
  else
    # First run: resolve the requested ref to a concrete commit and record it,
    # so the pin reflects reality instead of a hardcoded guess.
    pinned="$(git rev-parse "${SKIA_REF}")"
    mkdir -p "$(dirname "${REVISION_FILE}")"
    printf '%s\n' "${pinned}" > "${REVISION_FILE}"
    info "Pinned ${SKIA_REF} -> ${pinned}"
    info "Recorded in engine/skia.revision (commit this file)."
  fi

  git checkout --detach "${pinned}"
  info "HEAD is now $(git rev-parse --short HEAD)"
}

# --------------------------------------------------------------------------- #
# Stage 4 — third-party deps, GN, Ninja, vendored emsdk
# --------------------------------------------------------------------------- #

stage_sync() {
  log "Stage 4/7  Syncing Skia dependencies (includes its vendored emsdk)"
  cd "${SKIA_DIR}"

  # Anonymous googlesource.com access is rate limited and this step fetches
  # dozens of repositories, so HTTP 429 on a first sync is normal. Each retry
  # resumes: repositories already present are skipped. Waits start at 60s and
  # double, so a transient network outage is waited out rather than aborting.
  retry 10 60 "git-sync-deps" python3 tools/git-sync-deps \
    || die "git-sync-deps could not complete. Re-run this script later; every synced dependency is kept."

  retry 5 20 "fetch-gn" python3 bin/fetch-gn || die "Could not fetch GN."
  retry 5 20 "fetch-ninja" python3 bin/fetch-ninja || die "Could not fetch Ninja."

  [ -x "${SKIA_DIR}/bin/gn" ] || die "bin/gn missing after fetch-gn."

  if [ -d "${SKIA_DIR}/third_party/externals/emsdk" ]; then
    info "Vendored emsdk present at third_party/externals/emsdk"
  else
    warn "Vendored emsdk not found. Trying bin/activate-emsdk explicitly."
    python3 bin/activate-emsdk \
      || die "Could not activate Skia's emsdk; the wasm stage cannot proceed."
  fi
}

# --------------------------------------------------------------------------- #
# Stage 5 — native static libraries
# --------------------------------------------------------------------------- #

stage_native() {
  log "Stage 5/7  Building native Skia (Linux/clang, official build)"
  cd "${SKIA_DIR}"

  # `is_official_build=true` is Skia's optimized configuration; the default
  # developer build is intentionally unoptimized with full debug symbols.
  # Bundled third-party libs are used so the build does not depend on whatever
  # versions happen to be installed on the host.
  #
  # skia_use_fontconfig=false is deliberate and architectural, not a shortcut to
  # avoid installing libfontconfig1-dev. The browser/WASM target has no system
  # font enumeration, so the engine owns a font registry fed with explicit font
  # binaries. If the native build resolved fonts through the host's fontconfig,
  # native rendering tests and golden images would depend on whichever fonts
  # happen to be installed, and would diverge from CI and from the browser.
  # Both targets therefore use explicitly registered fonts via FreeType.
  #
  # skia_use_gl=false is also deliberate. Skia's native Linux GPU backend
  # defaults to desktop GL through GLX, which needs system OpenGL headers. This
  # WSL2 instance has no X display, so that backend would be unusable even if it
  # compiled. The native build exists for engine unit tests, deterministic
  # golden-image rendering and profiling, which is exactly what the raster
  # backend provides (spec §42: always retain a software path for testing,
  # deterministic output and headless rendering). The browser target reaches the
  # GPU through WebGL2 in the separate Emscripten build, which is unaffected.
  # A native GPU backend for a desktop shell would use Vulkan, not GLX, and is a
  # deferred milestone.
  #
  # cc_wrapper="ccache" makes re-runs after a Skia bump or an args change take
  # minutes instead of restarting a full compile.
  #
  # If any argument name is wrong for the pinned revision, `gn gen` fails with
  # an explicit error rather than silently ignoring it — that is the intended
  # verification behaviour.
  # NOTE: no comments inside the heredoc below. The args are flattened to a
  # single line, so a '#' would comment out every argument after it and silently
  # revert the build to GCC and system libraries.
  #
  # skia_enable_fontmgr_custom_empty/embedded: the engine loads font binaries
  # explicitly, because the browser gives WASM no system font enumeration. Both
  # targets must use the data-backed font managers or text would render
  # differently between them.
  local gn_args
  gn_args=$(cat <<'ARGS'
is_official_build=true
skia_enable_tools=false
skia_enable_svg=true
skia_enable_skottie=true
skia_enable_skshaper=true
skia_enable_skparagraph=true
skia_enable_skunicode=true
skia_enable_fontmgr_custom_empty=true
skia_enable_fontmgr_custom_embedded=true
skia_use_freetype=true
skia_use_harfbuzz=true
skia_use_icu=true
skia_use_fontconfig=false
skia_use_gl=false
skia_use_egl=false
skia_use_vulkan=false
skia_use_system_freetype2=false
skia_use_system_harfbuzz=false
skia_use_system_icu=false
skia_use_system_libjpeg_turbo=false
skia_use_system_libpng=false
skia_use_system_libwebp=false
skia_use_system_zlib=false
skia_use_system_expat=false
cc="clang"
cxx="clang++"
cc_wrapper="ccache"
ARGS
)
  # Drop comment lines defensively before flattening, so adding one later cannot
  # silently disable every argument that follows it.
  gn_args="$(printf '%s' "${gn_args}" | grep -v '^[[:space:]]*#' | tr '\n' ' ')"

  info "gn gen ${NATIVE_OUT}"
  ./bin/gn gen "${NATIVE_OUT}" --args="${gn_args}"

  # Resolve the Ninja that Skia fetched rather than assuming a path, and fail
  # loudly if it is somewhere else in this revision.
  local ninja_bin=""
  for candidate in "third_party/ninja/ninja" "bin/ninja" "third_party/externals/ninja/ninja"; do
    if [ -x "${SKIA_DIR}/${candidate}" ]; then
      ninja_bin="${SKIA_DIR}/${candidate}"
      break
    fi
  done
  [ -n "${ninja_bin}" ] \
    || die "Could not locate the Ninja fetched by bin/fetch-ninja. Inspect ${SKIA_DIR} and update this script."
  info "ninja: ${ninja_bin}"

  info "ninja -j${JOBS} (this takes roughly 15-30 minutes on 12 threads)"
  # Build the default target set, not just `skia`. Naming only the `skia` target
  # produces libskia.a alone and silently omits the module libraries
  # (skparagraph, skshaper, skunicode, skottie, svg) that the engine's text and
  # animation tests link against.
  "${ninja_bin}" -C "${NATIVE_OUT}" -j"${JOBS}"

  [ -f "${NATIVE_OUT}/libskia.a" ] \
    || die "Native build finished but libskia.a is missing at ${NATIVE_OUT}."
  info "Built $(du -h "${NATIVE_OUT}/libskia.a" | cut -f1) libskia.a"
}

# --------------------------------------------------------------------------- #
# Stage 6 — WASM baseline via Skia's own CanvasKit build
# --------------------------------------------------------------------------- #

stage_wasm() {
  log "Stage 6/7  Building CanvasKit WASM baseline"
  cd "${SKIA_DIR}"

  local compile_script="modules/canvaskit/compile.sh"
  [ -f "${compile_script}" ] \
    || die "${compile_script} not found in the pinned revision; inspect modules/canvaskit before continuing."

  # emsdk_env.sh dereferences unset variables and returns non-zero in normal
  # operation, so `set -euo pipefail` must be relaxed just for the source.
  local emsdk_env="${SKIA_DIR}/third_party/externals/emsdk/emsdk_env.sh"
  [ -f "${emsdk_env}" ] || die "Vendored emsdk env script missing at ${emsdk_env}."
  set +eu
  # shellcheck disable=SC1090,SC1091
  source "${emsdk_env}" >/dev/null 2>&1
  set -eu

  info "emcc: $(command -v emcc || echo 'NOT FOUND')"
  command -v emcc >/dev/null \
    || die "emcc unavailable after sourcing ${emsdk_env}. Re-run stage 4 (git-sync-deps)."

  # We build Skia's own CanvasKit first, on purpose. It is the known-good
  # reference configuration: if this succeeds, the toolchain, the vendored
  # emsdk, the GPU/WebGL2 backend and the paragraph/shaping modules are all
  # working, and only OUR bindings remain to be added in the next milestone.
  info "Running ${compile_script} (expect 25-45 minutes)"
  bash "${compile_script}" \
    || die "CanvasKit build failed. Re-run this script; ccache makes the retry much faster."

  local wasm_file
  wasm_file="$(find "${SKIA_DIR}/out" -name 'canvaskit.wasm' -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2- || true)"
  [ -n "${wasm_file}" ] || die "Build reported success but no canvaskit.wasm was produced."
  info "Produced ${wasm_file}"
}

# --------------------------------------------------------------------------- #
# Stage 7 — collect artifacts and report measured sizes
# --------------------------------------------------------------------------- #

stage_report() {
  log "Stage 7/7  Collecting artifacts"
  mkdir -p "${ARTIFACT_DIR}"

  local wasm_file js_file
  wasm_file="$(find "${SKIA_DIR}/out" -name 'canvaskit.wasm' -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2- || true)"
  js_file="$(find "${SKIA_DIR}/out" -name 'canvaskit.js' -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2- || true)"

  if [ -n "${wasm_file}" ]; then
    cp "${wasm_file}" "${ARTIFACT_DIR}/"
    [ -n "${js_file}" ] && cp "${js_file}" "${ARTIFACT_DIR}/"

    local raw brotli
    raw="$(stat -c '%s' "${ARTIFACT_DIR}/canvaskit.wasm")"
    brotli="$(brotli -c -q 11 "${ARTIFACT_DIR}/canvaskit.wasm" 2>/dev/null | wc -c || echo 0)"
    info "canvaskit.wasm raw:    $((raw / 1024)) KB"
    if [ "${brotli}" -gt 0 ]; then
      info "canvaskit.wasm brotli: $((brotli / 1024)) KB  <-- the real shipped cost"
    else
      info "Install 'brotli' to measure the compressed shipped size."
    fi
  fi

  log "Done"
  info "Skia checkout   : ${SKIA_DIR}"
  info "Pinned revision : $(tr -d '[:space:]' < "${REVISION_FILE}")"
  info "Native libs     : ${NATIVE_OUT}"
  info "WASM artifacts  : ${ARTIFACT_DIR}"
  info "Disk used by Skia: $(du -sh "${SKIA_DIR}" 2>/dev/null | cut -f1)"
  printf '\n'
  info "Next milestone: link engine/ sources against these libs with our own"
  info "bindings, exposing the Pydee scene API instead of CanvasKit's JS API."
}

main() {
  log "Pydee engine :: Skia bootstrap"
  info "Repo root: ${REPO_ROOT}"
  stage_prereqs
  stage_apt
  stage_clone
  stage_sync
  stage_native
  stage_wasm
  stage_report
}

main "$@"
