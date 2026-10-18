const { test, expect } = require("@playwright/test");

const PROD = "https://4improvementsportugal-ops.github.io";
const LOCAL = "http://127.0.0.1:4173";
const TRACKING = /posthog\.com|facebook\.net|facebook\.com/i;
const FBP = "fb.1.1711111111111.2222222222";
const FBP_REF = "c1_1711111111111_2222222222_0_";
const EARLY_33 = "fZueVf1OFc4D7Eb1vMgrS04";
const EARLY_14 = "6oU3cx3WN0lVbUr0rIgrS05";

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
  await page.route(TRACKING, function (route) {
    const url = route.request().url();
    if (/fbevents\.js/i.test(url)) {
      const fs = require("fs");
      const path = require("path");
      const body = fs.readFileSync(path.join(__dirname, "fbevents-shim.js"), "utf8");
      return route.fulfill({ status: 200, contentType: "application/javascript", body: body });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
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

function splitRef(value) {
  // Python str.split("_", 4): four cuts, the fbclid stays in the last field.
  var parts = [];
  var rest = String(value);
  var i;
  for (i = 0; i < 4; i++) {
    var at = rest.indexOf("_");
    if (at === -1) {
      parts.push(rest);
      rest = "";
      break;
    }
    parts.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  parts.push(rest);
  while (parts.length < 5) parts.push("");
  return parts;
}

async function readCookie(page, name) {
  return page.evaluate(function (cookieName) {
    var all = document.cookie ? document.cookie.split(";") : [];
    var i;
    for (i = 0; i < all.length; i++) {
      var part = all[i].replace(/^\s+/, "");
      var eq = part.indexOf("=");
      if (eq > 0 && part.slice(0, eq) === cookieName) {
        try { return decodeURIComponent(part.slice(eq + 1)); } catch (e) { return part.slice(eq + 1); }
      }
    }
    return "";
  }, name);
}

async function arm(page, url, options) {
  options = options || {};
  await maskWebdriver(page);
  if (options.consent) {
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
  }
  if (options.fbp) {
    await page.addInitScript(function (value) {
      document.cookie = "_fbp=" + value + "; path=/";
    }, options.fbp);
  }
  const navs = [];
  page.context().on("request", function (req) {
    if (/buy\.stripe\.com/i.test(req.url())) navs.push(req.url());
  });
  await page.context().route(/buy\.stripe\.com/i, function (route) { return route.abort(); });
  page.on("popup", function (popup) { popup.close().catch(function () {}); });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () {
    return typeof window.SIA21_attachClientReference === "function";
  });
  return navs;
}

async function allowCheckout(page) {
  for (var i = 0; i < 5; i++) await page.mouse.move(24 + i * 12, 180 + i * 8);
  await page.waitForFunction(function () {
    return window.__SIA21_ENGAGED === true && window.SIA21_checkoutAllowed && window.SIA21_checkoutAllowed();
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

async function checkoutRef(page, locator, navs) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ noWaitAfter: true });
  await expect.poll(async function () {
    return locator.getAttribute("href");
  }).toContain("client_reference_id=");
  const href = await locator.getAttribute("href");
  const fromHref = new URL(href).searchParams.get("client_reference_id");
  await expect.poll(function () { return navs.length; }, { timeout: 15000 }).toBeGreaterThan(0);
  navs.forEach(function (hit) {
    expect(new URL(hit).searchParams.get("client_reference_id")).toBe(fromHref);
  });
  return fromHref;
}

test.beforeEach(async function ({ page }) {
  await installHarness(page);
});

test.describe("meta capi browser", function () {
  test("human-gate loads the capi helper before the checkout lock", function () {
    const fs = require("fs");
    const gate = fs.readFileSync("assets/human-gate.js", "utf8");
    const capi = fs.readFileSync("assets/sia21-capi.js", "utf8");
    expect(gate).toContain("sia21-capi.js");
    expect(gate).toContain("SIA21_attachClientReference");
    const clickFn = gate.slice(gate.indexOf("function onStripeClick"));
    const attachAt = clickFn.indexOf("SIA21_attachClientReference(anchor)");
    const lockAt = clickFn.indexOf("lockCheckout(anchor)");
    expect(attachAt).toBeGreaterThan(0);
    expect(lockAt).toBeGreaterThan(attachAt);
    expect(capi).toContain("new URLSearchParams");
    expect(capi).toContain("split");
  });

  test("no consent: no client_reference_id, even with _fbp and fbclid", async function ({ page }) {
    const navs = await arm(page, PROD + "/index.html?fbclid=abc_D-1", { fbp: FBP });
    expect(await readCookie(page, "_fbc")).toBe("");
    await allowCheckout(page);
    const buy = page.locator("a", { hasText: "Comprar agora" });
    const before = await buy.getAttribute("href");
    await buy.scrollIntoViewIfNeeded();
    await buy.click({ noWaitAfter: true });
    await page.waitForTimeout(1600);
    const after = await buy.getAttribute("href");
    expect(after).toBe(before);
    expect(after).not.toContain("client_reference_id");
    expect(await readCookie(page, "_fbc")).toBe("");
    navs.forEach(function (hit) {
      expect(new URL(hit).searchParams.get("client_reference_id")).toBeNull();
    });
    expect(navs.length).toBeGreaterThan(0);
  });

  test("consent and _fbp only: c1_TS_RAND_0_, and existing query params stay", async function ({ page }) {
    const navs = await arm(page, PROD + "/index.html", { consent: true, fbp: FBP });
    expect(await readCookie(page, "_fbc")).toBe("");
    const preserved = await page.evaluate(function (early14) {
      var a = document.createElement("a");
      a.setAttribute("href", "https://buy.stripe.com/" + early14 + "?locale=pt&prefilled_email=a%40b.pt#pay");
      window.SIA21_attachClientReference(a);
      return a.getAttribute("href");
    }, EARLY_14);
    const preservedUrl = new URL(preserved);
    expect(preservedUrl.pathname).toBe("/" + EARLY_14);
    expect(preservedUrl.searchParams.get("locale")).toBe("pt");
    expect(preservedUrl.searchParams.get("prefilled_email")).toBe("a@b.pt");
    expect(preservedUrl.hash).toBe("#pay");
    expect(preservedUrl.searchParams.get("client_reference_id")).toBe(FBP_REF);
    expect(splitRef(preservedUrl.searchParams.get("client_reference_id"))).toEqual(["c1", "1711111111111", "2222222222", "0", ""]);
    await allowCheckout(page);
    const ref = await checkoutRef(page, page.locator("a", { hasText: "Comprar agora" }), navs);
    expect(ref).toBe(FBP_REF);
  });

  test("consent and ?fbclid=abc_D-1 sets _fbc and c1_..._ts_abc_D-1", async function ({ page }) {
    const navs = await arm(page, PROD + "/index.html?fbclid=abc_D-1", { consent: true, fbp: FBP });
    const fbc = await readCookie(page, "_fbc");
    expect(fbc).toMatch(/^fb\.1\.[0-9]+\.abc_D-1$/);
    const ts = fbc.split(".")[2];
    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await readCookie(page, "_fbc")).toBe(fbc);
    await page.goto(PROD + "/angles-v2/sobrecarga/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () {
      return typeof window.SIA21_attachClientReference === "function";
    });
    expect(await readCookie(page, "_fbc")).toBe(fbc);
    await allowCheckout(page);
    const ref = await checkoutRef(page, page.locator("#hero-cta"), navs);
    expect(ref).toBe("c1_1711111111111_2222222222_" + ts + "_abc_D-1");
    expect(splitRef(ref)).toEqual(["c1", "1711111111111", "2222222222", ts, "abc_D-1"]);
  });

  test("Aceitar on the landing with fbclid stores _fbc, and no _fbp uses 0_0", async function ({ page }) {
    const navs = await arm(page, PROD + "/angles-v2/01-tempo/?fbclid=abc_D-1");
    expect(await readCookie(page, "_fbc")).toBe("");
    await page.locator("button[data-ck='accepted']").click();
    const fbc = await readCookie(page, "_fbc");
    expect(fbc).toMatch(/^fb\.1\.[0-9]+\.abc_D-1$/);
    const ts = fbc.split(".")[2];
    await allowCheckout(page);
    const ref = await checkoutRef(page, page.locator("#hero-cta"), navs);
    expect(ref).toBe("c1_0_0_" + ts + "_abc_D-1");
    expect(splitRef(ref)[4]).toBe("abc_D-1");
  });

  test("fbclid with an invalid character drops the fbc", async function ({ page }) {
    const navs = await arm(page, PROD + "/angles/01-tempo/?fbclid=abc.def", { consent: true, fbp: FBP });
    expect(await readCookie(page, "_fbc")).toBe("");
    await allowCheckout(page);
    const buy = page.locator('a.btn[href*="buy.stripe.com"]').last();
    const ref = await checkoutRef(page, buy, navs);
    expect(ref).toBe(FBP_REF);
    expect(ref).not.toContain("abc");
    expect(await readCookie(page, "_fbc")).toBe("");
  });

  test("a client_reference_id over 200 characters drops the fbc and keeps the fbp", async function ({ page }) {
    const longId = "a".repeat(180);
    const navs = await arm(page, PROD + "/index.html?fbclid=" + longId, { consent: true, fbp: FBP });
    await allowCheckout(page);
    const ref = await checkoutRef(page, page.locator("a", { hasText: "Comprar agora" }), navs);
    expect(ref).toBe(FBP_REF);
    expect(ref.length).toBeLessThanOrEqual(200);
    expect(ref).not.toContain(longId);
    const boundary = await page.evaluate(function () {
      function write(id) {
        document.cookie = "_fbc=; Max-Age=0; path=/";
        document.cookie = "_fbc=; Max-Age=0; path=/; Secure";
        document.cookie = "_fbc=fb.1.3333333333333." + id + "; path=/; Secure";
      }
      var head = "c1_1711111111111_2222222222_3333333333333_";
      var keep = "b".repeat(200 - head.length);
      write(keep);
      var kept = window.SIA21_clientReferenceId();
      write(keep + "c");
      var dropped = window.SIA21_clientReferenceId();
      return { head: head.length, kept: kept, dropped: dropped };
    });
    expect(boundary.head).toBe(42);
    expect(boundary.kept.length).toBe(200);
    expect(boundary.kept).toBe("c1_1711111111111_2222222222_3333333333333_" + "b".repeat(158));
    expect(splitRef(boundary.kept)[4]).toBe("b".repeat(158));
    expect(boundary.dropped).toBe(FBP_REF);
  });

  test("the €33 exit offer appends client_reference_id on click", async function ({ page }) {
    const navs = await arm(page, PROD + "/angles-v2/sobrecarga/?sia21_debug=1", { consent: true, fbp: FBP });
    await allowCheckout(page);
    await hidePage(page);
    await page.waitForTimeout(500);
    await showPage(page);
    const offer = page.locator("#sia21-exit a.sia21-exit-primary");
    await expect(offer).toBeVisible({ timeout: 8000 });
    await expect(offer).toHaveAttribute("href", new RegExp(EARLY_33));
    const before = await offer.getAttribute("href");
    expect(before).not.toContain("client_reference_id");
    const ref = await checkoutRef(page, offer, navs);
    expect(ref).toBe(FBP_REF);
    const href = await offer.getAttribute("href");
    expect(new URL(href).pathname).toContain(EARLY_33);
  });

  test("/obrigado?session_id=cs_live_X sends Purchase with that eventID once", async function ({ page }) {
    await maskWebdriver(page);
    await page.addInitScript(function () {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    });
    const purchases = [];
    await page.route(/facebook\.com\/tr/i, async function (route) {
      const url = route.request().url();
      if (/[?&]ev=Purchase(?:&|$)/.test(url)) purchases.push(url);
      await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    });
    const sid = "cs_live_X";
    await page.goto(PROD + "/obrigado.html?session_id=" + sid + "&amount=37", { waitUntil: "load" });
    await expect.poll(function () { return purchases.length; }, { timeout: 15000 }).toBe(1);
    expect(new URL(purchases[0]).searchParams.get("eid")).toBe(sid);
    const flags = await page.evaluate(function (id) {
      return {
        local: localStorage.getItem("sia21_purchase_v1_" + id),
        session: sessionStorage.getItem("sia21_purchase_v1_" + id),
        again: window.SIA21_firePurchaseOnce()
      };
    }, sid);
    expect(flags).toEqual({ local: "1", session: "1", again: false });
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2000);
    expect(purchases).toHaveLength(1);
    expect(new URL(purchases[0]).searchParams.get("eid")).toBe(sid);
  });
});
