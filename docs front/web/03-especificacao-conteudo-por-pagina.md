# 03 — Especificação de Conteúdo por Página

> Usa exatamente os slugs de `02-sitemap-e-arquitetura-de-informacao.md` e o componente
> `GlassCard` de `06-design-system.md`. Copy alinhada à proposta de valor de
> `docs/00-visao-de-negocio.md` §5 — sem reinventar a promessa do produto.

---

## `/` — Home

**Copy:**
- H1: "Sua viagem em grupo, num lugar só."
- Subhead: "Passagens, estadias, roteiro e despesas — sem trocar de app, sem sinal, sem confusão."
- CTA primário: "Criar viagem" → app (Home/NewTrip)
- CTA secundário: "Ver como funciona" → `/como-funciona`

**Dados dinâmicos:** nenhum dado ao vivo obrigatório — os 5 blocos de teaser usam mídia/loop fixos
(`04-especificacao-midia-assets.md`), não dados de usuário real.

**Estrutura de cards:** 5 `GlassCard` de teaser (hospedagem, voos, turismo, eventos, roteiros),
cada um com: vídeo/imagem em loop curto de fundo, título da categoria, 1 linha de gancho, seta de
"ver mais" → expande com crossfade (`05` §2) para a página de categoria.

---

## `/hospedagem`

**Copy:**
- H1: "Compare hospedagem sem abrir seis abas."
- Subhead: "Hotéis, pousadas e aluguéis — buscados de uma vez, do jeito que já funciona no app."
- Selo abaixo do formulário: mesmo texto do app quando em modo de exemplo — **"Dados de exemplo"**
  (badge `--amber`), idêntico ao comportamento `demo:true` do app.

**Dados dinâmicos:** demo ao vivo chamando a mesma Edge Function `search-stays`
(`docs/07-busca-hospedagem.md`). Campos do contrato `Stay` exibidos no card: `source`/`sourceLabel`
(ex.: "OpenStreetMap"), `name`, `stars`, `rating` (0–10), `neighborhood`, `pricePerNight` (ou
"Ver preço no site" quando `priceUnknown:true`), `thumbnail`, botão para `url`.

