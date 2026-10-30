"""AutoFix for Python apps: 30-day error log + AI explanation + alerts.

    import autofix; autofix.init()          # first lines of your app; reads AUTOFIX_* from env / .env
    autofix.capture(exc_or_text)            # report something by hand
    autofix.browser_report(json_body)       # call from your POST /autofix route (browser errors)

    python autofix.py --test                # offline self-check (no network)
    python autofix.py --demo                # send one fake error through the real pipeline

Catches: uncaught exceptions, thread exceptions, and anything logged at ERROR level
(Flask, Django, FastAPI/uvicorn, gunicorn log their errors this way). Stdlib only.
"""
import datetime as dt, hashlib, json, logging, os, re, smtplib, socket, sys, threading, time, traceback, urllib.request
from email.message import EmailMessage
from pathlib import Path

C = {}
_lock = threading.Lock()
_busy = threading.local()
_browser = {"hour": 0, "n": 0}

ERR = re.compile(r"\b(error|exception|fatal|failed|unhandled|traceback)\b", re.I)
SECRET = re.compile(r"""(?i)((?:api[_-]?key|token|secret|password|passwd|authorization)["']?\s*[:=]\s*["']?(?:bearer\s+)?|bearer\s+)[^\s"',]+""")   # key=value / "key": "value" / Bearer value
MODELS = {"anthropic": "claude-haiku-5-5", "openai": "gpt-5-mini",
          "openrouter": "anthropic/claude-haiku-4.5", "ollama": "gemma3:4b"}
BASES = {"openai": "https://api.openai.com/v1", "openrouter": "https://openrouter.ai/api/v1",
         "ollama": "http://localhost:11434"}
ICON = {"high": "🔴", "medium": "🟠", "low": "🟡"}
T = {
    "es": dict(lang="Spanish", error="Error (tal cual)", cause="Causa probable", steps="Cómo arreglarlo",
               files="Archivos o servicios implicados", none="(no identificados)", resolution="Resolución",
               pending="_(pendiente)_", noai="Sin análisis de IA", tell="Para arreglarlo abre el proyecto en Claude Code y escribe: autofix",
               fix_title="Instrucciones para Claude Code",
               fix="Este análisis lo hizo un modelo pequeño: es una pista, no la verdad.\n\n"
                   "1. Confirma el error en el código y los logs reales antes de editar.\n"
                   "2. Arregla la causa raíz con el cambio mínimo.\n"
                   "3. Ejecuta una prueba que demuestre que ya no ocurre.\n"
                   "4. Cambia `status: open` a `status: fixed` y escribe abajo qué cambiaste."),
    "en": dict(lang="English", error="Error (as logged)", cause="Probable cause", steps="How to fix it",
               files="Files or services involved", none="(none identified)", resolution="Resolution",
               pending="_(pending)_", noai="No AI analysis", tell="To fix it, open the project in Claude Code and type: autofix",
               fix_title="Instructions for Claude Code",
               fix="This analysis came from a small model: treat it as a hint, not the truth.\n\n"
                   "1. Confirm the error in the real code and logs before editing.\n"
                   "2. Fix the root cause with the smallest change.\n"
                   "3. Run a check that proves it no longer happens.\n"
                   "4. Change `status: open` to `status: fixed` and write below what you changed."),
}
PROMPT = """You are a senior support engineer. A beginner built this app. Explain the error below.
Reply with ONLY a JSON object with these keys, all values written in {lang}:
"summary" (one plain sentence a beginner understands), "severity" ("high"|"medium"|"low"),
"cause" (2-3 sentences), "steps" (list of 3-6 concrete steps to fix it, with commands if useful),
"files" (list of files, services or settings involved; only ones that appear in the error).
Do not invent paths. If you are not sure, say so.

App: {app} | where: {source}
Error:
{error}"""


def _env(k, d=""):
    return os.environ.get("AUTOFIX_" + k, "").strip() or d      # empty value in .env = use the default


