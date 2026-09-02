# Comparativo Técnico — A (`TrippinClaude`) × B (`Trippin-Claude-Skills`)

Legenda: **A** = `Amadeusdoceus/TrippinClaude` (branch `master`) ·
**B** = `Amadeusdoceus/Trippin-Claude-Skills` (branch `main`).
Análise sobre o código clonado em 30/08/2026.

---

## 1. Panorama

| Dimensão | A | B | Vencedor |
|---|---|---|---|
| Linhas de front | 4.172 (`app/index.html`) | 4.488 (`web/index.html`) | — |
| Estratégia de JSX | **pré-compilado** (só React UMD) | **Babel standalone em runtime** | **A** |
| Persistência real | localStorage + IndexedDB | Supabase (Auth + Postgres + Storage) | **B** |
| Migrations | 2 arquivos manuais (`0001`, `0002`) | 15 arquivos com timestamp + `config.toml` | **B** |
| RLS | habilitado, policies amplas | habilitado **e forçado**, policies granulares | **B** |
| Auth | fake, local, usuário = `'me'` | Supabase Auth real, `auth.uid()` | **B** |
| Edge Functions | 5 (`send/accept/request/approve-invite`, `search-stays`) | 0 | **A** |
| Testes E2E | 9 suítes, ~1.900 linhas | 1 suíte de smoke, 81 linhas | **A** |
| CI | deploy direto, **sem gate de teste** | `test` → `deploy`, com gate | **B** |
| Mobile | wrapper Expo/WebView funcional | inexistente | **A** |
| Offline | acidental (é só local) | **projetado**: fila + last-write-wins | **B** |
| Observabilidade | nenhuma | tabela `client_errors` | **B** |
| Segredos | `.gitignore` genérico, sem `.env.example` | `.env.example` com nota explícita sobre `service_role` | **B** |
| i18n | 10 idiomas no dicionário | pt-BR | **A** |

---

## 2. Front-end

### 2.1 Carregamento

A carrega React 18 UMD de produção e serve JSX já transpilado:

```
A/app/index.html:11  react.production.min.js
A/app/index.html:12  react-dom.production.min.js
A/app/index.html:13  config.js
A/app/index.html:14  src/trippin-api.js
```

B adiciona `@babel/standalone@7.23.5` (`web/index.html:13`) e transpila 4.488 linhas
**no dispositivo do usuário, a cada carregamento**. Em celular intermediário isso é
segundos de tela branca antes do primeiro pixel — e a página inteira falha se o CDN do
Babel oscilar. O CHANGELOG de A registra explicitamente essa correção
("Correções de 'tela em branco': pré-compilação de JSX, sem Babel em runtime").

**Esta é, isoladamente, a hipótese mais forte para a pior aderência de B.**

### 2.2 Carregamento sob demanda

A só busca as bibliotecas pesadas quando são realmente necessárias, via
`loadScriptOnce` (`A/app/index.html:1756-1764`): pdf.js entra ao abrir um PDF,
Tesseract entra ao processar uma imagem. B carrega Leaflet e Tesseract no `<head>`
(`B/web/index.html:19,24`), pagando o custo mesmo para quem só abre a Home.

### 2.3 Mídia

A resolveu um problema real que B ainda não enfrentou: base64 de fotos estoura a cota
de ~5 MB do localStorage e fazia o `save` inteiro falhar **em silêncio**. A solução
(`stripMedia`/`hydrateMedia`, linhas 843-900) move as imagens para IndexedDB e mantém no
localStorage apenas referências. Essa lógica deve ser preservada — vira a camada de
cache do desenho alvo.

### 2.4 Estado

A guarda tudo num único objeto sob a chave `trippin_v1` e o propaga por props
(`update({...trip, activities: [...]})`). É simples e funciona, mas **cada tela toca o
estado global diretamente**, o que impede trocar a persistência sem reescrever a UI.

B estabeleceu a regra certa e a escreveu no próprio código:

> `B/web/index.html:693` — "Nenhuma tela deve tocar localStorage diretamente — só via TrippinAPI."

Essa regra é o único ponto de arquitetura de B que precisa ser copiado para dentro de A
**antes** de qualquer outra coisa. Sem ela, ligar o backend exige tocar em todas as telas.

---

## 3. Backend e dados

### 3.1 Schema

| Aspecto | A (`0001_init.sql`) | B (`20260829155541_initial_schema.sql` + 14) |
|---|---|---|
| Funções auxiliares | `security definer` em `public` | em schema **`private`**, não exposto pela API REST |
| `force row level security` | não | **sim, em todas as tabelas** |
| Chamada de `auth.uid()` | direta | `(select auth.uid())` — permite ao planner avaliar uma vez por query, não por linha |
| Role alvo nas policies | omitida (vale para `anon` também) | `to authenticated` explícito |
| Índices em FK | ausentes | presentes em todas |
| CHECK constraints | poucas | `amount > 0`, `role in (...)`, `end_date >= start_date` |
| Triggers | nenhum | perfil no signup, criador vira admin, `updated_at` |
| Privilégio por coluna | não | `revoke update ... grant update (name, phone, ...)` |
| Granularidade | `for all` com `using` de membro | separadas por `select`/`insert`/`update`/`delete` |

