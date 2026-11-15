-- Tournament days close the court to rentals: the whole day shows as busy and holds are refused.
-- A tournament counts once it is out of draft and has an event_date.
-- Only create-or-replace statements, so running this twice is harmless.

create or replace function public.is_tournament_day(p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
     where t.event_date = p_day and t.status <> 'draft'
  );
$$;

revoke all on function public.is_tournament_day(date) from public, anon, authenticated;

-- same as before, plus the full day when a tournament is on
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
  union all
  select p_day::timestamp at time zone 'Asia/Manila',
         (p_day + 1)::timestamp at time zone 'Asia/Manila'
   where public.is_tournament_day(p_day)
  order by 1;
$$;

grant execute on function public.get_court_busy(date) to anon, authenticated;

-- same as 20261113010000_court_bookings, plus the TOURNAMENT_DAY check
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
  if public.is_tournament_day(v_local::date) then
    raise exception 'TOURNAMENT_DAY';
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
