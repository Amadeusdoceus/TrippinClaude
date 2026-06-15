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

## Highlights para divulgação (modelo)
- "X viagens organizadas sem sair do app no primeiro mês."
- "Anexe a passagem e o roteiro se preenche sozinho."
