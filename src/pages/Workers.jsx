import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Phone, Mail, Users, Send, Shield } from 'lucide-react';
import WorkerForm from '@/components/workers/WorkerForm';
import BulkAddWorkers from '@/components/workers/BulkAddWorkers';
import { useOrg } from '@/hooks/useOrg';
import { useTeamNames } from '@/hooks/useTeamNames';
import { releaseUpcomingShifts } from '@/utils/workerLifecycle';
import { canSeeWageCosts } from '@/utils/wageAccess';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', color: 'bg-purple-100 text-purple-700' },
  { value: 'sub_admin', label: 'Sub Admin', color: 'bg-orange-100 text-orange-700' },
  { value: 'butikksjef', label: 'Butikksjef', color: 'bg-blue-100 text-blue-700' },
  { value: 'user', label: 'Ansatt', color: 'bg-slate-100 text-slate-600' },
];

function InviteButton({ worker }) {
  const [status, setStatus] = useState('idle');
  if (!worker.email) return null;
  const handleInvite = async () => {
    setStatus('loading');
    try {
      // Invite med den faktiske Worker-rollen slik at RLS for vakter/oppgaver
      // (som krever role:'butikksjef'/'sub_admin'/'admin') slår riktig for brukeren.
      const inviteRole = worker.role || 'user';
      await base44.users.inviteUser(worker.email, inviteRole);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 4000);
    } catch (e) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };
  if (status === 'done') return <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">✓ Sendt!</span>;
  if (status === 'error') return <span className="text-xs text-red-500 font-medium">Feilet – prøv igjen</span>;
  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50" onClick={handleInvite} disabled={status === 'loading'}>
      <Send className="w-3.5 h-3.5" /> {status === 'loading' ? 'Inviting...' : 'Invite'}
    </Button>
  );
}

