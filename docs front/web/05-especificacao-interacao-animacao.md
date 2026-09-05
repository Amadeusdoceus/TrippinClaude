# 05 — Especificação de Interação e Animação

> Deriva de `02-sitemap-e-arquitetura-de-informacao.md` (páginas) e `06-design-system.md`
> (tokens visuais). Define o mecanismo de parallax/drag, transições entre cards, comportamento do
> carrossel e o piso de performance com fallback — estes números são **referência fixa** para
> `04-especificacao-midia-assets.md`, `07-especificacao-tecnica-frontend.md` e
> `09-checklist-acessibilidade-performance.md`.

---

## 1. Mecanismo de parallax/3D

**Não é 3D real (WebGL/geometria).** É **profundidade em camadas**: cada fundo contextual é
separado em 2–3 planos de imagem (ex.: céu/horizonte ao fundo, elemento principal no meio, detalhe
em primeiro plano) que se movem em velocidades diferentes conforme o scroll e reagem a um leve
`translate`/`rotate` no drag/pointer-move — suficiente para vender "estar dentro do ambiente" sem o
custo de renderização 3D real.

| Propriedade | Comportamento |
|---|---|
| **Scroll** | Cada camada translada verticalmente a uma fração da velocidade do scroll (camada de fundo ~0.2×, camada média ~0.5×, camada de frente ~0.8–1×) |
| **Drag/pointer (desktop e touch)** | `translate3d` de até `±12px` e `rotate` de até `±1.5deg` nas camadas, proporcional à distância do ponteiro ao centro — nunca desloca conteúdo/texto, só as camadas de fundo |
| **Easing** | `cubic-bezier(.22,.61,.36,1)` (ease-out), sem overshoot — o objetivo é sensação de profundidade, não elasticidade |
| **Limite** | Efeito sempre contido dentro da seção `100svh` — nunca revela bordas/vazios da imagem |

Essa é a mesma técnica assumida em `04-especificacao-midia-assets.md` para as imagens de
destino/turismo/hospedagem: **arte-fonte precisa vir separada em camadas** (não uma foto plana),
senão o efeito de profundidade não existe.

## 2. Transições entre páginas e cards

| Transição | Duração | Efeito |
|---|---|---|
| Home → página de categoria (clique no teaser) | 250–350ms | Crossfade com o card do teaser expandindo até preencher o herói da página de destino (estilo *shared element*) — reforça a ideia de "entrar" na categoria |
| Categoria → detalhe (`/turismo/[destino]`, `/roteiros/[exemplo]`) | 250–350ms | Mesmo padrão de crossfade/expansão a partir do card clicado |
| Qualquer página → Home (logo) | 200ms | Fade simples, sem expansão (não há card de origem) |
| Troca de aba/seção dentro da mesma página | 150ms | Fade cruzado entre blocos, sem movimento de camada |

Sob `prefers-reduced-motion: reduce` **ou** no fallback de performance baixa (§4), toda transição
cai para **corte instantâneo ou fade ≤100ms** — comportamento já fixado em
`09-checklist-acessibilidade-performance.md` §2.

## 3. Carrossel (roteiros multi-destino e grade de turismo)

- **Um card por ponto turístico**, conforme o conceito do briefing original.
- **Navegação:** swipe/drag no touch; `←`/`→` do teclado e setas clicáveis no desktop; sempre
  focável por `Tab` (ver checklist §3).
- **Snap:** cada gesto de arraste/seta avança exatamente um card (`scroll-snap-align: center`),
  sem posições intermediárias "soltas".
- **Autoplay: desligado por padrão em todo o site**, em vez de só sob `prefers-reduced-motion` —
  decisão deliberada para ter **um único comportamento a testar**, não dois estados (com/sem
  reduced-motion). O usuário sempre inicia o avanço.
- **Indicador de posição:** pontos (dots) ou contagem "3/7" sobre o glass card, nunca sobre a mídia
  crua (mesma regra de contraste de `06-design-system.md`/`09`).

## 4. Piso de performance e fallback

| Métrica | Meta | Piso de degradação |
|---|---|---|
| **FPS do efeito de parallax** | 60fps | Se o FPS medido ficar **abaixo de 50 por ~1s sustentado** (ou o dispositivo sinalizar `navigator.hardwareConcurrency` baixo/classe de GPU fraca conhecida), o parallax/tilt é **desligado por completo** |
| **Estado de fallback** | — | Fundo em camadas estáticas, **sem transform algum no scroll/drag** — o mesmo estado final usado por `prefers-reduced-motion` (§2) e pelo checklist de acessibilidade §5 |

**Por que convergir os dois gatilhos (reduced-motion e baixa performance) num único estado final:**
menos superfície de teste, e evita o cenário de um dispositivo fraco tentar renderizar um "parallax
reduzido" que ainda assim engasga — ou desliga de verdade, ou não desliga.

## 5. Resumo de regras implementáveis

1. Medir FPS continuamente enquanto o parallax está ativo (ex.: via `requestAnimationFrame` delta).
2. Se `prefers-reduced-motion: reduce` **OU** FPS < 50 por ≥1s **OU** sinal de hardware fraco →
   aplicar o estado estático (parallax off, autoplay off — já off por padrão —, transições ≤100ms,
   vídeo pausado no poster).
3. Reavaliar a condição de FPS a cada nova página carregada (não é uma decisão "for a sessão toda"
   — um dispositivo pode melhorar após fechar outras abas, mas o padrão é conservador: uma vez
   degradado na sessão, mantém degradado para evitar oscilação visual).
