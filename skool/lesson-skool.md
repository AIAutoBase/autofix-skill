Status first. AutoFix is built and its code ran against two test apps with planted bugs. One thing I could not verify: installing the skill on a clean machine and asking Claude for it in plain words. My own machine already has a personal skill that answers to the same word, autofix, and the two collide. So I need you. Install it, try it on your app, and post in the community what happened: your stack, what worked, what looked wrong. The next version comes from your reports.

## What it is

AutoFix is a Claude Code skill. A skill is a folder of instructions Claude Code reads when you ask for something specific. This one adds a smoke detector to the apps you build:

- every error your app throws is written to a log and kept for 30 days,
- an AI explains each new error in plain words: what it means, how serious it is, the likely cause, the steps to fix it,
- an alert reaches your phone on Telegram, WhatsApp (through your own Evolution API), Slack, Discord, email, or an n8n, Make or Zapier webhook,
- a report file is left in your project, and when you type autofix in Claude Code, Claude reads the open reports and fixes them.

It works with Node.js and Python apps, and with their web pages through the app's own server.

## What it is for

Most apps we build with Claude Code fail quietly. A page breaks. A payment call gets an HTML error page instead of JSON. A background job dies at 3 a.m. Nobody knows until a customer says so, and by then you are guessing.

Big teams pay for Sentry or Datadog to catch this. AutoFix is the small version for your own apps: no account, no dashboard, one file in your project, and the alert comes with an explanation a beginner can act on.

## Install the skill (2 minutes)