export default function Workers() {
  const { user, worker: me, myTeams } = useCurrentWorker();
  const showWages = canSeeWageCosts(user, me);
  const { orgId, myOrg, isSuperAdmin: superAdmin } = useOrg();
  const isAdmin = user?.role === 'admin';
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterTeam, setFilterTeam] = useState('all');
  const [teamDefaultSet, setTeamDefaultSet] = useState(false);
  const [savingRole, setSavingRole] = useState(null);
  const [formError, setFormError] = useState('');
  const [preview, setPreview] = useState(null);
  const queryClient = useQueryClient();

  const { data: allWorkers = [], isLoading } = useQuery({
    queryKey: ['workers', orgId],
    queryFn: () => orgId
      ? base44.entities.Worker.filter({ org_id: orgId })
      : base44.entities.Worker.list(),
    enabled: orgId !== undefined,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const teamNames = useTeamNames();

  useEffect(() => {
    if (!teamDefaultSet && myTeams?.[0]) {
      setFilterTeam(myTeams[0]);
      setTeamDefaultSet(true);
    }
  }, [myTeams, teamDefaultSet]);

  // butikksjef only sees/manages workers in their own team(s)
  const workers = isAdmin
    ? allWorkers
    : allWorkers.filter(w => (w.teams || ['team1']).some(t => myTeams.includes(t)));

  const createMut = useMutation({
    mutationFn: d => base44.entities.Worker.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['workers'] }); },
  });

  const bulkCreateMut = useMutation({
    mutationFn: ws => base44.entities.Worker.bulkCreate(ws),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workers'] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Worker.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['workers'] }); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      // Tidligere vakter beholdes (urørt); kommende vakter gjøres ledige før sletting
      await releaseUpcomingShifts(id, { orgId });
      await base44.entities.Worker.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
  });

  const { data: workplaces = [] } = useQuery({
    queryKey: ['workplace-settings'],
    queryFn: () => base44.entities.WorkplaceSetting.list(),
    enabled: showWages,
  });
  const workplace = (orgId ? workplaces.filter(row => row.org_id === orgId) : workplaces)[0] || null;
  const { data: employerRows = [] } = useQuery({
    queryKey: ['employer-settings', orgId],
    queryFn: () => base44.entities.EmployerSetting.filter({ org_id: orgId }),
    enabled: showWages && !!orgId,
  });

  useEffect(() => {
    if (!editing?.id || !showWages) return;
    let cancelled = false;
    supabase.rpc('worker_contract_fields', { p_worker_id: editing.id }).then(({ data }) => {
      if (cancelled || !data?.birth_date) return;
      setEditing(current => current && current.id === editing.id ? { ...current, birth_date: data.birth_date, address: data.address ?? current.address } : current);
    });
    return () => { cancelled = true; };
  }, [editing?.id, showWages]);

  const handleSubmit = async (data) => {
    setFormError('');
    const sendContract = Boolean(data.send_arbeidsavtale);
    const previewFirst = Boolean(data.preview_first);
    const checklist = data.checklist || {};
    const workerFields = { ...data };
    delete workerFields.send_arbeidsavtale;
    delete workerFields.preview_first;
    delete workerFields.checklist;
    try {
      let saved;
      if (editing) {
        saved = await updateMut.mutateAsync({ id: editing.id, data: workerFields });
        const promises = [];
        if (editing.status === 'active' && data.status === 'inactive') {
          promises.push(releaseUpcomingShifts(editing.id, { orgId }));
        }
        const oldTeams = editing.teams || (editing.team ? [editing.team] : ['team1']);
        const newTeams = data.teams || oldTeams;
        oldTeams.filter(t => !newTeams.includes(t)).forEach(t =>
          promises.push(releaseUpcomingShifts(editing.id, { teamKey: t, orgId }))
        );
        if (promises.length) {
          await Promise.all(promises);
          queryClient.invalidateQueries({ queryKey: ['shifts'] });
        }
      } else {
        saved = await createMut.mutateAsync({ ...workerFields, org_id: orgId });
      }
      if (sendContract) {
        const { data: created, error } = await supabase.rpc('create_employment_contract', {
          p_worker_id: saved.id,
          p_send_now: !previewFirst,
          p_checklist: checklist,
        });
        if (error) throw new Error(error.message);
        if (!created?.ok) {
          const missing = Array.isArray(created?.missing) ? created.missing.join(', ') : 'Avtalen kunne ikke opprettes';
          setFormError(missing);
          setEditing(saved);
          setShowForm(true);
          return;
        }
        if (previewFirst) {
          setPreview({ id: created.id, body: created.body_snapshot, name: saved.name });
          setShowForm(false);
          setEditing(null);
          return;
        }
      }
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      setFormError(err.message || 'Lagring feilet');
    }
  };

  const sendPreview = async () => {
    if (!preview?.id) return;
    const { data, error } = await supabase.rpc('send_contract', { p_contract_id: preview.id });
    if (error || data?.ok === false) {
      setFormError(error?.message || data?.error || 'Kunne ikke sende');
      return;
    }
    setPreview(null);
  };

  const handleRoleChange = async (worker, newRole) => {
    setSavingRole(worker.id);
    // Always save on Worker entity
    await base44.entities.Worker.update(worker.id, { role: newRole });
    queryClient.invalidateQueries({ queryKey: ['workers'] });
    // Also sync to User entity if they have an account
    const u = users.find(x => x.email === worker.email);
    if (u) {
      await base44.entities.User.update(u.id, { role: newRole });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
    setSavingRole(null);
  };

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;

  const teamOptions = Object.entries(teamNames)
    .map(([value, label]) => ({ value, label }))
    .filter(t => workers.some(w => (w.teams || ['team1']).includes(t.value)));

  const displayWorkers = filterTeam === 'all' ? workers : workers.filter(w => (w.teams || ['team1']).includes(filterTeam));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">{displayWorkers.length} worker{displayWorkers.length !== 1 ? 's' : ''}</p>
          {teamOptions.length > 1 && (
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Alle team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle team</SelectItem>
                {teamOptions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulk(true)} className="gap-2">
            <Users className="w-4 h-4" /> Add Multiple
          </Button>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Worker
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayWorkers.map(worker => {
          const u = users.find(x => x.email === worker.email);
          const role = u?.role || worker.role || 'user';
          const roleInfo = ROLE_OPTIONS.find(r => r.value === role);
          return (
            <div key={worker.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                    style={{ backgroundColor: worker.color || '#3B82F6' }}>
                    {worker.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{worker.name}</p>
                    <p className="text-xs text-slate-400">{worker.position || 'No position'}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  worker.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {worker.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(worker.teams || (worker.team ? [worker.team] : ['team1'])).map(t => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{teamNames[t] || t}</span>
                ))}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  worker.employment_type === 'fastlønn'
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}>{worker.employment_type || 'timelønn'}</span>
              </div>

              <div className="mt-4 space-y-1.5 text-sm text-slate-500">
                {showWages && (
                <div className="flex items-center justify-between">
                  <span>Hourly Rate</span>
                  <span className="font-semibold text-slate-800">{worker.hourly_rate?.toFixed(2)} kr</span>
                </div>
                )}
                <div className="flex items-center justify-between">
                  <span>Stillingsprosent</span>
                  <span className="font-semibold text-slate-800">{worker.employment_percentage ?? 100}%</span>
                </div>
                {worker.email && <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{worker.email}</div>}
                {worker.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{worker.phone}</div>}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {isAdmin ? (
                  <Select value={worker.role || 'user'} onValueChange={v => handleRoleChange(worker, v)} disabled={savingRole === worker.id}>
                    <SelectTrigger className="h-7 text-xs flex-1 border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${r.color}`}>{r.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleInfo?.color || 'bg-slate-100 text-slate-600'}`}>
                    {roleInfo?.label || (worker.role || 'user')}
                  </span>
                )}
              </div>

              <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setEditing(worker)}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
                <InviteButton worker={worker} />
                <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => { if (confirm('Slette denne ansatte? Tidligere vakter beholdes med navn, og kommende vakter gjøres ledige.')) deleteMut.mutate(worker.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {displayWorkers.length === 0 && (
        <div className="text-center py-16">
          <p className="text-slate-400 mb-3">No workers yet</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => setShowForm(true)} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> Add your first worker
            </Button>
            {showWages && (
            <Button onClick={() => setShowBulk(true)} variant="outline" className="gap-2">
              <Users className="w-4 h-4" /> Add Multiple
            </Button>
            )}
          </div>
        </div>
      )}

      {showBulk && (
        <BulkAddWorkers
          teamNames={teamNames}
          onClose={() => setShowBulk(false)}
          onSave={ws => bulkCreateMut.mutateAsync(ws)}
        />
      )}

      <Dialog open={showForm || !!editing} onOpenChange={v => { if (!v) { setShowForm(false); setEditing(null); setFormError(''); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? 'Rediger ansatt' : 'Ny ansatt'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
          {formError && <p className="text-sm text-red-600 mb-3">{formError}</p>}
          <WorkerForm
            key={`${editing?.id || 'new'}-${editing?.birth_date || ''}`}
            worker={editing}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(null); setFormError(''); }}
            teamNames={teamNames}
            showWages={showWages}
            employerSettings={employerRows[0] || null}
            workplace={workplace}
            organizationName={myOrg?.name || ''}
          />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={v => { if (!v) setPreview(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Forhåndsvisning for {preview?.name}</DialogTitle>
          </DialogHeader>
          <pre className="overflow-y-auto flex-1 whitespace-pre-wrap text-sm text-slate-800 bg-slate-50 rounded-lg p-4">{preview?.body}</pre>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setPreview(null)}>Behold som utkast</Button>
            <Button onClick={sendPreview}>Send til signering</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}