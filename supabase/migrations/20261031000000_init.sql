-- Danlex Pickle Court: tournaments, registrations, double-elimination brackets

create type public.tournament_status as enum ('draft', 'open', 'closed', 'in_progress', 'completed');
create type public.division_kind as enum ('singles', 'doubles');
create type public.registration_status as enum ('confirmed', 'rejected', 'withdrawn');
create type public.bracket_status as enum ('draft', 'published', 'completed');
create type public.match_side as enum ('W', 'L', 'GF');
create type public.match_status as enum ('pending', 'ready', 'live', 'completed', 'bye', 'not_needed');

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  event_date date,
  venue text,
  description text,
  currency text not null default 'PHP',
  payment_qr_path text,
  payment_instructions text,
  status public.tournament_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  kind public.division_kind not null,
  name text not null,
  slot_cap integer not null default 5 check (slot_cap >= 0),
  confirmed_count integer not null default 0,
  fee numeric(10, 2) not null default 0 check (fee >= 0),
  registration_open boolean not null default true,
  match_format jsonb not null default '{"games_to_win": 1, "points_to": 11, "win_by": 2}',
  grand_final_reset boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, name),
  -- lowering the cap below confirmed entries, or restoring an entry into a full division, fails here
  constraint divisions_cap_not_below_confirmed check (slot_cap >= confirmed_count)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete cascade,
  confirmation_code text not null unique,
  status public.registration_status not null default 'confirmed',
  player1_name text not null,
  player1_phone text not null,
  player1_email text not null,
  player2_name text,
  player2_phone text,
  player2_email text,
  team_name text,
  payment_proof_path text,
  payment_ref text,
  source text not null default 'online' check (source in ('online', 'admin')),
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index registrations_one_confirmed_per_email
  on public.registrations (division_id, lower(player1_email))
  where status = 'confirmed';
create index registrations_division_idx on public.registrations (division_id, status);

create table public.brackets (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null unique references public.divisions (id) on delete cascade,
  status public.bracket_status not null default 'draft',
  rng_seed bigint not null,
  grand_final_reset boolean not null default true,
  version integer not null default 0,
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  code text not null,
  side public.match_side not null,
  round integer not null,
  position integer not null,
  -- no cascade: an entrant already placed in a bracket cannot be deleted
  slot1_reg_id uuid references public.registrations (id),
  slot1_bye boolean not null default false,
  slot2_reg_id uuid references public.registrations (id),
  slot2_bye boolean not null default false,
  games jsonb not null default '[]',
  winner smallint check (winner in (1, 2)),
  walkover boolean not null default false,
  status public.match_status not null default 'pending',
  winner_to_code text,
  winner_to_slot smallint check (winner_to_slot in (1, 2)),
  loser_to_code text,
  loser_to_slot smallint check (loser_to_slot in (1, 2)),
  court text,
  scheduled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (bracket_id, code)
);

create index matches_bracket_idx on public.matches (bracket_id);

create trigger tournaments_touch before update on public.tournaments
  for each row execute function public.touch_updated_at();
create trigger divisions_touch before update on public.divisions
  for each row execute function public.touch_updated_at();
create trigger registrations_touch before update on public.registrations
  for each row execute function public.touch_updated_at();
create trigger brackets_touch before update on public.brackets
  for each row execute function public.touch_updated_at();
create trigger matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- slot counter: divisions.confirmed_count always mirrors confirmed registrations
-- ---------------------------------------------------------------------------

