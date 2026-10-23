import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, parseISO } from 'date-fns';
import { nb } from 'date-fns/locale';
import { Lock, LockOpen } from 'lucide-react';

function formatDay(value) {
  if (!value) return '';
  try {
    return format(parseISO(value), 'd. MMM yyyy', { locale: nb });
  } catch {
    return value;
  }
}

export default function PayrollLockCard({ locks = [], canLock, busy, onLock, onUnlock }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const active = locks.filter((lock) => !lock.unlocked_at);
  const previous = locks.filter((lock) => lock.unlocked_at);

  const submit = (event) => {
    event.preventDefault();
    if (!startDate || !endDate) return;
    onLock({ start_date: startDate, end_date: endDate, note: note.trim() });
    setNote('');
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-500" /> Låste lønnsperioder
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Vakter i en låst periode kan ikke endres, slettes eller godkjennes på nytt før perioden låses opp.
          Låsen gjelder også i databasen, ikke bare i skjermbildet.
        </p>
      </div>

      {canLock && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Fra</Label>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Til</Label>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notat</Label>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Valgfritt" />
          </div>
          <Button type="submit" disabled={busy} className="gap-2">
            <Lock className="w-4 h-4" /> Lås perioden
          </Button>
        </form>
      )}
      {!canLock && (
        <p className="text-xs text-slate-500">Bare administrator kan låse eller låse opp en lønnsperiode.</p>
      )}

      {active.length === 0 && <p className="text-sm text-slate-400">Ingen aktive låser.</p>}
      <ul className="space-y-2">
        {active.map((lock) => (
          <li key={lock.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-amber-900">{formatDay(lock.start_date)} – {formatDay(lock.end_date)}</p>
              {lock.note && <p className="text-xs text-amber-700">{lock.note}</p>}
            </div>
            {canLock && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => onUnlock(lock)}>
                <LockOpen className="w-3.5 h-3.5" /> Lås opp
              </Button>
            )}
          </li>
        ))}
      </ul>
      {previous.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tidligere låser</p>
          {previous.map((lock) => (
            <p key={lock.id} className="text-xs text-slate-400">
              {formatDay(lock.start_date)} – {formatDay(lock.end_date)} låst opp {formatDay(String(lock.unlocked_at).slice(0, 10))}
              {lock.note ? ` · ${lock.note}` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
