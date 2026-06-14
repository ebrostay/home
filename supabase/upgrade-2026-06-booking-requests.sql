-- Ebrostay upgrade: booking requests (replaces Stripe online payment)
-- Safe to run more than once.
--
-- Instead of charging online, a signed-in guest sends a booking request.
-- The request-booking Edge Function (service role) computes the fees and
-- writes a row here, then emails Ebrostay. We review the email / this table
-- and, when we accept, mark the property taken from the property editor.

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  customer_email text,
  property_id text references public.properties (id) on delete set null,
  property_name text,
  start_date date not null,
  end_date date not null,
  months integer,
  rent_eur numeric(10, 2),
  commission_eur numeric(10, 2),
  deposit_eur numeric(10, 2),
  total_eur numeric(10, 2),
  tenant_names text,
  -- new | contacted | confirmed | declined
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.booking_requests enable row level security;

-- Rows are written only by the Edge Function (service role bypasses RLS),
-- so there is no insert policy for anon/authenticated clients.
drop policy if exists "Users read own booking requests" on public.booking_requests;
create policy "Users read own booking requests"
  on public.booking_requests for select
  using (auth.uid() = user_id);

drop policy if exists "Admins read booking requests" on public.booking_requests;
create policy "Admins read booking requests"
  on public.booking_requests for select
  using (public.is_admin());

drop policy if exists "Admins update booking requests" on public.booking_requests;
create policy "Admins update booking requests"
  on public.booking_requests for update
  using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_booking_requests_created on public.booking_requests (created_at desc);
