# Plano de Ação — Trippin (projeto A)

**Regra que atravessa todas as fases:** nenhuma tarefa altera comportamento visível de
UI. Se o usuário perceber a mudança, algo saiu do escopo.

Estimativas em dias úteis para **um desenvolvedor**. Total: **~48 dias (≈10 semanas)**.

| Fase | Nome | Duração | Depende de |
|---|---|---|---|
| 0 | Contenção de segurança | 2 d | — |
| 1 | Fundação de dados | 6 d | 0 |
| 2 | Camada única + autenticação real | 10 d | 1 |
| 3 | Migração dispositivo → nuvem | 5 d | 2 |
| 4 | Multiusuário real | 10 d | 3 |
| 5 | Offline-first | 7 d | 4 |
| 6 | LGPD, observabilidade e hardening | 8 d | 5 |

---

## Fase 0 — Contenção de segurança (2 dias, começar hoje)

Corrige o que é explorável agora, sem depender do restante do plano.

| # | Tarefa | Arquivo |
|---|---|---|
| 0.1 | Remover `passwordDisplay` do estado, do cadastro, da troca de senha e da tela de perfil. Adicionar rotina de limpeza que apaga o campo de estados já salvos no primeiro carregamento. | `app/index.html:1031, 3953, 4002-4009` |
| 0.2 | Substituir `send-invite` pela versão endurecida (JWT + verificação de admin + `trip_name` lido do banco + limite de taxa). | `backend/supabase/functions/send-invite/index.ts` |
| 0.3 | **Rotacionar `BREVO_API_KEY`** e remover o literal `amadeuljr@hotmail.com`; falhar explicitamente se `BREVO_SENDER_EMAIL` não estiver definido. | idem |
| 0.4 | CORS por allowlist (`APP_URL` + `localhost` em dev) nas cinco funções. | `backend/supabase/functions/*` |
| 0.5 | Trocar o workflow de deploy pelo de B: job `test` (validate + Playwright) com `deploy: needs: test`. | `.github/workflows/deploy.yml` |
| 0.6 | Adicionar `integrity` + `crossorigin` nas tags `<script>` fixas e fixar versões de pdf.js/Tesseract. | `app/index.html:11-12, 1760, 2098` |

**Critério de aceite**
- `grep -c passwordDisplay app/index.html` → `0`.
- Chamada anônima a `send-invite` responde `401`.
- Um push com erro de sintaxe em `app/index.html` **não** publica no GitHub Pages.
- `npm run review` verde.

---

## Fase 1 — Fundação de dados (6 dias)

Cria o esquema alvo, sem ligar ainda o cliente.

| # | Tarefa |
|---|---|
| 1.1 | Provisionar dois projetos Supabase: `trippin-staging` e `trippin-prod`. Adotar a CLI (`supabase init`, `config.toml`, migrations com timestamp), abandonando a numeração manual. |
| 1.2 | Aplicar `sql/0001_core_schema.sql` (tabelas, índices, CHECKs, triggers) em staging. |
| 1.3 | Aplicar `sql/0002_rls_policies.sql` (RLS forçado, policies por operação, `grant update` por coluna). |
| 1.4 | Aplicar `sql/0003_rpc.sql` (`join_trip_by_code`, `get_trip_by_code`, `get_trip_member_profiles`, `rotate_trip_code`). |
| 1.5 | Aplicar `sql/0004_storage.sql` (buckets `trip-documents` e `trip-photos`, policies por prefixo). |
| 1.6 | Escrever **testes de policy**: para cada tabela, um caso "usuário não-membro tenta ler/escrever" que deve falhar. Rodar via `supabase test db` ou script Node contra staging. |
| 1.7 | Arquivar `backend/supabase/migrations/0001_init.sql` e `0002_storage.sql` como `legacy/` — eles divergem do alvo e confundem. |

**Critério de aceite**
- Suíte de policy: 100% dos casos negativos falhando como esperado.
- `select * from pg_tables where schemaname='public' and rowsecurity=false` → vazio.
- Nenhuma função em `public` acessível a `anon` além das RPCs declaradas.

---

## Fase 2 — Camada única + autenticação real (10 dias)

A fase mais delicada. Faz-se em duas metades: primeiro isolar, depois conectar.

