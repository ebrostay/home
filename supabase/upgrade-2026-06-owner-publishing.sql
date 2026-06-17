-- Ebrostay upgrade: owner self-publishing and location filters.
-- Run this after the owner portal migration.

alter table public.properties add column if not exists postcode text;
alter table public.properties add column if not exists neighborhood text;

drop policy if exists "Owners create own properties" on public.properties;
create policy "Owners create own properties" on public.properties for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Owners update own properties" on public.properties;
create policy "Owners update own properties" on public.properties for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create index if not exists idx_properties_postcode on public.properties (postcode);
create index if not exists idx_properties_neighborhood on public.properties (neighborhood);
