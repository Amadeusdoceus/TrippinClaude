# Arquitetura Alvo — Trippin v2

Objetivo: **preservar integralmente o front-end, a inteligência, a navegabilidade e as
funções de A**, substituindo apenas a camada de persistência, autenticação e autorização
pelo padrão de B.

---

## 1. Princípios inegociáveis

1. **Nenhuma reescrita de UI.** O `app/index.html` de A é o produto. Toda mudança nele
   deve ser um *diff* rastreável, coberto por teste, e nunca uma refatoração ampla.
2. **JSX continua pré-compilado.** Babel em runtime é proibido — foi a causa provável da
   rejeição de B.
3. **Uma única fronteira de persistência.** Nenhuma tela chama `localStorage`,
   `indexedDB` ou `supabase` diretamente. Tudo passa por `TrippinAPI`.
4. **O servidor é a autoridade.** Toda decisão de autorização é tomada pelo Postgres via
   RLS. O cliente apenas esconde botões; nunca protege dados.
5. **Offline é cache, não fonte da verdade.** O dispositivo guarda uma cópia e uma fila de
   escritas pendentes. A verdade está no Postgres.
6. **Migração incremental e reversível.** Cada fase entra atrás de uma *feature flag* e
   pode voltar atrás sem perda de dados.

---

## 2. Diagrama de camadas

```
┌──────────────────────────────────────────────────────────────┐
│  UI — app/index.html  (React 18 UMD, JSX pré-compilado)       │  ← 100% de A
│  telas · i18n (10 idiomas) · dark mode · safe-area            │
│  interpretadores (pdf.js / Tesseract sob demanda)             │
│  cronograma · mapa · galeria · despesas · sugestões           │
└───────────────────────────┬──────────────────────────────────┘
                            │  única fronteira permitida
┌───────────────────────────▼──────────────────────────────────┐
│  TrippinAPI  (app/src/trippin-api.js)                         │  ← padrão de B
│  auth · trips · members · invites · activities · docs         │
│  photos · expenses · notifications · log                      │
│  ┌─────────────┬──────────────┬───────────────────────────┐  │
│  │ cache local │ fila offline │ telemetria (client_errors) │  │
│  │ LS + IDB    │ LWW p/ conflito                            │  │
│  └─────────────┴──────────────┴───────────────────────────┘  │
└───────────┬──────────────────────────────┬───────────────────┘
            │ PostgREST + RLS              │ invoke
┌───────────▼──────────────┐   ┌───────────▼────────────────────┐
│ Postgres (Supabase)      │   │ Edge Functions (Deno)          │
│ · schema public: dados   │   │ · send-invite   (JWT + admin)  │
│ · schema private: fn's   │   │ · accept-invite                │
│   security definer       │   │ · request-join / approve-join  │
│ · RLS forçado em tudo    │   │ · search-stays  (JWT + limite) │
│ · RPCs p/ exceções       │   │ CORS por allowlist             │
└──────────┬───────────────┘   └────────────────────────────────┘
           │
┌──────────▼───────────────┐   ┌────────────────────────────────┐
│ Storage (buckets priv.)  │   │ Supabase Auth                  │
│ trip-documents/{trip}/…  │   │ e-mail + senha (bcrypt)        │
│ trip-photos/{trip}/…     │   │ sessão JWT, refresh automático │
│ URLs assinadas, TTL      │   │ recuperação de senha nativa    │
└──────────────────────────┘   └────────────────────────────────┘
```

---

## 3. Decisões de arquitetura

### AD-01 — Manter o arquivo único, adiar o bundler
Trocar para Vite/React Native agora acopla a migração de backend a uma migração de build.
São dois riscos que não devem correr juntos. O arquivo único já está em produção e
funciona. **Decisão:** manter; reavaliar bundler somente depois da Fase 6.

### AD-02 — `TrippinAPI` como adaptador com três modos
```js
TrippinAPI.mode  // 'remote' | 'local' | 'demo'
```
- `remote` — Supabase é a verdade; localStorage/IndexedDB são cache.
- `local` — comportamento atual de A; usado como *fallback* se o backend estiver fora
  e para o modo "abrir o index.html sem servidor" que o README promete.
- `demo` — dados de exemplo, sem rede (para testes e para a loja de apps).

