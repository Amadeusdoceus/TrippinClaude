// ============================================================
// Trippin — Edge Function: search-stays  (arquivo único)
// ------------------------------------------------------------
// Motor de busca de hospedagem. Recebe a query da interface (destino,
// datas, hóspedes, moeda), roda em paralelo todos os CONECTORES habilitados,
// normaliza/mescla os resultados e devolve uma lista única.
//
// Sem nenhuma chave configurada -> devolve dados de EXEMPLO (demo:true), para
// a interface funcionar de imediato. Assim que você adicionar a chave de um
// agregador gratuito (ex.: TRAVELPAYOUTS_TOKEN ou RAPIDAPI_KEY) nos Secrets do
// projeto, os dados reais passam a fluir — sem mudar código.
//
// Arquitetura de CONECTORES (seções abaixo):
//   - AGREGADORES (ativos agora, plano grátis): Hotellook/Travelpayouts, Booking
//     e Airbnb via RapidAPI.
//   - OFICIAIS DE PARCEIRO (FUTURO): Amadeus, Booking Demand, Expedia — já
//     esboçados e DESLIGADOS; ligam sozinhos quando a chave deles existir.
// Para adicionar uma fonte nova, crie um StayProvider e inclua no array
// PROVIDERS. Nada mais no app precisa mudar.
//
// Mantido como UM arquivo de propósito: dá para publicar colando direto no
// painel do Supabase (Edge Functions), sem precisar do CLI.
// ============================================================

// ---------- contrato de dados ----------
interface SearchQuery {
  location: string;
  fullLocation?: string;
  lat?: number | null;
  lng?: number | null;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  nights: number;
  adults: number;
  children: number;
  rooms: number;
  currency: string;  // BRL | USD | EUR | ...
  locale?: string;
}

interface Stay {
  id: string;
  source: string;
  sourceLabel: string;
  kind: string;
  name: string;
  stars: number;
  rating: number | null; // 0–10
  reviews: number;
  neighborhood: string;
  lat?: number | null;
  lng?: number | null;
  distanceKm: number | null;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  priceUnknown?: boolean;   // true = fonte sem preço ao vivo (ex.: OpenStreetMap)
  freeCancellation: boolean;
  breakfast: boolean;
  thumbnail: string | null;
  url: string;
}

type Env = (key: string) => string | undefined;

interface StayProvider {
  id: string;
  label: string;
  kind: "aggregator" | "official" | "mock";
  enabled: (env: Env) => boolean;
  search: (q: SearchQuery, env: Env) => Promise<Stay[]>;
}

// ---------- helpers ----------
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}

/** Deep-link para a busca real de cada site (fallback quando a fonte não dá URL própria). */
function siteSearchUrl(srcId: string, q: SearchQuery): string {
  const loc = encodeURIComponent(q.fullLocation || q.location);
  const { adults: A, children: C, rooms: R, checkIn: ci, checkOut: co } = q;
  switch (srcId) {
    case "booking":
      return `https://www.booking.com/searchresults.pt-br.html?ss=${loc}&checkin=${ci}&checkout=${co}&group_adults=${A}&group_children=${C}&no_rooms=${R}`;
    case "airbnb":
      return `https://www.airbnb.com.br/s/${loc}/homes?checkin=${ci}&checkout=${co}&adults=${A}&children=${C}`;
    case "hotels":
      return `https://www.hotels.com/Hotel-Search?destination=${loc}&startDate=${ci}&endDate=${co}&rooms=${R}&adults=${A}`;
    case "expedia":
      return `https://www.expedia.com.br/Hotel-Search?destination=${loc}&startDate=${ci}&endDate=${co}`;
    case "hostelworld":
      return `https://www.hostelworld.com/search?search_keywords=${loc}&from=${ci}&to=${co}&guests=${A + C}`;
    case "hotellook":
      return `https://search.hotellook.com/hotels?destination=${loc}&checkIn=${ci}&checkOut=${co}&adults=${A}`;
    default:
      return `https://www.google.com/travel/search?q=${loc}`;
  }
}

