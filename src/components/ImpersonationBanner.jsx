import { Shield, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/hooks/useOrg';

/**
 * Yellow banner shown while a SuperAdmin is impersonating a customer org.
 * Lets them exit and return to the SuperAdmin dashboard at any time.
 */
export default function ImpersonationBanner() {
  const { isImpersonating, impersonatedOrg } = useOrg();
  const navigate = useNavigate();

  if (!isImpersonating) return null;

  const exitImpersonation = () => {
    localStorage.removeItem('impersonate_org_id');
    navigate('/SuperAdmin');
    window.location.reload();
  };

  return (
    <div className="bg-amber-500 text-white px-4 py-1.5 flex items-center justify-between text-sm shadow-md sticky top-0 z-[110]">
      <div className="flex items-center gap-2 min-w-0">
        <Shield className="w-4 h-4 shrink-0" />
        <span className="font-semibold shrink-0">SuperAdmin-støtte:</span>
        <span className="truncate">Logget inn som <strong className="truncate">{impersonatedOrg?.name || 'kunde'}</strong> — du ser alle data for denne kunden.</span>
      </div>
      <button
        onClick={exitImpersonation}
        className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded font-medium shrink-0 ml-3"
      >
        <X className="w-3.5 h-3.5" /> Avslutt support
      </button>
    </div>
  );
}