/**
 * Trippin — Fase 3: Assistente de Migração (dispositivo -> nuvem), mockado.
 *
 * Verifica a ponta a ponta do fluxo novo, que nunca tinha rodado de verdade:
 * login remoto com viagem local pendente -> Assistente aparece com a prévia
 * correta -> "Enviar agora" -> TrippinAPI.migration.run() completa contra o
 * Postgres mockado -> tela de resultado -> home.
 *
 * Não cobre docs/fotos/despesas em detalhe (exigiria mockar Storage também);
 * cobre o essencial: trip + activity, contagens da prévia e do resultado.
 */
const { test, expect } = require('@playwright/test');

const FAKE_USER_ID = '88888888-8888-4888-8888-888888888888';
const FAKE_TRIP_UUID = '77777777-7777-4777-7777-777777777777';

const FORCED_REMOTE_CONFIG = `
window.TRIPPIN_CONFIG = {
  SUPABASE_URL: "https://fake-project.supabase.co",
  SUPABASE_ANON_KEY: "fake-anon-key",
  APP_URL: "http://localhost:8000",
  REMOTE_ENABLED: true,
  FORCE_MODE: "remote"
};
`;

const LOCAL_STATE = {
  lang: 'pt-BR',
  user: { firstName: 'Migrante', lastName: 'Teste', passwordHash: null },
  trips: [{
    id: 'legacytrip1', name: 'Viagem Local', startDate: '2026-09-01', endDate: '2026-09-05',
    status: 'active', destinations: [], cityOverrides: {},
    members: [{ id: 'me', firstName: 'Migrante', lastName: 'Teste', isAdmin: true }],
    activities: [{ id: 'act1', date: '2026-09-01', start: '10:00', end: '11:00', title: 'Chegada', source: 'manual', joined: ['me'] }],
    docs: [], gallery: [], expenses: [],
  }],
  settings: { notifications: true, theme: 'light', shareLocation: false },
  notifs: [],
};

async function seedLocalState(page) {
  await page.addInitScript((state) => {
    localStorage.setItem('trippin_v1', JSON.stringify(state));
  }, LOCAL_STATE);
}

async function mockRemoteBackend(page) {
  await page.route('**/auth/v1/token*', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: { id: FAKE_USER_ID, email: 'migrante@teste.com', aud: 'authenticated', role: 'authenticated' },
      }),
    })
  );

  await page.route('**/rest/v1/profiles*', route => {
    const accept = route.request().headers()['accept'] || '';
    const row = {
      id: FAKE_USER_ID, email: 'migrante@teste.com', first_name: 'Migrante', last_name: 'Teste',
      phone: '', cpf: '', birth: null, photo_path: null, user_code: '111222',
      language: 'pt-BR', onboarded: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accept.includes('vnd.pgrst.object') ? row : [row]) });
  });

  // trips: SELECT (checa legacy_id existente -> nenhum ainda) e INSERT (cria).
  await page.route('**/rest/v1/trips*', route => {
    const req = route.request();
    const accept = req.headers()['accept'] || '';
    if (req.method() === 'GET') {
      // maybeSingle() por legacy_id: nunca existe ainda neste teste.
      return route.fulfill({ status: 200, contentType: 'application/json', body: accept.includes('vnd.pgrst.object') ? 'null' : '[]' });
    }
    // POST insert -> devolve a linha criada com o novo uuid.
    return route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify(accept.includes('vnd.pgrst.object') ? { id: FAKE_TRIP_UUID } : [{ id: FAKE_TRIP_UUID }]),
    });
  });

  // activities: mesma lógica (SELECT vazio, INSERT devolve id novo).
  await page.route('**/rest/v1/activities*', route => {
    const req = route.request();
    const accept = req.headers()['accept'] || '';
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: accept.includes('vnd.pgrst.object') ? 'null' : '[]' });
    }
    return route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify(accept.includes('vnd.pgrst.object') ? { id: 555 } : [{ id: 555 }]),
    });
  });

  // Sem docs/gallery/expenses/members neste teste (arrays vazios no estado
  // local) — não deveriam gerar nenhuma chamada a docs/photos/expenses/invites.
  await page.route('**/rest/v1/activity_participants*', route => route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }));
}

