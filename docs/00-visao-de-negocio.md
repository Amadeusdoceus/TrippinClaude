# 00 — Visão de Negócio (Trippin)

> **Documento de Visão de Negócio (VN)** — o artefato-gênese do produto. É a partir dele que
> nascem a especificação de UX/UI, o backlog, os planos de QA e o rollout.
>
> **Versão didática.** Este documento é, ao mesmo tempo, (a) uma VN real e completa do Trippin e
> (b) um material de estudo para um Product Owner que evolui para Product Manager. Por isso, ao
> final de cada seção há uma caixa **💡 Nota do PM** explicando *por que* a seção existe, *como*
> preenchê-la, as armadilhas comuns e o que muda entre o papel de **PO** e o de **PM**. Removendo
> as caixas, sobra um documento profissional limpo.

| Campo | Valor |
|---|---|
| **Produto** | Trippin — planejador de viagens em grupo |
| **Tipo de documento** | Visão de Negócio (Product Vision / Business Vision) |
| **Autor (papel)** | Product Manager |
| **Versão** | 1.0 |
| **Data** | 2026-06-26 |
| **Status** | Vigente — reflete o app entregue (v1.0.2) e o roadmap acordado |
| **Público do documento** | Liderança, time de engenharia, design, QA e stakeholders de negócio |
| **Documentos derivados** | `01-VN-revisada`, `02-UXUI-spec`, `03-backlog`, `04-qa-report`, `05-vv-report`, `06-rollout-plan`, `07-*` |

---

## 1. Como usar este documento

A **Visão de Negócio** responde a uma única pergunta antes de qualquer linha de código:
**que problema vamos resolver, para quem, por que vale a pena e como saberemos que deu certo?**
Ela é deliberadamente *curta em "como técnico"* e *longa em "porquê de negócio"* — mas, neste
produto, decidimos incluir uma seção dedicada às **decisões de tecnologia** (seção 10), porque
elas moldaram o que foi possível entregar e em quanto tempo. Um PM não precisa desenhar a
arquitetura, mas **precisa entender e patrocinar as escolhas técnicas** que afetam custo, prazo,
risco e experiência.

**Onde a VN entra no fluxo:** ela é o **primeiro** documento. Tudo a jusante (design, backlog,
testes, lançamento) deve ser rastreável até uma frase desta VN. Se uma tarefa do backlog não
serve a nenhum objetivo daqui, ela é candidata a ser cortada.

> 💡 **Nota do PM:** a VN é o seu "contrato de intenção" com a empresa. Ela não é um documento de
> requisitos (isso é o backlog) nem de telas (isso é o UX spec). O erro clássico de quem vem de PO
> é encher a VN de funcionalidades e telas. **Resista.** A VN boa cabe em poucas páginas e quase
> não muda durante a execução — o que muda é o backlog. Se você está reescrevendo a VN toda semana,
> provavelmente colocou nela coisas que pertenciam a outro documento.

---

## 2. Resumo executivo (TL;DR)

Viajar em grupo hoje significa caçar informação em seis apps diferentes. O **Trippin** centraliza
voos, estadias, eventos, despesas, fotos, roteiro e mapa em um só lugar que funciona **offline** e
mantém o grupo sincronizado — e seu diferencial é **ler os documentos anexados** (a passagem em
PDF, a reserva) para **preencher o cronograma automaticamente**, alertando sobre conflitos.
Sucesso = grupos organizando viagens inteiras **sem sair do app**, com onboarding em menos de 3
minutos.

> 💡 **Nota do PM:** o TL;DR é a única parte que muitos executivos vão ler. Escreva-o **por último**
> e force-se a caber em ~4 frases: problema → solução → diferencial → critério de sucesso. Se você
> não consegue resumir o produto em um parágrafo, a visão ainda não está clara o suficiente para o
> time executar.

---

## 3. Problema / oportunidade

Viajantes em grupo lidam com informação **fragmentada** em múltiplos apps e canais:

- passagens no **e-mail**,
- reservas no **Booking / Airbnb**,
- ingressos em **PDFs soltos**,
- despesas no **Splitwise**,
- roteiro combinado no **WhatsApp**,
- localização no **Google Maps**.

