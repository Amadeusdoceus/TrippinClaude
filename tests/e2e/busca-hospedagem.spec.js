/**
 * Trippin — Testes E2E da Busca de hospedagem (app/buscar-hospedagem.html)
 *
 * Cobre:
 *   1. Página carrega sem erro de JS (blindagem de tela branca)
 *   2. Validação de datas (check-out <= check-in não busca)
 *   3. Modo exemplo: quando a Edge Function não responde, cai nos dados demo
 *   4. Modo real: quando a função responde, renderiza os dados recebidos
 *   5. Steppers de hóspedes funcionam
 *
 * As rotas externas (Edge Function e Nominatim) são interceptadas para
 * manter os testes determinísticos e independentes de rede.
 */
const { test, expect } = require('@playwright/test');

const PAGE = '/buscar-hospedagem.html';

/** Evita chamadas externas: autocomplete (Nominatim) responde vazio. */
async function stubNominatim(page) {
  await page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

/** Faz a Edge Function search-stays responder com `payload` (ou erro). */
async function routeEngine(page, { status = 200, payload = null } = {}) {
  await page.route('**/functions/v1/search-stays', route =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload || {}),
    }));
}

async function fillForm(page, dest = 'Lisboa') {
  await page.fill('#dest', dest);
  await page.fill('#ci', '2026-08-01');
  await page.fill('#co', '2026-08-04');
}

async function submit(page) {
  await page.click('#go');
}

// ─── 1. SMOKE ────────────────────────────────────────────────────────────────

test.describe('1 · Página carrega', () => {
  test('exibe o formulário sem erro de JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await stubNominatim(page);

    await page.goto(PAGE);
    await expect(page.locator('text=Buscar hospedagem')).toBeVisible();
    await expect(page.locator('#dest')).toBeVisible();
    await expect(page.locator('#go')).toBeVisible();

    const critical = errors.filter(e => !e.includes('ResizeObserver'));
    expect(critical).toHaveLength(0);
  });
});

// ─── 2. VALIDAÇÃO ─────────────────────────────────────────────────────────────

test.describe('2 · Validação do formulário', () => {
  test('check-out anterior ao check-in mostra erro e não busca', async ({ page }) => {
    await stubNominatim(page);
    await routeEngine(page, { status: 404 });

    await page.goto(PAGE);
    await page.fill('#dest', 'Roma');
    await page.fill('#ci', '2026-08-10');
    await page.fill('#co', '2026-08-05'); // inválido
    await submit(page);

    await expect(page.locator('#errDate')).toBeVisible();
    // Nenhum card deve ter sido renderizado
    await expect(page.locator('.stay')).toHaveCount(0);
  });

  test('destino vazio mostra erro', async ({ page }) => {
    await stubNominatim(page);
    await page.goto(PAGE);
    await page.fill('#ci', '2026-08-01');
    await page.fill('#co', '2026-08-04');
    await submit(page);
    await expect(page.locator('#errDest')).toBeVisible();
  });
});

// ─── 3. MODO EXEMPLO (fallback) ───────────────────────────────────────────────

test.describe('3 · Modo exemplo', () => {
  test('quando a função falha, mostra banner de exemplo e cards', async ({ page }) => {
    await stubNominatim(page);
    await routeEngine(page, { status: 404 }); // força o fallback demo

    await page.goto(PAGE);
    await fillForm(page, 'Lisboa');
    await submit(page);

    await expect(page.locator('text=Resultados de exemplo')).toBeVisible({ timeout: 10_000 });
    const cards = page.locator('.stay');
    expect(await cards.count()).toBeGreaterThan(0);
    // Preço em reais e botão "Ver no site"
    await expect(page.locator('.stay .price').first()).toContainText('R$');
    await expect(page.locator('.stay a.go').first()).toHaveAttribute('href', /booking|airbnb|hotels|expedia|hostelworld|google/);
  });

  test('o destino digitado aparece nos resultados de exemplo', async ({ page }) => {
    await stubNominatim(page);
    await routeEngine(page, { status: 404 });

    await page.goto(PAGE);
    await fillForm(page, 'Florianópolis');
    await submit(page);

    await expect(page.locator('.stay .nm').first()).toContainText('Florianópolis', { timeout: 10_000 });
  });
});

// ─── 4. MODO REAL (função responde) ──────────────────────────────────────────

test.describe('4 · Modo real', () => {
  test('renderiza os dados retornados pela função, sem banner de exemplo', async ({ page }) => {
    await stubNominatim(page);
    await routeEngine(page, {
      status: 200,
      payload: {
        demo: false,
        providers: ['hotellook'],
        stays: [{
          id: 'x1', source: 'hotellook', sourceLabel: 'Hotellook', kind: 'Hotel',
          name: 'Hotel Teste Real', stars: 4, rating: 9.1, reviews: 1234,
          neighborhood: 'Centro', distanceKm: 1.2,
          pricePerNight: 320, totalPrice: 960, currency: 'BRL',
          freeCancellation: true, breakfast: false, thumbnail: null,
          url: 'https://example.com/hotel',
        }],
      },
    });

    await page.goto(PAGE);
    await fillForm(page, 'Lisboa');
    await submit(page);

    await expect(page.locator('text=Hotel Teste Real')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Resultados de exemplo')).toHaveCount(0);
    await expect(page.locator('.stay')).toHaveCount(1);
  });
});

// ─── 5. INTERAÇÃO ─────────────────────────────────────────────────────────────

test.describe('5 · Hóspedes', () => {
  test('stepper de adultos incrementa e decrementa', async ({ page }) => {
    await stubNominatim(page);
    await page.goto(PAGE);

    await expect(page.locator('#nAdults')).toHaveText('2');
    await page.click('button[data-step="adults"][data-d="1"]');
    await expect(page.locator('#nAdults')).toHaveText('3');
    await page.click('button[data-step="adults"][data-d="-1"]');
    await page.click('button[data-step="adults"][data-d="-1"]');
    await expect(page.locator('#nAdults')).toHaveText('1');
    // mínimo de 1 adulto: o botão de menos fica desabilitado
    await expect(page.locator('button[data-step="adults"][data-d="-1"]')).toBeDisabled();
  });
});

// ─── 6. SEM PREÇO (real, OpenStreetMap) ──────────────────────────────────────

test.describe('6 · Hospedagens reais sem preço (OpenStreetMap)', () => {
  test('mostra "Ver preço no site", banner de OSM e não exibe "R$ 0"', async ({ page }) => {
    await stubNominatim(page);
    await routeEngine(page, {
      status: 200,
      payload: {
        demo: false,
        providers: ['osm'],
        stays: [{
          id: 'osm-1', source: 'osm', sourceLabel: 'OpenStreetMap', kind: 'Hotel',
          name: 'Hôtel Teste OSM', stars: 3, rating: null, reviews: 0,
          neighborhood: 'Centro', distanceKm: null,
          pricePerNight: 0, totalPrice: 0, currency: 'BRL', priceUnknown: true,
          freeCancellation: false, breakfast: false, thumbnail: null,
          url: 'https://example.com/osm-hotel',
        }],
      },
    });

    await page.goto(PAGE);
    await fillForm(page, 'Paris');
    await submit(page);

    await expect(page.locator('text=Hôtel Teste OSM')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Ver preço no site')).toBeVisible();
    await expect(page.locator('text=via OpenStreetMap')).toBeVisible();
    await expect(page.locator('text=R$ 0')).toHaveCount(0);
  });
});
