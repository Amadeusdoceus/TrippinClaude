/**
 * Trippin — testes das MELHORIAS INCREMENTAIS.
 *
 * Regra do projeto: toda funcionalidade nova entra aqui com seu teste.
 * Cobre as 9 melhorias de 2026-06-19:
 *   #1/#7 safe area   #2/#4/#6 modais e painel  #6 dismiss de notificação
 *   #8 toast (sem alert) em configurações       #9 mapa de pins (sem Google Maps)
 *
 * Run:  npx playwright test features
 */
const { test, expect } = require('@playwright/test');
const {
  selectLanguage,
  registerUser,
  createTrip,
  clickButton,
  isKnownError,
} = require('./helpers');

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return () => errors.filter(e => !isKnownError(e) && !e.includes('ResizeObserver'));
}

// ── #1/#7 SAFE AREA ───────────────────────────────────────────────────────────
test.describe('Safe area (corte de tela no APK)', () => {
  test('viewport tem viewport-fit=cover e CSS usa env(safe-area-inset)', async ({ page }) => {
    await page.goto('/');

    const viewport = await page.getAttribute('meta[name=viewport]', 'content');
    expect(viewport).toContain('viewport-fit=cover');

    // o CSS precisa reservar a área segura (notch/status bar)
    const usesSafeArea = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try { rules = sheet.cssRules; } catch (_) { continue; }
        for (const r of Array.from(rules || [])) {
          if (r.cssText && r.cssText.includes('safe-area-inset')) return true;
        }
      }
      return false;
    });
    expect(usesSafeArea, 'CSS deveria usar env(safe-area-inset-*)').toBe(true);
  });
});

// ── #1/#7 LARGURA TOTAL NO CELULAR (sem bordas brancas laterais) ──────────────
test.describe('Largura total no celular', () => {
  test('#root e a bottombar ocupam toda a largura da viewport', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Largura' });

    const vw = await page.evaluate(() => window.innerWidth);
    const rootW = await page.evaluate(() => document.getElementById('root').getBoundingClientRect().width);
    // no viewport mobile (Pixel 5 ≈ 393px) o root deve preencher tudo — sem faixas claras
    expect(Math.abs(rootW - vw), 'sobra de largura nas laterais do #root').toBeLessThanOrEqual(1);

    // a barra inferior também deve ir de ponta a ponta
    const barW = await page.evaluate(() => {
      const b = document.querySelector('.bottombar');
      return b ? b.getBoundingClientRect().width : 0;
    });
    expect(Math.abs(barW - vw), 'a bottombar não alcança as bordas').toBeLessThanOrEqual(1);
  });
});

// ── MODAIS E PAINEL: sem blur (mostra a tela atrás, sem borrão) ───────────────
test.describe('Estilo de modais e painel', () => {
  test('overlay/modal/sheet NÃO usam blur — só o pop-up aparece sobre a tela', async ({ page }) => {
    await page.goto('/');
    const hasBlur = await page.evaluate(() => {
      let blur = false;
      for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try { rules = sheet.cssRules; } catch (_) { continue; }
        for (const r of Array.from(rules || [])) {
          if (r.selectorText && /\.(overlay|modal|sheet)\b/.test(r.selectorText) &&
              /backdrop-filter\s*:\s*blur/.test(r.cssText)) blur = true;
        }
      }
      return blur;
    });
    expect(hasBlur, '.overlay/.modal/.sheet não devem ter backdrop-filter: blur').toBe(false);
  });
});

// ── #9 MAPA DE PINS (substitui Google Maps) ───────────────────────────────────
test.describe('Aba Mapa — visualização de pins', () => {
  test('Mapa renderiza sem carregar Google Maps e mostra estado vazio', async ({ page }) => {
    const criticalErrors = trackErrors(page);
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Mapa' });
    await createTrip(page, { name: 'Sem Destinos' });

    await clickButton(page, 'Mapa');
    await page.waitForTimeout(200);

    // não deve haver script do Google Maps carregado
    const googleScripts = await page.evaluate(() =>
      document.querySelectorAll('script[src*="maps.googleapis.com"]').length);
    expect(googleScripts, 'Google Maps não deve mais ser carregado').toBe(0);

    // o mapa de pins renderiza a seção de lugares (substituindo o Google Maps)
    await expect(page.locator('text=Lugares por onde você vai passar')).toBeVisible();
    expect(criticalErrors()).toHaveLength(0);
  });
});

