-- Open play scoring: partner modes, a 5-game cap per player, timed games that always have a winner,
-- and what the standings need to break ties. Also a GCash receiver name and number beside each QR.
--
--   * sessions.partner_mode
--       'random' – new partners every game; wins and losses count for each player on their own
--       'fixed'  – the admin pairs players up and each pair plays every game together
--   * sessions.tiebreak: how players (or pairs) level on wins and losses are separated
--       'win_time'        – lower average length of the games they won
--       'last_two_losses' – lower total of their own points in their two most recent losses
--     The other method is used next if they're still level.
--   * session_signups.partner_id: the partner in fixed mode, always mutual (admin_set_partner).
--   * Nobody plays more than 5 finished games (admin_start_game refuses a 6th).
--   * A game is timed from Start game (started_at) to Finish game (ended_at). Both scores are now
--     required and can't be level, so every game has a winner.
--
-- Backward compatible: no existing function changes its arguments.

alter table public.sessions
  add column partner_mode text not null default 'random' check (partner_mode in ('random', 'fixed')),
  add column tiebreak text not null default 'win_time' check (tiebreak in ('win_time', 'last_two_losses'));

alter table public.session_signups
  add column partner_id uuid references public.session_signups (id) on delete set null;

-- who receives the money, so players can send to the number instead of scanning
alter table public.tournaments
  add column payment_name text check (char_length(payment_name) between 1 and 60),
  add column payment_number text check (payment_number ~ '^09[0-9]{9}$');

alter table public.court_settings
  add column payment_name text check (char_length(payment_name) between 1 and 60),
  add column payment_number text check (payment_number ~ '^09[0-9]{9}$');

-- ---------------------------------------------------------------------------
-- public read: the queue board also needs partners and the session's scoring rules
-- ---------------------------------------------------------------------------

create or replace function public.get_session_queue(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'partnerMode', (select s.partner_mode from public.sessions s where s.id = p_session_id),
    'tiebreak', (select s.tiebreak from public.sessions s where s.id = p_session_id),
    'maxGames', 5, -- same cap as admin_start_game
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', case
          when position(' ' in trim(p.name)) > 0
            then split_part(trim(p.name), ' ', 1) || ' ' || upper(left(regexp_replace(trim(p.name), '^.*\s', ''), 1)) || '.'
          else trim(p.name) end,
        'level', p.level,
        'checkedInAt', p.checked_in_at,
        'paused', p.queue_paused,
        'partnerId', p.partner_id,
        'lastEndedAt', (
          select max(g.ended_at) from public.session_games g
           where g.session_id = p.session_id and g.status = 'done' and p.id = any (g.team1 || g.team2))
      ) order by p.checked_in_at nulls last, p.created_at)
      from public.session_signups p
      where p.session_id = p_session_id and p.status = 'confirmed'
    ), '[]'::jsonb),
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'number', g.number, 'status', g.status, 'team1', g.team1, 'team2', g.team2,
        'score1', g.score1, 'score2', g.score2, 'startedAt', g.started_at, 'endedAt', g.ended_at
      ) order by g.number desc)
      from public.session_games g
      where g.session_id = p_session_id and g.status <> 'void'
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- admin
-- ---------------------------------------------------------------------------

