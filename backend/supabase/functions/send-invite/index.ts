// ============================================================================
// Trippin — Edge Function: send-invite (versão endurecida — Fase 0 / finding C-02)
// ------------------------------------------------------------------------------
// A versão anterior não verificava autenticação nenhuma. Como a chave usada no
// cliente é a *publishable* (pública por design), qualquer pessoa na internet
// podia disparar e-mails com a identidade visual do Trippin e gravar linhas em
// `invites` via service_role — um relay de e-mail aberto.
//
// O que mudou:
//   1. JWT obrigatório  — sem sessão válida, 401.
//   2. Autorização      — o chamador precisa ser admin da trip_id informada
//      (RPC public.is_trip_admin, já existente no schema).
//   3. trip_name vem do BANCO, não do corpo da requisição (era o texto que o
//      atacante controlava no e-mail de phishing).
//   4. sender_name vem do perfil autenticado (public.users), não do corpo.
//   5. Rate limit por usuário/hora, via public.rate_limits (migration 0003).
//   6. CORS por allowlist, não `*` (finding M-01).
//   7. Sem e-mail pessoal embutido — falha explícita se o secret faltar (M-05).
//   8. Token com 256 bits de entropia; expiração já existe por default na coluna.
//
// Nota: o app hoje não tem Supabase Auth conectado (finding C-03) — a chamada
// atual do cliente manda a chave anônima como "Bearer", não um JWT de usuário.
// Isso fará esta função responder 401 até a Fase 2 (autenticação real) ser
// concluída. Não é regressão de UX: o cliente já trata falha do servidor caindo
// para o fluxo `mailto:` (ver app/index.html, função `invite()`), então o
// convite continua funcionando, só que sem o e-mail automático via Brevo.
//
// Antes de publicar: ROTACIONAR a BREVO_API_KEY. Enquanto a versão aberta
// esteve no ar, a chave deve ser considerada exposta ao consumo de terceiros.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL") ?? "",
  "http://localhost:8000",
].filter(Boolean);

const MAX_INVITES_PER_HOUR = 20;

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "content-type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    // ---- 1. Autenticação obrigatória ------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthenticated" });

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: who, error: whoErr } = await userClient.auth.getUser();
    if (whoErr || !who.user) return json(401, { error: "unauthenticated" });
    const callerId = who.user.id;

    // ---- 2. Entrada mínima ----------------------------------------------
    const { trip_id, email } = await req.json();
    if (!trip_id) return json(400, { error: "trip_id required" });
    if (!email || !EMAIL_RE.test(String(email))) return json(400, { error: "valid email required" });
    const target = String(email).trim().toLowerCase();

    // ---- 3. Autorização: só admin da viagem convida ---------------------
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_trip_admin", {
      p_trip: trip_id,
    });
    if (adminErr) return json(500, { error: "authorization check failed" });
    if (!isAdmin) return json(403, { error: "not an admin of this trip" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- 4. Rate limit ---------------------------------------------------
    const windowStart = new Date();
    windowStart.setMinutes(0, 0, 0);
    const { data: rl } = await admin.from("rate_limits")
      .select("count")
      .eq("user_id", callerId).eq("action", "send-invite")
      .eq("window_start", windowStart.toISOString())
      .maybeSingle();

    if ((rl?.count ?? 0) >= MAX_INVITES_PER_HOUR) {
      return json(429, { error: "rate limit exceeded", retry_after: 3600 });
    }

    // ---- 5. Dados do e-mail vêm do BANCO, nunca do corpo -----------------
    const { data: trip } = await admin.from("trips")
      .select("id, name").eq("id", trip_id).maybeSingle();
    if (!trip) return json(404, { error: "trip not found" });

    const { data: senderProfile } = await admin.from("users")
      .select("first_name, last_name").eq("id", callerId).maybeSingle();
    const senderName = [senderProfile?.first_name, senderProfile?.last_name].filter(Boolean).join(" ").trim() || "Um integrante";

    // Já é membro? Evita gastar e-mail e revelar nada a quem já está dentro.
    const { data: existingUser } = await admin.from("users")
      .select("id").eq("email", target).maybeSingle();
    if (existingUser) {
      const { data: alreadyMember } = await admin.from("trip_members")
        .select("user_id").eq("trip_id", trip_id).eq("user_id", existingUser.id).maybeSingle();
      if (alreadyMember) return json(409, { error: "already a member" });
    }

    // ---- 6. Secrets obrigatórios ----------------------------------------
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
    const appUrl = Deno.env.get("APP_URL");
    if (!brevoKey || !senderEmail || !appUrl) {
      console.error("secrets ausentes: BREVO_API_KEY / BREVO_SENDER_EMAIL / APP_URL");
      return json(503, { error: "email service not configured" });
    }

    // ---- 7. Token com entropia real (expiração já é default da coluna) ---
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { error: insErr } = await admin.from("invites").insert({
      trip_id: trip.id,
      email: target,
      channel: "email",
      status: "pending-response",
      token,
      sent_by: callerId,
    });
    if (insErr) return json(500, { error: "could not register invite" });

    // ---- 8. Envio --------------------------------------------------------
    const acceptUrl = `${appUrl}?token=${token}`;
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
        <h2 style="color:#FF6B5C;margin-bottom:8px">✈️ Você foi convidado para uma viagem!</h2>
        <p style="color:#14213D;font-size:15px">
          <b>${escapeHtml(senderName)}</b> te convidou para participar do grupo
          <b>${escapeHtml(trip.name)}</b> no <b>Trippin</b>.
        </p>
        <p style="margin:28px 0">
          <a href="${acceptUrl}" style="background:#FF6B5C;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;font-size:15px">Aceitar convite</a>
        </p>
        <p style="font-size:12px;color:#6B7A90">Este convite expira em 14 dias.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:11px;color:#aaa">Trippin — tudo da sua viagem, num lugar só.</p>
      </div>`;

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: Deno.env.get("BREVO_SENDER_NAME") ?? "Trippin", email: senderEmail },
        to: [{ email: target }],
        subject: `Você foi convidado para ${trip.name} no Trippin`,
        htmlContent: html,
      }),
    });

    if (!r.ok) {
      // Não devolver o corpo do provedor ao cliente: pode conter detalhe de conta.
      console.error("Brevo error:", await r.text());
      await admin.from("invites").update({ status: "cancelled" }).eq("token", token);
      return json(502, { error: "email provider failed" });
    }

    // ---- 9. Contabiliza o consumo ---------------------------------------
    await admin.from("rate_limits").upsert(
      { user_id: callerId, action: "send-invite", window_start: windowStart.toISOString(), count: (rl?.count ?? 0) + 1 },
      { onConflict: "user_id,action,window_start" },
    );

    // O token NÃO volta para o cliente: quem convida não precisa dele, e
    // devolvê-lo permitiria aceitar o próprio convite em nome do convidado.
    return json(200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(500, { error: "unexpected error" });
  }
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}
