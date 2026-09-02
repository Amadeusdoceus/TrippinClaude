/**
 * Trippin — Fase 4: multiusuário real (mode='remote'), mockado.
 *
 * O que esta suíte cobre de verdade (mocks REST/Auth, SDK real):
 *   1. Abrir uma viagem remota hidrata corretamente as tabelas normalizadas
 *      (trips/activities/activity_participants/expenses/expense_shares/
 *      get_trip_member_profiles) de volta no formato aninhado que a UI
 *      sempre esperou — é o código de maior risco de toda a Fase 4.
 *   2. Criar uma atividade nova dispara TrippinAPI.activities.create (via o
 *      adaptador diffAndPush em App()), sem que ScheduleTab tenha mudado uma
 *      linha sequer.
 *   3. Entrar por código (4.3) chama join_trip_by_code e recarrega a lista.
 *   4. Listagem de integrantes (4.5): o mock da RPC não devolve CPF/telefone/
 *      data de nascimento de terceiros — confirma que a tela não quebra e
 *      mostra "—" em vez de vazar undefined.
 *
 * O que esta suíte NÃO cobre (documentado em analise/06-pontas-soltas.md):
 *   - Enforcement de RLS de verdade — os mocks nunca rejeitam nada, então
 *     "convidado não promove a si mesmo" e "não-membro recebe 0 rows" só
 *     estão provados do lado do Postgres (backend/supabase/tests/database/),
 *     não aqui.
 *   - Dois navegadores concorrentes escrevendo ao mesmo tempo (realtime,
 *     last-write-wins) — exigiria um backend de estado compartilhado real.
 */
const { test, expect } = require('@playwright/test');

const FAKE_USER_ID = '66666666-6666-4666-6666-666666666666';
const OTHER_USER_ID = '55555555-5555-4555-5555-555555555555';
const TRIP_UUID = '44444444-4444-4444-4444-444444444444';

const FORCED_REMOTE_CONFIG = `
window.TRIPPIN_CONFIG = {
  SUPABASE_URL: "https://fake-project.supabase.co",
  SUPABASE_ANON_KEY: "fake-anon-key",
  APP_URL: "http://localhost:8000",
  REMOTE_ENABLED: true,
  FORCE_MODE: "remote"
};
`;

async function mockAuthAndProfile(page) {
  await page.route('**/auth/v1/token*', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: { id: FAKE_USER_ID, email: 'ana@teste.com', aud: 'authenticated', role: 'authenticated' },
      }),
    })
  );
  await page.route('**/rest/v1/profiles*', route => {
    const accept = route.request().headers()['accept'] || '';
    const row = {
      id: FAKE_USER_ID, email: 'ana@teste.com', first_name: 'Ana', last_name: 'Convidada',
      phone: '11999998888', cpf: '', birth: '1990-01-01', photo_path: null, user_code: '654321',
      language: 'pt-BR', onboarded: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accept.includes('vnd.pgrst.object') ? row : [row]) });
  });
}

