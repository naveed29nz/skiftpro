import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, getISOWeek, startOfISOWeek, addWeeks, subWeeks, addDays } from 'date-fns';
import { nb } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Save, CheckCircle2, Download, AlertTriangle } from 'lucide-react';
import { getActiveTeams } from '@/utils/teams';
import { useOrg } from '@/hooks/useOrg';

const FIXED_LODDTYPER = ['Flax Million', 'Pengedryss', 'Flax for livet', 'Kryssord', 'Grise Flax', 'Mega'];
const CUSTOM_KEYS = ['custom_1', 'custom_2', 'custom_3'];
const DAYS = [
  { key: 'man', label: 'Mandag' },
  { key: 'tir', label: 'Tirsdag' },
  { key: 'ons', label: 'Onsdag' },
  { key: 'tor', label: 'Torsdag' },
  { key: 'fre', label: 'Fredag' },
  { key: 'lor', label: 'Lørdag' },
  { key: 'son', label: 'Søndag' },
];

function emptyRecord(butikk, weekNum, year, loddtype) {
  const r = { butikk, uke_nummer: weekNum, year, loddtype, slutt_fysisk: '', kommentar: '' };
  DAYS.forEach(d => { r[`${d.key}_inng`] = ''; r[`${d.key}_akt`] = ''; r[`${d.key}_salg`] = ''; });
  return r;
}

function calcForventet(r) {
  // End of week: last day's inng + akt - total salg across week
  // Simpler: slutt forventet = sondag inng + sondag akt - sondag salg (daily carry-over)
  // Actually: total tilgjengelig each day = inng + akt, minus salg = next day inng
  // For week summary: total salg across all days
  let totalSalg = 0;
  let totalAkt = 0;
  DAYS.forEach(d => {
    totalSalg += parseFloat(r[`${d.key}_salg`]) || 0;
    totalAkt += parseFloat(r[`${d.key}_akt`]) || 0;
  });
  const startInng = parseFloat(r['man_inng']) || 0;
  const forventet = startInng + totalAkt - totalSalg;
  return { forventet, totalSalg, totalAkt };
}

