// @ts-nocheck
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { loadAllCancellations, markCancellationDataDeleted } from '@/billing/cancellationApi';
import {
  cancellationErrorMessage,
  cancellationStatusLabel,
  canMarkDataDeleted,
  formatLongDate,
  formatOsloDateTime,
  sortCancellations,
} from '@/billing/cancellationTerms';

export default function CancellationAdminList({ organizations = [] }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['subscription-cancellations'],
    queryFn: loadAllCancellations,
  });
  const [activeId, setActiveId] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  const mark = useMutation({
    mutationFn: ({ id, text }) => markCancellationDataDeleted(id, text),
    onSuccess: async () => {
      setActiveId('');
      setNote('');
      setMessage('Slettingen er registrert. Ingen kundedata ble slettet av appen.');
      await queryClient.invalidateQueries({ queryKey: ['subscription-cancellations'] });
    },
    onError: (error) => setMessage(cancellationErrorMessage(error)),
  });

  const names = Object.fromEntries((organizations || []).map((org) => [org.id, org.name]));
  const rows = sortCancellations(query.data?.rows || []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 space-y-2">
        <h2 className="font-semibold text-slate-800">Oppsigelser</h2>
        <p className="text-sm leading-6 text-slate-600">
          Oppsigelsen endrer ikke kundens status. Sett kunden til Inaktiv når abonnementet er ute.
          Data slettes ikke automatisk. Knappen registrerer bare at du har slettet kundedata manuelt, og den kan brukes fra slettedatoen.
        </p>
      </div>
      {query.data?.missing && (
        <p className="px-5 py-4 text-sm text-slate-600">
          Ingen oppsigelser kan vises før databasen er oppdatert med oppsigelsesprotokollen. Migreringen ligger i denne versjonen og er ikke kjørt.
        </p>
      )}
      {query.isError && (
        <p className="px-5 py-4 text-sm text-red-600">Oppsigelsene kunne ikke hentes.</p>
      )}
      {!query.data?.missing && !query.isLoading && rows.length === 0 && (
        <p className="px-5 py-8 text-sm text-slate-500">Ingen kunder har sagt opp.</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Kunde</th>
                <th className="px-5 py-3 text-left font-medium">Kvittering</th>
                <th className="px-5 py-3 text-left font-medium">Abonnementet opphører</th>
                <th className="px-5 py-3 text-left font-medium">Slettedato</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-left font-medium">Handling</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ready = canMarkDataDeleted(row);
                return (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-3 font-medium text-slate-800">{names[row.org_id] || row.org_name}</td>
                    <td className="px-5 py-3 text-slate-600">
                      <div>{row.receipt_number}</div>
                      <div className="text-xs text-slate-400">{formatOsloDateTime(row.requested_at)}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{formatLongDate(row.subscription_ends_on)}</td>
                    <td className="px-5 py-3 text-slate-700">{formatLongDate(row.data_deletion_on)}</td>
                    <td className="px-5 py-3 text-slate-700">{cancellationStatusLabel(row.status)}</td>
                    <td className="px-5 py-3">
                      {row.status === 'scheduled' && ready && activeId !== row.id && (
                        <Button type="button" size="sm" variant="outline" onClick={() => { setActiveId(row.id); setMessage(''); }}>
                          Registrer manuell sletting
                        </Button>
                      )}
                      {row.status === 'scheduled' && !ready && (
                        <p className="text-xs leading-5 text-slate-500">Kan registreres fra {formatLongDate(row.data_deletion_on)}. Knappen sletter ingen data.</p>
                      )}
                      {row.status === 'data_deleted' && (
                        <p className="text-xs leading-5 text-slate-500">
                          Registrert {formatOsloDateTime(row.data_deleted_at)}.
                          {row.data_deleted_note ? ` ${row.data_deleted_note}` : ''}
                        </p>
                      )}
                      {row.status === 'withdrawn' && (
                        <p className="text-xs text-slate-400">Kunden angret oppsigelsen.</p>
                      )}
                      {activeId === row.id && (
                        <div className="mt-2 space-y-2 max-w-xs">
                          <p className="text-xs leading-5 text-slate-600">
                            Dette sletter ingen ansatte, vakter eller filer. Det registrerer at du allerede har slettet data for {row.org_name} manuelt.
                          </p>
                          <Textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={3}
                            placeholder="Kort notat om hva som ble slettet"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={mark.isPending}
                              onClick={() => mark.mutate({ id: row.id, text: note })}
                            >
                              {mark.isPending ? 'Registrerer…' : 'Registrer at data er slettet'}
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setActiveId('')}>Avbryt</Button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {message && <p className="px-5 py-3 text-sm text-slate-600 border-t border-slate-100">{message}</p>}
    </div>
  );
}
