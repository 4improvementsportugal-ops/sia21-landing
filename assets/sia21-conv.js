/**
 * SIA21 conversion helper: Meta events, retorno copy, FOMO toast, exit intent.
 *
 * Loaded on index.html and angles/01..10 only. Purchase stays in
 * assets/sia21-purchase.js, called from obrigado.html. Do not track Purchase here.
 * Meta events fire only after cookie consent (4i_cookie_consent_v1 === "accepted"),
 * SIA21_startHumanGatedPixel has started the pixel, and the human gate is open
 * (window.__SIA21_HUMAN / SIA21_onHuman). ViewContent is not tied to onInit.
 * PostHog custom events wait on SIA21_captureWhenHuman and are dropped on leave.
 *
 * Price ladder (match creatives). Ads promise Standard €47 (strike price on the LP).
 *   window.SIA21_EARLY_37  primary Early Bird €37
 *     https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02
 *   window.SIA21_EARLY_33  1st leave attempt €33
 *     https://buy.stripe.com/fZueVf1OFc4D7Eb1vMgrS04
 *   window.SIA21_EARLY_14  2nd leave attempt, final offer €14, 5 min timer
 *     https://buy.stripe.com/6oU3cx3WN0lVbUr0rIgrS05
 * €10 is not part of this ladder.
 * InitiateCheckout value matches the link: 37 / 33 / 14. ViewContent is 37.
 * Exit step lives in sessionStorage (sia21_exit_step_v2): 0 none, 1 saw €33, 2 saw €14.
 * €14 opens only after the visitor dismissed €33 (close, Escape, or "Quero mesmo sair").
 * A checkout click is not a dismissal. On angles/ and angles-v2/ only, a human
 * who reaches the end and stays there ~5s, or who leaves on mobile
 * (visibility hidden, freeze/resume, or a fast scroll up), sees
 * the same €33 dialog once per visitor (localStorage sia21_scroll_exit_once_v1).
 * "The end" is the footer, or the depth-100 sentinel, actually in the viewport.
 * Facebook and Instagram in-app webviews often leave window.scrollY at 0:
 * the page scrolls inside another element, or the layout moves without a
 * window scroll event. Those positions are read from getBoundingClientRect
 * and from any viewport-sized overflow scroller, on a timer as well as on
 * scroll, because an inner scroll event does not reach a window listener.
 * That trigger never advances the ladder. Coming back from Stripe without paying
 * opens €33, or €14 only if €33 was already dismissed. Return is detected from
 * visibility, focus, pageshow/bfcache, and a later load that still has
 * sia21_stripe_left_at_v1. In-app browsers often skip pagehide, so the away
 * flag may be missing; the left timestamp on a new document is enough.
 * The dialog still waits until SIA21_mayShowExit() is true.
 * target=_blank (and in-app browsers that keep this document alive) does not
 * emit pageshow, so a hide then show counts.
 * Each step shows once per session. obrigado.html reads amount from the URL.
 * PostHog (snippet in <head>, armed only after the human gate) records
 * stripe_checkout_click plus the €33/€14 exit events. Those captures never
 * change the ladder, copy, or Stripe links. They are queued until
 * window.__SIA21_HUMAN and dropped on pagehide if that signal never comes.
 * Exit popups stay closed until SIA21_mayShowExit() (scroll, mouse movement
 * or visible dwell already happened, and navigator.webdriver is false).
 * stripe_checkout_click and InitiateCheckout fire only when human-gate.js
 * let this click through to buy.stripe.com. The allowed click opens the
 * human gate itself, so InitiateCheckout does not wait for an earlier
 * signal. The same handler sets window.__SIA21_IC_ARMED so the gate can
 * hold navigation until the pixel request is queued. Each InitiateCheckout
 * that fires gets a new eventID, m21ic_ plus a uuid, generated for that
 * fire and never reused. The same value is the event_id property on
 * stripe_checkout_click. A replayed click (window.__SIA21_STRIPE_LEAVING)
 * is ignored. A second tap while that navigation is held does not fire
 * another stripe_checkout_click or InitiateCheckout, and does not mint
 * another eventID. After the gate finishes that navigation, it clears
 * window.__SIA21_CHECKOUT_SENT_HREF. The next tap on the same Payment
 * Link is a new checkout and a new eventID.
 */
