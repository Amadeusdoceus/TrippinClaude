# Runbook de Operação — Trippin

Fase 6 (tarefa 6.8). Procedimentos operacionais do dia a dia — não confundir
com `analise/04-plano-de-acao.md` (o plano de implementação) nem com
`backend/README.md` (setup inicial de um projeto do zero). Assume que você já
tem acesso ao painel do Supabase e, quando indicado, ao CLI (`npx supabase`,
rodado a partir de `backend/`).

---

## 1. Aplicar uma migration nova

**Sempre em `trippin-staging` primeiro.** Nunca aplique direto em prod.

```bash
cd backend
npx supabase link --project-ref <ref-do-staging>
npx supabase db push
npx supabase test db          # roda backend/supabase/tests/database/ — precisa passar 100%
```

Só depois de validar em staging (testes de policy verdes, smoke manual pelo
app apontando pra staging):

```bash
npx supabase link --project-ref <ref-do-prod>
npx supabase db push
```

**Atenção especial:** `backend/supabase/migrations/legacy/` é o schema que
roda em prod HOJE (schema antigo, `public.users`) — as migrations fora dessa
pasta são o schema-alvo da Fase 1 (`public.profiles`) e **não podem ser
aplicadas por cima do schema legado** (colidem, ex.: `rate_limits` existe nos
dois com FKs diferentes). Ver `legacy/README.md` e `analise/06-pontas-soltas.md`
(itens M2–M7) antes do corte de prod para o schema novo.

## 2. Consultar logs

| O quê | Onde | Como |
|---|---|---|
| Erros do cliente (Fase 6, `client_errors`) | Painel → Table Editor → `client_errors`, ou SQL Editor | `select * from client_errors order by created_at desc limit 50;` — **ninguém tem SELECT via API** (finding do design), só consulta direta ao banco |
| Auditoria de uma viagem | `audit_log` | `select * from audit_log where trip_id = '<uuid>' order by created_at desc;` |
| Fila/erros de sincronização de um dispositivo | Não fica no servidor — é local (`localStorage['trippin_sync_log']`), acessível pelo próprio usuário em Configurações → Sincronização |
| Logs de execução das Edge Functions | Painel → Edge Functions → escolha a função → aba **Logs** | Sem CLI necessário |
| Erros de cron (retenção, rate limit) | Painel → Database → Cron Jobs → histórico de execuções, ou `select * from cron.job_run_details order by start_time desc limit 20;` |

## 3. Rotacionar uma chave

| Chave | Onde trocar | Depois disso |
|---|---|---|
| `BREVO_API_KEY` | Painel Brevo → **SMTP & API → API Keys** (não a aba SMTP — aquela gera uma chave `xsmtpsib-...`, que `send-invite` não aceita; precisa ser `xkeysib-...`) → gerar nova, revogar a antiga | `npx supabase secrets set BREVO_API_KEY=...` em cada projeto (prod e staging) — **sem redeploy**: Edge Functions leem secrets via `Deno.env.get()` a cada request, não em build |
| `SUPABASE_ANON_KEY` / `SUPABASE_URL` | Não rotaciona sozinha — é pública por design (RLS protege, não a chave) | Só muda se você recriar o projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Painel → Settings → API → Reset service_role secret | Redeploy de **todas** as Edge Functions (todas leem esse secret) |
| Senha de um usuário | O próprio usuário, pelo fluxo nativo do Supabase Auth (`resetPassword`/`updatePassword` — já implementado em `TrippinAPI.auth`) | Nada do lado do operador |

Depois de qualquer rotação de secret, verifique com uma chamada de teste
(`curl` ou o app apontando pra staging) antes de considerar concluído — um
secret errado falha silenciosamente até alguém tentar usar a função.

## 4. Publicar uma Edge Function

```bash
cd backend
npx supabase functions deploy <nome-da-funcao>
# ex.: npx supabase functions deploy send-invite
```

Confira os secrets exigidos por cada função antes de publicar (ver o topo de
cada `index.ts` em `backend/supabase/functions/`); `send-invite` e
`search-stays`, por exemplo, falham (503/sem rate limit) sem
`BREVO_API_KEY`/`BREVO_SENDER_EMAIL`/`APP_URL` e
`SUPABASE_SERVICE_ROLE_KEY` respectivamente.

## 5. Restaurar um backup

O Supabase faz backup diário automático nos planos pagos (7 dias de retenção
no Pro). Procedimento:

1. Painel → Database → Backups → escolha o ponto no tempo.
2. **Restaurar cria um projeto novo** — não sobrescreve o atual. Confira os
   dados no projeto restaurado antes de promovê-lo.
3. Para trocar o projeto restaurado pelo de produção: atualizar
   `SUPABASE_URL`/`SUPABASE_ANON_KEY` em `app/config.js` (bloco `PROD`) e
   republicar o app — os dois projetos (antigo e restaurado) coexistem até
   você apontar o app pro novo.
4. **Teste isso pelo menos uma vez antes de precisar de verdade** — é o
   critério de aceite da Fase 6. Um plano de restauração nunca testado é uma
   suposição, não um plano.

## 6. Ativar os cron jobs (retenção, Fase 6.2)

`private.purge_expired_documents`, `private.warn_expiring_documents` e a
limpeza de `rate_limits`/`ip_rate_limits` são agendados pela migration
`20260901090400_retention_and_rate_limits.sql`, mas dependem da extensão
`pg_cron` estar habilitada no projeto:

1. Painel → Database → Extensions → habilite `pg_cron`.
2. Rode (ou re-rode) a migration acima — sem `pg_cron` habilitado, ela falha
   alto com "schema cron does not exist" (de propósito — ver o comentário na
   própria migration).
3. Confirme com `select * from cron.job;` — deve listar `warn-expiring-docs`,
   `purge-expired-docs` e `purge-old-rate-limits`.

## 7. Onde mais procurar

- Desenho de arquitetura e decisões: `analise/03-arquitetura-alvo.md`
- O que ainda está pendente/simplificado: `analise/06-pontas-soltas.md`
- Achados de segurança e correções: `analise/02-auditoria-seguranca.md`
