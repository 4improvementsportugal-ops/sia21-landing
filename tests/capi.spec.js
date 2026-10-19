const { test, expect } = require("@playwright/test");

const PROD = "https://4improvementsportugal-ops.github.io";
const LOCAL = "http://127.0.0.1:4173";
const TRACKING = /posthog\.com|facebook\.net|facebook\.com/i;
const FBP = "fb.1.1711111111111.2222222222";

function pageCodeFromPath(pathname) {
  var path = String(pathname || "");
  path = path.replace(/\/index\.html$/, "/");
  path = path.replace(/\.html$/, "");
  if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
  if (path === "" || path === "/" || path === "/index") return "home";
  if (path === "/v4") return "v4";
  if (path === "/v3/storytelling") return "v3";
  if (path === "/obrigado") return "obg";
  var v1 = /^\/angles\/(0[1-9]|10)(?:-|$)/.exec(path);
  if (v1) return "a" + v1[1];
  var v2 = /^\/angles-v2\/(0[1-9]|10)(?:-|$)/.exec(path);
  if (v2) return "b" + v2[1];
  if (path === "/angles-v2/sobrecarga") return "bsob";
  var slug = path.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  return /^[a-z0-9]+$/.test(slug) ? slug : "unk";
}

function expectedRef(pathname, options) {
  options = options || {};
  var fbpTs = options.noFbp ? "0" : (options.fbpTs || "1711111111111");
  var fbpRand = options.noFbp ? "0" : (options.fbpRand || "2222222222");
  var fbcTs = options.fbcTs != null ? String(options.fbcTs) : "0";
  var fbclid = options.fbclid || "";
  var utm = options.utm || "";
  var page = options.page || pageCodeFromPath(pathname);
  var value = "c1_" + fbpTs + "_" + fbpRand + "_" + fbcTs + "_" + fbclid + "_p-" + page;
  if (utm) value += "_u-" + utm;
  return value;
}
const CORE_37 = "aFa5kF1OFc4D1fNb6mgrS02";
const EARLY_33 = "fZueVf1OFc4D7Eb1vMgrS04";
const EARLY_14 = "6oU3cx3WN0lVbUr0rIgrS05";
const KIT_PRO = "14A9AVgJz9Wve2zfmCgrS00";
const KIT_LITE = "dRm00lbpf5Gf1fNb6mgrS01";
const FUTURE_27 = "testAB27future";

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

function publishedStripePages() {
  const fs = require("fs");
  const path = require("path");
  const files = ["index.html", "obrigado.html", path.join("v3", "storytelling", "index.html"), path.join("v4", "index.html")];
  ["angles", "angles-v2"].forEach(function (root) {
    fs.readdirSync(root).forEach(function (name) {
      const file = path.join(root, name, "index.html");
      if (fs.existsSync(file) && fs.statSync(file).isFile()) files.push(file);
    });
  });
  return files.filter(function (file) {
    return fs.readFileSync(file, "utf8").indexOf("https://buy.stripe.com/") !== -1;
  }).sort();
}

function pageUrl(file) {
  const normalized = String(file).replace(/\\/g, "/");
  if (normalized === "index.html") return "/index.html";
  if (normalized === "obrigado.html") return "/obrigado.html";
  if (normalized === "v3/storytelling/index.html") return "/v3/storytelling/";
  return "/" + normalized.replace(/index\.html$/, "");
}

function pageFiresPurchase(file) {
  const fs = require("fs");
  const html = fs.readFileSync(file, "utf8");
  return html.indexOf("sia21-purchase.js") !== -1 && html.indexOf("SIA21_firePurchaseOnce") !== -1;
}

