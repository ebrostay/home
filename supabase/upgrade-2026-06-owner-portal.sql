-- Ebrostay upgrade: owner portal (owners, payout details, leads)
-- Applied to the live project via migration "owner_portal" on 2026-06-13.

alter table public.profiles add column if not exists is_owner boolean not null default false;
alter table public.properties add column if not exists owner_id uuid references public.profiles (id) on delete set null;

create table if not exists public.owner_payout_details (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  account_holder text,
  iban text,
  bank_name text,
  tax_id text,
  billing_address text,
  payout_notes text,
  updated_at timestamptz not null default now()
);
alter table public.owner_payout_details enable row level security;
drop policy if exists "Owners manage own payout details" on public.owner_payout_details;
create policy "Owners manage own payout details" on public.owner_payout_details for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Admins read payout details" on public.owner_payout_details;
create policy "Admins read payout details" on public.owner_payout_details for select using (is_admin());

drop policy if exists "Owners read own properties" on public.properties;
create policy "Owners read own properties" on public.properties for select using (owner_id = auth.uid());

drop policy if exists "Owners read bookings on own properties" on public.bookings;
create policy "Owners read bookings on own properties" on public.bookings for select
  using (exists (select 1 from public.properties p where p.id = bookings.property_id and p.owner_id = auth.uid()));

create table if not exists public.owner_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null, phone text, city text, units text, message text,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.owner_leads enable row level security;
drop policy if exists "Anyone can submit owner leads" on public.owner_leads;
create policy "Anyone can submit owner leads" on public.owner_leads for insert with check (true);
drop policy if exists "Admins read owner leads" on public.owner_leads;
create policy "Admins read owner leads" on public.owner_leads for select using (is_admin());
