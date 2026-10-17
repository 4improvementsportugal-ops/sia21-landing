/**
 * SIA21 Human-Gated Meta Pixel (MTHD)
 * Cookie consent is the OUTER gate. Call this only after 4i_cookie_consent_v1 === "accepted".
 * PageView waits for assets/human-gate.js (SIA21_onHuman / window.__SIA21_HUMAN).
 * Instant PageView when the human gate matches INSTANT_PATHS
 * (/obrigado.html, /obrigado, /ghl-agencias/obrigado.html), including prefixed
 * paths such as /sia21-landing/obrigado.html (indexOf !== -1).
 * Purchase on thank-you pages stays in onInit and does not wait for PageView.
 * This file must not call fbq("track", "Purchase"). That call lives only in
 * assets/sia21-purchase.js.
 */
(function (w, d) {
  "use strict";

  var DEFAULT_PIXEL_ID = "1506988540335331";
  var DEFAULT_INSTANT_PATHS = ["/obrigado.html", "/obrigado", "/ghl-agencias/obrigado.html"];

  function ensureFbqStub() {
    if (w.fbq) return;
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(w, d, "script", "https://connect.facebook.net/en_US/fbevents.js");
  }

  function pathMatchesInstant(pathname, instantPaths) {
    var path = pathname || "";
    for (var i = 0; i < instantPaths.length; i++) {
      var entry = instantPaths[i];
      if (entry && path.indexOf(entry) !== -1) return true;
    }
    return false;
  }

  /**
   * @param {object} options
   * @param {string} [options.pixelId]
   * @param {string[]} [options.instantPaths]  match with pathname.indexOf(entry) !== -1
   * @param {function} [options.onInit]  called once right after fbq init (before PageView)
   * @param {function} [options.onHuman] called when the human gate opens, alongside PageView
   */
  w.SIA21_startHumanGatedPixel = function (options) {
    options = options || {};
    if (typeof w.SIA21_allowCapture === "function" && !w.SIA21_allowCapture()) return;
    if (!w.__SIA21_HUMAN && typeof w.SIA21_onHuman === "function") {
      w.SIA21_onHuman(function () { w.SIA21_startHumanGatedPixel(options); });
      return;
    }
    var pixelId = String(options.pixelId || DEFAULT_PIXEL_ID);
    var instantPaths = options.instantPaths && options.instantPaths.length
      ? options.instantPaths
      : DEFAULT_INSTANT_PATHS.slice();
    var onInit = typeof options.onInit === "function" ? options.onInit : function () {};

    if (!/^\d+$/.test(pixelId)) return;

    if (w.__SIA21_MTHD_STARTED) {
      if (typeof options.onInit === "function" && !w.__SIA21_MTHD_ONINIT_DONE) {
        w.__SIA21_MTHD_ONINIT_DONE = true;
        try { onInit(); } catch (e) {}
      }
      return;
    }
    w.__SIA21_MTHD_STARTED = true;

    ensureFbqStub();

    try { w.fbq("consent", "grant"); } catch (e) {}
    try { w.fbq("set", "autoConfig", false, pixelId); } catch (e) {}
    w.fbq("init", pixelId);

    w.__SIA21_MTHD_ONINIT_DONE = true;
    try { onInit(); } catch (e) {}

    var pageViewFired = false;
    function firePageView() {
      if (pageViewFired) return;
      pageViewFired = true;
      try { w.fbq("track", "PageView"); } catch (e) {}
    }

    function onHumanSignal() {
      if (typeof options.onHuman === "function") {
        try { options.onHuman(); } catch (e) {}
      }
      firePageView();
    }

    if (typeof w.SIA21_onHuman === "function") {
      w.SIA21_onHuman(onHumanSignal);
      return;
    }

    // Gate script missing: thank-you paths still fire. Every other page stays silent.
    if (pathMatchesInstant(w.location.pathname, instantPaths)) onHumanSignal();
  };

  w.SIA21_loadMTHDPixel = w.SIA21_startHumanGatedPixel;
})(window, document);
