# SIA21 Landing

Public landing page for SIA21 (Sistema IA Consultor 21 Dias). CTAs will use Stripe Payment Links.

## Ângulos

As landings em `angles/` continuam a ser o destino dos anúncios atuais. O redesenho está em `angles-v2/`, mais `/angles/06-chatgpt-falhou/`.

| Ângulo | Caminho |
| --- | --- |
| Tempo | `/angles-v2/01-tempo/` |
| RGPD | `/angles-v2/02-rgpd/` |
| Idealista | `/angles-v2/03-idealista/` |
| WhatsApp | `/angles-v2/04-whatsapp/` |
| Angariação | `/angles-v2/05-angariacao/` |
| ChatGPT | `/angles/06-chatgpt-falhou/` |
| Método 21 dias | `/angles-v2/07-metodo-21-dias/` |
| Solo | `/angles-v2/08-solo-escala/` |
| Early €37 | `/angles-v2/09-early-37/` |
| Visitas | `/angles-v2/10-visitas-ops/` |
| Sobrecarga | `/angles-v2/sobrecarga/` |

Lista navegável: `angles-v2/index.html` e `angles/index.html`.

## Regra anti-bots (obrigatória em todas as páginas)

Toda a landing deste repositório carrega `assets/human-gate.js` no `<head>`, antes do PostHog. O Meta Pixel `1506988540335331` e o resto do tracking só disparam depois de um sinal humano. A excepção são as páginas de obrigado, que disparam logo.

Sinais que abrem o gate (`window.__SIA21_HUMAN`, `SIA21_onHuman(cb)` e o evento `sia21:human`):

- scroll maior que 80px
- clique, tecla, toque ou wheel
- mais de 3 movimentos do rato
- 6 segundos acumulados com o separador visível (`document.visibilityState === "visible"`). O relógio pausa quando o separador fica oculto. Não corre em browsers automatizados (`navigator.webdriver === true`): um headless parado não conta como pessoa. Um scroll ou clique nesse browser continua a abrir o gate humano. O pixel e o PostHog ficam na mesma desligados, porque `SIA21_trackingSuppressed()` é verdadeiro.

`INSTANT_PATHS`: `/obrigado.html`, `/obrigado`, `/ghl-agencias/obrigado.html` (o match é `pathname.indexOf`, por isso também apanha prefixos como `/sia21-landing/obrigado.html`). Nessas páginas o gate abre de imediato. O PageView do pixel continua imediato para um visitante real. O Purchase só dispara com um `session_id` de checkout live (`cs_live_…`), sem supressão de QA, e uma vez por sessão.

Antes de inserir `fbevents.js` e outra vez imediatamente antes de `fbq('init')`, `assets/mthd-pixel.js` faz `fbq('set','autoConfig',false)` e `fbq('set','smartSetup',false)`, com o id do pixel e sem id. A chamada sem id é a que põe `disableAutoConfig` a verdadeiro. O listener de cliques inferidos da Meta (o que pode contar «Comprar agora» como Purchase) sai logo quando essa flag está ligada. O opt-out só com id, que já existia, não a liga. Qualquer `fbq('track','Purchase')` fora de `SIA21_firePurchaseOnce` é descartado pelo stub (`__SIA21_PURCHASE_ALLOW`).

O consentimento de cookies (`4i_cookie_consent_v1 === "accepted"`) continua a ser a porta de fora do Pixel. O gate humano arranca sempre, mesmo sem consentimento. Sem sinal humano não há PageView, ViewContent, InitiateCheckout, Lead, Schedule, nem eventos PostHog.

PostHog e o Pixel só arrancam no host de produção `4improvementsportugal-ops.github.io`. Noutro host (localhost, `127.0.0.1`, previews) não há `posthog.init`, nem `array.js`, nem `fbevents.js`. O snippet da página não chama `posthog.init`: chama `SIA21_bootPosthog()` dentro de `SIA21_onHuman`, portanto também só depois do sinal humano. `SIA21_bootPosthog()` inicia com `capture_pageview: false`, `autocapture: false` e `disable_session_recording: true` (`capture_pageleave` e heatmaps também ficam desligados até ao sinal). `SIA21_armTracking()` faz `posthog.capture('$pageview', {}, { timestamp })` com o instante real de abertura da página (`performance.timeOrigin`), liga o autocapture e começa a gravação de sessão. O `$pageleave` sai no `pagehide`, no `freeze` e quando `visibilitychange` passa a `hidden`, com `transport: 'sendBeacon'`. Leva `$prev_pageview_duration` desde essa abertura e `$prev_pageview_max_scroll_percentage` medido por nós (fracção de 0 a 1, como o posthog-js). Sem o flush no `visibilitychange`, o browser in-app do Facebook e do Instagram fecha a webview sem `pagehide` e cerca de um terço das sessões ficava sem saída.

`SIA21_trackingSuppressed()` (em `assets/human-gate.js`) é a verificação única usada pelo gate, por `assets/sia21-conv.js`, por `assets/sia21-purchase.js`, por `assets/mthd-pixel.js` e pelo pixel inline de cada página. Com ela activa não se carrega `fbevents.js` e não se chama `fbq` nem `posthog.capture`, em qualquer página, incluindo `obrigado.html`.

