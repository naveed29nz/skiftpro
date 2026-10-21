-- Self-registered employees must join an existing worker card.
-- They must not fall through to start_organization() and become admin of a new trial org.
-- Do not apply this file from the app. It is applied separately.

alter table public.profiles
  add column if not exists signup_kind text;

comment on column public.profiles.signup_kind is
  'Self-serve intent from auth metadata: employee or business. Null for accounts created before this column.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := coalesce(new.raw_user_meta_data->>'role', 'user');
  self_serve boolean := coalesce(new.raw_user_meta_data->>'signup', '') = 'self_serve';
  terms boolean := coalesce(new.raw_user_meta_data->>'terms_accepted', '') in ('true', '1');
begin
  -- Self-serve stays a normal user until start_organization() links an org
  -- and promotes them. An unlinked admin would otherwise look like super-admin.
  if self_serve then
    requested := 'user';
  elsif requested not in ('admin', 'sub_admin', 'butikksjef', 'user') then
    requested := 'user';
  end if;

  insert into public.profiles (id, email, full_name, role, created_by, terms_accepted_at, signup_kind)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    requested,
    new.id::text,
    case when terms then now() else null end,
    new.raw_user_meta_data->>'signup_kind'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at),
        signup_kind = coalesce(public.profiles.signup_kind, excluded.signup_kind);

  return new;
end;
$$;

-- Link the signed-in profile to an active worker card.
-- Email wins. A phone match is only used for a card with an empty email, and only
-- when exactly one active card has the same last 8 digits. Never promotes to admin.
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
  card_id text;
  actor_email text;
  phone_digits text;
  phone_tail text;
  match_count integer;
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
  card_id := null;

  if actor_email <> '' then
    select w.id into card_id
    from public.workers w
    where w.status = 'active'
      and lower(btrim(coalesce(w.email, ''))) = actor_email
    order by w.created_date asc nulls last, w.id asc
    limit 1;
  end if;

  if card_id is null and p_phone is not null and btrim(p_phone) <> '' then
    phone_digits := regexp_replace(p_phone, '\D', '', 'g');
    if length(phone_digits) >= 8 then
      phone_tail := right(phone_digits, 8);
      select count(*)::integer into match_count
      from public.workers w
      where w.status = 'active'
        and btrim(coalesce(w.email, '')) = ''
        and length(regexp_replace(coalesce(w.phone, ''), '\D', '', 'g')) >= 8
        and right(regexp_replace(coalesce(w.phone, ''), '\D', '', 'g'), 8) = phone_tail;

      if match_count = 1 then
        select w.id into card_id
        from public.workers w
        where w.status = 'active'
          and btrim(coalesce(w.email, '')) = ''
          and length(regexp_replace(coalesce(w.phone, ''), '\D', '', 'g')) >= 8
          and right(regexp_replace(coalesce(w.phone, ''), '\D', '', 'g'), 8) = phone_tail
        limit 1;
      end if;
    end if;
  end if;

  if card_id is null then
    return;
  end if;

  select * into card from public.workers where id = card_id;
  if not found then
    return;
  end if;

  if btrim(coalesce(card.email, '')) = '' and actor_email <> '' then
    update public.workers as w
      set email = btrim(actor.email)
      where w.id = card.id
        and btrim(coalesce(w.email, '')) = '';
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

create or replace function public.start_organization(
  p_name text,
  p_org_number text,
  p_phone text,
  p_store_name text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  created public.organizations;
  store_name text;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget' using errcode = '42501';
  end if;

  select * into actor from public.profiles where id = auth.uid()::text;
  if actor.terms_accepted_at is null then
    raise exception 'Samtykke mangler' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.workers w
    where w.status = 'active'
      and btrim(coalesce(w.email, '')) <> ''
      and lower(btrim(w.email)) = lower(btrim(coalesce(actor.email, '')))
  ) then
    raise exception 'Du er registrert som ansatt. Logg inn som ansatt.' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_org_ids()) then
    raise exception 'Du tilhører allerede en organisasjon' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Organisasjonsnavn mangler' using errcode = '42501';
  end if;

  store_name := coalesce(nullif(btrim(p_store_name), ''), btrim(p_name));

  insert into public.organizations (
    name, org_number, contact_phone, contact_email, admin_user_id, admin_email,
    status, plan, trial_ends_at, store_quantity
  )
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_org_number, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    actor.email,
    actor.id,
    actor.email,
    'trial',
    'basic',
    now() + interval '30 days',
    1
  )
  returning * into created;

  perform set_config('skiftpro.allow_role_change', '1', true);
  update public.profiles set role = 'admin' where id = actor.id;

  insert into public.workplace_settings (org_id, workplace_name, team1_name, active_teams_count)
  values (created.id, store_name, store_name, 1);

  return created;
end;
$$;

revoke all on function public.start_organization(text, text, text, text) from public;
grant execute on function public.start_organization(text, text, text, text) to authenticated;