### 2A — Isolar a persistência (4 dias)
| # | Tarefa |
|---|---|
| 2.1 | Substituir `app/src/trippin-api.js` pelo esqueleto em `exemplos/trippin-api.js` (modos `remote`/`local`/`demo`). |
| 2.2 | Reescrever `load`/`save`/`stripMedia`/`hydrateMedia` (`index.html:833-905`) como o **adaptador `local`** de `TrippinAPI`. A lógica de IndexedDB é preservada como está — ela já resolve o problema de cota. |
| 2.3 | Substituir toda chamada direta a `localStorage`/`indexedDB` nas telas por `TrippinAPI.*`. São 10 ocorrências de `localStorage` no `index.html`; nenhuma deve sobrar fora da camada. |
| 2.4 | Rodar `npm run review`. Com `mode='local'`, **o comportamento deve ser idêntico ao de hoje** — nenhum teste alterado, nenhum teste novo falhando. |

> Este é o *quality gate* da refatoração: se a suíte de A passa sem alteração com a
> camada instalada, a extração está correta.

### 2B — Conectar autenticação (6 dias)
| # | Tarefa |
|---|---|
| 2.5 | Implementar `TrippinAPI.auth` sobre Supabase Auth: `signUp`, `signIn`, `signOut`, `currentUser`, `onChange`, `updatePassword`, `resetPassword`. |
| 2.6 | Remover `hashPwd`, `doHash`, `passwordHash` e a tela de "senha atual". A recuperação passa a ser o fluxo nativo do Supabase por e-mail. |
| 2.7 | Substituir `'me'` por `session.user.id` nas 24 ocorrências. Nas comparações com `member.id`, usar o `uuid`. |
| 2.8 | Trocar `meIsAdmin` (booleano local) por `role` vindo de `trip_members`, com a UI escondendo ações — mas a proteção real ficando na RLS. |
| 2.9 | Flag `TRIPPIN_CONFIG.MODE` resolvida por hostname (AD-08), com fallback automático para `local` se a rede falhar. |
| 2.10 | Estender a suíte E2E: login, logout, sessão expirada, dois usuários na mesma viagem. |

**Critério de aceite**
- Nenhum derivado de senha no cliente (`grep -E "hashPwd|passwordHash"` → `0`).
- Com o backend desligado, o app ainda abre em modo `local` (promessa do README preservada).
- Um segundo usuário logado enxerga a viagem criada pelo primeiro após ingressar por código.

---

## Fase 3 — Migração dispositivo → nuvem (5 dias)

| # | Tarefa |
|---|---|
| 3.1 | Escrever o mapeamento de `trippin_v1` → tabelas (ver `05-mapa-migracao-dados.md`). |
| 3.2 | Implementar o **Assistente de Migração**: ao primeiro login em modo `remote`, se houver estado local, oferecer "Enviar minhas viagens para a nuvem" com prévia (n viagens, n atividades, n fotos). |
| 3.3 | Upload de documentos e fotos do IndexedDB para o Storage, com barra de progresso e retomada em caso de falha. |
| 3.4 | Manter o estado local intacto por 30 dias após a migração (rollback do usuário), depois limpar. |
| 3.5 | Forçar redefinição de senha na primeira entrada — as senhas antigas devem ser tratadas como comprometidas (C-01). |

**Critério de aceite**
- Migração de um estado real de teste: contagens de viagens, atividades, despesas, docs e
  fotos idênticas antes e depois.
- Falha no meio da migração não corrompe nem o local nem o remoto (idempotente por `id`).

---

## Fase 4 — Multiusuário real (10 dias)

| # | Tarefa |
|---|---|
| 4.1 | `trips`, `activities`, `expenses`, `albums`, `photos`, `docs` passam a ler/escrever no Postgres. |
| 4.2 | `activity_participants` substitui o array `joined: ['me']`. |
| 4.3 | Ingresso por código via RPC `join_trip_by_code` (substitui a varredura de `request-join`). |
| 4.4 | Convite por e-mail usando a `send-invite` endurecida; `accept-invite` já está correta. |
| 4.5 | Listagem de integrantes via `get_trip_member_profiles` — sem CPF, telefone nem código de terceiros (A-05). |
| 4.6 | Notificações reais por trigger: novo integrante, despesa que afeta você, conflito de horário. A UI de notificações de A já existe — só troca a fonte. |
| 4.7 | `audit_log` por trigger; a tela de histórico lê, ninguém escreve. |
| 4.8 | Realtime opcional (`supabase.channel`) no cronograma, para ver a atividade do colega aparecer. |
| 4.9 | Testes E2E multiusuário: dois contextos de navegador na mesma viagem. |

