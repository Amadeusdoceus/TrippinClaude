# Auditoria de Segurança — `TrippinClaude` (projeto A)

16 achados. Severidade segundo impacto × facilidade de exploração.
Cada achado traz **evidência no código**, **impacto** e **correção**.

| ID | Severidade | Título |
|---|---|---|
| C-01 | 🔴 Crítica | Senha armazenada e exibida em texto claro |
| C-02 | 🔴 Crítica | `send-invite` sem autenticação — relay de e-mail aberto |
| C-03 | 🔴 Crítica | Ausência de identidade no servidor (`'me'`) |
| A-01 | 🟠 Alta | PII sensível (CPF, documentos de viagem) sem proteção no dispositivo |
| A-02 | 🟠 Alta | Hash de senha SHA-256 sem salt, feito no cliente |
| A-03 | 🟠 Alta | Código de viagem derivado do UUID, não revogável |
| A-04 | 🟠 Alta | CI publica sem executar a suíte de testes |
| A-05 | 🟠 Alta | Listagem de membros expõe a linha inteira do perfil |
| A-06 | 🟠 Alta | Sem `force row level security`; policies `for all` amplas |
| M-01 | 🟡 Média | CORS `*` em todas as Edge Functions |
| M-02 | 🟡 Média | Sem rate limiting em nenhuma função |
| M-03 | 🟡 Média | `request-join` faz varredura completa de `trips` |
| M-04 | 🟡 Média | Dependências de CDN sem SRI; ausência de CSP |
| M-05 | 🟡 Média | E-mail pessoal embutido como remetente padrão |
| M-06 | 🟡 Média | `events_log` gravável diretamente pelo cliente |
| B-01 | 🔵 Baixa | `trippin-api.js` órfão e divergente do schema |

---

## 🔴 C-01 — Senha armazenada e exibida em texto claro

**Evidência**
```
A/app/index.html:1031   passwordHash, passwordDisplay: btoa(unescape(encodeURIComponent(f.password))),
A/app/index.html:3953   setUser({ ...user, passwordHash: newHash, passwordDisplay: btoa(...) });
A/app/index.html:4009   ... atob(user.passwordDisplay || '') ...   // renderiza a senha na tela de perfil
```

O campo `passwordDisplay` é a senha do usuário em base64 — codificação, não criptografia.
Fica em `localStorage['trippin_v1']`, legível por qualquer script na origem, por qualquer
extensão do navegador e por qualquer backup do dispositivo. A UI ainda oferece um botão
"Mostrar" que a decodifica e imprime.

**Impacto** — como a maioria dos usuários reutiliza senhas, isso transforma um XSS
qualquer, uma extensão maliciosa ou um celular emprestado em comprometimento de contas de
terceiros (e-mail, banco). Sob a LGPD é tratamento inadequado de dado pessoal com risco
direto ao titular (art. 46).

**Correção** — remover `passwordDisplay` e `passwordHash` do cliente por completo.
Autenticação passa a ser Supabase Auth (`signInWithPassword`), onde a senha nunca é
persistida no dispositivo — apenas o token de sessão. Ao migrar, forçar redefinição de
senha para todos os usuários existentes e **assumir as senhas atuais como vazadas**.

---

## 🔴 C-02 — `send-invite` sem autenticação (relay de e-mail aberto)

**Evidência**
```
A/backend/supabase/functions/send-invite/index.ts:24
  const { trip_id, trip_name, email, sender_name } = await req.json();
  // ↑ nenhum auth.getUser(), nenhuma verificação de membro/admin

A/backend/supabase/functions/send-invite/index.ts:42-53
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  await admin.from("invites").insert({ trip_id, email, channel, status, token });

A/app/index.html:3573-3579
  fetch(cfg.SUPABASE_URL + '/functions/v1/send-invite', {
    headers: { 'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY }  // chave pública
  })
```

A chave usada é a *publishable*, que está no repositório por design
(`A/app/config.js:11`). Portanto **qualquer pessoa na internet** pode chamar essa função.
Ela aceita `email`, `trip_name` e `sender_name` arbitrários, monta um HTML com a
identidade visual do Trippin e um link "Aceitar convite", e o envia pela conta Brevo do
projeto — além de inserir uma linha em `invites` com `service_role`, ignorando RLS.

**Impacto**
- **Phishing com remetente legítimo:** `trip_name` e `sender_name` entram no corpo; o
  link aponta para `APP_URL?token=...`, mas o restante do texto é controlado pelo atacante.
- **Esgotamento de cota e bloqueio do provedor:** 300 e-mails/dia no plano gratuito;
  esvaziar a cota derruba o convite para todos os usuários reais.
- **Envenenamento da reputação do domínio remetente.**
- **Poluição da tabela `invites`** com `trip_id` arbitrário (a função aceita até um UUID
  de placeholder), inclusive tokens válidos para viagens reais se o `trip_id` for adivinhado.

