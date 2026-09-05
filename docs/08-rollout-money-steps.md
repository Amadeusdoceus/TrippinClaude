# 08 — Rota de Monetização (Custos, Rollout e Precificação)

> Modelo financeiro: custos de infraestrutura, plano de rollout em 5 fases e o preço da
> versão Premium — calculados a partir do MAU-alvo de cada fase, não escolhidos no escuro.

| Campo | Valor |
|---|---|
| **Produto** | Trippin — planejador de viagens em grupo |
| **Tipo de documento** | Modelo de custos, rollout e precificação |
| **Data** | 2026-09-02 |
| **Escopo** | Apple, Google, Supabase, Claude/LLM, Brevo, domínio, GitHub, aquisição de usuários |
| **Moeda base** | USD (custos são cobrados em USD); preço ao consumidor em BRL, câmbio ≈ R$5,10/US$1 |
| **Documentos relacionados** | `00-visao-de-negocio`, `06-rollout-plan` |

---

## 0. Como ler este modelo

Duas decisões erradas comuns em precificação: (1) copiar o preço de um concorrente sem
checar se cobre o próprio custo, e (2) fixar uma meta de conversão sem saber se ela é
realista. Este documento faz o caminho inverso: parte do custo real de cada fase, do
preço praticado por produtos comparáveis e de benchmarks de mercado para **calcular**
qual conversão o Trippin precisa atingir — mostrando onde essa meta é folgada
(infraestrutura) e onde é apertada (aquisição paga).

**Números-chave:**

| Métrica | Valor |
|---|---|
| Preço de lançamento (Fase M2) | R$14,90/mês (≈ US$2,92) |
| Preço estabilizado (a partir da Fase M4) | R$24,90/mês (≈ US$4,88) |
| Investimento até lucrar (burn acumulado M2→M4, ~15 meses) | ≈ US$25 mil |
| Conversão de Organizadores necessária para lucro (Fase M5) | 6–8% |

**Duas leituras importantes antes de continuar:**

- **A unidade de valor é o Organizador, não o MAU.** Só quem cria e administra a viagem
  (Organizador) tem motivo para pagar — os Integrantes entram de graça pelo convite.
  Assumindo grupo médio de 5 pessoas por viagem, Organizadores ≈ MAU ÷ 5. Toda meta de
  conversão neste documento é medida sobre essa base, não sobre o total de usuários.
- **"Anúncio" tratado como verba de aquisição, não como receita de ads.** O pedido original
  incluía "preço... para anúncio" — interpretado aqui como orçamento de marketing/aquisição
  pago (Meta, Google UA, influenciadores), não como venda de espaço publicitário dentro do
  app. Monetização por anúncios no plano gratuito é uma alavanca futura possível, não
  modelada aqui (ver §7).

---

## 1. Premissas do modelo

Todo número abaixo depende destas oito hipóteses. Recalibrar qualquer uma delas com dados
reais de produção muda os resultados — trate isto como um modelo vivo, não uma previsão.

| Premissa | Valor adotado | Base |
|---|---|---|
| Tamanho médio do grupo por viagem | 5 pessoas (1 Organizador + 4 Integrantes) | Persona do doc `00-visao-de-negocio` — não medido em produção ainda |
| Comissão de loja (Apple/Google) | 15% | Small Business Program — receita anual projetada fica < US$1M em todas as fases (§5) |
| Custo de aquisição pago (CPI) | ≈ US$3,00/instalação | Blend iOS US$4,20–5,84 / Android US$1,92–3,70, categoria viagem |
| Instalação → Organizador | 70% | Estimativa — onboarding de 3 min já cria uma viagem (meta do doc 00) |
| Custo por parse de documento (Claude) | ≈ US$0,006/chamada | Haiku 4.5 (90% dos casos) + Sonnet 4.6 (10%, fallback), ~3k tok in / 400 tok out |
| Docs processados por Premium/mês | 4, metade via parser local | Decisão técnica #7 da VN: parser primeiro, LLM só de apoio |
| Câmbio USD/BRL | R$5,10 | Cotação 02 set 2026 — flutua; recalibrar antes de fixar preço final |
| Churn mensal do Premium | 8% (cenário-base) | Benchmark de assinatura consumer; produto tem retenção estrutural (offline + grupo trava o usuário) |

---

## 2. Tabela mestra de custos por fase

