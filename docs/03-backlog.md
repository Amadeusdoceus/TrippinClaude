# 03 — Backlog de Tarefas (Task-Creator)

> Produzido pelo agente **Task-Creator**. Decompõe a VN revisada + UX/UI em épicos e tarefas para a v1.

---

## Resumo

- Épicos: 9
- Tarefas v1 (escopo do protótipo entregue): 28 marcadas ✅
- Estimativa geral (produção React Native real): 10–14 semanas / 2 devs

## Ordem de Execução

```
E1 Fundação → E2 Onboarding → E3 Home → E4 Criar viagem
→ E5 Viagem ativa (shell + abas) → E6 Cronograma → E7 Docs+Inteligência
→ E8 Integrantes/Convites → E9 Notificações/Logs
```

---

## E1 — Fundação (P0)
- ✅ T1.1 Setup do app, design tokens, tema (cores/tipografia)
- ✅ T1.2 Infra de i18n (PT-BR e EN-US completos; demais idiomas stub)
- ✅ T1.3 Camada de persistência offline (estado + storage local)
- ✅ T1.4 Componentes base: AppBar, Drawer, Toast, Modal de confirmação, estados (loading/vazio/erro)

## E2 — Onboarding (P0)
- ✅ T2.1 Tela de seleção de idioma
- ✅ T2.2 Formulário de perfil com validação de e-mail
- ✅ T2.3 Campo de telefone com seletor de país
- ✅ T2.4 Geração de código de usuário (6 dígitos) + data de criação
- ✅ T2.5 Confirmação final → toast → Home

## E3 — Home (P0)
- ✅ T3.1 Card "Viagens ativas" (condicional, com prioridade)
- ✅ T3.2 Ação "Nova viagem"
- ✅ T3.3 Ação "Participar de uma viagem" (entrada por código)
- ✅ T3.4 Lista "Viagens anteriores"

## E4 — Criar viagem (P0)
- ✅ T4.1 Campos: nome do grupo, datas início/fim
- ✅ T4.2 Busca de destino por aproximação (≥3 letras) + data por destino
- ✅ T4.3 Múltiplos destinos ("adicionar destino")
- ✅ T4.4 Botão "Criar viagem" (toast 2s → edição) + "Excluir edição" (pop-up 2 estados)
- ✅ T4.5 Código de viagem (12 dígitos alfanumérico) copiável + criador vira admin

## E5 — Viagem ativa: shell (P0)
- ✅ T5.1 Header da viagem + código copiável
- ✅ T5.2 Navegação por abas: Cronograma, Mapa, Docs, Galeria, Sugestões, Integrantes

## E6 — Cronograma (P0)
- ✅ T6.1 Visões mês/semana/dia + navegação (setas e rolagem)
- ✅ T6.2 Inclusão de atividade em faixa de tempo
- ✅ T6.3 Conflitos visíveis + "ingressar" na atividade quando há conflito
- ⬜ T6.4 Avaliação da atividade (v1.1)

## E7 — Docs + Inteligência (P0 — must-have)
- ✅ T7.1 Abas internas: Passagens / Estadias / Eventos / Extras (+ sub-abas)
- ✅ T7.2 Anexar documento (upload local)
- ✅ T7.3 Leitura do anexo → proposta de bloco no cronograma
- ✅ T7.4 Detecção de conflito anexo × cronograma + alerta com proposta
- ✅ T7.5 Selo "disponível offline"

## E8 — Integrantes e Convites (P0/P1)
- ✅ T8.1 Lista de integrantes + identificação de admin(s)
- ✅ T8.2 Convidar por e-mail (validação) → simulação de envio
- ✅ T8.3 Admin remove/inclui integrantes
- ⬜ T8.4 Aprovar pedidos de ingresso por código (v1.1)

## E9 — Transversais (P1)
- ✅ T9.1 Painel de notificações lateral acionável
- ✅ T9.2 Drawer lateral de navegação (via ícone de perfil)
- ✅ T9.3 Galeria por cidade/dia
- ✅ T9.4 Sugestões — Recomendações Gerais (mock Maps)
- ✅ T9.5 Despesas com divisão + notificação ao impactado
- ✅ T9.6 Logs de ação em "banco" (store) por funcionalidade

---

## Riscos de Planejamento

- A inteligência de Docs (E7) é o maior valor **e** o maior risco. v1 entrega com parser simulado e confirmação humana; produção exigirá OCR/LLM.
- Mapa em tempo real (cores quentes/frias do percurso) movido para v2 conforme VN revisada.
- Tradução dos 10 idiomas: v1 entrega infra + 2 idiomas; restante é trabalho de localização contínuo.

## Tarefas de QA / V&V associadas (ver agentes QA e V-V tester)

- Cada épico tem critérios de aceite verificáveis (campos validados, conflitos detectados, código gerado no formato correto, offline acessível).
