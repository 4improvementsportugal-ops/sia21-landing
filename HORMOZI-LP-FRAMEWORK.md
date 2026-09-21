# SIA21 — Hormozi LP Framework (aplicado)

**Produto:** Sistema IA do Consultor Imobiliário — 21 Dias  
**Autor:** Pedro Ferreira / 4Improvements (pt-PT)  
**Data:** 2026-09-21 (PT)  
**Stripe Early (todas):** `https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02`  
**Preço:** early €37 / standard €47 · bumps opcionais no Stripe  

---

## Value equation (copy reminders)

| Alavanca | Direção | Como está na LP |
|----------|---------|-----------------|
| Dream outcome | ↑ | H1: recuperar **8+ h/semana** (não o nome do produto) |
| Time delay | ↓ | **em 21 dias** no H1 + plano D1–D21 |
| Effort / sacrifice | ↓ | Sub: **sem** jargão / prompts vazios / risco RGPD; prompts prontos |
| Perceived likelihood | ↑ | Só prova real: Pedro/4I, amostra de prompt, ~10k AMI (contexto), garantia 14 dias, visual de processo |

**Proibido:** fake testimonials, HeyGen UGC fingido, “X mil clientes ajudados”, cases inventados.  
**Toast de compra:** mantido como **demo** (label explícito).

---

## Estrutura Hormozi — mapping no controlo (`landing/index.html`)

### Above the fold

| # | Elemento Hormozi | Implementação SIA21 |
|---|------------------|---------------------|
| 1 | Headline = Dream + Time | **Recupera 8+ horas por semana / em 21 dias** |
| 2 | Sub = Effort↓ | Sem jargão, sem prompts vazios, sem pôr dados em risco — setup seguro + prompts pt-PT |
| 3 | Hero = outcome visual | Antes/depois de processo (admin → rotina); *não* UGC |
| 4 | Credibility strip | Garantia 14 dias · pt-PT · Idealista/WA · RGPD |
| 5 | CTA único | `#checkout` → Stripe early €37 |

### Below the fold

| # | Elemento | Secção / id |
|---|----------|-------------|
| 1 | Social proof stacking (sem fake) | `#como-fica-o-dia` + `#credibilidade` (Pedro, ~10k AMI *contexto*, amostra prompt, para quem é) + `#garantia` |
| 2 | How it works **4 passos** | `#como-funciona` |
| 3 | Dream outcome nos H2 | ex.: “Tudo o que precisas para recuperar 8+ h”, “Garante as tuas 8+ horas/semana” |
| 4 | Checkout last | `#checkout` early €37 + Stripe link |

### How it works — wording exacto (4 passos)

1. **Setup seguro** — conta profissional, lista “nunca colar”, prompt-base (~3 dias)  
2. **Operação** — Idealista/Casa Sapo, WhatsApp, emails, CRM, angariação (templates pt-PT)  
3. **Rotina 8h** — batching + 7 toques + checklist → 8+ h recuperadas  
4. **Escala** — Cap. 7 caminho solo → equipa / agência (4Improvements)

---

## Ordem de secções (controlo + ângulos)

`hero` → `como-fica-o-dia` → `dor` → `como-funciona` → `credibilidade` → `inclui` → `capitulos` → `stack` → `seguranca` → `garantia` → `faq` → **`checkout`** → footer / toast demo

---

## Ângulos — ATF diferenciado, mesmo skeleton

Cada `angles/0X-*/index.html` partilha: visual de outcome, cred strip, CTA Stripe, 4 passos, prova real, checkout €37.  
Só mudam **badge / H1 / sub / title / meta / intro checkout** (dream outcome do ângulo).

