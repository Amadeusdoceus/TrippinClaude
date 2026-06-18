/* ============================================================
   Trippin — cliente do Supabase para o app web
   ------------------------------------------------------------
   Expõe window.TrippinAPI com:
     auth: { signUp, signIn, signOut, currentUser, onChange }
     trips: { list, create, update, remove }
     members: { list, setAdmin, remove, pendingInvites }
     invites: { sendByEmail, acceptByToken, requestJoinByCode, approve, deny }
     docs, photos, log
   Os métodos retornam Promises e devolvem dados já no formato
   que o front-end usa hoje (ex.: members:[{id,firstName,...}]).
   ============================================================ */
(function () {
  const cfg = window.TRIPPIN_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    console.warn("[Trippin] config.js sem credenciais — rodando em modo localStorage");
    return;
  }
  // O SDK do Supabase é carregado dinamicamente para não bloquear o app
  // quando o backend estiver desligado.
  const { createClient } =
    window.supabase || (await loadSb());

  async function loadSb() {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://esm.sh/@supabase/supabase-js@2";
      s.onload = res; s.onerror = () => rej(new Error("falha ao carregar supabase-js"));
      document.head.appendChild(s);
    });
    return window.supabase;
  }

  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  // ---------- helpers ----------
  const today = () => new Date().toISOString().slice(0, 10);
  const callFn = async (name, body) => {
    const { data, error } = await sb.functions.invoke(name, { body });
    if (error) throw error;
    return data;
  };
  const userToProfile = (u, profile) => ({
    id: u.id,
    firstName: profile?.first_name || u.user_metadata?.first_name || (u.email || "").split("@")[0],
    lastName: profile?.last_name || u.user_metadata?.last_name || "",
    email: u.email || profile?.email || "",
    phone: profile?.phone || "",
    birth: profile?.birth || "",
    photo: profile?.photo_url || "",
    code: profile?.code || "",
  });
  const memberRowToObj = (r) => ({
    id: r.user_id,
    firstName: r.users?.first_name || "",
    lastName: r.users?.last_name || "",
    name: ((r.users?.first_name || "") + " " + (r.users?.last_name || "")).trim() || r.users?.email,
    email: r.users?.email || "",
    phone: r.users?.phone || "",
    birth: r.users?.birth || "",
    photo: r.users?.photo_url || "",
    code: r.users?.code || "",
    isAdmin: !!r.is_admin,
    joinedAt: r.joined_at,
    joinVia: r.join_via,
  });
  const inviteRowToObj = (r) => ({
    id: r.id,
    email: r.email,
    name: r.requester?.first_name ? (r.requester.first_name + " " + (r.requester.last_name || "")).trim() : null,
    channel: r.channel,
    status: r.status,
    sentAt: (r.sent_at || "").slice(0, 10),
  });

  // ---------- auth ----------
  const auth = {
    async signUp({ email, password, firstName, lastName, phone, birth }) {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { first_name: firstName, last_name: lastName } },
      });
      if (error) throw error;
      // cria perfil em public.users (RLS permite o próprio)
      if (data.user) {
        await sb.from("users").upsert({
          id: data.user.id, first_name: firstName, last_name: lastName,
          email, phone: phone || null, birth: birth || null,
        }, { onConflict: "id" });
      }
      return await auth.currentUser();
    },
    async signIn({ email, password }) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return await auth.currentUser();
    },
    async signOut() { await sb.auth.signOut(); },
    async currentUser() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const { data: p } = await sb.from("users").select("*").eq("id", user.id).maybeSingle();
      return userToProfile(user, p);
    },
    onChange(cb) { return sb.auth.onAuthStateChange((_e, sess) => cb(sess?.user || null)); },
  };

  // ---------- trips ----------
  const trips = {
    async list() {
      const { data, error } = await sb.from("trips")
        .select("id, name, start_date, end_date, status, destinations, city_overrides, created_by, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((t) => ({
        id: t.id, name: t.name, startDate: t.start_date, endDate: t.end_date,
        status: t.status, destinations: t.destinations || [],
        cityOverrides: t.city_overrides, createdBy: t.created_by,
      }));
    },
    async create({ name, startDate, endDate, destinations }) {
      const { data: { user } } = await sb.auth.getUser();
      const { data, error } = await sb.from("trips").insert({
        name, start_date: startDate, end_date: endDate,
        destinations: destinations || [], created_by: user.id,
      }).select("*").single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const body = {};
      if (patch.name) body.name = patch.name;
      if (patch.startDate) body.start_date = patch.startDate;
      if (patch.endDate) body.end_date = patch.endDate;
      if (patch.destinations) body.destinations = patch.destinations;
      if (patch.cityOverrides) body.city_overrides = patch.cityOverrides;
      if (patch.status) body.status = patch.status;
      const { error } = await sb.from("trips").update(body).eq("id", id);
      if (error) throw error;
    },
    async remove(id) { const { error } = await sb.from("trips").delete().eq("id", id); if (error) throw error; },
  };

  // ---------- members ----------
  const members = {
    async list(tripId) {
      const { data, error } = await sb.from("trip_members")
        .select("user_id, is_admin, joined_at, join_via, users(first_name,last_name,email,phone,birth,photo_url,code)")
        .eq("trip_id", tripId).order("joined_at", { ascending: true });
      if (error) throw error;
      return (data || []).map(memberRowToObj);
    },
    async setAdmin(tripId, userId, makeAdmin) {
      const { error } = await sb.from("trip_members").update({ is_admin: makeAdmin })
        .eq("trip_id", tripId).eq("user_id", userId);
      if (error) throw error;
      await log.write(tripId, makeAdmin ? "admin_granted" : "admin_revoked", { target: userId });
    },
    async remove(tripId, userId) {
      const { error } = await sb.from("trip_members").delete()
        .eq("trip_id", tripId).eq("user_id", userId);
      if (error) throw error;
      await log.write(tripId, "member_removed", { target: userId });
    },
    async pendingInvites(tripId) {
      const { data, error } = await sb.from("invites")
        .select("id, email, channel, status, sent_at, requester:requester_id(first_name,last_name,email)")
        .eq("trip_id", tripId)
        .in("status", ["pending-response", "pending-approval"])
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(inviteRowToObj);
    },
  };

  // ---------- invites ----------
  const invites = {
    sendByEmail: (tripId, email) => callFn("send-invite", { trip_id: tripId, email }),
    acceptByToken: (token) => callFn("accept-invite", { token }),
    requestJoinByCode: (code) => callFn("request-join", { trip_code: code }),
    approve: (inviteId) => callFn("approve-join", { invite_id: inviteId, decision: "approve" }),
    deny: (inviteId) => callFn("approve-join", { invite_id: inviteId, decision: "deny" }),
    cancel: async (inviteId) => {
      const { error } = await sb.from("invites").update({ status: "cancelled" }).eq("id", inviteId);
      if (error) throw error;
    },
  };

  // ---------- log ----------
  const log = {
    async write(tripId, action, payload) {
      // O insert direto exige policy; em produção, prefira chamar uma edge function.
      // Aqui, é só para o que o usuário tem permissão de fazer (ex.: convite via função grava sozinha).
      try {
        await sb.from("events_log").insert({ trip_id: tripId, action, payload: payload || {} });
      } catch { /* o log nunca quebra a UX */ }
    },
    async list(tripId, limit = 100) {
      const { data, error } = await sb.from("events_log")
        .select("id, trip_id, user_id, action, payload, created_at")
        .eq("trip_id", tripId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    },
  };

  // ---------- docs (anexos) ----------
  const docs = {
    async upload(tripId, file) {
      const id = crypto.randomUUID();
      const path = `${tripId}/${id}-${file.name}`;
      const { error: upErr } = await sb.storage.from("trippin-docs").upload(path, file);
      if (upErr) throw upErr;
      return { id, path };
    },
    async list(tripId) {
      const { data, error } = await sb.from("docs").select("*").eq("trip_id", tripId).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  };

  // ---------- photos (galeria) ----------
  const photos = {
    async upload(tripId, albumId, file) {
      const id = crypto.randomUUID();
      const path = `${tripId}/${albumId}/${id}-${file.name || "foto.jpg"}`;
      const { error: upErr } = await sb.storage.from("trippin-photos").upload(path, file);
      if (upErr) throw upErr;
      const { data: { user } } = await sb.auth.getUser();
      await sb.from("photos").insert({ id, album_id: albumId, storage_path: path, added_by: user.id });
      const { data } = await sb.storage.from("trippin-photos").createSignedUrl(path, 60 * 60 * 24);
      return { id, url: data?.signedUrl };
    },
  };

  window.TrippinAPI = { auth, trips, members, invites, log, docs, photos, _sb: sb };
})();
