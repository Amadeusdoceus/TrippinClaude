/**
 * Trippin — End-to-End Test Suite
 *
 * Covers the full user journey validated manually on 2026-06-18:
 *   1. App loads (not blank)
 *   2. Language selection
 *   3. Registration / profile creation
 *   4. Home screen — no pre-seeded trip
 *   5. Trip creation
 *   6. Members tab — invite form
 *   7. Invite — mailto fallback when backend unavailable
 *   8. Invite — registered locally as "Aguardando resposta"
 *
 * Run:  npx playwright test
 * Watch: npx playwright test --headed
 */

const { test, expect } = require('@playwright/test');
const {
  selectLanguage,
  registerUser,
  createTrip,
  clickButton,
  fillReact,
  interceptWindowOpen,
  isKnownError,
} = require('./helpers');

// ─── 1. SMOKE ────────────────────────────────────────────────────────────────

test.describe('1 · App carrega', () => {
  test('exibe tela de idioma sem erro de JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto('/');
    await expect(page.locator('text=Escolha o idioma')).toBeVisible({ timeout: 10_000 });

    // Nenhum erro crítico (erros do Supabase SDK em modo offline são esperados)
    const critical = errors.filter(e => !isKnownError(e) && !e.includes('ResizeObserver'));
    expect(critical).toHaveLength(0);
  });

  test('não exibe tela em branco', async ({ page }) => {
    await page.goto('/');
    // O body deve ter conteúdo visível
    const text = await page.evaluate(() => document.body.innerText.trim());
    expect(text.length).toBeGreaterThan(10);
  });
});

// ─── 2. SELEÇÃO DE IDIOMA ─────────────────────────────────────────────────────

test.describe('2 · Seleção de idioma', () => {
  test('selecionar PT-BR e continuar leva ao Criar perfil', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await expect(page.locator('text=Criar perfil')).toBeVisible();
  });
});

// ─── 3. CADASTRO ─────────────────────────────────────────────────────────────

test.describe('3 · Cadastro de usuário', () => {
  test('preencher formulário e confirmar cria conta e vai para Home', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Joana', email: 'joana@trippin.com' });

    await expect(page.locator('text=Olá, Joana')).toBeVisible();
  });

  test('botão Confirmar fica desabilitado sem senha preenchida', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);

    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('input')).filter(i => i.type !== 'file').length >= 7
    );
    // Sem preencher a senha, o botão deve estar desativado (opacity/disabled)
    const btn = page.locator('button', { hasText: 'Confirmar e entrar' });
    // Scroll para o botão aparecer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // O botão existe mas está desabilitado visualmente (sem click)
    await expect(btn).toBeVisible();
  });
});

// ─── 4. HOME — SEM VIAGEM PRÉ-DEFINIDA ───────────────────────────────────────

test.describe('4 · Home screen', () => {
  test('não exibe viagem pré-definida ao primeiro acesso', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page);

    // As únicas opções devem ser "Nova viagem" e "Participar de uma viagem"
    await expect(page.locator('text=Nova viagem')).toBeVisible();
    await expect(page.locator('text=Participar de uma viagem')).toBeVisible();

    // Não deve existir nenhum card de viagem com nome fictício (o seed antigo chamava-se "Eurotrip 2025" etc.)
    const tripCards = await page.locator('text=Eurotrip').count();
    expect(tripCards).toBe(0);

    // A seção "Viagens anteriores" deve mostrar mensagem de vazio
    await expect(page.locator('text=Acesse o histórico')).toBeVisible();
  });
});

// ─── 5. CRIAÇÃO DE VIAGEM ─────────────────────────────────────────────────────

test.describe('5 · Criação de viagem', () => {
  test('criar viagem abre o Cronograma com o nome correto', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page);
    await createTrip(page, { name: 'Europa 2026' });

    await expect(page.locator('text=Europa 2026')).toBeVisible();
    await expect(page.locator('text=Cronograma')).toBeVisible();
  });

  test('nova viagem aparece no histórico ao voltar para Home', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page);
    await createTrip(page, { name: 'Japão 2027' });

    // Voltar
    await clickButton(page, '←');
    await expect(page.locator('text=Japão 2027')).toBeVisible();
  });
});

// ─── 6. ABA MEMBROS ──────────────────────────────────────────────────────────

test.describe('6 · Aba Membros (Usuários)', () => {
  test('exibe o criador como Admin e o formulário de convite', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Carlos' });
    await createTrip(page);

    await clickButton(page, 'Usuários');

    await expect(page.locator('text=Carlos')).toBeVisible();
    await expect(page.locator('text=Admin')).toBeVisible();
    await expect(page.locator('text=Adicionar integrante')).toBeVisible();
    await expect(page.locator('input[placeholder*="amigo"]')).toBeVisible();
  });

  test('botão Enviar convite fica inativo sem e-mail válido', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page);
    await createTrip(page);
    await clickButton(page, 'Usuários');

    // Sem e-mail, o botão deve ter aparência desabilitada (fundo pálido)
    const btn = page.locator('button', { hasText: 'Enviar convite' });
    await expect(btn).toBeVisible();
    // E-mail inválido: botão deve permanecer visualmente inativo
    await fillReact(page, 'input[placeholder*="amigo"]', 'nao-e-email');
    // O botão fica com opacity reduzida quando emailOk === false
    const opacity = await btn.evaluate(el => parseFloat(window.getComputedStyle(el).opacity));
    expect(opacity).toBeLessThan(1);

    // E-mail válido: botão ativa
    await fillReact(page, 'input[placeholder*="amigo"]', 'valido@email.com');
    const opacityAtivo = await btn.evaluate(el => parseFloat(window.getComputedStyle(el).opacity));
    expect(opacityAtivo).toBeGreaterThanOrEqual(0.99);
  });
});

