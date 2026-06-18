// ============================================================
// Trippin — Edge Function: request-join
// ------------------------------------------------------------
// Usuário autenticado pede para entrar em uma viagem pelo código.
// Cria invite (channel='code', status='pending-approval') e
// notifica os admins por e-mail (opcional, se Resend configurado).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const { trip_code } = await req.json();
    if (!trip_code) return json(400, { error: "trip_code required" });

    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: who, error: whoErr } = await userClient.auth.getUser();
    if (whoErr || !who.user) return json(401, { error: "unauthenticated" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve a viagem pelo "id curto" (usamos os 12 primeiros chars do uuid).
    // No piloto, aceitamos também o uuid completo.
    const code = String(trip_code).trim();
    const { data: trips } = await admin.from("trips").select("id, name");
    const trip = trips?.find((t) => t.id === code || t.id.replace(/-/g, "").slice(0, 12).toUpperCase() === code.toUpperCase());
    if (!trip) return json(404, { error: "trip not found" });

    // Já é membro?
    const { data: already } = await admin.from("trip_members").select("user_id").eq("trip_id", trip.id).eq("user_id", who.user.id).maybeSingle();
    if (already) return json(409, { error: "already a member" });

    // Já tem solicitação pendente?
    const { data: pend } = await admin.from("invites").select("id").eq("trip_id", trip.id).eq("requester_id", who.user.id).eq("status", "pending-approval").maybeSingle();
    if (pend) return json(409, { error: "request already pending", invite_id: pend.id });

    const { data: inv, error: insErr } = await admin.from("invites").insert({
      trip_id: trip.id,
      requester_id: who.user.id,
      channel: "code",
      status: "pending-approval",
    }).select("id").single();
    if (insErr) return json(500, { error: insErr.message });

    await admin.from("events_log").insert({
      trip_id: trip.id, user_id: who.user.id,
      action: "join_requested", payload: { invite_id: inv.id, via: "code" },
    });

    // Notifica admins por e-mail (best-effort)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const { data: admins } = await admin.from("trip_members")
        .select("user_id, users!inner(email,first_name)")
        .eq("trip_id", trip.id).eq("is_admin", true);
      const emails = (admins ?? []).map((r: any) => r.users.email).filter(Boolean);
      if (emails.length) {
        const from = Deno.env.get("RESEND_FROM") || "Trippin <convites@trippin.app>";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from, to: emails,
            subject: `Nova solicitação para entrar em ${trip.name}`,
            html: `<p>Alguém pediu para entrar no grupo <b>${trip.name}</b> via código.</p>
                   <p>Abra o Trippin > aba <b>Usuários</b> e aprove ou recuse.</p>`,
          }),
        });
      }
    }

    return json(200, { ok: true, invite_id: inv.id, trip_id: trip.id });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
