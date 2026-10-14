# Design

Visual world for `/ghl-agencias/`: a Portuguese deed on white paper. The price is the consideration, the included items are numbered clauses, and the only saturated color is the signature, the call button.

## Tokens

- Ink `#0f172a`, soft ink `#1e293b`, paper `#f8fafc`, sheet `#ffffff`, line `#e2e8f0`
- Accent `#1d4ed8`, pressed `#1e3a8a`, only on the primary action and the focus ring
- Type: self-hosted Literata, 400 and 700. Display up to 6rem. Body measure 68ch.
- Radius 2px. Shadow only on the deed sheet, offset and blurred.

## Hero experiment

`data-hero="preco"` is the default. PostHog flag `ghl497-hero` with variant `clausulas` moves the button to after the clause list. The copy does not change.

## Do not

- Do not list exclusions.
- Do not invent screenshots, video, or testimonials. Placeholders stay labeled TODO.
- Do not use a second accent, a side border, or an eyebrow above a heading.
