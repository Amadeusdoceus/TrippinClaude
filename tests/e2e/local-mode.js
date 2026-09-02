/**
 * Fixture pra suíte "antiga" (trippin.spec.js e afins), escrita antes da Fase 2B
 * e nunca desenhada pra rodar contra um backend remoto de verdade.
 *
 * Achado real na Fase 7 (ver analise/06-pontas-soltas.md): com
 * REMOTE_ENABLED=true e um staging alcançável, TrippinAPI.mode vira 'remote'
 * assim que o health-check resolve, e o onboarding (ProfileScreen) passa a
 * criar conta de verdade no Supabase Auth. Essa suíte reusa e-mails fixos
 * (teste@trippin.com etc.) em dezenas de testes sem isolamento — a primeira
 * a cadastrar de verdade consome o e-mail, e todas as seguintes quebram com
 * "already registered". Fixando FORCE_MODE='local' aqui, via o mesmo truque
 * de mock de config.js que as suítes *-remote.spec.js já usam (só invertido),
 * essa suíte fica imune a qualquer valor futuro de REMOTE_ENABLED em
 * app/config.js — cobre exatamente o que ela sempre cobriu (modo local),
 * enquanto auth-remote.spec.js e as outras *-remote.spec.js (mockadas)
 * continuam sendo a cobertura de verdade do fluxo remoto.
 */
const base = require('@playwright/test');

// SUPABASE_URL/ANON_KEY continuam preenchidos de propósito (não ""): o envio
// de convite (send-invite) é chamado sempre que existirem, independente de
// TrippinAPI.mode (ver comentário em app/index.html, `invite()`) — zerar
// aqui quebraria esse caminho, que essa mesma suíte também testa. Só
// FORCE_MODE que precisa travar em 'local'.
const FORCE_LOCAL_CONFIG = `
window.TRIPPIN_CONFIG = {
  SUPABASE_URL: "https://wwnxrzdmdhdgzokmbvud.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_n9Nxu9sNszlXNHTpSKLCCw_A3aLsG37",
  APP_URL: "http://localhost:5173",
  REMOTE_ENABLED: false,
  FORCE_MODE: "local"
};
`;

const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.route('**/config.js', route =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: FORCE_LOCAL_CONFIG })
    );
    await use(page);
  },
});

module.exports = { test, expect: base.expect };