**Estrutura de card (resultado da busca):** `GlassCard` com borda `--lagoon` (variante "dados ao
vivo" de `06-design-system.md` §4) contendo: thumbnail, nome, selo de fonte, estrelas/nota,
bairro, preço/CTA "Ver no site".

---

## `/voos`

**Copy:**
- H1: "Anexe a passagem. O roteiro se monta sozinho."
- Subhead: "O mesmo interpretador de passagem do app — cole um PDF de exemplo e veja."

**Dados dinâmicos:** vitrine do `interpretador-passagem.html` — área de upload de PDF de exemplo,
processado no cliente (mesma lógica do app: parser estruturado, sem servidor).

**Estrutura de card (roteiro extraído):** um `GlassCard` por trecho de voo, com origem, escala(s) e
destino, horário de partida/chegada — mesmo agrupamento visual que o app usa para os "cards"
gerados a partir do PDF, antes de "Adicionar ao cronograma".

---

## `/turismo`

**Copy:**
- H1: "Cada destino, com o que realmente importa nele."
- Subhead: "Pontos turísticos reais, no mesmo mapa que organiza sua viagem."

**Dados dinâmicos:** grade de destinos usando o mesmo formato de cidade/pino do `MapTab` do app
(nome do local, país, coordenadas para o pino).

**Estrutura de card:** `GlassCard` de grade — imagem do ponto turístico, nome do destino, país,
link para `/turismo/[destino]`.

### `/turismo/[destino]`

**Copy:** H1 com o nome do destino; parágrafo curto de contexto do local.

**Dados dinâmicos:** mesmo registro de cidade/pino do `MapTab`, detalhado (coordenadas, eventuais
pontos turísticos adicionais do mesmo destino).

**Estrutura:** herói em parallax (`04` §3) + `GlassCard` único com o resumo do destino e CTA
"Adicionar este destino à minha viagem" → app (NewTrip com destino pré-preenchido, ver
`08-mapeamento-integracao-app.md`).

---

## `/eventos`

**Copy:**
- H1: "Shows e eventos, no roteiro — não num print perdido."
- Subhead: "O que está rolando no seu destino, direto na aba Sugestões do app."

**Dados dinâmicos:** mesma forma de dado da `SuggestTab` (nome do evento, local, data/horário,
imagem).

**Estrutura de card:** `GlassCard` com imagem do evento, nome, local, data — sem CTA de compra de
ticket na v1 (não é escopo do app hoje).

---

## `/roteiros` — roteiro com múltiplos destinos

**Copy:**
- H1: "Uma viagem, vários destinos — um roteiro só."
- Subhead: "Veja como o cronograma organiza tudo quando a viagem passa por mais de um lugar."

**Dados dinâmicos:** carrossel (`05` §3) com **um card por ponto turístico**, reaproveitando as
mesmas imagens de `/turismo` para consistência visual.

**Estrutura de card:** `GlassCard` no carrossel — imagem do ponto turístico, nome do destino, dia
do roteiro em que ele entra (referência ao formato de bloco do `ScheduleTab`).

### `/roteiros/[exemplo]`

**Copy:** título do roteiro de exemplo (ex.: "10 dias: Lisboa → Porto → Madrid").

**Dados dinâmicos:** sequência de blocos no formato do `ScheduleTab` (dia, cidade, atividade),
como exemplo estático — não é uma viagem real de usuário.

---

## `/como-funciona`

**Copy:** passo a passo replicando o fluxo real do app (`docs/02-UXUI-spec.md` §Fluxos): 1. Escolha
o idioma e crie seu perfil → 2. Crie ou entre numa viagem por código → 3. Anexe passagens e
reservas — o cronograma se preenche → 4. Convide o grupo e organizem juntos.

**Dados dinâmicos:** nenhum — página estática, sem herói em vídeo (`06` §6).

**Estrutura:** 4 `GlassCard` em sequência (um por passo), sem parallax.

---

## `/precos`

**Copy:** usa os números reais definidos em `docs/08-rollout-money-steps.md` — plano gratuito e
Premium **R$14,90/mês** no lançamento, **R$24,90/mês** a partir da fase estabilizada — sem inventar
outro preço ou moeda de exibição.

**Dados dinâmicos:** nenhum dado ao vivo; conteúdo versionado junto do modelo de precificação.

**Estrutura:** tabela comparativa gratuito vs. Premium, sem herói em vídeo.

---

## `/entrar`

**Copy:** "Entrar" / "Criar conta" — CTA que faz handoff para o fluxo de autenticação do app
(resolução da decisão em `08-mapeamento-integracao-app.md` — não duplica formulário de cadastro).

---

## `/politica-de-privacidade`

**Copy:** **texto reaproveitado literalmente** da `PrivacyPolicyScreen` do app — não é reescrito
para o site. Layout de leitura pura, largura máxima `72ch` (`06` §6), sem card/herói.

---

## `/viagem/[codigo]` *(candidata — ver `01-prd.md` §7.3, escopo ainda não decidido)*

**Copy (caso entre em escopo):** nome da viagem, código de 12 dígitos exibido no motivo
"passaporte" (JetBrains Mono, `06` §2–3), resumo do roteiro.

**Dados dinâmicos:** viagem real por código — exige nova política de leitura pública (RLS), listada
como item novo em `08-mapeamento-integracao-app.md`, não como reaproveitamento.

**Estrutura:** herói com a imagem do primeiro destino da viagem (`04` §3) + `GlassCard` "passaporte"
com o código + lista resumida do roteiro (somente leitura, sem edição — edição continua exclusiva
do app).

---

## Assunções feitas

Copy de cada página foi escrita nova (não existia briefing textual pronto), ancorada estritamente
na proposta de valor de `docs/00` §5 e nos nomes de tela/aba já usados no app — nenhuma invenção de
funcionalidade que o app não tenha hoje.
