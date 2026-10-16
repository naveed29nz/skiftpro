-- Per-store workplace fields for employment contracts.
-- NOT APPLIED to the live database by this change.
--
-- A worker's contract uses the first team (team1–team10) on the worker.
-- Address and opening hours come from that store, and fall back to the
-- company-wide workplace fields when the store field is empty.

alter table public.workplace_settings
  add column if not exists team1_address text,
  add column if not exists team1_apningstid_fra text,
  add column if not exists team1_apningstid_til text,
  add column if not exists team1_apningstider text,
  add column if not exists team1_notes text,
  add column if not exists team2_address text,
  add column if not exists team2_apningstid_fra text,
  add column if not exists team2_apningstid_til text,
  add column if not exists team2_apningstider text,
  add column if not exists team2_notes text,
  add column if not exists team3_address text,
  add column if not exists team3_apningstid_fra text,
  add column if not exists team3_apningstid_til text,
  add column if not exists team3_apningstider text,
  add column if not exists team3_notes text,
  add column if not exists team4_address text,
  add column if not exists team4_apningstid_fra text,
  add column if not exists team4_apningstid_til text,
  add column if not exists team4_apningstider text,
  add column if not exists team4_notes text,
  add column if not exists team5_address text,
  add column if not exists team5_apningstid_fra text,
  add column if not exists team5_apningstid_til text,
  add column if not exists team5_apningstider text,
  add column if not exists team5_notes text,
  add column if not exists team6_address text,
  add column if not exists team6_apningstid_fra text,
  add column if not exists team6_apningstid_til text,
  add column if not exists team6_apningstider text,
  add column if not exists team6_notes text,
  add column if not exists team7_address text,
  add column if not exists team7_apningstid_fra text,
  add column if not exists team7_apningstid_til text,
  add column if not exists team7_apningstider text,
  add column if not exists team7_notes text,
  add column if not exists team8_address text,
  add column if not exists team8_apningstid_fra text,
  add column if not exists team8_apningstid_til text,
  add column if not exists team8_apningstider text,
  add column if not exists team8_notes text,
  add column if not exists team9_address text,
  add column if not exists team9_apningstid_fra text,
  add column if not exists team9_apningstid_til text,
  add column if not exists team9_apningstider text,
  add column if not exists team9_notes text,
  add column if not exists team10_address text,
  add column if not exists team10_apningstid_fra text,
  add column if not exists team10_apningstid_til text,
  add column if not exists team10_apningstider text,
  add column if not exists team10_notes text;

comment on column public.workplace_settings.team1_apningstider is
  'Fri tekst om åpningstider for avdelingen, for eksempel man–fre 07–23. Valgfritt i avtalen.';