Isso permite ligar o backend **por viagem**, com flag, sem quebrar quem já usa.

### AD-03 — Chaves primárias
B usa `bigint generated always as identity`. É mais leve e legível, mas **sequencial e
adivinhável** — foi justamente o que abriu a enumeração corrigida no `security_hardening`.
**Decisão:** `uuid` para as entidades expostas em URL ou código (`trips`), `bigint` para
as tabelas filhas (`activities`, `expenses`, `photos`), que só são alcançáveis via
`trip_id` já protegido por RLS.

### AD-04 — Código de viagem é um segredo próprio
Coluna `code text unique not null`, 12 caracteres do alfabeto Crockford (sem `I`, `L`,
`O`, `U`), gerada com `gen_random_bytes`. Rotacionável pelo admin, com `code_expires_at`
opcional. Nunca derivada do `id`.

### AD-05 — Documentos e fotos nunca em base64 no estado
Vão para o Storage privado no upload; o estado guarda só `storage_path`. O IndexedDB
existente de A passa a ser cache de miniaturas com TTL, o que preserva a experiência
offline e resolve A-01 ao mesmo tempo.

### AD-06 — Log de auditoria só por trigger
`audit_log` e `notifications` não recebem policy de `insert` para `authenticated`. São
populados por triggers `security definer` — padrão validado em B.

### AD-07 — Conflito de escrita por last-write-wins com `updated_at`
Toda tabela editável recebe `updated_at` atualizado por trigger (nunca pelo cliente). A
fila offline compara o timestamp local contra o do servidor antes de aplicar, exatamente
como `B/supabase/migrations/20260830050000_offline_sync_updated_at.sql`.

### AD-08 — Ambientes separados
Dois projetos Supabase: `trippin-prod` e `trippin-staging`. `config.js` passa a resolver a
configuração pelo hostname (`github.io` → prod; qualquer outro → staging), eliminando o
risco de um teste E2E escrever no banco de produção.

---

## 4. Modelo de dados alvo (resumo)

| Tabela | Origem do requisito | Observação |
|---|---|---|
| `profiles` | B | CPF opcional; `user_code` de 6 dígitos por trigger |
| `trips` | A + B | `code` próprio (AD-04), `destinations jsonb`, `city_overrides` |
| `trip_members` | B | `role` em (`admin`,`coadmin`,`convidado`) |
| `invites` | A | `token`, `expires_at`, `channel` (`email`\|`code`) |
| `activities` | A | cronograma; `sort_order`, `updated_at`, `doc_id` |
| `activity_participants` | A (`joined:[...]`) | substitui o array local |
| `docs` | A | `kind` (`ticket`\|`lodging`\|`other`), `source` (`upload`\|`search`) |
| `doc_legs` | A (interpretador) | trechos de voo extraídos: origem, escala, destino |
| `albums` / `photos` | A | galeria por local |
| `expenses` / `expense_shares` | A + B | multi-moeda, divisão por integrante |
| `audit_log` | A + B | só por trigger |
| `notifications` | B | só por trigger |
| `client_errors` | B | sem `SELECT` para ninguém |

Implementação completa em `sql/0001_core_schema.sql`.

---

## 5. Postura de segurança alvo

| Controle | Estado hoje (A) | Alvo |
|---|---|---|
| Autenticação | fake, local | Supabase Auth (bcrypt, JWT, refresh) |
| Senha no dispositivo | **texto claro** | nunca persistida |
| Autorização | booleano em localStorage | RLS + `trip_members.role` |
| RLS | habilitado, permissivo | **forçado**, granular, `to authenticated` |
| Privilégio de `UPDATE` | tabela inteira | por coluna (`grant update (col)`) |
| PII de terceiros | linha inteira do perfil | RPC com colunas mínimas |
| Documentos de viagem | localStorage/IndexedDB | bucket privado + URL assinada |
| CORS | `*` | allowlist |
| Rate limit | nenhum | por `auth.uid()` nas funções pagas |
| Supply chain | CDN sem SRI | SRI + versões fixas + CSP |
| CI | deploy sem teste | `deploy: needs: test` |
| Telemetria | nenhuma | `client_errors` |
| LGPD | sem exportação/exclusão | tela "Privacidade e dados" |
