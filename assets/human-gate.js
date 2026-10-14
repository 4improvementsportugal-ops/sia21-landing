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
 * through. Interaction signals still count.
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

  w.__SIA21_HUMAN = false;

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

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (dwellTimer) {
      clearInterval(dwellTimer);
      dwellTimer = null;
    }
    w.removeEventListener("scroll", onScroll, true);
    w.removeEventListener("wheel", onWheel, true);
    w.removeEventListener("keydown", onKey, true);
    w.removeEventListener("click", onClick, true);
    w.removeEventListener("touchstart", onTouch, true);
    w.removeEventListener("mousemove", onMove, true);
    d.removeEventListener("visibilitychange", onVisibility);
  }

  function markHuman() {
    if (fired) return;
    fired = true;
    w.__SIA21_HUMAN = true;
    cleanup();
    flushPhQueue();
    var cbs = listeners.splice(0, listeners.length);
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](); } catch (e) {}
    }
    try { w.dispatchEvent(new CustomEvent("sia21:human")); } catch (e) {}
  }

  w.SIA21_onHuman = function (cb) {
    if (typeof cb !== "function") return;
    if (w.__SIA21_HUMAN) {
      try { cb(); } catch (e) {}
      return;
    }
    listeners.push(cb);
  };

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

  function onScroll() {
    var y = w.scrollY || d.documentElement.scrollTop || (d.body && d.body.scrollTop) || 0;
    if (y > 80) markHuman();
  }
  function onWheel() { markHuman(); }
  function onKey() { markHuman(); }
  function onClick() { markHuman(); }
  function onTouch() { markHuman(); }
  function onMove() {
    moveCount += 1;
    if (moveCount > 3) markHuman();
  }

  function sampleDwell() {
    if (fired) return;
    var now = Date.now();
    var visible = tabVisible();
    if (visible && lastVisible && lastSample) {
      accumulated += now - lastSample;
      if (accumulated >= DWELL_MS) {
        markHuman();
        return;
      }
    }
    lastSample = now;
    lastVisible = visible;
  }

  function onVisibility() {
    lastSample = Date.now();
    lastVisible = tabVisible();
  }

  if (pathMatchesInstant(w.location.pathname)) {
    markHuman();
    return;
  }

  w.addEventListener("scroll", onScroll, true);
  w.addEventListener("wheel", onWheel, true);
  w.addEventListener("keydown", onKey, true);
  w.addEventListener("click", onClick, true);
  w.addEventListener("touchstart", onTouch, true);
  w.addEventListener("mousemove", onMove, true);
  d.addEventListener("visibilitychange", onVisibility);
  lastSample = Date.now();
  lastVisible = tabVisible();
  dwellTimer = setInterval(sampleDwell, 250);
  onScroll();
})(window, document);
