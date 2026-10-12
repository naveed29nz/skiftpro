import { Input } from '@/components/ui/input';

const SEDLER = [
  { key: 'seddel_1000', label: '1000' },
  { key: 'seddel_500',  label: '500' },
  { key: 'seddel_200',  label: '200' },
  { key: 'seddel_100',  label: '100' },
  { key: 'seddel_50',   label: '50' },
  { key: 'mynt',        label: 'Mynt' },
];

export default function SeddelSkjema({ form, setForm }) {
  const updateAntall = (key, val) => {
    const antall = parseFloat(val) || 0;
    const denomination = parseInt(key.split('_')[1]) || 0;
    const sum = denomination > 0 ? antall * denomination : (parseFloat(form[`${key}_sum`]) || 0);
    setForm(f => ({ ...f, [`${key}_antall`]: val, [`${key}_sum`]: denomination > 0 ? sum : f[`${key}_sum`] }));
  };

  const updateSum = (key, val) => {
    setForm(f => ({ ...f, [`${key}_sum`]: val }));
  };

  const totalSum = SEDLER.reduce((acc, s) => acc + (parseFloat(form[`${s.key}_sum`]) || 0), 0);

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-3 bg-slate-100 border-b border-slate-300 text-sm font-semibold text-slate-700">
        <div className="px-4 py-2 border-r border-slate-300">Seddler</div>
        <div className="px-4 py-2 border-r border-slate-300 text-center font-bold">Antall</div>
        <div className="px-4 py-2 text-center">Sum</div>
      </div>

      {/* Rows */}
      {SEDLER.map((s, i) => (
        <div key={s.key} className={`grid grid-cols-3 border-b border-slate-200 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
          <div className="px-4 py-2 flex items-center text-sm font-medium text-slate-700 border-r border-slate-300">
            {s.label}
          </div>
          <div className="px-2 py-1.5 border-r border-slate-300">
            <Input
              type="number"
              min="0"
              value={form[`${s.key}_antall`] || ''}
              onChange={e => updateAntall(s.key, e.target.value)}
              className="h-8 text-sm text-center border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 rounded"
              placeholder="0"
            />
          </div>
          <div className="px-2 py-1.5">
            <Input
              type="number"
              min="0"
              value={form[`${s.key}_sum`] || ''}
              onChange={e => updateSum(s.key, e.target.value)}
              className="h-8 text-sm text-center border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 rounded"
              placeholder="0"
            />
          </div>
        </div>
      ))}

      {/* Total row */}
      <div className="grid grid-cols-3 bg-slate-100 border-t border-slate-300 font-bold text-sm text-slate-800">
        <div className="px-4 py-2.5 border-r border-slate-300">Totalt</div>
        <div className="px-4 py-2.5 border-r border-slate-300" />
        <div className="px-4 py-2.5 text-center">{totalSum > 0 ? totalSum.toLocaleString('no-NO') : '—'}</div>
      </div>
    </div>
  );
}