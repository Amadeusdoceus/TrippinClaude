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
const { fillByIndex, clickButton } = require('./helpers');

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

async function mockRemoteBackend(page, { profile, onProfilePatch } = {}) {
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
  // o PostgREST distingue pelo header Accept. PATCH (profiles.update) grava
  // no `row` em memória, pra um GET seguinte no mesmo teste já refletir a
  // mudança — necessário pra testar "perfil aplicado depois da confirmação".
  await page.route('**/rest/v1/profiles*', route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const patch = req.postDataJSON() || {};
      if (onProfilePatch) onProfilePatch(patch);
      Object.assign(row, patch);
      route.fulfill({ status: 204, body: '' });
      return;
    }
    const accept = req.headers()['accept'] || '';
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

// GoTrue, com "Confirm email" ligado (o caso do projeto de produção — ver
// docs/06-rollout-plan.md), responde ao POST /signup com 200 e o usuário
// criado, mas SEM `access_token`/sessão — supabase-js só monta `data.session`
// quando o corpo tem `access_token`; sem ele, `data.session` fica `null`.
async function mockPendingSignup(page, email) {
  await page.route('**/auth/v1/signup*', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE_USER_ID, aud: 'authenticated', role: 'authenticated', email,
        email_confirmed_at: null, confirmed_at: null, phone: '', last_sign_in_at: null,
        app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }),
    })
  );
}

// Simula "acabei de clicar no link de confirmação de e-mail (ou reabri o
// app) e o SDK do Supabase já tem uma sessão válida guardada" — sem depender
// de nenhum fluxo de UI (login/signup) rodar antes. A chave replica o que o
// supabase-js grava de verdade: `sb-<primeiro-segmento-do-host>-auth-token`.
async function seedRestoredSession(page, email) {
  const session = {
    access_token: 'fake-access-token', refresh_token: 'fake-refresh-token',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: FAKE_USER_ID, aud: 'authenticated', role: 'authenticated', email },
  };
  await page.addInitScript(({ key, value }) => {
    try { localStorage.setItem(key, value); } catch (e) {}
  }, { key: 'sb-fake-project-auth-token', value: JSON.stringify(session) });
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

    // authErrorKey() (app/index.html) traduz "Invalid login credentials" —
    // texto cru do GoTrue mockado acima — para a mensagem em pt-BR; o app
    // não deve mais vazar o inglês direto pro usuário. Checa a tradução,
    // sem travar a UI nem avançar indevidamente.
    await expect(page.locator('text=E-mail ou senha incorretos.')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});

// Bug real encontrado em produção (2026-09-19): com "Confirm email" ligado
// no projeto Supabase, signUp() não devolve sessão na hora — só depois que a
// pessoa clica no link recebido por e-mail. Dois problemas nascem daí:
//   1. Os campos preenchidos no cadastro (nome, telefone, CPF, nascimento)
//      eram descartados: signUp() só gravava em `profiles` quando já tinha
//      sessão imediata, o que nunca acontece com confirmação de e-mail ligada.
//   2. Depois de confirmar o e-mail e voltar pro app (ou só reabrir o app com
//      uma sessão do Supabase ainda válida), a tela inicial ficava presa em
//      "Escolha o idioma" — App() só decide a tela pelo usuário salvo no
//      cache local (`persisted.user`), nunca checando se já existe sessão
//      remota válida.
test.describe('Fase 2B · confirmação de e-mail pendente', () => {
  test('dados do cadastro não se perdem quando a confirmação de e-mail é obrigatória', async ({ page }) => {
    await interceptConfigWithForcedRemote(page);
    const patches = [];
    await mockRemoteBackend(page, {
      profile: { email: 'zeca@teste.com', first_name: '', last_name: '', phone: '', cpf: '', birth: null, onboarded: false },
      onProfilePatch: (patch) => patches.push(patch),
    });
    await mockPendingSignup(page, 'zeca@teste.com');

    await page.goto('/');
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil'))
    );
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Brasil'));
      btn.click();
    });
    await clickButton(page, 'Continuar');
    await page.waitForFunction(() => document.body.innerText.includes('Criar perfil'));

    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('input')).filter(i => i.type !== 'file').length >= 7
    );
    await fillByIndex(page, 0, 'Zeca');
    await fillByIndex(page, 1, 'Pendente');
    await fillByIndex(page, 2, '1990-01-15');
    await fillByIndex(page, 4, 'zeca@teste.com');
    await fillByIndex(page, 5, '11999998888');
    await fillByIndex(page, 6, 'Senha123');
    await fillByIndex(page, 7, 'Senha123');
    await page.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) cb.click();
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await clickButton(page, 'Confirmar e entrar');

    // Confirma que o app trata isso como sucesso (conta criada), não como erro.
    await expect(page.locator('text=Conta criada!')).toBeVisible({ timeout: 10_000 });

    // Simula clicar no link do e-mail e depois logar (o único caminho que a
    // UI oferece hoje pra "entrar" a partir daqui).
    await clickButton(page, 'Já tenho conta — entrar');
    await page.waitForFunction(() => document.body.innerText.includes('Entrar'));
    await page.locator('input[type="email"]').fill('zeca@teste.com');
    await page.locator('input[type="password"]').fill('Senha123');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar');
      btn.click();
    });

    // O nome digitado no cadastro (perdido hoje) precisa aparecer no Home —
    // prova de que o perfil foi aplicado depois que a sessão existiu de verdade.
    await expect(page.locator('text=Olá, Zeca')).toBeVisible({ timeout: 15_000 });
    expect(patches.some(p => p.first_name === 'Zeca' && p.last_name === 'Pendente')).toBe(true);
  });
});

test.describe('Fase 2B · sessão remota restaurada no boot', () => {
  test('com sessão do Supabase já válida, o app pula o onboarding e vai direto pro Home', async ({ page }) => {
    await interceptConfigWithForcedRemote(page);
    await seedRestoredSession(page, 'ana@teste.com');
    await mockRemoteBackend(page, { profile: { first_name: 'Restaurada', onboarded: true } });

    await page.goto('/');

    // Nenhum clique: o app precisa reconhecer sozinho a sessão que o SDK do
    // Supabase já tinha guardada (exatamente o estado de quem acabou de
    // confirmar o e-mail e voltou, ou reabriu o app numa aba nova) e ir
    // direto pro Home — hoje ele fica preso em "Escolha o idioma". Sem
    // idioma escolhido (pulamos o onboarding de propósito), o texto vem em
    // en-US (fallback de dict() — ver I18N) — por isso "Hi," e não "Olá,".
    await expect(page.getByRole('heading', { name: /Restaurada/ })).toBeVisible({ timeout: 15_000 });
  });
});
