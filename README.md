# AutoFix — tu app te avisa cuando falla y te explica cómo arreglarlo

Un skill para Claude Code. Le dices **"ponle autofix a mi app"** y Claude:

- guarda todos los errores de tu app durante 30 días,
- le pide a una IA (Claude Haiku, ChatGPT, OpenRouter u Ollama gratis) que explique cada error nuevo en palabras simples,
- te avisa por Telegram, WhatsApp, Slack, Discord, email o n8n (con un workflow listo que añade push al celular, SMS y llamada),
- y deja un reporte. Cuando escribes **"autofix"** en Claude Code, lo arregla por ti.

Funciona con apps en **Node.js** y **Python**, y con sus páginas web.

> **Necesitamos tu ayuda para verificarlo.** El skill está creado y el código está probado en dos apps de prueba.
> Lo que no pudimos verificar es instalarlo y pedírselo a Claude en una computadora limpia: en la computadora donde
> se creó ya había otro skill que responde a la misma palabra, "autofix", y los dos chocaban. Instálalo, pruébalo en
> tu app y cuéntanos en la comunidad si funcionó, en qué tipo de app y qué te salió raro.

La explicación completa de todo lo que hace está en **[GUIA.md](GUIA.md)**.

## Instalar (2 minutos)

1. Descomprime el zip (o descarga este repositorio de GitHub con **Code → Download ZIP**). Te queda una carpeta;
   renómbrala `autofix` si se llama distinto.
2. Cópiala a tu carpeta de skills de Claude Code:
   - **Windows:** `C:\Users\<tu-usuario>\.claude\skills\autofix`
   - **Mac / Linux:** `~/.claude/skills/autofix`
3. Cierra y vuelve a abrir Claude Code.

Si no encuentras la carpeta, abre Claude Code en la carpeta donde descomprimiste el zip y escríbele:
**"instala este skill de autofix en mis skills globales"**.

## Usar

En Claude Code, dentro del proyecto de tu app:

> ponle autofix a mi app

Claude te hace 3 preguntas (qué IA, dónde quieres los avisos, idioma) y te guía paso a paso para conseguir
cada clave. Al final te manda un aviso de prueba.

Cuando te llegue un aviso de error real:

> autofix

## Recomendaciones para apps que van a estar en internet
- **IA: OpenRouter.** Una clave con límite de gasto y crédito pagado por adelantado: si se acaba, se detiene en vez
  de cobrarte más. Cómo sacarla: [SETUP.md](SETUP.md).
- **Servidor: un VPS de Hostinger.** AutoFix guarda 30 días de errores en el disco, y en Vercel o Netlify ese disco
  se borra. Un plan KVM 2 alcanza de sobra: https://www.hostinger.com?REFERRALCODE=DI1ROUGHBIMS
  *(enlace de afiliado: si compras con él, AI Auto Base puede recibir una comisión, sin costo extra para ti).*

## Cuánto cuesta
- Con **Ollama**: gratis.
- Con **Claude Haiku / ChatGPT / OpenRouter**: una fracción de centavo por error. El mismo error avisa una sola vez al día
  y hay un máximo de 10 avisos por hora, así que el gasto no se dispara aunque tu app falle mucho.

## Privacidad
Las claves y contraseñas que aparezcan en un error se ocultan antes de enviarlo a la IA o al chat.
Las claves de tu IA viven solo en el `.env` de tu servidor, nunca en la página web.
Para apagarlo: `AUTOFIX_ENABLED=0` en el `.env`.

## Qué está probado
- **IAs:** Claude Haiku, ChatGPT, OpenRouter y Ollama local, con envíos reales.
- **Avisos:** Telegram, WhatsApp (Evolution API) y email, con envíos reales.
- **n8n:** el workflow `templates/n8n-autofix-hub.json` con email (+ reporte adjunto), Telegram, WhatsApp y push ntfy, con y sin IA.
- **Apps:** una tienda en Next.js y un sistema de reservas en Flask con 5 errores sembrados; los 5 llegaron explicados en español.
- **Sin probar todavía:** instalarlo como skill en una computadora limpia (ver arriba), Slack, Discord, Make/Zapier, email desde apps Node, Django y FastAPI; en n8n: Slack, Discord, SMS y llamada.

---

## 📋 Latest Changes

<!-- LATEST:BEGIN -->
## [0.3.0] - 2026-11-02

### Added
- n8n AutoFix Hub workflow - frontier-model analysis and alerts by email, Telegram, WhatsApp, Slack, Discord, SMS, call, ntfy push, webhook; Skool launch texts



## [0.2.0] - 2026-10-30

### Added
- public release docs - full Spanish guide, OpenRouter for public apps, Hostinger VPS, disclaimer, license, verification request



## [0.1.2] - 2026-10-30

### Fixed
- no AI key means alert without explanation instead of a failed API call



## [0.1.1] - 2026-10-30

### Fixed
- student test round - env comments, empty vars, Next.js routes, fetch json errors, Haiku retries, honest demo



## [0.1.0] - 2026-10-30

### Added
- AutoFix skill: 30-day error log, AI explanation (Anthropic, OpenAI, OpenRouter, Ollama), alerts (Telegram, WhatsApp/Evolution, Slack, Discord, email, webhook), .md fix reports and the "autofix" fix mode.
- Templates for Python (`autofix.py`) and Node (`autofix.cjs`), browser snippet, `env.example`, Spanish `SETUP.md` and `README.md`.
<!-- LATEST:END -->

See full [CHANGELOG.md](CHANGELOG.md) for complete history.





