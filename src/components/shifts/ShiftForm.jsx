import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function ShiftForm({ shift, workers, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    worker_id: shift?.worker_id || '',
    date: shift?.date || '',
    start_time: shift?.start_time || '09:00',
    end_time: shift?.end_time || '17:00',
    break_minutes: shift?.break_minutes || 0,
    notes: shift?.notes || '',
    status: shift?.status || 'scheduled',
  });

  const selectedWorker = workers.find(w => w.id === form.worker_id);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      worker_name: selectedWorker?.name || '',
      break_minutes: parseInt(form.break_minutes) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Ansatt *</Label>
          <Select value={form.worker_id} onValueChange={v => setForm({ ...form, worker_id: v })}>
            <SelectTrigger><SelectValue placeholder="Velg ansatt" /></SelectTrigger>
            <SelectContent>
              {workers.filter(w => w.status === 'active').map(w => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Dato *</Label>
          <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">Planlagt</SelectItem>
              <SelectItem value="completed">Fullført</SelectItem>
              <SelectItem value="cancelled">Avlyst</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Start *</Label>
          <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Slutt *</Label>
          <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Pause (minutter)</Label>
          <Input type="number" min="0" value={form.break_minutes} onChange={e => setForm({ ...form, break_minutes: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notat</Label>
        <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Valgfritt notat..." rows={2} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Avbryt</Button>
        <Button type="submit">{shift ? 'Oppdater' : 'Legg til vakt'}</Button>
      </div>
    </form>
  );
}