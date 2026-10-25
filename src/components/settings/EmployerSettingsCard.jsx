import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EMPTY = {
  selskap: '',
  org_nr: '',
  adresse: '',
  signatur_navn: '',
  signatur_stilling: '',
  tariff: false,
  alminnelig_ukentlig_arbeidstid: 37.5,
  ferie_uker: 'fire uker og 1 dag',
  feriepenger_prosent: 10.2,
  lonningsdag: 15,
  feriepenger_utbetales: 'mai',
  otp: true,
  otp_leverandor: 'DNB-LIV',
  yrkesskade_forsikring: 'Gjensidige',
  ub_tillegg: [],
  oppsigelsesfrist_mnd_midlertidig: 1,
  send_tilleggsavtaler_automatisk: false,
  ekstratimer_periode: 'maaned',
  signing_provider: 'simple_otp',
  signering_frist_dager: 14,
  oppbevaring_mnd_etter_opphor: 60,
  tilkalling_grunnlag: 'vikar',
};

export default function EmployerSettingsCard({ orgId, previewValues = null, periodOnly = false, onValuesChange }) {
  const preview = previewValues != null;
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => (
    preview ? { ...EMPTY, ...previewValues, ub_tillegg: previewValues.ub_tillegg || [] } : EMPTY
  ));
  const [saved, setSaved] = useState(false);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['employer-settings', orgId],
    queryFn: () => base44.entities.EmployerSetting.filter({ org_id: orgId }),
    enabled: !!orgId && !preview,
  });
  const existing = rows[0];

  useEffect(() => {
    if (preview || !existing) return;
    setForm({ ...EMPTY, ...existing, ub_tillegg: existing.ub_tillegg || [] });
  }, [existing, preview]);

  const saveMut = useMutation({
    mutationFn: async (data) => {
      if (preview) return data;
      if (existing) return base44.entities.EmployerSetting.update(existing.id, data);
      return base44.entities.EmployerSetting.create({ ...data, org_id: orgId });
    },
    onSuccess: () => {
      if (!preview) queryClient.invalidateQueries({ queryKey: ['employer-settings', orgId] });
      setSaved(true);
    },
  });

  const setField = (key, value) => setForm((current) => {
    const next = { ...current, [key]: value };
    onValuesChange?.(next);
    return next;
  });

  const updateUb = (index, key, value) => {
    const next = [...(form.ub_tillegg || [])];
    next[index] = { ...next[index], [key]: value };
    setField('ub_tillegg', next);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSaved(false);
    const ub = (form.ub_tillegg || [])
      .filter((row) => String(row.navn || '').trim())
      .map((row) => ({
        navn: String(row.navn).trim(),
        sats: String(row.sats || '').trim(),
        fra_kl: String(row.fra_kl || '').trim(),
        til_kl: String(row.til_kl || '').trim(),
      }));
    saveMut.mutate({
      ...form,
      ub_tillegg: ub,
      alminnelig_ukentlig_arbeidstid: Number(form.alminnelig_ukentlig_arbeidstid) || 37.5,
      feriepenger_prosent: Number(form.feriepenger_prosent) || 0,
      lonningsdag: Number(form.lonningsdag) || 15,
      oppsigelsesfrist_mnd_midlertidig: Number(form.oppsigelsesfrist_mnd_midlertidig) || 1,
      signering_frist_dager: Number(form.signering_frist_dager) || 14,
      oppbevaring_mnd_etter_opphor: Number(form.oppbevaring_mnd_etter_opphor) || 60,
      ekstratimer_periode: form.ekstratimer_periode === 'uke' ? 'uke' : 'maaned',
    });
  };

  if (!orgId && !preview) return null;
  if (!preview && isLoading) return null;
  if (error && /does not exist|schema cache|Could not find the table/i.test(error.message || '')) return null;

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Arbeidsgiver i avtalene</h2>
        <p className="text-xs text-slate-500 mt-1">Bare admin ser disse opplysningene. De fylles inn i arbeidsavtalen.</p>
      </div>
      <div className="space-y-1.5 max-w-sm">
        <Label htmlFor="ekstratimer-periode">Vurdering av ekstratimer</Label>
        <Select value={form.ekstratimer_periode === 'uke' ? 'uke' : 'maaned'} onValueChange={(value) => setField('ekstratimer_periode', value)}>
          <SelectTrigger id="ekstratimer-periode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="maaned">Måned</SelectItem>
            <SelectItem value="uke">Uke</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">Måned sammenligner hele kalendermåneden med avtalt tid. En uke med flere timer kan veies opp av en uke med færre timer. Uke vurderer hver uke for seg.</p>
      </div>
      {!periodOnly && (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Juridisk navn</Label>
          <Input value={form.selskap || ''} onChange={(e) => setField('selskap', e.target.value)} />
          <p className="text-xs text-slate-500">Brukes på avtalen bare når kundekortet mangler selskapsnavn. Parten øverst er navnet og org.nr fra kundekortet.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Organisasjonsnummer</Label>
          <Input value={form.org_nr || ''} onChange={(e) => setField('org_nr', e.target.value)} />
          <p className="text-xs text-slate-500">Brukes bare når kundekortet mangler organisasjonsnummer.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Adresse</Label>
          <Input value={form.adresse || ''} onChange={(e) => setField('adresse', e.target.value)} />
          <p className="text-xs text-slate-500">Arbeidsgivers adresse på avtalen er adressen til avdelingen der den ansatte jobber. Denne brukes bare når avdelingen ikke har adresse.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Signatur, fullt navn</Label>
          <Input value={form.signatur_navn || ''} onChange={(e) => setField('signatur_navn', e.target.value)} placeholder="Brukes bare når kunden mangler et adminnavn" />
          <p className="text-xs text-slate-500">Siste reserveløsning, etter navnet «Admin / signerer» på kundekortet og deretter valgt admin. Kontaktpersonen brukes ikke.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Alminnelig ukentlig arbeidstid</Label>
          <Input type="number" step="0.5" value={form.alminnelig_ukentlig_arbeidstid} onChange={(e) => setField('alminnelig_ukentlig_arbeidstid', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Ferie</Label>
          <Input value={form.ferie_uker || ''} onChange={(e) => setField('ferie_uker', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Feriepenger, prosent</Label>
          <Input type="number" step="0.1" value={form.feriepenger_prosent} onChange={(e) => setField('feriepenger_prosent', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Lønningsdag</Label>
          <Input type="number" min="1" max="31" value={form.lonningsdag} onChange={(e) => setField('lonningsdag', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Feriepenger utbetales</Label>
          <Input value={form.feriepenger_utbetales || ''} onChange={(e) => setField('feriepenger_utbetales', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>OTP-leverandør</Label>
          <Input value={form.otp_leverandor || ''} onChange={(e) => setField('otp_leverandor', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Yrkesskadeforsikring</Label>
          <Input value={form.yrkesskade_forsikring || ''} onChange={(e) => setField('yrkesskade_forsikring', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Oppsigelse, midlertidig (mnd)</Label>
          <Input type="number" min="0" value={form.oppsigelsesfrist_mnd_midlertidig} onChange={(e) => setField('oppsigelsesfrist_mnd_midlertidig', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Signeringsfrist (dager)</Label>
          <Input type="number" min="1" value={form.signering_frist_dager} onChange={(e) => setField('signering_frist_dager', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Oppbevaring etter opphør (mnd)</Label>
          <Input type="number" min="0" value={form.oppbevaring_mnd_etter_opphor} onChange={(e) => setField('oppbevaring_mnd_etter_opphor', e.target.value)} />
          <p className="text-xs text-slate-400">Ingen automatisk sletting. Admin må bekrefte før noe slettes.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={!!form.tariff} onCheckedChange={(value) => setField('tariff', value === true)} />
        Tariffavtale gjelder
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={form.otp !== false} onCheckedChange={(value) => setField('otp', value === true)} />
        OTP er opprettet
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>UB-tillegg</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setField('ub_tillegg', [...(form.ub_tillegg || []), { navn: '', sats: '', fra_kl: '', til_kl: '' }])}
          >
            Legg til
          </Button>
        </div>
        {(form.ub_tillegg || []).map((row, index) => (
          <div key={`ub-${index}`} className="grid grid-cols-4 gap-2">
            <Input placeholder="Navn" value={row.navn || ''} onChange={(e) => updateUb(index, 'navn', e.target.value)} />
            <Input placeholder="Sats" value={row.sats || ''} onChange={(e) => updateUb(index, 'sats', e.target.value)} />
            <Input placeholder="Fra" value={row.fra_kl || ''} onChange={(e) => updateUb(index, 'fra_kl', e.target.value)} />
            <Input placeholder="Til" value={row.til_kl || ''} onChange={(e) => updateUb(index, 'til_kl', e.target.value)} />
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tilkallingsgrunnlag</Label>
          <Select value={form.tilkalling_grunnlag || 'vikar'} onValueChange={(value) => setField('tilkalling_grunnlag', value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vikar">Vikar</SelectItem>
              <SelectItem value="sesong">Sesong</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Signering</Label>
          <Select value={form.signing_provider || 'simple_otp'} onValueChange={(value) => setField('signing_provider', value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="simple_otp">E-postkode</SelectItem>
              <SelectItem value="idura">BankID via Idura (ikke aktivert)</SelectItem>
              <SelectItem value="signicat">BankID via Signicat (ikke aktivert)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-400">BankID brukes ikke før avtale med Idura eller Signicat og med Stø. Fødselsnummer hentes ikke.</p>
        </div>
      </div>
      </>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={!!form.send_tilleggsavtaler_automatisk} onCheckedChange={(value) => setField('send_tilleggsavtaler_automatisk', value === true)} />
        Send tilleggsavtaler automatisk når vurderingen er Uke. En månedlig avtale blir liggende som utkast.
      </label>

      {saveMut.error && <p className="text-sm text-red-600">{saveMut.error.message}</p>}
      {saved && <p className="text-sm text-emerald-700">Arbeidsgiveropplysningene er lagret.</p>}
      <Button type="submit" disabled={saveMut.isPending}>Lagre arbeidsgiver</Button>
    </form>
  );
}
