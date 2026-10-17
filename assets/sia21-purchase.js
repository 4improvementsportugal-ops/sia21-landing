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
 * When the URL has session_id, checkout_session_id, or another param
 * whose value is a Stripe checkout session (cs_live_ / cs_test_),
 * eventID is that session id. The same id is written to localStorage
 * and sessionStorage before the pixel request, so a reload, the back
 * button, or a second webview does not fire again.
 *
 * There is no PostHog "purchase" event. Anything that sends one later
 * has to go through SIA21_firePurchaseOnce so it shares this flag.
 *
 * If the success URL has no session id, the flag is the amount in cents
 * plus one slot per browser (sia21_purchase_once_v1_<cents>). A later
 * purchase of the same amount in that browser does not fire. No eventID
 * is sent in that case: an eventID of "37" would make Meta collapse
 * every buyer into one Purchase. Payment Links need
 * {CHECKOUT_SESSION_ID} on the success URL for a unique eventID.
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

  function sessionId() {
    var params = qs();
    var i;
    for (i = 0; i < SESSION_PARAMS.length; i++) {
      var named = params.get(SESSION_PARAMS[i]) || "";
      if (named) return named;
    }
    var found = "";
    params.forEach(function (value) {
      if (found) return;
      if (/^cs_(live|test)_[A-Za-z0-9]+$/.test(value || "")) found = value;
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

  function explicitAmountCents() {
    var params = qs();
    var raw = params.get("amount") || params.get("value") || params.get("amount_total") || "";
    if (!raw) return null;
    var n = parseFloat(String(raw).replace(",", "."));
    if (!isFinite(n) || n <= 0) return null;
    if (params.get("amount_total") && String(raw).indexOf(".") === -1 && n >= 100) n = n / 100;
    return Math.round(n * 100);
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

  function dedupeKey() {
    var sid = sessionId();
    if (sid) return "sia21_purchase_v1_" + sid;
    var cents = explicitAmountCents();
    if (cents != null) return "sia21_purchase_once_v1_" + cents;
    return "sia21_purchase_once_session_v1";
  }

  function persistsAcrossDocuments(key) {
    return key.indexOf("sia21_purchase_once_session_v1") !== 0;
  }

  function alreadyFired(key) {
    var mem = w.__SIA21_PURCHASE_KEYS;
    if (mem && mem[key]) return true;
    var sid = sessionId();
    if (sid && storageGet(w.sessionStorage, "sia21_purchase_fired_" + sid) === "1") return true;
    if (!sid && explicitAmountCents() == null && storageGet(w.sessionStorage, "sia21_purchase_fired") === "1") return true;
    if (storageGet(w.sessionStorage, key) === "1") return true;
    if (persistsAcrossDocuments(key) && storageGet(w.localStorage, key) === "1") return true;
    return false;
  }

  function markFired(key) {
    var mem = w.__SIA21_PURCHASE_KEYS || (w.__SIA21_PURCHASE_KEYS = {});
    mem[key] = true;
    storageSet(w.sessionStorage, key, "1");
    if (persistsAcrossDocuments(key)) storageSet(w.localStorage, key, "1");
    var sid = sessionId();
    if (sid) storageSet(w.sessionStorage, "sia21_purchase_fired_" + sid, "1");
    else if (explicitAmountCents() == null) storageSet(w.sessionStorage, "sia21_purchase_fired", "1");
  }

  function firePurchaseOnce() {
    if (!isThankYou()) return false;
    if (!w.fbq) return false;
    var key = dedupeKey();
    if (alreadyFired(key)) return false;
    var value = purchaseValue();
    var sid = sessionId();
    var payload = {
      value: value,
      currency: DEFAULT_CURRENCY,
      content_name: CONTENT_NAME,
      content_ids: contentIdsForValue(value),
      content_type: "product"
    };
    // Mark first so a second onInit in this turn cannot send again.
    markFired(key);
    try {
      if (sid) w.fbq("track", "Purchase", payload, { eventID: sid });
      else w.fbq("track", "Purchase", payload);
    } catch (e) {}
    return true;
  }

  w.SIA21_checkoutSessionId = sessionId;
  w.SIA21_firePurchaseOnce = firePurchaseOnce;
})(window);