Não existe um lugar único que **reúna tudo**, funcione **offline** (sinal ruim é a norma em
viagem) e mantenha **o grupo sincronizado**. O custo disso é tempo perdido, retrabalho de
organização e o atrito recorrente de "quem tem a reserva?", "que horas é o voo?", "quanto cada um
já pagou?".

**Oportunidade:** transformar esse esforço manual de consolidação em algo automático — começando
pelo ponto de maior dor, que é montar e manter o **roteiro/cronograma**.

> 💡 **Nota do PM:** ancore o problema em **comportamento observável**, não em opinião. "As pessoas
> usam 6 apps e copiam dados à mão" é verificável; "as pessoas odeiam planejar viagens" é achismo.
> Liste os concorrentes indiretos (aqui: e-mail, Booking, Splitwise, WhatsApp, Maps) — eles definem
> a régua de qualidade e revelam contra o que você realmente compete: o hábito atual do usuário,
> não outro app de viagem.

---

## 4. Usuários-alvo & personas

| Persona | Quem é | O que mais valoriza |
|---|---|---|
| **Organizador** | Cria o grupo, convida pessoas, administra integrantes, finaliza a viagem | Controle, visão geral, reduzir trabalho de coordenação |
| **Integrante** | Participa, consulta o roteiro, anexa documentos, registra despesas e fotos | Saber o que/quando/onde sem perguntar; contribuir sem fricção |
| **Convidado externo** | Recebe convite por e-mail, instala o app e ingressa na viagem | Entrar rápido, sem cadastro penoso |

**Perfil comum:** familiaridade média com apps de viagem (Maps, Airbnb), valoriza **simplicidade**
e quer **reduzir o esforço** de organização — não quer aprender uma ferramenta complexa.

> 💡 **Nota do PM:** note que as três personas têm **permissões e jornadas diferentes** dentro do
> mesmo produto (admin vs membro vs convidado). Mapear isso cedo evita o erro de desenhar tudo para
> "o usuário" genérico e depois descobrir, no meio do desenvolvimento, que metade das telas precisa
> de regra de papel. Persona, para PM, não é demografia bonita de slide — é **um conjunto de
> objetivos + permissões** que orienta priorização.

---

## 5. Proposta de valor & diferencial

**Promessa central:** um app que **centraliza toda a viagem** (voos, estadias, eventos, ingressos,
despesas, fotos, roteiro e mapa) e que **lê os documentos anexados para preencher o cronograma
automaticamente** — transformando um PDF de passagem em blocos de agenda, alertando sobre conflitos
e mantendo tudo disponível **offline**.

| Pilar | Sem Trippin | Com Trippin |
|---|---|---|
| **Centralização** | 6 apps + WhatsApp | 1 app, todas as abas |
| **Inteligência de documentos** | digitar o roteiro à mão | anexou a passagem → cronograma se preenche |
| **Offline** | abre o e-mail… sem sinal | conteúdo baixado fica acessível |
| **Grupo sincronizado** | "manda print aí" | todos veem a mesma viagem |

O **diferencial defensável** é a *inteligência de documentos*: é o que mais entrega valor **e** o
que é mais difícil de copiar bem — por isso é o coração do produto, não um extra.

> 💡 **Nota do PM:** distinga **proposta de valor** (a promessa ao usuário) de **diferencial
> competitivo** (por que é difícil de copiar). Centralizar viagem qualquer um faz; **ler a passagem
> e montar o roteiro** é o fosso. Como PM, é seu trabalho identificar esse "1 recurso que justifica
> o produto existir" e proteger o investimento nele contra a tentação de pulverizar esforço em dez
> features medianas.

---

## 6. Objetivos & métricas de sucesso

**North Star Metric:** **viagens organizadas e concluídas por usuário ativo** — captura o valor
central (centralizar e organizar a viagem de ponta a ponta).

**Métricas de negócio (metas de 30 dias após GA):**

| Métrica | Definição | Meta 30d |
|---|---|---|
| MAU | usuários únicos ativos no mês | 1.000 |
| Viagens criadas | total de grupos criados | 300 |
| Taxa de convite aceito | convidados que instalam e entram | 35% |
| NPS | pesquisa pós-viagem | ≥ 50 |

