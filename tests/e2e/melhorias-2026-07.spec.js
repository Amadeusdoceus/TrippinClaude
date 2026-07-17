/**
 * Trippin — testes das MELHORIAS de 2026-07.
 *
 * Regra do projeto: toda funcionalidade nova entra com seu teste.
 * Cobre as 8 melhorias:
 *   #1 cronograma segue a data vigente (+ pin verde de "hoje" em mês/semana)
 *   #2 visualizador de documento (abrir, baixar, fechar)
 *   #3 pressionar-e-segurar: peek de doc, reordenar álbuns, reordenar lugares
 *   #4 datas do mapa (lugares) sincronizam com a edição da passagem
 *   #6 fotos persistem entre sessões (IndexedDB via strip/hydrate)
 *   #7 novos anexos sem data assumem a data de hoje
 *   #8 origem/destino sem texto pré-preenchido (placeholder, nada a apagar)
 *
 * Run:  npx playwright test melhorias-2026-07
 */
const { test, expect } = require('@playwright/test');
const { selectLanguage, registerUser, createTrip, clickButton, isKnownError } = require('./helpers');

const ISO = d => d.toISOString().slice(0, 10);
const TODAY = ISO(new Date());
const addDays = (base, n) => { const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + n); return ISO(d); };

function seedTrip(page, trip, extra = {}) {
  return page.addInitScript(({ trip, extra }) => {
    localStorage.setItem('trippin_v1', JSON.stringify(Object.assign({
      lang: 'pt-BR', user: { firstName: 'T', name: 'T Tester' }, trips: [trip],
      settings: { notifications: true, theme: 'light', shareLocation: false }, notifs: [],
    }, extra)));
  }, { trip, extra });
}
const baseMembers = [{ id: 'me', name: 'Você', isAdmin: true, joinVia: 'creator', joinedAt: '2026-05-01' }];

// ── #1 CRONOGRAMA SEGUE A DATA VIGENTE ───────────────────────────────────────
test.describe('Cronograma segue a data vigente', () => {
  test('abre no dia de HOJE quando hoje está dentro da viagem', async ({ page }) => {
    const trip = { id: 't1', name: 'HojeTrip', startDate: addDays(TODAY, -3), endDate: addDays(TODAY, 10),
      status: 'active', destinations: [], members: baseMembers, activities: [], docs: [], albums: [], gallery: [], expenses: [] };
    await seedTrip(page, trip);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('HojeTrip'));
    await page.locator('text=HojeTrip').first().click();
    await page.waitForTimeout(300);

    // o título do dia (visão "Dia") deve corresponder a HOJE, não ao início da viagem
    const dayNum = new Date(TODAY + 'T00:00:00').getDate();
    const body = await page.evaluate(() => document.body.innerText);
    expect(body, 'cronograma abre no dia atual').toMatch(new RegExp('📅[^\\n]*\\b' + dayNum + '\\b'));
    // e mostra a bolinha verde de hoje ao lado do título do dia
    const hasTodayDot = await page.evaluate(() => !!document.querySelector('.tdot'));
    expect(hasTodayDot, 'bolinha verde de hoje na visão de dia').toBe(true);
  });

  test('pin verde de HOJE aparece na visão de mês e de semana', async ({ page }) => {
    const trip = { id: 't1b', name: 'PinTrip', startDate: addDays(TODAY, -2), endDate: addDays(TODAY, 6),
      status: 'active', destinations: [], members: baseMembers, activities: [], docs: [], albums: [], gallery: [], expenses: [] };
    await seedTrip(page, trip);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('PinTrip'));
    await page.locator('text=PinTrip').first().click();
    await page.waitForTimeout(300);

    // MÊS: uma célula do dia atual tem a bolinha verde
    await page.evaluate(() => { const x = Array.from(document.querySelectorAll('.segbtns button')).find(e => /Mês/.test(e.textContent)); x && x.click(); });
    await page.waitForTimeout(200);
    const monthDot = await page.evaluate(() => {
      const d = document.querySelector('.dcell .tdot');
      return d ? d.closest('.dcell').querySelector('.dn').textContent : null;
    });
    expect(monthDot, 'dia de hoje marcado no mês').toBe(String(new Date(TODAY + 'T00:00:00').getDate()));

    // SEMANA: o cartão do dia de hoje tem a bolinha verde
    await page.evaluate(() => { const x = Array.from(document.querySelectorAll('.segbtns button')).find(e => /Semana/.test(e.textContent)); x && x.click(); });
    await page.waitForTimeout(200);
    const weekDot = await page.evaluate(() => document.querySelectorAll('.wkday .tdot').length);
    expect(weekDot, 'exatamente um dia de hoje marcado na semana').toBe(1);
  });
});

