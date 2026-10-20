/**
 * SIA21 Human-Gated Meta Pixel (MTHD)
 * Cookie consent is the OUTER gate. Call this only after 4i_cookie_consent_v1 === "accepted".
 * PageView waits for assets/human-gate.js (SIA21_onHuman / window.__SIA21_HUMAN).
 * Instant PageView when the human gate matches INSTANT_PATHS
 * (/obrigado.html, /obrigado, /ghl-agencias/obrigado.html), including prefixed
 * paths such as /sia21-landing/obrigado.html (indexOf !== -1).
 * Purchase on thank-you pages stays in onInit and does not wait for PageView.
 * This file must not call fbq("track", "Purchase"). That call lives only in
 * assets/sia21-purchase.js. The fbq stub drops every other Purchase
 * (track, trackCustom, trackSingle, trackSingleCustom) unless
 * window.__SIA21_PURCHASE_ALLOW is true, which only firePurchaseOnce sets.
 * SIA21_trackingSuppressed() (human-gate.js) blocks fbevents.js and every fbq
 * call for QA flags, stored sia21_qa, webdriver, and automated user agents.
 * SIA21_metaHostAllowed() must be true before fbevents.js is inserted and
 * before any fbq call. /obrigado is not exempt from that host guard.
 *
 * Before the fbevents.js tag is inserted, and again immediately before
 * fbq("init"), this file queues:
 *   fbq("set", "autoConfig", false, pixelId)
 *   fbq("set", "autoConfig", false)
 *   fbq("set", "smartSetup", false, pixelId)
 *   fbq("set", "smartSetup", false)
 * The call with a pixel id only opts that pixel out of the AutomaticSetup
 * group. The call without an id is what sets disableAutoConfig. The inferred
 * button-click listener (SubscribedButtonClick, which Meta can record as
 * Purchase for text such as "Comprar agora") returns immediately when that
 * flag is set. The pixel config later opts InferredEvents back in; the
 * global flag still stops the listener.
 */
(function (w, d) {
  "use strict";

  var DEFAULT_PIXEL_ID = "1506988540335331";
  var DEFAULT_INSTANT_PATHS = ["/obrigado.html", "/obrigado", "/ghl-agencias/obrigado.html"];

  function fallbackMetaHost() {
    var loc = w.location;
    if (!loc || loc.protocol !== "https:") return false;
    if (loc.protocol === "file:") return false;
    var host = String(loc.hostname || "");
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "raw.githack.com" || host.indexOf("githack.com") !== -1) return false;
    if (host !== "4improvementsportugal-ops.github.io") return false;
    var port = String(loc.port || "");
    if (port && port !== "443") return false;
    if (/[?&]meta_debug=1(?:&|$)/.test(String(loc.search || ""))) return true;
    return true;
  }

  function metaHostAllowed() {
    if (typeof w.SIA21_metaHostAllowed === "function") return w.SIA21_metaHostAllowed() === true;
    var ok = false;
    try { ok = fallbackMetaHost(); } catch (e) { ok = false; }
    if (!ok && !w.__SIA21_META_HOST_LOGGED) {
      w.__SIA21_META_HOST_LOGGED = true;
      try { console.info("meta tracking disabled on non-production host"); } catch (e2) {}
    }
    return ok;
  }

  function trackingBlocked() {
    if (!metaHostAllowed()) return true;
    if (typeof w.SIA21_trackingSuppressed !== "function" || w.SIA21_trackingSuppressed()) return true;
    if (typeof w.SIA21_allowCapture === "function" && !w.SIA21_allowCapture()) return true;
    return false;
  }

  function isPurchaseCommand(args) {
    var cmd = String(args && args[0] || "");
    if (cmd === "track" || cmd === "trackCustom") return args[1] === "Purchase";
    if (cmd === "trackSingle" || cmd === "trackSingleCustom") return args[2] === "Purchase";
    return false;
  }

  function purchaseBlocked(args) {
    return isPurchaseCommand(args) && w.__SIA21_PURCHASE_ALLOW !== true;
  }

  function lockAutomatic(pixelId) {
    if (typeof w.fbq !== "function") return;
    var id = String(pixelId || DEFAULT_PIXEL_ID);
    try { w.fbq("set", "autoConfig", false, id); } catch (e) {}
    try { w.fbq("set", "autoConfig", false); } catch (e2) {}
    try { w.fbq("set", "smartSetup", false, id); } catch (e3) {}
    try { w.fbq("set", "smartSetup", false); } catch (e4) {}
  }

  function ensureFbqStub() {
    if (trackingBlocked()) return;
    if (w.fbq) {
      lockAutomatic(DEFAULT_PIXEL_ID);
      return;
    }
    var n = function () {
      if (!metaHostAllowed()) return;
      if (purchaseBlocked(arguments)) return;
      if (n.callMethod) n.callMethod.apply(n, arguments);
      else n.queue.push(arguments);
    };
    w.fbq = n;
    if (!w._fbq) w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    var rawCall = null;
    try {
      Object.defineProperty(n, "callMethod", {
        configurable: true,
        enumerable: true,
        get: function () { return rawCall; },
        set: function (fn) {
          if (typeof fn !== "function") {
            rawCall = fn;
            return;
          }
          rawCall = function () {
            if (!metaHostAllowed()) return;
            if (purchaseBlocked(arguments)) return;
            return fn.apply(this, arguments);
          };
        }
      });
    } catch (e) {}
    // Queue the kill switch before the tag exists so it is ahead of init
    // when fbevents drains fbq.queue.
    lockAutomatic(DEFAULT_PIXEL_ID);
    if (!metaHostAllowed()) return;
    var t = d.createElement("script");
    t.async = true;
    t.src = "https://connect.facebook.net/en_US/fbevents.js";
    var s = d.getElementsByTagName("script")[0];
    if (s && s.parentNode) s.parentNode.insertBefore(t, s);
    else (d.head || d.documentElement).appendChild(t);
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
    if (trackingBlocked()) return;
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
    if (trackingBlocked()) return;
    w.__SIA21_MTHD_STARTED = true;

    ensureFbqStub();
    if (trackingBlocked() || typeof w.fbq !== "function") return;

    if (!metaHostAllowed()) return;
    try { w.fbq("consent", "grant"); } catch (e) {}
    lockAutomatic(pixelId);
    if (!metaHostAllowed()) return;
    w.fbq("init", pixelId);

    w.__SIA21_MTHD_ONINIT_DONE = true;
    try { onInit(); } catch (e) {}

    var pageViewFired = false;
    function firePageView() {
      if (pageViewFired || trackingBlocked() || !metaHostAllowed() || typeof w.fbq !== "function") return;
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