HERE = Path(__file__).resolve().parent     # autofix.py lives in the project root, next to .env


def _load_dotenv(path=None):
    p = Path(path) if path else next((f for f in (Path(".env"), HERE / ".env") if f.exists()), HERE / ".env")
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        m = re.match(r"\s*(?:export\s+)?(AUTOFIX_[A-Z0-9_]+)\s*=\s*(.*)", line)
        if m and m.group(1) not in os.environ:
            v = m.group(2).strip()
            v = v[1:-1] if v[:1] in "\"'" and v[-1:] == v[:1] else re.sub(r"(^|\s+)#.*$", "", v)  # drop comments
            os.environ[m.group(1)] = v


def init(app=None, hooks=True):
    """Configure from AUTOFIX_* env vars and install the error hooks."""
    _load_dotenv()
    if _env("ENABLED", "1") == "0":
        return
    llm = _env("LLM").lower()
    base = _env("LLM_URL", BASES.get(llm, "")).rstrip("/")
    if llm == "ollama" and not base.endswith("/v1"):
        base += "/v1"
    data = HERE / _env("DIR", "autofix-data")     # an absolute AUTOFIX_DIR wins over HERE
    C.update(app=app or _env("APP", Path.cwd().name), lang=_env("LANG", "es") if _env("LANG", "es") in T else "es",
             llm=llm, key=_env("LLM_KEY"), model=_env("LLM_MODEL", MODELS.get(llm, "")), base=base,
             logs=data / "logs", reports=data / "reports", state=data / "state.json",
             days=int(_env("RETENTION_DAYS", "30")), per_hour=int(_env("MAX_ALERTS_PER_HOUR", "10")),
             dry=_env("DRY_RUN") == "1", day="")
    C["logs"].mkdir(parents=True, exist_ok=True)
    C["reports"].mkdir(parents=True, exist_ok=True)
    if not hooks:
        return
    prev = sys.excepthook

    def crash(t, v, tb):
        capture(v, "crash", sync=True)
        prev(t, v, tb)
    sys.excepthook = crash
    prev_t = threading.excepthook

    def thread_crash(a):
        capture(a.exc_value, "thread")
        prev_t(a)
    threading.excepthook = thread_crash
    h = _Handler(logging.ERROR)
    for name in ("", "uvicorn", "gunicorn.error"):   # uvicorn/gunicorn loggers don't propagate to root
        logging.getLogger(name).addHandler(h)


class _Handler(logging.Handler):
    def emit(self, record):
        if record.name.startswith("autofix") or getattr(_busy, "on", False):
            return
        try:
            capture(f"[{record.name}] {self.format(record)}", "log")
        except Exception:
            pass


def redact(text):
    return SECRET.sub(r"\1***", text)


def signature(text):
    lines = [l.strip() for l in text.splitlines() if l.strip()] or [""]
    key = lines[-1] if lines[0].startswith("Traceback") else lines[0]   # Python tracebacks: the last line names the error
    key = re.sub(r"0x[0-9a-f]+|\d+", "#", key, flags=re.I)              # ids/line numbers vary between repeats
    return hashlib.sha1(f"{C.get('app')}|{key}".encode()).hexdigest()[:12]


def _prune():
    today = dt.date.today().isoformat()
    if C["day"] == today:
        return
    C["day"], cutoff = today, time.time() - C["days"] * 86400
    for d in (C["logs"], C["reports"]):
        for f in d.glob("*"):
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)


def _should_alert(sig):
    # ponytail: one JSON state file per app; several worker processes can race and double-alert, rare and harmless
    with _lock:
        st = json.loads(C["state"].read_text()) if C["state"].exists() else {}
        now = time.time()
        seen = {k: t for k, t in st.get("seen", {}).items() if now - t < 86400}
        hour = [t for t in st.get("hour", []) if now - t < 3600]
        ok = sig not in seen and len(hour) < C["per_hour"]
        if ok:
            seen[sig] = now
            hour.append(now)
        C["state"].write_text(json.dumps({"seen": seen, "hour": hour}))
        return ok


