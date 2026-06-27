# Busca de hospedagem — arquitetura e ativação

Feature: comparar hotéis, pousadas e aluguéis de temporada de vários sites
(Booking, Airbnb, Hotels.com, Expedia, Hostelworld…) numa interface só, buscando
qualquer lugar do mundo por aproximação.

Estratégia combinada: **começar com APIs de agregadores (plano gratuito)** e deixar
a estrutura pronta para, no futuro, plugar as **APIs oficiais de parceiro** sem
reescrever nada.

## Peças

| Camada | Arquivo | Papel |
| --- | --- | --- |
| Interface | [`app/buscar-hospedagem.html`](../app/buscar-hospedagem.html) | Formulário (destino com autocomplete, datas, hóspedes, quartos, moeda) + lista de resultados. Página standalone, no estilo do interpretador de passagem. |
| Motor (arquivo único) | [`backend/supabase/functions/search-stays/index.ts`](../backend/supabase/functions/search-stays/index.ts) | Recebe a query, roda os conectores em paralelo, normaliza/mescla e devolve a lista. Inclui os conectores (agregadores ativos + slots oficiais futuros) **e** os dados de exemplo, tudo num arquivo só — assim dá para publicar colando no painel do Supabase, sem CLI. |

## Como funciona hoje (sem nenhuma chave)

Por padrão, **sem cadastro nenhum**, o motor já lista **hospedagens reais** do destino
via **OpenStreetMap/Overpass** (conector `osm`, ligado por padrão) — nome, bairro,
categoria e link para reservar, no mundo todo. Usa as coordenadas do destino ou, sem
elas, geocodifica pelo Nominatim. O que esse conector **não** traz é **preço ao vivo**:
o card mostra "Ver preço no site" (`priceUnknown:true`) e o botão **“Ver no site”** leva
à reserva. Se o OSM não achar nada (ou estiver fora do ar), cai em dados de exemplo
(`demo:true`). Para desligar: secret `OSM_DISABLED=1`.

O autocomplete do destino também usa o **Nominatim (OpenStreetMap)** — grátis e sem chave.

> Estado das fontes COM preço (jun/2026): a API de cache do Hotellook/Travelpayouts
> retorna 404 para contas novas, e o portal self-service do Amadeus está sendo
> descontinuado (17/07/2026). O caminho prático para **preço ao vivo** é o
> **Booking via RapidAPI** (conector pronto, precisa de `RAPIDAPI_KEY`).

## Ligar dados reais (agregadores gratuitos)

Os preços/fotos reais passam a aparecer dentro do app assim que UMA chave for
adicionada aos Secrets do Supabase. Nada no código muda.

1. **Hotellook / Travelpayouts** (recomendado — agrega muitos sites de uma vez)
   - Crie um token grátis em <https://www.travelpayouts.com>.
   - `supabase secrets set TRAVELPAYOUTS_TOKEN=seu_token`
   - (opcional, para links de afiliado) `TRAVELPAYOUTS_MARKER=seu_marker`
2. **Booking.com via RapidAPI** (plano grátis)
   - Assine “Booking com” no RapidAPI e copie a chave.
   - `supabase secrets set RAPIDAPI_KEY=sua_chave`
   - (opcional) `RAPIDAPI_BOOKING_HOST=booking-com15.p.rapidapi.com`
3. **Airbnb via RapidAPI** (opcional; o Airbnb não tem API oficial)
   - `supabase secrets set RAPIDAPI_AIRBNB_HOST=airbnb13.p.rapidapi.com` (usa a mesma `RAPIDAPI_KEY`).

Publicar o motor — duas opções:

- **Pelo painel (sem CLI):** Dashboard do Supabase → **Edge Functions** → criar função `search-stays` → colar o conteúdo de `index.ts` → **Deploy**.
- **Pelo CLI:** `supabase functions deploy search-stays --project-ref <ref>` (de dentro de `backend/`). Instalar no Windows via Scoop: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` e `scoop install supabase`.

Sem chave alguma, a função responde com `demo: true` e dados de exemplo.

## Futuro: APIs oficiais de parceiro

Já existem os “slots” desligados em `providers.ts` (`amadeus`, `booking-demand`,
`expedia`). Quando o programa de parceiro for aprovado:

1. Implemente o `search()` do conector correspondente.
2. Defina as envs dele (ex.: `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET`).

Ele liga sozinho (o `enabled(env)` passa a retornar `true`) e entra no mesmo fluxo
de mescla — sem tocar na interface nem no `index.ts`.

## Adicionar um novo conector

1. Crie um objeto `StayProvider` na seção de conectores do `index.ts` (use os existentes de modelo).
2. `enabled(env)` deve retornar `true` só quando a chave da fonte existir.
3. Mapeie a resposta com `normalize({ source, sourceLabel, name, ... }, q)`.
4. Inclua-o no array `PROVIDERS`. Pronto.

## Contrato de dados (`Stay`)

`source`, `sourceLabel`, `kind`, `name`, `stars`, `rating` (0–10), `reviews`,
`neighborhood`, `lat`/`lng`, `distanceKm`, `pricePerNight`, `totalPrice`,
`currency`, `freeCancellation`, `breakfast`, `thumbnail`, `url`.
