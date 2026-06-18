// ============================================================
// Trippin — Edge Function: approve-join
// ------------------------------------------------------------
// Admin aprova/recusa uma solicitação de ingresso (channel='code').
// Body: { invite_id, decision: 'approve' | 'deny' }
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
    const { invite_id, decision } = await req.json();
    if (!invite_id || !["approve", "deny"].includes(decision)) {
      return json(400, { error: "invite_id and decision ('approve'|'deny') required" });
    }

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

    const { data: inv } = await admin.from("invites")
      .select("id, trip_id, requester_id, channel, status").eq("id", invite_id).maybeSingle();
    if (!inv) return json(404, { error: "invite not found" });
    if (inv.status !== "pending-approval") return json(409, { error: `invite is ${inv.status}` });

    // Quem decide tem que ser admin
    const { data: isAdmin } = await userClient.rpc("is_trip_admin", { p_trip: inv.trip_id });
    if (!isAdmin) return json(403, { error: "not an admin" });

    if (decision === "approve") {
      const { error: tmErr } = await admin.from("trip_members").upsert({
        trip_id: inv.trip_id,
        user_id: inv.requester_id,
        is_admin: false,
        joined_at: new Date().toISOString().slice(0, 10),
        join_via: "code",
      }, { onConflict: "trip_id,user_id" });
      if (tmErr) return json(500, { error: tmErr.message });

      await admin.from("invites").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", inv.id);
      await admin.from("events_log").insert({
        trip_id: inv.trip_id, user_id: who.user.id,
        action: "join_approved", payload: { invite_id: inv.id, requester_id: inv.requester_id },
      });
    } else {
      await admin.from("invites").update({ status: "denied", responded_at: new Date().toISOString() }).eq("id", inv.id);
      await admin.from("events_log").insert({
        trip_id: inv.trip_id, user_id: who.user.id,
        action: "join_denied", payload: { invite_id: inv.id, requester_id: inv.requester_id },
      });
    }
    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