**Métricas de produto/qualidade (gatilhos internos):** taxa de erro de API < 1%, latência p95 <
500 ms, abandono no onboarding < 25%, **sucesso de leitura de Docs ≥ 80%**, conflitos de
cronograma resolvidos ≥ 60%.

**Critério de experiência:** onboarding completo em **menos de 3 minutos**.

> 💡 **Nota do PM:** escolha **uma** North Star e derive o resto dela. O teste de uma boa North Star:
> ela sobe **somente** quando o usuário recebeu valor real? "Viagens concluídas" passa; "cliques" ou
> "telas vistas" não (sobem mesmo quando o usuário está perdido). Separe **métricas de divulgação**
> (para o negócio: MAU, NPS) de **métricas de melhoria contínua** (para o time: latência, sucesso do
> parser). E defina o número-alvo **antes** de lançar — métrica sem meta é só um gráfico bonito.

---

## 7. Escopo do MVP (v1)

Priorizado por **valor central × viabilidade**. O MVP entrega a espinha dorsal de organização da
viagem:

1. **Onboarding** — seleção de idioma + criação de perfil (com código de usuário de 6 dígitos).
2. **Home** — viagens ativas, criar viagem, participar de viagem (por código), viagens anteriores.
3. **Criar viagem** — nome, datas, múltiplos destinos com busca, código de viagem de 12 dígitos.
4. **Viagem ativa** com abas: **Cronograma, Mapa, Docs, Galeria, Sugestões, Integrantes**.
5. **Cronograma** estilo calendário (mês/semana/dia), inclusão de atividades, **conflitos visíveis**.
6. **Docs com inteligência (must-have)** — leitura do anexo → preenchimento do cronograma + alerta
   de conflito.
7. **Integrantes** — administração, convite por e-mail, múltiplos admins.
8. **Notificações** + **barra lateral de navegação (drawer)**.
9. **Despesas** com divisão e notificação ao impactado.

**Incremento pós-MVP já entregue:** **Busca de hospedagem** — página standalone que compara
hotéis/pousadas/aluguéis de vários sites e permite **confirmar uma estadia e adicioná-la ao
cronograma** da viagem (ver seção 10 e `07-busca-hospedagem.md`).

> 💡 **Nota do PM:** "MVP" não é "versão capada" — é **o menor conjunto que entrega a promessa
> central e permite aprender**. O critério aqui foi explícito: a *inteligência de Docs* é must-have
> porque sem ela o Trippin é só mais um caderno de viagem. Tudo o que não serve diretamente a "montar
> e manter o roteiro" foi empurrado para depois. Saber dizer **não** (próxima seção) é metade do
> trabalho de escopo.

---

## 8. Fora de escopo / roadmap (v2+)

O que **conscientemente não** entra na v1, com o porquê:

| Item adiado | Por quê | Quando |
|---|---|---|
| Rastreamento de localização em tempo real (mapa de calor do percurso) | Alto custo de bateria/privacidade; valor não comprovado | v2 |
| "Recomendações Trippin" (baseadas em dados agregados da base) | Depende de **massa de usuários** que ainda não temos | v2 |
| Tradução completa dos 10 idiomas | v1 entrega a infra i18n + PT-BR e EN-US completos; resto é trabalho contínuo de localização | contínuo |
| Integração nativa de deslocamento (Google Directions) | Custo por chamada; v1 simula o cálculo de tempo | v2 |
| **Preços ao vivo de hospedagem** | APIs gratuitas com preço caíram/fecharam; arquitetura já pronta para plugar parceiro | quando houver chave de parceiro |

> 💡 **Nota do PM:** a seção "fora de escopo" é tão importante quanto a de escopo — é onde você
> **documenta as decisões de não-fazer** para que ninguém precise re-debatê-las daqui a três meses.
> Sempre registre o **motivo** e a **condição de reentrada** ("quando houver massa de usuários",
> "quando houver chave de parceiro"). Isso transforma um "não" em um "ainda não, sob tal condição" —
> muito mais fácil de alinhar com stakeholders ansiosos.

