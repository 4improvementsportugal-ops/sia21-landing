# Meta Conversions API browser contract

The landing page and the Stripe webhook dedupe the same purchase and share the Meta click ids. This is the browser side. Nothing here changes prices, Payment Link ids, consent, the human gate, or the production-only guard.

## Purchase

On the root thank-you page (`obrigado.html`, also requested as `/obrigado`), `SIA21_firePurchaseOnce` in `assets/sia21-purchase.js` is the only `fbq('track', 'Purchase')`.

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

This does not apply to `ghl-agencias`.

## client_reference_id

When a visitor clicks a `buy.stripe.com` link (home, `angles/`, `angles-v2/` including sobrecarga, the €33 and €14 exit offers, and the other Payment Links on those pages) and cookie consent is already accepted, the link gains `client_reference_id`. Consent is `localStorage['4i_cookie_consent_v1'] === 'accepted'`, from this visit or an earlier one.

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

Python `value.split('_', 4)` makes four cuts and five fields. The `fbclid` is the remainder, so underscores inside it stay intact. The JavaScript equivalent is `value.split('_', 5)`.

```text
c1_1711111111111_2222222222_1700000000000_abc_D-1
  → ['c1', '1711111111111', '2222222222', '1700000000000', 'abc_D-1']

c1_1711111111111_2222222222_0_
  → ['c1', '1711111111111', '2222222222', '0', '']
```

| Index | Field |
| --- | --- |
| 0 | `c1` |
| 1 | `_fbp` creation time, or `0` |
| 2 | `_fbp` random, or `0` |
| 3 | `_fbc` creation time, or `0` |
| 4 | `fbclid`, or `''` |

The click handler reads the current `href`, copies it with `URL`, and sets the parameter with `URLSearchParams`. Query parameters already on the Payment Link stay in place. The href is updated before the double-tap lock records it, so a second tap on that same link is still the same checkout.
