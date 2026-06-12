-- Ebrostay Supabase schema
-- Paste this whole file into the Supabase SQL Editor and click Run.
-- Safe to run on a fresh project.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.properties (
  id text primary key,
  city text not null default 'zaragoza',
  type text not null default 'apartment',
  address_key text not null,
  lat double precision not null,
  lng double precision not null,
  guests integer not null,
  price_label text not null,
  price_number integer not null,
  price_note_es text,
  price_note_en text,
  rating numeric(2, 1),
  available_from date,
  is_new boolean not null default false,
  checked boolean not null default true,
  deposit_protected boolean not null default true,
  bills_included boolean not null default true,
  amenities text[] not null default '{}',
  name text not null,
  area_es text,
  area_en text,
  copy_es text,
  copy_en text,
  details_es text,
  details_en text,
  bedrooms integer,
  bathrooms integer,
  size_m2 integer,
  floor_number integer,
  min_stay_months integer,
  max_stay_months integer,
  deposit_amount integer,
  utilities_cap_eur integer,
  pets_allowed boolean,
  smoking_allowed boolean,
  couples_allowed boolean,
  self_checkin boolean,
  energy_rating text,
  video_url text,
  beds_es text,
  beds_en text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.properties (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint valid_range check (end_date >= start_date)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  property_id text not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  property text,
  message text,
  language text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a user signs up
-- ---------------------------------------------------------------------------

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

-- Admin check used by policies (security definer avoids RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.properties enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.inquiries enable row level security;

-- Properties: anyone can read published homes; only admins can change them
drop policy if exists "Public can read published properties" on public.properties;
create policy "Public can read published properties"
  on public.properties for select
  using (is_published or public.is_admin());

drop policy if exists "Admins manage properties" on public.properties;
create policy "Admins manage properties"
  on public.properties for all
  using (public.is_admin())
  with check (public.is_admin());

-- Availability: anyone can read; only admins can change
drop policy if exists "Public can read availability" on public.availability_blocks;
create policy "Public can read availability"
  on public.availability_blocks for select
  using (true);

drop policy if exists "Admins manage availability" on public.availability_blocks;
create policy "Admins manage availability"
  on public.availability_blocks for all
  using (public.is_admin())
  with check (public.is_admin());

-- Profiles: users see their own profile
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Favorites: users manage their own favorites
drop policy if exists "Users read own favorites" on public.favorites;
create policy "Users read own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

drop policy if exists "Users add own favorites" on public.favorites;
create policy "Users add own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users remove own favorites" on public.favorites;
create policy "Users remove own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);

-- Inquiries: anyone (even logged out) can send one; only admins can read them
drop policy if exists "Anyone can send an inquiry" on public.inquiries;
create policy "Anyone can send an inquiry"
  on public.inquiries for insert
  with check (true);

drop policy if exists "Admins read inquiries" on public.inquiries;
create policy "Admins read inquiries"
  on public.inquiries for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed data: the four current Ebrostay homes
-- ---------------------------------------------------------------------------

insert into public.properties
  (id, city, type, address_key, lat, lng, guests, price_label, price_number,
   price_note_es, price_note_en, rating, available_from, is_new, checked,
   deposit_protected, bills_included, amenities, name,
   area_es, area_en, copy_es, copy_en, details_es, details_en)
values
  ('pedro1', 'zaragoza', 'apartment', 'pedro', 41.65393, -0.90783, 4, '950 EUR', 950,
   null, null, 4.8, '2026-07-01', false, true, true, true,
   array['wifi', 'desk', 'lift', 'heating', 'kitchen'],
   'Pedro II el Católico 3 - 1 IZQ',
   'Universidad - Pedro II el Católico', 'University - Pedro II el Católico',
   'Piso amueblado en Pedro II el Católico 3, preparado para estancias de media duración en Zaragoza.',
   'Furnished flat at Pedro II el Católico 3, prepared for medium-stay rentals in Zaragoza.',
   'Primero izquierda en una ubicación urbana y bien comunicada, con cocina equipada, zona de trabajo y gestión local Ebrostay.',
   'First-floor left flat in a connected urban location, with equipped kitchen, work area, and local Ebrostay management.'),
  ('pedro2', 'zaragoza', 'apartment', 'pedro', 41.65416, -0.90756, 4, '980 EUR', 980,
   null, null, 4.7, '2026-07-10', true, true, true, true,
   array['wifi', 'desk', 'lift', 'heating', 'kitchen', 'ac'],
   'Pedro II el Católico 3 - 2 IZQ',
   'Universidad - Pedro II el Católico', 'University - Pedro II el Católico',
   'Segundo izquierda en el mismo edificio, una opción práctica para profesionales, estudiantes o traslados temporales.',
   'Second-floor left flat in the same building, practical for professionals, students, or temporary relocations.',
   'Vivienda amueblada con distribución funcional, wifi, calefacción y soporte local para llegada y estancia.',
   'Furnished home with functional layout, wifi, heating, and local support for arrival and stay.'),
  ('movera0', 'zaragoza', 'apartment', 'movera', 41.64929, -0.82209, 5, '870 EUR', 870,
   null, null, 4.9, '2026-08-03', false, true, true, false,
   array['wifi', 'heating', 'kitchen', 'terrace'],
   'Movera 7 - Planta Baja',
   'Movera', 'Movera',
   'Piso en planta baja en Movera 7, pensado para estancias tranquilas con acceso cómodo.',
   'Ground-floor flat at Movera 7, designed for calmer stays with easy access.',
   'Opción de planta baja con cocina equipada, buena capacidad y gestión cercana para incidencias o necesidades durante la estancia.',
   'Ground-floor option with equipped kitchen, good capacity, and local management for issues or needs during the stay.'),
  ('movera1', 'zaragoza', 'apartment', 'movera', 41.64952, -0.82182, 3, '1.350 EUR', 1350,
   'o 450 EUR/habitación', 'or 450 EUR/room', 4.7, '2026-07-01', true, true, true, true,
   array['wifi', 'desk', 'heating', 'kitchen', 'terrace'],
   'Movera 7 - Primera Planta',
   'Movera', 'Movera',
   'Piso de 3 habitaciones privadas en Movera 7, ideal para equipos de empresa, técnicos y estancias por proyecto.',
   'Three private bedrooms at Movera 7, ideal for company teams, technicians, and project stays.',
   'Tres dormitorios privados con salón, comedor y cocina equipada compartidos, baño completo y terraza. Gastos incluidos con suministros limitados a 50 EUR por habitación, autoentrada con lockbox y soporte 24/7. Piso completo o por habitaciones.',
   'Three private bedrooms with shared living, dining, and equipped kitchen, full bathroom, and terrace. Expenses included with utilities capped at 50 EUR per room, self check-in by lockbox, and 24/7 support. Whole flat or room by room.')
on conflict (id) do nothing;

insert into public.availability_blocks (property_id, start_date, end_date) values
  ('pedro1', '2026-06-20', '2026-06-24'),
  ('pedro1', '2026-07-04', '2026-07-10'),
  ('pedro1', '2026-08-12', '2026-08-18'),
  ('pedro2', '2026-06-27', '2026-07-03'),
  ('pedro2', '2026-07-18', '2026-07-22'),
  ('pedro2', '2026-08-10', '2026-08-14'),
  ('movera0', '2026-06-15', '2026-06-21'),
  ('movera0', '2026-07-26', '2026-08-02'),
  ('movera1', '2026-06-22', '2026-06-29'),
  ('movera1', '2026-08-01', '2026-08-16');

-- Details already stated in the listing texts
update public.properties set floor_number = coalesce(floor_number, 1) where id = 'pedro1';
update public.properties set floor_number = coalesce(floor_number, 2) where id = 'pedro2';
update public.properties set floor_number = coalesce(floor_number, 0) where id = 'movera0';
update public.properties set
  floor_number = coalesce(floor_number, 1),
  bedrooms = coalesce(bedrooms, 3),
  bathrooms = coalesce(bathrooms, 1),
  utilities_cap_eur = coalesce(utilities_cap_eur, 50),
  self_checkin = coalesce(self_checkin, true),
  min_stay_months = coalesce(min_stay_months, 1)
where id = 'movera1';

-- ---------------------------------------------------------------------------
-- After running this file:
-- 1. Sign up on the website with your own email.
-- 2. Make yourself admin by running (replace the email):
--    update public.profiles set is_admin = true where email = 'you@example.com';
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Property photos (also available separately as upgrade-2026-06-property-photos.sql)
-- ---------------------------------------------------------------------------

-- Photos metadata table -------------------------------------------------------

create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.properties (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists property_photos_property_idx
  on public.property_photos (property_id, sort_order);

alter table public.property_photos enable row level security;

drop policy if exists "Public can read property photos" on public.property_photos;
create policy "Public can read property photos"
  on public.property_photos for select
  using (true);

drop policy if exists "Admins manage property photos" on public.property_photos;
create policy "Admins manage property photos"
  on public.property_photos for all
  using (public.is_admin())
  with check (public.is_admin());

-- Storage bucket for the image files ------------------------------------------

insert into storage.buckets (id, name, public)
values ('property-photos', 'property-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read property photos" on storage.objects;
create policy "Public read property photos"
  on storage.objects for select
  using (bucket_id = 'property-photos');

drop policy if exists "Admins upload property photos" on storage.objects;
create policy "Admins upload property photos"
  on storage.objects for insert
  with check (bucket_id = 'property-photos' and public.is_admin());

drop policy if exists "Admins update property photos" on storage.objects;
create policy "Admins update property photos"
  on storage.objects for update
  using (bucket_id = 'property-photos' and public.is_admin());

drop policy if exists "Admins delete property photos" on storage.objects;
create policy "Admins delete property photos"
  on storage.objects for delete
  using (bucket_id = 'property-photos' and public.is_admin());
