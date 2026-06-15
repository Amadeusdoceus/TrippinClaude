# 01 — Visão de Negócio Revisada (VN-Reviewer)

> Documento produzido pelo agente **VN-Reviewer** a partir da VN original `VN_-_Trippin_V1_-_Amadeu_14_06_26.docx`.

---

## Problema

Viajantes em grupo lidam hoje com informações fragmentadas em múltiplos apps e canais: passagens no e-mail, reservas no Booking/Airbnb, ingressos em PDFs soltos, despesas no Splitwise, roteiro no WhatsApp e localização no Google Maps. Não existe um lugar único que reúna tudo, funcione **offline** e mantenha o grupo sincronizado.

## Usuários-Alvo

- **Organizador da viagem** — cria o grupo, convida pessoas, administra integrantes e finaliza a viagem.
- **Integrante da viagem** — participa, consulta o roteiro, anexa documentos, registra despesas e fotos.
- **Convidado externo** — recebe convite por e-mail, instala o app e ingressa na viagem.

Perfil: pessoas com familiaridade média com apps de viagem (Maps, Airbnb), que valorizam simplicidade e querem reduzir o esforço de organização.

## Proposta de Valor

Um app que **centraliza toda a viagem** (voos, estadias, eventos, ingressos, despesas, fotos, roteiro e mapa) e que **lê os documentos anexados para preencher o cronograma automaticamente** — transformando um PDF de passagem em blocos de agenda, alertando sobre conflitos e mantendo tudo disponível offline.

## Funcionalidades Principais (MVP v1)

Priorizadas pelo valor central e pela viabilidade:

1. **Onboarding** — seleção de idioma + criação de perfil (com código de 6 dígitos).
2. **Home** — viagens ativas, criar viagem, participar de viagem, viagens anteriores.
3. **Criar viagem** — nome, datas, múltiplos destinos com busca, código de 12 dígitos.
4. **Viagem ativa** com abas: Cronograma, Mapa, Docs, Galeria, Sugestões, Integrantes.
5. **Cronograma** estilo calendário (mês/semana/dia), inclusão de atividades, conflitos visíveis.
6. **Docs com inteligência (must-have)** — leitura do anexo → preenchimento do cronograma + alerta de conflito.
7. **Integrantes** — administração, convite por e-mail, múltiplos admins.
8. **Notificações** + **barra lateral de navegação**.
9. **Despesas** com divisão e notificação ao impactado.

## Fora do Escopo (v1)

- Rastreamento de localização em tempo real no mapa (barra de calor do percurso) → **v2** (alto custo/privacidade).
- "Recomendações Trippin" baseadas em dados agregados da base → **v2** (depende de massa de usuários).
- Sub-abas infinitas de Docs (botão "+" multinível) → v1 entrega os níveis fixos especificados.
- Tradução completa para os 10 idiomas → v1 entrega a infraestrutura i18n + PT-BR e EN-US completos; demais idiomas como stubs.
- Integração nativa de deslocamento via Google Directions API → v1 simula o cálculo de tempo.

## Critérios de Sucesso

- Um grupo consegue criar uma viagem, convidar e organizar o roteiro **sem sair do app**.
- Anexar um documento de passagem **popula o cronograma** sem digitação manual.
- Conteúdo (ingressos/arquivos) acessível **offline**.
- Onboarding completo em **menos de 3 minutos**.

## Riscos e Dependências

| Risco | Impacto | Mitigação v1 |
|-------|---------|--------------|
| Leitura/parsing de documentos heterogêneos | Alto | v1 usa parser com padrões conhecidos + confirmação do usuário antes de gravar |
| Dependência de Google Maps/Places (custo por chamada) | Médio | Cache agressivo, busca só a partir de 3 letras, debounce |
| Sincronização offline ↔ online com conflitos | Alto | Estratégia last-write-wins + log de auditoria por ação |
| Privacidade (CPF, localização) | Alto | CPF opcional de verificação, sem rastreio de localização na v1 |

## Perguntas em Aberto (para decisão do negócio)

1. CPF é realmente obrigatório? Cria fricção alta e implica LGPD. **Sugestão: opcional na v1.**
2. A "inteligência" de leitura de docs usará OCR/LLM? Define custo de infra. **Sugestão: parser estruturado + fallback manual na v1.**
3. Rastreio de localização em tempo real justifica o custo de privacidade/bateria na v1? **Sugestão: adiar para v2.**
