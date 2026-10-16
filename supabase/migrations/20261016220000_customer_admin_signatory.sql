-- Customer-admin signature line.
-- NOT APPLIED to the live database by this change.
--
-- Replaces the signer lookup from 20261016210000_employer_company_signatory.sql.
-- The party at the top stays the customer-card company and organization number.
-- The signature line is the admin chosen on the customer card, then that
-- customer's primary admin, then employer_settings.signatur_navn.
-- organizations.contact_name is never used. A platform super-admin, and an
-- admin of another customer, are not used unless they are this customer's admin.
-- The admin who countersigns stays in employer_signed_by and contract_events.

alter table public.organizations
  add column if not exists employer_signatory_user_id text;

comment on column public.organizations.employer_signatory_user_id is
  'Profile id of the customer admin who signs employment contracts for this customer. Empty uses the customer primary admin.';

create or replace function public.customer_admin_name(p_org_id text, p_user_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(p.full_name), '')
  from public.profiles p
  join public.organizations o on o.id = p_org_id
  where p.id = nullif(btrim(p_user_id), '')
    and (
      (nullif(btrim(o.admin_user_id), '') is not null and p.id = o.admin_user_id)
      or (
        nullif(btrim(o.admin_email), '') is not null
        and lower(coalesce(p.email, '')) = lower(btrim(o.admin_email))
      )
      or exists (
        select 1
        from public.workers w
        where w.org_id = o.id
          and nullif(btrim(w.email), '') is not null
          and lower(w.email) = lower(coalesce(p.email, ''))
          and (
            w.role in ('admin', 'sub_admin')
            or (
              jsonb_typeof(w.team_roles) = 'object'
              and exists (
                select 1
                from jsonb_each_text(w.team_roles) as role(key, value)
                where role.value in ('admin', 'sub_admin')
              )
            )
          )
      )
    )
$$;

revoke all on function public.customer_admin_name(text, text) from public, anon, authenticated;

create or replace function public.employer_contract_party(p_org_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org public.organizations%rowtype;
  s public.employer_settings%rowtype;
  signatory text;
begin
  select * into org from public.organizations where id = p_org_id;
  select * into s from public.employer_settings where org_id = p_org_id limit 1;

  if nullif(btrim(org.employer_signatory_user_id), '') is not null then
    signatory := public.customer_admin_name(org.id, org.employer_signatory_user_id);
  end if;
  if signatory is null and nullif(btrim(org.admin_user_id), '') is not null then
    signatory := public.customer_admin_name(org.id, org.admin_user_id);
  end if;
  if signatory is null and nullif(btrim(org.admin_email), '') is not null then
    select public.customer_admin_name(org.id, p.id) into signatory
    from public.profiles p
    where lower(coalesce(p.email, '')) = lower(btrim(org.admin_email))
    order by p.created_date
    limit 1;
  end if;
  if signatory is null then
    signatory := nullif(btrim(s.signatur_navn), '');
  end if;

  return jsonb_build_object(
    'selskap', coalesce(nullif(btrim(org.name), ''), nullif(btrim(s.selskap), ''), ''),
    'org_nr', coalesce(nullif(btrim(org.org_number), ''), nullif(btrim(s.org_nr), ''), ''),
    'signatur_navn', coalesce(signatory, '')
  );
end;
$$;

revoke all on function public.employer_contract_party(text) from public, anon, authenticated;
