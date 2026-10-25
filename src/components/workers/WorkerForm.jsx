import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  ANSETTELSESTYPER,
  BUTIKKSJEF_CHECKLIST,
  BUTIKKSJEF_HELP,
  EKSTRAHJELP_HOURS_HINT,
  MERARBEID_INFO,
  PROVETID_HELP,
  STILLINGSPROSENT_HELP,
  ansettelsestypePatch,
  contractDeadlineState,
  employmentHourValues,
  initialEmploymentHours,
  isEkstrahjelp,
  missingEmploymentFields,
  suggestPercentage,
} from '@/contracts/employment';
import { fodselsnummerValid } from '@/contracts/fodselsnummer';
import { SHOW_RESULTAT } from '@/lib/featureFlags';

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

export const WORKER_SUPPLEMENTS = [
  ['sunday', 'Søndagstillegg'],
  ['holiday', 'Helligdagstillegg'],
  ['night', 'Nattillegg'],
];

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function WorkerForm({
  worker,
  onSubmit,
  onCancel,
  teamNames = { team1: 'Team 1' },
  showWages = false,
  employerSettings = null,
  workplace = null,
  organizationName = '',
  organizationOrgNumber = '',
  signerName = null,
}) {
  const isNew = !worker?.id;
  const [missing, setMissing] = useState([]);
  const [breakError, setBreakError] = useState('');
  const [form, setForm] = useState({
    name: worker?.name || '',
    email: worker?.email || '',
    phone: worker?.phone || '',
    hourly_rate: worker?.hourly_rate || '',
    position: worker?.position || '',
    status: worker?.status || 'active',
    color: worker?.color || COLORS[Math.floor(Math.random() * COLORS.length)],
    teams: worker?.teams || (worker?.team ? [worker.team] : ['team1']),
    role: worker?.role || 'user',
    team_roles: worker?.team_roles || {},
    employment_type: worker?.employment_type || 'timelønn',
    ...initialEmploymentHours(worker),
    disabled_extras: worker?.disabled_extras || [],
    break_after_hours: worker?.break_after_hours ?? '',
    break_length_minutes: worker?.break_length_minutes ?? '',
    can_see_resultat: worker?.can_see_resultat || false,
    birth_date: worker?.birth_date || '',
    fodselsnummer: worker?.fodselsnummer || '',
    address: worker?.address || '',
    ansettelsestype: worker?.ansettelsestype || 'fast',
    tiltredelsesdato: worker?.tiltredelsesdato || '',
    opphorsdato: worker?.opphorsdato || '',
    timer_per_uke: worker?.timer_per_uke ?? '',
    timer_per_dag: worker?.timer_per_dag ?? '',
    arbeidsoppgaver: worker?.arbeidsoppgaver || '',
    provetid_mnd: worker?.provetid_mnd ?? (worker?.ansettelsestype === 'midlertidig_vikar' ? 0 : 6),
    send_arbeidsavtale: isNew,
  });
  const [checklist, setChecklist] = useState({});

  const toggleTeam = (teamKey) => {
    setForm((current) => {
      const has = current.teams.includes(teamKey);
      if (has && current.teams.length === 1) return current;
      return { ...current, teams: has ? current.teams.filter((t) => t !== teamKey) : [...current.teams, teamKey] };
    });
  };

  const toggleExtra = (extra) => {
    setForm((current) => ({
      ...current,
      disabled_extras: current.disabled_extras.includes(extra)
        ? current.disabled_extras.filter((e) => e !== extra)
        : [...current.disabled_extras, extra],
    }));
  };

  const buildPayload = () => {
    const ROLE_RANK = { admin: 4, sub_admin: 3, butikksjef: 2, user: 1 };
    const teamRoleValues = form.teams.map((t) => form.team_roles[t] || 'user');
    const highestRole = teamRoleValues.reduce((best, role) => ((ROLE_RANK[role] || 1) > (ROLE_RANK[best] || 1) ? role : best), 'user');
    const payload = {
      ...form,
      role: highestRole,
      ...employmentHourValues(form.ansettelsestype, {
        employment_percentage: numberOrNull(form.employment_percentage),
        timer_per_uke: numberOrNull(form.timer_per_uke),
        timer_per_dag: numberOrNull(form.timer_per_dag),
      }),
      provetid_mnd: numberOrNull(form.provetid_mnd),
      break_after_hours: numberOrNull(form.break_after_hours),
      break_length_minutes: numberOrNull(form.break_length_minutes),
      birth_date: form.birth_date || null,
      tiltredelsesdato: form.tiltredelsesdato || null,
      opphorsdato: form.opphorsdato || null,
      checklist,
    };
    if (showWages) payload.hourly_rate = parseFloat(form.hourly_rate) || 0;
    else {
      delete payload.hourly_rate;
      delete payload.birth_date;
      delete payload.fodselsnummer;
      delete payload.address;
      delete payload.send_arbeidsavtale;
    }
    return payload;
  };

  const handleSubmit = (event, previewFirst = false) => {
    event.preventDefault();
    const payload = buildPayload();
    const breakAfterSet = payload.break_after_hours != null;
    const breakLengthSet = payload.break_length_minutes != null;
    if (breakAfterSet !== breakLengthSet) {
      setBreakError('Fyll ut både «Pause etter (timer)» og «Pausens lengde (min)», eller la begge stå tomme.');
      return;
    }
    setBreakError('');
    if (showWages && String(form.fodselsnummer || '').trim() && !fodselsnummerValid(form.fodselsnummer)) {
      setMissing(['Fødselsnummer må være 11 gyldige sifre']);
      return;
    }
    if (showWages && form.send_arbeidsavtale) {
      const gaps = missingEmploymentFields({
        worker: payload,
        settings: employerSettings,
        workplace,
        checklist,
        showWages,
        organizationName,
        organizationOrgNumber,
        signerName,
      });
      setMissing(gaps);
      if (gaps.length) return;
    } else {
      setMissing([]);
    }
    onSubmit({ ...payload, preview_first: previewFirst });
  };

  const deadline = contractDeadlineState({ ...form, id: worker?.id }, []);
  const fullTime = Number(employerSettings?.alminnelig_ukentlig_arbeidstid || workplace?.full_time_hours_per_week || 37.5);
  const ekstrahjelp = isEkstrahjelp(form.ansettelsestype);

  return (
    <form onSubmit={(event) => handleSubmit(event, false)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Navn *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Fullt navn" required />
        </div>
        <div className="space-y-1.5">
          <Label>Stilling</Label>
          <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="f.eks. barista" />
        </div>
        {showWages && (
        <div className="space-y-1.5">
          <Label>Timelønn *</Label>
          <Input type="number" step="0.01" min="0" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} placeholder="0.00" required />
        </div>
        )}
        <div className={`space-y-1.5 ${ekstrahjelp ? 'opacity-60' : ''}`}>
          <Label title={ekstrahjelp ? EKSTRAHJELP_HOURS_HINT : STILLINGSPROSENT_HELP}>Stillingsprosent (%)</Label>
          <Input
            type="number"
            min="1"
            max="100"
            step="0.01"
            disabled={ekstrahjelp}
            value={form.employment_percentage}
            onChange={(e) => setForm({ ...form, employment_percentage: e.target.value })}
            placeholder=""
            className={ekstrahjelp ? 'bg-slate-100 text-slate-400' : ''}
          />
          <p className="text-xs text-slate-400" title={ekstrahjelp ? undefined : STILLINGSPROSENT_HELP}>
            {ekstrahjelp ? EKSTRAHJELP_HOURS_HINT : 'Stillingsprosent = timer per uke × 100 / alminnelig arbeidstid.'}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Lønnstype</Label>
          <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="timelønn">Timelønn</SelectItem>
              <SelectItem value="fastlønn">Fastlønn</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="inactive">Inaktiv</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Avdelinger og rolle per avdeling</Label>
          <div className="mt-1 space-y-2">
            {Object.entries(teamNames).map(([key, name]) => (
              <div key={key} className="flex items-center gap-3">
                <Checkbox
                  checked={form.teams.includes(key)}
                  onCheckedChange={() => toggleTeam(key)}
                />
                <span className="text-sm text-slate-700 w-24 shrink-0">{name}</span>
                {form.teams.includes(key) && (
                  <Select
                    value={form.team_roles[key] || form.role || 'user'}
                    onValueChange={(v) => setForm((current) => ({ ...current, team_roles: { ...current.team_roles, [key]: v } }))}
                  >
                    <SelectTrigger className="h-7 text-xs w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Ansatt</SelectItem>
                      <SelectItem value="butikksjef">Butikksjef</SelectItem>
                      <SelectItem value="sub_admin">Sub-admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">Rolle bestemmer tilgang per avdeling når den ansatte er logget inn.</p>
        </div>
        <div className="space-y-1.5">
          <Label>E-post</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label>Telefon</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+47 000 00 000" />
        </div>
      </div>

      {showWages && (
        <fieldset id="arbeidsavtale-seksjon" className="rounded-xl border border-slate-200 p-4 space-y-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">Arbeidsavtale</legend>
          <label className="flex items-start gap-3">
            <Checkbox
              id="send-arbeidsavtale"
              checked={form.send_arbeidsavtale}
              onCheckedChange={(value) => setForm((current) => ({ ...current, send_arbeidsavtale: value === true }))}
            />
            <span className="text-sm text-slate-800">
              Send arbeidsavtale til signering
              <span className="block text-xs text-slate-500">Avkrysset for nye ansatte. Avtalen bruker malen som hører til ansettelsestypen.</span>
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Ansettelsestype</Label>
              <Select
                value={form.ansettelsestype}
                onValueChange={(value) => setForm((current) => ({
                  ...current,
                  ...ansettelsestypePatch(value, current),
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANSETTELSESTYPER.map((row) => (
                    <SelectItem key={row.value} value={row.value}>{row.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fødselsdato</Label>
              <Input type="date" value={form.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
              <p className="text-xs text-slate-400">Brukes for regler under 18 år.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fodselsnummer">Fødselsnummer</Label>
              <Input
                id="fodselsnummer"
                inputMode="numeric"
                autoComplete="off"
                value={form.fodselsnummer}
                onChange={(e) => setForm({ ...form, fodselsnummer: e.target.value })}
                placeholder="11 siffer"
              />
              <p className="text-xs text-slate-400">11 siffer. Synlig bare for admin. Ligger på arbeidsavtalen, ikke i e-post.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Gate, postnummer og sted" />
            </div>
            <div className="space-y-1.5">
              <Label>Tiltredelsesdato</Label>
              <Input type="date" value={form.tiltredelsesdato || ''} onChange={(e) => setForm({ ...form, tiltredelsesdato: e.target.value })} />
            </div>
            {form.ansettelsestype === 'midlertidig_vikar' && (
              <div className="space-y-1.5">
                <Label>Opphørsdato</Label>
                <Input type="date" value={form.opphorsdato || ''} onChange={(e) => setForm({ ...form, opphorsdato: e.target.value })} />
              </div>
            )}
            <div className={`space-y-1.5 ${ekstrahjelp ? 'opacity-60' : ''}`}>
              <Label>Timer per uke (snitt)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  disabled={ekstrahjelp}
                  value={form.timer_per_uke}
                  onChange={(e) => setForm({ ...form, timer_per_uke: e.target.value })}
                  className={ekstrahjelp ? 'bg-slate-100 text-slate-400' : ''}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={ekstrahjelp}
                  onClick={() => setForm((current) => ({
                    ...current,
                    employment_percentage: suggestPercentage(current.timer_per_uke, fullTime),
                  }))}
                >
                  Beregn %
                </Button>
              </div>
            </div>
            <div className={`space-y-1.5 ${ekstrahjelp ? 'opacity-60' : ''}`}>
              <Label>Timer per dag (snitt)</Label>
              <Input
                type="number"
                min="0"
                step="0.25"
                disabled={ekstrahjelp}
                value={form.timer_per_dag}
                onChange={(e) => setForm({ ...form, timer_per_dag: e.target.value })}
                className={ekstrahjelp ? 'bg-slate-100 text-slate-400' : ''}
              />
            </div>
            {ekstrahjelp && (
              <p className="text-xs text-slate-400 sm:col-span-2">{EKSTRAHJELP_HOURS_HINT}</p>
            )}
            {form.ansettelsestype !== 'tilkalling' && (
              <div className="space-y-1.5">
                <Label title={PROVETID_HELP}>Prøvetid (måneder)</Label>
                <Input type="number" min="0" max="6" step="1" value={form.provetid_mnd} onChange={(e) => setForm({ ...form, provetid_mnd: e.target.value })} />
                <p className="text-xs text-slate-400" title={PROVETID_HELP}>Fast og butikksjef: 6 måneder. Midlertidig: maks halvparten av lengden.</p>
              </div>
            )}
            {form.ansettelsestype === 'butikksjef_ledende' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Arbeidsoppgaver</Label>
                <Textarea value={form.arbeidsoppgaver} onChange={(e) => setForm({ ...form, arbeidsoppgaver: e.target.value })} placeholder="Budsjett, personal og daglig drift" />
              </div>
            )}
          </div>

          {form.ansettelsestype === 'butikksjef_ledende' && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800" title={BUTIKKSJEF_HELP}>Ledende stilling</p>
              <p className="text-xs text-slate-500">{BUTIKKSJEF_HELP}</p>
              {BUTIKKSJEF_CHECKLIST.map((item) => (
                <label key={item.key} className="flex items-start gap-2">
                  <Checkbox
                    checked={checklist[item.key] === true}
                    onCheckedChange={(value) => setChecklist((current) => ({ ...current, [item.key]: value === true }))}
                  />
                  <span className="text-sm text-slate-700">{item.label}</span>
                </label>
              ))}
            </div>
          )}

          {form.ansettelsestype !== 'butikksjef_ledende' && form.ansettelsestype !== 'tilkalling' && (
            <p className="text-xs text-slate-500">{MERARBEID_INFO}</p>
          )}

          {deadline && (
            <p className={`text-sm ${deadline.level === 'overdue' ? 'text-red-600' : 'text-amber-700'}`}>
              Arbeidsmiljøloven § 14-5: skriftlig avtale skal foreligge snarest, og innen 7 dager etter tiltredelse når ansettelsen varer mer enn én måned.
              {deadline.level === 'overdue' ? ' Fristen er passert.' : ` Frist ${deadline.due.toLocaleDateString('nb-NO')}.`}
            </p>
          )}

          {missing.length > 0 && (
            <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
              <p className="font-medium">Avtalen kan ikke sendes ennå.</p>
              <ul className="list-disc pl-5 mt-1">
                {missing.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
        </fieldset>
      )}

      {SHOW_RESULTAT && (
      <div className="space-y-1.5">
        <Label>Tilgang</Label>
        <div className="flex gap-4 flex-wrap mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={form.can_see_resultat}
              onCheckedChange={(v) => setForm((current) => ({ ...current, can_see_resultat: !!v }))}
            />
            <span className="text-sm text-slate-700">Resultat-tilgang</span>
          </label>
        </div>
      </div>
      )}
      <div className="space-y-1.5">
        <Label>Tillegg som gjelder</Label>
        <div className="flex gap-4 flex-wrap mt-1">
          {WORKER_SUPPLEMENTS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!form.disabled_extras.includes(key)}
                onCheckedChange={() => toggleExtra(key)}
              />
              <span className="text-sm text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div>
          <p className="text-sm font-medium text-slate-800">Egen pauseregel</p>
          <p className="text-xs text-slate-500 mt-1">Valgfritt. Når begge feltene er fylt ut, erstatter de avdelingens automatiske pause for denne ansatte. Tomme felt bruker avdelingens regel. En vakt kan fortsatt overstyres manuelt.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="break-after-hours">Pause etter (timer)</Label>
            <Input
              id="break-after-hours"
              type="number"
              min="0"
              step="0.5"
              value={form.break_after_hours}
              onChange={(e) => setForm({ ...form, break_after_hours: e.target.value })}
              placeholder="f.eks. 6"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="break-length-minutes">Pausens lengde (min)</Label>
            <Input
              id="break-length-minutes"
              type="number"
              min="0"
              step="1"
              value={form.break_length_minutes}
              onChange={(e) => setForm({ ...form, break_length_minutes: e.target.value })}
              placeholder="f.eks. 30"
            />
          </div>
        </div>
        {breakError && <p className="text-xs text-red-600">{breakError}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Farge</Label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 flex-wrap">
        <Button type="button" variant="outline" onClick={onCancel}>Avbryt</Button>
        {showWages && form.send_arbeidsavtale && (
          <Button type="button" variant="outline" onClick={(event) => handleSubmit(event, true)}>
            Forhåndsvis avtale
          </Button>
        )}
        <Button type="submit">{worker ? 'Oppdater' : 'Legg til ansatt'}</Button>
      </div>
    </form>
  );
}
