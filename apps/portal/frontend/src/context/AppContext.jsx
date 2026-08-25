import React, { createContext, useContext, useMemo, useState } from 'react';
import { SEED_ORDERS } from '../data/mockData.js';

const AppContext = createContext(null);

let nextOrderNumber = 1003;

export function AppProvider({ children }) {
  // Mock auth only - no backend call yet. Any credentials "succeed".
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState(SEED_ORDERS);

  const login = (email) => setUser({ email, name: email.split('@')[0] });
  const logout = () => setUser(null);

  const addOrder = (order) => {
    const id = `ORD-${nextOrderNumber++}`;
    const newOrder = {
      id,
      status: 'Draft',
      createdAt: new Date().toISOString().slice(0, 10),
      ...order,
    };
    setOrders((prev) => [newOrder, ...prev]);
    return id;
  };

  const getOrder = (id) => orders.find((o) => o.id === id);

  const value = useMemo(
    () => ({ user, login, logout, orders, addOrder, getOrder }),
    [user, orders]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
