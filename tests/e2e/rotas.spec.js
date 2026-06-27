/**
 * Trippin — Testes E2E das Visões por usuário (rotas e encontros)
 *
 * Cobre:
 *   1. Helpers puros (window._trippinLoc), determinísticos:
 *      - locationAnchors com filtro por membro (campo `who`)
 *      - sharedDaysBetween: dias na mesma cidade + trechos contíguos
 *      - meetingsFor: ordenado por quem passa mais dias junto
 *      - retrocompatibilidade: sem `who`, a rota do membro = rota da viagem
 *   2. Fluxo de UI: abrir viagem semeada → aba Mapa → trocar para a visão "Grupo"
 *      → linha do tempo + encontros renderizam; alternar "quem vai a cada destino"
 */
const { test, expect } = require('@playwright/test');
const { isKnownError } = require('./helpers');

// rota com integrantes vindos de caminhos diferentes que se encontram em Barcelona
const TRIP = {
  id: 'r1', name: 'Rotas', startDate: '2026-07-10', endDate: '2026-07-16', status: 'active',
  members: [{ id: 'me', name: 'Você', firstName: 'Você' }, { id: 'marina', name: 'Marina', firstName: 'Marina' }, { id: 'joao', name: 'João', firstName: 'João' }],
  destinations: [
    { name: 'Lisboa', date: '2026-07-10', who: ['me'] },
    { name: 'Barcelona', date: '2026-07-13', who: ['me'] },
    { name: 'Lisboa', date: '2026-07-10', who: ['marina'] },
    { name: 'Barcelona', date: '2026-07-12', who: ['marina'] },
    { name: 'Madri', date: '2026-07-10', who: ['joao'] },
    { name: 'Barcelona', date: '2026-07-13', who: ['joao'] },
  ],
  activities: [], docs: [], gallery: [], albums: [], expenses: [],
};

// ─── 1. HELPERS PUROS ────────────────────────────────────────────────────────

test.describe('1 · Rotas — funções puras', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('cityByDay respeita o campo who (rotas diferentes por membro)', async ({ page }) => {
    const r = await page.evaluate((trip) => ({
      me: window._trippinLoc.cityByDay(trip, 'me'),
      joao: window._trippinLoc.cityByDay(trip, 'joao'),
    }), TRIP);
    expect(r.me['2026-07-10']).toBe('Lisboa');
    expect(r.joao['2026-07-10']).toBe('Madri');
    expect(r.me['2026-07-14']).toBe('Barcelona');   // permanece em Barcelona após chegar
    expect(r.joao['2026-07-14']).toBe('Barcelona');  // se encontram em Barcelona
  });

  test('sharedDaysBetween conta os dias na mesma cidade e agrupa em trecho', async ({ page }) => {
    const r = await page.evaluate((trip) => window._trippinLoc.sharedDaysBetween(trip, 'me', 'joao'), TRIP);
    expect(r.count).toBe(4); // 13,14,15,16 em Barcelona
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ from: '2026-07-13', to: '2026-07-16' });
    expect(r.segments[0].city.toLowerCase()).toContain('barcelona');
  });

  test('meetingsFor ordena por quem passa mais dias junto', async ({ page }) => {
    const r = await page.evaluate((trip) => window._trippinLoc.meetingsFor(trip, 'me'), TRIP);
    expect(r.map(x => x.id)).toEqual(['marina', 'joao']); // marina (6 dias) antes de joao (4 dias)
    expect(r[0].count).toBeGreaterThan(r[1].count);
  });

  test('retrocompat: sem `who`, a rota do membro = rota da viagem inteira', async ({ page }) => {
    const same = await page.evaluate(() => {
      const trip = {
        startDate: '2026-07-10', endDate: '2026-07-12',
        members: [{ id: 'me' }, { id: 'b' }],
        destinations: [{ name: 'Lisboa', date: '2026-07-10' }, { name: 'Porto', date: '2026-07-11' }],
        docs: [],
      };
      const all = window._trippinLoc.locationAnchors(trip);
      const me = window._trippinLoc.locationAnchors(trip, 'me');
      return JSON.stringify(all) === JSON.stringify(me);
    });
    expect(same).toBe(true);
  });
});

// ─── 2. FLUXO DE UI ───────────────────────────────────────────────────────────

test.describe('2 · Rotas — visões na aba Mapa', () => {
  test('troca para a visão Grupo e mostra a linha do tempo + encontros', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // semeia uma viagem e abre direto nela (deep-link via sessionStorage)
    await page.addInitScript((trip) => {
      localStorage.setItem('trippin_v1', JSON.stringify({ lang: 'pt-BR', user: { firstName: 'Você' }, trips: [trip] }));
      sessionStorage.setItem('trippin_open_trip', trip.id);
    }, TRIP);

    await page.goto('/');
    // abre a aba Mapa
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /Mapa/.test(x.textContent));
      b && b.click();
    });
    await page.waitForFunction(() => document.querySelector('.viewsel select') != null);

    // visão padrão = minha jornada; troca para Grupo
    await page.selectOption('.viewsel select', 'group');

    // linha do tempo (Gantt) e bloco de encontros aparecem
    await expect(page.locator('.tl').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=dias juntos').first()).toBeVisible();
    // células de "encontro" destacadas existem (Barcelona, mesma cidade no mesmo dia)
    expect(await page.locator('.tl-cell.meet').count()).toBeGreaterThan(0);

    const critical = errors.filter(e => !isKnownError(e) && !e.includes('ResizeObserver'));
    expect(critical).toHaveLength(0);
  });
});
