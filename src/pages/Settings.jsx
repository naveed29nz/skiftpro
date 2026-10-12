import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Navigation, Save, Users, Lock, Plus, Trash2 } from 'lucide-react';
import { useOrg } from '@/hooks/useOrg';

const PLAN_DEPT_LIMITS = { basic: 1, pro: 3, enterprise: 6, ultimate: 10 };

const generateDefaults = () => {
  const d = {
    workplace_name: 'Main Workplace', latitude: '', longitude: '', radius_meters: 100,
    full_time_hours_per_week: 37.5,
    active_teams_count: 1,
  };
  for (let i = 1; i <= 10; i++) {
    d[`team${i}_name`] = `Team ${i}`;
    d[`team${i}_sunday_extra_type`] = 'none';
    d[`team${i}_sunday_extra_amount`] = 0;
    d[`team${i}_holiday_extra_type`] = 'none';
    d[`team${i}_holiday_extra_amount`] = 0;
    d[`team${i}_latitude`] = '';
    d[`team${i}_longitude`] = '';
    d[`team${i}_radius_meters`] = '';
  }
  return d;
};

function TeamLocationSection({ teamKey, teamName, form, setForm }) {
  const [gpsStatus, setGpsStatus] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const hasLocation = form[`${teamKey}_latitude`] && form[`${teamKey}_longitude`];

  const useMyLocation = () => {
    setGpsStatus('Henter posisjon...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({ ...f, [`${teamKey}_latitude`]: pos.coords.latitude, [`${teamKey}_longitude`]: pos.coords.longitude }));
        setGpsStatus('Posisjon funnet!');
        setTimeout(() => setGpsStatus(''), 3000);
      },
      () => setGpsStatus('Kunne ikke hente posisjon.')
    );
  };

  const searchAddress = async () => {
    if (!addressInput.trim()) return;
    setGpsStatus('Søker etter adresse...');
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressInput)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'no' } });
    const data = await res.json();
    if (data.length > 0) {
      setForm(f => ({ ...f, [`${teamKey}_latitude`]: parseFloat(data[0].lat), [`${teamKey}_longitude`]: parseFloat(data[0].lon) }));
      setGpsStatus(`✓ Funnet: ${data[0].display_name.split(',').slice(0,2).join(',')}`);
      setTimeout(() => setGpsStatus(''), 5000);
    } else {
      setGpsStatus('Fant ikke adressen. Prøv en mer spesifikk adresse.');
    }
  };

  return (
    <div className="border border-slate-100 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-slate-700 text-sm flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-blue-500" /> {teamName} – Stemplingssted
        </p>
        {hasLocation && <span className="text-xs text-emerald-600">✓ Posisjon satt</span>}
      </div>

      {/* Address search */}
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs flex-1"
          placeholder="Skriv inn adresse, f.eks. Karl Johans gate 1, Oslo"
          value={addressInput}
          onChange={e => setAddressInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchAddress()}
        />
        <Button type="button" variant="outline" size="sm" onClick={searchAddress} className="shrink-0">Søk</Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-xs text-slate-400">eller</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={useMyLocation} className="gap-1.5 w-full">
        <Navigation className="w-3.5 h-3.5" /> Bruk min nåværende posisjon
      </Button>

      {gpsStatus && <p className={`text-xs ${gpsStatus.includes('✓') || gpsStatus.includes('!') ? 'text-emerald-600' : 'text-slate-500'}`}>{gpsStatus}</p>}

      <div className="space-y-1">
        <Label className="text-xs">Tillatt radius (meter)</Label>
        <Input type="number" min="10" className="h-8 text-xs w-32" value={form[`${teamKey}_radius_meters`] || ''}
          onChange={e => setForm(f => ({ ...f, [`${teamKey}_radius_meters`]: e.target.value }))}
          placeholder="100" />
      </div>
    </div>
  );
}

const EXTRA_TYPE_OPTIONS = [
  { value: 'none', label: 'Ingen tillegg' },
  { value: 'percentage', label: 'Prosentvis (% av timelønn)' },
  { value: 'fixed', label: 'Fast beløp (kr/time ekstra)' },
];

