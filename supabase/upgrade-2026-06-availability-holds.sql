-- Ebrostay upgrade: availability holds + overlap guard
-- Applied live via migration "availability_holds_and_overlap_guard" (2026-06-13).

create extension if not exists btree_gist;

-- NULL hold_expires_at = confirmed block; a future timestamp = temporary hold
-- placed while a checkout is in progress.
alter table public.availability_blocks add column if not exists hold_expires_at timestamptz;

-- Two overlapping CONFIRMED blocks for the same property are impossible.
alter table public.availability_blocks drop constraint if exists availability_no_overlap;
alter table public.availability_blocks
  add constraint availability_no_overlap
  exclude using gist (
    property_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (hold_expires_at is null);
