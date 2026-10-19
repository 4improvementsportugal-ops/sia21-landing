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
 * or a previous one). _fbc is written only after that. The reference is
 * still added without consent, but then it carries no Meta cookies:
 *
 *   with consent:    c2_<pag>_<utm>_<fbpTs>_<fbpRand>_<fbcTs>_<fbclid>
 *   without consent: c0_<pag>_<utm>
 *
 * fbclid is the last field: everything after the 6th underscore. pag and
 * utm never contain an underscore, so that cut is stable. A historical
 * c1_ value is not rewritten and its parser is unchanged. See
 * docs/CAPI-CONTRACT.md. pag and utm are lowercase [a-z0-9-], at most
 * 12 characters. The only empty value is lowercase x. Uppercase X is
 * never written. A slot that is not a lowercase code counts as x. A
 * longer utm_content is shortened with a fixed hash of the whole
 * sanitized value. c0 is exactly c0, pag and utm. A bad fbclid is dropped,
 * never edited. A value longer than 200 characters drops the fbc and
 * keeps pag, utm and the fbp. The fbclid is never truncated. A Stripe-safe
 * utm_content is also copied onto the Payment Link (150 character limit).
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
  var SLOT = /^[a-z0-9-]{1,12}$/;
  var UTM_MAX = 150;
  var C2_SHAPE = /^c2_[a-z0-9-]{1,12}_[a-z0-9-]{1,12}_[0-9]+_[0-9]+_[0-9]+_[A-Za-z0-9_-]*$/;
  var C0_SHAPE = /^c0_[a-z0-9-]{1,12}_[a-z0-9-]{1,12}$/;

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

  function fnv1a(text) {
    var h = 0x811c9dc5;
    var i;
    for (i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function base36Pad(n) {
    var s = (n >>> 0).toString(36);
    while (s.length < 7) s = "0" + s;
    return s;
  }

  function asSlot(value) {
    return SLOT.test(value || "") ? value : "x";
  }

  function shortenSlot(raw) {
    var clean = String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!clean) return "x";
    var code = clean.length <= 12 ? clean : clean.slice(0, 5) + base36Pad(fnv1a(clean));
    return asSlot(code);
  }

  function pageCode() {
    var path = pagePath();
    if (path === "" || path === "/" || path === "/index") return "idx";
    if (path === "/v4") return "v4";
    if (path === "/v3/storytelling") return "v3";
    if (path === "/obrigado") return "obg";
    var v1 = /^\/angles\/(0[1-9]|10)(?:-|$)/.exec(path);
    if (v1) return "a" + v1[1];
    var v2 = /^\/angles-v2\/(0[1-9]|10)(?:-|$)/.exec(path);
    if (v2) return "v2-" + v2[1];
    if (path === "/angles-v2/sobrecarga") return "v2-sob";
    var parts = path.split("/");
    var tail = parts.length ? parts[parts.length - 1] : "";
    return shortenSlot(tail);
  }

  function rawUtm() {
    try { return new URLSearchParams(w.location.search || "").get("utm_content") || ""; } catch (e) { return ""; }
  }

  function utmContent() {
    var raw = rawUtm();
    if (!raw || raw.length > UTM_MAX || !SAFE_ID.test(raw)) return "";
    return raw;
  }

  function utmSlot() {
    return shortenSlot(rawUtm());
  }

  function parseClientReference(value) {
    var text = value || "";
    if (text.indexOf("c2_") === 0) {
      var c2 = /^c2_([^_]*)_([^_]*)_([0-9]+)_([0-9]+)_([0-9]+)_(.*)$/.exec(text);
      if (!c2) return null;
      return {
        fbpTs: c2[3],
        fbpRand: c2[4],
        fbcTs: c2[5],
        fbclid: c2[6],
        page: asSlot(c2[1]),
        utm: asSlot(c2[2])
      };
    }
    if (text.indexOf("c0_") === 0) {
      var parts = text.split("_");
      if (parts.length !== 3 || parts[0] !== "c0") return null;
      return {
        fbpTs: "",
        fbpRand: "",
        fbcTs: "",
        fbclid: "",
        page: asSlot(parts[1]),
        utm: asSlot(parts[2])
      };
    }
    var match = /^c1_([0-9]+)_([0-9]+)_([0-9]+)_(.*)$/.exec(text);
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
    var page = asSlot(pageCode());
    var utm = asSlot(utmSlot());
    if (!consentAccepted()) {
      var bare = "c0_" + page + "_" + utm;
      if (bare.split("_").length !== 3 || !C0_SHAPE.test(bare)) return "";
      return bare;
    }
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
    var full = "c2_" + page + "_" + utm + "_" + fbpTs + "_" + fbpRand + "_" + fbcTs + "_" + fbclid;
    if (full.length > MAX_LEN) full = "c2_" + page + "_" + utm + "_" + fbpTs + "_" + fbpRand + "_0_";
    if (!C2_SHAPE.test(full) || full.length > MAX_LEN) return "";
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
    if (!anchor || !anchor.getAttribute) return false;
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
      if (excludedPage()) return;
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
