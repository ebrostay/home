# Ebrostay Reconstruction Spec — §8 Auth & Security Model

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This is the authoritative security section. Ebrostay has **no application server**: the
browser talks directly to Supabase (Auth + PostgREST + Storage + Edge Functions) using a
**public anonymous key**. Therefore the *entire* access-control boundary is implemented in
the database — Row Level Security (RLS) policies, `security definer` RPCs, and `execute`
grants — plus a handful of Edge Functions that hold the service-role key server-side. Every
policy and function below is reproduced verbatim from `supabase/schema.sql` and the
`supabase/upgrade-2026-06-*.sql` migrations so the model can be rebuilt and audited from this
section alone.

---

## 8.1 Roles

There is no role table and no RBAC engine. A caller's effective role is derived at query time
from three inputs: the Supabase Auth JWT (`auth.uid()` / `auth.role()`), and two boolean
columns on `public.profiles` (`is_admin`, `is_owner`). Roles are **not mutually exclusive** —
a single user can be tenant + owner + admin at once.

| Role | Identified by | How it is assigned |
| --- | --- | --- |
| **Visitor / anonymous** | No session; PostgREST role `anon`. `auth.uid()` is `NULL`. | Default for any unauthenticated browser using the anon key. |
| **Tenant (authenticated)** | Valid Supabase Auth session; PostgREST role `authenticated`; `auth.uid()` = their `auth.users.id`. | Created by **sign-up** (`signUp` → Supabase Auth), which fires the `on_auth_user_created` trigger → `handle_new_user()` inserts the matching `profiles` row. ✅ |
| **Owner** (`is_owner = true`) | Authenticated **and** `profiles.is_owner = true`. Unlocks the owner portal + owner read policies. | Set when an admin assigns a property to that user in the property editor: `admin-property.js` does `update profiles set is_owner = true where id = <ownerProfile.id>` after resolving the owner by email and setting `properties.owner_id`. ✅ |
| **Admin** (`is_admin = true`) | Authenticated **and** `profiles.is_admin = true`. Unlocks the admin panel + every `is_admin()` policy/RPC guard. | Set **manually in SQL** only — there is no UI to grant admin: `update public.profiles set is_admin = true where email = 'you@example.com';` (per the comment at the bottom of `schema.sql`). ✅ |

**Client-side mirror.** `backend.js refreshAuth()` reads the role flags after every auth state
change and caches them in module-scoped `isAdmin` / `isOwner`:

```js
const { data: profile } = await sb
  .from("profiles")
  .select("is_admin, is_owner")
  .eq("id", user.id)
  .maybeSingle();
isAdmin = Boolean(profile?.is_admin);
isOwner = Boolean(profile?.is_owner);
```

These are surfaced as `getIsAdmin()` / `getIsOwner()`. **They are UX state only** — see §8.3.
The `select` itself is constrained by the "Users read own profile" policy, so a user can only
ever read their own flags.

---

## 8.2 The public-anon-key model

- **The anon key is public and safe to ship.** It is injected into the static site
  (`SUPABASE_ANON_KEY`) and sent to the browser. It carries *no* privileges of its own; it
  only identifies requests as coming from the `anon` (or, after login, `authenticated`)
  PostgREST role. Possessing it does **not** bypass RLS.
- **All protection is server-side**, in three layers:
  1. **RLS policies** on every `public` table and on `storage.objects` (§8.4).
  2. **`security definer` RPCs** that run privileged mutations behind in-body guards (§8.5).
  3. **Edge Functions** holding the **service-role key**, which *does* bypass RLS, used for
     the operations the client must not perform itself (writing `booking_requests` with
     server-computed fees; sending email; calling DeepSeek).
- **Secrets never reach the client.** The service-role key, `RESEND_API_KEY`, and
  `DEEPSEEK_API_KEY` live only in Edge Function environment/secrets. The browser invokes Edge
  Functions through `sb.functions.invoke(...)` (authenticated with the anon key + the user's
  JWT); the function then does the privileged work server-side and returns a sanitized result.
- **Consequence (stated bluntly in the data dictionary):** *anything not protected by a
  policy is effectively world-accessible*, because the anon key reaches the public REST API.
  Security review must therefore enumerate **every** table's policies — a missing policy with
  RLS enabled denies all client access, but RLS that is **not enabled** on a table would expose
  it entirely. (All eleven `public` tables below have `enable row level security`.)

---

## 8.3 Client gate vs server gate

