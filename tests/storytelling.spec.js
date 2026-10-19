const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const PROD = "https://4improvementsportugal-ops.github.io";
const LOCAL = "http://127.0.0.1:4173";
const PREVIEW = "http://4improvementsportugal-ops.github.io:4173";
const PAGE = "/v3/storytelling/";
const STRIPE_37 = "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02";
const EARLY_33 = "https://buy.stripe.com/fZueVf1OFc4D7Eb1vMgrS04";
const EARLY_14 = "https://buy.stripe.com/6oU3cx3WN0lVbUr0rIgrS05";
const TRACKING = /posthog\.com|facebook\.net|facebook\.com/i;
const FBE_SHIM = fs.readFileSync(path.join(__dirname, "fbevents-shim.js"), "utf8");
const PH_STUB = fs.readFileSync(path.join(__dirname, "posthog-stub.js"), "utf8");
const H1 = "Pedes tudo à IA do zero? Vê o teu dia antes e depois de teres prompts prontos.";

function isPosthogAsset(url) {
  return /posthog\.com\/.+\.js(?:\?|$)/i.test(url) || /-assets\.i\.posthog\.com/i.test(url);
}

async function fulfillTracking(route) {
  const url = route.request().url();
  if (/fbevents\.js/i.test(url)) {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: FBE_SHIM });
    return;
  }
  if (isPosthogAsset(url)) {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: PH_STUB });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
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

async function installHarness(page) {
  await page.route(PROD + "/**", proxyProd);
  await page.route(TRACKING, function (route) { return fulfillTracking(route); });
}

