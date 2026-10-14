# Checklist de página nova

Copia `templates/landing-template.html` e ajusta o caminho relativo de `assets/` à pasta onde a página fica. Não publiques uma landing sem estes pontos.

- [ ] `<script src="…/assets/human-gate.js"></script>` no `<head>`, **antes** do snippet do PostHog.
- [ ] PostHog inicia com `capture_pageview: false`, `autocapture: false` e `disable_session_recording: true`.
- [ ] Logo a seguir ao `posthog.init`, chamar `SIA21_armTracking()` (é isso que faz `$pageview`, autocapture e session recording **depois** do sinal humano).
- [ ] Pixel Meta `1506988540335331` só através de `SIA21_startHumanGatedPixel`, e só quando `4i_cookie_consent_v1 === "accepted"`. Sem snippet base do Meta e sem `fbq('track','PageView')` solto.
- [ ] `instantPaths` inclui `/obrigado.html`, `/obrigado` e `/ghl-agencias/obrigado.html`.
- [ ] ViewContent, InitiateCheckout, Lead e Schedule só com `window.__SIA21_HUMAN` (e, no pixel, `window.__SIA21_MTHD_STARTED`). Nas páginas de obrigado o Purchase continua imediato no `onInit`.
- [ ] Eventos PostHog (`stripe_checkout_click`, `calendar_cta_click`, `exit_offer_*`, `last_offer_*` e os outros) passam por `SIA21_capturePh` / `SIA21_captureWhenHuman` ou por `SIA21_onHuman`. Não chames `posthog.capture` directo.
- [ ] Página de obrigado (`/obrigado.html`, `/obrigado`, `/ghl-agencias/obrigado.html`) está em `INSTANT_PATHS` dentro de `assets/human-gate.js`, para o gate abrir logo. O Purchase não espera por scroll.
- [ ] `bash scripts/check-antibot.sh` passa. O check falha se algum `.html` fora de `templates/` não carregar `human-gate.js`.
