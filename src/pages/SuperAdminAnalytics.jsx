import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart, Users, CalendarDays, FileText, CheckSquare, Ticket, Banknote, Activity } from 'lucide-react';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminAnalytics() {
  const { user } = useCurrentWorker();

  const { data: orgs = [] } = useQuery({ queryKey: ['organizations'], queryFn: () => base44.entities.Organization.list() });
  const { data: workers = [] } = useQuery({ queryKey: ['sa-workers'], queryFn: () => base44.entities.Worker.list() });
  const { data: shifts = [] } = useQuery({ queryKey: ['sa-shifts'], queryFn: () => base44.entities.Shift.list('-date', 1000) });
  const { data: contracts = [] } = useQuery({ queryKey: ['sa-contracts'], queryFn: () => base44.entities.Contract.list('-created_date', 500) });
  const { data: tasks = [] } = useQuery({ queryKey: ['sa-tasks'], queryFn: () => base44.entities.Task.list('-created_date', 500) });
  const { data: lodds = [] } = useQuery({ queryKey: ['sa-loddtelling'], queryFn: () => base44.entities.Loddtelling.list('-uke_nummer', 500) });
  const { data: oppgjor = [] } = useQuery({ queryKey: ['sa-dagsoppgjor'], queryFn: () => base44.entities.Dagsoppgjor.list('-created_date', 500) });

  if (!user) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;

  const activeWorkers = workers.filter(w => w.status !== 'inactive');
  const completedShifts = shifts.filter(s => s.status === 'completed');
  const approvedContracts = contracts.filter(c => c.status === 'godkjent');
  const openTasks = tasks.filter(t => t.status === 'open');

  // Per-org breakdown
  const perOrg = orgs.map(o => {
    const ws = workers.filter(w => w.org_id === o.id);
    const sh = shifts.filter(s => s.org_id === o.id);
    const ct = contracts.filter(c => c.org_id === o.id);
    return {
      org: o,
      workers: ws.length,
      shifts: sh.length,
      contracts: ct.length,
    };
  }).sort((a, b) => b.shifts - a.shifts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart className="w-6 h-6 text-blue-600" /> Platanalyse
        </h1>
        <p className="text-slate-500 text-sm mt-1">Aggregerte tall på tvers av alle kunder</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Aktive ansatte" value={activeWorkers.length} color="bg-purple-100 text-purple-600" />
        <StatCard icon={CalendarDays} label="Vakter totalt" value={shifts.length} color="bg-blue-100 text-blue-600" />
        <StatCard icon={CheckSquare} label="Fullførte vakter" value={completedShifts.length} color="bg-emerald-100 text-emerald-600" />
        <StatCard icon={FileText} label="Kontrakter" value={contracts.length} color="bg-orange-100 text-orange-600" />
        <StatCard icon={Activity} label="Godkjente kontrakter" value={approvedContracts.length} color="bg-rose-100 text-rose-600" />
        <StatCard icon={CheckSquare} label="Åpne oppgaver" value={openTasks.length} color="bg-amber-100 text-amber-600" />
        <StatCard icon={Ticket} label="Lodd-tellinger" value={lodds.length} color="bg-cyan-100 text-cyan-600" />
        <StatCard icon={Banknote} label="Dagsoppgjør" value={oppgjor.length} color="bg-indigo-100 text-indigo-600" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Aktivitet per kunde</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Kunde</th>
                <th className="px-5 py-3 text-right font-medium">Ansatte</th>
                <th className="px-5 py-3 text-right font-medium">Vakter</th>
                <th className="px-5 py-3 text-right font-medium">Kontrakter</th>
              </tr>
            </thead>
            <tbody>
              {perOrg.map(r => (
                <tr key={r.org.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-800">{r.org.name}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{r.workers}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{r.shifts}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{r.contracts}</td>
                </tr>
              ))}
              {perOrg.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">Ingen data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}