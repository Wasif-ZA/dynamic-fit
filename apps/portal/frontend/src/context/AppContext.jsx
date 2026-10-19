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
  listOrders,
  setAccessToken,
  setAuthStatusHandler,
} from '../api/client.js';
import { requireSupabase, supabase } from '../auth/supabase.js';

const AppContext = createContext(null);

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
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const authGeneration = useRef(0);

  const clearAuthState = useCallback((error = null) => {
    authGeneration.current += 1;
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
      } catch (initializationError) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        if (active) clearAuthState(initializationError);
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
        } catch (sessionError) {
          if (active) clearAuthState(sessionError);
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

  const logout = async () => {
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
      login,
      logout,
      orders,
      ordersError,
      loadingOrders,
      refreshOrders,
      addOrder,
    }),
    [identity, authInitializing, authError, orders, ordersError, loadingOrders, refreshOrders]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
