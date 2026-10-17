const fs = require("fs");
const path = require("path");
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

const EARLY_33 = "https://buy.stripe.com/fZueVf1OFc4D7Eb1vMgrS04";
const EARLY_14 = "https://buy.stripe.com/6oU3cx3WN0lVbUr0rIgrS05";

function anglePages() {
  const pages = [];
  ["angles", "angles-v2"].forEach(function (root) {
    fs.readdirSync(root).forEach(function (name) {
      const file = path.join(root, name, "index.html");
      if (fs.existsSync(file) && fs.statSync(file).isFile()) pages.push(file);
    });
  });
  return pages.sort();
}

async function engage(page) {
  for (let i = 0; i < 5; i++) await page.mouse.move(24 + i * 10, 160 + i * 6);
  await page.waitForFunction(function () { return window.__SIA21_ENGAGED === true; });
}

async function waitTall(page) {
  await page.waitForFunction(function () {
    return document.documentElement.scrollHeight > window.innerHeight + 500;
  });
}

async function installInnerScroller(page) {
  await page.evaluate(function () {
    if (document.getElementById("inapp-scroller")) return;
    var scroller = document.createElement("div");
    scroller.id = "inapp-scroller";
    scroller.style.cssText = "position:fixed;inset:0;overflow:auto;z-index:1;background:#fff;";
    var kids = Array.prototype.slice.call(document.body.childNodes);
    kids.forEach(function (node) {
      if (node.id && String(node.id).indexOf("sia21-") === 0) return;
      scroller.appendChild(node);
    });
    document.body.appendChild(scroller);
    document.documentElement.style.height = "100%";
    document.documentElement.style.overflow = "hidden";
    document.body.style.height = "100%";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
  });
}

async function scrollInner(page, top) {
  return page.evaluate(function (y) {
    var scroller = document.getElementById("inapp-scroller");
    if (y == null) scroller.scrollTop = scroller.scrollHeight;
    else scroller.scrollTop = y;
    return {
      scrollY: window.scrollY || 0,
      docTop: document.documentElement.scrollTop || 0,
      inner: scroller.scrollTop,
      max: scroller.scrollHeight - scroller.clientHeight
    };
  }, top === undefined ? null : top);
}