---

## 9. Decisões de tecnologia e seus porquês

> Esta seção normalmente seria mais sucinta numa VN tradicional; está expandida aqui porque é
> exatamente o que você quer estudar. Cada decisão segue o formato **o quê → alternativas → porquê →
> trade-off**, que é o jeito de registrar uma escolha técnica de forma defensável.

| # | Decisão | Alternativas consideradas | Por que escolhemos | Trade-off aceito |
|---|---|---|---|---|
| 1 | **Front em arquivo único HTML + React 18 via CDN, sem bundler/build** | Create React App, Vite, Next.js | Iteração instantânea (salvar → recarregar), zero toolchain, hospedável como arquivo estático, fácil de depurar | Script inline gigante → risco de "tela branca" por chave/parêntese desbalanceado |
| 2 | **Hospedagem em GitHub Pages** (repo privado, URL pública) | Vercel, Netlify, servidor próprio | Custo zero, deploy automático por `git push` via GitHub Actions, sem operação de servidor | Site é estático — toda lógica de servidor precisa morar em outro lugar (→ decisão 3) |
| 3 | **Backend no Supabase** (Postgres + Auth + Storage + Edge Functions em Deno/TS) | Firebase, backend próprio (Node/Express) | BaaS elimina ops; banco relacional de verdade; **Row Level Security** protege dados por usuário; tier gratuito; Edge Functions guardam segredos | Lock-in parcial no fornecedor; limites do tier free |
| 4 | **Modelo de segurança: chave pública no front, segredos só no servidor** | Esconder todas as chaves | A chave `anon/publishable` **pode** ser pública — quem protege os dados é o **RLS**, não a chave. `service_role` e chaves de e-mail vivem só como *secrets* das Edge Functions | Exige disciplina: nunca commitar `service_role` (regra não-negociável do `07-revisao-e-banco.md`) |
| 5 | **Persistência offline-first com `localStorage` + camada de sync `TrippinAPI`** | Só nuvem; banco local complexo (IndexedDB/SQLite) | Requisito de produto é **funcionar offline**; `localStorage` é simples e suficiente; sync com estratégia *last-write-wins* | Conflitos de edição simultânea resolvidos de forma simples (último a escrever vence) + log de auditoria |
| 6 | **Mobile = Expo + React Native WebView** carregando o GitHub Pages com *cache-busting* | App nativo do zero; PWA pura | **Um código só** (a web app) serve web, Android e iOS; publica nas lojas via Expo/EAS sem reescrever; cache-busting garante sempre a versão mais nova (`mobile/App.js`) | Não é nativo puro — gestos/performance limitados ao que a WebView oferece |
| 7 | **Inteligência de Docs = parser estruturado + OCR no cliente + confirmação humana** | OCR/LLM em servidor desde a v1 | Evita custo e complexidade de infra de IA na v1; o usuário confirma antes de gravar, controlando o risco de leitura errada | Cobre só padrões conhecidos de documento; casos fora do padrão exigem preenchimento manual |
| 8 | **Mapa renderizado localmente (DestPinMap) + Nominatim/OSM para busca de lugar** | Google Maps / Places API | Sem custo por chamada e sem chave; suficiente para a visão de cidades/pinos da v1 | Menos recursos que o Google Maps (sem rotas nativas, etc.) |
| 9 | **Busca de hospedagem via Edge Function com conectores plugáveis** | Scraping direto dos sites; uma API fixa | Scraping fere ToS/anti-bot; conectores plugáveis permitem ligar fontes sem reescrever. Padrão keyless **OpenStreetMap/Overpass** traz hotéis reais (sem preço ao vivo), e os "slots" de parceiro ligam sozinhos quando a chave existir | Sem chave de parceiro, não há **preço ao vivo** — o card leva à reserva no site |
| 10 | **Qualidade: Playwright E2E + `validate-code.js`, com `npm run review` antes do push** | Testar manualmente; sem CI | Incidentes repetidos de "tela branca" tornaram a revisão **obrigatória**: `validate-code.js` pega sintaxe/chaves; Playwright garante que nenhuma tela quebra. A suíte **cresce junto com cada feature** | Custo de manter testes — aceito, porque o custo de uma tela branca em produção é maior |
| 11 | **i18n: infra completa + PT-BR e EN-US; demais idiomas como stub** | Traduzir os 10 de uma vez | Entrega o alcance principal sem travar o cronograma na localização | Idiomas restantes ficam incompletos até o trabalho contínuo de tradução |

