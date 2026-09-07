# 01 — PRD (Site Imersivo Trippin)

> Product Requirements Document do **site institucional/marketing do Trippin** — a vitrine web
> imersiva do produto, separada do aplicativo (`app/index.html`), mas alimentada pelos mesmos
> dados, fluxos e nomenclaturas sempre que possível. Este documento consultou `docs/00` a `docs/08`
> e o código de `app/` (index.html, trippin-api.js, buscar-hospedagem.html) para evitar divergência.

| Campo | Valor |
|---|---|
| **Produto** | Site Trippin — vitrine imersiva (`docs front/web/`) |
| **Relação com o app** | Site de marketing/conversão + demos ao vivo de features; **não substitui** o app (organização de viagem continua no app) |
| **Tipo de documento** | PRD |
| **Data** | 2026-09-04 |
| **Documentos-fonte** | `docs/00-visao-de-negocio.md`, `docs/02-UXUI-spec.md`, `docs/07-busca-hospedagem.md`, `docs/08-rollout-money-steps.md`, `app/index.html`, `app/src/trippin-api.js` |
| **Documentos derivados** | `02-sitemap-e-arquitetura-de-informacao`, `03` a `09` deste conjunto |

---

## 1. Por que este site existe

O app Trippin resolve a organização da viagem; ele **não tem hoje uma porta de entrada que venda
a proposta de valor** antes do usuário instalar/abrir o app (o "produto" é `app/index.html`, aberto
direto). O site cobre esse vão: **apresentar o produto de forma imersiva e cinematográfica**,
convertendo visitantes em Organizadores, e servir de **vitrine ao vivo** das features mais fortes
do app (inteligência de Docs, busca de hospedagem) sem exigir instalação.

## 2. Público-alvo

Reaproveita as personas de `docs/00` §4, com um recorte de funil:

| Persona do site | Equivalente no app | Intenção ao chegar no site |
|---|---|---|
| **Visitante decidindo** | pré-Organizador | avaliar se o Trippin resolve a dor de organizar viagem em grupo antes de investir tempo |
| **Organizador convertendo** | Organizador | ver a "inteligência de Docs" e a busca de hospedagem funcionando antes de criar a viagem |
| **Convidado recebendo link** | Convidado externo | abrir um link de viagem/roteiro compartilhado e entender do que se trata antes de entrar |

## 3. Conceito central (herdado do prompt de produto)

- **Home:** vídeo em loop de avião sobrevoando nuvens ao pôr do sol.
- **Fundo contextual por página:** cada categoria de conteúdo tem uma mídia de fundo relacionada
  (hospedagem → ambiente 3D do local; voo → vista de janela de aeronave; turismo/localização →
  ponto turístico; evento/show → imagem do show).
- **Parallax 3D ao interagir:** scroll/drag faz o fundo reagir, como se o usuário estivesse dentro
  do ambiente.
- **Carrossel para múltiplos destinos:** páginas de roteiro com mais de um destino mostram um
  carrossel, um cartão por ponto turístico.

## 4. Páginas principais (visão de produto — hierarquia completa em `02-sitemap...`)

1. **Home** — proposta de valor, prova social, CTA "Criar viagem" / "Ver como funciona".
2. **Hospedagem** — vitrine da busca de hospedagem, com **demo ao vivo** puxando
   `search-stays` (mesma Edge Function do app, ver `07-busca-hospedagem.md`).
3. **Voos / Passagens** — vitrine do interpretador de passagem (`interpretador-passagem.html`):
   anexe um PDF de exemplo, veja o roteiro extraído.
4. **Localização / Turismo** — destinos em destaque, mapa (reaproveita dados do `MapTab`).
5. **Eventos / Shows** — vitrine da aba Sugestões/Eventos.
6. **Roteiro com múltiplos destinos** — página "como fica o cronograma de uma viagem real",
   carrossel de destinos.
7. **Como funciona** — passo a passo do fluxo Onboarding → Nova viagem → Cronograma.
8. **Preços** — plano gratuito vs. Premium, usando os valores definidos em `docs/08` (lançamento
   R$14,90/mês, estabilizado R$24,90/mês).
9. **Entrar / Criar conta** — ponte para o app (ver `08-mapeamento-integracao-app.md` para decidir
   se é handoff ou formulário próprio).
10. **Página pública de viagem compartilhada** *(candidata, ver §7 — decisão pendente)*.

## 5. Funcionalidades por página (resumo — detalhado em `03-especificacao-conteudo-por-pagina.md`)

- Textos e CTAs contextuais por página.
- Dados dinâmicos reais quando possível (não mockar o que o app já expõe): hospedagens via
  `search-stays`, roteiro extraído via parser de passagem, cidades/pinos do `MapTab`.
- Formulário de captura de e-mail/onboarding leve (não duplica o cadastro completo do app —
  ver §7).

## 6. Critérios de sucesso

Herdados de `docs/00` §6 (North Star: viagens organizadas e concluídas por usuário ativo), com
métricas específicas do site como **entrada de funil**, não como métricas de produto paralelas:

| Métrica | Definição | Meta 90d pós-lançamento do site |
|---|---|---|
| Taxa de conversão visitante → criar viagem | sessões que terminam em "Criar viagem" concluída no app | ≥ 3% |
| Taxa de conclusão da demo de hospedagem | visitantes que completam uma busca na demo ao vivo | ≥ 25% |
| LCP (Largest Contentful Paint) em Home | performance com vídeo de fundo | ≤ 2.5s (ver `09-checklist-acessibilidade-performance.md`) |
| Taxa de abandono por motion sickness/baixa performance | sessões que ativam `prefers-reduced-motion` ou caem no fallback estático | reportar, sem meta — sinal de saúde do parallax |

## 7. Perguntas em aberto (decisões que exigem humano)

Consolidadas com detalhe no `10-resumo-executivo.md`, citadas aqui porque moldam o PRD:

1. **O site terá cadastro/login próprio ou só linka para o app?** SIM
2. **Existe orçamento para produção de vídeo original** (avião, ambientes 3D, pôr do sol) ou o
   site usa banco de vídeo licenciado/stock na v1? alterar para uma sequencia de imagens passando tipo carrossel de fotos.
3. **A "página pública de viagem compartilhada" entra nesta v1 do site ou fica para v2?** Ela
   reaproveitaria dados reais de uma viagem (com permissão do Organizador) — maior valor, maior
   escopo e implica LGPD (mesma cautela de `docs/00` §10). V2
4. **Aprovação de identidade visual:** o site herda a paleta do app (`06-design-system.md`) com
   extensões para overlay/glass — precisa de sign-off antes de produção de assets.

## 8. Fora de escopo (v1 do site)

| Item | Por quê |
|---|---|
| Blog/CMS de conteúdo editorial | Não citado no briefing original; candidato a v2 |
| Suporte aos 10 idiomas no lançamento | Segue o mesmo critério do app (`docs/00` §8): PT-BR + EN-US completos, demais como stub |
