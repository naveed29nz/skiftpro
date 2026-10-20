import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import InnskuddSkjema from '@/components/innskudd/InnskuddSkjema';
import InnskuddOversikt from '@/components/innskudd/InnskuddOversikt';
import {
  buildInnskuddRows,
  canEditRegistration,
  PERIODS,
  registrationStatus,
  summarizeRows,
  teamForKundenr,
  todayIso,
} from '@/innskudd/model';
import { parseLoomisWorkbook } from '@/innskudd/parseLoomisExport';
import { sampleInnskudd } from '@/innskudd/sampleData';

const ACTOR = { id: 'user-sofian', workerId: 'w-sofian', role: 'user' };

/** Dev-only innskudd screens with the approved example bags. Not included in production. */
export default function InnskuddPreview() {
  const [params, setParams] = useSearchParams();
  const vis = params.get('vis') === 'admin' ? 'admin' : 'ansatt';
  const severalStores = params.get('butikker') === 'flere';
  const initial = useMemo(() => sampleInnskudd(todayIso()), []);
  const [registrations, setRegistrations] = useState(initial.registrations);
  const [deposits, setDeposits] = useState(initial.deposits);
  const [teams, setTeams] = useState(initial.teams);
  const [editing, setEditing] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [formError, setFormError] = useState('');
  const [storeKey, setStoreKey] = useState('all');
  const [periodId, setPeriodId] = useState('30');
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [kundenrDraft, setKundenrDraft] = useState(() => Object.fromEntries(initial.teams.map((team) => [team.key, team.kundenr])));
  const today = todayIso();

  const recent = registrations
    .filter((row) => row.ansatt_id === ACTOR.workerId)
    .sort((a, b) => String(b.dato).localeCompare(String(a.dato)))
    .map((row) => {
      const loomis = deposits.find((deposit) => String(deposit.bilagsnr || '').trim() === String(row.posenummer || '').trim()) || null;
      return {
        ...row,
        status: registrationStatus(row, loomis, today),
        canEdit: canEditRegistration(row, deposits, ACTOR),
      };
    });

  const periodDays = PERIODS.find((period) => period.id === periodId)?.days || 30;
  const rows = buildInnskuddRows({
    registrations,
    deposits,
    teams,
    today,
    storeKey,
    periodDays,
  });

  const save = (payload) => {
    setFormError('');
    if (editing?.id) {
      setRegistrations((current) => current.map((row) => (row.id === editing.id ? { ...row, ...payload, ansatt_id: row.ansatt_id } : row)));
    } else {
      setRegistrations((current) => [{
        id: `local-${Date.now()}`,
        ansatt_id: ACTOR.workerId,
        created_by: ACTOR.id,
        ...payload,
      }, ...current]);
    }
    setEditing(null);
    setFormKey((key) => key + 1);
  };

  const remove = (row) => {
    if (!row.canEdit) return;
    setRegistrations((current) => current.filter((item) => item.id !== row.id));
    if (editing?.id === row.id) setEditing(null);
  };

  const onFile = async (file) => {
    setImportError('');
    setImportMessage('');
    try {
      const parsed = await parseLoomisWorkbook(await file.arrayBuffer());
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.rows.length === 0) throw new Error('Fant ingen innskudd i filen.');
      setDeposits((current) => {
        const next = [...current];
        for (const row of parsed.rows) {
          const idx = next.findIndex((item) => item.innskuddnr === row.innskuddnr);
          const stored = { ...row, id: idx >= 0 ? next[idx].id : `imp-${row.innskuddnr}`, team: teamForKundenr(row.kundenr, teams)?.key || null };
          if (idx >= 0) next[idx] = { ...next[idx], ...stored };
          else next.push(stored);
        }
        return next;
      });
      setImportMessage(parsed.skipped
        ? `Importerte ${parsed.rows.length} innskudd. ${parsed.skipped} rader hoppet over fordi Innskuddnr manglet.`
        : `Importerte ${parsed.rows.length} innskudd.`);
    } catch (error) {
      setImportError(error.message || 'Kunne ikke importere filen.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 text-sm">
        <span className="font-semibold text-blue-700">SkiftPro</span>
        <button
          type="button"
          onClick={() => setParams({ vis: 'ansatt' })}
          className={`px-2 py-1 rounded-md ${vis === 'ansatt' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
        >
          Ansatt
        </button>
        <button
          type="button"
          onClick={() => setParams({ vis: 'admin' })}
          className={`px-2 py-1 rounded-md ${vis === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
        >
          Admin
        </button>
      </div>
      <div className="p-4 lg:p-6">
        {vis === 'ansatt' ? (
          <InnskuddSkjema
            key={formKey}
            teams={severalStores ? initial.teams.slice(0, 2) : [{ key: 'team1', label: 'N.417', kundenr: '20052971' }]}
            defaultTeam="team1"
            defaultName="Sofian Zafar"
            initialPose="101522502"
            initialCounts={{ seddel_1000: '5', seddel_500: '12', seddel_200: '15', seddel_100: '9', mynt: '340' }}
            takenPoses={registrations.map((row) => row.posenummer)}
            editing={editing}
            onSubmit={save}
            onCancel={() => setEditing(null)}
            formError={formError}
            recent={recent}
            onEdit={(row) => { setEditing(row); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            onDelete={remove}
          />
        ) : (
          <InnskuddOversikt
            teams={teams}
            rows={rows}
            summary={summarizeRows(rows)}
            storeKey={storeKey}
            onStore={setStoreKey}
            periodId={periodId}
            onPeriod={setPeriodId}
            canImport
            onFile={onFile}
            importMessage={importMessage}
            importError={importError}
            kundenrDraft={kundenrDraft}
            onKundenr={(key, value) => setKundenrDraft((current) => ({ ...current, [key]: value }))}
            onSaveKundenr={() => setTeams((current) => current.map((team) => ({ ...team, kundenr: kundenrDraft[team.key] || '' })))}
          />
        )}
      </div>
    </div>
  );
}