/** Garante campos coerentes (totalPrice, rating no range, etc.). */
function normalize(partial: Partial<Stay> & { source: string; sourceLabel: string; name: string }, q: SearchQuery): Stay {
  const perNight = Math.max(0, Math.round(num(partial.pricePerNight)));
  const total = partial.totalPrice != null ? Math.round(num(partial.totalPrice)) : perNight * q.nights * q.rooms;
  return {
    id: partial.id || partial.source + "-" + Math.abs(hashStr(partial.name)).toString(36),
    source: partial.source,
    sourceLabel: partial.sourceLabel,
    kind: partial.kind || "Hospedagem",
    name: partial.name,
    stars: clamp(Math.round(num(partial.stars)), 0, 5),
    rating: partial.rating != null ? clamp(num(partial.rating), 0, 10) : null,
    reviews: Math.max(0, Math.round(num(partial.reviews))),
    neighborhood: partial.neighborhood || "",
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    distanceKm: partial.distanceKm != null ? num(partial.distanceKm) : null,
    pricePerNight: perNight,
    totalPrice: total,
    currency: partial.currency || q.currency,
    priceUnknown: !!partial.priceUnknown,
    freeCancellation: !!partial.freeCancellation,
    breakfast: !!partial.breakfast,
    thumbnail: partial.thumbnail || null,
    url: partial.url || siteSearchUrl(partial.source, q),
  };
}

const timeoutFetch = (url: string, init: RequestInit = {}, ms = 9000): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
};

// ============================================================
// AGREGADORES (ativos agora) — todos com plano gratuito
// ============================================================

