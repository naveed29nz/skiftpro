import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { flushNotifications } from '@/utils/notify';

const STATUS_LABELS = {
  pending: { label: 'Venter', color: 'bg-yellow-100 text-yellow-700' },
  accepted: { label: 'Akseptert – venter admin', color: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Godkjent', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Avslått', color: 'bg-red-100 text-red-700' },
};

export default function ShiftSwapPanel({ worker, myShifts, workers, isAdmin, allShifts }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedMyShift, setSelectedMyShift] = useState('');
  const [selectedTargetWorker, setSelectedTargetWorker] = useState('');
  const [selectedTargetShift, setSelectedTargetShift] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: swaps = [] } = useQuery({
    queryKey: ['shift-swaps'],
    queryFn: () => base44.entities.ShiftSwap.list('-created_date', 100),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['shift-swaps'] });
    flushNotifications();
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const myUpcoming = myShifts.filter(s => s.date >= today && s.status !== 'cancelled');

  const targetWorkers = workers.filter(w => w.id !== worker.id && w.status !== 'inactive');
  const targetWorkerShifts = selectedTargetWorker
    ? allShifts.filter(s => s.worker_id === selectedTargetWorker && s.date >= today && s.status !== 'cancelled')
    : [];

  const mySwaps = swaps.filter(s => s.requester_worker_id === worker.id || s.target_worker_id === worker.id);
  const openSwaps = swaps.filter(s => s.status === 'pending' && s.requester_worker_id !== worker.id && !s.target_worker_id);
  const adminPending = swaps.filter(s => s.status === 'accepted');

  const handleRequest = async () => {
    if (!selectedMyShift) return;
    setLoading(true);
    const myShift = myUpcoming.find(s => s.id === selectedMyShift);
    const targetWorkerObj = workers.find(w => w.id === selectedTargetWorker);
    const targetShift = targetWorkerShifts.find(s => s.id === selectedTargetShift);

    await base44.entities.ShiftSwap.create({
      requester_worker_id: worker.id,
      requester_worker_name: worker.name,
      requester_shift_id: myShift.id,
      requester_shift_date: myShift.date,
      requester_shift_start: myShift.start_time,
      requester_shift_end: myShift.end_time,
      target_worker_id: selectedTargetWorker || '',
      target_worker_name: targetWorkerObj?.name || '',
      target_shift_id: targetShift?.id || '',
      target_shift_date: targetShift?.date || '',
      target_shift_start: targetShift?.start_time || '',
      target_shift_end: targetShift?.end_time || '',
      notes,
      status: 'pending',
      team: (worker.teams || ['team1'])[0],
    });

    setShowForm(false);
    setSelectedMyShift(''); setSelectedTargetWorker(''); setSelectedTargetShift(''); setNotes('');
    setLoading(false);
    refresh();
  };

  const handleAccept = async (swap) => {
    setLoading(true);
    await base44.entities.ShiftSwap.update(swap.id, { status: 'accepted' });
    setLoading(false);
    refresh();
  };

  const handleAdminApprove = async (swap) => {
    setLoading(true);
    // Swap the workers on both shifts
    const requesterWorker = workers.find(w => w.id === swap.requester_worker_id);
    const targetWorkerObj = workers.find(w => w.id === swap.target_worker_id);
    if (swap.requester_shift_id && swap.target_shift_id) {
      await Promise.all([
        base44.entities.Shift.update(swap.requester_shift_id, { worker_id: swap.target_worker_id, worker_name: targetWorkerObj?.name || '' }),
        base44.entities.Shift.update(swap.target_shift_id, { worker_id: swap.requester_worker_id, worker_name: requesterWorker?.name || '' }),
      ]);
    }
    await base44.entities.ShiftSwap.update(swap.id, { status: 'approved' });
    setLoading(false);
    refresh();
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
  };

  const handleReject = async (swap) => {
    setLoading(true);
    await base44.entities.ShiftSwap.update(swap.id, { status: 'rejected' });
    setLoading(false);
    refresh();
  };

  const handleCancel = async (swap) => {
    setLoading(true);
    await base44.entities.ShiftSwap.delete(swap.id);
    setLoading(false);
    refresh();
  };

  const ShiftSwapCard = ({ swap, showActions }) => {
    const status = STATUS_LABELS[swap.status] || STATUS_LABELS.pending;
    const isRequester = swap.requester_worker_id === worker.id;
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{swap.requester_worker_name}</span>
            <ArrowLeftRight className="w-4 h-4 text-slate-400" />
            <span className="font-semibold text-slate-800 text-sm">{swap.target_worker_name || 'Åpen forespørsel'}</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${status.color}`}>{status.label}</span>
        </div>
        <div className="flex gap-4 text-xs text-slate-500 flex-wrap">
          <div>
            <span className="font-medium text-slate-700">{swap.requester_worker_name}:</span>{' '}
            {swap.requester_shift_date} {swap.requester_shift_start}–{swap.requester_shift_end}
          </div>
          {swap.target_shift_date && (
            <div>
              <span className="font-medium text-slate-700">{swap.target_worker_name}:</span>{' '}
              {swap.target_shift_date} {swap.target_shift_start}–{swap.target_shift_end}
            </div>
          )}
        </div>
        {swap.notes && <p className="text-xs text-slate-400 italic">"{swap.notes}"</p>}
        {showActions && (
          <div className="flex gap-2 pt-1">
            {/* Target worker can accept */}
            {swap.status === 'pending' && swap.target_worker_id === worker.id && (
              <>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleAccept(swap)} disabled={loading}>
                  <CheckCircle className="w-3 h-3" /> Aksepter
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-500" onClick={() => handleReject(swap)} disabled={loading}>
                  <XCircle className="w-3 h-3" /> Avslå
                </Button>
              </>
            )}
            {/* Admin approve/reject accepted swaps */}
            {isAdmin && swap.status === 'accepted' && (
              <>
                <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAdminApprove(swap)} disabled={loading}>
                  <CheckCircle className="w-3 h-3" /> Godkjenn & bytt
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-500" onClick={() => handleReject(swap)} disabled={loading}>
                  <XCircle className="w-3 h-3" /> Avslå
                </Button>
              </>
            )}
            {/* Requester can cancel their pending request */}
            {swap.status === 'pending' && isRequester && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-500" onClick={() => handleCancel(swap)} disabled={loading}>
                <XCircle className="w-3 h-3" /> Trekk tilbake
              </Button>
            )}
            {/* Anyone can accept open request */}
            {swap.status === 'pending' && !swap.target_worker_id && !isRequester && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleAccept(swap)} disabled={loading}>
                <CheckCircle className="w-3 h-3" /> Jeg tar denne vakten
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Admin section */}
      {isAdmin && adminPending.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" /> Venter på admin-godkjenning ({adminPending.length})
          </h3>
          {adminPending.map(swap => <ShiftSwapCard key={swap.id} swap={swap} showActions />)}
        </div>
      )}

      {/* Open swap requests (anyone can accept) */}
      {openSwaps.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-800">Åpne bytteforespørsler</h3>
          {openSwaps.map(swap => <ShiftSwapCard key={swap.id} swap={swap} showActions />)}
        </div>
      )}

      {/* My swaps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Mine bytteforespørsler</h3>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowForm(v => !v)}>
            <Plus className="w-3.5 h-3.5" /> Ny forespørsel
          </Button>
        </div>

        {/* New request form */}
        {showForm && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-slate-700">Be om vaktbytte</p>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">Min vakt jeg vil bytte</label>
              <Select value={selectedMyShift} onValueChange={setSelectedMyShift}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Velg din vakt" /></SelectTrigger>
                <SelectContent>
                  {myUpcoming.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.date} {s.start_time}–{s.end_time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">Kollegas vakt (valgfritt – la stå tom for åpen forespørsel)</label>
              <Select value={selectedTargetWorker} onValueChange={v => { setSelectedTargetWorker(v); setSelectedTargetShift(''); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Velg kollega (valgfritt)" /></SelectTrigger>
                <SelectContent>
                  {targetWorkers.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedTargetWorker && (
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Kollegas vakt å bytte mot</label>
                <Select value={selectedTargetShift} onValueChange={setSelectedTargetShift}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Velg vakt" /></SelectTrigger>
                  <SelectContent>
                    {targetWorkerShifts.map(s => <SelectItem key={s.id} value={s.id}>{s.date} {s.start_time}–{s.end_time}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs text-slate-500">Melding (valgfritt)</label>
              <input
                className="w-full h-8 px-3 text-xs rounded-md border border-input bg-background"
                placeholder="Grunn til bytte..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 text-xs" onClick={handleRequest} disabled={!selectedMyShift || loading}>
                {loading ? 'Sender...' : 'Send forespørsel'}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowForm(false)}>Avbryt</Button>
            </div>
          </div>
        )}

        {mySwaps.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Ingen bytteforespørsler ennå</div>
        ) : (
          mySwaps.map(swap => <ShiftSwapCard key={swap.id} swap={swap} showActions />)
        )}
      </div>
    </div>
  );
}