import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, CheckCircle2, Circle, ImageIcon, X, AlertCircle, Calendar, Check, RepeatIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useOrg } from '@/hooks/useOrg';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';
import { useTeamNames } from '@/hooks/useTeamNames';
import RecurringTasksModal from '@/components/tasks/RecurringTasksModal';
import { SignedUploadImage } from '@/components/uploads/SignedUploadImage';

const PRIORITY_STYLES = {
  high:   'bg-red-100 text-red-700 border border-red-200',
  normal: 'bg-slate-100 text-slate-600 border border-slate-200',
  low:    'bg-green-100 text-green-700 border border-green-200',
};
const PRIORITY_LABELS = { high: 'Høy', normal: 'Normal', low: 'Lav' };

function TaskForm({ workers, teamNames, onSubmit, onCancel }) {
  const [form, setForm] = useState({ title: '', description: '', assigned_worker_ids: [], team: 'team1', due_date: '', priority: 'normal', image_url: '' });
  const [uploading, setUploading] = useState(false);

  const teamWorkers = workers.filter(w => {
    if (!form.team) return true;
    return (w.teams || ['team1']).includes(form.team);
  }).filter(w => w.status !== 'inactive');

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, image_url: file_url }));
    setUploading(false);
  };

  const toggleWorker = (id) => {
    if (id === 'all') {
      setForm(f => ({ ...f, assigned_worker_ids: f.assigned_worker_ids.includes('all') ? [] : ['all'] }));
      return;
    }
    setForm(f => {
      const ids = f.assigned_worker_ids.filter(i => i !== 'all');
      return { ...f, assigned_worker_ids: ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id] };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const ids = form.assigned_worker_ids;
    const names = ids.includes('all') ? [] : workers.filter(w => ids.includes(w.id)).map(w => w.name);
    // Legacy compat: set assigned_worker_id to 'all' or first id
    const legacy_id = ids.includes('all') ? 'all' : (ids[0] || '');
    const legacy_name = ids.includes('all') ? '' : (names[0] || '');
    onSubmit({
      ...form,
      assigned_worker_id: legacy_id,
      assigned_worker_name: legacy_name,
      assigned_worker_ids: ids,
      assigned_worker_names: names,
    });
  };

  const selectedIds = form.assigned_worker_ids;
  const allSelected = selectedIds.includes('all');
  const selectionLabel = allSelected
    ? 'Alle i avdelingen'
    : selectedIds.length === 0
      ? 'Velg ansatt(e)...'
      : selectedIds.length === 1
        ? workers.find(w => w.id === selectedIds[0])?.name || '1 valgt'
        : `${selectedIds.length} ansatte valgt`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Tittel *</Label>
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Oppgavetittel" required />
      </div>
      <div className="space-y-1.5">
        <Label>Beskrivelse</Label>
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Valgfri beskrivelse" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Avdeling</Label>
          <Select value={form.team} onValueChange={v => setForm(f => ({ ...f, team: v, assigned_worker_ids: [] }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(teamNames).map(([key, name]) => (
                <SelectItem key={key} value={key}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Prioritet</Label>
          <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">Høy</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Lav</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tildel ansatt(e)</Label>
          <div className="border border-slate-200 rounded-md bg-white">
            <div className="px-3 py-2 text-sm text-slate-500 border-b border-slate-100 truncate">{selectionLabel}</div>
            <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
              <button
                type="button"
                onClick={() => toggleWorker('all')}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${allSelected ? 'text-blue-600 font-medium' : 'text-slate-700'}`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${allSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                  {allSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                Alle i avdelingen
              </button>
              {teamWorkers.map(w => {
                const checked = selectedIds.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => toggleWorker(w.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${checked ? 'text-blue-600 font-medium' : 'text-slate-700'}`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {w.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Frist</Label>
          <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Bilde (valgfritt)</Label>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <ImageIcon className="w-4 h-4" />
            {uploading ? 'Laster opp...' : form.image_url ? 'Bytt bilde' : 'Last opp bilde'}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
          </label>
          {form.image_url && (
            <div className="relative">
              <SignedUploadImage stored={form.image_url} alt="" className="h-10 w-10 rounded object-cover border border-slate-200" />
              <button type="button" onClick={() => setForm(f => ({ ...f, image_url: '' }))} className="absolute -top-1 -right-1 bg-white rounded-full border border-slate-200 p-0.5">
                <X className="w-3 h-3 text-slate-500" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Avbryt</Button>
        <Button type="submit">Opprett oppgave</Button>
      </div>
    </form>
  );
}

function TaskCard({ task, workers, isAdmin, currentWorkerId, onToggle, onDelete }) {
  const [showImage, setShowImage] = useState(false);
  const isCompleted = task.status === 'completed';
  const isAssignedToMe = task.assigned_worker_id === currentWorkerId;

  return (
    <div className={`bg-white rounded-xl border p-4 space-y-2 transition-opacity ${isCompleted ? 'opacity-60 border-slate-100' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <button onClick={() => onToggle(task)} className="mt-0.5 shrink-0">
            {isCompleted
              ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              : <Circle className="w-5 h-5 text-slate-300 hover:text-blue-400 transition-colors" />}
          </button>
          <div className="min-w-0">
            <p className={`font-medium text-sm ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title}</p>
            {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[task.priority || 'normal']}`}>
            {PRIORITY_LABELS[task.priority || 'normal']}
          </span>
          {isAdmin && (
            <button onClick={() => onDelete(task.id)} className="text-slate-300 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-400 pl-7 flex-wrap">
        {(() => {
          const ids = task.assigned_worker_ids?.length ? task.assigned_worker_ids : (task.assigned_worker_id ? [task.assigned_worker_id] : []);
          const names = task.assigned_worker_names?.length ? task.assigned_worker_names : (task.assigned_worker_name ? [task.assigned_worker_name] : []);
          if (ids.includes('all')) return <span className="text-slate-500">Alle i avdelingen</span>;
          if (names.length === 0) return null;
          return names.map((name, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">{name.charAt(0)}</span>
              {name}
              {ids[i] === currentWorkerId && <span className="text-blue-500 font-medium">(deg)</span>}
            </span>
          ));
        })()}
        {task.due_date && (
          <span className={`flex items-center gap-1 ${task.due_date < format(new Date(), 'yyyy-MM-dd') && !isCompleted ? 'text-red-500' : ''}`}>
            <Calendar className="w-3 h-3" /> {task.due_date}
          </span>
        )}
        {task.completed_at && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="w-3 h-3" />
            {(() => {
              const completedBy = workers.find(w => w.id === task.completed_by_id);
              return completedBy ? `${completedBy.name} · ${task.completed_at.split('T')[0]}` : task.completed_at.split('T')[0];
            })()}
          </span>
        )}
      </div>

      {task.image_url && (
        <div className="pl-7">
          <SignedUploadImage
            stored={task.image_url}
            alt="Vedlegg"
            className="max-h-32 rounded-lg border border-slate-200 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setShowImage(true)}
          />
        </div>
      )}

      {showImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowImage(false)}>
          <SignedUploadImage stored={task.image_url} alt="" className="max-w-[90vw] max-h-[90vh] rounded-xl" />
        </div>
      )}
    </div>
  );
}

export default function Tasks() {
  const { orgId } = useOrg();
  const { user, worker } = useCurrentWorker();
  const isAdmin = user?.role === 'admin' || worker?.role === 'admin' || worker?.role === 'sub_admin' || worker?.role === 'butikksjef';
  const currentWorkerId = worker?.id;
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterStatus, setFilterStatus] = useState('open');

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', orgId],
    queryFn: () => orgId ? base44.entities.Task.filter({ org_id: orgId }) : base44.entities.Task.list('-created_date', 200),
  });

  const { data: workers = [] } = useQuery({ queryKey: ['workers'], queryFn: () => base44.entities.Worker.list() });
  const teamNames = useTeamNames();

  const createMut = useMutation({
    mutationFn: d => base44.entities.Task.create({ ...d, org_id: orgId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); setShowForm(false); },
  });

  const toggleMut = useMutation({
    mutationFn: (task) => base44.entities.Task.update(task.id, {
      status: task.status === 'completed' ? 'open' : 'completed',
      completed_by_id: task.status !== 'completed' ? currentWorkerId : null,
      completed_at: task.status !== 'completed' ? new Date().toISOString() : null,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Task.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  // Workers see only their own tasks or tasks assigned to all in their team
  const myTeams = worker?.teams || ['team1'];
  const filteredTasks = tasks.filter(t => {
    if (!isAdmin) {
      const taskTeam = t.team || 'team1';
      if (!myTeams.includes(taskTeam)) return false;
      const ids = t.assigned_worker_ids?.length ? t.assigned_worker_ids : (t.assigned_worker_id ? [t.assigned_worker_id] : []);
      if (ids.length > 0 && !ids.includes('all') && !ids.includes(currentWorkerId)) return false;
    }
    if (filterTeam !== 'all' && t.team !== filterTeam) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    return true;
  });

  const openCount = filteredTasks.filter(t => t.status === 'open').length;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Oppgaver</h1>
          <p className="text-sm text-slate-400">{openCount} åpne oppgaver</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowRecurring(true)} className="gap-2">
              <RepeatIcon className="w-4 h-4" /> Faste oppgaver
            </Button>
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Ny oppgave
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {isAdmin && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {[['all', 'Alle avd.'], ...Object.entries(teamNames)].map(([key, name]) => (
              <button
                key={key}
                onClick={() => setFilterTeam(key)}
                className={`px-3 py-2 font-medium transition-colors ${filterTeam === key ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {[['open', 'Åpne'], ['completed', 'Fullførte'], ['all', 'Alle']].map(([val, lbl]) => (
            <button key={val} onClick={() => setFilterStatus(val)}
              className={`px-3 py-2 font-medium transition-colors ${filterStatus === val ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p>Ingen oppgaver å vise</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              workers={workers}
              isAdmin={isAdmin}
              currentWorkerId={currentWorkerId}
              onToggle={t => toggleMut.mutate(t)}
              onDelete={id => { if (confirm('Slett oppgave?')) deleteMut.mutate(id); }}
            />
          ))
        )}
      </div>

      <RecurringTasksModal
        open={showRecurring}
        onClose={() => setShowRecurring(false)}
        workers={workers}
        teamNames={teamNames}
      />

      <Dialog open={showForm} onOpenChange={v => !v && setShowForm(false)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ny oppgave</DialogTitle></DialogHeader>
          <TaskForm
            workers={workers}
            teamNames={teamNames}
            onSubmit={data => createMut.mutate(data)}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}