function TeamPaySection({ teamKey, teamName, form, setForm }) {
  const sundayType = form[`${teamKey}_sunday_extra_type`] || 'none';
  const holidayType = form[`${teamKey}_holiday_extra_type`] || 'none';

  return (
    <div className="border border-slate-100 rounded-lg p-4 space-y-3">
      <p className="font-medium text-slate-700 text-sm">{teamName}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Søndagstillegg type</Label>
          <Select value={sundayType} onValueChange={v => setForm(f => ({ ...f, [`${teamKey}_sunday_extra_type`]: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXTRA_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {sundayType !== 'none' && (
            <div className="flex items-center gap-1">
              <Input
                type="number" min="0" step="any"
                className="h-8 text-xs"
                value={form[`${teamKey}_sunday_extra_amount`] || ''}
                onChange={e => setForm(f => ({ ...f, [`${teamKey}_sunday_extra_amount`]: e.target.value }))}
                placeholder={sundayType === 'percentage' ? 'f.eks. 50' : 'f.eks. 115'}
              />
              <span className="text-xs text-slate-500 shrink-0">{sundayType === 'percentage' ? '%' : 'kr/t'}</span>
            </div>
          )}
          {sundayType !== 'none' && (
            <p className="text-xs text-slate-400">
              {sundayType === 'percentage' ? `+${form[`${teamKey}_sunday_extra_amount`] || 0}% av timelønn på søndager` : `+${form[`${teamKey}_sunday_extra_amount`] || 0} kr/time ekstra på søndager`}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Helligdagstillegg type</Label>
          <Select value={holidayType} onValueChange={v => setForm(f => ({ ...f, [`${teamKey}_holiday_extra_type`]: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXTRA_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {holidayType !== 'none' && (
            <div className="flex items-center gap-1">
              <Input
                type="number" min="0" step="any"
                className="h-8 text-xs"
                value={form[`${teamKey}_holiday_extra_amount`] || ''}
                onChange={e => setForm(f => ({ ...f, [`${teamKey}_holiday_extra_amount`]: e.target.value }))}
                placeholder={holidayType === 'percentage' ? 'f.eks. 50' : 'f.eks. 115'}
              />
              <span className="text-xs text-slate-500 shrink-0">{holidayType === 'percentage' ? '%' : 'kr/t'}</span>
            </div>
          )}
          {holidayType !== 'none' && (
            <p className="text-xs text-slate-400">
              {holidayType === 'percentage' ? `+${form[`${teamKey}_holiday_extra_amount`] || 0}% av timelønn på helligdager` : `+${form[`${teamKey}_holiday_extra_amount`] || 0} kr/time ekstra på helligdager`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const DEFAULTS = generateDefaults();

export default function Settings() {
  const queryClient = useQueryClient();
  const { myOrg, orgId, orgs } = useOrg();
  const [globalAddressInput, setGlobalAddressInput] = useState('');
  const [form, setForm] = useState(DEFAULTS);

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['workplace-settings'],
    queryFn: () => base44.entities.WorkplaceSetting.list(),
  });
  // Scope settings by org: org admins only see their own; superadmin (orgId null) falls back to first.
  const orgScoped = orgId ? settings.filter(s => s.org_id === orgId) : settings;
  const existing = orgScoped[0];

  // Determine plan from the loaded setting's org (works for superadmins viewing a customer's settings,
  // instead of always falling back to 'basic' when the signed-in admin has no org).
  const settingOrgId = existing?.org_id || orgId;
  const settingOrg = orgs?.find(o => o.id === settingOrgId);
  const plan = (settingOrg || myOrg)?.plan || 'basic';
  const maxDepts = PLAN_DEPT_LIMITS[plan] || 1;

  useEffect(() => {
    if (existing) {
      const merged = { ...DEFAULTS, ...Object.fromEntries(Object.entries(existing).filter(([k]) => k in DEFAULTS)) };
      // Auto-detect active teams count from saved data if not explicitly set
      if (!existing.active_teams_count) {
        let count = 1;
        for (let i = 2; i <= 10; i++) {
          const name = existing[`team${i}_name`];
          if (name && name !== `Team ${i}`) count = i;
        }
        merged.active_teams_count = count;
      }
      setForm(merged);
    }
  }, [existing]);

  const saveMut = useMutation({
    mutationFn: async (data) => {
      if (existing) return base44.entities.WorkplaceSetting.update(existing.id, data);
      return base44.entities.WorkplaceSetting.create({ ...data, org_id: orgId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workplace-settings'] }),
  });

  const [globalGpsStatus, setGlobalGpsStatus] = useState('');

  const searchGlobalAddress = async () => {
    if (!globalAddressInput.trim()) return;
    setGlobalGpsStatus('Søker etter adresse...');
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(globalAddressInput)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'no' } });
    const data = await res.json();
    if (data.length > 0) {
      setForm(f => ({ ...f, latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) }));
      setGlobalGpsStatus(`✓ Funnet: ${data[0].display_name.split(',').slice(0,2).join(',')}`);
      setTimeout(() => setGlobalGpsStatus(''), 5000);
    } else {
      setGlobalGpsStatus('Fant ikke adressen. Prøv en mer spesifikk adresse.');
    }
  };

  const useMyLocation = () => {
    setGlobalGpsStatus('Henter posisjon...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        setGlobalGpsStatus('Posisjon funnet!');
        setTimeout(() => setGlobalGpsStatus(''), 3000);
      },
      () => setGlobalGpsStatus('Kunne ikke hente posisjon.')
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const numFields = ['latitude', 'longitude', 'radius_meters', 'full_time_hours_per_week'];
    for (let i = 1; i <= 10; i++) {
      numFields.push(`team${i}_sunday_extra_amount`, `team${i}_holiday_extra_amount`,
        `team${i}_latitude`, `team${i}_longitude`, `team${i}_radius_meters`);
    }
    const data = { ...form };
    numFields.forEach(f => { data[f] = parseFloat(data[f]) || 0; });
    data.radius_meters = parseInt(data.radius_meters) || 100;
    saveMut.mutate(data);
  };

  const activeCount = Math.min(form.active_teams_count || 1, maxDepts);
  const teamKeys = Array.from({ length: activeCount }, (_, i) => `team${i + 1}`);

  const addTeam = () => {
    if (activeCount >= maxDepts) return;
    setForm(f => ({ ...f, active_teams_count: activeCount + 1 }));
  };

  const removeTeam = (index) => {
    if (activeCount <= 1) return;
    // Shift team data down
    const newForm = { ...form };
    for (let i = index + 1; i < activeCount; i++) {
      const from = `team${i + 1}`;
      const to = `team${i}`;
      newForm[`${to}_name`] = newForm[`${from}_name`];
      newForm[`${to}_sunday_extra_type`] = newForm[`${from}_sunday_extra_type`];
      newForm[`${to}_sunday_extra_amount`] = newForm[`${from}_sunday_extra_amount`];
      newForm[`${to}_holiday_extra_type`] = newForm[`${from}_holiday_extra_type`];
      newForm[`${to}_holiday_extra_amount`] = newForm[`${from}_holiday_extra_amount`];
      newForm[`${to}_latitude`] = newForm[`${from}_latitude`];
      newForm[`${to}_longitude`] = newForm[`${from}_longitude`];
      newForm[`${to}_radius_meters`] = newForm[`${from}_radius_meters`];
    }
    // Clear last slot
    const last = `team${activeCount}`;
    newForm[`${last}_name`] = `Team ${activeCount}`;
    newForm[`${last}_sunday_extra_type`] = 'none';
    newForm[`${last}_sunday_extra_amount`] = 0;
    newForm[`${last}_holiday_extra_type`] = 'none';
    newForm[`${last}_holiday_extra_amount`] = 0;
    newForm[`${last}_latitude`] = '';
    newForm[`${last}_longitude`] = '';
    newForm[`${last}_radius_meters`] = '';
    newForm.active_teams_count = activeCount - 1;
    setForm(newForm);
  };

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Workplace GPS */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-800">Arbeidssted</h2>
          </div>
          <p className="text-xs text-slate-400">Ansatte må være innenfor radiusen for å stemple inn/ut.</p>
          <div className="space-y-1.5">
            <Label>Navn på arbeidssted</Label>
            <Input value={form.workplace_name} onChange={e => setForm(f => ({ ...f, workplace_name: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder="Skriv inn adresse, f.eks. Karl Johans gate 1, Oslo"
              value={globalAddressInput}
              onChange={e => setGlobalAddressInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchGlobalAddress()}
            />
            <Button type="button" variant="outline" onClick={searchGlobalAddress} className="shrink-0">Søk</Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400">eller</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <Button type="button" variant="outline" onClick={useMyLocation} className="gap-2 w-full">
            <Navigation className="w-4 h-4" /> Bruk min nåværende posisjon
          </Button>
          {globalGpsStatus && <p className={`text-xs ${globalGpsStatus.includes('✓') || globalGpsStatus.includes('!') ? 'text-emerald-600' : 'text-slate-500'}`}>{globalGpsStatus}</p>}
          {form.latitude && form.longitude && <p className="text-xs text-slate-400">Koordinater: {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}</p>}
        </div>

        {/* Work hours model */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">Arbeidstidsmodell</h2>
          <p className="text-xs text-slate-400">Velg hva 100% stilling tilsvarer i timer per uke. Brukes til å beregne stillingsprosent-varsler i timeplanen.</p>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
            {[{ val: 37.5, label: '37,5 t/uke', desc: 'Tariff' }, { val: 40, label: '40 t/uke', desc: 'Ikke-tariff' }].map(opt => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setForm(f => ({ ...f, full_time_hours_per_week: opt.val }))}
                className={`px-4 py-2.5 text-sm font-medium transition-colors flex flex-col items-center ${form.full_time_hours_per_week === opt.val ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <span>{opt.label}</span>
                <span className={`text-xs ${form.full_time_hours_per_week === opt.val ? 'text-slate-300' : 'text-slate-400'}`}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Team Names */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-semibold text-slate-800">Avdelinger</h2>
            </div>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {activeCount} / {maxDepts}
            </span>
          </div>
          <div className="space-y-2">
            {teamKeys.map((key, i) => (
              <div key={key} className="flex items-center gap-2">
                <Input
                  value={form[`${key}_name`]}
                  onChange={e => setForm(f => ({ ...f, [`${key}_name`]: e.target.value }))}
                  placeholder={`Avdeling ${i + 1}`}
                />
                {activeCount > 1 && (
                  <button type="button" onClick={() => removeTeam(i)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {activeCount < maxDepts ? (
            <button type="button" onClick={addTeam} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium">
              <Plus className="w-4 h-4" /> Legg til avdeling
            </button>
          ) : (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Oppgrader plan for å legge til flere avdelinger
            </p>
          )}
        </div>

        {/* Per-team pay rules */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">Tillegg per avdeling</h2>
          <p className="text-xs text-slate-400">Sett søndags- og helligdagstillegg separat for hver avdeling.</p>
          {teamKeys.map(key => (
            <TeamPaySection key={key} teamKey={key} teamName={form[`${key}_name`] || key} form={form} setForm={setForm} />
          ))}
        </div>

        {/* Per-team locations */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">Stemplingssted per avdeling</h2>
          <p className="text-xs text-slate-400">Sett GPS-posisjon for hver avdelings arbeidssted.</p>
          {teamKeys.map(key => (
            <TeamLocationSection key={key} teamKey={key} teamName={form[`${key}_name`] || key} form={form} setForm={setForm} />
          ))}
        </div>

        <Button type="submit" className="w-full gap-2" disabled={saveMut.isPending}>
          <Save className="w-4 h-4" />
          {saveMut.isPending ? 'Lagrer...' : existing ? 'Lagre endringer' : 'Lagre innstillinger'}
        </Button>
        {saveMut.isSuccess && <p className="text-sm text-emerald-600 text-center">Innstillinger lagret!</p>}
      </form>
    </div>
  );
}