// ---- 0) OpenStreetMap (Overpass) — GRÁTIS, SEM CHAVE, ATIVO POR PADRÃO -------
// Lista hospedagens REAIS (hotel/pousada/hostel/apartamento) do destino, no mundo
// todo, a partir do OpenStreetMap. Não traz PREÇO ao vivo (o "Ver no site" leva à
// reserva). Usa lat/lng do destino; sem coords, geocodifica pelo Nominatim.
// Desligar: secret OSM_DISABLED=1.
const OSM_UA = { "User-Agent": "TrippinApp/1.0 (+https://amadeusdoceus.github.io/TrippinClaude)" };
const OSM_KIND: Record<string, string> = {
  hotel: "Hotel", hostel: "Hostel", guest_house: "Pousada", motel: "Motel",
  apartment: "Apartamento", chalet: "Chalé", resort: "Resort",
};
const osm: StayProvider = {
  id: "osm",
  label: "OpenStreetMap",
  kind: "aggregator",
  enabled: (env) => env("OSM_DISABLED") !== "1",
  async search(q, _env) {
    // 1) coordenadas: usa as do destino ou geocodifica pelo nome (Nominatim)
    let lat = q.lat ?? null, lng = q.lng ?? null;
    if (lat == null || lng == null) {
      const g = await timeoutFetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q.fullLocation || q.location)}`,
        { headers: OSM_UA }, 8000);
      if (g.ok) {
        const arr = await g.json();
        if (Array.isArray(arr) && arr[0]) { lat = parseFloat(arr[0].lat); lng = parseFloat(arr[0].lon); }
      }
    }
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    // 2) Overpass: hospedagens num raio de 6 km ao redor do ponto
    const f = "hotel|hostel|guest_house|motel|apartment|chalet|resort";
    const ql = `[out:json][timeout:20];(` +
      `node["tourism"~"^(${f})$"]["name"](around:6000,${lat},${lng});` +
      `way["tourism"~"^(${f})$"]["name"](around:6000,${lat},${lng});` +
      `);out center 60;`;
    const mirrors = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
    let els: Array<Record<string, unknown>> = [];
    for (const url of mirrors) {
      try {
        const r = await timeoutFetch(url, {
          method: "POST",
          headers: { ...OSM_UA, "content-type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(ql),
        }, 13000);
        if (!r.ok) continue;
        els = (((await r.json())?.elements) || []) as Array<Record<string, unknown>>;
        if (els.length) break;
      } catch (_) { /* tenta o próximo mirror */ }
    }

    // 3) mapeia para Stay (sem preço -> priceUnknown)
    return els.map((e) => {
      const t = (e.tags || {}) as Record<string, string>;
      const c = (e.center || {}) as Record<string, unknown>;
      const site = t.website || t["contact:website"] || t.url || "";
      const name = String(t.name || "");
      return normalize({
        source: "osm", sourceLabel: "OpenStreetMap",
        kind: OSM_KIND[t.tourism] || "Hospedagem",
        id: "osm-" + e.type + "-" + e.id,
        name,
        stars: t.stars ? num(t.stars) : 0,
        neighborhood: t["addr:suburb"] || t["addr:neighbourhood"] || t["addr:city"] || "",
        lat: num(e.lat ?? c.lat) || null, lng: num(e.lon ?? c.lng ?? c.lon) || null,
        pricePerNight: 0,
        priceUnknown: true,
        url: site || ("https://www.google.com/travel/search?q=" + encodeURIComponent(name + " " + q.location)),
      }, q);
    }).filter((s) => !!s.name);
  },
};

// ---- 1) Hotellook / Travelpayouts (recomendado: agrega vários sites) --------
// Token grátis em https://www.travelpayouts.com. Env: TRAVELPAYOUTS_TOKEN
// (e, opcional, TRAVELPAYOUTS_MARKER para os links de afiliado).
const hotellook: StayProvider = {
  id: "hotellook",
  label: "Hotellook",
  kind: "aggregator",
  enabled: (env) => !!env("TRAVELPAYOUTS_TOKEN"),
  async search(q, env) {
    const token = env("TRAVELPAYOUTS_TOKEN")!;
    const marker = env("TRAVELPAYOUTS_MARKER") || "";
    const url = `https://engine.hotellook.com/api/v2/cache.json?location=${encodeURIComponent(q.location)}` +
      `&checkIn=${q.checkIn}&checkOut=${q.checkOut}&currency=${q.currency.toLowerCase()}&limit=25&token=${token}`;
    const r = await timeoutFetch(url);
    if (!r.ok) return [];
    const list = await r.json();
    if (!Array.isArray(list)) return [];
    return list.map((h: Record<string, unknown>) => {
      const priceTotal = num(h.priceFrom ?? h.priceAvg);
      const geo = (h.location as Record<string, unknown>)?.geo as Record<string, unknown> | undefined;
      const deep = `https://search.hotellook.com/?hotelId=${h.hotelId}&checkIn=${q.checkIn}&checkOut=${q.checkOut}` +
        `&adults=${q.adults}${marker ? "&marker=" + marker : ""}`;
      return normalize({
        source: "hotellook", sourceLabel: "Hotellook", kind: "Hotel",
        id: "hotellook-" + h.hotelId,
        name: String(h.hotelName || "Hotel"),
        stars: num(h.stars),
        pricePerNight: priceTotal > 0 ? priceTotal / q.nights : 0,
        totalPrice: priceTotal,
        lat: geo ? num(geo.lat) : null, lng: geo ? num(geo.lon) : null,
        url: deep,
      }, q);
    }).filter((s) => s.pricePerNight > 0);
  },
};