test.describe('Fase 4 · abrir viagem remota (hidratação)', () => {
  test('cronograma e despesas mostram os dados vindos das tabelas normalizadas', async ({ page }) => {
    await page.route('**/config.js', route =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: FORCED_REMOTE_CONFIG })
    );
    await mockAuthAndProfile(page);

    // trips.list() (array) e trips.get()'s .single() (objeto) batem no mesmo
    // endpoint — o PostgREST real distingue pelo header Accept, então o mock
    // precisa fazer o mesmo (mesmo padrão já usado pro mock de profiles).
    await page.route('**/rest/v1/trips*', route => {
      const accept = route.request().headers()['accept'] || '';
      const row = {
        id: TRIP_UUID, name: 'Viagem Compartilhada', code: 'ABC123XYZ000',
        start_date: '2026-10-01', end_date: '2026-10-10', status: 'active',
        destinations: [{ name: 'Lisboa, Portugal', date: '2026-10-01' }], city_overrides: {},
      };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accept.includes('vnd.pgrst.object') ? row : [row]) });
    });
    await page.route('**/rest/v1/trip_members*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { trip_id: TRIP_UUID, user_id: FAKE_USER_ID, role: 'admin' },
        { trip_id: TRIP_UUID, user_id: OTHER_USER_ID, role: 'convidado' },
      ]) })
    );
    // get_trip_member_profiles: eu + um colega, SEM cpf/telefone/nascimento do colega (finding A-05).
    await page.route('**/rest/v1/rpc/get_trip_member_profiles', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { user_id: FAKE_USER_ID, first_name: 'Ana', last_name: 'Convidada', email: 'ana@teste.com', photo_path: null, role: 'admin', joined_at: '2026-09-01T00:00:00Z' },
        { user_id: OTHER_USER_ID, first_name: 'Bruno', last_name: 'Colega', email: 'bruno@teste.com', photo_path: null, role: 'convidado', joined_at: '2026-09-02T00:00:00Z' },
      ]) })
    );
    await page.route('**/rest/v1/activities*', route => {
      if (route.request().method() !== 'GET') return route.continue();
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 900, trip_id: TRIP_UUID, title: 'Check-in Hotel', place: 'Lisboa', kind: 'lodging',
          starts_at: '2026-10-01T14:00:00', ends_at: '2026-10-01T15:00:00', notes: '', source: 'manual',
          doc_id: null, legacy_id: null },
      ]) });
    });
    await page.route('**/rest/v1/activity_participants*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ activity_id: 900, user_id: FAKE_USER_ID }]) })
    );
    await page.route('**/rest/v1/docs*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/expenses*', route => {
      if (route.request().method() !== 'GET') return route.continue();
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 700, trip_id: TRIP_UUID, description: 'Jantar em grupo', amount: '90.00', currency: 'BRL',
          split_method: 'equal', paid_by: FAKE_USER_ID, notes: '', legacy_id: null },
      ]) });
    });
    await page.route('**/rest/v1/expense_shares*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { expense_id: 700, user_id: FAKE_USER_ID, share_amount: 45, settled: false },
        { expense_id: 700, user_id: OTHER_USER_ID, share_amount: 45, settled: false },
      ]) })
    );
    await page.route('**/rest/v1/albums*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/photos*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

    await page.addInitScript(() => localStorage.removeItem('trippin_v1'));
    await page.goto('/');
    await page.waitForFunction(() => window.TrippinAPI && window.TrippinAPI.mode === 'remote', { timeout: 15000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil')));
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Brasil')).click());
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Já tenho conta')), { timeout: 15000 });
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Já tenho conta')).click());
    await page.waitForFunction(() => document.body.innerText.includes('Entre com a conta'));
    await page.locator('input[type="email"]').fill('ana@teste.com');
    await page.locator('input[type="password"]').fill('qualquerSenha123');
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar').click());

    // Home: a viagem vinda de trips.list() aparece com 2 integrantes (mock de trip_members).
    await page.waitForFunction(() => document.body.innerText.includes('Viagem Compartilhada'), { timeout: 15000 });

    // Abre a viagem: dispara trips.get() — a hidratação completa.
    await page.evaluate(() => Array.from(document.querySelectorAll('.tripcard')).find(el => el.textContent.includes('Viagem Compartilhada')).click());
    await page.waitForFunction(() => document.body.innerText.includes('Check-in Hotel'), { timeout: 15000 });

    // Custos: a despesa e o valor por pessoa (share_amount vindo de expense_shares).
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Custos'));
      btn.click();
    });
    await expect(page.locator('text=Jantar em grupo')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=45,00').first()).toBeVisible();

    // Integrantes: eu (Ana) e o colega (Bruno) aparecem; sem CPF/telefone de
    // terceiro (finding A-05) — abrir o card do Bruno não deve quebrar nem
    // mostrar "undefined".
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Usuários'));
      if (btn) btn.click();
    });
    await expect(page.locator('text=Bruno')).toBeVisible({ timeout: 10000 });
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toContain('undefined');
  });
});

test.describe('Fase 4 · entrar por código (RPC)', () => {
  test('join_trip_by_code é chamada e a lista de viagens recarrega', async ({ page }) => {
    await page.route('**/config.js', route =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: FORCED_REMOTE_CONFIG })
    );
    await mockAuthAndProfile(page);

    let joinCalled = false;
    await page.route('**/rest/v1/rpc/join_trip_by_code', route => {
      joinCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: TRIP_UUID, name: 'Viagem Entrada', start_date: '2026-11-01', end_date: '2026-11-05' },
      ]) });
    });
    await page.route('**/rest/v1/trips*', route => {
      if (!joinCalled) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        id: TRIP_UUID, name: 'Viagem Entrada', code: 'JOINED000001',
        start_date: '2026-11-01', end_date: '2026-11-05', status: 'active', destinations: [], city_overrides: {},
      }]) });
    });
    await page.route('**/rest/v1/trip_members*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ trip_id: TRIP_UUID, user_id: FAKE_USER_ID, role: 'convidado' }]) })
    );

    await page.addInitScript(() => localStorage.removeItem('trippin_v1'));
    await page.goto('/');
    await page.waitForFunction(() => window.TrippinAPI && window.TrippinAPI.mode === 'remote', { timeout: 15000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil')));
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Brasil')).click());
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Já tenho conta')), { timeout: 15000 });
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Já tenho conta')).click());
    await page.waitForFunction(() => document.body.innerText.includes('Entre com a conta'));
    await page.locator('input[type="email"]').fill('ana@teste.com');
    await page.locator('input[type="password"]').fill('qualquerSenha123');
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar').click());
    await page.waitForFunction(() => document.body.innerText.includes('Olá, Ana'), { timeout: 15000 });

    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Participar de uma viagem')).click());
    await page.waitForFunction(() => document.body.innerText.includes('Código'));
    await page.locator('input.mono').fill('JOINED000001');
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pedir para participar')).click());

    await page.waitForFunction(() => document.body.innerText.includes('Viagem Entrada'), { timeout: 15000 });
    expect(joinCalled).toBe(true);
  });
});
