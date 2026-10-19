const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const PROD = "https://4improvementsportugal-ops.github.io";
const LOCAL = "http://127.0.0.1:4173";
const PREVIEW = "http://4improvementsportugal-ops.github.io:4173";
const TRACKING = /posthog\.com|facebook\.net|facebook\.com/i;
const FBE_SHIM = fs.readFileSync(path.join(__dirname, "fbevents-shim.js"), "utf8");
const PH_STUB = fs.readFileSync(path.join(__dirname, "posthog-stub.js"), "utf8");
const LIVE_SESSION = "cs_live_a8Kd2mQ9pL4sT7vX1nR6bY3c";
const OTHER_SESSION = "cs_live_b7Nm3pQ2rL8sT4vY6wZ1cD5e";

function isPosthogAsset(url) {
  return /posthog\.com\/.+\.js(?:\?|$)/i.test(url) || /-assets\.i\.posthog\.com/i.test(url);
}

function isFacebookScript(url) {
  return /fbevents\.js/i.test(url);
}

async function fulfillTracking(route) {
  const url = route.request().url();
  try {
    if (isFacebookScript(url)) {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: FBE_SHIM });
      return;
    }
    if (isPosthogAsset(url)) {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: PH_STUB });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  } catch (e) {
    try { await route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); } catch (e2) {}
  }
}

async function proxyProd(route) {
  const url = new URL(route.request().url());
  const localUrl = LOCAL + url.pathname + url.search;
  const res = await fetch(localUrl);
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
    return hit.method + " " + hit.url + "\n" + hit.body.slice(0, 400);
  }).join("\n---\n");
  throw new Error(label + "\n" + preview + "\nparsed=" + JSON.stringify(last.map(function (event) { return event.event; })));
}

