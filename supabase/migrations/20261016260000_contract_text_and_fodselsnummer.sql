-- Verbatim contract text (version 2) and a protected fødselsnummer.
-- NOT APPLIED to the live project. Do not edit contracts that are already signed.
-- Existing rows keep body_snapshot and template_version. Merarbeid version 1 stays active.
-- Apply after 20261016250000. 20261016245000 (delete hotfix) is independent and sorts first.

alter table public.workers
  add column if not exists fodselsnummer bytea;

comment on column public.workers.fodselsnummer is
  'Encrypted national identity number. Absent from the SELECT grant. Admins read and write it only through worker_fodselsnummer and set_worker_fodselsnummer.';

revoke select (fodselsnummer), insert (fodselsnummer), update (fodselsnummer) on public.workers from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.sensitive_keys (
  name text primary key,
  key bytea not null
);
revoke all on table private.sensitive_keys from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then
    execute $ins$
      insert into private.sensitive_keys (name, key)
      values ('fodselsnummer', extensions.gen_random_bytes(32))
      on conflict (name) do nothing
    $ins$;
  else
    execute $ins$
      insert into private.sensitive_keys (name, key)
      values ('fodselsnummer', public.gen_random_bytes(32))
      on conflict (name) do nothing
    $ins$;
  end if;
end $$;