(function (w, d) {
  "use strict";

  if (w.__SIA21_CONV_LOADED) return;
  w.__SIA21_CONV_LOADED = true;

  var EARLY_37 = "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02";
  var EARLY_33 = "https://buy.stripe.com/fZueVf1OFc4D7Eb1vMgrS04";
  var EARLY_14 = "https://buy.stripe.com/6oU3cx3WN0lVbUr0rIgrS05";

  var ANGLES = {
    "01-tempo": "Tempo",
    "02-rgpd": "RGPD",
    "03-idealista": "Idealista",
    "04-whatsapp": "WhatsApp",
    "05-angariacao": "Angariação",
    "06-chatgpt-falhou": "ChatGPT",
    "sobrecarga": "Sobrecarga",
    "07-metodo-21-dias": "Método 21 dias",
    "08-solo-escala": "Solo",
    "09-early-37": "Early",
    "10-visitas-ops": "Visitas"
  };

  var RETORNO_LEAD = "Retorno esperado:";
  var RETORNO_BODY = " Em ~21 dias ficas operacional com IA para criar anúncios (Idealista e restantes) mais rápido, com processo repetível.";
  var PROOF_LINE = "Mais de 1000 compras em ofertas semelhantes da 4Improvements";

  var STEP_KEY = "sia21_exit_step_v2";
  var DISMISS_KEY = "sia21_exit_33_dismissed_v1";
  var STRIPE_LEFT_KEY = "sia21_stripe_left_at_v1";
  var STRIPE_AWAY_KEY = "sia21_stripe_away_v1";
  var DEADLINE_KEY = "sia21_exit14_deadline_v1";
  var SCROLL_ONCE_KEY = "sia21_scroll_exit_once_v1";
  var OFFER_MS = 5 * 60 * 1000;

  w.SIA21_EARLY_37 = EARLY_37;
  w.SIA21_EARLY_33 = EARLY_33;
  w.SIA21_EARLY_14 = EARLY_14;
  w.SIA21_CHECKOUT = {
    early37: EARLY_37,
    early33: EARLY_33,
    early14: EARLY_14,
    pixelId: "1506988540335331"
  };

  function payLink(which) {
    var checkout = w.SIA21_CHECKOUT || {};
    if (which === 14) return w.SIA21_EARLY_14 || checkout.early14 || EARLY_14;
    if (which === 33) return w.SIA21_EARLY_33 || checkout.early33 || EARLY_33;
    return w.SIA21_EARLY_37 || checkout.early37 || EARLY_37;
  }

  function isThankYou() {
    return (w.location.pathname || "").indexOf("obrigado") !== -1;
  }

  function isAngleLanding() {
    var path = w.location.pathname || "";
    return path.indexOf("/angles/") !== -1 || path.indexOf("/angles-v2/") !== -1;
  }

  function scrollOfferUsed() {
    try { return w.localStorage.getItem(SCROLL_ONCE_KEY) === "1"; } catch (e) { return false; }
  }

  function markScrollOfferUsed() {
    try { w.localStorage.setItem(SCROLL_ONCE_KEY, "1"); } catch (e) {}
  }

  function debugMode() {
    return /(?:\?|&)sia21_debug=1(?:&|$)/.test(w.location.search || "");
  }

  function angleName() {
    var path = w.location.pathname || "";
    var keys = Object.keys(ANGLES);
    for (var i = 0; i < keys.length; i++) {
      if (path.indexOf("/" + keys[i]) !== -1) return ANGLES[keys[i]];
    }
    return "Home";
  }

  function angleSlug() {
    var path = w.location.pathname || "";
    var keys = Object.keys(ANGLES);
    for (var i = 0; i < keys.length; i++) {
      if (path.indexOf("/" + keys[i]) !== -1) return keys[i];
    }
    if (path.indexOf("obrigado") !== -1) return "obrigado";
    return "home";
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

  function capturePh(name, props) {
    if (trackingBlocked()) return;
    if (typeof w.SIA21_captureWhenHuman === "function") {
      w.SIA21_captureWhenHuman(name, props);
      return;
    }
    if (typeof w.SIA21_onHuman === "function") {
      w.SIA21_onHuman(function () {
        try {
          if (trackingBlocked()) return;
          if (w.posthog && typeof w.posthog.capture === "function") w.posthog.capture(name, props);
        } catch (e) {}
      });
    }
  }
  w.SIA21_capturePh = capturePh;

  function stripePrice(anchor) {
    var href = (anchor && anchor.getAttribute && anchor.getAttribute("href")) || "";
    var offer = (anchor && anchor.getAttribute && anchor.getAttribute("data-sia21-offer")) || "";
    if (offer === "early-14" || href.indexOf(EARLY_14) !== -1) return 14;
    if (offer === "early-33" || href.indexOf(EARLY_33) !== -1) return 33;
    if (href.indexOf("14A9AVgJz9Wve2zfmCgrS00") !== -1) return 97;
    if (href.indexOf("dRm00lbpf5Gf1fNb6mgrS01") !== -1) return 47;
    return 37;
  }

  function pixelReady() {
    if (trackingBlocked()) return false;
    return !!(w.fbq && w.__SIA21_MTHD_STARTED);
  }

  function remember(eventName, payload) {
    var list = w.__SIA21_EVENTS || (w.__SIA21_EVENTS = []);
    list.push({ event: eventName, payload: payload, t: Date.now() });
  }

  function checkoutValue(anchor) {
    var href = (anchor && anchor.getAttribute && anchor.getAttribute("href")) || "";
    var offer = (anchor && anchor.getAttribute && anchor.getAttribute("data-sia21-offer")) || "";
    var early14 = payLink(14);
    var early33 = payLink(33);
    if (offer === "early-14" || (early14 && href.indexOf(early14) !== -1)) return 14;
    if (offer === "early-33" || (early33 && href.indexOf(early33) !== -1)) return 33;
    return 37;
  }

  function contentIdForValue(value) {
    if (value === 14) return "sia21-core-early-14";
    if (value === 33) return "sia21-core-early-33";
    return "sia21-core-early";
  }

  function fireViewContent() {
    if (w.__SIA21_VC_FIRED || isThankYou() || !pixelReady() || !w.__SIA21_HUMAN) return;
    w.__SIA21_VC_FIRED = true;
    var payload = {
      content_name: angleName(),
      content_ids: ["sia21-core-early"],
      content_type: "product",
      value: 37,
      currency: "EUR"
    };
    remember("ViewContent", payload);
    if (trackingBlocked() || !metaHostAllowed() || typeof w.fbq !== "function") return;
    try { w.fbq("track", "ViewContent", payload); } catch (e) {}
  }

  function checkoutIntentLocked() {
    if (w.__SIA21_STRIPE_LEAVE_PENDING === true) return true;
    return typeof w.__SIA21_CHECKOUT_LOCK_UNTIL === "number" && Date.now() < w.__SIA21_CHECKOUT_LOCK_UNTIL;
  }

  function freshUuid() {
    try {
      if (w.crypto && typeof w.crypto.randomUUID === "function") return w.crypto.randomUUID();
    } catch (e) {}
    var bytes = new Array(16);
    var i;
    var filled = false;
    try {
      if (w.crypto && typeof w.crypto.getRandomValues === "function") {
        var buf = new Uint8Array(16);
        w.crypto.getRandomValues(buf);
        for (i = 0; i < 16; i++) bytes[i] = buf[i];
        filled = true;
      }
    } catch (e2) { filled = false; }
    if (!filled) {
      for (i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = "";
    for (i = 0; i < 16; i++) {
      var part = bytes[i].toString(16);
      hex += (part.length === 1 ? "0" : "") + part;
    }
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  // One id per InitiateCheckout. A later tap on the same Payment Link,
  // including after a return from Stripe, mints another. A double tap
  // during the wait, and the click the gate replays, never reach here.
  function checkoutEventId() {
    var issued = w.__SIA21_IC_EVENT_IDS || (w.__SIA21_IC_EVENT_IDS = {});
    var id = "";
    var n = 0;
    do {
      id = "m21ic_" + freshUuid();
      n += 1;
    } while (issued[id] && n < 8);
    issued[id] = 1;
    return id;
  }

  function onCheckoutClick(e) {
    if (w.__SIA21_STRIPE_LEAVING) return;
    var anchor = e.target && e.target.closest ? e.target.closest('a[href*="buy.stripe.com"]') : null;
    if (!anchor) return;
    if (w.__SIA21_CHECKOUT_OK !== true) return;
    // The gate already stops a second tap on the same Payment Link while
    // that checkout is in flight. This is the same rule when the click
    // still reaches here. The gate clears __SIA21_CHECKOUT_SENT_HREF
    // after the navigation, so a later tap on the same link is a new
    // intent. A different link, such as the €33 exit, is a new intent too.
    var href = anchor.getAttribute("href") || "";
    if (checkoutIntentLocked() && href && href === w.__SIA21_CHECKOUT_SENT_HREF) return;
    w.__SIA21_CHECKOUT_SENT_HREF = href;
    var eventId = checkoutEventId();
    capturePh("stripe_checkout_click", { angle: angleSlug(), price: stripePrice(anchor), event_id: eventId });
    // human-gate.js calls markHuman() on this same click before we run.
    if (!w.__SIA21_HUMAN || !pixelReady() || isThankYou()) return;
    var value = checkoutValue(anchor);
    var payload = {
      value: value,
      currency: "EUR",
      content_name: "Sistema IA do Consultor",
      content_ids: [contentIdForValue(value)],
      content_type: "product"
    };
    remember("InitiateCheckout", payload);
    if (trackingBlocked() || !metaHostAllowed() || typeof w.fbq !== "function") return;
    try { w.fbq("track", "InitiateCheckout", payload, { eventID: eventId }); } catch (err) { return; }
    w.__SIA21_IC_ARMED = true;
  }

  function wrapPixel() {
    if (w.__SIA21_CONV_WRAPPED) return true;
    var orig = w.SIA21_startHumanGatedPixel;
    if (typeof orig !== "function") return false;
    w.__SIA21_CONV_WRAPPED = true;
    function wrapped(options) {
      options = options || {};
      var userOnInit = options.onInit;
      options.onInit = function () {
        if (typeof userOnInit === "function") {
          try { userOnInit(); } catch (e) {}
        }
        scheduleViewContent();
      };
      return orig(options);
    }
    w.SIA21_startHumanGatedPixel = wrapped;
    w.SIA21_loadMTHDPixel = wrapped;
    return true;
  }

  function scheduleViewContent() {
    function go() { fireViewContent(); }
    if (typeof w.SIA21_onHuman === "function") w.SIA21_onHuman(go);
    else w.addEventListener("sia21:human", go);
  }

  function bindCheckoutClicks() {
    if (w.__SIA21_IC_BOUND) return;
    w.__SIA21_IC_BOUND = true;
    d.addEventListener("click", onCheckoutClick, true);
  }

  function injectCss() {
    if (d.getElementById("sia21-conv-css")) return;
    var style = d.createElement("style");
    style.id = "sia21-conv-css";
    style.textContent = [
      ".sia21-retorno{box-sizing:border-box;margin:0 0 14px;max-width:40rem;padding:12px 14px;border-radius:14px;border:1px solid rgba(37,99,235,.28);background:#eff6ff;color:#1e293b;font-size:13.5px;line-height:1.55;font-weight:500;text-align:left}",
      ".sia21-retorno strong{font-weight:800;color:#1d4ed8}",
      ".sia21-retorno--on-dark{border-color:rgba(147,197,253,.35);background:rgba(255,255,255,.08);color:#e2e8f0}",
      ".sia21-retorno--on-dark strong{color:#bfdbfe}",
      ".text-center>.sia21-retorno{margin-left:auto;margin-right:auto}",
      "#sia21-primary-cta{scroll-margin-top:88px}",
      ".sia21-toast{position:fixed;left:16px;z-index:55;max-width:min(320px,calc(100vw - 32px));padding:12px 14px;border-radius:14px;background:#0f172a;color:#e2e8f0;border:1px solid rgba(255,255,255,.12);box-shadow:0 16px 40px rgba(2,6,23,.35);font-size:14px;line-height:1.45;pointer-events:none;opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease,visibility .25s}",
      ".sia21-toast.is-on{opacity:1;visibility:visible;transform:none}",
      ".sia21-toast b{color:#fff;font-weight:800}",
      ".sia21-exit[hidden]{display:none!important}",
      ".sia21-exit{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:center;padding:16px;background:rgba(15,23,42,.62)}",
      "@media(min-width:640px){.sia21-exit{align-items:center}}",
      ".sia21-exit-card{width:min(440px,100%);background:#fff;color:#0f172a;border-radius:22px;padding:22px 20px 18px;border:1px solid #dbeafe;box-shadow:0 24px 80px rgba(2,6,23,.4)}",
      ".sia21-exit-kicker{margin:0;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2563eb}",
      ".sia21-exit-card h2{margin:8px 0 0;font-size:1.25rem;line-height:1.25;font-weight:800;color:#0f172a}",
      ".sia21-exit-card p{margin:12px 0 0;font-size:15px;line-height:1.55;color:#334155}",
      ".sia21-exit-actions{display:flex;flex-direction:column;gap:10px;margin-top:18px}",
      ".sia21-exit-primary,.sia21-exit-secondary{display:block;width:100%;text-align:center;border-radius:12px;padding:12px 16px;font-size:15px;cursor:pointer;text-decoration:none}",
      ".sia21-exit-primary{background:#2563eb;color:#fff;font-weight:800;border:1px solid #2563eb}",
      ".sia21-exit-primary:hover{background:#1d4ed8}",
      ".sia21-exit-secondary{background:#fff;color:#475569;font-weight:700;border:1px solid #cbd5e1}",
      ".sia21-exit-secondary:hover{border-color:#2563eb;color:#1e3a8a}",
      ".sia21-exit-primary:focus-visible,.sia21-exit-secondary:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}",
      ".sia21-exit-timer{margin:14px 0 0;text-align:center}",
      ".sia21-exit-timer[hidden]{display:none!important}",
      ".sia21-exit-timer span{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#64748b}",
      ".sia21-exit-timer b{display:block;margin-top:4px;font-variant-numeric:tabular-nums;font-size:2.25rem;line-height:1;font-weight:800;letter-spacing:.04em;color:#b91c1c}",
      ".sia21-sticky[hidden]{display:none!important}",
      ".sia21-sticky{position:fixed;z-index:58;left:50%;transform:translateX(-50%);width:min(720px,calc(100vw - 32px));display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;padding:12px 14px;border-radius:16px;background:#0f172a;color:#e2e8f0;border:1px solid rgba(255,255,255,.12);box-shadow:0 16px 40px rgba(2,6,23,.35)}",
      ".sia21-sticky p{margin:0;font-size:14px;line-height:1.4;font-weight:600;color:#e2e8f0}",
      ".sia21-sticky a{flex:0 0 auto;background:#2563eb;color:#fff;font-weight:800;font-size:14px;line-height:1.3;text-decoration:none;border-radius:12px;padding:10px 14px;text-align:center}",
      ".sia21-sticky a:hover{background:#1d4ed8}",
      ".sia21-sticky a:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}",
      "@media(prefers-reduced-motion:reduce){.sia21-toast{transition:none;transform:none}}"
    ].join("");
    d.head.appendChild(style);
  }

  function onDark(node) {
    if (!node || !node.closest) return false;
    var light = node.closest(".bg-white, .hero-card");
    var dark = node.closest(".hero, .bg-slate-900, .bg-slate-950, .checkout-gradient");
    if (!dark) return false;
    if (light && dark.contains(light)) return false;
    return true;
  }

  function placeRetorno() {
    var links = d.querySelectorAll('a[href*="buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02"]');
    var primarySet = false;
    for (var i = 0; i < links.length; i++) {
      var anchor = links[i];
      if (anchor.closest("header, .mobile-cta, #sia21-exit, #sia21-sticky, #ck")) continue;
      if (!primarySet) {
        anchor.id = anchor.id || "sia21-primary-cta";
        primarySet = true;
      }
      var parent = anchor.parentElement;
      if (!parent || parent.closest("#sia21-exit")) continue;
      var host = parent;
      var before = anchor;
      if (parent.classList && (parent.classList.contains("flex") || parent.classList.contains("inline-flex")) && parent.childElementCount <= 6) {
        host = parent.parentElement;
        before = parent;
      }
      if (!host || !before || before.previousElementSibling && before.previousElementSibling.classList.contains("sia21-retorno")) continue;
      var p = d.createElement("p");
      p.className = "sia21-retorno" + (onDark(host) ? " sia21-retorno--on-dark" : "");
      var strong = d.createElement("strong");
      strong.textContent = RETORNO_LEAD;
      p.appendChild(strong);
      p.appendChild(d.createTextNode(RETORNO_BODY));
      host.insertBefore(p, before);
    }
  }

  function rand(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function nextProof() {
    return PROOF_LINE;
  }

  function toastOffset() {
    var floor = w.innerHeight;
    function consider(el) {
      if (!el) return;
      var shown = true;
      if (el.hidden) shown = false;
      try {
        if (w.getComputedStyle(el).display === "none") shown = false;
      } catch (e) {}
      if (!shown) return;
      var rect;
      try { rect = el.getBoundingClientRect(); } catch (err) { return; }
      if (!rect || rect.bottom < w.innerHeight * 0.55) return;
      if (rect.top < floor) floor = rect.top;
    }
    consider(d.getElementById("ck"));
    consider(d.querySelector(".mobile-cta"));
    consider(d.getElementById("sia21-sticky"));
    return Math.max(16, Math.round(w.innerHeight - floor) + 12);
  }

  function mountToast() {
    var el = d.createElement("div");
    el.id = "sia21-toast";
    el.className = "sia21-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    d.body.appendChild(el);

    function place() {
      el.style.bottom = toastOffset() + "px";
    }
    w.__SIA21_TOAST_PLACE = place;

    var hideTimer = null;
    var exitOpen = false;
    w.__SIA21_TOAST_PAUSE = function (paused) { exitOpen = !!paused; if (paused) hide(); };

    function hide() {
      el.classList.remove("is-on");
      el.setAttribute("aria-hidden", "true");
    }

    function show() {
      if (exitOpen || d.hidden) return;
      place();
      el.textContent = nextProof();
      el.removeAttribute("aria-hidden");
      el.classList.add("is-on");
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 6000);
    }

    function schedule(delay) {
      setTimeout(function () {
        show();
        var next = debugMode() ? 4000 : rand(45000, 90000);
        schedule(next);
      }, delay);
    }

    place();
    w.addEventListener("resize", place);
    var ck = d.getElementById("ck");
    if (ck && w.MutationObserver) {
      new MutationObserver(place).observe(ck, { attributes: true, attributeFilter: ["hidden"] });
    }
    schedule(debugMode() ? 800 : rand(12000, 25000));
  }

  function placeProof() {
    if (d.getElementById("sia21-proof")) return;
    if ((d.body.textContent || "").indexOf("Mais de 1000 compras") !== -1) return;
    var el = d.createElement("p");
    el.id = "sia21-proof";
    el.className = "sia21-proof";
    el.textContent = PROOF_LINE;
    var trust = d.querySelector(".trust");
    if (trust && trust.parentElement) {
      trust.parentElement.insertBefore(el, trust);
      return;
    }
    var cred = d.getElementById("credibilidade");
    if (cred) cred.insertBefore(el, cred.firstChild);
  }

  function viewHeight() {
    return w.innerHeight || d.documentElement.clientHeight || 0;
  }

  var scrollerCache = [];
  var scrollerCacheAt = 0;

  function overflowYScrolls(el) {
    var oy = "";
    try { oy = w.getComputedStyle(el).overflowY; } catch (e) { return false; }
    return oy === "auto" || oy === "scroll" || oy === "overlay";
  }

  // Viewport-sized boxes only. A small overflow widget is not the page.
  function pageScrollers() {
    var now = Date.now();
    if (now - scrollerCacheAt < 400) return scrollerCache;
    var found = [];
    var vh = viewHeight();
    var nodes = d.body ? d.body.getElementsByTagName("*") : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el === d.body || el === d.documentElement) continue;
      if (el.id && el.id.indexOf("sia21-") === 0) continue;
      if (!vh || el.clientHeight < vh * 0.55) continue;
      if (el.scrollHeight <= el.clientHeight + 8) continue;
      if (!overflowYScrolls(el)) continue;
      found.push(el);
    }
    scrollerCache = found;
    scrollerCacheAt = now;
    return found;
  }

  function rawDocTop() {
    var top = 0;
    try { top = w.scrollY || w.pageYOffset || 0; } catch (e) {}
    var docTop = 0;
    var bodyTop = 0;
    try { docTop = d.documentElement.scrollTop || 0; } catch (e2) {}
    try { bodyTop = (d.body && d.body.scrollTop) || 0; } catch (e3) {}
    if (docTop > top) top = docTop;
    if (bodyTop > top) top = bodyTop;
    try {
      if (w.visualViewport && typeof w.visualViewport.pageTop === "number" && w.visualViewport.pageTop > top) {
        top = w.visualViewport.pageTop;
      }
    } catch (e4) {}
    return top;
  }

  function contentBottom() {
    var nodes = d.querySelectorAll("footer");
    var el = nodes.length ? nodes[nodes.length - 1] : d.querySelector("main");
    if (!el || !el.getBoundingClientRect) return null;
    var rect = null;
    try { rect = el.getBoundingClientRect(); } catch (e) { return null; }
    if (!rect || !rect.height) return null;
    return rect.bottom;
  }

  function sentinelAtEnd() {
    var node = d.getElementById("sia21-scroll-100");
    if (!node || !node.getBoundingClientRect) return false;
    var placed = parseFloat(node.style.top);
    var vh = viewHeight();
    if (!(placed > vh)) return false;
    var rect = null;
    try { rect = node.getBoundingClientRect(); } catch (e) { return false; }
    return !!rect && rect.top <= vh * 0.25 && rect.top > -vh;
  }

  function visualAtEnd() {
    var vh = viewHeight();
    if (!vh) return false;
    var bottom = contentBottom();
    // A collapsed document (inner scroller, or a webview whose scroll
    // offsets stay 0) is not "at the end" just because scrollHeight
    // fits the first screen. The footer has to have arrived.
    if (bottom != null && bottom <= vh + 48 && bottom >= -80) return true;
    return sentinelAtEnd();
  }

  function scrollerAtEnd(el) {
    var max = el.scrollHeight - el.clientHeight;
    if (max <= 8) return false;
    var top = 0;
    try { top = el.scrollTop || 0; } catch (e) { top = 0; }
    return top >= max - 8;
  }

  function documentAtEnd() {
    var vh = viewHeight();
    var docH = d.documentElement.scrollHeight || 0;
    var bodyH = (d.body && d.body.scrollHeight) || 0;
    var max = Math.max(0, Math.max(docH, bodyH) - vh);
    if (max <= 8) return false;
    return rawDocTop() >= max - 8;
  }

  function atPageEnd() {
    var inners = pageScrollers();
    for (var i = 0; i < inners.length; i++) {
      if (scrollerAtEnd(inners[i])) return true;
    }
    if (documentAtEnd()) return true;
    return visualAtEnd();
  }

  function readOffset() {
    var top = rawDocTop();
    var anchor = d.querySelector("main") || d.querySelector("section");
    if (anchor && anchor.getBoundingClientRect) {
      try {
        var lifted = -anchor.getBoundingClientRect().top;
        if (lifted > top) top = lifted;
      } catch (e) {}
    }
    var inners = pageScrollers();
    for (var n = 0; n < inners.length; n++) {
      var innerTop = 0;
      try { innerTop = inners[n].scrollTop || 0; } catch (err) { innerTop = 0; }
      if (innerTop > top) top = innerTop;
    }
    var node = d.getElementById("sia21-scroll-100");
    if (node && node.getBoundingClientRect) {
      var placed = parseFloat(node.style.top);
      if (placed > 0) {
        try {
          var inferred = placed - node.getBoundingClientRect().top;
          if (inferred > top) top = inferred;
        } catch (e2) {}
      }
    }
    return top > 0 ? top : 0;
  }

  function mobileBarVisible() {
    var mob = d.querySelector(".mobile-cta");
    if (!mob) return false;
    try { return w.getComputedStyle(mob).display !== "none"; } catch (e) { return false; }
  }

  function mountSticky() {
    if (d.getElementById("sia21-sticky")) return;
    var bar = d.createElement("div");
    bar.id = "sia21-sticky";
    bar.className = "sia21-sticky";
    bar.hidden = true;
    var note = d.createElement("p");
    note.textContent = "Volta ao pagamento e garante o Early Bird.";
    var link = d.createElement("a");
    link.href = payLink(37);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Continuar para o Early Bird €37";
    bar.appendChild(note);
    bar.appendChild(link);
    d.body.appendChild(bar);

    function place() {
      var ck = d.getElementById("ck");
      var exit = d.getElementById("sia21-exit");
      var blocked = (ck && !ck.hidden) || (exit && !exit.hidden) || mobileBarVisible();
      var y = w.scrollY || d.documentElement.scrollTop || 0;
      bar.hidden = !(y > 520 && !blocked);
      if (w.__SIA21_TOAST_PLACE) w.__SIA21_TOAST_PLACE();
    }

    w.__SIA21_STICKY_PLACE = place;
    w.addEventListener("scroll", place, { passive: true });
    w.addEventListener("resize", place);
    var ck = d.getElementById("ck");
    if (ck && w.MutationObserver) {
      new MutationObserver(place).observe(ck, { attributes: true, attributeFilter: ["hidden"] });
    }
    place();
  }

  function exitStep() {
    try {
      var n = parseInt(w.sessionStorage.getItem(STEP_KEY) || "0", 10);
      if (n === 1 || n === 2) return n;
    } catch (e) {}
    return w.__SIA21_EXIT_STEP || 0;
  }

  function setExitStep(n) {
    w.__SIA21_EXIT_STEP = n;
    try { w.sessionStorage.setItem(STEP_KEY, String(n)); } catch (e) {}
  }

  function dismissed33() {
    if (w.__SIA21_EXIT_33_DISMISSED) return true;
    try { return w.sessionStorage.getItem(DISMISS_KEY) === "1"; } catch (e) { return false; }
  }

  function markDismissed33() {
    w.__SIA21_EXIT_33_DISMISSED = true;
    try { w.sessionStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
  }

  function stripeLeftAt() {
    try { return parseInt(w.sessionStorage.getItem(STRIPE_LEFT_KEY) || "0", 10) || 0; } catch (e) { return 0; }
  }

  function isCoarse() {
    try {
      if (w.matchMedia("(pointer: coarse)").matches) return true;
    } catch (e) {}
    return w.innerWidth < 820;
  }

  function mountExit() {
    var root = d.createElement("div");
    root.id = "sia21-exit";
    root.className = "sia21-exit";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "sia21-exit-title");
    root.innerHTML = '<div class="sia21-exit-card"><p class="sia21-exit-kicker" id="sia21-exit-kicker"></p><h2 id="sia21-exit-title"></h2><p id="sia21-exit-copy"></p><p class="sia21-exit-timer" id="sia21-exit-timer" hidden><span>Expira em</span><b>05:00</b></p><div class="sia21-exit-actions" id="sia21-exit-actions"></div></div>';
    d.body.appendChild(root);

    var kicker = root.querySelector("#sia21-exit-kicker");
    var title = root.querySelector("#sia21-exit-title");
    var copy = root.querySelector("#sia21-exit-copy");
    var actions = root.querySelector("#sia21-exit-actions");
    var timerBox = root.querySelector("#sia21-exit-timer");
    var timerNum = timerBox.querySelector("b");
    var timerHandle = null;
    var lastFocus = null;
    var openedAt = Date.now();
    var fromBack = false;
    var leaving = false;
    var desktopRearmed = true;
    var cooldownUntil = 0;
    var idle = false;
    var peakY = w.scrollY || 0;
    var blockExitUntilGesture = false;
    var sawPageHide = false;

    function minAge() {
      return debugMode() ? 300 : 8000;
    }

    function disarmIdle() {
      idle = false;
      peakY = readOffset();
    }

    function focusables() {
      return actions.querySelectorAll("button, a");
    }

    function stopTimer() {
      if (timerHandle) clearInterval(timerHandle);
      timerHandle = null;
    }

    function deadline() {
      var existing = 0;
      try { existing = parseInt(w.sessionStorage.getItem(DEADLINE_KEY) || "0", 10); } catch (e) {}
      if (existing > 0) return existing;
      var end = Date.now() + OFFER_MS;
      try { w.sessionStorage.setItem(DEADLINE_KEY, String(end)); } catch (err) {}
      return end;
    }

    function formatLeft(ms) {
      var secs = Math.max(0, Math.ceil(ms / 1000));
      var mins = Math.floor(secs / 60);
      var rest = secs % 60;
      function pad(n) { return (n < 10 ? "0" : "") + n; }
      return pad(mins) + ":" + pad(rest);
    }

    function expireOffer() {
      stopTimer();
      timerNum.textContent = "00:00";
      title.textContent = "O tempo da última oferta acabou";
      copy.textContent = "Mais de 1000 compras em ofertas semelhantes da 4Improvements. A oferta de €14 terminou. Volta ao pagamento do Early Bird a €37.";
      var deal = actions.querySelector(".sia21-exit-primary");
      if (deal && deal.tagName === "A") {
        deal.href = payLink(37);
        deal.removeAttribute("data-sia21-offer");
        deal.textContent = "Continuar para o Early Bird €37";
      }
    }

    function paintTimer() {
      var left = deadline() - Date.now();
      timerNum.textContent = formatLeft(left);
      timerBox.hidden = false;
      if (left <= 0) expireOffer();
    }

    function startTimer() {
      stopTimer();
      paintTimer();
      timerHandle = setInterval(paintTimer, 250);
    }

    function closeDialog(reason) {
      if (root.hidden) return;
      if (exitStep() === 1 && reason !== "checkout" && reason !== "return") markDismissed33();
      root.hidden = true;
      stopTimer();
      desktopRearmed = false;
      cooldownUntil = Date.now() + (debugMode() ? 400 : 1200);
      disarmIdle();
      d.body.style.overflow = "";
      if (w.__SIA21_TOAST_PAUSE) w.__SIA21_TOAST_PAUSE(false);
      if (w.__SIA21_STICKY_PLACE) w.__SIA21_STICKY_PLACE();
      d.removeEventListener("keydown", onKey);
      if (lastFocus && lastFocus.focus) {
        try { lastFocus.focus(); } catch (e) {}
      }
    }

    function onKey(e) {
      if (root.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog();
        return;
      }
      if (e.key !== "Tab") return;
      var nodes = focusables();
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && d.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && d.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function makeLink(href, offer, label) {
      var deal = d.createElement("a");
      deal.className = "sia21-exit-primary";
      deal.href = href;
      deal.target = "_blank";
      deal.rel = "noopener";
      if (offer) deal.setAttribute("data-sia21-offer", offer);
      deal.textContent = label;
      deal.addEventListener("click", function () {
        var currentOffer = deal.getAttribute("data-sia21-offer") || "";
        if (currentOffer === "early-33") capturePh("exit_offer_33_click", { angle: angleSlug(), price: 33 });
        else if (currentOffer === "early-14") capturePh("last_offer_14_click", { angle: angleSlug(), price: 14 });
        closeDialog("checkout");
      });
      return deal;
    }

    function makeSecondary(label, onClick) {
      var btn = d.createElement("button");
      btn.type = "button";
      btn.className = "sia21-exit-secondary";
      btn.textContent = label;
      btn.addEventListener("click", onClick);
      return btn;
    }

    function fill(which) {
      actions.textContent = "";
      stopTimer();
      timerBox.hidden = true;
      if (which === 1) {
        kicker.textContent = "Early Bird €33";
        title.textContent = "Garante o Early Bird antes de sair";
        copy.textContent = "Volta ao pagamento: €37 passa a €33.";
        actions.appendChild(makeLink(payLink(33), "early-33", "Volta ao pagamento a €33"));
        actions.appendChild(makeSecondary("Quero mesmo sair", function () { closeDialog(); }));
        return;
      }
      kicker.textContent = "Última oferta";
      title.textContent = "Volta ao pagamento agora";
      copy.textContent = "Mais de 1000 compras em ofertas semelhantes da 4Improvements. Última oferta: volta ao Payment Link agora. Early Bird €37 passa a €14.";
      actions.appendChild(makeLink(payLink(14), "early-14", "Volta ao pagamento a €14"));
      actions.appendChild(makeSecondary("Sair na mesma", function () {
        var back = fromBack;
        closeDialog();
        if (!back) return;
        leaving = true;
        try { w.history.go(-2); } catch (e) {}
      }));
      startTimer();
    }

    function canOpen(opts) {
      opts = opts || {};
      if (typeof w.SIA21_mayShowExit !== "function" || !w.SIA21_mayShowExit()) return false;
      if (!root.hidden) return false;
      if (exitStep() >= 2) return false;
      if (Date.now() - openedAt < minAge()) return false;
      if (!opts.ignoreCooldown && Date.now() < cooldownUntil) return false;
      return true;
    }

    var awayLatched = false;
    var awayTimer = null;
    var stripeReturnTimer = null;

    function isAutomatedBrowser() {
      try { return w.navigator.webdriver === true; } catch (e) { return false; }
    }

    function pendingStripe() {
      return !!(stripeLeftAt() || w.__SIA21_STRIPE_CLICKED_HERE);
    }

    function storedAway() {
      try { return w.sessionStorage.getItem(STRIPE_AWAY_KEY) === "1"; } catch (e) { return false; }
    }

    function engagedForExit() {
      if (typeof w.SIA21_mayShowExit === "function" && w.SIA21_mayShowExit()) return true;
      try {
        if (w.sessionStorage.getItem("sia21_engaged_v1") === "1" && !isAutomatedBrowser()) return true;
      } catch (e) {}
      return false;
    }

    function stillAway() {
      if (d.visibilityState === "hidden" || d.hidden) return true;
      try { if (!d.hasFocus()) return true; } catch (e) {}
      return false;
    }

    function latchAway() {
      if (!pendingStripe()) return;
      awayLatched = true;
      try { w.sessionStorage.setItem(STRIPE_AWAY_KEY, "1"); } catch (e) {}
    }

    function markStripeAway() {
      if (!pendingStripe()) return;
      if (awayLatched || awayTimer) return;
      // Ignore the blur that happens in the same moment as the click.
      // A real trip to Checkout keeps the page hidden or unfocused.
      awayTimer = setTimeout(function () {
        awayTimer = null;
        if (!pendingStripe()) return;
        if (!stillAway()) return;
        latchAway();
      }, 400);
    }

    function clearStripePending() {
      awayLatched = false;
      if (awayTimer) {
        clearTimeout(awayTimer);
        awayTimer = null;
      }
      if (stripeReturnTimer) {
        clearTimeout(stripeReturnTimer);
        stripeReturnTimer = null;
      }
      w.__SIA21_STRIPE_CLICKED_HERE = false;
      try { w.sessionStorage.removeItem(STRIPE_LEFT_KEY); } catch (e) {}
      try { w.sessionStorage.removeItem(STRIPE_AWAY_KEY); } catch (e2) {}
    }

    function rememberStripeReturn() {
      awayLatched = true;
      try { w.sessionStorage.setItem(STRIPE_AWAY_KEY, "1"); } catch (e) {}
    }

    // The human gate may still be closed on the load that comes back from
    // Checkout. Retry until it opens. A click that never left has no latch,
    // and this stops instead of polling.
    function queueStripeReturn() {
      if (stripeReturnTimer) return;
      function attempt() {
        stripeReturnTimer = null;
        if (!pendingStripe()) return;
        if (!awayLatched && !storedAway()) return;
        if (storedAway()) awayLatched = true;
        if (d.visibilityState === "hidden") {
          stripeReturnTimer = setTimeout(attempt, 300);
          return;
        }
        if (handleStripeReturn()) return;
        if (pendingStripe() && (awayLatched || storedAway())) {
          stripeReturnTimer = setTimeout(attempt, 250);
        }
      }
      stripeReturnTimer = setTimeout(attempt, 0);
    }

    function handleStripeReturn() {
      if (!pendingStripe()) return false;
      if (!awayLatched && !storedAway()) return false;
      if (isAutomatedBrowser() || exitStep() >= 2) {
        clearStripePending();
        return false;
      }
      blockExitUntilGesture = false;
      if (!root.hidden) {
        clearStripePending();
        return true;
      }
      if (!openNext({ fromStripe: true, ignoreCooldown: true })) return false;
      clearStripePending();
      return true;
    }

    function markStripeBack() {
      if (awayTimer && !stillAway()) {
        clearTimeout(awayTimer);
        awayTimer = null;
      }
      if (stillAway()) return;
      if (!awayLatched && !storedAway()) return;
      queueStripeReturn();
    }

    function openNext(opts) {
      opts = opts || {};
      if (opts.fromStripe) {
        if (isAutomatedBrowser()) return false;
        if (!root.hidden) return false;
        if (exitStep() >= 2) return false;
        if (!engagedForExit()) return false;
      } else if (!canOpen(opts) || blockExitUntilGesture) {
        return false;
      }
      var step = exitStep();
      var which = step >= 1 && dismissed33() ? 2 : 1;
      if (which === 2 && step >= 2) return false;
      var repeat = which === 1 && step === 1;
      if (!repeat) setExitStep(which);
      disarmIdle();
      lastFocus = d.activeElement;
      fill(which);
      root.hidden = false;
      d.body.style.overflow = "hidden";
      if (w.__SIA21_TOAST_PAUSE) w.__SIA21_TOAST_PAUSE(true);
      if (w.__SIA21_STICKY_PLACE) w.__SIA21_STICKY_PLACE();
      d.addEventListener("keydown", onKey);
      var primary = actions.querySelector(".sia21-exit-primary");
      if (primary) primary.focus();
      if (!repeat) {
        if (which === 1) capturePh("exit_offer_33_shown", { angle: angleSlug(), price: 33 });
        else capturePh("last_offer_14_shown", { angle: angleSlug(), price: 14 });
      }
      return true;
    }

    root.addEventListener("click", function (e) {
      if (e.target === root) closeDialog();
    });

    d.addEventListener("mouseover", function () { desktopRearmed = true; });
    d.addEventListener("mousemove", function (e) {
      if (!blockExitUntilGesture) return;
      if (e.clientY > 24) blockExitUntilGesture = false;
    });

    d.addEventListener("mouseout", function (e) {
      if (isCoarse()) return;
      if (e.relatedTarget || e.toElement) return;
      if (e.clientY > 8) return;
      if (exitStep() > 0 && !desktopRearmed) return;
      if (!canOpen()) return;
      desktopRearmed = false;
      openNext();
    });

    w.addEventListener("pagehide", function () {
      sawPageHide = true;
      if (!pendingStripe()) return;
      latchAway();
    });
    w.addEventListener("pageshow", function (e) {
      if (!pendingStripe() && !storedAway()) return;
      var nav = w.performance && w.performance.getEntriesByType ? w.performance.getEntriesByType("navigation")[0] : null;
      var back = !!(e && e.persisted) || sawPageHide || (nav && nav.type === "back_forward") || storedAway();
      if (!back) return;
      // bfcache restore counts even when the webview skipped pagehide.
      rememberStripeReturn();
      queueStripeReturn();
    });
    d.addEventListener("visibilitychange", function () {
      if (d.visibilityState === "hidden") markStripeAway();
      else markStripeBack();
    });
    w.addEventListener("blur", markStripeAway);
    w.addEventListener("focus", markStripeBack);
    w.addEventListener("freeze", latchAway);
    w.addEventListener("resume", function () {
      if (storedAway()) awayLatched = true;
      markStripeBack();
    });
    // Full reload after Stripe (in-app back that does not restore bfcache).
    // pageshow may already have fired if this script ran late. The away
    // flag is optional: several in-app browsers never emit pagehide, but
    // the click still stored sia21_stripe_left_at_v1.
    if (stripeLeftAt() && !w.__SIA21_STRIPE_CLICKED_HERE) {
      rememberStripeReturn();
      queueStripeReturn();
    }

    if (isCoarse()) {
      // Back trap waits out the same minimum delay as the popup, so a fast
      // bounce still leaves. Each leave attempt re-arms one history entry.
      // "Sair na mesma" on the final offer steps back past the trap.
      // A back/bfcache return from Stripe is not a dismissal and must not
      // advance from €33 to €14.
      setTimeout(function () {
        if (leaving || exitStep() >= 2) return;
        try { w.history.pushState({ sia21Exit: 1 }, "", w.location.href); } catch (e) { return; }
        w.addEventListener("popstate", function () {
          if (leaving) return;
          if ((sawPageHide || awayLatched || storedAway()) && pendingStripe()) {
            if (storedAway()) awayLatched = true;
            handleStripeReturn();
            try { w.history.pushState({ sia21Exit: 1 }, "", w.location.href); } catch (errQuiet) {}
            return;
          }
          if (blockExitUntilGesture) blockExitUntilGesture = false;
          if (!root.hidden) {
            closeDialog();
            try { w.history.pushState({ sia21Exit: 1 }, "", w.location.href); } catch (err) {}
            return;
          }
          if (exitStep() >= 2) {
            leaving = true;
            try { w.history.back(); } catch (err2) {}
            return;
          }
          try { w.history.pushState({ sia21Exit: 1 }, "", w.location.href); } catch (err3) {}
          fromBack = true;
          openNext({ ignoreCooldown: true });
        });
      }, minAge());

      var idleMs = debugMode() ? 1500 : 45000;
      var idleTimer = null;
      function bumpIdle() {
        idle = false;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(function () {
          idle = true;
          peakY = readOffset();
        }, idleMs);
      }
      ["touchstart", "keydown", "click", "mousemove"].forEach(function (name) {
        w.addEventListener(name, bumpIdle, { passive: true });
      });
      bumpIdle();
      w.addEventListener("scroll", function () {
        var y = readOffset();
        if (y > peakY) peakY = y;
        var oldEnough = Date.now() - openedAt > (debugMode() ? 400 : 20000);
        if (idle && peakY - y > 120 && oldEnough) {
          disarmIdle();
          openNext();
        }
      }, { passive: true, capture: true });
    }

    // Angle landings only: end of the page, held ~5s, or a mobile leave
    // signal (the tab was hidden, or a fast scroll up). Reuses the €33 dialog.
    // Fires only while the ladder is still at step 0, so it cannot become the
    // €14 offer. Once per visitor, not per session.
    if (isAngleLanding() && !scrollOfferUsed()) {
      var scrollTimer = null;
      var scrollCheckout = false;
      var leavePending = false;
      var watchTimer = null;

      function scrollStayMs() {
        return debugMode() ? 800 : 5000;
      }

      function clearScrollTimer() {
        if (!scrollTimer) return;
        clearTimeout(scrollTimer);
        scrollTimer = null;
      }

      function noteCheckoutClick(e) {
        if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
        var node = e.target;
        if (!node || !node.closest) return;
        if (!node.closest('a[href*="buy.stripe.com"]')) return;
        scrollCheckout = true;
        clearScrollTimer();
      }

      function fireScrollOffer() {
        scrollTimer = null;
        if (scrollCheckout || scrollOfferUsed() || exitStep() !== 0) return;
        if (isAutomatedBrowser()) return;
        if (d.visibilityState === "hidden" || !atPageEnd()) return;
        if (openNext()) {
          markScrollOfferUsed();
          return;
        }
        // Minimum age or the human gate is not ready yet. Keep the hold
        // while the visitor is still at the end.
        scrollTimer = setTimeout(fireScrollOffer, 250);
      }

      function syncScrollTimer() {
        if (scrollCheckout || scrollOfferUsed() || exitStep() !== 0) {
          clearScrollTimer();
          return;
        }
        if (d.visibilityState === "hidden" || !atPageEnd()) {
          clearScrollTimer();
          return;
        }
        if (scrollTimer) return;
        scrollTimer = setTimeout(fireScrollOffer, scrollStayMs());
      }

      w.addEventListener("pointerdown", noteCheckoutClick, true);
      w.addEventListener("click", noteCheckoutClick, true);
      w.addEventListener("auxclick", noteCheckoutClick, true);
      w.addEventListener("keydown", noteCheckoutClick, true);
      w.addEventListener("scroll", syncScrollTimer, { passive: true, capture: true });
      w.addEventListener("touchmove", syncScrollTimer, { passive: true });
      d.addEventListener("visibilitychange", syncScrollTimer);
      w.addEventListener("resize", syncScrollTimer);
      if (w.visualViewport) {
        w.visualViewport.addEventListener("scroll", syncScrollTimer);
        w.visualViewport.addEventListener("resize", syncScrollTimer);
      }
      syncScrollTimer();

      function tryLeaveOffer() {
        if (scrollCheckout || scrollOfferUsed() || exitStep() !== 0) {
          leavePending = false;
          return;
        }
        if (isAutomatedBrowser()) {
          leavePending = false;
          return;
        }
        if (pendingStripe() || storedAway() || awayLatched) return;
        if (d.visibilityState === "hidden") return;
        if (openNext()) {
          markScrollOfferUsed();
          leavePending = false;
          return;
        }
        leavePending = true;
      }

      var lastScrollY = readOffset();
      var lastScrollAt = Date.now();
      function noteScrollUp() {
        if (!isCoarse()) return;
        var y = readOffset();
        var now = Date.now();
        var dt = now - lastScrollAt;
        var up = lastScrollY - y;
        lastScrollY = y;
        lastScrollAt = now;
        if (dt > 0 && dt < 450 && up > 160) tryLeaveOffer();
      }
      w.addEventListener("scroll", noteScrollUp, { passive: true, capture: true });

      // In-app webviews move the layout without a window scroll event.
      // Sample the same end-of-page and scroll-up signals on a timer.
      watchTimer = setInterval(function () {
        if (scrollOfferUsed() || exitStep() !== 0) {
          clearInterval(watchTimer);
          watchTimer = null;
          clearScrollTimer();
          return;
        }
        noteScrollUp();
        if (leavePending && d.visibilityState === "visible") tryLeaveOffer();
        syncScrollTimer();
      }, 200);

      var hiddenAt = 0;
      function noteHidden() {
        if (pendingStripe() || storedAway() || awayLatched) return;
        if (!hiddenAt) hiddenAt = Date.now();
      }
      function noteShown() {
        if (!hiddenAt) return;
        var away = Date.now() - hiddenAt;
        hiddenAt = 0;
        if (away < 400) return;
        tryLeaveOffer();
      }
      d.addEventListener("visibilitychange", function () {
        if (d.visibilityState === "hidden") noteHidden();
        else noteShown();
      });
      w.addEventListener("freeze", noteHidden);
      w.addEventListener("resume", noteShown);
    }
  }

  function bootUi() {
    if (w.__SIA21_UX_BOOTED || isThankYou()) return;
    w.__SIA21_UX_BOOTED = true;
    injectCss();
    placeProof();
    placeRetorno();
    mountToast();
    mountSticky();
    mountExit();
    scheduleViewContent();
  }

  bindCheckoutClicks();
  wrapPixel();
  if (!wrapPixel()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (wrapPixel() || tries > 40) clearInterval(timer);
    }, 50);
  }

  if (isThankYou()) return;
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", bootUi);
  else bootUi();
})(window, document);
