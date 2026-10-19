/**
 * SIA21 human gate.
 * Loads in <head> before PostHog and before the Meta Pixel. Runs even when
 * cookie consent has not been decided. Cookie consent stays the outer gate
 * for the pixel (see SIA21_startHumanGatedPixel callers).
 *
 * Sets window.__SIA21_HUMAN and emits CustomEvent "sia21:human" after a human
 * signal, or immediately when the pathname matches INSTANT_PATHS.
 *
 * Signals: scroll > 80px, click, keydown, touchstart, wheel, more than 3
 * mousemove events, or 6s accumulated while document.visibilityState is
 * "visible" (the clock pauses while the tab is hidden).
 *
 * The 6s clock does not run when navigator.webdriver is true. Headless
 * browsers report a visible, focused tab, so a dwell timer alone lets them
 * through. Interaction signals still open the human gate. They do not send
 * PageView or PostHog when SIA21_trackingSuppressed() is true.
 *
 * Exit popups and Stripe Payment Links are stricter. They need engagement
 * that is not the click itself: trusted scroll past 80px, more than 3
 * trusted mouse moves, or the 6s visible dwell. window.__SIA21_ENGAGED
 * records that. SIA21_mayShowExit() is false when webdriver is true or
 * engagement has not happened, so exit_offer_* / last_offer_* never show.
 *
 * buy.stripe.com links navigate only when engagement (or a previous blocked
 * checkout click) happened before this click, the page has been open for at
 * least 1.5s, and webdriver is false. Otherwise the click stays on the page,
 * scrolls to that link, and the next click may leave. stripe_checkout_click
 * and InitiateCheckout listeners sit after this one, so a blocked click
 * does not emit them.
 *
 * An allowed click is itself a human signal: this handler calls markHuman()
 * before those listeners run, so InitiateCheckout can fire on that click
 * even when the gate was still closed. The default navigation is held and
 * replayed with anchor.click() after the pixel has callMethod and about
 * 300ms have passed (capped around 1.2s), or on the next turn when no
 * InitiateCheckout was armed. Facebook and Instagram Android webviews often
 * ignore target=_blank and cancel the pixel image request if the document
 * unloads in the same turn. The replayed click is marked
 * __SIA21_STRIPE_LEAVING so InitiateCheckout and stripe_checkout_click do
 * not fire a second time. A second tap on that same Payment Link during
 * the wait is not a new checkout: the first valid click locks that link
 * for 3s, or until its one navigation is issued, whichever comes first.
 * Further taps on it are ignored, so the intent fires one InitiateCheckout,
 * one stripe_checkout_click, and opens Stripe once. A different Payment
 * Link, such as the €33 exit, can still record its own checkout.
 *
 * When that click is allowed and cookie consent is already accepted,
 * SIA21_attachClientReference (assets/sia21-capi.js) appends
 * client_reference_id to the Payment Link before the lock stores the
 * href. Without consent the Stripe URL is left as written. The format
 * is documented in docs/CAPI-CONTRACT.md.
 *
 * window.SIA21_onHuman(cb) runs cb now if the visitor is already human,
 * otherwise queues it. window.SIA21_armTracking() turns PostHog pageview,
 * autocapture and session recording on at that moment.
 * window.SIA21_captureWhenHuman(name, props) queues custom PostHog events
 * and drops them on pagehide if no human signal arrived.
 *
 * A click on the cookie banner (Aceitar or Rejeitar) is a human signal.
 * It records PostHog cookie_consent with choice, path and angle before the
 * queue can be dropped. Leaving the banner untouched records nothing.
 * The Meta Pixel still starts only after Aceitar. Reject does not load it.
 *
 * PostHog and the Meta Pixel only start on the production host over HTTPS
 * with no explicit port other than 443: 4improvementsportugal-ops.github.io.
 * localhost, 127.0.0.1, ::1, 0.0.0.0, any other port (including a preview on
 * :4173), http://, and file:// never capture. An obvious test checkout id in
 * the URL (cs_test_, or a value containing test, fake, dummy, sample,
 * example, placeholder, headless, or xxx) also refuses every Meta and PostHog
 * event. SIA21_trackingSuppressed() is the shared QA gate for this file,
 * sia21-conv.js, sia21-purchase.js, mthd-pixel.js and the inline pixel
 * callers. It is true for ?qa=1, ?test=1 and ?debug=1 (not ?sia21_debug=1,
 * which only shortens exit timers), for localStorage or sessionStorage
 * sia21_qa (also the older sia21_qa_v1), for navigator.webdriver, and for an
 * automated user agent (HeadlessChrome, Headless, Playwright, Puppeteer,
 * Lighthouse, bot, crawler, spider) or another clear automation global.
 * Seeing an opt-out flag stores sia21_qa in both storages so a later page
 * such as obrigado stays quiet. While suppressed, fbevents.js is not loaded
 * and neither fbq nor posthog.capture runs. SIA21_bootPosthog() is what
 * pages call, and only from SIA21_onHuman.
 *
 * Scroll depth is sia21_scroll (25/50/75/100, plus section ids when the
 * page has them), queued behind the same human gate. A milestone is the
 * fraction of the real scroll range the visitor has moved, not a reading
 * taken while the document is still one screen tall. $pageleave is flushed
 * on visibilitychange (hidden), pagehide and freeze, with sendBeacon.
 */
