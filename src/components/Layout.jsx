import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Clock, CalendarDays, DollarSign, Menu, X, Settings, UserCircle, Smartphone, Monitor, Banknote, Ticket, ClipboardList, Building2, CheckSquare, FileText, LogOut, BarChart, CreditCard, ScrollText, Package } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import OrgOnboarding from '@/components/OrgOnboarding';
import CompanyDetailsPrompt from '@/components/CompanyDetailsPrompt';
import EmployeeNoInvite from '@/components/EmployeeNoInvite';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import DemoModeBar from '@/components/DemoModeBar';
import LegalFooter from '@/components/LegalFooter';
import { useOrg } from '@/hooks/useOrg';
import { queryClientInstance } from '@/lib/query-client';
import { claimOrgId, resolveSignupGate, resolveSignupKind } from '@/lib/signupGate';
import { findWorkerByEmail } from '@/lib/workerLookup';
import { defaultPageForRole, isPageEnabled, visibleNavItems } from '@/lib/featureFlags';
import { needsCompanyDetails } from '@/lib/orgNumber';

async function claimWorkerOrg() {
  const { data, error } = await supabase.rpc('claim_worker_card');
  // Until the migration is applied the RPC is missing. That must not crash the shell.
  if (error) return null;
  return claimOrgId(data);
}

const superAdminOnlyNav = [
  { path: '/SuperAdmin', label: 'Kunder', icon: Building2 },
  { path: '/SuperAdmin/Analytics', label: 'Analyse', icon: BarChart },
  { path: '/SuperAdmin/Billing', label: 'Fakturering', icon: CreditCard },
  { path: '/SuperAdmin/AuditLog', label: 'Driftslogg', icon: ScrollText },
];

const adminNav = [
  { path: '/Dashboard', label: 'Oversikt', icon: LayoutDashboard },
  { path: '/Workers', label: 'Ansatte', icon: Users },
  { path: '/Timesheet', label: 'Timelister', icon: CalendarDays },
  { path: '/Ukeplan', label: 'Prognose', icon: ClipboardList },
  { path: '/Tasks', label: 'Oppgaver', icon: CheckSquare },
  { path: '/Salary', label: 'Lønn', icon: DollarSign },
  { path: '/Resultat', label: 'Resultat', icon: BarChart },
  { path: '/Dagsoppgjor', label: 'Dagsoppgjør', icon: Banknote },
  { path: '/Loddtelling', label: 'Loddtelling', icon: Ticket },
  { path: '/Innskudd', label: 'Innskudd', icon: Package },
  { path: '/Contracts', label: 'Kontrakter', icon: FileText },
  { path: '/Settings', label: 'Innstillinger', icon: Settings },
];

const subAdminNav = [
  { path: '/WorkerPortal', label: 'Min side', icon: UserCircle },
  { path: '/Workers', label: 'Ansatte', icon: Users },
  { path: '/Timesheet', label: 'Timelister', icon: CalendarDays },
  { path: '/Tasks', label: 'Oppgaver', icon: CheckSquare },
  { path: '/Salary', label: 'Lønn', icon: DollarSign },
  { path: '/Resultat', label: 'Resultat', icon: BarChart },
  { path: '/Dagsoppgjor', label: 'Dagsoppgjør', icon: Banknote },
  { path: '/Loddtelling', label: 'Loddtelling', icon: Ticket },
  { path: '/Innskudd', label: 'Innskudd', icon: Package },
  { path: '/Contracts', label: 'Kontrakter', icon: FileText },
  { path: '/Settings', label: 'Innstillinger', icon: Settings },
];

const butikksjeflNav = [
  { path: '/WorkerPortal', label: 'Min side', icon: UserCircle },
  { path: '/Timesheet', label: 'Timelister', icon: CalendarDays },
  { path: '/Resultat', label: 'Resultat', icon: BarChart },
  { path: '/Dagsoppgjor', label: 'Dagsoppgjør', icon: Banknote },
  { path: '/Loddtelling', label: 'Loddtelling', icon: Ticket },
  { path: '/Innskudd', label: 'Innskudd', icon: Package },
  { path: '/Contracts', label: 'Kontrakter', icon: FileText },
  { path: '/Settings', label: 'Innstillinger', icon: Settings },
];

