-- Digital employment contracts.
-- NOT APPLIED to the live database by this change. Review, then run it
-- in the Supabase SQL editor or via the migration pipeline when ready.
--
-- Fødselsnummer is intentionally not stored (dataminimering).

-- ---------------------------------------------------------------------------
-- Worker and workplace fields used by the chain templates.
-- ---------------------------------------------------------------------------

alter table public.workers
  add column if not exists birth_date date,
  add column if not exists address text,
  add column if not exists ansettelsestype text,
  add column if not exists tiltredelsesdato date,
  add column if not exists opphorsdato date,
  add column if not exists timer_per_uke double precision,
  add column if not exists timer_per_dag double precision,
  add column if not exists arbeidsoppgaver text,
  add column if not exists provetid_mnd integer;

alter table public.workers drop constraint if exists workers_ansettelsestype_check;
alter table public.workers
  add constraint workers_ansettelsestype_check
  check (
    ansettelsestype is null
    or ansettelsestype in ('fast', 'midlertidig_vikar', 'tilkalling', 'butikksjef_ledende')
  );

comment on column public.workers.birth_date is
  'Fødselsdato for aml. kap. 11. Ikke fødselsnummer. Skjult for butikksjef.';

alter table public.workplace_settings
  add column if not exists workplace_address text,
  add column if not exists apningstid_fra text,
  add column if not exists apningstid_til text;

-- ---------------------------------------------------------------------------
-- Employer / agreement settings. One row per organization. Wage-like UB
-- rates live here, so only admins can read the row.
-- ---------------------------------------------------------------------------

create table if not exists public.employer_settings (
  id text primary key default gen_random_uuid()::text,
  org_id text not null unique,
  selskap text,
  org_nr text,
  adresse text,
  signatur_navn text,
  signatur_stilling text,
  tariff boolean not null default false,
  alminnelig_ukentlig_arbeidstid double precision not null default 37.5,
  ferie_uker text not null default 'fire uker og 1 dag',
  feriepenger_prosent double precision not null default 10.2,
  lonningsdag integer not null default 15,
  feriepenger_utbetales text not null default 'mai',
  otp boolean not null default true,
  otp_leverandor text not null default 'DNB-LIV',
  yrkesskade_forsikring text not null default 'Gjensidige',
  ub_tillegg jsonb not null default '[]'::jsonb,
  oppsigelsesfrist_mnd_midlertidig integer not null default 1,
  send_tilleggsavtaler_automatisk boolean not null default false,
  signing_provider text not null default 'simple_otp',
  signering_frist_dager integer not null default 14,
  oppbevaring_mnd_etter_opphor integer not null default 60,
  tilkalling_grunnlag text not null default 'vikar',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint employer_settings_provider_check check (signing_provider in ('simple_otp', 'idura', 'signicat')),
  constraint employer_settings_grunnlag_check check (tilkalling_grunnlag in ('vikar', 'sesong'))
);

drop trigger if exists employer_settings_prepare on public.employer_settings;
create trigger employer_settings_prepare
  before insert or update on public.employer_settings
  for each row execute function public.prepare_entity_row();

-- ---------------------------------------------------------------------------
-- Versioned templates. org_id null = global chain templates.
-- ---------------------------------------------------------------------------

