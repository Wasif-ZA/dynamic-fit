import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

const TITLES = {
  '/orders': ['Orders', 'All orders raised by your team'],
  '/orders/new': ['New order', 'Add items and confirm details for packing'],
  '/boxes': ['Box Inventory', 'Reusable box types and available quantities'],
  '/users': ['User management', 'Portal roles and account access'],
};

export default function AppLayout() {
  const { identity, authInitializing } = useApp();
  const location = useLocation();

  if (authInitializing) {
    return <div className="p-10 text-center text-sm text-ink-400">Restoring session…</div>;
  }

  if (!identity) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const matchedKey = Object.keys(TITLES).find((k) =>
    k === '/orders' ? location.pathname === '/orders' : location.pathname.startsWith(k)
  );
  const isOrderDetail = /^\/orders\/[^/]+$/.test(location.pathname) && !matchedKey;
  const isOrderEdit = /^\/orders\/[^/]+\/edit$/.test(location.pathname);
  const [title, subtitle] = isOrderEdit
    ? ['Edit order', 'Update items before submitting for optimisation']
    : isOrderDetail
      ? ['Order details', 'Items and status for this order']
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
