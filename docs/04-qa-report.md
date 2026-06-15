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

---

## Post-mortem V1 — Bugs que escaparam (e a correção do processo)

Cinco bugs reportados após a entrega deveriam ter sido captados pelo QA. Cada um foi convertido em categoria **permanente** da Suíte de Regressão do skill de QA (R1–R6), para não reaparecer:

| Bug reportado | Causa-raiz | Categoria de regressão criada |
|---------------|-----------|-------------------------------|
| Notificações abriam pela esquerda | Falta de conferência de lado/direção vs. spec | **R3** Fidelidade de lado/posição à spec |
| "Perfil" não abria | Controle de menu sem ação (beco sem saída) | **R1** Nenhum controle morto |
| Foto sem edição/câmera/galeria | Input de mídia não invocava recurso do dispositivo | **R4** Capacidades reais do dispositivo |
| Cronograma sem editar/excluir | Entidade só tinha Create/Read (faltou U e D) | **R2** CRUD completo por entidade |
| Docs sem upload real/remoção + anexos fixos | Mock se passando por funcionalidade | **R5** Sem dado falso passando por função |

### Reteste após correção (todos passando)
| ID | Verificação | Status |
|----|-------------|--------|
| R1 | Todos os itens do drawer navegam/agem | ✅ |
| R2 | Cronograma e Docs com Create/Read/Update/Delete | ✅ |
| R3 | Notificações abrem pela direita; ícones nos cantos corretos | ✅ |
| R4 | Foto abre câmera/galeria; Docs acessa arquivos do dispositivo | ✅ |
| R5 | Sem anexos pré-carregados; ação dirigida pelo usuário | ✅ |
| R6 | Edições persistem ao recarregar; avatar reflete a foto | ✅ |
