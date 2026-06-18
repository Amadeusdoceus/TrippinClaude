// ============================================================
// Trippin — Edge Function: accept-invite
// ------------------------------------------------------------
// Chamada quando o convidado abre /aceitar?token=... e está
// autenticado. Marca invite como accepted, cria trip_members
// e grava no log. Não envia e-mail.
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
    const { token } = await req.json();
    if (!token) return json(400, { error: "token required" });

    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: who, error: whoErr } = await userClient.auth.getUser();
    if (whoErr || !who.user) return json(401, { error: "unauthenticated" });
    const userEmail = (who.user.email || "").toLowerCase();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: inv } = await admin.from("invites")
      .select("id, trip_id, email, status, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (!inv) return json(404, { error: "invite not found" });
    if (inv.status !== "pending-response") return json(409, { error: `invite is ${inv.status}` });
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await admin.from("invites").update({ status: "expired" }).eq("id", inv.id);
      return json(410, { error: "invite expired" });
    }
    if ((inv.email || "").toLowerCase() !== userEmail) {
      return json(403, { error: "invite is for a different email" });
    }

    // Adiciona como membro (se ainda não for)
    const { error: tmErr } = await admin.from("trip_members").upsert({
      trip_id: inv.trip_id,
      user_id: who.user.id,
      is_admin: false,
      joined_at: new Date().toISOString().slice(0, 10),
      join_via: "invite",
    }, { onConflict: "trip_id,user_id" });
    if (tmErr) return json(500, { error: tmErr.message });

    await admin.from("invites").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", inv.id);
    await admin.from("events_log").insert({
      trip_id: inv.trip_id, user_id: who.user.id,
      action: "invite_accepted", payload: { invite_id: inv.id },
    });

    return json(200, { ok: true, trip_id: inv.trip_id });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
