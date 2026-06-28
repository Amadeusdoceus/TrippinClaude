/**
 * Trippin — Interpretador de passagens: novos formatos visuais (parser solto)
 *
 * Cobre os layouts de confirmação anexados pelo usuário, além dos já testados
 * (Azul e KLM detalhe em features.spec.js):
 *   1. TAP (timeline "IATA — Cidade", cabeçalho-resumo, voos "TP 88"/"TP 692")
 *   2. Vueling ("Cidade IATA", chegada na madrugada "+1 dia", "Flight No: VY2481")
 *   3. KLM (tela de confirmação resumida "Luxembourg › Dubrovnik")
 *
 * Tudo via a função pura window._trippinParse.parseAirTicketLoose (determinístico).
 */
const { test, expect } = require('@playwright/test');

test.describe('Interpretador de passagens · formatos visuais', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('TAP — timeline GRU → LIS → LUX (2 trechos, voos TP 88/TP 692)', async ({ page }) => {
    const tap = [
      'De São Paulo para Luxemburgo',
      'Duração total : 15h 10min',
      '20:45 GRU → 16:55 +1 LUX',
      'Operado por TAP Air Portugal',
      'TER 30 JUNHO — 20:45',
      'GRU — Guarulhos Gov Andre Franco Montouro',
      'Terminal 3',
      'TP 88',
      '09h 50min',
      'Airbus A330 NEO — Operado por TAP Air Portugal',
      'QUA 01 JULHO — 10:35',
      'LIS — Lisboa',
      'Terminal 1',
      'TRANSFER',
      'Tempo de ligação 02h 35min',
      'QUA 01 JULHO — 13:10',
      'LIS — Lisboa',
      'Terminal 1',
      'TP 692',
      '02h 45min',
      'Airbus A320-200 — Operado por TAP Air Portugal',
      'QUA 01 JULHO — 16:55',
      'LUX — Luxemburg',
    ].join('\n');
    const r = await page.evaluate((t) => window._trippinParse.parseAirTicketLoose(t), tap);
    expect(r.stages.map(s => s.kind)).toEqual(['origin', 'layover', 'destination']);
    expect(r.stages[0]).toMatchObject({ iata: 'GRU', city: 'São Paulo', depTime: '20:45', depDate: '2026-06-30', flight: 'TP88' });
    expect(r.stages[1]).toMatchObject({ iata: 'LIS', city: 'Lisboa', arrTime: '10:35', depTime: '13:10' });
    expect(r.stages[2]).toMatchObject({ iata: 'LUX', city: 'Luxemburgo', arrTime: '16:55', flight: 'TP692' });
  });

  test('Vueling — SPU → BCN com chegada no dia seguinte (+1)', async ({ page }) => {
    const vueling = [
      'PFZ55Y',
      'Hand luggage',
      'QUA. 08 JUL.',
      'Split SPU 23:35',
      'Barcelona BCN 01:50 +1 day  T1',
      'Flight No: VY2481',
    ].join('\n');
    const r = await page.evaluate((t) => window._trippinParse.parseAirTicketLoose(t), vueling);
    expect(r.stages.map(s => s.kind)).toEqual(['origin', 'destination']);
    expect(r.stages[0]).toMatchObject({ iata: 'SPU', city: 'Split', depTime: '23:35', depDate: '2026-07-08', flight: 'VY2481' });
    expect(r.stages[1]).toMatchObject({ iata: 'BCN', city: 'Barcelona', arrTime: '01:50', arrDate: '2026-07-09' });
  });

  test('KLM — confirmação resumida Luxembourg › Dubrovnik', async ({ page }) => {
    const klm = [
      'CONFIRMADA',
      'Número da reserva: 9130885586',
      'Luxembourg › Dubrovnik',
      'Datas da estadia: 3 jul., sex. - 3 jul., sex.',
      'Voos',
      'Código de reserva de voo: YATY9U',
      '18:25 · 3 jul. (sex.)',
      'LUX  Luxembourg Findel',
      '5h 00min  1 escala',
      '23:25 · 3 jul. (sex.)',
      'DBV  Dubrovnik Ruđer Bošković',
    ].join('\n');
    const r = await page.evaluate((t) => window._trippinParse.parseAirTicketLoose(t), klm);
    expect(r.stages.map(s => s.kind)).toEqual(['origin', 'destination']);
    expect(r.stages[0]).toMatchObject({ iata: 'LUX', city: 'Luxemburgo', depTime: '18:25' });
    expect(r.stages[1]).toMatchObject({ iata: 'DBV', city: 'Dubrovnik', arrTime: '23:25' });
  });
});

