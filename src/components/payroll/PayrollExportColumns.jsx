import { PAYROLL_COLUMNS } from '@/utils/payrollExport';

const GROUPS = [
  ['identitet', 'Hvem'],
  ['timer', 'Timer'],
  ['fravær', 'Fravær'],
  ['lønn', 'Lønn'],
];

export default function PayrollExportColumns({ selected, onChange }) {
  const toggle = (key) => {
    const next = selected.includes(key)
      ? selected.filter((item) => item !== key)
      : [...selected, key];
    onChange(next.length > 0 ? next : selected);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Kolonner i lønnseksport</h2>
        <p className="text-xs text-slate-400 mt-1">
          Lønnssystemet er ikke valgt ennå. Kryss av kolonnene som skal med i CSV og Excel.
          Natt-, søndag- og helligdagstimer er tillegg og kan overlappe vanlige timer.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {GROUPS.map(([group, title]) => (
          <div key={group} className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">{title}</p>
            {PAYROLL_COLUMNS.filter((column) => column.group === group).map((column) => (
              <label key={column.key} className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={selected.includes(column.key)}
                  onChange={() => toggle(column.key)}
                />
                {column.label}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