const workerNav = [
  { path: '/WorkerPortal', label: 'Min side', icon: UserCircle },
  { path: '/Dagsoppgjor', label: 'Dagsoppgjør', icon: Banknote },
  { path: '/Loddtelling', label: 'Loddtelling', icon: Ticket },
  { path: '/Innskudd', label: 'Innskudd', icon: Package },
];

function MobileViewToggle() {
  const [mobileView, setMobileView] = useState(() => localStorage.getItem('dashMobileView') === 'true');
  const toggle = () => {
    setMobileView(v => {
      const next = !v;
      localStorage.setItem('dashMobileView', String(next));
      window.dispatchEvent(new CustomEvent('dashMobileViewChange', { detail: next }));
      return next;
    });
  };
  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        mobileView
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {mobileView ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
      {mobileView ? 'Mobil' : 'Desktop'}
    </button>
  );
}

function NavItems({ items, location, onClick }) {
  const fullPath = location.pathname + location.search;
  return (
    <nav className="flex items-center gap-1">
      {items.map(item => {
        const isActive = item.path.includes('?')
          ? fullPath === item.path
          : location.pathname === item.path && !location.search;
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onClick}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 whitespace-nowrap",
              isActive
                ? "bg-blue-700 text-white"
                : "text-blue-200 hover:text-white hover:bg-blue-800"
            )}
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function allowedPaths(paths) {
  return paths.filter((path) => isPageEnabled(path));
}

const subAdminAllowed = allowedPaths(['/WorkerPortal', '/Workers', '/Timesheet', '/Tasks', '/Salary', '/Settings', '/Dagsoppgjor', '/Loddtelling', '/Innskudd', '/Contracts', '/Resultat']);
const butikksjefAllowed = allowedPaths(['/WorkerPortal', '/Timesheet', '/Dagsoppgjor', '/Loddtelling', '/Innskudd', '/Settings', '/Resultat', '/Contracts']);
const workerAllowed = allowedPaths(['/WorkerPortal', '/Dagsoppgjor', '/Loddtelling', '/Innskudd']);

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [canSeeResultat, setCanSeeResultat] = useState(false);

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [employeeBlocked, setEmployeeBlocked] = useState(false);
  const [onboardingUser, setOnboardingUser] = useState(null);
  const [linkAttempt, setLinkAttempt] = useState(0);
  const [linking, setLinking] = useState(false);
  const { isImpersonating, adminOrg, orgsLoaded, userId, userEmail } = useOrg();
  const showCompanyDetails = Boolean(
    orgsLoaded && needsCompanyDetails(adminOrg, { userId, userEmail, impersonating: isImpersonating })
  );

  useEffect(() => {
    let cancelled = false;
    setLinking(true);
    base44.auth.me().then(async u => {
      let role = u?.role || 'user';
      let myWorker = null;

      // If the platform role is already admin, don't downgrade via Worker entity
      const platformRole = u?.role || 'user';

      if (u?.email) {
        try {
          myWorker = await findWorkerByEmail(u.email, platformRole);
          if (myWorker && platformRole !== 'admin') {
            // Use team_roles if available: pick the highest role across all teams the worker belongs to
            const teamRoles = myWorker.team_roles || {};
            const assignedTeams = myWorker.teams || ['team1'];
            const ROLE_RANK = { admin: 4, sub_admin: 3, butikksjef: 2, user: 1 };
            const teamRoleValues = assignedTeams.map(t => teamRoles[t]).filter(Boolean);
            if (teamRoleValues.length > 0) {
              role = teamRoleValues.reduce((best, r) => (ROLE_RANK[r] || 1) > (ROLE_RANK[best] || 1) ? r : best, 'user');
            } else if (myWorker.role) {
              role = myWorker.role;
            }
          }
        } catch {}
      }

      // Determine admin scope:
      //  - Org admin  = invited platform admin who is the admin of an org (by admin_user_id or admin_email)
      //  - Superadmin = platform admin not tied to any org (system developer — sees all customers)
      if (u?.role === 'admin') {
        try {
          const orgs = await base44.entities.Organization.list();
          let myOrg = orgs.find(o => o.admin_user_id === u.id);
          // Auto-link an invited org admin by their admin_email the first time they log in
          if (!myOrg && u.email) {
            const emailMatch = orgs.find(o => o.admin_email && o.admin_email.toLowerCase() === u.email.toLowerCase());
            if (emailMatch) {
              if (!emailMatch.admin_user_id) {
                try { await base44.entities.Organization.update(emailMatch.id, { admin_user_id: u.id }); } catch {}
              }
              myOrg = emailMatch;
            }
          }
          if (myOrg) {
            // Org admin — scoped to myOrg via useOrg (normal admin flow below)
          } else {
            // Platform admin not tied to any org → superadmin (system developer)
            setIsSuperAdmin(true);
            role = 'superadmin';
          }
        } catch {}
      }

      setUserRole(role);
      const canSeeResultatFlag = myWorker?.can_see_resultat || role === 'admin' || role === 'sub_admin' || role === 'butikksjef';
      setCanSeeResultat(canSeeResultatFlag);

      let showOnboarding = false;
      let showEmployee = false;
      if (u?.terms_accepted_at && platformRole !== 'admin' && !myWorker) {
        try {
          const ownOrgs = await base44.entities.Organization.list();
          if (!ownOrgs.length) {
            let metadata = {};
            try {
              const { data: authData } = await supabase.auth.getUser();
              metadata = authData?.user?.user_metadata || {};
            } catch {}
            const signupKind = resolveSignupKind(u, metadata);
            const linkedOrg = await claimWorkerOrg();
            if (linkedOrg) {
              const reloadKey = `skiftpro.claimReload.${u.id}`;
              let reloaded = false;
              try {
                reloaded = sessionStorage.getItem(reloadKey) === '1';
                sessionStorage.setItem(reloadKey, '1');
              } catch {}
              if (!reloaded) {
                await queryClientInstance.invalidateQueries();
                if (!cancelled) window.location.assign('/WorkerPortal');
                return;
              }
            }
            const gate = resolveSignupGate({
              platformRole,
              hasWorker: false,
              hasOrg: false,
              termsAccepted: true,
              signupKind,
            });
            showOnboarding = gate === 'onboarding';
            showEmployee = gate === 'employee';
          }
        } catch {}
      }

      if (cancelled) return;
      setNeedsOnboarding(showOnboarding);
      setEmployeeBlocked(showEmployee);
      setOnboardingUser(showOnboarding || showEmployee ? u : null);
      if (showOnboarding || showEmployee) return;

      const allowed = role === 'user'
        ? [...workerAllowed, ...(myWorker?.can_see_resultat ? ['/Resultat'] : [])]
        : null;
      const isImpersonatingNow = !!localStorage.getItem('impersonate_org_id');
      const isSuperAdminPage = location.pathname === '/SuperAdmin' || location.pathname.startsWith('/SuperAdmin/');
      if (role === 'superadmin' && !isImpersonatingNow && !isSuperAdminPage) {
        navigate('/SuperAdmin', { replace: true });
      } else if (role === 'sub_admin' && !subAdminAllowed.includes(location.pathname) && !location.pathname.startsWith('/kontrakt/')) {
        navigate('/WorkerPortal', { replace: true });
      } else if (role === 'butikksjef' && !butikksjefAllowed.includes(location.pathname) && !location.pathname.startsWith('/kontrakt/')) {
        navigate('/WorkerPortal', { replace: true });
      } else if (role === 'user' && allowed && !allowed.includes(location.pathname) && !location.pathname.startsWith('/kontrakt/')) {
        navigate('/WorkerPortal', { replace: true });
      }
    }).catch(() => {
      if (!cancelled) setUserRole('user');
    }).finally(() => {
      if (!cancelled) setLinking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [linkAttempt]);

  const workerNavDynamic = canSeeResultat && userRole === 'user'
    ? [...workerNav, { path: '/Resultat', label: 'Resultat', icon: BarChart }]
    : workerNav;
  const roleNav = userRole === 'superadmin'
    ? (isImpersonating ? adminNav : superAdminOnlyNav)
    : userRole === 'admin' ? adminNav
    : userRole === 'sub_admin' ? subAdminNav
    : userRole === 'butikksjef' ? butikksjeflNav
    : userRole === 'user' ? workerNavDynamic
    : [];
  const navItems = visibleNavItems(roleNav);

  useEffect(() => {
    if (!userRole || isPageEnabled(location.pathname)) return;
    const home = defaultPageForRole(userRole, { impersonating: isImpersonating });
    if (location.pathname !== home) navigate(home, { replace: true });
  }, [userRole, isImpersonating, location.pathname, navigate]);
  const allNavItems = [...superAdminOnlyNav, ...adminNav, ...subAdminNav, ...butikksjeflNav, ...workerNav];
  const currentPage = allNavItems.find(n => n.path === location.pathname);

  if (employeeBlocked && onboardingUser) {
    return (
      <EmployeeNoInvite
        email={onboardingUser.email}
        pending={linking}
        onRetry={() => {
          try { sessionStorage.removeItem(`skiftpro.claimReload.${onboardingUser.id}`); } catch {}
          setLinkAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }

  if (needsOnboarding && onboardingUser) {
    return <OrgOnboarding userId={onboardingUser.id} userEmail={onboardingUser.email} />;
  }

  if (showCompanyDetails) {
    return <CompanyDetailsPrompt org={adminOrg} userEmail={userEmail} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col demo-shell">
      <DemoModeBar />
      <ImpersonationBanner />

      {/* Top navbar - two rows */}
      <header className="sticky top-0 demo-sticky-header" style={{zIndex: 100}}>
        {/* Row 1: deeper blue — logo + top-level links */}
        <div className="bg-blue-950 flex items-center gap-4 px-4 h-10">
          <div className="flex items-center gap-2 shrink-0">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold tracking-tight text-white">SkiftPro</span>
          </div>
          <div className="w-px h-5 bg-blue-800 shrink-0" />
          {!(userRole === 'superadmin' && !isImpersonating) && (
          <div className="hidden md:flex items-center gap-1">
            <Link to="/Dashboard"
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                location.pathname === '/Dashboard' ? "bg-blue-800 text-white" : "text-blue-200 hover:text-white hover:bg-blue-800"
              )}>
              <LayoutDashboard className="w-3.5 h-3.5" />Oversikt
            </Link>
            <Link to="/WorkerPortal"
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                location.pathname === '/WorkerPortal' ? "bg-blue-800 text-white" : "text-blue-200 hover:text-white hover:bg-blue-800"
              )}>
              <UserCircle className="w-3.5 h-3.5" />Min side
            </Link>
          </div>
          )}
          <div className="hidden md:flex items-center gap-2 ml-auto shrink-0">
            {(location.pathname === '/Dashboard' || location.pathname === '/WorkerPortal') && (
              <MobileViewToggle />
            )}
            <button
              onClick={() => base44.auth.logout()}
              title="Logg ut"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-blue-200 hover:text-white hover:bg-blue-800 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="text-sm font-medium">Logg ut</span>
            </button>
          </div>
          {/* spacer on mobile so logo stays left */}
          <div className="md:hidden ml-auto" />
          <button
            onClick={() => base44.auth.logout()}
            title="Logg ut"
            className="md:hidden fixed top-2 right-16 w-10 h-10 flex items-center justify-center rounded-md bg-blue-950 touch-manipulation pwa-safe-logout"
            style={{ zIndex: 9999 }}
          >
            <LogOut className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Row 2: nav links */}
        <div className="bg-blue-900 hidden md:flex items-center gap-1 px-4 h-10 overflow-x-auto">
          {navItems.filter(n => n.path !== '/Dashboard' && n.path !== '/WorkerPortal').map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                  isActive ? "bg-blue-700 text-white" : "text-blue-200 hover:text-white hover:bg-blue-800"
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Fixed hamburger button — always on top, never blocked */}
      <button
        className="md:hidden fixed top-2 right-3 w-10 h-10 flex items-center justify-center rounded-md bg-blue-950 touch-manipulation pwa-safe-menu"
        style={{zIndex: 9999}}
        onClick={() => setMobileOpen(v => !v)}
      >
        <Menu className="w-5 h-5 text-white" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className="relative w-60 bg-white h-full shadow-xl flex flex-col pwa-safe-menu-panel" onClick={e => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-900">SkiftPro</span>
              </div>
              <button onClick={() => setMobileOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                    className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      isActive ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    )}>
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
              {userRole === 'admin' && (
                <Link to="/WorkerPortal" onClick={() => setMobileOpen(false)}
                  className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    location.pathname === '/WorkerPortal' ? "bg-blue-50 text-blue-700" : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                  )}>
                  <UserCircle className="w-4 h-4" />Min side
                </Link>
              )}
              <button
                onClick={() => { setMobileOpen(false); base44.auth.logout(); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-400 hover:text-slate-700 hover:bg-slate-50 mt-2 border-t border-slate-100 pt-3"
              >
                <LogOut className="w-4 h-4" /> Logg ut
              </button>
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 p-4 lg:p-6">
        <Outlet />
      </main>
      <div className="px-4 py-3 border-t border-slate-200 bg-white">
        <LegalFooter />
      </div>
    </div>
  );
}