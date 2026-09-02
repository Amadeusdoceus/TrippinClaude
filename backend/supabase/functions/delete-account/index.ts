// ============================================================================
// Trippin — Edge Function: delete-account
// ------------------------------------------------------------------------------
// Fase 6 (tarefa 6.1, LGPD art. 18, V — eliminação). Chamada por
// TrippinAPI.privacy.deleteAccount(). Exige sessão válida — só apaga a
// própria conta, nunca a de outra pessoa (o RPC roda como o chamador, nunca
// recebe um user_id vindo do corpo da requisição).
//
// Escrito contra o schema-alvo da Fase 1 (public.profiles, private.*), o
// mesmo que TrippinAPI.trips/activities/expenses/members já usam desde a
// Fase 4 — não o schema legado que ainda está em produção (esse foi
// endurecido à parte na Fase 0, ver send-invite). Só funciona depois que as
// migrations da Fase 1 estiverem aplicadas no projeto de verdade.
//
// Duas etapas:
//   1. private.delete_my_account() [security definer] limpa o lado
//      public.* (profiles anonimizado, trip_members/notifications removidos)
//      — já existe em backend/supabase/migrations/*_rpc.sql.
//   2. Só a Edge Function (com service_role) pode apagar de auth.users —
//      o RPC não tem esse privilégio de propósito.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [Deno.env.get("APP_URL") ?? "", "http://localhost:8000"].filter(Boolean);
function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req.headers.get("Origin"));
  const json = (s: number, b: unknown) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthenticated" });

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: who, error: whoErr } = await userClient.auth.getUser();
    if (whoErr || !who.user) return json(401, { error: "unauthenticated" });
    const uid = who.user.id;

    // Etapa 1: limpa public.* como o próprio usuário (RLS/security definer decidem).
    const { error: rpcErr } = await userClient.rpc("delete_my_account");
    if (rpcErr) {
      console.error("delete_my_account falhou:", rpcErr.message);
      return json(500, { error: "could not delete profile data" });
    }

    // Etapa 2: remove a conta de auth.users — só o service_role pode.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error: authErr } = await admin.auth.admin.deleteUser(uid);
    if (authErr) {
      // O lado public.* já foi limpo — a conta fica órfã (sem PII) até uma
      // nova tentativa; melhor que travar no meio com PII intacta.
      console.error("auth.admin.deleteUser falhou:", authErr.message);
      return json(500, { error: "profile data cleared, but could not remove the login itself — try again" });
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(500, { error: "unexpected error" });
  }
});
