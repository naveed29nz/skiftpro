import { useRef } from 'react';
import { formatAmount, formatDiff, knownKundenrForName, PERIODS } from '@/innskudd/model';
import StatusChip from '@/components/innskudd/statusChip';
import { Upload } from 'lucide-react';

function amountCell(value) {
  if (value == null) return <span className="text-slate-400">–</span>;
  return <span className="tabular-nums">{formatAmount(value)}</span>;
}

export default function InnskuddOversikt({
  teams = [],
  rows = [],
  summary,
  storeKey,
  onStore,
  periodId,
  onPeriod,
  canImport = false,
  onFile,
  importing = false,
  importMessage = '',
  importError = '',
  kundenrDraft = {},
  onKundenr,
  onSaveKundenr = undefined,
  savingKundenr = false,
  onRegister = undefined,
}) {
  const fileRef = useRef(null);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Innskudd / Loomis-poser</h1>
          <p className="text-sm text-slate-500">Poser registrert i butikk koblet mot Loomis på bilagsnr.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-3 items-end">
          {canImport && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 text-white text-sm font-semibold px-3 py-2 disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                {importing ? 'Importerer…' : 'Importer Loomis-eksport (.xlsx)'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) onFile?.(file);
                }}
              />
            </>
          )}
          {onRegister && (
            <button
              type="button"
              onClick={onRegister}
              className="rounded-xl border border-slate-300 bg-white text-sm font-medium px-3 py-2"
            >
              Registrer pose
            </button>
          )}
          <label className="text-xs text-slate-500">
            Butikk
            <select
              value={storeKey}
              onChange={(event) => onStore?.(event.target.value)}
              className="block mt-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            >
              <option value="all">Alle butikker</option>
              {teams.map((team) => (
                <option key={team.key} value={team.key}>{team.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Periode
            <select
              value={periodId}
              onChange={(event) => onPeriod?.(event.target.value)}
              className="block mt-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            >
              {PERIODS.map((period) => (
                <option key={period.id} value={period.id}>{period.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {importMessage && (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">{importMessage}</p>
      )}
      {importError && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{importError}</p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-slate-500">Poser registrert</div>
          <div className="text-2xl font-bold">{summary.registrert}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-slate-500">Godkjent av Loomis</div>
          <div className="text-2xl font-bold text-emerald-600">{summary.godkjent}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-slate-500">Ikke talt &gt; 5 dager</div>
          <div className="text-2xl font-bold text-amber-600">{summary.ikkeTalt}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-slate-500">Loomis-pose uten registrering</div>
          <div className="text-2xl font-bold text-red-600">{summary.kunLoomis}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="p-3 font-medium">Butikk</th>
                <th className="p-3 font-medium">Posenr</th>
                <th className="p-3 font-medium">Dato</th>
                <th className="p-3 font-medium">Registrert av</th>
                <th className="p-3 font-medium text-right">Beløp butikk</th>
                <th className="p-3 font-medium text-right">Godkjent Loomis</th>
                <th className="p-3 font-medium text-right">Diff</th>
                <th className="p-3 pl-6 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-500">Ingen poser i perioden.</td>
                </tr>
              )}
              {rows.map((row) => {
                const highlight = row.status.key === 'ikke_talt'
                  ? 'bg-amber-50'
                  : row.status.key === 'kun_loomis'
                    ? 'bg-red-50'
                    : '';
                const diffClass = row.diff == null
                  ? 'text-slate-400'
                  : row.diff === 0
                    ? 'text-emerald-600'
                    : 'text-red-600 font-semibold';
                return (
                  <tr key={row.id} className={highlight}>
                    <td className="p-3">{row.butikk}</td>
                    <td className="p-3 font-mono">{row.posenummer}</td>
                    <td className={`p-3 ${row.kind === 'loomis-only' && row.datoLabel === '?' ? 'text-red-700' : ''}`}>{row.datoLabel}</td>
                    <td className="p-3">
                      {row.kind === 'loomis-only'
                        ? <span className="text-red-700 italic">Ingen registrering</span>
                        : row.registrertKort}
                    </td>
                    <td className="p-3 text-right">{amountCell(row.belopButikk)}</td>
                    <td className="p-3 text-right">{amountCell(row.godkjentLoomis)}</td>
                    <td className={`p-3 text-right tabular-nums ${diffClass}`}>{formatDiff(row.diff)}</td>
                    <td className="p-3 pl-6"><StatusChip tone={row.status.tone} className="whitespace-nowrap">{row.status.admin}</StatusChip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {onSaveKundenr && (
        <details className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <summary className="font-semibold text-slate-900 cursor-pointer">Loomis-kundenummer</summary>
          <p className="text-xs text-slate-500 pt-2">Kobler Kundenr i eksporten til butikken. Kjente nummer foreslås når butikknavnet er N.417, N.500, N.586 eller N.897.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {teams.map((team) => (
              <label key={team.key} className="text-xs text-slate-500">
                {team.label}
                <input
                  inputMode="numeric"
                  value={kundenrDraft[team.key] ?? ''}
                  placeholder={knownKundenrForName(team.label) || 'Kundenr'}
                  onChange={(event) => onKundenr?.(team.key, event.target.value.replace(/[^\d]/g, '').slice(0, 12))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={onSaveKundenr}
            disabled={savingKundenr}
            className="rounded-xl border border-slate-300 bg-white text-sm font-medium px-3 py-2 disabled:opacity-60"
          >
            {savingKundenr ? 'Lagrer…' : 'Lagre kundenummer'}
          </button>
        </details>
      )}
    </div>
  );
}
