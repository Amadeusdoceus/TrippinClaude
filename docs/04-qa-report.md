# 04 — Relatório de QA

> Produzido pelo agente **QA**. Revisão de código e validação funcional do app V1.

## Revisão de Código

✅ **Aprovado** — pontos positivos
- Componentes pequenos e com responsabilidade única (uma tab = um componente).
- Estado centralizado no `App` com persistência offline (`localStorage`), coerente com o requisito offline-first.
- Validação de e-mail por regex aplicada no perfil e no convite de integrantes.
- Códigos gerados nos formatos corretos: usuário 6 dígitos numéricos, viagem 12 dígitos alfanuméricos.
- Detecção de conflito de cronograma por sobreposição de horário, com UI âmbar não-bloqueante (conforme VN).

🟡 **Importante (corrigir antes de produção)**
- A "inteligência" de Docs é simulada (parser fixo). Para produção, integrar OCR/LLM com confirmação humana.
- `localStorage` é suficiente para protótipo, mas produção exige backend com sincronização e logs em banco.
- i18n entrega PT-BR e EN-US completos; demais idiomas usam fallback EN-US.

🔵 **Melhoria (backlog)**
- Avaliação de atividade (T6.4) e aprovação de pedidos por código (T8.4) ficam para v1.1.
- Acessibilidade: adicionar foco visível por teclado e `aria-label` nos ícones antes do GA.

## Casos de Teste Executados (manual)

| ID | Cenário | Resultado Esperado | Status |
|----|---------|-------------------|--------|
| TC-001 | Selecionar idioma e criar perfil válido | Vai para Home, gera código de 6 dígitos | ✅ |
| TC-002 | E-mail inválido no perfil | Mensagem inline, bloqueia confirmação | ✅ |
| TC-003 | Criar viagem com nome + datas + destino | Toast 2s → tela da viagem, código 12 dígitos | ✅ |
| TC-004 | Excluir edição da nova viagem | Pop-up confirma → confirma exclusão → volta à Home | ✅ |
| TC-005 | Buscar destino com <3 letras | Nenhum resultado; ≥3 letras retorna lista | ✅ |
| TC-006 | Anexar passagem (Docs) | Cria bloco no Cronograma marcado "auto" | ✅ |
| TC-007 | Anexar passagem que sobrepõe bloco manual | Alerta de conflito com proposta de ajuste | ✅ |
| TC-008 | Ingressar em atividade conflitante | Botão alterna Ingressar/Participando | ✅ |
| TC-009 | Convidar integrante por e-mail | Validação + toast de convite enviado | ✅ |
| TC-010 | Copiar código da viagem | Copia para a área de transferência | ✅ |
| TC-011 | Abrir drawer e notificações | Painéis laterais abrem/fecham | ✅ |
| TC-012 | Recarregar a página | Estado persiste (offline) | ✅ |

## Veredito
**Aprovado como protótipo V1** com ressalvas conhecidas (inteligência simulada, backend pendente). Pronto para revisão de V&V.
