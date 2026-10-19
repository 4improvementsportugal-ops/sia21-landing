import { test, expect } from "@playwright/test";

async function htmlOf(page) {
  return page.content();
}

test("versão A, IA para a equipa", async ({ page }) => {
  const fonts = [];
  page.on("response", (response) => {
    if (response.url().includes("/ghl-agencias/fonts/") && response.url().endsWith(".woff2")) {
      fonts.push(response.status());
    }
  });
  await page.goto("/ghl-agencias/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator("html")).toHaveAttribute("data-versao", "ia-equipa");
  await expect(page.locator("#ck")).toBeVisible();
  await expect(page.locator("body")).toContainText("497 €");
  await expect(page.locator("body")).toContainText("97 €/mês");
  await expect(page.locator("body")).toContainText("Quero explorar as minhas opções deste sistema");
  const html = await htmlOf(page);
  expect(html.indexOf("human-gate.js")).toBeGreaterThan(-1);
  expect(html.indexOf("human-gate.js")).toBeLessThan(html.indexOf("posthog.init"));
  expect(html).toContain('versao:"ia-equipa"');
  expect(html).toContain("capture_pageview:false");
  expect(html).not.toContain("fonts.googleapis");
  expect(html).not.toContain("cdn.tailwindcss");
  await expect(page.locator('a[href*="buy.stripe.com"]')).toHaveCount(0);
  expect(fonts.some((status) => status === 200)).toBe(true);
});

test("versão B, recrutamento", async ({ page }) => {
  await page.goto("/ghl-agencias/recrutamento/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator("html")).toHaveAttribute("data-versao", "recrutamento");
  await expect(page.locator("#ck")).toBeVisible();
  const body = page.locator("body");
  await expect(body).toContainText("O teu funil de recrutamento a trabalhar sozinho.");
  await expect(body).toContainText("Página de candidatura");
  await expect(body).toContainText("Pipeline de candidatos");
  await expect(body).toContainText("Follow-up automático por WhatsApp e e-mail");
  await expect(body).toContainText("Marcação de entrevista");
  await expect(body).toContainText("Sequência de integração dos primeiros 30 dias do recruta");
  await expect(body).toContainText("497 € de setup");
  await expect(body).toContainText("97 €/mês");
  await expect(body).toContainText("Call de enquadramento, sem compromisso");
  await expect(body).toContainText("cerca de 2 300 consultores");
  await expect(body).toContainText("Diário Imobiliário, 16/07/2026");
  await expect(body).toContainText("Mais de 1000 compras em ofertas semelhantes da 4Improvements.");
  await expect(body).toContainText("Os nomes são fictícios.");
  const html = await htmlOf(page);
  expect(html.indexOf("human-gate.js")).toBeLessThan(html.indexOf("posthog.init"));
  expect(html).toContain('versao:"recrutamento"');
  expect(html).toContain("capture_pageview:false");
  expect(html).toContain("../../assets/human-gate.js");
  expect(html.toLowerCase()).not.toContain("garantia");
  expect(html.toLowerCase()).not.toContain("reembolso");
  expect(html).not.toContain("—");
  expect(html).not.toContain("–");
  expect(html).not.toContain("fonts.googleapis");
  await expect(page.locator('a[href*="buy.stripe.com"]')).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem("4i_cookie_consent_v1", "rejected"));
  await page.reload();
  await expect(page.locator("#ck")).toBeHidden();
  await page.locator("#hero-cta-btn").click();
  await expect(page.locator("#calendario")).toBeInViewport();
  await page.locator("[data-ck-open]").click();
  await expect(page.locator("#ck")).toBeVisible();
});