**Critério de aceite**
- Dois usuários veem a mesma viagem, o mesmo cronograma e as mesmas despesas.
- Um convidado **não consegue** promover a si mesmo a admin (tentativa via API rejeitada
  pela RLS, não pela UI).
- Um não-membro que adivinhe o `trip_id` recebe `0 rows`, não `403` (sem oráculo de existência).

---

## Fase 5 — Offline-first (7 dias)

| # | Tarefa |
|---|---|
| 5.1 | Fila de escritas pendentes por viagem, em localStorage (padrão de B, `queue_*`). |
| 5.2 | `updated_at` por trigger em todas as tabelas editáveis; resolução last-write-wins comparando o timestamp local contra o do servidor antes de aplicar. |
| 5.3 | Cache de leitura com prefixo e invalidação por viagem (padrão de B, `cache_*`). |
| 5.4 | Indicador visual de "pendente de sincronização" nos itens da fila e log de sincronização acessível. |
| 5.5 | Testes E2E: criar atividade offline, reconectar, confirmar que sincronizou; editar o mesmo item em dois dispositivos e confirmar que o mais recente vence. |

**Critério de aceite**
- Voo de 10 h em modo avião: criar, editar e excluir atividades funciona; ao reconectar,
  tudo converge sem duplicar.

---

## Fase 6 — LGPD, observabilidade e hardening (8 dias)

| # | Tarefa |
|---|---|
| 6.1 | Tela **"Privacidade e dados"**: exportar tudo (JSON), excluir documento e dados extraídos, excluir conta. |
| 6.2 | Retenção: documentos apagados N dias após o fim da viagem, com aviso prévio; CPF opcional e nunca exibido a terceiros. |
| 6.3 | `client_errors` ligado ao `window.onerror` e ao `unhandledrejection`, com contexto (tela, viagem), sem PII. |
| 6.4 | Rate limiting em `send-invite` e `search-stays` (M-02). |
| 6.5 | CSP em meta tag + SRI completo (M-04). |
| 6.6 | Remover a policy de insert direto em `events_log` (M-06). |
| 6.7 | Rodapé de política de privacidade e termos; consentimento explícito no onboarding. |
| 6.8 | Runbook de operação: como aplicar migration, como consultar log, como rotacionar chave, como restaurar backup. |

**Critério de aceite**
- Um usuário consegue exportar e excluir seus dados sem intervenção manual.
- Nenhum segredo, PII ou chave de serviço aparece no bundle publicado.
- Teste de restauração de backup executado com sucesso ao menos uma vez.

---

## Marcos e riscos

| Marco | Fim da fase | Significado |
|---|---|---|
| M1 — "não é mais explorável" | 0 | Os três achados críticos fechados |
| M2 — "o banco existe e é seguro" | 1 | Schema alvo validado por testes de policy |
| M3 — "o app tem uma fronteira" | 2A | Refatoração provada pela suíte existente |
| M4 — "o usuário é real" | 2B | Identidade no servidor |
| M5 — "ninguém perde dados" | 3 | Migração validada |
| M6 — "o Trippin é multiusuário" | 4 | **Valor de produto destravado** |
| M7 — "funciona em viagem" | 5 | Offline confiável |
| M8 — "pronto para escala e para a lei" | 6 | LGPD + observabilidade |

| Risco | Mitigação |
|---|---|
| Refatoração 2A quebrar a UI | Suíte de A roda sem alteração; se precisar mudar um teste, a extração está errada |
| Perda de dados na Fase 3 | Estado local preservado 30 dias; migração idempotente por `id` |
| Regressão de performance no primeiro carregamento | Proibido Babel em runtime (AD-01); orçamento de 2 s para o primeiro pixel medido no CI |
| Escopo crescer para "reescrever em React Native" | Fora do plano; reavaliar só depois da Fase 6 |
| Testes E2E escrevendo em produção | Projetos separados por hostname (AD-08) |