// ── NOTIFICAÇÕES: aba lateral à direita (~metade) + boas-vindas ──────────────
test.describe('Notificações — aba lateral à direita', () => {
  test('abre como drawer no canto direito (~metade da tela) com boas-vindas', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Drawer' });

    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(el => /🔔/.test(el.textContent));
      b && b.click();
    });
    await page.waitForTimeout(300);

    const panel = page.locator('.notifpanel');
    await expect(panel).toBeVisible();
    expect(await panel.innerText(), 'notificação de boas-vindas').toMatch(/Bem-vindo/i);

    const geo = await page.evaluate(() => {
      const root = document.getElementById('root').getBoundingClientRect();
      const p = document.querySelector('.notifpanel').getBoundingClientRect();
      return { rootRight: root.right, rootW: root.width, vh: window.innerHeight, pRight: p.right, pW: p.width, pH: p.height };
    });
    expect(Math.abs(geo.pRight - geo.rootRight), 'colado à borda direita').toBeLessThanOrEqual(2);
    expect(geo.pW, 'largura ~metade da tela').toBeLessThanOrEqual(geo.rootW * 0.62);
    expect(geo.pH, 'altura quase cheia').toBeGreaterThanOrEqual(geo.vh * 0.9);
  });
});

// ── MAPA: pinos com cidade + ícone do modo de transporte entre trechos ───────
test.describe('Aba Mapa — pinos e ícone de transporte', () => {
  test('cidades viram pinos e o trecho mostra o ícone do transporte (avião)', async ({ page }) => {
    // semeia uma viagem com 2 destinos + passagem de avião Lisboa→Barcelona
    await page.addInitScript(() => {
      const trip = {
        id: 'tmap', name: 'MapaTrip', startDate: '2026-07-10', endDate: '2026-07-20', status: 'active',
        destinations: [{ name: 'Lisboa, Portugal', date: '2026-07-10' }, { name: 'Barcelona, Espanha', date: '2026-07-14' }],
        members: [{ id: 'me', name: 'Você', isAdmin: true, joinVia: 'creator', joinedAt: '2026-05-01' }],
        activities: [],
        docs: [{ id: 'd1', cat: 'tickets', sub: 'Avião', name: 'voo', file: 'voo.pdf',
                 seg: { fromCity: 'Lisboa', toCity: 'Barcelona', depDate: '2026-07-11', depTime: '10:00', arrDate: '2026-07-11', arrTime: '12:00' } }],
        gallery: [], expenses: [],
      };
      const state = { lang: 'pt-BR', user: { firstName: 'Map', name: 'Map Tester' }, trips: [trip],
        settings: { notifications: true, theme: 'light', shareLocation: false }, notifs: [] };
      localStorage.setItem('trippin_v1', JSON.stringify(state));
    });
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('MapaTrip'));
    await page.locator('text=MapaTrip').first().click();
    await page.waitForTimeout(300);
    await clickButton(page, 'Mapa');
    await page.waitForTimeout(300);

    await expect(page.locator('.mapcanvas')).toBeVisible();
    const txt = await page.locator('.mapcanvas').innerText();
    expect(txt, 'cidade de origem').toContain('Lisboa');
    expect(txt, 'cidade de destino').toContain('Barcelona');
    expect(txt, 'ícone de avião no trecho').toContain('✈️');
  });
});

// ── #6 DISMISS DE NOTIFICAÇÃO ─────────────────────────────────────────────────
test.describe('Notificações — botão de descartar (X)', () => {
  test('clicar no X remove a notificação da lista', async ({ page }) => {
    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Dismiss' });

    // abre o painel pelo sino da barra inferior
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(el => /🔔/.test(el.textContent));
      b && b.click();
    });
    await page.waitForTimeout(300);

    const before = await page.locator('.notifitem').count();
    expect(before, 'deveria haver notificações seed').toBeGreaterThan(0);

    // clica no primeiro botão de descartar
    await page.locator('.notifitem .dismiss').first().click();
    await page.waitForTimeout(200);

    const after = await page.locator('.notifitem').count();
    expect(after, 'a notificação deveria ter sido removida').toBe(before - 1);
  });
});

