/**
 * Trippin — Testes E2E da Aba de Custos (despesas com divisão e simplificação)
 *
 * Cobre:
 *   1. Helpers puros (window._trippinCost / _trippinParse), determinísticos:
 *      - shareOf: divisão igual e cotas custom (valor e proporção)
 *      - balances: ignora parcelas marcadas como pagas (settled)
 *      - simplifyDebts: mínimo de transações; settled reduz a dívida
 *      - parseExpense: lê valor/descrição/data de um comprovante
 *   2. Fluxo de UI: criar viagem → aba Custos → adicionar despesa → ver card →
 *      simplificar (sem erro de JS / tela branca)
 */
const { test, expect } = require('@playwright/test');
const { selectLanguage, registerUser, createTrip, clickButton, fillByIndex, isKnownError } = require('./helpers');

const MEMBERS = [{ id: 'me' }, { id: 'b' }, { id: 'c' }];

// ─── 1. HELPERS PUROS ────────────────────────────────────────────────────────

test.describe('1 · Custos — funções puras', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('shareOf divide igualmente entre os participantes', async ({ page }) => {
    const r = await page.evaluate((members) => {
      const e = { id: '1', amount: 90, participants: ['me', 'b', 'c'], equalSplit: true };
      return ['me', 'b', 'c'].map(id => window._trippinCost.shareOf(e, id, members));
    }, MEMBERS);
    expect(r).toEqual([30, 30, 30]);
  });

  test('shareOf com cotas custom (proporcional ao total)', async ({ page }) => {
    const r = await page.evaluate((members) => {
      const e = { id: '1', amount: 100, participants: ['me', 'b'], equalSplit: false, shares: { me: 3, b: 1 } };
      return { me: window._trippinCost.shareOf(e, 'me', members), b: window._trippinCost.shareOf(e, 'b', members) };
    }, MEMBERS);
    expect(r.me).toBeCloseTo(75, 5);
    expect(r.b).toBeCloseTo(25, 5);
  });

  test('simplifyDebts produz o mínimo de transações e fecha em zero', async ({ page }) => {
    const out = await page.evaluate((members) => {
      const expenses = [
        { id: '1', amount: 90, paidBy: 'me', participants: ['me', 'b', 'c'], equalSplit: true },
        { id: '2', amount: 60, paidBy: 'b', participants: ['me', 'b', 'c'], equalSplit: true },
      ];
      return window._trippinCost.simplifyDebts(expenses, members);
    }, MEMBERS);
    // Saldos: me +40, b +10, c -50  → c paga 40 a me e 10 a b (2 transações)
    expect(out.length).toBe(2);
    const total = out.reduce((s, x) => s + x.amount, 0);
    expect(total).toBeCloseTo(50, 2);
    out.forEach(tx => expect(tx.from).toBe('c'));
  });

  test('parcela marcada como paga (settled) sai da simplificação', async ({ page }) => {
    const { semSettle, comSettle } = await page.evaluate((members) => {
      const base = [
        { id: '1', amount: 90, paidBy: 'me', participants: ['me', 'b', 'c'], equalSplit: true },
        { id: '2', amount: 60, paidBy: 'b', participants: ['me', 'b', 'c'], equalSplit: true },
      ];
      const withSettle = JSON.parse(JSON.stringify(base));
      withSettle[0].settled = { c: true }; // C já acertou sua parte da despesa 1
      const debt = (exps) => -window._trippinCost.balances(exps, members).c; // quanto C deve no total
      return { semSettle: debt(base), comSettle: debt(withSettle) };
    }, MEMBERS);
    expect(semSettle).toBeCloseTo(50, 2);
    expect(comSettle).toBeCloseTo(20, 2); // tirou os 30 da despesa 1
    expect(comSettle).toBeLessThan(semSettle);
  });

  test('parseExpense lê valor, descrição e data de um comprovante', async ({ page }) => {
    const r = await page.evaluate(() =>
      window._trippinParse.parseExpense('Restaurante Sabor\nMesa 4\nTotal R$ 89,90\n05/08/2026'));
    expect(r.amount).toBeCloseTo(89.9, 2);
    expect(r.date).toBe('2026-08-05');
    expect((r.desc || '').toLowerCase()).toContain('restaurante');
  });
});

// ─── 2. FLUXO DE UI ───────────────────────────────────────────────────────────

test.describe('2 · Custos — fluxo na interface', () => {
  test('adiciona uma despesa e ela aparece na lista; simplificar não quebra', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Custo' });
    await createTrip(page, { name: 'Viagem Custos' });

    await clickButton(page, 'Custos');
    await page.waitForFunction(() => document.body.innerText.includes('Nova despesa'));

    await clickButton(page, 'Nova despesa');
    // editor: 0=descrição, 1=valor (number)
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('input')).filter(i => i.type !== 'file').length >= 2);
    await fillByIndex(page, 0, 'Jantar');
    await fillByIndex(page, 1, '120');
    await clickButton(page, 'Salvar');

    // o card da despesa aparece com descrição e valor formatado
    await expect(page.locator('text=Jantar').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=120,00').first()).toBeVisible();

    // simplificar despesas (solo: ninguém deve nada)
    await clickButton(page, 'Simplificar despesas');
    await page.waitForTimeout(150);
    await expect(page.locator('text=ninguém deve nada').first()).toBeVisible();

    const critical = errors.filter(e => !isKnownError(e) && !e.includes('ResizeObserver'));
    expect(critical).toHaveLength(0);
  });
});
