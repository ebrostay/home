-- Ebrostay upgrade: property address, tenant guest info, booking customer names
-- Run date: 2026-06-12 (already applied to the live project via migration
-- "property_address_guest_info_booking_names"; kept here for reference).

-- Street address shown publicly and on invoices
alter table public.properties add column if not exists address text;

-- Payer name captured by Stripe Checkout
alter table public.bookings add column if not exists customer_name text;

-- Tenant-only stay information: never exposed in public search results.
-- Readable only by admins and by users with a paid booking or an
-- admin-assigned stay on that property.
create table if not exists public.property_guest_info (
  property_id text primary key references public.properties (id) on delete cascade,
  wifi_name text,
  wifi_password text,
  key_pickup text,
  checkin_time text,
  checkout_time text,
  emergency_phone text,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.property_guest_info enable row level security;

drop policy if exists "Admins manage guest info" on public.property_guest_info;
create policy "Admins manage guest info"
  on public.property_guest_info for all
  using (is_admin()) with check (is_admin());

drop policy if exists "Guests read own stay info" on public.property_guest_info;
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

-- Floor plans: photos flagged as layout drawings, shown in their own
-- section on the property detail page and excluded from the gallery.
alter table public.property_photos add column if not exists is_floorplan boolean not null default false;
