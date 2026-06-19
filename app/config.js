/* ============================================================
   Trippin — config do Supabase
   ------------------------------------------------------------
   Preencha com os valores do seu projeto Supabase (Settings > API).
   Estes valores são PÚBLICOS — ficam expostos no navegador, e
   isso é OK: quem protege os dados é o Row Level Security (RLS),
   não a chave. Nunca cole aqui a service_role.
   ============================================================ */
window.TRIPPIN_CONFIG = {
  SUPABASE_URL: "https://fcrsessmvmbaeqyrjbtk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_9CZvmJOcF3dA0Zd-wpUnKA_r0wYKcdA",
  APP_URL: "https://amadeusdoceus.github.io/TrippinClaude",
  // Google Maps JavaScript API key — obtenha em console.cloud.google.com
  // Restrinja ao domínio amadeusdoceus.github.io para uso gratuito seguro.
  // Deixe vazio ("") para usar o mapa offline (OpenStreetMap / Leaflet).
  MAPS_API_KEY: "AIzaSyCsgv7X9TwmM67D2pPzA4skh3-GSXgUVsk"
};
