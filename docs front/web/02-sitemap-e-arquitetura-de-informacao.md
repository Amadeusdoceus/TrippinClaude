# 02 — Sitemap e Arquitetura de Informação

> Deriva do `01-prd.md`. Define a lista definitiva de páginas, hierarquia e navegação — **toda
> referência a nomes de página nos demais documentos deste conjunto usa exatamente os nomes daqui.**

---

## 1. Mapa de páginas

```
/ (Home)
├── /hospedagem                      → vitrine + demo ao vivo de busca de hospedagem
├── /voos                            → vitrine do interpretador de passagem
├── /turismo                         → destinos/localização em destaque
│   └── /turismo/[destino]           → página de um destino específico (ponto turístico)
├── /eventos                         → shows/eventos em destaque
├── /roteiros                        → conceito de roteiro com múltiplos destinos (carrossel)
│   └── /roteiros/[exemplo]          → um roteiro de exemplo detalhado
├── /como-funciona                   → passo a passo do fluxo do app
├── /precos                          → planos gratuito e Premium
├── /entrar                          → handoff/CTA para login-cadastro no app (ver doc 08)
├── /politica-de-privacidade         → reaproveita PrivacyPolicyScreen do app (mesmo texto-fonte)
├── /viagem/[codigo]                 → página pública de viagem compartilhada (CANDIDATA — ver PRD §7.3)
└── 404
```

## 2. Hierarquia e prioridade de navegação

| Nível | Itens | Onde aparece |
|---|---|---|
| **Primário (header fixo)** | Hospedagem, Voos, Turismo, Eventos, Roteiros, Preços | Nav superior, sempre visível, com transição para transparente→opaco conforme o scroll passa pelo herói (evita ilegibilidade sobre vídeo) |
| **CTA persistente** | "Criar viagem" (coral, botão primário) | Canto direito do header em todas as páginas |
| **Secundário (footer)** | Como funciona, Política de privacidade, Entrar, links de apps de viagem parceiros (reaproveita `TravelAppsScreen`) | Rodapé |
| **Contextual** | Breadcrumb dentro de `/turismo/[destino]` e `/roteiros/[exemplo]` | Abaixo do header, sobre o card glass, não sobre o vídeo puro |

## 3. Navegação entre páginas de conteúdo

- **Home → páginas de categoria:** 5 blocos de destaque (um por categoria: hospedagem, voos,
  turismo, eventos, roteiros), cada um com vídeo de fundo em miniatura (loop curto) que expande
  para a página de destino ao clicar — reforça a identidade "background contextual" antes mesmo
  de navegar.
- **Categoria → detalhe:** `/turismo` e `/roteiros` usam grade/carrossel de cards; cada card abre
  sua página `[slug]` dedicada.
- **Qualquer página → Home:** logo no header, sempre.
- **Qualquer página → app:** CTA "Criar viagem" e "Entrar" apontam para o app publicado em
  GitHub Pages (`https://amadeusdoceus.github.io/TrippinClaude/`, ver README) ou para a URL do
  site do app quando a decisão do doc 08 estiver fechada.

## 4. Correspondência página do site ↔ funcionalidade do app

Mantém as duas fontes de verdade alinhadas (nomenclatura idêntica onde possível):

| Página do site | Fonte de dados/UI no app | Arquivo/componente |
|---|---|---|
| `/hospedagem` | Busca de hospedagem | `app/buscar-hospedagem.html`, `search-stays` Edge Function |
| `/voos` | Interpretador de passagem | `app/interpretador-passagem.html` |
| `/turismo` | Aba Mapa da viagem | `MapTab` em `app/index.html` |
| `/eventos` | Aba Sugestões | `SuggestTab` em `app/index.html` |
| `/roteiros` | Aba Cronograma | `ScheduleTab` / `WeekView` em `app/index.html` |
| `/precos` | Modelo de monetização | `docs/08-rollout-money-steps.md` |
| `/politica-de-privacidade` | Tela de política | `PrivacyPolicyScreen` em `app/index.html` |
| `/entrar` | Login/Cadastro | `LoginScreen`, `ProfileScreen`, `TrippinAPI.auth` |
| `/viagem/[codigo]` *(candidata)* | Viagem + código de 12 dígitos | `TripScreen`, `TrippinAPI.trips` |

## 5. Estrutura de URL e i18n

Segue o mesmo critério do app (`docs/00` §8): estrutura de rotas pronta para os 10 idiomas via
prefixo (`/en/hospedagem`), mas conteúdo completo apenas em `pt-BR` (padrão, sem prefixo) e
`en-US` no lançamento — demais locais como stub que redireciona para `pt-BR` com aviso.

## 6. Estados de página (todas as rotas)

Reaproveita o vocabulário de estados de `docs/02-UXUI-spec.md` (`loading`/skeleton, vazio, erro):

- **Carregando mídia de fundo:** poster estático (frame do vídeo) enquanto o vídeo carrega —
  nunca tela em branco (mesma disciplina anti-"tela branca" do app, `docs/00` decisão #10).
- **Demo ao vivo indisponível** (`/hospedagem` sem chave configurada): mostra o modo `demo:true`
  do `search-stays`, com aviso "dados de exemplo" — mesmo comportamento do app.
- **404:** mantém o fundo animado da Home (avião/nuvens) com card glass de erro.