// ---- 2) Booking.com via RapidAPI (booking-com15) ----------------------------
// Grátis: assine "Booking com" no RapidAPI e use a chave no env RAPIDAPI_KEY.
const bookingRapid: StayProvider = {
  id: "booking",
  label: "Booking.com",
  kind: "aggregator",
  enabled: (env) => !!env("RAPIDAPI_KEY"),
  async search(q, env) {
    const key = env("RAPIDAPI_KEY")!;
    const host = env("RAPIDAPI_BOOKING_HOST") || "booking-com15.p.rapidapi.com";
    const H = { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host };

    const dest = await timeoutFetch(
      `https://${host}/api/v1/hotels/searchDestination?query=${encodeURIComponent(q.location)}`, { headers: H });
    if (!dest.ok) return [];
    const dj = await dest.json();
    const first = (dj?.data || [])[0];
    if (!first) return [];

    const params = new URLSearchParams({
      dest_id: String(first.dest_id), search_type: String(first.search_type || first.dest_type || "CITY"),
      arrival_date: q.checkIn, departure_date: q.checkOut,
      adults: String(q.adults), room_qty: String(q.rooms),
      page_number: "1", currency_code: q.currency, languagecode: "pt-br",
    });
    if (q.children > 0) params.set("children_age", Array(q.children).fill("8").join(","));

    const res = await timeoutFetch(`https://${host}/api/v1/hotels/searchHotels?${params}`, { headers: H });
    if (!res.ok) return [];
    const rj = await res.json();
    const hotels = rj?.data?.hotels || [];
    return hotels.map((row: Record<string, unknown>) => {
      const p = (row.property || row) as Record<string, unknown>;
      const price = (p.priceBreakdown as Record<string, unknown>)?.grossPrice as Record<string, unknown> | undefined;
      const total = num(price?.value);
      const photos = p.photoUrls as string[] | undefined;
      return normalize({
        source: "booking", sourceLabel: "Booking.com", kind: "Hotel",
        id: "booking-" + (p.id ?? row.hotel_id ?? p.name),
        name: String(p.name || "Hospedagem"),
        stars: num(p.accuratePropertyClass ?? p.propertyClass),
        rating: num(p.reviewScore) || null,
        reviews: num(p.reviewCount),
        neighborhood: String(p.wishlistName || ""),
        lat: num(p.latitude) || null, lng: num(p.longitude) || null,
        pricePerNight: total > 0 ? total / q.nights : 0,
        totalPrice: total,
        thumbnail: photos && photos.length ? photos[0] : null,
      }, q);
    }).filter((s) => s.pricePerNight > 0);
  },
};

// ---- 3) Airbnb via RapidAPI -------------------------------------------------
// O Airbnb não tem API oficial pública; usa-se um "actor" da RapidAPI. Cada um
// devolve um formato um pouco diferente — este adapter mapeia de forma defensiva
// e devolve [] se o formato não casar. Env: RAPIDAPI_KEY + RAPIDAPI_AIRBNB_HOST.
const airbnbRapid: StayProvider = {
  id: "airbnb",
  label: "Airbnb",
  kind: "aggregator",
  enabled: (env) => !!env("RAPIDAPI_KEY") && !!env("RAPIDAPI_AIRBNB_HOST"),
  async search(q, env) {
    const key = env("RAPIDAPI_KEY")!;
    const host = env("RAPIDAPI_AIRBNB_HOST")!;
    const H = { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host };
    try {
      const url = `https://${host}/search-location?location=${encodeURIComponent(q.location)}` +
        `&checkin=${q.checkIn}&checkout=${q.checkOut}&adults=${q.adults}&children=${q.children}&currency=${q.currency}`;
      const r = await timeoutFetch(url, { headers: H });
      if (!r.ok) return [];
      const j = await r.json();
      const rows = j?.results || j?.data || [];
      if (!Array.isArray(rows)) return [];
      return rows.map((row: Record<string, unknown>) => {
        const price = num(row.price ?? (row.pricing as Record<string, unknown>)?.rate ?? row.total);
        return normalize({
          source: "airbnb", sourceLabel: "Airbnb", kind: String(row.roomType || "Acomodação inteira"),
          id: "airbnb-" + (row.id ?? row.listingId ?? row.name),
          name: String(row.name || row.title || "Acomodação"),
          rating: num(row.rating) || null,
          reviews: num(row.reviewsCount ?? row.reviews),
          lat: num(row.lat) || null, lng: num(row.lng ?? row.lon) || null,
          pricePerNight: price,
          thumbnail: (row.images as string[])?.[0] || String(row.thumbnail || "") || null,
          url: String(row.url || ""),
        }, q);
      }).filter((s) => s.pricePerNight > 0);
    } catch (_) {
      return [];
    }
  },
};

