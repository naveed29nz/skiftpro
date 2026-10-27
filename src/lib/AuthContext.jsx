import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase, consumeAuthCallback, subscribePasswordSetup, isPasswordSetupRequired, clearPasswordSetup } from '@/api/supabaseClient';
import { queryClientInstance } from '@/lib/query-client';

function refreshShiftQueries() {
  queryClientInstance.invalidateQueries({ queryKey: ['shifts'] });
  queryClientInstance.invalidateQueries({ queryKey: ['shifts-dashboard'] });
  queryClientInstance.invalidateQueries({ queryKey: ['sa-shifts'] });
}

function dropShiftQueries() {
  queryClientInstance.removeQueries({ queryKey: ['shifts'] });
  queryClientInstance.removeQueries({ queryKey: ['shifts-dashboard'] });
  queryClientInstance.removeQueries({ queryKey: ['sa-shifts'] });
}

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const [needsNewPassword, setNeedsNewPassword] = useState(isPasswordSetupRequired);
  const [passwordLinkError, setPasswordLinkError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      if (error.status === 403) {
        setAuthError({
          type: 'user_not_registered',
          message: 'User not registered for this app',
        });
      } else {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required',
        });
      }
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  const checkAppState = useCallback(async () => {
    setIsLoadingPublicSettings(true);
    setAuthError(null);
    setAppPublicSettings({ id: 'skiftpro', public_settings: {} });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        setIsLoadingAuth(false);
        setAuthChecked(true);
      } else {
        await checkUserAuth();
      }
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({
        type: 'unknown',
        message: error.message || 'Failed to load app',
      });
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } finally {
      setIsLoadingPublicSettings(false);
    }
  }, [checkUserAuth]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribeSetup = subscribePasswordSetup(() => {
      if (!cancelled) setNeedsNewPassword(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsNewPassword(true);
      }
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        // Defer so the auth callback returns before the refetch calls getSession.
        queueMicrotask(refreshShiftQueries);
      }
      if (event === 'SIGNED_OUT') {
        clearPasswordSetup();
        setUser(null);
        setIsAuthenticated(false);
        setNeedsNewPassword(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        dropShiftQueries();
      }
    });

    (async () => {
      const result = await consumeAuthCallback();
      if (cancelled) return;
      setNeedsNewPassword(result.needsPassword);
      setPasswordLinkError(result.error);
      await checkAppState();
    })();

    return () => {
      cancelled = true;
      unsubscribeSetup();
      subscription.unsubscribe();
    };
  }, [checkAppState]);

  const logout = (shouldRedirect = true) => {
    clearPasswordSetup();
    setNeedsNewPassword(false);
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) {
      base44.auth.logout();
    } else {
      supabase.auth.signOut();
    }
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      authChecked,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState,
      checkUserAuth,
      needsNewPassword,
      passwordLinkError,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