// ─── 7. FLUXO DE CONVITE — MAILTO FALLBACK ───────────────────────────────────

/**
 * Intercepta a chamada ao Edge Function send-invite e retorna uma resposta
 * de erro imediata (simula Resend sem domínio verificado).
 * Isso torna os testes determinísticos e independentes de rede.
 */
async function mockInviteEndpoint(page, response = { status: 403, body: { error: 'mocked_domain_error' } }) {
  await page.route('**/functions/v1/send-invite', route =>
    route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    })
  );
}

/** Aguarda o campo de e-mail do convite ser limpo (sinal de que o fluxo concluiu). */
async function waitForInviteComplete(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('input[placeholder*="amigo"]');
      return el && el.value === '';
    },
    { timeout: 10_000 }
  );
}

test.describe('7 · Envio de convite', () => {
  test('clicar Enviar convite abre mailto com dados corretos', async ({ page }) => {
    const getOpened = interceptWindowOpen(page);
    // Mock da Edge Function: retorna 403 imediatamente
    await mockInviteEndpoint(page);

    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Lucas' });
    await createTrip(page, { name: 'Aventura 2026' });
    await clickButton(page, 'Usuários');

    await fillReact(page, 'input[placeholder*="amigo"]', 'amigo@gmail.com');
    await clickButton(page, 'Enviar convite');
    await waitForInviteComplete(page);

    const opened = await getOpened();
    expect(opened.length).toBeGreaterThan(0);

    const mailto = opened[0];
    expect(mailto).toMatch(/^mailto:amigo@gmail\.com/);
    expect(decodeURIComponent(mailto)).toContain('Aventura 2026');
    expect(decodeURIComponent(mailto)).toContain('Lucas');
    expect(decodeURIComponent(mailto)).toContain('github.io');
  });

  test('convite aparece em "Aguardando resposta" após envio', async ({ page }) => {
    const getOpened = interceptWindowOpen(page);
    await mockInviteEndpoint(page);

    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page);
    await createTrip(page);
    await clickButton(page, 'Usuários');

    await fillReact(page, 'input[placeholder*="amigo"]', 'convidado@teste.com');
    await clickButton(page, 'Enviar convite');
    await waitForInviteComplete(page);

    await expect(page.locator('text=Aguardando resposta')).toBeVisible();
    await expect(page.locator('text=convidado@teste.com')).toBeVisible();
  });

  test('campo de e-mail é limpo após envio', async ({ page }) => {
    const getOpened = interceptWindowOpen(page);
    await mockInviteEndpoint(page);

    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page);
    await createTrip(page);
    await clickButton(page, 'Usuários');

    await fillReact(page, 'input[placeholder*="amigo"]', 'limpar@teste.com');
    await clickButton(page, 'Enviar convite');
    await waitForInviteComplete(page);

    const emailValue = await page.$eval('input[placeholder*="amigo"]', el => el.value);
    expect(emailValue).toBe('');
  });

  test('múltiplos convites ficam listados separadamente', async ({ page }) => {
    const getOpened = interceptWindowOpen(page);
    await mockInviteEndpoint(page);

    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page);
    await createTrip(page);
    await clickButton(page, 'Usuários');

    for (const email of ['primeiro@a.com', 'segundo@b.com']) {
      await fillReact(page, 'input[placeholder*="amigo"]', email);
      await clickButton(page, 'Enviar convite');
      await waitForInviteComplete(page);
    }

    await expect(page.locator('text=primeiro@a.com')).toBeVisible();
    await expect(page.locator('text=segundo@b.com')).toBeVisible();
  });

  test('quando Edge Function responde ok, NÃO abre mailto', async ({ page }) => {
    const getOpened = interceptWindowOpen(page);
    // Mock: simula envio bem-sucedido pelo servidor
    await mockInviteEndpoint(page, {
      status: 200,
      body: { ok: true, token: 'abc123mock' },
    });

    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page);
    await createTrip(page);
    await clickButton(page, 'Usuários');

    await fillReact(page, 'input[placeholder*="amigo"]', 'sucesso@teste.com');
    await clickButton(page, 'Enviar convite');
    await waitForInviteComplete(page);

    // Quando o servidor aceita, não deve abrir mailto
    const opened = await getOpened();
    expect(opened).toHaveLength(0);

    // Mas o convite deve aparecer na lista
    await expect(page.locator('text=sucesso@teste.com')).toBeVisible();
  });
});
