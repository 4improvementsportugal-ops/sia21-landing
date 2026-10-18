/**
 * Test double for connect.facebook.net/en_US/fbevents.js.
 * Turns queued and later fbq track calls into GET https://www.facebook.com/tr/
 * so specs can assert ev, id, cd[*] and eid. The harness must fulfill that
 * URL. This file must not be loaded by a landing page.
 */
(function () {
  var fbq = window.fbq;
  if (!fbq || fbq.__SIA21_SHIM) return;
  fbq.__SIA21_SHIM = true;
  var pixelId = "";

  function emit(ev, params, opts) {
    if (!ev) return;
    var q = new URLSearchParams();
    q.set("id", pixelId || "");
    q.set("ev", String(ev));
    if (params && typeof params === "object") {
      Object.keys(params).forEach(function (key) {
        var value = params[key];
        if (value == null || typeof value === "object") return;
        q.set("cd[" + key + "]", String(value));
      });
    }
    if (opts && opts.eventID) q.set("eid", String(opts.eventID));
    var img = new Image();
    img.src = "https://www.facebook.com/tr/?" + q.toString();
  }

  function handler() {
    var args = Array.prototype.slice.call(arguments);
    var cmd = String(args[0] || "");
    if (cmd === "init" && args[1]) pixelId = String(args[1]);
    if (cmd === "track" || cmd === "trackCustom") emit(args[1], args[2], args[3]);
    if (cmd === "trackSingle" || cmd === "trackSingleCustom") {
      if (args[1]) pixelId = String(args[1]);
      emit(args[2], args[3], args[4]);
    }
  }

  var queued = [];
  if (fbq.queue && fbq.queue.length) queued = fbq.queue.splice(0, fbq.queue.length);
  fbq.callMethod = handler;
  for (var i = 0; i < queued.length; i++) {
    try { handler.apply(fbq, queued[i]); } catch (e) {}
  }
})();
