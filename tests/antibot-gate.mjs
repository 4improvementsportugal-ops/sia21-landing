/**
 * Human-gate network checks.
 *
 *   node tests/antibot-gate.mjs
 *
 * Playwright's Chromium is a bot: Meta withholds facebook.com/tr while
 * navigator.webdriver is true, and PostHog drops capture when _is_bot() is
 * true. The idle case uses that default browser and also a hidden tab with
 * the PostHog bot filter turned off, so a pageview that escaped the gate
 * would still show up. The scroll, thank-you, and dwell cases turn the bot
 * filter off and clear webdriver so the requests are observable.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/tmp/node_modules/playwright/package.json");
const { chromium } = require("playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9921;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HUMAN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMetaTr(url) {
  return /facebook\.com\/tr/i.test(url);
}

function isPosthogIngest(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== "eu.i.posthog.com" && !u.hostname.endsWith(".i.posthog.com")) return false;
    if (u.hostname.includes("assets")) return false;
    const p = u.pathname;
    return p === "/e" || p === "/e/" || p.includes("/i/v0/e") || p === "/s" || p.startsWith("/s/") || p.includes("/flags");
  } catch (e) {
    return false;
  }
}

function bodyText(request) {
  const buf = request.postDataBuffer();
  const url = request.url();
  if (!buf || !buf.length) return url;
  const raw = Buffer.from(buf);
  try {
    if (raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
      return url + "\n" + zlib.gunzipSync(raw).toString("utf8");
    }
  } catch (e) {}
  return url + "\n" + raw.toString("utf8");
}

function hasMetaEvent(request, name) {
  if (!isMetaTr(request.url())) return false;
  const blob = bodyText(request);
  return blob.includes("ev=" + name) || blob.includes("ev%3D" + name);
}

function hasPosthogEvent(request, name) {
  if (!request.url().includes("/i/v0/e") && !/\/e\/?(\?|$)/.test(request.url())) return false;
  return bodyText(request).includes(name);
}

function watch(page) {
  const requests = [];
  page.on("request", (request) => requests.push(request));
  return requests;
}

async function waitUntil(fn, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await sleep(100);
  }
  return false;
}

async function arm(context, mode) {
  await context.addInitScript((mode) => {
    try { localStorage.setItem("4i_cookie_consent_v1", "accepted"); } catch (e) {}
    if (mode !== "raw-bot") {
      try {
        Object.defineProperty(Navigator.prototype, "webdriver", {
          configurable: true,
          get: () => false
        });
      } catch (e) {}
    }
    if (mode === "hidden") {
      try {
        Object.defineProperty(Document.prototype, "visibilityState", {
          configurable: true,
          get: () => "hidden"
        });
        Object.defineProperty(Document.prototype, "hidden", {
          configurable: true,
          get: () => true
        });
      } catch (e) {}
    }
    if (mode !== "raw-bot") {
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        var ph = window.posthog;
        if (ph && ph._i && ph._i[0] && ph._i[0][1]) ph._i[0][1].opt_out_useragent_filter = true;
        if (ph && typeof ph.set_config === "function") {
          try { ph.set_config({ opt_out_useragent_filter: true }); } catch (e) {}
        }
        if (tries > 80) clearInterval(timer);
      }, 25);
    }
  }, mode);
}

async function main() {
  const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
    cwd: root,
    stdio: "ignore"
  });
  await sleep(300);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let failed = 0;

  function report(name, ok, detail) {
    results.push({ name, ok, detail });
    if (!ok) failed += 1;
    console.log((ok ? "PASS" : "FAIL") + "  " + name);
    console.log("      " + detail);
  }

  try {
    // Default headless browser, no interaction. Libraries also treat this as a bot.
    {
      const context = await browser.newContext();
      await arm(context, "raw-bot");
      const page = await context.newPage();
      const requests = watch(page);
      await page.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(10000);
      const human = await page.evaluate(() => window.__SIA21_HUMAN === true);
      const meta = requests.filter((r) => isMetaTr(r.url()));
      const ingest = requests.filter((r) => isPosthogIngest(r.url()));
      report(
        "idle 10s, default headless, no interaction",
        meta.length === 0 && ingest.length === 0 && !human,
        "meta/tr=" + meta.length + " posthogIngest=" + ingest.length + " __SIA21_HUMAN=" + human
      );
      await context.close();
    }

    // Bot filter off, tab hidden, no interaction: an ungated pageview would be sent.
    {
      const context = await browser.newContext({ userAgent: HUMAN_UA });
      await arm(context, "hidden");
      const page = await context.newPage();
      const requests = watch(page);
      await page.goto(ORIGIN + "/index.html", { waitUntil: "load", timeout: 30000 });
      await sleep(10000);
      const state = await page.evaluate(() => ({
        human: window.__SIA21_HUMAN === true,
        vis: document.visibilityState
      }));
      const meta = requests.filter((r) => isMetaTr(r.url()));
      const ingest = requests.filter((r) => /\/i\/v0\/e|facebook\.com\/tr/.test(r.url()));
      report(
        "idle 10s, hidden tab, PostHog bot filter off",
        meta.length === 0 && ingest.length === 0 && !state.human && state.vis === "hidden",
        "meta/tr=" + meta.length + " ingest=" + ingest.length + " " + JSON.stringify(state)
      );
      await context.close();
    }

    {
      const context = await browser.newContext({ userAgent: HUMAN_UA });
      await arm(context, "visible");
      const page = await context.newPage();
      const requests = watch(page);
      await page.goto(ORIGIN + "/index.html", { waitUntil: "load", timeout: 30000 });
      await page.mouse.move(480, 320);
      await page.mouse.wheel(0, 1200);
      const found = await waitUntil(() => {
        return (
          requests.some((r) => hasMetaEvent(r, "PageView")) &&
          requests.some((r) => hasMetaEvent(r, "ViewContent")) &&
          requests.some((r) => hasPosthogEvent(r, "$pageview"))
        );
      }, 12000);
      const human = await page.evaluate(() => ({
        human: window.__SIA21_HUMAN === true,
        y: window.scrollY
      }));
      report(
        "scroll on /index.html sends PageView, ViewContent, $pageview",
        found && human.human && human.y > 80,
        "found=" + found + " " + JSON.stringify(human)
      );
      await context.close();
    }

    {
      const context = await browser.newContext({ userAgent: HUMAN_UA });
      await arm(context, "visible");
      const page = await context.newPage();
      const requests = watch(page);
      const started = Date.now();
      await page.goto(ORIGIN + "/obrigado.html", { waitUntil: "commit", timeout: 30000 });
      const found = await waitUntil(() => requests.some((r) => hasMetaEvent(r, "PageView")), 8000);
      const elapsed = Date.now() - started;
      const human = await page.evaluate(() => window.__SIA21_HUMAN === true);
      report(
        "instant PageView on /obrigado.html",
        found && human && elapsed < 6000,
        "found=" + found + " elapsedMs=" + elapsed + " __SIA21_HUMAN=" + human
      );
      await context.close();
    }

    {
      const context = await browser.newContext({ userAgent: HUMAN_UA });
      await arm(context, "visible");
      const page = await context.newPage();
      const requests = watch(page);
      await page.goto(ORIGIN + "/index.html", { waitUntil: "load", timeout: 30000 });
      const found = await waitUntil(() => {
        return requests.some((r) => hasMetaEvent(r, "PageView")) && requests.some((r) => hasPosthogEvent(r, "$pageview"));
      }, 9000);
      const human = await page.evaluate(() => window.__SIA21_HUMAN === true);
      report(
        "6s visible dwell sends PageView and $pageview",
        found && human,
        "found=" + found + " __SIA21_HUMAN=" + human
      );
      await context.close();
    }

    async function trackStripe(context) {
      const hits = [];
      await context.route(/buy\.stripe\.com/i, (route) => {
        hits.push(route.request().url());
        return route.abort();
      });
      return hits;
    }

    function checkoutNoise(requests) {
      return requests.filter((r) => {
        const blob = bodyText(r);
        return /stripe_checkout_click|InitiateCheckout|exit_offer_|last_offer_/.test(blob);
      });
    }

    // Immediate synthetic clicks are what the review bots did: no scroll, no dwell.
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await arm(context, "raw-bot");
      const hits = await trackStripe(context);
      const page = await context.newPage();
      const requests = watch(page);
      await page.goto(ORIGIN + "/index.html", { waitUntil: "load", timeout: 30000 });
      await page.evaluate(() => {
        var link = document.querySelector('a[href*="buy.stripe.com"]');
        link.click();
        link.click();
      });
      await sleep(1200);
      const state = await page.evaluate(() => ({
        engaged: window.__SIA21_ENGAGED === true,
        exitHidden: !document.getElementById("sia21-exit") || document.getElementById("sia21-exit").hidden === true
      }));
      const noise = checkoutNoise(requests);
      report(
        "bot click on the CTA does not open Stripe or fire checkout events",
        hits.length === 0 && noise.length === 0 && !state.engaged && state.exitHidden,
        "stripeNav=" + hits.length + " events=" + noise.length + " " + JSON.stringify(state)
      );
      await context.close();
    }

    // Same click without webdriver (Meta review browsers often leave webdriver false).
    {
      const context = await browser.newContext({ userAgent: HUMAN_UA, viewport: { width: 1280, height: 800 } });
      await arm(context, "visible");
      const hits = await trackStripe(context);
      const page = await context.newPage();
      const requests = watch(page);
      await page.goto(ORIGIN + "/index.html", { waitUntil: "load", timeout: 30000 });
      await page.evaluate(() => document.querySelector('a[href*="buy.stripe.com"]').click());
      await sleep(400);
      const noise = checkoutNoise(requests);
      const engaged = await page.evaluate(() => window.__SIA21_ENGAGED === true);
      report(
        "click with webdriver off and no prior signal stays on the page",
        hits.length === 0 && noise.length === 0 && !engaged,
        "stripeNav=" + hits.length + " events=" + noise.length + " engaged=" + engaged
      );
      await context.close();
    }

    {
      const context = await browser.newContext({ userAgent: HUMAN_UA, viewport: { width: 1280, height: 800 } });
      await arm(context, "visible");
      const hits = await trackStripe(context);
      const page = await context.newPage();
      const requests = watch(page);
      await page.goto(ORIGIN + "/index.html", { waitUntil: "load", timeout: 30000 });
      await page.mouse.move(480, 360);
      await page.mouse.wheel(0, 1400);
      await page.waitForFunction(() => window.__SIA21_ENGAGED === true && window.scrollY > 80);
      await waitUntil(() => requests.some((r) => hasMetaEvent(r, "PageView")), 12000);
      const remain = await page.evaluate(() => Math.max(0, window.__SIA21_CHECKOUT_MIN_MS - (Date.now() - window.__SIA21_PAGE_AT) + 80));
      await sleep(remain);
      await page.click('a[href*="buy.stripe.com"]');
      const sent = await waitUntil(() => {
        return hits.length > 0 && requests.some((r) => hasPosthogEvent(r, "stripe_checkout_click")) && requests.some((r) => hasMetaEvent(r, "InitiateCheckout"));
      }, 8000);
      report(
        "scroll then one click opens Stripe and sends checkout events",
        sent && hits.length > 0,
        "stripeNav=" + hits.length + " sent=" + sent
      );
      await context.close();
    }

    // First click is not a signal. The next click, after 1.5s, is the recovery path.
    {
      const context = await browser.newContext({ userAgent: HUMAN_UA, viewport: { width: 1280, height: 800 } });
      await arm(context, "visible");
      const hits = await trackStripe(context);
      const page = await context.newPage();
      await page.goto(ORIGIN + "/index.html", { waitUntil: "load", timeout: 30000 });
      await page.evaluate(() => document.querySelector('a[href*="buy.stripe.com"]').click());
      const early = hits.length;
      const remain = await page.evaluate(() => Math.max(0, window.__SIA21_CHECKOUT_MIN_MS - (Date.now() - window.__SIA21_PAGE_AT) + 80));
      await sleep(remain);
      await page.evaluate(() => {
        var link = document.querySelector('a[href*="buy.stripe.com"]');
        link.target = "_self";
        link.click();
      });
      await sleep(500);
      const url = page.url();
      report(
        "second click after 1.5s reaches Stripe without a scroll",
        early === 0 && (hits.length > 0 || url.includes("buy.stripe.com")),
        "early=" + early + " stripeNav=" + hits.length + " url=" + url
      );
      await context.close();
    }

    {
      const context = await browser.newContext({ userAgent: HUMAN_UA, viewport: { width: 1280, height: 800 } });
      await arm(context, "visible");
      const page = await context.newPage();
      const requests = watch(page);
      await page.goto(ORIGIN + "/index.html?sia21_debug=1", { waitUntil: "load", timeout: 30000 });
      await sleep(500);
      await page.evaluate(() => {
        document.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, clientX: 40, clientY: 0 }));
      });
      await sleep(300);
      const state = await page.evaluate(() => {
        var box = document.getElementById("sia21-exit");
        return { hidden: !box || box.hidden === true, engaged: window.__SIA21_ENGAGED === true };
      });
      const noise = checkoutNoise(requests);
      report(
        "exit intent without a prior signal stays closed",
        state.hidden && !state.engaged && noise.length === 0,
        JSON.stringify(state) + " events=" + noise.length
      );
      await context.close();
    }

    {
      const context = await browser.newContext({ userAgent: HUMAN_UA, viewport: { width: 1280, height: 800 } });
      await arm(context, "visible");
      const page = await context.newPage();
      const requests = watch(page);
      await page.goto(ORIGIN + "/index.html?sia21_debug=1", { waitUntil: "load", timeout: 30000 });
      await page.mouse.move(480, 360);
      await page.mouse.wheel(0, 1400);
      await page.waitForFunction(() => window.__SIA21_ENGAGED === true && window.scrollY > 80);
      await sleep(400);
      await page.evaluate(() => {
        document.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, clientX: 40, clientY: 0 }));
      });
      const opened = await page.waitForFunction(() => {
        var box = document.getElementById("sia21-exit");
        return box && box.hidden === false;
      }, null, { timeout: 2000 }).then(() => true).catch(() => false);
      const sent = await waitUntil(() => requests.some((r) => hasPosthogEvent(r, "exit_offer_33_shown")), 8000);
      report(
        "exit intent after scroll shows the €33 offer",
        opened && sent,
        "opened=" + opened + " sent=" + sent
      );
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await arm(context, "raw-bot");
      const hits = await trackStripe(context);
      const page = await context.newPage();
      await page.goto(ORIGIN + "/index.html?sia21_debug=1", { waitUntil: "load", timeout: 30000 });
      await page.mouse.move(480, 360);
      await page.mouse.wheel(0, 1400);
      await sleep(1600);
      await page.evaluate(() => {
        document.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, clientX: 40, clientY: 0 }));
      });
      await page.click('a[href*="buy.stripe.com"]').catch(() => {});
      await sleep(400);
      const state = await page.evaluate(() => {
        var box = document.getElementById("sia21-exit");
        return { hidden: !box || box.hidden === true, webdriver: navigator.webdriver === true };
      });
      report(
        "webdriver never opens exit intent or Stripe",
        hits.length === 0 && state.hidden && state.webdriver,
        "stripeNav=" + hits.length + " " + JSON.stringify(state)
      );
      await context.close();
    }

    {
      const context = await browser.newContext({ userAgent: HUMAN_UA, viewport: { width: 1280, height: 800 } });
      await arm(context, "visible");
      const hits = await trackStripe(context);
      const page = await context.newPage();
      await page.goto(ORIGIN + "/obrigado.html", { waitUntil: "load", timeout: 30000 });
      await page.evaluate(() => document.querySelector('a[href*="buy.stripe.com"]').click());
      await sleep(300);
      const blocked = hits.length === 0;
      await page.mouse.move(400, 400);
      await page.mouse.wheel(0, 800);
      await page.waitForFunction(() => window.__SIA21_ENGAGED === true);
      const remain = await page.evaluate(() => Math.max(0, window.__SIA21_CHECKOUT_MIN_MS - (Date.now() - window.__SIA21_PAGE_AT) + 80));
      await sleep(remain);
      await page.click('a[href*="buy.stripe.com"]');
      await sleep(500);
      report(
        "obrigado upsell waits for a prior signal, then a scroll and click goes through",
        blocked && hits.length > 0,
        "afterBot=" + (blocked ? 0 : hits.length) + " afterHuman=" + hits.length
      );
      await context.close();
    }

    {
      const context = await browser.newContext({ userAgent: HUMAN_UA, viewport: { width: 1280, height: 800 } });
      await arm(context, "visible");
      const hits = await trackStripe(context);
      const page = await context.newPage();
      const requests = watch(page);
      const response = await page.goto(ORIGIN + "/ghl-agencias/index.html", { waitUntil: "load", timeout: 30000 });
      if (!response || response.status() === 404) {
        report("ghl stripe gate", false, "ghl-agencias/index.html missing");
      } else {
        await page.evaluate(() => {
          var link = document.createElement("a");
          link.id = "ghl-stripe-test";
          link.href = "https://buy.stripe.com/test_ghl_497";
          link.target = "_blank";
          link.textContent = "Pagar 497";
          document.body.appendChild(link);
          link.click();
        });
        await sleep(400);
        const blockedEvents = checkoutNoise(requests);
        const blockedNav = hits.length === 0;
        await page.mouse.move(420, 320);
        await page.mouse.wheel(0, 1600);
        await page.waitForFunction(() => window.__SIA21_ENGAGED === true && window.scrollY > 80);
        const remain = await page.evaluate(() => Math.max(0, window.__SIA21_CHECKOUT_MIN_MS - (Date.now() - window.__SIA21_PAGE_AT) + 80));
        await sleep(remain);
        await page.click("#ghl-stripe-test");
        const sent = await waitUntil(() => hits.length > 0 && requests.some((r) => hasPosthogEvent(r, "stripe_checkout_click")), 8000);
        report(
          "ghl checkout link ignores a bare click and opens after scroll",
          blockedNav && blockedEvents.length === 0 && sent,
          "blockedNav=" + blockedNav + " blockedEvents=" + blockedEvents.length + " sent=" + sent + " stripeNav=" + hits.length
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  }

  console.log(JSON.stringify({ failed, results }, null, 2));
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
