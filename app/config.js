/* ============================================================
   Trippin — config do Supabase
   ------------------------------------------------------------
   Preencha com os valores do seu projeto Supabase (Settings > API).
   Estes valores são PÚBLICOS — ficam expostos no navegador, e
   isso é OK: quem protege os dados é o Row Level Security (RLS),
   não a chave. Nunca cole aqui a service_role.
   ============================================================ */
window.TRIPPIN_CONFIG = {
  SUPABASE_URL: "",       // ex: "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",  // chave anon (Settings > API > Project API keys > anon public)
  APP_URL: ""             // ex: "https://trippin.app" — usado no link do convite
};
