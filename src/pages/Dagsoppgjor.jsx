import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, startOfMonth, endOfMonth, getMonth, getYear } from 'date-fns';
import { Plus, Download, Search, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, X } from 'lucide-react';
import SeddelSkjema from '@/components/dagsoppgjor/SeddelSkjema';
import { useOrg } from '@/hooks/useOrg';
import { useScopedWorkplaceSetting } from '@/hooks/useScopedWorkplaceSetting';

const STATUS_COLORS = {
  Registrert: 'bg-slate-100 text-slate-700',
  Kontrollert: 'bg-blue-100 text-blue-700',
  Bankført: 'bg-emerald-100 text-emerald-700',
  Avvik: 'bg-red-100 text-red-700',
};

function fmt(n) { return (n ?? 0).toLocaleString('no-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function diffColor(n) { return n >= 0 ? 'text-emerald-600' : 'text-red-600 font-bold'; }
// For kasse vs droppet: grønt hvis droppet > kasse (positiv diff), rødt hvis droppet < kasse (negativ diff)
function diffColorKasse(n) { return n > 0 ? 'text-emerald-600' : n < 0 ? 'text-red-600 font-bold' : 'text-slate-600'; }

const EMPTY_FORM = {
  butikk: '', butikk_nr: '', dato: format(new Date(), 'yyyy-MM-dd'), pose_nummer: '', skannet_pose_nummer: '',
  ansatt_navn: '',
  seddel_1000_antall: '', seddel_1000_sum: '',
  seddel_500_antall: '',  seddel_500_sum: '',
  seddel_200_antall: '',  seddel_200_sum: '',
  seddel_100_antall: '',  seddel_100_sum: '',
  seddel_50_antall: '',   seddel_50_sum: '',
  mynt_antall: '',        mynt_sum: '',
  kontantsalg_kasse: '', droppet_belop: '', kontrollert_belop: '', bank_mottatt_belop: '', kommentar: '',
};

function calcRecord(f) {
  const kasse = parseFloat(f.kontantsalg_kasse) || 0;
  const d = parseFloat(f.droppet_belop) || 0;
  const k = parseFloat(f.kontrollert_belop) || 0;
  const b = parseFloat(f.bank_mottatt_belop) || 0;
  // Diff kontant/droppet: positiv (grønn) hvis droppet > kasse, negativ (rød) hvis droppet < kasse
  const dMk = kasse > 0 ? d - kasse : d - k;
  const dMb = k - b;
  const total = k > 0 ? dMk + dMb : kasse > 0 ? kasse - d : 0;
  let status = f.status || 'Registrert';
  if (b > 0) {
    status = (dMk === 0 && dMb === 0) ? 'Bankført' : 'Avvik';
  } else if (k > 0) {
    status = 'Kontrollert';
  }
  return { differanse_mot_kontroll: dMk, differanse_mot_bank: dMb, total_dagsdifferanse: total, status };
}

export default function Dagsoppgjor() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const { wp: ws } = useScopedWorkplaceSetting();
  const [currentUser, setCurrentUser] = useState(null);
  const [myWorker, setMyWorker] = useState(null);
  const [myTeam, setMyTeam] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [search, setSearch] = useState('');
  const [filterButikk, setFilterButikk] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterDateTo, setFilterDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [showSummary, setShowSummary] = useState(true);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    base44.auth.me().then(async u => {
      setCurrentUser(u);
      if (u?.email) {
        const ws = await base44.entities.Worker.filter({ email: u.email });
        const w = ws[0] || null;
        setMyWorker(w);
        const team = w?.teams?.[0] || '';
        setMyTeam(team);
        if (!isAdmin) setFilterButikk(team);
        setForm(f => ({ ...f, ansatt_navn: w?.name || '', ansatt_id: w?.id || '', butikk: team }));
      }
    }).catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === 'admin';
  const isController = myWorker?.role === 'sub_admin' || myWorker?.role === 'butikksjef' || isAdmin;

  const { data: records = [] } = useQuery({
    queryKey: ['dagsoppgjor', orgId],
    queryFn: () => orgId
      ? base44.entities.Dagsoppgjor.filter({ org_id: orgId }, '-dato', 500)
      : base44.entities.Dagsoppgjor.list('-dato', 500),
  });

  // Build list of team options from the org-scoped WorkplaceSetting
  const teamOptions = useMemo(() => {
    if (!ws) return [];
    const count = ws.active_teams_count || 1;
    const opts = [];
    for (let i = 1; i <= count; i++) {
      const key = `team${i}`;
      const name = ws[`team${i}_name`] || `Team ${i}`;
      opts.push({ key, name });
    }
    return opts;
  }, [ws]);

  // Teams accessible by this user for registration
  const myTeamOptions = useMemo(() => {
    if (isAdmin) return teamOptions;
    // butikksjef/sub_admin/user: only own teams
    return teamOptions.filter(t => (myWorker?.teams || []).includes(t.key));
  }, [teamOptions, isAdmin, myWorker]);

  const saveMut = useMutation({
    mutationFn: async (data) => {
      const calc = calcRecord(data);
      // Compute droppet_belop from seddel totals if not manually set
    const seddelTotal = ['seddel_1000','seddel_500','seddel_200','seddel_100','seddel_50','mynt']
      .reduce((acc, k) => acc + (parseFloat(data[`${k}_sum`]) || 0), 0);
    const payload = {
        ...data,
        seddel_1000_antall: parseFloat(data.seddel_1000_antall) || 0,
        seddel_1000_sum: parseFloat(data.seddel_1000_sum) || 0,
        seddel_500_antall: parseFloat(data.seddel_500_antall) || 0,
        seddel_500_sum: parseFloat(data.seddel_500_sum) || 0,
        seddel_200_antall: parseFloat(data.seddel_200_antall) || 0,
        seddel_200_sum: parseFloat(data.seddel_200_sum) || 0,
        seddel_100_antall: parseFloat(data.seddel_100_antall) || 0,
        seddel_100_sum: parseFloat(data.seddel_100_sum) || 0,
        seddel_50_antall: parseFloat(data.seddel_50_antall) || 0,
        seddel_50_sum: parseFloat(data.seddel_50_sum) || 0,
        mynt_antall: parseFloat(data.mynt_antall) || 0,
        mynt_sum: parseFloat(data.mynt_sum) || 0,
        kontantsalg_kasse: parseFloat(data.kontantsalg_kasse) || 0,
        droppet_belop: seddelTotal > 0 ? seddelTotal : (parseFloat(data.droppet_belop) || 0),
        kontrollert_belop: parseFloat(data.kontrollert_belop) || 0,
        bank_mottatt_belop: parseFloat(data.bank_mottatt_belop) || 0,
        month: getMonth(new Date(data.dato)) + 1,
        year: getYear(new Date(data.dato)),
        org_id: orgId || '',
        ...calc,
        updated_by: currentUser?.email || '',
      };
      if (editId) return base44.entities.Dagsoppgjor.update(editId, payload);
      return base44.entities.Dagsoppgjor.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dagsoppgjor'] });
      setShowForm(false);
      setEditId(null);
      setForm({ ...EMPTY_FORM, ansatt_navn: myWorker?.name || '', ansatt_id: myWorker?.id || '', butikk: myTeam });
      setErrors({});
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Dagsoppgjor.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dagsoppgjor'] }),
  });

  const validate = () => {
    const e = {};
    if (!form.butikk) e.butikk = 'Påkrevd';
    if (!form.dato) e.dato = 'Påkrevd';
    if (!form.pose_nummer) e.pose_nummer = 'Påkrevd';
    if (!form.ansatt_navn) e.ansatt_navn = 'Påkrevd';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => { if (validate()) saveMut.mutate(form); };

  const startEdit = (r) => {
    setEditId(r.id);
    setForm({
      butikk: r.butikk, butikk_nr: r.butikk_nr || '', dato: r.dato,
      pose_nummer: r.pose_nummer, skannet_pose_nummer: r.skannet_pose_nummer || '',
      ansatt_navn: r.ansatt_navn, ansatt_id: r.ansatt_id || '',
      seddel_1000_antall: r.seddel_1000_antall || '', seddel_1000_sum: r.seddel_1000_sum || '',
      seddel_500_antall: r.seddel_500_antall || '',   seddel_500_sum: r.seddel_500_sum || '',
      seddel_200_antall: r.seddel_200_antall || '',   seddel_200_sum: r.seddel_200_sum || '',
      seddel_100_antall: r.seddel_100_antall || '',   seddel_100_sum: r.seddel_100_sum || '',
      seddel_50_antall: r.seddel_50_antall || '',     seddel_50_sum: r.seddel_50_sum || '',
      mynt_antall: r.mynt_antall || '',               mynt_sum: r.mynt_sum || '',
      kontantsalg_kasse: r.kontantsalg_kasse ?? '',
      droppet_belop: r.droppet_belop ?? '', kontrollert_belop: r.kontrollert_belop ?? '',
      bank_mottatt_belop: r.bank_mottatt_belop ?? '', kommentar: r.kommentar || '', status: r.status,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Only show records from own team (or all if admin with no filter)
  const filtered = useMemo(() => records.filter(r => {
    // Non-admin: only see own team
    if (!isAdmin && myTeam && r.butikk !== myTeam) return false;
    if (filterButikk && r.butikk !== filterButikk) return false;
    if (r.dato < filterDateFrom || r.dato > filterDateTo) return false;
    if (search && !`${r.pose_nummer} ${r.ansatt_navn} ${r.butikk}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [records, filterButikk, filterDateFrom, filterDateTo, search, isAdmin, myTeam]);

  const summary = useMemo(() => {
    const s = { kasse: 0, droppet: 0, kontrollert: 0, bank: 0, diff_kasse_droppet: 0, endelig_differanse: 0, avvik: 0, matched: 0 };
    filtered.forEach(r => {
      s.kasse += r.kontantsalg_kasse || 0;
      s.droppet += r.droppet_belop || 0;
      s.kontrollert += r.kontrollert_belop || 0;
      s.bank += r.bank_mottatt_belop || 0;
      s.endelig_differanse += r.total_dagsdifferanse || 0;
      if (r.status === 'Avvik') s.avvik++;
      if (r.status === 'Bankført') s.matched++;
    });
    s.diff_kasse_droppet = s.droppet - s.kasse;
    return s;
  }, [filtered]);

  const exportCSV = () => {
    const header = ['Dato','Butikk','Pose nr','Selger','Kontantsalg kasse','Droppet beløp','Kontant reg. bakrom','Diff Kontant/Droppet','Endelig differanse','Status'];
    const rows = filtered.map(r => [
      r.dato, r.butikk, r.pose_nummer, r.ansatt_navn,
      r.kontantsalg_kasse || 0, r.droppet_belop || 0, r.kontrollert_belop || 0,
      r.differanse_mot_kontroll || 0, r.total_dagsdifferanse || 0, r.status
    ]);
    const csv = [header, ...rows].map(r => r.join(';')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'dagsoppgjor.csv'; a.click();
  };

  const live = calcRecord(form);

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dagsoppgjør</h1>
          {myTeam && <p className="text-sm text-slate-500">Butikk: <span className="font-semibold text-slate-700">{myTeam}</span></p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5"><Download className="w-3.5 h-3.5" />Eksport</Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM, ansatt_navn: myWorker?.name||'', ansatt_id: myWorker?.id||'', butikk: isAdmin ? '' : myTeam }); setShowForm(v => !v); }}>
            <Plus className="w-3.5 h-3.5" />Ny registrering
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">{editId ? 'Rediger' : 'Ny'} registrering</h2>
            <button onClick={() => { setShowForm(false); setEditId(null); }}><X className="w-4 h-4 text-slate-400" /></button>
          </div>
          {/* Top info: Dato, Butikk, Butikk nr, Pose nr, Selger */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Dato</label>
              <Input type="date" value={form.dato} onChange={e => setForm(f => ({ ...f, dato: e.target.value }))} className={errors.dato ? 'border-red-400' : ''} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Butikk</label>
              {myTeamOptions.length > 1 ? (
                <select
                  value={form.butikk}
                  onChange={e => setForm(f => ({ ...f, butikk: e.target.value }))}
                  className={`w-full border rounded-md px-3 py-2 text-sm bg-white ${errors.butikk ? 'border-red-400' : 'border-input'}`}
                >
                  <option value="">Velg butikk...</option>
                  {myTeamOptions.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
              ) : (
                <Input value={form.butikk ? (myTeamOptions.find(t => t.key === form.butikk)?.name || form.butikk) : (myTeamOptions[0]?.name || '')} readOnly className="bg-slate-50" />
              )}
              {errors.butikk && <p className="text-xs text-red-500 mt-0.5">{errors.butikk}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Butikk nr</label>
              <Input value={form.butikk_nr} onChange={e => setForm(f => ({ ...f, butikk_nr: e.target.value }))} placeholder="F.eks. 001" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Pose nr</label>
              <Input value={form.pose_nummer} onChange={e => setForm(f => ({ ...f, pose_nummer: e.target.value }))} placeholder="F.eks. P-001" className={errors.pose_nummer ? 'border-red-400' : ''} />
              {errors.pose_nummer && <p className="text-xs text-red-500 mt-0.5">{errors.pose_nummer}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Selger</label>
              <Input value={form.ansatt_navn} onChange={e => setForm(f => ({ ...f, ansatt_navn: e.target.value }))} placeholder="Navn" className={errors.ansatt_navn ? 'border-red-400' : ''} />
              {errors.ansatt_navn && <p className="text-xs text-red-500 mt-0.5">{errors.ansatt_navn}</p>}
            </div>
          </div>

          {/* Seddel-tabell — matches the paper form */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Dagsoppgjør — Seddeltelling</p>
            <SeddelSkjema form={form} setForm={setForm} />
          </div>

          {/* Extra fields for controllers */}
          {isController && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Kontantsalg kasse (kr)</label>
                <Input type="number" value={form.kontantsalg_kasse} onChange={e => setForm(f => ({ ...f, kontantsalg_kasse: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Banken har mottatt (kr)</label>
                <Input type="number" value={form.bank_mottatt_belop} onChange={e => setForm(f => ({ ...f, bank_mottatt_belop: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Kommentar</label>
            <Input value={form.kommentar} onChange={e => setForm(f => ({ ...f, kommentar: e.target.value }))} placeholder="Valgfri kommentar" />
          </div>

          {/* Live calc preview */}
          {(parseFloat(form.kontantsalg_kasse) > 0 || parseFloat(form.kontrollert_belop) > 0 || parseFloat(form.bank_mottatt_belop) > 0) && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className={`rounded-xl p-3 text-center ${live.differanse_mot_kontroll < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <p className="text-xs text-slate-500">Diff Kontant/Droppet</p>
                <p className={`text-lg font-bold ${diffColorKasse(live.differanse_mot_kontroll)}`}>{fmt(live.differanse_mot_kontroll)} kr</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${live.differanse_mot_bank !== 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <p className="text-xs text-slate-500">Diff vs bank</p>
                <p className={`text-lg font-bold ${diffColor(live.differanse_mot_bank)}`}>{fmt(live.differanse_mot_bank)} kr</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${live.total_dagsdifferanse !== 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <p className="text-xs text-slate-500">Endelig differanse</p>
                <p className={`text-lg font-bold ${diffColor(live.total_dagsdifferanse)}`}>{fmt(live.total_dagsdifferanse)} kr</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <Button onClick={handleSubmit} disabled={saveMut.isPending} className="flex-1">{saveMut.isPending ? 'Lagrer...' : 'Lagre'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); }}>Avbryt</Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input className="pl-8 h-9 text-sm" placeholder="Søk pose nr, selger..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {isAdmin && (
          <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={filterButikk} onChange={e => setFilterButikk(e.target.value)}>
            <option value="">Alle butikker</option>
            {teamOptions.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        )}
        <Input type="date" className="h-9 text-sm w-36" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
        <span className="text-slate-400 text-sm">–</span>
        <Input type="date" className="h-9 text-sm w-36" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1">Kontantsalg kasse</p>
          <p className="text-base font-bold text-slate-800">{fmt(summary.kasse)} kr</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1">Droppet beløp</p>
          <p className="text-base font-bold text-slate-800">{fmt(summary.droppet)} kr</p>
        </div>
        <div className={`rounded-xl border p-4 ${summary.diff_kasse_droppet < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className="text-xs text-slate-400 mb-1">Diff Kontant/Droppet</p>
          <p className={`text-base font-bold ${summary.diff_kasse_droppet < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmt(summary.diff_kasse_droppet)} kr</p>
        </div>
        <div className={`rounded-xl border p-4 ${summary.endelig_differanse !== 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className="text-xs text-slate-400 mb-1">Endelig differanse</p>
          <p className={`text-base font-bold ${summary.endelig_differanse !== 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmt(summary.endelig_differanse)} kr</p>
        </div>
      </div>

      {/* Table — matches the rapport layout */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Dato</th>
                {isAdmin && <th className="px-3 py-3 text-left">Butikk</th>}
                <th className="px-3 py-3 text-left">Selger</th>
                <th className="px-3 py-3 text-left">Pose nr</th>
                <th className="px-3 py-3 text-right">Kontantsalg kasse</th>
                <th className="px-3 py-3 text-right">Droppet beløp</th>
                <th className="px-3 py-3 text-right">Diff Kontant/Droppet</th>
                <th className="px-3 py-3 text-right">Endelig differanse</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400 text-sm">Ingen registreringer</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} className={`hover:bg-slate-50 ${r.status === 'Avvik' ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{r.dato}</td>
                  {isAdmin && <td className="px-3 py-3 text-slate-600 text-xs">{teamOptions.find(t => t.key === r.butikk)?.name || r.butikk}</td>}
                  <td className="px-3 py-3 text-slate-700">{r.ansatt_navn}</td>
                  <td className="px-3 py-3 text-slate-700 font-mono text-xs">{r.pose_nummer}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{r.kontantsalg_kasse > 0 ? fmt(r.kontantsalg_kasse) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{fmt(r.droppet_belop)}</td>
                  <td className={`px-3 py-3 text-right font-medium ${diffColorKasse(r.differanse_mot_kontroll || 0)}`}>{fmt(r.differanse_mot_kontroll || 0)}</td>
                  <td className={`px-3 py-3 text-right font-medium ${diffColor(r.total_dagsdifferanse || 0)}`}>{fmt(r.total_dagsdifferanse || 0)}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(r)} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50">Rediger</button>
                      {isAdmin && (
                        <button onClick={() => { if (window.confirm('Slett denne?')) deleteMut.mutate(r.id); }} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Slett</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {/* Totalt row */}
              {filtered.length > 0 && (
                <tr className="bg-slate-100 font-bold text-sm border-t-2 border-slate-300">
                  <td className="px-4 py-3" colSpan={isAdmin ? 4 : 3}>Totalt</td>
                  <td className="px-3 py-3 text-right">{fmt(summary.kasse)}</td>
                  <td className="px-3 py-3 text-right">{fmt(summary.droppet)}</td>
                  <td className={`px-3 py-3 text-right ${diffColorKasse(summary.diff_kasse_droppet)}`}>{fmt(summary.diff_kasse_droppet)}</td>
                  <td className={`px-3 py-3 text-right ${diffColor(summary.endelig_differanse)}`}>{fmt(summary.endelig_differanse)}</td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly summary */}
      <div>
        <button className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3" onClick={() => setShowSummary(v => !v)}>
          {showSummary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} Periodesammendrag
        </button>
        {showSummary && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div><p className="text-xs text-slate-400">Kontantsalg kasse</p><p className="text-xl font-bold text-slate-800">{fmt(summary.kasse)} kr</p></div>
              <div><p className="text-xs text-slate-400">Sum droppet</p><p className="text-xl font-bold text-slate-800">{fmt(summary.droppet)} kr</p></div>
              <div><p className="text-xs text-slate-400">Diff Kontant/Droppet</p><p className={`text-xl font-bold ${diffColorKasse(summary.diff_kasse_droppet)}`}>{fmt(summary.diff_kasse_droppet)} kr</p></div>
              <div><p className="text-xs text-slate-400">Endelig differanse</p><p className={`text-xl font-bold ${summary.endelig_differanse !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(summary.endelig_differanse)} kr</p></div>
              <div className="flex gap-4">
                <div><p className="text-xs text-slate-400">Avvik</p><p className="text-xl font-bold text-red-600">{summary.avvik}</p></div>
                <div><p className="text-xs text-slate-400">Balansert</p><p className="text-xl font-bold text-emerald-600">{summary.matched}</p></div>
              </div>
            </div>
            {filtered.filter(r => r.status === 'Avvik').length > 0 && (
              <div>
                <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Dager med avvik</p>
                <div className="space-y-1.5">
                  {filtered.filter(r => r.status === 'Avvik').map(r => (
                    <div key={r.id} className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2 text-sm">
                      <span className="font-medium text-slate-800">{r.dato} — {r.ansatt_navn} — Pose {r.pose_nummer}</span>
                      <span className="text-red-600 font-bold">{fmt(r.total_dagsdifferanse)} kr</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {filtered.filter(r => r.status === 'Avvik').length === 0 && filtered.length > 0 && (
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 text-sm">
                <CheckCircle2 className="w-4 h-4" />Ingen avvik i valgt periode
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}