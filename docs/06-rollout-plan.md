# 06 — Plano de Rollout e Métricas

> Produzido pelo agente **rollout team**. Define métricas e estratégia de lançamento.

## North Star Metric
**Viagens organizadas e concluídas por usuário ativo** — captura o valor central (centralizar e organizar a viagem).

## Métricas de Divulgação (externas)
| Métrica | Definição | Meta 30d | Fonte |
|---------|-----------|----------|-------|
| Usuários ativos (MAU) | usuários únicos no mês | 1.000 | Analytics |
| Viagens criadas | total de grupos criados | 300 | Banco |
| Taxa de convite aceito | convidados que instalam e entram | 35% | Funil |
| NPS | pesquisa pós-viagem | ≥ 50 | In-app |

## Métricas Internas (melhoria contínua)
| Métrica | Limite de alerta | Ação |
|---------|------------------|------|
| Taxa de erro de API (5xx) | > 1% | Escalar Backend-Dev |
| Latência p95 | > 500ms | Investigar performance |
| Abandono no onboarding | > 25% | Simplificar perfil (rever CPF) |
| Sucesso da leitura de Docs | < 80% | Melhorar parser/OCR |
| Conflitos de cronograma resolvidos | < 60% | Rever UX do alerta |
| Custo de chamadas Maps por viagem | > meta de custo | Aumentar cache/debounce |

## Plano de Rollout Gradual
- **Fase 0 — Soft launch (dias 1–3):** beta interno + 5% do tráfego. Avança se erro < 0,5% e smoke test ok.
- **Fase 1 — Early access (dias 4–14):** 25% do tráfego. Foco no fluxo de Docs→Cronograma. Avança se leitura de docs ≥ 80%.
- **Fase 2 — GA (semana 3+):** 100%, com feature flags para Mapa em tempo real (v2) e Recomendações Trippin (v2).

## Dashboard
- **Tempo real:** usuários ativos, req/min, erro %, latência p95, alertas.
- **Diário (D+1):** novos usuários, viagens criadas, top erros, taxa de sucesso de Docs.
- **Semanal:** MAU, retenção D1/D7/D30, NPS, custo Maps.

## Marcos de relatório: D+1, D+7, D+30.

## Pendências conhecidas (bugs identificados em QA)

| # | Pendência | Impacto | Status |
|---|---|---|---|
| 1 | **Redirect de confirmação de e-mail cai em `localhost:3000`** — o e-mail de confirmação de cadastro trazia `redirect_to=http://localhost:3000` em vez da URL de produção, mesmo com `cfg.APP_URL` correto no código (`emailRedirectTo`, `app/src/trippin-api.js`). Causa: `https://amadeusdoceus.github.io/TrippinClaude` não estava na allowlist de **Redirect URLs** do painel Supabase do projeto de produção (`fcrsessmvmbaeqyrjbtk`) — o Supabase ignora `emailRedirectTo` fora da allowlist e cai no Site URL padrão. | Todo usuário real que confirmava o cadastro caía numa página quebrada em vez de voltar ao app. | ✅ **Resolvido em 2026-09-05.** URL de produção adicionada à allowlist de Redirect URLs no painel Supabase (ação manual — não é algo versionado no repo, ver nota abaixo). Testado com novo cadastro: e-mail de confirmação agora traz `redirect_to=https://amadeusdoceus.github.io/TrippinClaude`. |
| 2 | **Busca de destino por proximidade não normalizava acentos/caracteres especiais** — o autocomplete de destino em "Nova viagem" comparava as strings sem remover diacríticos, então digitar "Valencia"/"Sao Paulo" sem acento não encontrava "Valência"/"São Paulo" na lista. | Fricção na busca de destino logo na criação da viagem — contraria o princípio de "simplicidade radical" do `docs/02-UXUI-spec.md`. | ✅ **Resolvido em 2026-09-05.** Adicionado helper `foldDiacritics` (`normalize('NFD')` + strip de marcas diacríticas) usado nos dois lados da comparação em `NewTripScreen` (`app/index.html`). Validado com `valencia`→"Valência, Espanha", `sao paulo`→"São Paulo, Brasil", `malaga`→"Málaga, Espanha". |

> **Nota sobre o item 1:** a allowlist de Redirect URLs do projeto de produção só existe no painel do Supabase — não é gerenciada pelo `backend/supabase/config.toml` deste repo, porque esse arquivo está linkado ao projeto de **staging** (`wwnxrzdmdhdgzokmbvud`), não ao de produção. Se o projeto de produção for migrado para gestão declarativa via `supabase config push` no futuro, esse passo manual pode ser eliminado.

## Highlights para divulgação (modelo)
- "X viagens organizadas sem sair do app no primeiro mês."
- "Anexe a passagem e o roteiro se preenche sozinho."