**Correção** — ver `exemplos/send-invite-hardened.ts`. Em resumo: exigir JWT válido,
confirmar que o chamador é **admin da `trip_id` informada**, ler `trip_name` **do banco** e
não do corpo da requisição, escapar `sender_name` a partir do perfil autenticado, aplicar
limite de taxa por usuário e restringir o CORS à origem do app.

---

## 🔴 C-03 — Ausência de identidade no servidor

**Evidência** — o usuário corrente é a string literal `'me'`, usada 24 vezes:
```
A/app/index.html:922   { id: 'me', firstName: 'Você', ..., isAdmin: true, ... }
A/app/index.html:2270  { ...a, id: uid(), source: 'manual', joined: ['me'] }
A/app/index.html:3548  const meIsAdmin = (trip.members||[]).some(m => m.id === 'me' && m.isAdmin);
```

**Impacto** — não existe autorização: `isAdmin` é um booleano no localStorage que o
usuário edita pelo DevTools em cinco segundos. Não existe multiusuário: dois integrantes
da mesma viagem mantêm bancos independentes que nunca convergem. Nenhuma das regras de
negócio (aprovar ingresso, remover membro, dividir despesa) tem valor legal ou técnico.

**Correção** — Fase 2 do plano: `auth.uid()` como identidade única, `'me'` substituído por
`session.user.id`, autorização derivada de `trip_members.role` no Postgres via RLS.

---

## 🟠 A-01 — PII sensível sem proteção no dispositivo

**Evidência** — o objeto persistido inclui `cpf`, `birth`, `phone`, `email`, `photo`
(`A/app/index.html:1017`, `1031`) e, via os interpretadores, o **conteúdo integral de
passagens aéreas e reservas de hospedagem**: localizador, número do voo, nome do hóspede,
endereço, contato do anfitrião e preço (`A/app/index.html:1756-2100`).

Tudo isso vive em `localStorage` + IndexedDB, sem criptografia, sem prazo de retenção,
sem tela de exclusão e sem exportação.

**Impacto** — um localizador de passagem permite alterar ou cancelar o voo de terceiros na
maioria das companhias. Combinado a nome e CPF, habilita fraude de identidade. Sob a LGPD,
faltam os direitos do art. 18 (acesso, portabilidade, eliminação) e a base para retenção.

**Correção** — migrar documentos para bucket privado do Storage com policy por `trip_id`
(`sql/0004_storage.sql`), manter IndexedDB apenas como cache com TTL, tornar o CPF
opcional (como B já fez: *"CPF sempre opcional"*), e entregar a tela "Privacidade e dados"
com exportação e exclusão (Fase 6).

---

## 🟠 A-02 — Hash de senha SHA-256 sem salt, feito no cliente

**Evidência**
```
A/app/index.html:912   crypto.subtle.digest('SHA-256', enc.encode(pw))
A/app/index.html:949   fallback: Promise.resolve(btoa(pw))   // sem WebCrypto, vira base64
```

SHA-256 puro é rápido demais para senhas: uma GPU comum testa bilhões por segundo contra
rainbow tables. Pior, o fallback degrada silenciosamente para base64.

**Correção** — remover. Hash de senha é responsabilidade do Supabase Auth (bcrypt no
servidor). Nenhum derivado de senha deve existir no cliente.

---

## 🟠 A-03 — Código de viagem derivado do UUID e não revogável

**Evidência**
```
A/backend/supabase/functions/request-join/index.ts:42
  trips?.find(t => t.id === code || t.id.replace(/-/g,'').slice(0,12).toUpperCase() === code.toUpperCase())
```

O "código de 12 dígitos" é um prefixo do identificador primário. Consequências: quem
conhece o `id` conhece o código; o código **não pode ser rotacionado** sem trocar a chave
primária; e um ex-integrante mantém acesso perpétuo ao convite.

**Correção** — coluna `code text unique` própria, gerada com aleatoriedade
criptográfica, com `expires_at` e rotação pelo admin (`sql/0001`, `sql/0003`).

---

## 🟠 A-04 — CI publica sem executar a suíte de testes

**Evidência** — `A/.github/workflows/deploy.yml` vai de `checkout` a `deploy-pages` sem
nenhum passo de verificação, apesar de o README exigir `npm run review` verde.

**Impacto** — uma quebra de sintaxe no arquivo único derruba o app inteiro em produção;
é exatamente o modo de falha "tela em branco" que o projeto já sofreu.

**Correção** — adotar o workflow de B (`test` → `deploy: needs: test`). Correção de
menor custo e maior efeito do plano; executável hoje.

---

## 🟠 A-05 — Listagem de membros expõe a linha inteira do perfil

