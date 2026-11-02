Your app breaks at 3 a.m. Who finds out first: you, or your customer?

I built a Claude Code skill for that. It is called AutoFix.

You say "add autofix to my app" inside your project. Claude copies one file next to your .env, adds one or two lines where the app starts, asks you three questions, and sends you a test alert. From then on:

Every error is logged for 30 days, with keys and passwords masked.
An AI explains each new error in plain words: what it means, how serious, the steps to fix it.
The alert lands on Telegram, WhatsApp (your Evolution API), Slack, Discord, email or n8n.
When it arrives, you type autofix in Claude Code. Claude confirms the cause in your code, makes the smallest fix, proves it, and closes the report.

Node and Python apps, plus their web pages. Same error alerts once a day at most, ten alerts an hour max, so a broken app cannot flood your phone or burn your AI credit.

For a public app: OpenRouter for the AI (a key with a spending limit) and a VPS so the 30-day log survives restarts. Both explained in the lesson.

Now the honest part. The code ran against two test apps with planted bugs, four AI providers and three channels, all real sends. What I could not test is the install on a clean machine: my laptop already has a personal skill that answers to the same word, and the two collide. So you are the test.

Install it on one app this week and tell me in the comments: your stack, the AI and channel you picked, and the first alert you got, or what broke.

Full lesson: https://www.skool.com/ai-automations-by-hector-8106/classroom/c6068c0b?md=2965d7108b514510bf4b8b5f0956637f
Pack: https://aiautobase.com/packs/autofix
Source: https://github.com/AIAutoBase/autofix-skill

— Hector
