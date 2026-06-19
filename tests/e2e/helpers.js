/**
 * Shared helpers for Trippin e2e tests.
 */

/**
 * Fill the Nth non-file input (0-based) with a value, triggering React state.
 * Uses the native input value setter so React picks up the change.
 */
async function fillByIndex(page, index, value) {
  await page.evaluate(
    ({ idx, val }) => {
      const inputs = Array.from(document.querySelectorAll('input')).filter(i => i.type !== 'file');
      const el = inputs[idx];
      if (!el) throw new Error('Input index not found: ' + idx);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { idx: index, val: value }
  );
}

/** Fill a React-controlled input by CSS selector. */
async function fillReact(page, selector, value) {
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('Element not found: ' + sel);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel: selector, val: value }
  );
}

/** Click the first button whose text contains `label`. */
async function clickButton(page, label) {
  await page.evaluate((lbl) => {
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      b.textContent.includes(lbl)
    );
    if (!btn) throw new Error('Button not found: ' + lbl);
    btn.click();
  }, label);
}

/**
 * Complete the language screen: select PT-BR, click Continuar.
 * Leaves the page on the "Criar perfil" screen.
 */
async function selectLanguage(page) {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Brasil'))
  );
  await clickButton(page, 'Brasil');
  await clickButton(page, 'Continuar');
  await page.waitForFunction(() => document.body.innerText.includes('Criar perfil'));
}

/**
 * Fill and submit the registration form.
 * Inputs order: 0=Nome, 1=Sobrenome, 2=birth(date), 3=CPF, 4=email, 5=phone, 6=pwd, 7=confirm
 * Leaves the page on the home screen.
 */
async function registerUser(page, {
  firstName = 'Teste',
  lastName = 'Usuario',
  birth = '1990-01-15',
  email = 'teste@trippin.com',
  phone = '11999999999',
  password = 'Senha123',
} = {}) {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('input')).filter(i => i.type !== 'file').length >= 7
  );

  await fillByIndex(page, 0, firstName);
  await fillByIndex(page, 1, lastName);
  await fillByIndex(page, 2, birth);
  await fillByIndex(page, 4, email);
  await fillByIndex(page, 5, phone);
  await fillByIndex(page, 6, password);
  await fillByIndex(page, 7, password);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await clickButton(page, 'Confirmar e entrar');

  await page.waitForFunction(
    (name) => document.body.innerText.includes('Olá, ' + name),
    firstName,
    { timeout: 10_000 }
  );
}

/**
 * Create a trip from the home screen.
 * Trip form inputs: 0=Nome, 1=Início(date), 2=Fim(date)
 * Leaves the page on the trip's Cronograma tab.
 */
async function createTrip(page, {
  name = 'Viagem Teste',
  start = '2026-08-01',
  end = '2026-08-15',
} = {}) {
  await clickButton(page, 'Nova viagem');
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('input')).filter(i => i.type !== 'file').length >= 3
  );

  await fillByIndex(page, 0, name);
  await fillByIndex(page, 1, start);
  await fillByIndex(page, 2, end);

  await clickButton(page, 'Criar viagem');
  await page.waitForFunction((n) => document.body.innerText.includes(n), name, { timeout: 10_000 });
}

/**
 * Inject a window.open interceptor BEFORE page load (via addInitScript).
 * Returns an async getter that fetches the captured URLs.
 */
function interceptWindowOpen(page) {
  page.addInitScript(() => {
    window._openedUrls = [];
    window.open = function (url) {
      window._openedUrls.push(String(url || ''));
      return null;
    };
  });
  return () => page.evaluate(() => window._openedUrls || []);
}

/**
 * Known non-fatal errors emitted by trippin-api.js when running without a
 * real Supabase backend. These are expected in test / offline mode.
 */
const KNOWN_ERRORS = [
  'Cannot use import statement outside a module',   // ESM SDK loaded as CJS
  "Cannot destructure property 'createClient'",      // Supabase not loaded
  'Failed to load resource',
];

function isKnownError(msg) {
  return KNOWN_ERRORS.some(e => msg.includes(e));
}

module.exports = {
  fillByIndex,
  fillReact,
  clickButton,
  selectLanguage,
  registerUser,
  createTrip,
  interceptWindowOpen,
  isKnownError,
};
