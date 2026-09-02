/**
 * Trippin — Fase 2B: autenticação real (mode='remote'), mockada.
 *
 * Cobertura desta suíte (parcial da tarefa 2.10 — o resto exige um projeto
 * Supabase de verdade, que não existe neste ambiente):
 *   1. Com mode='local' (padrão hoje), a tela de login NEM aparece.
 *   2. Com mode='remote' forçado, o link "Já tenho conta" aparece e leva à
 *      LoginScreen; login bem-sucedido usa o perfil vindo do "servidor"
 *      (mockado) — inclusive first_name/last_name, não um `name` único.
 *   3. Login com credenciais inválidas mostra erro, sem travar a UI.
 *
 * "dois usuários na mesma viagem" e "sessão expirada" ficam de fora: exigem
 * RLS e um segundo contexto de navegador contra um backend real, não mock.
 *
 * Técnica: intercepta `config.js` para injetar FORCE_MODE='remote' (bypassa
 * o REMOTE_ENABLED=false real) e mocka as chamadas REST/Auth do Supabase —
 * o SDK em si carrega de verdade do unpkg (mesma URL/versão de produção).
 */
const { test, expect } = require('@playwright/test');

const FAKE_USER_ID = '99999999-9999-4999-8999-999999999999';

const FORCED_REMOTE_CONFIG = `
window.TRIPPIN_CONFIG = {
  SUPABASE_URL: "https://fake-project.supabase.co",
  SUPABASE_ANON_KEY: "fake-anon-key",
  APP_URL: "http://localhost:8000",
  REMOTE_ENABLED: true,
  FORCE_MODE: "remote"
};
`;

async function mockRemoteBackend(page, { profile } = {}) {
  const row = Object.assign({
    id: FAKE_USER_ID, email: 'ana@teste.com', first_name: 'Ana', last_name: 'Convidada',
    phone: '', cpf: '', birth: null, photo_path: null, user_code: '654321',
    language: 'pt-BR', onboarded: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }, profile || {});

  // Sessão simulada do Supabase Auth.
  await page.route('**/auth/v1/token*', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: { id: FAKE_USER_ID, email: row.email, aud: 'authenticated', role: 'authenticated' },
      }),
    })
  );

  // Health-check (init) e currentUser() batem no mesmo endpoint REST, com
  // shapes diferentes: `.limit(1)` quer array, `.single()` quer objeto —
  // o PostgREST distingue pelo header Accept.
  await page.route('**/rest/v1/profiles*', route => {
    const accept = route.request().headers()['accept'] || '';
    const isSingle = accept.includes('vnd.pgrst.object');
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(isSingle ? row : [row]),
    });
  });
}

async function interceptConfigWithForcedRemote(page) {
  await page.route('**/config.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: FORCED_REMOTE_CONFIG })
  );
}

test.describe('Fase 2B · modo local (padrão) não mostra login', () => {
  test('sem mode remoto, "Já tenho conta" não aparece na tela de idioma', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil'))
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Brasil'));
      btn.click();
    });
    const hasLoginLink = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Já tenho conta'))
    );
    expect(hasLoginLink).toBe(false);
  });
});

test.describe('Fase 2B · mode remoto (mockado)', () => {
  test('login bem-sucedido usa o perfil vindo do servidor e entra no app', async ({ page }) => {
    await interceptConfigWithForcedRemote(page);
    await mockRemoteBackend(page);

    await page.goto('/');
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil'))
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Brasil'));
      btn.click();
    });

    // apiMode só vira 'remote' depois que TrippinAPI.init() resolve (async) —
    // espera o link de login aparecer em vez de assumir que já está lá.
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Já tenho conta')),
      { timeout: 15_000 }
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Já tenho conta'));
      btn.click();
    });

    await page.waitForFunction(() => document.body.innerText.includes('Entrar'));

    const emailInput = page.locator('input[type="email"]');
    const pwdInput = page.locator('input[type="password"]');
    await emailInput.fill('ana@teste.com');
    await pwdInput.fill('qualquerSenha123');

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar');
      btn.click();
    });

    // Perfil mockado tem first_name='Ana' — confirma que o mapeamento
    // profiles.first_name -> user.firstName está correto de ponta a ponta.
    await page.waitForFunction(() => document.body.innerText.includes('Olá, Ana'), { timeout: 15_000 });
  });

  test('login com credenciais inválidas mostra erro e não trava a UI', async ({ page }) => {
    await interceptConfigWithForcedRemote(page);
    await page.route('**/auth/v1/token*', route =>
      route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      })
    );
    await page.route('**/rest/v1/profiles*', route => {
      const accept = route.request().headers()['accept'] || '';
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(accept.includes('vnd.pgrst.object') ? null : []),
      });
    });

    await page.goto('/');
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil'))
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Brasil'));
      btn.click();
    });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Já tenho conta')),
      { timeout: 15_000 }
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Já tenho conta'));
      btn.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('Entrar'));

    await page.locator('input[type="email"]').fill('ana@teste.com');
    await page.locator('input[type="password"]').fill('senhaErrada');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar');
      btn.click();
    });

    // O app mostra a mensagem de erro que veio do servidor (aqui, a mockada
    // "Invalid login credentials"), não um texto fixo — checa que apareceu
    // *algum* erro visível, sem travar a UI nem avançar indevidamente.
    await expect(page.locator('text=Invalid login credentials')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
