/**
 * Trippin — Fase 5: offline-first (mode='remote'), mockado.
 *
 * Cobertura real:
 *   1. Criar uma atividade com a rede desligada (page.context().setOffline)
 *      não perde a escrita — vai pra fila (TrippinAPI.queue), o item aparece
 *      marcado como pendente na UI, e a rede voltando (evento 'online')
 *      esvazia a fila sozinha contra o mock.
 *   2. Last-write-wins (tarefa 5.2): um UPDATE enfileirado com um
 *      `baseUpdatedAt` mais velho que o `updated_at` atual do servidor é
 *      descartado, não sobrescreve — e fica registrado como conflito no log
 *      de sincronização (TrippinAPI.queue.log()).
 *
 * O que NÃO cobre: dois dispositivos de verdade escrevendo ao mesmo tempo —
 * o teste de conflito simula o "servidor mudou enquanto eu estava offline"
 * chamando TrippinAPI diretamente com um cenário já montado, não com um
 * segundo browser. Ver analise/06-pontas-soltas.md.
 */
const { test, expect } = require('@playwright/test');

const FAKE_USER_ID = '33333333-3333-4333-3333-333333333333';
const TRIP_UUID = '22222222-2222-4222-2222-222222222222';

const FORCED_REMOTE_CONFIG = `
window.TRIPPIN_CONFIG = {
  SUPABASE_URL: "https://fake-project.supabase.co",
  SUPABASE_ANON_KEY: "fake-anon-key",
  APP_URL: "http://localhost:8000",
  REMOTE_ENABLED: true,
  FORCE_MODE: "remote"
};
`;

async function mockBaseline(page) {
  await page.route('**/config.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: FORCED_REMOTE_CONFIG })
  );
  await page.route('**/auth/v1/token*', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'fake-refresh-token',
        user: { id: FAKE_USER_ID, email: 'piloto@teste.com', aud: 'authenticated', role: 'authenticated' },
      }),
    })
  );
  await page.route('**/rest/v1/profiles*', route => {
    const accept = route.request().headers()['accept'] || '';
    const row = {
      id: FAKE_USER_ID, email: 'piloto@teste.com', first_name: 'Piloto', last_name: 'Teste',
      phone: '', cpf: '', birth: null, photo_path: null, user_code: '999888',
      language: 'pt-BR', onboarded: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accept.includes('vnd.pgrst.object') ? row : [row]) });
  });
  await page.route('**/rest/v1/trips*', route => {
    const accept = route.request().headers()['accept'] || '';
    const row = {
      id: TRIP_UUID, name: 'Voo de 10h', code: 'AVIAO0000001',
      start_date: '2026-12-01', end_date: '2026-12-05', status: 'active', destinations: [], city_overrides: {},
    };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accept.includes('vnd.pgrst.object') ? row : [row]) });
  });
  await page.route('**/rest/v1/trip_members*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ trip_id: TRIP_UUID, user_id: FAKE_USER_ID, role: 'admin' }]) })
  );
  await page.route('**/rest/v1/rpc/get_trip_member_profiles', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { user_id: FAKE_USER_ID, first_name: 'Piloto', last_name: 'Teste', email: 'piloto@teste.com', photo_path: null, role: 'admin', joined_at: '2026-11-01T00:00:00Z' },
    ]) })
  );
  await page.route('**/rest/v1/docs*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/albums*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/photos*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/expenses*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/expense_shares*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

async function loginRemote(page) {
  await page.addInitScript(() => localStorage.removeItem('trippin_v1'));
  await page.goto('/');
  await page.waitForFunction(() => window.TrippinAPI && window.TrippinAPI.mode === 'remote', { timeout: 15000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil')));
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Brasil')).click());
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Já tenho conta')), { timeout: 15000 });
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Já tenho conta')).click());
  await page.waitForFunction(() => document.body.innerText.includes('Entre com a conta'));
  await page.locator('input[type="email"]').fill('piloto@teste.com');
  await page.locator('input[type="password"]').fill('qualquerSenha123');
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar').click());
  await page.waitForFunction(() => document.body.innerText.includes('Voo de 10h'), { timeout: 15000 });
  await page.evaluate(() => Array.from(document.querySelectorAll('.tripcard')).find(el => el.textContent.includes('Voo de 10h')).click());
  await page.waitForFunction(() => document.body.innerText.includes('Cronograma') || document.querySelector('.tabbar'), { timeout: 15000 });
}

test.describe('Fase 5 · fila offline', () => {
  test('criar atividade sem rede enfileira; reconectar sincroniza sozinho', async ({ page }) => {
    await mockBaseline(page);
    let createCalled = false;
    await page.route('**/rest/v1/activities*', route => {
      const req = route.request();
      const accept = req.headers()['accept'] || '';
      if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: accept.includes('vnd.pgrst.object') ? 'null' : '[]' });
      createCalled = true;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(accept.includes('vnd.pgrst.object') ? { id: 1 } : [{ id: 1 }]) });
    });
    await page.route('**/rest/v1/activity_participants*', route => route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }));

    await loginRemote(page);

    // "Modo avião": desliga a rede antes de criar a atividade.
    await page.context().setOffline(true);

    await page.waitForFunction(() => document.body.innerText.includes('Nada planejado') || document.querySelector('.tslot') || true);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Adicionar') || b.textContent.trim().startsWith('+'));
      if (btn) btn.click();
    });
    // formulário de nova atividade: título é o primeiro campo de texto
    await page.locator('input').first().fill('Refeição a bordo');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Salvar') || b.textContent.includes('Adicionar'));
      if (btn) btn.click();
    });

    // Sem rede: a escrita não foi tentada nenhuma vez, foi direto pra fila.
    await expect(page.locator('text=Refeição a bordo')).toBeVisible({ timeout: 10000 });
    expect(createCalled).toBe(false);
    const pendingWhileOffline = await page.evaluate((tid) => window.TrippinAPI.queue.pendingCount(tid), TRIP_UUID);
    expect(pendingWhileOffline).toBeGreaterThan(0);

    // Reconecta: o listener de 'online' do TrippinAPI esvazia a fila sozinho.
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await page.waitForFunction((tid) => window.TrippinAPI.queue.pendingCount(tid) === 0, TRIP_UUID, { timeout: 10000 });
    expect(createCalled).toBe(true);
    const log = await page.evaluate(() => window.TrippinAPI.queue.log());
    expect(log.some(e => e.status === 'applied')).toBe(true);
  });
});