async function stuckScrollOffsets(page) {
  await page.addInitScript(function () {
    var zero = { configurable: true, get: function () { return 0; } };
    try { Object.defineProperty(window, "scrollY", zero); } catch (e) {}
    try { Object.defineProperty(window, "pageYOffset", zero); } catch (e2) {}
    try { Object.defineProperty(Element.prototype, "scrollTop", zero); } catch (e3) {}
    try {
      if (window.visualViewport) Object.defineProperty(window.visualViewport, "pageTop", zero);
    } catch (e4) {}
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
        stored: localStorage.getItem("sia21_qa"),
        session: sessionStorage.getItem("sia21_qa"),
        internal: localStorage.getItem("sia21_internal_v1"),
        allow: window.SIA21_allowCapture(),
        suppressed: window.SIA21_trackingSuppressed()
      };
    });
    expect(flags).toEqual({ qa: "1", stored: "1", session: "1", internal: "1", allow: false, suppressed: true });
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

  test("every funnel angle loads the shared exit script", function () {
    const pages = anglePages();
    expect(pages.length).toBeGreaterThanOrEqual(16);
    const missing = pages.filter(function (file) {
      const html = fs.readFileSync(file, "utf8");
      return html.indexOf("sia21-conv.js") === -1 || html.indexOf("human-gate.js") === -1;
    });
    expect(missing).toEqual([]);
    const hub = fs.readFileSync("angles/index.html", "utf8");
    expect(hub).toContain('content="noindex,nofollow"');
    expect(hub).not.toContain("sia21-conv.js");
  });

  test("inner scroller: end of page lingers into €33, and the top does not", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.goto(PROD + "/angles-v2/02-rgpd/?sia21_debug=1", { waitUntil: "domcontentloaded" });
    await waitTall(page);
    await engage(page);
    await installInnerScroller(page);
    const top = await scrollInner(page, 0);
    expect(top.scrollY).toBe(0);
    expect(top.max).toBeGreaterThan(500);
    await page.waitForTimeout(2000);
    await expect(page.locator("#sia21-exit")).toBeHidden();
    const end = await scrollInner(page, null);
    expect(end.scrollY).toBe(0);
    expect(end.docTop).toBe(0);
    expect(end.inner).toBeGreaterThan(end.max - 8);
    await expect(page.locator("#sia21-exit")).toBeVisible({ timeout: 4000 });
    await expect(page.locator("#sia21-exit-title")).toHaveText("Garante o Early Bird antes de sair");
    await expect(page.locator("#sia21-exit-timer")).toBeHidden();
    await expect(page.locator("#sia21-exit a.sia21-exit-primary")).toHaveAttribute("href", EARLY_33);
    await waitFor(hits, function (events) {
      return events.some(function (event) { return event.event === "exit_offer_33_shown"; });
    }, "missing exit_offer_33_shown");
    const shown = eventsFrom(hits).filter(function (event) { return event.event === "exit_offer_33_shown"; });
    expect(shown).toHaveLength(1);
    expect(shown[0].properties).toMatchObject({ angle: "02-rgpd", price: 33 });
    expect(eventsFrom(hits).some(function (event) { return event.event === "last_offer_14_shown"; })).toBe(false);
    const depth = await page.evaluate(function () { return window.__SIA21_MAX_SCROLL; });
    expect(depth).toBeGreaterThanOrEqual(99);
  });

  test("inner scroller still waits for the human gate and the real 5s hold", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.goto(PROD + "/angles-v2/04-whatsapp/", { waitUntil: "domcontentloaded" });
    await waitTall(page);
    await installInnerScroller(page);
    const end = await scrollInner(page, null);
    expect(end.scrollY).toBe(0);
    expect(end.inner).toBeGreaterThan(500);
    await page.waitForTimeout(2500);
    const early = await page.evaluate(function () {
      var exit = document.getElementById("sia21-exit");
      return { hidden: !exit || exit.hidden, engaged: window.__SIA21_ENGAGED === true };
    });
    expect(early).toEqual({ hidden: true, engaged: false });
    await expect(page.locator("#sia21-exit")).toBeVisible({ timeout: 12000 });
    const later = await page.evaluate(function () { return window.__SIA21_ENGAGED === true; });
    expect(later).toBe(true);
    await waitFor(hits, function (events) {
      return events.some(function (event) {
        return event.event === "exit_offer_33_shown" && event.properties && event.properties.angle === "04-whatsapp" && event.properties.price === 33;
      });
    }, "missing exit_offer_33_shown");
    expect(eventsFrom(hits).some(function (event) { return event.event === "last_offer_14_shown"; })).toBe(false);
  });

  test("stuck window scroll offsets still open €33 at the visual end", async function ({ page }) {
    await maskWebdriver(page);
    await stuckScrollOffsets(page);
    const hits = await watchTracking(page);
    await page.goto(PROD + "/angles/06-chatgpt-falhou/?sia21_debug=1", { waitUntil: "domcontentloaded" });
    await waitTall(page);
    await engage(page);
    await page.evaluate(function () { window.scrollTo(0, document.documentElement.scrollHeight); });
    const metrics = await page.evaluate(function () {
      var footers = document.querySelectorAll("footer");
      var footer = footers[footers.length - 1];
      return {
        scrollY: window.scrollY || 0,
        docTop: document.documentElement.scrollTop || 0,
        footerBottom: footer ? footer.getBoundingClientRect().bottom : null,
        view: window.innerHeight,
        depth: window.__SIA21_MAX_SCROLL
      };
    });
    expect(metrics.scrollY).toBe(0);
    expect(metrics.docTop).toBe(0);
    expect(metrics.footerBottom).toBeLessThan(metrics.view + 48);
    expect(metrics.depth).toBeGreaterThanOrEqual(99);
    await expect(page.locator("#sia21-exit")).toBeVisible({ timeout: 4000 });
    await expect(page.locator("#sia21-exit a.sia21-exit-primary")).toHaveAttribute("href", EARLY_33);
    await waitFor(hits, function (events) {
      return events.some(function (event) {
        return event.event === "exit_offer_33_shown" && event.properties && event.properties.angle === "06-chatgpt-falhou";
      });
    }, "missing exit_offer_33_shown");
  });

  test("fast scroll up on an inner scroller opens €33 once", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.goto(PROD + "/angles/01-tempo/?sia21_debug=1", { waitUntil: "domcontentloaded" });
    await waitTall(page);
    await engage(page);
    await installInnerScroller(page);
    const down = await scrollInner(page, 720);
    expect(down.scrollY).toBe(0);
    expect(down.inner).toBeGreaterThan(400);
    await page.waitForTimeout(500);
    await expect(page.locator("#sia21-exit")).toBeHidden();
    const up = await scrollInner(page, 40);
    expect(up.inner).toBeLessThan(80);
    await expect(page.locator("#sia21-exit")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("#sia21-exit a.sia21-exit-primary")).toHaveAttribute("href", EARLY_33);
    await waitFor(hits, function (events) {
      return events.some(function (event) {
        return event.event === "exit_offer_33_shown" && event.properties && event.properties.angle === "01-tempo" && event.properties.price === 33;
      });
    }, "missing exit_offer_33_shown");
    await page.evaluate(function () { window.location.hash = "again"; });
    await scrollInner(page, 900);
    await page.waitForTimeout(400);
    await scrollInner(page, 20);
    await page.waitForTimeout(600);
    const shown = eventsFrom(hits).filter(function (event) { return event.event === "exit_offer_33_shown"; });
    expect(shown).toHaveLength(1);
    expect(eventsFrom(hits).some(function (event) { return event.event === "last_offer_14_shown"; })).toBe(false);
  });

  test("hiding the tab opens €33 after the minimum age, including on an older angle", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.goto(PROD + "/angles/10-visitas-ops/", { waitUntil: "domcontentloaded" });
    await waitTall(page);
    await engage(page);
    await hidePage(page);
    await page.waitForTimeout(500);
    await showPage(page);
    await expect(page.locator("#sia21-exit")).toBeHidden();
    await expect(page.locator("#sia21-exit")).toBeVisible({ timeout: 12000 });
    await expect(page.locator("#sia21-exit a.sia21-exit-primary")).toHaveAttribute("href", EARLY_33);
    await waitFor(hits, function (events) {
      return events.some(function (event) {
        return event.event === "exit_offer_33_shown" && event.properties && event.properties.angle === "10-visitas-ops" && event.properties.price === 33;
      });
    }, "missing exit_offer_33_shown");
    expect(eventsFrom(hits).some(function (event) { return event.event === "last_offer_14_shown"; })).toBe(false);
  });

  test("a Stripe return without pagehide opens €33, and €14 only after that dialog is dismissed", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.addInitScript(function () {
      try { sessionStorage.setItem("sia21_stripe_left_at_v1", String(Date.now() - 120000)); } catch (e) {}
    });
    await page.goto(PROD + "/angles/06-chatgpt-falhou/?sia21_debug=1", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const before = await page.evaluate(function () {
      var exit = document.getElementById("sia21-exit");
      return {
        hidden: !exit || exit.hidden,
        engaged: window.__SIA21_ENGAGED === true,
        away: sessionStorage.getItem("sia21_stripe_away_v1")
      };
    });
    expect(before.hidden).toBe(true);
    expect(before.engaged).toBe(false);
    await engage(page);
    await expect(page.locator("#sia21-exit")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("#sia21-exit-title")).toHaveText("Garante o Early Bird antes de sair");
    await expect(page.locator("#sia21-exit a.sia21-exit-primary")).toHaveAttribute("href", EARLY_33);
    await expect(page.locator("#sia21-exit-timer")).toBeHidden();
    await page.locator("#sia21-exit button.sia21-exit-secondary").click();
    await expect(page.locator("#sia21-exit")).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    await engage(page);
    await expect(page.locator("#sia21-exit")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("#sia21-exit-kicker")).toHaveText("Última oferta");
    await expect(page.locator("#sia21-exit a.sia21-exit-primary")).toHaveAttribute("href", EARLY_14);
    await expect(page.locator("#sia21-exit-timer")).toBeVisible();
    await waitFor(hits, function (events) {
      var names = events.map(function (event) { return event.event; });
      return names.indexOf("exit_offer_33_shown") !== -1 && names.indexOf("last_offer_14_shown") !== -1;
    }, "missing exit ladder events");
    const offer33 = eventsFrom(hits).filter(function (event) { return event.event === "exit_offer_33_shown"; });
    const offer14 = eventsFrom(hits).filter(function (event) { return event.event === "last_offer_14_shown"; });
    expect(offer33).toHaveLength(1);
    expect(offer14).toHaveLength(1);
    expect(offer33[0].properties).toMatchObject({ angle: "06-chatgpt-falhou", price: 33 });
    expect(offer14[0].properties).toMatchObject({ angle: "06-chatgpt-falhou", price: 14 });
  });

  async function acceptAndCountPurchases(page) {
    const purchases = [];
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    await page.route(/facebook\.com\/tr/i, async function (route) {
      const url = route.request().url();
      if (/[?&]ev=Purchase(?:&|$)/.test(url)) purchases.push(url);
      await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    });
    return purchases;
  }

  function purchaseEid(url) {
    return new URL(url).searchParams.get("eid");
  }

  test("loading and reloading obrigado fires Purchase once per checkout session", async function ({ page }) {
    await maskWebdriver(page);
    const purchases = await acceptAndCountPurchases(page);
    const sid = "cs_live_TESTSESSION123";
    await page.goto(PROD + "/obrigado.html?session_id=" + sid + "&amount=37", { waitUntil: "load" });
    await expect.poll(function () { return purchases.length; }, { timeout: 15000 }).toBe(1);
    const first = new URL(purchases[0]);
    expect(first.searchParams.get("eid")).toBe(sid);
    expect(first.searchParams.get("cd[value]")).toBe("37");
    expect(first.searchParams.get("cd[currency]")).toBe("EUR");
    expect(first.searchParams.get("cd[content_name]")).toBe("Sistema IA Consultor 21 Dias");
    const flags = await page.evaluate(function (id) {
      var key = "sia21_purchase_v1_" + id;
      return {
        local: localStorage.getItem(key),
        session: sessionStorage.getItem(key)
      };
    }, sid);
    expect(flags).toEqual({ local: "1", session: "1" });
    await page.evaluate(function () { window.SIA21_firePurchaseOnce(); });
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(3000);
    expect(purchases).toHaveLength(1);
    expect(purchaseEid(purchases[0])).toBe(sid);

    const other = "cs_live_OTHERSESSION456";
    await page.goto(PROD + "/obrigado.html?session_id=" + other + "&amount=37", { waitUntil: "load" });
    await expect.poll(function () { return purchases.length; }, { timeout: 15000 }).toBe(2);
    expect(purchaseEid(purchases[1])).toBe(other);
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(3000);
    expect(purchases).toHaveLength(2);
  });

  test("obrigado without a live session id fires no Purchase", async function ({ page }) {
    await maskWebdriver(page);
    const purchases = await acceptAndCountPurchases(page);
    const pageviews = [];
    page.on("request", function (req) {
      if (/[?&]ev=PageView(?:&|$)/.test(req.url())) pageviews.push(req.url());
    });
    await page.goto(PROD + "/obrigado.html", { waitUntil: "load" });
    await expect.poll(function () { return pageviews.length; }, { timeout: 15000 }).toBeGreaterThan(0);
    expect(purchases).toHaveLength(0);
    await page.goto(PROD + "/obrigado.html?amount=37", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.goto(PROD + "/obrigado.html?session_id=not-a-checkout&amount=37", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.goto(PROD + "/obrigado.html?session_id=cs_test_FAKESESSION&amount=14", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    expect(purchases).toHaveLength(0);
    const flagged = await page.evaluate(function () {
      return localStorage.getItem("sia21_purchase_once_v1_3700") || localStorage.getItem("sia21_purchase_v1_cs_test_FAKESESSION");
    });
    expect(flagged).toBeNull();
  });

  async function countFbq(page) {
    await page.addInitScript(function () {
      window.__fbqCalls = [];
      var impl;
      try {
        Object.defineProperty(window, "fbq", {
          configurable: true,
          enumerable: true,
          get: function () { return impl; },
          set: function (fn) {
            if (typeof fn !== "function") { impl = fn; return; }
            var wrapped = function () {
              window.__fbqCalls.push(String(arguments[0] || ""));
              return fn.apply(this, arguments);
            };
            impl = wrapped;
          }
        });
      } catch (e) {}
    });
  }

  test("headless webdriver never loads fbevents or calls fbq", async function ({ page }) {
    await countFbq(page);
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    const pixel = [];
    page.on("request", function (req) {
      if (/fbevents\.js|facebook\.com\/tr|posthog\.com/i.test(req.url())) pixel.push(req.url());
    });
    await page.goto(PROD + "/index.html", { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 900);
    await page.evaluate(function () { window.scrollTo(0, document.documentElement.scrollHeight); });
    await page.goto(PROD + "/obrigado.html?session_id=cs_live_HEADLESSQA&amount=37", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const state = await page.evaluate(function () {
      return {
        suppressed: window.SIA21_trackingSuppressed(),
        fbq: typeof window.fbq,
        calls: window.__fbqCalls || []
      };
    });
    expect(state.suppressed).toBe(true);
    expect(state.fbq).toBe("undefined");
    expect(state.calls).toEqual([]);
    expect(pixel, JSON.stringify(pixel)).toEqual([]);
  });

  test("qa=1 stays suppressed on obrigado without the query", async function ({ page }) {
    await maskWebdriver(page);
    await countFbq(page);
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    const pixel = [];
    page.on("request", function (req) {
      if (/fbevents\.js|facebook\.com\/tr|posthog\.com/i.test(req.url())) pixel.push(req.url());
    });
    await page.goto(PROD + "/index.html?qa=1", { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 400);
    const flags = await page.evaluate(function () {
      return {
        local: localStorage.getItem("sia21_qa"),
        session: sessionStorage.getItem("sia21_qa")
      };
    });
    expect(flags).toEqual({ local: "1", session: "1" });
    await page.goto(PROD + "/obrigado.html?session_id=cs_live_QAPERSIST&amount=37", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const state = await page.evaluate(function () {
      return {
        suppressed: window.SIA21_trackingSuppressed(),
        local: localStorage.getItem("sia21_qa"),
        session: sessionStorage.getItem("sia21_qa"),
        calls: window.__fbqCalls || [],
        fbq: typeof window.fbq
      };
    });
    expect(state.suppressed).toBe(true);
    expect(state.local).toBe("1");
    expect(state.session).toBe("1");
    expect(state.fbq).toBe("undefined");
    expect(state.calls).toEqual([]);
    expect(pixel, JSON.stringify(pixel)).toEqual([]);
  });
});

test.describe("automated user agent", function () {
  test.use({
    userAgent: "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/122.0.0.0 Mobile Safari/537.36 Playwright"
  });

  test("HeadlessChrome UA skips the pixel when webdriver is hidden", async function ({ page }) {
    await maskWebdriver(page);
    await page.addInitScript(function () {
      window.__fbqCalls = [];
      var impl;
      try {
        Object.defineProperty(window, "fbq", {
          configurable: true,
          enumerable: true,
          get: function () { return impl; },
          set: function (fn) {
            if (typeof fn !== "function") { impl = fn; return; }
            var wrapped = function () {
              window.__fbqCalls.push(String(arguments[0] || ""));
              return fn.apply(this, arguments);
            };
            impl = wrapped;
          }
        });
      } catch (e) {}
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e2) {}
    });
    const pixel = [];
    page.on("request", function (req) {
      if (/fbevents\.js|facebook\.com\/tr|posthog\.com/i.test(req.url())) pixel.push(req.url());
    });
    await page.goto(PROD + "/obrigado.html?session_id=cs_live_HEADLESSUA&amount=37", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const state = await page.evaluate(function () {
      return {
        suppressed: window.SIA21_trackingSuppressed(),
        webdriver: navigator.webdriver === true,
        calls: window.__fbqCalls || [],
        fbq: typeof window.fbq
      };
    });
    expect(state.webdriver).toBe(false);
    expect(state.suppressed).toBe(true);
    expect(state.fbq).toBe("undefined");
    expect(state.calls).toEqual([]);
    expect(pixel, JSON.stringify(pixel)).toEqual([]);
  });
});
