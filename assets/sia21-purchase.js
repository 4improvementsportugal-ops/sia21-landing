/**
 * SIA21 Purchase, once per Stripe checkout.
 *
 * This is the only fbq("track", "Purchase") call in the repo. It sets
 * window.__SIA21_PURCHASE_ALLOW around that call. The stub in
 * assets/mthd-pixel.js drops every other Purchase.
 * obrigado.html calls SIA21_firePurchaseOnce from the pixel onInit,
 * after cookie consent. Thank-you pages stay on the instant human-gate
 * path. This file does not wait for a click and does not run elsewhere.
 *
 * assets/sia21-conv.js, assets/mthd-pixel.js and assets/human-gate.js
 * must not track Purchase.
 *
 * Purchase fires only when the URL carries a real Stripe live checkout
 * session (the value starts with cs_live_), SIA21_trackingSuppressed()
 * is false, and that session id has not already fired. eventID is the
 * session id, the same value the webhook sends as event_id (session.id)
 * with event_name Purchase. See docs/CAPI-CONTRACT.md. The same id is
 * written to localStorage and sessionStorage
 * before the pixel request (sia21_purchase_v1_<sid>, plus the older
 * sessionStorage key sia21_purchase_fired_<sid>), so a reload, the back
 * button, or a second webview does not fire again.
 *
 * A visit with no session id, a fake id, or a test id (cs_test_, or any
 * obvious test token such as TEST, FAKE, DUMMY, SAMPLE) sends no Purchase.
 * SIA21_allowCapture() also refuses every Meta and PostHog event for those
 * ids. PageView on the thank-you page is separate and can still fire for a
 * real visitor with a real cs_live_ id or with no session id.
 *
 * There is no PostHog "purchase" event. Anything that sends one later
 * has to go through SIA21_firePurchaseOnce so it shares this flag.
 * Payment Links need {CHECKOUT_SESSION_ID} on the success URL.
 */
(function (w) {
  "use strict";

  var DEFAULT_PURCHASE_VALUE = 37;
  var DEFAULT_CURRENCY = "EUR";
  var CONTENT_NAME = "Sistema IA Consultor 21 Dias";
  var CONTENT_IDS = ["sia21-core"];
  var SESSION_PARAMS = ["session_id", "checkout_session_id", "stripe_session_id", "cs_id"];

  function qs() {
    try { return new URLSearchParams(w.location.search); } catch (e) { return new URLSearchParams(); }
  }

  function isThankYou() {
    return (w.location.pathname || "").indexOf("obrigado") !== -1;
  }

  function obviousTestId(value) {
    if (typeof w.SIA21_obviousTestId === "function") return w.SIA21_obviousTestId(value);
    var raw = String(value || "");
    return /^cs_test_/i.test(raw) || /test|fake|dummy|sample|example|placeholder|headless|xxx/i.test(raw);
  }

  function isLiveSession(value) {
    var raw = String(value || "").trim();
    if (!/^cs_live_[A-Za-z0-9]+$/.test(raw)) return false;
    if (obviousTestId(raw)) return false;
    return true;
  }

  function sessionId() {
    var params = qs();
    var i;
    var found = "";
    for (i = 0; i < SESSION_PARAMS.length; i++) {
      var named = params.get(SESSION_PARAMS[i]) || "";
      if (isLiveSession(named)) return named.trim();
    }
    params.forEach(function (value) {
      if (found) return;
      if (isLiveSession(value)) found = String(value).trim();
    });
    return found;
  }

  function purchaseValue() {
    var params = qs();
    var raw = params.get("amount") || params.get("value") || params.get("amount_total") || "";
    if (!raw) return DEFAULT_PURCHASE_VALUE;
    var n = parseFloat(String(raw).replace(",", "."));
    if (!isFinite(n) || n <= 0) return DEFAULT_PURCHASE_VALUE;
    if (params.get("amount_total") && String(raw).indexOf(".") === -1 && n >= 100) n = n / 100;
    return Math.round(n * 100) / 100;
  }

  function contentIdsForValue(value) {
    if (value >= 90) return ["sia21-ang-pro"];
    if (value >= 45 && value < 50) return ["sia21-core-standard", "sia21-ang-lite"];
    if (value >= 35 && value < 40) return ["sia21-core-early"];
    if (value >= 30 && value < 35) return ["sia21-core-early-33"];
    if (value >= 13 && value < 16) return ["sia21-core-early-14"];
    return CONTENT_IDS.slice();
  }

  function storageGet(store, key) {
    try { return store.getItem(key); } catch (e) { return null; }
  }

  function storageSet(store, key, value) {
    try { store.setItem(key, value); } catch (e) {}
  }

  function dedupeKey(sid) {
    return "sia21_purchase_v1_" + sid;
  }

  function alreadyFired(sid) {
    var key = dedupeKey(sid);
    var mem = w.__SIA21_PURCHASE_KEYS;
    if (mem && mem[key]) return true;
    if (storageGet(w.sessionStorage, "sia21_purchase_fired_" + sid) === "1") return true;
    if (storageGet(w.sessionStorage, key) === "1") return true;
    if (storageGet(w.localStorage, key) === "1") return true;
    return false;
  }

  function markFired(sid) {
    var key = dedupeKey(sid);
    var mem = w.__SIA21_PURCHASE_KEYS || (w.__SIA21_PURCHASE_KEYS = {});
    mem[key] = true;
    storageSet(w.sessionStorage, key, "1");
    storageSet(w.localStorage, key, "1");
    storageSet(w.sessionStorage, "sia21_purchase_fired_" + sid, "1");
  }

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

  function firePurchaseOnce() {
    if (!isThankYou()) return false;
    if (!metaHostAllowed() || trackingBlocked()) return false;
    if (typeof w.fbq !== "function") return false;
    var sid = sessionId();
    if (!sid) return false;
    if (alreadyFired(sid)) return false;
    var value = purchaseValue();
    var payload = {
      value: value,
      currency: DEFAULT_CURRENCY,
      content_name: CONTENT_NAME,
      content_ids: contentIdsForValue(value),
      content_type: "product"
    };
    // Mark first so a second onInit in this turn cannot send again.
    markFired(sid);
    w.__SIA21_PURCHASE_ALLOW = true;
    try { w.fbq("track", "Purchase", payload, { eventID: sid }); } catch (e) {}
    w.__SIA21_PURCHASE_ALLOW = false;
    return true;
  }

  w.SIA21_checkoutSessionId = sessionId;
  w.SIA21_firePurchaseOnce = firePurchaseOnce;
})(window);
