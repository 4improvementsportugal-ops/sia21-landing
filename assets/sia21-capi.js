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
 *   c1_<fbpTs>_<fbpRand>_<fbcTs>_<fbclid>_p-<page>_u-<utm>
 *
 * The first five parts are unchanged. _p-<page> and, when the landing URL
 * has a safe utm_content, _u-<utm> are a suffix after the fbclid. The
 * fbclid is still the remainder after the 4th underscore, then the suffix
 * is stripped from the end. A value with no _p- suffix parses as before.
 * JavaScript String.split("_", 4) truncates and must not be used. See
 * docs/CAPI-CONTRACT.md. Only [A-Za-z0-9_-]. A bad fbclid or utm_content
 * is dropped, never edited. A value longer than 200 characters drops the
 * utm first, then the fbc, and keeps the page code. The fbclid is never
 * truncated. utm_content is also copied onto the Payment Link when it fits
 * Stripe's 150 character UTM limit.
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
  var PAGE_CODE = /^[a-z0-9]+$/;
  var UTM_MAX = 150;
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

  function pagePath() {
    var path = "";
    try { path = String(w.location.pathname || ""); } catch (e) { return ""; }
    path = path.replace(/\/index\.html$/, "/");
    path = path.replace(/\.html$/, "");
    if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    return path;
  }

  function pageCode() {
    var path = pagePath();
    if (path === "" || path === "/" || path === "/index") return "home";
    if (path === "/v4") return "v4";
    if (path === "/v3/storytelling") return "v3";
    if (path === "/obrigado") return "obg";
    var v1 = /^\/angles\/(0[1-9]|10)(?:-|$)/.exec(path);
    if (v1) return "a" + v1[1];
    var v2 = /^\/angles-v2\/(0[1-9]|10)(?:-|$)/.exec(path);
    if (v2) return "b" + v2[1];
    if (path === "/angles-v2/sobrecarga") return "bsob";
    var slug = path.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
    return PAGE_CODE.test(slug) ? slug : "unk";
  }

  function utmContent() {
    var raw = "";
    try { raw = new URLSearchParams(w.location.search || "").get("utm_content") || ""; } catch (e) { return ""; }
    if (!raw || raw.length > UTM_MAX || !SAFE_ID.test(raw)) return "";
    return raw;
  }

  function parseClientReference(value) {
    var match = /^c1_([0-9]+)_([0-9]+)_([0-9]+)_(.*)$/.exec(value || "");
    if (!match) return null;
    var rest = match[4];
    var page = "";
    var utm = "";
    var attr = /^(.*)_p-([a-z0-9]+)(?:_u-([A-Za-z0-9_-]+))?$/.exec(rest);
    if (attr) {
      rest = attr[1];
      page = attr[2];
      utm = attr[3] || "";
    }
    return {
      fbpTs: match[1],
      fbpRand: match[2],
      fbcTs: match[3],
      fbclid: rest,
      page: page,
      utm: utm
    };
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
    var page = pageCode();
    var utm = utmContent();
    if (!PAGE_CODE.test(page)) page = "unk";
    function build(useFbcTs, useFbclid, useUtm) {
      var value = "c1_" + fbpTs + "_" + fbpRand + "_" + useFbcTs + "_" + useFbclid + "_p-" + page;
      if (useUtm) value += "_u-" + useUtm;
      return value;
    }
    var full = build(fbcTs, fbclid, utm);
    if (full.length > MAX_LEN) full = build(fbcTs, fbclid, "");
    if (full.length > MAX_LEN) full = build("0", "", "");
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
    var utm = utmContent();
    var sameRef = params.get("client_reference_id") === ref;
    var sameUtm = !utm || params.get("utm_content") === utm;
    if (sameRef && sameUtm) return true;
    params.set("client_reference_id", ref);
    if (utm) params.set("utm_content", utm);
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
  w.SIA21_parseClientReference = parseClientReference;
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
