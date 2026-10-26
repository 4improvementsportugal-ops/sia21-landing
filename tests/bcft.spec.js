const fs = require("fs");
const { test, expect } = require("@playwright/test");
const { blockLiveTargets } = require("./live-block");

const PAGE = "http://127.0.0.1:4173/bcft/?qa=1";
const STRIPE = "https://buy.stripe.com/eVqcN764V8Sr2jR0rIgrS08";
const SIA21_LINKS = [
  "aFa5kF1OFc4D1fNb6mgrS02",
  "fZueVf1OFc4D7Eb1vMgrS04",
  "6oU3cx3WN0lVbUr0rIgrS05",
  "dRm00lbpf5Gf1fNb6mgrS01",
  "14A9AVgJz9Wve2zfmCgrS00"
];
const SHORT = "Não constitui parecer jurídico nem aconselhamento personalizado. O conteúdo da pré-venda está sujeito a atualização pós-revisão jurídica completa; se houver versão revista, envia-se por email sem custo adicional. Adapta cada ficheiro à tua mediadora e faz rever pelo teu RCN ou advogado antes de o adotares como procedimento oficial. Sem garantia de conformidade, sem sessão de setup, sem reembolso após entrega digital.";

function html() {
  return fs.readFileSync("bcft/index.html", "utf8");
}

test("bcft landing keeps its own payment link, disclaimer and human gate", function () {
  const file = html();
  expect(file).toContain('src="../assets/human-gate.js"');
  expect(file).toContain("SIA21_bootPosthog");
  expect(file).toContain("SIA21_onHuman");
  expect(file).toContain("SIA21_trackingSuppressed");
  expect(file).toContain("SIA21_startHumanGatedPixel");
  expect(file).toContain("__SIA21_CHECKOUT_OK");
  expect(file).toContain(STRIPE);
  expect(file).toContain(SHORT);
  expect(file).toContain("Este pack não constitui parecer jurídico nem aconselhamento jurídico personalizado.");
  expect(file).toContain("[CONFIRMAR NA REVISÃO JURÍDICA]");
  expect(file).toContain("Guia-Dossier-BCFT-Mediadora.pdf");
  expect(file).toContain("Avaliação de risco da empresa");
  expect(file).toContain("Manual de procedimentos BCFT");
  expect(file).toContain("Ficha KYC, pessoa singular");
  expect(file).toContain("beneficiário efetivo");
  expect(file).toContain("Checklist PEP e sanções");
  expect(file).toContain("comunicação trimestral ao IMPIC");
  expect(file).toContain("portalcos");
  expect(file).toContain("folha de presenças");
  expect(file).toContain("dados anonimizados");
  expect(file).not.toContain("sia21-conv.js");
  expect(file).not.toContain("posthog.init");
  expect(file).not.toContain("\u2014");
  expect(file).not.toContain("\u2013");
  SIA21_LINKS.forEach(function (id) {
    expect(file).not.toContain(id);
  });
  const stripe = file.match(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/g) || [];
  expect(Array.from(new Set(stripe))).toEqual([STRIPE]);
});

test.describe("bcft page", function () {
  test.beforeEach(async function ({ page }) {
    await blockLiveTargets(page);
  });

  test("disclaimer sits on the hero and checkout calls to action", async function ({ page }) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ck:not([hidden])");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("#aviso-curto")).toContainText("Não é parecer jurídico.");
    await expect(page.locator("#aviso-curto")).toContainText(SHORT);
    await expect(page.locator("#hero-cta")).toHaveAttribute("href", STRIPE);
    await expect(page.locator("#checkout-cta")).toHaveAttribute("href", STRIPE);
    await expect(page.locator("#aviso")).toContainText("4Improvements / Pedro Ferreira não garantem");
    await expect(page.locator("#pack")).toContainText("Guia-Dossier-BCFT-Mediadora.pdf");
    const gap = await page.evaluate(function () {
      var notice = document.getElementById("aviso-curto").getBoundingClientRect();
      var cta = document.getElementById("hero-cta").getBoundingClientRect();
      return Math.round(cta.top - notice.bottom);
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(80);
    const checkoutGap = await page.evaluate(function () {
      var notice = document.getElementById("aviso-checkout").getBoundingClientRect();
      var cta = document.getElementById("checkout-cta").getBoundingClientRect();
      return Math.round(cta.top - notice.bottom);
    });
    expect(checkoutGap).toBeGreaterThanOrEqual(0);
    expect(checkoutGap).toBeLessThan(80);
    const hrefs = await page.locator('a[href*="buy.stripe.com"]').evaluateAll(function (nodes) {
      return nodes.map(function (node) { return node.getAttribute("href"); });
    });
    expect(hrefs.length).toBeGreaterThan(1);
    hrefs.forEach(function (href) { expect(href).toBe(STRIPE); });
  });

  test("mobile sticky names the limit and uses the same payment link", async function ({ page }) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ck:not([hidden])");
    await expect(page.locator("#aviso-barra")).toBeVisible();
    await expect(page.locator("#aviso-barra")).toContainText("sem reembolso após entrega digital");
    await expect(page.locator("#sticky-cta")).toHaveAttribute("href", STRIPE);
    await page.locator("#aviso-barra a").click();
    await expect(page.locator("#aviso")).toBeInViewport();
  });
});
