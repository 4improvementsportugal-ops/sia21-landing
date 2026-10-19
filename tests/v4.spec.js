const fs = require("fs");
const { test, expect } = require("@playwright/test");

const PROD = "https://4improvementsportugal-ops.github.io";
const LOCAL = "http://127.0.0.1:4173";
const PAGE = "/v4/";
const STRIPE = "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02";
const H1 = "Prompts prontos para o teu dia de consultor. Deixas de pedir tudo à IA do zero.";
const FINALS = ["80", "25 a 45", "7", "7 a 8"];

function html() {
  return fs.readFileSync("v4/index.html", "utf8");
}

async function proxyProd(route) {
  const url = new URL(route.request().url());
  const res = await fetch(LOCAL + url.pathname + url.search);
  const body = Buffer.from(await res.arrayBuffer());
  const headers = {};
  const type = res.headers.get("content-type");
  if (type) headers["content-type"] = type;
  await route.fulfill({ status: res.status, headers: headers, body: body });
}

async function statText(page) {
  return page.locator(".stat-live").evaluateAll(function (nodes) {
    return nodes.map(function (node) { return node.textContent; });
  });
}

async function statWidths(page) {
  return page.locator(".stat-num").evaluateAll(function (nodes) {
    return nodes.map(function (node) { return Math.round(node.getBoundingClientRect().width * 10) / 10; });
  });
}

