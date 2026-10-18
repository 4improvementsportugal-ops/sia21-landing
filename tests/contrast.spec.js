const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const PROD = "https://4improvementsportugal-ops.github.io";
const LOCAL = "http://127.0.0.1:4173";
const TRUST = "Recebes o PDF por email, normalmente em menos de 30 minutos";
const TOOLS = "Funciona com o ChatGPT grátis ou com o Claude; os planos pagos são opcionais.";
const EARLY = "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02";

function landingPages() {
  const pages = ["index.html", "obrigado.html"];
  ["angles", "angles-v2"].forEach(function (dir) {
    fs.readdirSync(dir).forEach(function (name) {
      const file = path.join(dir, name, "index.html");
      if (fs.existsSync(file) && fs.statSync(file).isFile()) pages.push(path.posix.join(dir, name) + "/");
    });
  });
  return pages.sort();
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

function auditContrast() {
  function lin(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function lum(r, g, b) {
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function ratio(a, b) {
    var l1 = lum(a[0], a[1], a[2]);
    var l2 = lum(b[0], b[1], b[2]);
    var hi = Math.max(l1, l2);
    var lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function parseColor(input) {
    if (!input) return null;
    var m = String(input).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(",").map(function (n) { return parseFloat(n); });
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function hexes(image) {
    var found = [];
    if (!image || image === "none") return found;
    var re = /rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g;
    var m;
    while ((m = re.exec(image))) {
      var raw = m[0];
      if (raw.charAt(0) === "#") {
        var h = raw.slice(1);
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        if (h.length >= 6) found.push({ r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 });
      } else {
        var c = parseColor(raw);
        if (c && c.a > 0) found.push(c);
      }
    }
    return found;
  }
  function composite(fg, bg) {
    var a = fg.a == null ? 1 : fg.a;
    return [
      Math.round(fg.r * a + bg[0] * (1 - a)),
      Math.round(fg.g * a + bg[1] * (1 - a)),
      Math.round(fg.b * a + bg[2] * (1 - a))
    ];
  }
  function solidsBehind(el, skipSelf) {
    var node = skipSelf ? el.parentElement : el;
    var layers = [];
    var hops = 0;
    while (node && hops < 14) {
      var cs = getComputedStyle(node);
      var img = hexes(cs.backgroundImage);
      if (img.length) layers.push(img);
      var bg = parseColor(cs.backgroundColor);
      if (bg && bg.a > 0.04) {
        layers.push([bg]);
        if (bg.a >= 0.98 && !img.length) break;
      }
      node = node.parentElement;
      hops += 1;
    }
    if (!layers.length) return [[255, 255, 255]];
    var bases = [[255, 255, 255]];
    for (var i = layers.length - 1; i >= 0; i--) {
      var next = [];
      layers[i].forEach(function (c) {
        bases.forEach(function (base) { next.push(composite(c, base)); });
      });
      bases = next;
    }
    return bases;
  }
  function visible(el) {
    var cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  }
  var fails = [];
  document.querySelectorAll("h1,h2,h3,h4,p,a,button,li,span,b,strong,s,small").forEach(function (el) {
    if (!visible(el)) return;
    if (el.closest("#sia21-exit, .sia21-toast, #sia21-toast")) return;
    var own = "";
    el.childNodes.forEach(function (n) { if (n.nodeType === 3) own += n.textContent; });
    var text = own.replace(/\s+/g, " ").trim();
    if (text.length < 2) return;
    var cs = getComputedStyle(el);
    var clip = cs.webkitBackgroundClip || cs.backgroundClip;
    var fgs = [];
    var skipSelf = false;
    if (clip === "text") {
      hexes(cs.backgroundImage).forEach(function (c) { fgs.push([c.r, c.g, c.b]); });
      skipSelf = true;
    }
    if (!fgs.length) {
      var fg = parseColor(cs.color);
      if (!fg || fg.a === 0) return;
      fgs.push([fg.r, fg.g, fg.b]);
    }
    var size = parseFloat(cs.fontSize);
    var weight = parseInt(cs.fontWeight, 10) || 400;
    var large = size >= 24 || (size >= 18.66 && weight >= 700);
    var need = large ? 3 : 4.5;
    var bgs = solidsBehind(el, skipSelf);
    var worst = 99;
    fgs.forEach(function (f) {
      bgs.forEach(function (b) {
        var r = ratio(f, b);
        if (r < worst) worst = r;
      });
    });
    if (worst + 0.03 < need) {
      fails.push(text.slice(0, 70) + " " + Math.round(worst * 100) / 100 + "/" + need);
    }
  });
  var bands = [];
  document.querySelectorAll(".offer-page main > section").forEach(function (el) {
    var cs = getComputedStyle(el);
    var bg = parseColor(cs.backgroundColor);
    var imgs = hexes(cs.backgroundImage);
    var dark = false;
    if (bg && bg.a > 0.9 && lum(bg.r, bg.g, bg.b) < 0.18) dark = true;
    imgs.forEach(function (c) { if (lum(c.r, c.g, c.b) < 0.18) dark = true; });
    if (!dark) return;
    var rect = el.getBoundingClientRect();
    if (rect.width >= window.innerWidth - 2) return;
    var outside = document.elementFromPoint(Math.max(1, rect.left - 4), rect.top + Math.min(24, rect.height / 2));
    var paper = false;
    if (outside) {
      var obg = parseColor(getComputedStyle(outside).backgroundColor);
      if (obg && obg.a > 0.9 && lum(obg.r, obg.g, obg.b) > 0.85) paper = true;
      var body = parseColor(getComputedStyle(document.body).backgroundColor);
      if (body && lum(body.r, body.g, body.b) > 0.85) paper = true;
    }
    if (paper) bands.push(String(el.className).slice(0, 80) + " " + Math.round(rect.width) + "/" + window.innerWidth);
  });
  return { fails: fails.slice(0, 12), failCount: fails.length, bands: bands };
}

test.describe("checkout contrast", function () {
  test.beforeEach(async function ({ page }) {
    await page.route(PROD + "/**", proxyProd);
  });

  test("every landing page has the trust line, an equal cookie choice, the human gate and AA contrast", async function ({ page }) {
    test.setTimeout(240000);
    const pages = landingPages();
    expect(pages.length).toBe(22);
    const problems = [];
    for (var i = 0; i < pages.length; i++) {
      var rel = pages[i];
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(PROD + "/" + rel, { waitUntil: "load" });
      await page.waitForSelector("#ck:not([hidden])");
      await page.waitForFunction(function () {
        var h1 = document.querySelector("h1");
        return h1 && parseInt(getComputedStyle(h1).fontWeight, 10) >= 700;
      });
      var html = await page.content();
      if (html.indexOf("human-gate.js") === -1) problems.push(rel + " missing human gate");
      if (html.indexOf(TRUST) === -1) problems.push(rel + " missing trust line");
      if (html.indexOf(TOOLS) === -1) problems.push(rel + " missing ChatGPT line");
      if (rel.indexOf("obrigado") === -1 && html.indexOf(EARLY) === -1) problems.push(rel + " missing the €37 payment link");
      if (html.indexOf("€47") === -1 && rel.indexOf("obrigado") === -1) problems.push(rel + " missing the struck €47");
      var ui = await page.evaluate(function () {
        function box(el) {
          var r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        }
        var rej = document.querySelector("button[data-ck='rejected']");
        var acc = document.querySelector("button[data-ck='accepted']");
        var gate = typeof window.SIA21_onHuman === "function" && window.__SIA21_HUMAN_GATE_LOADED === true;
        var rs = getComputedStyle(rej);
        var as = getComputedStyle(acc);
        var rb = box(rej);
        var ab = box(acc);
        return {
          gate: gate,
          privacy: !!document.querySelector("#ck a[href*='privacidade']"),
          dw: Math.abs(rb.w - ab.w),
          dh: Math.abs(rb.h - ab.h),
          h: rb.h,
          same: rs.backgroundColor === as.backgroundColor && rs.color === as.color && rs.fontWeight === as.fontWeight
        };
      });
      if (!ui.gate) problems.push(rel + " human gate did not boot");
      if (!ui.privacy) problems.push(rel + " banner has no privacy link");
      if (ui.dw > 2 || ui.dh > 2 || ui.h < 44 || !ui.same) problems.push(rel + " cookie buttons are not equal");
      var mobile = await page.evaluate(auditContrast);
      mobile.fails.forEach(function (row) { problems.push(rel + " contrast " + row); });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(100);
      var desk = await page.evaluate(auditContrast);
      desk.fails.forEach(function (row) { problems.push(rel + " desktop contrast " + row); });
      desk.bands.forEach(function (row) { problems.push(rel + " beige gap " + row); });
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