// ── #8 CONFIGURAÇÕES — toast em vez de alert ──────────────────────────────────
test.describe('Configurações — compartilhar localização', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: -23.55, longitude: -46.63 } });

  test('ativar localização usa GPS e NÃO dispara alert nativo', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', d => { dialogFired = true; d.dismiss().catch(() => {}); });

    await page.goto('/');
    await selectLanguage(page);
    await registerUser(page, { firstName: 'Geo' });

    // abre menu → Configurações
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(el => /☰/.test(el.textContent));
      b && b.click();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button,div')).find(el =>
        /Configura/i.test(el.textContent) && el.textContent.length < 40);
      b && b.click();
    });
    await page.waitForTimeout(200);

    // localiza a linha "compartilhar localização" e clica no switch
    const toggled = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.setrow'));
      const row = rows.find(r => /localiza/i.test(r.textContent));
      if (!row) return false;
      const sw = row.querySelector('.switch');
      if (!sw) return false;
      sw.click();
      return true;
    });
    expect(toggled, 'deveria encontrar o switch de localização').toBe(true);

    await page.waitForTimeout(500); // espera o getCurrentPosition resolver
    expect(dialogFired, 'não deveria abrir alert nativo (usar toast)').toBe(false);

    // com permissão concedida, o switch deve ficar ligado
    const isOn = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.setrow'));
      const row = rows.find(r => /localiza/i.test(r.textContent));
      return row ? row.querySelector('.switch').classList.contains('on') : false;
    });
    expect(isOn, 'switch de localização deveria ficar ligado após permitir GPS').toBe(true);
  });
});

// ── INTERPRETADOR DE IMAGEM — parser "solto" (prints de confirmação) ─────────
test.describe('Interpretador de imagem (parser solto)', () => {
  test('lê confirmação estilo Azul (POA → GRU, Voo 2863, datas dd/mm)', async ({ page }) => {
    await page.goto('/');
    const azul = [
      '14:00',
      'Reserva PR42KX realizada com sucesso',
      'Voo para São Paulo, Guarulhos Intl',
      'POA → GRU',
      'Voo 2863',
      'Porto Alegre, Salgado Filho Intl   São Paulo, Guarulhos Intl',
      '30/06/2026 - 14:30   30/06/2026 - 16:15',
    ].join('\n');
    const r = await page.evaluate((t) => window._trippinParse.parseAirTicketLoose(t), azul);
    expect(r.stages.map(s => s.kind)).toEqual(['origin', 'destination']);
    expect(r.stages[0]).toMatchObject({ iata: 'POA', city: 'Porto Alegre', depTime: '14:30', depDate: '2026-06-30' });
    expect(r.stages[1]).toMatchObject({ iata: 'GRU', city: 'São Paulo', arrTime: '16:15' });
    expect(r.stages[0].flight).toBe('2863');
  });

  test('lê confirmação estilo KLM/esky (IATA entre parênteses, escala em AMS)', async ({ page }) => {
    await page.goto('/');
    const klm = [
      '14:04', 'Informações sobre o voo',
      'Luxembourg → Dubrovnik',
      'Duração total da viagem: 5h 00min  1 escala',
      '18:25', '3 jul.', 'Findel (LUX)', 'Luxembourg, Luxemburgo', 'Número do voo: 1714',
      '19:35', '3 jul.', 'Schiphol (AMS)', 'Tempo de parada: 1h 25min',
      '21:00', '3 jul.', 'Schiphol (AMS)', 'Número do voo: 1981',
      '23:25', '3 jul.', 'Ruđer Bošković (DBV)',
    ].join('\n');
    const r = await page.evaluate((t) => window._trippinParse.parseAirTicketLoose(t), klm);
    expect(r.stages.map(s => s.kind)).toEqual(['origin', 'layover', 'destination']);
    expect(r.stages[0]).toMatchObject({ iata: 'LUX', city: 'Luxemburgo', depTime: '18:25', flight: '1714' });
    expect(r.stages[1]).toMatchObject({ iata: 'AMS', city: 'Amsterdã', arrTime: '19:35', depTime: '21:00', layover: '1h25' });
    expect(r.stages[2]).toMatchObject({ iata: 'DBV', city: 'Dubrovnik', arrTime: '23:25' });
    // não confunde o relógio da status bar (14:04) com horário de voo
    expect(r.stages[0].depTime).not.toBe('14:04');
  });
});

