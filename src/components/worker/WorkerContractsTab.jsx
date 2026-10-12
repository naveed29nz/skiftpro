import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle2, XCircle, Download, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

const STATUS_MAP = {
  utkast: { label: 'Utkast', color: 'bg-slate-100 text-slate-700' },
  sendt: { label: 'Venter på deg', color: 'bg-blue-100 text-blue-700' },
  godkjent: { label: 'Godkjent', color: 'bg-emerald-100 text-emerald-700' },
  avvist: { label: 'Avvist', color: 'bg-red-100 text-red-700' },
};

export default function WorkerContractsTab({ worker }) {
  const queryClient = useQueryClient();
  const [pdfLoading, setPdfLoading] = useState(null);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['worker-contracts', worker.id],
    queryFn: () => base44.entities.Contract.filter({ worker_id: worker.id }, '-created_date', 50),
    enabled: !!worker,
  });

  const handleApprove = async (contractId) => {
    await base44.functions.invoke('updateContractStatus', { contract_id: contractId, action: 'approve' });
    queryClient.invalidateQueries({ queryKey: ['worker-contracts'] });
  };

  const handleReject = async (contractId) => {
    await base44.functions.invoke('updateContractStatus', { contract_id: contractId, action: 'reject' });
    queryClient.invalidateQueries({ queryKey: ['worker-contracts'] });
  };

  const handleDownloadPdf = async (contract) => {
    setPdfLoading(contract.id);
    try {
      const res = await base44.functions.invoke('generateContractPDF', { contract_id: contract.id });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kontrakt-${contract.worker_name}-${contract.start_date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Kunne ikke generere PDF');
    }
    setPdfLoading(null);
  };

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  const pendingContracts = contracts.filter(c => c.status === 'sendt');
  const otherContracts = contracts.filter(c => c.status !== 'sendt');

  return (
    <div className="space-y-6">
      {/* Pending contracts - waiting for approval */}
      {pendingContracts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Venter på din godkjenning ({pendingContracts.length})
          </h3>
          <div className="space-y-3">
            {pendingContracts.map(contract => {
              const statusCfg = STATUS_MAP[contract.status] || STATUS_MAP.sendt;
              return (
                <div key={contract.id} className="bg-white rounded-xl border-2 border-blue-200 p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                        <Badge className="bg-amber-100 text-amber-700">
                          {contract.contract_type === 'fast' ? 'Fast' : 'Ekstrahjelp'}
                        </Badge>
                        {contract.overtime_hours > 0 && (
                          <span className="text-xs text-red-500 font-semibold">+{contract.overtime_hours?.toFixed(1)}t ekstratimer</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        {contract.start_date && format(new Date(contract.start_date + 'T00:00:00'), 'd. MMM', { locale: nb })}
                        {' – '}
                        {contract.end_date && format(new Date(contract.end_date + 'T00:00:00'), 'd. MMM', { locale: nb })}
                        {' · '}Uke {contract.week_number}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                        <span>{contract.weekly_hours?.toFixed(1)}t/uke</span>
                        <span>{contract.hourly_rate} kr/t</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{contract.org_name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadPdf(contract)}
                        disabled={pdfLoading === contract.id}
                        className="text-slate-400 hover:text-slate-600"
                        title="Last ned PDF"
                      >
                        {pdfLoading === contract.id ? (
                          <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(contract.id)}
                        className="text-red-500 hover:text-red-700 border-red-200 hover:border-red-300 gap-1.5"
                      >
                        <XCircle className="w-4 h-4" /> Avslå
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(contract.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Godkjenn
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All contracts */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Alle kontrakter ({contracts.length})
        </h3>
        {contracts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Ingen kontrakter ennå</p>
            <p className="text-sm text-slate-400 mt-1">Ekstrahjelp-kontrakter genereres automatisk ved behov</p>
          </div>
        ) : (
          <div className="space-y-2">
            {otherContracts.map(contract => {
              const statusCfg = STATUS_MAP[contract.status] || STATUS_MAP.utkast;
              return (
                <div key={contract.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    contract.status === 'godkjent' ? 'bg-emerald-100' : 'bg-slate-100'
                  }`}>
                    {contract.status === 'godkjent' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : contract.status === 'avvist' ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {contract.contract_type === 'fast' ? 'Fast kontrakt' : 'Ekstrahjelp'}
                      {contract.overtime_hours > 0 && (
                        <span className="text-red-500 ml-2">+{contract.overtime_hours?.toFixed(1)}t</span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                      <span>Uke {contract.week_number}, {contract.year}</span>
                      <span>·</span>
                      <span>{contract.weekly_hours?.toFixed(1)}t</span>
                      <span>·</span>
                      <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                    </div>
                  </div>
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