> 💡 **Nota do PM:** você não precisa **tomar** essas decisões sozinho — quem decide arquitetura é a
> engenharia. Mas você precisa **entender o trade-off de negócio** de cada uma e ser capaz de
> defendê-la para um stakeholder. Repare no padrão: quase toda decisão troca **sofisticação por
> velocidade/custo na v1** (CDN em vez de bundler, WebView em vez de nativo, parser em vez de LLM,
> OSM em vez de Google). Isso é coerente com a estratégia "MVP barato para aprender primeiro,
> sofisticar onde o uso provar que vale". Quando registrar uma decisão técnica, **sempre anote o
> trade-off aceito** — é o que protege o time quando alguém perguntar "por que não usaram X?" no
> futuro.

---

## 10. Riscos, premissas & dependências

| Risco | Impacto | Mitigação na v1 |
|---|---|---|
| Leitura/parsing de documentos heterogêneos | Alto | Parser com padrões conhecidos + **confirmação do usuário** antes de gravar |
| Dependência de Maps/Places (custo por chamada) | Médio | Mapa local + OSM; busca só a partir de 3 letras; debounce; cache |
| Sincronização offline ↔ online com conflitos | Alto | *Last-write-wins* + log de auditoria por ação |
| Privacidade (CPF, localização) — LGPD | Alto | CPF **opcional** na v1; **sem** rastreio de localização na v1 |
| Fontes gratuitas de preço de hospedagem instáveis | Médio | Conectores plugáveis; padrão keyless (OSM) sem preço ao vivo; pronto para parceiro |

**Premissas:** existe demanda por organização de viagem em grupo; usuários topam instalar um app
dedicado; o tier gratuito de Supabase/Pages suporta o volume inicial.

> 💡 **Nota do PM:** risco bom é **acionável** — tem dono, impacto e mitigação. "Pode dar problema de
> performance" não é risco; "chamadas de Maps podem estourar o custo > meta por viagem" é, porque dá
> para medir e mitigar. Liste também **premissas** explicitamente: são os "se isto for falso, a visão
> rui". Revisitá-las periodicamente é como você descobre cedo que precisa pivotar.

---

## 11. Critérios de sucesso (definição de "visão atingida")

A visão da v1 é considerada cumprida quando:

- Um grupo consegue **criar uma viagem, convidar e organizar o roteiro sem sair do app**.
- **Anexar um documento de passagem popula o cronograma** sem digitação manual.
- Conteúdo (ingressos/arquivos) fica **acessível offline**.
- **Onboarding** completo em **menos de 3 minutos**.

> 💡 **Nota do PM:** critério de sucesso é **binário e verificável** — ou o grupo organizou a viagem
> sem sair do app, ou não. Isso vira a base dos critérios de aceite no backlog (`03`) e dos testes
> (`04`/`05`). Se você não consegue imaginar como **testaria** um critério, ele ainda está vago
> demais para entrar aqui.

---

## 12. Perguntas em aberto (decisões de negócio pendentes)

1. **CPF é obrigatório?** Cria fricção alta e implica LGPD. *Sugestão: opcional na v1.*
2. **A inteligência de Docs usará OCR/LLM?** Define o custo de infra. *Sugestão: parser estruturado
   + fallback manual na v1; reavaliar com base na taxa de sucesso real.*
3. **Rastreio de localização em tempo real justifica o custo de privacidade/bateria?** *Sugestão:
   adiar para v2.*

> 💡 **Nota do PM:** uma VM madura **não esconde** o que ainda não foi decidido — ela lista as
> perguntas abertas com uma **recomendação** para cada. Isso mostra liderança (você tem uma opinião)
> sem fingir certeza que não existe. Cada pergunta aberta deveria ter um dono e um prazo de decisão.

---

## 13. Mapa do ciclo de documentação de produto

