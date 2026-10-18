/**
 * Browser half of the Meta Conversions API join.
 *
 * Stripe copies client_reference_id from the Payment Link onto the
 * Checkout Session. The webhook reads that value. This file builds it
 * from the Meta cookies and appends it when a buy.stripe.com link is
 * allowed to open. See docs/CAPI-CONTRACT.md.
 *
 * Consent is localStorage 4i_cookie_consent_v1 === "accepted" (this visit
 * or a previous one). Without that, the parameter is not added and _fbc
 * is not written.
 *
 *   c1_<fbpTs>_<fbpRand>_<fbcTs>_<fbclid>
 *
 * Five parts. The fbclid is the whole remainder after the 4th underscore,
 * rejoined, because it may contain underscores. JavaScript
 * String.split("_", 4) truncates and must not be used. See
 * docs/CAPI-CONTRACT.md. Only [A-Za-z0-9_-]. A bad fbclid is dropped, never
 * edited. A value longer than 200 characters drops the fbc and keeps the
 * fbp. The fbclid is never truncated.
 *
 * _fbp is fb.1.<ts>.<rand> (both numeric). _fbc is fb.1.<ts>.<fbclid>.
 * If the landing URL has ?fbclid= and there is no _fbc yet, the cookie is
 * created after consent: fb.1.<ts>.<fbclid>, ts = when that fbclid was
 * first seen, Max-Age 90 days, path=/, host-only. An existing _fbc is
 * left alone so navigation keeps the original timestamp.
 */
(function (w, d) {
  "use strict";

  if (w.__SIA21_CAPI_LOADED) return;
  w.__SIA21_CAPI_LOADED = true;

  var CONSENT_KEY = "4i_cookie_consent_v1";
  var MAX_LEN = 200;
  var FBC_MAX_AGE = 90 * 24 * 60 * 60;
  var SAFE_ID = /^[A-Za-z0-9_-]+$/;
  var REF_SHAPE = /^c1_[0-9]+_[0-9]+_[0-9]+_[A-Za-z0-9_-]*$/;

  var landingFbclid = "";
  var landingSeenAt = 0;

  function consentAccepted() {
    try { return w.localStorage.getItem(CONSENT_KEY) === "accepted"; } catch (e) { return false; }
  }

  function cookieGet(name) {
    var all = d.cookie ? String(d.cookie).split(";") : [];
    var i;
    for (i = 0; i < all.length; i++) {
      var part = all[i].replace(/^\s+/, "");
      var eq = part.indexOf("=");
      if (eq <= 0) continue;
      if (part.slice(0, eq) !== name) continue;
      var raw = part.slice(eq + 1);
      try { return decodeURIComponent(raw); } catch (e) { return raw; }
    }
    return "";
  }

  function seenNow() {
    var now = Date.now();
    try {
      var origin = w.performance && w.performance.timeOrigin;
      if (typeof origin === "number" && isFinite(origin) && origin > 0 && now >= origin && now - origin < 30 * 60 * 1000) {
        return Math.round(origin);
      }
    } catch (e) {}
    return now;
  }

  function fbclidFromLocation() {
    try {
      return new URLSearchParams(w.location.search || "").get("fbclid") || "";
    } catch (e) { return ""; }
  }

  function noteLanding() {
    if (landingFbclid) return;
    var id = fbclidFromLocation();
    if (!id) return;
    landingFbclid = id;
    landingSeenAt = seenNow();
  }

  function safeFbclid(id) {
    return !!id && SAFE_ID.test(id);
  }

  function writeFbc(ts, fbclid) {
    if (!/^[0-9]+$/.test(String(ts)) || !safeFbclid(fbclid)) return;
    var value = "fb.1." + ts + "." + fbclid;
    var cookie = "_fbc=" + value + "; Max-Age=" + FBC_MAX_AGE + "; path=/; SameSite=Lax";
    try {
      if (w.location && w.location.protocol === "https:") cookie += "; Secure";
    } catch (e) {}
    d.cookie = cookie;
  }

  function ensureFbc() {
    if (!consentAccepted()) return;
    if (cookieGet("_fbc")) return;
    if (!landingFbclid || !landingSeenAt || !safeFbclid(landingFbclid)) return;
    writeFbc(landingSeenAt, landingFbclid);
  }

  function parseFbp(raw) {
    var match = /^fb\.1\.([0-9]+)\.([0-9]+)$/.exec(raw || "");
    if (!match) return null;
    return { ts: match[1], rand: match[2] };
  }

  function parseFbc(raw) {
    var match = /^fb\.1\.([0-9]+)\.([A-Za-z0-9_-]+)$/.exec(raw || "");
    if (!match) return null;
    return { ts: match[1], fbclid: match[2] };
  }

  function clientReferenceId() {
    if (!consentAccepted()) return "";
    ensureFbc();
    var fbp = parseFbp(cookieGet("_fbp"));
    var fbc = parseFbc(cookieGet("_fbc"));
    var fbpTs = fbp ? fbp.ts : "0";
    var fbpRand = fbp ? fbp.rand : "0";
    var fbcTs = "0";
    var fbclid = "";
    if (fbc && safeFbclid(fbc.fbclid)) {
      fbcTs = fbc.ts;
      fbclid = fbc.fbclid;
    }
    var full = "c1_" + fbpTs + "_" + fbpRand + "_" + fbcTs + "_" + fbclid;
    if (full.length > MAX_LEN) full = "c1_" + fbpTs + "_" + fbpRand + "_0_";
    if (!REF_SHAPE.test(full) || full.length > MAX_LEN) return "";
    return full;
  }

  function attachClientReference(anchor) {
    if (!anchor || !anchor.getAttribute || !consentAccepted()) return false;
    var ref = clientReferenceId();
    if (!ref) return false;
    var raw = anchor.getAttribute("href") || "";
    if (!raw || raw.indexOf("buy.stripe.com") === -1) return false;
    var url;
    try { url = new URL(raw, w.location.href); } catch (e) { return false; }
    if (url.hostname !== "buy.stripe.com") return false;
    var params = new URLSearchParams(url.search);
    if (params.get("client_reference_id") === ref) return true;
    params.set("client_reference_id", ref);
    url.search = params.toString();
    anchor.setAttribute("href", url.toString());
    return true;
  }

  w.SIA21_clientReferenceId = clientReferenceId;
  w.SIA21_attachClientReference = attachClientReference;

  noteLanding();
  ensureFbc();

  // Bubble phase: the banner writes localStorage on the way up, then we
  // persist _fbc. A capture listener would run before that write.
  d.addEventListener("click", function (e) {
    var node = e.target && e.target.closest ? e.target.closest("[data-ck]") : null;
    if (!node || node.getAttribute("data-ck") !== "accepted") return;
    noteLanding();
    ensureFbc();
  });
})(window, document);
