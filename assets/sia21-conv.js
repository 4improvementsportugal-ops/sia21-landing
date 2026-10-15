/**
 * SIA21 conversion helper: Meta events, retorno copy, FOMO toast, exit intent.
 *
 * Loaded on index.html and angles/01..10 only. Purchase stays on obrigado.html.
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
 * A checkout click is not a dismissal. Coming back from Stripe without paying
 * opens €33, or €14 only if €33 was already dismissed. Return is detected from
 * visibility, focus, pageshow/bfcache, and a later load that still has
 * sia21_stripe_left_at_v1. target=_blank (and in-app browsers that keep this
 * document alive) does not emit pageshow, so a hide then show counts.
 * Each step shows once per session. obrigado.html reads amount from the URL.
 * PostHog (snippet in <head>, armed only after the human gate) records
 * stripe_checkout_click plus the €33/€14 exit events. Those captures never
 * change the ladder, copy, or Stripe links. They are queued until
 * window.__SIA21_HUMAN and dropped on pagehide if that signal never comes.
 * Exit popups stay closed until SIA21_mayShowExit() (scroll, mouse movement
 * or visible dwell already happened, and navigator.webdriver is false).
 * A click is not enough. stripe_checkout_click and InitiateCheckout fire
 * only when human-gate.js let this click through to buy.stripe.com.
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
    "07-metodo-21-dias": "Método 21 dias",
    "08-solo-escala": "Solo",
    "09-early-37": "Early",
    "10-visitas-ops": "Visitas"
  };

  var RETORNO_LEAD = "Retorno esperado:";
  var RETORNO_BODY = " Em ~21 dias ficas operacional com IA para criar anúncios (Idealista e restantes) mais rápido, com processo repetível.";
  var PROOF_LINE = "Já confiam em nós mais de 1.000 consultores imobiliários.";

  var STEP_KEY = "sia21_exit_step_v2";
  var DISMISS_KEY = "sia21_exit_33_dismissed_v1";
  var STRIPE_LEFT_KEY = "sia21_stripe_left_at_v1";
  var STRIPE_AWAY_KEY = "sia21_stripe_away_v1";
  var DEADLINE_KEY = "sia21_exit14_deadline_v1";
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

  function capturePh(name, props) {
    if (typeof w.SIA21_captureWhenHuman === "function") {
      w.SIA21_captureWhenHuman(name, props);
      return;
    }
    if (typeof w.SIA21_onHuman === "function") {
      w.SIA21_onHuman(function () {
        try {
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
    try { w.fbq("track", "ViewContent", payload); } catch (e) {}
  }

  function onCheckoutClick(e) {
    var anchor = e.target && e.target.closest ? e.target.closest('a[href*="buy.stripe.com"]') : null;
    if (!anchor) return;
    if (w.__SIA21_CHECKOUT_OK !== true) return;
    capturePh("stripe_checkout_click", { angle: angleSlug(), price: stripePrice(anchor) });
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
    try { w.fbq("track", "InitiateCheckout", payload); } catch (err) {}
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

  // Illustrative FOMO pool, not real buyers. Portuguese first names and
  // cities/zones below are fictional combinations for this toast only.
  var PROOF_NAMES = ["Ana", "João", "Miguel", "Sofia", "Rita", "Pedro", "Inês", "Tiago", "Mariana", "André", "Beatriz", "Diogo", "Catarina", "Rui", "Leonor", "Francisco", "Marta", "Gonçalo", "Sara", "Nuno", "Helena", "Bruno"];
  var PROOF_CITIES = ["Lisboa", "Porto", "Braga", "Coimbra", "Faro", "Setúbal", "Cascais", "Aveiro", "Guimarães", "Leiria", "Viseu", "Évora", "Funchal", "Almada", "Oeiras", "Matosinhos", "Vila Nova de Gaia", "Sintra"];
  var lastProof = "";

  function rand(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function nextProof() {
    var line = "";
    var guard = 0;
    do {
      line = PROOF_NAMES[rand(0, PROOF_NAMES.length - 1)] + " de " + PROOF_CITIES[rand(0, PROOF_CITIES.length - 1)] + " comprou agora";
      guard += 1;
    } while (line === lastProof && guard < 5);
    lastProof = line;
    return line;
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
      var top = el.getBoundingClientRect().top;
      if (top < floor) floor = top;
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
    if ((d.body.textContent || "").indexOf("mais de 1.000 consultores") !== -1) return;
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
      peakY = w.scrollY || d.documentElement.scrollTop || 0;
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
      copy.textContent = "Já confiam em nós mais de 1.000 consultores imobiliários. A oferta de €14 terminou. Volta ao pagamento do Early Bird a €37.";
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
      copy.textContent = "Já confiam em nós mais de 1.000 consultores imobiliários. Última oferta: volta ao Payment Link agora. Early Bird €37 passa a €14.";
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
      w.__SIA21_STRIPE_CLICKED_HERE = false;
      try { w.sessionStorage.removeItem(STRIPE_LEFT_KEY); } catch (e) {}
      try { w.sessionStorage.removeItem(STRIPE_AWAY_KEY); } catch (e2) {}
    }

    function handleStripeReturn() {
      if (!pendingStripe()) return false;
      if (!awayLatched && !storedAway()) return false;
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
      handleStripeReturn();
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
      if (storedAway()) awayLatched = true;
      handleStripeReturn();
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
    // pageshow may already have fired if this script ran late.
    if (storedAway() && stripeLeftAt() && !w.__SIA21_STRIPE_CLICKED_HERE) {
      awayLatched = true;
      setTimeout(function () { handleStripeReturn(); }, 0);
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
          peakY = w.scrollY || d.documentElement.scrollTop || 0;
        }, idleMs);
      }
      ["touchstart", "keydown", "click", "mousemove"].forEach(function (name) {
        w.addEventListener(name, bumpIdle, { passive: true });
      });
      bumpIdle();
      w.addEventListener("scroll", function () {
        var y = w.scrollY || d.documentElement.scrollTop || 0;
        if (y > peakY) peakY = y;
        var oldEnough = Date.now() - openedAt > (debugMode() ? 400 : 20000);
        if (idle && peakY - y > 120 && oldEnough) {
          disarmIdle();
          openNext();
        }
      }, { passive: true });
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
