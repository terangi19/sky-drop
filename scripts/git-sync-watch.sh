#!/usr/bin/env bash
# Watches the repo and runs git-sync every N minutes when there are changes.
# Usage: npm run git:watch
# Stop with Ctrl+C

set -euo pipefail
cd "$(dirname "$0")/.."

INTERVAL_MIN="${GIT_SYNC_INTERVAL_MIN:-30}"
INTERVAL_SEC=$((INTERVAL_MIN * 60))

echo "Git watch started — checking every ${INTERVAL_MIN} minute(s). Ctrl+C to stop."
echo "Repo: $(pwd)"
echo ""

while true; do
  stamp="$(date '+%Y-%m-%d %H:%M:%S')"
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "[$stamp] Changes detected — syncing..."
    if bash "$(dirname "$0")/git-sync.sh"; then
      :
    else
      echo "[$stamp] Sync failed."
    fi
  else
    echo "[$stamp] No changes — skipping."
  fi
  sleep "$INTERVAL_SEC"
done