The admin page hides UI when the cached `isAdmin` flag is false. **This is cosmetic** — it is
a convenience so non-admins don't see broken controls. It is **not** a security boundary and
must never be treated as one in a rebuild.

`admin.js routeUI(user, isAdmin)` decides what to show:

```js
if (!isAdmin) {
  showStatus("admin.notAdmin");
  adminPanel.hidden = true;   // <-- cosmetic: just hides the panel
  return;
}
```

The cached `isAdmin` comes from `getIsAdmin()`, which is just the value `refreshAuth()` read
from the user's own profile. A motivated user could flip that boolean in the JS console and
the panel would appear — **but every privileged action still hits the server gate and fails**:

- Reads (properties/requests/bookings/users) return **only the rows RLS allows**. A non-admin
  reading `booking_requests` gets only their own; reading other users' `profiles` returns
  nothing.
- The destructive user-delete goes through the RPC, whose **body** re-checks admin status:
  `admin.js` calls `sb.rpc("admin_delete_user", { target_user })`, and
  `admin_delete_user` raises `not allowed` unless `public.is_admin()` is true (§8.5).

| Aspect | Client gate (`getIsAdmin()` in `admin.js`/`backend.js`) | Server gate (RLS + RPC body guards) |
| --- | --- | --- |
| Where it runs | Browser JavaScript | PostgreSQL, on every query |
| What it does | Shows/hides `#adminPanel`, toolbar, login form | Filters rows; allows/denies writes; raises in RPCs |
| Data source | `is_admin` cached from the user's own profile | `auth.uid()` + `public.is_admin()` evaluated server-side |
| Can the user bypass it? | **Yes** — edit the cached boolean in devtools | **No** — enforced by Postgres regardless of client |
| Failure mode if bypassed | Panel renders, but every query returns empty/denied | N/A — this *is* the enforcement |
| Security role | **None (UX only)** | **The actual security boundary** |

**Rebuild rule:** you may reimplement the client gate however you like (or omit it); you must
reproduce the server gate **exactly**.

---

## 8.4 Full RLS policy text (every table + storage)

Every table below has `alter table … enable row level security`. Policies are reproduced
verbatim. A table with RLS enabled and **no** policy for a given command denies that command to
all clients (only the service role bypasses). Absence of an INSERT/UPDATE/DELETE policy below is
therefore intentional and load-bearing.

### `properties` ✅

```sql
-- SELECT: anyone reads published; admins read all
create policy "Public can read published properties"
  on public.properties for select
  using (is_published or public.is_admin());

-- SELECT: an owner reads their own rows (published or not)
create policy "Owners read own properties"
  on public.properties for select
  using (owner_id = auth.uid());

-- ALL (insert/update/delete): admins only
create policy "Admins manage properties"
  on public.properties for all
  using (public.is_admin())
  with check (public.is_admin());
```

Net: 🟢 published readable by all · 🛡️ admins read+write all · 🧑‍💼 owner reads own (read-only;
no owner write policy).

### `availability_blocks` ✅

```sql
-- SELECT: everyone (public calendar must work logged-out)
create policy "Public can read availability"
  on public.availability_blocks for select
  using (true);

-- ALL: admins only
create policy "Admins manage availability"
  on public.availability_blocks for all
  using (public.is_admin())
  with check (public.is_admin());
```

Net: 🟢 entire row readable by anyone (see threat note §8.6) · 🛡️ admin-only writes. The
booking-request flow does **not** insert blocks; an admin creates them manually when accepting.

### `profiles` ✅

```sql
-- SELECT: a user reads only their own profile
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- SELECT: admins read all profiles (to look up users by email)
create policy "Admins read profiles"
  on public.profiles for select
  using (public.is_admin());
```

**There is no INSERT/UPDATE/DELETE policy on `profiles`.** Inserts happen via the
`handle_new_user()` trigger (definer); mutations happen only via the RPCs in §8.5. A normal
client therefore **cannot** edit its own profile — this is precisely what blocks privilege
escalation (a user cannot self-set `is_admin`/`is_owner`). See §8.6 for the one place an admin
*client* writes this table (`is_owner`) and why it currently fails closed.

### `favorites` 🚫

> 🚫 **Out of scope for MVP (removed 2026-06-25).** The favorites / saved-homes feature (heart toggle, saved-only filter, `favorites` table sync, header *Guardados* link) has been removed from the MVP build. This section documents the deferred design only; none of it is wired in the current build.

