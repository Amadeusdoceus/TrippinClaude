# 09 — Checklist de Acessibilidade e Performance

> Checklist de gate — no mesmo espírito da "revisão obrigatória antes do push" do app
> (`docs/00-visao-de-negocio.md` §9, decisão #10). Não redefine nada de `06-design-system.md`;
> cobra o que aquele documento já prometeu (glass card, `--overlay-scrim`, tema escuro por padrão)
> e o que `01-prd.md` já fixou como meta (LCP ≤ 2.5s na Home).

---

## 1. Legibilidade e contraste sobre fundo animado

- ⬜ Todo bloco de texto está dentro de um **glass card** (`--glass-fill` + `--glass-border`) ou
  sobre um **scrim** (`--overlay-scrim` / `--overlay-scrim-strong`) — nunca solto sobre vídeo ou
  imagem crua.
- ⬜ Texto de corpo sobre `--glass-fill` (`rgba(247,245,240,.12)`) atinge **contraste AA ≥ 4.5:1**
  contra o pior frame do vídeo de fundo real daquela página (não validar só contra um frame médio —
  vídeo de nuvem clara/céu claro é o caso mais adverso).
- ⬜ Texto grande (H1/H2, ≥24px ou ≥19px bold) atinge **contraste AA ≥ 3:1** nas mesmas condições.
- ⬜ **Os valores de alpha de `--glass-fill`/`--overlay-scrim` definidos em `06-design-system.md`
  ainda não foram validados contra vídeo real** (foram fixados sem footage em mãos). Antes de
  aprovar qualquer página para produção: medir contraste com a mídia final e, se necessário, subir
  a opacidade do scrim (não descer) para manter AA — este item é bloqueante, não cosmético.
- ⬜ Fallback sem `backdrop-filter` (`06-design-system.md` §4) mantém o mesmo teste de contraste,
  já que nesse caso o card fica opaco (`--overlay-scrim-strong` sólido) — teoricamente mais fácil de
  passar, mas precisa ser testado também.

## 2. Redução de movimento (`prefers-reduced-motion: reduce`)

Comportamento único e explícito quando o SO/navegador sinaliza preferência por menos movimento:

- ⬜ Efeito de parallax/tilt 3D no drag/scroll **desligado por completo** — fundo fica como
  **imagem estática em camadas, sem transform ao rolar** (não "reduzido", desligado).
- ⬜ Autoplay do carrossel (roteiros, turismo) **desligado**; navegação só por interação explícita
  (seta/clique/swipe).
- ⬜ Transições entre cards/páginas (crossfade) trocadas por **corte instantâneo ou fade simples
  ≤100ms** — sem o crossfade expandido de card→herói.
- ⬜ Vídeo de fundo: **pausado no frame do poster estático** — não continua em loop ambiente. Decisão
  explícita (não a alternativa de "loop lento sem transform"): menos movimento na tela deve
  significar o mínimo de movimento possível, e o poster já é a mídia de fallback pensada para isso.
- ⬜ Esse mesmo estado final (parallax off + fundo estático + autoplay off) é **idêntico** ao estado
  de fallback de performance baixa (§5) — um único caminho de código para testar, não dois.

## 3. Teclado e leitores de tela

- ⬜ Carrossel (roteiros/turismo) navegável por **teclado** (seta esquerda/direita, `Tab` entra no
  card focado) com indicador de foco visível sobre o glass card.
- ⬜ Vídeos/imagens de fundo marcados **decorativos** (`aria-hidden="true"`, sem `alt` informativo)
  — não carregam informação que precise ser lida.
- ⬜ Demo ao vivo de `/hospedagem` (busca via `search-stays`) **100% operável sem mouse**: campo de
  destino, datas, submit e cards de resultado, todos alcançáveis por `Tab`/`Enter`.
- ⬜ Link **"Ir para o conteúdo"** (skip-to-content) presente em toda página com herói full-bleed,
  antes do header fixo.
- ⬜ Ordem de foco lógica: header → skip link → conteúdo principal → footer, mesmo quando o layout
  visual é full-bleed/sobreposto.

## 4. Performance de carregamento de vídeo/imagem

- ⬜ **LCP da Home ≤ 2.5s** (meta de `01-prd.md` §6): o elemento de LCP é o **poster estático**
  (AVIF/JPEG), nunca o `<video>` — o vídeo só entra depois do primeiro paint, sem bloquear.
- ⬜ Vídeo/imagem de fundo **abaixo da dobra** (teasers de categoria na Home, cards de
  `/turismo`/`/eventos`) carregam com **lazy-loading** (`loading="lazy"` / `preload="none"` +
  IntersectionObserver para vídeo).
- ⬜ Formatos alinhados com `04-especificacao-midia-assets.md`: vídeo em **WebM (VP9)** primário +
  **MP4 (H.264)** fallback; poster em **AVIF** com fallback **JPEG**. *(Assunção — ver nota de
  assunções abaixo se aquele documento ainda não existir no momento da leitura.)*
- ⬜ Nenhum asset de vídeo de herói acima de ~6MB após compressão (mesmo orçamento de
  `04-especificacao-midia-assets.md`).
- ⬜ Páginas sem herói em vídeo (`/precos`, `/como-funciona`, `/politica-de-privacidade`, per
  `06-design-system.md` §6) não pagam custo de vídeo nenhum — nem sequer devem baixar o player.

## 5. Fallback para dispositivos e redes fracas

- ⬜ Sinal de dispositivo fraco (ex.: `navigator.hardwareConcurrency` baixo, ou FPS medido
  sustentado abaixo de um piso durante ~1s) **desliga o parallax/3D** e cai no mesmo estado estático
  descrito em §2. *(Assunção — ver nota abaixo: o limiar exato de FPS/hardware é definido em
  `05-especificacao-interacao-animacao.md`; alinhar quando esse documento existir.)*
- ⬜ Sinal de rede fraca (`navigator.connection.saveData === true` ou `effectiveType` em `2g`/`3g`)
  troca o vídeo de fundo pelo **poster estático**, sem tentar baixar a mídia de vídeo.
- ⬜ Nenhum estado de fallback resulta em tela em branco ou card sem apoio de leitura — o poster
  estático sempre está presente antes de qualquer decisão de carregar vídeo (mesma disciplina
  anti-"tela branca" do app).

## 6. Antes de cada release do site (gate)

- ⬜ Todos os itens ✅ acima verificados na página que está sendo publicada.
- ⬜ Teste manual com `prefers-reduced-motion: reduce` ativado no SO.
- ⬜ Teste manual em conexão simulada 3G (DevTools throttling) medindo o LCP real.
- ⬜ Teste de contraste com a mídia de fundo **final** (não placeholder) antes do sign-off de
  identidade visual citado em `01-prd.md` §7.4.

---

## Reconciliação com os documentos-irmãos

Checklist revisado após a conclusão de `04-especificacao-midia-assets.md` e
`05-especificacao-interacao-animacao.md` — os três pontos abaixo, escritos inicialmente como
assunção, foram conferidos e batem exatamente com os números finais:
(1) formatos de vídeo/imagem (§4): WebM (VP9)+MP4 (H.264) e AVIF+JPEG, idêntico a `04` §1;
(2) limiar de fallback de dispositivo fraco (§5): FPS sustentado abaixo de 50 por ~1s (ou sinal de
hardware fraco), idêntico a `05` §4 — falta apenas validar esse piso em teste de dispositivo real
antes do lançamento (`10-resumo-executivo.md` §4.6);
(3) convergência entre reduced-motion e fallback de baixa performance (§2/§5): confirmado como um
único estado final em `05` §4, exatamente como assumido aqui.
