# Trippin — Análise Comparativa e Plano de Arquitetura

Documentação produzida em **30/08/2026** a partir da leitura completa do código de:

- **A** — `github.com/Amadeusdoceus/TrippinClaude` (branch `master`, 68 commits)
- **B** — `github.com/Amadeusdoceus/Trippin-Claude-Skills` (branch `main`)

**Objetivo:** evoluir o backend, a arquitetura e a segurança de **A**, absorvendo o que
**B** fez melhor, **sem tocar** no front-end, na inteligência, na navegabilidade e nas
funções de **A**.

---

## Leia nesta ordem

| # | Arquivo | Para quem |
|---|---|---|
| 1 | [`00-sumario-executivo.md`](00-sumario-executivo.md) | Decisão. 5 minutos de leitura. |
| 2 | [`02-auditoria-seguranca.md`](02-auditoria-seguranca.md) | **Urgente.** 3 achados críticos exigem ação em 48 h. |
| 3 | [`01-comparativo-tecnico.md`](01-comparativo-tecnico.md) | Por que B falhou e o que cada projeto tem de melhor. |
| 4 | [`03-arquitetura-alvo.md`](03-arquitetura-alvo.md) | O desenho alvo e as decisões de arquitetura. |
| 5 | [`04-plano-de-acao.md`](04-plano-de-acao.md) | 6 fases, ~10 semanas, com critérios de aceite. |
| 6 | [`05-mapa-migracao-dados.md`](05-mapa-migracao-dados.md) | De/para do estado local para o Postgres. |
| 7 | [`06-pontas-soltas.md`](06-pontas-soltas.md) | **Atualizado durante a execução.** Ações manuais pendentes, desvios deliberados do plano e escopo adiado — revisar antes de fechar. |

## Código pronto para usar

```
sql/
  0001_core_schema.sql     tabelas, índices, CHECKs, triggers
  0002_rls_policies.sql    RLS forçado, policies por operação, grant por coluna
  0003_rpc.sql             join_trip_by_code, get_trip_member_profiles, LGPD
  0004_storage.sql         buckets privados, policies por prefixo, retenção
exemplos/
  trippin-api.js           esqueleto da camada única de persistência
  send-invite-hardened.ts  correção da Edge Function crítica (finding C-02)
```

Aplicar as migrations **em staging primeiro**, na ordem 0001 → 0004.

---

## As três conclusões

1. **O front-end de A é o produto — não se mexe nele.** A tentativa de recriá-lo em B
   falhou principalmente porque B compila JSX em runtime (Babel standalone), o que traz
   de volta a tela branca que A já tinha corrigido.

2. **O backend de A existe mas não está ligado.** `trippin-api.js` tem zero referências no
   app; tudo vive em localStorage. O Trippin hoje não é multiusuário: dois integrantes da
   mesma viagem têm bancos independentes que nunca convergem.

3. **Três falhas críticas de segurança precisam de ação imediata:** senha guardada em
   texto claro e exibida na tela; Edge Function `send-invite` sem autenticação nenhuma
   (relay de e-mail aberto); e ausência total de identidade no servidor.

## Comece por aqui (Fase 0 — 2 dias)

1. Apagar `passwordDisplay` do código e do estado salvo.
2. Publicar `exemplos/send-invite-hardened.ts` e **rotacionar a chave Brevo**.
3. Trocar `.github/workflows/deploy.yml` pelo workflow com gate de teste.
4. CORS por allowlist e remoção do e-mail pessoal embutido.
