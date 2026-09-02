-- ================================================================
-- Trippin — rate limiting para Edge Functions (Fase 0, finding M-02 parcial)
-- ================================================================
-- Usada por send-invite (endurecida) para limitar convites por usuário/hora.
-- Só o service_role (chamado a partir da Edge Function) lê/escreve aqui;
-- nenhum cliente autenticado tem acesso direto.
-- ================================================================

create table if not exists public.rate_limits (
  user_id       uuid not null references public.users(id) on delete cascade,
  action        text not null,
  window_start  timestamptz not null,
  count         integer not null default 1,
  primary key (user_id, action, window_start)
);

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;

-- Nenhuma policy é criada de propósito: sem policy, "authenticated" e "anon"
-- não enxergam nem escrevem nada aqui. Só service_role (que ignora RLS) acessa.
