# AutoFix: cómo conseguir cada clave

Claude te va pidiendo estos valores de uno en uno y los escribe en tu `.env`. Solo necesitas **una IA** y
**al menos un canal**. Nunca compartas estas claves en Skool ni en capturas de pantalla.

## La IA que explica el error (elige una)

### OpenRouter (recomendada para apps públicas)
Una sola clave, con **límite de gasto**, crédito pagado por adelantado (si se acaba, se detiene en vez de cobrarte
más) y cualquier modelo sin tocar el código.
1. https://openrouter.ai → crea una cuenta → **Credits** → añade $5 de crédito.
2. **Keys** → **Create Key** → ponle nombre (ej. `autofix-mi-app`) y en **Credit limit** pon un tope, por ejemplo `2`
   (dólares). Copia la clave (`sk-or-...`).
3. `.env`: `AUTOFIX_LLM=openrouter` y `AUTOFIX_LLM_KEY=<tu clave>`
4. Opcional: otro modelo con `AUTOFIX_LLM_MODEL=` (ejemplo `openai/gpt-5-mini`). Vacío = `anthropic/claude-haiku-4.5`.

### Anthropic Claude Haiku (si ya tienes cuenta de Anthropic)
1. Entra a https://console.anthropic.com y crea una cuenta.
2. **Billing** → añade $5 de crédito (te duran meses: cada error cuesta una fracción de centavo).
3. **API Keys** → **Create Key** → copia la clave (empieza con `sk-ant-`).
4. `.env`: `AUTOFIX_LLM=anthropic` y `AUTOFIX_LLM_KEY=<tu clave>`

### OpenAI (ChatGPT)
1. https://platform.openai.com → **Billing** → añade crédito.
2. **API keys** → **Create new secret key** → copia (`sk-...`).
3. `.env`: `AUTOFIX_LLM=openai` y `AUTOFIX_LLM_KEY=<tu clave>`

### Ollama (gratis, corre en tu computadora)
1. Instala desde https://ollama.com.
2. En la terminal: `ollama pull gemma3:4b`
3. `.env`: `AUTOFIX_LLM=ollama` (sin clave).
4. Si tu app corre en **otra** máquina (un VPS, otra PC), esa máquina tiene que poder llegar a Ollama:
   `AUTOFIX_LLM_URL=http://<ip-de-la-pc-con-ollama>:11434`. Un VPS en internet **no** llega a la laptop de tu casa;
   en ese caso usa una de las opciones de pago.
   Es más lento (de 10 segundos a 1 minuto por error) y las explicaciones son más simples.

## Dónde te llega el aviso (elige uno o varios)

### Telegram (recomendado: gratis, 3 minutos)
1. En Telegram busca **@BotFather** → escribe `/newbot` → ponle nombre → copia el **token**.
2. Abre tu bot nuevo y escríbele cualquier cosa ("hola").
3. Dale el token a Claude: él busca tu **chat id** solo.
4. `.env`: `AUTOFIX_TELEGRAM_TOKEN=` y `AUTOFIX_TELEGRAM_CHAT_ID=`

### WhatsApp (Evolution API)
Solo si ya tienes Evolution API corriendo (lo vimos en clase).
1. Del panel de Evolution copia: la URL del servidor, el nombre de la **instancia** (conectada, estado `open`) y la **API key**.
2. Tu número con código de país, sin `+` ni espacios: `17875551234`.
3. `.env`: `AUTOFIX_WHATSAPP_URL=`, `AUTOFIX_WHATSAPP_INSTANCE=`, `AUTOFIX_WHATSAPP_KEY=`, `AUTOFIX_WHATSAPP_TO=`

### Slack
1. https://api.slack.com/apps → **Create New App** → **From scratch**.
2. **Incoming Webhooks** → actívalo → **Add New Webhook to Workspace** → elige el canal → copia la URL.
3. `.env`: `AUTOFIX_SLACK_WEBHOOK=<url>`

