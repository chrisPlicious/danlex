-- Court rentals: pick a play type (rental mode), hold free hours, pay, upload proof, confirmed.
--
-- Restored on 2026-11-15: the original file was never committed. Function bodies, constraints and
-- policies are copied from the live database (pg_get_functiondef / pg_get_constraintdef / pg_policies);
-- table layout, defaults and grants match the live schema. Already applied in production, so
-- db-apply skips it there.
--
-- Times are stored as timestamptz; opening hours and days are Asia/Manila local time.

create type public.booking_status as enum ('held', 'confirmed', 'cancelled', 'expired');

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

-- single row (id is always true)
create table public.court_settings (
  id boolean primary key default true check (id),
  bookings_open boolean not null default true,
  open_hour integer not null default 6 check (open_hour >= 0 and open_hour <= 23),
  close_hour integer not null default 22 check (close_hour >= 1 and close_hour <= 24),
  max_hours integer not null default 3 check (max_hours >= 1 and max_hours <= 12),
  days_ahead integer not null default 14 check (days_ahead >= 1 and days_ahead <= 90),
  currency text not null default 'PHP',
  payment_qr_path text,
  payment_instructions text,
  updated_at timestamptz not null default now(),
  check (close_hour > open_hour)
);

insert into public.court_settings default values on conflict (id) do nothing;

-- rental modes shown to customers; rate is per hour of court time
create table public.play_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  description text,
  rate numeric(10, 2) not null default 0 check (rate >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- placeholder modes and rates; edit them in /admin/court
insert into public.play_types (slug, name, description, rate, sort_order)
values
  ('beginner', 'Beginner', 'New to pickleball? Learn the basics and rally at an easy pace.', 150, 0),
  ('open-play', 'Open Play', 'Social games for all levels. Bring your crew or meet new players.', 1500, 1),
  ('per-hour', 'Per Hour', 'The whole court is yours. Practice, drills or a private match.', 350, 2)
on conflict (slug) do nothing;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  -- no cascade: retire a play type with active = false instead of deleting it
  play_type_id uuid not null references public.play_types (id),
  status public.booking_status not null default 'held',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hold_token uuid,
  hold_expires_at timestamptz,
  confirmation_code text unique,
  name text not null,
  phone text not null,
  email text,
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  payment_ref text,
  payment_proof_path text,
  source text not null default 'online' check (source = any (array['online', 'admin'])),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- one court: live holds and confirmed bookings never overlap
  constraint bookings_no_overlap exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
    where (status = any (array['held'::public.booking_status, 'confirmed'::public.booking_status]))
);

create trigger court_settings_touch before update on public.court_settings
  for each row execute function public.touch_updated_at();
create trigger play_types_touch before update on public.play_types
  for each row execute function public.touch_updated_at();
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- public availability: busy intervals only, no customer details
-- ---------------------------------------------------------------------------

