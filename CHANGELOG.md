# Changelog

Todas as mudanças relevantes do Trippin. Formato baseado em commits reais do repositório.

## [v1.0.0] — 2026-06-20

Primeira versão consolidada: web + backend + mobile num único repositório git, corrigida e validada (`validate-code` OK + 23/23 testes Playwright passando).

### App web (SPA — `app/`)
- Fluxo completo: seleção de idioma → cadastro → Home → criação de viagem → Cronograma → Membros/convites.
- Mapa interativo com Google Maps inline (substitui o SVG estático); carrega mesmo sem destinos, centralizado no Brasil.
- Galeria por álbuns; edição/exclusão de cidades no Mapa.
- Interpretador de Hospedagem e Passagem (PDF + imagem/OCR sob demanda), anexo via upload ou câmera.
- Convite de membros por e-mail (Edge Function, com fallback `mailto:`).
- Modo escuro com contraste corrigido em toda a interface.
- Correções de "tela em branco" (pré-compilação de JSX, sem Babel em runtime; carregamento sob demanda de pdf.js/Tesseract).
- Ajustes mobile-web: safe area (`viewport-fit=cover` + `env(safe-area-inset)`), largura total, modais com `backdrop-filter`.

### Backend (`backend/`)
- Supabase: schema, RLS e Edge Functions (convites: send/accept/request/approve).
- Migração de envio de e-mail de Resend para Brevo.

### Mobile (`mobile/`)
- App Expo (WebView wrapper) apontando para o app web publicado.
- Compatibilidade com Expo SDK 52 (react-native 0.76.9, expo-asset).
- WebView abaixo da status bar via `SafeAreaView` (sem corte no topo).

### Infra e qualidade
- Fluxo de revisão: `scripts/validate-code.js` (balanceamento/sintaxe do `index.html`) + suíte Playwright (`tests/e2e/`).
- GitHub Actions: deploy de `app/` para o GitHub Pages.
- **Consolidação do repositório:** projeto movido do OneDrive para `C:\GitHub\Claude Repo\App Trippin Claude` (git fora de pasta sincronizada); `mobile/` integrado via `git subtree` preservando o histórico.
- Correção de TLS local: Git passa a usar o backend `schannel` (repositório de certificados do Windows) para conviver com a interceptação do antivírus.
