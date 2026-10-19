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

`assets/sia21-capi.js` appends `client_reference_id` to every anchor whose `href` starts with `https://buy.stripe.com/`. `SIA21_decorateStripeLinks` fills the anchors already in the page. A `MutationObserver` fills anchors inserted later. A new Payment Link, including a future A/B test at €27, needs no code change.

That includes:

- all 12 live landing pages below: the Core Payment Link (€37), and the exit offers at €33 and €14 when those links are added
- the older `angles/` pages that still publish the Core link
- the storytelling rewrite of these pages, and the preview at `/v3/storytelling/`. They use the same Payment Links. The helper does not depend on the page template
- `/obrigado.html`. That page loads `sia21-purchase.js`, not `sia21-conv.js`. Its post-purchase links are Kit Pro €97 (`https://buy.stripe.com/14A9AVgJz9Wve2zfmCgrS00`) and Kit Lite €47 (`https://buy.stripe.com/dRm00lbpf5Gf1fNb6mgrS01`)

`ghl-agencias` is excluded. The parameter is not added on that path.

Decorating a link does not fire Purchase and does not delay it. Purchase still fires only from `/obrigado.html`, in the pixel `onInit`, on the instant human-gate path.

The 12 live landing pages:

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

Core is `https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02`. Exit €33 is `https://buy.stripe.com/fZueVf1OFc4D7Eb1vMgrS04`. Exit €14 is `https://buy.stripe.com/6oU3cx3WN0lVbUr0rIgrS05`. Any other `https://buy.stripe.com/` link on these pages is included the same way, including one added after the page has loaded.

Consent is `localStorage['4i_cookie_consent_v1'] === 'accepted'`, from this visit or an earlier one. Consent decides which shape is written. It does not decide whether a reference is written.

```text
with consent:    c2_<pag>_<utm>_<fbpTs>_<fbpRand>_<fbcTs>_<fbclid>
without consent: c0_<pag>_<utm>
```

`c0_` has no fbp and no fbc. The `_fbc` cookie is still written only after consent.

`fbclid` is always the last field of `c2_`: everything after the sixth underscore, including further underscores. `pag` and `utm` are lowercase `[a-z0-9-]` only, so they never contain `_`. `c0_` has exactly three parts (`c0`, `pag`, `utm`).

| Piece | Source |
| --- | --- |
| `pag` | Short page code from the table below. `x` when the page has no code. |
| `utm` | `utm_content` from that page's query string, sanitized and cut to 12 characters. `x` when the query has no `utm_content`. |
| `fbpTs`, `fbpRand` | `_fbp` cookie `fb.1.<TS>.<RAND>`. Both parts are numeric. Only on `c2_`. |
| `fbcTs`, `fbclid` | `_fbc` cookie `fb.1.<TS>.<FBCLID>`. Only on `c2_`. |
| No `_fbp` yet | `0` and `0`: `c2_<pag>_<utm>_0_0_<fbcTs>_<fbclid>`. |
| No `_fbc` | `fbcTs` is `0` and `fbclid` is empty: `c2_<pag>_<utm>_<fbpTs>_<fbpRand>_0_`. |

`pag` and `utm` each allow only lowercase `[a-z0-9-]`, at most 12 characters. The only empty value is lowercase `x`. Uppercase `X` is never generated. A field that is not a lowercase code counts as `x`.

Page codes:

| Code | Path |
| --- | --- |
| `idx` | `/` and `/index.html` |
| `v4` | `/v4/` |
| `v3` | `/v3/storytelling/` |
| `a01` … `a10` | `/angles/01-…/` through `/angles/10-…/`. LP 06 is `a06`, not `v2-06`. |
| `v2-01` … `v2-10` | `/angles-v2/01-…/` through `/angles-v2/10-…/`. There is no `/angles-v2/06-…/`. |
| `v2-sob` | `/angles-v2/sobrecarga/` |
| `obg` | `/obrigado.html` |
| `x` | No page code. |

Any other path uses the last segment, lowercased, through the same 12-character shorten as `utm`.

### utm_content shortened to 12 characters

1. Lowercase the whole value. Case is folded before the hash, so `TESTE-06-CHATGPT-1018-V2-37A` and `teste-06-chatgpt-1018-v2-37a` are the same code.
2. Replace every character outside `[a-z0-9-]` with `-`. Do not delete characters.
3. If nothing remains, or the result is not `[a-z0-9-]{1,12}`, the code is `x`. Uppercase `X` is not a code: after the lowercase step it is `x`.
4. If the sanitized value is 12 characters or fewer, that value is the code.
5. If it is longer, the code is the first 5 characters plus 7 characters of base36. The 7 characters are the FNV-1a 32-bit hash of the whole sanitized string, unsigned, zero-padded. Offset basis `2166136261`, prime `16777619`. The hash is lowercase base36.