// ── #2 VISUALIZADOR DE DOCUMENTO (abrir, baixar, fechar) ─────────────────────
test.describe('Visualizador de documento', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  test('clicar no doc abre o viewer com botão de download (esq.) e fechar (dir.)', async ({ page }) => {
    const trip = { id: 't2', name: 'DocViewTrip', startDate: '2026-07-01', endDate: '2026-07-20', status: 'active',
      destinations: [], members: baseMembers, activities: [],
      docs: [{ id: 'dv', cat: 'tickets', sub: 'Avião', name: 'Passagem X', file: 'x.png', mime: 'image/png', size: 95, dataUrl: PNG, offline: true }],
      albums: [], gallery: [], expenses: [] };
    await seedTrip(page, trip);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('DocViewTrip'));
    await page.locator('text=DocViewTrip').first().click();
    await page.waitForTimeout(300);
    await clickButton(page, 'Docs');
    await page.waitForTimeout(300);

    // clique no card (no nome, fora dos botões) abre o viewer
    await page.locator('.docitem .dt b').first().click();
    await page.waitForTimeout(200);
    await expect(page.locator('.docviewer')).toBeVisible();

    // dois botões: ⬇ (download) e ✕ (fechar), download à esquerda do fechar
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('.docviewer .dvb')).map(b => b.textContent));
    expect(btns, 'ordem: download depois fechar').toEqual(['⬇', '✕']);
    // a imagem do doc é exibida
    await expect(page.locator('.docviewer img')).toBeVisible();

    // fechar remove o viewer
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.docviewer .dvb')).find(e => e.textContent === '✕'); b && b.click(); });
    await page.waitForTimeout(200);
    await expect(page.locator('.docviewer')).toHaveCount(0);
  });
});

