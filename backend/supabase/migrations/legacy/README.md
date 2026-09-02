# Schema legado (numeração manual)

Estes três arquivos são o schema que roda **hoje em produção** (projeto A, antes da
Fase 1 do plano em `analise/04-plano-de-acao.md`):

- `0001_init.sql` — schema inicial (`public.users`, `public.trips`, etc.)
- `0002_storage.sql` — buckets e policies de Storage do schema inicial
- `0003_rate_limits.sql` — tabela de rate limit adicionada na Fase 0 (contenção de
  segurança) para suportar o `send-invite` endurecido; referencia `public.users`.

## Por que ficam aqui, fora de `migrations/`

A partir da Fase 1, `backend/supabase/migrations/*.sql` (fora desta pasta) passa a
usar a convenção de timestamp da Supabase CLI e representa o **schema alvo**
(`analise/sql/0001_core_schema.sql` a `0004_storage.sql`) — que usa `public.profiles`
em vez de `public.users`, funções de autorização em `private.*`, etc. Os dois schemas
são incompatíveis lado a lado (ex.: `public.rate_limits` existe nos dois, com FKs
diferentes) e **não podem ser aplicados ao mesmo banco**.

Por isso:

- **`trippin-prod`** continua recebendo só o que está aqui em `legacy/`, aplicado
  manualmente (como já era feito antes da CLI), até a Fase 3 (migração
  dispositivo → nuvem) completar o corte para o schema novo.
- **`trippin-staging`** recebe as migrations novas (fora desta pasta) via
  `supabase db push`, para validar o schema alvo antes de ele chegar em prod.

Não rode `supabase db push` apontando para `trippin-prod` enquanto ele ainda estiver
no schema legado — a CLI tentaria aplicar todo `migrations/*.sql` (incluindo os
arquivos com o schema novo) de uma vez.
