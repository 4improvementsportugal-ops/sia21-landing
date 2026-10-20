/**
 * Browser half of the Meta Conversions API join.
 *
 * Stripe copies client_reference_id from the Payment Link onto the
 * Checkout Session. The webhook reads that value. This file builds it
 * from the Meta cookies and appends it to every anchor whose href starts
 * with https://buy.stripe.com/, including links inserted later. A new
 * Payment Link needs no extra code. ghl-agencias is skipped. The human
 * gate still refreshes the value on an allowed click, before the lock.
 * See docs/CAPI-CONTRACT.md.
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
 * SIA21_sendCapi is the only fetch to a CAPI endpoint, and it runs only when
 * SIA21_metaHostAllowed() is true: https and the exact production host.
 * Off that host this file does not write _fbc and does not add
 * client_reference_id, so a local click cannot feed the server CAPI.
 * /obrigado is not exempt. ?meta_debug=1 does not enable it off production.
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

  function capiEndpoint(url) {
    var raw = String(url || "");
    if (!raw) return false;
    var host = "";
    try {
      var base = w.location && w.location.href ? w.location.href : undefined;
      host = new URL(raw, base).hostname || "";
    } catch (e) { host = ""; }
    if (host === "facebook.com" || (host.length > 13 && host.slice(-13) === ".facebook.com")) return true;
    if (host === "facebook.net" || (host.length > 13 && host.slice(-13) === ".facebook.net")) return true;
    if (/\/capi(?:\/|\?|$)/i.test(raw) || /conversionsapi/i.test(raw)) return true;
    return false;
  }

  // The only browser fetch toward a CAPI endpoint. Refuses the call off-host.
  w.SIA21_sendCapi = function (url, payload) {
    if (!metaHostAllowed() || !capiEndpoint(url) || typeof w.fetch !== "function") return Promise.resolve(false);
    try {
      return w.fetch(url, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      }).then(function () { return true; }, function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  };

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
    if (!metaHostAllowed()) return;
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
    if (!metaHostAllowed()) return "";
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

  var STRIPE_PREFIX = "https://buy.stripe.com/";

  function excludedPage() {
    try {
      return String(w.location.pathname || "").indexOf("ghl-agencias") !== -1;
    } catch (e) { return false; }
  }

  function attachClientReference(anchor) {
    if (!metaHostAllowed()) return false;
    if (excludedPage()) return false;
    if (!anchor || !anchor.getAttribute || !consentAccepted()) return false;
    var ref = clientReferenceId();
    if (!ref) return false;
    var raw = anchor.getAttribute("href") || "";
    if (raw.indexOf(STRIPE_PREFIX) !== 0) return false;
    var url;
    try { url = new URL(raw); } catch (e) { return false; }
    if (url.protocol !== "https:" || url.hostname !== "buy.stripe.com") return false;
    var params = new URLSearchParams(url.search);
    if (params.get("client_reference_id") === ref) return true;
    params.set("client_reference_id", ref);
    url.search = params.toString();
    var next = url.toString();
    if (next === raw) return true;
    anchor.setAttribute("href", next);
    return true;
  }

  function decorateStripeLinks(root) {
    if (excludedPage()) return 0;
    var scope = root && root.querySelectorAll ? root : d;
    var n = 0;
    if (scope.nodeName === "A" && attachClientReference(scope)) n++;
    var links;
    try { links = scope.querySelectorAll('a[href^="https://buy.stripe.com/"]'); } catch (e) { return n; }
    var i;
    for (i = 0; i < links.length; i++) {
      if (attachClientReference(links[i])) n++;
    }
    return n;
  }

  function watchStripeLinks() {
    if (w.__SIA21_CAPI_OBS || !w.MutationObserver) return;
    var root = d.documentElement;
    if (!root) return;
    w.__SIA21_CAPI_OBS = true;
    var obs = new MutationObserver(function (records) {
      if (excludedPage() || !consentAccepted()) return;
      var i, j;
      for (i = 0; i < records.length; i++) {
        var rec = records[i];
        if (rec.type === "attributes") {
          attachClientReference(rec.target);
          continue;
        }
        var added = rec.addedNodes;
        for (j = 0; j < added.length; j++) {
          var node = added[j];
          if (!node || node.nodeType !== 1) continue;
          decorateStripeLinks(node);
        }
      }
    });
    try {
      obs.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href"]
      });
    } catch (e) {}
  }

  function bootStripeLinks() {
    watchStripeLinks();
    decorateStripeLinks(d);
  }

  w.SIA21_clientReferenceId = clientReferenceId;
  w.SIA21_attachClientReference = attachClientReference;
  w.SIA21_decorateStripeLinks = decorateStripeLinks;

  noteLanding();
  ensureFbc();
  watchStripeLinks();
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", bootStripeLinks);
  else bootStripeLinks();

  // Bubble phase: the banner writes localStorage on the way up, then we
  // persist _fbc and fill links already on the page. A capture listener
  // would run before that write.
  d.addEventListener("click", function (e) {
    var node = e.target && e.target.closest ? e.target.closest("[data-ck]") : null;
    if (!node || node.getAttribute("data-ck") !== "accepted") return;
    noteLanding();
    ensureFbc();
    decorateStripeLinks(d);
  });
})(window, document);