// ── #3 PRESSIONAR E SEGURAR ──────────────────────────────────────────────────
test.describe('Pressionar e segurar', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  test('segurar um doc gera pré-visualização; soltar fecha', async ({ page }) => {
    const trip = { id: 't3a', name: 'PeekTrip', startDate: '2026-07-01', endDate: '2026-07-20', status: 'active',
      destinations: [], members: baseMembers, activities: [],
      docs: [{ id: 'pk', cat: 'tickets', sub: 'Avião', name: 'Peek Doc', file: 'p.png', mime: 'image/png', size: 95, dataUrl: PNG, offline: true }],
      albums: [], gallery: [], expenses: [] };
    await seedTrip(page, trip);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('PeekTrip'));
    await page.locator('text=PeekTrip').first().click();
    await page.waitForTimeout(300);
    await clickButton(page, 'Docs');
    await page.waitForTimeout(300);

    // pressiona e segura (>420ms) → aparece o peek
    await page.evaluate(() => {
      const item = document.querySelector('.docitem');
      const r = item.getBoundingClientRect();
      item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: r.left + 20, clientY: r.top + 20 }));
    });
    await page.waitForTimeout(550);
    await expect(page.locator('.docpeek'), 'peek aparece ao segurar').toBeVisible();

    // solta → peek some
    await page.evaluate(() => { const p = document.querySelector('.docpeek'); p.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); });
    await page.waitForTimeout(200);
    await expect(page.locator('.docpeek'), 'peek fecha ao soltar').toHaveCount(0);
  });

  test('segurar e arrastar reordena álbuns (fotos acompanham)', async ({ page }) => {
    const trip = { id: 't3b', name: 'AlbTrip', startDate: '2026-07-01', endDate: '2026-07-20', status: 'active',
      destinations: [], members: baseMembers, activities: [], docs: [],
      albums: [{ id: 'A', name: 'Alfa' }, { id: 'B', name: 'Bravo' }, { id: 'C', name: 'Charlie' }],
      gallery: [{ id: 'g1', album: 'A', src: PNG }], expenses: [] };
    await seedTrip(page, trip);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('AlbTrip'));
    await page.locator('text=AlbTrip').first().click();
    await page.waitForTimeout(300);
    await clickButton(page, 'Galeria');
    await page.waitForTimeout(300);

    // segura o 1º álbum (Alfa) e arrasta até a posição do último (Charlie)
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.albumcard'));
      const stack = cards[0].querySelector('.albumstack');
      const r = stack.getBoundingClientRect();
      window.__x = r.left + 10;
      stack.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: window.__x, clientY: r.top + 10 }));
    });
    await page.waitForTimeout(500); // espera o hold (380ms)
    const dragging = await page.evaluate(() => document.querySelector('.albumcard.dragging') ? document.querySelector('.albumcard.dragging').querySelector('.albuminfo b').textContent : null);
    expect(dragging, 'Alfa entra em modo arraste').toBe('Alfa');

    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.albumcard'));
      const container = cards[0].parentElement;
      const last = cards[2].getBoundingClientRect();
      const y = (last.top + last.bottom) / 2;
      container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 2, clientX: window.__x, clientY: y }));
      container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: window.__x, clientY: y }));
    });
    await page.waitForTimeout(200);

    const order = await page.evaluate(() => JSON.parse(localStorage.getItem('trippin_v1')).trips[0].albums.map(a => a.name));
    expect(order[order.length - 1], 'Alfa foi para o fim').toBe('Alfa');
    // a foto continua no álbum Alfa (acompanha)
    const photoAlbum = await page.evaluate(() => JSON.parse(localStorage.getItem('trippin_v1')).trips[0].gallery[0].album);
    expect(photoAlbum, 'a foto continua no seu álbum').toBe('A');
  });

  test('segurar e arrastar reordena os lugares do mapa', async ({ page }) => {
    const trip = { id: 't3c', name: 'MapOrdTrip', startDate: '2026-07-08', endDate: '2026-07-20', status: 'active',
      destinations: [], members: baseMembers, activities: [],
      docs: [{ id: 'mo', cat: 'tickets', sub: 'Avião', name: 'voo', file: 'v.pdf', itin: { legs: [
        { flight: '1', from: { city: 'São Paulo', iata: 'GRU', airport: '' }, to: { city: 'Barcelona', iata: 'BCN', airport: '' }, depDate: '2026-07-08', depTime: '22:00', arrDate: '2026-07-09', arrTime: '14:00' },
        { flight: '2', from: { city: 'Barcelona', iata: 'BCN', airport: '' }, to: { city: 'Lisboa', iata: 'LIS', airport: '' }, depDate: '2026-07-09', depTime: '18:00', arrDate: '2026-07-10', arrTime: '20:00' },
      ], stages: [] } }],
      albums: [], gallery: [], expenses: [] };
    await seedTrip(page, trip);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('MapOrdTrip'));
    await page.locator('text=MapOrdTrip').first().click();
    await page.waitForTimeout(300);
    await clickButton(page, 'Mapa');
    await page.waitForTimeout(300);

    // ordem inicial por data: São Paulo, Barcelona, Lisboa
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('.dest')).filter(d => /🟠|🔵|⚪/.test((d.querySelector('.pin') || {}).textContent || '')).map(d => d.querySelector('b').textContent));
    expect(before).toEqual(['São Paulo', 'Barcelona', 'Lisboa']);

    // segura o 1º lugar (São Paulo) e arrasta até a última posição
    await page.evaluate(() => {
      const places = Array.from(document.querySelectorAll('.dest')).filter(d => /🟠|🔵|⚪/.test((d.querySelector('.pin') || {}).textContent || ''));
      const dd = places[0].querySelector('.dd');
      const r = dd.getBoundingClientRect();
      window.__x = r.left + 10;
      dd.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: window.__x, clientY: r.top + 8 }));
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const places = Array.from(document.querySelectorAll('.dest')).filter(d => /🟠|🔵|⚪/.test((d.querySelector('.pin') || {}).textContent || ''));
      const container = places[0].parentElement;
      const last = places[2].getBoundingClientRect();
      const y = (last.top + last.bottom) / 2;
      container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 3, clientX: window.__x, clientY: y }));
      container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3, clientX: window.__x, clientY: y }));
    });
    await page.waitForTimeout(200);

    const order = await page.evaluate(() => JSON.parse(localStorage.getItem('trippin_v1')).trips[0].cityOverrides.order);
    expect(order[order.length - 1], 'São Paulo foi para o fim da sequência').toBe('São Paulo');
  });
});

