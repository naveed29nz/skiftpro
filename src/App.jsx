import { lazy, Suspense, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { queryClientInstance } from '@/lib/query-client';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Login from '@/pages/Login';
import ResetPassword from '@/pages/ResetPassword';
import InstallPrompt from '@/components/InstallPrompt';
import Personvern from '@/pages/Personvern';
import Vilkar from '@/pages/Vilkar';
import Databehandleravtale from '@/pages/Databehandleravtale';
import Landing from '@/pages/Landing';

const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));
const ContractScreensPreview = import.meta.env.DEV
  ? lazy(() => import('@/pages/ContractScreensPreview'))
  : null;
const StoreSettingsPreview = import.meta.env.DEV
  ? lazy(() => import('@/pages/StoreSettingsPreview'))
  : null;
const CustomerCardPreview = import.meta.env.DEV
  ? lazy(() => import('@/pages/CustomerCardPreview'))
  : null;

function storedSessionPresent() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      if (parsed?.access_token) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function OpeningSplash() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#172554] text-white">
      <p className="text-sm tracking-wide">Åpner SkiftPro…</p>
    </div>
  );
}

function Home() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [hadToken] = useState(storedSessionPresent);
  if (isAuthenticated) return <Navigate to="/Dashboard" replace />;
  if (hadToken && isLoadingAuth) return <OpeningSplash />;
  return <Landing />;
}

function LazyApp() {
  return (
    <Suspense fallback={<OpeningSplash />}>
      <AuthenticatedApp />
    </Suspense>
  );
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/personvern" element={<Personvern />} />
            <Route path="/vilkar" element={<Vilkar />} />
            <Route path="/databehandleravtale" element={<Databehandleravtale />} />
            {import.meta.env.DEV && ContractScreensPreview && (
              <Route
                path="/dev/kontrakt-skjermer"
                element={(
                  <Suspense fallback={<OpeningSplash />}>
                    <ContractScreensPreview />
                  </Suspense>
                )}
              />
            )}
            {import.meta.env.DEV && CustomerCardPreview && (
              <Route
                path="/dev/kundekort"
                element={(
                  <Suspense fallback={<OpeningSplash />}>
                    <CustomerCardPreview />
                  </Suspense>
                )}
              />
            )}
            {import.meta.env.DEV && StoreSettingsPreview && (
              <Route
                path="/dev/butikk-innstillinger"
                element={(
                  <Suspense fallback={<OpeningSplash />}>
                    <StoreSettingsPreview />
                  </Suspense>
                )}
              />
            )}
            <Route path="/*" element={<LazyApp />} />
          </Routes>
          <InstallPrompt />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
