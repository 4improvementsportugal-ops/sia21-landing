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
const PORT = 9891;
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
      await page.evaluate(() => window.scrollTo(0, 400));
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
