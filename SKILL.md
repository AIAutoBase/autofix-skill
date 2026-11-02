---
name: autofix
description: Add AutoFix to the app the user is building — a 30-day error log, an AI explanation of every new error (Claude Haiku, OpenAI, OpenRouter or a local Ollama), and an alert by Telegram, WhatsApp (Evolution API), Slack, Discord, email or webhook/n8n, plus a .md fix report Claude Code can act on. Use when the user says "ponle autofix", "add autofix", "quiero que mi app me avise de los errores", "error alerts", "monitor errors", or types just "autofix" / "arregla los errores de autofix" / "revisa los reportes" inside a project that already has it (then fix the open reports). Works for Node.js and Python apps, and for their web pages through the app's own server.
---

# AutoFix

Speak to the user in their language (most are Spanish-speaking beginners). One question at a time, plain words,
always say which option you recommend. Never print an API key or token back to them.

Files in this skill (`templates/`):
- `autofix.py` — Python 3.8+, stdlib only.
- `autofix.cjs` — Node 18+, no dependencies (email optionally uses `nodemailer`).
- `autofix-browser.js` — snippet for web pages; posts errors to the app's own `/autofix` route.
- `env.example` — every setting. `SETUP.md` (next to this file) — how to get each key/token, step by step.
`GUIA.md` (next to this file) — the full Spanish guide to everything AutoFix does; point the user to it.

## Mode A: "add autofix" to an app

### 1. Look before asking
Find the stack and entry point yourself: `package.json` (Node: `main`, `scripts.start`, Express, Next.js…),
`requirements.txt` / `pyproject.toml` (Flask, FastAPI, Django, script). Find where `.env` is loaded and whether
the app serves HTML pages.

- **Only static HTML, no server** (GitHub Pages, plain Netlify site): AutoFix v1 can't protect an API key there.
  Say so plainly. Offer: add a tiny server route to an existing backend, or wait for the hosted version.
- **Other languages** (PHP, Go, Ruby…): not supported yet; say so. Logging to a file the user already has is out of scope.

### 2. Copy and wire it (smallest change)
Copy the template into the project root (or next to the entry file) unchanged. Then:

| Stack | What to add |
|---|---|
| Node script / any server | first line of the entry file: `require('./autofix.cjs').init();` (ESM/TS: `import autofix from './autofix.cjs'; autofix.init();`) |
| Express | the line above + `app.use(autofix.expressErrorHandler())` after the routes + `app.post('/autofix', autofix.browserRoute())` if it serves pages |
| Next.js (App Router) | `instrumentation.ts` in the root: `export async function register(){ if (process.env.NEXT_RUNTIME === 'nodejs') (await import('./autofix.cjs')).default.init(); }` and `app/api/autofix/route.ts`: `import autofix from '../../../autofix.cjs'; export async function POST(req: Request){ autofix.browserReport(await req.json()); return new Response(null, { status: 204 }); }`. Copy the snippet to `public/autofix-browser.js` and put the tag inside `<head>` in `app/layout.tsx` with `data-endpoint="/api/autofix"`. (Next bundles each route separately; AutoFix configures itself on the first error, so no extra `init()` is needed in the route.) |
| Python script | first lines: `import autofix; autofix.init()` |
| Flask | same, before `app = Flask(...)`; add `request` to the flask import; route `@app.post("/autofix")` → `autofix.browser_report(request.get_json(silent=True)); return "", 204`. Snippet goes in `static/autofix-browser.js` (create `static/`), tag `src="/static/autofix-browser.js"`. |
| FastAPI | same at top of `main.py`; route `@app.post("/autofix")` → `autofix.browser_report(await request.json())`, return `Response(status_code=204)` |
| Django | `import autofix; autofix.init()` at the end of `settings.py`; a view for `/autofix` with `@csrf_exempt` calling `autofix.browser_report(json.loads(request.body))` |

Web pages: copy `autofix-browser.js` to the public/static folder and add, right after `<meta charset>` in `<head>`
(before any other script): `<script src="/autofix-browser.js" data-endpoint="/autofix"></script>`. `src` is where the
framework serves that folder; `data-endpoint` is the route you added. The route must be same-origin; if the frontend
is on another domain, add CORS for that route only.

