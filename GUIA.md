# AutoFix: guía completa

Esta guía explica todo lo que hace AutoFix, pieza por pieza: qué instala en tu app, qué guarda, a quién le habla,
cuánto cuesta, cómo lo apagas y qué hacer cuando algo no funciona. Léela una vez antes de instalarlo.

> **Estado: creado, falta tu confirmación.** El código está probado en dos apps de prueba (abajo, "Qué está probado").
> Lo que no pudimos probar es el paso de **instalar el skill y decirle a Claude "ponle autofix a mi app"**
> en una computadora limpia: en la computadora donde se creó ya había otro skill personal que responde a la
> misma palabra, "autofix", y Claude no sabía cuál usar. **Necesitamos que tú lo pruebes** y nos cuentes en la
> comunidad si funcionó, en qué tipo de app (Node, Next.js, Python, Flask…) y qué te salió raro.

---

## 1. Qué es, en una frase

Un skill de Claude Code que le pone a tu app un "detector de humo": cada error se guarda, una IA lo explica en
palabras simples, te llega un aviso al teléfono y queda un reporte que Claude Code puede usar para arreglarlo.

## 2. Qué pasa cuando dices "ponle autofix a mi app"

Claude hace estos pasos, en este orden:

1. **Mira tu proyecto antes de preguntar.** Busca `package.json` (Node) o `requirements.txt` / `pyproject.toml`
   (Python), encuentra el archivo con el que arranca la app y revisa si tiene páginas web.
2. **Copia un archivo a tu proyecto**, al lado de tu `.env`:
   - `autofix.py` si tu app es Python (solo usa la librería estándar, no instala nada).
   - `autofix.cjs` si tu app es Node 18 o más nuevo (sin dependencias).
   - `autofix-browser.js` en la carpeta pública, si tu app tiene páginas web.
3. **Agrega una o dos líneas** donde arranca tu app para encender AutoFix. Por ejemplo, en Python:
   `import autofix; autofix.init()`. En Express, también una línea para la ruta `/autofix`.
4. **Te hace 3 preguntas, una a la vez:** qué IA explica los errores, dónde quieres los avisos y en qué idioma.
5. **Te guía para conseguir cada clave** con [SETUP.md](SETUP.md), paso a paso. Tú pegas el valor y Claude lo
   escribe en tu `.env`. Nunca te lo repite en pantalla.
6. **Lo prueba tres veces:** una revisión interna (`--test`), un aviso de prueba real (`--demo`) que te pide
   confirmar que te llegó, y arranca tu app para comprobar que sigue funcionando igual.
7. Agrega `autofix-data/` y `.env` a tu `.gitignore` para que nunca subas errores ni claves a GitHub.

## 3. Qué atrapa

| Dónde | Qué atrapa |
|---|---|
| Python | Errores que tumban el programa, errores dentro de hilos, y todo lo que se registra como ERROR (Flask, Django, FastAPI/uvicorn y gunicorn lo hacen solos) |
| Node | Errores que tumban la app y promesas rechazadas sin manejar (la app se cae igual que antes, pero después de avisar), `console.error` con un error o con palabras como "error" o "failed", y errores en rutas de Express |
| Páginas web | Errores de JavaScript, promesas rechazadas, imágenes o scripts que no cargan, y respuestas del servidor que no eran JSON (el clásico "Unexpected token '<'") con el código HTTP y la dirección |
| Lo demás | Lo que tú mandes a mano: `autofix.capture(err)` dentro de un `catch` |

## 4. Qué hace con cada error

1. **Lo limpia.** Oculta todo lo que parece una clave o contraseña (`token=…`, `password: …`, `Bearer …`)
   antes de guardarlo o enviarlo. Corta el error a 6 KB como máximo.
2. **Lo guarda** en `autofix-data/logs/AAAA-MM-DD.jsonl`, un archivo por día. Los archivos de más de 30 días se
   borran solos.
3. **Le saca una "huella"**: la primera línea del error con los números quitados. Así, "falló el pedido 1234" y
   "falló el pedido 5678" cuentan como el mismo error.
4. **Decide si avisa.** El mismo error avisa una sola vez cada 24 horas, y nunca más de 10 avisos por hora en
   total. Los demás se siguen guardando en el registro, solo que no te llegan al teléfono.
