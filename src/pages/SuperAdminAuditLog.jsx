import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { withShiftQuery } from '@/api/shiftQuery';
import { ScrollText, UserPlus, CalendarPlus, FileText, Building2 } from 'lucide-react';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';
import { format } from 'date-fns';

const iconForType = (t) => ({
  worker: UserPlus,
  shift: CalendarPlus,
  contract: FileText,
  org: Building2,
}[t] || ScrollText);

export default function SuperAdminAuditLog() {
  const { user } = useCurrentWorker();

  const { data: orgs = [] } = useQuery({ queryKey: ['organizations'], queryFn: () => base44.entities.Organization.list() });
  const { data: workers = [] } = useQuery({ queryKey: ['sa-workers'], queryFn: () => base44.entities.Worker.list('-created_date', 100) });
  const { data: shifts = [] } = useQuery(withShiftQuery({
    queryKey: ['sa-shifts'],
    enabled: !!user,
    queryFn: () => base44.entities.Shift.list('-created_date', 100),
  }));
  const { data: contracts = [] } = useQuery({ queryKey: ['sa-contracts'], queryFn: () => base44.entities.Contract.list('-created_date', 50) });

  if (!user) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;

  const orgMap = {};
  orgs.forEach(o => { orgMap[o.id] = o.name; });

  const events = [];
  orgs.forEach(o => events.push({ type: 'org', ts: o.created_date, org: o.name, label: `Kunde opprettet: ${o.name}` }));
  workers.forEach(w => events.push({ type: 'worker', ts: w.created_date, org: orgMap[w.org_id] || '—', label: `Ny ansatt: ${w.name}` }));
  shifts.forEach(s => events.push({ type: 'shift', ts: s.created_date, org: orgMap[s.org_id] || '—', label: `Ny vakt: ${s.worker_name || '—'} (${s.date})` }));
  contracts.forEach(c => events.push({ type: 'contract', ts: c.created_date, org: orgMap[c.org_id] || '—', label: `Kontrakt: ${c.worker_name || '—'} (${c.contract_type})` }));
  events.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  const recent = events.slice(0, 60);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ScrollText className="w-6 h-6 text-blue-600" /> Driftslogg
        </h1>
        <p className="text-slate-500 text-sm mt-1">Siste aktivitet på tvers av alle kunder</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {recent.map((e, i) => {
            const Icon = iconForType(e.type);
            return (
              <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 truncate">{e.label}</p>
                  <p className="text-xs text-slate-400">{e.org}</p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {e.ts ? format(new Date(e.ts), 'dd.MM.yyyy HH:mm') : '—'}
                </span>
              </div>
            );
          })}
          {recent.length === 0 && (
            <div className="px-5 py-12 text-center text-slate-400 text-sm">Ingen aktivitet registrert</div>
          )}
        </div>
      </div>
    </div>
  );
}