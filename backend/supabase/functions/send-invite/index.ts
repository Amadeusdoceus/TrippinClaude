// ============================================================
// Trippin — Edge Function: send-invite
// ------------------------------------------------------------
// Recebe { trip_id, trip_name, email, sender_name } do app.
// Envia e-mail via Brevo (ex-Sendinblue) — plano gratuito,
// 300 e-mails/dia, sem domínio próprio obrigatório.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { trip_id, trip_name, email, sender_name } = await req.json();
    if (!email) return json(400, { error: "email required" });

    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoKey) {
      console.warn("BREVO_API_KEY ausente — e-mail não enviado");
      return json(200, { ok: true, warn: "no_brevo_key" });
    }

    const appUrl = Deno.env.get("APP_URL") || "https://amadeusdoceus.github.io/TrippinClaude";
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const tripDisplay = trip_name || "uma viagem";
    const senderDisplay = sender_name ? `<b>${escapeHtml(sender_name)}</b>` : "alguém";

    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "amadeuljr@hotmail.com";
    const senderName  = Deno.env.get("BREVO_SENDER_NAME")  || "Trippin";

    // Opcional: gravar na tabela invites
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await admin.from("invites").insert({
        trip_id: trip_id || "00000000-0000-0000-0000-000000000000",
        email,
        channel: "email",
        status: "pending-response",
        token,
      });
    } catch (_) { /* ignora se trip não existe no banco */ }

    const acceptUrl = `${appUrl}?token=${token}`;
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
        <h2 style="color:#FF6B5C;margin-bottom:8px">✈️ Você foi convidado para uma viagem!</h2>
        <p style="color:#14213D;font-size:15px">${senderDisplay} te convidou para participar do grupo
          <b>${escapeHtml(tripDisplay)}</b> no <b>Trippin</b>.</p>
        <p style="margin:28px 0">
          <a href="${acceptUrl}"
             style="background:#FF6B5C;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;font-size:15px">
            Aceitar convite
          </a>
        </p>
        <p style="font-size:12px;color:#6B7A90">Ou copie e cole este link no navegador:<br>${acceptUrl}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:11px;color:#aaa">Trippin — tudo da sua viagem, num lugar só.</p>
      </div>`;

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email }],
        subject: `Você foi convidado para ${tripDisplay} no Trippin`,
        htmlContent: html,
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error("Brevo error:", txt);
      return json(502, { error: "email provider failed", detail: txt });
    }

    return json(200, { ok: true, token });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}
