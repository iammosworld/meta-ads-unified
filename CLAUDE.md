# meta-ads-unified

An MCP server that exposes Meta (Facebook) Ads insights and controls over SSE.
Deployed on Railway (`python server.py`).

## Layout
- `server.py` — the whole server: MCP tools + Starlette/SSE transport.
- `requirements.txt` — Python deps (`mcp`, `httpx`, `starlette`, `uvicorn`).
- `railway.json` — Railway deploy config (NIXPACKS, start = `python server.py`).
- `.claude/hooks/session-start.sh` — installs deps into `.venv` on web sessions.

## Tools exposed
`get_all_accounts_overview`, `get_campaign_performance`, `get_ad_performance`,
`get_campaigns`, `pause_campaign`, `pause_ad`. Ad accounts are mapped by name
in the `AD_ACCOUNTS` dict in `server.py`.

## Running locally
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
META_ACCESS_TOKEN=... .venv/bin/python server.py   # serves on $PORT (default 8080)
```
`META_ACCESS_TOKEN` must be set in the environment; never commit it.

## Cross-machine workflow (phone / Mac / Windows)

State is shared through **git**, not through live sessions. A Claude Code session
(terminal, desktop, or web/phone) cannot import another machine's chat history —
only the committed code travels. So:

1. **Before switching machines:** commit and push your work in progress.
2. **From your phone:** open this repo in Claude Code on the web
   (https://code.claude.com). It clones the latest commit; the SessionStart hook
   installs deps and prints the current branch + last commit so you see where
   things stand.
3. **Coming back to Mac/Windows:** `git pull` the branch.

The SessionStart hook only runs in remote (web) sessions, so local terminal
sessions are unaffected.
