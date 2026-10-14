import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Workers from '@/pages/Workers';
import Shifts from '@/pages/Shifts';
import Timesheet from '@/pages/Timesheet';
import Salary from '@/pages/Salary';
import WorkerPortal from '@/pages/WorkerPortal';
import Tasks from '@/pages/Tasks';
import Dagsoppgjor from '@/pages/Dagsoppgjor';
import Loddtelling from '@/pages/Loddtelling';
import Ukeplan from '@/pages/Ukeplan';
import Settings from '@/pages/Settings';
import SuperAdmin from '@/pages/SuperAdmin';
import SuperAdminAnalytics from '@/pages/SuperAdminAnalytics';
import SuperAdminBilling from '@/pages/SuperAdminBilling';
import SuperAdminAuditLog from '@/pages/SuperAdminAuditLog';
import Contracts from '@/pages/Contracts';
import Login from '@/pages/Login';
import ResetPassword from '@/pages/ResetPassword';
import InstallPrompt from '@/components/InstallPrompt';
import Personvern from '@/pages/Personvern';
import Vilkar from '@/pages/Vilkar';
import Databehandleravtale from '@/pages/Databehandleravtale';
import Resultat from '@/pages/Resultat';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, needsNewPassword, passwordLinkError } = useAuth();

  if (needsNewPassword || passwordLinkError) {
    return <ResetPassword />;
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/Dashboard" replace />} />
      <Route element={<Layout />}>
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Workers" element={<Workers />} />
        <Route path="/Shifts" element={<Shifts />} />
        <Route path="/Timesheet" element={<Timesheet />} />
        <Route path="/Salary" element={<Salary />} />
        <Route path="/Tasks" element={<Tasks />} />
        <Route path="/WorkerPortal" element={<WorkerPortal />} />
        <Route path="/Dagsoppgjor" element={<Dagsoppgjor />} />
        <Route path="/Loddtelling" element={<Loddtelling />} />
        <Route path="/Ukeplan" element={<Ukeplan />} />
        <Route path="/Settings" element={<Settings />} />
        <Route path="/SuperAdmin" element={<SuperAdmin />} />
        <Route path="/SuperAdmin/Analytics" element={<SuperAdminAnalytics />} />
        <Route path="/SuperAdmin/Billing" element={<SuperAdminBilling />} />
        <Route path="/SuperAdmin/AuditLog" element={<SuperAdminAuditLog />} />
        <Route path="/Contracts" element={<Contracts />} />
        <Route path="/Resultat" element={<Resultat />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/personvern" element={<Personvern />} />
            <Route path="/vilkar" element={<Vilkar />} />
            <Route path="/databehandleravtale" element={<Databehandleravtale />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
          <InstallPrompt />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App