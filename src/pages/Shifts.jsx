import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import ShiftForm from '@/components/shifts/ShiftForm';
import { format } from 'date-fns';

function calcHours(shift) {
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  const total = (eh * 60 + em) - (sh * 60 + sm) - (shift.break_minutes || 0);
  return Math.max(0, total / 60);
}

export default function Shifts() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterWorker, setFilterWorker] = useState('all');
  const queryClient = useQueryClient();

  const { data: workers = [] } = useQuery({
    queryKey: ['workers'],
    queryFn: () => base44.entities.Worker.list(),
  });

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => base44.entities.Shift.list('-date', 200),
  });

  const createMut = useMutation({
    mutationFn: d => base44.entities.Shift.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shifts'] }); setShowForm(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Shift.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shifts'] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Shift.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });

  const handleSubmit = (data) => {
    if (editing) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  };

  const filtered = filterWorker === 'all' ? shifts : shifts.filter(s => s.worker_id === filterWorker);

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
        <Select value={filterWorker} onValueChange={setFilterWorker}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All workers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Workers</SelectItem>
            {workers.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Shift
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-slate-400">No shifts found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 text-left font-medium">Worker</th>
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-5 py-3 text-left font-medium">Time</th>
                  <th className="px-5 py-3 text-left font-medium">Break</th>
                  <th className="px-5 py-3 text-left font-medium">Hours</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(shift => {
                  const worker = workers.find(w => w.id === shift.worker_id);
                  return (
                    <tr key={shift.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-medium"
                            style={{ backgroundColor: worker?.color || '#3B82F6' }}>
                            {shift.worker_name?.charAt(0)}
                          </div>
                          <span className="font-medium text-slate-800">{shift.worker_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{shift.date ? format(new Date(shift.date + 'T00:00:00'), 'MMM d, yyyy') : ''}</td>
                      <td className="px-5 py-3 text-slate-600">{shift.start_time} – {shift.end_time}</td>
                      <td className="px-5 py-3 text-slate-500">{shift.break_minutes || 0}m</td>
                      <td className="px-5 py-3 font-medium text-slate-700">{calcHours(shift).toFixed(1)}h</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          shift.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                          shift.status === 'cancelled' ? 'bg-red-50 text-red-700' :
                          'bg-blue-50 text-blue-700'
                        }`}>
                          {shift.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(shift)}>
                            <Pencil className="w-3.5 h-3.5 text-slate-400" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (confirm('Delete shift?')) deleteMut.mutate(shift.id); }}>
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showForm || !!editing} onOpenChange={v => { if (!v) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Shift' : 'Add Shift'}</DialogTitle>
          </DialogHeader>
          <ShiftForm
            shift={editing}
            workers={workers}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}