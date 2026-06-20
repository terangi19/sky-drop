#!/usr/bin/env bash
# Sync local changes to GitHub (commit + push)
# Usage: npm run git:sync
#        npm run git:sync -- -m "custom commit message"

set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-}"
if [[ "${MSG}" == "-m" ]]; then
  MSG="${2:-}"
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "Nothing to commit — working tree clean."
  exit 0
fi

git add -A
git reset HEAD tsconfig.tsbuildinfo 2>/dev/null || true

if [[ -z "$(git diff --cached --name-only)" ]]; then
  echo "No staged changes after excluding build artifacts."
  exit 0
fi

if [[ -z "${MSG}" ]]; then
  MSG="chore: sync local changes"
fi

git commit -m "${MSG}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git push origin "${BRANCH}"
echo "Pushed ${BRANCH} @ $(git rev-parse --short HEAD)"