-- Resolves {{sted}}, opening hours and the optional opening-hours summary
-- for the worker's first team. Does not return wages.
create or replace function public.worker_store_fields(p_worker_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w public.workers%rowtype;
  ws public.workplace_settings%rowtype;
  org public.organizations%rowtype;
  team_key text;
  rowj jsonb;
  team_address text;
  team_fra text;
  team_til text;
  team_summary text;
  team_notes text;
  team_name text;
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return null;
  end if;
  select * into ws from public.workplace_settings where org_id = w.org_id order by created_date limit 1;
  select * into org from public.organizations where id = w.org_id;

  if w.teams is not null and cardinality(w.teams) > 0 then
    team_key := w.teams[1];
  end if;
  if team_key ~ '^team(10|[1-9])$' and ws.id is not null then
    rowj := to_jsonb(ws);
    team_address := nullif(btrim(rowj ->> (team_key || '_address')), '');
    team_fra := nullif(btrim(rowj ->> (team_key || '_apningstid_fra')), '');
    team_til := nullif(btrim(rowj ->> (team_key || '_apningstid_til')), '');
    team_summary := nullif(btrim(rowj ->> (team_key || '_apningstider')), '');
    team_notes := nullif(btrim(rowj ->> (team_key || '_notes')), '');
    team_name := nullif(btrim(rowj ->> (team_key || '_name')), '');
  end if;

  return jsonb_build_object(
    'team', coalesce(team_key, ''),
    'har_arbeidssted', coalesce(
      team_address,
      nullif(btrim(ws.workplace_address), ''),
      nullif(btrim(ws.workplace_name), ''),
      team_name
    ) is not null,
    'sted', coalesce(
      team_address,
      nullif(btrim(ws.workplace_address), ''),
      nullif(btrim(ws.workplace_name), ''),
      team_name,
      nullif(btrim(org.name), ''),
      ''
    ),
    'apningstid_fra', coalesce(team_fra, nullif(btrim(ws.apningstid_fra), ''), ''),
    'apningstid_til', coalesce(team_til, nullif(btrim(ws.apningstid_til), ''), ''),
    'apningstider', coalesce(team_summary, ''),
    'notater', coalesce(team_notes, '')
  );
end;
$$;

revoke all on function public.worker_store_fields(text) from public, anon, authenticated;

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
  ub := coalesce(s.ub_tillegg, '[]'::jsonb);
  hours_base := coalesce(s.alminnelig_ukentlig_arbeidstid, ws.full_time_hours_per_week, 37.5);
  stilling := coalesce(
    nullif(btrim(w.position), ''),
    'selger, som for tiden innebærer salg og kundeservice, renhold, varepåfylling, tilberedning av mat og matsikkerhet'
  );
  data := jsonb_build_object(
    'selskap', coalesce(nullif(btrim(s.selskap), ''), org.name, ''),
    'org_nr', coalesce(nullif(btrim(s.org_nr), ''), org.org_number, ''),
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
    'signatur_navn', coalesce(nullif(btrim(s.signatur_navn), ''), org.contact_name, ''),
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
  store jsonb;
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
  store := public.worker_store_fields(p_worker_id);

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
  if nullif(btrim(s.selskap), '') is null then missing := array_append(missing, 'Arbeidsgivers juridiske navn'); end if;
  if nullif(btrim(s.org_nr), '') is null then missing := array_append(missing, 'Organisasjonsnummer'); end if;
  if nullif(btrim(s.adresse), '') is null then missing := array_append(missing, 'Arbeidsgivers adresse'); end if;
  if nullif(btrim(s.signatur_navn), '') is null then missing := array_append(missing, 'Signaturberettiget navn'); end if;
  if nullif(btrim(s.signatur_stilling), '') is null then missing := array_append(missing, 'Signaturberettiget stilling'); end if;
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

-- Optional opening-hours summary. Empty values drop the sentence.
update public.contract_templates
set body_markdown = replace(
  body_markdown,
  'i kioskens åpningstid som for tiden er mellom klokken {{apningstid_fra}} og {{apningstid_til}}.',
  E'i kioskens åpningstid som for tiden er mellom klokken {{apningstid_fra}} og {{apningstid_til}}.\n{{#apningstider}}\nNærmere om åpningstidene: {{apningstider}}.\n{{/apningstider}}'
)
where org_id is null
  and key in ('fast', 'midlertidig_vikar', 'butikksjef_ledende');

update public.contract_templates
set body_markdown = replace(
  body_markdown,
  'Arbeidstiden plasseres i tidsrommet mellom kl {{apningstid_fra}} og kl {{apningstid_til}}. Daglig og ukentlig arbeidstid fastsettes for hvert enkelt oppdrag.',
  E'Arbeidstiden plasseres i tidsrommet mellom kl {{apningstid_fra}} og kl {{apningstid_til}}. Daglig og ukentlig arbeidstid fastsettes for hvert enkelt oppdrag.\n{{#apningstider}}\nÅpningstidene er {{apningstider}}.\n{{/apningstider}}'
)
where org_id is null and key = 'tilkalling_ramme';

update public.contract_templates
set body_markdown = replace(
  body_markdown,
  'Arbeidssted er for tiden {{sted}}.',
  E'Arbeidssted er for tiden {{sted}}.\n{{#apningstider}}\nÅpningstidene er {{apningstider}}.\n{{/apningstider}}'
)
where org_id is null and key = 'merarbeid';

update public.contract_templates
set body_markdown = replace(
  body_markdown,
  'Arbeidssted: {{sted}}.',
  E'Arbeidssted: {{sted}}.\n{{#apningstider}}\nÅpningstidene er {{apningstider}}.\n{{/apningstider}}'
)
where org_id is null and key = 'bilag';

-- Same explicit column list as the digital-contract grant, plus the store fields.
-- New columns are not readable until they are named here.
revoke select on table public.workplace_settings from authenticated, anon;
grant select (
  id, org_id, workplace_name, workplace_address, apningstid_fra, apningstid_til,
  latitude, longitude, radius_meters, full_time_hours_per_week, active_teams_count,
  team1_name, team2_name, team3_name, team4_name, team5_name, team6_name, team7_name, team8_name, team9_name, team10_name,
  team1_latitude, team1_longitude, team1_radius_meters,
  team2_latitude, team2_longitude, team2_radius_meters,
  team3_latitude, team3_longitude, team3_radius_meters,
  team4_latitude, team4_longitude, team4_radius_meters,
  team5_latitude, team5_longitude, team5_radius_meters,
  team6_latitude, team6_longitude, team6_radius_meters,
  team7_latitude, team7_longitude, team7_radius_meters,
  team8_latitude, team8_longitude, team8_radius_meters,
  team9_latitude, team9_longitude, team9_radius_meters,
  team10_latitude, team10_longitude, team10_radius_meters,
  team1_address, team1_apningstid_fra, team1_apningstid_til, team1_apningstider, team1_notes,
  team2_address, team2_apningstid_fra, team2_apningstid_til, team2_apningstider, team2_notes,
  team3_address, team3_apningstid_fra, team3_apningstid_til, team3_apningstider, team3_notes,
  team4_address, team4_apningstid_fra, team4_apningstid_til, team4_apningstider, team4_notes,
  team5_address, team5_apningstid_fra, team5_apningstid_til, team5_apningstider, team5_notes,
  team6_address, team6_apningstid_fra, team6_apningstid_til, team6_apningstider, team6_notes,
  team7_address, team7_apningstid_fra, team7_apningstid_til, team7_apningstider, team7_notes,
  team8_address, team8_apningstid_fra, team8_apningstid_til, team8_apningstider, team8_notes,
  team9_address, team9_apningstid_fra, team9_apningstid_til, team9_apningstider, team9_notes,
  team10_address, team10_apningstid_fra, team10_apningstid_til, team10_apningstider, team10_notes,
  created_date, updated_date, created_by
) on table public.workplace_settings to authenticated, anon;
