/**
 * SIA21 newsletter pop-up (15%). PREVIEW BUILD, not for production.
 *
 * Design: low-ticket-kb/propostas/2026-10-19-popup-newsletter.md
 * Copy: low-ticket/copy/2026-10-19-popup-newsletter.md, version B (without
 * the «Método 21» name, the rename is not approved yet).
 *
 * Preview rules (M21_PREVIEW = true):
 * - Submit is a no-op. Nothing is sent anywhere: no GHL webhook, no fetch,
 *   no Pixel Lead, no PostHog event with the email.
 * - No Stripe coupon or promotion code exists, so no prefilled_promo_code
 *   is added to any Payment Link. Links stay exactly as written.
 * - A visible «Pré-visualização» tag sits on the dialog.
 * - ?m21_preview=open opens it at once (for review and screenshots).
 *
 * Page rules (kept for the real build):
 * - Never on /obrigado or ghl-agencias. Not when the URL has ?promo=.
 * - Opens after SIA21_onHuman, SIA21_mayShowExit() true and 15s with the
 *   tab visible (the clock pauses while hidden). Once per visitor
 *   (localStorage m21_nl_v1).
 * - One dialog at a time: sets window.__SIA21_MODAL_OPEN and pauses the
 *   «1000 compras» toast with __SIA21_TOAST_PAUSE while open. Does not open
 *   while the exit dialog (#sia21-exit) is visible.
 * - Consent box unticked; «Quero os 15%» stays disabled until it is ticked.
 * - Closes with X, «Não, obrigado», Escape or a click on the backdrop.
 */
