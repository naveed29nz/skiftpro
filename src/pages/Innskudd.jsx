import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOrg } from '@/hooks/useOrg';
import { effectiveAppRole } from '@/utils/wageAccess';
import InnskuddSkjema from '@/components/innskudd/InnskuddSkjema';
import InnskuddOversikt from '@/components/innskudd/InnskuddOversikt';
import {
  buildInnskuddRows,
  canEditRegistration,
  PERIODS,
  registrationStatus,
  summarizeRows,
  teamForKundenr,
  teamsFromWorkplace,
  todayIso,
} from '@/innskudd/model';
import { parseLoomisWorkbook } from '@/innskudd/parseLoomisExport';
import { humanInnskuddError, upsertLoomisDeposits } from '@/innskudd/upsertDeposits';

export default function Innskudd() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [user, setUser] = useState(null);
  const [worker, setWorker] = useState(null);
  const [ready, setReady] = useState(false);
  const [storeKey, setStoreKey] = useState('all');
  const [periodId, setPeriodId] = useState('30');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [kundenrDraft, setKundenrDraft] = useState({});
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    base44.auth.me().then(async (me) => {
      if (cancelled) return;
      setUser(me);
      if (me?.email) {
        const rows = await base44.entities.Worker.filter({ email: me.email });
        if (!cancelled) setWorker(rows[0] || null);
      }
      if (!cancelled) setReady(true);
    }).catch(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const bagsQuery = useQuery({
    queryKey: ['loomis-innskudd', orgId],
    queryFn: () => (orgId
      ? base44.entities.LoomisInnskudd.filter({ org_id: orgId }, '-dato', 1000)
      : base44.entities.LoomisInnskudd.list('-dato', 1000)),
  });
  const depositsQuery = useQuery({
    queryKey: ['loomis-deposits', orgId],
    queryFn: () => (orgId
      ? base44.entities.LoomisDeposit.filter({ org_id: orgId }, '-telledato', 2000)
      : base44.entities.LoomisDeposit.list('-telledato', 2000)),
  });
  const registrations = bagsQuery.data || [];
  const deposits = depositsQuery.data || [];

  const { data: settings = [] } = useQuery({
    queryKey: ['workplace-settings', orgId],
    queryFn: () => (orgId
      ? base44.entities.WorkplaceSetting.filter({ org_id: orgId })
      : base44.entities.WorkplaceSetting.list()),
  });

  const { data: workers = [] } = useQuery({
    queryKey: ['workers', orgId],
    queryFn: () => (orgId
      ? base44.entities.Worker.filter({ org_id: orgId })
      : base44.entities.Worker.list()),
    enabled: ready,
  });

  const wp = (orgId ? settings.filter((row) => row.org_id === orgId) : settings)[0] || null;
  const appRole = effectiveAppRole(user, worker);
  const isManager = appRole === 'admin' || appRole === 'sub_admin' || appRole === 'butikksjef';
  const seesAllStores = appRole === 'admin' || appRole === 'sub_admin';
  const allTeams = useMemo(() => teamsFromWorkplace(wp, workers), [wp, workers]);
  const assigned = worker?.teams?.length ? worker.teams : (worker ? ['team1'] : []);
  const visibleTeams = seesAllStores ? allTeams : allTeams.filter((team) => assigned.includes(team.key));
  const defaultTeam = visibleTeams[0]?.key || '';

  useEffect(() => {
    const draft = {};
    for (const team of allTeams) draft[team.key] = team.kundenr || '';
    setKundenrDraft(draft);
  }, [allTeams]);

  const today = todayIso();
  const periodDays = PERIODS.find((period) => period.id === periodId)?.days || 30;
  const rows = useMemo(() => buildInnskuddRows({
    registrations,
    deposits,
    teams: allTeams,
    today,
    storeKey: seesAllStores ? storeKey : (storeKey === 'all' ? 'all' : storeKey),
    periodDays,
  }).filter((row) => seesAllStores || visibleTeams.some((team) => team.key === row.team || team.label === row.butikk)), [registrations, deposits, allTeams, today, storeKey, periodDays, seesAllStores, visibleTeams]);

  const summary = useMemo(() => summarizeRows(rows), [rows]);

  const recent = useMemo(() => {
    return registrations
      .filter((row) => (worker?.id && row.ansatt_id === worker.id) || (user?.id && row.created_by === user.id))
      .sort((a, b) => String(b.dato).localeCompare(String(a.dato)) || String(b.created_date || '').localeCompare(String(a.created_date || '')))
      .slice(0, 20)
      .map((row) => {
        const loomis = deposits.find((deposit) => String(deposit.bilagsnr || '').trim() === String(row.posenummer || '').trim()) || null;
        const actor = { id: user?.id, workerId: worker?.id, role: appRole };
        return {
          ...row,
          status: registrationStatus(row, loomis, today),
          canEdit: canEditRegistration(row, deposits, actor),
        };
      });
  }, [registrations, deposits, worker, user, appRole, today]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['loomis-innskudd'] });
    queryClient.invalidateQueries({ queryKey: ['loomis-deposits'] });
  };

  const saveMut = useMutation({
    mutationFn: async (payload) => {
      const body = {
        ...payload,
        org_id: orgId || wp?.org_id || worker?.org_id || '',
        ansatt_id: worker?.id || '',
      };
      if (editing?.id) return base44.entities.LoomisInnskudd.update(editing.id, body);
      return base44.entities.LoomisInnskudd.create(body);
    },
    onSuccess: () => {
      setFormError('');
      setEditing(null);
      setShowForm(false);
      setFormKey((key) => key + 1);
      invalidate();
    },
    onError: (error) => setFormError(humanInnskuddError(error)),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.LoomisInnskudd.delete(id),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
    onError: (error) => setFormError(humanInnskuddError(error)),
  });

  const importMut = useMutation({
    mutationFn: async (file) => {
      if (!orgId) throw new Error('Velg organisasjon før import.');
      const parsed = await parseLoomisWorkbook(await file.arrayBuffer());
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.rows.length === 0) throw new Error('Fant ingen innskudd i filen.');
      const withTeam = parsed.rows.map((row) => ({
        ...row,
        team: teamForKundenr(row.kundenr, allTeams)?.key || null,
      }));
      await upsertLoomisDeposits(orgId, withTeam);
      return { saved: withTeam.length, skipped: parsed.skipped };
    },
    onSuccess: ({ saved, skipped }) => {
      setImportError('');
      setImportMessage(skipped
        ? `Importerte ${saved} innskudd. ${skipped} rader hoppet over fordi Innskuddnr manglet.`
        : `Importerte ${saved} innskudd.`);
      invalidate();
    },
    onError: (error) => {
      setImportMessage('');
      setImportError(humanInnskuddError(error) === 'Kunne ikke lagre. Prøv igjen.'
        ? (error.message || 'Kunne ikke importere filen.')
        : humanInnskuddError(error));
    },
  });

  const kundenrMut = useMutation({
    mutationFn: async () => {
      const patch = {};
      for (const team of allTeams) patch[`${team.key}_loomis_kundenr`] = kundenrDraft[team.key] || '';
      if (wp?.id) return base44.entities.WorkplaceSetting.update(wp.id, patch);
      return base44.entities.WorkplaceSetting.create({ ...patch, org_id: orgId, active_teams_count: allTeams.length || 1 });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workplace-settings'] }),
    onError: (error) => setImportError(humanInnskuddError(error)),
  });

  const loadError = bagsQuery.error || depositsQuery.error;

  if (!ready || bagsQuery.isLoading || depositsQuery.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const loadBanner = loadError ? (
    <p className="max-w-md mx-auto text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
      {humanInnskuddError(loadError)}
    </p>
  ) : null;

  const form = (
    <InnskuddSkjema
      key={formKey}
      teams={visibleTeams}
      defaultTeam={defaultTeam}
      defaultName={worker?.name || user?.full_name || ''}
      takenPoses={registrations.map((row) => row.posenummer)}
      editing={editing}
      onSubmit={(payload) => { setFormError(''); saveMut.mutate(payload); }}
      onCancel={() => { setEditing(null); setFormError(''); }}
      saving={saveMut.isPending}
      formError={formError}
      recent={recent}
      showRecent={!isManager || showForm}
      onEdit={(row) => { setEditing(row); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      onDelete={(row) => deleteMut.mutate(row.id)}
    />
  );

  if (!isManager) {
    return (
      <div className="space-y-4">
        {loadBanner}
        {form}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadBanner}
      <InnskuddOversikt
        teams={visibleTeams}
        rows={rows}
        summary={summary}
        storeKey={storeKey}
        onStore={setStoreKey}
        periodId={periodId}
        onPeriod={setPeriodId}
        canImport
        onFile={(file) => importMut.mutate(file)}
        importing={importMut.isPending}
        importMessage={importMessage}
        importError={importError}
        kundenrDraft={kundenrDraft}
        onKundenr={(key, value) => setKundenrDraft((current) => ({ ...current, [key]: value }))}
        onSaveKundenr={() => kundenrMut.mutate()}
        savingKundenr={kundenrMut.isPending}
        onRegister={() => { setEditing(null); setShowForm((open) => !open); }}
      />
      {showForm && form}
    </div>
  );
}
