import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ShieldAlert, Loader2 } from 'lucide-react';

/**
 * Shows a "switch to Super Admin" banner for platform admins currently
 * linked to an org. Clicking detaches the user from any org so the next
 * load falls through to the super-admin role (Layout.jsx logic).
 *
 * NOTE: Intended for the platform developer account only. Disable/gate
 * before onboarding real customer admins, since any 'admin' user linked
 * to an org could otherwise detatch and gain super-admin access.
 */
export default function SuperAdminSwitch({ currentUser }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [linkedCount, setLinkedCount] = useState(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (currentUser?.role !== 'admin' || !currentUser?.id) { setLinkedCount(0); return; }
    base44.entities.Organization.list().then(orgs => {
      const n = orgs.filter(o =>
        o.admin_user_id === currentUser.id ||
        (o.admin_email && currentUser.email && o.admin_email.toLowerCase() === currentUser.email.toLowerCase())
      ).length;
      setLinkedCount(n);
    }).catch(() => setLinkedCount(0));
  }, [currentUser?.id, currentUser?.role, currentUser?.email]);

  // Only the platform developer account should be able to detach and regain Super Admin.
  // Customer/store admins must never see this banner.
  const DEVELOPER_EMAILS = ['naveed29nz@gmail.com'];
  const isDeveloper = DEVELOPER_EMAILS.includes((currentUser?.email || '').toLowerCase());
  if (!isDeveloper || currentUser?.role !== 'admin' || !linkedCount) return null;

  const detach = async () => {
    setBusy(true);
    try {
      const orgs = await base44.entities.Organization.list();
      const linked = orgs.filter(o =>
        o.admin_user_id === currentUser.id ||
        (o.admin_email && currentUser.email && o.admin_email.toLowerCase() === currentUser.email.toLowerCase())
      );
      for (const o of linked) {
        const patch = { admin_user_id: '' };
        if (o.admin_email && currentUser.email && o.admin_email.toLowerCase() === currentUser.email.toLowerCase()) {
          patch.admin_email = '';
        }
        await base44.entities.Organization.update(o.id, patch);
      }
      qc.invalidateQueries();
      // Reloading lets Layout re-evaluate role → super-admin (no org link)
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('Klarte ikke å koble fra: ' + (e?.message || 'ukjent feil'));
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
      <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-sm text-amber-800">
        <p className="font-semibold">Du er butikk-admin for en kunde.</p>
        <p className="text-amber-700 mt-0.5">
          For å administrere alle kunder, bytt til Super Admin-modus. Dette kobler kontoen din fra nåværende butikk.
        </p>
      </div>
      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          className="shrink-0 text-sm font-medium text-amber-800 hover:text-amber-900 underline underline-offset-2"
        >
          Bytt til Super Admin
        </button>
      ) : busy ? (
        <span className="shrink-0 flex items-center gap-1.5 text-sm text-amber-700">
          <Loader2 className="w-4 h-4 animate-spin" /> Kobler fra…
        </span>
      ) : (
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={detach}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
          >
            Bekreft
          </button>
          <button
            onClick={() => setConfirm(false)}
            className="px-3 py-1.5 rounded-lg text-sm text-amber-700 hover:bg-amber-100"
          >
            Avbryt
          </button>
        </div>
      )}
    </div>
  );
}