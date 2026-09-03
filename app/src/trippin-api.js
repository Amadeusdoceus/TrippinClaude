/* ============================================================================
   Trippin — TrippinAPI (Fase 2A: única fronteira de persistência)
   ----------------------------------------------------------------------------
   "Nenhuma tela deve tocar localStorage/indexedDB diretamente — só via
   TrippinAPI." (analise/03-arquitetura-alvo.md, princípio 3)

   Três modos (window.TrippinAPI.mode):
     'local'  — comportamento atual de A (offline puro). ÚNICO modo ativo
                nesta fase (2A). É o que faz o README continuar verdadeiro
                ("abra app/index.html no navegador" sem servidor).
     'remote' — Supabase é a verdade; localStorage/IndexedDB viram cache.
     'demo'   — dados de exemplo, sem rede.

   'remote' e 'demo' ficam com a forma pronta (herdada de
   analise/exemplos/trippin-api.js) mas DORMENTES: `mode` é fixado em 'local'
   de propósito — ligar 'remote' de verdade é a Fase 2B (autenticação real),
   que ainda não aconteceu. Não adicionar nenhuma chamada de rede aqui até lá.
   ============================================================================ */
(function () {
  'use strict';

  var cfg = window.TRIPPIN_CONFIG || {};
  var sb = null;
  var mode = 'local'; // Fase 2B (tarefa 2.9) troca por resolução via hostname (AD-08)

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

  /* ------------------------------------------------- mídia em IndexedDB ----
     Portado de app/index.html (bloco "storage", pré-Fase 2), sem alterar a
     lógica: base64 grande estoura a cota do localStorage (~5MB), então as
     imagens vão para o IndexedDB e o localStorage guarda só a referência
     (campo `blob`). Continua sendo o cache de miniaturas no modo 'remote'
     quando a Fase 2B ligar. */
  var IMG_DB = 'trippin_media', IMG_STORE = 'images';
  var _imgDbPromise = null;
  var _storedKeys = new Set(); // evita regravar o mesmo blob a cada save

  function imgDB() {
    if (_imgDbPromise) return _imgDbPromise;
    _imgDbPromise = new Promise(function (res, rej) {
      try {
        var req = indexedDB.open(IMG_DB, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(IMG_STORE)) db.createObjectStore(IMG_STORE);
        };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error); };
      } catch (e) { rej(e); }
    });
    return _imgDbPromise;
  }
  function imgPut(key, dataUrl) {
    return imgDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IMG_STORE, 'readwrite');
        tx.objectStore(IMG_STORE).put(dataUrl, key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    }).then(function () { _storedKeys.add(key); })
      .catch(function () { /* IndexedDB indisponível: segue sem persistir a imagem */ });
  }
  function imgGetAll() {
    return imgDB().then(function (db) {
      return new Promise(function (res, rej) {
        var out = {};
        var tx = db.transaction(IMG_STORE, 'readonly');
        var cur = tx.objectStore(IMG_STORE).openCursor();
        cur.onsuccess = function () {
          var c = cur.result;
          if (c) { out[c.key] = c.value; c.continue(); } else res(out);
        };
        cur.onerror = function () { rej(cur.error); };
      });
    }).catch(function () { return {}; });
  }
  // tira as imagens (base64) do estado e as manda ao IndexedDB; devolve estado leve p/ localStorage
  function stripMedia(s) {
    if (!s || !s.trips) return s;
    return Object.assign({}, s, { trips: s.trips.map(function (trip) {
      var t2 = Object.assign({}, trip);
      if (trip.gallery) t2.gallery = trip.gallery.map(function (g) {
        if (g.src && g.src.indexOf('data:') === 0) {
          var key = 'g:' + g.id;
          if (!_storedKeys.has(key)) imgPut(key, g.src);
          return Object.assign({}, g, { src: null, blob: key });
        }
        return g;
      });
      if (trip.docs) t2.docs = trip.docs.map(function (d) {
        if (d.dataUrl && d.dataUrl.indexOf('data:') === 0) {
          var key = 'd:' + d.id;
          if (!_storedKeys.has(key)) imgPut(key, d.dataUrl);
          return Object.assign({}, d, { dataUrl: null, blob: key });
        }
        return d;
      });
      return t2;
    }) });
  }
  // recompõe as imagens no estado a partir do IndexedDB (após carregar do localStorage)
  function hydrateMedia(s) {
    if (!s || !s.trips) return Promise.resolve(s);
    return imgGetAll().then(function (all) {
      Object.keys(all).forEach(function (k) { _storedKeys.add(k); });
      return Object.assign({}, s, { trips: s.trips.map(function (trip) {
        var t2 = Object.assign({}, trip);
        if (trip.gallery) t2.gallery = trip.gallery.map(function (g) {
          return (g.blob && all[g.blob]) ? Object.assign({}, g, { src: all[g.blob] }) : g;
        });
        if (trip.docs) t2.docs = trip.docs.map(function (d) {
          return (d.blob && all[d.blob]) ? Object.assign({}, d, { dataUrl: all[d.blob] }) : d;
        });
        return t2;
      }) });
    });
  }
  var media = {
    put: imgPut,
    getAll: imgGetAll,
    strip: stripMedia,
    hydrate: hydrateMedia
  };

  /* -------------------------------------------------------- modo 'local' ---
     Adaptador local: mesmo comportamento de load/save que existia direto em
     app/index.html antes da Fase 2A. É o único modo ativo agora. */
  var localStore = {
    load: function () {
      try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; }
      catch (e) { return {}; }
    },
    save: function (s) {
      try { localStorage.setItem(STATE_KEY, JSON.stringify(stripMedia(s))); }
      catch (e) { /* cota/modo privado: nunca quebra a UX */ }
    },
    clear: function () {
      try { localStorage.removeItem(STATE_KEY); } catch (e) {}
    },
    // Passthrough genérico para as poucas chaves de preferência de UI que não
    // fazem parte do blob principal (ex.: trippin_custom_subs). Mantém a regra
    // de "nenhuma tela toca localStorage direto" sem forçar cada preferência
    // a virar um conceito novo na API.
    getItem: function (key, fallback) {
      try {
        var v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    setItem: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }
  };

  /* ------------------------------------------------ fila offline (Fase 5) --
     "Voo de 10h em modo avião": criar/editar/excluir continua funcionando —
     as escritas ficam na fila até a rede voltar. Cada trip tem sua própria
     fila (QUEUE_PREFIX + tripId); TRIPS_WITH_QUEUE lembra quais viagens têm
     algo pendente, pra flushAll() saber onde procurar sem varrer o
     localStorage inteiro. */
  var KNOWN_QUEUES_KEY = 'trippin_queue_trips';
  var SYNC_LOG_KEY = 'trippin_sync_log';
  var SYNC_LOG_MAX = 200;

  function queueRead(tripId) {
    try { return JSON.parse(localStorage.getItem(QUEUE_PREFIX + tripId) || '[]'); }
    catch (e) { return []; }
  }
  function queueWrite(tripId, list) {
    try {
      if (list.length) localStorage.setItem(QUEUE_PREFIX + tripId, JSON.stringify(list));
      else localStorage.removeItem(QUEUE_PREFIX + tripId);
    } catch (e) {}
  }
  function knownQueueTrips() {
    try { return JSON.parse(localStorage.getItem(KNOWN_QUEUES_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function rememberQueueTrip(tripId) {
    var known = knownQueueTrips();
    if (known.indexOf(tripId) === -1) {
      known.push(tripId);
      try { localStorage.setItem(KNOWN_QUEUES_KEY, JSON.stringify(known)); } catch (e) {}
    }
  }
  function logSyncEvent(tripId, op, status, detail) {
    try {
      var list = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || '[]');
      list.unshift({ tripId: tripId, kind: op.kind, action: op.action, localId: op.localId,
        status: status, detail: detail || '', at: new Date().toISOString() });
      if (list.length > SYNC_LOG_MAX) list.length = SYNC_LOG_MAX;
      localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function enqueue(tripId, op) {
    var q = queueRead(tripId);
    q.push(Object.assign({ queuedAt: new Date().toISOString() }, op));
    queueWrite(tripId, q);
    rememberQueueTrip(tripId);
    logSyncEvent(tripId, op, 'queued');
  }

  // Tarefa 5.2: last-write-wins. Antes de aplicar um UPDATE enfileirado,
  // confere se o servidor mudou depois que este cliente fez a edição local
  // (op.baseUpdatedAt, capturado no momento da edição — ver diffAndPush). Se
  // sim, o servidor ganha: a escrita local é descartada, não sobrescrita às
  // cegas, e o conflito fica registrado no log de sincronização.
  function applyWithConflictCheck(table, remoteId, op, applyFn) {
    if (!op.baseUpdatedAt) return applyFn();
    return sb.from(table).select('updated_at').eq('id', remoteId).maybeSingle().then(function (r) {
      if (r.error || !r.data) return applyFn(); // linha sumiu (ex.: apagada por outro) — tenta mesmo assim, a FK/RLS decide
      var serverTs = new Date(r.data.updated_at).getTime();
      var localTs = new Date(op.baseUpdatedAt).getTime();
      if (serverTs > localTs) {
        logSyncEvent(op.tripId, op, 'conflict', 'servidor mais recente — edição local descartada');
        return { conflict: true };
      }
      return applyFn();
    });
  }

  function applyRemote(op) {
    if (op.kind === 'activity') {
      if (op.action === 'create') return activities.create(op.tripId, op.payload, op.myId);
      if (op.action === 'update') return applyWithConflictCheck('activities', op.remoteId, op, function () { return activities.update(op.remoteId, op.payload); });
      if (op.action === 'remove') return activities.remove(op.remoteId);
      if (op.action === 'setJoined') return activities.setJoined(op.remoteId, op.payload.joined, op.myId);
    }
    if (op.kind === 'expense') {
      if (op.action === 'create') return expenses.create(op.tripId, op.payload, op.myId);
      if (op.action === 'update') return applyWithConflictCheck('expenses', op.remoteId, op, function () { return expenses.update(op.remoteId, op.payload); });
      if (op.action === 'remove') return expenses.remove(op.remoteId);
    }
    if (op.kind === 'trip') return trips.update(op.tripId, op.payload);
    if (op.kind === 'member_role') return members.setRole(op.tripId, op.payload.userId, op.payload.role);
    if (op.kind === 'member_remove') return members.remove(op.tripId, op.payload.userId);
    return Promise.resolve();
  }

  // Roda um job agora; se falhar (rede fora, servidor indisponível), enfileira
  // pra tentar de novo depois — nunca perde a escrita, só adia.
  function runJob(tripId, op) {
    if (!navigator.onLine) { enqueue(tripId, op); return Promise.resolve({ queued: true }); }
    return applyRemote(op).then(function (r) {
      logSyncEvent(tripId, op, (r && r.conflict) ? 'conflict' : 'applied');
      return r || { applied: true };
    }).catch(function (e) {
      enqueue(tripId, op);
      return { queued: true, error: String(e && e.message || e) };
    });
  }

  function flush(tripId) {
    if (mode !== 'remote' || !navigator.onLine) return Promise.resolve(0);
    var q = queueRead(tripId), remaining = [], done = 0;
    return q.reduce(function (chain, op) {
      return chain.then(function () {
        return applyRemote(op).then(function (r) {
          logSyncEvent(tripId, op, (r && r.conflict) ? 'conflict' : 'applied');
          done++;
        }).catch(function (e) {
          remaining.push(op); // mantém na fila pra próxima tentativa
          logSyncEvent(tripId, op, 'retry-failed', String(e && e.message || e));
        });
      });
    }, Promise.resolve()).then(function () {
      queueWrite(tripId, remaining);
      return done;
    });
  }
  function flushAll() {
    if (mode !== 'remote' || !navigator.onLine) return Promise.resolve(0);
    var trips_ = knownQueueTrips();
    return trips_.reduce(function (chain, tid) {
      return chain.then(function (sum) { return flush(tid).then(function (n) { return sum + n; }); });
    }, Promise.resolve(0));
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () { flushAll(); });
  }

  /* ------------------------------------------------------------ telemetria -
     Dormente: só grava se mode==='remote' (nunca nesta fase). */
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

  /* ------------------------------------------------------------------ auth -
     Ligado pela Fase 2B: LoginScreen (entrar) e ProfileScreen (criar conta,
     em mode='remote') chamam isto de verdade agora. Continua sem efeito
     nenhum em mode='local' (o padrão hoje — ver config.js REMOTE_ENABLED).
     `profileToUser` traduz a linha de public.profiles pro formato que o
     resto do app já espera em `user` (firstName/lastName separados —
     ver o comentário em profiles.first_name na migration da Fase 1). */
  function profileToUser(row, email) {
    return {
      id: row.id,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      email: email || row.email || '',
      phone: row.phone || '',
      birth: row.birth || '',
      cpf: row.cpf || '',
      photo: row.photo_path || '',
      code: row.user_code || '',
      createdAt: row.created_at
      // Sem passwordHash/passwordDisplay aqui — a senha vive só no
      // auth.users do Supabase (bcrypt), nunca no cliente (finding C-01).
    };
  }
  var auth = {
    signUp: function (p) {
      if (mode !== 'remote') return Promise.reject(new Error('auth.signUp requer mode="remote" (Fase 2B)'));
      return sb.auth.signUp({ email: p.email, password: p.password })
        .then(function (r) {
          if (r.error) throw r.error;
          var uid = r.data.user && r.data.user.id;
          if (!uid) throw new Error('signUp: resposta sem usuário');
          // Projeto com "Confirm email" ligado: signUp cria o usuário mas
          // não devolve sessão até o link do e-mail ser clicado. Sem sessão
          // o update abaixo rodaria sem autenticação e a RLS o bloquearia
          // silenciosamente (0 linhas afetadas, sem erro) — então nem
          // tentamos: sinalizamos o motivo real pro chamador em vez de
          // deixar currentUser() devolver null e virar um "não foi possível
          // criar a conta" genérico.
          if (!r.data.session) {
            var pendingErr = new Error('signup pending email confirmation');
            pendingErr.code = 'signup_pending_confirmation';
            throw pendingErr;
          }
          return sb.from('profiles').update({
            first_name: p.firstName || '', last_name: p.lastName || '',
            phone: p.phone || '', cpf: p.cpf || '', birth: p.birth || null,
            language: p.lang || 'pt-BR', onboarded: true
          }).eq('id', uid);
        })
        .then(auth.currentUser);
    },
    signIn: function (p) {
      if (mode !== 'remote') return Promise.reject(new Error('auth.signIn requer mode="remote" (Fase 2B)'));
      return sb.auth.signInWithPassword({ email: p.email, password: p.password })
        .then(function (r) { if (r.error) throw r.error; return auth.currentUser(); });
    },
    signOut: function () {
      return mode === 'remote' && sb ? sb.auth.signOut() : Promise.resolve();
    },
    currentUser: function () {
      if (mode !== 'remote' || !sb) return Promise.resolve(null);
      return sb.auth.getSession().then(function (r) {
        var s = r.data.session; if (!s) return null;
        return sb.from('profiles').select('*').eq('id', s.user.id).single()
          .then(function (p) {
            if (p.error || !p.data) return null;
            return profileToUser(p.data, s.user.email);
          });
      });
    },
    // Recuperação e troca de senha usam o fluxo nativo do Supabase.
    // NÃO existe hashPwd/passwordHash/passwordDisplay aqui — finding C-01.
    resetPassword: function (email) {
      return sb.auth.resetPasswordForEmail(email, { redirectTo: cfg.APP_URL });
    },
    updatePassword: function (newPassword) {
      return sb.auth.updateUser({ password: newPassword });
    },
    onChange: function (cb) {
      if (mode !== 'remote') return function () {};
      return sb.auth.onAuthStateChange(function (_e, s) { cb(s && s.user || null); });
    },
    // Fase 4 (tarefa 4.4): send-invite exige um JWT de usuário de verdade
    // desde a Fase 0 (finding C-02) — a chave anônima não basta mais.
    accessToken: function () {
      if (mode !== 'remote' || !sb) return Promise.resolve(null);
      return sb.auth.getSession().then(function (r) { return r.data.session && r.data.session.access_token; });
    }
  };

  /* ----------------------------------------------------------------- trips -
     Fase 4 (tarefa 4.1): trips/activities/expenses/docs/photos/albums passam
     a ler/escrever no Postgres em mode='remote'. `get()` traduz as tabelas
     normalizadas de volta pro MESMO formato aninhado que App()/as abas já
     esperam (trip.activities, trip.expenses, ...) — nenhuma tela precisa
     saber que os dados vêm de tabelas separadas agora. */
  function activityKindToLocalType(k) {
    return k === 'flight' ? 'typeTransport' : k === 'transport' ? 'typeTransport'
      : k === 'lodging' ? 'typeStay' : k === 'food' ? 'typeFood' : k === 'tour' ? 'typeTour' : 'typeOther';
  }
  function localTypeToActivityKind(t) {
    return /transport/i.test(t || '') ? 'transport' : /stay/i.test(t || '') ? 'lodging'
      : /food/i.test(t || '') ? 'food' : /tour/i.test(t || '') ? 'tour' : 'other';
  }
  function memberRowToLocal(r) {
    var name = ((r.first_name || '') + ' ' + (r.last_name || '')).trim();
    return {
      id: r.user_id, firstName: r.first_name || '', lastName: r.last_name || '', name: name,
      email: r.email || '', photo: r.photo_path || '', isAdmin: r.role === 'admin' || r.role === 'coadmin',
      joinedAt: (r.joined_at || '').slice(0, 10), joinVia: undefined // RPC não devolve — cosmético, ver 06-pontas-soltas.md
    };
  }
  function activityRowToLocal(r) {
    var d = (r.starts_at || '').slice(0, 10), st = (r.starts_at || '').slice(11, 16);
    var en = r.ends_at ? r.ends_at.slice(11, 16) : addMinLocal(st, 60);
    return {
      id: r.legacy_id || String(r.id), _remoteId: r.id, _updatedAt: r.updated_at, date: d, start: st, end: en,
      title: r.title, loc: r.place || '', type: activityKindToLocalType(r.kind),
      desc: r.notes || '', source: r.source || 'manual', docId: r.doc_id,
      joined: [] // populado à parte via activity_participants
    };
  }
  function addMinLocal(hhmm, mins) {
    var p = (hhmm || '00:00').split(':'); var d = new Date(2000, 0, 1, +p[0] || 0, +p[1] || 0);
    d.setMinutes(d.getMinutes() + mins);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function expenseRowToLocal(r) {
    return {
      id: r.legacy_id || String(r.id), _remoteId: r.id, _updatedAt: r.updated_at, desc: r.description, amount: +r.amount,
      currency: r.currency, paidBy: r.paid_by, note: r.notes || '',
      equalSplit: r.split_method !== 'custom', participants: [], settled: {}, shares: {}
    };
  }
  function docRowToLocal(r) {
    var catBack = { ticket: 'tickets', lodging: 'stays', other: 'extras' };
    return {
      id: r.legacy_id || String(r.id), _remoteId: r.id, cat: catBack[r.kind] || 'extras',
      name: r.name, file: r.name, storagePath: r.storage_path,
      itin: (r.parsed && r.parsed.legs) ? r.parsed : undefined,
      lodging: (r.parsed && r.parsed.ciDate) ? r.parsed : undefined,
    };
  }

  var trips = {
    // TripCard/HomeScreen leem tr.members.length e tr.members.some(isAdmin) —
    // list() traz um resumo de membros (só id+isAdmin) junto, pra não obrigar
    // a tela a lidar com "resumo vs. detalhe completo" como dois formatos.
    //
    // Tarefa 5.3 (cache de leitura, prefixo cache_/CACHE_PREFIX): só a LISTA
    // é cacheada — reabrir o Home não bate na rede se nada mudou desde a
    // última leitura. `get()` (o detalhe de uma viagem aberta) fica de fora
    // de propósito: é exatamente a superfície que a Fase 4 verificou com
    // cuidado (hidratação das 7 tabelas) e que o realtime da 4.8 já
    // recarrega sozinho a cada mudança — cachear ali arriscaria mostrar
    // atividade/despesa desatualizada logo depois de sincronizar, por um
    // ganho de performance marginal numa tela que abre bem menos vezes que
    // a lista. Invalidada (cacheDrop('trips')) em create/remove/join/diffAndPush.
    list: function () {
      var cached = cacheGet('trips_list');
      if (cached) return Promise.resolve(cached);
      return sb.from('trips')
        .select('id,name,code,start_date,end_date,status,destinations,city_overrides')
        .order('start_date', { ascending: false })
        .then(function (r) {
          if (r.error) throw r.error;
          var tripsArr = r.data || [];
          if (!tripsArr.length) return [];
          var ids = tripsArr.map(function (t) { return t.id; });
          return sb.from('trip_members').select('trip_id,user_id,role').in('trip_id', ids).then(function (mr) {
            if (mr.error) throw mr.error;
            var byTrip = {};
            (mr.data || []).forEach(function (m) {
              (byTrip[m.trip_id] = byTrip[m.trip_id] || []).push({ id: m.user_id, isAdmin: m.role === 'admin' || m.role === 'coadmin' });
            });
            return tripsArr.map(function (t) {
              return { id: t.id, name: t.name, startDate: t.start_date, endDate: t.end_date,
                status: t.status, code: t.code, destinations: t.destinations || [],
                cityOverrides: t.city_overrides || {}, members: byTrip[t.id] || [] };
            });
          });
        }).then(function (list) { cacheSet('trips_list', list); return list; });
    },
    // Gera o id no cliente e faz o insert SEM `.select()` (sem RETURNING) de
    // propósito: com RETURNING, a policy de SELECT (trips_select_member) é
    // avaliada ANTES do trigger on_trip_created rodar (ele só dispara ao
    // final da query) — nesse instante o criador ainda não está em
    // trip_members, então a linha recém-inserida falha a checagem e o
    // Postgres derruba o INSERT inteiro com "new row violates row-level
    // security policy", mesmo com created_by correto. Buscando a viagem
    // numa request separada (trips.get, depois do insert já commitado) o
    // trigger já rodou e a policy passa normalmente.
    create: function (t, myId) {
      var newId = crypto.randomUUID();
      return sb.from('trips').insert({
        id: newId, name: t.name, start_date: t.startDate, end_date: t.endDate,
        destinations: t.destinations || [], city_overrides: t.cityOverrides || {}, created_by: myId
      }).then(function (r) {
        if (r.error) throw r.error;
        cacheDrop('trips');
        return trips.get(newId, myId);
      });
    },
    remove: function (id) { return sb.from('trips').delete().eq('id', id).then(function (r) { if (r.error) throw r.error; cacheDrop('trips'); }); },
    update: function (id, patch) {
      var body = {};
      if (patch.name != null) body.name = patch.name;
      if (patch.startDate != null) body.start_date = patch.startDate;
      if (patch.endDate != null) body.end_date = patch.endDate;
      if (patch.status != null) body.status = patch.status;
      if (patch.destinations != null) body.destinations = patch.destinations;
      if (patch.cityOverrides != null) body.city_overrides = patch.cityOverrides;
      return sb.from('trips').update(body).eq('id', id).then(function (r) { if (r.error) throw r.error; cacheDrop('trips'); });
    },
    peekByCode: function (code) { return sb.rpc('get_trip_by_code', { p_code: code }).then(function (r) { if (r.error) throw r.error; return r.data && r.data[0]; }); },
    joinByCode: function (code) {
      return sb.rpc('join_trip_by_code', { p_code: code })
        .then(function (r) { if (r.error) throw r.error; cacheDrop('trips'); return r.data[0]; });
    },
    rotateCode: function (id, expiresAt) {
      return sb.rpc('rotate_trip_code', { p_trip_id: id, p_expires_at: expiresAt || null });
    },
    // Busca a viagem inteira e traduz de volta pro formato aninhado local.
    // myId: uuid do usuário atual, pra popular `joined`/`participants` a
    // partir de activity_participants/expense_shares (ver 06-pontas-soltas.md
    // — outros integrantes não resolvem pra ids reais do lado do cliente
    // hoje; a fonte de verdade das duas tabelas já está correta no servidor).
    get: function (tripId, myId) {
      return Promise.all([
        sb.from('trips').select('id,name,code,start_date,end_date,status,destinations,city_overrides').eq('id', tripId).single(),
        sb.rpc('get_trip_member_profiles', { p_trip_id: tripId }),
        sb.from('activities').select('*').eq('trip_id', tripId).order('starts_at'),
        sb.from('docs').select('*').eq('trip_id', tripId),
        sb.from('expenses').select('*').eq('trip_id', tripId),
        sb.from('albums').select('id,name').eq('trip_id', tripId),
        sb.from('photos').select('id,album_id,storage_path,legacy_id').eq('trip_id', tripId),
      ]).then(function (results) {
        var tripR = results[0], membersR = results[1], actsR = results[2], docsR = results[3],
            expR = results[4], albumsR = results[5], photosR = results[6];
        if (tripR.error) throw tripR.error;
        var t = tripR.data;
        var members = (membersR.data || []).map(memberRowToLocal);
        var acts = (actsR.data || []).map(activityRowToLocal);
        var actIds = (actsR.data || []).map(function (a) { return a.id; });
        var docs = (docsR.data || []).map(docRowToLocal);
        var expenses = (expR.data || []).map(expenseRowToLocal);
        var albumsById = {}; (albumsR.data || []).forEach(function (a) { albumsById[a.id] = a.name; });
        var gallery = (photosR.data || []).map(function (p) {
          return { id: p.legacy_id || String(p.id), _remoteId: p.id, city: albumsById[p.album_id] || '', storagePath: p.storage_path };
        });
        var fillParticipants = actIds.length
          ? sb.from('activity_participants').select('activity_id,user_id').in('activity_id', actIds)
          : Promise.resolve({ data: [] });
        var expIds = (expR.data || []).map(function (e) { return e.id; });
        var fillShares = expIds.length
          ? sb.from('expense_shares').select('expense_id,user_id,share_amount,settled').in('expense_id', expIds)
          : Promise.resolve({ data: [] });
        return Promise.all([fillParticipants, fillShares]).then(function (r2) {
          var partByAct = {}; (r2[0].data || []).forEach(function (p) {
            (partByAct[p.activity_id] = partByAct[p.activity_id] || []).push(p.user_id);
          });
          acts.forEach(function (a) { a.joined = partByAct[a._remoteId] || []; });
          var sharesByExp = {}; (r2[1].data || []).forEach(function (s) {
            (sharesByExp[s.expense_id] = sharesByExp[s.expense_id] || []).push(s);
          });
          expenses.forEach(function (e) {
            var shares = sharesByExp[e._remoteId] || [];
            e.participants = shares.map(function (s) { return s.user_id; });
            shares.forEach(function (s) { if (s.settled) e.settled[s.user_id] = true; e.shares[s.user_id] = +s.share_amount; });
          });
          return {
            id: t.id, name: t.name, code: t.code, startDate: t.start_date, endDate: t.end_date,
            status: t.status, destinations: t.destinations || [], cityOverrides: t.city_overrides || {},
            members: members, activities: acts, docs: docs, gallery: gallery, albums: [], expenses: expenses,
            pendingInvites: []
          };
        });
      });
    }
  };

  /* --------------------------------------------------------------- members -
     Fase 4 (tarefa 4.5): RPC devolve só (user_id, first_name, last_name,
     email, photo_path, role, joined_at) — nunca CPF/telefone/código de
     terceiros (finding A-05, corrigido em 0002_rls_policies.sql). */
  var members = {
    list: function (tripId) {
      return sb.rpc('get_trip_member_profiles', { p_trip_id: tripId })
        .then(function (r) { if (r.error) throw r.error; return (r.data || []).map(memberRowToLocal); });
    },
    setRole: function (tripId, userId, role) {
      return sb.rpc('set_member_role', { p_trip_id: tripId, p_user_id: userId, p_role: role })
        .then(function (r) { if (r.error) throw r.error; });
    },
    remove: function (tripId, userId) {
      return sb.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId)
        .then(function (r) { if (r.error) throw r.error; });
    }
  };

  /* --------------------------------------------------------------- invites -
     As Edge Functions (send-invite etc.) já existem e já foram endurecidas
     (Fase 0) — só o chamador do cliente ainda não está ligado a este objeto. */
  var invites = {
    sendByEmail: function (tripId, email) { return callFn('send-invite', { trip_id: tripId, email: email }); },
    acceptByToken: function (token) { return callFn('accept-invite', { token: token }); },
    approve: function (id) { return callFn('approve-join', { invite_id: id, decision: 'approve' }); },
    deny: function (id) { return callFn('approve-join', { invite_id: id, decision: 'deny' }); }
  };

  /* ------------------------------------------------------------------ docs -
     Dormente nesta fase. */
  var docs = {
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
    },
    update: function (id, patch) {
      var body = {}; if (patch.name != null) body.name = patch.name; if (patch.parsed != null) body.parsed = patch.parsed;
      return sb.from('docs').update(body).eq('id', id).then(function (r) { if (r.error) throw r.error; });
    },
    // Fase 6 (tarefa 6.1): apaga o binário no Storage também, não só a linha
    // — "excluir documento e dados extraídos" tem que apagar o dado de
    // verdade, não deixar o arquivo órfão no bucket.
    remove: function (id) {
      return sb.from('docs').select('storage_path').eq('id', id).maybeSingle().then(function (r) {
        var path = r.data && r.data.storage_path;
        var dropFile = path ? sb.storage.from('trip-documents').remove([path]) : Promise.resolve();
        return dropFile.then(function () { return sb.from('docs').delete().eq('id', id); });
      }).then(function (r) { if (r && r.error) throw r.error; });
    }
  };

  /* -------------------------------------------------------------- activities -
     Fase 4 (tarefas 4.1/4.2): activity_participants substitui joined:['me']. */
  var activities = {
    create: function (tripId, a, myId) {
      return sb.from('activities').insert({
        trip_id: tripId, title: a.title || '(sem título)', place: a.loc || '',
        kind: localTypeToActivityKind(a.type), starts_at: a.date + 'T' + (a.start || '00:00') + ':00',
        ends_at: a.end ? (a.date + 'T' + a.end + ':00') : null, notes: a.desc || '',
        source: a.source === 'doc' ? 'doc' : 'manual', legacy_id: a.id
      }).select('id').single().then(function (r) {
        if (r.error) throw r.error;
        var joined = a.joined || [];
        if (joined.indexOf(myId) === -1) return r.data.id;
        return sb.from('activity_participants').insert({ activity_id: r.data.id, user_id: myId })
          .then(function () { return r.data.id; });
      });
    },
    update: function (remoteId, a) {
      return sb.from('activities').update({
        title: a.title || '(sem título)', place: a.loc || '', kind: localTypeToActivityKind(a.type),
        starts_at: a.date + 'T' + (a.start || '00:00') + ':00',
        ends_at: a.end ? (a.date + 'T' + a.end + ':00') : null, notes: a.desc || ''
      }).eq('id', remoteId).then(function (r) { if (r.error) throw r.error; });
    },
    remove: function (remoteId) { return sb.from('activities').delete().eq('id', remoteId).then(function (r) { if (r.error) throw r.error; }); },
    setJoined: function (remoteId, joined, myId) {
      var iJoined = joined.indexOf(myId) !== -1;
      return (iJoined
        ? sb.from('activity_participants').upsert({ activity_id: remoteId, user_id: myId }, { onConflict: 'activity_id,user_id' })
        : sb.from('activity_participants').delete().eq('activity_id', remoteId).eq('user_id', myId)
      ).then(function (r) { if (r.error) throw r.error; });
    }
  };

  /* ---------------------------------------------------------------- expenses - */
  var expenses = {
    create: function (tripId, e, myId) {
      return sb.from('expenses').insert({
        trip_id: tripId, description: e.desc || '(sem descrição)', amount: +e.amount || 0.01,
        currency: e.currency || 'BRL', split_method: e.equalSplit === false ? 'custom' : 'equal',
        paid_by: e.paidBy || myId, notes: e.note || '', legacy_id: e.id
      }).select('id').single().then(function (r) {
        if (r.error) throw r.error;
        return expenses.syncShares(r.data.id, e).then(function () { return r.data.id; });
      });
    },
    update: function (remoteId, e) {
      return sb.from('expenses').update({
        description: e.desc || '(sem descrição)', amount: +e.amount || 0.01, currency: e.currency || 'BRL',
        split_method: e.equalSplit === false ? 'custom' : 'equal', notes: e.note || ''
      }).eq('id', remoteId).then(function (r) { if (r.error) throw r.error; return expenses.syncShares(remoteId, e); });
    },
    remove: function (remoteId) { return sb.from('expenses').delete().eq('id', remoteId).then(function (r) { if (r.error) throw r.error; }); },
    // upsert de uma linha por participante — cobre both criação e o toggle de "pago".
    syncShares: function (remoteId, e) {
      var parts = e.participants || [];
      if (!parts.length) return Promise.resolve();
      var rows = parts.map(function (pid) {
        return { expense_id: remoteId, user_id: pid, share_amount: (e.shares && e.shares[pid]) || 0, settled: !!(e.settled && e.settled[pid]) };
      });
      return sb.from('expense_shares').upsert(rows, { onConflict: 'expense_id,user_id' })
        .then(function (r) { if (r.error) throw r.error; });
    }
  };

  /* ------------------------------------------------------------------ fotos - */
  var photos = {
    upload: function (tripId, albumName, dataUrlOrFile, legacyId) {
      return sb.from('albums').select('id').eq('trip_id', tripId).eq('name', albumName).maybeSingle()
        .then(function (ex) {
          if (ex.data) return ex.data.id;
          return sb.from('albums').insert({ trip_id: tripId, name: albumName }).select('id').single()
            .then(function (r) { if (r.error) throw r.error; return r.data.id; });
        })
        .then(function (albumId) {
          var path = tripId + '/' + (legacyId || crypto.randomUUID()) + '.jpg';
          var blob = (typeof dataUrlOrFile === 'string') ? dataUrlToBlob(dataUrlOrFile) : dataUrlOrFile;
          return sb.storage.from('trip-photos').upload(path, blob, { upsert: true }).then(function (r) {
            if (r.error) throw r.error;
            return sb.from('photos').insert({ trip_id: tripId, album_id: albumId, storage_path: path, legacy_id: legacyId })
              .select('id').single();
          });
        }).then(function (r) { if (r.error) throw r.error; return r.data.id; });
    },
    // Mesma correção de docs.remove: apaga o arquivo no Storage, não só a linha.
    remove: function (remoteId) {
      return sb.from('photos').select('storage_path').eq('id', remoteId).maybeSingle().then(function (r) {
        var path = r.data && r.data.storage_path;
        var dropFile = path ? sb.storage.from('trip-photos').remove([path]) : Promise.resolve();
        return dropFile.then(function () { return sb.from('photos').delete().eq('id', remoteId); });
      }).then(function (r) { if (r && r.error) throw r.error; });
    },
    signedUrl: function (path, seconds) {
      return sb.storage.from('trip-photos').createSignedUrl(path, seconds || 3600).then(function (r) { return r.data && r.data.signedUrl; });
    }
  };

  /* ---------------------------------------------------------- sync (Fase 4) -
     `diffAndPush(prev, next, tripId, myId)` é o único ponto que sabe traduzir
     uma mutação de `trip` (o objeto aninhado que TODAS as abas continuam
     produzindo via update({...trip, ...})) em escritas normalizadas no
     Postgres. Nenhuma aba precisou mudar — só App() passa a chamar isto além
     do setTrips() local otimista. Simplificação deliberada (ver
     06-pontas-soltas.md): docs/gallery ganham diff completo; trip-level e
     activities/expenses/members também; doc_legs e reordenação fina de
     cityOverrides.order não são sincronizados campo a campo aqui — o valor
     final do jsonb inteiro é enviado, então nada se perde, só não há diff
     granular pra essas duas coisas específicas. */
  function byId(arr) { var m = {}; (arr || []).forEach(function (x) { m[x.id] = x; }); return m; }
  function diffArrays(prevArr, nextArr) {
    var prevById = byId(prevArr), nextById = byId(nextArr);
    var added = (nextArr || []).filter(function (x) { return !prevById[x.id]; });
    var removed = (prevArr || []).filter(function (x) { return !nextById[x.id]; });
    var changed = (nextArr || []).filter(function (x) {
      var p = prevById[x.id]; return p && JSON.stringify(p) !== JSON.stringify(x);
    });
    return { added: added, removed: removed, changed: changed };
  }
  var sync = {
    // Tarefa 5.1: activities/expenses (o que o critério de aceite testa —
    // "voo de 10h em modo avião: criar, editar e excluir atividades") passam
    // por runJob(), que enfileira em vez de perder a escrita se a rede falhar
    // ou já estiver fora. trip-level/docs/photos/members continuam indo
    // direto (simplificação — ver 06-pontas-soltas.md): são operações menos
    // frequentes e o custo de perder uma delas offline é menor. Devolve
    // {queued:[localId,...]} pra App() marcar "pendente de sincronização"
    // nos itens certos (tarefa 5.4) — some sozinho quando o realtime da
    // Fase 4 recarregar a viagem depois que a fila esvaziar.
    diffAndPush: function (prev, next, myId) {
      if (!prev || !next || prev.id !== next.id) return Promise.resolve({ queued: [] });
      var tripId = next.id, jobs = [], queued = [];
      var track = function (localId, p) {
        return p.then(function (r) { if (r && r.queued) queued.push(localId); return r; });
      };

      var tripPatch = {};
      ['name', 'startDate', 'endDate', 'status'].forEach(function (k) { if (prev[k] !== next[k]) tripPatch[k] = next[k]; });
      if (JSON.stringify(prev.destinations) !== JSON.stringify(next.destinations)) tripPatch.destinations = next.destinations;
      if (JSON.stringify(prev.cityOverrides) !== JSON.stringify(next.cityOverrides)) tripPatch.cityOverrides = next.cityOverrides;
      if (Object.keys(tripPatch).length) jobs.push(trips.update(tripId, tripPatch));

      var da = diffArrays(prev.activities, next.activities);
      da.added.forEach(function (a) {
        jobs.push(track(a.id, runJob(tripId, { kind: 'activity', action: 'create', tripId: tripId, localId: a.id, payload: a, myId: myId })));
      });
      da.removed.forEach(function (a) {
        if (a._remoteId) jobs.push(track(a.id, runJob(tripId, { kind: 'activity', action: 'remove', tripId: tripId, localId: a.id, remoteId: a._remoteId })));
      });
      da.changed.forEach(function (a) {
        if (!a._remoteId) return; // ainda não tem id remoto (era um `added` no ciclo anterior) — próximo diff resolve
        var p = byId(prev.activities)[a.id];
        if (JSON.stringify(p.joined) !== JSON.stringify(a.joined)) {
          jobs.push(track(a.id, runJob(tripId, { kind: 'activity', action: 'setJoined', tripId: tripId, localId: a.id, remoteId: a._remoteId, payload: { joined: a.joined }, myId: myId })));
        }
        var core = { title: a.title, loc: a.loc, type: a.type, date: a.date, start: a.start, end: a.end, desc: a.desc };
        var pcore = { title: p.title, loc: p.loc, type: p.type, date: p.date, start: p.start, end: p.end, desc: p.desc };
        if (JSON.stringify(core) !== JSON.stringify(pcore)) {
          jobs.push(track(a.id, runJob(tripId, { kind: 'activity', action: 'update', tripId: tripId, localId: a.id, remoteId: a._remoteId, payload: a, baseUpdatedAt: p._updatedAt })));
        }
      });

      var de = diffArrays(prev.expenses, next.expenses);
      de.added.forEach(function (e) {
        jobs.push(track(e.id, runJob(tripId, { kind: 'expense', action: 'create', tripId: tripId, localId: e.id, payload: e, myId: myId })));
      });
      de.removed.forEach(function (e) {
        if (e._remoteId) jobs.push(track(e.id, runJob(tripId, { kind: 'expense', action: 'remove', tripId: tripId, localId: e.id, remoteId: e._remoteId })));
      });
      de.changed.forEach(function (e) {
        if (!e._remoteId) return;
        var p = byId(prev.expenses)[e.id];
        jobs.push(track(e.id, runJob(tripId, { kind: 'expense', action: 'update', tripId: tripId, localId: e.id, remoteId: e._remoteId, payload: e, baseUpdatedAt: p._updatedAt })));
      });

      var dd = diffArrays(prev.docs, next.docs);
      dd.removed.forEach(function (d) { if (d._remoteId) jobs.push(docs.remove(d._remoteId)); });
      dd.changed.forEach(function (d) { if (d._remoteId) jobs.push(docs.update(d._remoteId, { name: d.name, parsed: d.itin || d.lodging || {} })); });
      // docs "added" pelo generic update() (sem passar por docs.upload) não têm
      // binário disponível aqui — ficam como source='legacy' até a tela que
      // cria o doc (DocsTab) usar TrippinAPI.docs.upload diretamente.

      var dg = diffArrays(prev.gallery, next.gallery);
      dg.removed.forEach(function (g) { if (g._remoteId) jobs.push(photos.remove(g._remoteId)); });

      var dm = diffArrays(prev.members, next.members);
      dm.removed.forEach(function (m) { jobs.push(members.remove(tripId, m.id)); });
      dm.changed.forEach(function (m) {
        var p = byId(prev.members)[m.id];
        if (p.isAdmin !== m.isAdmin) jobs.push(members.setRole(tripId, m.id, m.isAdmin ? 'admin' : 'convidado'));
      });

      return Promise.all(jobs).then(function () { cacheDrop('trips'); return { queued: queued }; });
    },
    // Fase 4 (tarefa 4.8 — "realtime opcional"). Não tenta mesclar por campo:
    // qualquer mudança em activities/expenses da viagem aberta dispara um
    // trips.get() novo e completo. Mais simples e mais robusto que reconciliar
    // eventos parciais, ao custo de um round-trip a mais por evento — aceitável
    // pro volume de uma viagem (poucas mudanças por minuto, não por segundo).
    subscribeTrip: function (tripId, onChange) {
      if (mode !== 'remote' || !sb) return function () {};
      var channel = sb.channel('trip-' + tripId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: 'trip_id=eq.' + tripId }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: 'trip_id=eq.' + tripId }, onChange)
        .subscribe();
      return function () { sb.removeChannel(channel); };
    }
  };

  /* ------------------------------------------------------------- notificações -
     Fase 4 (tarefa 4.6): a UI de notificações de A já existe (App(), estado
     `notifs`) — só troca a fonte. `public.notifications` só é populada por
     trigger (nunca pelo cliente — finding M-06/AD-06), então isto é
     estritamente leitura + marcar como lida.
     Simplificação (ver 06-pontas-soltas.md): o texto é genérico por tipo, não
     resolve nomes a partir do payload (ex.: "novo integrante", não "Fulano
     entrou") — payload traz só ids, resolver pra nome exigiria um join/RPC
     que não existe ainda. */
  var NOTIF_TEXT = {
    member_joined: 'Um novo integrante entrou na viagem.',
    expense_impact: 'Uma despesa nova afeta você.',
    schedule_conflict: 'Duas atividades do cronograma se sobrepõem.',
    invite_pending: 'Você tem um convite pendente.'
  };
  function notifRowToLocal(r) {
    return {
      id: String(r.id), text: NOTIF_TEXT[r.type] || 'Nova notificação.',
      time: (r.created_at || '').slice(0, 16).replace('T', ' '),
      read: !!r.read_at, action: null, tripId: r.trip_id
    };
  }
  var notifications = {
    list: function () {
      return sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)
        .then(function (r) { if (r.error) throw r.error; return (r.data || []).map(notifRowToLocal); });
    },
    markRead: function (id) {
      return sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
        .then(function (r) { if (r.error) throw r.error; });
    }
  };

  /* ------------------------------------------------------------------ LGPD -
     Dormente nesta fase (Fase 6). */
  var privacy = {
    exportAll: function () { return sb.rpc('export_my_data').then(function (r) { return r.data; }); },
    deleteAccount: function () { return callFn('delete-account', {}); }
  };

  /* -------------------------------------------------------- migração (Fase 3) -
     Assistente "enviar minhas viagens pra nuvem" — analise/05-mapa-migracao-dados.md.
     Dormente: só roda se chamado explicitamente com mode='remote' e sessão ativa.
     Nunca executada contra Storage/Postgres reais nesta sessão — ver o item
     correspondente em analise/06-pontas-soltas.md antes de confiar cegamente.

     Simplificações deliberadas em relação ao mapa original (documentadas lá):
       - Integrantes locais além de quem migra viram convite por e-mail sempre
         (não tenta detectar se já têm conta — precisaria de uma RPC de busca
         por e-mail que não existe no schema ainda). O criador entra via o
         trigger on_trip_created; os demais aceitam o convite normalmente.
       - activity_participants e expense_shares só recebem o próprio migrante
         (mesma razão: outros ids locais não correspondem a contas reais).
       - Ordem docs → activities (não activities → docs como no mapa original):
         activities.doc_id referencia docs.id, então docs precisa existir primeiro.
       - doc_legs não é migrado (metadado secundário; docs.parsed já guarda tudo). */
  var MIGRATION_KEY = 'trippin_migration';
  var MIGRATION_RETENTION_DAYS = 30;
  var DOC_KIND = { tickets: 'ticket', stays: 'lodging', events: 'other', extras: 'other' };

  function migrationRecord() {
    try { return JSON.parse(localStorage.getItem(MIGRATION_KEY)) || null; }
    catch (e) { return null; }
  }
  function setMigrationRecord(rec) {
    try { localStorage.setItem(MIGRATION_KEY, JSON.stringify(rec)); } catch (e) {}
  }
  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    var mimeMatch = /data:(.*?);base64/.exec(parts[0]);
    var mime = (mimeMatch && mimeMatch[1]) || 'application/octet-stream';
    var bin = atob(parts[1] || '');
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  // Upload best-effort: se a mídia sumiu (nem dataUrl nem blob no IndexedDB),
  // migra só os dados extraídos, com storage_path=null e source='legacy' —
  // regra explícita do mapa de migração para esse caso.
  function uploadMediaIfAny(bucket, path, dataUrl, blobKey, mediaMap) {
    var raw = dataUrl;
    if (!raw && blobKey && mediaMap && mediaMap[blobKey]) raw = mediaMap[blobKey];
    if (!raw || raw.indexOf('data:') !== 0) return Promise.resolve(null);
    return sb.storage.from(bucket).upload(path, dataUrlToBlob(raw), { upsert: true })
      .then(function (r) { return r.error ? null : path; })
      .catch(function () { return null; });
  }

  function migrateDocs(tripId, localTrip, mediaMap, report, progress) {
    var docs = localTrip.docs || [];
    var idMap = {}; // id local (string) -> id novo (bigint)
    return docs.reduce(function (chain, d) {
      return chain.then(function () {
        return sb.from('docs').select('id').eq('legacy_id', String(d.id)).maybeSingle().then(function (existing) {
          if (existing.data) { idMap[d.id] = existing.data.id; return; }
          var path = tripId + '/' + (d.id || crypto.randomUUID()) + '-' + (d.file || d.name || 'anexo');
          return uploadMediaIfAny('trip-documents', path, d.dataUrl, d.blob, mediaMap).then(function (storedPath) {
            return sb.from('docs').insert({
              trip_id: tripId,
              uploaded_by: (window._trippinUser && window._trippinUser.id) || null,
              kind: DOC_KIND[d.cat] || 'other',
              source: storedPath ? 'upload' : 'legacy',
              name: d.name || d.file || '',
              storage_path: storedPath,
              parsed: d.itin || d.lodging || d.booking || {},
              legacy_id: String(d.id),
            }).select('id').single();
          }).then(function (r) {
            if (r && !r.error) { idMap[d.id] = r.data.id; report.docs++; progress('doc'); }
          });
        });
      });
    }, Promise.resolve()).then(function () { return idMap; });
  }

  function migrateActivities(tripId, localTrip, myId, docIdMap, report, progress) {
    var acts = localTrip.activities || [];
    return acts.reduce(function (chain, a) {
      return chain.then(function () {
        return sb.from('activities').select('id').eq('legacy_id', String(a.id)).maybeSingle().then(function (existing) {
          if (existing.data) return existing.data.id;
          var day = a.date || localTrip.startDate;
          var startsAt = day + 'T' + (a.start || a.time || '00:00') + ':00';
          var endsAt = a.end ? (day + 'T' + a.end + ':00') : null;
          return sb.from('activities').insert({
            trip_id: tripId,
            title: a.title || '(sem título)',
            place: a.loc || a.place || '',
            kind: /transport/i.test(a.type || '') ? 'transport' : /stay/i.test(a.type || '') ? 'lodging'
                : /food/i.test(a.type || '') ? 'food' : /tour/i.test(a.type || '') ? 'tour' : 'other',
            starts_at: startsAt, ends_at: endsAt,
            notes: a.desc || '',
            source: a.source === 'doc' ? 'doc' : 'manual',
            doc_id: (a.docId && docIdMap[a.docId]) || null,
            created_by: (window._trippinUser && window._trippinUser.id) || null,
            legacy_id: String(a.id),
          }).select('id').single().then(function (r) { return r.error ? null : r.data.id; });
        }).then(function (newId) {
          if (!newId) return;
          report.activities++; progress('activity');
          // Só o próprio migrante — outros ids locais não têm conta real (ver
          // cabeçalho deste módulo).
          if ((a.joined || []).indexOf(myId) === -1) return;
          return sb.from('activity_participants').upsert(
            { activity_id: newId, user_id: (window._trippinUser && window._trippinUser.id) || null },
            { onConflict: 'activity_id,user_id' }
          );
        });
      });
    }, Promise.resolve());
  }

  function migrateGallery(tripId, localTrip, mediaMap, report, progress) {
    var photos = localTrip.gallery || [];
    var albumCache = {};
    var uid = (window._trippinUser && window._trippinUser.id) || null;
    return photos.reduce(function (chain, g) {
      return chain.then(function () {
        return sb.from('photos').select('id').eq('legacy_id', String(g.id)).maybeSingle().then(function (existing) {
          if (existing.data) return;
          var albumName = g.city || g.album || 'Álbum';
          var getAlbumId = albumCache[albumName]
            ? Promise.resolve(albumCache[albumName])
            : sb.from('albums').select('id').eq('trip_id', tripId).eq('name', albumName).maybeSingle().then(function (ex) {
                if (ex.data) return ex.data.id;
                return sb.from('albums').insert({ trip_id: tripId, name: albumName, legacy_id: albumName + ':' + tripId })
                  .select('id').single().then(function (r) { return r.error ? null : r.data.id; });
              });
          return getAlbumId.then(function (albumId) {
            albumCache[albumName] = albumId;
            var path = tripId + '/' + (g.id || crypto.randomUUID()) + '.jpg';
            return uploadMediaIfAny('trip-photos', path, g.src, g.blob, mediaMap).then(function (storedPath) {
              if (!storedPath) return; // sem binário, não há o que criar em `photos` (não há campo pra foto "legada" sem arquivo)
              return sb.from('photos').insert({
                trip_id: tripId, album_id: albumId, uploaded_by: uid,
                storage_path: storedPath, legacy_id: String(g.id),
              });
            });
          }).then(function () { report.photos++; progress('photo'); });
        });
      });
    }, Promise.resolve());
  }

  function migrateExpenses(tripId, localTrip, myId, report, progress) {
    var expenses = localTrip.expenses || [];
    var uid = (window._trippinUser && window._trippinUser.id) || null;
    return expenses.reduce(function (chain, e) {
      return chain.then(function () {
        return sb.from('expenses').select('id').eq('legacy_id', String(e.id)).maybeSingle().then(function (existing) {
          if (existing.data) return;
          var paidByMe = !e.paidBy || e.paidBy === myId;
          return sb.from('expenses').insert({
            trip_id: tripId,
            description: e.desc || e.description || '(sem descrição)',
            amount: +e.amount || 0.01,
            currency: e.currency || 'BRL',
            split_method: e.equalSplit === false ? 'custom' : 'equal',
            paid_by: uid, // só resolve com confiança quando o pagador é quem migra
            needs_review: !paidByMe, // mapa de migração: pagador não resolvido -> precisa revisão
            notes: e.note || '',
            legacy_id: String(e.id),
          }).select('id').single().then(function (r) {
            if (r.error) return;
            report.expenses++; progress('expense');
            return sb.from('expense_shares').upsert(
              { expense_id: r.data.id, user_id: uid, share_amount: +e.amount || 0 },
              { onConflict: 'expense_id,user_id' }
            );
          });
        });
      });
    }, Promise.resolve());
  }

  function migrateMembers(tripId, localTrip, myId) {
    var others = (localTrip.members || []).filter(function (m) { return m.id !== myId && m.email; });
    return others.reduce(function (chain, m) {
      return chain.then(function () {
        return sb.from('invites').select('id').eq('trip_id', tripId).eq('email', m.email.toLowerCase()).maybeSingle().then(function (existing) {
          if (existing.data) return;
          return sb.from('invites').insert({
            trip_id: tripId, email: m.email.toLowerCase(), channel: 'email',
            status: 'pending-response', legacy_id: String(m.id) + ':' + tripId,
          });
        });
      });
    }, Promise.resolve());
  }

  function migrateOneTrip(localTrip, myId, mediaMap, report, progress) {
    return sb.from('trips').select('id').eq('legacy_id', String(localTrip.id)).maybeSingle()
      .then(function (existing) {
        if (existing.data) return existing.data.id;
        return sb.from('trips').insert({
          name: localTrip.name, start_date: localTrip.startDate, end_date: localTrip.endDate,
          status: localTrip.status === 'past' ? 'past' : 'active',
          destinations: localTrip.destinations || [],
          city_overrides: localTrip.cityOverrides || {},
          created_by: (window._trippinUser && window._trippinUser.id) || null,
          legacy_id: String(localTrip.id),
        }).select('id').single().then(function (r) {
          if (r.error) throw r.error; // viagem não migra parcialmente — regra #2
          return r.data.id; // trigger on_trip_created já colocou o migrante como admin
        });
      })
      .then(function (tripId) {
        report.trips++; progress('trip');
        return migrateMembers(tripId, localTrip, myId)
          .then(function () { return migrateDocs(tripId, localTrip, mediaMap, report, progress); })
          .then(function (docIdMap) { return migrateActivities(tripId, localTrip, myId, docIdMap, report, progress); })
          .then(function () { return migrateExpenses(tripId, localTrip, myId, report, progress); })
          .then(function () { return migrateGallery(tripId, localTrip, mediaMap, report, progress); });
      })
      .catch(function (e) { report.errors.push({ trip: localTrip.name, error: String(e && e.message || e) }); });
  }

  var migration = {
    hasPending: function () {
      var s = localStore.load();
      var rec = migrationRecord();
      return !!(s.trips && s.trips.length && (!rec || rec.status !== 'done'));
    },
    // Prévia pro Assistente: "N viagens, N atividades..." antes de perguntar.
    preview: function () {
      var s = localStore.load();
      var trips = s.trips || [];
      var counts = { trips: trips.length, activities: 0, docs: 0, photos: 0, expenses: 0 };
      trips.forEach(function (tr) {
        counts.activities += (tr.activities || []).length;
        counts.docs += (tr.docs || []).length;
        counts.photos += (tr.gallery || []).length;
        counts.expenses += (tr.expenses || []).length;
      });
      return counts;
    },
    // 30 dias depois de uma migração concluída com sucesso, apaga o estado
    // local — nunca antes disso (regra #5 do mapa de migração).
    sweepIfExpired: function () {
      var rec = migrationRecord();
      if (!rec || rec.status !== 'done') return;
      var days = (Date.now() - new Date(rec.at).getTime()) / 86400000;
      if (days >= MIGRATION_RETENTION_DAYS) { localStore.clear(); setMigrationRecord(null); }
    },
    run: function (onProgress) {
      if (mode !== 'remote' || !sb) return Promise.reject(new Error('migration.run requer mode="remote"'));
      var report = { trips: 0, activities: 0, docs: 0, photos: 0, expenses: 0, errors: [] };
      var progress = function (step) { if (onProgress) try { onProgress(step, report); } catch (e) {} };
      return auth.currentUser().then(function (me) {
        if (!me) throw new Error('migration.run requer sessão autenticada');
        window._trippinUser = me; // migrateXxx lêem daqui pra saber o uid real
        return media.getAll().then(function (mediaMap) {
          var s = localStore.load();
          var trips = s.trips || [];
          return trips.reduce(function (chain, localTrip) {
            return chain.then(function () { return migrateOneTrip(localTrip, myIdFor(me), mediaMap, report, progress); });
          }, Promise.resolve());
        });
      }).then(function () {
        setMigrationRecord({ status: report.errors.length ? 'partial' : 'done', at: new Date().toISOString(), report: report });
        return report;
      });
    }
  };
  function myIdFor(u) { return (u && u.id) || 'me'; }

  function callFn(name, body) {
    if (!sb) return Promise.reject(new Error('TrippinAPI: Edge Functions exigem mode="remote"'));
    return sb.functions.invoke(name, { body: body })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }

  /* ------------------------------------------------------------ bootstrap --
     Tarefa 2.9. `mode` só vira 'remote' se config.js (AD-08: resolução por
     hostname) tiver credenciais E `REMOTE_ENABLED` estiver ligado — hoje
     `false` em todo lugar até a Fase 1 estar aplicada no projeto real (ver
     comentário em app/config.js). Isso é o que faz "com o backend desligado,
     o app ainda abre em modo local" continuar verdade mesmo depois da 2B. */
  function resolveMode() {
    if (cfg.FORCE_MODE) return cfg.FORCE_MODE;
    if (!cfg.REMOTE_ENABLED) return 'local';
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return 'local';
    return 'remote';
  }

  var SUPABASE_SDK_URL = 'https://unpkg.com/@supabase/supabase-js@2.112.4/dist/umd/supabase.js';
  var SUPABASE_SDK_SRI = 'sha384-ysv13JVP3fufiEXfjML9OdCa/rRbMJvUBOWyor82wfuK8INNZAvmbxHgKIHi+oqz';
  function loadSupabaseSdk() {
    if (window.supabase) return Promise.resolve(window.supabase);
    return new Promise(function (res, rej) {
      var el = document.createElement('script');
      el.src = SUPABASE_SDK_URL;
      el.integrity = SUPABASE_SDK_SRI;
      el.crossOrigin = 'anonymous';
      el.onload = function () { res(window.supabase); };
      el.onerror = function () { rej(new Error('falha ao carregar supabase-js')); };
      document.head.appendChild(el);
    });
  }

  // Carrega o SDK e valida a conexão só quando resolveMode() aponta pra
  // 'remote' — em 'local' (o padrão hoje) nenhum script novo é buscado,
  // então o boot do app fica idêntico ao de antes da Fase 2B.
  function init() {
    mode = resolveMode();
    if (mode !== 'remote') return Promise.resolve();
    return loadSupabaseSdk().then(function (supa) {
      sb = supa.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      // Health-check: se o schema não bater (Fase 1 não aplicada nesse
      // projeto ainda) ou a rede falhar, cai pra 'local' sem travar o app.
      // supabase-js normalmente NÃO rejeita a Promise num erro do PostgREST
      // (volta como {error} num resultado 200/4xx) — por isso o `.then()`
      // confere `r.error` explicitamente, e não só o `.catch()`.
      return sb.from('profiles').select('id').limit(1);
    }).then(function (r) {
      if (r && r.error) { mode = 'local'; sb = null; }
    }).catch(function () { mode = 'local'; sb = null; });
  }

  window.TrippinAPI = {
    init: init,
    get mode() { return mode; },
    auth: auth, trips: trips, members: members, invites: invites,
    docs: docs, activities: activities, expenses: expenses, photos: photos,
    notifications: notifications,
    privacy: privacy, log: log,
    local: localStore,
    media: media,
    migration: migration,
    sync: sync,
    cache: { get: cacheGet, set: cacheSet, drop: cacheDrop },
    queue: {
      enqueue: enqueue, flush: flush, flushAll: flushAll,
      pendingCount: function (tripId) { return queueRead(tripId).length; },
      // Tarefa 5.4: "log de sincronização acessível" — leitura simples do
      // histórico local (últimos SYNC_LOG_MAX eventos, mais recente primeiro).
      log: function () { try { return JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || '[]'); } catch (e) { return []; } }
    },
    _sb: function () { return sb; }
  };
})();