// ── ROTEIRO INTERPRETADO — botão X fecha e volta ─────────────────────────────
test.describe('Roteiro interpretado — botão fechar (X)', () => {
  test('X fecha o card de roteiro e volta para a lista de documentos', async ({ page }) => {
    await page.addInitScript(() => {
      const trip = {
        id: 'tdoc', name: 'DocTrip', startDate: '2026-06-30', endDate: '2026-07-05', status: 'active',
        destinations: [{ name: 'São Paulo, Brasil', date: '2026-06-30' }],
        members: [{ id: 'me', name: 'Você', isAdmin: true, joinVia: 'creator', joinedAt: '2026-05-01' }],
        activities: [],
        docs: [{ id: 'dk', cat: 'tickets', sub: 'Avião', name: 'voo', file: 'voo.pdf',
          itin: { legs: [], stages: [
            { kind: 'origin', city: 'São Paulo', airport: 'Guarulhos', iata: 'GRU', depTime: '20:45', depDate: '2026-06-30', flight: 'TP88' },
            { kind: 'destination', city: 'Lisboa', airport: 'Lisbon', iata: 'LIS', arrTime: '10:35', arrDate: '2026-07-01', flight: 'TP88' },
          ] } }],
        gallery: [], expenses: [],
      };
      const state = { lang: 'pt-BR', user: { firstName: 'Doc', name: 'Doc Tester' }, trips: [trip],
        settings: { notifications: true, theme: 'light', shareLocation: false }, notifs: [] };
      localStorage.setItem('trippin_v1', JSON.stringify(state));
    });
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('DocTrip'));
    await page.locator('text=DocTrip').first().click();
    await page.waitForTimeout(300);
    await clickButton(page, 'Docs');
    await page.waitForTimeout(300);

    // abre o roteiro interpretado
    await clickButton(page, 'Ver roteiro');
    await page.waitForTimeout(300);
    const card = page.locator('.card', { hasText: 'Roteiro interpretado' });
    await expect(card).toBeVisible();

    // X fecha e volta (o card some)
    await card.getByRole('button', { name: 'Fechar' }).click();
    await page.waitForTimeout(200);
    await expect(page.locator('text=Roteiro interpretado')).toHaveCount(0);
  });
});

// ── POP-UPS centralizam sem o bug do canto inferior direito ───────────────────
test.describe('Pop-ups — sem salto do canto direito', () => {
  test('overlay/modal centralizam sem transform; sheet preserva o centro na animação', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(() => {
      let overlayT = null, modalT = null, sheetAnim = null, popsheet = false;
      for (const sheet of Array.from(document.styleSheets)) {
        let rules; try { rules = sheet.cssRules; } catch (_) { continue; }
        for (const r of Array.from(rules || [])) {
          if (r.type === 7 && r.name === 'popsheet') popsheet = true;        // CSSKeyframesRule
          if (!r.selectorText) continue;
          if (r.selectorText === '.overlay') overlayT = r.style.transform;
          if (r.selectorText === '.modal') modalT = r.style.transform;
          if (r.selectorText === '.sheet') sheetAnim = r.style.animationName || r.style.animation;
        }
      }
      return { overlayT, modalT, sheetAnim, popsheet };
    });
    expect(res.overlayT || '', 'overlay não deve usar transform (centra via margin)').toBe('');
    expect(res.modalT || '', 'modal não deve usar transform (centra via margin)').toBe('');
    expect(res.popsheet, 'keyframe popsheet deve existir').toBe(true);
    expect(res.sheetAnim || '', 'sheet deve animar com popsheet').toContain('popsheet');
  });
});

