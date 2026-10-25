-- Business signup must store the company and the contact person separately,
-- and every new organization gets the next 5-digit customer number.
-- Existing rows are not updated. A customer who already lacks an organisation
-- number keeps that row until their own admin submits the completion form.
-- Do not apply this file from the app. It is applied separately.

create or replace function public.org_number_valid(p_value text)
returns boolean
language plpgsql
immutable
as $$
declare
  digits text;
  weights int[] := array[3, 2, 7, 6, 5, 4, 3, 2];
  i int;
  total int := 0;
  rest int;
begin
  digits := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  if digits !~ '^[0-9]{9}$' then
    return false;
  end if;
  for i in 1..8 loop
    total := total + weights[i] * substr(digits, i, 1)::int;
  end loop;
  rest := 11 - (total % 11);
  if rest = 11 then
    rest := 0;
  elsif rest = 10 then
    return false;
  end if;
  return substr(digits, 9, 1)::int = rest;
end;
$$;

revoke all on function public.org_number_valid(text) from public;
grant execute on function public.org_number_valid(text) to authenticated;

create sequence public.organization_customer_number_seq as bigint;

do $$
declare
  floor_value bigint := 778;
  current_max bigint;
begin
  select max(customer_number::bigint)
    into current_max
  from public.organizations
  where customer_number ~ '^[0-9]{1,12}$';

  -- is_called true: the next nextval is one past the current maximum.
  -- Floor 778 keeps a database whose highest number is 00778 issuing 00779.
  perform setval(
    'public.organization_customer_number_seq',
    greatest(floor_value, coalesce(current_max, 0)),
    true
  );
end
$$;

revoke all on sequence public.organization_customer_number_seq from public, anon, authenticated, service_role;

create or replace function public.assign_organization_customer_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.customer_number := lpad(nextval('public.organization_customer_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

revoke all on function public.assign_organization_customer_number() from public;

-- Name sorts before organizations_prepare so the number is set first.
create trigger organizations_assign_customer_number
  before insert on public.organizations
  for each row
  execute function public.assign_organization_customer_number();

drop function if exists public.start_organization(text, text, text, text);

create or replace function public.start_organization(
  p_name text,
  p_org_number text,
  p_phone text,
  p_store_name text,
  p_contact_name text,
  p_store_count integer
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
  digits text;
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
    raise exception 'Firmanavn mangler' using errcode = '42501';
  end if;

  digits := regexp_replace(coalesce(p_org_number, ''), '[^0-9]', '', 'g');
  if not public.org_number_valid(digits) then
    raise exception 'Organisasjonsnummeret er ugyldig' using errcode = '42501';
  end if;
  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Telefon mangler' using errcode = '42501';
  end if;
  if p_contact_name is null or btrim(p_contact_name) = '' then
    raise exception 'Kontaktperson mangler' using errcode = '42501';
  end if;
  if p_store_count is null or p_store_count < 1 or p_store_count > 100 then
    raise exception 'Antall butikker må være mellom 1 og 100' using errcode = '42501';
  end if;

  store_name := coalesce(nullif(btrim(p_store_name), ''), btrim(p_name));

  insert into public.organizations (
    name, org_number, contact_name, contact_phone, contact_email,
    admin_user_id, admin_email, status, plan, trial_ends_at, store_quantity
  )
  values (
    btrim(p_name),
    digits,
    btrim(p_contact_name),
    btrim(p_phone),
    actor.email,
    actor.id,
    actor.email,
    'trial',
    'basic',
    now() + interval '30 days',
    p_store_count
  )
  returning * into created;

  perform set_config('skiftpro.allow_role_change', '1', true);
  update public.profiles
    set role = 'admin',
        full_name = btrim(p_contact_name)
    where id = actor.id;

  insert into public.workplace_settings (org_id, workplace_name, team1_name, active_teams_count)
  values (created.id, store_name, store_name, 1);

  return created;
end;
$$;

revoke all on function public.start_organization(text, text, text, text, text, integer) from public;
grant execute on function public.start_organization(text, text, text, text, text, integer) to authenticated;

create or replace function public.complete_organization_profile(
  p_name text,
  p_org_number text,
  p_contact_name text,
  p_phone text,
  p_store_count integer
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  target public.organizations;
  digits text;
  assigned text;
  updated public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget' using errcode = '42501';
  end if;

  select * into actor from public.profiles where id = auth.uid()::text;
  if actor.id is null then
    raise exception 'Ikke innlogget' using errcode = '42501';
  end if;

  select * into target
  from public.organizations o
  where o.admin_user_id = actor.id
     or (
       nullif(btrim(coalesce(actor.email, '')), '') is not null
       and lower(btrim(o.admin_email)) = lower(btrim(actor.email))
     )
  order by case when o.admin_user_id = actor.id then 0 else 1 end, o.created_date
  limit 1;

  if target.id is null then
    raise exception 'Bare administrator for organisasjonen kan fylle ut dette.' using errcode = '42501';
  end if;
  if public.org_number_valid(target.org_number) then
    raise exception 'Organisasjonsnummeret er allerede registrert' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Firmanavn mangler' using errcode = '42501';
  end if;

  digits := regexp_replace(coalesce(p_org_number, ''), '[^0-9]', '', 'g');
  if not public.org_number_valid(digits) then
    raise exception 'Organisasjonsnummeret er ugyldig' using errcode = '42501';
  end if;
  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Telefon mangler' using errcode = '42501';
  end if;
  if p_contact_name is null or btrim(p_contact_name) = '' then
    raise exception 'Kontaktperson mangler' using errcode = '42501';
  end if;
  if p_store_count is null or p_store_count < 1 or p_store_count > 100 then
    raise exception 'Antall butikker må være mellom 1 og 100' using errcode = '42501';
  end if;

  assigned := nullif(btrim(coalesce(target.customer_number, '')), '');
  if assigned is null then
    assigned := lpad(nextval('public.organization_customer_number_seq')::text, 5, '0');
  end if;

  update public.organizations
    set name = btrim(p_name),
        org_number = digits,
        contact_name = btrim(p_contact_name),
        contact_phone = btrim(p_phone),
        contact_email = actor.email,
        admin_email = coalesce(nullif(btrim(coalesce(admin_email, '')), ''), actor.email),
        store_quantity = p_store_count,
        customer_number = assigned
    where id = target.id
    returning * into updated;

  update public.profiles
    set full_name = btrim(p_contact_name)
    where id = actor.id;

  return updated;
end;
$$;

revoke all on function public.complete_organization_profile(text, text, text, text, integer) from public;
grant execute on function public.complete_organization_profile(text, text, text, text, integer) to authenticated;
