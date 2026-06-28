/**
 * Trippin — Guard de CONTRASTE (legibilidade no tema escuro)
 *
 * Pega a classe de bug recorrente: controles de formulário (select/input/textarea)
 * com "claro-no-claro" (ou escuro-no-escuro) quando o tema escuro está ativo —
 * tipicamente por hardcode de `background:#fff` em vez de `var(--card)`.
 *
 * Estratégia: abre o app em tema ESCURO, navega pelas telas com controles
 * (aba Mapa + editor de Custos) e calcula o contraste WCAG entre a cor do texto
 * e o fundo efetivo de cada controle visível. Falha se algum ficar abaixo do
 * limiar — assim, toda nova implementação que esqueça as variáveis de tema é
 * barrada no `npm run review`.
 */
const { test, expect } = require('@playwright/test');
const { isKnownError } = require('./helpers');

const TRIP = {
  id: 'c1', name: 'Contraste', startDate: '2026-08-01', endDate: '2026-08-06', status: 'active',
  members: [{ id: 'me', name: 'Você', firstName: 'Você' }, { id: 'ana', name: 'Ana', firstName: 'Ana' }],
  destinations: [{ name: 'Lisboa', date: '2026-08-01' }, { name: 'Porto', date: '2026-08-04' }],
  activities: [], docs: [], gallery: [], albums: [],
  expenses: [{ id: 'e1', desc: 'Jantar', amount: 120, currency: 'BRL', paidBy: 'me', participants: ['me', 'ana'], equalSplit: true, settled: {} }],
};

const MIN_RATIO = 3.0; // claro-no-claro fica ~1.1; um controle legível passa folgado (>4.5)

/** Roda no navegador: devolve os controles cujo contraste texto×fundo < min. */
function scanContrast(min) {
  const parse = s => { const m = (s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; };
  const lum = ({ r, g, b }) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const hi = Math.max(lum(a), lum(b)), lo = Math.min(lum(a), lum(b)); return (hi + 0.05) / (lo + 0.05); };
  const effBg = el => { let n = el; while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) return c; n = n.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const sel = 'select, input:not([type=file]):not([type=checkbox]):not([type=radio]), textarea';
  const out = [];
  Array.from(document.querySelectorAll(sel)).forEach(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') return;
    const color = parse(cs.color); if (!color) return;
    let bg = parse(cs.backgroundColor);
    if (!bg || bg.a === 0) bg = effBg(el.parentElement || el);
    const cr = ratio(color, bg);
    if (cr < min) out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || ''), id: el.id || '', ratio: Math.round(cr * 100) / 100 });
  });
  return out;
}

test.describe('Guard · contraste no tema escuro', () => {
  test('controles de formulário são legíveis (Mapa + Custos) no escuro', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // semeia tema ESCURO + viagem, abre direto nela
    await page.addInitScript((trip) => {
      localStorage.setItem('trippin_v1', JSON.stringify({
        lang: 'pt-BR', user: { firstName: 'Você' },
        settings: { theme: 'dark', notifications: true, shareLocation: false },
        trips: [trip],
      }));
      sessionStorage.setItem('trippin_open_trip', trip.id);
    }, TRIP);

    await page.goto('/');
    await page.waitForFunction(() => document.querySelector('#root[data-theme="dark"]') != null);

    // ── Varre TODAS as abas da viagem no escuro ────────────────
    const tabs = ['Cronograma', 'Mapa', 'Docs', 'Galeria', 'Custos', 'Usuários', 'Sugestões'];
    for (const label of tabs) {
      await page.evaluate((lbl) => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes(lbl)); b && b.click(); }, label);
      await page.waitForTimeout(160);
      const fails = await page.evaluate(scanContrast, MIN_RATIO);
      expect(fails, `Controles ilegíveis na aba ${label} (escuro): ` + JSON.stringify(fails)).toEqual([]);
    }

    // ── Editor de nova despesa (sub-tela com vários controles) ──
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Custos/.test(x.textContent)); b && b.click(); });
    await page.waitForFunction(() => document.body.innerText.includes('Nova despesa'));
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Nova despesa/.test(x.textContent)); b && b.click(); });
    await page.waitForFunction(() => document.querySelectorAll('input,select').length >= 3);
    await page.waitForTimeout(120);
    const costFails = await page.evaluate(scanContrast, MIN_RATIO);
    expect(costFails, 'Controles ilegíveis no editor de Custos (escuro): ' + JSON.stringify(costFails)).toEqual([]);

    const critical = errors.filter(e => !isKnownError(e) && !e.includes('ResizeObserver'));
    expect(critical).toHaveLength(0);
  });
});
