# 04 — Especificação de Mídia/Assets

> Deriva de `01-prd.md` (conceito, orçamento de performance) e `05-especificacao-interacao-animacao.md`
> (mecanismo de parallax em camadas). Define, por página, o tipo de mídia de fundo, duração,
> resolução, formato e critério de seleção — números aqui são referência fixa para
> `07-especificacao-tecnica-frontend.md` e `09-checklist-acessibilidade-performance.md`.

---

## 1. Formatos e orçamento (regra única para todo o site)

| Item | Especificação |
|---|---|
| **Vídeo** | WebM (VP9) primário + MP4 (H.264 High Profile) fallback, sem áudio |
| **Poster/frame estático** | AVIF primário + JPEG fallback — é o **elemento de LCP**; o vídeo só troca depois do primeiro paint (nunca bloqueia LCP, meta `01-prd.md` §6: Home ≤ 2.5s) |
| **Duração do loop** | 8–15s, loop **sem corte/salto visível** (última e primeira frame casam) |
| **Resolução-fonte mínima** | 1920×1080, com renditions responsivas: 1280×720 para mobile/rede lenta, 1920×1080 para desktop |
| **Peso após compressão** | 3–6MB por vídeo de herói (CRF agressivo) |
| **Carregamento** | Acima da dobra: `preload="metadata"`, troca para vídeo assim que o poster já pintou. Abaixo da dobra (teasers da Home, grades de turismo/eventos): `preload="none"` + lazy via `IntersectionObserver` |

## 2. Imagens de profundidade (parallax em camadas)

Para as páginas com efeito de parallax (`05-especificacao-interacao-animacao.md` §1), a arte não
pode ser uma foto plana — precisa vir **separada em 2–3 camadas** (fundo, meio, detalhe de
primeiro plano) com transparência entre elas, para que o deslocamento por velocidade diferente
funcione. Isso é um requisito de **produção de asset**, não só de código:

- Fundo: céu/horizonte/ambiente geral — sem elementos que "cortem" ao deslocar.
- Camada média: o elemento central do contexto (prédio do hotel, aeronave, ponto turístico).
- Primeiro plano (opcional): elemento de detalhe (nuvem, folhagem, silhueta) que reforça a
  profundidade.
- Formato de entrega: AVIF com canal alpha onde houver corte de camada; fallback PNG.

## 3. Especificação por página

| Página | Tipo de mídia | Critério de seleção por contexto |
|---|---|---|
| **`/` (Home)** | Vídeo em loop, 1920×1080, 10–15s | Avião sobrevoando nuvens ao pôr do sol — tom quente/dourado, sem elementos de marca de companhia aérea real visível |
| **`/hospedagem`** | Imagem em camadas (parallax) + thumbnails reais do `search-stays` na demo ao vivo | Ambiente 3D-like do tipo de acomodação (quarto/varanda/piscina) — luz natural, sem pessoas identificáveis em destaque |
| **`/voos`** | Vídeo em loop, 8–12s | Vista de janela de aeronave em voo (nuvens/asa visível) — reforça o contexto do interpretador de passagem |
| **`/turismo`** (grade) | Imagem estática por destino (sem parallax na grade, parallax só na página de detalhe) | Ponto turístico reconhecível do destino, boa luz, enquadramento vertical e horizontal disponíveis para grade responsiva |
| **`/turismo/[destino]`** | Imagem em camadas (parallax) | Mesmo ponto turístico do card, mas versão em camadas para a página de detalhe |
| **`/eventos`** | Imagem estática (não vídeo — eventos variam demais para um loop genérico) | Imagem do show/evento em si (palco, multidão de longe, sem rostos em destaque por privacidade) |
| **`/roteiros`** | Carrossel de imagens, uma por ponto turístico | Cada card do carrossel usa a mesma imagem do respectivo destino em `/turismo`, para consistência visual entre as duas páginas |
| **`/roteiros/[exemplo]`** | Carrossel de imagens (mesma lógica) | — |
| **`/como-funciona`** | Sem vídeo de herói — fundo estático `--sand`/`--deep` (gradiente sutil), por `06-design-system.md` §6 | Conteúdo denso/passo-a-passo não precisa de imersão total |
| **`/precos`** | Sem vídeo de herói (idem) | — |
| **`/politica-de-privacidade`** | Sem vídeo/imagem de fundo — layout de leitura puro | Copiado do `PrivacyPolicyScreen` do app; não é página de venda |
| **`/viagem/[codigo]`** *(candidata, ver `01-prd.md` §7.3)* | Imagem em camadas do primeiro destino da viagem, se a decisão resolver "em escopo" | Usa a mesma lógica de `/turismo/[destino]`, escolhida pelo destino real da viagem |

## 4. Sourcing e licenciamento (decisão pendente do PRD)

`01-prd.md` §7.2 registra que **não há orçamento confirmado para produção de vídeo original** na
v1. Recomendação concreta para não bloquear o desenvolvimento:

- **v1 — banco de imagens/vídeo licenciado:** Artgrid ou Envato Elements para os loops de vídeo
  (avião/nuvens, janela de aeronave); Pexels/Unsplash (uso comercial permitido, verificar licença
  item a item) para imagens estáticas de menor risco de marca (ex.: ambientes genéricos de
  hospedagem). Evitar clipes com marca/logo de companhia aérea ou hotel real visível.
- **v2 — produção original:** quando o tráfego do site justificar o investimento, substituir os
  loops de maior exposição (Home, `/voos`) por produção própria, alinhada 1:1 à identidade visual.

Este item **permanece pendente de decisão humana** (orçamento) — listado também no
`10-resumo-executivo.md`.

## 5. Critério de troca/atualização de mídia

- Vídeo/imagem por página é **um asset central versionado** (não gerado dinamicamente) — trocar a
  mídia de uma página é uma tarefa de conteúdo, não de deploy de código.
- Toda troca de mídia final refaz o teste de contraste de `09-checklist-acessibilidade-performance.md`
  §1 antes de publicar — os tokens de overlay foram fixados sem footage real, e o teste é
  obrigatório na primeira vez que a mídia definitiva entra.