5. **Le pregunta a la IA** qué significa, qué tan grave es, la causa probable y los pasos para arreglarlo.
   Si la IA falla o no configuraste ninguna, el aviso te llega igual, sin la explicación.
6. **Escribe un reporte** en `autofix-data/reports/` (un `.md` por error nuevo) con el error, la explicación,
   los pasos y una sección "Resolución" vacía. Empieza con `status: open`.
7. **Te avisa** por cada canal que configuraste.

## 5. Qué hace cuando escribes "autofix"

Dentro del proyecto, en Claude Code, escribe **autofix**. Claude:

1. Te muestra una tabla con los reportes abiertos: fecha, gravedad y resumen.
2. Lee cada reporte completo. La explicación de la IA es una pista, no la verdad: Claude confirma la causa en tu
   código y en el registro antes de tocar nada.
3. Arregla la causa con el cambio más pequeño posible y lo comprueba (una prueba, una petición, un script).
4. Marca el reporte `status: fixed` y escribe en "Resolución" qué cambió y cómo lo comprobó.
5. Si el error no era del código (una clave mal puesta, un servicio caído, un usuario que escribió mal), te lo
   dice y lo marca `status: ignored` con la razón.

## 6. Qué IA usar

| Si tu app… | Usa | Por qué |
|---|---|---|
| **va a estar en internet para el público** | **OpenRouter** (recomendado) | Una sola clave, le pones un **límite de gasto** a esa clave, pagas por adelantado (si se acaba el crédito, se detiene en vez de cobrarte más) y cambias de modelo sin tocar el código. Modelo por defecto: `anthropic/claude-haiku-4.5` |
| es para ti, en tu computadora | Ollama | Gratis, corre en tu máquina. Ojo: un servidor en internet no puede llegar al Ollama de tu laptop |
| ya tienes cuenta de Anthropic | Claude Haiku | Barato y explica muy bien |
| ya tienes cuenta de OpenAI | ChatGPT (`gpt-5-mini`) | Funciona igual |

Costo: con Haiku, OpenAI u OpenRouter es una fracción de centavo por error. Gracias a los límites (una vez al día
por error, 10 por hora), el gasto no se dispara aunque la app falle mucho.

## 7. Dónde poner tu app: recomendamos un VPS de Hostinger

AutoFix guarda el registro de 30 días en el disco de tu servidor. En hostings "sin servidor" (Vercel, Netlify
functions) el disco se borra a cada rato: los avisos llegan, pero el registro se pierde. Por eso, para una app
pública recomendamos un **VPS de Hostinger**: un servidor tuyo, con disco que se queda, donde corre Node, Python,
Docker y también Ollama o n8n si los quieres al lado. Un plan KVM 2 (2 núcleos, 8 GB) alcanza para la app y
AutoFix con espacio de sobra.

Enlace: https://www.hostinger.com?REFERRALCODE=DI1ROUGHBIMS

*Aviso: es un enlace de afiliado. Si compras con él, AI Auto Base puede recibir una comisión, sin costo extra
para ti.*

Si de todas formas usas Vercel o Netlify, Claude pone `AUTOFIX_DIR=/tmp/autofix-data` y te avisa que el registro
no sobrevive los reinicios.

## 8. Todas las opciones del `.env`

Todas empiezan con `AUTOFIX_`. Si dejas una vacía, usa el valor por defecto.

