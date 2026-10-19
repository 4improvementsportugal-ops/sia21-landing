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

`assets/sia21-capi.js` appends `client_reference_id` to every anchor whose `href` starts with `https://buy.stripe.com/`, once cookie consent is accepted. `SIA21_decorateStripeLinks` fills the anchors already in the page. A `MutationObserver` fills anchors inserted later. A new Payment Link, including a future A/B test at €27, needs no code change.

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

Consent is `localStorage['4i_cookie_consent_v1'] === 'accepted'`, from this visit or an earlier one.

If consent is missing or rejected, the parameter is not added.

The value uses only `[A-Za-z0-9_-]`:

```text
c1_<fbpTs>_<fbpRand>_<fbcTs>_<fbclid>_p-<page>_u-<utm>
```

`_u-<utm>` is omitted when the landing URL has no usable `utm_content`. `=` is not allowed, so the page and the utm are marked with `_p-` and `_u-`, not `p=` / `u=`.

| Piece | Source |
| --- | --- |
| `fbpTs`, `fbpRand` | `_fbp` cookie `fb.1.<TS>.<RAND>`. Both parts are numeric. |
| `fbcTs`, `fbclid` | `_fbc` cookie `fb.1.<TS>.<FBCLID>`. |
| No `_fbp` yet | `0` and `0`, for example `c1_0_0_<fbcTs>_<fbclid>_p-<page>`. |
| No `_fbc` | `fbcTs` is `0` and `fbclid` is empty: `c1_<fbpTs>_<fbpRand>_0__p-<page>`. The two underscores are the empty fbclid plus the `_p-` marker. |
| `page` | Short code for the page that built the link. Lowercase letters and digits only. |
| `utm` | `utm_content` from that page's query string, only when every character is `[A-Za-z0-9_-]` and the value is at most 150 characters. A dot, a space, or any other character drops the whole value. It is not rewritten. |

Page codes:

| Code | Path |
| --- | --- |
| `home` | `/` and `/index.html` |
| `v4` | `/v4/` |
| `v3` | `/v3/storytelling/` |
| `a01` … `a10` | `/angles/01-…/` through `/angles/10-…/`. LP 06 is `a06`. |
| `b01` … `b10` | `/angles-v2/01-…/` through `/angles-v2/10-…/` |
| `bsob` | `/angles-v2/sobrecarga/` |
| `obg` | `/obrigado.html` |

Any other path becomes up to 12 lowercase letters and digits from the path, or `unk`.

`utm_content` is also set as its own query parameter on the Payment Link, with the same safe value. Stripe Payment Links accept `utm_source`, `utm_content`, `utm_medium`, `utm_term`, and `utm_campaign`. Each value must be alphanumeric, dashes, or underscores, and at most 150 characters. An invalid value is dropped by Stripe and the payment page still opens. Those UTM parameters are copied onto the post-payment redirect URL. They are not a field of the Checkout Session. The webhook still reads the page and the utm from `client_reference_id` on `checkout.session.completed`. See [Track a payment link](https://docs.stripe.com/payment-links/url-parameters).

If there is no `_fbc` cookie but the landing URL had `?fbclid=` and consent is on, the page builds the cookie itself. `TS` is the millisecond timestamp when that `fbclid` was first seen (navigation start on that document). The cookie is the first-party value `fb.1.<TS>.<FBCLID>`, `path=/`, `SameSite=Lax`, `Secure` on HTTPS, `Max-Age` 90 days, and no `Domain` attribute (host-only). It is written only after consent, including when consent was stored on an earlier visit. An existing `_fbc` is not replaced, so the original timestamp survives navigation.

An `fbclid` with any character outside `[A-Za-z0-9_-]` is not put in the cookie and not put in the value. The id is not rewritten (dots, slashes, spaces, and similar all drop the fbc).

If the full value is longer than 200 characters, the utm suffix is dropped first and the page code stays. If it is still longer, the fbc is dropped and the fbp and the page code are kept (`c1_<fbpTs>_<fbpRand>_0__p-<page>`). The `fbclid` is never truncated. 200 characters is still sent. Stripe stores at most 200 characters on `client_reference_id`. When the utm is dropped from the reference because of that limit, the separate `utm_content` query parameter is still set if the value itself is within 150 characters.

### Parsing

The first four fields are fixed. The fbclid is the whole remainder after the 4th underscore, then a trailing `_p-<page>` and an optional `_u-<utm>` are removed from that remainder. If that fbclid contains underscores, they stay inside it. Rejoin every field from index 4 onward, then strip the suffix. Do not treat underscores inside the fbclid as more Meta fields.

A value written before this suffix (no `_p-` at the end) parses with the same five fields as before. `page` and `utm` are empty. That is the backwards-compatible case. New values keep those same four leading fields. The webhook must strip the suffix before it uses the fbclid. `String.split` alone leaves `_p-` and `_u-` inside the fbclid.

| Index | Field |
| --- | --- |
| 0 | `c1` |
| 1 | `_fbp` creation time, or `0` |
| 2 | `_fbp` random, or `0` |
| 3 | `_fbc` creation time, or `0` |
| 4+ | `fbclid`, then optional `_p-<page>` and `_u-<utm>`. Strip the suffix from the end. The fbclid is what remains, rejoined with `_`. |

Do not use JavaScript `String.split('_', 4)`. That limit truncates the array to 4 elements and discards the rest. It does not keep the remainder. `String.split('_', 5)` truncates the same way as soon as the fbclid itself contains an underscore.

```js
'c1_1711111111111_2222222222_1700000000000_abc_D-1'.split('_', 4)
// ['c1', '1711111111111', '2222222222', '1700000000000']
// the fbclid 'abc_D-1' is gone
```

Split with no limit and rejoin from index 4, or match the remainder with a regex:

```js
var match = /^c1_(\d+)_(\d+)_(\d+)_(.*)$/.exec(value);
var fbpTs = match[1];
var fbpRand = match[2];
var fbcTs = match[3];
var rest = match[4];
var page = '';
var utm = '';
var attr = /^(.*)_p-([a-z0-9]+)(?:_u-([A-Za-z0-9_-]+))?$/.exec(rest);
if (attr) {
  rest = attr[1];
  page = attr[2];
  utm = attr[3] || '';
}
var fbclid = rest;
```

The same function is `SIA21_parseClientReference` in `assets/sia21-capi.js`.

`c1_1711111111111_2222222222_1700000000000_abc_D-1` still parses as fbpTs `1711111111111`, fbpRand `2222222222`, fbcTs `1700000000000`, fbclid `abc_D-1`, page `''`, utm `''`.

`c1_1711111111111_2222222222_0_` still parses as fbpTs `1711111111111`, fbpRand `2222222222`, fbcTs `0`, fbclid `''`, page `''`, utm `''`.

`c1_1711111111111_2222222222_1700000000000_abc_D-1_p-v4_u-criativo-1` parses as the same Meta fields, page `v4`, utm `criativo-1`.

`c1_1711111111111_2222222222_0__p-a06` parses as fbcTs `0`, fbclid `''`, page `a06`, utm `''`.

Python `str.split('_', 4)` is a different function: its maxsplit keeps the remainder as the fifth field. That happens to be the right cut. It is not what JavaScript's `split` does.

The helper reads the current `href`, copies it with `URL`, and sets the parameter with `URLSearchParams`. Only an href that already starts with `https://buy.stripe.com/` is changed. Query parameters already on the Payment Link stay in place. The allowed checkout click calls the same helper again before the double-tap lock records the href, so a Meta cookie that appears after the first paint is included, and a second tap on that same link is still the same checkout.
