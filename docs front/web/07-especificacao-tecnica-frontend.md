# 07 — Especificação Técnica Front-end

> O app v1 (`app/index.html`) é HTML único + React 18 via CDN, sem bundler (decisão registrada em
> `docs/00-visao-de-negocio.md` §9, decisão #1) — escolha certa para **iteração e hospedagem
> estática do app**. O site tem outro objetivo: **o visual mais profissional possível**, com pipeline
> de imagem/vídeo, SEO e performance de conteúdo que um arquivo único sem build não entrega bem.
> Por isso a stack recomendada aqui **não copia** a do app — mesmo padrão de registro de decisão
> (`# | Decisão | Alternativas consideradas | Por que escolhemos | Trade-off aceito`).

---

## 1. Stack recomendada

| # | Decisão | Alternativas consideradas | Por que escolhemos | Trade-off aceito |
|---|---|---|---|---|
| 1 | **Next.js 14+ (App Router) + TypeScript**, export estático onde possível | Réplica do app (HTML+React via CDN, sem build); Vite + React SPA | Site precisa de pipeline real de imagem/vídeo, code-splitting por rota e uma história de SEO que nem o CDN nem uma SPA pura entregam tão bem | Introduz build/toolchain — o site não tem mais a simplicidade "salvar e recarregar" do app |
| 2 | **Tailwind CSS**, com os tokens de `06-design-system.md` mapeados para o tema do Tailwind (`--ink`, `--deep`, `--coral`, `--lagoon`, `--sand`, `--amber`, `--overlay-scrim*`, `--glass-*`) | CSS manual como no app; CSS-in-JS | Site tem muito mais páginas de conteúdo que o app; utilitários aceleram a montagem de layout sem reinventar cada componente | Classes utilitárias no markup — legibilidade menor que CSS semântico à mão |
| 3 | **Framer Motion** para as transições de card/página (`05-especificacao-interacao-animacao.md` §2 — crossfades de 250–350ms estilo *shared element*) | React Transition Group | Framer Motion tem suporte nativo a transição *shared-layout*, exatamente o padrão especificado | Peso adicional de bundle — mitigado por code-splitting por rota do Next.js |
| 4 | **GSAP + ScrollTrigger** (ou Lenis para smooth-scroll) dirigindo o parallax em camadas (`05` §1) | React Three Fiber / WebGL 3D real | O efeito especificado é profundidade em camadas por imagem, não geometria 3D — GSAP/transform CSS bastam e custam menos bateria/GPU | Sem geometria 3D real; se uma página futura precisar de 3D genuíno, R3F entra como adição pontual, não substituição da base |
| 5 | **`<video>` nativo** com `<source>` WebM/MP4 e poster AVIF/JPEG (`04-especificacao-midia-assets.md` §1) | Biblioteca de player (ex.: react-player) | O elemento nativo já cobre loop/poster/lazy sem peso extra de bundle | Menos controles prontos (legendas, analytics de player) — não necessários aqui |
| 6 | **Cliente Supabase chamado direto do site** (`@supabase/supabase-js`), sem importar `app/src/trippin-api.js` | Reaproveitar `trippin-api.js` como está | Esse módulo é construído em torno do modelo offline-first do app (localStorage, fila de sync) — o site não precisa (e não deveria herdar) essa complexidade; ainda assim usa o **mesmo projeto/schema** Supabase, uma única fonte de verdade | Alguma duplicação de tipos/constantes entre app e site (mitigar com um pacote `shared/` compartilhado se o time crescer) |
| 7 | **Deploy no Vercel** para o site | GitHub Pages, igual ao app | Otimização de imagem/vídeo on-the-fly, cache de edge e preview deployments por PR — exatamente o que os orçamentos de performance (`01-prd.md` §6, `09-checklist...md` §4) exigem | Duas plataformas de deploy no projeto (app no GitHub Pages, site no Vercel) — aceito porque são produtos com necessidades diferentes |

## 2. Estrutura de componentes (proposta)

```
site/
├── app/                          # Next.js App Router — rotas = slugs do 02-sitemap...md
│   ├── page.tsx                  # /
│   ├── hospedagem/page.tsx
│   ├── voos/page.tsx
│   ├── turismo/page.tsx
│   │   └── [destino]/page.tsx
│   ├── eventos/page.tsx
│   ├── roteiros/page.tsx
│   │   └── [exemplo]/page.tsx
│   ├── como-funciona/page.tsx
│   ├── precos/page.tsx
│   ├── entrar/page.tsx
│   ├── politica-de-privacidade/page.tsx
│   └── viagem/[codigo]/page.tsx  # condicional — ver 01-prd.md §7.3
├── components/
│   ├── VideoHero.tsx             # <video>+poster, respeita saveData/reduced-motion (09)
│   ├── ParallaxLayer.tsx         # camadas de profundidade (05 §1), com o gate de FPS (05 §4)
│   ├── GlassCard.tsx             # implementa 06-design-system.md §4, com fallback sem backdrop-filter
│   ├── Carousel.tsx              # 05 §3 — snap, teclado, sem autoplay
│   └── PricingTable.tsx          # números de docs/08-rollout-money-steps.md
├── lib/
│   └── supabase-client.ts        # cliente read-only, chama search-stays e (se aprovado) trips por código
└── styles/
    └── tokens.css                 # espelha 1:1 os tokens de 06-design-system.md
```

## 3. Responsividade

- **Mobile-first**, breakpoints Tailwind padrão (`sm 640`, `md 768`, `lg 1024`, `xl 1280`),
  coerente com o alvo mobile-first do próprio app (`docs/02-UXUI-spec.md` §Responsividade).
- **Parallax em mobile:** o efeito de drag/tilt (`05` §1) é **desabilitado por padrão em telas
  touch pequenas** (< `md`) mesmo sem gatilho de FPS baixo — telas pequenas não mostram profundidade
  suficiente para justificar o custo de bateria/GPU; o scroll-parallax (translação por velocidade)
  continua ativo, só o tilt por pointer-drag é que é mobile-only-off.
- **Vídeo de herói em mobile:** usa a rendition 1280×720 (`04` §1) por padrão via
  `<source media>`/`srcset` de vídeo, nunca a de 1920×1080.
- **Header:** em mobile colapsa para menu hambúrguer com os mesmos itens de navegação primária de
  `02-sitemap-e-arquitetura-de-informacao.md` §2.

## 4. Assunções feitas

Escrito depois de `05` e `04` (interação/mídia) já existirem, então os números de FPS/formatos
citados aqui vêm diretamente deles — sem assunção adicional relevante além do mobile-only-off do
tilt em §3, que é uma decisão nova deste documento (não conflita com o piso de FPS de `05` §4, que
continua valendo para desktop/tablet).
