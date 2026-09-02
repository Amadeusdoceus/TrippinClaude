/* ============================================================================
   Trippin — TrippinAPI (esqueleto para a Fase 2)
   ----------------------------------------------------------------------------
   ÚNICA fronteira de persistência do app. Regra herdada do projeto B:

       "Nenhuma tela deve tocar localStorage diretamente — só via TrippinAPI."

   Três modos:
     'remote' — Supabase é a verdade; localStorage/IndexedDB são cache.
     'local'  — comportamento atual de A (offline puro). Fallback automático
                se o backend estiver fora, e é o que faz o README continuar
                verdadeiro ("abra app/index.html no navegador").
     'demo'   — dados de exemplo, sem rede.

   Ordem de adoção (Fase 2A antes de 2B):
     1. Instalar este arquivo com mode='local' e mover para cá a lógica de
        load/save/stripMedia/hydrateMedia de index.html:833-905, SEM alterá-la.
     2. Trocar todas as chamadas diretas a localStorage/indexedDB das telas por
        TrippinAPI.*.
     3. Rodar `npm run review`. Se a suíte de A passar SEM alteração, a extração
        está correta. Só então ligar o modo 'remote'.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.TRIPPIN_CONFIG || {};
  var sb = null;
  var mode = 'local';

  /* ---------------------------------------------------------------- cache -- */
  var CACHE_PREFIX = 'trippin_cache_';
  var QUEUE_PREFIX = 'trippin_queue_';
  var STATE_KEY    = 'trippin_v1';

  function cacheGet(key) {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key)); }
    catch (e) { return null; }
  }
  function cacheSet(key, data) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data)); }
    catch (e) { /* cota/modo privado: segue sem cache, nunca quebra a UX */ }
  }
  function cacheDrop(prefix) {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.indexOf(CACHE_PREFIX + prefix) === 0) localStorage.removeItem(k);
    }
  }

  /* ------------------------------------------------- mídia em IndexedDB ---- */
  /* Mover para cá, sem alterar, o bloco imgDB/imgPut/imgGetAll/stripMedia/
     hydrateMedia de app/index.html. Ele já resolve o estouro de cota do
     localStorage e continua sendo o cache de miniaturas no modo 'remote'.   */
  var media = {
    put: function (key, dataUrl) { /* imgPut */ },
    getAll: function () { /* imgGetAll */ return Promise.resolve({}); },
    strip: function (state) { /* stripMedia */ return state; },
    hydrate: function (state) { /* hydrateMedia */ return Promise.resolve(state); }
  };

  /* ------------------------------------------------ fila offline (Fase 5) -- */
  /* Last-write-wins comparando o updated_at local contra o do servidor antes
     de aplicar. O servidor nunca aceita updated_at do cliente — é trigger.   */
  function queueRead(tripId) {
    try { return JSON.parse(localStorage.getItem(QUEUE_PREFIX + tripId) || '[]'); }
    catch (e) { return []; }
  }
  function queueWrite(tripId, list) {
    try { localStorage.setItem(QUEUE_PREFIX + tripId, JSON.stringify(list)); }
    catch (e) {}
  }
  function enqueue(tripId, op) {
    var q = queueRead(tripId);
    q.push(Object.assign({ queuedAt: new Date().toISOString() }, op));
    queueWrite(tripId, q);
  }
  function flush(tripId) {
    if (mode !== 'remote' || !navigator.onLine) return Promise.resolve(0);
    var q = queueRead(tripId), done = 0;
    return q.reduce(function (chain, op) {
      return chain.then(function () {
        return applyRemote(op).then(function () { done++; });
      }).catch(function () { /* mantém na fila para a próxima tentativa */ });
    }, Promise.resolve()).then(function () {
      queueWrite(tripId, queueRead(tripId).slice(done));
      return done;
    });
  }
  function applyRemote(op) { /* traduz op → chamada Supabase */ return Promise.resolve(); }

  window.addEventListener('online', function () {
    (JSON.parse(localStorage.getItem('trippin_trip_ids') || '[]')).forEach(flush);
  });

  /* ------------------------------------------------------------ telemetria - */
  var log = {
    error: function (err, context) {
      if (mode !== 'remote' || !sb) return;
      try {
        sb.auth.getSession().then(function (r) {
          sb.from('client_errors').insert({
            user_id: (r.data.session && r.data.session.user.id) || null,
            message: String(err && err.message || err).slice(0, 500),
            stack: String(err && err.stack || '').slice(0, 4000),
            context: context || {},        // NUNCA incluir PII aqui
            user_agent: navigator.userAgent,
            url: location.pathname          // pathname, não href (sem query/token)
          });
        });
      } catch (e) {}
    }
  };
  window.addEventListener('error', function (e) { log.error(e.error || e.message, { kind: 'onerror' }); });
  window.addEventListener('unhandledrejection', function (e) { log.error(e.reason, { kind: 'promise' }); });

  /* ------------------------------------------------------------------ auth - */
  var auth = {
    signUp: function (p) {
      if (mode !== 'remote') return localAuth.signUp(p);
      return sb.auth.signUp({ email: p.email, password: p.password })
        .then(function (r) {
          if (r.error) throw r.error;
          // profiles é criado pelo trigger on_auth_user_created.
          return sb.from('profiles')
            .update({ name: (p.firstName + ' ' + (p.lastName || '')).trim(),
                      phone: p.phone || '', cpf: p.cpf || '', birth: p.birth || null,
                      language: p.lang || 'pt-BR', onboarded: true })
            .eq('id', r.data.user.id);
        })
        .then(auth.currentUser);
    },
    signIn: function (p) {
      if (mode !== 'remote') return localAuth.signIn(p);
      return sb.auth.signInWithPassword({ email: p.email, password: p.password })
        .then(function (r) { if (r.error) throw r.error; return auth.currentUser(); });
    },
    signOut: function () { return mode === 'remote' ? sb.auth.signOut() : localAuth.signOut(); },
    currentUser: function () {
      if (mode !== 'remote') return localAuth.currentUser();
      return sb.auth.getSession().then(function (r) {
        var s = r.data.session; if (!s) return null;
        return sb.from('profiles').select('*').eq('id', s.user.id).single()
          .then(function (p) { return p.data; });
      });
    },
    // Recuperação e troca de senha usam o fluxo nativo do Supabase.
    // NÃO existe hashPwd, passwordHash nem passwordDisplay neste arquivo —
    // era o finding C-01 da auditoria.
    resetPassword: function (email) {
      return sb.auth.resetPasswordForEmail(email, { redirectTo: cfg.APP_URL });
    },
    updatePassword: function (newPassword) {
      return sb.auth.updateUser({ password: newPassword });
    },
    onChange: function (cb) {
      if (mode !== 'remote') return function () {};
      return sb.auth.onAuthStateChange(function (_e, s) { cb(s && s.user || null); });
    }
  };

  /* ----------------------------------------------------------------- trips - */
  var trips = {
    list: function () {
      var cached = cacheGet('trips');
      if (mode !== 'remote') return localStore.trips();
      var p = sb.from('trips')
        .select('id,name,code,start_date,end_date,status,destinations,city_overrides,created_by')
        .order('start_date', { ascending: false })
        .then(function (r) { if (r.error) throw r.error; cacheSet('trips', r.data); return r.data; });
      return cached ? Promise.resolve(cached).then(function (c) { p.catch(function(){}); return c; }) : p;
    },
    create: function (t) {
      if (mode !== 'remote') return localStore.createTrip(t);
      return auth.currentUser().then(function (u) {
        return sb.from('trips').insert({
          name: t.name, start_date: t.startDate, end_date: t.endDate,
          destinations: t.destinations || [], created_by: u.id
        }).select('*').single();
      }).then(function (r) { if (r.error) throw r.error; cacheDrop('trips'); return r.data; });
    },
    update: function (id, patch) { /* idem, com enqueue() se offline */ },
    remove: function (id) { /* delete; RLS garante que só admin consegue */ },

    // Ingresso por código: RPC, nunca varredura de tabela (findings A-03/M-03).
    peekByCode: function (code) { return sb.rpc('get_trip_by_code', { p_code: code }); },
    joinByCode: function (code) {
      return sb.rpc('join_trip_by_code', { p_code: code })
        .then(function (r) { if (r.error) throw r.error; cacheDrop('trips'); return r.data[0]; });
    },
    rotateCode: function (id, expiresAt) {
      return sb.rpc('rotate_trip_code', { p_trip_id: id, p_expires_at: expiresAt || null });
    }
  };

  /* --------------------------------------------------------------- members - */
  var members = {
    // RPC devolve só (user_id, name, email, photo_path, role, joined_at).
    // A listagem antiga trazia CPF, telefone e data de nascimento: finding A-05.
    list: function (tripId) {
      if (mode !== 'remote') return localStore.members(tripId);
      return sb.rpc('get_trip_member_profiles', { p_trip_id: tripId })
        .then(function (r) { if (r.error) throw r.error; return r.data; });
    },
    setRole: function (tripId, userId, role) {
      return sb.rpc('set_member_role', { p_trip_id: tripId, p_user_id: userId, p_role: role });
    },
    remove: function (tripId, userId) {
      return sb.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId);
    }
  };

  /* --------------------------------------------------------------- invites - */
  var invites = {
    sendByEmail: function (tripId, email) { return callFn('send-invite', { trip_id: tripId, email: email }); },
    acceptByToken: function (token) { return callFn('accept-invite', { token: token }); },
    approve: function (id) { return callFn('approve-join', { invite_id: id, decision: 'approve' }); },
    deny: function (id) { return callFn('approve-join', { invite_id: id, decision: 'deny' }); }
  };

  /* ------------------------------------------------------------------ docs - */
  var docs = {
    // Storage privado; o estado guarda storage_path, nunca base64 (finding A-01).
    upload: function (tripId, file, kind, parsed) {
      var path = tripId + '/' + crypto.randomUUID() + '-' + file.name;
      return sb.storage.from('trip-documents').upload(path, file)
        .then(function (r) { if (r.error) throw r.error; return auth.currentUser(); })
        .then(function (u) {
          return sb.from('docs').insert({
            trip_id: tripId, uploaded_by: u.id, kind: kind, name: file.name,
            storage_path: path, parsed: parsed || {}
          }).select('*').single();
        })
        .then(function (r) { if (r.error) throw r.error; return r.data; });
    },
    signedUrl: function (path, seconds) {
      return sb.storage.from('trip-documents').createSignedUrl(path, seconds || 3600)
        .then(function (r) { return r.data && r.data.signedUrl; });
    },
    saveLegs: function (docId, legs) {
      return sb.from('doc_legs').insert(legs.map(function (l, i) {
        return Object.assign({ doc_id: docId, leg_index: i }, l);
      }));
    }
  };

  /* ------------------------------------------------------------------ LGPD - */
  var privacy = {
    exportAll: function () { return sb.rpc('export_my_data').then(function (r) { return r.data; }); },
    deleteAccount: function () { return callFn('delete-account', {}); }
  };

  /* -------------------------------------------------------------- adapters - */
  /* localAuth e localStore encapsulam o comportamento ATUAL de A (localStorage
     + IndexedDB). São o modo 'local' e o fallback do modo 'remote'.          */
  var localAuth  = { /* migrar de index.html, sem passwordHash/passwordDisplay */ };
  var localStore = { /* migrar load/save/stripMedia/hydrateMedia              */ };

  function callFn(name, body) {
    return sb.functions.invoke(name, { body: body })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }

  /* ------------------------------------------------------------ bootstrap -- */
  function resolveMode() {
    if (cfg.FORCE_MODE) return cfg.FORCE_MODE;
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return 'local';
    return 'remote';
  }

  function init() {
    mode = resolveMode();
    if (mode !== 'remote') return Promise.resolve();
    if (!window.supabase) { mode = 'local'; return Promise.resolve(); }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    // Se a primeira chamada falhar por rede, cai para 'local' sem travar o app.
    return sb.from('profiles').select('id').limit(1)
      .catch(function () { mode = 'local'; });
  }

  window.TrippinAPI = {
    init: init,
    get mode() { return mode; },
    auth: auth, trips: trips, members: members, invites: invites,
    docs: docs, privacy: privacy, log: log,
    cache: { get: cacheGet, set: cacheSet, drop: cacheDrop },
    queue: { enqueue: enqueue, flush: flush },
    media: media,
    _sb: function () { return sb; }
  };
})();
