/**
 * SIA21 Purchase, once per Stripe checkout.
 *
 * This is the only fbq("track", "Purchase") call in the repo.
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
 * session id. The same id is written to localStorage and sessionStorage
 * before the pixel request (sia21_purchase_v1_<sid>, plus the older
 * sessionStorage key sia21_purchase_fired_<sid>), so a reload, the back
 * button, or a second webview does not fire again.
 *
 * A visit with no session id, a fake id, or a test id (cs_test_) sends
 * no Purchase. PageView on the thank-you page is separate and can still
 * fire for a real visitor.
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

  function isLiveSession(value) {
    return /^cs_live_[A-Za-z0-9]+$/.test(String(value || "").trim());
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

  function trackingBlocked() {
    if (typeof w.SIA21_trackingSuppressed !== "function" || w.SIA21_trackingSuppressed()) return true;
    if (typeof w.SIA21_allowCapture === "function" && !w.SIA21_allowCapture()) return true;
    return false;
  }

  function firePurchaseOnce() {
    if (!isThankYou()) return false;
    if (trackingBlocked()) return false;
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
    try { w.fbq("track", "Purchase", payload, { eventID: sid }); } catch (e) {}
    return true;
  }

  w.SIA21_checkoutSessionId = sessionId;
  w.SIA21_firePurchaseOnce = firePurchaseOnce;
})(window);
