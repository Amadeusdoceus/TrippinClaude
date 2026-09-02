# Testes de policy (Fase 1, tarefa 1.6)

`rls_policies.test.sql` é um teste pgTAP que cobre o critério de aceite da Fase 1:
para as tabelas de maior risco, um usuário não-membro tenta ler/escrever e a
operação deve falhar (ou devolver 0 linhas — nunca 403, para não servir de
oráculo de existência de viagem).

## Como rodar

Precisa de Docker (a suíte local da Supabase CLI sobe um Postgres em container).

```bash
cd backend
npx supabase start        # primeira vez: baixa as imagens, demora alguns minutos
npx supabase db reset     # aplica as migrations novas (fora de legacy/) do zero
npx supabase test db      # roda este arquivo
```

## Status

**Este arquivo foi escrito, não executado** — não havia Docker disponível no
ambiente em que foi criado. A lógica foi conferida linha a linha contra a
semântica documentada do Postgres (RLS `using` filtra sem lançar erro;
violação de `with check` ou de privilégio de coluna lança `42501`), mas só
`supabase test db` rodando de verdade confirma isso. Rode antes de considerar
a Fase 1 fechada, e ajuste qualquer asserção que não bater.

## Cobertura

Cobre `trips`, `trip_members`, `activities`, `docs`, `profiles`,
`notifications`, `audit_log`, `rate_limits`, `client_errors`, mais o privilégio
de UPDATE por coluna (`trips.code`, `profiles.email`, `expenses.paid_by`) e a
checagem geral de `force row level security` em 100% das tabelas de `public`.

Não tenta ser exaustivo linha a linha para `photos`, `albums`, `doc_legs`,
`expense_shares`, `invites` — seguem o mesmo padrão (`is_trip_member`/
`is_trip_admin` nas policies) e podem ser adicionados aqui conforme a
necessidade, usando os mesmos helpers `tests.auth_as(uuid)` /
`tests.auth_as_anon()`.