create table if not exists public.contract_templates (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  key text not null,
  name text not null,
  version integer not null default 1,
  body_markdown text not null,
  required_fields jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists contract_templates_key_version_idx
  on public.contract_templates (coalesce(org_id, ''), key, version);

-- ---------------------------------------------------------------------------
-- Contract document columns. body_snapshot and field_values are frozen at
-- send time and are wage-bearing, so they are not in the general SELECT grant.
-- ---------------------------------------------------------------------------

alter table public.contracts
  add column if not exists template_key text,
  add column if not exists template_version integer,
  add column if not exists body_snapshot text,
  add column if not exists field_values jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists contract_kind text,
  add column if not exists parent_contract_id text,
  add column if not exists employee_signed_at timestamptz,
  add column if not exists employee_signed_by text,
  add column if not exists employer_signed_at timestamptz,
  add column if not exists employer_signed_by text,
  add column if not exists content_sha256 text,
  add column if not exists pdf_sha256 text,
  add column if not exists pdf_path text,
  add column if not exists rejection_reason text,
  add column if not exists expires_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists signing_provider text default 'simple_otp';

update public.contracts set status = 'signert' where status = 'godkjent';

alter table public.contracts drop constraint if exists contracts_status_check;
alter table public.contracts
  add constraint contracts_status_check check (
    status in (
      'utkast', 'sendt', 'apnet', 'signert_ansatt', 'signert',
      'avvist', 'utlopt', 'trukket'
    )
  );

alter table public.contracts drop constraint if exists contracts_type_check;
alter table public.contracts
  add constraint contracts_type_check check (
    contract_type in (
      'fast', 'ekstrahjelp', 'midlertidig_vikar', 'tilkalling_ramme',
      'butikksjef_ledende', 'merarbeid', 'bilag'
    )
  );

create index if not exists contracts_worker_kind_idx
  on public.contracts (worker_id, contract_type, status);

-- ---------------------------------------------------------------------------
-- Append-only event log and one-time codes.
-- ---------------------------------------------------------------------------

create table if not exists public.contract_events (
  id text primary key default gen_random_uuid()::text,
  contract_id text not null,
  org_id text,
  event_type text not null,
  actor_id text,
  actor_role text,
  ip text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  content_hash text,
  created_at timestamptz not null default now(),
  constraint contract_events_type_check check (
    event_type in (
      'opprettet', 'sendt', 'påminnelse', 'åpnet', 'otp_sendt', 'otp_feil',
      'signert', 'motsignert', 'avvist', 'trukket', 'utløpt'
    )
  )
);

create index if not exists contract_events_contract_idx
  on public.contract_events (contract_id, created_at);

create table if not exists public.contract_otp (
  id text primary key default gen_random_uuid()::text,
  contract_id text not null,
  user_id text not null,
  role text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contract_otp_role_check check (role in ('ansatt', 'arbeidsgiver'))
);

create index if not exists contract_otp_lookup_idx
  on public.contract_otp (contract_id, user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Mustache renderer. No code execution. Values are escaped.
-- ---------------------------------------------------------------------------

create or replace function public.mustache_escape(value text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(replace(replace(
    coalesce(value, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'),
    '{', '&#123;'), '}', '&#125;');
$$;

create or replace function public.mustache_truthy(value jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if value is null or jsonb_typeof(value) = 'null' then
    return false;
  elsif jsonb_typeof(value) = 'boolean' then
    return value = 'true'::jsonb;
  elsif jsonb_typeof(value) = 'string' then
    return btrim(value #>> '{}') <> '';
  elsif jsonb_typeof(value) = 'number' then
    return (value #>> '{}')::numeric <> 0;
  elsif jsonb_typeof(value) = 'array' then
    return jsonb_array_length(value) > 0;
  elsif jsonb_typeof(value) = 'object' then
    return value <> '{}'::jsonb;
  end if;
  return false;
end;
$$;

create or replace function public.mustache_vars(p_text text, p_data jsonb)
returns text
language plpgsql
immutable
as $$
declare
  result text := coalesce(p_text, '');
  matched text[];
  matched_text text;
  key text;
  repl text;
  loc integer;
  guard integer := 0;
begin
  loop
    guard := guard + 1;
    exit when guard > 500;
    matched := regexp_match(result, '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}');
    exit when matched is null;
    key := matched[1];
    matched_text := substring(result from '\{\{\s*[a-zA-Z0-9_]+\s*\}\}');
    loc := regexp_instr(result, '\{\{\s*[a-zA-Z0-9_]+\s*\}\}');
    if p_data ? key
       and jsonb_typeof(p_data -> key) not in ('null', 'array', 'object')
       and coalesce(p_data ->> key, '') <> '' then
      repl := public.mustache_escape(p_data ->> key);
    else
      repl := '';
    end if;
    result := substr(result, 1, loc - 1) || repl || substr(result, loc + char_length(matched_text));
  end loop;
  return result;
end;
$$;

create or replace function public.render_mustache(p_template text, p_data jsonb)
returns text
language plpgsql
immutable
as $$
declare
  result text := coalesce(p_template, '');
  pat text := '(\{\{\s*([#^])\s*([a-zA-Z0-9_]+)\s*\}\}((?:(?!\{\{\s*[#^/])[\s\S])*?)\{\{\s*/\s*\3\s*\}\})';
  matched text[];
  matched_text text;
  loc integer;
  kind text;
  key text;
  body text;
  value jsonb;
  rendered text;
  item jsonb;
  guard integer := 0;
begin
  loop
    guard := guard + 1;
    exit when guard > 200;
    matched := regexp_match(result, pat);
    exit when matched is null;
    matched_text := matched[1];
    kind := matched[2];
    key := matched[3];
    body := matched[4];
    loc := regexp_instr(result, pat);
    value := p_data -> key;
    rendered := '';
    if kind = '^' then
      if not public.mustache_truthy(value) then
        rendered := public.mustache_vars(body, p_data);
      end if;
    elsif public.mustache_truthy(value) then
      if jsonb_typeof(value) = 'array' then
        for item in select jsonb_array_elements(value) loop
          rendered := rendered || public.mustache_vars(body, p_data || coalesce(item, '{}'::jsonb));
        end loop;
      else
        rendered := public.mustache_vars(body, p_data);
      end if;
    end if;
    result := substr(result, 1, loc - 1) || rendered || substr(result, loc + char_length(matched_text));
  end loop;
  result := public.mustache_vars(result, p_data);
  result := regexp_replace(result, '[ \t]+\n', E'\n', 'g');
  result := regexp_replace(result, E'\n{3,}', E'\n\n', 'g');
  result := btrim(result, E' \t\n\r');
  if result <> '' then
    result := result || E'\n';
  end if;
  return result;
end;
$$;

create or replace function public.format_no_number(n numeric)
returns text
language sql
immutable
as $$
  select replace(regexp_replace(to_char(coalesce(n, 0), 'FM999999990.00'), '\.00$', ''), '.', ',');
$$;

-- ---------------------------------------------------------------------------
-- Sensitive worker fields. Birth date is not in the column grant.
-- ---------------------------------------------------------------------------

create or replace function public.guard_worker_sensitive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists workers_sensitive_guard on public.workers;
create trigger workers_sensitive_guard
  before insert or update on public.workers
  for each row execute function public.guard_worker_sensitive();

create or replace function public.worker_contract_fields(p_worker_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w public.workers%rowtype;
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return null;
  end if;
  if not (
    public.is_super_admin()
    or public.worker_matches(w.id)
    or (public.can_read_wages() and public.in_org(w.org_id))
  ) then
    return null;
  end if;
  return jsonb_build_object(
    'id', w.id,
    'birth_date', w.birth_date,
    'address', w.address,
    'hourly_rate', w.hourly_rate
  );
end;
$$;

create or replace function public.contract_document(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
begin
  select * into c from public.contracts where id = p_id;
  if not found then
    return null;
  end if;
  if not (
    public.is_super_admin()
    or public.worker_matches(c.worker_id)
    or (public.can_read_wages() and public.in_org(c.org_id))
  ) then
    return null;
  end if;
  return jsonb_build_object(
    'id', c.id,
    'body_snapshot', c.body_snapshot,
    'field_values', c.field_values,
    'hourly_rate', c.hourly_rate,
    'pdf_path', c.pdf_path,
    'pdf_url', c.pdf_url,
    'pdf_sha256', c.pdf_sha256,
    'content_sha256', c.content_sha256,
    'metadata', c.metadata,
    'template_key', c.template_key,
    'template_version', c.template_version,
    'status', c.status
  );
end;
$$;

create or replace function public.is_store_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'butikksjef'
    or exists (
      select 1
      from public.workers w
      join public.profiles p on p.id = auth.uid()::text
      where w.email is not null
        and btrim(w.email) <> ''
        and lower(w.email) = lower(coalesce(p.email, ''))
        and (
          w.role = 'butikksjef'
          or exists (
            select 1
            from jsonb_each_text(coalesce(w.team_roles, '{}'::jsonb)) as t(k, v)
            where t.v = 'butikksjef'
              and (
                w.teams is null
                or cardinality(w.teams) = 0
                or t.k = any (w.teams)
              )
          )
        )
    );
$$;

create or replace function public.shares_team_with_worker(target_worker text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workers me
    join public.workers them on them.id = target_worker
    where me.id in (select public.my_worker_ids())
      and me.org_id is not distinct from them.org_id
      and coalesce(me.teams, '{}'::text[]) && coalesce(them.teams, '{}'::text[])
  );
$$;

-- ---------------------------------------------------------------------------
-- Locks: employee signature, signed text, append-only events.
-- ---------------------------------------------------------------------------

create or replace function public.guard_contract_signature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status in ('signert_ansatt', 'signert') then
    if new.body_snapshot is distinct from old.body_snapshot
       or new.field_values is distinct from old.field_values
       or new.hourly_rate is distinct from old.hourly_rate
       or new.template_key is distinct from old.template_key
       or new.worker_id is distinct from old.worker_id then
      raise exception 'Signert avtale kan ikke endres';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'signert' and new.status is distinct from 'signert' then
    raise exception 'Signert avtale kan ikke endres';
  end if;

  if auth.uid() is not null and tg_op = 'UPDATE' then
    if (
      (new.employee_signed_at is not null and new.employee_signed_at is distinct from old.employee_signed_at)
      or (new.status = 'signert_ansatt' and old.status is distinct from 'signert_ansatt')
      or (new.approved_by_worker_id is not null and new.approved_by_worker_id is distinct from old.approved_by_worker_id)
    ) and not public.worker_matches(new.worker_id) then
      raise exception 'Ansattens signatur kan bare avgis av den ansatte selv';
    end if;

    if new.approved_by_worker_id is not null
       and new.approved_by_worker_id is distinct from old.approved_by_worker_id
       and new.approved_by_worker_id is distinct from auth.uid()::text then
      raise exception 'Ansattens signatur kan bare avgis av den ansatte selv';
    end if;

    if new.employer_signed_at is not null
       and new.employer_signed_at is distinct from old.employer_signed_at
       and not (public.can_read_wages() and public.in_org(new.org_id)) then
      raise exception 'Bare admin kan motsignere avtalen';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists contracts_sign_guard on public.contracts;
create trigger contracts_sign_guard
  before update on public.contracts
  for each row execute function public.guard_contract_signature();

create or replace function public.block_signed_contract_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'signert' then
    raise exception 'Signert avtale kan ikke slettes';
  end if;
  return old;
end;
$$;

drop trigger if exists contracts_signed_delete on public.contracts;
create trigger contracts_signed_delete
  before delete on public.contracts
  for each row execute function public.block_signed_contract_delete();

create or replace function public.block_contract_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'contract_events er append-only';
end;
$$;

drop trigger if exists contract_events_immutable on public.contract_events;
create trigger contract_events_immutable
  before update or delete on public.contract_events
  for each row execute function public.block_contract_event_mutation();

create or replace function public.log_contract_event(
  p_contract_id text,
  p_org_id text,
  p_type text,
  p_actor text,
  p_role text,
  p_ip text,
  p_ua text,
  p_payload jsonb,
  p_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contract_events (
    contract_id, org_id, event_type, actor_id, actor_role, ip, user_agent, payload, content_hash
  ) values (
    p_contract_id, p_org_id, p_type, p_actor, p_role, p_ip, p_ua,
    coalesce(p_payload, '{}'::jsonb), p_hash
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Field values and employment-contract creation.
-- ---------------------------------------------------------------------------

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
  sted text;
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
  ub := coalesce(s.ub_tillegg, '[]'::jsonb);
  hours_base := coalesce(s.alminnelig_ukentlig_arbeidstid, ws.full_time_hours_per_week, 37.5);
  sted := coalesce(nullif(btrim(ws.workplace_address), ''), nullif(btrim(ws.workplace_name), ''), nullif(btrim(org.name), ''), '');
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
    'apningstid_fra', coalesce(ws.apningstid_fra, ''),
    'apningstid_til', coalesce(ws.apningstid_til, ''),
    'sted', sted,
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
  ws public.workplace_settings%rowtype;
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
  select * into ws from public.workplace_settings where org_id = w.org_id order by created_date limit 1;

  if nullif(btrim(w.name), '') is null then missing := missing || 'Fullt navn'; end if;
  if nullif(btrim(w.email), '') is null then missing := missing || 'E-post'; end if;
  if w.birth_date is null then missing := missing || 'Fødselsdato'; end if;
  if w.tiltredelsesdato is null then missing := missing || 'Tiltredelsesdato'; end if;
  if coalesce(w.ansettelsestype, 'fast') = 'midlertidig_vikar' and w.opphorsdato is null then
    missing := missing || 'Opphørsdato';
  end if;
  if coalesce(w.ansettelsestype, 'fast') in ('fast', 'midlertidig_vikar', 'butikksjef_ledende')
     and w.employment_percentage is null then
    missing := missing || 'Stillingsprosent';
  end if;
  if coalesce(w.ansettelsestype, 'fast') <> 'tilkalling' and w.timer_per_uke is null then
    missing := missing || 'Timer per uke (snitt)';
  end if;
  if coalesce(w.ansettelsestype, 'fast') <> 'tilkalling' and w.timer_per_dag is null then
    missing := missing || 'Timer per dag (snitt)';
  end if;
  if coalesce(w.hourly_rate, 0) <= 0 then missing := missing || 'Timelønn'; end if;
  if coalesce(w.ansettelsestype, 'fast') = 'butikksjef_ledende' and nullif(btrim(w.arbeidsoppgaver), '') is null then
    missing := missing || 'Arbeidsoppgaver';
  end if;
  if coalesce(w.ansettelsestype, 'fast') in ('fast', 'butikksjef_ledende') and coalesce(w.provetid_mnd, -1) <> 6 then
    missing := missing || 'Prøvetid på 6 måneder';
  end if;
  if coalesce(w.ansettelsestype, 'fast') = 'midlertidig_vikar' then
    if w.provetid_mnd is null or w.provetid_mnd < 0 or w.provetid_mnd > 6 then
      missing := missing || 'Prøvetid mellom 0 og 6 måneder';
    elsif w.tiltredelsesdato is not null and w.opphorsdato is not null then
      months := (extract(year from age(w.opphorsdato, w.tiltredelsesdato)) * 12
        + extract(month from age(w.opphorsdato, w.tiltredelsesdato)))::integer;
      half := months / 2.0;
      if w.provetid_mnd > half then
        missing := missing || 'Prøvetid kan ikke være lenger enn halvparten av ansettelsen';
      end if;
    end if;
  end if;
  if nullif(btrim(s.selskap), '') is null then missing := missing || 'Arbeidsgivers juridiske navn'; end if;
  if nullif(btrim(s.org_nr), '') is null then missing := missing || 'Organisasjonsnummer'; end if;
  if nullif(btrim(s.adresse), '') is null then missing := missing || 'Arbeidsgivers adresse'; end if;
  if nullif(btrim(s.signatur_navn), '') is null then missing := missing || 'Signaturberettiget navn'; end if;
  if nullif(btrim(s.signatur_stilling), '') is null then missing := missing || 'Signaturberettiget stilling'; end if;
  if coalesce(nullif(btrim(ws.workplace_address), ''), nullif(btrim(ws.workplace_name), '')) is null then
    missing := missing || 'Arbeidssted';
  end if;
  if nullif(btrim(ws.apningstid_fra), '') is null then missing := missing || 'Åpningstid fra'; end if;
  if nullif(btrim(ws.apningstid_til), '') is null then missing := missing || 'Åpningstid til'; end if;
  if coalesce(w.ansettelsestype, 'fast') = 'butikksjef_ledende' then
    foreach item in array required loop
      if coalesce(p_checklist ->> item, '') is distinct from 'true' then
        missing := missing || 'Butikksjef-sjekklisten må være ja på alle punkter';
        exit;
      end if;
    end loop;
  end if;
  return missing;
end;
$$;

create or replace function public.create_employment_contract(
  p_worker_id text,
  p_send_now boolean default false,
  p_checklist jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  w public.workers%rowtype;
  tpl public.contract_templates%rowtype;
  template_key text;
  missing text[];
  fields jsonb;
  body text;
  new_id text;
  new_status text;
  content_hash text;
  frist integer;
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return jsonb_build_object('ok', false, 'missing', array['Ansatt finnes ikke']);
  end if;
  if auth.uid() is not null and not (public.can_read_wages() and public.in_org(w.org_id)) then
    raise exception 'Bare admin kan sende arbeidsavtale med lønn';
  end if;

  missing := public.employment_contract_missing(p_worker_id, p_checklist);
  if cardinality(missing) > 0 then
    return jsonb_build_object('ok', false, 'missing', to_jsonb(missing));
  end if;

  template_key := case coalesce(w.ansettelsestype, 'fast')
    when 'midlertidig_vikar' then 'midlertidig_vikar'
    when 'tilkalling' then 'tilkalling_ramme'
    when 'butikksjef_ledende' then 'butikksjef_ledende'
    else 'fast'
  end;

  select * into tpl
  from public.contract_templates t
  where t.key = template_key and t.org_id is null and t.is_active
  order by t.version desc
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'missing', array['Kontraktmalen mangler']);
  end if;

  fields := public.contract_field_values(p_worker_id);
  body := public.render_mustache(tpl.body_markdown, fields);
  content_hash := encode(digest(convert_to(body, 'UTF8'), 'sha256'), 'hex');
  new_status := case when p_send_now then 'sendt' else 'utkast' end;
  new_id := gen_random_uuid()::text;
  select coalesce(e.signering_frist_dager, 14) into frist
  from public.employer_settings e where e.org_id = w.org_id;

  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    worker_position, hourly_rate, employment_percentage, weekly_hours,
    full_time_hours_per_week, start_date, end_date, reason,
    template_key, template_version, body_snapshot, field_values, metadata,
    contract_kind, content_sha256, signing_provider, sent_at, expires_at,
    generated_automatically, created_by
  ) values (
    new_id, w.org_id, w.id, w.name, template_key, new_status,
    fields ->> 'selskap', fields ->> 'stilling', w.hourly_rate, w.employment_percentage,
    w.timer_per_uke,
    coalesce(
      (select e.alminnelig_ukentlig_arbeidstid from public.employer_settings e where e.org_id = w.org_id),
      (select ws.full_time_hours_per_week from public.workplace_settings ws where ws.org_id = w.org_id order by ws.created_date limit 1),
      37.5
    ),
    w.tiltredelsesdato, w.opphorsdato,
    case when template_key = 'tilkalling_ramme' then coalesce((select tilkalling_grunnlag from public.employer_settings where org_id = w.org_id), 'vikar') else null end,
    template_key, tpl.version, body, fields,
    jsonb_build_object('checklist', coalesce(p_checklist, '{}'::jsonb)),
    'hoved', content_hash, 'simple_otp',
    case when p_send_now then now() else null end,
    case when p_send_now then now() + make_interval(days => coalesce(frist, 14)) else null end,
    false, coalesce(auth.uid()::text, 'system')
  );

  perform public.log_contract_event(new_id, w.org_id, 'opprettet', auth.uid()::text, 'arbeidsgiver', null, null, '{}'::jsonb, content_hash);
  if p_send_now then
    perform public.log_contract_event(new_id, w.org_id, 'sendt', auth.uid()::text, 'arbeidsgiver', null, null, '{}'::jsonb, content_hash);
    perform public.enqueue_notification(
      public.profile_id_for_worker(w.id), w.org_id, 'contract_sent',
      'Arbeidsavtale til signering',
      'Du har en arbeidsavtale som venter på signering i SkiftPro.'
    );
  end if;

  return jsonb_build_object('ok', true, 'id', new_id, 'status', new_status, 'body_snapshot', body, 'missing', '[]'::jsonb);
end;
$$;

create or replace function public.send_contract(p_contract_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
  frist integer;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke avtalen');
  end if;
  if not (public.can_read_wages() and public.in_org(c.org_id)) then
    raise exception 'Bare admin kan sende arbeidsavtale med lønn';
  end if;
  if c.status <> 'utkast' then
    return jsonb_build_object('ok', false, 'error', 'Bare utkast kan sendes');
  end if;
  select coalesce(e.signering_frist_dager, 14) into frist
  from public.employer_settings e where e.org_id = c.org_id;
  update public.contracts
    set status = 'sendt',
        sent_at = now(),
        expires_at = now() + make_interval(days => coalesce(frist, 14))
    where id = c.id;
  perform public.log_contract_event(c.id, c.org_id, 'sendt', auth.uid()::text, 'arbeidsgiver', null, null, '{}'::jsonb, c.content_sha256);
  perform public.enqueue_notification(
    public.profile_id_for_worker(c.worker_id), c.org_id, 'contract_sent',
    'Arbeidsavtale til signering',
    'Du har en arbeidsavtale som venter på signering i SkiftPro.'
  );
  return jsonb_build_object('ok', true, 'status', 'sendt', 'id', c.id);
end;
$$;

create or replace function public.open_contract(p_contract_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke avtalen');
  end if;
  if not public.worker_matches(c.worker_id) then
    raise exception 'Du kan bare åpne din egen avtale';
  end if;
  if c.status = 'sendt' then
    update public.contracts set status = 'apnet', opened_at = coalesce(opened_at, now()) where id = c.id;
    perform public.log_contract_event(c.id, c.org_id, 'åpnet', auth.uid()::text, 'ansatt', null, null, '{}'::jsonb, c.content_sha256);
  end if;
  return jsonb_build_object('ok', true, 'status', case when c.status = 'sendt' then 'apnet' else c.status end);
end;
$$;

create or replace function public.reject_contract(p_contract_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke avtalen');
  end if;
  if not public.worker_matches(c.worker_id) then
    raise exception 'Ansattens avvisning kan bare registreres av den ansatte selv';
  end if;
  if c.status not in ('sendt', 'apnet') then
    return jsonb_build_object('ok', false, 'error', 'Avtalen kan ikke avvises nå');
  end if;
  update public.contracts
    set status = 'avvist', rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = c.id;
  perform public.log_contract_event(
    c.id, c.org_id, 'avvist', auth.uid()::text, 'ansatt', null, null,
    jsonb_build_object('reason', coalesce(p_reason, '')), c.content_sha256
  );
  perform public.enqueue_notification(
    (select o.admin_user_id from public.organizations o where o.id = c.org_id),
    c.org_id, 'contract_rejected', 'Arbeidsavtale avvist',
    coalesce(c.worker_name, 'En ansatt') || ' har avvist avtalen.'
  );
  return jsonb_build_object('ok', true, 'status', 'avvist');
end;
$$;

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
      return jsonb_build_object('ok', false, 'error', 'Avtalen venter ikke på ansattes signatur');
    end if;
    select w.email into email from public.workers w where w.id = c.worker_id;
  elsif p_role = 'arbeidsgiver' then
    if not (public.can_read_wages() and public.in_org(c.org_id)) then
      return jsonb_build_object('ok', false, 'error', 'Bare admin kan motsignere avtalen');
    end if;
    if c.status <> 'signert_ansatt' then
      return jsonb_build_object('ok', false, 'error', 'Arbeidsgiver kan motsignere når den ansatte har signert');
    end if;
    select p.email into email from public.profiles p where p.id = auth.uid()::text;
  else
    return jsonb_build_object('ok', false, 'error', 'Ukjent rolle');
  end if;
  return jsonb_build_object('ok', true, 'email', email, 'contract_id', c.id, 'org_id', c.org_id, 'status', c.status);
end;
$$;

create or replace function public.issue_contract_otp(
  p_user_id text,
  p_contract_id text,
  p_role text,
  p_ip text default null,
  p_user_agent text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code text;
  c public.contracts%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'Engangskode kan bare utstedes av tjenesten';
  end if;
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    raise exception 'Fant ikke avtalen';
  end if;
  code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  update public.contract_otp
    set consumed_at = now()
    where contract_id = p_contract_id and user_id = p_user_id and role = p_role and consumed_at is null;
  insert into public.contract_otp (contract_id, user_id, role, code_hash, expires_at)
  values (
    p_contract_id, p_user_id, p_role,
    encode(digest(code || ':' || p_contract_id, 'sha256'), 'hex'),
    now() + interval '10 minutes'
  );
  perform public.log_contract_event(
    c.id, c.org_id, 'otp_sendt', p_user_id, p_role, p_ip, p_user_agent, '{}'::jsonb, c.content_sha256
  );
  return code;
end;
$$;

create or replace function public.complete_contract_signature(
  p_contract_id text,
  p_role text,
  p_code text,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c public.contracts%rowtype;
  otp public.contract_otp%rowtype;
  expected text;
  ctx jsonb;
begin
  ctx := public.contract_sign_context(p_contract_id, p_role);
  if coalesce(ctx ->> 'ok', 'false') <> 'true' then
    raise exception '%', coalesce(ctx ->> 'error', 'Ikke tillatt');
  end if;
  select * into c from public.contracts where id = p_contract_id;
  select * into otp
  from public.contract_otp o
  where o.contract_id = p_contract_id
    and o.user_id = auth.uid()::text
    and o.role = p_role
    and o.consumed_at is null
  order by o.created_at desc
  limit 1;
  if not found or otp.expires_at < now() then
    raise exception 'Engangskoden er ugyldig eller utløpt';
  end if;
  if otp.attempts >= 5 then
    raise exception 'For mange forsøk. Be om en ny kode.';
  end if;
  expected := encode(digest(coalesce(p_code, '') || ':' || p_contract_id, 'sha256'), 'hex');
  if expected is distinct from otp.code_hash then
    update public.contract_otp set attempts = attempts + 1 where id = otp.id;
    perform public.log_contract_event(c.id, c.org_id, 'otp_feil', auth.uid()::text, p_role, p_ip, p_user_agent, '{}'::jsonb, c.content_sha256);
    raise exception 'Feil engangskode';
  end if;
  update public.contract_otp set consumed_at = now() where id = otp.id;

  if p_role = 'ansatt' then
    update public.contracts
      set status = 'signert_ansatt',
          employee_signed_at = now(),
          employee_signed_by = auth.uid()::text,
          approved_by_worker_id = auth.uid()::text,
          approved_at = now()
      where id = c.id;
    perform public.log_contract_event(c.id, c.org_id, 'signert', auth.uid()::text, 'ansatt', p_ip, p_user_agent, '{}'::jsonb, c.content_sha256);
    perform public.enqueue_notification(
      (select o.admin_user_id from public.organizations o where o.id = c.org_id),
      c.org_id, 'contract_employee_signed', 'Ansatt har signert',
      coalesce(c.worker_name, 'Ansatt') || ' har signert avtalen. Arbeidsgiver må motsignere.'
    );
    return jsonb_build_object('ok', true, 'status', 'signert_ansatt', 'id', c.id);
  end if;

  update public.contracts
    set status = 'signert',
        employer_signed_at = now(),
        employer_signed_by = auth.uid()::text
    where id = c.id;
  perform public.log_contract_event(c.id, c.org_id, 'motsignert', auth.uid()::text, 'arbeidsgiver', p_ip, p_user_agent, '{}'::jsonb, c.content_sha256);
  perform public.enqueue_notification(
    public.profile_id_for_worker(c.worker_id), c.org_id, 'contract_signed',
    'Arbeidsavtale signert',
    'Avtalen er signert av begge parter. En kopi blir sendt på e-post når den er klar.'
  );
  return jsonb_build_object('ok', true, 'status', 'signert', 'id', c.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Supplemental agreements from the shift plan.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_hour_supplement(
  p_worker_id text,
  p_kind text,
  p_start date,
  p_end date,
  p_hours double precision,
  p_days integer,
  p_weeks integer,
  p_contracted_weekly double precision
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  w public.workers%rowtype;
  existing public.contracts%rowtype;
  settings public.employer_settings%rowtype;
  tpl public.contract_templates%rowtype;
  parent_id text;
  parent_signed timestamptz;
  fields jsonb;
  extra jsonb;
  body text;
  new_id text;
  new_status text;
  content_hash text;
  avg_day double precision;
  avg_week double precision;
  agreed double precision;
  extra_hours double precision;
  template_key text;
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return null;
  end if;
  select * into settings from public.employer_settings where org_id = w.org_id limit 1;
  template_key := case when p_kind = 'bilag' then 'bilag' else 'merarbeid' end;
  select * into tpl
  from public.contract_templates t
  where t.key = template_key and t.org_id is null and t.is_active
  order by t.version desc
  limit 1;

  if p_kind = 'bilag' then
    select c.id, coalesce(c.employee_signed_at, c.employer_signed_at, c.approved_at)
      into parent_id, parent_signed
    from public.contracts c
    where c.worker_id = p_worker_id
      and c.template_key = 'tilkalling_ramme'
      and c.status = 'signert'
    order by c.created_date desc
    limit 1;
    if parent_id is null then
      return null;
    end if;
  else
    select c.id into parent_id
    from public.contracts c
    where c.worker_id = p_worker_id
      and c.contract_kind = 'hoved'
      and c.status = 'signert'
    order by c.created_date desc
    limit 1;
  end if;

  avg_week := case when p_weeks > 0 then p_hours / p_weeks else p_hours end;
  avg_day := case when coalesce(p_days, 0) > 0 then p_hours / p_days else p_hours end;
  agreed := coalesce(p_contracted_weekly, 0) * greatest(p_weeks, 1);
  extra_hours := greatest(p_hours - agreed, 0);

  extra := jsonb_build_object(
    'periode_fra', to_char(p_start, 'DD.MM.YYYY'),
    'periode_til', to_char(p_end, 'DD.MM.YYYY'),
    'tiltredelsesdato', to_char(p_start, 'DD.MM.YYYY'),
    'opphorsdato', to_char(p_end, 'DD.MM.YYYY'),
    'timer_i_perioden', public.format_no_number(p_hours::numeric),
    'avtalte_timer', public.format_no_number(agreed::numeric),
    'merarbeid_timer', public.format_no_number(extra_hours::numeric),
    'timer_per_uke', public.format_no_number(avg_week::numeric),
    'timer_per_dag', public.format_no_number(avg_day::numeric),
    'har_hovedavtale', parent_id is not null and p_kind <> 'bilag',
    'hovedavtale_dato', coalesce(to_char(parent_signed, 'DD.MM.YYYY'), ''),
    'har_rammeavtale', parent_id is not null and p_kind = 'bilag',
    'rammeavtale_dato', coalesce(to_char(parent_signed, 'DD.MM.YYYY'), '')
  );
  fields := public.contract_field_values(p_worker_id, extra);
  if tpl.id is not null then
    body := public.render_mustache(tpl.body_markdown, fields);
  else
    body := 'Avtale om ' || p_kind || ' fra ' || to_char(p_start, 'DD.MM.YYYY') || ' til ' || to_char(p_end, 'DD.MM.YYYY');
  end if;
  content_hash := encode(digest(convert_to(body, 'UTF8'), 'sha256'), 'hex');

  select * into existing
  from public.contracts c
  where c.worker_id = p_worker_id
    and c.contract_type in ('merarbeid', 'bilag', 'ekstrahjelp')
    and c.generated_automatically
    and c.status in ('utkast', 'sendt', 'apnet')
    and daterange(c.start_date, c.end_date, '[]') && daterange(p_start, p_end, '[]')
  order by c.created_date
  limit 1;

  if found then
    if existing.body_snapshot is not distinct from body
       and existing.start_date is not distinct from p_start
       and existing.end_date is not distinct from p_end
       and existing.weekly_hours is not distinct from round(avg_week::numeric, 2)::double precision then
      return existing.id;
    end if;
    update public.contracts
      set contract_type = p_kind,
          template_key = template_key,
          template_version = tpl.version,
          body_snapshot = body,
          field_values = fields,
          content_sha256 = content_hash,
          start_date = p_start,
          end_date = p_end,
          weekly_hours = round(avg_week::numeric, 2)::double precision,
          overtime_hours = round(extra_hours::numeric, 2)::double precision,
          week_number = to_char(p_start, 'IW')::integer,
          year = extract(isoyear from p_start)::integer,
          parent_contract_id = parent_id,
          hourly_rate = w.hourly_rate,
          contract_kind = p_kind
      where id = existing.id;
    return existing.id;
  end if;

  if exists (
    select 1 from public.contracts c
    where c.worker_id = p_worker_id
      and c.contract_type = p_kind
      and c.status in ('signert_ansatt', 'signert')
      and c.start_date = p_start
      and c.end_date = p_end
  ) then
    return null;
  end if;

  new_status := case when coalesce(settings.send_tilleggsavtaler_automatisk, false) then 'sendt' else 'utkast' end;
  new_id := gen_random_uuid()::text;
  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    worker_position, hourly_rate, employment_percentage, weekly_hours, overtime_hours,
    full_time_hours_per_week, start_date, end_date, week_number, year, reason,
    template_key, template_version, body_snapshot, field_values, metadata,
    contract_kind, parent_contract_id, content_sha256, signing_provider,
    sent_at, expires_at, generated_automatically, created_by
  ) values (
    new_id, w.org_id, w.id, w.name, p_kind, new_status, fields ->> 'selskap',
    fields ->> 'stilling', w.hourly_rate, w.employment_percentage,
    round(avg_week::numeric, 2)::double precision,
    round(extra_hours::numeric, 2)::double precision,
    coalesce(settings.alminnelig_ukentlig_arbeidstid, 37.5),
    p_start, p_end, to_char(p_start, 'IW')::integer, extract(isoyear from p_start)::integer,
    case when p_kind = 'bilag' then coalesce(settings.tilkalling_grunnlag, 'vikar') else 'sesong' end,
    template_key, tpl.version, body, fields, '{}'::jsonb,
    p_kind, parent_id, content_hash, 'simple_otp',
    case when new_status = 'sendt' then now() else null end,
    case when new_status = 'sendt' then now() + make_interval(days => coalesce(settings.signering_frist_dager, 14)) else null end,
    true, 'system'
  );
  perform public.log_contract_event(new_id, w.org_id, 'opprettet', null, 'system', null, null, '{}'::jsonb, content_hash);
  if new_status = 'sendt' then
    perform public.log_contract_event(new_id, w.org_id, 'sendt', null, 'system', null, null, '{}'::jsonb, content_hash);
    perform public.enqueue_notification(
      public.profile_id_for_worker(w.id), w.org_id, 'contract_sent',
      'Avtale til signering',
      'Du har en avtale for perioden ' || to_char(p_start, 'DD.MM.YYYY') || '–' || to_char(p_end, 'DD.MM.YYYY') || ' som venter på signering.'
    );
  end if;
  return new_id;
end;
$$;

create or replace function public.check_overtime_for_shift(
  p_worker_id text,
  p_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.workers%rowtype;
  settings public.employer_settings%rowtype;
  ws public.workplace_settings%rowtype;
  full_time double precision;
  contracted double precision;
  kind text;
  window_start date;
  window_end date;
  cursor_week date;
  week_hours double precision;
  week_days integer;
  weeks jsonb := '[]'::jsonb;
  rec record;
  grp_start date;
  grp_end date;
  grp_hours double precision;
  grp_days integer;
  grp_weeks integer;
  prev date;
  touched text[] := '{}';
  supplement_id text;
  open_row record;
  created integer := 0;
  updated integer := 0;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' or p_worker_id = 'ledig' or p_date is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'no shift data');
  end if;
  select * into w from public.workers where id = p_worker_id;
  if not found or w.status is distinct from 'active' then
    return jsonb_build_object('status', 'skipped', 'reason', 'worker not found or inactive');
  end if;
  if w.ansettelsestype = 'butikksjef_ledende' then
    return jsonb_build_object('status', 'skipped', 'reason', 'ledende stilling');
  end if;

  select * into settings from public.employer_settings where org_id = w.org_id limit 1;
  select * into ws from public.workplace_settings where org_id = w.org_id order by created_date limit 1;
  full_time := coalesce(settings.alminnelig_ukentlig_arbeidstid, ws.full_time_hours_per_week, 37.5);
  if w.timer_per_uke is not null then
    contracted := w.timer_per_uke;
  else
    contracted := full_time * (coalesce(w.employment_percentage, 100) / 100.0);
  end if;

  if w.ansettelsestype = 'tilkalling' then
    kind := 'bilag';
    contracted := 0;
    if not exists (
      select 1 from public.contracts c
      where c.worker_id = w.id and c.template_key = 'tilkalling_ramme' and c.status = 'signert'
    ) then
      return jsonb_build_object('status', 'skipped', 'reason', 'rammeavtale ikke signert');
    end if;
  else
    kind := 'merarbeid';
    if contracted + 0.01 >= full_time then
      return jsonb_build_object('status', 'skipped', 'reason', 'worker already full time');
    end if;
  end if;

  window_start := (p_date - (extract(isodow from p_date)::integer - 1)) - 182;
  window_end := (p_date - (extract(isodow from p_date)::integer - 1)) + 182;
  cursor_week := window_start;
  while cursor_week <= window_end loop
    select coalesce(sum(public.shift_hours(s.start_time, s.end_time, s.break_minutes)), 0),
           count(distinct s.date)::integer
      into week_hours, week_days
    from public.shifts s
    where s.worker_id = p_worker_id
      and s.date >= cursor_week
      and s.date < cursor_week + 7
      and s.status is distinct from 'cancelled';
    weeks := weeks || jsonb_build_array(jsonb_build_object(
      'week_start', cursor_week,
      'week_end', cursor_week + 6,
      'hours', week_hours,
      'days', week_days,
      'exceeds', case when kind = 'bilag' then week_hours > 0 else week_hours > contracted + 0.01 end
    ));
    cursor_week := cursor_week + 7;
  end loop;

  grp_start := null;
  for rec in
    select (value ->> 'week_start')::date as week_start,
           (value ->> 'week_end')::date as week_end,
           (value ->> 'hours')::double precision as hours,
           (value ->> 'days')::integer as days,
           (value ->> 'exceeds')::boolean as exceeds
    from jsonb_array_elements(weeks)
    order by 1
  loop
    if rec.exceeds then
      if grp_start is null or rec.week_start > prev + 7 then
        if grp_start is not null then
          supplement_id := public.upsert_hour_supplement(p_worker_id, kind, grp_start, grp_end, grp_hours, grp_days, grp_weeks, contracted);
          if supplement_id is not null then
            touched := touched || supplement_id;
          end if;
        end if;
        grp_start := rec.week_start;
        grp_hours := 0;
        grp_days := 0;
        grp_weeks := 0;
      end if;
      grp_end := rec.week_end;
      grp_hours := grp_hours + rec.hours;
      grp_days := grp_days + rec.days;
      grp_weeks := grp_weeks + 1;
      prev := rec.week_start;
    elsif grp_start is not null then
      supplement_id := public.upsert_hour_supplement(p_worker_id, kind, grp_start, grp_end, grp_hours, grp_days, grp_weeks, contracted);
      if supplement_id is not null then
        touched := touched || supplement_id;
      end if;
      grp_start := null;
    end if;
  end loop;
  if grp_start is not null then
    supplement_id := public.upsert_hour_supplement(p_worker_id, kind, grp_start, grp_end, grp_hours, grp_days, grp_weeks, contracted);
    if supplement_id is not null then
      touched := touched || supplement_id;
    end if;
  end if;

  for open_row in
    select c.id, c.org_id, c.content_sha256
    from public.contracts c
    where c.worker_id = p_worker_id
      and c.generated_automatically
      and c.contract_type in ('merarbeid', 'bilag', 'ekstrahjelp')
      and c.status in ('utkast', 'sendt', 'apnet')
      and daterange(c.start_date, c.end_date, '[]') && daterange(window_start, window_end, '[]')
      and not (c.id = any (touched))
  loop
    update public.contracts set status = 'trukket' where id = open_row.id;
    perform public.log_contract_event(open_row.id, open_row.org_id, 'trukket', null, 'system', null, null, '{}'::jsonb, open_row.content_sha256);
  end loop;

  select count(*) into created from public.contracts c where c.id = any (touched);
  updated := coalesce(array_length(touched, 1), 0);
  return jsonb_build_object(
    'status', case when updated > 0 then 'updated' else 'skipped' end,
    'contractIds', to_jsonb(touched),
    'kind', kind,
    'count', updated
  );
end;
$$;

create or replace function public.trg_shift_overtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_worker text;
  target_date date;
begin
  if tg_op = 'DELETE' then
    target_worker := old.worker_id;
    target_date := old.date;
  else
    target_worker := new.worker_id;
    target_date := new.date;
  end if;

  if target_worker is null or btrim(target_worker) = '' or target_worker = 'ledig' or target_date is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.worker_id is not distinct from old.worker_id
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and coalesce(new.break_minutes, 0) = coalesce(old.break_minutes, 0)
     and new.status is not distinct from old.status then
    return new;
  end if;

  begin
    perform public.check_overtime_for_shift(target_worker, target_date);
    if tg_op = 'UPDATE' and (
      old.worker_id is distinct from new.worker_id or old.date is distinct from new.date
    ) then
      perform public.check_overtime_for_shift(old.worker_id, old.date);
    end if;
  exception
    when others then
      raise warning 'overtime contract trigger failed for shift %: %', coalesce(new.id, old.id), sqlerrm;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists shifts_overtime_contract on public.shifts;
create trigger shifts_overtime_contract
  after insert or update or delete on public.shifts
  for each row execute function public.trg_shift_overtime();

-- ---------------------------------------------------------------------------
-- Reminders: day 2, day 5, then expiry. Push rows go to the outbox.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_contract_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
  frist integer;
  result jsonb := '[]'::jsonb;
  worker_email text;
  reminder_day integer;
begin
  for c in
    select * from public.contracts
    where status in ('sendt', 'apnet', 'signert_ansatt')
      and sent_at is not null
  loop
    select coalesce(e.signering_frist_dager, 14) into frist
    from public.employer_settings e where e.org_id = c.org_id;
    frist := coalesce(frist, 14);

    if now() >= coalesce(c.expires_at, c.sent_at + make_interval(days => frist)) then
      update public.contracts set status = 'utlopt' where id = c.id and status in ('sendt', 'apnet', 'signert_ansatt');
      perform public.log_contract_event(c.id, c.org_id, 'utløpt', null, 'system', null, null, '{}'::jsonb, c.content_sha256);
      perform public.enqueue_notification(
        (select o.admin_user_id from public.organizations o where o.id = c.org_id),
        c.org_id, 'contract_expired', 'Avtale utløpt',
        'Signeringsfristen er ute for ' || coalesce(c.worker_name, 'en ansatt') || '.'
      );
      result := result || jsonb_build_array(jsonb_build_object(
        'contract_id', c.id, 'kind', 'expired', 'worker_name', c.worker_name, 'org_id', c.org_id
      ));
      continue;
    end if;

    if c.sent_at <= now() - interval '5 days' then
      reminder_day := 5;
    elsif c.sent_at <= now() - interval '2 days' then
      reminder_day := 2;
    else
      reminder_day := null;
    end if;

    if reminder_day is null then
      continue;
    end if;
    if exists (
      select 1 from public.contract_events e
      where e.contract_id = c.id
        and e.event_type = 'påminnelse'
        and e.payload ->> 'day' = reminder_day::text
    ) then
      continue;
    end if;

    perform public.log_contract_event(
      c.id, c.org_id, 'påminnelse', null, 'system', null, null,
      jsonb_build_object('day', reminder_day), c.content_sha256
    );
    if c.status = 'signert_ansatt' then
      perform public.enqueue_notification(
        (select o.admin_user_id from public.organizations o where o.id = c.org_id),
        c.org_id, 'contract_reminder', 'Motsignering venter',
        coalesce(c.worker_name, 'Ansatt') || ' har signert. Arbeidsgiver må motsignere.'
      );
    else
      perform public.enqueue_notification(
        public.profile_id_for_worker(c.worker_id), c.org_id, 'contract_reminder',
        'Påminnelse om arbeidsavtale',
        'Du har en avtale som venter på signering.'
      );
    end if;
    select w.email into worker_email from public.workers w where w.id = c.worker_id;
    result := result || jsonb_build_array(jsonb_build_object(
      'contract_id', c.id,
      'kind', 'day' || reminder_day::text,
      'email', worker_email,
      'worker_name', c.worker_name,
      'org_id', c.org_id,
      'status', c.status
    ));
  end loop;
  return jsonb_build_object('reminders', result);
end;
$$;

-- Schedule when pg_cron is available. A missing extension must not fail the migration.
do $cron$
declare
  existing bigint;
begin
  begin
    if exists (
      select 1 from pg_namespace n
      join pg_class c on c.relnamespace = n.oid
      where n.nspname = 'cron' and c.relname = 'job'
    ) then
      for existing in
        select j.jobid from cron.job j where j.jobname = 'contract-signing-reminders'
      loop
        perform cron.unschedule(existing);
      end loop;
      perform cron.schedule(
        'contract-signing-reminders',
        '0 6 * * *',
        'select public.enqueue_contract_reminders()'
      );
    end if;
  exception
    when others then
      raise notice 'Could not schedule contract-signing-reminders (%). See MIGRATION.md.', sqlerrm;
  end;
end
$cron$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS.
-- ---------------------------------------------------------------------------

revoke all on function public.guard_worker_sensitive() from public;
revoke all on function public.guard_contract_signature() from public;
revoke all on function public.block_signed_contract_delete() from public;
revoke all on function public.block_contract_event_mutation() from public;
revoke all on function public.log_contract_event(text, text, text, text, text, text, text, jsonb, text) from public;
revoke all on function public.issue_contract_otp(text, text, text, text, text) from public;
revoke all on function public.upsert_hour_supplement(text, text, date, date, double precision, integer, integer, double precision) from public;
revoke all on function public.check_overtime_for_shift(text, date) from public, anon, authenticated;
revoke all on function public.enqueue_contract_reminders() from public, anon, authenticated;

grant execute on function public.worker_contract_fields(text) to authenticated;
grant execute on function public.contract_document(text) to authenticated;
grant execute on function public.is_store_manager() to authenticated;
grant execute on function public.shares_team_with_worker(text) to authenticated;
grant execute on function public.create_employment_contract(text, boolean, jsonb) to authenticated;
grant execute on function public.send_contract(text) to authenticated;
grant execute on function public.open_contract(text) to authenticated;
grant execute on function public.reject_contract(text, text) to authenticated;
grant execute on function public.contract_sign_context(text, text) to authenticated;
grant execute on function public.complete_contract_signature(text, text, text, text, text) to authenticated;
grant execute on function public.issue_contract_otp(text, text, text, text, text) to service_role;
grant execute on function public.check_overtime_for_shift(text, date) to service_role;
grant execute on function public.enqueue_contract_reminders() to service_role;

alter table public.employer_settings enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contract_events enable row level security;
alter table public.contract_otp enable row level security;

drop policy if exists employer_settings_select on public.employer_settings;
drop policy if exists employer_settings_insert on public.employer_settings;
drop policy if exists employer_settings_update on public.employer_settings;
drop policy if exists employer_settings_delete on public.employer_settings;
create policy employer_settings_select on public.employer_settings
  for select to authenticated
  using (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)));
create policy employer_settings_insert on public.employer_settings
  for insert to authenticated
  with check (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)));
create policy employer_settings_update on public.employer_settings
  for update to authenticated
  using (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)));
create policy employer_settings_delete on public.employer_settings
  for delete to authenticated
  using (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)));

drop policy if exists contract_templates_select on public.contract_templates;
drop policy if exists contract_templates_write on public.contract_templates;
create policy contract_templates_select on public.contract_templates
  for select to authenticated
  using (org_id is null or public.is_super_admin() or public.in_org(org_id));
create policy contract_templates_write on public.contract_templates
  for all to authenticated
  using (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)));

drop policy if exists contract_events_select on public.contract_events;
create policy contract_events_select on public.contract_events
  for select to authenticated
  using (
    public.is_super_admin()
    or (public.can_read_wages() and public.in_org(org_id))
    or exists (
      select 1 from public.contracts c
      where c.id = contract_events.contract_id
        and public.worker_matches(c.worker_id)
    )
  );

drop policy if exists contracts_select on public.contracts;
drop policy if exists contracts_insert on public.contracts;
drop policy if exists contracts_update on public.contracts;
drop policy if exists contracts_delete on public.contracts;
create policy contracts_select on public.contracts
  for select to authenticated
  using (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or (public.can_read_wages() and public.in_org(org_id))
    or (
      public.is_store_manager()
      and public.in_org(org_id)
      and public.shares_team_with_worker(worker_id)
    )
  );
create policy contracts_insert on public.contracts
  for insert to authenticated
  with check (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)));
create policy contracts_update on public.contracts
  for update to authenticated
  using (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.can_read_wages() and public.in_org(org_id)));
create policy contracts_delete on public.contracts
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.can_read_wages() and public.in_org(org_id) and status <> 'signert')
  );

grant select, insert, update, delete on public.employer_settings to authenticated;
grant select on public.contract_templates to authenticated;
grant select on public.contract_events to authenticated;
revoke insert, update, delete on public.contract_events from authenticated, anon, public;
revoke all on public.contract_otp from authenticated, anon, public;

-- Birth date and contract text are not readable through ordinary SELECT.
revoke select on table public.workers from authenticated, anon;
grant select (
  id, org_id, name, email, phone, position, status, color, teams, role, team_roles,
  employment_type, employment_percentage, disabled_extras, can_see_resultat,
  address, ansettelsestype, tiltredelsesdato, opphorsdato, timer_per_uke, timer_per_dag,
  arbeidsoppgaver, provetid_mnd, created_date, updated_date, created_by
) on table public.workers to authenticated, anon;

revoke select on table public.contracts from authenticated, anon;
grant select (
  id, org_id, worker_id, worker_name, contract_type, status, org_name, worker_position,
  employment_percentage, weekly_hours, overtime_hours, full_time_hours_per_week,
  start_date, end_date, week_number, year, reason, notice_period_months,
  approved_by_worker_id, approved_at, generated_automatically, created_date, updated_date, created_by,
  template_key, template_version, contract_kind, parent_contract_id,
  employee_signed_at, employee_signed_by, employer_signed_at, employer_signed_by,
  content_sha256, pdf_sha256, rejection_reason, expires_at, opened_at, sent_at, signing_provider
) on table public.contracts to authenticated, anon;

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
  created_date, updated_date, created_by
) on table public.workplace_settings to authenticated, anon;

-- Private contract PDFs. Skipped when this database has no storage schema.
do $storage$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('contracts', 'contracts', false)
    on conflict (id) do update set public = excluded.public;

    execute 'drop policy if exists contracts_storage_select on storage.objects';
    execute $pol$
      create policy contracts_storage_select on storage.objects
        for select to authenticated
        using (
          bucket_id = 'contracts'
          and (
            public.is_super_admin()
            or (
              public.can_read_wages()
              and public.in_org((storage.foldername(name))[1])
            )
            or public.worker_matches((storage.foldername(name))[2])
          )
        )
    $pol$;
  end if;
exception
  when others then
    raise notice 'contracts storage bucket was not created (%). Create the private bucket contracts before go-live.', sqlerrm;
end
$storage$;
