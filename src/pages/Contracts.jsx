import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOrg } from '@/hooks/useOrg';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';
import { canSeeWageCosts } from '@/utils/wageAccess';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Send, Trash2, Eye, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { contractStatus, contractType } from '@/contracts/labels';
import {
  contractPdfName,
  downloadBlob,
  formatContractDateTime,
  formatContractDay,
  formatHours,
  pdfBlobFromInvoke,
} from '@/contracts/contractActions';

export default function Contracts({ fixture = null, wagesVisible = null, loadPdf = null }) {
  const preview = import.meta.env.DEV && Array.isArray(fixture);
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const { user, worker } = useCurrentWorker();
  const showWages = preview && wagesVisible != null ? wagesVisible : canSeeWageCosts(user, worker);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewingContract, setViewingContract] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(null);
  const [previewRows, setPreviewRows] = useState(() => (preview ? fixture : []));

  useEffect(() => {
    if (preview) setPreviewRows(fixture);
  }, [preview, fixture]);

  const { data: loadedContracts = [], isLoading } = useQuery({
    queryKey: ['contracts', orgId],
    enabled: !preview,
    queryFn: () => orgId
      ? base44.entities.Contract.filter({ org_id: orgId }, '-created_date', 200)
      : base44.entities.Contract.list('-created_date', 200),
  });
  const contracts = preview ? previewRows : loadedContracts;

  const filtered = contracts.filter(c => {
    const matchSearch = !search || c.worker_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchType = typeFilter === 'all' || c.contract_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const handleSend = async (contractId) => {
    try {
      const res = await base44.functions.invoke('updateContractStatus', { contract_id: contractId, action: 'send' });
      if (res?.data?.emailed === false) {
        alert(res.data.email_error || 'Avtalen er sendt, men e-posten til den ansatte ble ikke sendt.');
      }
    } catch (err) {
      alert(err?.message || 'Kunne ikke sende avtalen');
    }
    queryClient.invalidateQueries({ queryKey: ['contracts'] });
  };

  const handleDelete = async (contractId) => {
    if (!window.confirm('Slette avtalen?')) return;
    try {
      if (preview) {
        setPreviewRows((rows) => rows.filter((row) => row.id !== contractId));
      } else {
        await base44.entities.Contract.delete(contractId);
        queryClient.invalidateQueries({ queryKey: ['contracts'] });
      }
      setViewingContract((current) => (current?.id === contractId ? null : current));
    } catch (err) {
      toast({
        title: 'Kunne ikke slette avtalen',
        description: err?.message || 'Prøv igjen.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadPdf = async (contract) => {
    setPdfLoading(contract.id);
    try {
      const res = preview && loadPdf
        ? { data: await loadPdf(contract) }
        : await base44.functions.invoke('generateContractPDF', { contract_id: contract.id });
      downloadBlob(pdfBlobFromInvoke(res?.data), contractPdfName(contract));
    } catch (err) {
      toast({
        title: 'Kunne ikke laste ned PDF',
        description: err?.message || 'Prøv igjen.',
        variant: 'destructive',
      });
    } finally {
      setPdfLoading(null);
    }
  };

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  const signedCount = filtered.filter(c => c.status === 'godkjent' || c.status === 'signert').length;
  const utkastCount = filtered.filter(c => c.status === 'utkast').length;
  const sendtCount = filtered.filter(c => c.status === 'sendt').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kontraktsarkiv</h1>
          <p className="text-sm text-slate-500 mt-1">Oversikt over alle arbeidskontrakter. Butikksjef ser status, ikke lønn eller avtaletekst.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Signert</p>
          <p className="text-2xl font-bold text-emerald-600">{signedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Sendt / Venter</p>
          <p className="text-2xl font-bold text-blue-600">{sendtCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Utkast</p>
          <p className="text-2xl font-bold text-slate-600">{utkastCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Søk etter ansatt..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Alle statuser</option>
          <option value="utkast">Utkast</option>
          <option value="sendt">Sendt</option>
          <option value="godkjent">Signert (eldre)</option>
          <option value="signert">Signert</option>
          <option value="signert_ansatt">Signert av ansatt</option>
          <option value="apnet">Åpnet</option>
          <option value="avvist">Avvist</option>
          <option value="utlopt">Utløpt</option>
          <option value="trukket">Trukket</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Alle typer</option>
          <option value="fast">Fast</option>
          <option value="midlertidig_vikar">Midlertidig vikar</option>
          <option value="tilkalling_ramme">Tilkalling</option>
          <option value="butikksjef_ledende">Butikksjef</option>
          <option value="merarbeid">Merarbeid</option>
          <option value="bilag">Bilag</option>
          <option value="ekstrahjelp">Ekstrahjelp</option>
        </select>
      </div>

      {/* Contract list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Ingen kontrakter funnet</p>
            <p className="text-sm text-slate-400 mt-1">Merarbeid lages automatisk når ansatte går over avtalt tid for måneden, eller for uken hvis bedriften har valgt det</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(contract => {
              const statusCfg = contractStatus(contract.status);
              const typeCfg = contractType(contract.contract_type);
              return (
                <div key={contract.id} className="px-5 py-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        contract.contract_type === 'fast' ? 'bg-indigo-100' : 'bg-amber-100'
                      }`}>
                        <FileText className={`w-5 h-5 ${
                          contract.contract_type === 'fast' ? 'text-indigo-600' : 'text-amber-600'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{contract.worker_name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge className={typeCfg.color}>{typeCfg.label}</Badge>
                          <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                          {contract.overtime_hours > 0 && (
                            <span className="text-xs text-red-500 font-medium">+{contract.overtime_hours}t ekstratimer</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-slate-400">
                          {[formatContractDay(contract.start_date), formatContractDay(contract.end_date)].filter(Boolean).join(' – ')}
                        </p>
                        <p className="text-sm font-medium text-slate-600">{formatHours(contract.weekly_hours)}{showWages ? ` · ${contract.hourly_rate} kr/t` : ''}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {contract.status === 'utkast' && showWages && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleSend(contract.id)} className="text-blue-600 hover:text-blue-700" title="Send til ansatt">
                            <Send className="w-4 h-4" />
                          </Button>
                        )}
                        {showWages && <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadPdf(contract)}
                          disabled={pdfLoading === contract.id}
                          className="text-slate-500 hover:text-slate-700"
                          title="Last ned PDF"
                        >
                          {pdfLoading === contract.id ? (
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>}
                        <Button type="button" variant="ghost" size="sm" onClick={() => setViewingContract(contract)} className="text-slate-500 hover:text-slate-700" title="Vis detaljer">
                          <Eye className="w-4 h-4" />
                        </Button>
                        {showWages && contract.status === 'signert_ansatt' && (
                          <Button variant="ghost" size="sm" asChild className="text-amber-700" title="Motsigner">
                            <Link to={`/kontrakt/${contract.id}?rolle=arbeidsgiver`}>Motsigner</Link>
                          </Button>
                        )}
                        {contract.status !== 'signert' && showWages && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(contract.id)} className="text-red-400 hover:text-red-600" title="Slett">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {viewingContract && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={() => setViewingContract(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-800">Kontraktdetaljer</h2>
                <button type="button" onClick={() => setViewingContract(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Ansatt</p>
                    <p className="font-semibold text-slate-800">{viewingContract.worker_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Organisasjon</p>
                    <p className="font-semibold text-slate-800">{viewingContract.org_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Type</p>
                    <Badge className={contractType(viewingContract.contract_type).color}>
                      {contractType(viewingContract.contract_type).label}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Status</p>
                    <Badge className={contractStatus(viewingContract.status).color}>
                      {contractStatus(viewingContract.status).label}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Periode</p>
                    <p className="font-semibold text-slate-800">
                      {[formatContractDay(viewingContract.start_date), formatContractDay(viewingContract.end_date)].filter(Boolean).join(' – ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Uke</p>
                    <p className="font-semibold text-slate-800">{viewingContract.week_number} / {viewingContract.year}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Timer per uke</p>
                    <p className="font-semibold text-slate-800">{formatHours(viewingContract.weekly_hours)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Ekstratimer</p>
                    <p className={`font-semibold ${viewingContract.overtime_hours > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      {formatHours(viewingContract.overtime_hours, { plus: true })}
                    </p>
                  </div>
                  {showWages && (
                  <div>
                    <p className="text-xs text-slate-400">Timelønn</p>
                    <p className="font-semibold text-slate-800">{viewingContract.hourly_rate} kr/t</p>
                  </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400">Stillingsprosent</p>
                    <p className="font-semibold text-slate-800">{viewingContract.employment_percentage}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Grunnlag</p>
                    <p className="font-semibold text-slate-800 capitalize">{viewingContract.reason}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Autogenerert</p>
                    <p className="font-semibold text-slate-800">{viewingContract.generated_automatically ? 'Ja' : 'Nei'}</p>
                  </div>
                </div>
                {formatContractDateTime(viewingContract.approved_at) && (
                  <div>
                    <p className="text-xs text-slate-400">Godkjent</p>
                    <p className="font-semibold text-emerald-600">
                      {formatContractDateTime(viewingContract.approved_at)}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
                {showWages && <Button type="button" onClick={() => handleDownloadPdf(viewingContract)} disabled={pdfLoading === viewingContract.id} className="flex-1 gap-2">
                  {pdfLoading === viewingContract.id ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Last ned PDF
                </Button>}
                {viewingContract.status === 'utkast' && showWages && (
                  <Button type="button" variant="outline" onClick={() => { handleSend(viewingContract.id); setViewingContract(null); }} className="gap-2">
                    <Send className="w-4 h-4" /> Send til ansatt
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}