test.describe("v4 variante", function () {
  test("the HTML keeps the final numbers, the copy and the tracking flags", function () {
    const file = html();
    const count = fs.readFileSync("v4/count.js", "utf8");
    expect(file).toContain('content="noindex, nofollow"');
    expect(file).toContain('data-no-inapp="1"');
    expect(file).toContain('next.format = "storytelling"');
    expect(file).toContain('next.variante = "v4"');
    expect(file).toContain("human-gate.js");
    expect(file).toContain("SIA21_bootPosthog");
    expect(file).toContain("SIA21_onHuman");
    expect(file).toContain("SIA21_trackingSuppressed");
    expect(file.indexOf("posthog.init")).toBe(-1);
    expect(file).toContain(H1);
    expect(file).toContain("Mais de 1000 compras em ofertas semelhantes da 4Improvements.");
    expect(file).toContain("sócio da 4Improvements");
    expect(file.indexOf("fundador")).toBe(-1);
    expect(file.indexOf("Preço early")).toBe(-1);
    expect(file.indexOf("Pagamento único ·")).toBe(-1);
    expect(file.match(/Pagamento único/g)).toEqual(["Pagamento único"]);
    expect(file.match(/Recebes o PDF/g)).toEqual(["Recebes o PDF", "Recebes o PDF"]);
    expect(file).toContain("Pagamento único. Recebes o PDF por email, normalmente em menos de 30 minutos. Dúvidas?");
    expect(file.indexOf("Pagamento único. Sem mensalidades.")).toBe(-1);
    expect(file.indexOf("Pagas no Stripe e recebes o PDF por email.")).toBe(-1);
    expect(file.indexOf('class="pay-line"')).toBe(-1);
    expect(file.indexOf('class="pay-lite"')).toBe(-1);
    expect(file).toContain("Como recebo o e-book?");
    expect(file).toContain("É um pagamento único, não é uma subscrição.");
    expect(file.indexOf("Estás dentro do Facebook")).toBe(-1);
    expect(file.indexOf("\u2014")).toBe(-1);
    expect(file.indexOf("\u2013")).toBe(-1);
    expect(file.indexOf("garantia")).toBe(-1);
    expect(file.indexOf("reembolso")).toBe(-1);
    expect(file).toContain("mensagens de follow-up");
    expect(file).toContain('data-to="7">7<');
    expect(file.indexOf("7 contactos")).toBe(-1);
    expect(file).toContain("As 7 a 8 h são uma estimativa do Cap. 6");
    FINALS.forEach(function (value) {
      expect(file).toContain('>' + value + "<");
    });
    var list = file.slice(file.indexOf('class="gift-list"'), file.indexOf("</ul>", file.indexOf('class="gift-list"')));
    expect(list.match(/<li>/g)).toHaveLength(12);
    expect(file).toContain("Quero os prompts prontos");
    expect(file).toContain("Quero começar no Dia 1");
    expect(file).toContain("Quero o Método 21 por 37 €");
    expect(file).toContain("Quero deixar de começar do zero");
    expect(file).toContain(STRIPE);
    expect(file).not.toContain("https://buy.stripe.com/fZueVf1OFc4D7Eb1vMgrS04");
    expect(file).toContain('alt="Pedro Ferreira, sócio da 4Improvements"');
    expect(file).toContain('src="../assets/pedro.webp"');
    expect(file).toContain('width="240"');
    expect(file).toContain('height="300"');
    expect(file).toContain('class="author-photo"');
    expect(file).toContain('loading="lazy"');
    expect(file).toContain("ChatGPT");
    expect(file).toContain("Claude");
    expect(file).toContain("Funciona com o ChatGPT grátis ou com o Claude; os planos pagos são opcionais.");
    expect(count).toContain("IntersectionObserver");
    expect(count).toContain("1350");
    expect(count).toContain("prefers-reduced-motion");
    expect(count.indexOf("posthog")).toBe(-1);
    expect(count.indexOf("fbq")).toBe(-1);
    expect(count.indexOf("SIA21_")).toBe(-1);
    expect(count.indexOf("stripe")).toBe(-1);
    const pedro = file.slice(file.indexOf('class="author-photo"') - 80, file.indexOf('class="author-photo"') + 220);
    expect(pedro).toContain('loading="lazy"');
  });

  test.beforeEach(async function ({ page }) {
    await page.route(PROD + "/**", proxyProd);
  });

  test("reduced motion keeps the final numbers and the width", async function ({ page }) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PROD + PAGE, { waitUntil: "domcontentloaded" });
    await page.evaluate(function () { return document.fonts.ready; });
    await expect(page.locator("h1")).toHaveText(H1);
    const before = await statText(page);
    expect(before).toEqual(FINALS);
    const widthBefore = await statWidths(page);
    await page.locator("#numeros").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1600);
    expect(await statText(page)).toEqual(FINALS);
    const widthAfter = await statWidths(page);
    widthBefore.forEach(function (width, i) {
      expect(Math.abs(width - widthAfter[i])).toBeLessThanOrEqual(1);
    });
    const numeric = await page.locator(".stat-num").first().evaluate(function (el) {
      return getComputedStyle(el).fontVariantNumeric;
    });
    expect(numeric).toContain("tabular-nums");
    const note = await page.locator(".stat-note").evaluate(function (el) {
      var cs = getComputedStyle(el);
      return { size: cs.fontSize, color: cs.color, marginTop: cs.marginTop };
    });
    expect(note.size).toBe("13px");
    expect(note.color).toBe("rgb(100, 116, 139)");
    expect(note.marginTop).toBe("16px");
  });

  test("the count finishes on the final numbers without a new event name", async function ({ page }) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(PROD + PAGE, { waitUntil: "domcontentloaded" });
    await page.evaluate(function () { return document.fonts.ready; });
    const widthBefore = await statWidths(page);
    await page.locator("#numeros").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1600);
    expect(await statText(page)).toEqual(FINALS);
    const widthAfter = await statWidths(page);
    widthBefore.forEach(function (width, i) {
      expect(Math.abs(width - widthAfter[i])).toBeLessThanOrEqual(1);
    });
    const called = await page.evaluate(function () {
      return typeof window.__v4CountEvent;
    });
    expect(called).toBe("undefined");
  });

  test("the in-app notice stays off this variant", async function ({ page }) {
    await page.addInitScript(function () {
      var ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 [FBAN/FBIOS;FBAV/470.0.0.0.0;FBBV/1]";
      try {
        Object.defineProperty(Navigator.prototype, "userAgent", { configurable: true, get: function () { return ua; } });
      } catch (e) {}
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PROD + PAGE, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".inapp-note")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Estás dentro do Facebook");
  });

  test("Pedro's photo is small, lazy and has the alt text", async function ({ page }) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(PROD + PAGE, { waitUntil: "domcontentloaded" });
    const photo = page.locator(".author-photo");
    await expect(photo).toHaveAttribute("alt", "Pedro Ferreira, sócio da 4Improvements");
    await expect(photo).toHaveAttribute("loading", "lazy");
    const box = await photo.evaluate(function (el) {
      var r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(box.w).toBeGreaterThan(80);
    expect(box.w).toBeLessThanOrEqual(240);
    expect(box.h).toBeGreaterThan(100);
  });

  test("the PDF pages read as pages at 390px", async function ({ page }) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PROD + PAGE, { waitUntil: "domcontentloaded" });
    const shots = page.locator(".shot-page img");
    await expect(shots).toHaveCount(3);
    await shots.first().scrollIntoViewIfNeeded();
    const boxes = await shots.evaluateAll(function (nodes) {
      return nodes.map(function (el) {
        var r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), lazy: el.getAttribute("loading"), width: el.getAttribute("width"), height: el.getAttribute("height") };
      });
    });
    boxes.forEach(function (box) {
      expect(box.lazy).toBe("lazy");
      expect(Number(box.width)).toBeGreaterThan(600);
      expect(Number(box.height)).toBeGreaterThan(900);
      expect(box.h).toBeGreaterThanOrEqual(295);
    });
  });
});