def capture(err, source="server", extra=None, sync=False):
    """Log an error (exception or text) and, if new, analyse it and send alerts."""
    if not C:
        init(hooks=False)              # first error before init(): configure on the fly
    if not C or getattr(_busy, "on", False) or err is None:
        return
    if isinstance(err, BaseException):
        text = "".join(traceback.format_exception(type(err), err, err.__traceback__))
    else:
        text = str(err)
    text = redact(text).strip()[:6000]
    ev = {"ts": dt.datetime.now().isoformat(timespec="seconds"), "app": C["app"], "host": socket.gethostname(),
          "source": source, "error": text}
    if extra:
        ev["extra"] = extra
    with _lock:
        _prune()
        with (C["logs"] / f"{dt.date.today():%Y-%m-%d}.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")
    sig = signature(text)
    if not _should_alert(sig):
        return
    if sync:
        _process(ev, sig)
    else:
        threading.Thread(target=_process, args=(ev, sig), daemon=True).start()


def browser_report(body):
    """Call from your POST /autofix route with the parsed JSON body sent by autofix-browser.js."""
    if not isinstance(body, dict):
        return
    h = int(time.time() // 3600)
    if _browser["hour"] != h:
        _browser.update(hour=h, n=0)
    _browser["n"] += 1
    if _browser["n"] > 200:            # public endpoint: cap writes so spam can't fill the disk
        return
    msg, stack = str(body.get("message", ""))[:2000], str(body.get("stack", ""))[:4000]
    capture(f"{msg}\n{stack}".strip(), "browser",
            {"url": str(body.get("url", ""))[:300], "userAgent": str(body.get("userAgent", ""))[:200]})


def _post(url, body, headers=None, timeout=60):
    req = urllib.request.Request(url, json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "User-Agent": "autofix/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", "replace")
    try:
        return json.loads(raw)
    except ValueError:
        return raw


def parse_json(text):
    m = re.search(r"\{.*\}", text, re.S)       # models sometimes wrap JSON in ``` fences or prose
    if not m:
        raise ValueError(f"no JSON in the answer: {text[:80]!r}")
    return json.loads(m.group(0))


def analyse(ev):
    t = T[C["lang"]]
    if not C["llm"] or (not C["key"] and C["llm"] in ("anthropic", "openai", "openrouter")):   # no key yet: alert without the explanation
        return {"summary": t["noai"], "severity": "medium", "cause": "", "steps": [], "files": []}
    prompt = PROMPT.format(lang=t["lang"], app=ev["app"], source=ev["source"], error=ev["error"])
    err = None
    for _ in range(2):          # one retry: now and then a model answers without valid JSON
        try:
            if C["llm"] == "anthropic":
                # 4000, not ~1000: Haiku 5.5 thinks first and the thinking comes out of the same budget
                r = _post("https://api.anthropic.com/v1/messages",
                          {"model": C["model"], "max_tokens": 4000, "messages": [{"role": "user", "content": prompt}]},
                          {"x-api-key": C["key"], "anthropic-version": "2023-06-01"})
                out = "".join(b.get("text", "") for b in r["content"] if b.get("type") == "text")  # skip thinking blocks
            else:   # openai, openrouter, ollama and any other OpenAI-compatible server share this path
                r = _post(C["base"] + "/chat/completions",
                          {"model": C["model"], "messages": [{"role": "user", "content": prompt}]},
                          {"Authorization": f"Bearer {C['key']}"} if C["key"] else {},
                          timeout=300 if C["llm"] == "ollama" else 60)
                out = r["choices"][0]["message"]["content"] or ""
            return parse_json(out)
        except Exception as e:  # the LLM being down must never lose the alert
            err = e
    C.setdefault("failed", []).append(f"AI ({C['llm']} {C['model']}): {err}")
    return {"summary": f"{t['noai']} ({C['llm']}: {str(err)[:150]})", "severity": "medium",
            "cause": "", "steps": [], "files": []}


def write_report(ev, sig, a):
    t, now = T[C["lang"]], dt.datetime.now()
    path = C["reports"] / f"{now:%Y-%m-%d_%H%M%S}_{sig}.md"
    steps = "\n".join(f"{i}. {s}" for i, s in enumerate(a.get("steps") or [], 1)) or "-"
    files = "\n".join(f"- `{f}`" for f in a.get("files") or []) or f"- {t['none']}"
    extra = f"\n```json\n{json.dumps(ev['extra'], ensure_ascii=False, indent=1)}\n```\n" if ev.get("extra") else ""
    path.write_text(f"""---
type: autofix-report
app: {ev['app']}
host: {ev['host']}
source: {ev['source']}
signature: {sig}
severity: {a.get('severity', 'medium')}
detected: {ev['ts']}
analyzed_by: {C['llm'] or 'none'} {C['model']}
status: open
---

# {ICON.get(a.get('severity'), '⚪')} {a.get('summary', '')}

## {t['error']}

```text
{ev['error']}
```
{extra}
## {t['cause']}

{a.get('cause', '')}

## {t['steps']}

{steps}

## {t['files']}

{files}

## {t['fix_title']}

{t['fix']}

## {t['resolution']}

{t['pending']}
""", encoding="utf-8")
    return path


def _send(name, fn):
    try:
        fn()
        C.setdefault("sent", []).append(name)
    except Exception as e:
        C.setdefault("failed", []).append(f"{name}: {e}")
        print(f"autofix: {name} failed: {e}", file=sys.stderr)


def notify(ev, a, report):
    t = T[C["lang"]]
    first = next((l for l in ev["error"].splitlines()[::-1 if ev["error"].startswith("Traceback") else 1] if l.strip()), "")
    steps = "\n".join(f"{i}. {s}" for i, s in enumerate((a.get("steps") or [])[:4], 1))
    text = re.sub(r"\n{3,}", "\n\n", redact(f"{ICON.get(a.get('severity'), '⚪')} AutoFix · {ev['app']} ({ev['host']})\n"
                  f"{first[:200]}\n\n{a.get('summary', '')}\n\n{steps}\n\n📄 {report}\n{t['tell']}"))
    if C["dry"]:
        out = f"--- autofix DRY RUN ---\n{text}"
        print(out.encode(sys.stdout.encoding or "utf-8", "replace").decode(sys.stdout.encoding or "utf-8"))  # Windows consoles choke on emoji
        return
    e = _env
    if e("TELEGRAM_TOKEN") and e("TELEGRAM_CHAT_ID"):
        _send("telegram", lambda: _post(f"https://api.telegram.org/bot{e('TELEGRAM_TOKEN')}/sendMessage",
                                        {"chat_id": e("TELEGRAM_CHAT_ID"), "text": text[:4000]}))
    if e("WHATSAPP_URL") and e("WHATSAPP_TO"):
        _send("whatsapp", lambda: _post(f"{e('WHATSAPP_URL').rstrip('/')}/message/sendText/{e('WHATSAPP_INSTANCE')}",
                                        {"number": e("WHATSAPP_TO"), "text": text}, {"apikey": e("WHATSAPP_KEY")}))
    if e("SLACK_WEBHOOK"):
        _send("slack", lambda: _post(e("SLACK_WEBHOOK"), {"text": text}))
    if e("DISCORD_WEBHOOK"):
        _send("discord", lambda: _post(e("DISCORD_WEBHOOK"), {"content": text[:1900]}))
    if e("WEBHOOK_URL"):
        _send("webhook", lambda: _post(e("WEBHOOK_URL"), {"event": ev, "analysis": a, "report": str(report), "text": text}))
    if e("EMAIL_TO") and e("SMTP_HOST"):
        def mail():
            m = EmailMessage()
            m["Subject"] = f"{ICON.get(a.get('severity'), '⚪')} AutoFix · {ev['app']}: {a.get('summary', '')[:120]}"
            m["From"], m["To"] = e("SMTP_FROM", e("SMTP_USER")), e("EMAIL_TO")
            m.set_content(text + "\n\n" + Path(report).read_text(encoding="utf-8"))
            port = int(e("SMTP_PORT", "587"))
            s = smtplib.SMTP_SSL(e("SMTP_HOST"), port, timeout=30) if port == 465 else smtplib.SMTP(e("SMTP_HOST"), port, timeout=30)
            with s:
                if port != 465:
                    s.starttls()
                if e("SMTP_USER"):
                    s.login(e("SMTP_USER"), e("SMTP_PASS"))
                s.send_message(m)
        _send("email", mail)


def _process(ev, sig):
    _busy.on = True
    try:
        a = analyse(ev)
        notify(ev, a, write_report(ev, sig, a))
    except Exception as e:
        print(f"autofix: {e}", file=sys.stderr)
    finally:
        _busy.on = False


def _selftest():
    import tempfile
    os.environ.update(AUTOFIX_DIR=tempfile.mkdtemp(), AUTOFIX_DRY_RUN="1", AUTOFIX_LLM="", AUTOFIX_MAX_ALERTS_PER_HOUR="2")
    init("selftest", hooks=False)
    assert redact("token=abc123 x") == "token=*** x" and redact('"password": "hunter2"') == '"password": "***"'
    assert redact("Authorization: Bearer sk-1") == "Authorization: Bearer ***"
    assert redact("Unexpected token '<' in JSON") == "Unexpected token '<' in JSON", "plain words are not secrets"
    assert signature("TypeError: id 42 missing") == signature("TypeError: id 99 missing")
    assert signature("Traceback (most recent call last):\n  x\nKeyError: 'a'") != signature("Traceback (most recent call last):\n  x\nKeyError: 'b'")
    Path(os.environ["AUTOFIX_DIR"], ".env").write_text(
        'AUTOFIX_ZZ_A=es   # comment\nAUTOFIX_ZZ_B="a # b"\nAUTOFIX_ZZ_C=     # only a comment\n')
    _load_dotenv(Path(os.environ["AUTOFIX_DIR"], ".env"))
    assert os.environ["AUTOFIX_ZZ_A"] == "es" and os.environ["AUTOFIX_ZZ_B"] == "a # b"
    assert os.environ["AUTOFIX_ZZ_C"] == "" and _env("ZZ_C", "default") == "default", "empty value must fall back"
    assert parse_json('```json\n{"summary": "x"}\n```') == {"summary": "x"}
    old = C["logs"] / "2000-01-01.jsonl"
    old.write_text("{}")
    os.utime(old, (0, 0))
    capture("ValueError: first", sync=True)
    assert not old.exists(), "files older than retention must be deleted"
    capture("ValueError: first", sync=True)          # same error -> deduped
    capture("KeyError: second", sync=True)
    capture("OSError: third", sync=True)             # over the hourly cap -> logged, not alerted
    assert len(list(C["reports"].glob("*.md"))) == 2, "dedupe + hourly cap"
    assert len((C["logs"] / f"{dt.date.today():%Y-%m-%d}.jsonl").read_text().splitlines()) == 4, "every error is logged"
    print("(the DRY RUN blocks above are expected)\nautofix self-check OK")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if "--test" in sys.argv:
        _selftest()
    elif "--demo" in sys.argv:
        init(hooks=False)
        C["state"].unlink(missing_ok=True)       # so a repeated demo is not deduped
        capture("AutoFix demo: this is a TEST error, there is nothing to fix in the code.\n"
                "ZeroDivisionError: division by zero", "demo", sync=True)
        print(f"report -> {C['reports']}")
        print("sent ok: " + (", ".join(C.get("sent", [])) or ("dry run" if C["dry"] else "NO CHANNEL CONFIGURED")))
        for f in C.get("failed", []):
            print(f"FAILED: {f}")
        sys.exit(1 if C.get("failed") or not (C.get("sent") or C["dry"]) else 0)
    else:
        print(__doc__)