(function () {
  try {
    var current = document.currentScript;
    if (!current || !current.src || current.src.indexOf("human-gate.js") === -1) return;
    var capi = current.src.replace(/human-gate\.js(\?[^#]*)?/, "sia21-capi.js$1");
    if (!capi || capi === current.src) return;
    if (document.readyState === "loading" && !current.async && !current.defer) {
      document.write('<script src="' + capi.replace(/"/g, "%22") + '"><\/script>');
      return;
    }
    var extra = document.createElement("script");
    extra.src = capi;
    extra.async = false;
    (document.head || document.documentElement).appendChild(extra);
  } catch (e) {}
})();
(function (w, d) {
  "use strict";

  if (w.__SIA21_HUMAN_GATE_LOADED) return;
  w.__SIA21_HUMAN_GATE_LOADED = true;

  var INSTANT_PATHS = ["/obrigado.html", "/obrigado", "/ghl-agencias/obrigado.html"];
  var DWELL_MS = 6000;
  var CHECKOUT_MIN_MS = 1500;
  var PROD_HOST = "4improvementsportugal-ops.github.io";
  var QA_FLAG = "sia21_qa";
  var QA_KEY = "sia21_qa_v1";
  var INTERNAL_KEY = "sia21_internal_v1";
  var UA_TOKENS = ["headlesschrome", "headless", "playwright", "puppeteer", "lighthouse", "bot", "crawler", "spider"];
  var ENGAGED_KEY = "sia21_engaged_v1";
  var PH_TOKEN = "phc_knF2fZccBcGVgHcayHbPfcYfXguFx3jzxaBksdduz9R3";
  var listeners = [];
  var fired = false;
  var cleaned = false;
  var moveCount = 0;
  var accumulated = 0;
  var lastSample = 0;
  var lastVisible = false;
  var dwellTimer = null;
  var phQueue = [];
  var phDropped = false;
  var depthSent = {};
  var checkoutArmed = false;
  var startedAt = Date.now();
  try {
    if (w.performance && typeof w.performance.timeOrigin === "number" && w.performance.timeOrigin > 0) {
      startedAt = w.performance.timeOrigin;
    }
  } catch (e) {}

  w.__SIA21_HUMAN = false;
  w.__SIA21_ENGAGED = false;
  w.__SIA21_PAGE_AT = startedAt;
  w.__SIA21_CHECKOUT_MIN_MS = CHECKOUT_MIN_MS;
  w.__SIA21_MAX_SCROLL = 0;

  function searchString() {
    try { return w.location.search || ""; } catch (e) { return ""; }
  }

  function storeSet(store, key, value) {
    try {
      if (!store) return;
      if (value == null) store.removeItem(key);
      else store.setItem(key, value);
    } catch (e) {}
  }

  function storeHas(store, key) {
    try { return !!(store && store.getItem(key) === "1"); } catch (e) { return false; }
  }

  // ?sia21_debug=1 must not match: the character before "debug" is not ? or &.
  function optOutInUrl(search) {
    return /[?&](?:qa|test|debug)=1(?:&|$)/.test(search || "");
  }

  function rememberQa() {
    storeSet(w.localStorage, QA_FLAG, "1");
    storeSet(w.sessionStorage, QA_FLAG, "1");
    storeSet(w.localStorage, QA_KEY, "1");
    storeSet(w.sessionStorage, QA_KEY, "1");
    storeSet(w.localStorage, INTERNAL_KEY, "1");
  }

  function clearQa() {
    storeSet(w.localStorage, QA_FLAG, null);
    storeSet(w.sessionStorage, QA_FLAG, null);
    storeSet(w.localStorage, QA_KEY, null);
    storeSet(w.sessionStorage, QA_KEY, null);
    storeSet(w.localStorage, INTERNAL_KEY, null);
  }

  function syncQaFlag() {
    var search = searchString();
    if (optOutInUrl(search)) rememberQa();
    else if (/[?&]qa=0(?:&|$)/.test(search)) clearQa();
  }

  function qaOn() {
    if (optOutInUrl(searchString())) return true;
    return storeHas(w.localStorage, QA_FLAG) || storeHas(w.sessionStorage, QA_FLAG) || storeHas(w.localStorage, QA_KEY) || storeHas(w.sessionStorage, QA_KEY);
  }

  function internalOn() {
    try { return w.localStorage.getItem(INTERNAL_KEY) === "1" || qaOn(); } catch (e) { return qaOn(); }
  }

  function userAgent() {
    try { return String((w.navigator && w.navigator.userAgent) || ""); } catch (e) { return ""; }
  }

  function uaAutomated(ua) {
    var hay = String(ua || "").toLowerCase();
    for (var i = 0; i < UA_TOKENS.length; i++) {
      if (hay.indexOf(UA_TOKENS[i]) !== -1) return true;
    }
    return false;
  }

  function webdriverOn() {
    try { if (w.navigator && w.navigator.webdriver === true) return true; } catch (e) {}
    try {
      if (d.documentElement && d.documentElement.getAttribute("webdriver")) return true;
    } catch (e2) {}
    return false;
  }

  function automationGlobals() {
    try {
      if (w.callPhantom || w._phantom || w.__nightmare || w.Cypress || w.domAutomation || w.domAutomationController) return true;
      if (w._selenium || w.callSelenium || w.__webdriver_evaluate || w.__driver_evaluate || w.__selenium_evaluate || w.__fxdriver_evaluate || w.__webdriverFunc || w.__playwright || w.__puppeteer) return true;
      if (d.__selenium_unwrapped || d.__webdriver_evaluate || d.__driver_evaluate || d.__selenium_evaluate || d.__fxdriver_evaluate || d.__webdriver_unwrapped) return true;
    } catch (e) {}
    return false;
  }

  syncQaFlag();
  w.__SIA21_QA = qaOn();
  w.__SIA21_INTERNAL = internalOn();

  function isObviousTestId(value) {
    var raw = String(value || "").trim();
    if (!raw) return false;
    if (/^cs_test_/i.test(raw)) return true;
    return /test|fake|dummy|sample|example|placeholder|headless|xxx/i.test(raw);
  }

  w.SIA21_obviousTestId = isObviousTestId;

  function obviousTestSession() {
    var params;
    try { params = new URLSearchParams(w.location.search || ""); } catch (e) { return false; }
    var names = ["session_id", "checkout_session_id", "stripe_session_id", "cs_id"];
    var i;
    for (i = 0; i < names.length; i++) {
      if (isObviousTestId(params.get(names[i]) || "")) return true;
    }
    var found = false;
    params.forEach(function (value) {
      if (found) return;
      if (/^cs_(?:live|test)_/i.test(value) && isObviousTestId(value)) found = true;
    });
    return found;
  }

  w.SIA21_isProductionHost = function () {
    try {
      var loc = w.location;
      if (!loc || loc.protocol === "file:") return false;
      var host = String(loc.hostname || "").replace(/\.+$/, "").toLowerCase();
      if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "0.0.0.0") return false;
      if (host !== PROD_HOST) return false;
      var port = String(loc.port || "");
      if (port && port !== "443") return false;
      if (loc.protocol !== "https:") return false;
      return true;
    } catch (e) { return false; }
  };

  w.SIA21_trackingSuppressed = function () {
    syncQaFlag();
    w.__SIA21_QA = qaOn();
    w.__SIA21_INTERNAL = internalOn();
    if (w.__SIA21_QA) return true;
    if (webdriverOn()) return true;
    if (uaAutomated(userAgent())) return true;
    if (automationGlobals()) return true;
    return false;
  };

  w.SIA21_allowCapture = function () {
    return w.SIA21_isProductionHost() && !w.SIA21_trackingSuppressed() && !obviousTestSession();
  };

  function beforeSend(event) {
    try {
      if (!w.SIA21_allowCapture()) return null;
      if (!event) return event;
      event.properties = event.properties || {};
      if (w.__SIA21_INTERNAL) event.properties.internal = true;
      if (event.event === "$pageleave" && typeof w.__SIA21_MAX_SCROLL === "number") {
        event.properties.$prev_pageview_max_scroll_percentage = Math.round(w.__SIA21_MAX_SCROLL) / 100;
        event.properties.$prev_pageview_max_scroll = Math.round(w.__SIA21_MAX_SCROLL);
      }
    } catch (e) {}
    return event;
  }

  function pathMatchesInstant(pathname) {
    var path = pathname || "";
    for (var i = 0; i < INSTANT_PATHS.length; i++) {
      var entry = INSTANT_PATHS[i];
      if (entry && path.indexOf(entry) !== -1) return true;
    }
    return false;
  }

  function isAutomated() {
    try { return w.navigator.webdriver === true; } catch (e) { return false; }
  }

  function tabVisible() {
    return d.visibilityState === "visible" && !isAutomated();
  }

  function posthogReady() {
    var ph = w.posthog;
    return !!(ph && ph.__loaded && ph.persistence && ph.sessionPersistence && ph.capture);
  }

  function deliverPh(name, props, options) {
    if (!w.SIA21_allowCapture()) return;
    if (!posthogReady()) {
      phQueue.push({ name: name, props: props || {}, options: options });
      return;
    }
    try {
      var payload = props || {};
      if (name === "sia21_scroll") {
        collectVisibleSections();
        payload = {
          depth: payload.depth,
          path: payload.path || (w.location.pathname || ""),
          sections: seenSections.slice()
        };
        if (payload.depth) depthSent[payload.depth] = true;
      }
      if (options) w.posthog.capture(name, payload, options);
      else w.posthog.capture(name, payload);
    } catch (e) {}
  }

  function flushPhQueue() {
    if (!w.__SIA21_HUMAN || phDropped || !posthogReady()) return;
    var batch = phQueue.splice(0, phQueue.length);
    for (var i = 0; i < batch.length; i++) deliverPh(batch[i].name, batch[i].props, batch[i].options);
  }

  // The snippet's loaded callback runs while window.posthog is still the
  // array stub. capture() on that stub is replayed later (so $pageview
  // lands), but our own queue looks "not ready" and used to be dropped.
  // Retry until the real client replaces the stub.
  function flushWhenReady(attempt) {
    if (phDropped) return;
    if (w.__SIA21_HUMAN && posthogReady()) {
      flushPhQueue();
      return;
    }
    if (attempt >= 40) return;
    w.setTimeout(function () { flushWhenReady(attempt + 1); }, 50);
  }

  w.SIA21_captureWhenHuman = function (name, props, options) {
    if (phDropped || !name) return;
    if (!w.SIA21_allowCapture()) return;
    if (w.__SIA21_HUMAN && posthogReady()) {
      deliverPh(name, props || {}, options);
      return;
    }
    phQueue.push({ name: name, props: props || {}, options: options });
  };

  w.SIA21_capturePh = function (name, props) {
    w.SIA21_captureWhenHuman(name, props);
  };

  w.addEventListener("pagehide", function () {
    if (!w.__SIA21_HUMAN) {
      phDropped = true;
      phQueue.length = 0;
    }
  });

  function cleanupInteraction() {
    w.removeEventListener("wheel", onWheel, true);
    w.removeEventListener("keydown", onKey, true);
    w.removeEventListener("click", onClick, true);
    w.removeEventListener("touchstart", onTouch, true);
  }

  function cleanupEngagement() {
    if (cleaned) return;
    cleaned = true;
    if (dwellTimer) {
      clearInterval(dwellTimer);
      dwellTimer = null;
    }
    w.removeEventListener("scroll", onScroll, true);
    w.removeEventListener("mousemove", onMove, true);
    d.removeEventListener("visibilitychange", onVisibility);
  }

  function markHuman() {
    if (fired) return;
    fired = true;
    w.__SIA21_HUMAN = true;
    cleanupInteraction();
    flushPhQueue();
    var cbs = listeners.splice(0, listeners.length);
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](); } catch (e) {}
    }
    try { w.dispatchEvent(new CustomEvent("sia21:human")); } catch (e) {}
  }

  function markEngaged() {
    if (w.__SIA21_ENGAGED) return;
    w.__SIA21_ENGAGED = true;
    try { w.sessionStorage.setItem(ENGAGED_KEY, "1"); } catch (e) {}
    cleanupEngagement();
    if (!fired) markHuman();
  }

  w.SIA21_onHuman = function (cb) {
    if (typeof cb !== "function") return;
    if (w.__SIA21_HUMAN) {
      try { cb(); } catch (e) {}
      return;
    }
    listeners.push(cb);
  };

  w.SIA21_mayShowExit = function () {
    return w.__SIA21_ENGAGED === true && !isAutomated();
  };

  function checkoutAllowed() {
    if (isAutomated()) return false;
    if (Date.now() - startedAt < CHECKOUT_MIN_MS) return false;
    return w.__SIA21_ENGAGED === true || checkoutArmed === true;
  }

  w.SIA21_checkoutAllowed = checkoutAllowed;

  function flushPageLeave() {
    if (!w.SIA21_allowCapture()) return;
    if (!w.__SIA21_HUMAN || !w.__SIA21_PH_PAGEVIEW || w.__SIA21_PH_LEAVE) return;
    if (!posthogReady()) return;
    w.__SIA21_PH_LEAVE = true;
    var startMs = w.__SIA21_PAGE_AT || startedAt;
    var seconds = Math.round(((Date.now() - startMs) / 1000) * 10) / 10;
    var ratio = Math.round(w.__SIA21_MAX_SCROLL || 0) / 100;
    try {
      w.posthog.capture("$pageleave", {
        $prev_pageview_duration: seconds,
        $prev_pageview_max_scroll_percentage: ratio,
        $prev_pageview_max_scroll: Math.round(w.__SIA21_MAX_SCROLL || 0)
      }, { transport: "sendBeacon", send_instantly: true });
    } catch (e) {}
  }

  w.SIA21_armTracking = function () {
    if (w.__SIA21_PH_ARMED) return;
    w.__SIA21_PH_ARMED = true;
    var startMs = w.__SIA21_PAGE_AT || startedAt;
    w.SIA21_onHuman(function () {
      if (!w.SIA21_allowCapture()) return;
      var ph = w.posthog;
      if (!ph || w.__SIA21_PH_PAGEVIEW) return;
      w.__SIA21_PH_PAGEVIEW = true;
      // Backdate the first event to navigation start. PostHog session duration
      // is last event minus first event, and $prev_pageview_duration is measured
      // from when the SDK clock starts. The gate used to emit $pageview only
      // after the human signal, in the same turn that enabled pageleave, so
      // both timestamps collapsed and the average time on page was 0s.
      try { ph.capture("$pageview", {}, { timestamp: new Date(startMs) }); } catch (e) {}
      try {
        ph.set_config({
          autocapture: true,
          capture_pageleave: false,
          enable_heatmaps: true,
          disable_session_recording: false
        });
      } catch (e2) {}
      try { ph.startSessionRecording(); } catch (e3) {}
    });
    // pagehide alone misses Facebook and Instagram in-app browsers.
    // visibilitychange and freeze run while the document can still beacon.
    w.addEventListener("pagehide", flushPageLeave);
    w.addEventListener("freeze", flushPageLeave);
    d.addEventListener("visibilitychange", function () {
      if (d.visibilityState === "hidden") flushPageLeave();
    });
  };

  w.SIA21_bootPosthog = function () {
    if (w.__SIA21_PH_BOOTED) return;
    if (!w.SIA21_allowCapture()) return;
    if (!w.posthog || typeof w.posthog.init !== "function") return;
    w.__SIA21_PH_BOOTED = true;
    try {
      w.posthog.init(PH_TOKEN, {
        api_host: "https://eu.i.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        enable_heatmaps: false,
        disable_session_recording: true,
        disable_compression: true,
        advanced_disable_feature_flags: true,
        before_send: beforeSend,
        loaded: function () {
          w.__SIA21_PH_READY = true;
          // Pageview first, then anything queued while array.js was still loading.
          // capture() before __loaded returns without sending. loaded itself
          // still sees the snippet stub, so the queue flush retries.
          w.SIA21_armTracking();
          flushWhenReady(0);
        }
      });
    } catch (e) {
      w.__SIA21_PH_BOOTED = false;
      return;
    }
  };

  function scrollY() {
    return w.scrollY || d.documentElement.scrollTop || (d.body && d.body.scrollTop) || 0;
  }

  function onScroll(e) {
    if (e && e.isTrusted === false) return;
    if (scrollY() > 80) markEngaged();
  }
  function onWheel() { markHuman(); }
  function onKey() { markHuman(); }
  function onClick() { markHuman(); }
  function onTouch() { markHuman(); }
  function onMove(e) {
    if (e && e.isTrusted === false) return;
    moveCount += 1;
    if (moveCount > 3) markEngaged();
  }

  function sampleDwell() {
    var now = Date.now();
    var visible = tabVisible();
    if (!w.__SIA21_ENGAGED && visible && lastVisible && lastSample) {
      accumulated += now - lastSample;
      if (accumulated >= DWELL_MS) markEngaged();
    }
    lastSample = now;
    lastVisible = visible;
  }

  function onVisibility() {
    lastSample = Date.now();
    lastVisible = tabVisible();
  }

  function stripeAnchor(e) {
    var node = e.target;
    if (!node || !node.closest) return null;
    return node.closest('a[href*="buy.stripe.com"]');
  }

  function holdCheckout(e, anchor) {
    w.__SIA21_CHECKOUT_OK = false;
    e.preventDefault();
    e.stopPropagation();
    try { e.stopImmediatePropagation(); } catch (err) {}
    try { anchor.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (err2) {
      try { anchor.scrollIntoView(true); } catch (err3) {}
    }
    if (!isAutomated()) checkoutArmed = true;
  }

  var IC_MIN_MS = 300;
  var IC_CAP_MS = 1200;
  var CHECKOUT_LOCK_MS = 3000;

  function checkoutLocked() {
    return typeof w.__SIA21_CHECKOUT_LOCK_UNTIL === "number" && Date.now() < w.__SIA21_CHECKOUT_LOCK_UNTIL;
  }

  function lockCheckout(anchor) {
    w.__SIA21_CHECKOUT_LOCK_UNTIL = Date.now() + CHECKOUT_LOCK_MS;
    w.__SIA21_CHECKOUT_LOCK_HREF = (anchor && anchor.getAttribute && anchor.getAttribute("href")) || "";
  }

  function unlockCheckout() {
    w.__SIA21_CHECKOUT_LOCK_UNTIL = 0;
    w.__SIA21_CHECKOUT_LOCK_HREF = "";
  }

  function sameLockedCheckout(anchor) {
    var href = (anchor && anchor.getAttribute && anchor.getAttribute("href")) || "";
    var locked = w.__SIA21_CHECKOUT_LOCK_HREF || "";
    return !!href && href === locked;
  }

  function swallowCheckout(e) {
    e.preventDefault();
    try { e.stopPropagation(); } catch (err) {}
    try { e.stopImmediatePropagation(); } catch (err2) {}
  }

  function pixelTransportReady() {
    return !!(w.fbq && typeof w.fbq.callMethod === "function");
  }

  function leaveForStripe(anchor) {
    if (w.__SIA21_STRIPE_LEAVING) return;
    w.__SIA21_STRIPE_LEAVING = true;
    try {
      anchor.click();
    } catch (err) {
      try { w.location.href = anchor.href; } catch (err2) {}
    }
    // The synthetic click has finished dispatching. A later real click
    // (exit offer, sticky bar, upsell) can arm InitiateCheckout again.
    w.__SIA21_STRIPE_LEAVING = false;
    w.__SIA21_STRIPE_LEAVE_PENDING = false;
    w.__SIA21_IC_ARMED = false;
    // Navigation for this intent has been issued. A later offer (the €33
    // exit, for example) may start its own checkout.
    unlockCheckout();
  }

  function scheduleStripeLeave(anchor) {
    var started = Date.now();
    function tick() {
      var waited = Date.now() - started;
      if (w.__SIA21_IC_ARMED !== true) {
        leaveForStripe(anchor);
        return;
      }
      if ((pixelTransportReady() && waited >= IC_MIN_MS) || waited >= IC_CAP_MS) {
        leaveForStripe(anchor);
        return;
      }
      w.setTimeout(tick, 50);
    }
    w.setTimeout(tick, 0);
  }

  function onStripeClick(e) {
    var anchor = stripeAnchor(e);
    if (!anchor) return;
    if (e.type === "auxclick" && e.button !== 1) return;
    // The delayed anchor.click() must follow the link. Other listeners
    // see __SIA21_STRIPE_LEAVING and skip a second InitiateCheckout.
    if (w.__SIA21_STRIPE_LEAVING) return;
    if ((w.__SIA21_STRIPE_LEAVE_PENDING || checkoutLocked()) && sameLockedCheckout(anchor)) {
      swallowCheckout(e);
      return;
    }
    if (w.__SIA21_STRIPE_LEAVE_PENDING) {
      e.preventDefault();
      return;
    }
    if (checkoutAllowed()) {
      checkoutArmed = false;
      w.__SIA21_CHECKOUT_OK = true;
      w.__SIA21_STRIPE_CLICKED_HERE = true;
      w.__SIA21_STRIPE_LEAVE_PENDING = true;
      if (typeof w.SIA21_attachClientReference === "function") {
        try { w.SIA21_attachClientReference(anchor); } catch (errRef) {}
      }
      lockCheckout(anchor);
      try { w.sessionStorage.setItem("sia21_stripe_left_at_v1", String(Date.now())); } catch (err) {}
      try { w.sessionStorage.removeItem("sia21_stripe_away_v1"); } catch (err4) {}
      e.preventDefault();
      if (!fired) markHuman();
      scheduleStripeLeave(anchor);
      return;
    }
    holdCheckout(e, anchor);
  }

  w.addEventListener("click", onStripeClick, true);
  w.addEventListener("auxclick", onStripeClick, true);

  var ANGLE_SLUGS = [
    "01-tempo", "02-rgpd", "03-idealista", "04-whatsapp", "05-angariacao",
    "06-chatgpt-falhou", "sobrecarga", "07-metodo-21-dias", "08-solo-escala",
    "09-early-37", "10-visitas-ops"
  ];

  function pageAngle() {
    var path = "";
    try { path = w.location.pathname || ""; } catch (e) { path = ""; }
    for (var i = 0; i < ANGLE_SLUGS.length; i++) {
      if (path.indexOf("/" + ANGLE_SLUGS[i]) !== -1) return ANGLE_SLUGS[i];
    }
    if (path.indexOf("obrigado") !== -1) return "obrigado";
    return "home";
  }

  function onCookieChoice(e) {
    var node = e.target && e.target.closest ? e.target.closest("[data-ck]") : null;
    if (!node) return;
    var choice = node.getAttribute("data-ck");
    if (choice !== "accepted" && choice !== "rejected") return;
    markHuman();
    w.SIA21_captureWhenHuman("cookie_consent", {
      choice: choice,
      path: (w.location && w.location.pathname) || "",
      angle: pageAngle()
    });
  }

  function bindEngagement() {
    w.addEventListener("scroll", onScroll, true);
    w.addEventListener("mousemove", onMove, true);
    d.addEventListener("visibilitychange", onVisibility);
    lastSample = Date.now();
    lastVisible = tabVisible();
    dwellTimer = setInterval(sampleDwell, 250);
    onScroll();
  }

  function syncCookieOffset() {
    var ck = d.getElementById("ck");
    var height = 0;
    if (ck && !ck.hidden) height = Math.ceil(ck.getBoundingClientRect().height);
    d.documentElement.style.setProperty("--ck-offset", height + "px");
  }

  function watchCookieBar() {
    syncCookieOffset();
    var ck = d.getElementById("ck");
    if (ck && w.MutationObserver) {
      new MutationObserver(syncCookieOffset).observe(ck, { attributes: true, attributeFilter: ["hidden"] });
    }
    w.addEventListener("resize", syncCookieOffset);
  }

  function bootChrome() {
    watchCookieBar();
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", bootChrome);
  else bootChrome();

  // Scroll depth does not use PostHog's scroll manager. That manager listens
  // to window scroll only, and on several mobile webviews scrollY stays 0.
  // Milestones are the distance actually travelled divided by the scrollable
  // range. A document that is still about one screen tall is not 100%: that
  // reading used to latch during load (and in expanded in-app webviews) and
  // then flush as depth 100 when the human gate opened.
  var firedDepth = {};
  var seenSections = [];
  var scrollIo = null;
  var geometryHeight = 0;
  var seenHeight = 0;
  var heightSteady = false;

  function docHeight() {
    var bodyH = d.body ? d.body.scrollHeight : 0;
    return Math.max(d.documentElement.scrollHeight || 0, bodyH || 0, 0);
  }

  function viewportH() {
    var inner = w.innerHeight || d.documentElement.clientHeight || 0;
    try {
      if (w.visualViewport && w.visualViewport.height > 0 && w.visualViewport.height + 80 < inner) {
        return w.visualViewport.height;
      }
    } catch (e) {}
    return inner;
  }

  function rawDocTop() {
    var top = 0;
    try { top = w.scrollY || w.pageYOffset || 0; } catch (e) {}
    var docTop = 0;
    var bodyTop = 0;
    try { docTop = d.documentElement.scrollTop || 0; } catch (e2) {}
    try { bodyTop = (d.body && d.body.scrollTop) || 0; } catch (e3) {}
    if (docTop > top) top = docTop;
    if (bodyTop > top) top = bodyTop;
    try {
      if (w.visualViewport && typeof w.visualViewport.pageTop === "number" && w.visualViewport.pageTop > top) {
        top = w.visualViewport.pageTop;
      }
    } catch (e4) {}
    return top > 0 ? top : 0;
  }

  function layoutTop(el) {
    var y = 0;
    var n = el;
    var guard = 0;
    while (n && n !== d.body && n !== d.documentElement && guard < 40) {
      y += n.offsetTop || 0;
      n = n.offsetParent;
      guard += 1;
    }
    return y;
  }

  function travelOf(el) {
    if (!el || !el.getBoundingClientRect) return 0;
    var rect = null;
    try { rect = el.getBoundingClientRect(); } catch (e) { return 0; }
    if (!rect) return 0;
    var moved = layoutTop(el) - rect.top;
    return moved > 1 ? moved : 0;
  }

  function contentAnchor() {
    return d.querySelector("main") || d.querySelector("section") || null;
  }

  function bottomEl() {
    var nodes = d.querySelectorAll("footer");
    if (nodes.length) return nodes[nodes.length - 1];
    return d.querySelector("main");
  }

  function bottomVisible() {
    var el = bottomEl();
    var view = viewportH();
    if (!el || !view || !el.getBoundingClientRect) return false;
    var rect = null;
    try { rect = el.getBoundingClientRect(); } catch (e) { return false; }
    if (!rect || rect.height < 8) return false;
    return rect.bottom <= view + 24 && rect.top < view && rect.bottom > view * 0.35;
  }

  function overflowYScrolls(el) {
    var oy = "";
    try { oy = w.getComputedStyle(el).overflowY; } catch (e) { return false; }
    return oy === "auto" || oy === "scroll" || oy === "overlay";
  }

  var scrollerCache = [];
  var scrollerCacheAt = 0;

  function pageScrollers() {
    var now = Date.now();
    if (now - scrollerCacheAt < 500) return scrollerCache;
    var found = [];
    var vh = viewportH();
    if (!d.body || !vh) {
      scrollerCache = found;
      scrollerCacheAt = now;
      return found;
    }
    var nodes = d.body.getElementsByTagName("*");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el === d.body || el === d.documentElement) continue;
      if (el.id && el.id.indexOf("sia21-scroll-") === 0) continue;
      if (el.clientHeight < vh * 0.55) continue;
      if (el.scrollHeight <= el.clientHeight + 8) continue;
      if (!overflowYScrolls(el)) continue;
      found.push(el);
    }
    scrollerCache = found;
    scrollerCacheAt = now;
    return found;
  }

  function ratio(top, max) {
    if (!(max > 8) || top == null || isNaN(top)) return null;
    if (top < 0) top = 0;
    var pct = (top / max) * 100;
    if (pct < 0) return 0;
    if (pct > 100) return 100;
    return pct;
  }

  function rememberHeight(height) {
    if (!seenHeight || Math.abs(height - seenHeight) > 48) {
      heightSteady = false;
      seenHeight = height;
      return;
    }
    heightSteady = true;
    seenHeight = height;
  }

  function readScrollPct() {
    if (d.readyState === "loading") return null;
    var view = viewportH();
    var height = docHeight();
    if (!view || !height) return null;
    rememberHeight(height);
    var best = 0;
    function take(pct) {
      if (pct == null || isNaN(pct)) return;
      if (pct > best) best = pct;
    }
    var anchor = contentAnchor();
    take(ratio(Math.max(rawDocTop(), travelOf(anchor)), height - view));
    var scrollers = pageScrollers();
    for (var i = 0; i < scrollers.length; i++) {
      var el = scrollers[i];
      var max = el.scrollHeight - el.clientHeight;
      var top = 0;
      try { top = el.scrollTop || 0; } catch (e) {}
      var kid = el.querySelector("main, section") || el.firstElementChild;
      var moved = travelOf(kid);
      if (moved > top) top = moved;
      take(ratio(top, max));
    }
    if (bottomVisible()) {
      if (height - view > 48) take(100);
      else if (d.readyState === "complete" && heightSteady) take(100);
    }
    return best;
  }

  function noteSection(id) {
    if (!id || seenSections.indexOf(id) !== -1) return;
    seenSections.push(id);
  }

  function collectVisibleSections() {
    var nodes = d.querySelectorAll("section[id]");
    var viewH = w.innerHeight || 0;
    for (var i = 0; i < nodes.length; i++) {
      var rect = null;
      try { rect = nodes[i].getBoundingClientRect(); } catch (e) { rect = null; }
      if (!rect) continue;
      if (rect.top < viewH) noteSection(nodes[i].id);
    }
  }

  function emitDepth(depth) {
    if (firedDepth[depth]) return;
    collectVisibleSections();
    firedDepth[depth] = true;
    w.SIA21_captureWhenHuman("sia21_scroll", {
      depth: depth,
      path: w.location.pathname || "",
      sections: seenSections.slice()
    }, { send_instantly: true });
  }

  function depthReached(pct, depth) {
    var threshold = depth === 100 ? 99 : depth;
    return pct + 0.01 >= threshold;
  }

  function rewindUnsent(pct) {
    var steps = [25, 50, 75, 100];
    var keep = {};
    for (var i = 0; i < steps.length; i++) {
      if (depthReached(pct, steps[i])) keep[steps[i]] = true;
    }
    for (var j = 0; j < steps.length; j++) {
      var depth = steps[j];
      if (keep[depth] || !firedDepth[depth] || depthSent[depth]) continue;
      delete firedDepth[depth];
    }
    for (var k = phQueue.length - 1; k >= 0; k--) {
      var item = phQueue[k];
      if (!item || item.name !== "sia21_scroll" || !item.props) continue;
      if (keep[item.props.depth] || depthSent[item.props.depth]) continue;
      phQueue.splice(k, 1);
    }
    w.__SIA21_MAX_SCROLL = pct > 0 ? pct : 0;
  }

  function notePct(pct) {
    if (pct == null || isNaN(pct)) return;
    var height = docHeight();
    // Fonts and the Tailwind CDN grow the page after the first sample.
    // Milestones queued against that short height are not real depth.
    if (geometryHeight && height > geometryHeight + 80) rewindUnsent(pct);
    if (height > geometryHeight) geometryHeight = height;
    if (pct > w.__SIA21_MAX_SCROLL) w.__SIA21_MAX_SCROLL = pct;
    var steps = [25, 50, 75, 100];
    for (var i = 0; i < steps.length; i++) {
      if (depthReached(pct, steps[i])) emitDepth(steps[i]);
    }
  }

  function sampleScroll() {
    notePct(readScrollPct());
  }

  function placeSentinels() {
    if (!d.body) return;
    var height = docHeight();
    var steps = [25, 50, 75, 100];
    for (var i = 0; i < steps.length; i++) {
      var pct = steps[i];
      var id = "sia21-scroll-" + pct;
      var node = d.getElementById(id);
      if (!node) {
        node = d.createElement("div");
        node.id = id;
        node.setAttribute("data-sia21-depth", String(pct));
        node.setAttribute("aria-hidden", "true");
        node.style.cssText = "position:absolute;left:0;width:1px;height:1px;pointer-events:none;opacity:0;";
        d.body.appendChild(node);
        if (scrollIo) scrollIo.observe(node);
      }
      var y = pct === 100 ? Math.max(0, height - 2) : Math.round(height * (pct / 100));
      node.style.top = y + "px";
    }
  }

  function bindScrollTracking() {
    if (w.__SIA21_SCROLL_BOUND) return;
    w.__SIA21_SCROLL_BOUND = true;
    if (w.IntersectionObserver) {
      scrollIo = new w.IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          var target = entries[i].target;
          var depthAttr = target.getAttribute && target.getAttribute("data-sia21-depth");
          if (depthAttr) {
            var rect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
            var viewH = viewportH() || 1;
            // The sentinel only wakes a measurement. Its own number is not
            // the depth: a marker placed while the page was still short used
            // to report 100 before the visitor had moved.
            if (rect && rect.top <= viewH && rect.bottom > -viewH) sampleScroll();
          }
          if (target.id && target.tagName === "SECTION") noteSection(target.id);
        }
      }, { threshold: 0 });
    }
    function boot() {
      var sections = d.querySelectorAll("section[id]");
      for (var i = 0; i < sections.length; i++) {
        if (scrollIo) scrollIo.observe(sections[i]);
      }
      placeSentinels();
      sampleScroll();
    }
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
    else boot();
    w.addEventListener("load", function () {
      placeSentinels();
      sampleScroll();
    });
    if (d.fonts && d.fonts.ready && typeof d.fonts.ready.then === "function") {
      d.fonts.ready.then(function () {
        placeSentinels();
        sampleScroll();
      }, function () {});
    }
    w.addEventListener("scroll", sampleScroll, { passive: true, capture: true });
    w.addEventListener("resize", function () { placeSentinels(); sampleScroll(); });
    // In-app webviews move the layout without a window scroll event.
    // The same 200ms watch the exit offer uses keeps depth honest there.
    w.setInterval(function () {
      if (d.visibilityState === "hidden") return;
      sampleScroll();
    }, 200);
    w.addEventListener("touchmove", sampleScroll, { passive: true });
    if (w.visualViewport) {
      w.visualViewport.addEventListener("scroll", sampleScroll);
      w.visualViewport.addEventListener("resize", sampleScroll);
    }
  }

  bindScrollTracking();

  d.addEventListener("click", onCookieChoice, true);

  if (pathMatchesInstant(w.location.pathname)) {
    markHuman();
    bindEngagement();
    return;
  }

  bindEngagement();
  w.addEventListener("wheel", onWheel, true);
  w.addEventListener("keydown", onKey, true);
  w.addEventListener("click", onClick, true);
  w.addEventListener("touchstart", onTouch, true);
})(window, document);
