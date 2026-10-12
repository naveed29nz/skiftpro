import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';

export default function Holidays() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', date: '', pay_multiplier: 2.0, extra_type: 'none', extra_amount: 0 });
  const queryClient = useQueryClient();

  const { data: holidays = [] } = useQuery({
    queryKey: ['holidays'],
    queryFn: () => base44.entities.Holiday.list('date'),
  });

  const createMut = useMutation({
    mutationFn: d => base44.entities.Holiday.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['holidays'] }); setShowForm(false); setForm({ name: '', date: '', pay_multiplier: 2.0, extra_type: 'none', extra_amount: 0 }); },
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Holiday.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['holidays'] }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMut.mutate({ ...form, pay_multiplier: parseFloat(form.pay_multiplier), extra_amount: parseFloat(form.extra_amount) || 0 });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-slate-500">Public holidays get extra pay. Sundays use the Sunday multiplier set in Settings.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Holiday
        </Button>
      </div>

      {/* Sunday note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <CalendarDays className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">Sundays are automatically detected</p>
          <p className="text-xs text-amber-600 mt-0.5">Sunday pay multiplier is configured in Settings. No need to add them here.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {holidays.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">No holidays added yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 text-left font-medium">Holiday</th>
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-5 py-3 text-left font-medium">Day</th>
                  <th className="px-5 py-3 text-right font-medium">Pay Multiplier</th>
                  <th className="px-5 py-3 text-right font-medium">Extra Comp.</th>
                  <th className="px-5 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.map(h => {
                  const d = new Date(h.date + 'T00:00:00');
                  return (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{h.name}</td>
                      <td className="px-5 py-3 text-slate-600">{format(d, 'MMM d, yyyy')}</td>
                      <td className="px-5 py-3 text-slate-500">{format(d, 'EEEE')}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold text-xs">
                          ×{h.pay_multiplier}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {h.extra_type && h.extra_type !== 'none' && h.extra_amount > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold text-xs">
                            {h.extra_type === 'percentage' ? `+${h.extra_amount}%` : h.extra_type === 'fixed_per_shift' ? `+${h.extra_amount} kr/vakt` : `+${h.extra_amount} kr/dag`}
                          </span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => { if (confirm('Delete holiday?')) deleteMut.mutate(h.id); }}>
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={v => { if (!v) setShowForm(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Holiday</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Holiday Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Christmas Day" required />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Pay Multiplier *</Label>
              <Input type="number" step="0.1" min="1" value={form.pay_multiplier} onChange={e => setForm({ ...form, pay_multiplier: e.target.value })} placeholder="2.0" required />
              <p className="text-xs text-slate-400">e.g. 2.0 = double pay, 1.5 = 50% extra</p>
            </div>
            <div className="space-y-1.5">
              <Label>Ekstra tillegg (valgfritt)</Label>
              <Select value={form.extra_type} onValueChange={v => setForm({ ...form, extra_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen ekstra tillegg</SelectItem>
                  <SelectItem value="percentage">Prosenttillegg (%)</SelectItem>
                  <SelectItem value="fixed_per_shift">Fast beløp per vakt (kr)</SelectItem>
                  <SelectItem value="fixed_per_day">Fast beløp per dag (kr)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.extra_type !== 'none' && (
              <div className="space-y-1.5">
                <Label>{form.extra_type === 'percentage' ? 'Prosent (%)' : 'Beløp (kr)'}</Label>
                <Input type="number" step="0.01" min="0" value={form.extra_amount} onChange={e => setForm({ ...form, extra_amount: e.target.value })} placeholder={form.extra_type === 'percentage' ? '10' : '200'} />
                <p className="text-xs text-slate-400">{form.extra_type === 'percentage' ? 'f.eks. 10 = 10% tillegg på totallønn' : 'Fast ekstrabeløp i kr'}</p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit">Add Holiday</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}