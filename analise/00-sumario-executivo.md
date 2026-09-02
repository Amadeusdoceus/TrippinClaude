# Trippin — Sumário Executivo da Análise Comparativa

**Data:** 30/08/2026
**Escopo:** comparação técnica entre `Amadeusdoceus/TrippinClaude` (doravante **A**) e
`Amadeusdoceus/Trippin-Claude-Skills` (doravante **B**), com plano de ação para evoluir
**A** absorvendo o backend, a arquitetura e a segurança de **B**.

---

## 1. Conclusão em uma frase

**A** é um produto excelente rodando sobre uma persistência de brinquedo; **B** é uma
fundação de dados excelente rodando sob um produto incompleto. O caminho certo é
**manter 100% do front-end de A e transplantar a camada de dados de B para dentro dele** —
não o contrário, e nunca mais uma tentativa de "copiar o visual".

## 2. Por que a cópia de B falhou

A tentativa de reproduzir A dentro de B falhou por três motivos técnicos identificáveis
no código, não por falta de esforço:

| # | Causa | Evidência |
|---|-------|-----------|
| 1 | **B compila JSX em runtime** com `@babel/standalone` (`web/index.html:13`). A pré-compila o JSX e carrega só React UMD (`app/index.html:11-12`). Isso custa ~1–3 s de tela branca no primeiro carregamento em celular — exatamente o sintoma que A já tinha corrigido e documentado no CHANGELOG. | `B/web/index.html:13` vs `A/app/index.html:11-13` |
| 2 | **Reescrita do zero em vez de port.** B tem 4.488 linhas de front escritas a partir do backlog; A tem 4.172 linhas maduras com correções acumuladas em 68 commits (safe-area, contraste do dark mode, OCR sob demanda, IndexedDB para mídia). Refazer a UI a partir da especificação perde todas essas correções, que não estão na spec — estão no histórico. | `A/CHANGELOG.md` |
| 3 | **Rede de segurança desproporcional.** A tem 9 suítes Playwright (~1.900 linhas) cobrindo telas, rotas, custos, contraste e passagens. B tem 1 suíte de smoke (81 linhas). Refatorar sem cobertura equivalente gera regressões invisíveis. | `A/tests/e2e/` vs `B/tests/e2e/smoke.spec.js` |

## 3. O que cada projeto tem de melhor

**A entrega (manter integralmente):** interpretador de passagem e de hospedagem
(pdf.js + Tesseract sob demanda), cronograma mês/semana/dia com conflitos, mapa próprio
sem dependência do Google Maps, galeria com IndexedDB, 10 idiomas, dark mode com
contraste auditado, wrapper mobile Expo, suíte de testes real.

**B entrega (absorver integralmente):** 15 migrations versionadas, schema `private` para
funções `security definer`, `force row level security` em todas as tabelas, policies
otimizadas com `(select auth.uid())`, privilégio mínimo por coluna (`grant update (col)`),
RPCs que substituem policies inseguras, bucket privado com policy por prefixo de path,
tabela de erros de cliente sem `SELECT` para ninguém, notificações só populáveis por
trigger, sincronização offline com `updated_at` por trigger, e um CI que **bloqueia o
deploy se os testes falharem**.

## 4. Estado real do backend de A

O ponto mais importante do diagnóstico: **o backend de A existe mas não está ligado.**

- `app/src/trippin-api.js` (240 linhas) é carregado pelo `index.html`, mas
  `window.TrippinAPI` **nunca é referenciado** — 0 ocorrências no app.
- Todo o estado do produto vive em `localStorage['trippin_v1']` + IndexedDB.
- O único ponto que toca o servidor é o envio de convite por e-mail — e é justamente
  o ponto mais vulnerável do sistema (ver `02-auditoria-seguranca.md`, finding **C-02**).
- O schema em `backend/supabase/migrations/0001_init.sql` está **divergente** do cliente
  (`users` vs `profiles`, `photo_url`, `birth`), ou seja, mesmo que fosse ligado, quebraria.

Consequência prática: hoje o Trippin **não é multiusuário**. Duas pessoas na mesma viagem
veem dois estados independentes. Os "membros" são objetos locais e o usuário logado é a
string literal `'me'`.

## 5. Riscos de segurança que exigem ação imediata

Três achados de severidade crítica, detalhados em `02-auditoria-seguranca.md`:

- **C-01** — a senha do usuário é guardada em texto claro (base64) no dispositivo e
  **exibida de volta na tela de perfil**.
- **C-02** — a Edge Function `send-invite` não valida autenticação; qualquer pessoa com a
  chave pública (que está no repositório, por design) pode disparar e-mails arbitrários
  com a identidade visual do Trippin e gravar convites no banco via `service_role`.
- **C-03** — não há identidade no servidor; toda autorização é decorativa e contornável
  pelo DevTools.

## 6. Plano em uma linha

Seis fases, ~10 semanas, sem congelar o produto: **contenção (48 h) → schema → camada de
dados única → migração do dispositivo para a nuvem → multiusuário real → offline-first e
LGPD.** Detalhamento e critérios de aceite em `04-plano-de-acao.md`.

## 7. Entregáveis desta análise

| Arquivo | Conteúdo |
|---|---|
| `01-comparativo-tecnico.md` | Comparação detalhada, arquivo a arquivo |
| `02-auditoria-seguranca.md` | 16 achados com severidade, evidência e correção |
| `03-arquitetura-alvo.md` | Desenho do alvo e princípios inegociáveis |
| `04-plano-de-acao.md` | 6 fases, tarefas, critérios de aceite, estimativas |
| `05-mapa-migracao-dados.md` | De/para do estado local para o Postgres |
| `sql/0001` a `sql/0004` | Migrations prontas, adaptadas ao modelo de A |
| `exemplos/trippin-api.js` | Esqueleto da camada única de persistência |
| `exemplos/send-invite-hardened.ts` | Versão corrigida da Edge Function crítica |