| Opción | Para qué | Por defecto |
|---|---|---|
| `APP` | El nombre de tu app en los avisos | el nombre de la carpeta |
| `LANG` | `es` o `en` | `es` |
| `LLM` | `anthropic`, `openai`, `openrouter`, `ollama` o vacío (sin IA) | `anthropic` en el ejemplo |
| `LLM_KEY` | La clave de la IA (no hace falta para Ollama) | — |
| `LLM_MODEL` | Otro modelo | según la IA |
| `LLM_URL` | La dirección de Ollama si está en otra máquina | `http://localhost:11434` |
| `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` | Avisos por Telegram | — |
| `WHATSAPP_URL`, `WHATSAPP_INSTANCE`, `WHATSAPP_KEY`, `WHATSAPP_TO` | Avisos por WhatsApp con tu propio Evolution API | — |
| `SLACK_WEBHOOK`, `DISCORD_WEBHOOK` | Avisos a un canal | — |
| `WEBHOOK_URL` | Mandar el error a n8n (hay un workflow listo: `templates/n8n-autofix-hub.json`, ver SETUP.md), Make o Zapier | — |
| `EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Avisos por email (en Node necesita `npm i nodemailer`) | puerto 587 |
| `RETENTION_DAYS` | Cuántos días guardar | 30 |
| `MAX_ALERTS_PER_HOUR` | Tope de avisos por hora | 10 |
| `DIR` | Dónde guardar | `autofix-data` |
| `ENABLED` | `0` lo apaga todo | `1` |
| `DRY_RUN` | `1` imprime los avisos en vez de enviarlos (para probar) | `0` |

## 9. Seguridad

- **Las claves se ocultan** antes de que la IA o el chat vean el error.
- **La página web no tiene ninguna clave.** El snippet del navegador solo le manda el error a tu propio servidor,
  y es tu servidor el que habla con la IA.
- **La ruta `/autofix` es pública**, así que tiene topes: 200 errores por hora y 6 KB por error. Nadie puede
  gastarte el crédito de la IA mandando basura.
- **Tus datos se quedan en tu servidor.** Lo único que sale es el texto del error, ya limpio, hacia la IA y hacia
  tus canales.

## 10. Apagarlo o quitarlo

- Apagarlo: `AUTOFIX_ENABLED=0` en el `.env` y reinicia la app.
- Quitarlo: pídele a Claude "quita autofix de mi app". Borra las líneas que agregó, el archivo `autofix.*`,
  el snippet y la carpeta `autofix-data/`.

## 11. Si algo no funciona

| Ves esto | Qué significa | Qué hacer |
|---|---|---|
| `--demo` dice `NO CHANNEL CONFIGURED` | No hay ningún canal en el `.env` | Configura al menos Telegram |
| `FAILED: AI ... 401` | La clave de la IA está mal o sin crédito | Revisa la clave y el saldo |
| `FAILED: AI ... 404` | El nombre del modelo no existe | Deja `AUTOFIX_LLM_MODEL` vacío |
| `FAILED: telegram` | Token o chat id mal | Mándale un mensaje a tu bot y pide a Claude que vuelva a leer el chat id |
| No llega nada de la página web | El script no carga o la ruta no responde | Abre la consola del navegador (F12); el `<script>` debe ir justo después de `<meta charset>` |
| Llegan muchos avisos iguales | Errores con texto distinto cada vez | Normal hasta 10 por hora; pídele a Claude que los arregle con "autofix" |

## 12. Qué está probado y qué no

**Probado con envíos reales:** las 4 IAs (Claude Haiku, ChatGPT, OpenRouter, Ollama), Telegram, WhatsApp con
Evolution API y email por SMTP. Dos apps de prueba con errores sembrados a propósito: una tienda en Next.js y un
sistema de reservas en Flask. Los 5 errores llegaron explicados en español, incluidos los de la página web.

El workflow **AutoFix Hub** para n8n (2.45) se probó con envíos reales por email (con el `.md` adjunto), Telegram,
WhatsApp y push ntfy, con la explicación de Claude Sonnet 4.5 vía OpenRouter y también sin IA.

**Sin probar:** instalar el skill en una computadora limpia y pedirlo por voz a Claude (ver arriba), Slack,
Discord, Make/Zapier, email desde apps Node, Django y FastAPI; en el workflow de n8n: Slack, Discord, SMS y llamada.

**Cuéntanos en la comunidad** qué probaste y qué pasó. Con eso sacamos la próxima versión.

## 13. Qué NO hace

- No arregla nada solo. Te avisa y deja el reporte; el arreglo pasa cuando tú escribes "autofix".
- No funciona en sitios solo HTML sin servidor (GitHub Pages, un Netlify estático): ahí no hay dónde esconder la
  clave de la IA.
- No soporta todavía PHP, Go, Ruby ni otros lenguajes.
- No reemplaza un sistema de monitoreo profesional (Sentry, Datadog) para una empresa grande. Es para tus apps.
