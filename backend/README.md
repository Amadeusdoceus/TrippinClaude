# Trippin — Backend (Supabase + Brevo)

> **Este README documenta o setup original (schema legado, ainda em
> produção).** Para o schema-alvo da Fase 1 em diante (`public.profiles`,
> multiusuário real) e para operação do dia a dia, veja
> [`RUNBOOK.md`](RUNBOOK.md) e [`../analise/`](../analise/) — em especial
> `06-pontas-soltas.md`, que lista o que falta pra colocar o schema novo no ar.

Este diretório tem tudo o que o **Trippin** precisa do lado do servidor para:

- **Autenticação** real de usuários (Supabase Auth)
- **Banco** PostgreSQL com Row Level Security (cada usuário só vê o que pode)
- **Envio de e-mail** de convite via Brevo (trocado do Resend na Fase 0 —
  ver `analise/02-auditoria-seguranca.md`, finding C-02)
- **Storage** de PDFs/fotos (Supabase Storage)
- **Log central** de eventos em `events_log` (schema legado) / `audit_log`
  (schema-alvo) — auditoria + telemetria

> A camada gratuita do Supabase (500 MB, autenticação ilimitada) e a da
> Brevo (300 e-mails/dia) bastam para todo o piloto.

---

## 1. Criar o projeto no Supabase

1. Entre em https://supabase.com → **New project**.
2. Anote os 3 valores em **Settings → API**:
   - `Project URL`
   - `anon` public key (vai no app)
   - `service_role` key (vai só nas Edge Functions — **nunca** no app)

---

## 2. Aplicar o schema

No painel do Supabase → **SQL Editor**, rode em ordem:

1. `supabase/migrations/0001_init.sql` — tabelas, RLS, triggers
2. `supabase/migrations/0002_storage.sql` — policies dos buckets

Depois crie os **buckets** em Storage:
- `trippin-docs` — privado
- `trippin-photos` — privado
- `trippin-avatars` — público

---

## 3. Criar conta no Resend

1. https://resend.com → cadastro → **API Keys → Create**.
2. Configure um domínio remetente (recomendado) **ou** use `onboarding@resend.dev` para testar.
3. Guarde a chave que começa com `re_…`.

---

## 4. Subir as Edge Functions

Instale o CLI do Supabase (uma vez):
```bash
npm i -g supabase
supabase login
supabase link --project-ref <ref-do-seu-projeto>
```

Defina os segredos (eles ficam só no servidor):
```bash
supabase secrets set \
  BREVO_API_KEY=xkeysib-xxxxx \
  BREVO_SENDER_EMAIL="convites@seu-dominio.com" \
  BREVO_SENDER_NAME="Trippin" \
  APP_URL="https://trippin.app"
```
`send-invite` falha explicitamente (503) se um desses faltar — decisão
deliberada da Fase 0 (finding M-05: nada de e-mail pessoal hardcoded como
fallback).

Publique as 5 funções (`RUNBOOK.md` tem o comando individual e os secrets
que cada uma exige):
```bash
supabase functions deploy send-invite
supabase functions deploy accept-invite
supabase functions deploy request-join
supabase functions deploy approve-join
supabase functions deploy search-stays
```

> Nenhuma função usa mais `--no-verify-jwt`: `send-invite` exige JWT de
> usuário real desde a Fase 0 (finding C-02 — antes era um relay de e-mail
> aberto). As demais já validavam o token manualmente por dentro.

---

## 5. Conectar o app

No arquivo `app/config.js` preencha:

```js
window.TRIPPIN_CONFIG = {
  SUPABASE_URL: "https://<seu-ref>.supabase.co",
  SUPABASE_ANON_KEY: "<anon key>",
  APP_URL: "https://<onde-voce-vai-hospedar-o-app>"
};
```

Pronto. Quando `TRIPPIN_CONFIG` está preenchido, o app passa a usar o
backend; caso contrário continua funcionando em **modo local** (com
`localStorage`), o que é ótimo para desenvolvimento offline.

---

## 6. O que cada Edge Function faz

| Função          | Quem chama   | O que faz                                                       |
|-----------------|--------------|-----------------------------------------------------------------|
| `send-invite`   | Admin do grupo | Cria invite `pending-response`, envia e-mail com link de aceite, loga em `events_log` |
| `accept-invite` | Convidado autenticado | Valida token, adiciona em `trip_members`, marca `accepted`, loga |
| `request-join`  | Usuário autenticado com código | Cria invite `pending-approval`, notifica admins por e-mail, loga |
| `approve-join`  | Admin do grupo | Aprova/recusa solicitação, vira membro, loga                    |

---

## 7. Como inspecionar os logs

> Guia completo de acesso ao banco (entrar no painel, tabelas de logs e
> cadastros, consultas prontas — sem credenciais) em
> [`../docs/07-revisao-e-banco.md`](../docs/07-revisao-e-banco.md), seção 6.

```sql
-- últimos eventos de uma viagem
select created_at, action, payload
  from public.events_log
 where trip_id = '<uuid-da-viagem>'
 order by created_at desc
 limit 100;

-- todos os convites pendentes
select * from public.invites where status like 'pending-%';
```

---

## 8. Próximos passos

O plano completo (Fases 0–6) está em `../analise/04-plano-de-acao.md` e já
foi implementado no código — o que falta é só a parte que exige
infraestrutura real (provisionar `trippin-staging`/`trippin-prod`, aplicar
as migrations, rodar os testes de policy contra um banco de verdade). Ver
`../analise/06-pontas-soltas.md` para a lista exata do que ainda depende de
alguém com acesso às contas fazer manualmente, e `RUNBOOK.md` para os
procedimentos do dia a dia uma vez que isso estiver no ar.
