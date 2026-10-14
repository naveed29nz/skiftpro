import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { effectiveAppRole } from '@/utils/wageAccess';

export default function StampCorrections({ worker, user }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [stampId, setStampId] = useState('');
  const [stampIn, setStampIn] = useState('');
  const [stampOut, setStampOut] = useState('');
  const [message, setMessage] = useState('');
  const role = effectiveAppRole(user, worker);
  const canDecide = role === 'admin' || role === 'sub_admin' || role === 'butikksjef';

  const { data: stamps = [] } = useQuery({
    queryKey: ['stamps', 'corrections', worker?.id],
    enabled: !!worker?.id,
    queryFn: () => base44.entities.Stamp.filter({ worker_id: worker.id }, '-date', 30),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ['stamp-corrections', worker?.id, canDecide],
    enabled: !!worker?.id,
    queryFn: () => base44.entities.StampCorrection.list('-created_date', 50),
  });

  const submit = async () => {
    setMessage('');
    if (!stampId) {
      setMessage('Velg stemplingen som skal korrigeres.');
      return;
    }
    try {
      await base44.entities.StampCorrection.create({
        org_id: worker.org_id,
        worker_id: worker.id,
        stamp_id: stampId,
        reason,
        stamp_in: stampIn ? new Date(stampIn).toISOString() : null,
        stamp_out: stampOut ? new Date(stampOut).toISOString() : null,
        status: 'pending',
      });
      setReason('');
      setMessage('Forespørselen er sendt til leder.');
      queryClient.invalidateQueries({ queryKey: ['stamp-corrections'] });
    } catch (error) {
      setMessage(error?.message || 'Kunne ikke sende forespørselen.');
    }
  };

  const decide = async (id, approve) => {
    const { error } = await supabase.rpc('decide_stamp_correction', { p_id: id, p_approve: approve });
    setMessage(error ? error.message : approve ? 'Korrigeringen er godkjent.' : 'Korrigeringen er avslått.');
    queryClient.invalidateQueries({ queryKey: ['stamp-corrections'] });
    queryClient.invalidateQueries({ queryKey: ['stamps'] });
  };

  const pending = rows.filter((row) => row.status === 'pending');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <h3 className="font-semibold text-slate-800">Korrigering av stempling</h3>
      <p className="text-xs text-slate-500">Du kan ikke endre en registrert stempling selv. Be lederen godkjenne en korrigering.</p>
      <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={stampId} onChange={(event) => setStampId(event.target.value)}>
        <option value="">Velg stempling</option>
        {stamps.map((stamp) => (
          <option key={stamp.id} value={stamp.id}>{stamp.date}</option>
        ))}
      </select>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input type="datetime-local" value={stampIn} onChange={(event) => setStampIn(event.target.value)} />
        <Input type="datetime-local" value={stampOut} onChange={(event) => setStampOut(event.target.value)} />
      </div>
      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Grunn til endringen" />
      <Button type="button" size="sm" onClick={submit} disabled={!worker}>Send forespørsel</Button>
      {pending.map((row) => (
        <div key={row.id} className="text-xs border border-slate-100 rounded-lg p-2 flex flex-wrap items-center gap-2">
          <span className="text-slate-600">{row.reason || 'Korrigering'}</span>
          {canDecide && row.worker_id !== worker?.id && (
            <>
              <Button type="button" size="sm" onClick={() => decide(row.id, true)}>Godkjenn</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => decide(row.id, false)}>Avslå</Button>
            </>
          )}
        </div>
      ))}
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  );
}
