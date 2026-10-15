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

PostHog e o Pixel só arrancam no host de produção `4improvementsportugal-ops.github.io`. Noutro host (localhost, `127.0.0.1`, previews) não há `posthog.init`, nem `array.js`, nem `fbevents.js`. O snippet da página não chama `posthog.init`: chama `SIA21_bootPosthog()` dentro de `SIA21_onHuman`, portanto também só depois do sinal humano. `SIA21_bootPosthog()` inicia com `capture_pageview: false`, `autocapture: false` e `disable_session_recording: true` (`capture_pageleave` e heatmaps também ficam desligados até ao sinal). `SIA21_armTracking()` faz `posthog.capture('$pageview', {}, { timestamp })` com o instante real de abertura da página (`performance.timeOrigin`), liga o autocapture e começa a gravação de sessão. O `$pageleave` sai no `pagehide`, no `freeze` e quando `visibilitychange` passa a `hidden`, com `transport: 'sendBeacon'`. Leva `$prev_pageview_duration` desde essa abertura e `$prev_pageview_max_scroll_percentage` medido por nós (fracção de 0 a 1, como o posthog-js). Sem o flush no `visibilitychange`, o browser in-app do Facebook e do Instagram fecha a webview sem `pagehide` e cerca de um terço das sessões ficava sem saída.

`?qa=1` grava `localStorage.sia21_qa_v1 = "1"` e `localStorage.sia21_internal_v1 = "1"` e desliga a captura nesse browser até `?qa=0`. Não chega a haver pedido ao PostHog nem ao Meta, por isso a pessoa não entra no projecto de produção. A flag `sia21_internal_v1` é a marca de interno para os próximos agentes: com ela activa, `SIA21_allowCapture()` é falso. Usa isto nas corridas de QA em vez de deixar o Playwright falar com `eu.i.posthog.com`.

A profundidade de scroll não fica a cargo do scroll manager do PostHog. Esse manager só ouve `window` scroll e, em vários webviews móveis, `scrollY` permanece 0 (a percentagem de conteúdo fica no primeiro ecrã) mesmo com dezenas ou centenas de segundos na página. `sia21_scroll` dispara aos 25, 50, 75 e 100, atrás do mesmo gate humano, com `path` e `sections` (ids de `section[id]` já visíveis; lista vazia se a página não tiver ids). A medição usa o scroll do documento, `visualViewport`, sentinelas com IntersectionObserver e o elemento no centro do ecrã.

Eventos custom (`stripe_checkout_click`, `calendar_cta_click`, `exit_offer_*`, `last_offer_*`) entram por `SIA21_capturePh` / `SIA21_captureWhenHuman`, que os guarda até ao sinal humano e os descarta no `pagehide` se o sinal não chegou.

Popups de saída (`exit_offer_*`, `last_offer_*`) não aparecem e não disparam eventos sem um sinal **anterior** ao gesto de saída: scroll acima de 80px, mais de 3 movimentos do rato, ou os 6 segundos com o separador visível. Um clique não chega. Com `navigator.webdriver === true` o popup nunca abre. A função é `SIA21_mayShowExit()`.

Links `buy.stripe.com` (€37, €33, €14 e upsells) só navegam quando, ao mesmo tempo, há um sinal humano anterior a esse clique (o próprio clique não conta), a página está aberta há pelo menos 1,5 s, e `navigator.webdriver === false`. Se falhar, o visitante fica na página, o clique faz scroll até ao CTA, e o clique seguinte já pode seguir quando o tempo e o webdriver o permitirem. Quem fez scroll e depois clica entra directo, sem segundo clique. `stripe_checkout_click` e `InitiateCheckout` seguem a mesma regra: não disparam no clique bloqueado. Nas páginas de obrigado o Purchase continua imediato; os upsells seguem esta regra de checkout.

Os links de pagamento abrem com `target="_blank"`. No Safari, no Chrome e no browser in-app do Facebook ou do Instagram isso muitas vezes não descarrega esta página: o Checkout abre noutra tab, numa custom tab, ou por cima da webview. `pageshow` / bfcache não disparam no regresso, e um `mousemove` para desbloquear a oferta também não existe no telemóvel. Por isso a oferta de saída abre quando a pessoa volta sem pagar: a página ficou `hidden` ou sem foco durante pelo menos 400 ms (ou houve `pagehide` / `freeze`) e depois volta a estar visível, ou um load novo ainda tem `sia21_stripe_left_at_v1` com `sia21_stripe_away_v1`. A primeira volta mostra €33. €14 só se o €33 já tiver sido dispensado. A volta não conta como dispensa. Com `navigator.webdriver === true` o popup continua fechado.

Página nova: copiar `templates/landing-template.html` e seguir `CHECKLIST-NOVA-PAGINA.md`. `bash scripts/check-antibot.sh` falha se algum `.html` fora de `templates/` não carregar `human-gate.js`.