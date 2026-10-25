const OPTIONS = [
  { value: 'uke', label: 'Uke', hint: 'Hver uke for seg' },
  { value: 'maned', label: 'Måned', hint: 'Standard' },
];

export default function EkstrahjelpPeriodeField({ value = 'maned', onChange }) {
  const selected = value === 'uke' ? 'uke' : 'maned';
  return (
    <div className="space-y-2 sm:col-span-2" data-testid="ekstrahjelp-periode">
      <p className="text-sm font-medium text-slate-800">Periode for ekstrahjelp-avtale</p>
      <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
        {OPTIONS.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              data-testid={`ekstrahjelp-periode-${option.value}`}
              onClick={() => onChange?.(option.value)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors flex flex-col items-center ${active ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <span>{option.label}</span>
              <span className={`text-xs ${active ? 'text-slate-300' : 'text-slate-400'}`}>{option.hint}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">
        Standard er måned. Avtalt tid er stillingsprosenten, eller Timer per uke når feltet er fylt inn, ganget med ukene i kalendermåneden (antall dager delt på 7). Hele måneden sammenlignes med timene som er jobbet. En uke med flere timer enn stillingen utlignes av en kortere uke i samme måned, og da lages ingen avtale. Bare når måneden samlet går over, lages én avtale fra den 1. til den siste dagen, med timene som overstiger. Velger du Uke, vurderes hver uke for seg, slik som før.
      </p>
      <p className="text-xs text-slate-500">
        Ansatte med stilling Ekstrahjelp har ingen stillingsprosent og tas ikke med. Avtalen opprettes som utkast og sendes ikke til den ansatte. Du sender den selv fra kontraktsarkivet.
      </p>
    </div>
  );
}