// ── ADICIONAR ETAPAS COM DATA NULA — não pode dar tela branca ─────────────────
test.describe('Roteiro → cronograma com datas nulas (sem tela branca)', () => {
  test('adicionar etapas de um itin com datas nulas não derruba o app', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const itin = { legs: [
        { flight: '1714', from: { iata: 'LUX', city: 'Luxemburgo', airport: 'Findel' }, to: { iata: 'AMS', city: 'Amsterdã', airport: 'Schiphol' }, depTime: '18:25', arrTime: '19:35', depDate: null, arrDate: null, duration: null },
        { flight: '1981', from: { iata: 'AMS', city: 'Amsterdã', airport: 'Schiphol' }, to: { iata: 'DBV', city: 'Dubrovnik', airport: 'Boskovic' }, depTime: '21:00', arrTime: '23:25', depDate: null, arrDate: null, duration: null },
      ], stages: [
        { kind: 'origin', city: 'Luxemburgo', airport: 'Findel', iata: 'LUX', depTime: '18:25', depDate: null, flight: '1714' },
        { kind: 'layover', city: 'Amsterdã', airport: 'Schiphol', iata: 'AMS', arrTime: '19:35', depTime: '21:00', arrDate: null, depDate: null },
        { kind: 'destination', city: 'Dubrovnik', airport: 'Boskovic', iata: 'DBV', arrTime: '23:25', arrDate: null, flight: '1981' },
      ] };
      const trip = { id: 'tx', name: 'NullDateTrip', startDate: '2026-06-30', endDate: '2026-07-10', status: 'active',
        destinations: [{ name: 'São Paulo, Brasil', date: '2026-06-30' }],
        members: [{ id: 'me', name: 'Você', isAdmin: true, joinVia: 'creator', joinedAt: '2026-05-01' }],
        activities: [], docs: [{ id: 'dx', cat: 'tickets', sub: 'Avião', name: 'voo', file: 'voo.jpg', itin }], gallery: [], expenses: [] };
      localStorage.setItem('trippin_v1', JSON.stringify({ lang: 'pt-BR', user: { firstName: 'X', name: 'X' }, trips: [trip], settings: { notifications: true, theme: 'light', shareLocation: false }, notifs: [] }));
    });
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('NullDateTrip'));
    await page.locator('text=NullDateTrip').first().click();
    await page.waitForTimeout(300);
    await clickButton(page, 'Docs');
    await page.waitForTimeout(300);
    await clickButton(page, 'Ver roteiro');
    await page.waitForTimeout(300);
    await clickButton(page, 'Adicionar etapas ao cronograma'); // abre o modal de confirmação
    await page.waitForTimeout(300);
    // confirma no modal
    await page.evaluate(() => { const x = Array.from(document.querySelectorAll('.modal button')).find(e => /Adicionar etapas/i.test(e.textContent)); x && x.click(); });
    await page.waitForTimeout(400);

    const rootEmpty = await page.evaluate(() => (document.getElementById('root').innerText || '').trim().length === 0);
    expect(rootEmpty, 'tela branca: #root ficou vazio ao adicionar etapas').toBe(false);
    expect(errors.filter(e => !isKnownError(e)), 'erro de runtime ao montar o cronograma').toHaveLength(0);
  });
});

// ── ESCALA vs DESTINO, ordem cronológica e dedup ─────────────────────────────
const COMPLEX_TRIP = {
  id: 'tc', name: 'OrdemTrip', startDate: '2026-06-30', endDate: '2026-07-20', status: 'active',
  // destino duplicado de propósito (testa dedup) + um destino datado 03/07
  destinations: [
    { name: 'Porto Alegre, Brasil', date: '2026-06-30' },
    { name: 'Porto Alegre, Brasil', date: '2026-06-30' },
    { name: 'Luxemburgo, Luxemburgo', date: '2026-07-03' },
  ],
  members: [{ id: 'me', name: 'Você', isAdmin: true, joinVia: 'creator', joinedAt: '2026-05-01' }],
  activities: [],
  docs: [
    { id: 'da', cat: 'tickets', sub: 'Avião', name: 'azul', file: 'azul.jpg', itin: { legs: [
      { flight: '2863', from: { iata: 'POA', city: 'Porto Alegre', airport: 'Salgado Filho' }, to: { iata: 'GRU', city: 'São Paulo', airport: 'Guarulhos' }, depDate: '2026-06-30', depTime: '14:30', arrDate: '2026-06-30', arrTime: '16:15', duration: null },
    ], stages: [] } },
    { id: 'dk', cat: 'tickets', sub: 'Avião', name: 'klm', file: 'klm.jpg', itin: { legs: [
      { flight: '1714', from: { iata: 'LUX', city: 'Luxemburgo', airport: 'Findel' }, to: { iata: 'AMS', city: 'Amsterdã', airport: 'Schiphol' }, depDate: '2026-07-03', depTime: '18:25', arrDate: '2026-07-03', arrTime: '19:35', duration: null },
      { flight: '1981', from: { iata: 'AMS', city: 'Amsterdã', airport: 'Schiphol' }, to: { iata: 'DBV', city: 'Dubrovnik', airport: 'Boskovic' }, depDate: '2026-07-03', depTime: '21:00', arrDate: '2026-07-03', arrTime: '23:25', duration: null },
    ], stages: [] } },
  ],
  // dois álbuns "Porto Alegre" (testa dedup da galeria)
  albums: [{ id: 'a1', name: 'Porto Alegre' }, { id: 'a2', name: 'Porto Alegre' }, { id: 'a3', name: 'São Paulo' }],
  gallery: [], expenses: [],
};

