import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Check, RepeatIcon, ToggleLeft, ToggleRight } from 'lucide-react';
import { useOrg } from '@/hooks/useOrg';

const DAYS = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
const RECURRENCE_LABELS = { daily: 'Daglig', weekly: 'Ukentlig', biweekly: 'Annenhver uke', monthly: 'Månedlig' };

const emptyForm = {
  title: '', description: '', team: 'team1', assigned_worker_ids: [], assigned_worker_names: [],
  priority: 'normal', recurrence: 'weekly', day_of_week: 1, is_active: true,
};

function RecurringTaskForm({ workers, teamNames, onSubmit, onCancel, orgId }) {
  const [form, setForm] = useState({ ...emptyForm, team: Object.keys(teamNames)[0] || 'team1' });

  const teamWorkers = workers.filter(w =>
    (w.teams || ['team1']).includes(form.team) && w.status !== 'inactive'
  );

  const toggleWorker = (id) => {
    if (id === 'all') {
      setForm(f => ({ ...f, assigned_worker_ids: f.assigned_worker_ids.includes('all') ? [] : ['all'], assigned_worker_names: [] }));
      return;
    }
    setForm(f => {
      const ids = f.assigned_worker_ids.filter(i => i !== 'all');
      const names = ids.includes(id)
        ? workers.filter(w => ids.filter(i => i !== id).includes(w.id)).map(w => w.name)
        : workers.filter(w => [...ids, id].includes(w.id)).map(w => w.name);
      const newIds = ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id];
      return { ...f, assigned_worker_ids: newIds, assigned_worker_names: names };
    });
  };

  const allSelected = form.assigned_worker_ids.includes('all');
  const selectionLabel = allSelected ? 'Alle i avdelingen'
    : form.assigned_worker_ids.length === 0 ? 'Velg ansatt(e)...'
    : form.assigned_worker_ids.length === 1 ? (workers.find(w => w.id === form.assigned_worker_ids[0])?.name || '1 valgt')
    : `${form.assigned_worker_ids.length} ansatte valgt`;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, org_id: orgId });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label className="text-xs">Tittel *</Label>
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="f.eks. Avisretur" required className="h-8 text-sm" />
      </div>
      <div>
        <Label className="text-xs">Beskrivelse</Label>
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Valgfri beskrivelse" className="h-8 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Avdeling</Label>
          <Select value={form.team} onValueChange={v => setForm(f => ({ ...f, team: v, assigned_worker_ids: [], assigned_worker_names: [] }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(teamNames).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Prioritet</Label>
          <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">Høy</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Lav</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Gjentakelse</Label>
          <Select value={form.recurrence} onValueChange={v => setForm(f => ({ ...f, recurrence: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daglig</SelectItem>
              <SelectItem value="weekly">Ukentlig</SelectItem>
              <SelectItem value="biweekly">Annenhver uke</SelectItem>
              <SelectItem value="monthly">Månedlig (1. i mnd)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(form.recurrence === 'weekly' || form.recurrence === 'biweekly') && (
          <div>
            <Label className="text-xs">Ukedag</Label>
            <Select value={String(form.day_of_week)} onValueChange={v => setForm(f => ({ ...f, day_of_week: Number(v) }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs">Tildel ansatt(e)</Label>
        <div className="border border-slate-200 rounded-md bg-white mt-1">
          <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-100">{selectionLabel}</div>
          <div className="max-h-32 overflow-y-auto divide-y divide-slate-100">
            <button type="button" onClick={() => toggleWorker('all')}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 ${allSelected ? 'text-blue-600 font-medium' : 'text-slate-700'}`}>
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${allSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                {allSelected && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              Alle i avdelingen
            </button>
            {teamWorkers.map(w => {
              const checked = form.assigned_worker_ids.includes(w.id);
              return (
                <button key={w.id} type="button" onClick={() => toggleWorker(w.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 ${checked ? 'text-blue-600 font-medium' : 'text-slate-700'}`}>
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  {w.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
        <Button type="submit" size="sm">Legg til fast oppgave</Button>
      </div>
    </form>
  );
}

export default function RecurringTasksModal({ open, onClose, workers, teamNames }) {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: recurringTasks = [] } = useQuery({
    queryKey: ['recurring-tasks', orgId],
    queryFn: () => orgId ? base44.entities.RecurringTask.filter({ org_id: orgId }) : base44.entities.RecurringTask.list(),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: d => base44.entities.RecurringTask.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recurring-tasks'] }); setShowForm(false); },
  });

  const toggleMut = useMutation({
    mutationFn: rt => base44.entities.RecurringTask.update(rt.id, { is_active: !rt.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring-tasks'] }),
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.RecurringTask.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring-tasks'] }),
  });

  const getScheduleLabel = (rt) => {
    const rec = RECURRENCE_LABELS[rt.recurrence] || rt.recurrence;
    if (rt.recurrence === 'weekly' || rt.recurrence === 'biweekly') {
      return `${rec} – ${DAYS[rt.day_of_week ?? 1]}`;
    }
    return rec;
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RepeatIcon className="w-4 h-4 text-blue-600" /> Faste oppgaver
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {recurringTasks.length === 0 && !showForm && (
            <p className="text-sm text-slate-400 text-center py-6">Ingen faste oppgaver ennå</p>
          )}
          {recurringTasks.map(rt => (
            <div key={rt.id} className={`border rounded-lg p-3 flex items-start justify-between gap-2 ${rt.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
              <div className="min-w-0">
                <p className="font-medium text-sm text-slate-800">{rt.title}</p>
                {rt.description && <p className="text-xs text-slate-500 mt-0.5">{rt.description}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                    {getScheduleLabel(rt)}
                  </span>
                  {rt.team && teamNames[rt.team] && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{teamNames[rt.team]}</span>
                  )}
                  {rt.assigned_worker_ids?.includes('all')
                    ? <span className="text-xs text-slate-400">Alle i avd.</span>
                    : rt.assigned_worker_names?.length > 0 && (
                      <span className="text-xs text-slate-400">{rt.assigned_worker_names.join(', ')}</span>
                    )
                  }
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleMut.mutate(rt)} className="text-slate-400 hover:text-blue-500 transition-colors" title={rt.is_active ? 'Deaktiver' : 'Aktiver'}>
                  {rt.is_active ? <ToggleRight className="w-5 h-5 text-blue-500" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => { if (confirm('Slett fast oppgave?')) deleteMut.mutate(rt.id); }} className="text-slate-300 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {showForm ? (
            <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-4 mt-2">
              <RecurringTaskForm
                workers={workers}
                teamNames={teamNames}
                orgId={orgId}
                onSubmit={data => createMut.mutate(data)}
                onCancel={() => setShowForm(false)}
              />
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs mt-2" onClick={() => setShowForm(true)}>
              <Plus className="w-3.5 h-3.5" /> Ny fast oppgave
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}