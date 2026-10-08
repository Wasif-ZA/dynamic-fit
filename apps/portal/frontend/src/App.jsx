import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import OrdersListPage from './pages/OrdersListPage.jsx';
import OrderCreatePage from './pages/OrderCreatePage.jsx';
import OrderEditPage from './pages/OrderEditPage.jsx';
import OrderSummaryPage from './pages/OrderSummaryPage.jsx';
import BoxInventoryPage from './pages/BoxInventoryPage.jsx';
import UserManagementPage from './pages/UserManagementPage.jsx';
import { useApp } from './context/AppContext.jsx';
import { canManageUsers } from './lib/roles.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/orders" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        <Route path="/orders" element={<OrdersListPage />} />
        <Route path="/orders/new" element={<OrderCreatePage />} />
        <Route path="/orders/:id/edit" element={<OrderEditPage />} />
        <Route path="/orders/:id" element={<OrderSummaryPage />} />
        <Route path="/boxes" element={<BoxInventoryPage />} />
        <Route path="/users" element={<UserManagementRoute />} />
      </Route>

      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  );
}

function UserManagementRoute() {
  const { identity } = useApp();
  return canManageUsers(identity?.role)
    ? <UserManagementPage />
    : <Navigate to="/orders" replace />;
}
