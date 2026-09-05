# 08 — Mapeamento de Integração com o App Existente

> Consulta `app/src/trippin-api.js` (superfície `window.TrippinAPI`), `docs/07-busca-hospedagem.md`
> e `docs/00-visao-de-negocio.md` §9 (modelo de segurança RLS/chave `anon`). Objetivo: dizer com
> precisão o que o site **reaproveita**, o que **adapta** e o que é **novo** — inclusive novo no
> backend, não só no front do site.

---

## 1. Reaproveitado como está

| Item do app | Onde é usado no site | Observação |
|---|---|---|
| Edge Function `search-stays` e o contrato `Stay` | `/hospedagem` (demo ao vivo) | Chamada direto pelo cliente Supabase do site (`07-especificacao-tecnica-frontend.md` #6) — mesma função, mesmas envs (`TRAVELPAYOUTS_TOKEN`, `RAPIDAPI_KEY`), inclusive o fallback `demo:true` |
| Modelo de segurança "chave `anon` pública + RLS protege dados" (`docs/00` §9, decisão #4) | Todo o site | O site é um novo cliente do mesmo projeto Supabase — segue a mesma regra: nunca expor `service_role`, RLS é quem decide o que é lido |
| Texto da `PrivacyPolicyScreen` | `/politica-de-privacidade` | Copiado, não reescrito (ver `03-especificacao-conteudo-por-pagina.md`) |
| Números de precificação de `docs/08-rollout-money-steps.md` | `/precos` | Fonte única de verdade — o site não define preço próprio |
| Nomenclatura de telas/abas do app (Cronograma, Docs, Mapa, Sugestões, Integrantes) | Copy de todas as páginas de categoria | Evita divergência de vocabulário entre app e site (exigência do `01-prd.md` cabeçalho) |
| Parser de passagem (`interpretador-passagem.html`) | `/voos` | Mesma lógica de leitura client-side, sem servidor, embutida como vitrine interativa |

## 2. Reaproveitado com adaptação

| Item do app | Adaptação no site | Por quê |
|---|---|---|
| **Autenticação (`TrippinAPI.auth`, Supabase Auth)** | `/entrar` faz **handoff** para o fluxo de login/cadastro do app — o site **não** implementa um formulário de cadastro paralelo | Duas telas de auth = duas fontes de verdade para identidade de usuário e sessão consciente de RLS; handoff evita isso. Resolve a decisão pendente do `01-prd.md` §7.1 |
| **`MapTab` (cidades/pinos)** | `/turismo` e `/turismo/[destino]` reaproveitam o **formato de dado** (nome, país, coordenadas), mas exibidos numa grade/herói de marketing, não no mapa interativo do app | O site precisa de apresentação editorial (imagem, texto), o app precisa de navegação funcional — mesmo dado, dois usos |
| **`ScheduleTab` (blocos de atividade)** | `/roteiros/[exemplo]` usa o mesmo formato de bloco (dia, cidade, atividade) como **exemplo estático**, não uma viagem real | Site mostra o conceito; dado real de uma viagem específica só aparece se `/viagem/[codigo]` for aprovada (ver §3) |
| **`SuggestTab` (eventos)** | `/eventos` usa o mesmo formato de card, sem o CTA de "ingressar" que existe dentro da viagem no app | CTA de ingressar só faz sentido dentro do contexto de uma viagem já criada |

## 3. Novo para o site (inclusive novo no backend)

| Item | Tipo | Detalhe |
|---|---|---|
| Copy de marketing, heróis em vídeo, parallax, glass cards | Frontend | Não existe equivalente no app — é a camada de apresentação definida em `04`, `05`, `06` |
| Cliente Supabase próprio do site (`lib/supabase-client.ts`) | Frontend | Não importa `trippin-api.js` (motivo em `07` #6) — implementação nova, mesmo schema |
| **`/viagem/[codigo]` — página pública de viagem** *(condicional a `01-prd.md` §7.3)* | **Frontend + Backend** | Hoje o modelo de acesso a `trips` no Supabase é pensado para **membros autenticados** da viagem (RLS por participação) — não existe leitura pública por código. Se esta página entrar em escopo, é preciso **criar uma nova política RLS** que permita leitura anônima e restrita (ex.: só campos de resumo/roteiro, nunca despesas ou dados de membros) de uma viagem pelo código de 12 dígitos. **Isto é escopo de backend novo, não reaproveitamento** — precisa de revisão de segurança equivalente ao rigor de `docs/00` §9 decisão #4 antes de implementar |
| Formulário de captura leve (e-mail) na Home, se decidido | Frontend + Backend leve | Não existe hoje nenhuma tabela de leads/waitlist no schema atual — seria uma tabela nova, pequena, fora do modelo de `trips`/`members` |

## 4. Implicação de segurança a registrar

O site é **um novo cliente** do mesmo projeto Supabase do app. Toda nova leitura que o site
precisar (a mais sensível sendo `/viagem/[codigo]`) precisa de política RLS própria, avaliada com o
mesmo cuidado do app: a chave `anon` pode continuar pública porque **quem protege o dado é a
política**, nunca a chave. Antes de implementar `/viagem/[codigo]`, a política precisa garantir
explicitamente que **campos de despesas e identificação de membros não vazam** para leitura anônima
— só o necessário para a vitrine (nome da viagem, destinos, resumo do roteiro).

## 5. Assunções feitas

Assumido que `07-especificacao-tecnica-frontend.md` já havia fixado "site chama Supabase
diretamente, sem importar `trippin-api.js`" — confirmado por leitura direta daquele documento (não
foi assunção, o documento já existia no momento da escrita deste).
