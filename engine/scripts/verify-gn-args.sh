#!/usr/bin/env bash
#
# verify-gn-args.sh — prove the native and WASM Skia builds are configured
# independently.
#
# The two targets have deliberately different requirements and must not share
# restrictions:
#
#   native  — headless, deterministic raster. No GL (WSL2 has no X display), no
#             fontconfig (the engine owns its fonts), bundled third-party libs so
#             the build never depends on host package versions.
#
#   wasm    — browser GPU path. WebGL2 through Ganesh, Emscripten toolchain,
#             Skia's own CanvasKit configuration.
#
# A native-only restriction leaking into the WASM build would silently disable
# GPU rendering in the browser, so this script prints the RESOLVED value of each
# critical argument (explicit or defaulted) for both output directories and
# checks the ones that matter.
#
# Read-only. Usage: bash engine/scripts/verify-gn-args.sh
#
set -uo pipefail

SKIA_DIR="${SKIA_DIR:-${HOME}/dev/skia}"
NATIVE_OUT="${SKIA_DIR}/out/native-release"
WASM_OUT="${SKIA_DIR}/out/canvaskit_wasm"

ARGS_OF_INTEREST='^(target_cpu|skia_use_gl|skia_use_webgl|skia_use_webgpu|skia_use_vulkan|skia_use_dawn|skia_use_fontconfig|skia_enable_ganesh|skia_enable_graphite|skia_use_freetype|skia_use_harfbuzz|skia_use_icu|skia_enable_skparagraph|skia_enable_skshaper|skia_enable_fontmgr_custom_empty|skia_use_system_libpng|skia_use_system_freetype2|is_official_build|is_trivial_abi|is_canvaskit|skia_enable_pdf) '

failures=0

# gn resolves its source root from the working directory, so every invocation
# must run from inside the Skia checkout.
if [ ! -x "${SKIA_DIR}/bin/gn" ]; then
  printf 'gn not found at %s/bin/gn — run engine/scripts/bootstrap-skia.sh\n' "${SKIA_DIR}" >&2
  exit 1
fi
cd "${SKIA_DIR}" || exit 1

resolved() {
  local out_dir="$1"
  local name="$2"
  "${SKIA_DIR}/bin/gn" args "${out_dir}" --list="${name}" --short 2>/dev/null \
    | head -1 | sed 's/^[^=]*= //'
}

expect() {
  local label="$1"
  local out_dir="$2"
  local name="$3"
  local want="$4"
  local got
  got="$(resolved "${out_dir}" "${name}")"
  if [ "${got}" = "${want}" ]; then
    printf '  ok    %-8s %-38s = %s\n' "${label}" "${name}" "${got}"
  else
    failures=$((failures + 1))
    printf '  FAIL  %-8s %-38s = %s (expected %s)\n' "${label}" "${name}" "${got}" "${want}"
  fi
}

for pair in "native:${NATIVE_OUT}" "wasm:${WASM_OUT}"; do
  label="${pair%%:*}"
  out_dir="${pair#*:}"
  printf '\n=========== resolved args: %s (%s) ===========\n' "${label}" "${out_dir}"
  if [ ! -f "${out_dir}/args.gn" ]; then
    printf '  MISSING — run engine/scripts/bootstrap-skia.sh\n'
    failures=$((failures + 1))
    continue
  fi
  "${SKIA_DIR}/bin/gn" args "${out_dir}" --list --short 2>/dev/null \
    | grep -E "${ARGS_OF_INTEREST}" | sed 's/^/  /'
done

printf '\n=========== assertions ===========\n'

# Native: headless deterministic raster with bundled dependencies.
expect native "${NATIVE_OUT}" skia_use_gl false
expect native "${NATIVE_OUT}" skia_use_vulkan false
expect native "${NATIVE_OUT}" skia_use_fontconfig false
expect native "${NATIVE_OUT}" skia_use_system_libpng false
expect native "${NATIVE_OUT}" skia_use_system_freetype2 false
expect native "${NATIVE_OUT}" skia_enable_fontmgr_custom_empty true
expect native "${NATIVE_OUT}" skia_enable_skparagraph true
expect native "${NATIVE_OUT}" is_official_build true

# WASM: browser GPU path. These are the assertions that catch a native
# restriction leaking across.
expect wasm "${WASM_OUT}" target_cpu '"wasm"'
expect wasm "${WASM_OUT}" skia_use_webgl true
expect wasm "${WASM_OUT}" skia_enable_ganesh true
expect wasm "${WASM_OUT}" skia_use_gl true
expect wasm "${WASM_OUT}" skia_use_fontconfig false
expect wasm "${WASM_OUT}" skia_enable_graphite false
expect wasm "${WASM_OUT}" skia_use_dawn false
expect wasm "${WASM_OUT}" is_trivial_abi true
expect wasm "${WASM_OUT}" is_canvaskit true
expect wasm "${WASM_OUT}" skia_enable_skparagraph true

printf '\n=========== toolchain ===========\n'
native_cc="$(resolved "${NATIVE_OUT}" cc)"
printf '  native cc  = %s\n' "${native_cc}"
wasm_compiler="$(grep -m1 -oE '[^ ]*em\+\+' "${WASM_OUT}/toolchain.ninja" 2>/dev/null \
  || grep -m1 -oE '[^ ]*emcc' "${WASM_OUT}/toolchain.ninja" 2>/dev/null || true)"
if [ -n "${wasm_compiler}" ]; then
  printf '  wasm cxx   = %s\n' "${wasm_compiler}"
  case "${wasm_compiler}" in
    *emsdk*) printf '  ok    wasm uses the vendored Emscripten toolchain\n' ;;
    *) printf '  FAIL  wasm compiler is not from the vendored emsdk\n'; failures=$((failures + 1)) ;;
  esac
else
  printf '  FAIL  could not determine the wasm compiler\n'
  failures=$((failures + 1))
fi

printf '\n%d failure(s)\n\n' "${failures}"
[ "${failures}" -eq 0 ] || exit 1
