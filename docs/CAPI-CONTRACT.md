# Meta Conversions API browser contract

The landing page and the Stripe webhook dedupe the same purchase and share the Meta click ids. This is the browser side. Nothing here changes prices, Payment Link ids, consent, the human gate, or the production-only guard.

## Purchase

Purchase fires only from `/obrigado.html`. `SIA21_firePurchaseOnce` in `assets/sia21-purchase.js` is the only `fbq('track', 'Purchase')`. It does not fire on the landing pages, and it does not fire on `ghl-agencias`.

```js
fbq('track', 'Purchase', {
  value: value,
  currency: 'EUR',
  content_name: 'Sistema IA Consultor 21 Dias',
  content_ids: contentIds,
  content_type: 'product'
}, { eventID: sessionId })
```

`sessionId` is the live Checkout Session id from the URL (`session_id`, and the same fallbacks the page already accepts). It must match `cs_live_` plus letters and digits. The Pixel sends it once per id. The id is stored before the request (`sia21_purchase_v1_<id>` in `localStorage` and `sessionStorage`, plus `sia21_purchase_fired_<id>`). A reload, the back button, or a second call does not send it again.

If `session_id` is missing, or it is not a live id (`cs_test_`, or any other non-`cs_live_` value), there is no Purchase. That rule is unchanged.

The webhook sends the same purchase with `event_name = Purchase` and `event_id = session.id` (the Checkout Session id, `cs_live_...`). The browser `eventID` and the webhook `event_id` are that same id.

## client_reference_id

`client_reference_id` is added to every `buy.stripe.com` click on all 12 live landing pages, once cookie consent is accepted. On each page that includes the Core Payment Link (€37), the exit offer at €33, and the exit offer at €14:

| LP | Path |
| --- | --- |
| Home | `/` (`index.html`) |
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

Core is `https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02`. Exit €33 is `https://buy.stripe.com/fZueVf1OFc4D7Eb1vMgrS04`. Exit €14 is `https://buy.stripe.com/6oU3cx3WN0lVbUr0rIgrS05`. Any other `buy.stripe.com` click on these 12 pages is included the same way.

Consent is `localStorage['4i_cookie_consent_v1'] === 'accepted'`, from this visit or an earlier one.

If consent is missing or rejected, the parameter is not added.

The value uses only `[A-Za-z0-9_-]`:

```text
c1_<fbpTs>_<fbpRand>_<fbcTs>_<fbclid>
```

| Piece | Source |
| --- | --- |
| `fbpTs`, `fbpRand` | `_fbp` cookie `fb.1.<TS>.<RAND>`. Both parts are numeric. |
| `fbcTs`, `fbclid` | `_fbc` cookie `fb.1.<TS>.<FBCLID>`. |
| No `_fbp` yet | `0` and `0`, for example `c1_0_0_<fbcTs>_<fbclid>`. |
| No `_fbc` | `fbcTs` is `0` and `fbclid` is empty: `c1_<fbpTs>_<fbpRand>_0_`. |

If there is no `_fbc` cookie but the landing URL had `?fbclid=` and consent is on, the page builds the cookie itself. `TS` is the millisecond timestamp when that `fbclid` was first seen (navigation start on that document). The cookie is the first-party value `fb.1.<TS>.<FBCLID>`, `path=/`, `SameSite=Lax`, `Secure` on HTTPS, `Max-Age` 90 days, and no `Domain` attribute (host-only). It is written only after consent, including when consent was stored on an earlier visit. An existing `_fbc` is not replaced, so the original timestamp survives navigation.

An `fbclid` with any character outside `[A-Za-z0-9_-]` is not put in the cookie and not put in the value. The id is not rewritten (dots, slashes, spaces, and similar all drop the fbc).

If the full value is longer than 200 characters, the fbc is dropped and the fbp is kept (`c1_<fbpTs>_<fbpRand>_0_`). The `fbclid` is never truncated. 200 characters is still sent. Stripe stores at most 200 characters on `client_reference_id`.

### Parsing

The value has 5 parts. The first four are fixed. The fbclid is the whole remainder after the 4th underscore. If that fbclid contains underscores, they stay inside it. Rejoin every field from index 4 onward. Do not treat those underscores as more fields.

| Index | Field |
| --- | --- |
| 0 | `c1` |
| 1 | `_fbp` creation time, or `0` |
| 2 | `_fbp` random, or `0` |
| 3 | `_fbc` creation time, or `0` |
| 4+ | `fbclid`, or empty. The whole remainder, rejoined with `_`. |

Do not use JavaScript `String.split('_', 4)`. That limit truncates the array to 4 elements and discards the rest. It does not keep the remainder. `String.split('_', 5)` truncates the same way as soon as the fbclid itself contains an underscore.

```js
'c1_1711111111111_2222222222_1700000000000_abc_D-1'.split('_', 4)
// ['c1', '1711111111111', '2222222222', '1700000000000']
// the fbclid 'abc_D-1' is gone
```

Split with no limit and rejoin from index 4, or match the remainder with a regex:

```js
var parts = value.split('_');
var fbpTs = parts[1];
var fbpRand = parts[2];
var fbcTs = parts[3];
var fbclid = parts.slice(4).join('_'); // remainder after the 4th underscore
```

```js
var match = /^c1_(\d+)_(\d+)_(\d+)_(.*)$/.exec(value);
// match[1] fbpTs, match[2] fbpRand, match[3] fbcTs, match[4] fbclid
```

`c1_1711111111111_2222222222_1700000000000_abc_D-1` parses as fbpTs `1711111111111`, fbpRand `2222222222`, fbcTs `1700000000000`, fbclid `abc_D-1`.

`c1_1711111111111_2222222222_0_` parses as fbpTs `1711111111111`, fbpRand `2222222222`, fbcTs `0`, fbclid `''`.

Python `str.split('_', 4)` is a different function: its maxsplit keeps the remainder as the fifth field. That happens to be the right cut. It is not what JavaScript's `split` does.

The click handler reads the current `href`, copies it with `URL`, and sets the parameter with `URLSearchParams`. Query parameters already on the Payment Link stay in place. The href is updated before the double-tap lock records it, so a second tap on that same link is still the same checkout.
