-- "Arbeidsgiver kan motsignere når den ansatte har signert" was returned for
-- every status other than signert_ansatt, including a contract both parties
-- had already signed. Say which of those it is.

create or replace function public.contract_sign_context(p_contract_id text, p_role text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
  email text;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke avtalen');
  end if;
  if p_role = 'ansatt' then
    if not public.worker_matches(c.worker_id) then
      return jsonb_build_object('ok', false, 'error', 'Ansattens signatur kan bare avgis av den ansatte selv');
    end if;
    if c.status not in ('sendt', 'apnet') then
      if c.status in ('signert_ansatt', 'signert', 'godkjent') then
        return jsonb_build_object('ok', false, 'error', 'Avtalen er allerede signert av den ansatte');
      end if;
      return jsonb_build_object('ok', false, 'error', 'Avtalen venter ikke på ansattes signatur');
    end if;
    select w.email into email from public.workers w where w.id = c.worker_id;
  elsif p_role = 'arbeidsgiver' then
    if not (public.can_read_wages() and public.in_org(c.org_id)) then
      return jsonb_build_object('ok', false, 'error', 'Bare admin kan motsignere avtalen');
    end if;
    if c.status in ('signert', 'godkjent') then
      return jsonb_build_object('ok', false, 'error', 'Avtalen er allerede signert av begge parter');
    end if;
    if c.status <> 'signert_ansatt' then
      return jsonb_build_object('ok', false, 'error', 'Venter på at den ansatte signerer');
    end if;
    select p.email into email from public.profiles p where p.id = auth.uid()::text;
  else
    return jsonb_build_object('ok', false, 'error', 'Ukjent rolle');
  end if;
  return jsonb_build_object(
    'ok', true,
    'email', email,
    'contract_id', c.id,
    'org_id', c.org_id,
    'status', c.status
  );
end;
$$;