test.describe('Fase 3 · Assistente de Migração (mockado)', () => {
  test('login remoto com viagem local pendente mostra o Assistente e conclui a migração', async ({ page }) => {
    await page.route('**/config.js', route =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: FORCED_REMOTE_CONFIG })
    );
    await seedLocalState(page);
    await mockRemoteBackend(page);

    // Estado local já tem um perfil (offline, sem conta remota) — o app abre
    // direto no home, não na tela de idioma. O caminho até o login remoto,
    // pra quem já usa o app localmente, é Menu -> Configurações -> "Entrar /
    // criar conta na nuvem" (ver SettingsScreen, seção "Nuvem").
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('Viagem Local'), { timeout: 10_000 });
    // espera TrippinAPI.init() resolver de verdade pra 'remote' antes de navegar
    // até Configurações — sem isso, o link "Entrar / criar conta na nuvem" nem
    // renderiza (gate correto: fica escondido em modo local).
    await page.waitForFunction(() => window.TrippinAPI && window.TrippinAPI.mode === 'remote', { timeout: 15_000 });
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Menu'));
      btn.click();
    });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Configurações')),
      { timeout: 10_000 }
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Configurações'));
      btn.click();
    });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Entrar / criar conta na nuvem')),
      { timeout: 15_000 }
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Entrar / criar conta na nuvem'));
      btn.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('Entre com a conta'));

    await page.locator('input[type="email"]').fill('migrante@teste.com');
    await page.locator('input[type="password"]').fill('qualquerSenha123');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar');
      btn.click();
    });

    // Assistente aparece (não vai direto pro home) com a prévia correta: 1
    // viagem, 1 atividade — confirma que hasPending()/preview() leram o
    // localStorage semeado corretamente.
    await page.waitForFunction(() => document.body.innerText.includes('Encontramos viagens neste dispositivo'), { timeout: 15_000 });
    await expect(page.locator('text=1 viagens')).toBeVisible();
    await expect(page.locator('text=1 atividades')).toBeVisible();

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Enviar agora');
      btn.click();
    });

    // migration.run() completou contra o backend mockado sem lançar erro.
    await page.waitForFunction(() => document.body.innerText.includes('Tudo enviado'), { timeout: 15_000 });

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Continuar');
      btn.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('Olá, Migrante'), { timeout: 10_000 });
  });

  test('"Agora não" pula o Assistente e vai direto pro home', async ({ page }) => {
    await page.route('**/config.js', route =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: FORCED_REMOTE_CONFIG })
    );
    await seedLocalState(page);
    await mockRemoteBackend(page);

    // Estado local já tem um perfil (offline, sem conta remota) — o app abre
    // direto no home, não na tela de idioma. O caminho até o login remoto,
    // pra quem já usa o app localmente, é Menu -> Configurações -> "Entrar /
    // criar conta na nuvem" (ver SettingsScreen, seção "Nuvem").
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('Viagem Local'), { timeout: 10_000 });
    // espera TrippinAPI.init() resolver de verdade pra 'remote' antes de navegar
    // até Configurações — sem isso, o link "Entrar / criar conta na nuvem" nem
    // renderiza (gate correto: fica escondido em modo local).
    await page.waitForFunction(() => window.TrippinAPI && window.TrippinAPI.mode === 'remote', { timeout: 15_000 });
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Menu'));
      btn.click();
    });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Configurações')),
      { timeout: 10_000 }
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Configurações'));
      btn.click();
    });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Entrar / criar conta na nuvem')),
      { timeout: 15_000 }
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Entrar / criar conta na nuvem'));
      btn.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('Entre com a conta'));

    await page.locator('input[type="email"]').fill('migrante@teste.com');
    await page.locator('input[type="password"]').fill('qualquerSenha123');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar');
      btn.click();
    });

    await page.waitForFunction(() => document.body.innerText.includes('Encontramos viagens neste dispositivo'), { timeout: 15_000 });
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Agora não');
      btn.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('Olá, Migrante'), { timeout: 10_000 });
  });
});