(function (w, d) {
  "use strict";
  var M21_PREVIEW = true;
  var KEY = "m21_nl_v1";
  var WAIT_MS = 15000;
  var MIN_SUBMIT_MS = 3000;

  var path = (w.location.pathname || "").toLowerCase();
  if (path.indexOf("obrigado") !== -1 || path.indexOf("ghl-agencias") !== -1) return;

  var params;
  try { params = new URLSearchParams(w.location.search || ""); } catch (e) { params = null; }
  var forceOpen = M21_PREVIEW && params && params.get("m21_preview") === "open";
  if (params && params.get("promo") && !forceOpen) return;

  function stored() { try { return w.localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { w.localStorage.setItem(KEY, v); } catch (e) {} }
  if (stored() && !forceOpen) return;

  var COPY = {
    title: "Queres 15% de desconto no e-book?",
    sub: "Deixa o teu email. Tens 15% nesta compra e nas próximas duas, e recebes novidades e dicas por email.",
    placeholder: "O teu email",
    button: "Quero os 15%",
    close: "Não, obrigado",
    consent: "Aceito receber emails da 4Improvements com novidades e dicas de IA para consultores imobiliários. Posso sair quando quiser, com um clique no fim de cada email.",
    privacy: "Política de Privacidade",
    okTitle: "Feito. Os teus 15% já estão aplicados.",
    okText: "Ao clicares no botão, o pagamento já mostra 31,45 € em vez de 37 €. Também te mandámos o código por email, para as próximas duas compras.",
    okButton: "Quero o e-book por 31,45 €",
    previewTag: "Pré-visualização",
    previewNote: "Pré-visualização: nada foi enviado e o desconto ainda não existe. O botão abre o pagamento normal de 37 €."
  };
  var STRIPE_37 = "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02";

  function privacyHref() {
    var a = d.querySelector('a[href$="privacidade.html"]');
    return a ? a.getAttribute("href") : "privacidade.html";
  }

  function angle() {
    if (path.indexOf("/v4/") !== -1) return "v4";
    var m = path.match(/\/angles(?:-v2)?\/([^\/]+)/);
    return m ? m[1] : "root";
  }

  function capture(name, props) {
    if (M21_PREVIEW) return; // preview: no analytics at all
    if (typeof w.SIA21_captureWhenHuman === "function") w.SIA21_captureWhenHuman(name, props);
  }

  var root, form, email, box, btn, lastFocus, openedAt = 0, isOpen = false;

  function el(tag, cls, text) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function build() {
    root = el("div", "m21-nl");
    root.id = "m21-nl";
    root.hidden = true;
    var backdrop = el("div", "m21-nl-bg");
    backdrop.addEventListener("click", function () { close("fundo"); });
    var dlg = el("div", "m21-nl-dlg");
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", "m21-nl-title");

    var x = el("button", "m21-nl-x");
    x.type = "button";
    x.setAttribute("aria-label", "Fechar");
    x.innerHTML = "&times;";
    x.addEventListener("click", function () { close("x"); });
    dlg.appendChild(x);

    if (M21_PREVIEW) dlg.appendChild(el("span", "m21-nl-tag", COPY.previewTag));

    var step1 = el("div", "m21-nl-step1");
    var h = el("h2", "m21-nl-title", COPY.title);
    h.id = "m21-nl-title";
    step1.appendChild(h);
    step1.appendChild(el("p", "m21-nl-sub", COPY.sub));

    form = el("form", "m21-nl-form");
    form.setAttribute("novalidate", "");
    form.action = "#";
    email = el("input", "m21-nl-email");
    email.type = "email";
    email.name = "email";
    email.autocomplete = "email";
    email.placeholder = COPY.placeholder;
    email.setAttribute("aria-label", COPY.placeholder);
    email.required = true;
    var hp = el("input", "m21-nl-hp");
    hp.type = "text"; hp.name = "website"; hp.tabIndex = -1; hp.autocomplete = "off";
    hp.setAttribute("aria-hidden", "true");

    var lab = el("label", "m21-nl-consent");
    box = el("input");
    box.type = "checkbox";
    box.name = "consent_newsletter";
    box.checked = false;
    var span = el("span", "", COPY.consent + " ");
    var pl = el("a", "", COPY.privacy);
    pl.href = privacyHref();
    pl.target = "_blank";
    pl.rel = "noopener";
    span.appendChild(pl);
    lab.appendChild(box);
    lab.appendChild(span);

    btn = el("button", "m21-nl-btn", COPY.button);
    btn.type = "submit";
    btn.disabled = true;
    box.addEventListener("change", function () { btn.disabled = !box.checked; });

    var no = el("button", "m21-nl-no", COPY.close);
    no.type = "button";
    no.addEventListener("click", function () { close("nao_obrigado"); });

    form.appendChild(email);
    form.appendChild(hp);
    form.appendChild(lab);
    form.appendChild(btn);
    form.appendChild(no);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!box.checked) return;
      if (hp.value) return;
      if (Date.now() - openedAt < MIN_SUBMIT_MS) return;
      var v = String(email.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { email.focus(); email.setAttribute("aria-invalid", "true"); return; }
      // PREVIEW: no request is made. The real build posts to the GHL inbound
      // webhook and then adds prefilled_promo_code to the 37 € links.
      capture("m21_popup_submit", { consent: true, angle: angle() });
      store("subscribed");
      showSuccess();
    });
    step1.appendChild(form);
    dlg.appendChild(step1);

    var step2 = el("div", "m21-nl-step2");
    step2.hidden = true;
    step2.appendChild(el("h2", "m21-nl-title", COPY.okTitle));
    step2.appendChild(el("p", "m21-nl-sub", COPY.okText));
    var go = el("a", "m21-nl-btn m21-nl-go", COPY.okButton);
    go.href = STRIPE_37; // preview: no prefilled_promo_code, the code does not exist
    go.target = "_blank";
    go.rel = "noopener";
    step2.appendChild(go);
    if (M21_PREVIEW) step2.appendChild(el("p", "m21-nl-note", COPY.previewNote));
    dlg.appendChild(step2);

    root.appendChild(backdrop);
    root.appendChild(dlg);
    d.body.appendChild(root);
  }

  function showSuccess() {
    root.querySelector(".m21-nl-step1").hidden = true;
    var s2 = root.querySelector(".m21-nl-step2");
    s2.hidden = false;
    var go = s2.querySelector(".m21-nl-go");
    if (go) go.focus();
  }

  function focusables() {
    return Array.prototype.filter.call(
      root.querySelectorAll("button, a[href], input:not(.m21-nl-hp)"),
      function (n) { return !n.disabled && n.offsetParent !== null; }
    );
  }

  function onKey(ev) {
    if (!isOpen) return;
    if (ev.key === "Escape") { ev.preventDefault(); close("esc"); return; }
    if (ev.key !== "Tab") return;
    var f = focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && d.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && d.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function otherDialogOpen() {
    var exit = d.getElementById("sia21-exit");
    if (exit && !exit.hidden) return true;
    return w.__SIA21_MODAL_OPEN === true;
  }

  function open() {
    if (isOpen || otherDialogOpen()) return false;
    if (!root) build();
    lastFocus = d.activeElement;
    root.hidden = false;
    isOpen = true;
    openedAt = Date.now();
    w.__SIA21_MODAL_OPEN = true;
    if (w.__SIA21_TOAST_PAUSE) w.__SIA21_TOAST_PAUSE(true);
    d.documentElement.classList.add("m21-nl-open");
    d.addEventListener("keydown", onKey);
    if (!M21_PREVIEW || !forceOpen) store("shown");
    capture("m21_popup_shown", { angle: angle() });
    try { email.focus({ preventScroll: true }); } catch (e) { email.focus(); }
    return true;
  }

  function close(how) {
    if (!isOpen) return;
    root.hidden = true;
    isOpen = false;
    w.__SIA21_MODAL_OPEN = false;
    if (w.__SIA21_TOAST_PAUSE) w.__SIA21_TOAST_PAUSE(false);
    d.documentElement.classList.remove("m21-nl-open");
    d.removeEventListener("keydown", onKey);
    if (stored() !== "subscribed") store("closed");
    capture("m21_popup_closed", { how: how, angle: angle() });
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  w.M21_NL = { open: open, close: close, preview: M21_PREVIEW };

  function startClock() {
    var visibleMs = 0, last = Date.now(), timer = null;
    function tick() {
      var now = Date.now();
      if (d.visibilityState === "visible") visibleMs += now - last;
      last = now;
      if (visibleMs < WAIT_MS) return;
      if (typeof w.SIA21_mayShowExit === "function" && !w.SIA21_mayShowExit()) return;
      if (otherDialogOpen()) return;
      if (open()) clearInterval(timer);
    }
    timer = setInterval(tick, 500);
  }

  function boot() {
    if (forceOpen) {
      open();
      return;
    }
    if (typeof w.SIA21_onHuman === "function") w.SIA21_onHuman(startClock);
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window, document);
