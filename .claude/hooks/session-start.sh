#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote) sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Use an isolated venv so installs don't collide with the Debian-managed
# system Python packages. Idempotent: reused if it already exists.
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --quiet -r requirements.txt

# Persist the venv on PATH so the rest of the session uses it.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$CLAUDE_PROJECT_DIR/.venv/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# Handoff status: surface where the last session left things so a phone
# session can pick up immediately.
echo "=== meta-ads-unified session ready ==="
echo "branch:      $(git rev-parse --abbrev-ref HEAD)"
echo "last commit: $(git log -1 --pretty='%h %s (%cr)')"
