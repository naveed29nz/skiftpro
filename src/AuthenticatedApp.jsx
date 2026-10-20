import { Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { useAuth } from '@/lib/AuthContext';
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
import Innskudd from '@/pages/Innskudd';
import Loddtelling from '@/pages/Loddtelling';
import Ukeplan from '@/pages/Ukeplan';
import Settings from '@/pages/Settings';
import SuperAdmin from '@/pages/SuperAdmin';
import SuperAdminAnalytics from '@/pages/SuperAdminAnalytics';
import SuperAdminBilling from '@/pages/SuperAdminBilling';
import SuperAdminAuditLog from '@/pages/SuperAdminAuditLog';
import Contracts from '@/pages/Contracts';
import ContractSign from '@/pages/ContractSign';
import EmployeeSignedThanks from '@/components/contracts/EmployeeSignedThanks';
import ResetPassword from '@/pages/ResetPassword';
import Resultat from '@/pages/Resultat';

export default function AuthenticatedApp() {
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
        <Route element={<Layout />}>
          <Route path="/Dashboard" element={<Dashboard />} />
          <Route path="/Workers" element={<Workers />} />
          <Route path="/Shifts" element={<Shifts />} />
          <Route path="/Timesheet" element={<Timesheet />} />
          <Route path="/Salary" element={<Salary />} />
          <Route path="/Tasks" element={<Tasks />} />
          <Route path="/WorkerPortal" element={<WorkerPortal />} />
          <Route path="/Dagsoppgjor" element={<Dagsoppgjor />} />
          <Route path="/Innskudd" element={<Innskudd />} />
          <Route path="/Loddtelling" element={<Loddtelling />} />
          <Route path="/Ukeplan" element={<Ukeplan />} />
          <Route path="/Settings" element={<Settings />} />
          <Route path="/SuperAdmin" element={<SuperAdmin />} />
          <Route path="/SuperAdmin/Analytics" element={<SuperAdminAnalytics />} />
          <Route path="/SuperAdmin/Billing" element={<SuperAdminBilling />} />
          <Route path="/SuperAdmin/AuditLog" element={<SuperAdminAuditLog />} />
          <Route path="/Contracts" element={<Contracts />} />
          <Route path="/kontrakt/:contractId/takk" element={<EmployeeSignedThanks />} />
          <Route path="/kontrakt/:contractId" element={<ContractSign />} />
          <Route path="/Resultat" element={<Resultat />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}