Esta VN é o **primeiro elo** de uma cadeia. Cada documento responde a uma pergunta diferente e
alimenta o próximo:

```
00 Visão de Negócio (este doc)   ← POR QUE / PARA QUEM / O QUE / COMO MEDIR
        │
        ▼
01 VN revisada                   ← a VN passada por um crivo crítico (escopo afiado, riscos)
        │
        ▼
02 Especificação UX/UI           ← COMO o usuário experimenta (fluxos, telas, estados, identidade)
        │
        ▼
03 Backlog (épicos e tarefas)    ← O QUE construir, em que ordem, com critérios de aceite
        │
        ▼
04 QA report                     ← a entrega faz o que prometeu? (casos de teste, defeitos)
        │
        ▼
05 V&V report                    ← verificação & validação: construímos certo E construímos a coisa certa
        │
        ▼
06 Rollout plan + métricas       ← COMO lançar com segurança e COMO saber se deu certo
        │
        ▼
07 Operação contínua             ← revisão obrigatória antes do push, acesso ao banco, novas features
                                   (ex.: 07-busca-hospedagem)
```

| Documento | Pergunta que responde | Quem normalmente lidera |
|---|---|---|
| **00/01 — Visão de Negócio** | Por que existimos? Para quem? Como medimos sucesso? | **Product Manager** |
| **02 — UX/UI spec** | Como o usuário vive isso, tela a tela? | **Designer (UX/UI)**, com o PM |
| **03 — Backlog** | O que construir e em que ordem? | **Product Owner** (a partir da visão) |
| **04 — QA report** | Funciona como especificado? | **QA** |
| **05 — V&V report** | É o produto certo, bem construído? | **QA / Eng**, validado pelo PM |
| **06 — Rollout & métricas** | Como lançar e medir? | **PM + Growth/Dados** |
| **07 — Operação** | Como mantemos qualidade e evoluímos? | **Eng + PM** |

> 💡 **Nota do PM — a transição que te interessa:** repare quem lidera cada artefato. O **PO** vive
> mais perto do **03 (backlog)** — refinando histórias, ordenando o que entra no próximo ciclo,
> destravando o time no dia a dia. O **PM** "sobe" para o **00/01 (visão)** e o **06 (métricas)** — é
> dono do *porquê* e do *como sabemos que deu certo*, e responde por *resultado de negócio*, não por
> entrega de funcionalidades. Não é que o PM abandone o backlog; é que ele passa a **derivar** o
> backlog de uma visão e de métricas que ele mesmo definiu. Crescer de PO para PM é, na prática,
> **assumir a autoria deste documento** e a responsabilidade pela North Star — em vez de receber a
> visão pronta de outra pessoa.

---

## 14. Apêndice — PO vs PM (referência rápida)

| Dimensão | Product Owner | Product Manager |
|---|---|---|
| **Pergunta central** | Estamos construindo as coisas direito? | Estamos construindo as coisas certas? |
| **Horizonte** | Sprint / próximo ciclo | Trimestre / ano / estratégia |
| **Artefato que lidera** | Backlog, histórias, critérios de aceite | Visão, estratégia, métricas, roadmap |
| **Mede-se por** | Entrega previsível, backlog saudável | Resultado de negócio (North Star, receita, retenção) |
| **Principal interlocutor** | Time de desenvolvimento | Stakeholders, liderança, mercado, dados |
| **Decisão típica** | "Esta história está pronta para o dev?" | "Vale a pena existir esta funcionalidade?" |

**Como praticar a evolução com este próprio projeto:** tente, como exercício, **escrever a próxima
VN do zero** para uma feature nova (por exemplo, "preços ao vivo de hospedagem"): defina problema,
persona impactada, proposta de valor, **uma** métrica de sucesso, escopo mínimo, o que fica de fora
e os trade-offs técnicos. Depois compare com o backlog que sairia dela. Esse caminho — da visão ao
backlog — é o músculo central do PM.

---

> *Documento mantido em `docs/00-visao-de-negocio.md`. As caixas "💡 Nota do PM" são material de
> estudo e podem ser removidas para gerar a versão executiva limpa.*