test.describe('Local: escala não é destino; ordem e dedup', () => {
  test('locationAnchors ignora escala; locationForDay = destino final e nulo após o fim; sem dups', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window._trippinLoc);
    const r = await page.evaluate((trip) => {
      const L = window._trippinLoc;
      return {
        anchors: L.locationAnchors(trip).map(a => a.city),
        locFinal: L.locationForDay(trip, '2026-07-03'),
        locAfterEnd: L.locationForDay(trip, '2026-07-10'),
        locs: L.tripLocations(trip),
      };
    }, COMPLEX_TRIP);
    expect(r.anchors, 'escala (Amsterdã) não deve ser "onde você fica"').not.toContain('Amsterdã');
    expect(r.locFinal, 'local do dia 03/07 deve ser o destino final, não a escala').toBe('Dubrovnik');
    expect(r.locAfterEnd, 'após a última data: sem local (dia apagado)').toBeNull();
    expect(r.locs, 'a escala aparece no mapa/galeria como lugar visitado').toContain('Amsterdã');
    expect(new Set(r.locs).size, 'tripLocations não deve ter cidades repetidas').toBe(r.locs.length);
  });

  test('mapa em ordem cronológica, galeria sem repetição e navegação entre meses', async ({ page }) => {
    await page.addInitScript((trip) => {
      localStorage.setItem('trippin_v1', JSON.stringify({ lang: 'pt-BR', user: { firstName: 'V', name: 'V' }, trips: [trip], settings: { notifications: true, theme: 'light', shareLocation: false }, notifs: [] }));
    }, COMPLEX_TRIP);
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('OrdemTrip'));
    await page.locator('text=OrdemTrip').first().click();
    await page.waitForTimeout(300);

    // MAPA: ordem por data (origem 30/06 primeiro, destino datado 03/07 no meio)
    await clickButton(page, 'Mapa');
    await page.waitForTimeout(400);
    const mapCities = await page.evaluate(() => Array.from(document.querySelectorAll('.mapcity')).map(e => e.textContent));
    expect(mapCities, 'mapa em ordem cronológica de chegada').toEqual(['Porto Alegre', 'São Paulo', 'Luxemburgo', 'Amsterdã', 'Dubrovnik']);

    // GALERIA: cada cidade uma vez
    await clickButton(page, 'Galeria');
    await page.waitForTimeout(400);
    const gal = await page.evaluate(() => Array.from(document.querySelectorAll('.albuminfo b')).map(e => e.textContent));
    expect(new Set(gal).size, 'galeria não deve repetir cidade').toBe(gal.length);
    expect(gal.filter(c => c === 'Porto Alegre').length, 'Porto Alegre só uma vez').toBe(1);

    // CRONOGRAMA mês: navegação entre meses
    await clickButton(page, 'Cronograma');
    await page.waitForTimeout(200);
    await page.evaluate(() => { const x = Array.from(document.querySelectorAll('.segbtns button')).find(e => /Mês/.test(e.textContent)); x && x.click(); });
    await page.waitForTimeout(200);
    const monthBefore = await page.evaluate(() => (document.body.innerText.match(/(Junho|Julho|Agosto) De 2026/i) || [])[0]);
    await page.evaluate(() => { const ar = Array.from(document.querySelectorAll('.navarrow')); ar[1] && ar[1].click(); });
    await page.waitForTimeout(200);
    const monthAfter = await page.evaluate(() => (document.body.innerText.match(/(Junho|Julho|Agosto) De 2026/i) || [])[0]);
    expect(monthBefore, 'mês inicial').toMatch(/Junho/i);
    expect(monthAfter, 'após › deve avançar de mês').toMatch(/Julho/i);
  });
});

