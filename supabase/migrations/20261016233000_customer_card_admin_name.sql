-- Signature name from the customer card.
-- NOT APPLIED to the live database by this change.
--
-- organizations has contact_name (the contact person, for example ZAS) and
-- no separate admin-name text. This adds organizations.admin_signerer_navn,
-- shown on the customer card as "Admin / signerer (navn)".
--
-- signatur_navn is that card name, then the selected customer admin's
-- profile full_name, then employer_settings.signatur_navn.
-- contact_name is never used. The countersigning admin stays in the audit trail.

alter table public.organizations
  add column if not exists admin_signerer_navn text;

comment on column public.organizations.admin_signerer_navn is
  'Name printed on the employer signature line. Empty uses the selected customer admin profile name.';

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

  signatory := nullif(btrim(org.admin_signerer_navn), '');
  if signatory is null and nullif(btrim(org.employer_signatory_user_id), '') is not null then
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
