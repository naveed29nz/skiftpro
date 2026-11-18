// @ts-nocheck
import { Button } from '@/components/ui/button';
import { TOLERANCE_MINUTES } from '@/timesheet/tolerance';

export default function ToleranceBar({
  minutes,
  onMinutes,
  onlyOutside,
  onOnlyOutside,
  withinCount = 0,
  outsideCount = 0,
  onApprove,
  disabled = false,
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5" data-testid="tolerance-bar">
      <span className="text-sm font-medium text-slate-700">Toleranse mot vakt</span>
      <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs">
        {TOLERANCE_MINUTES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onMinutes(value)}
            className={`px-2.5 py-1.5 font-medium ${minutes === value ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {value} min
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={onlyOutside}
          onChange={(event) => onOnlyOutside(event.target.checked)}
        />
        Bare avvik utenfor toleranse
      </label>
      <span className="text-xs text-slate-400">{withinCount} innenfor · {outsideCount} utenfor</span>
      <Button type="button" size="sm" className="gap-1.5" onClick={onApprove} disabled={disabled || withinCount === 0}>
        Godkjenn alle innenfor toleranse
      </Button>
    </div>
  );
}
