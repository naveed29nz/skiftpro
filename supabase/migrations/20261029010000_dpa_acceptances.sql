-- Acceptance of the SkiftPro databehandleravtale.
-- Org managers can read their own organisation. Superadmins can read all.
-- Only the organisation admin can insert, and only a row for themselves.
-- Do not apply this file from the app. It is applied separately.
-- Preview deploys share the production database, so the app must keep working
-- when this table and accept_dpa() are not there yet.

create table public.dpa_acceptances (
  id text primary key default gen_random_uuid()::text,
  org_id text not null references public.organizations (id) on delete cascade,
  user_id text not null,
  dpa_version text not null,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text,
  constraint dpa_acceptances_version_nonempty check (btrim(dpa_version) <> ''),
  constraint dpa_acceptances_version_len check (char_length(dpa_version) <= 40),
  constraint dpa_acceptances_ip_len check (ip is null or char_length(ip) <= 80),
  constraint dpa_acceptances_ua_len check (user_agent is null or char_length(user_agent) <= 500),
  constraint dpa_acceptances_org_user_version unique (org_id, user_id, dpa_version)
);

comment on table public.dpa_acceptances is
  'One row when an organisation admin accepts a databehandleravtale version.';

alter table public.dpa_acceptances enable row level security;

create policy dpa_acceptances_select on public.dpa_acceptances
  for select to authenticated
  using (public.is_org_manager(org_id));

create policy dpa_acceptances_insert on public.dpa_acceptances
  for insert to authenticated
  with check (
    user_id = auth.uid()::text
    and public.current_app_role() = 'admin'
    and not public.is_super_admin()
    and exists (
      select 1
      from public.organizations o
      join public.profiles p on p.id = auth.uid()::text
      where o.id = org_id
        and (
          o.admin_user_id = p.id
          or (
            o.admin_email is not null
            and btrim(o.admin_email) <> ''
            and lower(o.admin_email) = lower(coalesce(p.email, ''))
          )
        )
    )
  );

revoke all on table public.dpa_acceptances from public, anon, authenticated;
grant select, insert on table public.dpa_acceptances to authenticated;

create or replace function public.accept_dpa(
  p_org_id text,
  p_version text,
  p_user_agent text default null
)
returns public.dpa_acceptances
language plpgsql
security invoker
set search_path = public
as $$
declare
  headers json;
  forwarded text;
  created public.dpa_acceptances;
  agent text;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget' using errcode = '42501';
  end if;
  if p_org_id is null or btrim(p_org_id) = '' or p_version is null or btrim(p_version) = '' then
    raise exception 'Organisasjon eller versjon mangler' using errcode = '22023';
  end if;

  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;

  forwarded := nullif(left(btrim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)), 80), '');
  agent := nullif(left(btrim(coalesce(p_user_agent, headers->>'user-agent', '')), 500), '');

  insert into public.dpa_acceptances (org_id, user_id, dpa_version, ip, user_agent)
  values (
    btrim(p_org_id),
    auth.uid()::text,
    left(btrim(p_version), 40),
    coalesce(forwarded, nullif(left(btrim(coalesce(headers->>'x-real-ip', '')), 80), '')),
    agent
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.accept_dpa(text, text, text) from public, anon;
grant execute on function public.accept_dpa(text, text, text) to authenticated;