A supressão é verdadeira quando:

- o URL tem `?qa=1`, `?test=1` ou `?debug=1` (`?sia21_debug=1` não conta: só encurta os timers dos popups de saída)
- `localStorage` ou `sessionStorage` tem `sia21_qa=1` (ou a chave antiga `sia21_qa_v1`). Ver `qa=1` grava `sia21_qa` nos dois storages, mais `sia21_qa_v1` e `sia21_internal_v1`, para o silêncio acompanhar a navegação (landing para `obrigado`) mesmo que a página seguinte não traga a query. `?qa=0` limpa essas chaves
- `navigator.webdriver === true`
- o user agent contém `HeadlessChrome`, `Headless`, `Playwright`, `Puppeteer`, `Lighthouse`, `bot`, `crawler` ou `spider`
- há outro sinal claro de automação (Phantom, Nightmare, Cypress, Selenium, `domAutomation`)

O URL de opt-out chega para suprimir mesmo que o storage falhe. Usa `?qa=1` nas corridas de QA e nos screenshots. Não chega a haver pedido ao PostHog nem ao Meta.

A profundidade de scroll não fica a cargo do scroll manager do PostHog. Esse manager só ouve `window` scroll e, em vários webviews móveis, `scrollY` permanece 0 (a percentagem de conteúdo fica no primeiro ecrã) mesmo com dezenas ou centenas de segundos na página. `sia21_scroll` dispara aos 25, 50, 75 e 100, atrás do mesmo gate humano, com `path` e `sections` (ids de `section[id]` já visíveis; lista vazia se a página não tiver ids). A percentagem é a distância percorrida a dividir pelo intervalo rolável (`scrollHeight` menos a altura visível), incluindo um contentor interno do tamanho do ecrã e o deslocamento visual do conteúdo quando `scrollY` fica preso a 0. Um documento que ainda cabe no primeiro ecrã não conta como 100.

Eventos custom (`stripe_checkout_click`, `calendar_cta_click`, `exit_offer_*`, `last_offer_*`) entram por `SIA21_capturePh` / `SIA21_captureWhenHuman`, que os guarda até ao sinal humano e os descarta no `pagehide` se o sinal não chegou.

Popups de saída (`exit_offer_*`, `last_offer_*`) não aparecem e não disparam eventos sem um sinal **anterior** ao gesto de saída: scroll acima de 80px, mais de 3 movimentos do rato, ou os 6 segundos com o separador visível. Um clique não chega. Com `navigator.webdriver === true` o popup nunca abre. A função é `SIA21_mayShowExit()`.

Links `buy.stripe.com` (€37, €33, €14, barra sticky e upsells) só navegam quando, ao mesmo tempo, há engagement anterior (scroll, rato, dwell, ou um clique de checkout já bloqueado), a página está aberta há pelo menos 1,5 s, e `navigator.webdriver === false`. O clique permitido conta como sinal humano: abre o gate e dispara `InitiateCheckout` nesse clique, mesmo que o gate ainda estivesse fechado. A navegação espera o `fbevents.js` aceitar o comando e cerca de 300 ms (tecto cerca de 1,2 s) para o pedido sair antes de um webview in-app descarregar a página. Sem consentimento de cookies o pixel não dispara e a saída é no turno seguinte. Se a regra falhar, o visitante fica na página, o clique faz scroll até ao CTA, e o clique seguinte já pode seguir. `stripe_checkout_click` e `InitiateCheckout` não disparam nesse clique bloqueado. Nas páginas de obrigado o PageView continua imediato para um visitante real. O Purchase só sai com `session_id` `cs_live_`, sem a supressão acima, e uma vez por esse id (`localStorage` e `sessionStorage`, `eventID` igual ao `session_id`). Uma visita sem esse id não dispara Purchase. Os upsells seguem a regra de checkout.

Os links de pagamento abrem com `target="_blank"`. No Safari, no Chrome e no browser in-app do Facebook ou do Instagram isso muitas vezes não descarrega esta página: o Checkout abre noutra tab, numa custom tab, ou por cima da webview. `pageshow` / bfcache não disparam no regresso, e um `mousemove` para desbloquear a oferta também não existe no telemóvel. Por isso a oferta de saída abre quando a pessoa volta sem pagar: a página ficou `hidden` ou sem foco durante pelo menos 400 ms (ou houve `pagehide` / `freeze`) e depois volta a estar visível, ou um load novo ainda tem `sia21_stripe_left_at_v1` com `sia21_stripe_away_v1`. A primeira volta mostra €33. €14 só se o €33 já tiver sido dispensado. A volta não conta como dispensa. Com `navigator.webdriver === true` o popup continua fechado.

Página nova: copiar `templates/landing-template.html` e seguir `CHECKLIST-NOVA-PAGINA.md`. `bash scripts/check-antibot.sh` falha se algum `.html` fora de `templates/` não carregar `human-gate.js`.