# SIA21 Landing

Public landing page for SIA21 (Sistema IA Consultor 21 Dias). CTAs will use Stripe Payment Links.

## Regra anti-bots (obrigatória em todas as páginas)

Toda a landing deste repositório carrega `assets/human-gate.js` no `<head>`, antes do PostHog. O Meta Pixel `1506988540335331` e o resto do tracking só disparam depois de um sinal humano. A excepção são as páginas de obrigado, que disparam logo.

Sinais que abrem o gate (`window.__SIA21_HUMAN`, `SIA21_onHuman(cb)` e o evento `sia21:human`):

- scroll maior que 80px
- clique, tecla, toque ou wheel
- mais de 3 movimentos do rato
- 6 segundos acumulados com o separador visível (`document.visibilityState === "visible"`). O relógio pausa quando o separador fica oculto. Não corre em browsers automatizados (`navigator.webdriver === true`): um headless parado não conta como pessoa. Um scroll ou clique nesse browser continua a contar.

`INSTANT_PATHS`: `/obrigado.html`, `/obrigado`, `/ghl-agencias/obrigado.html` (o match é `pathname.indexOf`, por isso também apanha prefixos como `/sia21-landing/obrigado.html`). Nessas páginas o gate abre de imediato. O evento Purchase continua imediato no `onInit` do pixel e não espera por mais nada.

O consentimento de cookies (`4i_cookie_consent_v1 === "accepted"`) continua a ser a porta de fora do Pixel. O gate humano arranca sempre, mesmo sem consentimento. Sem sinal humano não há PageView, ViewContent, InitiateCheckout, Lead, Schedule, nem eventos PostHog.

PostHog inicia com `capture_pageview: false`, `autocapture: false` e `disable_session_recording: true` (`capture_pageleave` e heatmaps também ficam desligados até ao sinal). `SIA21_armTracking()` faz `posthog.capture('$pageview')`, liga o autocapture e começa a gravação de sessão.

Eventos custom (`stripe_checkout_click`, `calendar_cta_click`, `exit_offer_*`, `last_offer_*`) entram por `SIA21_capturePh` / `SIA21_captureWhenHuman`, que os guarda até ao sinal humano e os descarta no `pagehide` se o sinal não chegou.

Popups de saída (`exit_offer_*`, `last_offer_*`) não aparecem e não disparam eventos sem um sinal **anterior** ao gesto de saída: scroll acima de 80px, mais de 3 movimentos do rato, ou os 6 segundos com o separador visível. Um clique não chega. Com `navigator.webdriver === true` o popup nunca abre. A função é `SIA21_mayShowExit()`.

Links `buy.stripe.com` (€37, €33, €14 e upsells) só navegam quando, ao mesmo tempo, há um sinal humano anterior a esse clique (o próprio clique não conta), a página está aberta há pelo menos 1,5 s, e `navigator.webdriver === false`. Se falhar, o visitante fica na página, o clique faz scroll até ao CTA, e o clique seguinte já pode seguir quando o tempo e o webdriver o permitirem. Quem fez scroll e depois clica entra directo, sem segundo clique. `stripe_checkout_click` e `InitiateCheckout` seguem a mesma regra: não disparam no clique bloqueado. Nas páginas de obrigado o Purchase continua imediato; os upsells seguem esta regra de checkout.

Página nova: copiar `templates/landing-template.html` e seguir `CHECKLIST-NOVA-PAGINA.md`. `bash scripts/check-antibot.sh` falha se algum `.html` fora de `templates/` não carregar `human-gate.js`.