Custo recorrente mensal (US$) por categoria, na escala de usuários esperada em cada fase.
Front (Apple/Google/domínio/GitHub Pages) e back (Supabase/Brevo/Claude) somados — o
Trippin não separa hospedagem de front e back hoje (GitHub Pages serve o app estático;
Supabase é o único back-end pago).

| Categoria | M1 · Validação | M2 · Lançamento | M3 · Crescimento | M4 · Escala | M5 · Maturidade |
|---|---:|---:|---:|---:|---:|
| Apple Developer Program | $8,25 | $8,25 | $8,25 | $8,25 | $8,25 |
| Google Play Console | $2,08* | — | — | — | — |
| Domínio (novo, .com) | $1,25 | $1,25 | $1,25 | $1,25 | $1,25 |
| GitHub (Pages/Actions) | $0 | $0 | $12 | $20 | $32 |
| Supabase (DB/Auth/Edge Fn) | $0 | $25 | $45 | $60 | $232,50 |
| Brevo (e-mail transacional) | $0 | $9 | $29 | $80 | $499 |
| Claude / LLM (parsing Docs) | $0 | ~$3 | ~$15 | ~$68 | ~$180 |
| Marketing & aquisição paga | $300 | $729 | $2.591 | $5.242 | $6.512 |
| Campanhas de rollout (criativos, influência, referral) | incl. acima | incl. acima | incl. acima | incl. acima | incl. acima |
| **Total mensal (run-rate)** | **$311,58** | **$775,25** | **$2.700,25** | **$5.479,25** | **$7.464,75** |

\* Google Play é taxa única de US$25 — mostrado amortizado no 1º ano só para leitura de
run-rate. Claude/LLM e Marketing crescem com o nº de pagantes/instalações de cada fase —
ver §3 e §4 para a memória de cálculo. Supabase M5 assume plano Pro + overage (não o Team,
US$599 fixo — ver nota na Fase M5).

---

## 3. Plano de rollout em 5 fases

Cada fase tem uma meta de MAU, um preço e uma conversão-alvo em duas leituras: a
conversão que só **paga a infraestrutura** (quase sempre folgada) e a que **paga
infraestrutura + marketing do mês** (a meta de verdade, porque é ela que decide se o
produto se sustenta sozinho).

### M1 — Validação gratuita (Meses 1–2)

| | |
|---|---|
| MAU-alvo | 1.000 |
| Organizadores | ≈ 200 |
| Preço | Gratuito |
| Custo do mês | $311,58 |
| Status | Sem receita — só custo |

Ligar o paywall antes de bater as metas de qualidade do doc `06-rollout-plan` (sucesso de
leitura de Docs ≥ 80%, onboarding < 3 min, NPS ≥ 50) queima a primeira impressão dos early
adopters com um produto que ainda não provou o diferencial. **M1 é 100% custo — objetivo é
sinal de produto, não receita.**

Supabase e Brevo seguem no tier gratuito (1.000 MAU está bem dentro dos limites de 50k
MAU / 500MB / 300 e-mails-dia). Único risco a observar: armazenamento de fotos de viagem
pode pressionar o teto de 1GB do Free antes do teto de MAU.

### M2 — Lançamento do Premium (Meses 3–5)

| | |
|---|---|
| MAU-alvo | 5.000 |
| Organizadores | ≈ 1.000 |
| Preço | R$14,90/mês |
| Custo do mês | $775,25 |
| Conversão só p/ cobrir infraestrutura | 1,9% |
| Conversão p/ cobrir infra + marketing (meta real) | 33,1% |
| Status | Fase de investimento |

**O que é Premium:** viagens ilimitadas (Free trava em 1 viagem ativa), parsing
inteligente de Docs via Claude como reforço do parser local, sincronização prioritária,
sem marca Brevo nos e-mails. Preço de entrada agressivo — abaixo de TripIt Pro (US$49/ano)
e Wanderlog Pro (US$39,99/ano) — para gerar dado real de conversão com uma base pequena.

**Leitura honesta:** 33% de conversão de Organizadores é fora da curva de mercado
(freemium roda 2–5%). M2 não deve nem tentar ser lucrativo — a uma conversão realista de
3% (~30 pagantes), o burn é de ~US$700/mês, ou **≈ US$2.100 no trimestre**. É o custo de
aprender o funil real antes de escalar marketing.

### M3 — Crescimento (Meses 6–9)

| | |
|---|---|
| MAU-alvo | 25.000 |
| Organizadores | ≈ 5.000 |
| Preço | R$19,90/mês (novos assinantes) |
| Custo do mês | $2.700,25 |
| Conversão só p/ cobrir infraestrutura | 0,6% |
| Conversão p/ cobrir infra + marketing (meta real) | 17,0% |
| Status | Fase de investimento |

