-- Ebrostay upgrade: explicit bills cost policy
-- Adds a bills_policy column (included / capped / excluded) so badges, detail
-- copy, and search filters agree on the live (Supabase) data instead of only
-- the static data.js fallback.
-- Run in the Supabase SQL Editor of the EXISTING project. Safe to run twice.

alter table public.properties
  add column if not exists bills_policy text not null default 'included'
    check (bills_policy in ('included', 'capped', 'excluded'));

-- Backfill existing rows from the legacy bills_included flag plus any utilities
-- cap: a capped utility allowance means the policy is "capped", not "included".
-- (coalesce-style guard via the where clause keeps a value an admin already set.)
update public.properties set bills_policy =
  case
    when not bills_included then 'excluded'
    when utilities_cap_eur is not null then 'capped'
    else 'included'
  end
where bills_policy is null or bills_policy = 'included';

-- Both Movera homes bill utilities up to a 50 EUR/room cap (excess billed
-- separately), so pin their policy explicitly regardless of legacy flags.
update public.properties set
  bills_included = true,
  utilities_cap_eur = coalesce(utilities_cap_eur, 50),
  bills_policy = 'capped'
where id in ('movera0', 'movera1');