create or replace function public.recount_division(p_division_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.divisions d
     set confirmed_count = (
       select count(*) from public.registrations r
        where r.division_id = d.id and r.status = 'confirmed'
     )
   where d.id = p_division_id;
$$;

create or replace function public.registrations_recount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recount_division(new.division_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.division_id <> new.division_id) then
    perform public.recount_division(old.division_id);
  end if;
  return null;
end;
$$;

create trigger registrations_recount
  after insert or delete or update of status, division_id on public.registrations
  for each row execute function public.registrations_recount();

-- ---------------------------------------------------------------------------
-- public registration (called server-side with the service role only)
-- ---------------------------------------------------------------------------

create or replace function public.register_entry(
  p_division_id uuid,
  p_player1_name text,
  p_player1_phone text,
  p_player1_email text,
  p_player2_name text,
  p_player2_phone text,
  p_player2_email text,
  p_team_name text,
  p_payment_proof_path text,
  p_payment_ref text
)
returns table (id uuid, confirmation_code text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  d public.divisions;
  t public.tournaments;
  v_code text;
begin
  -- row lock serialises concurrent sign-ups for the same division
  select * into d from public.divisions where divisions.id = p_division_id for update;
  if not found then
    raise exception 'DIVISION_NOT_FOUND';
  end if;

  select * into t from public.tournaments where tournaments.id = d.tournament_id;
  if t.status <> 'open' or not d.registration_open then
    raise exception 'REGISTRATION_CLOSED';
  end if;
  if d.confirmed_count >= d.slot_cap then
    raise exception 'DIVISION_FULL';
  end if;
  if d.kind = 'doubles' and coalesce(trim(p_player2_name), '') = '' then
    raise exception 'PARTNER_REQUIRED';
  end if;
  if coalesce(p_payment_proof_path, '') not like d.id::text || '/%' then
    raise exception 'PROOF_REQUIRED';
  end if;
  if exists (
    select 1 from public.registrations r
     where r.division_id = d.id and r.status = 'confirmed'
       and lower(r.player1_email) = lower(trim(p_player1_email))
  ) then
    raise exception 'ALREADY_REGISTERED';
  end if;

  loop
    v_code := 'DLX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.registrations r where r.confirmation_code = v_code);
  end loop;

  return query
  insert into public.registrations as r (
    division_id, confirmation_code, player1_name, player1_phone, player1_email,
    player2_name, player2_phone, player2_email, team_name, payment_proof_path, payment_ref
  ) values (
    d.id, v_code, trim(p_player1_name), trim(p_player1_phone), lower(trim(p_player1_email)),
    nullif(trim(p_player2_name), ''), nullif(trim(p_player2_phone), ''),
    nullif(lower(trim(p_player2_email)), ''), nullif(trim(p_team_name), ''),
    p_payment_proof_path, nullif(trim(p_payment_ref), '')
  )
  returning r.id, r.confirmation_code;
end;
$$;

revoke all on function public.register_entry(uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_entry(uuid, text, text, text, text, text, text, text, text, text) to service_role;

-- display names only — no contact details leave the database for anonymous visitors
create or replace function public.get_public_entrants(p_division_id uuid)
returns table (id uuid, display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         case
           when r.team_name is not null then r.team_name
           when r.player2_name is not null then r.player1_name || ' / ' || r.player2_name
           else r.player1_name
         end,
         r.created_at
    from public.registrations r
   where r.division_id = p_division_id
     and (
       r.status = 'confirmed'
       -- keep names visible for anyone already placed in a published bracket
       or exists (
         select 1 from public.matches m join public.brackets b on b.id = m.bracket_id
          where b.division_id = p_division_id and b.status <> 'draft'
            and r.id in (m.slot1_reg_id, m.slot2_reg_id)
       )
     )
   order by r.created_at;
$$;

grant execute on function public.get_public_entrants(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bracket persistence (admin only, optimistic locking on brackets.version)
-- ---------------------------------------------------------------------------

create or replace function public.save_bracket(p_bracket_id uuid, p_version integer, p_matches jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_version integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  update public.brackets
     set version = version + 1
   where id = p_bracket_id and version = p_version
  returning version into v_version;
  if not found then
    raise exception 'STALE_BRACKET';
  end if;

  update public.matches m
     set slot1_reg_id = x.slot1_reg_id,
         slot1_bye = x.slot1_bye,
         slot2_reg_id = x.slot2_reg_id,
         slot2_bye = x.slot2_bye,
         games = x.games,
         winner = x.winner,
         walkover = x.walkover,
         status = x.status,
         court = x.court,
         scheduled_at = x.scheduled_at
    from jsonb_to_recordset(p_matches) as x (
      code text, slot1_reg_id uuid, slot1_bye boolean, slot2_reg_id uuid, slot2_bye boolean,
      games jsonb, winner smallint, walkover boolean, status public.match_status,
      court text, scheduled_at timestamptz
    )
   where m.bracket_id = p_bracket_id and m.code = x.code;

  return v_version;
end;
$$;

create or replace function public.create_bracket(
  p_division_id uuid,
  p_rng_seed bigint,
  p_grand_final_reset boolean,
  p_matches jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if exists (select 1 from public.brackets where division_id = p_division_id and status <> 'draft') then
    raise exception 'BRACKET_ALREADY_PUBLISHED';
  end if;

  delete from public.brackets where division_id = p_division_id;

  insert into public.brackets (division_id, rng_seed, grand_final_reset)
  values (p_division_id, p_rng_seed, p_grand_final_reset)
  returning id into v_id;

  insert into public.matches (
    bracket_id, code, side, round, position, slot1_reg_id, slot1_bye, slot2_reg_id, slot2_bye,
    games, winner, walkover, status, winner_to_code, winner_to_slot, loser_to_code, loser_to_slot
  )
  select v_id, x.code, x.side, x.round, x.position, x.slot1_reg_id, x.slot1_bye, x.slot2_reg_id,
         x.slot2_bye, x.games, x.winner, x.walkover, x.status, x.winner_to_code, x.winner_to_slot,
         x.loser_to_code, x.loser_to_slot
    from jsonb_to_recordset(p_matches) as x (
      code text, side public.match_side, round integer, position integer,
      slot1_reg_id uuid, slot1_bye boolean, slot2_reg_id uuid, slot2_bye boolean,
      games jsonb, winner smallint, walkover boolean, status public.match_status,
      winner_to_code text, winner_to_slot smallint, loser_to_code text, loser_to_slot smallint
    );

  return v_id;
end;
$$;

grant execute on function public.save_bracket(uuid, integer, jsonb) to authenticated;
grant execute on function public.create_bracket(uuid, bigint, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.tournaments enable row level security;
alter table public.divisions enable row level security;
alter table public.registrations enable row level security;
alter table public.brackets enable row level security;
alter table public.matches enable row level security;

create policy "tournaments public read" on public.tournaments
  for select using (status <> 'draft' or public.is_admin());
create policy "tournaments admin write" on public.tournaments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "divisions public read" on public.divisions
  for select using (
    public.is_admin() or exists (
      select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'draft'
    )
  );
create policy "divisions admin write" on public.divisions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "registrations admin only" on public.registrations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "brackets public read" on public.brackets
  for select using (status <> 'draft' or public.is_admin());
create policy "brackets admin write" on public.brackets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "matches public read" on public.matches
  for select using (
    public.is_admin() or exists (
      select 1 from public.brackets b where b.id = bracket_id and b.status <> 'draft'
    )
  );
create policy "matches admin write" on public.matches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('public-assets', 'public-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

-- proofs are uploaded through server-issued signed URLs; only admins may read or manage them
create policy "payment proofs admin read" on storage.objects
  for select to authenticated using (bucket_id = 'payment-proofs' and public.is_admin());
create policy "payment proofs admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'payment-proofs' and public.is_admin());

create policy "public assets admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'public-assets' and public.is_admin());
create policy "public assets admin update" on storage.objects
  for update to authenticated using (bucket_id = 'public-assets' and public.is_admin());
create policy "public assets admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'public-assets' and public.is_admin());

-- ---------------------------------------------------------------------------
-- realtime: live slot counters and bracket updates
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.divisions, public.brackets, public.matches;