```sql
create policy "Users read own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

create policy "Users add own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

create policy "Users remove own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);
```

Net: 👤 owner-of-row reads, inserts, deletes their own. No update policy (a toggle is an
insert or a delete). No admin policy.

### `booking_requests` 🔜

The live booking record (no online payment). Table + policies created in
`upgrade-2026-06-booking-requests.sql`. The **insert path** (the `request-booking` Edge
Function) is built but **unwired** in the UI, hence 🔜.

```sql
-- SELECT: a user reads only their own requests
create policy "Users read own booking requests"
  on public.booking_requests for select
  using (auth.uid() = user_id);

-- SELECT: admins read all
create policy "Admins read booking requests"
  on public.booking_requests for select
  using (public.is_admin());

-- UPDATE: admins move status new → contacted → confirmed/declined
create policy "Admins update booking requests"
  on public.booking_requests for update
  using (public.is_admin()) with check (public.is_admin());
```

**No client insert policy** — rows are written exclusively by the `request-booking` Edge
Function (service role, bypasses RLS) after computing fees server-side. No delete policy.

### `bookings` 🗑️

Paid Stripe bookings. Dormant — the Stripe webhook that writes it is inactive; surfaced
read-only in account/owner/admin views. Created in `upgrade-2026-06-stripe-bookings.sql`;
owner read added in `upgrade-2026-06-owner-portal.sql`.

```sql
-- SELECT: a user reads their own
create policy "Users read own bookings"
  on public.bookings for select
  using (auth.uid() = user_id);

-- SELECT: admins read all
create policy "Admins read bookings"
  on public.bookings for select
  using (public.is_admin());

-- SELECT: an owner reads bookings on a property they own
create policy "Owners read bookings on own properties"
  on public.bookings for select
  using (exists (
    select 1 from public.properties p
    where p.id = bookings.property_id and p.owner_id = auth.uid()
  ));
```

**No client insert/update/delete policy** — only the service role (Stripe webhook) writes.

### `inquiries` ✅

```sql
-- INSERT: anyone, incl. anonymous (contact form works logged-out)
create policy "Anyone can send an inquiry"
  on public.inquiries for insert
  with check (true);

-- SELECT: admins only
create policy "Admins read inquiries"
  on public.inquiries for select
  using (public.is_admin());
```

Net: 🟢 anyone inserts · 🛡️ admins read. A sender cannot read back their own inquiry. No
update/delete policy.

### `owner_leads` ✅

From `upgrade-2026-06-owner-portal.sql`.

```sql
create policy "Anyone can submit owner leads"
  on public.owner_leads for insert with check (true);

create policy "Admins read owner leads"
  on public.owner_leads for select using (is_admin());
```

Net: 🟢 anyone inserts · 🛡️ admins read. No update/delete policy.

### `owner_payout_details` ✅

Sensitive financial data (IBAN, tax id). From `upgrade-2026-06-owner-portal.sql`.

```sql
-- ALL: an owner reads/writes only their own row
create policy "Owners manage own payout details"
  on public.owner_payout_details for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- SELECT: admins may read (to verify payout details)
create policy "Admins read payout details"
  on public.owner_payout_details for select using (is_admin());
```