function collectEvents(raw) {
  if (!raw) return [];
  const texts = [raw];
  try { texts.push(decodeURIComponent(raw)); } catch (e) {}
  const dataMatch = String(raw).match(/(?:^|&|\?)data=([^&]+)/);
  if (dataMatch) {
    try {
      texts.push(Buffer.from(decodeURIComponent(dataMatch[1]), "base64").toString("utf8"));
    } catch (e2) {}
  }
  const events = [];
  texts.forEach(function (text) {
    const candidates = [text];
    const match = text.match(/\{[\s\S]*\}/);
    if (match) candidates.push(match[0]);
    candidates.forEach(function (chunk) {
      let blob = null;
      try { blob = JSON.parse(chunk); } catch (e) { return; }
      if (!blob) return;
      if (blob.event) events.push(blob);
      if (Array.isArray(blob)) {
        blob.forEach(function (item) { if (item && item.event) events.push(item); });
      }
      if (Array.isArray(blob.batch)) {
        blob.batch.forEach(function (item) { if (item && item.event) events.push(item); });
      }
    });
  });
  const seen = new Set();
  return events.filter(function (event) {
    const key = event.event + ":" + JSON.stringify(event.properties || {});
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function watchTracking(page) {
  const hits = [];
  await page.route(TRACKING, async function (route) {
    const req = route.request();
    hits.push({ url: req.url(), method: req.method(), body: req.postData() || "" });
    await fulfillTracking(route);
  });
  return hits;
}

function eventsFrom(hits) {
  return hits.reduce(function (all, hit) {
    return all.concat(collectEvents(hit.body));
  }, []);
}

async function waitFor(hits, pred, label) {
  const start = Date.now();
  let last = [];
  while (Date.now() - start < 20000) {
    last = eventsFrom(hits);
    if (pred(last)) return last;
    await new Promise(function (resolve) { setTimeout(resolve, 200); });
  }
  const preview = hits.map(function (hit) {
    return hit.method + " " + hit.url + "\n" + hit.body.slice(0, 280);
  }).join("\n---\n");
  throw new Error(label + "\n" + preview + "\nparsed=" + JSON.stringify(last.map(function (event) { return event.event; })));
}

async function maskWebdriver(page) {
  await page.addInitScript(function () {
    try {
      Object.defineProperty(Navigator.prototype, "webdriver", { configurable: true, get: function () { return false; } });
    } catch (e) {}
    try {
      Object.defineProperty(navigator, "webdriver", { configurable: true, get: function () { return false; } });
    } catch (e2) {}
    try {
      var proto = Navigator.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, "userAgentData");
      if (!desc || !desc.get) return;
      var read = desc.get;
      function current() {
        try { return read.call(navigator); } catch (err) { return null; }
      }
      function clean(data) {
        var brands = (data.brands || []).map(function (item) {
          if (item && /headless/i.test(String(item.brand || ""))) return { brand: "Google Chrome", version: item.version };
          return item;
        });
        return {
          brands: brands,
          mobile: data.mobile,
          platform: data.platform,
          toJSON: function () { return { brands: brands, mobile: data.mobile, platform: data.platform }; },
          getHighEntropyValues: function () {
            return Promise.resolve({ brands: brands, mobile: data.mobile, platform: data.platform });
          }
        };
      }
      Object.defineProperty(proto, "userAgentData", {
        configurable: true,
        get: function () {
          var data = current();
          return data ? clean(data) : data;
        }
      });
    } catch (e3) {}
  });
}

test.beforeEach(async function ({ page }) {
  await installHarness(page);
});

test.describe("storytelling preview", function () {
  test("copy stays inside the approved lines and is not linked from live pages", function () {
    const html = fs.readFileSync("v3/storytelling/index.html", "utf8");
    const css = fs.readFileSync("v3/storytelling/story.css", "utf8");
    expect(html).toContain(H1);
    expect(html).not.toContain("A mesma semana de consultor");
    expect(html).not.toContain("Para de escrever tudo à mão");
    expect(html).toContain("Mais de 1000 compras em ofertas semelhantes da 4Improvements.");
    expect(html).toContain("<!-- BLOCO PREÇO: INÍCIO (versão 37 €) · trocar só com OK do Pedro -->");
    expect(html).toContain("<!-- BLOCO PREÇO: FIM -->");
    expect(html).toContain('<h2>Hoje entras por 37 €</h2>');
    expect(html).toContain('<a href="' + STRIPE_37 + '" class="cta">Quero o sistema por 37 €</a>');
    expect(html).toContain("human-gate.js");
    expect(html).toContain("SIA21_bootPosthog");
    expect(html).toContain("SIA21_onHuman");
    expect(html).toContain("SIA21_trackingSuppressed");
    expect(html).toContain("sia21-conv.js");
    expect(html).toContain('href="../../termos.html"');
    expect(html).toContain('href="../../privacidade.html"');
    expect(html).not.toContain("posthog.init");
    expect(html + css).not.toMatch(/[—–]/);
    ["garantia", "reembolso", "STRIPE_LINK_27", "{{STRIPE_LINK_27}}", "27 €", "€27"].forEach(function (needle) {
      expect(html.toLowerCase()).not.toContain(needle.toLowerCase());
    });

    function walk(dir, found) {
      fs.readdirSync(dir).forEach(function (name) {
        if (name === "node_modules" || name === "test-results" || name === ".git") return;
        const file = path.join(dir, name);
        const stat = fs.statSync(file);
        if (stat.isDirectory()) walk(file, found);
        else if (name.endsWith(".html")) found.push(file);
      });
    }
    const pages = [];
    walk(".", pages);
    const linked = pages.filter(function (file) {
      if (file === path.join("v3", "storytelling", "index.html")) return false;
      return fs.readFileSync(file, "utf8").indexOf("v3/storytelling") !== -1;
    });
    expect(linked).toEqual([]);
  });

  test("a quiet load does not call PostHog or Meta", async function ({ page }) {
    const hits = await watchTracking(page);
    await page.goto(PROD + PAGE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    expect(hits, JSON.stringify(hits.map(function (hit) { return hit.url; }))).toEqual([]);
  });

  test("the :4173 preview stays silent even after a human signal", async function ({ page }) {
    await maskWebdriver(page);
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    const hits = await watchTracking(page);
    await page.goto(PREVIEW + PAGE, { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 900);
    await page.mouse.move(40, 180);
    await page.mouse.move(70, 220);
    await page.mouse.move(100, 260);
    await page.mouse.move(130, 300);
    await page.waitForTimeout(1200);
    const flags = await page.evaluate(function () {
      return {
        allow: window.SIA21_allowCapture(),
        host: window.SIA21_isProductionHost(),
        port: location.port,
        protocol: location.protocol
      };
    });
    expect(flags).toEqual({ allow: false, host: false, port: "4173", protocol: "http:" });
    expect(hits, JSON.stringify(hits.map(function (hit) { return hit.url; }))).toEqual([]);
  });

  test("scroll depth and checkout identify the storytelling variant", async function ({ page }) {
    await maskWebdriver(page);
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    const hits = await watchTracking(page);
    page.on("popup", function (popup) { popup.close().catch(function () {}); });
    await page.route(/buy\.stripe\.com/, function (route) { return route.abort(); });
    await page.goto(PROD + PAGE, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText(H1);
    const priceHref = await page.locator("#preco .cta").getAttribute("href");
    const priceUrl = new URL(priceHref);
    expect(priceUrl.origin + priceUrl.pathname).toBe(STRIPE_37);
    expect(priceUrl.searchParams.get("client_reference_id")).toBe("c1_0_0_0__p-v3");
    await expect(page.locator(".sia21-retorno")).toHaveCount(0);
    await expect(page.locator("#sia21-toast")).toHaveCount(0);
    await page.mouse.wheel(0, 500);
    const steps = [0.3, 0.55, 0.8, 1];
    for (let i = 0; i < steps.length; i++) {
      await page.evaluate(function (ratio) {
        window.scrollTo(0, Math.round(document.documentElement.scrollHeight * ratio));
      }, steps[i]);
      await page.waitForTimeout(120);
    }
    const scrolled = await waitFor(hits, function (events) {
      const depths = events.filter(function (event) { return event.event === "sia21_scroll"; }).map(function (event) {
        return event.properties && event.properties.depth;
      });
      return [25, 50, 75, 100].every(function (depth) { return depths.indexOf(depth) !== -1; });
    }, "missing sia21_scroll depths");
    const full = scrolled.filter(function (event) {
      return event.event === "sia21_scroll" && event.properties && event.properties.depth === 100;
    })[0];
    expect(full.properties.path).toContain("/v3/storytelling");
    expect(full.properties.sections).toEqual(expect.arrayContaining(["cenas", "como-funciona", "preco"]));

    await page.waitForFunction(function () {
      return window.__SIA21_ENGAGED === true && window.SIA21_checkoutAllowed && window.SIA21_checkoutAllowed();
    });
    await page.locator("#sticky-cta").click();
    const clicked = await waitFor(hits, function (events) {
      return events.some(function (event) {
        return event.event === "stripe_checkout_click" && event.properties && event.properties.angle === "v3-storytelling" && event.properties.price === 37 && event.properties.variant === "v3-storytelling";
      });
    }, "missing stripe_checkout_click");
    expect(clicked.some(function (event) { return event.event === "stripe_checkout_click" && event.properties.angle === "home"; })).toBe(false);
    await expect.poll(function () {
      return hits.some(function (hit) { return /[?&]ev=ViewContent(?:&|$)/.test(hit.url); });
    }, { timeout: 15000 }).toBe(true);
    const view = hits.filter(function (hit) { return /[?&]ev=ViewContent(?:&|$)/.test(hit.url); })[0];
    expect(view.url).toContain("v3-storytelling");
    expect(decodeURIComponent(view.url)).toMatch(/(?:cd\[value\]|value)=37/);
    await expect.poll(function () {
      return hits.some(function (hit) {
        return /[?&]ev=InitiateCheckout(?:&|$)/.test(hit.url) && /(?:cd\[value\]|value)=37/.test(decodeURIComponent(hit.url));
      });
    }, { timeout: 15000 }).toBe(true);
  });

  test("exit ladder is €33 then €14 with the storytelling angle", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.addInitScript(function () {
      try { sessionStorage.setItem("sia21_stripe_left_at_v1", String(Date.now() - 120000)); } catch (e) {}
    });
    await page.goto(PROD + PAGE + "?sia21_debug=1", { waitUntil: "domcontentloaded" });
    await page.mouse.move(30, 180);
    await page.mouse.move(48, 200);
    await page.mouse.move(70, 230);
    await page.mouse.move(90, 260);
    await page.waitForFunction(function () { return window.__SIA21_ENGAGED === true; });
    await expect(page.locator("#sia21-exit")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#sia21-exit a.sia21-exit-primary")).toHaveAttribute("href", EARLY_33);
    await expect(page.locator("#sia21-exit-timer")).toBeHidden();
    await page.locator("#sia21-exit button.sia21-exit-secondary").click();
    await expect(page.locator("#sia21-exit")).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.mouse.move(30, 180);
    await page.mouse.move(48, 200);
    await page.mouse.move(70, 230);
    await page.mouse.move(90, 260);
    await page.waitForFunction(function () { return window.__SIA21_ENGAGED === true; });
    await expect(page.locator("#sia21-exit")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#sia21-exit-kicker")).toHaveText("Última oferta");
    await expect(page.locator("#sia21-exit a.sia21-exit-primary")).toHaveAttribute("href", EARLY_14);
    await expect(page.locator("#sia21-exit-timer")).toBeVisible();
    await waitFor(hits, function (events) {
      return events.some(function (event) {
        return event.event === "exit_offer_33_shown" && event.properties && event.properties.angle === "v3-storytelling" && event.properties.price === 33;
      }) && events.some(function (event) {
        return event.event === "last_offer_14_shown" && event.properties && event.properties.angle === "v3-storytelling" && event.properties.price === 14;
      });
    }, "missing storytelling exit ladder");
  });
});
