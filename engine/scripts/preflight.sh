#!/usr/bin/env bash
#
# preflight.sh — report whether this WSL2 host is ready to build Skia.
#
# Read-only: installs nothing, downloads nothing, needs no password. Run it
# before bootstrap-skia.sh to see exactly what is missing.
#
# The important output is the apt line at the end. `sudo` in WSL2 Ubuntu prompts
# for a password by default, so an automated agent cannot run stage 2 of the
# bootstrap script. Running that one command yourself makes stage 2 a no-op and
# lets everything afterwards (clone, sync, native build, wasm build) run
# unattended, because no later stage needs root.
#
# Usage: bash engine/scripts/preflight.sh
#
set -uo pipefail

PACKAGES=(build-essential clang lld git python3 curl unzip ccache pkg-config brotli cmake ninja-build)

printf '\n=== Host ===\n'
printf 'kernel   : %s\n' "$(uname -sr)"
printf 'distro   : %s\n' "$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-unknown}")"
printf 'cpu      : %s threads\n' "$(nproc)"
printf 'memory   : %s\n' "$(awk '/MemTotal/ {printf "%.1f GiB", $2/1048576}' /proc/meminfo)"
printf 'swap     : %s\n' "$(awk '/SwapTotal/ {printf "%.1f GiB", $2/1048576}' /proc/meminfo)"

printf '\n=== Disk ===\n'
printf 'linux fs (build target) : %s free\n' "$(df -BG --output=avail / | tail -1 | tr -d ' ')"
if mountpoint -q /mnt/h 2>/dev/null; then
  printf 'H: mount                : present, %s free\n' "$(df -BG --output=avail /mnt/h | tail -1 | tr -d ' ')"
else
  printf 'H: mount                : NOT MOUNTED\n'
fi

printf '\n=== Repository ===\n'
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)"
printf 'repo root : %s\n' "${REPO_ROOT}"
for required in engine/scripts/bootstrap-skia.sh engine/DEPENDENCIES.md; do
  if [ -f "${REPO_ROOT}/${required}" ]; then
    printf 'found     : %s\n' "${required}"
  else
    printf 'MISSING   : %s\n' "${required}"
  fi
done
if [ -f "${REPO_ROOT}/engine/skia.revision" ]; then
  printf 'skia pin  : %s\n' "$(tr -d '[:space:]' < "${REPO_ROOT}/engine/skia.revision")"
else
  printf 'skia pin  : not yet created (first bootstrap run will record it)\n'
fi

printf '\n=== Privileges ===\n'
if sudo -n true 2>/dev/null; then
  printf 'sudo : passwordless — bootstrap can install packages itself\n'
else
  printf 'sudo : password required — see the apt line below\n'
fi

printf '\n=== Packages ===\n'
MISSING=()
for package in "${PACKAGES[@]}"; do
  if dpkg -s "${package}" >/dev/null 2>&1; then
    printf '  present : %s\n' "${package}"
  else
    printf '  MISSING : %s\n' "${package}"
    MISSING+=("${package}")
  fi
done

printf '\n=== Verdict ===\n'
if [ "${#MISSING[@]}" -eq 0 ]; then
  printf 'All packages present. Stage 2 will be skipped.\n'
  printf 'Ready to run: bash engine/scripts/bootstrap-skia.sh\n\n'
  exit 0
fi

printf '%d package(s) missing. Run this ONE command yourself:\n\n' "${#MISSING[@]}"
printf '  sudo apt-get update -y && sudo apt-get install -y %s\n\n' "${MISSING[*]}"
printf 'Then bootstrap-skia.sh runs unattended: no later stage needs root.\n\n'
exit 1
