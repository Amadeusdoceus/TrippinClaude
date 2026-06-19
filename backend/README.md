# Trippin — Backend (Supabase + Resend)

Este diretório tem tudo o que o **Trippin** precisa do lado do servidor para:

- **Autenticação** real de usuários (Supabase Auth)
- **Banco** PostgreSQL com Row Level Security (cada usuário só vê o que pode)
- **Envio de e-mail** de convite via Resend
- **Storage** de PDFs/fotos (Supabase Storage)
- **Log central** de eventos em `events_log` (auditoria + telemetria)

> A camada gratuita do Supabase (500 MB, autenticação ilimitada) e a do
> Resend (3.000 e-mails/mês) bastam para todo o piloto.

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
  RESEND_API_KEY=re_xxxxx \
  RESEND_FROM="Trippin <convites@seu-dominio.com>" \
  APP_URL="https://trippin.app"
```

Publique as 4 funções:
```bash
supabase functions deploy send-invite    --no-verify-jwt
supabase functions deploy accept-invite  --no-verify-jwt
supabase functions deploy request-join   --no-verify-jwt
supabase functions deploy approve-join   --no-verify-jwt
```

> `--no-verify-jwt` porque a função valida o token manualmente (precisa ler
> o e-mail do usuário). A segurança real é feita dentro de cada função.

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

## 8. Próximos passos (não cobertos aqui)

- Página `/aceitar` (no front-end) que lê `?token=` e chama `accept-invite`
- Migração dos `localStorage` atuais para o banco (atividades, docs, galeria,
  despesas) — o cliente `app/src/trippin-api.js` já tem todos os métodos
  prontos; só falta o app chamá-los no lugar de `save(...)`
- Política de retenção em `events_log` (ex.: deletar > 12 meses)
