import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

const TITLES = {
  '/orders': ['Orders', 'All orders raised by your team'],
  '/orders/new': ['New order', 'Add items and confirm details for packing'],
};

export default function AppLayout() {
  const { user } = useApp();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const matchedKey = Object.keys(TITLES).find((k) =>
    k === '/orders' ? location.pathname === '/orders' : location.pathname.startsWith(k)
  );
  const isOrderDetail = /^\/orders\/[^/]+$/.test(location.pathname) && !matchedKey;
  const [title, subtitle] = isOrderDetail
    ? ['Order details', 'Items, flags and status for this order']
    : TITLES[matchedKey] || ['FitPortal', ''];

  return (
    <div className="flex h-screen bg-panel">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
