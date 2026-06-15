# 02 — Especificação UX/UI (UX-UI-Specialist)

> Produzido pelo agente **UX-UI-Specialist** a partir da VN revisada. Traduz o negócio em experiência: fluxos, telas, estados e identidade visual.

---

## Princípios de Design

- **Simplicidade radical** — cada tela tem um trabalho principal; o resto é secundário.
- **Avançar/voltar sempre disponível** — todo fluxo tem navegação clara para frente e para trás (requisito da VN).
- **Feedback imediato** — pop-ups de confirmação, toasts, estados de loading e vazio explícitos.
- **Offline-first** — o que foi baixado fica acessível; a UI indica o que está disponível offline.
- **Conflito é visível, não bloqueante** — no cronograma, conflitos aparecem lado a lado; o usuário escolhe.

## Identidade Visual

Direção: evitar o visual genérico. Trippin evoca **jornada, horizonte e fuso** — um app de movimento.

**Paleta**
| Token | Hex | Uso |
|-------|-----|-----|
| `--ink` | `#14213D` | Texto principal, navegação |
| `--deep` | `#1A2B4A` | Fundos escuros, header de viagem |
| `--coral` | `#FF6B5C` | Ação primária (criar, confirmar) |
| `--lagoon` | `#2DB5A3` | Secundário, status confirmado |
| `--sand` | `#F7F5F0` | Fundo de tela |
| `--amber` | `#F4A259` | Alertas/conflitos |

**Tipografia**
- Display/wordmark: **Sora** (geométrica com caráter, usada com restrição).
- Corpo/UI: **Inter** (legibilidade alta em telas pequenas).
- Dados/código (ex.: código da viagem): **JetBrains Mono**.

**Assinatura visual:** o "passaporte" — cards de viagem com um carimbo de status no canto e o código monoespaçado, evocando um documento de viagem.

## Componentes Globais

- **AppBar** — ícone de perfil (abre drawer) à esquerda, título central, sino de notificações à direita.
- **Drawer lateral** — navegação entre seções, surge pelo ícone de perfil (requisito da VN).
- **Painel de notificações** — abre lateralmente, lista acionável.
- **Botões** — primário (coral), secundário (contorno), destrutivo (vermelho discreto).
- **Pop-up de confirmação** — usado em criar/excluir, com 2 estados (pergunta → confirmação).
- **Toast** — confirmações rápidas (ex.: "Viagem criada", 2s).
- **Estados** — loading (skeleton), vazio (convite à ação), erro (o que houve + como resolver).

## Fluxos Detalhados

### Fluxo 1 — Onboarding
```
[Seleção de idioma] → [Criar perfil] → [Confirmar dados] → toast → [Home]
```
- Idioma: lista dos 10 idiomas; seleção define toda a UI.
- Perfil: Nome, Sobrenome, Nascimento, CPF (opcional v1), E-mail (validado), Telefone (país + número), foto opcional.
- Ao confirmar: gera código de 6 dígitos + data de criação.

### Fluxo 2 — Home
Mostra, nesta ordem de prioridade:
1. **Viagens ativas** (só aparece se houver) — destaque.
2. **Nova viagem** — botão primário.
3. **Participar de uma viagem** — entrada por código.
4. **Viagens anteriores** — histórico.

### Fluxo 3 — Nova viagem
```
[Nome do grupo] → [Datas início/fim] → [Adicionar destino(s) com busca ≥3 letras + data]
→ canto inf. direito "Criar viagem" (toast 2s → tela de edição)
→ canto inf. esquerdo "Excluir edição" (pop-up confirma → confirma exclusão / volta à edição)
```
- Gera código de 12 dígitos (alfanumérico), copiável, discreto abaixo do nome.
- Criador vira administrador.

### Fluxo 4 — Viagem ativa (abas)
| Aba | Trabalho principal |
|-----|--------------------|
| **Cronograma** | Calendário mês/semana/dia; adicionar atividades; conflitos visíveis; ingressar em atividade |
| **Mapa** | Visão resumida das cidades + (v2) percurso |
| **Docs** | Passagens / Estadias / Eventos / Extras com sub-abas; **anexo alimenta o cronograma** |
| **Galeria** | Fotos por cidade e dia |
| **Sugestões** | Recomendações Gerais (Maps) e Trippin (v2) |
| **Integrantes** | Lista, admins, convidar por e-mail, remover |

### Fluxo 5 — Inteligência de Docs (must-have)
```
[Anexar documento na aba Docs] → app lê metadados (origem, destino, data, hora)
→ propõe bloco no Cronograma → usuário confirma
→ se conflitar com bloco existente: alerta de conflito com proposta de ajuste
```

## Estados e Feedbacks

- **Loading:** skeleton dos cards.
- **Vazio (home sem viagens):** "Nenhuma viagem ainda. Crie a primeira."
- **Erro de e-mail inválido:** mensagem inline no campo.
- **Conflito de cronograma:** faixa âmbar com "Há conflito com a passagem de [data]. Ajustar?"
- **Offline:** selo "Disponível offline" nos arquivos baixados.

## Responsividade

Mobile-first (alvo principal: 375px). Layout de coluna única, navegação por abas inferiores na viagem, drawer para seções globais. Em telas largas (≥1024px), o conteúdo é centralizado com largura máxima legível — o app nasce mobile.