// ── #4 DATAS DO MAPA SINCRONIZAM COM A PASSAGEM ──────────────────────────────
test.describe('Mapa (lugares) sincroniza com a passagem', () => {
  test('stagesToLegs reconstrói as legs a partir das etapas editadas', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window._trippinItin);
    const legs = await page.evaluate(() => {
      const { stagesToLegs } = window._trippinItin;
      const editStages = [
        { city: 'São Paulo', iata: 'GRU', date: '2026-07-08', dep: '22:00', arr: '' },
        { city: 'Barcelona', iata: 'BCN', date: '2026-07-09', dep: '18:00', arr: '14:00' },
        { city: 'Lisboa', iata: 'LIS', date: '2026-07-10', dep: '', arr: '20:00' },
      ];
      return stagesToLegs(editStages, []);
    });
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ depDate: '2026-07-08', arrDate: '2026-07-09' });
    expect(legs[0].to.city).toBe('Barcelona');
    expect(legs[1]).toMatchObject({ depDate: '2026-07-09', arrDate: '2026-07-10' });
  });

  test('editar a data de uma escala atualiza o mapa (lugares) ao vivo', async ({ page }) => {
    const trip = { id: 't4', name: 'SyncTrip', startDate: '2026-06-28', endDate: '2026-07-20', status: 'active',
      destinations: [], members: baseMembers, activities: [],
      // leitura ERRADA: Barcelona chega 30/06
      docs: [{ id: 'sy', cat: 'tickets', sub: 'Avião', name: 'voo', file: 'v.pdf', itin: {
        legs: [
          { flight: '1', from: { city: 'São Paulo', iata: 'GRU', airport: 'GRU' }, to: { city: 'Barcelona', iata: 'BCN', airport: 'BCN' }, depDate: '2026-06-29', depTime: '22:00', arrDate: '2026-06-30', arrTime: '14:00' },
          { flight: '2', from: { city: 'Barcelona', iata: 'BCN', airport: 'BCN' }, to: { city: 'Lisboa', iata: 'LIS', airport: 'LIS' }, depDate: '2026-06-30', depTime: '18:00', arrDate: '2026-06-30', arrTime: '20:00' },
        ],
        stages: [
          { kind: 'origin', city: 'São Paulo', iata: 'GRU', airport: 'GRU', depDate: '2026-06-29', depTime: '22:00', flight: '1' },
          { kind: 'layover', city: 'Barcelona', iata: 'BCN', airport: 'BCN', arrDate: '2026-06-30', arrTime: '14:00', depDate: '2026-06-30', depTime: '18:00' },
          { kind: 'destination', city: 'Lisboa', iata: 'LIS', airport: 'LIS', arrDate: '2026-06-30', arrTime: '20:00', flight: '2' },
        ] } }],
      albums: [], gallery: [], expenses: [] };
    await seedTrip(page, trip);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('SyncTrip'));
    await page.locator('text=SyncTrip').first().click();
    await page.waitForTimeout(300);

    // mapa ANTES: Barcelona em 30 jun
    await clickButton(page, 'Mapa');
    await page.waitForTimeout(300);
    const bcnBefore = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.dest')).find(d => (d.querySelector('b') || {}).textContent === 'Barcelona');
      return el ? el.querySelector('.dd span').textContent : null;
    });
    expect(bcnBefore, 'antes: Barcelona lida como 30 jun').toMatch(/30 jun/);

    // edita as etapas: Barcelona passa a chegar 09/07
    await clickButton(page, 'Docs');
    await page.waitForTimeout(300);
    await clickButton(page, 'Ver roteiro');
    await page.waitForTimeout(200);
    await clickButton(page, 'Editar dados');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const setV = (el, val) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      const boxes = Array.from(document.querySelectorAll('div')).filter(d => d.style.background === 'rgb(245, 247, 255)');
      // inputs por etapa: [city, iata, date, dep, arr, flight]
      const ins0 = boxes[0].querySelectorAll('input'); setV(ins0[2], '2026-07-08'); setV(ins0[3], '22:00');
      const ins1 = boxes[1].querySelectorAll('input'); setV(ins1[2], '2026-07-09'); setV(ins1[3], '18:00'); setV(ins1[4], '14:00');
      const ins2 = boxes[2].querySelectorAll('input'); setV(ins2[2], '2026-07-10'); setV(ins2[4], '20:00');
    });
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(e => /Adicionar etapas/.test(e.textContent)); b && b.click(); });
    await page.waitForTimeout(200);
    // confirma o modal
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal button')).find(e => /Adicionar etapas/.test(e.textContent)); b && b.click(); });
    await page.waitForTimeout(300);

    // mapa DEPOIS: Barcelona em 9 jul
    await clickButton(page, 'Mapa');
    await page.waitForTimeout(300);
    const bcnAfter = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.dest')).find(d => (d.querySelector('b') || {}).textContent === 'Barcelona');
      return el ? el.querySelector('.dd span').textContent : null;
    });
    expect(bcnAfter, 'depois: Barcelona atualizada para 9 jul').toMatch(/9 jul/);
  });
});

