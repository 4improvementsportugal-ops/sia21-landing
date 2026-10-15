const { test, expect } = require("@playwright/test");

const PROD = "http://4improvementsportugal-ops.github.io:4173";
const LOCAL = "http://127.0.0.1:4173";
const TRACKING = /posthog\.com|facebook\.net|facebook\.com/i;

function collectEvents(raw) {
  if (!raw) return [];
  const texts = [raw];
  try { texts.push(decodeURIComponent(raw)); } catch (e) {}
  // sendBeacon pageleave is posted as data=<base64> even when JSON compression is off.
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
    if (req.method() === "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
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
    return hit.method + " " + hit.url + "\n" + hit.body.slice(0, 400);
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
  });
}

async function hidePage(page) {
  await page.evaluate(function () {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return "hidden"; } });
    Object.defineProperty(document, "hidden", { configurable: true, get: function () { return true; } });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function showPage(page) {
  await page.evaluate(function () {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return "visible"; } });
    Object.defineProperty(document, "hidden", { configurable: true, get: function () { return false; } });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.describe("tracking", function () {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no interaction on production sends nothing", async function ({ page }) {
    const hits = await watchTracking(page);
    await page.goto(PROD + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    expect(hits, JSON.stringify(hits.map(function (hit) { return hit.url; }))).toEqual([]);
  });

  test("localhost stays silent after a human signal", async function ({ page }) {
    const hits = await watchTracking(page);
    await page.goto(LOCAL + "/index.html", { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 900);
    await page.evaluate(function () { window.scrollTo(0, document.documentElement.scrollHeight); });
    await page.waitForTimeout(1500);
    expect(hits, JSON.stringify(hits.map(function (hit) { return hit.url; }))).toEqual([]);
  });

  test("qa=1 opts out and sends nothing", async function ({ page }) {
    const hits = await watchTracking(page);
    await page.goto(PROD + "/index.html?qa=1", { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 900);
    await page.evaluate(function () { window.scrollTo(0, document.documentElement.scrollHeight); });
    await page.waitForTimeout(1500);
    const flags = await page.evaluate(function () {
      return {
        qa: localStorage.getItem("sia21_qa_v1"),
        internal: localStorage.getItem("sia21_internal_v1"),
        allow: window.SIA21_allowCapture()
      };
    });
    expect(flags).toEqual({ qa: "1", internal: "1", allow: false });
    expect(hits, JSON.stringify(hits.map(function (hit) { return hit.url; }))).toEqual([]);
  });

  test("scroll depths and a flushed pageleave", async function ({ page }) {
    // PostHog drops captures when it classifies the browser as a bot.
    // Headless Playwright reports webdriver, so this test speaks as a real mobile browser.
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.goto(PROD + "/index.html", { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 400);
    const height = await page.evaluate(function () { return document.documentElement.scrollHeight; });
    const steps = [0.3, 0.55, 0.8, 1];
    for (let i = 0; i < steps.length; i++) {
      await page.evaluate(function (ratio) {
        window.scrollTo(0, Math.round(document.documentElement.scrollHeight * ratio));
      }, steps[i]);
      await page.waitForTimeout(100);
    }
    expect(height).toBeGreaterThan(844);
    const scrolled = await waitFor(hits, function (events) {
      const depths = events.filter(function (event) { return event.event === "sia21_scroll"; }).map(function (event) { return event.properties && event.properties.depth; });
      return [25, 50, 75, 100].every(function (depth) { return depths.indexOf(depth) !== -1; });
    }, "missing sia21_scroll depths");
    const full = scrolled.filter(function (event) {
      return event.event === "sia21_scroll" && event.properties && event.properties.depth === 100;
    })[0];
    expect(full.properties.sections).toEqual(expect.arrayContaining(["como-funciona", "checkout"]));
    await hidePage(page);
    const afterLeave = await waitFor(hits, function (events) {
      return events.some(function (event) { return event.event === "$pageleave"; });
    }, "missing flushed pageleave");
    const leave = afterLeave.filter(function (event) { return event.event === "$pageleave"; })[0];
    expect(leave.properties.$prev_pageview_max_scroll_percentage).toBeGreaterThan(0.9);
    expect(leave.properties.$prev_pageview_duration).toBeGreaterThan(0);
  });

  test("exit step opens after a return from Stripe without payment", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    page.on("popup", function (popup) { popup.close().catch(function () {}); });
    await page.route(/buy\.stripe\.com/, function (route) { return route.abort(); });
    await page.goto(PROD + "/angles-v2/05-angariacao/", { waitUntil: "domcontentloaded" });
    await page.locator("button[data-ck='rejected']").click();
    await page.mouse.wheel(0, 600);
    await page.waitForFunction(function () {
      return window.__SIA21_ENGAGED === true && window.SIA21_checkoutAllowed && window.SIA21_checkoutAllowed();
    });
    await page.locator("a[href*='buy.stripe.com']").first().click({ force: true });
    await expect.poll(async function () {
      return page.evaluate(function () { return sessionStorage.getItem("sia21_stripe_left_at_v1"); });
    }).not.toBeNull();
    await expect(page.locator("#sia21-exit")).toBeHidden();
    await hidePage(page);
    await page.waitForTimeout(500);
    await showPage(page);
    await expect(page.locator("#sia21-exit")).toBeVisible();
    await expect(page.locator("#sia21-exit-title")).toHaveText("Garante o Early Bird antes de sair");
    await waitFor(hits, function (events) {
      return events.some(function (event) { return event.event === "exit_offer_33_shown"; });
    }, "missing exit_offer_33_shown");
    const shown = eventsFrom(hits).filter(function (event) { return event.event === "exit_offer_33_shown"; });
    expect(shown[0].properties.price).toBe(33);
    expect(shown[0].properties.angle).toBe("05-angariacao");
    expect(eventsFrom(hits).some(function (event) { return event.event === "last_offer_14_shown"; })).toBe(false);
  });
});