// ============================================================
// OFICIAIS DE PARCEIRO (FUTURO) — esboço pronto para receber as chaves.
// Ficam DESLIGADOS até as credenciais existirem. Quando o programa for
// aprovado, basta implementar o `search` e definir as envs; nada mais muda.
// ============================================================
// Amadeus Self-Service — API OFICIAL de viagens, com tier GRÁTIS (sem site, sem
// cartão). Cadastro: https://developers.amadeus.com. Env: AMADEUS_CLIENT_ID,
// AMADEUS_CLIENT_SECRET (e, opcional, AMADEUS_HOSTNAME = test.api.amadeus.com
// [padrão] ou api.amadeus.com quando for para produção).
const amadeusOfficial: StayProvider = {
  id: "amadeus",
  label: "Amadeus",
  kind: "official",
  enabled: (env) => !!env("AMADEUS_CLIENT_ID") && !!env("AMADEUS_CLIENT_SECRET"),
  async search(q, env) {
    const host = env("AMADEUS_HOSTNAME") || "test.api.amadeus.com";
    // 1) token OAuth2 (client_credentials)
    const tk = await timeoutFetch(`https://${host}/v1/security/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env("AMADEUS_CLIENT_ID")!,
        client_secret: env("AMADEUS_CLIENT_SECRET")!,
      }).toString(),
    });
    if (!tk.ok) return [];
    const token = (await tk.json())?.access_token;
    if (!token) return [];
    const auth = { Authorization: `Bearer ${token}` };

    // 2) lista de hotéis: por geo (usa lat/lng do destino) ou, sem coords, pela cidade
    let ids: string[] = [];
    if (q.lat != null && q.lng != null) {
      const r = await timeoutFetch(
        `https://${host}/v1/reference-data/locations/hotels/by-geocode?latitude=${q.lat}&longitude=${q.lng}&radius=20&radiusUnit=KM&hotelSource=ALL`,
        { headers: auth });
      if (r.ok) ids = (((await r.json())?.data || []) as Array<Record<string, unknown>>).map((h) => String(h.hotelId)).filter(Boolean);
    }
    if (ids.length === 0) {
      const cs = await timeoutFetch(
        `https://${host}/v1/reference-data/locations/cities?keyword=${encodeURIComponent(q.location)}&max=1`,
        { headers: auth });
      const code = cs.ok ? (((await cs.json())?.data || [])[0]?.iataCode as string | undefined) : undefined;
      if (code) {
        const r = await timeoutFetch(
          `https://${host}/v1/reference-data/locations/hotels/by-city?cityCode=${code}&radius=20&radiusUnit=KM&hotelSource=ALL`,
          { headers: auth });
        if (r.ok) ids = (((await r.json())?.data || []) as Array<Record<string, unknown>>).map((h) => String(h.hotelId)).filter(Boolean);
      }
    }
    if (ids.length === 0) return [];

    // 3) ofertas de preço (limita a quantidade p/ caber numa chamada)
    const list = ids.slice(0, 25).join(",");
    const offers = await timeoutFetch(
      `https://${host}/v3/shopping/hotel-offers?hotelIds=${list}&adults=${q.adults}&checkInDate=${q.checkIn}&checkOutDate=${q.checkOut}&roomQuantity=${q.rooms}&currency=${q.currency}&bestRateOnly=true`,
      { headers: auth }, 12000);
    if (!offers.ok) return [];
    const data = ((await offers.json())?.data || []) as Array<Record<string, unknown>>;
    return data.map((d) => {
      const h = (d.hotel || {}) as Record<string, unknown>;
      const total = num(((d.offers as Array<Record<string, unknown>>)?.[0]?.price as Record<string, unknown>)?.total);
      return normalize({
        source: "amadeus", sourceLabel: "Amadeus", kind: "Hotel",
        id: "amadeus-" + (h.hotelId || h.name),
        name: String(h.name || "Hotel"),
        stars: num(h.rating),
        lat: num(h.latitude) || null, lng: num(h.longitude) || null,
        pricePerNight: total > 0 ? total / q.nights : 0,
        totalPrice: total,
        url: "https://www.google.com/travel/search?q=" + encodeURIComponent(String(h.name || "") + " " + q.location),
      }, q);
    }).filter((s) => s.pricePerNight > 0);
  },
};
const bookingDemandOfficial: StayProvider = {
  id: "booking-demand",
  label: "Booking.com Demand API (oficial)",
  kind: "official",
  enabled: (env) => !!env("BOOKING_DEMAND_KEY"),
  async search(_q, _env) {
    // TODO(futuro): chamar a Demand API oficial e mapear para normalize({ source:"booking", ... }).
    return [];
  },
};
const expediaOfficial: StayProvider = {
  id: "expedia",
  label: "Expedia Rapid (oficial)",
  kind: "official",
  enabled: (env) => !!env("EXPEDIA_API_KEY") && !!env("EXPEDIA_SHARED_SECRET"),
  async search(_q, _env) {
    // TODO(futuro): assinatura HMAC do EAN -> /v3/properties/availability. Mapear para normalize().
    return [];
  },
};

