import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createOrder, listOrders } from '../api/client.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Mock auth only - no backend call yet. Any credentials "succeed".
  const [user, setUser] = useState(null);

  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const login = (email) => setUser({ email, name: email.split('@')[0] });
  const logout = () => setUser(null);

  const refreshOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      setOrders(await listOrders());
      setOrdersError(null);
    } catch (error) {
      setOrdersError(error);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  const addOrder = async ({ reference, items }) => {
    const created = await createOrder({ reference, items });
    setOrders((previous) => [created, ...previous]);
    return created.OrderId;
  };

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      orders,
      ordersError,
      loadingOrders,
      refreshOrders,
      addOrder,
    }),
    [user, orders, ordersError, loadingOrders, refreshOrders]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