// ── Check-in: companhia + código de reserva (PNR) ─────────────────────────────
test.describe('Passagens · check-in e código de reserva', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('parseTicketMeta: Vueling → companhia + localizador solto PFZ55Y', async ({ page }) => {
    const txt = ['PFZ55Y', 'QUA. 08 JUL.', 'Split SPU 23:35', 'Barcelona BCN 01:50 +1 day', 'Flight No: VY2481'].join('\n');
    const r = await page.evaluate((t) => window._trippinParse.parseTicketMeta(t), txt);
    expect(r.airline).toBe('Vueling');
    expect(r.code).toBe('PFZ55Y');
    expect(r.checkin).toContain('vueling');
  });

  test('parseTicketMeta: TAP por "Operado por" + código por rótulo', async ({ page }) => {
    const txt = ['Operado por TAP Air Portugal', 'Localizador: ABC123', 'GRU — Guarulhos'].join('\n');
    const r = await page.evaluate((t) => window._trippinParse.parseTicketMeta(t), txt);
    expect(r.airline).toContain('TAP');
    expect(r.code).toBe('ABC123');
  });

  test('parseTicketMeta: não confunde número de voo com localizador', async ({ page }) => {
    const r = await page.evaluate((t) => window._trippinParse.parseTicketMeta(t), 'Voo VY2481\nEmbarque');
    expect(r.code).toBeNull();
  });

  test('card da passagem mostra Check-in, abertura e código copiável', async ({ page }) => {
    const ticketDoc = {
      id: 'tk', cat: 'tickets', sub: 'Avião', name: 'GRU-LUX', file: 'gru-lux.pdf', size: 104000, offline: true,
      itin: {
        legs: [{ flight: 'TP88', from: { iata: 'GRU', city: 'São Paulo' }, to: { iata: 'LUX', city: 'Luxemburgo' }, depDate: '2026-06-30', depTime: '20:45', arrDate: '2026-07-01', arrTime: '16:55' }],
        stages: [
          { kind: 'origin', iata: 'GRU', city: 'São Paulo', depDate: '2026-06-30', depTime: '20:45', flight: 'TP88' },
          { kind: 'destination', iata: 'LUX', city: 'Luxemburgo', arrDate: '2026-07-01', arrTime: '16:55', flight: 'TP88' },
        ],
      },
      booking: { code: 'AB12CD', airline: 'TAP Air Portugal', checkin: 'https://www.flytap.com/check-in', offset: 36 },
    };
    const trip = {
      id: 'tk1', name: 'Voo', startDate: '2026-06-29', endDate: '2026-07-02', status: 'active',
      members: [{ id: 'me', name: 'Você', firstName: 'Você' }], destinations: [{ name: 'São Paulo', date: '2026-06-30' }],
      activities: [], docs: [ticketDoc], gallery: [], albums: [], expenses: [],
    };
    await page.addInitScript((d) => {
      localStorage.setItem('trippin_v1', JSON.stringify({ lang: 'pt-BR', user: { firstName: 'Você' }, trips: [d] }));
      sessionStorage.setItem('trippin_open_trip', d.id);
    }, trip);

    await page.goto('/');
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Docs/.test(x.textContent)); b && b.click(); });

    await expect(page.locator('text=Check-in abre').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=AB12CD').first()).toBeVisible();
    // o botão de check-in aponta para a companhia
    const href = await page.getAttribute('a.joinbtn[href*="flytap"]', 'href');
    expect(href).toContain('flytap');
    // copiar o código → estado "Copiado!"
    await page.click('.copybtn');
    await expect(page.locator('text=Copiado').first()).toBeVisible();
  });
});