**Evidência**
```
A/app/src/trippin-api.js:130
  .select("user_id, is_admin, joined_at, join_via, users(first_name,last_name,email,phone,birth,photo_url,code)")
```
Combinado com a policy `tm_read` (qualquer integrante lê `trip_members`), qualquer pessoa
que entre numa viagem obtém telefone, data de nascimento e código pessoal de todos os
demais — dados que a UI de Integrantes nem exibe.

**Correção** — RPC `get_trip_member_profiles(p_trip_id)` devolvendo apenas
`(user_id, name, email, photo_url, role)`, como em B (`sql/0003_rpc.sql`).

---

## 🟠 A-06 — Sem `force row level security`; policies amplas

**Evidência** — `A/backend/.../0001_init.sql:186-255`: há `enable row level security`, mas
não `force`; as policies de conteúdo são geradas em laço com `for all` e sem
`to authenticated`, o que as torna avaliáveis também para o papel `anon`.

**Impacto** — sem `force`, o próprio dono das tabelas ignora as policies; `for all` sem
`with check` diferenciado permite que um integrante insira linhas apontando para outro
usuário (ex.: registrar despesa em nome de terceiro).

**Correção** — adotar o padrão de B: `force row level security` em tudo, policies
separadas por operação, `to authenticated` explícito, `(select auth.uid())`, e
privilégio de `UPDATE` restrito por coluna (`sql/0002_rls_policies.sql`).

---

## 🟡 M-01 — CORS `*` em todas as Edge Functions
`"Access-Control-Allow-Origin": "*"` nas cinco funções. Combinado a C-02, qualquer página
da web chama a API do Trippin a partir do navegador da vítima.
**Correção:** allowlist com `APP_URL` (e `http://localhost:8000` só em dev).

## 🟡 M-02 — Sem rate limiting
Nenhuma função limita chamadas. `send-invite` (custo por e-mail) e `search-stays`
(custo por chamada a agregador) são economicamente exploráveis.
**Correção:** limite por `auth.uid()` em tabela `rate_limits`, ou WAF do Supabase.

## 🟡 M-03 — Varredura completa de `trips`
`request-join` carrega **todas** as viagens do banco para achar uma por prefixo de UUID.
Custo O(n) por tentativa de ingresso; a partir de alguns milhares de viagens, degrada e
vira vetor de DoS.
**Correção:** coluna `code` indexada + RPC `join_trip_by_code` (`sql/0003`).

## 🟡 M-04 — CDNs sem SRI e sem CSP
React, pdf.js e Tesseract vêm de `unpkg` e `cdnjs` sem atributo `integrity`, e não há
`Content-Security-Policy`. Um comprometimento do CDN executa código arbitrário sobre os
dados de viagem — inclusive os documentos.
**Correção:** `integrity` + `crossorigin` em todas as tags `<script>` fixas, versões
fixadas (nada de `@latest`), e CSP com `default-src 'self'` mais a allowlist dos CDNs.

## 🟡 M-05 — E-mail pessoal como remetente padrão
`Deno.env.get("BREVO_SENDER_EMAIL") || "amadeuljr@hotmail.com"`
(`send-invite/index.ts:38`). Dado pessoal do mantenedor em repositório público e
remetente frágil para entregabilidade.
**Correção:** remover o literal; falhar explicitamente se a variável não estiver definida;
usar domínio próprio verificado (SPF/DKIM).

## 🟡 M-06 — `events_log` gravável pelo cliente
`trippin-api.js:186` insere direto em `events_log`. Um log de auditoria que o auditado
pode escrever não é log de auditoria.
**Correção:** remover a policy de insert para `authenticated`; gravar só por trigger
`security definer` ou Edge Function (padrão de `notifications` em B).

## 🔵 B-01 — `trippin-api.js` órfão e divergente
Carregado em `index.html:14`, mas `window.TrippinAPI` tem **0 referências** no app. Além
disso mira `public.users` com colunas (`photo_url`, `birth`, `code`) que não batem com o
schema alvo. Código morto que sugere uma integração inexistente.
**Correção:** substituir pelo `exemplos/trippin-api.js` na Fase 2, ou remover imediatamente.

---

## Ordem de correção recomendada

**Nas próximas 48 horas (sem depender do restante do plano):**
1. C-01 — apagar `passwordDisplay` do código e do estado salvo.
2. C-02 — desativar ou proteger `send-invite`; **rotacionar a chave Brevo** (deve-se
   assumi-la como já explorada enquanto a função estiver aberta).
3. A-04 — trocar o workflow de deploy pelo de B.
4. M-01 / M-05 — allowlist de CORS e remoção do e-mail pessoal.

**Nas primeiras quatro semanas:** C-03, A-01, A-02, A-03, A-05, A-06 — cobertas pelas
Fases 1 a 3 de `04-plano-de-acao.md`.

**Até o fim do plano:** M-02, M-03, M-04, M-06, B-01.
