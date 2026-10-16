-- Employer party and signature line.
-- NOT APPLIED to the live database by this change.
--
-- The party at the top is the customer-card company (organizations.name)
-- and organizations.org_number. Employer settings fill those only when the
-- card is empty.
-- The signature line is an explicit employer_settings.signatur_navn, or the
-- organization owner's full name (admin_user_id, then admin_email).
-- organizations.contact_name is never the signer.
-- The admin who countersigns stays in employer_signed_by and contract_events.

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
  owner_name text;
begin
  select * into org from public.organizations where id = p_org_id;
  select * into s from public.employer_settings where org_id = p_org_id limit 1;

  owner_name := nullif(btrim(s.signatur_navn), '');
  if owner_name is null and nullif(btrim(org.admin_user_id), '') is not null then
    select nullif(btrim(p.full_name), '') into owner_name
    from public.profiles p
    where p.id = org.admin_user_id;
  end if;
  if owner_name is null and nullif(btrim(org.admin_email), '') is not null then
    select nullif(btrim(p.full_name), '') into owner_name
    from public.profiles p
    where lower(p.email) = lower(btrim(org.admin_email))
    order by p.created_date
    limit 1;
  end if;

  return jsonb_build_object(
    'selskap', coalesce(nullif(btrim(org.name), ''), nullif(btrim(s.selskap), ''), ''),
    'org_nr', coalesce(nullif(btrim(org.org_number), ''), nullif(btrim(s.org_nr), ''), ''),
    'signatur_navn', coalesce(owner_name, '')
  );
end;
$$;

revoke all on function public.employer_contract_party(text) from public, anon, authenticated;

