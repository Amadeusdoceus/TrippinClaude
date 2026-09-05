# 06 — Design System / Guia de Estilo (Site)

> Estende a identidade visual do app (`docs/02-UXUI-spec.md` §Identidade Visual) para o contexto
> de **fundos animados em vídeo + cards glass** — não cria uma marca nova. Onde o app já define um
> token, o site herda o mesmo valor; os tokens novos aqui são só os exigidos pelo conceito imersivo
> (overlay, blur, profundidade de parallax).

---

## 1. Paleta (herdada + extensões)

| Token | Hex/valor | Uso | Origem |
|---|---|---|---|
| `--ink` | `#14213D` | Texto principal sobre fundo claro, navegação | app |
| `--deep` | `#1A2B4A` | Fundos escuros, base dos cards glass | app |
| `--coral` | `#FF6B5C` | Ação primária (Criar viagem, CTAs) | app |
| `--lagoon` | `#2DB5A3` | Secundário, confirmações, demo "ao vivo" | app |
| `--sand` | `#F7F5F0` | Fundo de seções sem vídeo (ex.: `/precos`) | app |
| `--amber` | `#F4A259` | Alertas, selo "dados de exemplo" (`demo:true`) | app |
| `--overlay-scrim` | `rgba(20,33,61,.55)` | Camada sobre vídeo/imagem de fundo para legibilidade de texto | **novo** |
| `--overlay-scrim-strong` | `rgba(20,33,61,.78)` | Scrim em trechos com texto longo (ex.: PRD-like copy) | **novo** |
| `--glass-fill` | `rgba(247,245,240,.12)` | Preenchimento dos cards glass sobre vídeo escuro | **novo** |
| `--glass-border` | `rgba(247,245,240,.22)` | Borda 1px dos cards glass | **novo** |
| `--glass-blur` | `blur(18px) saturate(140%)` | `backdrop-filter` dos cards glass | **novo** |

**Regra de contraste:** todo texto sobre vídeo/imagem fica dentro de um card glass ou atrás de um
scrim — nunca solto sobre a mídia crua (requisito de acessibilidade, ver `09-checklist...md`).

## 2. Tipografia (herdada, sem alteração)

| Papel | Fonte | Uso no site |
|---|---|---|
| Display/wordmark | **Sora** | Títulos de herói (H1 por página), com restrição — só o essencial |
| Corpo/UI | **Inter** | Parágrafos, botões, navegação |
| Dados/código | **JetBrains Mono** | Código de viagem exibido em `/viagem/[codigo]`, preços em `/precos` |

Escala tipográfica sugerida (mobile-first, `rem`): H1 `2.5/3.25rem`, H2 `1.75/2.25rem`, corpo
`1rem/1.6`, legenda `.875rem`. Line-height maior que o padrão do app (site tem mais respiro que o
app, que é mobile-denso).

## 3. Assinatura visual

- **"Passaporte"** (herdado do app): mantém o motivo de carimbo/código monoespaçado em qualquer
  card que exiba um código de viagem real (`/viagem/[codigo]`).
- **Novo para o site — "janela para o destino":** cada card de categoria (`/hospedagem`, `/voos`,
  `/turismo`, `/eventos`, `/roteiros`) é tratado como uma "janela" com cantos levemente
  arredondados (`--radius-window: 20px`) sobre o vídeo de fundo, reforçando a metáfora de olhar
  para dentro do ambiente da viagem.

## 4. Componente "Glass Card"

```
.glass-card {
  background: var(--glass-fill);
  border: 1px solid var(--glass-border);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: var(--radius-window);
}
```

- **Fallback sem `backdrop-filter`** (Firefox Android antigo, navegadores sem suporte):
  substitui por `background: var(--overlay-scrim-strong)` sólido — nunca deixa o card
  transparente sem apoio de leitura.
- Variante "dados ao vivo" (usada na demo de `/hospedagem`): borda `--lagoon` em vez de
  `--glass-border`, para diferenciar conteúdo real de conteúdo decorativo.

## 5. Componentes globais do site

| Componente | Herdado do app? | Notas |
|---|---|---|
| Botão primário/secundário/destrutivo | Sim (`docs/02-UXUI-spec.md`) | Mesmas cores; primário ganha leve glow coral sobre vídeo escuro |
| Toast de confirmação | Sim | Usado nas demos ao vivo (ex.: "Busca concluída") |
| Header/nav | **Novo** (o app usa AppBar + Drawer, o site usa header horizontal fixo — ver `02-sitemap...`) | Transição transparente→opaco no scroll |
| Carrossel de destinos | **Novo** | Ver `05-especificacao-interacao-animacao.md` |
| Selo "dados de exemplo" | Sim, mesmo texto/cor (`amber`) do modo `demo:true` do `search-stays` | Consistência literal com o app |

## 6. Grade e espaçamento

- Base 8px. Seções de página cheia (`100svh`) para os blocos de herói com vídeo; conteúdo denso
  (ex.: `/precos`, `/politica-de-privacidade`) quebra o padrão full-bleed e usa largura máxima de
  leitura (`72ch`), igual ao princípio "conteúdo centralizado com largura legível" do app em telas
  largas (`docs/02-UXUI-spec.md` §Responsividade).

## 7. Modo claro/escuro

O app tem tema claro/escuro configurável (`SettingsScreen`). O site, por natureza do conceito
(vídeo de fundo escuro + glass), **assume tema escuro como padrão** independente da preferência do
SO — é uma decisão de marca para o site, não um bug de acessibilidade, desde que o contraste do
texto nos cards glass atenda AA (ver checklist `09`). Não implementa alternância manual na v1.