A 12-character prefix would collide for campaign names that share an opening. The hash is of the whole sanitized string, so these two do not:

| `utm_content` | code |
| --- | --- |
| `teste-06-chatgpt-1018-v2-37a` | `teste0k7xmj9` |
| `06-chatgpt-1019-v4` | `06-ch07rk8jc` |

`a_b` and `a-b` both become `a-b`. That is the same code on purpose: the underscore was not a legal character.

`utm_content` is also set as its own query parameter on the Payment Link when the raw value is `[A-Za-z0-9_-]` and at most 150 characters. Stripe Payment Links accept `utm_source`, `utm_content`, `utm_medium`, `utm_term`, and `utm_campaign`. An invalid value is not sent. Those UTM parameters are copied onto the post-payment redirect URL. They are not a field of the Checkout Session. The webhook reads `pag` and `utm` from `client_reference_id` on `checkout.session.completed`. See [Track a payment link](https://docs.stripe.com/payment-links/url-parameters).

If there is no `_fbc` cookie but the landing URL had `?fbclid=` and consent is on, the page builds the cookie itself. `TS` is the millisecond timestamp when that `fbclid` was first seen (navigation start on that document). The cookie is the first-party value `fb.1.<TS>.<FBCLID>`, `path=/`, `SameSite=Lax`, `Secure` on HTTPS, `Max-Age` 90 days, and no `Domain` attribute (host-only). It is written only after consent, including when consent was stored on an earlier visit. An existing `_fbc` is not replaced, so the original timestamp survives navigation.

An `fbclid` with any character outside `[A-Za-z0-9_-]` is not put in the cookie and not put in the value. The id is not rewritten (dots, slashes, spaces, and similar all drop the fbc).

If the full `c2_` value is longer than 200 characters, the fbc is dropped and pag, utm and the fbp stay: `c2_<pag>_<utm>_<fbpTs>_<fbpRand>_0_`. The `fbclid` is never truncated. 200 characters is still sent. Stripe stores at most 200 characters on `client_reference_id`.

### Parsing

New checkouts are `c2_` or `c0_`. A `c1_` value already stored is a different shape. Do not run the `c2_` cut on it. `SIA21_parseClientReference` still accepts `c1_` with the parser already in this file. That parser is not the one to change.

For `c2_`, cut on the first six underscores. The seventh piece is the fbclid, rejoined if it contained underscores. Do not use JavaScript `String.split('_', 6)`. That limit drops the remainder.

A `pag` or `utm` that is not `[a-z0-9-]{1,12}` counts as `x`. That includes an empty field, any uppercase letter, and uppercase `X`. Only a field whose whole value is lowercase `x` was stored as empty. An invalid field is read the same way.

`c0_` must have exactly three parts. `value.split('_')` has length 3, and the first part is `c0`. Any other count does not parse. `pag` and `utm` contain no `_`, so a generated `c0_` cannot grow a fourth part.

```js
function asSlot(value) {
  return /^[a-z0-9-]{1,12}$/.test(value) ? value : "x";
}
var c2 = /^c2_([^_]*)_([^_]*)_(\d+)_(\d+)_(\d+)_(.*)$/.exec(value);
var pag = asSlot(c2[1]);
var utm = asSlot(c2[2]);
var fbpTs = c2[3];
var fbpRand = c2[4];
var fbcTs = c2[5];
var fbclid = c2[6];
```

```js
var parts = value.split("_");
if (parts.length !== 3 || parts[0] !== "c0") {
  // not a c0 value
} else {
  var pag = asSlot(parts[1]);
  var utm = asSlot(parts[2]);
}
```

Examples, with `_fbp` `fb.1.1711111111111.2222222222` and no `_fbc`:

```text
c2_a06_teste0k7xmj9_1711111111111_2222222222_0_
c2_v4_06-ch07rk8jc_1711111111111_2222222222_0_
c0_a06_teste0k7xmj9
c0_v4_06-ch07rk8jc
```

The first is LP 06 (`/angles/06-chatgpt-falhou/`) with consent and `utm_content=teste-06-chatgpt-1018-v2-37a`. The second is `/v4/` with consent and `utm_content=06-chatgpt-1019-v4`. The last two are the same pages without consent. The two utm codes differ.

`c2_v2-01_x_0_0_1700000000000_abc_D-1` is page `v2-01`, utm `x`, no fbp, fbcTs `1700000000000`, fbclid `abc_D-1`.

Python `str.split('_', 6)` keeps the fbclid remainder. JavaScript `split` with a limit does not.

The helper reads the current `href`, copies it with `URL`, and sets the parameter with `URLSearchParams`. Only an href that already starts with `https://buy.stripe.com/` is changed. Query parameters already on the Payment Link stay in place. The allowed checkout click calls the same helper again before the double-tap lock records the href, so a Meta cookie that appears after the first paint is included, and a second tap on that same link is still the same checkout.