-- 11 digits and the official mod-11 check. A D-nummer (day + 40) uses the same
-- weights. Calendar dates are not checked separately.
create or replace function public.fodselsnummer_valid(p_value text)
returns boolean
language plpgsql
immutable
as $$
declare
  digits text := regexp_replace(coalesce(p_value, ''), '\s', '', 'g');
  weights1 int[] := array[3, 7, 6, 1, 8, 9, 4, 5, 2];
  weights2 int[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  i int;
  sum1 int := 0;
  sum2 int := 0;
  rest int;
  d1 int;
  d2 int;
begin
  if digits !~ '^\d{11}$' then
    return false;
  end if;
  for i in 1..9 loop
    sum1 := sum1 + weights1[i] * substr(digits, i, 1)::int;
  end loop;
  rest := 11 - (sum1 % 11);
  if rest = 11 then
    d1 := 0;
  elsif rest = 10 then
    return false;
  else
    d1 := rest;
  end if;
  if substr(digits, 10, 1)::int <> d1 then
    return false;
  end if;
  for i in 1..10 loop
    sum2 := sum2 + weights2[i] * substr(digits, i, 1)::int;
  end loop;
  rest := 11 - (sum2 % 11);
  if rest = 11 then
    d2 := 0;
  elsif rest = 10 then
    return false;
  else
    d2 := rest;
  end if;
  return substr(digits, 11, 1)::int = d2;
end;
$$;

create or replace function public.set_worker_fodselsnummer(p_worker_id text, p_value text)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  org text;
  digits text;
  secret bytea;
begin
  select w.org_id into org from public.workers w where w.id = p_worker_id;
  if not found then
    raise exception 'Ansatt finnes ikke';
  end if;
  if not (
    public.is_super_admin()
    or (public.can_read_wages() and public.in_org(org))
  ) then
    raise exception 'Ikke tillatt';
  end if;
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    update public.workers set fodselsnummer = null where id = p_worker_id;
    return;
  end if;
  digits := regexp_replace(p_value, '\s', '', 'g');
  if not public.fodselsnummer_valid(digits) then
    raise exception 'Fødselsnummer må være 11 gyldige sifre';
  end if;
  select k.key into secret from private.sensitive_keys k where k.name = 'fodselsnummer';
  if secret is null then
    raise exception 'Fødselsnummer kan ikke lagres';
  end if;
  update public.workers
  set fodselsnummer = pgp_sym_encrypt(digits, encode(secret, 'hex'))
  where id = p_worker_id;
end;
$$;

create or replace function public.worker_fodselsnummer(p_worker_id text)
returns text
language plpgsql
stable
security definer
set search_path = public, private, extensions
as $$
declare
  org text;
  cipher bytea;
  secret bytea;
begin
  select w.org_id, w.fodselsnummer into org, cipher
  from public.workers w
  where w.id = p_worker_id;
  if not found then
    return null;
  end if;
  if not (
    public.is_super_admin()
    or (public.can_read_wages() and public.in_org(org))
  ) then
    raise exception 'Ikke tillatt';
  end if;
  if cipher is null then
    return null;
  end if;
  select k.key into secret from private.sensitive_keys k where k.name = 'fodselsnummer';
  return pgp_sym_decrypt(cipher, encode(secret, 'hex'));
end;
$$;

create or replace function public.worker_fodselsnummer_masks()
returns table (id text, masked text)
language plpgsql
stable
security definer
set search_path = public, private, extensions
as $$
declare
  secret bytea;
begin
  if not (public.is_super_admin() or public.can_read_wages()) then
    return;
  end if;
  select k.key into secret from private.sensitive_keys k where k.name = 'fodselsnummer';
  return query
  select w.id,
    case
      when w.fodselsnummer is null or secret is null then ''
      else repeat('•', 7) || right(pgp_sym_decrypt(w.fodselsnummer, encode(secret, 'hex')), 4)
    end
  from public.workers w
  where public.is_super_admin()
     or (public.can_read_wages() and public.in_org(w.org_id));
end;
$$;

create or replace function public.guard_worker_sensitive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (auth.uid() is null or public.can_read_wages()) then
    if tg_op = 'INSERT' then
      new.fodselsnummer := null;
    else
      new.fodselsnummer := old.fodselsnummer;
    end if;
  end if;
  if auth.uid() is null or public.can_read_wages() or public.worker_matches(new.id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.birth_date := null;
  else
    new.birth_date := old.birth_date;
  end if;
  return new;
end;
$$;

create or replace function public.contract_field_values(p_worker_id text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, extensions
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
  fn_digits text := '';
  fn_key bytea;
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
  if w.fodselsnummer is not null then
    select k.key into fn_key from private.sensitive_keys k where k.name = 'fodselsnummer';
    fn_digits := coalesce(pgp_sym_decrypt(w.fodselsnummer, encode(fn_key, 'hex')), '');
  end if;
  data := jsonb_build_object(
    'selskap', coalesce(party ->> 'selskap', ''),
    'org_nr', coalesce(party ->> 'org_nr', ''),
    'adresse', public.worker_employer_address(p_worker_id),
    'navn', coalesce(w.name, ''),
    'fodselsnummer', fn_digits,
    'ansatt_adresse', coalesce(w.address, ''),
    'mobil', coalesce(w.phone, ''),
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
set search_path = public, private, extensions
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
  fn_digits text := '';
  fn_key bytea;
  required text[] := array[
    'lederfunksjoner', 'egen_arbeidstid', 'frivillig_stempling', 'egen_innsats',
    'delegerer', 'sammenlignbart_ansvar', 'fleksibilitet', 'lonn_speiler_ansvar'
  ];
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return array['Ansatt finnes ikke'];
  end if;
  if auth.uid() is not null and not (
    public.is_super_admin()
    or (public.can_read_wages() and public.in_org(w.org_id))
  ) then
    raise exception 'Ikke tillatt';
  end if;
  select * into s from public.employer_settings where org_id = w.org_id limit 1;
  select * into org from public.organizations where id = w.org_id;
  store := public.worker_store_fields(p_worker_id);
  party := public.employer_contract_party(w.org_id);

  if nullif(btrim(w.name), '') is null then missing := array_append(missing, 'Fullt navn'); end if;
  if nullif(btrim(w.email), '') is null then missing := array_append(missing, 'E-post'); end if;
  if w.birth_date is null then missing := array_append(missing, 'Fødselsdato'); end if;
  if w.fodselsnummer is not null then
    select k.key into fn_key from private.sensitive_keys k where k.name = 'fodselsnummer';
    fn_digits := coalesce(pgp_sym_decrypt(w.fodselsnummer, encode(fn_key, 'hex')), '');
  end if;
  if not public.fodselsnummer_valid(fn_digits) then missing := array_append(missing, 'Fødselsnummer'); end if;
  if nullif(btrim(w.address), '') is null then missing := array_append(missing, 'Adresse'); end if;
  if nullif(btrim(w.phone), '') is null then missing := array_append(missing, 'Mobilnummer'); end if;
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
  if nullif(btrim(public.worker_employer_address(p_worker_id)), '') is null then
    missing := array_append(missing, 'Arbeidsgivers adresse');
  end if;
  if coalesce(store ->> 'har_arbeidssted', '') <> 'true' then missing := array_append(missing, 'Arbeidssted'); end if;
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

revoke all on function public.fodselsnummer_valid(text) from public, anon;
grant execute on function public.fodselsnummer_valid(text) to authenticated;

revoke all on function public.set_worker_fodselsnummer(text, text) from public, anon, authenticated;
grant execute on function public.set_worker_fodselsnummer(text, text) to authenticated;

revoke all on function public.worker_fodselsnummer(text) from public, anon, authenticated;
grant execute on function public.worker_fodselsnummer(text) to authenticated;

revoke all on function public.worker_fodselsnummer_masks() from public, anon, authenticated;
grant execute on function public.worker_fodselsnummer_masks() to authenticated;

revoke all on function public.guard_worker_sensitive() from public, anon, authenticated;

revoke all on function public.contract_field_values(text, jsonb) from public, anon, authenticated;
grant execute on function public.contract_field_values(text, jsonb) to service_role;

update public.contract_templates
set is_active = false
where org_id is null
  and version = 1
  and key in ('fast', 'midlertidig_vikar', 'tilkalling_ramme', 'butikksjef_ledende', 'bilag');

insert into public.contract_templates (org_id, key, name, version, body_markdown, required_fields, is_active)
values (null, 'fast', 'Ansettelsesavtale fast (heltid/deltid)', 2, $tpl_fast_v2$
ANSETTELSESAVTALE
{{selskap}}
Org.nr {{org_nr}}
{{navn}}
{{fodselsnummer}}
{{ansatt_adresse}}
{{mobil}}

Arbeidsforhold

Arbeidstakeren ansettes hos Arbeidsgiveren med tiltredelse {{tiltredelsesdato}}. Arbeidstakeren er ansatt i en {{stillingsprosent}} % stilling.

De vilkår og betingelser som gjelder i arbeidsforholdet er inntatt i denne Arbeidsavtalen og i Vedlegg 1. I Vedlegg 1 har Arbeidsgiveren inkludert lovpålagt informasjon som gjelder ved oppstart av arbeidsforholdet.

Arbeidstakeren plikter, så langt det er av betydning for arbeidsforholdet, å holde seg oppdatert på og følge de til enhver tid gjeldende regler for Arbeidsgiveren, enten disse følger lover, forskrifter, interne retningslinjer og policyer eller instrukser mv. gitt av Arbeidsgiveren.

Nedenfor følger vilkår og bestemmelser som gjelder ved oppstart av arbeidsforholdet. Endringer i vilkår og bestemmelser kan skje i henhold til Ansettelsesavtalen, jf. særlig punkt 1.2 ovenfor, eller som følge av nye lover eller forskrifter.

Stilling

Arbeidstakeren er ansatt som selger, som for tiden innebærer salg og kundeservice, renhold, varepåfylling, tilberedning av mat og matsikkerhet.

Arbeidstakers arbeidsutførelse skal være i samsvar med lov, retningslinjer og eventuell arbeidsbeskrivelse.

Arbeidstakeren er i ansettelsesperioden forpliktet til å anvende sin arbeidskraft i Arbeidsgivers interesse, innenfor sin stillingsprosent. Arbeidstaker kan ikke påta seg annet arbeid, verv eller oppdrag – heller ikke ulønnet – dersom dette kan være uforenelig med Arbeidsgiverens interesser, herunder med hensyn til å bevare forretningshemmeligheter, eller Arbeidstakerens helse og sikkerhet.

Arbeidstid

Det praktiseres skiftordning i virksomheten og den daglige og ukentlige arbeidstiden vil variere, og arbeidstaker er forpliktet til å følge den til enhver tid gjeldende arbeidsplan.

Arbeidstiden er gjennomsnittlig på {{timer_per_uke}} timer per uke. Den gjennomsnittlige daglige arbeidstiden er {{timer_per_dag}} timer i butikkens åpningstider.

Nærmere plassering av daglig og ukentlig arbeidstid følger av gjeldende arbeidsplan.

Arbeidsplanen iverksettes og endres i tråd med arbeidsmiljøloven § 10-3, normalt med 14 dagers varsel.
{{#tariff}}
Arbeidsplanen iverksettes og endres i tråd med den til enhver tid gjeldende tariffavtale, normalt med fire ukers varsel.
{{/tariff}}
Arbeidstaker har rett på pauser etter arbeidsmiljøloven § 10-9.
{{#tariff}}
Pauser reguleres i tillegg av den til enhver tid gjeldene tariffavtale.
{{/tariff}}
Arbeidsgiver kan pålegge arbeidstaker arbeid utover avtalt arbeidstid etter arbeidsmiljøloven § 10-6.
{{^tariff}}
For overtidsarbeid utbetales overtidstillegg med minst 40 prosent i henhold til arbeidsmiljøloven § 10-6.
{{/tariff}}
{{#tariff}}
For overtidsarbeid utbetales overtidstillegg i henhold til den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Arbeidstaker har bare rett til kompensasjon for overtidsarbeid som er pålagt eller godkjent av nærmeste overordnede. Ved merarbeid utbetales ikke overtidstillegg.
{{#under_18}}
For arbeidstakere som er under 18 år gjelder arbeidstidsbegrensningene i aml. kapittel 11.
{{/under_18}}

Arbeidssted

Arbeidssted er for tiden hovedsakelig ved {{sted}}. Arbeidsgiveren kan endre arbeidsstedet.

Lønn

Ved tiltredelse er Arbeidstakerens ordinære timelønn NOK {{timelonn}}.
{{^tariff}}Bedriften er ikke bundet av tariffavtale.
{{/tariff}}

Arbeidstakeren skal kontrollere at alle utbetalinger fra Arbeidsgiveren er riktige og skal umiddelbart informere Arbeidsgiver om eventuelle feil. Partene er enige om at feil skal rettes opp og Arbeidstaker har ikke rett til å beholde beløp mottatt som følge av feilutbetaling fra arbeidsgivers side. Arbeidsgiver forbeholder seg retten til å kreve feilutbetaling tilbakebetalt ved etterfølgende avtale om lønnstrekk eller på annen måte, og vil varsle arbeidstaker så snart som mulig etter at feilen er oppdaget.

Prøvetid og oppsigelsesfrist

Ansettelsen skjer med 6 måneders gjensidig prøvetid. Under prøvetiden gjelder en gjensidig oppsigelsestid på 14 dager, regnet fra den dato oppsigelsen ble gitt. Har Arbeidstakeren vært fraværende fra arbeidet i prøvetiden, kan prøvetiden forlenges tilsvarende lengden av fraværet.

Etter utløpet av prøvetiden gjelder en gjensidig oppsigelsesfrist på 1 måned, med mindre en lenger frist fremgår av arbeidsmiljøloven. Oppsigelsestiden regnes fra første dag i måneden etter den måneden oppsigelsen ble gitt.

Taushetsplikt og tilbakelevering av Arbeidsgiverens eiendom

Arbeidstaker er forpliktet til, så vel i ansettelsestiden som etter dennes opphør, å bevare fullstendig taushet overfor uvedkommende, herunder andre ansatte hos Arbeidsgiveren, om konfidensiell informasjon om teknologi, forretningsforhold, kunder, leverandører eller forhold av intern art som Arbeidstaker er blitt kjent med i forbindelse med sitt ansettelsesforhold hos Arbeidsgiver. Arbeidstaker er videre forpliktet til, så vel i ansettelsestiden som etter dennes opphør, ikke å utnytte konfidensiell informasjon som nevnt for noe annet formål enn utførelse av arbeidsoppgaver for Arbeidsgiver.

Arbeidsgivers eiendom skal tilbakeleveres til Arbeidsgiver ved arbeidsforholdets opphør eller på forespørsel fra Arbeidsgiver.

Personvern

For å kunne administrere Arbeidstakerens ansettelsesforhold må Arbeidsgiveren behandle visse personopplysninger om Arbeidstakeren. Informasjon om hvilke opplysninger som behandles, hvordan dette gjøres og hvilke rettigheter Arbeidstakeren har i denne sammenheng, er beskrevet i Arbeidsgiverens til enhver tid gjeldende retningslinjer for personvern. Arbeidstakeren er forpliktet til å gjøre seg kjent med det til enhver tid gjeldende innholdet i slike retningslinjer.

Diverse

Denne Ansettelsesavtalen trer i kraft med virkning fra signeringsdato og erstatter alle tidligere muntlige og skriftlige avtaler mellom Arbeidstakeren og Arbeidsgiveren i anledning ansettelsesforholdet.

Partene er enige om at Ansettelsesavtalen skal justeres/endres ved eventuelle nye ufravikelige regler for ansettelsesforholdet. Hvis det er flere alternativer, skal det velges det som nærmest samsvarer det som følger av ansettelsesavtalen.
{{#tariff}}
Bedriften er for tiden bundet av Landsoverenskomsten Virke – Handel og Kontor.
{{/tariff}}

Vedlegg 1: Tillegg til Ansettelsesavtalen

Vedlegg 1
TILLEGG TIL ANSETTELSESAVTALEN

Innledning

Dette Tillegget inneholder en beskrivelse av ordninger som gjelder når Ansettelsesavtalen trer i kraft og har som formål å oppfylle informasjonskravene i henhold til arbeidsmiljøloven § 14-6. Med mindre annet uttrykkelig fremgår, er formålet med dette Tillegget å gi Arbeidstakeren lovpålagt informasjon etter arbeidsmiljøloven og å implementere relevante plikter for Arbeidstakeren. Informasjonen som gis skal ikke innebære individuelle rettigheter for Arbeidstakeren. Skjer det endringer i ordningene, vil Arbeidsgiveren orientere om dette.

Ved motstrid mellom innholdet i Ansettelsesavtalen og dette Tillegget, skal Ansettelsesavtalen gis forrang. Med mindre annet fremgår, skal begreper og definisjoner i dette Tillegget ha samme betydning som i Arbeidsavtalen.

Rutiner for lønnsutbetaling og ferie

Lønnen utbetales etterskuddsvis til Arbeidstakerens bankkonto på Arbeidsgiverens ordinære lønningsdag, for tiden den {{lonningsdag}}. hver måned. Feriepenger utbetales samlet i {{feriepenger_utbetales}}.

Arbeidstakeren har rett til ferie og feriegodtgjørelse i henhold til ferieloven og de til enhver tid gjeldende reguleringer hos Arbeidsgiveren. Det er for tiden {{ferie_uker}} ferie og {{feriepenger_prosent}} feriepenger. Tidspunkt og avvikling av ferie skal fastsettes i samsvar med ferielovens regler, og i det enkelte tilfelle i samråd med Arbeidsgiver.

Tillegg og utlegg
{{^tariff}}
{{#har_ub}}
For tiden praktiserer Arbeidsgiveren følgende UB- tillegg ordninger, som kan endres av arbeidsgiver:
{{#ub_tillegg}}
{{navn}}: {{sats}} fra kl {{fra_kl}}–{{til_kl}}
{{/ub_tillegg}}
{{/har_ub}}
{{/tariff}}
{{#tariff}}
Tillegg utbetales i henhold til den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Utgifter som Arbeidstakeren pådrar seg i forbindelse med arbeidet dekkes i henhold til den til den til enhver tid gjeldende policy. Utgiftene skal spesifiseres og dokumenteres.

Pensjon, forsikring og sosiale ytelser

Arbeidsgiveren dekker utstyr og utgifter som Arbeidsgiveren finner nødvendig for at Arbeidstakeren skal kunne utføre arbeidet, i tråd med de til enhver tid gjeldende retningslinjer.
{{#otp}}
Arbeidstakeren vil ved oppstart av arbeidsforholdet og i ansettelsesperioden være meldt inn i Arbeidsgiverens innskuddsbaserte pensjonsordning hos {{otp_leverandor}}. Nærmere informasjon om den til enhver tid gjeldende pensjonsordning finnes på Arbeidsgiverens intranett. Pensjonsordningen kan endres av Arbeidsgiveren, men uten at allerede opptjente pensjonsrettigheter berøres.
{{/otp}}
Arbeidsgiveren har tegnet yrkesskadeforsikring hos {{yrkesskade_forsikring}}. Nærmere informasjon om forsikringen finnes på Arbeidsgiverens intranett og i yrkesskadeforsikringsloven.

Ved egen sykdom, graviditet, fødsel, adopsjon eller barns sykdom, har Arbeidstakeren rett til ulike ytelser regulert av arbeidsmiljøloven kapittel 12 og folketrygdloven kapittel IV og V.
{{#tariff}}
For øvrig følger rett til annet betalt fravær av den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Annen lovbestemt rett til permisjon er regulert i arbeidsmiljøloven kapittel 12.

Fremgangsmåten ved opphør av arbeidsforhold

Ved oppsigelse eller avskjed fra Arbeidsgiveren skal oppsigelsesbrev leveres til Arbeidstakeren personlig, sendes rekommandert, eller sendes til den e-postadressen som Arbeidstakeren har oppgitt. Oppsigelse eller avskjed skal inneholde den informasjonen som er pålagt etter arbeidsmiljøloven § 15-4. Gjeldende oppsigelsesfrist er beskrevet i Ansettelsesavtalen punkt 6.

Før Arbeidsgiveren eventuelt beslutter oppsigelse eller avskjed skal det så langt det er praktisk mulig gjennomføres drøftingsmøte slik dette er beskrevet i arbeidsmiljøloven § 15-1. Hvis oppsigelsen er en del av en masseoppsigelse som ledd i en nedbemanningsprosess, skal også drøftingsmøter med tillitsvalgte gjennomføres, jf. arbeidsmiljøloven § 15-2.

Arbeidsgiverens personalreglement

Arbeidsforholdet reguleres av Arbeidsgiverens til enhver tid gjeldende personalreglement, likevel med slike modifikasjoner som følger av dette Tillegget. Opplæring og sikkerhetsreglementet legges ved denne avtalen og gås gjennom sammen med arbeidsgiver.

Personalreglementet inneholder blant annet informasjon om Arbeidsgiverens styringsmodell og annen ansattrelevant informasjon.

Brudd på bestemmelsene ovenfor eller sikkerhet og personalreglementet kan medføre konsekvenser for arbeidsforholdet med Arbeidsgiveren, og i alvorlige tilfeller vil brudd kunne resultere i oppsigelse eller avskjed, i tillegg til erstatningsansvar.
$tpl_fast_v2$, jsonb_build_array('selskap', 'org_nr', 'navn', 'fodselsnummer', 'ansatt_adresse', 'mobil', 'stillingsprosent', 'tiltredelsesdato', 'timer_per_uke', 'timer_per_dag', 'sted', 'timelonn'), true);

insert into public.contract_templates (org_id, key, name, version, body_markdown, required_fields, is_active)
values (null, 'midlertidig_vikar', 'Ansettelsesavtale midlertidig vikar', 2, $tpl_midlertidig_vikar_v2$
ANSETTELSESAVTALE
{{selskap}}
Org.nr {{org_nr}}
{{navn}}
{{fodselsnummer}}
{{ansatt_adresse}}
{{mobil}}

Arbeidsforhold

Arbeidstakeren ansettes midlertidig hos Arbeidsgiveren med tiltredelse {{tiltredelsesdato}}. Arbeidstakeren er ansatt i en {{stillingsprosent}} % stilling. Arbeidsforholdet opphører uten oppsigelse {{opphorsdato}} (Opphørstidspunktet). Grunnlaget for ansettelsen er arbeidsmiljøloven § 14-9 andre ledd bokstav b

De vilkår og betingelser som gjelder i arbeidsforholdet er inntatt i denne Arbeidsavtalen og i Vedlegg 1. I Vedlegg 1 har Arbeidsgiveren inkludert lovpålagt informasjon som gjelder ved oppstart av arbeidsforholdet.

Arbeidstakeren plikter, så langt det er av betydning for arbeidsforholdet, å holde seg oppdatert på og følge de til enhver tid gjeldende regler for Arbeidsgiveren, enten disse følger lover, forskrifter, interne retningslinjer og policyer eller instrukser mv. gitt av Arbeidsgiveren.

Nedenfor følger vilkår og bestemmelser som gjelder ved oppstart av arbeidsforholdet. Endringer i vilkår og bestemmelser kan skje i henhold til Ansettelsesavtalen, jf. særlig punkt 1.2 ovenfor, eller som følge av nye lover eller forskrifter.

Stilling

Arbeidstakeren er ansatt som selger, som for tiden innebærer salg og kundeservice, renhold, varepåfylling, tilberedning av mat og matsikkerhet.

Arbeidstakers arbeidsutførelse skal være i samsvar med lov, retningslinjer og eventuell arbeidsbeskrivelse.

Arbeidstakeren er i ansettelsesperioden forpliktet til å anvende sin arbeidskraft i Arbeidsgivers interesse, innenfor sin stillingsprosent. Arbeidstaker kan ikke påta seg annet arbeid, verv eller oppdrag – heller ikke ulønnet – dersom dette kan være uforenelig med Arbeidsgiverens interesser, herunder med hensyn til å bevare forretningshemmeligheter, eller Arbeidstakerens helse og sikkerhet.

Arbeidstid

Det praktiseres skiftordning i virksomheten og den daglige og ukentlige arbeidstiden vil variere, og arbeidstaker er forpliktet til å følge den til enhver tid gjeldende arbeidsplan.

Arbeidstiden er gjennomsnittlig på {{timer_per_uke}} timer per uke. Den gjennomsnittlige daglige arbeidstiden er {{timer_per_dag}} timer i butikkens åpningstider.

Nærmere plassering av daglig og ukentlig arbeidstid følger av gjeldende arbeidsplan.

Arbeidsplanen iverksettes og endres i tråd med arbeidsmiljøloven § 10-3, normalt med 14 dagers varsel.
{{#tariff}}
Arbeidsplanen iverksettes og endres i tråd med den til enhver tid gjeldende tariffavtale, normalt med fire ukers varsel.
{{/tariff}}
Arbeidstaker har rett på pauser etter arbeidsmiljøloven § 10-9.
{{#tariff}}
Pauser reguleres i tillegg av den til enhver tid gjeldene tariffavtale.
{{/tariff}}
Arbeidsgiver kan pålegge arbeidstaker arbeid utover avtalt arbeidstid etter arbeidsmiljøloven § 10-6.
{{^tariff}}
For overtidsarbeid utbetales overtidstillegg med minst 40 prosent i henhold til arbeidsmiljøloven § 10-6.
{{/tariff}}
{{#tariff}}
For overtidsarbeid utbetales overtidstillegg i henhold til den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Arbeidstaker har bare rett til kompensasjon for overtidsarbeid som er pålagt eller godkjent av nærmeste overordnede. Ved merarbeid utbetales ikke overtidstillegg.
{{#under_18}}
For arbeidstakere som er under 18 år gjelder arbeidstidsbegrensningene i aml. kapittel 11.
{{/under_18}}

Arbeidssted

Arbeidssted er for tiden hovedsakelig ved {{sted}}. Arbeidsgiveren kan endre arbeidsstedet.

Lønn

Ved tiltredelse er Arbeidstakerens ordinære timelønn NOK {{timelonn}}.
{{^tariff}}Bedriften er ikke bundet av tariffavtale.
{{/tariff}}

Arbeidstakeren skal kontrollere at alle utbetalinger fra Arbeidsgiveren er riktige og skal umiddelbart informere Arbeidsgiver om eventuelle feil. Partene er enige om at feil skal rettes opp og Arbeidstaker har ikke rett til å beholde beløp mottatt som følge av feilutbetaling fra arbeidsgivers side. Arbeidsgiver forbeholder seg retten til å kreve feilutbetaling tilbakebetalt ved etterfølgende avtale om lønnstrekk eller på annen måte, og vil varsle arbeidstaker så snart som mulig etter at feilen er oppdaget.

Prøvetid og oppsigelsesfrist

Ansettelsen skjer med {{provetid_mnd}} måneders gjensidig prøvetid. Under prøvetiden gjelder en gjensidig oppsigelsestid på 14 dager, regnet fra den dato oppsigelsen ble gitt. Har Arbeidstakeren vært fraværende fra arbeidet i prøvetiden, kan prøvetiden forlenges tilsvarende lengden av fraværet.

Hver av partene kan før Opphørstidspunktet si opp ansettelsesforholdet med en gjensidig oppsigelsesfrist på {{oppsigelsesfrist_mnd}} måned. Oppsigelse skal gis skriftlig, og fristen regnes fra utløpet av måneden oppsigelsen fant sted.

Taushetsplikt og tilbakelevering av Arbeidsgiverens eiendom

Arbeidstaker er forpliktet til, så vel i ansettelsestiden som etter dennes opphør, å bevare fullstendig taushet overfor uvedkommende, herunder andre ansatte hos Arbeidsgiveren, om konfidensiell informasjon om teknologi, forretningsforhold, kunder, leverandører eller forhold av intern art som Arbeidstaker er blitt kjent med i forbindelse med sitt ansettelsesforhold hos Arbeidsgiver. Arbeidstaker er videre forpliktet til, så vel i ansettelsestiden som etter dennes opphør, ikke å utnytte konfidensiell informasjon som nevnt for noe annet formål enn utførelse av arbeidsoppgaver for Arbeidsgiver.

Arbeidsgivers eiendom skal tilbakeleveres til Arbeidsgiver ved arbeidsforholdets opphør eller på forespørsel fra Arbeidsgiver.

Personvern

For å kunne administrere Arbeidstakerens ansettelsesforhold må Arbeidsgiveren behandle visse personopplysninger om Arbeidstakeren. Informasjon om hvilke opplysninger som behandles, hvordan dette gjøres og hvilke rettigheter Arbeidstakeren har i denne sammenheng, er beskrevet i Arbeidsgiverens til enhver tid gjeldende retningslinjer for personvern. Arbeidstakeren er forpliktet til å gjøre seg kjent med det til enhver tid gjeldende innholdet i slike retningslinjer.

Diverse

Denne Ansettelsesavtalen trer i kraft med virkning fra signeringsdato og erstatter alle tidligere muntlige og skriftlige avtaler mellom Arbeidstakeren og Arbeidsgiveren i anledning ansettelsesforholdet.

Partene er enige om at Ansettelsesavtalen skal justeres/endres ved eventuelle nye ufravikelige regler for ansettelsesforholdet. Hvis det er flere alternativer, skal det velges det som nærmest samsvarer det som følger av ansettelsesavtalen.
{{#tariff}}
Bedriften er for tiden bundet av Landsoverenskomsten Virke – Handel og Kontor.
{{/tariff}}

Vedlegg 1: Tillegg til Ansettelsesavtalen

Vedlegg 1
TILLEGG TIL ANSETTELSESAVTALEN

Innledning

Dette Tillegget inneholder en beskrivelse av ordninger som gjelder når Ansettelsesavtalen trer i kraft og har som formål å oppfylle informasjonskravene i henhold til arbeidsmiljøloven § 14-6. Med mindre annet uttrykkelig fremgår, er formålet med dette Tillegget å gi Arbeidstakeren lovpålagt informasjon etter arbeidsmiljøloven og å implementere relevante plikter for Arbeidstakeren. Informasjonen som gis skal ikke innebære individuelle rettigheter for Arbeidstakeren. Skjer det endringer i ordningene, vil Arbeidsgiveren orientere om dette.

Ved motstrid mellom innholdet i Ansettelsesavtalen og dette Tillegget, skal Ansettelsesavtalen gis forrang. Med mindre annet fremgår, skal begreper og definisjoner i dette Tillegget ha samme betydning som i Arbeidsavtalen.

Rutiner for lønnsutbetaling og ferie

Lønnen utbetales etterskuddsvis til Arbeidstakerens bankkonto på Arbeidsgiverens ordinære lønningsdag, for tiden den {{lonningsdag}}. hver måned. Feriepenger utbetales samlet i {{feriepenger_utbetales}}.

Arbeidstakeren har rett til ferie og feriegodtgjørelse i henhold til ferieloven og de til enhver tid gjeldende reguleringer hos Arbeidsgiveren. Det er for tiden {{ferie_uker}} ferie og {{feriepenger_prosent}} feriepenger. Tidspunkt og avvikling av ferie skal fastsettes i samsvar med ferielovens regler, og i det enkelte tilfelle i samråd med Arbeidsgiver.

Tillegg og utlegg
{{^tariff}}
{{#har_ub}}
For tiden praktiserer Arbeidsgiveren følgende UB- tillegg ordninger, som kan endres av arbeidsgiver:
{{#ub_tillegg}}
{{navn}}: {{sats}} fra kl {{fra_kl}}–{{til_kl}}
{{/ub_tillegg}}
{{/har_ub}}
{{/tariff}}
{{#tariff}}
Tillegg utbetales i henhold til den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Utgifter som Arbeidstakeren pådrar seg i forbindelse med arbeidet dekkes i henhold til den til den til enhver tid gjeldende policy. Utgiftene skal spesifiseres og dokumenteres.

Pensjon, forsikring og sosiale ytelser

Arbeidsgiveren dekker utstyr og utgifter som Arbeidsgiveren finner nødvendig for at Arbeidstakeren skal kunne utføre arbeidet, i tråd med de til enhver tid gjeldende retningslinjer.
{{#otp}}
Arbeidstakeren vil ved oppstart av arbeidsforholdet og i ansettelsesperioden være meldt inn i Arbeidsgiverens innskuddsbaserte pensjonsordning hos {{otp_leverandor}}. Nærmere informasjon om den til enhver tid gjeldende pensjonsordning finnes på Arbeidsgiverens intranett. Pensjonsordningen kan endres av Arbeidsgiveren, men uten at allerede opptjente pensjonsrettigheter berøres.
{{/otp}}
Arbeidsgiveren har tegnet yrkesskadeforsikring hos {{yrkesskade_forsikring}}. Nærmere informasjon om forsikringen finnes i Arbeidsgiverens personalhåndbok og i yrkesskadeforsikringsloven.

Ved egen sykdom, graviditet, fødsel, adopsjon eller barns sykdom, har Arbeidstakeren rett til ulike ytelser regulert av arbeidsmiljøloven kapittel 12 og folketrygdloven kapittel IV og V.
{{#tariff}}
For øvrig følger rett til annet betalt fravær av den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Annen lovbestemt rett til permisjon er regulert i arbeidsmiljøloven kapittel 12.

Fremgangsmåten ved opphør av arbeidsforhold

Ved oppsigelse eller avskjed fra Arbeidsgiveren skal oppsigelsesbrev leveres til Arbeidstakeren personlig, sendes rekommandert, eller sendes til den e-postadressen som Arbeidstakeren har oppgitt. Oppsigelse eller avskjed skal inneholde den informasjonen som er pålagt etter arbeidsmiljøloven § 15-4. Gjeldende oppsigelsesfrist er beskrevet i Ansettelsesavtalen punkt 6.

Før Arbeidsgiveren eventuelt beslutter oppsigelse eller avskjed skal det så langt det er praktisk mulig gjennomføres drøftingsmøte slik dette er beskrevet i arbeidsmiljøloven § 15-1. Hvis oppsigelsen er en del av en masseoppsigelse som ledd i en nedbemanningsprosess, skal også drøftingsmøter med tillitsvalgte gjennomføres, jf. arbeidsmiljøloven § 15-2.

Arbeidsgiverens personalreglement

Arbeidsforholdet reguleres av Arbeidsgiverens til enhver tid gjeldende personalreglement, likevel med slike modifikasjoner som følger av dette Tillegget. Opplæring og sikkerhetsreglementet legges ved denne avtalen og gås gjennom sammen med arbeidsgiver.

Personalreglementet inneholder blant annet informasjon om Arbeidsgiverens styringsmodell og annen ansattrelevant informasjon.

Brudd på bestemmelsene ovenfor eller personalreglementet kan medføre konsekvenser for arbeidsholdet med Arbeidsgiveren, og i alvorlige tilfeller vil brudd kunne resultere i oppsigelse eller avskjed, i tillegg til erstatningsansvar.
$tpl_midlertidig_vikar_v2$, jsonb_build_array('selskap', 'org_nr', 'navn', 'fodselsnummer', 'ansatt_adresse', 'mobil', 'stillingsprosent', 'tiltredelsesdato', 'opphorsdato', 'timer_per_uke', 'timer_per_dag', 'sted', 'timelonn', 'provetid_mnd', 'oppsigelsesfrist_mnd'), true);

insert into public.contract_templates (org_id, key, name, version, body_markdown, required_fields, is_active)
values (null, 'tilkalling_ramme', 'Rammeavtale for tilkallingsvikar', 2, $tpl_tilkalling_ramme_v2$
ANSETTELSESAVTALE
{{selskap}}
Org.nr {{org_nr}}
{{navn}}
{{fodselsnummer}}
{{ansatt_adresse}}
{{mobil}}

Arbeidsforhold

Arbeidstaker kan tilkalles etter behov, og har full anledning til å takke nei til tilbudt arbeid. Fra og med det tidspunkt Arbeidstaker eventuelt aksepterer tilbudet og frem til det avtalte oppdraget er avsluttet, regulerer denne Arbeidsavtalen arbeidsforholdet mellom Partene.

De vilkår og betingelser som gjelder i arbeidsforholdet er inntatt i denne Arbeidsavtalen og i Vedlegg 1. I Vedlegg 1 har Arbeidsgiveren inkludert lovpålagt informasjon som gjelder ved oppstart av arbeidsforholdet.

Arbeidstakeren plikter, så langt det er av betydning for arbeidsforholdet, å holde seg oppdatert på og følge de til enhver tid gjeldende regler for Arbeidsgiveren, enten disse følger lover, forskrifter, interne retningslinjer og policyer eller instrukser mv. gitt av Arbeidsgiveren.

Nedenfor følger vilkår og bestemmelser som gjelder ved oppstart av arbeidsforholdet. Endringer i vilkår og bestemmelser kan skje i henhold til Ansettelsesavtalen, jf. særlig punkt 1.2 ovenfor, eller som følge av nye lover eller forskrifter.

Stilling

Arbeidstakeren er ansatt som selger, som for tiden innebærer salg og kundeservice, renhold, varepåfylling, tilberedning av mat og matsikkerhet.

Arbeidstakers arbeidsutførelse skal være i samsvar med lov, retningslinjer og eventuell arbeidsbeskrivelse.

Arbeidstid

Arbeidsforholdet tiltres ved hvert avtalte oppdrag/tilkallingens begynnelse, og avsluttes uten forutgående oppsigelse og uten oppsigelsesfrist etter endt tilkalling.

Den alminnelige arbeidstiden hos Arbeidsgiveren er {{alminnelig_ukentlig_arbeidstid}} timer per uke. Arbeidstiden plasseres i butikkens åpningstider. Daglig / ukentlig arbeidstid, fastsettes for hvert enkelt oppdrag.

Arbeidstaker har rett på pauser etter arbeidsmiljøloven § 10-9.

Arbeidsgiver kan pålegge arbeidstaker arbeid utover avtalt arbeidstid etter arbeidsmiljøloven § 10-6.
{{^tariff}}
For overtidsarbeid utbetales overtidstillegg med minst 40 prosent i henhold til arbeidsmiljøloven § 10-6.
{{/tariff}}
{{#tariff}}
For overtidsarbeid utbetales overtidstillegg i henhold til den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Arbeidstaker har bare rett til kompensasjon for overtidsarbeid som er pålagt eller godkjent av nærmeste overordnede. Ved merarbeid utbetales ikke overtidstillegg.
{{#under_18}}
For arbeidstakere som er under 18 år gjelder arbeidstidsbegrensningene i aml. kapittel 11.
{{/under_18}}

Arbeidssted

Arbeidssted er for tiden hovedsakelig ved {{sted}}. Arbeidsgiveren kan endre arbeidsstedet.

Lønn

Ved tiltredelse er Arbeidstakerens ordinære timelønn NOK {{timelonn}}.
{{^tariff}}Bedriften er ikke bundet av tariffavtale.
{{/tariff}}

Arbeidstakeren skal kontrollere at alle utbetalinger fra Arbeidsgiveren er riktige og skal umiddelbart informere Arbeidsgiver om eventuelle feil. Partene er enige om at feil skal rettes opp og Arbeidstaker har ikke rett til å beholde beløp mottatt som følge av feilutbetaling fra arbeidsgivers side. Arbeidsgiver forbeholder seg retten til å kreve feilutbetaling tilbakebetalt ved etterfølgende avtale om lønnstrekk eller på annen måte, og vil varsle arbeidstaker så snart som mulig etter at feilen er oppdaget.

Opphør

Hver av partene kan før utløp av den avtalte perioden si opp ansettelsesforholdet med en gjensidig oppsigelsesfrist på {{oppsigelsesfrist_mnd}} måned. Oppsigelse skal gis skriftlig, og fristen regnes fra utløpet av måneden oppsigelsen fant sted.

Taushetsplikt og tilbakelevering av Arbeidsgiverens eiendom

Arbeidstaker er forpliktet til, så vel i ansettelsestiden som etter dennes opphør, å bevare fullstendig taushet overfor uvedkommende, herunder andre ansatte hos Arbeidsgiveren, om konfidensiell informasjon om teknologi, forretningsforhold, kunder, leverandører eller forhold av intern art som Arbeidstaker er blitt kjent med i forbindelse med sitt ansettelsesforhold hos Arbeidsgiver. Arbeidstaker er videre forpliktet til, så vel i ansettelsestiden som etter dennes opphør, ikke å utnytte konfidensiell informasjon som nevnt for noe annet formål enn utførelse av arbeidsoppgaver for Arbeidsgiver.

Arbeidsgivers eiendom skal tilbakeleveres til Arbeidsgiver ved arbeidsforholdets opphør eller på forespørsel fra Arbeidsgiver.

Personvern

For å kunne administrere Arbeidstakerens ansettelsesforhold må Arbeidsgiveren behandle visse personopplysninger om Arbeidstakeren. Informasjon om hvilke opplysninger som behandles, hvordan dette gjøres og hvilke rettigheter Arbeidstakeren har i denne sammenheng, er beskrevet i Arbeidsgiverens til enhver tid gjeldende retningslinjer for personvern. Arbeidstakeren er forpliktet til å gjøre seg kjent med det til enhver tid gjeldende innholdet i slike retningslinjer.

Diverse

Denne Ansettelsesavtalen trer i kraft med virkning fra signeringsdato og erstatter alle tidligere muntlige og skriftlige avtaler mellom Arbeidstakeren og Arbeidsgiveren i anledning ansettelsesforholdet.

Partene er enige om at Ansettelsesavtalen skal justeres/endres ved eventuelle nye ufravikelige regler for ansettelsesforholdet. Hvis det er flere alternativer, skal det velges det som nærmest samsvarer det som følger av ansettelsesavtalen.
{{#tariff}}
Bedriften er for tiden bundet av Landsoverenskomsten Virke – Handel og Kontor.
{{/tariff}}

Vedlegg 1: Tillegg til Ansettelsesavtalen

Vedlegg 1
TILLEGG TIL ANSETTELSESAVTALEN

Innledning

Dette Tillegget inneholder en beskrivelse av ordninger som gjelder når Ansettelsesavtalen trer i kraft og har som formål å oppfylle informasjonskravene i henhold til arbeidsmiljøloven § 14-6. Med mindre annet uttrykkelig fremgår, er formålet med dette Tillegget å gi Arbeidstakeren lovpålagt informasjon etter arbeidsmiljøloven og å implementere relevante plikter for Arbeidstakeren. Informasjonen som gis skal ikke innebære individuelle rettigheter for Arbeidstakeren. Skjer det endringer i ordningene, vil Arbeidsgiveren orientere om dette.

Ved motstrid mellom innholdet i Ansettelsesavtalen og dette Tillegget, skal Ansettelsesavtalen gis forrang. Med mindre annet fremgår, skal begreper og definisjoner i dette Tillegget ha samme betydning som i Arbeidsavtalen.

Rutiner for lønnsutbetaling og ferie

Lønnen utbetales etterskuddsvis til Arbeidstakerens bankkonto på Arbeidsgiverens ordinære lønningsdag, for tiden den {{lonningsdag}}. hver måned. Feriepenger utbetales samlet i {{feriepenger_utbetales}}.

Arbeidstakeren har rett til ferie og feriegodtgjørelse i henhold til ferieloven og de til enhver tid gjeldende reguleringer hos Arbeidsgiveren. Det er for tiden {{ferie_uker}} ferie og {{feriepenger_prosent}} feriepenger. Tidspunkt og avvikling av ferie skal fastsettes i samsvar med ferielovens regler, og i det enkelte tilfelle i samråd med Arbeidsgiver.

Tillegg og utlegg
{{^tariff}}
{{#har_ub}}
For tiden praktiserer Arbeidsgiveren følgende UB- tillegg ordninger, som kan endres av arbeidsgiver:
{{#ub_tillegg}}
{{navn}}: {{sats}} fra kl {{fra_kl}}–{{til_kl}}
{{/ub_tillegg}}
{{/har_ub}}
{{/tariff}}
{{#tariff}}
Tillegg utbetales i henhold til den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Utgifter som Arbeidstakeren pådrar seg i forbindelse med arbeidet dekkes i henhold til den til den til enhver tid gjeldende policy. Utgiftene skal spesifiseres og dokumenteres.

Pensjon, forsikring og sosiale ytelser

Arbeidsgiveren dekker utstyr og utgifter som Arbeidsgiveren finner nødvendig for at Arbeidstakeren skal kunne utføre arbeidet, i tråd med de til enhver tid gjeldende retningslinjer.
{{#otp}}
Arbeidstakeren vil ved oppstart av arbeidsforholdet og i ansettelsesperioden være meldt inn i Arbeidsgiverens innskuddsbaserte pensjonsordning hos {{otp_leverandor}}. Nærmere informasjon om den til enhver tid gjeldende pensjonsordning finnes på Arbeidsgiverens intranett. Pensjonsordningen kan endres av Arbeidsgiveren, men uten at allerede opptjente pensjonsrettigheter berøres.
{{/otp}}
Arbeidsgiveren har tegnet yrkesskadeforsikring hos {{yrkesskade_forsikring}}. Nærmere informasjon om forsikringen finnes i Arbeidsgiverens personalhåndbok og i yrkesskadeforsikringsloven.

Ved egen sykdom, graviditet, fødsel, adopsjon eller barns sykdom, har Arbeidstakeren rett til ulike ytelser regulert av arbeidsmiljøloven kapittel 12 og folketrygdloven kapittel IV og V.
{{#tariff}}
For øvrig følger rett til annet betalt fravær av den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Annen lovbestemt rett til permisjon er regulert i arbeidsmiljøloven kapittel 12.

Fremgangsmåten ved opphør av arbeidsforhold

Ved oppsigelse eller avskjed fra Arbeidsgiveren skal oppsigelsesbrev leveres til Arbeidstakeren personlig, sendes rekommandert, eller sendes til den e-postadressen som Arbeidstakeren har oppgitt. Oppsigelse eller avskjed skal inneholde den informasjonen som er pålagt etter arbeidsmiljøloven § 15-4. Gjeldende oppsigelsesfrist er beskrevet i Ansettelsesavtalen punkt 6.

Før Arbeidsgiveren eventuelt beslutter oppsigelse eller avskjed skal det så langt det er praktisk mulig gjennomføres drøftingsmøte slik dette er beskrevet i arbeidsmiljøloven § 15-1. Hvis oppsigelsen er en del av en masseoppsigelse som ledd i en nedbemanningsprosess, skal også drøftingsmøter med tillitsvalgte gjennomføres, jf. arbeidsmiljøloven § 15-2.

Arbeidsgiverens personalreglement

Arbeidsforholdet reguleres av Arbeidsgiverens til enhver tid gjeldende personalreglement, likevel med slike modifikasjoner som følger av dette Tillegget. Opplæring og sikkerhetsreglementet legges ved denne avtalen og gås gjennom sammen med arbeidsgiver.

Personalreglementet inneholder blant annet informasjon om Arbeidsgiverens styringsmodell og annen ansattrelevant informasjon.

Brudd på bestemmelsene ovenfor eller personalreglementet kan medføre konsekvenser for arbeidsholdet med Arbeidsgiveren, og i alvorlige tilfeller vil brudd kunne resultere i oppsigelse eller avskjed, i tillegg til erstatningsansvar.
$tpl_tilkalling_ramme_v2$, jsonb_build_array('selskap', 'org_nr', 'navn', 'fodselsnummer', 'ansatt_adresse', 'mobil', 'alminnelig_ukentlig_arbeidstid', 'sted', 'timelonn', 'oppsigelsesfrist_mnd'), true);

insert into public.contract_templates (org_id, key, name, version, body_markdown, required_fields, is_active)
values (null, 'butikksjef_ledende', 'Ansettelsesavtale butikksjef, ledende stilling', 2, $tpl_butikksjef_ledende_v2$
ANSETTELSESAVTALE
{{selskap}}
Org.nr {{org_nr}}
{{navn}}
{{fodselsnummer}}
{{ansatt_adresse}}
{{mobil}}

Arbeidsforhold

Arbeidstakeren ansettes hos Arbeidsgiveren med tiltredelse {{tiltredelsesdato}}. Arbeidstakeren er ansatt i en {{stillingsprosent}} % stilling.

De vilkår og betingelser som gjelder i arbeidsforholdet er inntatt i denne Arbeidsavtalen og i Vedlegg 1. I Vedlegg 1 har Arbeidsgiveren inkludert lovpålagt informasjon som gjelder ved oppstart av arbeidsforholdet.

Arbeidstakeren plikter, så langt det er av betydning for arbeidsforholdet, å holde seg oppdatert på og følge de til enhver tid gjeldende regler for Arbeidsgiveren, enten disse følger lover, forskrifter, interne retningslinjer og policyer eller instrukser mv. gitt av Arbeidsgiveren.

Nedenfor følger vilkår og bestemmelser som gjelder ved oppstart av arbeidsforholdet. Endringer i vilkår og bestemmelser kan skje i henhold til Ansettelsesavtalen, jf. særlig punkt 1.2 ovenfor, eller som følge av nye lover eller forskrifter.

Arbeidsoppgaver og ansvar

For tiden innebærer arbeidsforholdet at Arbeidstakeren skal utføre følgende arbeidsoppgaver: {{arbeidsoppgaver}}. Det vil kunne skje endringer i oppgaver og ansvar.

Arbeidstakers arbeidsutførelse skal være i samsvar med lov, retningslinjer og eventuell arbeidsbeskrivelse.

Arbeidstakeren er i ansettelsesperioden forpliktet til å anvende sin arbeidskraft i Arbeidsgivers interesse, innenfor sin stillingsprosent. Arbeidstaker kan ikke påta seg annet arbeid, verv eller oppdrag – heller ikke ulønnet – dersom dette kan være uforenelig med Arbeidsgiverens interesser, herunder med hensyn til å bevare forretningshemmeligheter, eller Arbeidstakerens helse og sikkerhet.

Arbeidstid

Den alminnelige arbeidstiden er gjennomsnittlig på {{timer_per_uke}} timer per uke. Den gjennomsnittlige daglige arbeidstiden er {{timer_per_dag}} timer i butikkens åpningstider.

Nærmere plassering av daglig og ukentlig arbeidstid følger av gjeldende arbeidsplan.

Arbeidstakeren er ansatt i en ledende stilling, jf. arbeidsmiljøloven § 10-12 (2). Det innebærer at arbeidsmiljølovens regler om arbeidstid ikke gjelder, med unntak av kravet til et fullt forsvarlig arbeidsmiljø. Innsats utover alminnelig arbeidstid må påregnes. Det gjelder ingen rett til overtidsgodtgjørelse.

Arbeidssted

Arbeidssted er for tiden hovedsakelig ved {{sted}}. Arbeidsgiveren kan endre arbeidsstedet.

Lønn

Ved tiltredelse er Arbeidstakerens ordinære timelønn NOK {{timelonn}}.
{{^tariff}}Bedriften er ikke bundet av tariffavtale.
{{/tariff}}

Arbeidstakeren skal kontrollere at alle utbetalinger fra Arbeidsgiveren er riktige og skal umiddelbart informere Arbeidsgiver om eventuelle feil. Partene er enige om at feil skal rettes opp og Arbeidstaker har ikke rett til å beholde beløp mottatt som følge av feilutbetaling fra arbeidsgivers side. Arbeidsgiver forbeholder seg retten til å kreve feilutbetaling tilbakebetalt ved etterfølgende avtale om lønnstrekk eller på annen måte, og vil varsle arbeidstaker så snart som mulig etter at feilen er oppdaget.

Prøvetid og oppsigelsesfrist

Ansettelsen skjer med 6 måneders gjensidig prøvetid. Under prøvetiden gjelder en gjensidig oppsigelsestid på 14 dager, regnet fra den dato oppsigelsen ble gitt. Har Arbeidstakeren vært fraværende fra arbeidet i prøvetiden, kan prøvetiden forlenges tilsvarende lengden av fraværet.

Etter utløpet av prøvetiden gjelder en gjensidig oppsigelsesfrist på 1 måned, med mindre en lenger frist fremgår av arbeidsmiljøloven. Oppsigelsestiden regnes fra første dag i måneden etter den måneden oppsigelsen ble gitt.

Taushetsplikt og tilbakelevering av Arbeidsgiverens eiendom

Arbeidstaker er forpliktet til, så vel i ansettelsestiden som etter dennes opphør, å bevare fullstendig taushet overfor uvedkommende, herunder andre ansatte hos Arbeidsgiveren, om konfidensiell informasjon om teknologi, forretningsforhold, kunder, leverandører eller forhold av intern art som Arbeidstaker er blitt kjent med i forbindelse med sitt ansettelsesforhold hos Arbeidsgiver. Arbeidstaker er videre forpliktet til, så vel i ansettelsestiden som etter dennes opphør, ikke å utnytte konfidensiell informasjon som nevnt for noe annet formål enn utførelse av arbeidsoppgaver for Arbeidsgiver.

Arbeidsgivers eiendom skal tilbakeleveres til Arbeidsgiver ved arbeidsforholdets opphør eller på forespørsel fra Arbeidsgiver.

Personvern

For å kunne administrere Arbeidstakerens ansettelsesforhold må Arbeidsgiveren behandle visse personopplysninger om Arbeidstakeren. Informasjon om hvilke opplysninger som behandles, hvordan dette gjøres og hvilke rettigheter Arbeidstakeren har i denne sammenheng, er beskrevet i Arbeidsgiverens til enhver tid gjeldende retningslinjer for personvern. Arbeidstakeren er forpliktet til å gjøre seg kjent med det til enhver tid gjeldende innholdet i slike retningslinjer.

Diverse

Denne Ansettelsesavtalen trer i kraft med virkning fra signeringsdato og erstatter alle tidligere muntlige og skriftlige avtaler mellom Arbeidstakeren og Arbeidsgiveren i anledning ansettelsesforholdet.

Partene er enige om at Ansettelsesavtalen skal justeres/endres ved eventuelle nye ufravikelige regler for ansettelsesforholdet. Hvis det er flere alternativer, skal det velges det som nærmest samsvarer det som følger av ansettelsesavtalen.
{{#tariff}}
Bedriften er for tiden bundet av Landsoverenskomsten Virke – Handel og Kontor.
{{/tariff}}

Vedlegg 1: Tillegg til Ansettelsesavtalen

Vedlegg 1
TILLEGG TIL ANSETTELSESAVTALEN

Innledning

Dette Tillegget inneholder en beskrivelse av ordninger som gjelder når Ansettelsesavtalen trer i kraft og har som formål å oppfylle informasjonskravene i henhold til arbeidsmiljøloven § 14-6. Med mindre annet uttrykkelig fremgår, er formålet med dette Tillegget å gi Arbeidstakeren lovpålagt informasjon etter arbeidsmiljøloven og å implementere relevante plikter for Arbeidstakeren. Informasjonen som gis skal ikke innebære individuelle rettigheter for Arbeidstakeren. Skjer det endringer i ordningene, vil Arbeidsgiveren orientere om dette.

Ved motstrid mellom innholdet i Ansettelsesavtalen og dette Tillegget, skal Ansettelsesavtalen gis forrang. Med mindre annet fremgår, skal begreper og definisjoner i dette Tillegget ha samme betydning som i Arbeidsavtalen.

Rutiner for lønnsutbetaling og ferie

Lønnen utbetales etterskuddsvis til Arbeidstakerens bankkonto på Arbeidsgiverens ordinære lønningsdag, for tiden den {{lonningsdag}}. hver måned. Feriepenger utbetales samlet i {{feriepenger_utbetales}}.

Arbeidstakeren har rett til ferie og feriegodtgjørelse i henhold til ferieloven og de til enhver tid gjeldende reguleringer hos Arbeidsgiveren. Det er for tiden {{ferie_uker}} ferie og {{feriepenger_prosent}} feriepenger. Tidspunkt og avvikling av ferie skal fastsettes i samsvar med ferielovens regler, og i det enkelte tilfelle i samråd med Arbeidsgiver.

Tillegg og utlegg
{{^tariff}}
{{#har_ub}}
For tiden praktiserer Arbeidsgiveren følgende UB- tillegg ordninger, som kan endres av arbeidsgiver:
{{#ub_tillegg}}
{{navn}}: {{sats}} fra kl {{fra_kl}}–{{til_kl}}
{{/ub_tillegg}}
{{/har_ub}}
{{/tariff}}
{{#tariff}}
Tillegg utbetales i henhold til den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Utgifter som Arbeidstakeren pådrar seg i forbindelse med arbeidet dekkes i henhold til den til den til enhver tid gjeldende policy. Utgiftene skal spesifiseres og dokumenteres.

Pensjon, forsikring og sosiale ytelser

Arbeidsgiveren dekker utstyr og utgifter som Arbeidsgiveren finner nødvendig for at Arbeidstakeren skal kunne utføre arbeidet, i tråd med de til enhver tid gjeldende retningslinjer.
{{#otp}}
Arbeidstakeren vil ved oppstart av arbeidsforholdet og i ansettelsesperioden være meldt inn i Arbeidsgiverens innskuddsbaserte pensjonsordning hos {{otp_leverandor}}. Nærmere informasjon om den til enhver tid gjeldende pensjonsordning finnes på Arbeidsgiverens intranett. Pensjonsordningen kan endres av Arbeidsgiveren, men uten at allerede opptjente pensjonsrettigheter berøres.
{{/otp}}
Arbeidsgiveren har tegnet yrkesskadeforsikring hos {{yrkesskade_forsikring}}. Nærmere informasjon om forsikringen finnes i Arbeidsgiverens personalhåndbok og i yrkesskadeforsikringsloven.

Ved egen sykdom, graviditet, fødsel, adopsjon eller barns sykdom, har Arbeidstakeren rett til ulike ytelser regulert av arbeidsmiljøloven kapittel 12 og folketrygdloven kapittel IV og V.
{{#tariff}}
For øvrig følger rett til annet betalt fravær av den til enhver tid gjeldende tariffavtale.
{{/tariff}}
Annen lovbestemt rett til permisjon er regulert i arbeidsmiljøloven kapittel 12.

Fremgangsmåten ved opphør av arbeidsforhold

Ved oppsigelse eller avskjed fra Arbeidsgiveren skal oppsigelsesbrev leveres til Arbeidstakeren personlig, sendes rekommandert, eller sendes til den e-postadressen som Arbeidstakeren har oppgitt. Oppsigelse eller avskjed skal inneholde den informasjonen som er pålagt etter arbeidsmiljøloven § 15-4. Gjeldende oppsigelsesfrist er beskrevet i Ansettelsesavtalen punkt 6.

Før Arbeidsgiveren eventuelt beslutter oppsigelse eller avskjed skal det så langt det er praktisk mulig gjennomføres drøftingsmøte slik dette er beskrevet i arbeidsmiljøloven § 15-1. Hvis oppsigelsen er en del av en masseoppsigelse som ledd i en nedbemanningsprosess, skal også drøftingsmøter med tillitsvalgte gjennomføres, jf. arbeidsmiljøloven § 15-2.

Arbeidsgiverens personalreglement

Arbeidsforholdet reguleres av Arbeidsgiverens til enhver tid gjeldende personalreglement, likevel med slike modifikasjoner som følger av dette Tillegget. Opplæring og sikkerhetsreglementet legges ved denne avtalen og gås gjennom sammen med arbeidsgiver.

Personalreglementet inneholder blant annet informasjon om Arbeidsgiverens styringsmodell og annen ansattrelevant informasjon.

Brudd på bestemmelsene ovenfor eller personalreglementet kan medføre konsekvenser for arbeidsholdet med Arbeidsgiveren, og i alvorlige tilfeller vil brudd kunne resultere i oppsigelse eller avskjed, i tillegg til erstatningsansvar.
$tpl_butikksjef_ledende_v2$, jsonb_build_array('selskap', 'org_nr', 'navn', 'fodselsnummer', 'ansatt_adresse', 'mobil', 'stillingsprosent', 'tiltredelsesdato', 'timer_per_uke', 'timer_per_dag', 'sted', 'timelonn', 'arbeidsoppgaver'), true);

insert into public.contract_templates (org_id, key, name, version, body_markdown, required_fields, is_active)
values (null, 'bilag', 'Bilag – midlertidig ansettelsesavtale', 2, $tpl_bilag_v2$
{{selskap}}
Org.nr {{org_nr}}
{{navn}}
{{fodselsnummer}}
{{ansatt_adresse}}
{{mobil}}
Tiltredelse: {{tiltredelsesdato}}
Opphørsdato: {{opphorsdato}}
Arbeidstid:
{{timer_per_dag}} per dag/{{timer_per_uke}} per uke.
Grunnlaget for midlertidig ansettelse:
{{grunnlag}}
Det vises til Rammeavtale for midlertidige arbeidsavtaler etter tilkalling som er inngått mellom partene, og som angir de øvrige vilkårene for denne midlertidige ansettelsesavtalen.
$tpl_bilag_v2$, jsonb_build_array('selskap', 'org_nr', 'navn', 'fodselsnummer', 'ansatt_adresse', 'mobil', 'tiltredelsesdato', 'opphorsdato', 'timer_per_dag', 'timer_per_uke', 'grunnlag'), true);

