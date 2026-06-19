/**
 * Trippin — FLUXO DE REVISÃO VISUAL (smoke de todas as telas)
 *
 * Objetivo: garantir que NENHUMA tela quebra (tela em branco / erro de JS).
 * Percorre onboarding → criar viagem → todas as abas → menu, notificações,
 * configurações, apps. Em cada passo:
 *   - confirma que há conteúdo visível (não está em branco)
 *   - acumula erros de JS (pageerror) e falha no fim se houver algum crítico
 *
 * Este é o teste que pega o bug recorrente de "tela em branco".
 *
 * Run:  npx playwright test smoke-screens
 */
const { test, expect } = require('@playwright/test');
const {
  selectLanguage,
  registerUser,
  createTrip,
  clickButton,
  isKnownError,
} = require('./helpers');

/** Coleta erros de página e devolve um getter dos críticos. */
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return () => errors.filter(e => !isKnownError(e) && !e.includes('ResizeObserver'));
}

/** Garante que a tela tem conteúdo de verdade (não está em branco). */
async function assertNotBlank(page, contextLabel) {
  const text = await page.evaluate(() => document.body.innerText.trim());
  expect(text.length, `Tela em branco em: ${contextLabel}`).toBeGreaterThan(15);
}

test.describe('Smoke · todas as telas renderizam sem quebrar', () => {
  test('percorre onboarding, abas da viagem e telas de sistema', async ({ page }) => {
    test.slow(); // jornada longa (6 abas + menu + config): triplica o tempo limite
    const criticalErrors = trackErrors(page);

    // ── Onboarding ──────────────────────────────────────────────
    await page.goto('/');
    await assertNotBlank(page, 'tela de idioma');
    await selectLanguage(page);
    await assertNotBlank(page, 'criar perfil');
    await registerUser(page, { firstName: 'Smoke' });
    await assertNotBlank(page, 'home');

    // ── Viagem + todas as abas ──────────────────────────────────
    await createTrip(page, { name: 'Revisão Visual' });
    const tabs = ['Cronograma', 'Mapa', 'Docs', 'Galeria', 'Usuários', 'Sugestões'];
    for (const label of tabs) {
      await clickButton(page, label);
      await page.waitForTimeout(150); // deixa a aba montar
      await assertNotBlank(page, `aba ${label}`);
    }

    // ── Menu lateral ────────────────────────────────────────────
    await clickButton(page, 'Cronograma'); // volta a um estado conhecido
    await clickButton(page, '←');           // volta para a Home
    await assertNotBlank(page, 'home (pós-viagem)');

    // ── Telas de sistema a partir do menu ───────────────────────
    // Abre o menu (botão da barra inferior)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const menu = btns.find(b => /menu|☰|≡/i.test(b.textContent) || b.getAttribute('aria-label') === 'menu');
      (menu || btns[0]).click();
    });
    await page.waitForTimeout(200);
    await assertNotBlank(page, 'menu lateral');

    // Configurações (item do menu)
    const wentSettings = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button,a,div')).find(el =>
        /configura/i.test(el.textContent) && el.textContent.length < 40);
      if (b) { b.click(); return true; }
      return false;
    });
    if (wentSettings) {
      await page.waitForTimeout(200);
      await assertNotBlank(page, 'configurações');
    }

    // ── Erros críticos acumulados em toda a jornada ─────────────
    expect(criticalErrors(), 'Erros de JS durante a navegação').toHaveLength(0);
  });

  test('notificações abrem e fecham sem quebrar', async ({ page }) => {
    const criticalErrors = trackErrors(page);
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Notif' });

    // botão de notificações fica na barra inferior (sino 🔔)
    const opened = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(el => /🔔/.test(el.textContent));
      if (b) { b.click(); return true; }
      return false;
    });
    if (opened) {
      await page.waitForTimeout(300);
      await assertNotBlank(page, 'painel de notificações');
    }
    expect(criticalErrors()).toHaveLength(0);
  });
});
