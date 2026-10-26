import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isFullDayAbsence, shiftLabelChoices } from '@/utils/shiftLabels';

export default function ShiftForm({ shift, workers, onSubmit, onCancel }) {
  const initialLabel = shift?.shift_label || 'none';
  const [form, setForm] = useState({
    worker_id: shift?.worker_id || '',
    date: shift?.date || '',
    start_time: shift?.start_time || '09:00',
    end_time: shift?.end_time || '17:00',
    break_minutes: shift?.break_minutes ?? 0,
    notes: shift?.notes || '',
    status: shift?.status || 'scheduled',
    shift_label: initialLabel,
    all_day: Boolean(shift?.all_day) || initialLabel === 'ferie',
  });

  const selectedWorker = workers.find(w => w.id === form.worker_id);
  const wholeDay = isFullDayAbsence(form.shift_label) && form.all_day;

  const setLabel = (value) => {
    const wholeDay = value === 'ferie';
    setForm((current) => ({
      ...current,
      shift_label: value,
      all_day: wholeDay,
      start_time: wholeDay ? '00:00' : (current.start_time === '00:00' ? '09:00' : current.start_time),
      end_time: wholeDay ? '00:00' : (current.end_time === '00:00' ? '17:00' : current.end_time),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const label = form.shift_label === 'none' ? '' : form.shift_label;
    const allDay = Boolean(form.all_day) && isFullDayAbsence(label);
    onSubmit({
      ...form,
      worker_name: selectedWorker?.name || '',
      shift_label: label,
      all_day: allDay,
      break_manual: true,
      break_minutes: allDay ? 0 : (parseInt(form.break_minutes, 10) || 0),
      start_time: allDay ? '00:00' : form.start_time,
      end_time: allDay ? '00:00' : form.end_time,
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
          <Label>Type</Label>
          <Select value={form.shift_label || 'none'} onValueChange={setLabel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {shiftLabelChoices(form.shift_label, { noneLabel: 'Vanlig vakt' }).map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        {isFullDayAbsence(form.shift_label) && (
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={Boolean(form.all_day)}
              onChange={(event) => setForm({ ...form, all_day: event.target.checked })}
            />
            Hele dagen uten klokkeslett
          </label>
        )}
        <div className="space-y-1.5">
          <Label>Start *</Label>
          <Input type="time" value={wholeDay ? '00:00' : form.start_time} disabled={wholeDay} onChange={e => setForm({ ...form, start_time: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Slutt *</Label>
          <Input type="time" value={wholeDay ? '00:00' : form.end_time} disabled={wholeDay} onChange={e => setForm({ ...form, end_time: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Pause (minutter)</Label>
          <Input
            type="number"
            min="0"
            value={wholeDay ? 0 : form.break_minutes}
            disabled={wholeDay}
            onChange={e => setForm({ ...form, break_minutes: e.target.value })}
          />
          <p className="text-xs text-slate-400">Pausen lagres som manuell overstyring.</p>
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