Preço sobe para R$19,90 (≈ US$3,90) nos **novos** assinantes; a coorte do M2 continua em
R$14,90 (grandfathering — tática comum pra virar early adopter em promotor). Mix de
aquisição muda de 80% orgânico/viral (convite de grupo) para 60/40, porque a rede orgânica
inicial começa a saturar.

**Leitura honesta:** a 4% de conversão (realista, puxado pelo diferencial de Docs), o burn
projetado é ~US$2.050/mês → **≈ US$8.200 no quadrimestre**. Ainda fase de investimento —
mas o burn por usuário cai, sinal de que a economia unitária está melhorando.

### M4 — Escala (Meses 10–15)

| | |
|---|---|
| MAU-alvo | 75.000 |
| Organizadores | ≈ 15.000 |
| Preço | R$24,90/mês |
| Custo do mês | $5.479,25 |
| Conversão só p/ cobrir infraestrutura | 0,28% |
| Conversão p/ cobrir infra + marketing (meta real) | 9,0% |
| Status | Fase de investimento |

Preço estabiliza em R$24,90 (≈ US$4,88) — acima dos comparáveis diretos, justificado pelo
diferencial de leitura automática de documentos. Vale testar um plano **"Trippin Grupo"**
cobrado do Organizador cobrindo todos os Integrantes da viagem, já que o produto monetiza
por grupo, não por indivíduo.

**Leitura honesta:** a 5% de conversão, burn ~US$2.410/mês → **≈ US$14.500 no semestre**. É
a fase mais cara em termos de verba de marketing absoluta, porque é aqui que a aquisição
paga passa a fazer metade do crescimento.

### M5 — Maturidade & lucratividade (Meses 16–24)

| | |
|---|---|
| MAU-alvo | 150.000 |
| Organizadores | ≈ 30.000 |
| Preço | R$24,90/mês |
| Custo do mês | $7.464,75 |
| Conversão só p/ cobrir infraestrutura | 0,64% |
| Conversão p/ lucro real (marketing incluso) | 6–8% |
| Status | Meta de lucro |

Preço mantém R$24,90 — a alavanca de lucro aqui não é subir preço de novo, é **reduzir o
custo de aquisição** apoiando mais no loop viral do convite de grupo (que já é estrutural
ao produto) e menos em mídia paga.

**Leitura honesta:** em 6% (~1.800 pagantes) o projeto já roda perto do zero a zero; em
**8% (~2.400 pagantes) sobra ~US$2.300/mês de lucro**, ~24% de margem líquida sobre a
receita. Nota: US$232,50/mês de Supabase (Pro + overage) é mais barato que o Team (US$599
fixo) nesta escala — só migrar se precisar de SOC2/backup de 14 dias por exigência de
compliance.

---

## 4. Custo × receita ao longo das fases

Receita líquida (após comissão de loja) na conversão realista de cada fase, contra o custo
total do mês. A curva cruza no meio da Fase M5.

| Fase | Pagantes (cenário) | Receita líquida/mês | Custo/mês | Resultado/mês |
|---|---:|---:|---:|---:|
| M2 | 30 | $70 | $775 | –$705 |
| M3 | 200 | $633 | $2.700 | –$2.067 |
| M4 | 750 | $2.999 | $5.479 | –$2.480 |
| M5 (6%) | 1.800 | $7.196 | $7.465 | –$269 |
| M5 (8%) | 2.400 | $9.595 | $7.465 | +$2.130 |

---

## 5. Por que o CAC decide tudo — não o preço

O custo de servir um Premium é irrisório (infra + Claude somam centavos por usuário). O
que aperta a conta é o custo de conquistar um Organizador pago. Regra de bolso do setor:
LTV deve valer pelo menos 3× o CAC.

**LTV do assinante Premium** (preço R$24,90 · churn 8%/mês):

| | |
|---|---|
| Vida útil média | 12,5 meses |
| Receita bruta acumulada | $48,75 |
| Após comissão de loja (15%) | $41,44 |
| Menos custo Claude/parsing | –$1,88 |
| **LTV líquido** | **≈ $39,56** |

**CAC máximo aceitável (LTV ÷ 3):**

| | |
|---|---|
| CAC-teto saudável | $13,19 |
| CAC pago modelado (CPI/conversão) | $4,29 |
| CAC via convite de grupo (viral) | ≈ $0 |
| Margem de segurança | 3× no canal pago |