Net: 🧑‍💼 owner full control of own row · 🛡️ admins **read-only** (deliberately tight — admins
cannot edit an owner's bank details).

### `property_photos` ✅

From `upgrade-2026-06-property-photos.sql` (also embedded in `schema.sql`).

```sql
create policy "Public can read property photos"
  on public.property_photos for select
  using (true);

create policy "Admins manage property photos"
  on public.property_photos for all
  using (public.is_admin())
  with check (public.is_admin());
```

Net: 🟢 anyone reads · 🛡️ admins write.

### `property_guest_info` ✅

The **field-level-privacy** table: WiFi passwords, key codes, emergency phone live here,
separate from the public `properties` row, so a row policy can hide them. From
`upgrade-2026-06-guest-info.sql`.

```sql
-- ALL: admins manage
create policy "Admins manage guest info"
  on public.property_guest_info for all
  using (is_admin()) with check (is_admin());

-- SELECT: a guest reads the row ONLY for a property they have a stay on
create policy "Guests read own stay info"
  on public.property_guest_info for select
  using (
    exists (
      select 1 from public.bookings b
      where b.user_id = auth.uid() and b.property_id = property_guest_info.property_id
    )
    or exists (
      select 1 from public.availability_blocks ab
      where ab.user_id = auth.uid() and ab.property_id = property_guest_info.property_id
    )
  );
```

Net: 🛡️ admins read+write · 👤 a guest reads **only** for a property where they have a paid
`bookings` row **or** an admin-assigned `availability_blocks` row (`user_id = auth.uid()`). A
random logged-in user gets nothing.

### `storage.objects` — bucket `property-photos` ✅

The bucket is created `public` (`insert into storage.buckets … public = true`). Policies are
scoped to `bucket_id = 'property-photos'`. From `upgrade-2026-06-property-photos.sql`.

```sql
create policy "Public read property photos"
  on storage.objects for select
  using (bucket_id = 'property-photos');

create policy "Admins upload property photos"
  on storage.objects for insert
  with check (bucket_id = 'property-photos' and public.is_admin());

create policy "Admins update property photos"
  on storage.objects for update
  using (bucket_id = 'property-photos' and public.is_admin());

create policy "Admins delete property photos"
  on storage.objects for delete
  using (bucket_id = 'property-photos' and public.is_admin());
```

Net: 🟢 anyone reads files · 🛡️ admins insert/update/delete. (Photo *files* deleted by an admin
when removing a property are removed best-effort client-side before the metadata row cascades —
see `backend.js deleteProperty`.)

---

## 8.5 Security-definer functions / RPCs

All four run as `security definer set search_path = public`, so they execute with the
**definer's** rights and bypass RLS internally. Their **`execute` grant** is the access
control, and each privileged one re-checks authorization in its **body**. `is_admin()` is
`security definer` specifically to avoid RLS recursion when it is called from inside a policy.

### `handle_new_user()` — signup trigger ✅

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- **Signature / kind:** trigger function on `auth.users AFTER INSERT FOR EACH ROW`.
- **Does:** creates the `profiles` row at signup (id + email; `is_admin`/`is_owner` default
  `false`). `on conflict do nothing` makes it idempotent.
- **Who may execute:** **trigger only** — not directly callable by clients.

### `is_admin()` — policy helper ✅

```sql
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
```

- **Signature:** `is_admin() returns boolean`, `stable`.
- **Does:** returns whether the **caller** (`auth.uid()`) is an admin; `coalesce(..., false)`
  so a missing/NULL profile is non-admin. Definer rights let it read `profiles` without
  triggering that table's RLS (avoids recursion, since policies call it).
- **Who may execute:** used inside policies and inside `admin_delete_user`; not revoked from
  `public`, but it only ever reveals the caller's own admin bit.

### `deactivate_my_account()` — self-deactivation ✅

```sql
create or replace function public.deactivate_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  update public.profiles set deactivated_at = now() where id = auth.uid();
  update auth.users set banned_until = now() + interval '100 years' where id = auth.uid();
end;
$$;

revoke execute on function public.deactivate_my_account() from public;
revoke execute on function public.deactivate_my_account() from anon;
grant  execute on function public.deactivate_my_account() to authenticated;
```

- **Signature:** `deactivate_my_account() returns void`.
- **Does:** stamps `profiles.deactivated_at = now()` and **bans the caller's own auth user for
  100 years** (`banned_until`). Records are kept (soft disable), not deleted.
- **In-body guard:** raises `not signed in` if `auth.uid()` is NULL; can only ever touch the
  caller's own rows (`where id = auth.uid()`).
- **Who may execute:** revoked from `public`/`anon`, granted to `authenticated` only.
- **Client caller:** `backend.js deactivateAccount()` → `sb.rpc("deactivate_my_account")` then
  `sb.auth.signOut()`.

### `admin_delete_user(target_user uuid)` — hard delete ✅

```sql
create or replace function public.admin_delete_user(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if exists (select 1 from public.profiles where id = target_user and is_admin) then
    raise exception 'cannot delete an admin account';
  end if;
  delete from auth.users where id = target_user;
end;
$$;

revoke execute on function public.admin_delete_user(uuid) from public;
revoke execute on function public.admin_delete_user(uuid) from anon;
grant  execute on function public.admin_delete_user(uuid) to authenticated;
```

- **Signature:** `admin_delete_user(target_user uuid) returns void`.
- **Does:** hard-deletes the auth user (cascades to `profiles`, `favorites`; detaches
  `bookings`/`booking_requests`/`availability_blocks.user_id` via `on delete set null`).
- **In-body guards (the real gate):** raises `not allowed` unless `public.is_admin()`; raises
  `cannot delete an admin account` if the target is an admin (admins cannot delete each
  other). **Note:** granted to *all* `authenticated` users, so the body guard is the only
  thing stopping a non-admin — this deserves an explicit negative test.
- **Client caller:** `admin.js` → `sb.rpc("admin_delete_user", { target_user })`.

### `delete_my_account()` — DROPPED 🗑️

Originally defined in `upgrade-2026-06-guest-bookings.sql` (a `security definer` SQL function
that ran `delete from auth.users where id = auth.uid()`, granted to `authenticated`). It was
**replaced by deactivation** and is explicitly dropped at the end of
`upgrade-2026-06-stripe-bookings.sql`:

```sql
drop function if exists public.delete_my_account();
```

A faithful rebuild must run the migrations in order so this function does **not** exist in the
final state — self-service hard deletion is intentionally unavailable; only deactivation (self)
and `admin_delete_user` (admin) remain.

---

## 8.6 Threat notes & gaps

**🐞 `availability_blocks` rows are world-readable, including `user_id`.** The
`"Public can read availability"` policy is `using (true)`, and RLS is row-level (not
column-level), so the **entire row** is exposed to anonymous callers — including
`availability_blocks.user_id`, which links a stay to a tenant. This leaks that *a* booking
exists and which profile uuid it belongs to (not a name/email, but a stable identifier), and
the `note` field (admin notes, e.g. "Reforma cocina") is likewise public. The public calendar
genuinely needs `start_date`/`end_date`/`hold_expires_at`; it does **not** need `user_id` or
`note`. Recommended fix: expose only the date columns to `anon` (a restricted view or a
column-narrowing policy split), or move tenant linkage to a separate, owner-scoped table.

**🐞 Weak `isConfigured()` anon-key guard (client-only, low severity).** `backend.js`
gates "is the backend configured" on `SUPABASE_ANON_KEY.length > 20`:

```js
typeof SUPABASE_ANON_KEY === "string" && SUPABASE_ANON_KEY.length > 20
```

This is a length sniff, not validation — any 21-char string passes and a malformed key only
fails later at request time. It has **no security impact** (it gates graceful-degradation, not
access), but it is brittle: a truncated/placeholder key silently "looks configured." Note for
the rebuild, not a vulnerability.

**Deactivation vs deletion semantics.** Deactivation is a **soft** disable: `deactivated_at`
is stamped and the auth user is banned for **100 years** (`banned_until = now() + interval '100
years'`), which blocks login while preserving all records. It is reversible in principle (an
admin could clear `banned_until`/`deactivated_at` in SQL), though no UI does so. **Deletion**
is hard and admin-only (`admin_delete_user`), cascading/detaching as described in §8.5.
Self-service hard deletion was deliberately removed (§8.5, `delete_my_account` dropped). A
rebuild should preserve this asymmetry: users can disable themselves, only admins can erase,
and an admin cannot erase another admin.

**⚠️ Admin sets `is_owner` via a direct client write that has no matching policy.** When an
admin assigns a property in the editor, `admin-property.js` runs
`sb.from("profiles").update({ is_owner: true }).eq("id", ownerProfile.id)` from the **browser**
(anon key + admin JWT). But `profiles` has **no UPDATE policy** (§8.4) — RLS denies all client
updates regardless of admin status. This write therefore **fails silently** (the result is not
checked), so `is_owner` may never actually be set, leaving the owner portal ungranted even
though `properties.owner_id` was assigned. This is a correctness bug, not an exposure (the
RLS-deny is doing its job). Fixes: add an admin-only `profiles` update policy scoped to
`is_owner`, or set `is_owner` inside a `security definer` RPC, or derive owner status from
`exists(select 1 from properties where owner_id = auth.uid())` instead of a stored flag.

**Defense-in-depth observations (no action implied):**
- `admin_delete_user` is granted to all `authenticated`; only its body guard restricts it.
  Correct as written, but the grant surface is wider than necessary — a body-guard regression
  would immediately become exploitable. Keep the negative test.
- `inquiries` / `owner_leads` accept `with check (true)` inserts from `anon`, so they are
  open write sinks (spam/abuse vector). Acceptable for public contact forms; rate-limiting and
  anti-spam belong at the Edge/CAPTCHA layer, not RLS.
- Storage bucket `property-photos` is fully public-read by design; never place tenant-private
  files (IDs, contracts) there — that content belongs behind `property_guest_info`-style
  row-scoped tables or a private bucket.
