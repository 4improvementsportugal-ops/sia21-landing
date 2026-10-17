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
 * window.SIA21_onHuman(cb) runs cb now if the visitor is already human,
 * otherwise queues it. window.SIA21_armTracking() turns PostHog pageview,
 * autocapture and session recording on at that moment.
 * window.SIA21_captureWhenHuman(name, props) queues custom PostHog events
 * and drops them on pagehide if no human signal arrived.
 *
 * PostHog and the Meta Pixel only start on the production host
 * (4improvementsportugal-ops.github.io). SIA21_trackingSuppressed() is the
 * shared QA gate for this file, sia21-conv.js, sia21-purchase.js, mthd-pixel.js
 * and the inline pixel callers. It is true for ?qa=1, ?test=1 and ?debug=1
 * (not ?sia21_debug=1, which only shortens exit timers), for localStorage or
 * sessionStorage sia21_qa (also the older sia21_qa_v1), for navigator.webdriver,
 * and for an automated user agent (HeadlessChrome, Headless, Playwright,
 * Puppeteer, Lighthouse, bot, crawler, spider) or another clear automation
 * global. Seeing an opt-out flag stores sia21_qa in both storages so a later
 * page such as obrigado stays quiet. While suppressed, fbevents.js is not
 * loaded and neither fbq nor posthog.capture runs. SIA21_bootPosthog() is what
 * pages call, and only from SIA21_onHuman.
 *
 * Scroll depth is sia21_scroll (25/50/75/100, plus section ids when the
 * page has them), queued behind the same human gate. $pageleave is flushed
 * on visibilitychange (hidden), pagehide and freeze, with sendBeacon.
 */
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

  w.SIA21_isProductionHost = function () {
    try { return (w.location.hostname || "") === PROD_HOST; } catch (e) { return false; }
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
    return w.SIA21_isProductionHost() && !w.SIA21_trackingSuppressed();
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

  function onStripeClick(e) {
    var anchor = stripeAnchor(e);
    if (!anchor) return;
    if (e.type === "auxclick" && e.button !== 1) return;
    if (checkoutAllowed()) {
      checkoutArmed = false;
      w.__SIA21_CHECKOUT_OK = true;
      w.__SIA21_STRIPE_CLICKED_HERE = true;
      try { w.sessionStorage.setItem("sia21_stripe_left_at_v1", String(Date.now())); } catch (err) {}
      try { w.sessionStorage.removeItem("sia21_stripe_away_v1"); } catch (err4) {}
      return;
    }
    holdCheckout(e, anchor);
  }

  w.addEventListener("click", onStripeClick, true);
  w.addEventListener("auxclick", onStripeClick, true);

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

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", watchCookieBar);
  else watchCookieBar();

  // Scroll depth does not use PostHog's scroll manager. That manager listens
  // to window scroll only, and on several mobile webviews scrollY stays 0
  // (max content stays the first screen) even after a long visit. Milestones
  // also come from IntersectionObserver sentinels and from the element under
  // the viewport, which still move when scroll events do not.
  var firedDepth = {};
  var seenSections = [];
  var scrollIo = null;

  function docHeight() {
    var bodyH = d.body ? d.body.scrollHeight : 0;
    return Math.max(d.documentElement.scrollHeight || 0, bodyH || 0, 0);
  }

  function readScrollPct() {
    var el = d.scrollingElement || d.documentElement;
    var scrollTop = 0;
    try {
      scrollTop = w.scrollY || w.pageYOffset || (el && el.scrollTop) || (d.body && d.body.scrollTop) || 0;
    } catch (e) {}
    try {
      if (w.visualViewport && typeof w.visualViewport.pageTop === "number" && w.visualViewport.pageTop > scrollTop) {
        scrollTop = w.visualViewport.pageTop;
      }
    } catch (e2) {}
    var viewH = w.innerHeight || (el && el.clientHeight) || 0;
    var height = docHeight();
    var max = height - viewH;
    if (max <= 8) return height > 0 && d.readyState === "complete" ? 100 : 0;
    return Math.max(0, Math.min(100, (scrollTop / max) * 100));
  }

  function pctFromHit() {
    var viewH = w.innerHeight || 0;
    if (!viewH) return null;
    var node = null;
    try { node = d.elementFromPoint(Math.max(1, Math.floor((w.innerWidth || 1) / 2)), Math.floor(viewH * 0.5)); } catch (e) { return null; }
    if (!node || node === d.body || node === d.documentElement) return null;
    var top = 0;
    var n = node;
    var guard = 0;
    while (n && n !== d.body && guard < 40) {
      top += n.offsetTop || 0;
      n = n.offsetParent;
      guard += 1;
    }
    var height = docHeight();
    if (!height) return null;
    return Math.max(0, Math.min(100, ((top + viewH) / height) * 100));
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

  function scrollablePx() {
    return docHeight() - (w.innerHeight || 0);
  }

  function notePct(pct) {
    if (pct == null || isNaN(pct)) return;
    // Tailwind and webfonts grow the page after the first paint. A document
    // that is still one screen tall must not lock every depth at 100.
    if (scrollablePx() <= 8 && d.readyState !== "complete") return;
    if (pct > w.__SIA21_MAX_SCROLL) w.__SIA21_MAX_SCROLL = pct;
    var steps = [25, 50, 75, 100];
    for (var i = 0; i < steps.length; i++) {
      var depth = steps[i];
      var threshold = depth === 100 ? 99 : depth;
      if (pct + 0.01 >= threshold) emitDepth(depth);
    }
  }

  function sampleScroll() {
    notePct(readScrollPct());
    notePct(pctFromHit());
  }

  function sentinelPlaced(node, depth) {
    var height = docHeight();
    var viewH = w.innerHeight || 0;
    if (!depth || height < 1) return false;
    if (height - viewH <= 8) return d.readyState === "complete";
    var expected = depth === 100 ? height - 2 : height * (depth / 100);
    var top = node.offsetTop || 0;
    return Math.abs(top - expected) <= Math.max(48, height * 0.08);
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
            var viewH = w.innerHeight || 1;
            // A sentinel at the bottom edge is not that depth yet. Count it
            // once it has travelled into the top quarter, which is what
            // in-app browsers report even when scrollY stays 0.
            if (rect && rect.top <= viewH * 0.25 && sentinelPlaced(target, parseInt(depthAttr, 10))) {
              notePct(parseInt(depthAttr, 10));
            }
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
    w.addEventListener("scroll", sampleScroll, { passive: true, capture: true });
    w.addEventListener("resize", function () { placeSentinels(); sampleScroll(); });
    w.addEventListener("touchmove", sampleScroll, { passive: true });
    if (w.visualViewport) {
      w.visualViewport.addEventListener("scroll", sampleScroll);
      w.visualViewport.addEventListener("resize", sampleScroll);
    }
  }

  bindScrollTracking();

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