| Slug | H1 (dream + time / ângulo) |
|------|----------------------------|
| 01-tempo | Recupera 8+ h/semana em 21 dias — sem o dia a acabar em admin |
| 02-rgpd | Usa IA no imobiliário sem pôr clientes em risco — em 21 dias |
| 03-idealista | Anúncios Idealista/Casa Sapo em minutos — sem inventar factos |
| 04-whatsapp | WhatsApp e follow-up que não caem no esquecimento — em 21 dias |
| 05-angariacao | Mais angariações com método, não “sorte no pitch” — em 21 dias |
| 06-chatgpt-falhou | Já abriste o ChatGPT. Faltou o sistema — recupera 8+ h em 21 dias |
| 07-metodo-21-dias | 21 dias. Tarefa. Tempo. Entregável. Recupera 8+ h — sem dicas soltas |
| 08-solo-escala | Começa solo. Padroniza depois. 8+ h em 21 dias + caminho equipa |
| 09-early-37 | Recupera 8+ h/semana em 21 dias · Early €37 → €47 |
| 10-visitas-ops | Visitas, CRM e admin em minutos — não a roubar a noite · 21 dias |

---

## A/B backlog (tráfego baixo → **rewrite estrutural**, não multi-variante)

Com volume baixo, **não** correr 4× A/B em paralelo. Preferir **uma** hipótese ATF de cada vez (1–2 semanas), ou validar por ângulo de anúncio (Meta) → LP matching.

### Hipóteses ATF (fila)

| Prioridade | Variável | Controlo actual | Variante a testar | Nota |
|------------|----------|-----------------|-------------------|------|
| P0 | Headline | 8+ h / 21 dias | “Devolve 1 dia útil por semana em 21 dias” | Mesmo dream, framing diferente |
| P0 | Sub | “Sem X, Y, Z” | Listar 3 canais: Idealista · WA · admin | Mais concreto |
| P1 | CTA copy | “Começar agora — early €37” | “Quero recuperar 8+ horas — €37” | Outcome no botão |
| P1 | Hero visual | Antes/depois processo | Checklist “Idealista-ready” screenshot UI | Ainda ilustrativo, não UGC |
| P2 | Cred strip | 4 pills | + “ChatGPT & Claude” em vez de Idealista/WA | Só se ads forem tool-led |
| P2 | Preço no hero | €37 riscado €47 | Esconder preço no hero; só no checkout | Reduz objecção precoce vs urgência |

### O que **não** A/B agora

- Multi-headline simultâneo em 10 ângulos  
- Fake social proof / stars inventadas  
- Vídeo HeyGen “depoimento”

---

## Nota para Designer (Batch 1 — fórmulas de headline)

Fórmula base: **`[Dream outcome mensurável] + [time delay] + [opcional: sem sacrifice]`**

| Ângulo | Fórmula recomendada |
|--------|---------------------|
| 01-tempo | `{8+ h/semana} + {21 dias} + sem admin a comer o dia` |
| 02-rgpd | `{IA útil} + {21 dias} + sem pôr clientes em risco` |
| 03-idealista | `{anúncios em minutos} + {sem inventar factos}` |
| 04-whatsapp | `{WA + follow-up que cola} + {21 dias}` |
| 05-angariacao | `{mais angariações} + {método} + não sorte no pitch` |
| 06-chatgpt-falhou | `{sistema ≠ ferramenta} + {8+ h em 21 dias}` |
| 07-metodo-21-dias | `{tarefa·tempo·entregável} + {21 dias} + sem reels` |
| 08-solo-escala | `{solo agora} + {8+ h} + caminho equipa` |
| 09-early-37 | `{8+ h / 21 dias} + {early €37→€47}` |
| 10-visitas-ops | `{visitas/CRM/admin em minutos} + {não roubar a noite}` |

Visual language: **slate/blue Superdesign** (já nas LPs). Hero = outcome/processo, nunca robots stock nem UGC falso.

---

## Ficheiros

- Controlo: `landing/index.html` (+ espelho `deploy/index.html`)  
- Ângulos: `landing/angles/0X-*/index.html` (+ `deploy/angles/`)  
- Repo live: `4improvementsportugal-ops/sia21-landing` (root `index.html` + `angles/`)  
