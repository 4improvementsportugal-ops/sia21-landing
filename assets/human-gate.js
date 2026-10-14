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
 * through. Interaction signals still count for PageView and PostHog.
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
 */
(function (w, d) {
  "use strict";

  if (w.__SIA21_HUMAN_GATE_LOADED) return;
  w.__SIA21_HUMAN_GATE_LOADED = true;

  var INSTANT_PATHS = ["/obrigado.html", "/obrigado", "/ghl-agencias/obrigado.html"];
  var DWELL_MS = 6000;
  var CHECKOUT_MIN_MS = 1500;
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

  w.__SIA21_HUMAN = false;
  w.__SIA21_ENGAGED = false;
  w.__SIA21_PAGE_AT = startedAt;
  w.__SIA21_CHECKOUT_MIN_MS = CHECKOUT_MIN_MS;

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

  function deliverPh(name, props) {
    try {
      if (w.posthog && typeof w.posthog.capture === "function") {
        w.posthog.capture(name, props);
      }
    } catch (e) {}
  }

  function flushPhQueue() {
    if (!w.__SIA21_HUMAN || phDropped) return;
    var batch = phQueue.splice(0, phQueue.length);
    for (var i = 0; i < batch.length; i++) deliverPh(batch[i].name, batch[i].props);
  }

  w.SIA21_captureWhenHuman = function (name, props) {
    if (phDropped || !name) return;
    if (w.__SIA21_HUMAN) {
      deliverPh(name, props || {});
      return;
    }
    phQueue.push({ name: name, props: props || {} });
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

  w.SIA21_armTracking = function () {
    if (w.__SIA21_PH_ARMED) return;
    w.__SIA21_PH_ARMED = true;
    w.SIA21_onHuman(function () {
      var ph = w.posthog;
      if (!ph || w.__SIA21_PH_PAGEVIEW) return;
      w.__SIA21_PH_PAGEVIEW = true;
      try { ph.capture("$pageview"); } catch (e) {}
      try {
        ph.set_config({
          autocapture: true,
          capture_pageleave: true,
          enable_heatmaps: true,
          disable_session_recording: false
        });
      } catch (e) {}
      try { ph.startSessionRecording(); } catch (e) {}
    });
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