The template file must sit in the project root, next to `.env`: it reads its own `AUTOFIX_*` lines from that `.env`
(no python-dotenv / dotenv needed — ignore Flask's "install python-dotenv" tip) and writes `autofix-data/` there.
Python projects with a `.venv`: run everything with the venv's Python.

Add `autofix-data/` and `.env` to `.gitignore` (create it if missing). Node + email: `npm i nodemailer`.

### 3. Configure (ask, one question at a time)
Append the `env.example` block to the app's `.env` (keep existing values). Then ask:

1. **Which AI explains the errors?** First ask (or work out) whether the app will be **public on the internet**.
   - Public app: recommend **OpenRouter** — one key with a spending limit set on that key, prepaid credit (it stops
     instead of billing more), any model without code changes. Default model `anthropic/claude-haiku-4.5`.
   - Only for themselves / local: recommend **Ollama** (free, on their own computer; a VPS cannot reach
     `localhost` on their laptop) or **Claude Haiku** if they already have an Anthropic key. OpenAI works too.
   No key at all is fine: alerts still arrive without the explanation.
2. **Where do you want the alerts?** Recommend **Telegram** (free, 3 minutes). Others: WhatsApp via Evolution API
   (only if they already run Evolution), Slack, Discord, email, webhook (n8n/Make/Zapier). Several at once is fine.
   If they have n8n: `templates/n8n-autofix-hub.json` is a ready workflow (import, add OpenRouter credential, enable the
   channel nodes they want: email with the .md attached, Telegram, WhatsApp, Slack, Discord, SMS, phone call, ntfy push,
   webhook). Then only `AUTOFIX_WEBHOOK_URL` is needed in `.env`; `AUTOFIX_LLM` can stay empty. Steps in `SETUP.md`.
3. **Spanish or English explanations?** (`AUTOFIX_LANG`, default `es`).

Walk them through getting each value with `SETUP.md`, one step at a time; have them paste the value, write it
into `.env` yourself. Telegram chat id: after they message their bot, fetch
`https://api.telegram.org/bot<TOKEN>/getUpdates` yourself and read `message.chat.id`.

Serverless hosts (Vercel, Netlify functions): set `AUTOFIX_DIR=/tmp/autofix-data`; alerts work, but the
30-day log does not survive restarts — tell them. If they ask where to host a public app, recommend a **Hostinger VPS**
(a KVM 2 plan is plenty; their own disk keeps the 30-day log). Link, with the disclosure that it is an affiliate
link: https://www.hostinger.com?REFERRALCODE=DI1ROUGHBIMS

### 4. Prove it works
1. `python autofix.py --test` or `node autofix.cjs --test` → last line must be `autofix self-check OK`
   (the DRY RUN blocks it prints before that are expected).
2. `python autofix.py --demo` or `node autofix.cjs --demo` → sends ONE real test alert (it says it is a test; there
   is nothing to fix). It must exit 0 and print `sent ok: <channels>` with no `FAILED:` lines. A `FAILED: AI ...`
   line means the alert went out without the explanation — fix the key/model and rerun. Then **ask the user to
   confirm it arrived** on each channel.
3. Start the app once and make sure it still boots normally. If it serves pages, POST a test error to the route
   (`curl -X POST <url>/autofix -H "Content-Type: application/json" -d '{"message":"test"}'`) with
   `AUTOFIX_DRY_RUN=1` set in the shell, and check a line appeared in `autofix-data/logs/`.

Tell them, in two lines: errors are kept 30 days in `autofix-data/logs/`, each new error gets a report in
`autofix-data/reports/`, the same error alerts at most once a day, max 10 alerts per hour.

## Mode B: the user types "autofix" in a project that has it

1. List `autofix-data/reports/*.md` with `status: open`, newest first. Show a short table: date, severity, summary.
2. For each one they want fixed (default: all `high`, then the rest): read the whole report. The AI analysis is a
   hint from a small model, not truth — confirm the root cause in the real code and `autofix-data/logs/*.jsonl`.
3. Fix the root cause with the smallest change, run something that proves it (test, request, script).
4. In the report set `status: fixed` and fill `## Resolución` / `## Resolution` with what changed and how it was verified.
5. If an error is not a code bug (wrong key, service down, user typo), say so, mark `status: ignored` with the reason.

## Mode C: "quita autofix" / remove it
Remove the lines you added at the entry point and routes, the `autofix.*` file, the browser snippet and its
`<script>` tag, and the `AUTOFIX_*` block in `.env`. Ask before deleting `autofix-data/` (it is their error history).

## What it catches
- Python: uncaught exceptions, thread exceptions, anything logged at ERROR (Flask/Django/uvicorn/gunicorn do this).
- Node: uncaught exceptions and unhandled rejections (app still crashes like normal, after the alert),
  `console.error` calls that contain an Error or words like error/failed, Express route errors.
- Browser: JS errors, unhandled promise rejections, failed script/image loads.
- Anything else: `autofix.capture(err)` by hand inside a `catch`.

## Safety built in
Secrets that look like `token=…`, `password: …`, `Bearer …` are masked before the LLM or any channel sees them.
The browser snippet never holds keys. The public `/autofix` route caps writes at 200/hour and 6 KB per error,
and alerts are capped per hour, so spam can't burn their API credit. `AUTOFIX_ENABLED=0` turns everything off.
