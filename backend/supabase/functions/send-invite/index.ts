// ============================================================
// Trippin — Edge Function: send-invite
// ------------------------------------------------------------
// Recebe { trip_id, email } do app.
// Verifica que quem chamou é ADMIN da viagem; cria linha em
// "invites" (status='pending-response') com um token único;
// dispara e-mail pelo Resend com link de aceite; grava log.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS aberto para o app (apertar depois para o domínio de produção)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const { trip_id, email } = await req.json();
    if (!trip_id || !email) return json(400, { error: "trip_id and email required" });

    // Cliente "como o usuário" (respeita RLS) — usa o JWT que veio no header.
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: who, error: whoErr } = await userClient.auth.getUser();
    if (whoErr || !who.user) return json(401, { error: "unauthenticated" });

    // Confirma que é admin desta viagem (chama o helper SQL)
    const { data: isAdmin } = await userClient.rpc("is_trip_admin", { p_trip: trip_id });
    if (!isAdmin) return json(403, { error: "not an admin of this trip" });

    // Cliente "service_role" para operações privilegiadas (pular RLS no log e no insert seguro)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Não duplicar convite pendente para o mesmo e-mail
    const { data: existing } = await admin
      .from("invites")
      .select("id,status")
      .eq("trip_id", trip_id)
      .ilike("email", email)
      .in("status", ["pending-response", "pending-approval"])
      .maybeSingle();
    if (existing) return json(409, { error: "invite already pending", invite_id: existing.id });

    // Token criptograficamente seguro para o link
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

    const { data: invite, error: insErr } = await admin
      .from("invites")
      .insert({
        trip_id,
        email,
        channel: "email",
        status: "pending-response",
        token,
        sent_by: who.user.id,
      })
      .select("id, expires_at")
      .single();
    if (insErr) return json(500, { error: insErr.message });

    // Busca nome da viagem só para escrever o e-mail bonito
    const { data: trip } = await admin.from("trips").select("name").eq("id", trip_id).single();
    const appUrl = Deno.env.get("APP_URL") || "https://trippin.app";
    const acceptUrl = `${appUrl}/aceitar?token=${token}`;

    // ---------- Envio via Resend ----------
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const from = Deno.env.get("RESEND_FROM") || "Trippin <convites@trippin.app>";
      const html = `
        <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#FF6B5C">Você foi convidado para uma viagem ✈️</h2>
          <p>Você recebeu um convite para participar do grupo
            <b>${escapeHtml(trip?.name ?? "uma viagem")}</b> no <b>Trippin</b>.</p>
          <p style="margin:24px 0">
            <a href="${acceptUrl}"
               style="background:#FF6B5C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">
              Aceitar convite
            </a>
          </p>
          <p style="font-size:12px;color:#6B7A90">Ou copie e cole este link: ${acceptUrl}</p>
        </div>`;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to: [email],
          subject: `Você foi convidado para ${trip?.name ?? "uma viagem"} no Trippin`,
          html,
        }),
      });
      if (!r.ok) {
        const txt = await r.text();
        await admin.from("events_log").insert({
          trip_id, user_id: who.user.id, action: "invite_email_failed",
          payload: { invite_id: invite.id, email, error: txt },
        });
        return json(502, { error: "email provider failed", detail: txt, invite_id: invite.id });
      }
    } else {
      console.warn("RESEND_API_KEY ausente — invite gravado mas e-mail não foi enviado");
    }

    await admin.from("events_log").insert({
      trip_id, user_id: who.user.id, action: "invite_sent",
      payload: { invite_id: invite.id, email, accept_url: acceptUrl },
    });

    return json(200, { ok: true, invite_id: invite.id, expires_at: invite.expires_at });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
