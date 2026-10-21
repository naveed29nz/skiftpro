-- Email-only worker card claim. p_phone is kept for frontend compatibility and ignored.
create or replace function public.claim_worker_card(p_phone text default null)
returns table (
  org_id text,
  worker_id text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  card public.workers;
  actor_email text;
  resolved_role text;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget' using errcode = '42501';
  end if;

  select * into actor from public.profiles where id = auth.uid()::text;
  if not found then
    raise exception 'Ikke innlogget' using errcode = '42501';
  end if;

  actor_email := lower(btrim(coalesce(actor.email, '')));
  if actor_email = '' then
    return;
  end if;

  select w.* into card
  from public.workers w
  where w.status = 'active'
    and lower(btrim(coalesce(w.email, ''))) = actor_email
  order by w.created_date asc nulls last, w.id asc
  limit 1;

  if not found then
    return;
  end if;

  if actor.role is distinct from 'admin' then
    if card.role in ('sub_admin', 'butikksjef', 'user') then
      resolved_role := card.role;
    else
      resolved_role := 'user';
    end if;
    perform set_config('skiftpro.allow_role_change', '1', true);
    update public.profiles as p
      set role = resolved_role
      where p.id = actor.id
        and p.role is distinct from 'admin';
  else
    resolved_role := actor.role;
  end if;

  return query
  select card.org_id, card.id, resolved_role;
end;
$$;

revoke all on function public.claim_worker_card(text) from public;
grant execute on function public.claim_worker_card(text) to authenticated;
