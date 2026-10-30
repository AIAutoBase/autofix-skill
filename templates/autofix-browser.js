/* AutoFix browser snippet: sends page errors to your own server's POST /autofix route.
   <script src="/autofix-browser.js" data-endpoint="/autofix"></script>   (load it first in <head>)
   Manual report: window.AutoFix.report(error)
   No API keys here on purpose: anything in the browser is public. */
(function () {
  var s = document.currentScript;
  var endpoint = (s && s.getAttribute('data-endpoint')) || '/autofix';
  var seen = {}, sent = 0;
  function send(message, stack) {
    var key = String(message).slice(0, 200);
    if (seen[key] || sent >= 20) return;          // max 20 different errors per page view
    seen[key] = 1; sent++;
    var body = JSON.stringify({
      message: String(message).slice(0, 2000), stack: String(stack || '').slice(0, 4000),
      url: location.href, userAgent: navigator.userAgent
    });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      else fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
    } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) send('Failed to load: ' + (t.src || t.href), t.outerHTML.slice(0, 300));
    else send(e.message, e.error && e.error.stack);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    send((r && r.message) || String(r), r && r.stack);
  });
  // Chromium does not fire 'unhandledrejection' for fetch(...).then(r => r.json()) when the body is not JSON
  // (the classic beginner bug: the server answered with an HTML error page), so report it here, with status and URL.
  if (window.Response && Response.prototype.json) {
    var json = Response.prototype.json;
    Response.prototype.json = function () {
      var res = this;
      return json.call(res).catch(function (err) {
        send(err.message + ' (HTTP ' + res.status + ' ' + res.url + ')', err.stack);
        throw err;
      });
    };
  }
  window.AutoFix = { report: function (err) { send((err && err.message) || String(err), err && err.stack); } };
})();
