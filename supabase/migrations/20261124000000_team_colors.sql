-- Optional team colour (e.g. shirt colour), shown as the background of the team's bracket cells.

alter table public.registrations
  add column color text check (color ~ '^#[0-9a-f]{6}$');

-- The return type changes, so the function has to be dropped and recreated.
drop function public.get_public_entrants(uuid);

-- display names and colours only — no contact details leave the database for anonymous visitors
create function public.get_public_entrants(p_division_id uuid)
returns table (id uuid, display_name text, color text, created_at timestamptz)
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
         r.color,
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