- Download it. Members of AI Automations by Hector: [aiautobase.com/packs/autofix](https://aiautobase.com/packs/autofix). Everyone: [github.com/AIAutoBase/autofix-skill](https://github.com/AIAutoBase/autofix-skill), then Code, Download ZIP.
- Unzip it. You get a folder. Rename it to autofix if it has another name.
- Copy that folder into your Claude Code skills folder. Windows: C:\Users\<your-user>\.claude\skills\autofix. Mac and Linux: ~/.claude/skills/autofix.
- Close Claude Code and open it again.

If you cannot find the folder, open Claude Code in the folder where you unzipped it and say: install this autofix skill in my global skills.

Before you install anything, read it. Open SKILL.md and the template for your language, hand them to Claude and ask what they will change in your project and what they send out. The answer should be: one file and one or two lines in your app, an AUTOFIX block in your .env, and outbound calls only to the AI and the channels you pick.

## Add it to an app

Open Claude Code inside your app's project and say:

ponle autofix a mi app (or: add autofix to my app)

Here is what Claude does, in order:

- Reads your project first. It finds package.json (Node) or requirements.txt / pyproject.toml (Python), the file the app starts from, and whether the app serves web pages.
- Copies one file next to your .env: autofix.py for Python (standard library only, installs nothing) or autofix.cjs for Node 18+ (no dependencies). If the app has pages, it also copies autofix-browser.js into the public folder and adds one script tag.
- Adds one or two lines where the app starts. In Python: import autofix; autofix.init(). In Express, one more line for the /autofix route that receives browser errors.
- Asks you three questions, one at a time: which AI explains the errors, where the alerts go, Spanish or English.
- Walks you through getting each key with SETUP.md. You paste the value; Claude writes it into .env and never repeats it on screen.
- Tests it three ways: a self-check, one real test alert that you confirm arrived, and a normal start of your app to make sure nothing else changed.
- Adds autofix-data/ and .env to .gitignore so errors and keys never land on GitHub.

## Which AI to pick

- Your app will be public on the internet: OpenRouter. One key, a spending limit you set on that key, prepaid credit (when it runs out, it stops instead of billing more), and any model without code changes. The default is Claude Haiku 4.5 through OpenRouter.
- Only you use it, on your own computer: Ollama. Free, runs locally. A server on the internet cannot reach the Ollama on your laptop.
- You already have an Anthropic or OpenAI key: Claude Haiku or gpt-5-mini work the same.
- No key at all: the alert still arrives, just without the explanation.

Cost: a fraction of a cent per new error with OpenRouter, Haiku or OpenAI. Zero with Ollama.

## Where to host an app that uses it

AutoFix keeps the 30-day log on the server's disk. On Vercel or Netlify functions that disk is wiped on every restart: the alerts work, the history is lost. For a public app I recommend a Hostinger VPS. A KVM 2 plan runs the app and AutoFix with room to spare, plus Ollama or n8n next to it if you want them: [hostinger.com](https://www.hostinger.com?REFERRALCODE=DI1ROUGHBIMS)

That is an affiliate link. If you buy through it, AI Auto Base may earn a commission at no extra cost to you.

## What it catches

- Python: crashes, errors inside threads, and anything logged at ERROR level. Flask, Django, FastAPI (uvicorn) and gunicorn already log their errors that way.
- Node: crashes and unhandled promise rejections (the app still stops like before, after the alert goes out), console.error calls that carry an error, and Express route errors.
- Web pages: JavaScript errors, unhandled promise rejections, images or scripts that fail to load, and server answers that were not JSON (the classic Unexpected token '<'), with the HTTP status and the address.
- Anything else you send by hand: autofix.capture(err) inside a catch.

## What it does with each error

- Cleans it. Anything that looks like a key or password (token=, password:, Bearer) is masked before it is saved or sent. Each error is cut to 6 KB.
- Saves it in autofix-data/logs, one file per day. Files older than 30 days are deleted on their own.
- Fingerprints it: the first line with the numbers removed, so "order 1234 failed" and "order 5678 failed" count as the same error.
- Decides whether to alert. The same error alerts once every 24 hours, never more than 10 alerts an hour in total. Everything is still logged.
- Asks the AI what it means. If the AI fails, the alert goes out anyway without the explanation.
- Writes a report in autofix-data/reports with the error, the explanation, the steps and an empty Resolution section, marked status: open.
- Sends the alert to every channel you set up.

## When an alert arrives: type autofix

Open the project in Claude Code and type: autofix

- Claude lists the open reports with date, severity and summary.
- It reads each report in full, then confirms the real cause in your code and in the log. The AI note is a hint from a small model, not the truth.
- It fixes the cause with the smallest change and proves it with a test, a request or a script.
- It marks the report fixed and writes what changed and how it was checked.
- If the error was not a code bug (a wrong key, a service down, a user typo) it says so and marks the report ignored with the reason.

AutoFix never changes your code on its own. Alerts and reports happen automatically. Fixes happen only when you type autofix.

## The benefits

- You hear about errors before your users tell you, with the cause in plain words instead of a stack trace.
- Nothing is lost: 30 days of errors on your own server, even the ones that did not trigger an alert.
- Your phone does not get flooded and your AI credit does not burn: one alert per error per day, ten an hour at most.
- Fixing gets faster. The report already holds the error, the context and a first diagnosis, so Claude starts from evidence instead of guessing.
- Your keys stay safe. They live only in your server's .env; the web page snippet holds none, and secrets are masked before anything leaves.
- It is yours. One file in your project, MIT licensed, no account, no monthly fee beyond the AI calls.

## Turn it off or remove it

- Off: AUTOFIX_ENABLED=0 in .env, then restart the app.
- Remove: tell Claude "remove autofix from my app". It deletes the lines it added, the file, the snippet and the .env block, and asks before deleting your error history.

## What it does not do

- It does not work on plain HTML sites with no server (GitHub Pages, a static Netlify site). There is nowhere safe to keep the AI key.
- PHP, Go and Ruby are not supported yet.
- It is not a replacement for a full monitoring service in a company with an on-call team.

## What was verified and what was not

Verified with real sends on Windows 11, Node 26 and Python 3.14: four AI providers (Claude Haiku on Anthropic, gpt-5-mini on OpenAI, Claude Haiku 4.5 on OpenRouter, a local Ollama) and three channels (Telegram, WhatsApp through Evolution API, email over SMTP). Two test apps with planted bugs, a Next.js store and a Flask booking system. Two separate Claude sessions that knew only the skill played the student and installed it; they found seven problems, all fixed. A real browser then clicked through both apps and all five planted bugs arrived explained in Spanish.

Not verified: installing the skill on a clean machine and triggering it in plain words, Slack, Discord, the webhook, email from a Node app, Django and FastAPI.

## Your turn

Install it on one app this week. Then post in the community: the stack, the AI and channel you picked, and the first alert you got, or the first thing that broke. Screenshots of the alert help, with your keys hidden.

The full Spanish guide (GUIA.md) and the key-by-key setup (SETUP.md) are inside the download.

— Hector
