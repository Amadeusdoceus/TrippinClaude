/* ============================================================
   Trippin — config do Supabase
   ------------------------------------------------------------
   Preencha com os valores do seu projeto Supabase (Settings > API).
   Estes valores são PÚBLICOS — ficam expostos no navegador, e
   isso é OK: quem protege os dados é o Row Level Security (RLS),
   não a chave. Nunca cole aqui a service_role.

   SUPABASE_URL/ANON_KEY continuam valendo em qualquer hostname — são
   usados hoje pelas Edge Functions (send-invite, search-stays) via fetch
   direto, independente do sistema de auth da Fase 2B. Não os esvazie fora
   de produção: isso quebraria esse fluxo, que não depende de schema nenhum.

   AD-08 (analise/03-arquitetura-alvo.md) — dois projetos Supabase (prod e
   staging), resolvidos por hostname — ainda não se aplica de verdade: só
   existe UM projeto real até a Fase 1 (tarefa 1.1) provisionar
   trippin-staging. Quando isso acontecer, troque STAGING abaixo pelas
   credenciais do projeto novo; ENV_NAME já resolve sozinho por hostname.

   REMOTE_ENABLED é o interruptor da Fase 2B (TrippinAPI.auth/mode='remote'
   — login, cadastro real, dados no Postgres). Fica `false` até a Fase 1
   estar de fato aplicada no projeto usado neste hostname. Com `false`,
   TrippinAPI nunca tenta 'remote' — o app se comporta exatamente como
   hoje (modo local), mesmo com SUPABASE_URL preenchido. Troque para
   `true` só depois de rodar a suíte de testes de policy
   (backend/supabase/tests/) contra o projeto de verdade.
   ============================================================ */
window.TRIPPIN_CONFIG = (function () {
  var REMOTE_ENABLED = true;

  var PROD = {
    SUPABASE_URL: "https://fcrsessmvmbaeqyrjbtk.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_9CZvmJOcF3dA0Zd-wpUnKA_r0wYKcdA",
    APP_URL: "https://amadeusdoceus.github.io/TrippinClaude"
  };
  // trippin-staging de verdade (projeto wwnxrzdmdhdgzokmbvud, provisionado e
  // migrado em 31/08/2026 — ver M2/M3 em analise/06-pontas-soltas.md).
  var STAGING = {
    SUPABASE_URL: "https://wwnxrzdmdhdgzokmbvud.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_n9Nxu9sNszlXNHTpSKLCCw_A3aLsG37",
    APP_URL: "http://localhost:8000"
  };

  var host = (typeof location !== 'undefined' && location.hostname) || '';
  var isProdHost = /(^|\.)github\.io$/.test(host);
  var env = isProdHost ? PROD : STAGING;

  var cfg = {};
  for (var k in env) cfg[k] = env[k];
  cfg.REMOTE_ENABLED = REMOTE_ENABLED;
  cfg.ENV_NAME = isProdHost ? 'prod' : 'staging';
  return cfg;
  // O mapa da viagem é renderizado localmente (DestPinMap) — sem Google Maps.
})();
