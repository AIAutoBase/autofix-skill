// AutoFix for Node apps (Node 18+): 30-day error log + AI explanation + alerts. No dependencies.
//
//   const autofix = require('./autofix.cjs'); autofix.init();     // CommonJS, first lines of your app
//   import autofix from './autofix.cjs'; autofix.init();          // ES modules / TypeScript
//   autofix.capture(errOrText)                                    // report something by hand
//   app.use(autofix.expressErrorHandler())                        // Express: after your routes
//   app.post('/autofix', autofix.browserRoute())                  // browser errors (autofix-browser.js)
//   autofix.browserReport(jsonBody)                               // same, for Next.js / other frameworks
//
//   node autofix.cjs --test     offline self-check        node autofix.cjs --demo     real end-to-end alert
//
// Catches: uncaught exceptions, unhandled promise rejections, and console.error calls that look like errors.
// Email needs `npm i nodemailer` (optional); every other channel is plain HTTPS.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const C = {};
const browser = { hour: 0, n: 0 };
const ERR = /\b(error|exception|fatal|failed|unhandled)\b/i;
const SECRET = /((?:api[_-]?key|token|secret|password|passwd|authorization)["']?\s*[:=]\s*["']?(?:bearer\s+)?|bearer\s+)[^\s"',]+/gi;   // key=value / "key": "value" / Bearer value
const MODELS = { anthropic: 'claude-haiku-5-5', openai: 'gpt-5-mini', openrouter: 'anthropic/claude-haiku-4.5', ollama: 'gemma3:4b' };
const BASES = { openai: 'https://api.openai.com/v1', openrouter: 'https://openrouter.ai/api/v1', ollama: 'http://localhost:11434' };
const ICON = { high: '🔴', medium: '🟠', low: '🟡' };
const T = {
  es: { lang: 'Spanish', error: 'Error (tal cual)', cause: 'Causa probable', steps: 'Cómo arreglarlo',
    files: 'Archivos o servicios implicados', none: '(no identificados)', resolution: 'Resolución', pending: '_(pendiente)_',
    noai: 'Sin análisis de IA', tell: 'Para arreglarlo abre el proyecto en Claude Code y escribe: autofix',
    fixTitle: 'Instrucciones para Claude Code',
    fix: 'Este análisis lo hizo un modelo pequeño: es una pista, no la verdad.\n\n' +
      '1. Confirma el error en el código y los logs reales antes de editar.\n' +
      '2. Arregla la causa raíz con el cambio mínimo.\n' +
      '3. Ejecuta una prueba que demuestre que ya no ocurre.\n' +
      '4. Cambia `status: open` a `status: fixed` y escribe abajo qué cambiaste.' },
  en: { lang: 'English', error: 'Error (as logged)', cause: 'Probable cause', steps: 'How to fix it',
    files: 'Files or services involved', none: '(none identified)', resolution: 'Resolution', pending: '_(pending)_',
    noai: 'No AI analysis', tell: 'To fix it, open the project in Claude Code and type: autofix',
    fixTitle: 'Instructions for Claude Code',
    fix: 'This analysis came from a small model: treat it as a hint, not the truth.\n\n' +
      '1. Confirm the error in the real code and logs before editing.\n' +
      '2. Fix the root cause with the smallest change.\n' +
      '3. Run a check that proves it no longer happens.\n' +
      '4. Change `status: open` to `status: fixed` and write below what you changed.' },
};
const PROMPT = (lang, ev) => `You are a senior support engineer. A beginner built this app. Explain the error below.
Reply with ONLY a JSON object with these keys, all values written in ${lang}:
"summary" (one plain sentence a beginner understands), "severity" ("high"|"medium"|"low"),
"cause" (2-3 sentences), "steps" (list of 3-6 concrete steps to fix it, with commands if useful),
"files" (list of files, services or settings involved; only ones that appear in the error).
Do not invent paths. If you are not sure, say so.

App: ${ev.app} | where: ${ev.source}
Error:
${ev.error}`;

const env = (k, d = '') => (process.env['AUTOFIX_' + k] || '').trim() || d;   // empty value in .env = use the default
// Project root: this file's folder when it sits beside package.json; bundlers (Next.js) move it, then use cwd.
const ROOT = fs.existsSync(path.join(__dirname, 'package.json')) ? __dirname : process.cwd();

function loadDotenv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?(AUTOFIX_[A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    const v = m[2].trim();
    process.env[m[1]] = /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v.replace(/(^|\s+)#.*$/, '');   // drop comments
  }
}

function init(opts = {}) {
  loadDotenv();
  if (env('ENABLED', '1') === '0') return module.exports;
  const llm = env('LLM').toLowerCase();
  let base = env('LLM_URL', BASES[llm] || '').replace(/\/+$/, '');
  if (llm === 'ollama' && !base.endsWith('/v1')) base += '/v1';
  const dir = path.resolve(ROOT, env('DIR', 'autofix-data'));   // an absolute AUTOFIX_DIR wins
  Object.assign(C, {
    app: opts.app || env('APP', path.basename(process.cwd())), lang: T[env('LANG', 'es')] ? env('LANG', 'es') : 'es',
    llm, key: env('LLM_KEY'), model: env('LLM_MODEL', MODELS[llm] || ''), base,
    logs: path.join(dir, 'logs'), reports: path.join(dir, 'reports'), state: path.join(dir, 'state.json'),
    days: +env('RETENTION_DAYS', '30'), perHour: +env('MAX_ALERTS_PER_HOUR', '10'), dry: env('DRY_RUN') === '1', day: '',
  });
  fs.mkdirSync(C.logs, { recursive: true });
  fs.mkdirSync(C.reports, { recursive: true });
  if (opts.hooks === false) return module.exports;

  // Keep Node's default "crash on uncaught error", but send the alert first (max 20 s).
  const orig = console.error.bind(console);
  const die = (err) => {
    orig(err);
    Promise.race([capture(err, 'crash'), new Promise((r) => setTimeout(r, 20000))]).finally(() => process.exit(1));
  };
  process.on('uncaughtException', die);
  process.on('unhandledRejection', die);
  console.error = (...args) => {
    orig(...args);
    const err = args.find((a) => a instanceof Error);
    const text = args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : safeJson(a))).join(' ');
    if (err || ERR.test(text)) capture(err && args.length === 1 ? err : text, 'console').catch(() => {});
  };
  return module.exports;
}

