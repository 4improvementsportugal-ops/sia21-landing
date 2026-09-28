/**
 * SIA21 Human-Gated Meta Pixel (MTHD)
 * Cookie consent is the OUTER gate — call this only after 4i_cookie_consent_v1 === "accepted".
 * Instant PageView when pathname contains any instantPaths entry (indexOf !== -1),
 * so /sia21-landing/obrigado.html matches '/obrigado.html' and '/obrigado'.
 */
(function (w, d) {
  "use strict";

  var DEFAULT_PIXEL_ID = "1506988540335331";
  var DEFAULT_INSTANT_PATHS = ["/obrigado.html", "/obrigado"];

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
   * @param {function} [options.onInit]  called once right after fbq init (before/alongside PageView schedule)
   */
  w.SIA21_startHumanGatedPixel = function (options) {
    options = options || {};
    var pixelId = String(options.pixelId || DEFAULT_PIXEL_ID);
    var instantPaths = options.instantPaths && options.instantPaths.length
      ? options.instantPaths
      : DEFAULT_INSTANT_PATHS.slice();
    var onInit = typeof options.onInit === "function" ? options.onInit : function () {};

    if (!/^\d+$/.test(pixelId)) return;

    // Idempotent: if already started for this page, still invoke onInit once per call only if not yet inited
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
      cleanup();
    }

    var cleaned = false;
    var moveCount = 0;
    var timerId = null;

    function onScroll() {
      var y = w.scrollY || d.documentElement.scrollTop || d.body.scrollTop || 0;
      if (y > 80) firePageView();
    }
    function onWheel() { firePageView(); }
    function onKey() { firePageView(); }
    function onClick() { firePageView(); }
    function onTouch() { firePageView(); }
    function onMove() {
      moveCount += 1;
      if (moveCount > 3) firePageView();
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (timerId) { clearTimeout(timerId); timerId = null; }
      w.removeEventListener("scroll", onScroll, true);
      w.removeEventListener("wheel", onWheel, true);
      w.removeEventListener("keydown", onKey, true);
      w.removeEventListener("click", onClick, true);
      w.removeEventListener("touchstart", onTouch, true);
      w.removeEventListener("mousemove", onMove, true);
    }

    if (pathMatchesInstant(w.location.pathname, instantPaths)) {
      firePageView();
      return;
    }

    w.addEventListener("scroll", onScroll, true);
    w.addEventListener("wheel", onWheel, true);
    w.addEventListener("keydown", onKey, true);
    w.addEventListener("click", onClick, true);
    w.addEventListener("touchstart", onTouch, true);
    w.addEventListener("mousemove", onMove, true);

    timerId = setTimeout(function () {
      try {
        if (d.hasFocus && d.hasFocus()) firePageView();
      } catch (e) {}
    }, 6000);
  };

  // Alias used in some call sites
  w.SIA21_loadMTHDPixel = w.SIA21_startHumanGatedPixel;
})(window, document);
