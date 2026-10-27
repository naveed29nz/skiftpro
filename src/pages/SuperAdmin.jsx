import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, Plus, Users, Settings, Trash2, Send, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';
import { customerAdminOptions, resolveEmployerSignerName, selectedCustomerAdminName } from '@/contracts/employment';
import { signedCopyRecipient } from '../../supabase/functions/_shared/contractEmails.js';
import { PostenAdminHint } from '@/components/contracts/PostenRegistrationNote';

const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  trial: 'bg-amber-100 text-amber-700',
};

const PLAN_COLORS = {
  basic: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-orange-100 text-orange-700',
  ultimate: 'bg-rose-100 text-rose-700',
};

const PLAN_LIMITS = {
  basic:      { workers: 5,   departments: 1,  label: 'Basic',      desc: '1–5 ansatte · 1 avdeling' },
  pro:        { workers: 10,  departments: 3,  label: 'Pro',        desc: '6–10 ansatte · 3 avdelinger' },
  enterprise: { workers: 30,  departments: 6,  label: 'Enterprise', desc: '11–30 ansatte · 6 avdelinger' },
  ultimate:   { workers: 100, departments: 10, label: 'Ultimate',   desc: '31–100 ansatte · 10 avdelinger' },
};

export function OrgForm({ org, profiles = [], workers = [], onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: org?.name || '',
    org_number: org?.org_number || '',
    contact_name: org?.contact_name || '',
    contact_email: org?.contact_email || '',
    contact_phone: org?.contact_phone || '',
    admin_email: org?.admin_email || '',
    employer_signatory_user_id: org?.employer_signatory_user_id || '',
    admin_signerer_navn: String(org?.admin_signerer_navn || '').trim() || selectedCustomerAdminName(org || {}, profiles, workers),
    signert_kopi_epost: signedCopyRecipient(org),
    status: org?.status || 'active',
    plan: org?.plan || 'basic',
    notes: org?.notes || '',
  });
  const draftOrg = { ...(org || {}), ...form, id: org?.id };
  const candidates = customerAdminOptions(draftOrg, profiles, workers);
  const selectedId = candidates.some((candidate) => candidate.id === form.employer_signatory_user_id)
    ? form.employer_signatory_user_id
    : (candidates.find((candidate) => candidate.primary)?.id || '');
  const signerName = resolveEmployerSignerName({
    organization: { ...draftOrg, employer_signatory_user_id: selectedId },
    profiles,
    workers,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      employer_signatory_user_id: selectedId || null,
      admin_signerer_navn: String(form.admin_signerer_navn || '').trim() || null,
      signert_kopi_epost: String(form.signert_kopi_epost || '').trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Organisasjonsnavn *</Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="f.eks. Kunden AS" required />
        </div>
        <div className="space-y-1.5">
          <Label>Org.nummer</Label>
          <Input value={form.org_number} onChange={e => setForm({ ...form, org_number: e.target.value })} placeholder="123 456 789" />
          <PostenAdminHint />
        </div>
        <div className="space-y-1.5">
          <Label>Admin e-post (for invitasjon)</Label>
          <Input type="email" value={form.admin_email} onChange={e => setForm({ ...form, admin_email: e.target.value })} placeholder="admin@kunde.no" />
        </div>
        <div className="space-y-1.5">
          <Label>Kontaktperson (navn)</Label>
          <Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="f.eks. Ola Nordmann" />
        </div>
        <div className="space-y-1.5">
          <Label>Kontakt e-post</Label>
          <Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} placeholder="kontakt@kunde.no" />
        </div>
        <div className="space-y-1.5">
          <Label>Telefon</Label>
          <Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} placeholder="+47 123 45 678" />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="trial">Prøveperiode</SelectItem>
              <SelectItem value="inactive">Inaktiv</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Select value={form.plan} onValueChange={v => setForm({ ...form, plan: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">Basic – 1–5 ansatte, 1 avdeling</SelectItem>
              <SelectItem value="pro">Pro – 6–10 ansatte, 3 avdelinger</SelectItem>
              <SelectItem value="enterprise">Enterprise – 11–30 ansatte, 6 avdelinger</SelectItem>
              <SelectItem value="ultimate">Ultimate – 31–100 ansatte, 10 avdelinger</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Signerer for arbeidsgiver</Label>
          {candidates.length > 0 ? (
            <Select value={selectedId} onValueChange={(value) => setForm({
              ...form,
              employer_signatory_user_id: value,
              admin_signerer_navn: String(form.admin_signerer_navn || '').trim()
                ? form.admin_signerer_navn
                : (candidates.find((candidate) => candidate.id === value)?.fullName || ''),
            })}>
              <SelectTrigger><SelectValue placeholder="Velg kundens admin" /></SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {(candidate.fullName || candidate.email)}{candidate.primary ? ' (kundens admin)' : ' (avdelingsadmin)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-slate-500">Ingen adminbruker på kunden ennå. Standard blir kundens første admin.</p>
          )}
          <p className="text-xs text-slate-500">Velg hvem som er admin. Kontaktpersonen brukes ikke.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Admin / signerer (navn)</Label>
          <Input
            value={form.admin_signerer_navn || ''}
            onChange={(e) => setForm({ ...form, admin_signerer_navn: e.target.value })}
            placeholder="Tomt felt bruker navnet til valgt admin"
          />
          <p className="text-xs text-slate-500">Signaturlinjen blir «For {form.name || 'selskapet'}: {signerName || '–'}». Dette navnet på kundekortet brukes foran profilnavnet.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="signert-kopi-epost">Kopi av signerte avtaler til</Label>
          <Input
            id="signert-kopi-epost"
            type="email"
            value={form.signert_kopi_epost || ''}
            onChange={(e) => setForm({ ...form, signert_kopi_epost: e.target.value })}
            placeholder="admin@kunde.no"
          />
          <p className="text-xs text-slate-500">PDF-kopi når avtalen er signert av begge parter. Tomt felt bruker admin-e-posten, deretter kontakt-e-posten.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Notater</Label>
          <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Interne notater..." />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Avbryt</Button>
        <Button type="submit">{org ? 'Oppdater' : 'Opprett kunde'}</Button>
      </div>
    </form>
  );
}

export default function SuperAdmin() {
  const { user } = useCurrentWorker();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [inviteStatus, setInviteStatus] = useState({});
  const queryClient = useQueryClient();

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => base44.entities.Organization.list('-created_date'),
  });

  const { data: allWorkers = [] } = useQuery({
    queryKey: ['workers'],
    queryFn: () => base44.entities.Worker.list(),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  // SuperAdmin er en egen plattform-bruker – holdes helt adskilt fra kundedata.
  // Kun ansatte tilknyttet en registrert kunde-organisasjon teller i panelet.
  const customerWorkerCount = (orgId) => allWorkers.filter(w => w.org_id === orgId).length;
  const totalCustomerWorkers = orgs.length
    ? allWorkers.filter(w => orgs.some(o => o.id === w.org_id)).length
    : 0;

  const createMut = useMutation({
    mutationFn: async (d) => {
      const org = await base44.entities.Organization.create(d);
      // Provision a default WorkplaceSetting so the new store is ready to use immediately
      try { await base44.entities.WorkplaceSetting.create({ org_id: org.id, workplace_name: d.name }); } catch {}
      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['workplace-settings'] });
      setShowForm(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Organization.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['organizations'] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Organization.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });

  const handleSubmit = (data) => {
    if (editing) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  };

  // SuperAdmin "enters" a customer org to support/make changes on their behalf.
  // The override is picked up by useOrg, which scopes all org data to this org.
  const impersonateOrg = (org) => {
    localStorage.setItem('impersonate_org_id', org.id);
    navigate('/Dashboard');
    window.location.reload();
  };

  const handleInvite = async (org) => {
    if (!org.admin_email) return;
    setInviteStatus(s => ({ ...s, [org.id]: 'loading' }));
    try {
      await base44.users.inviteUser(org.admin_email, 'admin');
      setInviteStatus(s => ({ ...s, [org.id]: 'done' }));
      setTimeout(() => setInviteStatus(s => ({ ...s, [org.id]: 'idle' })), 4000);
    } catch {
      setInviteStatus(s => ({ ...s, [org.id]: 'error' }));
      setTimeout(() => setInviteStatus(s => ({ ...s, [org.id]: 'idle' })), 4000);
    }
  };

  if (isLoading || !user) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;

  // True superadmin = platform admin who is NOT the admin of any org (by id or admin_email).
  // Org admins (store admins) must not see this page.
  const isSuperAdmin = user.role === 'admin' && !orgs.some(o =>
    o.admin_user_id === user.id ||
    (o.admin_email && user.email && o.admin_email.toLowerCase() === user.email.toLowerCase())
  );

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400">Ingen tilgang</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" /> Kundeoversikt
          </h1>
          <p className="text-slate-500 text-sm mt-1">{orgs.length} kunder registrert</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Ny kunde
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Totalt kunder', value: orgs.length, color: 'text-blue-600' },
          { label: 'Aktive', value: orgs.filter(o => o.status === 'active').length, color: 'text-emerald-600' },
          { label: 'Prøveperiode', value: orgs.filter(o => o.status === 'trial').length, color: 'text-amber-600' },
          { label: 'Totale ansatte', value: totalCustomerWorkers, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Org cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orgs.map(org => {
          const workerCount = customerWorkerCount(org.id);
          const iStatus = inviteStatus[org.id] || 'idle';
          return (
            <div key={org.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {org.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{org.name}</p>
                    {org.customer_number && <p className="text-xs text-blue-600 font-medium">Kunde #{org.customer_number}</p>}
                    {org.org_number && <p className="text-xs text-slate-400">{org.org_number}</p>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[org.status]}`}>
                    {org.status === 'active' ? 'Aktiv' : org.status === 'trial' ? 'Prøve' : 'Inaktiv'}
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-sm text-slate-500">
                {org.contact_name && <p className="font-medium text-slate-700">👤 {org.contact_name}</p>}
                <p className="text-slate-700">Signerer: {resolveEmployerSignerName({ organization: org, profiles, workers: allWorkers }) || 'kundens admin'}</p>
                {org.contact_email && <p className="truncate">📧 {org.contact_email}</p>}
                {org.contact_phone && <p>📞 {org.contact_phone}</p>}
                <div className="flex items-center justify-between pt-1">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {workerCount} ansatte
                  </span>
                  <span title={PLAN_LIMITS[org.plan || 'basic']?.desc} className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-help ${PLAN_COLORS[org.plan || 'basic']}`}>
                    {PLAN_LIMITS[org.plan || 'basic']?.label || org.plan}
                  </span>
                </div>
              </div>

              {org.notes && (
                <p className="mt-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-2 italic">{org.notes}</p>
              )}

              <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                <Button
                  variant="default" size="sm"
                  className="flex-1 gap-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => impersonateOrg(org)}
                >
                  <LogIn className="w-3.5 h-3.5" /> Logg inn som kunde
                </Button>
              </div>

              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => setEditing(org)}>
                  <Settings className="w-3.5 h-3.5" /> Rediger
                </Button>
                {org.admin_email && (
                  <Button
                    variant="outline" size="sm"
                    className="gap-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                    onClick={() => handleInvite(org)}
                    disabled={iStatus === 'loading'}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {iStatus === 'done' ? '✓ Sendt' : iStatus === 'error' ? 'Feil' : 'Inviter'}
                  </Button>
                )}
                <Button
                  variant="outline" size="sm"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => { if (confirm(`Slett ${org.name}?`)) deleteMut.mutate(org.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {orgs.length === 0 && (
        <div className="text-center py-16">
          <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 mb-3">Ingen kunder ennå</p>
          <Button onClick={() => setShowForm(true)} variant="outline" className="gap-2">
            <Plus className="w-4 h-4" /> Legg til første kunde
          </Button>
        </div>
      )}

      <Dialog open={showForm || !!editing} onOpenChange={v => { if (!v) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Rediger kunde' : 'Ny kunde'}</DialogTitle>
          </DialogHeader>
          <OrgForm
            key={editing?.id || 'new'}
            org={editing}
            profiles={profiles}
            workers={allWorkers}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}