import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createOrder,
  getCurrentProfile,
  getManualHandlingSettings,
  listOrders,
  setAccessToken,
  setAuthStatusHandler,
  updateManualHandlingSettings,
} from '../api/client.js';
import { requireSupabase, supabase } from '../auth/supabase.js';

const AppContext = createContext(null);

// Only the server saying "no" ends a session. A backend that is asleep or
// unreachable (Render's free plan sleeps) should not sign anyone out.
function sessionRejected(error) {
  return error?.status === 401 || error?.status === 403;
}

function toIdentity(profile) {
  return {
    id: profile.Id,
    authUserId: profile.AuthUserId,
    email: profile.Email,
    name: profile.DisplayName || profile.Email,
    role: profile.Role,
    status: profile.Status,
  };
}

export function AppProvider({ children }) {
  const [identity, setIdentity] = useState(null);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const authGeneration = useRef(0);
  const [handlingSettings, setHandlingSettings] = useState(null);
  const [handlingSettingsError, setHandlingSettingsError] = useState(null);
  const [loadingHandlingSettings, setLoadingHandlingSettings] = useState(false);
  const handlingGeneration = useRef(0);

  const clearAuthState = useCallback((error = null) => {
    authGeneration.current += 1;
    handlingGeneration.current += 1;
    setHandlingSettings(null);
    setHandlingSettingsError(null);
    setLoadingHandlingSettings(false);
    setAccessToken(null);
    setIdentity(null);
    setOrders([]);
    setAuthError(error);
  }, []);

  const applySession = useCallback(async (session) => {
    const generation = ++authGeneration.current;
    setAccessToken(session?.access_token ?? null);
    if (!session) {
      if (generation === authGeneration.current) setIdentity(null);
      return null;
    }
    let profile;
    try {
      profile = await getCurrentProfile({ skipAuthStatus: true });
    } catch (error) {
      if (generation !== authGeneration.current) return null;
      throw error;
    }
    if (generation !== authGeneration.current) return null;
    const nextIdentity = toIdentity(profile);
    setIdentity(nextIdentity);
    return nextIdentity;
  }, []);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setAuthError(new Error('Supabase authentication is not configured. Check frontend/.env.'));
      setAuthInitializing(false);
      return undefined;
    }

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      try {
        if (error) throw error;
        await applySession(data.session);
        setAuthError(null);
        setConnectionError(null);
      } catch (initializationError) {
        if (error || sessionRejected(initializationError)) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          if (active) clearAuthState(initializationError);
        } else if (active) {
          setConnectionError(initializationError);
        }
      } finally {
        if (active) setAuthInitializing(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      window.setTimeout(async () => {
        if (!active) return;
        try {
          await applySession(session);
          setAuthError(null);
          setConnectionError(null);
        } catch (sessionError) {
          if (!active) return;
          if (sessionRejected(sessionError)) clearAuthState(sessionError);
          else setConnectionError(sessionError);
        }
      }, 0);
    });

    return () => {
      active = false;
      authGeneration.current += 1;
      listener.subscription.unsubscribe();
    };
  }, [applySession, clearAuthState]);

  useEffect(() => {
    setAuthStatusHandler(async ({ status, path }) => {
      if (status === 401) {
        clearAuthState(new Error('Your session is invalid or has expired. Sign in again.'));
        await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
        return;
      }
      if (status === 403 && path !== '/auth/me') {
        try {
          const { data } = await supabase.auth.getSession();
          await applySession(data.session);
        } catch (error) {
          if (!sessionRejected(error)) return;
          clearAuthState(error);
          await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
        }
      }
    });
    return () => setAuthStatusHandler(null);
  }, [applySession, clearAuthState]);

  const login = async (email, password) => {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    try {
      const signedIn = await applySession(data.session);
      setAuthError(null);
      return signedIn;
    } catch (profileError) {
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      clearAuthState(profileError);
      throw profileError;
    }
  };

  // Try loading the signed-in profile again after the backend was unreachable.
  const retryConnection = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      await applySession(data.session);
      setAuthError(null);
      setConnectionError(null);
    } catch (retryError) {
      if (sessionRejected(retryError)) {
        setConnectionError(null);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        clearAuthState(retryError);
      } else {
        setConnectionError(retryError);
      }
    }
  }, [applySession, clearAuthState]);

  const logout = async () => {
    setConnectionError(null);
    clearAuthState();
    if (supabase) await supabase.auth.signOut();
  };

  const refreshOrders = useCallback(async () => {
    if (!identity) return;
    setLoadingOrders(true);
    try {
      setOrders(await listOrders());
      setOrdersError(null);
    } catch (error) {
      setOrdersError(error);
    } finally {
      setLoadingOrders(false);
    }
  }, [identity]);

  useEffect(() => {
    if (!authInitializing && identity) refreshOrders();
  }, [authInitializing, identity, refreshOrders]);

  const refreshHandlingSettings = useCallback(async () => {
    if (!identity) return;
    const generation = ++handlingGeneration.current;
    setLoadingHandlingSettings(true);
    try {
      const settings = await getManualHandlingSettings();
      if (generation === handlingGeneration.current) {
        setHandlingSettings(settings);
        setHandlingSettingsError(null);
      }
    } catch (error) {
      if (generation === handlingGeneration.current) setHandlingSettingsError(error);
    } finally {
      if (generation === handlingGeneration.current) setLoadingHandlingSettings(false);
    }
  }, [identity]);

  const saveHandlingSettings = useCallback(async (threshold) => {
    const generation = ++handlingGeneration.current;
    try {
      const settings = await updateManualHandlingSettings(threshold);
      if (generation === handlingGeneration.current) {
        setHandlingSettings(settings);
        setHandlingSettingsError(null);
      }
      return settings;
    } finally {
      if (generation === handlingGeneration.current) setLoadingHandlingSettings(false);
    }
  }, []);

  useEffect(() => {
    if (authInitializing || !identity) return undefined;
    refreshHandlingSettings();
    window.addEventListener('focus', refreshHandlingSettings);
    return () => {
      handlingGeneration.current += 1;
      window.removeEventListener('focus', refreshHandlingSettings);
    };
  }, [authInitializing, identity, refreshHandlingSettings]);

  const addOrder = async ({ items }) => {
    const created = await createOrder({ items });
    setOrders((previous) => [created, ...previous]);
    return created.OrderId;
  };

  const value = useMemo(
    () => ({
      identity,
      authInitializing,
      authError,
      connectionError,
      retryConnection,
      login,
      logout,
      orders,
      ordersError,
      loadingOrders,
      refreshOrders,
      addOrder,
      handlingSettings,
      handlingSettingsError,
      loadingHandlingSettings,
      refreshHandlingSettings,
      saveHandlingSettings,
    }),
    [identity, authInitializing, authError, connectionError, retryConnection, orders, ordersError, loadingOrders, refreshOrders,
      handlingSettings, handlingSettingsError, loadingHandlingSettings, refreshHandlingSettings, saveHandlingSettings]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
