# 07 — Revisão de qualidade & Acesso ao banco

Este documento define **o processo obrigatório de revisão** antes de qualquer
deploy e **como consultar o banco** (logs e bases cadastrais). Foi criado depois
de ocorrências repetidas de "tela em branco" causadas por erro de fechamento de
blocos no `app/index.html`.

---

## 1. Princípio

> Toda mudança passa por **revisão de código** e **revisão visual** ANTES do push.
> Só depois das duas revisões verdes é que se faz `git push` (dispara o GitHub
> Pages) e se gera a nova versão no Expo.
>
> **Ao adicionar uma funcionalidade, adiciona-se também o teste que a valida.**
> A suíte cresce junto com o app — nunca para trás.

O objetivo das revisões é duplo:
1. **Funcionamento correto** do código e do app (sem erros de sintaxe, sem tela
   em branco, fluxos funcionando).
2. **Simplicidade** — a construção mais simples que garante o funcionamento ideal
   (remover código morto, dependências não usadas, duplicações).

---

## 2. Fluxo de revisão de código

Pega o erro que mais causou tela em branco: parênteses/chaves desbalanceados no
`<script>` gigante do `index.html`.

```bash
npm run validate
```

O que `scripts/validate-code.js` faz:
- extrai cada `<script>` inline do `app/index.html` e roda `node --check`
  (acusa qualquer erro de sintaxe / fechamento de bloco);
- aponta a **linha real no index.html** onde o desbalanceamento começa;
- valida também `app/config.js` e `app/src/trippin-api.js`.

Saída: código de saída **0** se tudo OK, **1** se houver erro (trava o push).

---

## 3. Fluxo de revisão visual

Garante que **nenhuma tela quebra** e que as funcionalidades novas funcionam.

```bash
npm test            # roda toda a suíte Playwright (headless, viewport mobile)
npm run test:headed # mesma coisa, com o navegador visível
npm run test:report # abre o último relatório HTML
```

Cobertura (em `tests/e2e/`):
- **`smoke-screens.spec.js`** — percorre onboarding → criar viagem → **todas as
  abas** (Cronograma, Mapa, Docs, Galeria, Usuários, Sugestões) → menu,
  notificações, configurações. Em cada passo confirma que a tela **não está em
  branco** e acumula erros de JS, falhando se houver qualquer um. **Este é o
  teste que pega a tela em branco.**
- **`features.spec.js`** — valida as melhorias incrementais (safe area, blur nos
  modais, mapa de pins sem Google Maps, dismiss de notificação, toast em
  configurações).
- **`trippin.spec.js`** — jornada completa do usuário e fluxo de convites.

---

## 4. Atalho: revisão completa

```bash
npm run review      # = validate (código) + test (visual), nessa ordem
```

Rode `npm run review` e só prossiga para o push se terminar **verde**.

---

## 5. Pós-revisão: publicar

```bash
git add -A
git commit -m "..."
git push            # dispara .github/workflows/deploy.yml → GitHub Pages
```

Depois, gerar a nova versão Android no Expo (a partir de `mobile/`):

```bash
cd mobile
npx eas-cli build --platform android --profile preview --non-interactive
```

> O app mobile é um WebView que carrega o GitHub Pages; portanto a nova build só
> reflete as mudanças **depois** que o Pages terminar de publicar.

---

## 6. Acesso ao banco — consultas de logs e cadastros

O backend roda no **Supabase** (PostgreSQL gerenciado). Use o painel para
consultas de leitura. **As credenciais não ficam aqui** — quem tem acesso é o
dono do projeto, pela própria conta Supabase.

### Como entrar
1. Acesse <https://supabase.com> e faça login com a conta dona do projeto.
2. Selecione o projeto **Trippin** (ref público `fcrsessmvmbaeqyrjbtk`, visível
   na URL `https://fcrsessmvmbaeqyrjbtk.supabase.co`).
3. Abra **SQL Editor** para rodar consultas, ou **Table Editor** para navegar.

> O SQL Editor roda com privilégio de serviço e **ignora o Row Level Security** —
> ou seja, enxerga todos os registros. Use sempre `SELECT` (somente leitura) para
> consultas exploratórias; evite `UPDATE`/`DELETE` sem necessidade.

### Onde está cada coisa

| Assunto | Tabela | Campos úteis |
|---|---|---|
| **Logs / auditoria / telemetria** | `public.events_log` | `created_at`, `action`, `payload` (JSON), `trip_id`, `user_id` |
| **Cadastro de usuários (perfis)** | `public.users` | `first_name`, `last_name`, `email`, `phone`, `code`, `created_at` |
| **Viagens** | `public.trips` | `name`, `start_date`, `end_date`, `destinations`, `created_by` |
| **Membros do grupo** | `public.trip_members` | `trip_id`, `user_id`, `is_admin`, `join_via` |
| **Convites / solicitações** | `public.invites` | `email`, `channel`, `status`, `sent_at` |

### Consultas de exemplo

**Logs — últimos eventos no geral:**
```sql
select created_at, action, user_id, trip_id, payload
  from public.events_log
 order by created_at desc
 limit 100;
```

**Logs — filtrando por tipo de ação (ex.: convites enviados):**
```sql
select created_at, trip_id, payload
  from public.events_log
 where action = 'invite_sent'
 order by created_at desc;
```

**Logs — tudo de uma viagem específica:**
```sql
select created_at, action, payload
  from public.events_log
 where trip_id = '<uuid-da-viagem>'
 order by created_at desc;
```

**Cadastro — usuários mais recentes:**
```sql
select created_at, first_name, last_name, email, phone
  from public.users
 order by created_at desc
 limit 50;
```

**Cadastro — total de usuários e de viagens:**
```sql
select
  (select count(*) from public.users) as usuarios,
  (select count(*) from public.trips) as viagens,
  (select count(*) from public.trip_members) as participacoes;
```

**Cruzamento — viagens com o nome do criador:**
```sql
select t.name, t.start_date, u.first_name || ' ' || coalesce(u.last_name,'') as criador
  from public.trips t
  join public.users u on u.id = t.created_by
 order by t.created_at desc;
```

### Regras de segurança (não negociáveis)
- **Nunca** colar `service_role` em `config.js` ou em qualquer arquivo do
  front-end nem em commit. No app só pode existir a chave `anon/publishable`.
- Chaves de serviço (Supabase `service_role`, Brevo/Resend) vivem **apenas** como
  *secrets* das Edge Functions e no painel — nunca no repositório.
- Para consultas de rotina, prefira leitura (`SELECT`). Alterações em produção
  devem ser feitas com critério e, de preferência, via migration versionada.