function LoddTypeTable({ loddtype, record, onChange, weekDates }) {
  const { forventet, totalSalg } = calcForventet(record);
  const slutt = record.slutt_fysisk !== '' ? parseFloat(record.slutt_fysisk) : null;
  const differanse = slutt !== null ? slutt - forventet : null;
  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th className="px-4 py-3 text-left font-bold text-slate-800 bg-slate-50 w-44 border-r border-slate-200">{loddtype}</th>
              {DAYS.map((d, i) => {
                const isToday = weekDates[i] === today;
                return (
                  <th key={d.key} className={`px-2 py-3 text-center font-semibold text-xs ${isToday ? 'bg-blue-50 text-blue-700' : 'text-slate-600 bg-slate-50'} border-r border-slate-200 last:border-r-0 min-w-[90px]`}>
                    <div>{d.label}</div>
                    <div className="font-normal text-slate-400 text-xs">{weekDates[i] ? format(new Date(weekDates[i]), 'd. MMM', { locale: nb }) : ''}</div>
                  </th>
                );
              })}
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 bg-slate-50 min-w-[90px]">Totalt salg</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 bg-slate-50 min-w-[90px]">Forventet slutt</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 bg-slate-50 min-w-[90px]">Fysisk slutt</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 bg-slate-50 min-w-[90px]">Differanse</th>
            </tr>
          </thead>
          <tbody>
            {/* Inngående beholdning */}
            <tr className="border-b border-slate-100">
              <td className="px-4 py-2.5 font-medium text-slate-700 bg-slate-50/50 border-r border-slate-200 text-xs">Inngående beholdning</td>
              {DAYS.map(d => (
                <td key={d.key} className="px-1.5 py-1.5 border-r border-slate-100 last:border-r-0">
                  <Input type="number" value={record[`${d.key}_inng`]} onChange={e => onChange(`${d.key}_inng`, e.target.value)}
                    className="h-8 text-xs text-center w-full" placeholder="0" />
                </td>
              ))}
              <td colSpan={4} className="bg-slate-50/30" />
            </tr>
            {/* Aktivisert */}
            <tr className="border-b border-slate-100">
              <td className="px-4 py-2.5 font-medium text-slate-700 bg-slate-50/50 border-r border-slate-200 text-xs">Aktivisert</td>
              {DAYS.map(d => (
                <td key={d.key} className="px-1.5 py-1.5 border-r border-slate-100 last:border-r-0">
                  <Input type="number" value={record[`${d.key}_akt`]} onChange={e => onChange(`${d.key}_akt`, e.target.value)}
                    className="h-8 text-xs text-center w-full" placeholder="0" />
                </td>
              ))}
              <td colSpan={4} className="bg-slate-50/30" />
            </tr>
            {/* Salg */}
            <tr className="border-b border-slate-200 bg-blue-50/20">
              <td className="px-4 py-2.5 font-medium text-blue-700 bg-blue-50/50 border-r border-slate-200 text-xs">Salg</td>
              {DAYS.map(d => (
                <td key={d.key} className="px-1.5 py-1.5 border-r border-slate-100 last:border-r-0">
                  <Input type="number" value={record[`${d.key}_salg`]} onChange={e => onChange(`${d.key}_salg`, e.target.value)}
                    className="h-8 text-xs text-center w-full border-blue-200" placeholder="0" />
                </td>
              ))}
              {/* Summary cols */}
              <td className="px-2 py-2.5 text-center font-bold text-slate-700 text-sm">{totalSalg || '—'}</td>
              <td className="px-2 py-2.5 text-center font-bold text-slate-700 text-sm">{forventet}</td>
              <td className="px-1.5 py-1.5">
                <Input type="number" value={record.slutt_fysisk} onChange={e => onChange('slutt_fysisk', e.target.value)}
                  className={`h-8 text-xs text-center w-full ${differanse !== null && differanse !== 0 ? 'border-red-400' : ''}`} placeholder="—" />
              </td>
              <td className={`px-2 py-2.5 text-center font-bold text-base ${differanse === null ? 'text-slate-300' : differanse >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {differanse === null ? '—' : differanse > 0 ? `+${differanse}` : differanse}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-3">
        <Input value={record.kommentar || ''} onChange={e => onChange('kommentar', e.target.value)}
          className="h-7 text-xs flex-1 max-w-xs" placeholder="Kommentar (valgfritt)" />
      </div>
    </div>
  );
}

export default function Loddtelling() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [currentUser, setCurrentUser] = useState(null);
  const [myWorker, setMyWorker] = useState(null);
  const [weekRef, setWeekRef] = useState(startOfISOWeek(new Date()));
  const [butikk, setButikk] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [localData, setLocalData] = useState({});
  const [customNames, setCustomNames] = useState({ custom_1: '', custom_2: '', custom_3: '' });
  const [wpSettings, setWpSettings] = useState(null);
  const [allWorkers, setAllWorkers] = useState([]);

  const weekNum = getISOWeek(weekRef);
  const year = weekRef.getFullYear();
  const weekDates = Array.from({ length: 7 }, (_, i) => format(addDays(weekRef, i), 'yyyy-MM-dd'));

  // Tilgang til alle butikker: enten Base44-brukeren er admin (organisasjonseier),
  // eller Worker-rollen er admin/sub_admin (tverrgående oppsyn — RLS gir dem
  // allerede org-wide read/update på Loddtelling).
  const canSeeAllButikker = currentUser?.role === 'admin' || myWorker?.role === 'admin' || myWorker?.role === 'sub_admin';

  // Team options: include all teams with custom names / assigned workers / declared active
  const teamOptions = useMemo(() => {
    const allTeams = getActiveTeams(wpSettings, allWorkers);
    if (canSeeAllButikker) return allTeams;
    const myTeams = myWorker?.teams || ['team1'];
    return allTeams.filter(t => myTeams.includes(t.key));
  }, [wpSettings, canSeeAllButikker, myWorker, allWorkers]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const u = await base44.auth.me();
        if (cancelled) return;
        setCurrentUser(u);
        const [ws, settings, workers] = await Promise.all([
          u?.email ? base44.entities.Worker.filter({ email: u.email }) : Promise.resolve([]),
          base44.entities.WorkplaceSetting.filter({ org_id: orgId }),
          base44.entities.Worker.filter({ org_id: orgId }),
        ]);
        if (cancelled) return;
        const w = ws[0] || null;
        const wpRecord = settings[0] || null;
        setMyWorker(w);
        setWpSettings(wpRecord);
        setAllWorkers(workers);
        setButikk(w?.teams?.[0] || 'team1');
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const { data: allRecords = [] } = useQuery({
    queryKey: ['loddtelling', orgId],
    queryFn: () => orgId
      ? base44.entities.Loddtelling.filter({ org_id: orgId }, '-uke_nummer', 500)
      : base44.entities.Loddtelling.list('-uke_nummer', 500),
  });

  // Build local state from DB records for this week+butikk
  useEffect(() => {
    if (!butikk) return;
    const map = {};
    // Find next week number and year
    const nextWeekRef = addWeeks(weekRef, 1);
    const nextWeekNum = getISOWeek(nextWeekRef);
    const nextWeekYear = nextWeekRef.getFullYear();
    const allTypes = [...FIXED_LODDTYPER, ...CUSTOM_KEYS];
    const newCustomNames = { ...customNames };
    allTypes.forEach(lt => {
      const existing = allRecords.find(r => r.uke_nummer === weekNum && r.year === year && r.butikk === butikk && r.loddtype === lt);
      const nextWeekRecord = allRecords.find(r => r.uke_nummer === nextWeekNum && r.year === nextWeekYear && r.butikk === butikk && r.loddtype === lt);
      const autoSluttFysisk = nextWeekRecord?.man_inng ?? null;
      if (existing) {
        const row = { ...emptyRecord(butikk, weekNum, year, lt), ...existing };
        DAYS.forEach(d => {
          ['_inng','_akt','_salg'].forEach(s => {
            if (row[`${d.key}${s}`] === 0 && !existing[`${d.key}${s}`]) row[`${d.key}${s}`] = '';
            else row[`${d.key}${s}`] = existing[`${d.key}${s}`] ?? '';
          });
        });
        row.slutt_fysisk = autoSluttFysisk !== null ? autoSluttFysisk : (existing.slutt_fysisk ?? '');
        // Restore custom name from saved record's kommentar-style field (we store it in loddtype_label)
        if (CUSTOM_KEYS.includes(lt) && existing.loddtype_label) newCustomNames[lt] = existing.loddtype_label;
        map[lt] = row;
      } else {
        const row = emptyRecord(butikk, weekNum, year, lt);
        if (autoSluttFysisk !== null) row.slutt_fysisk = autoSluttFysisk;
        map[lt] = row;
      }
    });
    setCustomNames(newCustomNames);
    setLocalData(map);
  }, [allRecords, weekNum, year, butikk, weekRef]);

  const handleChange = (loddtype, field, val) => {
    setLocalData(prev => ({ ...prev, [loddtype]: { ...prev[loddtype], [field]: val } }));
  };

  const saveAll = async (nextStatus) => {
    if (!butikk) return alert('Velg butikk først');
    setSaving(true);
    try {
    for (const lt of [...FIXED_LODDTYPER, ...CUSTOM_KEYS]) {
      const r = localData[lt];
      if (!r) continue;
      // Skip unnamed custom types with no data
      if (CUSTOM_KEYS.includes(lt) && !customNames[lt]) continue;
      const hasData = DAYS.some(d => r[`${d.key}_inng`] !== '' || r[`${d.key}_akt`] !== '' || r[`${d.key}_salg`] !== '') || r.slutt_fysisk !== '';
      if (!hasData && !r.id) continue;
      const { forventet } = calcForventet(r);
      const slutt = r.slutt_fysisk !== '' ? parseFloat(r.slutt_fysisk) || 0 : null;
      const payload = {
        butikk, team: butikk, uke_nummer: weekNum, year, loddtype: lt,
        org_id: orgId || '',
        ...(CUSTOM_KEYS.includes(lt) ? { loddtype_label: customNames[lt] || '' } : {}),
        slutt_fysisk: slutt ?? 0,
        differanse: slutt !== null ? slutt - forventet : 0,
        kommentar: r.kommentar || '',
        updated_by: currentUser?.email || '',
        ...(nextStatus === 'innsendt' ? { status: 'innsendt', locked: true } : {}),
      };
      DAYS.forEach(d => {
        ['_inng','_akt','_salg'].forEach(s => {
          payload[`${d.key}${s}`] = parseFloat(r[`${d.key}${s}`]) || 0;
        });
      });
      if (r.id) await base44.entities.Loddtelling.update(r.id, payload);
      else await base44.entities.Loddtelling.create(payload);
    }
    } catch (error) {
      alert(error?.message || 'Kunne ikke lagre. Innsendt loddtelling kan bare endres av administrator.');
    }
    await queryClient.invalidateQueries({ queryKey: ['loddtelling'] });
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  const allLoddtyper = [...FIXED_LODDTYPER, ...CUSTOM_KEYS];

  const totalAvvik = useMemo(() => {
    return allLoddtyper.filter(lt => {
      const r = localData[lt];
      if (!r || r.slutt_fysisk === '') return false;
      const { forventet } = calcForventet(r);
      return parseFloat(r.slutt_fysisk) - forventet !== 0;
    }).length;
  }, [localData]);

  const exportCSV = () => {
    const header = ['Loddtype','Uke','År','Butikk',...DAYS.map(d=>`${d.label} Inng`),...DAYS.map(d=>`${d.label} Akt`),...DAYS.map(d=>`${d.label} Salg`),'Fysisk slutt','Differanse'];
    const rows = allLoddtyper.map(lt => {
      const displayName = CUSTOM_KEYS.includes(lt) ? (customNames[lt] || lt) : lt;
      const r = localData[lt] || {};
      const { forventet } = calcForventet(r);
      const slutt = r.slutt_fysisk !== '' ? parseFloat(r.slutt_fysisk) : null;
      return [displayName, weekNum, year, butikk,
        ...DAYS.map(d => r[`${d.key}_inng`] || 0),
        ...DAYS.map(d => r[`${d.key}_akt`] || 0),
        ...DAYS.map(d => r[`${d.key}_salg`] || 0),
        slutt ?? '', slutt !== null ? slutt - forventet : ''];
    });
    const csv = [header, ...rows].map(r => r.join(';')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `loddtelling_uke${weekNum}_${year}.csv`; a.click();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Kontrolltelling av lodd</h1>
          <p className="text-sm text-slate-500">Uke {weekNum} — {year}{butikk && wpSettings ? ` · ${wpSettings[`${butikk}_name`] || butikk}` : ''}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5"><Download className="w-3.5 h-3.5" />Eksport</Button>
      </div>

      {/* Butikk + week nav */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Butikk:</label>
          {teamOptions.length > 1 ? (
            <select
              value={butikk}
              onChange={e => setButikk(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white h-8"
            >
              {teamOptions.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-semibold text-slate-700">
              {teamOptions[0]?.label || butikk}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setWeekRef(subWeeks(weekRef, 1))} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-slate-700 min-w-[90px] text-center">Uke {weekNum} — {year}</span>
          <button onClick={() => setWeekRef(addWeeks(weekRef, 1))} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => setWeekRef(startOfISOWeek(new Date()))} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 border border-blue-200 rounded-lg">Nå</button>
        </div>
      </div>

      {/* One table per loddtype */}
      {FIXED_LODDTYPER.map(lt => (
        <LoddTypeTable
          key={lt}
          loddtype={lt}
          record={localData[lt] || emptyRecord(butikk, weekNum, year, lt)}
          onChange={(field, val) => handleChange(lt, field, val)}
          weekDates={weekDates}
        />
      ))}

      {/* Custom / sesong lodd */}
      {CUSTOM_KEYS.map((key, i) => (
        <div key={key} className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 whitespace-nowrap">Sesong lodd {i + 1}:</label>
            <Input
              value={customNames[key]}
              onChange={e => setCustomNames(n => ({ ...n, [key]: e.target.value }))}
              placeholder="Skriv inn loddnavn..."
              className="h-8 text-sm max-w-xs"
            />
          </div>
          <LoddTypeTable
            loddtype={customNames[key] || `Sesong lodd ${i + 1}`}
            record={localData[key] || emptyRecord(butikk, weekNum, year, key)}
            onChange={(field, val) => handleChange(key, field, val)}
            weekDates={weekDates}
          />
        </div>
      ))}

      {/* Save bar */}
      <div className="sticky bottom-4 z-10">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-lg px-5 py-3 flex items-center gap-4 flex-wrap">
          <Button onClick={() => saveAll()} disabled={saving || !butikk} className="gap-1.5">
            <Save className="w-4 h-4" />{saving ? 'Lagrer...' : 'Lagre uke'}
          </Button>
          <Button variant="outline" onClick={() => saveAll('innsendt')} disabled={saving || !butikk}>Send inn</Button>
          {savedMsg && <span className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Lagret!</span>}
          {!butikk && <span className="text-xs text-amber-600">Skriv inn butikk for å lagre</span>}
          {totalAvvik > 0 && (
            <span className="ml-auto text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{totalAvvik} loddtype{totalAvvik !== 1 ? 'r' : ''} med avvik</span>
          )}
          {totalAvvik === 0 && savedMsg && (
            <span className="ml-auto text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Ingen avvik!</span>
          )}
        </div>
      </div>
    </div>
  );
}