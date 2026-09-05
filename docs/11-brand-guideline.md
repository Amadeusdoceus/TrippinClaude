# Wayfarer — Brand Guideline

## 01 — Referências rápidas
- Vidro escuro: painéis translúcidos com blur sobre foto real
- Luz dourada: golden hour predominante
- Dados discretos: HUD de voo, coordenadas, ícones finos
- Cantos suaves: radius generoso, nunca quadrado

## 02 — Brand ideia
**Conceito: "Cockpit do viajante"** — painel de piloto particular com a delicadeza de um hotel de luxo. Três camadas em toda tela: fotografia real do destino + vidro translúcido + tipografia editorial. Tom de voz: concierge, direto, hospitaleiro.

## 03 — Logo system
- Wordmark serifado "Wayfarer" (fundo escuro e fundo claro)
- Símbolo: bússola geométrica, uso isolado só em espaços pequenos (favicon/ícone de app)

## 04 — Logo color rule
| Fundo | Versão | Cor |
|---|---|---|
| Navy/foto escura | Wordmark + símbolo | Dourado #C9A66B ou Creme #F3EEE3 |
| Foto/vidro claro | Wordmark | Navy #0B1620 sólido |
| Contraste médio | Símbolo + placa de vidro | Dourado sobre glass 8% |

**Evitar:** logo colorido (sunset/lagoon), sombra ou contorno grosso.

## 05 — Cores

**Principal**
- Navy Noturno `#0B1620`
- Dourado Concierge `#C9A66B`
- Creme Papel `#F3EEE3`
- Navy Elevado `#101F2C`

**Secundária**
- Sunset (Acrópole) `#E4855A`
- Lagoon (praia/voo) `#4FA6A0`
- Dune (Alpes/Akina) `#A98BC4`

**Suporte**
- Cinza Névoa `#9FB0BC`
- Glass painel `#FFFFFF 6–10%`
- Borda/linha `#2E4A57`
- Texto sobre dourado `#1B140C`

## 06 — Tipografia
- **Display:** Fraunces (alternativas pagas: Canela, Reckless, GT Sectra)
- **Interface:** Inter (alternativas: Söhne, General Sans, Neue Haas)

| Nível | Tamanho | Peso |
|---|---|---|
| H1 / Hero | 44px | 500 |
| H2 / Seção | 30px | 500 |
| H3 / Card | 20px | 500 |
| Corpo | 15px | 400 |
| Legenda/dado | 12px | 500 |

## 07 — Approved pairing matrix
| Fundo | Texto | Acento | Uso |
|---|---|---|---|
| Navy | Creme | Dourado | Telas principais, headers |
| Navy elevado | Creme | Lagoon | Cards de praia/natureza |
| Foto pôr do sol | Creme/glass | Sunset | Cards de patrimônio histórico |
| Foto neve/montanha | Creme/glass | Dune | Cards de hospedagem/hotel |
| Creme (modo claro) | Navy | Dourado | E-mail, PDF, apresentações |

## 08 — Cores que não usar
- Azul royal saturado / ciano neon
- Vermelho vivo como cor de marca
- Verde-limão / verde-shopping
- Preto puro `#000000` (usar navy `#0B1620`)
- Branco puro `#FFFFFF` em grandes áreas (usar creme `#F3EEE3`)

Alertas: erro = Sunset escurecido `#C96A42`; sucesso = Lagoon `#4FA6A0`.

## 09 — Padrão de layout por cenário
- **Tela de destino:** foto full-bleed → busca no topo → card central "Expand" → carrossel lateral
- **Página de hotel:** hero com nome sobreposto → bloco "Sobre" (texto + foto) → bloco de reserva em grupo → busca fixa no rodapé
- **Painel de voo/trajeto:** paisagem em tela cheia → HUD nos 4 cantos → destino em tipografia grande → barra de progresso

## 10 — IA generativa

**Fazer:** fotografia realista, luz golden hour/azul-noite, enquadramentos amplos, profundidade de campo real, UI como vidro fosco, pessoas em planos abertos sem rosto em destaque.

**Não fazer:** ilustração 3D genérica/clipart, HDR exagerado, texto ou logo inventado na imagem, rostos em close, marca d'água ou molduras.

## 11 — Componentes
- **Botões:** primário dourado sólido (texto navy), secundário contorno vidro (texto creme), sempre formato pílula
- **Inputs:** fundo vidro translúcido, borda sutil, ícone à esquerda
- **Cards de destino:** imagem + título serifado + localização em dourado abaixo

## 12 — Estética
- **Border-radius:** S 6px (chips) · M 12px (cards/inputs) · L 20px (modais/hero) · Pílula 999px (botões)
- **Sombra:** única, `0 20px 50px rgba(0,0,0,.35)` — nunca múltiplas ou neon
- **Blur de vidro:** backdrop-filter 12–16px, fundo branco 6–10%, borda 12%
- **Espaçamento (8pt):** 8 · 16 · 24 · 40 · 64