-- partner mode and tiebreak; the partner mode is locked once a game has been played
create or replace function public.admin_set_session_play(p_id uuid, p_partner_mode text, p_tiebreak text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select * into s from public.sessions where id = p_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if p_partner_mode is distinct from s.partner_mode and exists (
    select 1 from public.session_games where session_id = p_id and status in ('playing', 'done')
  ) then
    raise exception 'MODE_LOCKED';
  end if;
  update public.sessions
     set partner_mode = p_partner_mode, tiebreak = p_tiebreak, version = version + 1
   where id = p_id;
end;
$$;

-- fixed partners: pair two confirmed players (each leaves any old partner), or unpair with null
create or replace function public.admin_set_partner(p_signup_id uuid, p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.session_signups;
  p public.session_signups;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select * into r from public.session_signups where id = p_signup_id;
  if not found then
    raise exception 'SIGNUP_NOT_FOUND';
  end if;
  perform 1 from public.sessions where id = r.session_id for update;
  select * into r from public.session_signups where id = p_signup_id;

  if p_partner_id is not null then
    select * into p from public.session_signups where id = p_partner_id and session_id = r.session_id;
    if not found or p.id = r.id then
      raise exception 'BAD_PARTNER';
    end if;
    if r.status <> 'confirmed' or p.status <> 'confirmed' then
      raise exception 'NOT_CONFIRMED';
    end if;
  end if;

  -- nobody changes partner in the middle of a game
  if exists (
    select 1 from public.session_games
     where session_id = r.session_id and status = 'playing'
       and (team1 || team2) && array_remove(array[r.id, r.partner_id, p.id, p.partner_id], null)
  ) then
    raise exception 'ON_COURT';
  end if;

  update public.session_signups
     set partner_id = null
   where session_id = r.session_id
     and (id = r.id or partner_id = r.id or (p_partner_id is not null and (id = p_partner_id or partner_id = p_partner_id)));
  if p_partner_id is not null then
    update public.session_signups set partner_id = p_partner_id where id = r.id;
    update public.session_signups set partner_id = r.id where id = p_partner_id;
  end if;
  update public.sessions set version = version + 1 where id = r.session_id;
end;
$$;

-- game queue: 2v2 from four checked-in, unpaused players; one game playing at a time.
-- Nobody past 5 finished games; in fixed mode each team must be a pair.
create or replace function public.admin_start_game(p_session_id uuid, p_team1 uuid[], p_team2 uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_mode text;
  v_players uuid[] := p_team1 || p_team2;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select partner_mode into v_mode from public.sessions where id = p_session_id and status = 'scheduled' for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if cardinality(p_team1) <> 2 or cardinality(p_team2) <> 2
     or (select count(distinct x) from unnest(v_players) x) <> 4 then
    raise exception 'BAD_TEAMS';
  end if;
  if exists (select 1 from public.session_games where session_id = p_session_id and status = 'playing') then
    raise exception 'GAME_IN_PROGRESS';
  end if;
  if (
    select count(*) from public.session_signups
     where session_id = p_session_id and id = any (v_players)
       and status = 'confirmed' and checked_in_at is not null and not queue_paused
  ) <> 4 then
    raise exception 'PLAYER_NOT_READY';
  end if;
  if exists (
    select 1 from unnest(v_players) x
     where (
       select count(*) from public.session_games g
        where g.session_id = p_session_id and g.status = 'done' and x = any (g.team1 || g.team2)
     ) >= 5
  ) then
    raise exception 'GAME_LIMIT';
  end if;
  if v_mode = 'fixed' and (
    select count(*) from public.session_signups
     where session_id = p_session_id
       and ((id = p_team1[1] and partner_id = p_team1[2]) or (id = p_team1[2] and partner_id = p_team1[1])
         or (id = p_team2[1] and partner_id = p_team2[2]) or (id = p_team2[2] and partner_id = p_team2[1]))
  ) <> 4 then
    raise exception 'NOT_PARTNERS';
  end if;

  insert into public.session_games (session_id, number, team1, team2)
  values (
    p_session_id,
    coalesce((select max(number) from public.session_games where session_id = p_session_id), 0) + 1,
    p_team1, p_team2
  )
  returning id into v_id;
  update public.sessions set version = version + 1 where id = p_session_id;
  return v_id;
end;
$$;

-- finish (or correct the score of) a game: both scores, not level, so there is always a winner.
-- The clock stops the first time it's finished; a later score fix keeps the recorded time.
create or replace function public.admin_finish_game(p_game_id uuid, p_score1 integer, p_score2 integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select session_id into v_session from public.session_games where id = p_game_id;
  if v_session is null then
    raise exception 'GAME_NOT_FOUND';
  end if;
  perform 1 from public.sessions where id = v_session for update;
  if p_score1 is null or p_score2 is null or p_score1 = p_score2 then
    raise exception 'BAD_SCORE';
  end if;
  update public.session_games
     set status = 'done', ended_at = coalesce(ended_at, now()), score1 = p_score1, score2 = p_score2
   where id = p_game_id and status in ('playing', 'done');
  update public.sessions set version = version + 1 where id = v_session;
end;
$$;

revoke all on function public.admin_set_session_play(uuid, text, text) from public, anon;
revoke all on function public.admin_set_partner(uuid, uuid) from public, anon;
grant execute on function public.admin_set_session_play(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_set_partner(uuid, uuid) to authenticated, service_role;
