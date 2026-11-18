// @ts-nocheck
import { Link } from 'react-router-dom';
import { Bell, Check, X } from 'lucide-react';

const KIND = {
  unsigned: { label: 'Kontrakt', className: 'bg-blue-100 text-blue-800' },
  expiring: { label: 'Utløper', className: 'bg-amber-100 text-amber-800' },
  draft: { label: 'Utkast', className: 'bg-orange-100 text-orange-800' },
  open: { label: 'Ledig', className: 'bg-emerald-100 text-emerald-800' },
  hours: { label: 'Timeliste', className: 'bg-violet-100 text-violet-800' },
};

export function alertBadgeCount(count) {
  if (!count) return '';
  return count > 9 ? '9+' : String(count);
}

export default function AlertPanel({ alerts = [], loading = false, onRead, onDismiss, onNavigate }) {
  return (
    <div className="w-full" data-testid="alert-panel">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Varselsenter</p>
          <p className="text-xs text-slate-500">Ting som bør følges opp. Ingen e-post sendes.</p>
        </div>
        <Bell className="h-4 w-4 text-slate-400" />
      </div>
      {loading ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">Henter varsler…</p>
      ) : alerts.length === 0 ? (
        <div className="px-4 py-10 text-center" data-testid="alert-empty">
          <Bell className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">Ingen åpne varsler</p>
          <p className="mt-1 text-xs text-slate-400">Kontrakter, utkast og ledige vakter ser oppdatert ut.</p>
        </div>
      ) : (
        <ul className="max-h-[min(28rem,70vh)] divide-y divide-slate-100 overflow-y-auto">
          {alerts.map((alert) => {
            const kind = KIND[alert.kind] || KIND.hours;
            return (
              <li key={alert.key} className={`px-4 py-3 ${alert.read ? 'bg-white' : 'bg-blue-50/40'}`} data-testid={`alert-${alert.kind}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${kind.className}`}>{kind.label}</span>
                  {!alert.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                </div>
                <Link
                  to={alert.href}
                  className="mt-1.5 block text-sm font-medium text-slate-900 hover:text-blue-700"
                  onClick={() => onNavigate?.(alert)}
                >
                  {alert.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">{alert.detail}</p>
                <div className="mt-2 flex gap-2">
                  {!alert.read && (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100" onClick={() => onRead?.(alert)}>
                      <Check className="h-3 w-3" /> Lest
                    </button>
                  )}
                  <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100" onClick={() => onDismiss?.(alert)}>
                    <X className="h-3 w-3" /> Skjul
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
