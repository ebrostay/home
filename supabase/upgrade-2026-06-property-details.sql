-- Ebrostay upgrade: richer property details
-- Adds rooms/size, rental conditions, policies, energy rating, beds, video.
-- Run in the Supabase SQL Editor of the EXISTING project. Safe to run twice.

alter table public.properties
  add column if not exists bedrooms integer,
  add column if not exists bathrooms integer,
  add column if not exists size_m2 integer,
  add column if not exists floor_number integer,
  add column if not exists min_stay_months integer,
  add column if not exists max_stay_months integer,
  add column if not exists deposit_amount integer,
  add column if not exists upfront_rent_eur integer,
  add column if not exists utilities_cap_eur integer,
  add column if not exists pets_allowed boolean,
  add column if not exists smoking_allowed boolean,
  add column if not exists couples_allowed boolean,
  add column if not exists self_checkin boolean,
  add column if not exists energy_rating text,
  add column if not exists video_url text,
  add column if not exists beds_es text,
  add column if not exists beds_en text;

-- Seed only the values already stated in the existing listing texts
-- (coalesce keeps any value an admin has set since).
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
