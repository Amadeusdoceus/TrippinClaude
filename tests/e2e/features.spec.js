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

// ── #2/#4/#6 MODAIS E PAINEL (sem overlay preto, blur) ────────────────────────
test.describe('Estilo de modais e painel', () => {
  test('overlay/modal usam backdrop-filter (blur) em vez de fundo preto', async ({ page }) => {
    await page.goto('/');
    const hasBlur = await page.evaluate(() => {
      let blur = false;
      for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try { rules = sheet.cssRules; } catch (_) { continue; }
        for (const r of Array.from(rules || [])) {
          if (r.selectorText && /\.(overlay|modal)\b/.test(r.selectorText) &&
              /backdrop-filter/.test(r.cssText)) blur = true;
        }
      }
      return blur;
    });
    expect(hasBlur, '.overlay/.modal deveriam usar backdrop-filter: blur').toBe(true);
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