// ── #6 FOTOS PERSISTEM ENTRE SESSÕES (IndexedDB) ─────────────────────────────
test.describe('Fotos persistem entre sessões', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  test('stripMedia tira a imagem do estado; hydrateMedia a recompõe', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window._trippinMedia);
    const r = await page.evaluate(async (png) => {
      const { stripMedia, hydrateMedia } = window._trippinMedia;
      const state = { trips: [{ id: 'x', gallery: [{ id: 'g1', album: 'A', src: png }], docs: [{ id: 'd1', dataUrl: png }] }] };
      const light = stripMedia(state);
      // no estado leve, a imagem sai (src null) e vira referência (blob)
      const g = light.trips[0].gallery[0], d = light.trips[0].docs[0];
      await new Promise(res => setTimeout(res, 150)); // espera o put no IndexedDB
      const back = await hydrateMedia(JSON.parse(JSON.stringify(light)));
      return { lightSrc: g.src, lightBlob: g.blob, lightDocUrl: d.dataUrl, lightDocBlob: d.blob,
        hydratedSrc: back.trips[0].gallery[0].src, hydratedDoc: back.trips[0].docs[0].dataUrl };
    }, PNG);
    expect(r.lightSrc, 'estado leve não guarda base64 da foto').toBeNull();
    expect(r.lightBlob, 'estado leve guarda referência ao blob').toBe('g:g1');
    expect(r.lightDocUrl, 'estado leve não guarda base64 do doc').toBeNull();
    expect(r.hydratedSrc, 'foto recomposta do IndexedDB').toBe(PNG);
    expect(r.hydratedDoc, 'anexo recomposto do IndexedDB').toBe(PNG);
  });

  test('foto adicionada sobrevive a um reload (fim-a-fim)', async ({ page }) => {
    const trip = { id: 't6', name: 'FotoTrip', startDate: '2026-07-01', endDate: '2026-07-20', status: 'active',
      destinations: [], members: baseMembers, activities: [], docs: [],
      albums: [{ id: 'A', name: 'Álbum' }], gallery: [{ id: 'g1', album: 'A', src: PNG }], expenses: [] };
    // primeira sessão: estado com a foto como data: url (formato antigo)
    await seedTrip(page, trip);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('FotoTrip'));
    await page.waitForTimeout(400); // deixa o save no mount mover a foto p/ IndexedDB

    // o localStorage passou a guardar só a referência (não o base64)
    const lightSrc = await page.evaluate(() => JSON.parse(localStorage.getItem('trippin_v1')).trips[0].gallery[0].src);
    expect(lightSrc, 'localStorage não guarda mais o base64 da foto').toBeNull();

    // reload (nova sessão): a foto deve voltar hidratada
    await page.reload();
    await page.waitForFunction(() => document.body.innerText.includes('FotoTrip'));
    await page.waitForTimeout(500);
    const restored = await page.evaluate(async () => {
      const all = await window._trippinMedia.imgGetAll();
      return all['g:g1'] || null;
    });
    expect(restored, 'a foto continua disponível no IndexedDB após reload').toBe(PNG);
  });
});

