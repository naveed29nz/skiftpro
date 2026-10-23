import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import { ArrowRightLeft, Copy, Pencil, Trash2 } from 'lucide-react';

function SheetButton({ icon: Icon, children, onClick, danger, disabled, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-12 w-full items-center gap-3 rounded-xl border px-4 text-left text-base font-medium disabled:opacity-50 ${
        danger
          ? 'border-red-200 text-red-600 active:bg-red-50'
          : 'border-slate-200 text-slate-800 active:bg-slate-50'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {children}
    </button>
  );
}

export default function ShiftTouchSheet({ shift, worker, day, busy, locked = false, onClose, onMove, onCopy, onEdit, onDelete }) {
  if (!shift || !day) return null;
  const dayLabel = format(day, 'EEEE d. MMM', { locale: nb });

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-labelledby="shift-touch-sheet-title" data-testid="shift-touch-sheet">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Lukk" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white px-4 pt-3 shadow-2xl" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
        <p id="shift-touch-sheet-title" className="text-base font-semibold text-slate-900">{worker?.name}</p>
        <p className="text-sm text-slate-500">{dayLabel} · {shift.all_day ? 'Hele dagen' : `${shift.start_time}–${shift.end_time}`}</p>
        {locked && <p className="mt-2 text-sm text-amber-700">Lønnsperioden er låst.</p>}
        <div className="mt-4 grid gap-2">
          <SheetButton testId="flytt-vakt" icon={ArrowRightLeft} disabled={locked} onClick={onMove}>Flytt vakt</SheetButton>
          <SheetButton testId="kopier-vakt" icon={Copy} disabled={locked} onClick={onCopy}>Kopier vakt</SheetButton>
          <SheetButton testId="rediger-vakt" icon={Pencil} disabled={locked} onClick={onEdit}>Rediger</SheetButton>
          <SheetButton testId="slett-vakt" icon={Trash2} danger disabled={busy || locked} onClick={onDelete}>Slett</SheetButton>
          <button type="button" className="mt-1 h-11 text-sm font-medium text-slate-500" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