const safeJson = (a) => { try { return JSON.stringify(a); } catch { return String(a); } };
const redact = (s) => s.replace(SECRET, '$1***');

function signature(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let key = lines[0] || '';
  if (key.startsWith('Traceback')) key = lines[lines.length - 1];       // Python-style traces end with the error
  key = key.replace(/0x[0-9a-f]+|\d+/gi, '#');                          // ids/line numbers vary between repeats
  return crypto.createHash('sha1').update(`${C.app}|${key}`).digest('hex').slice(0, 12);
}

function prune() {
  const today = new Date().toISOString().slice(0, 10);
  if (C.day === today) return;
  C.day = today;
  const cutoff = Date.now() - C.days * 86400e3;
  for (const d of [C.logs, C.reports])
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isFile() && fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true });
    }
}

function shouldAlert(sig) {
  // ponytail: one JSON state file per app; pm2/cluster workers can race and double-alert, rare and harmless
  let st = {};
  try { st = JSON.parse(fs.readFileSync(C.state, 'utf8')); } catch {}
  const now = Date.now() / 1000;
  const seen = Object.fromEntries(Object.entries(st.seen || {}).filter(([, t]) => now - t < 86400));
  const hour = (st.hour || []).filter((t) => now - t < 3600);
  const ok = !(sig in seen) && hour.length < C.perHour;
  if (ok) { seen[sig] = now; hour.push(now); }
  fs.writeFileSync(C.state, JSON.stringify({ seen, hour }));
  return ok;
}