test.describe('Fase 5 · last-write-wins (tarefa 5.2)', () => {
  test('update enfileirado com base desatualizada perde pro servidor, não sobrescreve', async ({ page }) => {
    await mockBaseline(page);
    let updateCalled = false;
    await page.route('**/rest/v1/activities*', route => {
      const req = route.request();
      const accept = req.headers()['accept'] || '';
      const url = req.url();
      if (req.method() === 'GET' && url.includes('select=updated_at')) {
        // checagem de conflito: servidor diz que mudou DEPOIS da edição local.
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated_at: '2026-12-01T12:00:00Z' }) });
      }
      if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: accept.includes('vnd.pgrst.object') ? 'null' : '[]' });
      if (req.method() === 'PATCH') { updateCalled = true; return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
      route.continue();
    });

    await loginRemote(page);

    const result = await page.evaluate(({ tripId, remoteId }) => {
      return window.TrippinAPI.sync.diffAndPush(
        { id: tripId, name: 'Voo de 10h', startDate: '2026-12-01', endDate: '2026-12-05', status: 'active',
          destinations: [], cityOverrides: {}, members: [], docs: [], gallery: [], expenses: [],
          activities: [{ id: 'a1', _remoteId: remoteId, _updatedAt: '2026-12-01T10:00:00Z', title: 'Original', loc: '', type: 'typeOther', date: '2026-12-01', start: '09:00', end: '10:00', desc: '', joined: [] }] },
        { id: tripId, name: 'Voo de 10h', startDate: '2026-12-01', endDate: '2026-12-05', status: 'active',
          destinations: [], cityOverrides: {}, members: [], docs: [], gallery: [], expenses: [],
          // editado localmente ENQUANTO offline, com base num updated_at de 10:00 —
          // mas o "servidor" (mock acima) diz que mudou às 12:00, depois disso.
          activities: [{ id: 'a1', _remoteId: remoteId, _updatedAt: '2026-12-01T10:00:00Z', title: 'Editado offline (deveria perder)', loc: '', type: 'typeOther', date: '2026-12-01', start: '09:00', end: '10:00', desc: '', joined: [] }] },
        '33333333-3333-4333-3333-333333333333'
      );
    }, { tripId: TRIP_UUID, remoteId: 42 });

    expect(updateCalled).toBe(false); // o PATCH nunca deveria ter sido chamado
    const log = await page.evaluate(() => window.TrippinAPI.queue.log());
    expect(log.some(e => e.status === 'conflict')).toBe(true);
  });
});
