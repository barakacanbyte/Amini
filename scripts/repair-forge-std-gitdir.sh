#!/usr/bin/env bash
# Repair packages/contracts/lib/forge-std/.git (gitdir: line) without hardcoded paths.
#
# Creates a symlink at the repo root (./.forge-std-gitdir) pointing at Git's real module
# directory, then sets gitdir to a short relative path (../../../../.forge-std-gitdir).
# That avoids paths containing ".../Desktop/..." which some tools mis-resolve as "/Desktop/...".
#
# Run from repo root after clone or when opening a linked worktree:
#   ./scripts/repair-forge-std-gitdir.sh
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT}" ]]; then
  echo "repair-forge-std-gitdir: not inside a git repository; skip." >&2
  exit 0
fi

FORGE_DIR="${ROOT}/packages/contracts/lib/forge-std"
GITFILE="${FORGE_DIR}/.git"
LINK="${ROOT}/.forge-std-gitdir"

if [[ ! -e "${FORGE_DIR}" ]]; then
  echo "repair-forge-std-gitdir: ${FORGE_DIR} missing; skip." >&2
  exit 0
fi

if [[ ! -f "${GITFILE}" ]]; then
  echo "repair-forge-std-gitdir: ${GITFILE} not a file (submodule not initialized?); skip." >&2
  exit 0
fi

if ! head -1 "${GITFILE}" | grep -q '^gitdir:'; then
  echo "repair-forge-std-gitdir: ${GITFILE} not a gitfile; skip." >&2
  exit 0
fi

MOD_ABS="$(git -C "${ROOT}" rev-parse --path-format=absolute --git-path modules/packages/contracts/lib/forge-std 2>/dev/null || true)"
if [[ -z "${MOD_ABS}" || ! -d "${MOD_ABS}" ]]; then
  echo "repair-forge-std-gitdir: submodule git dir not present (run: git submodule update --init); skip." >&2
  exit 0
fi

if ln -sfn "${MOD_ABS}" "${LINK}" 2>/dev/null; then
  TARGET_FOR_REL="${LINK}"
else
  echo "repair-forge-std-gitdir: could not create symlink ${LINK} (permissions?); using direct path to module." >&2
  TARGET_FOR_REL="${MOD_ABS}"
fi

REL="$(python3 -c "import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))" "${TARGET_FOR_REL}" "${FORGE_DIR}")"
printf 'gitdir: %s\n' "${REL}" > "${GITFILE}"
echo "repair-forge-std-gitdir: updated ${GITFILE} -> gitdir: ${REL}"