O padrão de B é o recomendado pela própria Supabase para performance e segurança de RLS.
O padrão de A funciona, mas degrada em tabelas grandes e é permissivo demais.

### 3.2 A migration que mais importa

`B/supabase/migrations/20260829175541_security_hardening.sql` corrige **duas falhas reais
encontradas em auditoria** — e as duas existem hoje, em forma equivalente, em A:

1. **Enumeração de viagens.** A policy `trip_members_insert_self_as_guest` deixava
   qualquer autenticado se inserir como convidado de qualquer `trip_id`, sem nunca ter
   visto o código. A correção troca a policy por uma função `security definer`
   (`join_trip_by_code`) que exige o código exato.
   *Em A, o equivalente é a Edge Function `request-join`, que resolve o código fazendo
   `select id, name from trips` — sem filtro, varrendo a tabela inteira — e trata como
   código os 12 primeiros caracteres do próprio UUID, ou seja, um "segredo" derivado do
   identificador público e não revogável.*

2. **Vazamento de PII.** A policy de co-integrante liberava a linha inteira de `profiles`
   (CPF, telefone, código). A correção troca por uma função que devolve só
   `(user_id, name, email)`.
   *Em A, `trippin-api.js` faz `users(first_name,last_name,email,phone,birth,photo_url,code)`
   ao listar membros — o mesmo vazamento, já escrito no cliente.*

### 3.3 Edge Functions

Aqui A é claramente superior — B não tem nenhuma. As de A são bem estruturadas
(cliente de usuário para autenticar + cliente admin para agir), **exceto a mais exposta**:

| Função | Verifica JWT? | Usa `service_role`? | Avaliação |
|---|---|---|---|
| `accept-invite` | ✅ `auth.getUser()` + confere e-mail do convite | ✅ | Correta |
| `approve-join` | ✅ + RPC `is_trip_admin` | ✅ | Correta |
| `request-join` | ✅ | ✅ | Correta, mas resolve o código com full scan |
| `search-stays` | — | — | Sem PII; aceitável (falta rate limit) |
| **`send-invite`** | ❌ **nenhuma** | ✅ **grava em `invites`** | **Crítica** (ver `02`, C-02) |

`search-stays` (607 linhas) é um bom trabalho de arquitetura de conectores com fallback
para dados de exemplo — deve ser mantido como está, só com autenticação e limite de taxa.

---

## 4. Qualidade e entrega

### 4.1 Testes

A cobre jornada de usuário, rotas, custos, contraste, passagens, busca de hospedagem e
smoke de todas as telas. É um ativo real e é a rede de segurança que torna a refatoração
proposta viável. B cobre apenas o smoke.

### 4.2 CI/CD

`A/.github/workflows/deploy.yml` faz `checkout → upload-pages-artifact → deploy`.
**Nenhum teste roda.** O README de A instrui "só faça `git push` depois que
`npm run review` terminar verde", mas nada impede o contrário — a disciplina é humana.

`B/.github/workflows/deploy-pages.yml` tem um job `test` (validate + Playwright, com
upload do relatório) e `deploy: needs: test`. Um push que quebre a sintaxe nunca chega ao
GitHub Pages. **Adotar esse workflow em A é a correção de maior relação
benefício/esforço de todo o plano.**

### 4.3 Governança de configuração

B tem `.env.example`, `supabase/config.toml`, `CLAUDE.md` e migrations com timestamp —
ou seja, o ambiente é reproduzível por CLI. A tem `config.js` commitado (aceitável: só
chave publicável) mas sem separação entre produção e homologação, e as migrations são
numeradas à mão, o que colide em trabalho paralelo.

---

## 5. Veredicto por camada

| Camada | Origem no projeto alvo |
|---|---|
| UI, navegação, i18n, dark mode, safe-area | **A**, sem alteração |
| Interpretadores (passagem, hospedagem), OCR sob demanda | **A**, sem alteração |
| Mapa, galeria, cronograma, sugestões | **A**, sem alteração |
| Wrapper mobile Expo | **A**, sem alteração |
| Suíte de testes | **A**, estendida |
| Edge Functions | **A**, com hardening |
| Camada única de persistência (`TrippinAPI`) | **B** (padrão), reimplementada em A |
| Schema, RLS, RPCs, Storage policies | **B**, adaptado ao modelo de A |
| Sincronização offline (fila + LWW + `updated_at`) | **B** |
| Telemetria de erros (`client_errors`) | **B** |
| Workflow de CI com gate | **B** |
| Governança de config (`.env.example`, CLI, migrations com timestamp) | **B** |