// ---- registro de conectores (ordem não importa: rodam em paralelo) ----
const PROVIDERS: StayProvider[] = [
  osm,                                             // OpenStreetMap (grátis, sem chave, ativo por padrão)
  hotellook, bookingRapid, airbnbRapid,            // agregadores com chave (grátis)
  amadeusOfficial, bookingDemandOfficial, expediaOfficial, // oficiais de parceiro (futuro)
];

// ============================================================
// DADOS DE EXEMPLO (quando não há chave / fontes vazias)
// ============================================================
const SOURCES = [
  { id: "booking", label: "Booking.com", kinds: ["Hotel", "Pousada", "Apart-hotel"], min: 210, max: 980 },
  { id: "airbnb", label: "Airbnb", kinds: ["Apartamento inteiro", "Quarto privativo", "Casa"], min: 160, max: 760 },
  { id: "hotels", label: "Hotels.com", kinds: ["Hotel", "Resort"], min: 260, max: 1200 },
  { id: "expedia", label: "Expedia", kinds: ["Hotel", "Apart-hotel"], min: 240, max: 1100 },
  { id: "hostelworld", label: "Hostelworld", kinds: ["Hostel", "Albergue"], min: 70, max: 260 },
];
const NAME_A = ["Mirante", "Recanto", "Solar", "Casa", "Vista", "Pátio", "Jardim", "Porto", "Estação", "Vila", "Refúgio", "Alto", "Brisa", "Aurora"];
const NAME_B = ["do Centro", "do Vale", "da Praça", "Boutique", "Premium", "Bela Vista", "& Spa", "Real", "do Mar", "Charme", "Plaza", "Histórico", "Palace"];
const HOODS = ["Centro", "Centro histórico", "Beira-mar", "Bairro alto", "Zona turística", "Perto do metrô", "Distrito comercial", "Orla"];
const FX: Record<string, number> = { BRL: 1, USD: 0.19, EUR: 0.17 };