// ── #7 NOVOS ANEXOS SEM DATA ASSUMEM HOJE ────────────────────────────────────
test.describe('Novos anexos sem data assumem hoje', () => {
  test('todayISO() devolve a data de hoje em YYYY-MM-DD', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window._trippinItin);
    const iso = await page.evaluate(() => window._trippinItin.todayISO());
    expect(iso).toBe(TODAY);
  });
});

// ── #8 ORIGEM/DESTINO SEM TEXTO PRÉ-PREENCHIDO ───────────────────────────────
test.describe('Origem/destino sem texto pré-preenchido', () => {
  test('campos de origem e destino começam vazios (só placeholder)', async ({ page }) => {
    const trip = { id: 't8', name: 'ManualTrip', startDate: '2026-07-01', endDate: '2026-07-20', status: 'active',
      destinations: [{ name: 'Lisboa, Portugal', date: '2026-07-02' }], members: baseMembers, activities: [],
      // passagem SEM seg e SEM itin → cai no formulário de leitura manual
      docs: [{ id: 'mn', cat: 'tickets', sub: 'Avião', name: 'manual', file: 'm.pdf' }],
      albums: [], gallery: [], expenses: [] };
    await seedTrip(page, trip);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('ManualTrip'));
    await page.locator('text=ManualTrip').first().click();
    await page.waitForTimeout(300);
    await clickButton(page, 'Docs');
    await page.waitForTimeout(300);
    await clickButton(page, 'Ler passagem');
    await page.waitForTimeout(300);

    const vals = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('.card input')).filter(i => i.type !== 'date' && i.type !== 'time' && i.type !== 'file');
      return inputs.map(i => ({ value: i.value, placeholder: i.placeholder }));
    });
    // origem e destino: valor vazio, com placeholder de dica
    expect(vals.length, 'há campos de origem e destino').toBeGreaterThanOrEqual(2);
    for (const v of vals) {
      expect(v.value, 'campo começa vazio (nada a apagar)').toBe('');
      expect((v.placeholder || '').length, 'campo tem placeholder de dica').toBeGreaterThan(0);
    }
  });
});
