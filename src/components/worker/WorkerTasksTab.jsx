import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Circle, Calendar, AlertCircle, ImageIcon, Upload, X, Plus, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useOrg } from '@/hooks/useOrg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const PRIORITY_STYLES = {
  high:   'bg-red-100 text-red-700',
  normal: 'bg-slate-100 text-slate-600',
  low:    'bg-green-100 text-green-700',
};
const PRIORITY_LABELS = { high: 'Høy', normal: 'Normal', low: 'Lav' };

const EMPTY_TASK_FORM = { title: '', description: '', due_date: '', priority: 'normal', team: '', assigned_worker_ids: [] };

export default function WorkerTasksTab({ worker, workers: allWorkers = [], teamNames = {} }) {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [showImage, setShowImage] = useState(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({ ...EMPTY_TASK_FORM });
  const myTeams = worker?.teams || ['team1'];
  const today = format(new Date(), 'yyyy-MM-dd');

  const canCreateTasks = ['admin', 'sub_admin', 'butikksjef'].includes(worker?.role);

  // My team options (only teams this worker belongs to)
  const myTeamOptions = myTeams.map(key => ({ key, name: teamNames[key] || key }));

  const handleTeamChange = (team) => setNewTask(f => ({ ...f, team, assigned_worker_ids: [] }));

  const toggleWorker = (id) => {
    if (id === 'all') {
      setNewTask(f => ({ ...f, assigned_worker_ids: f.assigned_worker_ids.includes('all') ? [] : ['all'] }));
      return;
    }
    setNewTask(f => {
      const ids = f.assigned_worker_ids.filter(i => i !== 'all');
      return { ...f, assigned_worker_ids: ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id] };
    });
  };

  const activeTeam = newTask.team || myTeams[0] || 'team1';
  const teamWorkers = allWorkers.filter(w =>
    w.status !== 'inactive' && (w.teams || ['team1']).includes(activeTeam)
  );

  const selectedIds = newTask.assigned_worker_ids;
  const allSelected = selectedIds.includes('all');
  const selectionLabel = allSelected
    ? 'Alle i avdelingen'
    : selectedIds.length === 0
      ? 'Velg ansatt(e)...'
      : selectedIds.length === 1
        ? allWorkers.find(w => w.id === selectedIds[0])?.name || '1 valgt'
        : `${selectedIds.length} ansatte valgt`;

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', orgId],
    queryFn: () => orgId ? base44.entities.Task.filter({ org_id: orgId }) : base44.entities.Task.list('-created_date', 200),
  });

  const createMut = useMutation({
    mutationFn: d => {
      const ids = d.assigned_worker_ids.length ? d.assigned_worker_ids : ['all'];
      const names = ids.includes('all') ? [] : allWorkers.filter(w => ids.includes(w.id)).map(w => w.name);
      return base44.entities.Task.create({
        title: d.title,
        description: d.description,
        due_date: d.due_date,
        priority: d.priority,
        org_id: orgId,
        team: d.team || myTeams[0] || 'team1',
        assigned_worker_ids: ids,
        assigned_worker_id: ids.includes('all') ? 'all' : (ids[0] || 'all'),
        assigned_worker_names: names,
        assigned_worker_name: names[0] || '',
        status: 'open',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowNewTask(false);
      setNewTask({ ...EMPTY_TASK_FORM });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ task, imageUrl }) => base44.entities.Task.update(task.id, {
      status: task.status === 'completed' ? 'open' : 'completed',
      completed_by_id: task.status !== 'completed' ? worker.id : null,
      completed_at: task.status !== 'completed' ? new Date().toISOString() : null,
      ...(imageUrl ? { completion_image_url: imageUrl } : {}),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const myTasks = tasks.filter(t => {
    const taskTeam = t.team || 'team1';
    if (!myTeams.includes(taskTeam)) return false;
    const ids = t.assigned_worker_ids?.length ? t.assigned_worker_ids : (t.assigned_worker_id ? [t.assigned_worker_id] : []);
    if (ids.length > 0 && !ids.includes('all') && !ids.includes(worker.id)) return false;
    return true;
  });

  const openTasks = myTasks.filter(t => t.status === 'open');
  const doneTasks = myTasks.filter(t => t.status === 'completed');

  if (isLoading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {canCreateTasks && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-2" onClick={() => { setNewTask({ ...EMPTY_TASK_FORM, team: myTeams[0] || 'team1' }); setShowNewTask(true); }}>
            <Plus className="w-4 h-4" /> Ny oppgave
          </Button>
        </div>
      )}

      {myTasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400 text-sm">Ingen oppgaver tildelt til deg</p>
        </div>
      ) : (
        <>
          {openTasks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 text-sm">Åpne oppgaver</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{openTasks.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {openTasks.map(task => (
                  <TaskRow key={task.id} task={task} today={today} onToggle={(imageUrl) => toggleMut.mutate({ task, imageUrl })} onViewImage={setShowImage} />
                ))}
              </div>
            </div>
          )}

          {doneTasks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden opacity-70">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-500 text-sm">Fullførte oppgaver</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {doneTasks.map(task => (
                  <TaskRow key={task.id} task={task} today={today} onToggle={(imageUrl) => toggleMut.mutate({ task, imageUrl })} onViewImage={setShowImage} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowImage(null)}>
          <img src={showImage} alt="" className="max-w-[90vw] max-h-[90vh] rounded-xl" />
        </div>
      )}

      <Dialog open={showNewTask} onOpenChange={v => !v && setShowNewTask(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Ny oppgave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Tittel *</label>
              <Input value={newTask.title} onChange={e => setNewTask(f => ({ ...f, title: e.target.value }))} placeholder="Oppgavetittel" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Beskrivelse</label>
              <Input value={newTask.description} onChange={e => setNewTask(f => ({ ...f, description: e.target.value }))} placeholder="Valgfri beskrivelse" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Avdeling — kun egne teams */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Avdeling</label>
                {myTeamOptions.length > 1 ? (
                  <select
                    value={newTask.team || myTeams[0]}
                    onChange={e => handleTeamChange(e.target.value)}
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-white"
                  >
                    {myTeamOptions.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                  </select>
                ) : (
                  <div className="w-full border border-input rounded-md px-3 py-2 text-sm bg-slate-50 text-slate-600">
                    {myTeamOptions[0]?.name || myTeams[0]}
                  </div>
                )}
              </div>
              {/* Prioritet */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Prioritet</label>
                <select value={newTask.priority} onChange={e => setNewTask(f => ({ ...f, priority: e.target.value }))} className="w-full border border-input rounded-md px-3 py-2 text-sm bg-white">
                  <option value="high">Høy</option>
                  <option value="normal">Normal</option>
                  <option value="low">Lav</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Ansatte */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Tildel ansatt(e)</label>
                <div className="border border-slate-200 rounded-md bg-white">
                  <div className="px-3 py-2 text-sm text-slate-500 border-b border-slate-100 truncate">{selectionLabel}</div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-100">
                    {/* Alle */}
                    <button
                      type="button"
                      onClick={() => toggleWorker('all')}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${allSelected ? 'text-blue-600 font-medium' : 'text-slate-700'}`}
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
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${checked ? 'text-blue-600 font-medium' : 'text-slate-700'}`}
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
              {/* Frist */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Frist</label>
                <Input type="date" value={newTask.due_date} onChange={e => setNewTask(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" disabled={!newTask.title || createMut.isPending} onClick={() => createMut.mutate(newTask)}>
                {createMut.isPending ? 'Lagrer...' : 'Opprett oppgave'}
              </Button>
              <Button variant="outline" onClick={() => setShowNewTask(false)}>Avbryt</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskRow({ task, today, onToggle, onViewImage }) {
  const isCompleted = task.status === 'completed';
  const isOverdue = task.due_date && task.due_date < today && !isCompleted;
  const [pendingImage, setPendingImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setPendingImage(file_url);
    setUploading(false);
  };

  const handleToggle = () => {
    onToggle(pendingImage || null);
    setPendingImage(null);
  };

  return (
    <div className="px-5 py-3.5 flex items-start gap-3">
      <button onClick={handleToggle} className="mt-0.5 shrink-0">
        {isCompleted
          ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          : <Circle className="w-5 h-5 text-slate-300 hover:text-blue-400 transition-colors" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title}</p>
        {task.description && <p className="text-xs text-slate-400 mt-0.5">{task.description}</p>}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_STYLES[task.priority || 'normal']}`}>
            {PRIORITY_LABELS[task.priority || 'normal']}
          </span>
          {task.due_date && (
            <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
              <Calendar className="w-3 h-3" /> Frist: {task.due_date}
              {isOverdue && ' (forfalt)'}
            </span>
          )}
          {task.image_url && (
            <button onClick={() => onViewImage(task.image_url)} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700">
              <ImageIcon className="w-3 h-3" /> Se bilde (admin)
            </button>
          )}
          {task.completion_image_url && (
            <button onClick={() => onViewImage(task.completion_image_url)} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800">
              <ImageIcon className="w-3 h-3" /> Fullføringsbilde
            </button>
          )}
        </div>

        {!isCompleted && (
          <div className="mt-2 flex items-center gap-2">
            <label className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${uploading ? 'opacity-50 pointer-events-none' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <Upload className="w-3 h-3" />
              {uploading ? 'Laster opp...' : pendingImage ? 'Bytt bilde' : 'Last opp bilde'}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
            {pendingImage && (
              <div className="flex items-center gap-1.5">
                <img src={pendingImage} alt="" className="h-8 w-8 rounded object-cover border border-slate-200 cursor-pointer" onClick={() => onViewImage(pendingImage)} />
                <button type="button" onClick={() => setPendingImage(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs text-emerald-600 font-medium">Klar ✓</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}