### Discord
1. En tu servidor: **Editar canal** → **Integraciones** → **Webhooks** → **Nuevo webhook** → **Copiar URL**.
2. `.env`: `AUTOFIX_DISCORD_WEBHOOK=<url>`

### Email (Gmail)
1. Tu cuenta de Google necesita la verificación en 2 pasos activa.
2. https://myaccount.google.com/apppasswords → crea una **contraseña de aplicación** → copia los 16 caracteres.
3. `.env`: `AUTOFIX_EMAIL_TO=<a dónde llega>`, `AUTOFIX_SMTP_HOST=smtp.gmail.com`, `AUTOFIX_SMTP_PORT=587`,
   `AUTOFIX_SMTP_USER=<tu gmail>`, `AUTOFIX_SMTP_PASS=<la contraseña de aplicación>`
4. Si tu app es Node: `npm i nodemailer`.

### n8n: AutoFix Hub (un workflow listo, varios canales a la vez)
Si prefieres que n8n haga el análisis y el envío (la app solo manda el error), importa `templates/n8n-autofix-hub.json`:
1. En n8n: **Workflows → ⋯ → Import from File** → elige el JSON.
2. Credencial **OpenRouter** (https://openrouter.ai/keys) y ponla en el nodo **OpenRouter**. El modelo se cambia en **Config**
   (viene `anthropic/claude-sonnet-4.5`; cualquier modelo frontier sirve: `openai/gpt-5`, `google/gemini-2.5-pro`...).
   Sin credencial el aviso llega igual, sin explicación.
3. Nodo **Config**: rellena el destino de cada canal que uses (correo, chat id, número, topic de ntfy...).
4. Enciende los canales: cada canal es un nodo; los que piden credencial vienen **desactivados**. Añade la credencial
   (SMTP, Telegram, Slack, Discord, Twilio) y actívalo (clic derecho → **Enable**). Varios a la vez está bien.
   **ntfy** viene encendido y no pide nada: instala la app ntfy en el celular, suscríbete al topic que pusiste y listo.
5. **Publish** el workflow → abre el nodo **Webhook** → copia la **Production URL**.
6. `.env` de tu app: `AUTOFIX_WEBHOOK_URL=<esa url>`. Puedes dejar `AUTOFIX_LLM` vacío: n8n pone la IA.

Lo que manda n8n: el error tal cual sale en el log, fecha y hora, gravedad, por qué ocurre, cómo arreglarlo y la severidad
final; por email va también el reporte `.md` adjunto. La **llamada** solo sale si la severidad es `high`
(`call_only_if_high` en Config).

| Canal | Qué necesita |
|---|---|
| Push al celular (ntfy) | Solo un nombre de topic difícil de adivinar. Gratis. |
| Email | Credencial SMTP (Gmail: contraseña de aplicación, puerto 465 SSL o 587). |
| Telegram | Credencial con el token del bot + `telegram_chat_id`. |
| WhatsApp | Tu Evolution API: `evolution_url`, `evolution_instance`, `evolution_key`, `whatsapp_to`. |
| Slack | Credencial Slack API (bot token) + `slack_channel`. |
| Discord | Credencial Discord Webhook. |
| SMS | Credencial Twilio + `twilio_from`, `phone_to`. |
| Llamada | Credencial Basic Auth (usuario = Account SID, contraseña = Auth Token) + `twilio_sid`. Te lee el resumen con voz. |
| Webhook saliente | `webhook_url`: Make, Zapier, Google Sheets, tu CRM... |

### Webhook propio (Make, Zapier, otro n8n)
1. `.env`: `AUTOFIX_WEBHOOK_URL=<url>`
2. Llega un JSON con `event` (el error), `analysis` (la explicación), `report` y `text` (el mensaje listo).

## Probar
Claude corre `--test` y luego `--demo`. Te debe llegar un aviso de prueba con la explicación de un error falso.
Si no llega, Claude te muestra qué canal falló y por qué.
