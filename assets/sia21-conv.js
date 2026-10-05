/**
 * SIA21 conversion helper: Meta events, retorno copy, FOMO toast, exit intent.
 *
 * Loaded on index.html and angles/01..10 only. Purchase stays on obrigado.html.
 * Meta events fire only after cookie consent (4i_cookie_consent_v1 === "accepted")
 * and SIA21_startHumanGatedPixel has started the pixel.
 *
 * Checkout config (one place for the last-chance URL):
 *   window.SIA21_EARLY_33
 *   window.SIA21_CHECKOUT.early33
 * Funil: replace the early33 string with the real Stripe Payment Link.
 * Expected Payment Link after_completion redirect (Dashboard, no API keys):
 *   https://4improvementsportugal-ops.github.io/sia21-landing/obrigado.html?session_id={CHECKOUT_SESSION_ID}&amount=33
 * {CHECKOUT_SESSION_ID} is Stripe's Payment Link variable, same pattern as the €37 link.
 * amount=33 makes obrigado.html report Purchase value 33 (otherwise it defaults to 37).
 * Stripe hosted Payment Links cannot render this page's HTML next to the card fields.
 * Optional: set Payment Link custom_text in the Dashboard if that field is available.
 */
(function (w, d) {
  "use strict";

  if (w.__SIA21_CONV_LOADED) return;
  w.__SIA21_CONV_LOADED = true;

  var EARLY_37 = "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02";
  var EARLY_33 = "https://buy.stripe.com/REPLACE_SIA21_EARLY_33";

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
  var RETORNO_BODY = " em ~21 dias tens um sistema de IA para criar anúncios (Idealista e restantes) mais rápido, com processo repetível no teu dia a dia de consultor. Early Bird inclui ainda 1 sessão gratuita de setup com a nossa equipa para ficares operacional.";

  var EXIT_KEY = "sia21_exit_intent_v1";

  w.SIA21_EARLY_33 = EARLY_33;
  w.SIA21_CHECKOUT = {
    early37: EARLY_37,
    early33: EARLY_33,
    pixelId: "1506988540335331"
  };

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
    var early33 = w.SIA21_EARLY_33 || (w.SIA21_CHECKOUT && w.SIA21_CHECKOUT.early33) || EARLY_33;
    if (offer === "early-33") return 33;
    if (early33 && href.indexOf(early33) !== -1) return 33;
    return 37;
  }

  function fireViewContent() {
    if (w.__SIA21_VC_FIRED || isThankYou() || !pixelReady()) return;
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
    if (!anchor || !pixelReady() || isThankYou()) return;
    var value = checkoutValue(anchor);
    var payload = {
      value: value,
      currency: "EUR",
      content_name: "Sistema IA do Consultor",
      content_ids: [value === 33 ? "sia21-core-early-33" : "sia21-core-early"],
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
        fireViewContent();
      };
      return orig(options);
    }
    w.SIA21_startHumanGatedPixel = wrapped;
    w.SIA21_loadMTHDPixel = wrapped;
    return true;
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
      if (anchor.closest("header, .mobile-cta, #sia21-exit, #ck")) continue;
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
    var extra = 16;
    var ck = d.getElementById("ck");
    if (ck && !ck.hidden) extra = Math.max(extra, ck.offsetHeight + 12);
    var mob = d.querySelector(".mobile-cta");
    if (mob) {
      var display = w.getComputedStyle(mob).display;
      if (display !== "none") extra = Math.max(extra, mob.offsetHeight + 12);
    }
    return extra;
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

  function exitShown() {
    try { return w.sessionStorage.getItem(EXIT_KEY) === "1"; } catch (e) { return !!w.__SIA21_EXIT_SHOWN; }
  }

  function markExitShown() {
    w.__SIA21_EXIT_SHOWN = true;
    try { w.sessionStorage.setItem(EXIT_KEY, "1"); } catch (e) {}
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
    root.innerHTML = '<div class="sia21-exit-card"><p class="sia21-exit-kicker" id="sia21-exit-kicker"></p><h2 id="sia21-exit-title"></h2><p id="sia21-exit-copy"></p><div class="sia21-exit-actions" id="sia21-exit-actions"></div></div>';
    d.body.appendChild(root);

    var kicker = root.querySelector("#sia21-exit-kicker");
    var title = root.querySelector("#sia21-exit-title");
    var copy = root.querySelector("#sia21-exit-copy");
    var actions = root.querySelector("#sia21-exit-actions");
    var lastFocus = null;
    var openedAt = Date.now();
    var step = 0;
    var fromBack = false;
    var leaving = false;

    function minAge() {
      return debugMode() ? 300 : 8000;
    }

    function focusables() {
      return actions.querySelectorAll("button, a");
    }

    function closeDialog() {
      if (root.hidden) return;
      root.hidden = true;
      step = 0;
      d.body.style.overflow = "";
      if (w.__SIA21_TOAST_PAUSE) w.__SIA21_TOAST_PAUSE(false);
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

    function goPrimary() {
      closeDialog();
      var target = d.getElementById("sia21-primary-cta") || d.querySelector('a[href*="buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02"]');
      if (!target) return;
      try { target.scrollIntoView({ behavior: debugMode() ? "auto" : "smooth", block: "center" }); } catch (e) { target.scrollIntoView(true); }
      try { target.focus(); } catch (err) {}
    }

    function fill(nextStep) {
      step = nextStep;
      actions.textContent = "";
      if (nextStep === 1) {
        kicker.textContent = "Early Bird";
        title.textContent = "Tens a certeza que queres sair?";
        copy.textContent = "No Early Bird levas o sistema + a estratégia para o teu propósito e ainda 1 sessão gratuita de setup com alguém da equipa.";
        var stay = d.createElement("button");
        stay.type = "button";
        stay.className = "sia21-exit-primary";
        stay.textContent = "Continuar para o Early Bird";
        stay.addEventListener("click", goPrimary);
        var leave = d.createElement("button");
        leave.type = "button";
        leave.className = "sia21-exit-secondary";
        leave.textContent = "Quero mesmo sair";
        leave.addEventListener("click", function () { fill(2); var primary = actions.querySelector(".sia21-exit-primary"); if (primary) primary.focus(); });
        actions.appendChild(stay);
        actions.appendChild(leave);
      } else {
        kicker.textContent = "Early Bird -10%";
        title.textContent = "Ainda vais a tempo do -10%";
        copy.textContent = "A 4Improvements apoia consultores imobiliários em Portugal. Se fechares agora, -10% no Early Bird: €37 → €33.";
        var deal = d.createElement("a");
        deal.className = "sia21-exit-primary";
        deal.href = w.SIA21_EARLY_33 || EARLY_33;
        deal.target = "_blank";
        deal.rel = "noopener";
        deal.setAttribute("data-sia21-offer", "early-33");
        deal.textContent = "Quero o Early Bird a €33";
        deal.addEventListener("click", function () { closeDialog(); });
        var out = d.createElement("button");
        out.type = "button";
        out.className = "sia21-exit-secondary";
        out.textContent = "Sair na mesma";
        out.addEventListener("click", function () {
          var back = fromBack;
          closeDialog();
          if (!back) return;
          leaving = true;
          try { w.history.go(-2); } catch (e) {}
        });
        actions.appendChild(deal);
        actions.appendChild(out);
      }
    }

    function open(nextStep) {
      if (exitShown() || !root.hidden) return;
      if (Date.now() - openedAt < minAge()) return;
      markExitShown();
      lastFocus = d.activeElement;
      fill(nextStep || 1);
      root.hidden = false;
      d.body.style.overflow = "hidden";
      if (w.__SIA21_TOAST_PAUSE) w.__SIA21_TOAST_PAUSE(true);
      d.addEventListener("keydown", onKey);
      var primary = actions.querySelector(".sia21-exit-primary");
      if (primary) primary.focus();
    }

    root.addEventListener("click", function (e) {
      if (e.target === root) closeDialog();
    });

    d.addEventListener("mouseout", function (e) {
      if (isCoarse()) return;
      if (e.relatedTarget || e.toElement) return;
      if (e.clientY > 8) return;
      open(1);
    });

    if (isCoarse()) {
      // Back trap is armed only after the same minimum delay as the popup, so a
      // fast bounce still leaves. One extra history entry; "Sair na mesma" steps
      // back past it. At most one popup per session.
      setTimeout(function () {
        if (exitShown() || leaving) return;
        try { w.history.pushState({ sia21Exit: 1 }, "", w.location.href); } catch (e) { return; }
        w.addEventListener("popstate", function () {
          if (leaving) return;
          if (exitShown()) {
            if (root.hidden) {
              leaving = true;
              try { w.history.back(); } catch (err) {}
            }
            return;
          }
          try { w.history.pushState({ sia21Exit: 1 }, "", w.location.href); } catch (err) {}
          fromBack = true;
          open(1);
        });
      }, minAge());

      var idle = false;
      var idleMs = debugMode() ? 1500 : 45000;
      var idleTimer = null;
      var peakY = w.scrollY || 0;
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
      // scroll-smooth emits many small events, so compare with the recent peak
      // rather than the previous event.
      w.addEventListener("scroll", function () {
        var y = w.scrollY || d.documentElement.scrollTop || 0;
        if (y > peakY) peakY = y;
        var oldEnough = Date.now() - openedAt > (debugMode() ? 400 : 20000);
        if (idle && peakY - y > 120 && oldEnough) {
          idle = false;
          peakY = y;
          open(1);
        }
      }, { passive: true });
    }
  }

  function bootUi() {
    if (w.__SIA21_UX_BOOTED || isThankYou()) return;
    w.__SIA21_UX_BOOTED = true;
    injectCss();
    placeRetorno();
    mountToast();
    mountExit();
    if (w.__SIA21_MTHD_STARTED) fireViewContent();
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
