/**
 * Trippin — Fase 6: Privacidade e dados (mode='remote'), mockado.
 *
 * Cobre: exportar dados baixa um arquivo de verdade (page.on('download')),
 * e excluir conta chama a Edge Function delete-account e desloga o usuário.
 * Não cobre: a Edge Function delete-account em si contra um Postgres real
 * (RPC delete_my_account + auth.admin.deleteUser) — só o contrato HTTP dela.
 */
const { test, expect } = require('@playwright/test');

const FAKE_USER_ID = '11111111-2222-4333-8444-555555555555';

const FORCED_REMOTE_CONFIG = `
window.TRIPPIN_CONFIG = {
  SUPABASE_URL: "https://fake-project.supabase.co",
  SUPABASE_ANON_KEY: "fake-anon-key",
  APP_URL: "http://localhost:8000",
  REMOTE_ENABLED: true,
  FORCE_MODE: "remote"
};
`;

async function mockAndLogin(page) {
  await page.route('**/config.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: FORCED_REMOTE_CONFIG })
  );
  await page.route('**/auth/v1/token*', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'y',
        user: { id: FAKE_USER_ID, email: 'privado@teste.com', aud: 'authenticated', role: 'authenticated' },
      }),
    })
  );
  await page.route('**/rest/v1/profiles*', route => {
    const accept = route.request().headers()['accept'] || '';
    const row = {
      id: FAKE_USER_ID, email: 'privado@teste.com', first_name: 'Privado', last_name: 'Teste',
      phone: '', cpf: '', birth: null, photo_path: null, user_code: '777666',
      language: 'pt-BR', onboarded: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accept.includes('vnd.pgrst.object') ? row : [row]) });
  });
  await page.route('**/rest/v1/trips*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/trip_members*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.addInitScript(() => localStorage.removeItem('trippin_v1'));
  await page.goto('/');
  await page.waitForFunction(() => window.TrippinAPI && window.TrippinAPI.mode === 'remote', { timeout: 15000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil')));
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Brasil')).click());
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Já tenho conta')), { timeout: 15000 });
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Já tenho conta')).click());
  await page.waitForFunction(() => document.body.innerText.includes('Entre com a conta'));
  await page.locator('input[type="email"]').fill('privado@teste.com');
  await page.locator('input[type="password"]').fill('qualquerSenha123');
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar').click());
  await page.waitForFunction(() => document.body.innerText.includes('Olá, Privado'), { timeout: 15000 });

  // Menu -> Configurações -> Privacidade e dados
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Menu')).click());
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Configurações')).click());
  await page.waitForFunction(() => document.body.innerText.includes('Privacidade e dados'), { timeout: 10000 });
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const card = cards.find(c => c.textContent.includes('Privacidade e dados'));
    card.querySelector('button').click();
  });
  await page.waitForFunction(() => document.body.innerText.includes('Exportar meus dados'), { timeout: 10000 });
}

test.describe('Fase 6 · Privacidade e dados (mockado)', () => {
  test('exportar meus dados baixa um JSON de verdade', async ({ page }) => {
    await mockAndLogin(page);
    await page.route('**/rest/v1/rpc/export_my_data', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        profile: { id: FAKE_USER_ID, first_name: 'Privado' }, trips: [], activities: [], expenses: [], docs: [], exported_at: '2026-01-01T00:00:00Z',
      }) })
    );

    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Exportar meus dados').click());
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('trippin-meus-dados.json');
  });

  test('excluir conta chama delete-account e volta pra tela de idioma', async ({ page }) => {
    await mockAndLogin(page);
    let deleteCalled = false;
    await page.route('**/functions/v1/delete-account', route => {
      deleteCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Excluir minha conta')).click());
    await page.waitForFunction(() => document.body.innerText.includes('Excluir sua conta?'));
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sim, excluir')).click());

    // Volta pra tela de idioma (logout implícito) — checa por um elemento que
    // não tem text-transform aplicado (o eyebrow "Idioma · Language" é
    // uppercase via CSS, comparação exata quebraria — mesma pegadinha já
    // vista antes com o teste da Fase 3).
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil')), { timeout: 15000 });
    expect(deleteCalled).toBe(true);
  });
});