create or replace function public.contract_field_values(p_worker_id text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w public.workers%rowtype;
  s public.employer_settings%rowtype;
  ws public.workplace_settings%rowtype;
  org public.organizations%rowtype;
  store jsonb;
  party jsonb;
  stilling text;
  ub jsonb;
  hours_base double precision;
  data jsonb;
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return '{}'::jsonb;
  end if;
  select * into s from public.employer_settings where org_id = w.org_id limit 1;
  select * into ws from public.workplace_settings where org_id = w.org_id order by created_date limit 1;
  select * into org from public.organizations where id = w.org_id;
  store := public.worker_store_fields(p_worker_id);
  party := public.employer_contract_party(w.org_id);
  ub := coalesce(s.ub_tillegg, '[]'::jsonb);
  hours_base := coalesce(s.alminnelig_ukentlig_arbeidstid, ws.full_time_hours_per_week, 37.5);
  stilling := coalesce(
    nullif(btrim(w.position), ''),
    'selger, som for tiden innebærer salg og kundeservice, renhold, varepåfylling, tilberedning av mat og matsikkerhet'
  );
  data := jsonb_build_object(
    'selskap', coalesce(party ->> 'selskap', ''),
    'org_nr', coalesce(party ->> 'org_nr', ''),
    'adresse', coalesce(s.adresse, ''),
    'navn', coalesce(w.name, ''),
    'stilling', stilling,
    'stillingsprosent', public.format_no_number(coalesce(w.employment_percentage, 0)::numeric),
    'tiltredelsesdato', coalesce(to_char(w.tiltredelsesdato, 'DD.MM.YYYY'), ''),
    'opphorsdato', coalesce(to_char(w.opphorsdato, 'DD.MM.YYYY'), ''),
    'timer_per_uke', case when w.timer_per_uke is null then '' else public.format_no_number(w.timer_per_uke::numeric) end,
    'timer_per_dag', case when w.timer_per_dag is null then '' else public.format_no_number(w.timer_per_dag::numeric) end,
    'apningstid_fra', coalesce(store ->> 'apningstid_fra', ''),
    'apningstid_til', coalesce(store ->> 'apningstid_til', ''),
    'apningstider', coalesce(store ->> 'apningstider', ''),
    'notater', coalesce(store ->> 'notater', ''),
    'sted', coalesce(store ->> 'sted', ''),
    'timelonn', public.format_no_number(coalesce(w.hourly_rate, 0)::numeric),
    'signatur_navn', coalesce(party ->> 'signatur_navn', ''),
    'signatur_stilling', coalesce(s.signatur_stilling, ''),
    'lonningsdag', coalesce(s.lonningsdag, 15)::text,
    'feriepenger_utbetales', coalesce(nullif(s.feriepenger_utbetales, ''), 'mai'),
    'ferie_uker', coalesce(nullif(s.ferie_uker, ''), 'fire uker og 1 dag'),
    'feriepenger_prosent', public.format_no_number(coalesce(s.feriepenger_prosent, 10.2)::numeric) || ' %',
    'otp_leverandor', coalesce(nullif(s.otp_leverandor, ''), 'DNB-LIV'),
    'yrkesskade_forsikring', coalesce(nullif(s.yrkesskade_forsikring, ''), 'Gjensidige'),
    'oppsigelsesfrist_mnd', coalesce(s.oppsigelsesfrist_mnd_midlertidig, 1)::text,
    'provetid_mnd', coalesce(w.provetid_mnd, 0)::text,
    'arbeidsoppgaver', coalesce(w.arbeidsoppgaver, ''),
    'alminnelig_ukentlig_arbeidstid', public.format_no_number(hours_base::numeric),
    'tariff', coalesce(s.tariff, false),
    'under_18', w.birth_date is not null and w.birth_date > (coalesce(w.tiltredelsesdato, current_date) - interval '18 years'),
    'otp', coalesce(s.otp, true),
    'provetid', coalesce(w.provetid_mnd, 0) > 0,
    'har_ub', jsonb_array_length(ub) > 0,
    'ub_tillegg', ub,
    'grunnlag', case coalesce(s.tilkalling_grunnlag, 'vikar') when 'sesong' then 'Sesong' else 'Vikar' end,
    'har_hovedavtale', false,
    'har_rammeavtale', false
  );
  return data || coalesce(p_extra, '{}'::jsonb);
end;
$$;

create or replace function public.employment_contract_missing(p_worker_id text, p_checklist jsonb default '{}'::jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w public.workers%rowtype;
  s public.employer_settings%rowtype;
  org public.organizations%rowtype;
  store jsonb;
  party jsonb;
  missing text[] := '{}';
  months integer;
  half numeric;
  item text;
  required text[] := array[
    'lederfunksjoner', 'egen_arbeidstid', 'frivillig_stempling', 'egen_innsats',
    'delegerer', 'sammenlignbart_ansvar', 'fleksibilitet', 'lonn_speiler_ansvar'
  ];
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return array['Ansatt finnes ikke'];
  end if;
  select * into s from public.employer_settings where org_id = w.org_id limit 1;
  select * into org from public.organizations where id = w.org_id;
  store := public.worker_store_fields(p_worker_id);
  party := public.employer_contract_party(w.org_id);

  if nullif(btrim(w.name), '') is null then missing := array_append(missing, 'Fullt navn'); end if;
  if nullif(btrim(w.email), '') is null then missing := array_append(missing, 'E-post'); end if;
  if w.birth_date is null then missing := array_append(missing, 'Fødselsdato'); end if;
  if w.tiltredelsesdato is null then missing := array_append(missing, 'Tiltredelsesdato'); end if;
  if coalesce(w.ansettelsestype, 'fast') = 'midlertidig_vikar' and w.opphorsdato is null then
    missing := array_append(missing, 'Opphørsdato');
  end if;
  if coalesce(w.ansettelsestype, 'fast') in ('fast', 'midlertidig_vikar', 'butikksjef_ledende')
     and w.employment_percentage is null then
    missing := array_append(missing, 'Stillingsprosent');
  end if;
  if coalesce(w.ansettelsestype, 'fast') <> 'tilkalling' and w.timer_per_uke is null then
    missing := array_append(missing, 'Timer per uke (snitt)');
  end if;
  if coalesce(w.ansettelsestype, 'fast') <> 'tilkalling' and w.timer_per_dag is null then
    missing := array_append(missing, 'Timer per dag (snitt)');
  end if;
  if coalesce(w.hourly_rate, 0) <= 0 then missing := array_append(missing, 'Timelønn'); end if;
  if coalesce(w.ansettelsestype, 'fast') = 'butikksjef_ledende' and nullif(btrim(w.arbeidsoppgaver), '') is null then
    missing := array_append(missing, 'Arbeidsoppgaver');
  end if;
  if coalesce(w.ansettelsestype, 'fast') in ('fast', 'butikksjef_ledende') and coalesce(w.provetid_mnd, -1) <> 6 then
    missing := array_append(missing, 'Prøvetid på 6 måneder');
  end if;
  if coalesce(w.ansettelsestype, 'fast') = 'midlertidig_vikar' then
    if w.provetid_mnd is null or w.provetid_mnd < 0 or w.provetid_mnd > 6 then
      missing := array_append(missing, 'Prøvetid mellom 0 og 6 måneder');
    elsif w.tiltredelsesdato is not null and w.opphorsdato is not null then
      months := (extract(year from age(w.opphorsdato, w.tiltredelsesdato)) * 12
        + extract(month from age(w.opphorsdato, w.tiltredelsesdato)))::integer;
      half := months / 2.0;
      if w.provetid_mnd > half then
        missing := array_append(missing, 'Prøvetid kan ikke være lenger enn halvparten av ansettelsen');
      end if;
    end if;
  end if;
  if nullif(btrim(party ->> 'selskap'), '') is null then missing := array_append(missing, 'Arbeidsgivers juridiske navn'); end if;
  if nullif(btrim(party ->> 'org_nr'), '') is null then missing := array_append(missing, 'Organisasjonsnummer'); end if;
  if nullif(btrim(party ->> 'signatur_navn'), '') is null then missing := array_append(missing, 'Signaturberettiget navn'); end if;
  if nullif(btrim(s.adresse), '') is null then missing := array_append(missing, 'Arbeidsgivers adresse'); end if;
  if coalesce(store ->> 'har_arbeidssted', '') <> 'true' then missing := array_append(missing, 'Arbeidssted'); end if;
  if nullif(btrim(store ->> 'apningstid_fra'), '') is null then missing := array_append(missing, 'Åpningstid fra'); end if;
  if nullif(btrim(store ->> 'apningstid_til'), '') is null then missing := array_append(missing, 'Åpningstid til'); end if;
  if coalesce(w.ansettelsestype, 'fast') = 'butikksjef_ledende' then
    foreach item in array required loop
      if coalesce(p_checklist ->> item, '') is distinct from 'true' then
        missing := array_append(missing, 'Butikksjef-sjekklisten må være ja på alle punkter');
        exit;
      end if;
    end loop;
  end if;
  return missing;
end;
$$;


-- Signature line is "For {{selskap}}: {{signatur_navn}}". The job title is not printed.
update public.contract_templates
set body_markdown = replace(
  body_markdown,
  E'For {{selskap}}\nNavn: {{signatur_navn}}\nStilling: {{signatur_stilling}}\nSted: {{sted}}',
  E'For {{selskap}}: {{signatur_navn}}\nSted: {{sted}}'
)
where org_id is null
  and body_markdown like '%Stilling: {{signatur_stilling}}%Sted: {{sted}}%';

update public.contract_templates
set body_markdown = replace(
  body_markdown,
  E'For {{selskap}}\nNavn: {{signatur_navn}}\nStilling: {{signatur_stilling}}',
  E'For {{selskap}}: {{signatur_navn}}'
)
where org_id is null
  and body_markdown like '%Stilling: {{signatur_stilling}}%';

update public.contract_templates
set required_fields = (
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  from jsonb_array_elements_text(required_fields) as item
  where item not in ('signatur_navn', 'signatur_stilling')
)
where org_id is null
  and required_fields ?| array['signatur_navn', 'signatur_stilling'];

update public.contract_templates
set body_markdown = replace(
  body_markdown,
  E'mellom\n{{selskap}}\n(Arbeidsgiveren)',
  E'mellom\n{{selskap}}\n{{#org_nr}}\nOrg.nr {{org_nr}}\n{{/org_nr}}\n(Arbeidsgiveren)'
)
where org_id is null
  and body_markdown like E'%mellom\n{{selskap}}\n(Arbeidsgiveren)%';

update public.contract_templates
set body_markdown = replace(
  body_markdown,
  E'Arbeidsgiver: {{selskap}}\n',
  E'Arbeidsgiver: {{selskap}}\n{{#org_nr}}\nOrg.nr {{org_nr}}\n{{/org_nr}}\n'
)
where org_id is null
  and key = 'bilag';