**A vantagem estrutural do Trippin:** todo Organizador pago convida ~4 Integrantes de
graça — o produto tem um loop viral embutido que nenhum concorrente genérico de "lista de
tarefas de viagem" tem. Isso é o que sustenta CAC pago em ~US$4,29, bem abaixo do teto de
US$13,19: a prioridade estratégica em M4–M5 é **proteger a taxa de aceite de convite (meta
de 35% no doc 06-rollout-plan)**, não só empurrar mídia paga.

---

## 6. Onde o preço fica frente ao mercado

| Produto | Preço/ano | ≈ /mês | Diferencial |
|---|---:|---:|---|
| TripIt Pro | US$49,00 | US$4,08 | Alertas de voo/assento, monitoramento de tarifa |
| Wanderlog Pro | US$39,99 | US$3,33 | Assistente de IA limitado, mapas offline |
| **Trippin Premium (M2)** | R$178,80 | R$14,90 | Preço de entrada — leitura automática de Docs + grupo |
| **Trippin Premium (M4+)** | R$298,80 | R$24,90 | Preço estabilizado — acima dos comparáveis, com o diferencial provado |

---

## 7. Riscos e próximos passos

**Vigiar de perto:**

- **Supabase MAU pooled de 100k** é ultrapassado dentro da Fase M5 (meta 150k) — o overage
  de $0,00325/usuário já está no custo de M5, mas vale revalidar o preço do plano perto da
  virada.
- **Armazenamento de fotos** pode estourar o teto de 1GB do tier Free do Supabase antes
  mesmo do teto de MAU — watch item já em M1.
- **Brevo escala rápido com convites** (Standard→Professional entre M4 e M5, de $80 para
  $499/mês) — é a linha de custo que mais dispara por usuário adicional.
- **Câmbio USD/BRL** muda a margem em reais sem mudar o custo em dólar — reprecificar se o
  real se desvalorizar >10%.

**Fora de escopo deste modelo:**

- **Monetização por anúncio in-app** no tier gratuito — alavanca de receita adicional não
  modelada; avaliar só depois do MAU de M3 (25k), quando faria diferença real.
- **Custo de horas de engenharia/design/suporte** — o pedido listou custos de fornecedor
  externo; mão de obra própria não entrou na conta de breakeven.
- **Preço ao vivo de hospedagem via parceiro** (chave de afiliado) — item já listado como
  "quando houver chave de parceiro" no roadmap v2; adicionaria receita, não custo.

---

## Fontes

- [Supabase Pricing 2026 — UI Bakery](https://uibakery.io/blog/supabase-pricing)
- [Apple Developer Fee 2026](https://magora-systems.com/apple-developer-fee/)
- [Google Play Console Fee 2026](https://afkarsoftware.com/en/blog-detail/google-play-console-account-2026-one-time-25-fee/)
- [Anthropic API Pricing 2026 — Finout](https://www.finout.io/blog/anthropic-api-pricing)
- [Brevo Pricing 2026 — SendX](https://www.sendx.io/blog/brevo-pricing-plans-costs-alternatives-2026)
- [GitHub Pricing 2026 — eesel](https://www.eesel.ai/blog/github-pricing)
- [Domain pricing 2026 — Namesilo](https://www.namesilo.com/blog/en/domain-name-search/cheapest-com-domain-registrars-2026-comparing-real-long-term-costs)
- [App Store Small Business Program — RevenueCat](https://www.revenuecat.com/blog/engineering/small-business-program)
- [Google Play commission tiers — Qonversion](https://qonversion.io/blog/apple-reduces-app-store-commission-to-15)
- [Mobile App CPI Benchmarks 2026](https://thesocialoutline.com/blog/mobile-app-cpi-benchmarks-2026)
- [Mobile App CAC Benchmark Report 2026](https://semnexus.com/the-2026-mobile-app-cac-benchmark-report-by-vertical)
- [TripIt Pro / Wanderlog Pro pricing 2026](https://monkeyeatingmango.com/blog/tripit-pricing-2026/)

---

> *Modelo construído a partir de `docs/00-visao-de-negocio.md` e `docs/06-rollout-plan.md`
> do repositório Trippin, mais preços de mercado buscados em 02 set 2026. Recalibrar assim
> que houver dados reais de instalação/conversão do produto. Versão interativa (com
> gráfico) publicada em: https://claude.ai/code/artifact/2039789c-f14d-4d13-87d9-136ac5bfaf3e*
