import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import Button from '../common/Button.jsx';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

const RETRY_SECONDS = 5;

const TITLES = {
  '/orders': ['Orders', 'All orders raised by your team'],
  '/orders/backlog': ['Orders', 'Manage active work and orders on hold'],
  '/orders/archived': ['Orders', 'Finalised orders retained for reference'],
  '/orders/new': ['New order', 'Add items and confirm details for packing'],
  '/packing-return': ['Packing result', 'Recording the pick packer\'s result'],
  '/boxes': ['Box Inventory', 'Reusable box types and available quantities'],
  '/users': ['User management', 'Portal roles and account access'],
};

export default function AppLayout() {
  const { identity, authInitializing, connectionError, retryConnection } = useApp();
  const location = useLocation();

  if (authInitializing) {
    return <div className="p-10 text-center text-sm text-ink-400">Restoring session…</div>;
  }

  if (!identity && connectionError) {
    return <ServerUnavailable onRetry={retryConnection} />;
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

// Shown while still signed in but the backend cannot be reached. Retries on its own.
function ServerUnavailable({ onRetry }) {
  useEffect(() => {
    const timer = window.setInterval(onRetry, RETRY_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [onRetry]);

  return (
    <div className="flex h-screen items-center justify-center bg-panel p-6">
      <div role="alert" className="max-w-md rounded-sm border border-ink-100 bg-white p-6 text-center">
        <p className="font-display text-xl font-semibold text-ink-700">Can't reach the Portal server</p>
        <p className="mt-2 text-sm text-ink-500">
          It may be waking up, which can take up to a minute. You are still signed in, and this page will
          keep trying.
        </p>
        <Button className="mt-4" onClick={onRetry}>Try again now</Button>
      </div>
    </div>
  );
}
