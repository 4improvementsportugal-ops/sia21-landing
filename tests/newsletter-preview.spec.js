const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const PROD = "https://4improvementsportugal-ops.github.io";
const LOCAL = "http://127.0.0.1:4173";
const STRIPE_37 = "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02";
const PAGES = ["/v4/", "/angles/06-chatgpt-falhou/"];

async function proxyProd(route) {
  const url = new URL(route.request().url());
  const res = await fetch(LOCAL + url.pathname + url.search);
  const body = Buffer.from(await res.arrayBuffer());
  const headers = {};
  const type = res.headers.get("content-type");
  if (type) headers["content-type"] = type;
  await route.fulfill({ status: res.status, headers: headers, body: body });
}

function previewUrl(pathname) {
  return PROD + pathname + "?m21_preview=open&sia21_debug=1";
}

test.describe("newsletter preview", function () {
  test.beforeEach(async function ({ page }) {
    await page.route(PROD + "/**", proxyProd);
  });

  test("the stub stays on LP 06 and /v4/ and does not call the network", function () {
    const js = fs.readFileSync("assets/m21-newsletter.js", "utf8");
    expect(js).toContain("var M21_PREVIEW = true");
    expect(js).toContain('btn.disabled = true');
    expect(js).toContain("ev.preventDefault()");
    expect(js).not.toMatch(/\bfetch\s*\(/);
    expect(js).not.toMatch(/\bXMLHttpRequest\b/);
    expect(js).not.toMatch(/\bsendBeacon\s*\(/);
    expect(js).not.toMatch(/prefilled_promo_code\s*=/);
    expect(js).toContain("go.href = STRIPE_37");
    expect(js).toContain('path.indexOf("obrigado") !== -1');

    const htmlFiles = [];
    function walk(dir) {
      fs.readdirSync(dir).forEach(function (name) {
        const file = path.join(dir, name);
        if (name === "node_modules" || name === ".git") return;
        const stat = fs.statSync(file);
        if (stat.isDirectory()) walk(file);
        else if (name.endsWith(".html")) htmlFiles.push(file);
      });
    }
    walk(".");
    const wired = htmlFiles.filter(function (file) {
      return fs.readFileSync(file, "utf8").indexOf("m21-newsletter") !== -1;
    }).map(function (file) { return file.split(path.sep).join("/"); }).sort();
    expect(wired).toEqual([
      "angles/06-chatgpt-falhou/index.html",
      "v4/index.html"
    ]);
    expect(fs.readFileSync("obrigado.html", "utf8")).not.toContain("m21-newsletter");
  });

  test("nothing on /obrigado, including when the script is loaded there", async function ({ page }) {
    await page.goto(PROD + "/obrigado.html?m21_preview=open", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#m21-nl")).toHaveCount(0);
    await page.addScriptTag({ url: PROD + "/assets/m21-newsletter.js" });
    await page.waitForTimeout(400);
    await expect(page.locator("#m21-nl")).toHaveCount(0);
    const api = await page.evaluate(function () { return window.M21_NL || null; });
    expect(api).toBeNull();
  });

  for (var i = 0; i < PAGES.length; i++) {
    const pathname = PAGES[i];
    test(pathname + " keeps the button off until consent, pauses the toast, and sends nothing", async function ({ page }) {
      test.setTimeout(30000);
      const hits = [];
      page.on("request", function (req) { hits.push(req.url()); });
      await page.goto(previewUrl(pathname), { waitUntil: "domcontentloaded" });
      const dialog = page.locator("#m21-nl");
      const box = page.locator("#m21-nl input[name='consent_newsletter']");
      const button = page.locator("#m21-nl button.m21-nl-btn");
      await expect(dialog).toBeVisible();
      await expect(box).not.toBeChecked();
      await expect(button).toBeDisabled();
      await expect(button).toHaveText("Quero os 15%");

      await page.waitForTimeout(1200);
      await expect(page.locator("#sia21-toast")).not.toHaveClass(/is-on/);
      const paused = await page.evaluate(function () { return window.__SIA21_MODAL_OPEN === true; });
      expect(paused).toBe(true);

      await box.check();
      await expect(button).toBeEnabled();
      await box.uncheck();
      await expect(button).toBeDisabled();
      await box.check();
      await expect(button).toBeEnabled();

      await page.locator("#m21-nl .m21-nl-email").fill("preview@example.com");
      await page.waitForTimeout(2200);
      const before = hits.length;
      await page.evaluate(function () {
        window.__m21Net = [];
        var orig = window.fetch;
        window.fetch = function (input) {
          var url = typeof input === "string" ? input : (input && input.url) || "";
          window.__m21Net.push("fetch " + url);
          return orig.apply(this, arguments);
        };
        var open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
          window.__m21Net.push("xhr " + url);
          return open.apply(this, arguments);
        };
        if (navigator.sendBeacon) {
          var beacon = navigator.sendBeacon.bind(navigator);
          navigator.sendBeacon = function (url, data) {
            window.__m21Net.push("beacon " + url);
            return beacon(url, data);
          };
        }
      });
      await button.click();
      await expect(page.locator(".m21-nl-step2")).toBeVisible();
      await page.waitForTimeout(500);
      const during = hits.slice(before);
      const spies = await page.evaluate(function () { return window.__m21Net; });
      expect(during).toEqual([]);
      expect(spies).toEqual([]);
      const go = page.locator(".m21-nl-go");
      await expect(go).toHaveAttribute("href", STRIPE_37);
      expect(await go.getAttribute("href")).not.toContain("promo");
      await expect(page.locator(".m21-nl-note")).toContainText("nada foi enviado");
      await expect(page.locator("#sia21-toast")).not.toHaveClass(/is-on/);

      await page.locator("#m21-nl .m21-nl-x").click();
      await expect(dialog).toBeHidden();
      const closed = await page.evaluate(function () { return window.__SIA21_MODAL_OPEN === true; });
      expect(closed).toBe(false);
      await expect(page.locator("#sia21-toast")).toHaveClass(/is-on/, { timeout: 8000 });
    });
  }
});