async function stripeSnapshot(page) {
  return page.evaluate(function () {
    var nodes = document.querySelectorAll('a[href*="buy.stripe.com"]');
    var links = [];
    for (var i = 0; i < nodes.length; i++) {
      var href = nodes[i].getAttribute("href") || "";
      var parsed = null;
      try { parsed = new URL(href); } catch (e) {}
      var id = parsed ? parsed.pathname.split("/").pop() : "";
      links.push({
        id: id,
        prefix: href.indexOf("https://buy.stripe.com/") === 0,
        ref: parsed ? (parsed.searchParams.get("client_reference_id") || "") : ""
      });
    }
    return { path: location.pathname, links: links };
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
    expect(capi).toContain('https://buy.stripe.com/');
    expect(capi).toContain("ghl-agencias");
    expect(capi).toContain("SIA21_decorateStripeLinks");
    expect(capi).toContain("MutationObserver");
    const attachFn = capi.slice(capi.indexOf("function attachClientReference"));
    expect(attachFn.indexOf("excludedPage()")).toBeGreaterThan(-1);
    expect(attachFn.indexOf("excludedPage()")).toBeLessThan(attachFn.indexOf("function decorateStripeLinks"));
    expect(attachFn).toContain("raw.indexOf(STRIPE_PREFIX) !== 0");
  });

  test("no consent: no client_reference_id, even with _fbp and fbclid", async function ({ page }) {
    const navs = await arm(page, PROD + "/index.html?fbclid=abc_D-1", { fbp: FBP });
    expect(await readCookie(page, "_fbc")).toBe("");
    await allowCheckout(page);
    const buy = page.locator("#hero-cta");
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
    const homeRef = expectedRef("/index.html");
    expect(preservedUrl.searchParams.get("client_reference_id")).toBe(homeRef);
    expect(splitRef(preservedUrl.searchParams.get("client_reference_id"))).toEqual(["c1", "1711111111111", "2222222222", "0", "_p-home"]);
    const parsed = await page.evaluate(function (value) {
      return {
        now: window.SIA21_parseClientReference(value),
        old: window.SIA21_parseClientReference("c1_1711111111111_2222222222_1700000000000_abc_D-1"),
        bare: window.SIA21_parseClientReference("c1_1711111111111_2222222222_0_")
      };
    }, homeRef);
    expect(parsed.now).toEqual({ fbpTs: "1711111111111", fbpRand: "2222222222", fbcTs: "0", fbclid: "", page: "home", utm: "" });
    expect(parsed.old).toEqual({ fbpTs: "1711111111111", fbpRand: "2222222222", fbcTs: "1700000000000", fbclid: "abc_D-1", page: "", utm: "" });
    expect(parsed.bare).toEqual({ fbpTs: "1711111111111", fbpRand: "2222222222", fbcTs: "0", fbclid: "", page: "", utm: "" });
    await allowCheckout(page);
    const ref = await checkoutRef(page, page.locator("#hero-cta"), navs);
    expect(ref).toBe(homeRef);
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
    expect(ref).toBe(expectedRef("/angles-v2/sobrecarga/", { fbcTs: ts, fbclid: "abc_D-1" }));
    const parsed = await page.evaluate(function (value) { return window.SIA21_parseClientReference(value); }, ref);
    expect(parsed.fbclid).toBe("abc_D-1");
    expect(parsed.page).toBe("bsob");
    expect(parsed.fbcTs).toBe(ts);
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
    expect(ref).toBe(expectedRef("/angles-v2/01-tempo/", { noFbp: true, fbcTs: ts, fbclid: "abc_D-1" }));
    const parsed = await page.evaluate(function (value) { return window.SIA21_parseClientReference(value); }, ref);
    expect(parsed.fbclid).toBe("abc_D-1");
    expect(parsed.page).toBe("b01");
    expect(parsed.fbpTs).toBe("0");
  });

  test("fbclid with an invalid character drops the fbc", async function ({ page }) {
    const navs = await arm(page, PROD + "/angles/01-tempo/?fbclid=abc.def", { consent: true, fbp: FBP });
    expect(await readCookie(page, "_fbc")).toBe("");
    await allowCheckout(page);
    const buy = page.locator('a.btn[href*="buy.stripe.com"]').last();
    const ref = await checkoutRef(page, buy, navs);
    expect(ref).toBe(expectedRef("/angles/01-tempo/"));
    expect(ref).not.toContain("abc");
    expect(await readCookie(page, "_fbc")).toBe("");
  });

  test("a client_reference_id over 200 characters drops the fbc and keeps the fbp", async function ({ page }) {
    const longId = "a".repeat(180);
    const navs = await arm(page, PROD + "/index.html?fbclid=" + longId, { consent: true, fbp: FBP });
    await allowCheckout(page);
    const ref = await checkoutRef(page, page.locator("#hero-cta"), navs);
    expect(ref).toBe(expectedRef("/index.html"));
    expect(ref.length).toBeLessThanOrEqual(200);
    expect(ref).not.toContain(longId);
    const boundary = await page.evaluate(function () {
      function write(id) {
        document.cookie = "_fbc=; Max-Age=0; path=/";
        document.cookie = "_fbc=; Max-Age=0; path=/; Secure";
        document.cookie = "_fbc=fb.1.3333333333333." + id + "; path=/; Secure";
      }
      var head = "c1_1711111111111_2222222222_3333333333333_";
      var suffix = "_p-home";
      var keep = "b".repeat(200 - head.length - suffix.length);
      write(keep);
      var kept = window.SIA21_clientReferenceId();
      write(keep + "c");
      var dropped = window.SIA21_clientReferenceId();
      return { head: head.length, suffix: suffix.length, keep: keep.length, kept: kept, dropped: dropped };
    });
    expect(boundary.head).toBe(42);
    expect(boundary.suffix).toBe(7);
    expect(boundary.keep).toBe(151);
    expect(boundary.kept.length).toBe(200);
    expect(boundary.kept).toBe("c1_1711111111111_2222222222_3333333333333_" + "b".repeat(151) + "_p-home");
    const keptParsed = await page.evaluate(function (value) { return window.SIA21_parseClientReference(value); }, boundary.kept);
    expect(keptParsed.fbclid).toBe("b".repeat(151));
    expect(keptParsed.page).toBe("home");
    expect(boundary.dropped).toBe(expectedRef("/index.html"));
  });

  test("the €33 exit offer appends client_reference_id on click", async function ({ page }) {
    const navs = await arm(page, PROD + "/angles-v2/sobrecarga/?sia21_debug=1", { consent: true, fbp: FBP });
    await allowCheckout(page);
    await hidePage(page);
    await page.waitForTimeout(500);
    await showPage(page);
    const offer = page.locator("#sia21-exit a.sia21-exit-primary");
    await expect(offer).toBeVisible({ timeout: 8000 });
    await expect.poll(async function () {
      return offer.getAttribute("href");
    }).toContain("client_reference_id=" + expectedRef("/angles-v2/sobrecarga/"));
    const before = await offer.getAttribute("href");
    expect(new URL(before).pathname).toContain(EARLY_33);
    expect(new URL(before).searchParams.get("client_reference_id")).toBe(expectedRef("/angles-v2/sobrecarga/"));
    const ref = await checkoutRef(page, offer, navs);
    expect(ref).toBe(expectedRef("/angles-v2/sobrecarga/"));
    const href = await offer.getAttribute("href");
    expect(new URL(href).pathname).toContain(EARLY_33);
  });

  test("/obrigado?session_id=cs_live_X sends Purchase with that eventID once", async function ({ page }) {
    await maskWebdriver(page);
    await page.addInitScript(function (fbp) {
      try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
      document.cookie = "_fbp=" + fbp + "; path=/";
    }, FBP);
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
    const upsells = await stripeSnapshot(page);
    const ids = upsells.links.map(function (link) { return link.id; }).sort();
    expect(ids).toEqual([KIT_LITE, KIT_PRO].sort());
    upsells.links.forEach(function (link) {
      expect(link.prefix).toBe(true);
      expect(link.ref).toBe(expectedRef("/obrigado.html"));
    });
    await page.context().route(/buy\.stripe\.com/i, function (route) { return route.abort(); });
    page.on("popup", function (popup) { popup.close().catch(function () {}); });
    await allowCheckout(page);
    await page.locator('a[href*="' + KIT_PRO + '"]').click({ noWaitAfter: true });
    await page.waitForTimeout(1500);
    expect(purchases).toHaveLength(1);
    expect(new URL(purchases[0]).searchParams.get("eid")).toBe(sid);
  });

  test("with consent, c1_ is on Core, both exits, both obrigado links, and a future link", async function ({ page }) {
    test.setTimeout(180000);
    const fs = require("fs");
    const rows = [];
    const files = publishedStripePages();
    expect(files.length).toBeGreaterThanOrEqual(13);
    for (var i = 0; i < files.length; i++) {
      const file = files[i];
      const url = pageUrl(file);
      await arm(page, PROD + url, { consent: true, fbp: FBP });
      const snap = await stripeSnapshot(page);
      expect(snap.links.length).toBeGreaterThan(0);
      const want = expectedRef(url);
      snap.links.forEach(function (link) {
        expect(link.prefix).toBe(true);
        expect(link.ref).toBe(want);
        expect(new URL("https://buy.stripe.com/x?client_reference_id=" + link.ref).searchParams.get("client_reference_id").length).toBeLessThanOrEqual(200);
      });
      rows.push({
        url: url,
        eventID: pageFiresPurchase(file) ? "yes" : "no",
        links: snap.links.map(function (link) { return link.id + " c1_=yes"; })
      });
    }
    const home = rows.filter(function (row) { return row.url === "/index.html"; })[0];
    expect(home.links.join(" ")).toContain(CORE_37);
    expect(home.eventID).toBe("no");
    const thanks = rows.filter(function (row) { return row.url === "/obrigado.html"; })[0];
    expect(thanks.eventID).toBe("yes");
    expect(thanks.links.join(" ")).toContain(KIT_PRO);
    expect(thanks.links.join(" ")).toContain(KIT_LITE);
    expect(rows.filter(function (row) { return row.eventID === "yes"; }).map(function (row) { return row.url; })).toEqual(["/obrigado.html"]);

    await arm(page, PROD + "/angles-v2/sobrecarga/?sia21_debug=1", { consent: true, fbp: FBP });
    await allowCheckout(page);
    await hidePage(page);
    await page.waitForTimeout(500);
    await showPage(page);
    const offer33 = page.locator("#sia21-exit a.sia21-exit-primary");
    await expect(offer33).toBeVisible({ timeout: 8000 });
    await expect.poll(async function () { return offer33.getAttribute("href"); }).toContain(expectedRef("/angles-v2/sobrecarga/"));
    const href33 = await offer33.getAttribute("href");
    expect(new URL(href33).pathname).toContain(EARLY_33);
    expect(new URL(href33).searchParams.get("client_reference_id")).toBe(expectedRef("/angles-v2/sobrecarga/"));
    await page.locator("#sia21-exit button.sia21-exit-secondary").click();
    await expect(page.locator("#sia21-exit")).toBeHidden();
    await page.evaluate(function () {
      sessionStorage.setItem("sia21_stripe_left_at_v1", String(Date.now() - 120000));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return typeof window.SIA21_decorateStripeLinks === "function"; });
    await allowCheckout(page);
    const offer14 = page.locator("#sia21-exit a.sia21-exit-primary");
    await expect(offer14).toBeVisible({ timeout: 8000 });
    await expect.poll(async function () { return offer14.getAttribute("href"); }).toContain(expectedRef("/angles-v2/sobrecarga/"));
    const href14 = await offer14.getAttribute("href");
    expect(new URL(href14).pathname).toContain(EARLY_14);
    expect(new URL(href14).searchParams.get("client_reference_id")).toBe(expectedRef("/angles-v2/sobrecarga/"));

    const injected = await page.evaluate(function (id) {
      var a = document.createElement("a");
      a.setAttribute("href", "https://buy.stripe.com/" + id + "?locale=pt");
      document.body.appendChild(a);
      var skipped = document.createElement("a");
      skipped.setAttribute("href", "http://buy.stripe.com/" + id);
      document.body.appendChild(skipped);
      var foreign = document.createElement("a");
      foreign.setAttribute("href", "https://buy.stripe.com.evil/" + id);
      document.body.appendChild(foreign);
      return { id: id };
    }, FUTURE_27);
    const future = page.locator('a[href*="' + injected.id + '"]').first();
    await expect.poll(async function () { return future.getAttribute("href"); }).toContain("client_reference_id=" + expectedRef("/angles-v2/sobrecarga/"));
    const futureHref = await future.getAttribute("href");
    expect(new URL(futureHref).pathname).toContain(FUTURE_27);
    expect(new URL(futureHref).searchParams.get("locale")).toBe("pt");
    expect(new URL(futureHref).searchParams.get("client_reference_id")).toBe(expectedRef("/angles-v2/sobrecarga/"));
    const leftAlone = await page.evaluate(function (id) {
      var nodes = document.querySelectorAll("a");
      var http = "";
      var evil = "";
      for (var i = 0; i < nodes.length; i++) {
        var href = nodes[i].getAttribute("href") || "";
        if (href.indexOf("http://buy.stripe.com/") === 0) http = href;
        if (href.indexOf("https://buy.stripe.com.evil/") === 0) evil = href;
      }
      return { http: http, evil: evil, id: id };
    }, FUTURE_27);
    expect(leftAlone.http).toBe("http://buy.stripe.com/" + FUTURE_27);
    expect(leftAlone.evil).toBe("https://buy.stripe.com.evil/" + FUTURE_27);

    rows.push({
      url: "/angles-v2/sobrecarga/ (exit dialog)",
      eventID: "no",
      links: [EARLY_33 + " c1_=yes", EARLY_14 + " c1_=yes", FUTURE_27 + " c1_=yes"]
    });
    fs.writeFileSync("/tmp/capi-stripe-pages.json", JSON.stringify(rows, null, 2));
  });

  test("without consent, Core, both exits and both obrigado links stay bare", async function ({ page }) {
    test.setTimeout(180000);
    const files = publishedStripePages();
    for (var i = 0; i < files.length; i++) {
      const file = files[i];
      await arm(page, PROD + pageUrl(file) + "?fbclid=abc_D-1", { fbp: FBP });
      const snap = await stripeSnapshot(page);
      expect(snap.links.length).toBeGreaterThan(0);
      snap.links.forEach(function (link) {
        expect(link.ref).toBe("");
      });
      expect(await readCookie(page, "_fbc")).toBe("");
      if (file === "obrigado.html") {
        const ids = snap.links.map(function (link) { return link.id; }).sort();
        expect(ids).toEqual([KIT_LITE, KIT_PRO].sort());
      }
      if (file === "index.html") {
        snap.links.forEach(function (link) { expect(link.id).toBe(CORE_37); });
      }
    }

    await arm(page, PROD + "/angles-v2/sobrecarga/?sia21_debug=1", { fbp: FBP });
    await allowCheckout(page);
    await hidePage(page);
    await page.waitForTimeout(500);
    await showPage(page);
    const offer33 = page.locator("#sia21-exit a.sia21-exit-primary");
    await expect(offer33).toBeVisible({ timeout: 8000 });
    const href33 = await offer33.getAttribute("href");
    expect(href33).toContain(EARLY_33);
    expect(href33).not.toContain("client_reference_id");
    await page.locator("#sia21-exit button.sia21-exit-secondary").click();
    await page.evaluate(function () {
      sessionStorage.setItem("sia21_stripe_left_at_v1", String(Date.now() - 120000));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return typeof window.SIA21_attachClientReference === "function"; });
    await allowCheckout(page);
    const offer14 = page.locator("#sia21-exit a.sia21-exit-primary");
    await expect(offer14).toBeVisible({ timeout: 8000 });
    const href14 = await offer14.getAttribute("href");
    expect(href14).toContain(EARLY_14);
    expect(href14).not.toContain("client_reference_id");

    const injected = await page.evaluate(function (id) {
      var a = document.createElement("a");
      a.setAttribute("href", "https://buy.stripe.com/" + id);
      document.body.appendChild(a);
      return a.getAttribute("href");
    }, FUTURE_27);
    await page.waitForTimeout(300);
    const after = await page.locator('a[href*="' + FUTURE_27 + '"]').getAttribute("href");
    expect(after).toBe(injected);
    expect(after).not.toContain("client_reference_id");
  });

  test("Aceitar decorates links already on /obrigado without a checkout click", async function ({ page }) {
    await arm(page, PROD + "/obrigado.html", { fbp: FBP });
    const before = await page.locator('a[href*="' + KIT_PRO + '"]').getAttribute("href");
    expect(before).not.toContain("client_reference_id");
    await page.locator("button[data-ck='accepted']").click();
    await expect.poll(async function () {
      return page.locator('a[href*="' + KIT_PRO + '"]').getAttribute("href");
    }).toContain(expectedRef("/obrigado.html"));
    const lite = await page.locator('a[href*="' + KIT_LITE + '"]').getAttribute("href");
    expect(new URL(lite).searchParams.get("client_reference_id")).toBe(expectedRef("/obrigado.html"));
  });

  test("ghl-agencias never receives client_reference_id", async function ({ page }) {
    await arm(page, PROD + "/obrigado.html", { consent: true, fbp: FBP });
    const href = await page.evaluate(async function (id) {
      history.pushState({}, "", "/ghl-agencias/obrigado.html");
      var a = document.createElement("a");
      a.id = "ghl-probe";
      a.setAttribute("href", "https://buy.stripe.com/" + id);
      document.body.appendChild(a);
      window.SIA21_decorateStripeLinks(document);
      window.SIA21_attachClientReference(a);
      await new Promise(function (resolve) { setTimeout(resolve, 50); });
      return a.getAttribute("href");
    }, KIT_PRO);
    expect(href).toBe("https://buy.stripe.com/" + KIT_PRO);
    const restored = await page.evaluate(function () {
      history.pushState({}, "", "/obrigado.html");
      window.SIA21_decorateStripeLinks(document);
      return document.getElementById("ghl-probe").getAttribute("href");
    });
    expect(new URL(restored).searchParams.get("client_reference_id")).toBe(expectedRef("/obrigado.html"));
  });

  test("LP 06 and /v4/ checkout URLs carry the page code and utm_content", async function ({ page }) {
    test.setTimeout(180000);
    const fs = require("fs");
    const sides = [
      { path: "/v4/", utm: "criativo-v4", page: "v4", cta: "#hero-cta" },
      { path: "/angles/06-chatgpt-falhou/", utm: "criativo-a06", page: "a06", cta: "#hero-cta" }
    ];
    const shown = [];
    for (var i = 0; i < sides.length; i++) {
      const side = sides[i];
      await arm(page, PROD + side.path + "?utm_content=" + side.utm, { consent: true, fbp: FBP });
      const want = expectedRef(side.path, { utm: side.utm });
      const cta = page.locator(side.cta);
      await expect.poll(async function () { return cta.getAttribute("href"); }).toContain("client_reference_id=");
      const href = await cta.getAttribute("href");
      const url = new URL(href);
      const ref = url.searchParams.get("client_reference_id");
      expect(ref).toBe(want);
      expect(url.searchParams.get("utm_content")).toBe(side.utm);
      const parsed = await page.evaluate(function (value) { return window.SIA21_parseClientReference(value); }, ref);
      expect(parsed.page).toBe(side.page);
      expect(parsed.utm).toBe(side.utm);
      expect(parsed.fbpTs).toBe("1711111111111");
      expect(parsed.fbclid).toBe("");
      shown.push({
        path: side.path,
        checkout: href,
        client_reference_id: ref,
        page: parsed.page,
        utm_content: parsed.utm
      });
    }

    await arm(page, PROD + "/v4/?utm_content=bad.value", { consent: true, fbp: FBP });
    const badCta = page.locator("#hero-cta");
    await expect.poll(async function () { return badCta.getAttribute("href"); }).toContain("client_reference_id=");
    const badHref = await badCta.getAttribute("href");
    const badRef = new URL(badHref).searchParams.get("client_reference_id");
    expect(badRef).toBe(expectedRef("/v4/"));
    expect(new URL(badHref).searchParams.get("utm_content")).toBeNull();
    expect(badRef).not.toContain("bad");

    const rows = [];
    const files = publishedStripePages();
    for (var j = 0; j < files.length; j++) {
      const file = files[j];
      const path = pageUrl(file);
      await arm(page, PROD + path, { consent: true, fbp: FBP });
      const snap = await stripeSnapshot(page);
      const want = expectedRef(path);
      expect(snap.links.length).toBeGreaterThan(0);
      snap.links.forEach(function (link) { expect(link.ref).toBe(want); });
      rows.push({
        path: path,
        page: pageCodeFromPath(path),
        client_reference_id: want,
        checkout: "https://buy.stripe.com/" + snap.links[0].id + "?client_reference_id=" + want
      });
    }
    fs.writeFileSync("/tmp/capi-ab-refs.json", JSON.stringify({ sides: shown, pages: rows }, null, 2));
  });
});
