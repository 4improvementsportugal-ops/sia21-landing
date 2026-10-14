# Product

<!-- impeccable:product-schema 1 -->

Inferred from the repository and Pedro's written brief in this session. No live interview: this environment has no question tool, and the brief already fixed the facts below.

## Platform

web

## Users

Consultores imobiliários em Portugal, a trabalhar sozinhos ou com equipa. Querem os leads respondidos na hora. Avaliam a oferta numa página, antes de uma call.

## Product Purpose

A página `/ghl-agencias/` apresenta a configuração GoHighLevel por 497 €, pagamento único, e leva a uma call de avaliação. Não é uma compra direta. Sucesso é marcar essa call. `/ghl-agencias/obrigado.html` confirma um pagamento já feito e pede a marcação da sessão de configuração de 3 h.

## Positioning

A equipa humana da 4Improvements configura a conta e faz a formação. O preço é o mesmo para um consultor individual e para uma equipa. A call de avaliação vem sempre antes de avançar.

## Operating Context

Páginas estáticas em português de Portugal. Marcação no calendário 4AI (`https://api.leadconnectorhq.com/widget/bookings/4improvements`). PostHog e Meta Pixel já estão nas páginas. O pagamento, quando existe, acontece fora desta página. Stripe pode redirecionar para o obrigado.

## Capabilities and Constraints

- Copy atual mantido: lista do que os 497 € incluem, call de avaliação antes da compra, «Exemplos de uso», sem exclusões.
- Uma só ação: marcar a call. Texto do CTA: «Quero explorar as minhas opções deste sistema». Microcopy: «Call de avaliação, sem compromisso».
- Calendário embutido, com link de recurso.
- Secção «Como fica o teu sistema» com placeholders TODO. Sem testemunhos nem provas inventadas.
- Sem Tailwind CDN. Alvos de toque de pelo menos 44 px. Lighthouse mobile alvo ≥ 90.
- Feature flag PostHog `ghl497-hero`. Eventos de clique no CTA e de visualização do calendário.
- Sem travessão longo. `noindex`. Garantia apenas: «o sistema fica todo a funcionar».
- Pixel Meta `1506988540335331`. No obrigado, Purchase 497 EUR.
- 5 vagas. Acompanhamento opcional 97 €/mês, 1 h, depois da configuração e com a conta Meta ligada.

## Brand Commitments

Nome 4Improvements. Voz PT-PT, tratamento por «tu». Cores já usadas no site: tinta `#0f172a`, acento `#1d4ed8` / `#2563eb`, papel branco. O acento fica nos CTAs, com contraste de pelo menos 4.5:1.

## Evidence on Hand

Não há screenshots reais do GoHighLevel nem vídeo de 60 s. Não há testemunhos. Os exemplos de uso estão marcados como não sendo casos de clientes nem resultados reais. O limiar «há mais de X dias» fica como está.

## Product Principles

- O preço diz-se, e a call vem antes.
- A lista do que está incluído é o argumento, não uma lista do que fica de fora.
- Uma ação.
- Nada que pareça prova se não for prova.

## Accessibility & Inclusion

WCAG AA no texto e nos controlos. Teclado, foco visível, e `prefers-reduced-motion`.
