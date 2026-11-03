-- Singles entries never store partner/team fields, even if a caller sends them.
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
  v_doubles boolean;
begin
  select * into d from public.divisions where divisions.id = p_division_id for update;
  if not found then
    raise exception 'DIVISION_NOT_FOUND';
  end if;
  v_doubles := d.kind = 'doubles';

  select * into t from public.tournaments where tournaments.id = d.tournament_id;
  if t.status <> 'open' or not d.registration_open then
    raise exception 'REGISTRATION_CLOSED';
  end if;
  if d.confirmed_count >= d.slot_cap then
    raise exception 'DIVISION_FULL';
  end if;
  if v_doubles and coalesce(trim(p_player2_name), '') = '' then
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
    case when v_doubles then nullif(trim(p_player2_name), '') end,
    case when v_doubles then nullif(trim(p_player2_phone), '') end,
    case when v_doubles then nullif(lower(trim(p_player2_email)), '') end,
    case when v_doubles then nullif(trim(p_team_name), '') end,
    p_payment_proof_path, nullif(trim(p_payment_ref), '')
  )
  returning r.id, r.confirmation_code;
end;
$$;

revoke all on function public.register_entry(uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_entry(uuid, text, text, text, text, text, text, text, text, text) to service_role;

-- tidy any singles rows that were written with partner data before this fix
update public.registrations r
   set player2_name = null, player2_phone = null, player2_email = null, team_name = null
  from public.divisions d
 where d.id = r.division_id and d.kind = 'singles'
   and (r.player2_name is not null or r.team_name is not null);