/** Log an error (Error or text) and, if it is new, analyse it and send alerts. Resolves when done. */
async function capture(err, source = 'server', extra) {
  if (!C.app) init({ hooks: false });   // bundlers (Next.js) give each route its own copy: configure on the fly
  if (!C.app || err == null) return;
  let text = err instanceof Error ? err.stack || String(err) : typeof err === 'string' ? err : safeJson(err);
  if (err && err.cause instanceof Error) text += `\nCaused by: ${err.cause.stack}`;
  text = redact(text).trim().slice(0, 6000);
  const ev = { ts: new Date().toISOString(), app: C.app, host: os.hostname(), source, error: text };
  if (extra) ev.extra = extra;
  try {
    prune();
    fs.appendFileSync(path.join(C.logs, `${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify(ev) + '\n');
    const sig = signature(text);
    if (!shouldAlert(sig)) return;
    const a = await analyse(ev);
    await notify(ev, a, writeReport(ev, sig, a));
  } catch (e) {
    process.stderr.write(`autofix: ${e.message}\n`);
  }
}

/** Browser errors: pass the parsed JSON body sent by autofix-browser.js. */
function browserReport(body) {
  if (!body || typeof body !== 'object') return;
  const h = Math.floor(Date.now() / 3600e3);
  if (browser.hour !== h) Object.assign(browser, { hour: h, n: 0 });
  if (++browser.n > 200) return;              // public endpoint: cap writes so spam can't fill the disk
  const msg = String(body.message || '').slice(0, 2000), stack = String(body.stack || '').slice(0, 4000);
  capture(`${msg}\n${stack}`.trim(), 'browser', {
    url: String(body.url || '').slice(0, 300), userAgent: String(body.userAgent || '').slice(0, 200),
  }).catch(() => {});
}

/** Express/Connect route handler for POST /autofix. Works with or without express.json(). */
function browserRoute() {
  return (req, res) => {
    const done = (b) => { browserReport(b); res.statusCode = 204; res.end(); };
    if (req.body && typeof req.body === 'object') return done(req.body);
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 16384) req.destroy(); });
    req.on('end', () => { try { done(JSON.parse(raw)); } catch { res.statusCode = 400; res.end(); } });
  };
}

/** Express error middleware: register after your routes. Logs, then lets Express answer as usual. */
function expressErrorHandler() {
  return (err, req, res, next) => {
    capture(err, 'server', { method: req.method, url: req.originalUrl || req.url }).catch(() => {});
    next(err);
  };
}

async function post(url, body, headers = {}, timeoutMs = 60000) {
  const r = await fetch(url, {
    method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'autofix/1.0', ...headers },
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${raw.slice(0, 200)}`);
  try { return JSON.parse(raw); } catch { return raw; }
}

const parseJson = (s) => {   // models sometimes wrap JSON in ``` fences or prose
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in the answer: ${JSON.stringify(s.slice(0, 80))}`);
  return JSON.parse(m[0]);
};

async function analyse(ev) {
  const t = T[C.lang];
  if (!C.llm || (!C.key && ['anthropic', 'openai', 'openrouter'].includes(C.llm))) return { summary: t.noai, severity: 'medium', cause: '', steps: [], files: [] };
  const prompt = PROMPT(t.lang, ev);
  let err;
  for (let i = 0; i < 2; i++) {   // one retry: now and then a model answers without valid JSON
    try {
      let out;
      if (C.llm === 'anthropic') {
        // 4000, not ~1000: Haiku 5.5 thinks first and the thinking comes out of the same budget
        const r = await post('https://api.anthropic.com/v1/messages',
          { model: C.model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] },
          { 'x-api-key': C.key, 'anthropic-version': '2023-06-01' });
        out = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');   // skip thinking blocks
      } else {   // openai, openrouter, ollama and any other OpenAI-compatible server share this path
        const r = await post(`${C.base}/chat/completions`,
          { model: C.model, messages: [{ role: 'user', content: prompt }] },
          C.key ? { Authorization: `Bearer ${C.key}` } : {}, C.llm === 'ollama' ? 300000 : 60000);
        out = r.choices[0].message.content || '';
      }
      return parseJson(out);
    } catch (e) {   // the LLM being down must never lose the alert
      err = e;
    }
  }
  (C.failed ||= []).push(`AI (${C.llm} ${C.model}): ${err.message}`);
  return { summary: `${t.noai} (${C.llm}: ${String(err.message).slice(0, 150)})`, severity: 'medium', cause: '', steps: [], files: [] };
}

function writeReport(ev, sig, a) {
  const t = T[C.lang], now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');
  const file = path.join(C.reports, `${stamp}_${sig}.md`);
  const steps = (a.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n') || '-';
  const files = (a.files || []).map((f) => `- \`${f}\``).join('\n') || `- ${t.none}`;
  const extra = ev.extra ? `\n\`\`\`json\n${JSON.stringify(ev.extra, null, 1)}\n\`\`\`\n` : '';
  fs.writeFileSync(file, `---
type: autofix-report
app: ${ev.app}
host: ${ev.host}
source: ${ev.source}
signature: ${sig}
severity: ${a.severity || 'medium'}
detected: ${ev.ts}
analyzed_by: ${C.llm || 'none'} ${C.model}
status: open
---

# ${ICON[a.severity] || '⚪'} ${a.summary || ''}

## ${t.error}

\`\`\`text
${ev.error}
\`\`\`
${extra}
## ${t.cause}

${a.cause || ''}

## ${t.steps}

${steps}

## ${t.files}

${files}

## ${t.fixTitle}

${t.fix}

## ${t.resolution}

${t.pending}
`);
  return file;
}

async function notify(ev, a, report) {
  const t = T[C.lang];
  const first = ev.error.split('\n').find((l) => l.trim()) || '';
  const steps = (a.steps || []).slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join('\n');
  const text = redact(`${ICON[a.severity] || '⚪'} AutoFix · ${ev.app} (${ev.host})\n${first.slice(0, 200)}\n\n` +
    `${a.summary || ''}\n\n${steps}\n\n📄 ${report}\n${t.tell}`).replace(/\n{3,}/g, '\n\n');
  if (C.dry) return void console.log(`--- autofix DRY RUN ---\n${text}`);
  const sends = [];
  const send = (name, p) => sends.push(p.then(() => (C.sent ||= []).push(name), (e) => {
    (C.failed ||= []).push(`${name}: ${e.message}`);
    process.stderr.write(`autofix: ${name} failed: ${e.message}\n`);
  }));
  if (env('TELEGRAM_TOKEN') && env('TELEGRAM_CHAT_ID'))
    send('telegram', post(`https://api.telegram.org/bot${env('TELEGRAM_TOKEN')}/sendMessage`, { chat_id: env('TELEGRAM_CHAT_ID'), text: text.slice(0, 4000) }));
  if (env('WHATSAPP_URL') && env('WHATSAPP_TO'))
    send('whatsapp', post(`${env('WHATSAPP_URL').replace(/\/+$/, '')}/message/sendText/${env('WHATSAPP_INSTANCE')}`,
      { number: env('WHATSAPP_TO'), text }, { apikey: env('WHATSAPP_KEY') }));
  if (env('SLACK_WEBHOOK')) send('slack', post(env('SLACK_WEBHOOK'), { text }));
  if (env('DISCORD_WEBHOOK')) send('discord', post(env('DISCORD_WEBHOOK'), { content: text.slice(0, 1900) }));
  if (env('WEBHOOK_URL')) send('webhook', post(env('WEBHOOK_URL'), { event: ev, analysis: a, report, text }));
  if (env('EMAIL_TO') && env('SMTP_HOST')) send('email', (async () => {
    let nodemailer;
    // createRequire: bundlers don't see it, so apps without nodemailer get no "module not found" warning
    try { nodemailer = require('module').createRequire(path.join(ROOT, 'package.json'))('nodemailer'); } catch { throw new Error('run `npm i nodemailer` to enable email'); }
    const port = +env('SMTP_PORT', '587');
    await nodemailer.createTransport({ host: env('SMTP_HOST'), port, secure: port === 465,
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined })
      .sendMail({ from: env('SMTP_FROM', env('SMTP_USER')), to: env('EMAIL_TO'),
        subject: `${ICON[a.severity] || '⚪'} AutoFix · ${ev.app}: ${(a.summary || '').slice(0, 120)}`,
        text: `${text}\n\n${fs.readFileSync(report, 'utf8')}` });
  })());
  await Promise.all(sends);
}

async function selfTest() {
  const assert = require('assert');
  Object.assign(process.env, { AUTOFIX_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-')), AUTOFIX_DRY_RUN: '1', AUTOFIX_LLM: '', AUTOFIX_MAX_ALERTS_PER_HOUR: '2' });
  init({ app: 'selftest', hooks: false });
  assert.equal(redact('token=abc123 x'), 'token=*** x');
  assert.equal(redact('"password": "hunter2"'), '"password": "***"');
  assert.equal(redact('Authorization: Bearer sk-1'), 'Authorization: Bearer ***');
  assert.equal(redact("Unexpected token '<' in JSON"), "Unexpected token '<' in JSON", 'plain words are not secrets');
  assert.equal(signature('TypeError: id 42 missing'), signature('TypeError: id 99 missing'));
  assert.notEqual(signature("TypeError: a is undefined"), signature("RangeError: bad length"));
  fs.writeFileSync(path.join(process.env.AUTOFIX_DIR, '.env'), 'AUTOFIX_ZZ_A=es   # comment\nAUTOFIX_ZZ_B="a # b"\nAUTOFIX_ZZ_C=     # only a comment\n');
  loadDotenv(path.join(process.env.AUTOFIX_DIR, '.env'));
  assert.equal(process.env.AUTOFIX_ZZ_A, 'es'); assert.equal(process.env.AUTOFIX_ZZ_B, 'a # b');
  assert.equal(process.env.AUTOFIX_ZZ_C, ''); assert.equal(env('ZZ_C', 'default'), 'default', 'empty value must fall back');
  assert.deepEqual(parseJson('```json\n{"summary": "x"}\n```'), { summary: 'x' });
  const old = path.join(C.logs, '2000-01-01.jsonl');
  fs.writeFileSync(old, '{}'); fs.utimesSync(old, 0, 0);
  await capture(new Error('first'));
  assert(!fs.existsSync(old), 'files older than retention must be deleted');
  await capture(new Error('first'));            // same error -> deduped
  await capture(new TypeError('second'));
  await capture(new RangeError('third'));       // over the hourly cap -> logged, not alerted
  assert.equal(fs.readdirSync(C.reports).length, 2, 'dedupe + hourly cap');
  assert.equal(fs.readFileSync(path.join(C.logs, `${new Date().toISOString().slice(0, 10)}.jsonl`), 'utf8').trim().split('\n').length, 4, 'every error is logged');
  console.log('(the DRY RUN blocks above are expected)\nautofix self-check OK');
}

module.exports = { init, capture, browserReport, browserRoute, expressErrorHandler, redact, signature };
module.exports.default = module.exports;

if (require.main === module) {
  if (process.argv.includes('--test')) selfTest().catch((e) => { console.error(e); process.exit(1); });
  else if (process.argv.includes('--demo')) {
    init({ hooks: false });
    fs.rmSync(C.state, { force: true });          // so a repeated demo is not deduped
    capture('AutoFix demo: this is a TEST error, there is nothing to fix in the code.\n' +
      "TypeError: Cannot read properties of null (reading 'boom')", 'demo').then(() => {
      console.log(`report -> ${C.reports}`);
      console.log('sent ok: ' + ((C.sent || []).join(', ') || (C.dry ? 'dry run' : 'NO CHANNEL CONFIGURED')));
      for (const f of C.failed || []) console.log(`FAILED: ${f}`);
      process.exit(C.failed || !(C.sent || C.dry) ? 1 : 0);
    });
  } else console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 13).join('\n'));
}
