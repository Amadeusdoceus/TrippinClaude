# Mapa de Migração — `localStorage['trippin_v1']` → Postgres

Referência para a Fase 3. A estrutura de origem foi lida de
`A/app/index.html` (linhas 833-931, 1236-1238, 2270-2960).

---

## 1. Estrutura de origem

```js
// localStorage['trippin_v1']
{
  user: { firstName, lastName, birth, cpf, email, country, phone, photo,
          code, passwordHash, passwordDisplay, bioCred, lang },
  trips: [{
    id, name, startDate, endDate, status, code,
    destinations: [{ name, date }],
    cityOverrides,
    members: [{ id:'me'|uid, firstName, lastName, name, email, phone,
                birth, code, isAdmin, joinedAt, joinVia }],
    activities: [{ id, date, time, title, place, type, desc,
                   source:'manual'|'doc', docId, joined:['me'] }],
    docs: [{ id, kind, name, dataUrl|blob, parsed:{...} }],
    gallery: [{ id, city, src|blob, addedAt }],
    albums: [...],
    expenses: [{ id, desc, amount, paidBy, note }],
    pendingInvites: [{ id, email, channel, status, sentAt }]
  }]
}
// IndexedDB 'trippin_media'/'images': chaves 'g:<id>' (galeria) e 'd:<id>' (docs)
```

---

## 2. De/para

| Origem | Destino | Transformação |
|---|---|---|
| `user.email` + senha nova | `auth.users` | `signUp`; **`passwordHash` e `passwordDisplay` descartados** (C-01) |
| `user.{firstName,lastName}` | `profiles.{first_name,last_name}` | direto, sem concatenar (Fase 2B: `profiles.name` virou dois campos — ver `06-pontas-soltas.md`, item D3) |
| `user.phone`, `user.cpf`, `user.birth` | `profiles.phone/cpf/birth` | `cpf` opcional; se vazio, `null` |
| `user.photo` (base64) | Storage `trip-photos/avatars/{uid}` → `profiles.photo_path` | upload; base64 sai do estado |
| `user.code` | `profiles.user_code` | manter se tiver 6 dígitos e for único; senão, deixar o trigger gerar |
| `user.lang` | `profiles.language` | direto |
| `user.bioCred` | — | **descartado**: credencial WebAuthn é do dispositivo, não migra |
| `trip.id` (`uid()`, 7 chars) | `trips.id (uuid)` | gerar novo uuid; guardar `legacy_id` para idempotência |
| `trip.code` / prefixo do id | `trips.code` | **gerar código novo** (AD-04); avisar o admin do novo código |
| `trip.{name,startDate,endDate,status}` | `trips.{name,start_date,end_date,status}` | direto |
| `trip.destinations` | `trips.destinations jsonb` | direto (mesmo formato) |
| `trip.cityOverrides` | `trips.city_overrides jsonb` | direto |
| `member.id === 'me'` | `trip_members(user_id = auth.uid(), role='admin')` | criado pelo trigger `on_trip_created` |
| demais `members` | `trip_members` **apenas se o e-mail existir em `profiles`** | senão vira `invites(channel='email', status='pending-response')` — não se pode criar conta por outro |
| `member.isAdmin` | `trip_members.role` | `true → 'admin'`, `false → 'convidado'` |
| `activity.*` | `activities` | `date`+`time` → `starts_at timestamptz` no fuso do destino; `source`, `doc_id` preservados |
| `activity.joined[]` | `activity_participants` | `'me'` → `auth.uid()`; membros não migrados são ignorados |
| `doc.dataUrl` / IDB `d:<id>` | Storage `trip-documents/{trip_id}/{doc_id}` | upload binário; `docs.storage_path` |
| `doc.parsed` (voo) | `doc_legs` | uma linha por trecho: origem, destino, escala, horários, cia, localizador |
| `doc.parsed` (hospedagem) | `docs.parsed jsonb` + `docs.kind='lodging'` | mantém o objeto extraído |
| `gallery[].src` / IDB `g:<id>` | Storage `trip-photos/{trip_id}/{photo_id}` | upload; `photos.storage_path` |
| `gallery[].city` | `albums.name` + `photos.album_id` | criar álbum por cidade se não existir |
| `expense.*` | `expenses` | `amount` → `numeric(12,2)`, `currency` padrão `'BRL'` se ausente |
| `expense.paidBy` (nome) | `expenses.paid_by uuid` | resolver por nome contra os membros; se não resolver, atribuir ao migrante e registrar em `audit_log` |
| `pendingInvites[]` | `invites` | `status` preservado; **`token` novo** com `expires_at` |
| — | `audit_log` | uma linha `'migrado do dispositivo'` por viagem |

---

## 3. Regras da migração

1. **Idempotente.** Cada entidade carrega o `legacy_id` de origem numa coluna
   `legacy_id text`. Reexecutar a migração não duplica nada (`on conflict (legacy_id) do nothing`).
2. **Transacional por viagem.** Uma viagem migra por inteiro ou não migra. Falha de upload
   de mídia não aborta a viagem — o item entra na fila de reenvio.
3. **Ordem obrigatória:** `profiles` → `trips` → `trip_members` → `activities` →
   `activity_participants` → `docs` → `doc_legs` → `albums` → `photos` → `expenses` →
   `expense_shares` → `invites`.
4. **Mídia por último e assíncrona**, com progresso visível e retomada.
5. **Nada é apagado do dispositivo** até 30 dias depois e uma confirmação explícita.
6. **Senha nunca migra.** O usuário define uma nova no primeiro acesso.

---

## 4. Divergências que exigem decisão do produto

| Situação | Recomendação |
|---|---|
| Membro local sem conta real | Vira convite pendente; a viagem migra sem ele |
| Duas pessoas migram a *mesma* viagem (cada uma tem sua cópia local) | A primeira migração cria; a segunda detecta o `legacy_id` e **entra como membro**, sem duplicar. Divergências de conteúdo entram no `audit_log` para revisão do admin |
| Despesa com `paidBy` que não resolve | Atribuir ao migrante, marcar `needs_review = true`, notificar |
| Atividade sem hora | `starts_at` às 00:00 do dia, com `all_day = true` |
| Fuso horário | Usar o fuso do destino da data; na dúvida, `America/Sao_Paulo` |
| Documento cujo binário sumiu do IndexedDB | Migrar só os dados extraídos (`parsed`), `storage_path = null`, `source='legacy'` |