async function maskWebdriver(page) {
  // Pixel 5's UA string is a normal Chrome, but headless still reports the
  // HeadlessChrome brand. PostHog treats that brand as a bot and drops capture
  // before a request exists, so the harness would never see the event.
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
        try { return read.call(navigator); } catch (e) { return null; }
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

test.beforeEach(async function ({ page }) {
  await installHarness(page);
});

test.describe("tracking", function () {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no interaction on production sends nothing", async function ({ page }) {
    const hits = await watchTracking(page);
    await page.goto(PROD + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    expect(hits, JSON.stringify(hits.map(function (hit) { return hit.url; }))).toEqual([]);
  });

  test("an explicit preview port on http stays silent", async function ({ page }) {
    await maskWebdriver(page);
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    const hits = await watchTracking(page);
    await page.goto(PREVIEW + "/index.html", { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 900);
    await page.locator("h1").click();
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

  test("obvious test session ids do not fire Meta or PostHog", async function ({ page }) {
    await maskWebdriver(page);
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    const hits = await watchTracking(page);
    await page.goto(PROD + "/obrigado.html?session_id=cs_live_TESTSESSION123&amount=37", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.goto(PROD + "/obrigado.html?session_id=cs_test_FAKESESSION&amount=14", { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const state = await page.evaluate(function () {
      return {
        allow: window.SIA21_allowCapture(),
        purchase: window.SIA21_firePurchaseOnce()
      };
    });
    expect(state).toEqual({ allow: false, purchase: false });
    expect(hits, JSON.stringify(hits.map(function (hit) { return hit.url; }))).toEqual([]);
  });

  test("a mobile tap requests PageView for the production pixel and nothing else", async function ({ page }) {
    await maskWebdriver(page);
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    const hits = await watchTracking(page);
    await page.goto(PROD + "/angles-v2/01-tempo/", { waitUntil: "domcontentloaded" });
    await page.locator("h1").click();
    await page.mouse.wheel(0, 700);
    await expect.poll(function () {
      return hits.filter(function (hit) {
        return /[?&]ev=PageView(?:&|$)/.test(hit.url) && /[?&]id=1506988540335331(?:&|$)/.test(hit.url);
      }).length;
    }, { timeout: 15000 }).toBeGreaterThan(0);
    expect(hits.some(function (hit) { return /[?&]ev=(?:Purchase|InitiateCheckout)(?:&|$)/.test(hit.url); })).toBe(false);
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
    // Headless Playwright reports webdriver and a HeadlessChrome client hint.
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

  test("mobile first fold does not report the bottom", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.goto(PROD + "/angles-v2/sobrecarga/", { waitUntil: "load" });
    await waitTall(page);
    const atRest = await page.evaluate(function () { return window.__SIA21_MAX_SCROLL; });
    expect(atRest).toBeLessThan(25);
    await page.locator("h1").click();
    await page.evaluate(function () {
      window.scrollTo(0, Math.round(window.innerHeight * 0.7));
    });
    await page.waitForTimeout(200);
    const fold = await page.evaluate(function () {
      return {
        max: window.__SIA21_MAX_SCROLL,
        top: window.scrollY,
        height: document.documentElement.scrollHeight,
        view: window.innerHeight
      };
    });
    expect(fold.top).toBeGreaterThan(80);
    expect(fold.top).toBeLessThan(fold.view);
    expect(fold.max).toBeLessThan(50);
    const early = eventsFrom(hits).filter(function (event) { return event.event === "sia21_scroll"; });
    const earlyDepths = early.map(function (event) { return event.properties && event.properties.depth; });
    expect(earlyDepths.every(function (depth) { return depth <= 25; })).toBe(true);
    expect(earlyDepths.indexOf(50)).toBe(-1);
    expect(earlyDepths.indexOf(100)).toBe(-1);
    await page.evaluate(function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, max);
    });
    const scrolled = await waitFor(hits, function (events) {
      var depths = events.filter(function (event) { return event.event === "sia21_scroll"; }).map(function (event) {
        return event.properties && event.properties.depth;
      });
      return [25, 50, 75, 100].every(function (depth) { return depths.indexOf(depth) !== -1; });
    }, "missing ordered sia21_scroll depths");
    const depths = scrolled.filter(function (event) { return event.event === "sia21_scroll"; }).map(function (event) {
      return event.properties && event.properties.depth;
    });
    expect(depths).toEqual([25, 50, 75, 100]);
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
    await page.locator("#sticky-cta").click();
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
    await expect.poll(async function () {
      return page.evaluate(function () { return window.__SIA21_MAX_SCROLL; });
    }).toBeGreaterThanOrEqual(99);
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
    const sid = LIVE_SESSION;
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

    const other = OTHER_SESSION;
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

  test("autoConfig false is set before init and stray Purchase calls are dropped", async function ({ page }) {
    await maskWebdriver(page);
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    await page.route(/fbevents\.js/i, function (route) {
      return route.fulfill({ status: 200, contentType: "application/javascript", body: "/* held */" });
    });
    await page.goto(PROD + "/index.html", { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 700);
    await page.waitForFunction(function () {
      return window.fbq && window.fbq.queue && window.fbq.queue.length > 0;
    });
    const queue = await page.evaluate(function () {
      return (window.fbq.queue || []).map(function (args) { return Array.prototype.slice.call(args); });
    });
    const initAt = queue.findIndex(function (cmd) {
      return cmd[0] === "init" && cmd[1] === "1506988540335331";
    });
    expect(initAt).toBeGreaterThan(0);
    const before = queue.slice(0, initAt);
    expect(before.some(function (cmd) {
      return cmd[0] === "set" && cmd[1] === "autoConfig" && cmd[2] === false && cmd.length === 3;
    })).toBe(true);
    expect(before.some(function (cmd) {
      return cmd[0] === "set" && cmd[1] === "autoConfig" && cmd[2] === false && cmd[3] === "1506988540335331";
    })).toBe(true);
    expect(before.some(function (cmd) {
      return cmd[0] === "set" && cmd[1] === "smartSetup" && cmd[2] === false && cmd.length === 3;
    })).toBe(true);
    await page.evaluate(function () {
      window.fbq("track", "Purchase", { value: 37, currency: "EUR" }, { eventID: "cs_live_EVIL" });
      window.fbq("trackSingle", "1506988540335331", "Purchase", { value: 37, currency: "EUR" });
    });
    const blocked = await page.evaluate(function () {
      return (window.fbq.queue || []).map(function (args) { return Array.prototype.slice.call(args); });
    });
    expect(blocked.some(function (cmd) { return cmd.indexOf("Purchase") !== -1; })).toBe(false);
    await page.evaluate(function () {
      window.__SIA21_PURCHASE_ALLOW = true;
      window.fbq("track", "Purchase", { value: 37, currency: "EUR" }, { eventID: "cs_live_OK" });
      window.__SIA21_PURCHASE_ALLOW = false;
    });
    const allowed = await page.evaluate(function () {
      return (window.fbq.queue || []).map(function (args) { return Array.prototype.slice.call(args); });
    });
    expect(allowed.some(function (cmd) {
      return cmd[0] === "track" && cmd[1] === "Purchase" && cmd[3] && cmd[3].eventID === "cs_live_OK";
    })).toBe(true);
  });

  test("Purchase never fires on non-obrigado pages", async function ({ page }) {
    await maskWebdriver(page);
    const purchases = [];
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    await page.route(/facebook\.com\/tr/i, async function (route) {
      const url = route.request().url();
      if (/[?&]ev=Purchase(?:&|$)/.test(url)) purchases.push(url);
      await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    });
    page.on("popup", function (popup) { popup.close().catch(function () {}); });
    await page.route(/buy\.stripe\.com/, function (route) { return route.abort(); });
    await page.goto(PROD + "/index.html?session_id=cs_live_NOTATHANKYOU", { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 800);
    await page.waitForFunction(function () {
      return window.__SIA21_HUMAN === true && typeof window.fbq === "function" && window.SIA21_checkoutAllowed();
    });
    await page.evaluate(function () {
      window.fbq("track", "Purchase", { value: 37, currency: "EUR" }, { eventID: "cs_live_NOTATHANKYOU" });
    });
    await page.locator("#hero-cta").click();
    await page.waitForTimeout(1600);
    expect(purchases).toEqual([]);
    await page.goto(PROD + "/angles/01-tempo/?session_id=cs_live_ANGLEPAGE", { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 800);
    await page.waitForFunction(function () { return typeof window.fbq === "function"; });
    await page.evaluate(function () {
      window.fbq("track", "Purchase", { value: 14, currency: "EUR" }, { eventID: "cs_live_ANGLEPAGE" });
      window.fbq("trackSingle", "1506988540335331", "Purchase", { value: 14, currency: "EUR" });
    });
    await page.waitForTimeout(1000);
    expect(purchases).toEqual([]);
  });

  async function armCheckout(page, url) {
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    const hits = [];
    await page.route(/facebook\.com\/tr/i, async function (route) {
      hits.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    });
    page.on("popup", function (popup) { popup.close().catch(function () {}); });
    await page.route(/buy\.stripe\.com/, function (route) { return route.abort(); });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.mouse.wheel(0, 800);
    await page.waitForFunction(function () {
      return window.__SIA21_ENGAGED === true && window.SIA21_checkoutAllowed && window.SIA21_checkoutAllowed();
    });
    return hits;
  }

  function icUrls(hits) {
    return hits.filter(function (url) { return /[?&]ev=InitiateCheckout(?:&|$)/.test(url); });
  }

  test("InitiateCheckout fires on a Stripe link click before navigation", async function ({ page }) {
    await maskWebdriver(page);
    const order = [];
    page.on("request", function (req) {
      const url = req.url();
      if (/[?&]ev=InitiateCheckout(?:&|$)/.test(url)) order.push("ic");
      if (/buy\.stripe\.com/.test(url)) order.push("nav");
    });
    const hits = await armCheckout(page, PROD + "/index.html");
    await page.locator("#hero-cta").click();
    await expect.poll(function () { return icUrls(hits).length; }, { timeout: 15000 }).toBe(1);
    const ic = new URL(icUrls(hits)[0]);
    expect(ic.searchParams.get("cd[value]")).toBe("37");
    expect(ic.searchParams.get("cd[currency]")).toBe("EUR");
    expect(ic.searchParams.get("cd[content_name]")).toBe("Sistema IA do Consultor");
    expect(page.url()).toContain("/index.html");
    const icAt = order.indexOf("ic");
    const navAt = order.indexOf("nav");
    expect(icAt).toBeGreaterThanOrEqual(0);
    if (navAt !== -1) expect(icAt).toBeLessThan(navAt);
    expect(hits.some(function (url) { return /[?&]ev=Purchase(?:&|$)/.test(url); })).toBe(false);
  });

  test("two taps 200ms apart fire one InitiateCheckout, one stripe_checkout_click and one navigation", async function ({ page }) {
    await maskWebdriver(page);
    const tracked = await watchTracking(page);
    const navs = [];
    page.on("request", function (req) {
      if (/buy\.stripe\.com/i.test(req.url())) navs.push(req.url());
    });
    const popups = [];
    page.on("popup", function (popup) { popups.push(popup); });
    const hits = await armCheckout(page, PROD + "/index.html");
    const cta = page.locator("#hero-cta");
    await cta.click({ noWaitAfter: true });
    await page.waitForTimeout(200);
    await cta.click({ noWaitAfter: true });
    function checkoutClicks() {
      return tracked.reduce(function (n, hit) {
        var blob = (hit.body || "") + "\n" + hit.url;
        return n + (blob.split("stripe_checkout_click").length - 1);
      }, 0);
    }
    await expect.poll(function () { return icUrls(hits).length; }, { timeout: 15000 }).toBe(1);
    await expect.poll(checkoutClicks, { timeout: 15000 }).toBe(1);
    await page.waitForTimeout(1400);
    expect(icUrls(hits)).toHaveLength(1);
    expect(checkoutClicks()).toBe(1);
    expect(navs.length + popups.length).toBe(1);
    expect(page.url()).toContain("/index.html");
  });

  test("InitiateCheckout fires for the sticky bar and the €33 exit offer", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await armCheckout(page, PROD + "/angles-v2/05-angariacao/?sia21_debug=1");
    await page.locator("#sticky-cta").click();
    await expect.poll(function () { return icUrls(hits).length; }, { timeout: 15000 }).toBe(1);
    expect(new URL(icUrls(hits)[0]).searchParams.get("cd[value]")).toBe("37");
    await page.evaluate(function () {
      try { sessionStorage.setItem("sia21_stripe_left_at_v1", String(Date.now() - 120000)); } catch (e) {}
      window.__SIA21_STRIPE_CLICKED_HERE = false;
    });
    await hidePage(page);
    await page.waitForTimeout(500);
    await showPage(page);
    await expect(page.locator("#sia21-exit a.sia21-exit-primary")).toBeVisible({ timeout: 8000 });
    await page.locator("#sia21-exit a.sia21-exit-primary").click();
    await expect.poll(function () { return icUrls(hits).length; }, { timeout: 15000 }).toBe(2);
    expect(new URL(icUrls(hits)[1]).searchParams.get("cd[value]")).toBe("33");
    expect(hits.some(function (url) { return /[?&]ev=Purchase(?:&|$)/.test(url); })).toBe(false);
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

  const TRUST_LINE = "Recebes o PDF por email, normalmente em menos de 30 minutos";
  const TOOLS_LINE = "Funciona com o ChatGPT grátis ou com o Claude; os planos pagos são opcionais.";
  const PROOF_LINE = "Mais de 1000 compras em ofertas semelhantes da 4Improvements";
  const VALUE_LINES = [
    "Cada dia diz-te o que fazer, quanto tempo leva e o que tens no fim.",
    "Entre 25 e 45 minutos na maioria dos dias. Alguns dias pedem 60.",
    "80 prompts em português de Portugal para emails, Idealista, WhatsApp, CRM e follow-up. Deixas de escrever do zero.",
    "7 listas para imprimir: setup, visita, anúncio, angariação, follow-up, semana e compliance.",
    "Regras claras do que nunca colar na IA. Usas a IA sem pôr dados de clientes em risco.",
    "Uma rotina para a semana e uma folha para anotares o tempo que poupas. Vês nos teus números.",
    "PDF de 55 páginas, em português de Portugal. Lês no telemóvel ou imprimes.",
    TOOLS_LINE
  ];
  const EARLY_37 = "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02";
  const KIT_LITE = "https://buy.stripe.com/dRm00lbpf5Gf1fNb6mgrS01";
  const KIT_PRO = "https://buy.stripe.com/14A9AVgJz9Wve2zfmCgrS00";

  function checkoutFiles() {
    return ["index.html"].concat(anglePages()).filter(function (file) {
      return fs.readFileSync(file, "utf8").indexOf("aFa5kF1OFc4D1fNb6mgrS02") !== -1;
    });
  }

  test("checkout pages keep the trust copy, the struck price and the payment links", function () {
    const files = checkoutFiles();
    expect(files.length).toBeGreaterThanOrEqual(21);
    const missing = [];
    files.forEach(function (file) {
      const html = fs.readFileSync(file, "utf8");
      const need = [EARLY_37, "€37", "line-through", "€47", TRUST_LINE, TOOLS_LINE, PROOF_LINE, "sia21-consent.css", "privacidade", "Política de Privacidade", 'data-ck="accepted"', 'data-ck="rejected"'].concat(VALUE_LINES);
      need.forEach(function (needle) {
        if (html.indexOf(needle) === -1) missing.push(file + " missing " + needle);
      });
      if (html.indexOf("—") !== -1) missing.push(file + " contains an em dash");
      if (html.indexOf("Pagamento seguro via Stripe.") !== -1) missing.push(file + " still has the old pay note");
    });
    expect(missing, missing.join("\n")).toEqual([]);
    const obrigado = fs.readFileSync("obrigado.html", "utf8");
    expect(obrigado).toContain(TRUST_LINE);
    expect(obrigado).toContain(KIT_LITE);
    expect(obrigado).toContain(KIT_PRO);
    expect(obrigado.indexOf("—")).toBe(-1);
    const termos = fs.readFileSync("termos.html", "utf8");
    expect(termos).toContain("O prazo máximo de entrega é de 24 horas");
    expect(termos).toContain(TRUST_LINE);
    const conv = fs.readFileSync("assets/sia21-conv.js", "utf8");
    expect(conv).toContain(EARLY_33);
    expect(conv).toContain(EARLY_14);
    expect(conv).toContain(PROOF_LINE);
    expect(conv.indexOf("—")).toBe(-1);
    const gate = fs.readFileSync("assets/human-gate.js", "utf8");
    expect(gate).toContain('SIA21_captureWhenHuman("cookie_consent"');
    expect(gate).not.toContain("inapp-note");
  });

  test("Aceitar records cookie_consent and only then loads the pixel", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.goto(PROD + "/index.html", { waitUntil: "domcontentloaded" });
    await page.locator("button[data-ck='accepted']").click();
    const events = await waitFor(hits, function (list) {
      return list.some(function (event) { return event.event === "cookie_consent"; });
    }, "missing cookie_consent accepted");
    const consent = events.filter(function (event) { return event.event === "cookie_consent"; });
    expect(consent).toHaveLength(1);
    const pathName = await page.evaluate(function () { return location.pathname; });
    expect(consent[0].properties.choice).toBe("accepted");
    expect(consent[0].properties.path).toBe(pathName);
    expect(consent[0].properties.angle).toBe("home");
    expect(consent[0].properties.format).toBe("storytelling");
    await waitFor(hits, function () {
      return hits.some(function (hit) {
        return /[?&]ev=PageView(?:&|$)/.test(hit.url) && /[?&]id=1506988540335331(?:&|$)/.test(hit.url);
      });
    }, "missing PageView after Aceitar");
  });

  test("Rejeitar records cookie_consent and does not load the pixel", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    const pixel = [];
    page.on("request", function (req) {
      if (/fbevents\.js|facebook\.com\/tr/i.test(req.url())) pixel.push(req.url());
    });
    await page.goto(PROD + "/angles-v2/05-angariacao/", { waitUntil: "domcontentloaded" });
    await page.locator("button[data-ck='rejected']").click();
    const events = await waitFor(hits, function (list) {
      return list.some(function (event) { return event.event === "cookie_consent"; });
    }, "missing cookie_consent rejected");
    const consent = events.filter(function (event) { return event.event === "cookie_consent"; });
    expect(consent).toHaveLength(1);
    const pathName = await page.evaluate(function () { return location.pathname; });
    expect(consent[0].properties).toMatchObject({
      choice: "rejected",
      path: pathName,
      angle: "05-angariacao"
    });
    await page.waitForTimeout(1500);
    const started = await page.evaluate(function () { return window.__SIA21_MTHD_STARTED === true; });
    expect(started).toBe(false);
    expect(pixel, JSON.stringify(pixel)).toEqual([]);
    expect(hits.some(function (hit) { return /fbevents\.js|facebook\.com\/tr/i.test(hit.url); })).toBe(false);
  });

  test("ignoring the banner records no cookie_consent", async function ({ page }) {
    await maskWebdriver(page);
    const hits = await watchTracking(page);
    await page.goto(PROD + "/angles-v2/01-tempo/", { waitUntil: "domcontentloaded" });
    await page.locator("h1").click();
    await waitFor(hits, function (list) {
      return list.some(function (event) { return event.event === "$pageview"; });
    }, "missing pageview after a human click");
    await page.waitForTimeout(1000);
    expect(eventsFrom(hits).some(function (event) { return event.event === "cookie_consent"; })).toBe(false);
  });

  test("cookie buttons match and leave the buy button free", async function ({ page }) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PROD + "/angles-v2/01-tempo/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#ck")).toBeVisible();
    const layout = await page.evaluate(function () {
      function box(el) {
        var r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }
      function overlap(a, b) {
        if (a.width < 2 || a.height < 2 || b.width < 2 || b.height < 2) return false;
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      }
      var rej = document.querySelector("button[data-ck='rejected']");
      var acc = document.querySelector("button[data-ck='accepted']");
      var ck = document.getElementById("ck");
      var hero = document.getElementById("hero-cta");
      var sticky = document.getElementById("sticky-cta");
      var rs = getComputedStyle(rej);
      var as = getComputedStyle(acc);
      return {
        rej: box(rej),
        acc: box(acc),
        ck: box(ck),
        heroOverlap: overlap(box(ck), box(hero)),
        stickyOverlap: overlap(box(ck), box(sticky)),
        sameBg: rs.backgroundColor === as.backgroundColor,
        sameColor: rs.color === as.color,
        sameSize: rs.fontSize === as.fontSize,
        sameWeight: rs.fontWeight === as.fontWeight,
        privacy: !!ck.querySelector("a[href*='privacidade']")
      };
    });
    expect(Math.abs(layout.rej.width - layout.acc.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(layout.rej.height - layout.acc.height)).toBeLessThanOrEqual(2);
    expect(layout.rej.height).toBeGreaterThanOrEqual(44);
    expect(layout.sameBg).toBe(true);
    expect(layout.sameColor).toBe(true);
    expect(layout.sameSize).toBe(true);
    expect(layout.sameWeight).toBe(true);
    expect(layout.privacy).toBe(true);
    expect(layout.ck.top).toBeLessThan(8);
    expect(layout.heroOverlap).toBe(false);
    expect(layout.stickyOverlap).toBe(false);
    await expect(page.locator(".inapp-note")).toHaveCount(0);
  });

  test("an in-app browser does not get an extra notice and the checkout link stays", async function ({ page }) {
    await page.addInitScript(function () {
      var ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 [FBAN/FBIOS;FBAV/470.0.0.0.0;FBBV/1]";
      try {
        Object.defineProperty(Navigator.prototype, "userAgent", { configurable: true, get: function () { return ua; } });
      } catch (e) {}
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PROD + "/angles-v2/01-tempo/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".inapp-note")).toHaveCount(0);
    await expect(page.locator("#hero-cta")).toHaveAttribute("href", "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02");
    await expect(page.locator("#sticky-cta")).toHaveAttribute("href", "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02");
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
