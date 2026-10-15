import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import { contractStatus, contractType } from '@/contracts/labels';

function periodText(contract) {
  if (!contract.start_date && !contract.week_number) return '';
  const start = contract.start_date
    ? format(new Date(`${contract.start_date}T00:00:00`), 'd. MMM', { locale: nb })
    : '';
  const end = contract.end_date
    ? format(new Date(`${contract.end_date}T00:00:00`), 'd. MMM', { locale: nb })
    : '';
  const week = contract.week_number ? `Uke ${contract.week_number}` : '';
  return [start && end ? `${start} – ${end}` : start, week].filter(Boolean).join(' · ');
}

export default function WorkerContractsTab({ worker }) {
  const [pdfLoading, setPdfLoading] = useState(null);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['worker-contracts', worker.id],
    queryFn: () => base44.entities.Contract.filter({ worker_id: worker.id }, '-created_date', 50),
    enabled: !!worker,
  });

  const handleDownloadPdf = async (contract) => {
    setPdfLoading(contract.id);
    try {
      const res = await base44.functions.invoke('generateContractPDF', { contract_id: contract.id });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kontrakt-${contract.worker_name}-${contract.start_date || 'avtale'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Kunne ikke hente PDF');
    }
    setPdfLoading(null);
  };

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  const pendingContracts = contracts.filter(c => c.status === 'sendt' || c.status === 'apnet');
  const otherContracts = contracts.filter(c => c.status !== 'sendt' && c.status !== 'apnet');

  return (
    <div className="space-y-6">
      {pendingContracts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Venter på din signatur ({pendingContracts.length})
          </h3>
          <div className="space-y-3">
            {pendingContracts.map(contract => {
              const statusCfg = contractStatus(contract.status);
              const typeCfg = contractType(contract.contract_type);
              return (
                <div key={contract.id} className="bg-white rounded-xl border-2 border-blue-200 p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                        <Badge className={typeCfg.color}>{typeCfg.label}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">{periodText(contract)}</p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                        {contract.weekly_hours != null && <span>{Number(contract.weekly_hours).toFixed(1)}t/uke</span>}
                        {contract.hourly_rate != null && <span>{contract.hourly_rate} kr/t</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{contract.org_name}</p>
                    </div>
                    <Button size="sm" asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Link to={`/kontrakt/${contract.id}`}>Les og signer</Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Alle kontrakter ({contracts.length})
        </h3>
        {contracts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Ingen kontrakter ennå</p>
            <p className="text-sm text-slate-400 mt-1">Arbeidsavtaler og tilleggsavtaler vises her</p>
          </div>
        ) : (
          <div className="space-y-2">
            {otherContracts.map(contract => {
              const statusCfg = contractStatus(contract.status);
              const typeCfg = contractType(contract.contract_type);
              const signed = contract.status === 'signert' || contract.status === 'godkjent';
              return (
                <div key={contract.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${signed ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    {signed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : contract.status === 'avvist' ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{typeCfg.label}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 flex-wrap">
                      <span>{periodText(contract) || 'Uten periode'}</span>
                      {contract.hourly_rate != null && <span>· {contract.hourly_rate} kr/t</span>}
                      <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                    </div>
                  </div>
                  {signed && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/kontrakt/${contract.id}`}>Sertifikat</Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadPdf(contract)}
                    disabled={pdfLoading === contract.id}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    {pdfLoading === contract.id ? (
                      <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
