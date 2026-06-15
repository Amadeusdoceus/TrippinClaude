# 05 — Relatório de V&V (Verificação e Validação)

> Produzido pelo agente **V-V tester**. Valida o app V1 como sistema integrado.

## Escopo desta validação
Protótipo V1 roda 100% no cliente (sem backend), com persistência em `localStorage`. Os testes de banco e de produção abaixo descrevem o plano para quando o backend entrar; o que é validável no protótipo está marcado como executado.

## Testes E2E (executados no protótipo)
- **Onboarding completo** → idioma → perfil → home: ✅ passou (< 3 min).
- **Ciclo de viagem** → criar → abrir → adicionar atividade → anexar doc → ver no cronograma: ✅ passou.
- **Convite e integrantes** → adicionar e-mail → remover integrante: ✅ passou.
- **Offline** → recarregar sem rede mantém dados e arquivos marcados "offline": ✅ passou.

## Plano de testes para produção (quando houver backend)
### Banco de dados
- Migrations versionadas para: `users`, `trips`, `trip_members`, `activities`, `documents`, `expenses`, e tabelas de **logs por funcionalidade** (requisito da VN).
- Validar índices em `trip_id`, `user_id`, `date`; testar restore de backup antes de qualquer go-live.
- Verificar integridade: nenhuma atividade órfã sem viagem; admin sempre presente em cada viagem.

### Carga / Performance (alvos)
- API p95 < 200ms; carga inicial < 3s em 4G; bundle < 500KB gzip.
- Cenário: 200 usuários simultâneos por 10 min em endpoints de leitura de cronograma.

### Smoke test pós-deploy (< 5 min)
- `GET /health` → 200; login com usuário de teste; criar viagem; anexar doc; logs gravados; sem erro crítico nos 2 primeiros minutos.

### Segurança sistêmica
- Endpoints autenticados retornam 401 sem token e 403 para role incorreta.
- Rate limiting na busca de destinos/recomendações (custo Maps).
- CPF e dados pessoais tratados conforme LGPD; sem dados sensíveis em logs.

## Bugs encontrados
| ID | Severidade | Descrição | Status |
|----|-----------|-----------|--------|
| — | — | Nenhum bloqueante no protótipo | — |

## Recomendação
**Aprovado para release como protótipo/demo V1.** Para produção, executar o plano de banco/carga/segurança acima após implementação do backend.

---

## Post-mortem V1 — Cobertura E2E ampliada

Os bugs da V1 também passaram pela validação de sistema sem serem notados. O skill do V-V tester ganhou a **Suíte de Regressão E2E (VR1–VR6)**, executada em toda validação de release a partir de agora:

- **VR1** — percorrer 100% da navegação (caça a becos sem saída: ex. "Perfil").
- **VR2** — ciclo de vida completo (CRUD) de cada entidade, com persistência (ex. cronograma e Docs).
- **VR3** — conformidade visual de lado/posição em telas reais (ex. notificações à direita).
- **VR4** — integrações reais do dispositivo: câmera, galeria, sistema de arquivos, offline.
- **VR5** — sem seed/mock se passando por dado real; cada ação gera log em banco.
- **VR6** — matriz Android/iOS e múltiplas resoluções.

### Princípio incorporado
**Todo bug que escapou vira teste permanente.** A suíte só cresce — nada que já falhou volta a falhar silenciosamente.
