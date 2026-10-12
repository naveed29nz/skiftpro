import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { addWeeks, format, addDays } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Copy } from 'lucide-react';

const OPTIONS = [
  { label: '1 week ahead', weeks: 1 },
  { label: '2 weeks ahead', weeks: 2 },
  { label: '3 weeks ahead', weeks: 3 },
  { label: '4 weeks ahead', weeks: 4 },
];

export default function CopyWeekModal({ weekStart, weekShifts, currentTeam = 'all', onClose, onRefresh }) {
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const toggle = (weeks) => setSelected(prev =>
    prev.includes(weeks) ? prev.filter(w => w !== weeks) : [...prev, weeks]
  );

  const handleCopy = async (asDraft = false) => {
    setLoading(true);
    for (const weeksAhead of selected) {
      const newShifts = weekShifts.map(shift => {
        const origDate = new Date(shift.date + 'T00:00:00');
        const newDate = addWeeks(origDate, weeksAhead);
        // Lås kopierte vakter til avdelingen de kopieres fra ("all" bevarer
        // opprinnelig tag). Sørger for at en vakt kopiert i en avdeling blir i
        // samme avdeling fremover, og at legacy/untagged vakter får fast team.
        const resolvedTeam = currentTeam !== 'all' ? currentTeam : (shift.team || '');
        return {
          org_id: shift.org_id,
          worker_id: shift.worker_id,
          worker_name: shift.worker_name,
          date: format(newDate, 'yyyy-MM-dd'),
          start_time: shift.start_time,
          end_time: shift.end_time,
          break_minutes: shift.break_minutes || 0,
          notes: shift.notes || '',
          shift_label: shift.shift_label || '',
          status: 'scheduled',
          published: asDraft ? false : true,
          team: resolvedTeam,
        };
      });
      await base44.entities.Shift.bulkCreate(newShifts);
    }
    setLoading(false);
    setDone(true);
    onRefresh();
  };

  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-slate-500" />
            Copy Week
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-emerald-600 font-medium">✓ Shifts copied successfully!</p>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              Copy all shifts from <span className="font-medium text-slate-700">{weekLabel}</span> to:
            </p>
            <div className="space-y-2">
              {OPTIONS.map(opt => {
                const targetStart = addWeeks(weekStart, opt.weeks);
                const targetLabel = `${format(targetStart, 'MMM d')} – ${format(addDays(targetStart, 6), 'MMM d')}`;
                const isSelected = selected.includes(opt.weeks);
                return (
                  <button key={opt.weeks}
                    onClick={() => toggle(opt.weeks)}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                      isSelected
                        ? 'border-blue-400 bg-blue-50 text-blue-800'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-slate-400 ml-2">({targetLabel})</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => handleCopy(false)} disabled={selected.length === 0 || loading || weekShifts.length === 0}>
                  {loading ? 'Kopierer...' : 'Kopier uke'}
                </Button>
                <Button variant="outline" className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => handleCopy(true)} disabled={selected.length === 0 || loading || weekShifts.length === 0}>
                  Kopier som utkast
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400">Avbryt</Button>
            </div>
            {weekShifts.length === 0 && (
              <p className="text-xs text-slate-400 text-center">No shifts in the current week to copy.</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}