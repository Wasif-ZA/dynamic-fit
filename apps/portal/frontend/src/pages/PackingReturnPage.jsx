import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { recordPacking } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';

// The Visualiser's Done and Cancel buttons return here with ?OrderID=...&complete=true|false.
export default function PackingReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshOrders } = useApp();
  const [error, setError] = useState(null);
  const started = useRef(false);
  const orderId = params.get('OrderID');
  const complete = params.get('complete');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!orderId || !['true', 'false'].includes(complete)) {
      setError(new Error('The Visualiser did not say which order was packed.'));
      return;
    }
    recordPacking(orderId, complete === 'true')
      .then(async () => {
        await refreshOrders?.().catch(() => {});
        navigate(`/orders/${encodeURIComponent(orderId)}`, { replace: true });
      })
      .catch(setError);
  }, [orderId, complete, navigate, refreshOrders]);

  if (!error) {
    return (
      <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-400">
        Recording the packing result…
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center">
      <p className="font-display text-xl text-ink-500">Packing result not recorded</p>
      <p className="mt-1 text-sm text-ink-400">{error.message}</p>
      <Link to={orderId ? `/orders/${encodeURIComponent(orderId)}` : '/orders'} className="mt-2 inline-block text-sm text-brand-500 hover:underline">
        {orderId ? `Back to ${orderId}` : 'Back to orders'}
      </Link>
    </div>
  );
}
