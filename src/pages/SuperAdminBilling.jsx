import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CreditCard, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';

const PLAN_PRICES = { // estimert mndpris i kr
  basic: 499,
  pro: 999,
  enterprise: 2499,
  ultimate: 4999,
};

const PLAN_LABELS = { basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise', ultimate: 'Ultimate' };

const PLAN_COLORS = {
  basic: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-orange-100 text-orange-700',
  ultimate: 'bg-rose-100 text-rose-700',
};

const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  trial: 'bg-amber-100 text-amber-700',
};

export default function SuperAdminBilling() {
  const { user } = useCurrentWorker();
  const { data: orgs = [] } = useQuery({ queryKey: ['organizations'], queryFn: () => base44.entities.Organization.list() });

  if (!user) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;

  const active = orgs.filter(o => o.status === 'active');
  const trials = orgs.filter(o => o.status === 'trial');
  const inactive = orgs.filter(o => o.status === 'inactive');

  const mrr = active.reduce((sum, o) => sum + (PLAN_PRICES[o.plan || 'basic'] || 0), 0);
  const trialMRR = trials.reduce((sum, o) => sum + (PLAN_PRICES[o.plan || 'basic'] || 0), 0);
  const arrEstimate = mrr * 12;

  // Plan distribution
  const planCounts = { basic: 0, pro: 0, enterprise: 0, ultimate: 0 };
  orgs.forEach(o => { planCounts[o.plan || 'basic']++; });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-blue-600" /> Fakturering & Abonnement
        </h1>
        <p className="text-slate-500 text-sm mt-1">Planer, prøveperioder og estimert MRR</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-emerald-600"><TrendingUp className="w-4 h-4" /><span className="text-xs text-slate-500">Estimert MRR</span></div>
          <p className="text-2xl font-bold text-slate-800 mt-1">{mrr.toLocaleString('nb-NO')} kr</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-blue-600"><CreditCard className="w-4 h-4" /><span className="text-xs text-slate-500">Estimert ARR</span></div>
          <p className="text-2xl font-bold text-slate-800 mt-1">{arrEstimate.toLocaleString('nb-NO')} kr</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-amber-600"><Clock className="w-4 h-4" /><span className="text-xs text-slate-500">Prøveperioder</span></div>
          <p className="text-2xl font-bold text-slate-800 mt-1">{trials.length}</p>
          <p className="text-xs text-slate-400">~{trialMRR.toLocaleString('nb-NO')} kr potensiale</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="w-4 h-4" /><span className="text-xs text-slate-500">Betalende</span></div>
          <p className="text-2xl font-bold text-slate-800 mt-1">{active.length}</p>
        </div>
      </div>

      {/* Plan distribution */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Fordeling per plan</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(planCounts).map(([plan, count]) => (
            <div key={plan} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[plan]}`}>{PLAN_LABELS[plan]}</span>
                <span className="text-lg font-bold text-slate-800">{count}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{PLAN_PRICES[plan].toLocaleString('nb-NO')} kr/mnd</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-customer billing */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Kunder</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Kunde</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-left font-medium">Plan</th>
                <th className="px-5 py-3 text-right font-medium">Pris/mnd</th>
                <th className="px-5 py-3 text-left font-medium">Kontakt</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-800">{o.name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status]}`}>
                      {o.status === 'active' ? 'Aktiv' : o.status === 'trial' ? 'Prøve' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[o.plan || 'basic']}`}>
                      {PLAN_LABELS[o.plan || 'basic']}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-700 font-medium">
                    {o.status === 'active' ? `${(PLAN_PRICES[o.plan || 'basic'] || 0).toLocaleString('nb-NO')} kr` : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{o.contact_email || o.admin_email || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400 italic">Priser er estimater. Koble til Stripe for faktisk betalingshåndtering.</p>
    </div>
  );
}