// ── DATAS EM FORMATO HUMANO (não ISO) ────────────────────────────────────────
test.describe('Datas legíveis (formato humano)', () => {
  test('home, dia e trechos mostram datas por extenso, não 2026-06-30', async ({ page }) => {
    await page.addInitScript(() => {
      const trip = { id: 'td', name: 'DatasTrip', startDate: '2026-06-30', endDate: '2026-07-20', status: 'active',
        destinations: [{ name: 'Lisboa, Portugal', date: '2026-07-01' }],
        members: [{ id: 'me', name: 'Você', isAdmin: true, joinVia: 'creator', joinedAt: '2026-05-01' }],
        activities: [{ id: 'a1', date: '2026-07-01', start: '10:00', end: '12:00', title: 'Torre de Belém', type: 'typeTour', loc: 'Lisboa', source: 'manual', joined: ['me'] }],
        docs: [], albums: [], gallery: [], expenses: [] };
      localStorage.setItem('trippin_v1', JSON.stringify({ lang: 'pt-BR', user: { firstName: 'A', name: 'A' }, trips: [trip], settings: { notifications: true, theme: 'light', shareLocation: false }, notifs: [] }));
    });
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('DatasTrip'));

    const homeCard = await page.evaluate(() => { const c = document.querySelector('.tripcard'); return c ? c.innerText : ''; });
    expect(homeCard, 'intervalo legível na home').toMatch(/30 jun\s*–\s*20 jul/i);
    expect(homeCard, 'home não deve mostrar ISO').not.toMatch(/2026-06-30/);

    await page.locator('text=DatasTrip').first().click();
    await page.waitForTimeout(400);
    const body = await page.evaluate(() => document.body.innerText);
    expect(body, 'título do dia por extenso (ex.: Quarta, 1 de julho)').toMatch(/(segunda|terça|quarta|quinta|sexta|sábado|domingo),\s*1 de julho/i);
    expect(body, 'cronograma não deve mostrar ISO no título').not.toMatch(/📅\s*2026-07-01/);
  });
});

// ── MODO ESCURO COERENTE (body e alerts adaptam) ─────────────────────────────
test.describe('Modo escuro coerente', () => {
  test('body/html ficam escuros e alerts não permanecem claros', async ({ page }) => {
    await page.addInitScript(() => {
      const trip = { id: 'tk', name: 'DarkTrip', startDate: '2026-06-30', endDate: '2026-07-20', status: 'active',
        destinations: [{ name: 'Lisboa, Portugal', date: '2026-07-01' }],
        members: [{ id: 'me', name: 'Você', isAdmin: true, joinVia: 'creator', joinedAt: '2026-05-01' }],
        activities: [], docs: [], albums: [], gallery: [], expenses: [] };
      localStorage.setItem('trippin_v1', JSON.stringify({ lang: 'pt-BR', user: { firstName: 'A', name: 'A' }, trips: [trip], settings: { notifications: true, theme: 'dark', shareLocation: false }, notifs: [] }));
    });
    await page.goto('/');
    await page.waitForFunction(() => document.body.innerText.includes('DarkTrip'));

    const sum = rgb => (rgb.match(/\d+/g) || [0, 0, 0]).slice(0, 3).reduce((a, b) => a + (+b), 0);
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(sum(bodyBg), 'body deve ser escuro (não o creme #E9E5DC)').toBeLessThan(150);

    await page.locator('text=DarkTrip').first().click();
    await page.waitForTimeout(300);
    await clickButton(page, 'Docs');
    await page.waitForTimeout(300);
    const alertBg = await page.evaluate(() => { const a = document.querySelector('.alert'); return a ? getComputedStyle(a).backgroundColor : 'rgb(0,0,0)'; });
    expect(sum(alertBg), 'o alert do interpretador deve adaptar ao escuro (não azul claro)').toBeLessThan(300);
  });
});