create or replace function public.get_court_busy(p_day date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.starts_at, b.ends_at
    from public.bookings b
   where (b.status = 'confirmed' or (b.status = 'held' and b.hold_expires_at > now()))
     and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(
       p_day::timestamp at time zone 'Asia/Manila',
       (p_day + 1)::timestamp at time zone 'Asia/Manila',
       '[)'
     )
   order by b.starts_at;
$$;

grant execute on function public.get_court_busy(date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- step 1: hold the hours for 15 minutes (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.hold_booking(
  p_play_type_id uuid,
  p_starts_at timestamptz,
  p_hours integer,
  p_name text,
  p_phone text
)
returns table (id uuid, hold_token uuid, hold_expires_at timestamptz, amount numeric)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.court_settings;
  pt public.play_types;
  v_local timestamp := p_starts_at at time zone 'Asia/Manila';
  v_ends timestamptz;
  v_hour integer;
begin
  select * into s from public.court_settings limit 1;
  if not found or not s.bookings_open then
    raise exception 'BOOKINGS_CLOSED';
  end if;
  select * into pt from public.play_types where play_types.id = p_play_type_id;
  if not found or not pt.active then
    raise exception 'PLAY_TYPE_NOT_FOUND';
  end if;
  if pt.rate <= 0 then
    raise exception 'RATE_NOT_SET';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > s.max_hours then
    raise exception 'BAD_DURATION';
  end if;
  if date_trunc('hour', v_local) <> v_local then
    raise exception 'BAD_START';
  end if;
  v_hour := extract(hour from v_local)::integer;
  if v_hour < s.open_hour or v_hour + p_hours > s.close_hour then
    raise exception 'OUTSIDE_HOURS';
  end if;
  if p_starts_at <= now() then
    raise exception 'START_IN_PAST';
  end if;
  if v_local::date > (now() at time zone 'Asia/Manila')::date + s.days_ahead then
    raise exception 'TOO_FAR_AHEAD';
  end if;
  if (
    select count(*) from public.bookings b
     where b.status = 'held' and b.hold_expires_at > now() and b.phone = trim(p_phone)
  ) >= 2 then
    raise exception 'TOO_MANY_HOLDS';
  end if;

  v_ends := p_starts_at + make_interval(hours => p_hours);

  update public.bookings b
     set status = 'expired'
   where b.status = 'held' and b.hold_expires_at <= now()
     and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, v_ends, '[)');

  begin
    return query
    insert into public.bookings as b (
      play_type_id, starts_at, ends_at, hold_token, hold_expires_at, name, phone, amount
    ) values (
      pt.id, p_starts_at, v_ends, gen_random_uuid(), now() + interval '15 minutes',
      trim(p_name), trim(p_phone), pt.rate * p_hours
    )
    returning b.id, b.hold_token, b.hold_expires_at, b.amount;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;
end;
$$;

revoke all on function public.hold_booking(uuid, timestamptz, integer, text, text) from public, anon, authenticated;
grant execute on function public.hold_booking(uuid, timestamptz, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- step 2: attach the payment proof and confirm (service role only)
-- Returns status 'confirmed', or 'expired' when they paid after the hold lapsed and the time
-- was taken / had started — those rows get an admin note to refund or rebook.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_booking(
  p_booking_id uuid,
  p_hold_token uuid,
  p_email text,
  p_payment_ref text,
  p_payment_proof_path text
)
returns table (id uuid, confirmation_code text, status public.booking_status)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  bk public.bookings;
  v_code text;
begin
  select * into bk from public.bookings
   where bookings.id = p_booking_id and bookings.hold_token = p_hold_token
   for update;
  if not found or bk.status not in ('held', 'expired', 'confirmed') then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if bk.status = 'confirmed' then
    return query select bk.id, bk.confirmation_code, bk.status;
    return;
  end if;
  if bk.payment_proof_path is not null then
    -- already paid but lost the slot; nothing more to do
    return query select bk.id, bk.confirmation_code, bk.status;
    return;
  end if;
  if coalesce(p_payment_proof_path, '') not like bk.id::text || '/%' then
    raise exception 'PROOF_REQUIRED';
  end if;

  loop
    v_code := 'DLB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.bookings b where b.confirmation_code = v_code);
  end loop;

  update public.bookings b
     set confirmation_code = v_code,
         email = nullif(lower(trim(p_email)), ''),
         payment_ref = nullif(trim(p_payment_ref), ''),
         payment_proof_path = p_payment_proof_path
   where b.id = bk.id;

  update public.bookings b
     set status = 'expired'
   where b.id <> bk.id and b.status = 'held' and b.hold_expires_at <= now()
     and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(bk.starts_at, bk.ends_at, '[)');

  begin
    update public.bookings b
       set status = 'confirmed', hold_expires_at = null
     where b.id = bk.id and b.starts_at > now();
    if not found then
      raise exception 'START_IN_PAST';
    end if;
  exception
    when exclusion_violation then
      update public.bookings b
         set status = 'expired',
             admin_notes = 'Paid after the hold ran out and the time was taken. Refund or rebook.'
       where b.id = bk.id;
    when raise_exception then
      update public.bookings b
         set status = 'expired',
             admin_notes = 'Paid after the start time had passed. Refund or rebook.'
       where b.id = bk.id;
  end;

  return query select b.id, b.confirmation_code, b.status from public.bookings b where b.id = bk.id;
end;
$$;

revoke all on function public.confirm_booking(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_booking(uuid, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.court_settings enable row level security;
alter table public.play_types enable row level security;
alter table public.bookings enable row level security;

create policy "court settings public read" on public.court_settings
  for select using (true);
create policy "court settings admin write" on public.court_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "play types public read" on public.play_types
  for select using (active or public.is_admin());
create policy "play types admin write" on public.play_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- names and phone numbers: admins only (the public sees busy hours through get_court_busy)
create policy "bookings admin only" on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- payment proofs go in the existing payment-proofs bucket under <booking id>/,
-- covered by its admin read/delete policies.
