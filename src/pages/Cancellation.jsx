import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import CancellationWizard from '@/components/billing/CancellationWizard';
import { loadCancellationState, submitCancellation, withdrawCancellation } from '@/billing/cancellationApi';
import { CONTACT_EMAIL, openCancellation } from '@/billing/cancellationTerms';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';
import { useOrg } from '@/hooks/useOrg';

export default function Cancellation() {
  const queryClient = useQueryClient();
  const { isOrgAdmin, orgId, myOrg } = useOrg();
  const { user } = useCurrentWorker();
  const query = useQuery({
    queryKey: ['subscription-cancellation', orgId],
    queryFn: () => loadCancellationState(orgId),
    enabled: Boolean(isOrgAdmin && orgId),
  });

  if (!isOrgAdmin || !orgId) {
    return (
      <div className="max-w-xl space-y-3 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Si opp abonnementet</h1>
        <p className="text-sm leading-6 text-slate-600">
          Bare administratoren som står på kundekortet kan si opp abonnementet. Avdelingsledere og ansatte har ikke tilgang til oppsigelsen.
        </p>
        <Link to="/Settings" className="text-sm text-blue-700 hover:underline">Tilbake til innstillinger</Link>
      </div>
    );
  }

  if (query.isLoading || !user) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="max-w-xl space-y-3 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Si opp abonnementet</h1>
        <p className="text-sm leading-6 text-slate-600">
          Oppsigelsen kunne ikke hentes. Prøv igjen, eller skriv til {CONTACT_EMAIL}.
        </p>
      </div>
    );
  }

  const rows = query.data?.rows || [];
  const existing = openCancellation(rows);
  const organizationName = myOrg?.name || 'kunden';
  const requesterName = user.full_name || user.email || 'Administrator';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['subscription-cancellation', orgId] });

  return (
    <CancellationWizard
      organizationName={organizationName}
      requesterName={requesterName}
      requesterEmail={user.email || ''}
      existing={existing}
      storageNote={query.data?.missing
        ? `Oppsigelsesprotokollen er ikke aktiv i databasen ennå. Du kan gå gjennom stegene, men oppsigelsen blir ikke lagret her. Skriv til ${CONTACT_EMAIL} hvis dere vil si opp nå.`
        : ''}
      onSubmit={async ({ reasonCode, reasonDetail }) => {
        const saved = await submitCancellation({ orgId, reasonCode, reasonDetail });
        await refresh();
        return saved;
      }}
      onWithdraw={async (record) => {
        const saved = await withdrawCancellation(record.id);
        await refresh();
        return saved;
      }}
    />
  );
}