function seeded(str: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5; let t = h >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoStays(q: SearchQuery): Stay[] {
  const rng = seeded(q.location + "|" + q.checkIn + "|" + q.adults);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const fx = FX[q.currency] ?? 1;
  const out: Stay[] = [];
  for (let i = 0; i < 14; i++) {
    const src = pick(SOURCES);
    const kind = pick(src.kinds);
    const perBRL = Math.round((src.min + rng() * (src.max - src.min)) / 5) * 5;
    const per = Math.max(1, Math.round(perBRL * fx));
    let rating = +(7 + rng() * 2.8).toFixed(1); if (rating > 9.9) rating = 9.9;
    let name = pick(NAME_A) + " " + pick(NAME_B);
    if (/hostel|albergue/i.test(kind)) name = pick(NAME_A) + " Hostel";
    out.push({
      id: src.id + "-" + i,
      source: src.id, sourceLabel: src.label, kind,
      name: name + " — " + q.location,
      stars: /hotel|resort|pousada|apart/i.test(kind) ? 2 + Math.floor(rng() * 4) : 0,
      rating, reviews: 25 + Math.floor(rng() * 3600),
      neighborhood: pick(HOODS),
      lat: null, lng: null,
      distanceKm: +(0.2 + rng() * 8).toFixed(1),
      pricePerNight: per, totalPrice: per * q.nights * q.rooms,
      currency: q.currency,
      freeCancellation: rng() > 0.45, breakfast: rng() > 0.55,
      thumbnail: null,
      url: siteSearchUrl(src.id, q),
    });
  }
  return out;
}

// ============================================================
// HTTP + ORQUESTRAÇÃO
// ============================================================
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

const readEnv: Env = (k) => Deno.env.get(k);

/** Garante os campos mínimos e calcula `nights` se não vier. */
function sanitize(raw: Record<string, unknown>): SearchQuery | null {
  const location = String(raw.location || raw.fullLocation || "").trim();
  const checkIn = String(raw.checkIn || "");
  const checkOut = String(raw.checkOut || "");
  if (!location || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return null;
  const nights = Math.max(1, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000) || 1);
  const intOr = (v: unknown, d: number, lo: number, hi: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  return {
    location,
    fullLocation: String(raw.fullLocation || location),
    lat: raw.lat != null ? Number(raw.lat) : null,
    lng: raw.lng != null ? Number(raw.lng) : null,
    checkIn, checkOut, nights,
    adults: intOr(raw.adults, 2, 1, 30),
    children: intOr(raw.children, 0, 0, 10),
    rooms: intOr(raw.rooms, 1, 1, 30),
    currency: ["BRL", "USD", "EUR", "GBP"].includes(String(raw.currency)) ? String(raw.currency) : "BRL",
    locale: String(raw.locale || "pt-BR"),
  };
}

/** Timeout por conector para um provider lento não travar tudo. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch(() => { clearTimeout(t); resolve(fallback); });
  });
}

/** Mescla, remove duplicatas óbvias e ordena por pontuação de recomendação. */
function rank(stays: Stay[]): Stay[] {
  const seen = new Set<string>();
  const unique = stays.filter((s) => {
    const key = s.source + "|" + s.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const score = (s: Stay) => (s.rating || 7) * 10 - s.pricePerNight / 40 + (s.freeCancellation ? 4 : 0);
  return unique.sort((a, b) => score(b) - score(a)).slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let raw: Record<string, unknown>;
  try { raw = await req.json(); }
  catch { return json(400, { error: "invalid json" }); }

  const q = sanitize(raw);
  if (!q) return json(400, { error: "query inválida: informe location, checkIn e checkOut (YYYY-MM-DD)" });

  const active = PROVIDERS.filter((p) => {
    try { return p.enabled(readEnv); } catch { return false; }
  });

  // Nenhuma fonte configurada -> exemplos (a interface nunca fica vazia).
  if (active.length === 0) {
    return json(200, {
      stays: demoStays(q), demo: true, providers: [],
      note: "Nenhuma API configurada — exibindo exemplos. Configure TRAVELPAYOUTS_TOKEN ou RAPIDAPI_KEY nos Secrets para dados reais.",
    });
  }

  const settled = await Promise.all(
    active.map((p) => withTimeout(p.search(q, readEnv).catch(() => [] as Stay[]), 14000, [] as Stay[])),
  );
  const merged = rank(settled.flat());

  // Conectores ativos porém sem retorno (ex.: cota estourada) -> cai no exemplo.
  if (merged.length === 0) {
    return json(200, {
      stays: demoStays(q), demo: true, providers: active.map((p) => p.id),
      note: "As fontes não retornaram resultados agora — exibindo exemplos.",
    });
  }

  return json(200, { stays: merged, demo: false, providers: active.map((p) => p.id) });
});
