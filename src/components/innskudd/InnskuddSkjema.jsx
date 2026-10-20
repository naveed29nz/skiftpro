import { useEffect, useState } from 'react';
import { bagTotals, emptyCounts, formatKr, formatShortDate, isNineDigitBag, todayIso } from '@/innskudd/model';
import StatusChip from '@/components/innskudd/statusChip';

function fieldClass(invalid) {
  return `mt-1 w-full rounded-xl border px-3 py-2.5 text-sm bg-white ${invalid ? 'border-red-400' : 'border-slate-300'}`;
}

export default function InnskuddSkjema({
  teams = [],
  defaultTeam = '',
  defaultName = '',
  initialPose = '',
  initialDate = '',
  initialCounts = null,
  takenPoses = [],
  editing = null,
  onSubmit,
  onCancel,
  saving = false,
  formError = '',
  recent = [],
  showRecent = true,
  onEdit,
  onDelete,
}) {
  const [team, setTeam] = useState(defaultTeam);
  const [dato, setDato] = useState(initialDate || todayIso());
  const [navn, setNavn] = useState(defaultName);
  const [pose, setPose] = useState(initialPose);
  const [counts, setCounts] = useState(initialCounts || emptyCounts());
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    if (!editing) return;
    setTeam(editing.team || defaultTeam);
    setDato(editing.dato || todayIso());
    setNavn(editing.registrert_navn || '');
    setPose(editing.posenummer || '');
    setCounts({
      seddel_1000: editing.seddel_1000_antall ? String(editing.seddel_1000_antall) : '',
      seddel_500: editing.seddel_500_antall ? String(editing.seddel_500_antall) : '',
      seddel_200: editing.seddel_200_antall ? String(editing.seddel_200_antall) : '',
      seddel_100: editing.seddel_100_antall ? String(editing.seddel_100_antall) : '',
      mynt: editing.mynt_belop ? String(editing.mynt_belop) : '',
    });
    setErrors({});
  }, [editing, defaultTeam]);

  useEffect(() => {
    if (!editing && !team && defaultTeam) setTeam(defaultTeam);
  }, [defaultTeam, editing, team]);

  useEffect(() => {
    if (!editing && !navn && defaultName) setNavn(defaultName);
  }, [defaultName, editing, navn]);

  const totals = bagTotals(counts);

  const setNote = (key, value) => {
    setCounts((current) => ({ ...current, [key]: value.replace(/[^\d]/g, '').slice(0, 6) }));
  };

  const validate = () => {
    const next = {};
    if (!team) next.team = 'Velg butikk';
    if (!dato) next.dato = 'Dato mangler';
    if (!navn.trim()) next.navn = 'Navn mangler';
    if (!isNineDigitBag(pose)) next.pose = 'Posenummer må være 9 siffer';
    else if (takenPoses.includes(pose) && pose !== editing?.posenummer) next.pose = 'Dette posenummeret er allerede registrert.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (event) => {
    event.preventDefault();
    if (!validate()) return;
    const selected = teams.find((item) => item.key === team);
    onSubmit?.({
      team,
      butikk: selected?.label || team,
      dato,
      registrert_navn: navn.trim(),
      posenummer: pose,
      seddel_1000_antall: totals.lines[0].count,
      seddel_500_antall: totals.lines[1].count,
      seddel_200_antall: totals.lines[2].count,
      seddel_100_antall: totals.lines[3].count,
      mynt_belop: totals.mynt,
      antall_sedler: totals.antallSedler,
      belop: totals.belop,
    });
  };

  const reset = () => {
    setPose('');
    setCounts(emptyCounts());
    setDato(todayIso());
    setErrors({});
    onCancel?.();
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-900">{editing ? 'Endre innskudd' : 'Registrer innskudd'}</h1>
      <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4 shadow-sm">
        {teams.length > 1 && (
          <label className="block text-sm font-medium text-slate-800">
            Butikk/avdeling
            <select
              value={team}
              onChange={(event) => setTeam(event.target.value)}
              className={fieldClass(errors.team)}
            >
              <option value="">Velg butikk</option>
              {teams.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            {errors.team && <span className="text-xs text-red-600 font-normal">{errors.team}</span>}
          </label>
        )}
        {teams.length === 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Du er ikke knyttet til en butikk ennå.
          </p>
        )}

        <label className="block text-sm font-medium text-slate-800">
          Dato
          <input type="date" value={dato} onChange={(event) => setDato(event.target.value)} className={fieldClass(errors.dato)} />
        </label>

        <label className="block text-sm font-medium text-slate-800">
          Navn
          <input value={navn} onChange={(event) => setNavn(event.target.value)} className={fieldClass(errors.navn)} />
          {errors.navn && <span className="text-xs text-red-600 font-normal">{errors.navn}</span>}
        </label>

        <label className="block text-sm font-medium text-slate-800">
          Posenummer (bilagsnr.) <span className="text-red-500">*</span>
          <input
            inputMode="numeric"
            maxLength={9}
            value={pose}
            onChange={(event) => setPose(event.target.value.replace(/\D/g, '').slice(0, 9))}
            className={`${fieldClass(errors.pose)} font-mono tracking-wider`}
            placeholder="9 siffer"
          />
          <span className="text-xs text-slate-500 font-normal">{errors.pose || '9 siffer – står på posen/kvitteringen'}</span>
        </label>

        <div className="text-sm font-medium text-slate-800">
          Antall sedler og mynt
          <table className="w-full mt-2 text-sm font-normal">
            <thead className="text-xs text-slate-500 text-left">
              <tr>
                <th className="font-medium">Seddel</th>
                <th className="font-medium">Antall</th>
                <th className="font-medium text-right">Sum</th>
              </tr>
            </thead>
            <tbody>
              {totals.lines.map((line) => (
                <tr key={line.key}>
                  <td className="py-1.5">{line.label}</td>
                  <td>
                    <input
                      inputMode="numeric"
                      aria-label={`Antall ${line.label}`}
                      value={counts[line.key]}
                      onChange={(event) => setNote(line.key, event.target.value)}
                      className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center"
                    />
                  </td>
                  <td className="text-right tabular-nums">{formatKr(line.sum)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5">Mynt</td>
                <td>
                  <input
                    inputMode="decimal"
                    aria-label="Mynt i kroner"
                    value={counts.mynt}
                    onChange={(event) => setCounts((current) => ({ ...current, mynt: event.target.value.replace(/[^\d,.]/g, '').slice(0, 10) }))}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-center"
                  />
                  <span className="text-xs text-slate-500 ml-1">kr</span>
                </td>
                <td className="text-right tabular-nums">{formatKr(totals.mynt)}</td>
              </tr>
            </tbody>
            <tfoot className="border-t font-semibold">
              <tr>
                <td className="pt-2">Totalt</td>
                <td className="pt-2 text-xs text-slate-500 font-normal">{totals.antallSedler} sedler + mynt</td>
                <td className="pt-2 text-right tabular-nums">{formatKr(totals.belop)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center">
          <span className="text-sm font-medium">Beløp i posen</span>
          <span className="ml-auto text-lg font-bold tabular-nums">{formatKr(totals.belop)}</span>
        </div>
        <p className="text-xs text-slate-500 -mt-2">Fylles ut automatisk fra Totalt.</p>

        {formError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formError}</p>
        )}

        <button
          type="submit"
          disabled={saving || teams.length === 0}
          className="w-full rounded-xl bg-blue-600 text-white font-semibold py-3 disabled:opacity-60"
        >
          {saving ? 'Lagrer…' : editing ? 'Oppdater pose' : 'Registrer pose'}
        </button>
        {editing && (
          <button type="button" onClick={reset} className="w-full text-sm text-slate-500 py-1">
            Avbryt endring
          </button>
        )}
      </form>

      {showRecent && (
        <>
          <h2 className="font-semibold text-slate-900 pt-2">Mine siste poser</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">Ingen poser registrert ennå.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {recent.map((row) => (
                <div key={row.id} className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold">{row.posenummer}</div>
                      <div className="text-xs text-slate-500">{formatShortDate(row.dato)} · {formatKr(row.belop)}</div>
                    </div>
                    <span className="ml-auto">
                      <StatusChip tone={row.status.tone}>{row.status.employee}</StatusChip>
                    </span>
                  </div>
                  {row.canEdit && (
                    <div className="mt-2 flex gap-3 text-xs">
                      <button type="button" onClick={() => onEdit?.(row)} className="text-blue-700 font-medium">Endre</button>
                      {confirmId === row.id ? (
                        <>
                          <button type="button" onClick={() => { setConfirmId(null); onDelete?.(row); }} className="text-red-600 font-medium">Bekreft sletting</button>
                          <button type="button" onClick={() => setConfirmId(null)} className="text-slate-500">Avbryt</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmId(row.id)} className="text-red-600 font-medium">Slett</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
