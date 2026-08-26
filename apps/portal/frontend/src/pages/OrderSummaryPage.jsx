import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import ItemsTable from '../components/orders/ItemsTable.jsx';
import HazardBadge from '../components/common/HazardBadge.jsx';
import Button from '../components/common/Button.jsx';
import {
  getOrder as fetchOrder,
  getSolutionSummary as fetchSolutionSummary,
  solveOrder,
  visualiserUrl,
} from '../api/client.js';
import { formatCreated, orderTotals } from '../lib/orders.js';

export default function OrderSummaryPage() {
  const { id } = useParams();
  const { refreshOrders } = useApp();

  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState(null);
  const [packing, setPacking] = useState(false);
  const [packError, setPackError] = useState(null);
  const [solveCount, setSolveCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await fetchOrder(id);
      setOrder(loaded);
      setLoadError(null);

      if (loaded.Status === 'Packed') {
        try {
          setSummary(await fetchSolutionSummary(id));
        } catch {
          setSummary(null);
        }
      }
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const pack = async () => {
    setPacking(true);
    setPackError(null);
    try {
      await solveOrder(id);
      setSummary(await fetchSolutionSummary(id));
      setSolveCount((count) => count + 1);
      setOrder((current) => (current ? { ...current, Status: 'Packed' } : current));
      refreshOrders();
    } catch (error) {
      setPackError(error);
    } finally {
      setPacking(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-400">
        Loading order {id}...
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center">
        <p className="font-display text-xl text-ink-500">Order not available</p>
        <p className="mt-1 text-sm text-ink-400">
          {loadError ? loadError.message : 'Order not found'}
        </p>
        <Link to="/orders" className="mt-2 inline-block text-sm text-brand-500 hover:underline">
          Back to orders
        </Link>
      </div>
    );
  }

  const totals = orderTotals(order.Items);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/orders" className="text-sm text-ink-400 hover:text-ink-700">
          ← Back to orders
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-sm border border-ink-100 bg-white p-6">
        {totals.hazardCount > 0 && <HazardBadge size="ribbon" />}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-300">
              Order {order.OrderId}
            </p>
            <h2 className="font-display text-2xl font-semibold text-ink-700">
              {order.Reference}
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              Created {formatCreated(order.CreatedAt)}
            </p>
          </div>
          <span className="rounded-sm bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600">
            {order.Status}
          </span>
        </div>

        <div className="cut-line my-5" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Line items" value={order.Items.length} />
          <Stat label="Total units" value={totals.units} />
          <Stat label="Total weight" value={`${totals.weight} kg`} />
          <Stat
            label="Hazard flags"
            value={totals.hazardCount}
            accent={totals.hazardCount > 0}
          />
        </div>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 font-display text-lg font-semibold text-ink-700">Items</h3>
        <ItemsTable items={order.Items} />
      </div>

      <PackingPanel
        orderId={order.OrderId}
        packing={packing}
        summary={summary}
        solveCount={solveCount}
        error={packError}
        onPack={pack}
      />

      <div className="mt-6 flex justify-end gap-3">
        <Link to="/orders">
          <Button variant="secondary">Done</Button>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p
        className={`font-mono text-xl font-semibold ${accent ? 'text-hazard-ink' : 'text-ink-700'}`}
      >
        {value}
      </p>
    </div>
  );
}

function PackingPanel({ orderId, packing, summary, solveCount, error, onPack }) {
  const rejected = summary?.Rejected ?? [];
  const visualiser = visualiserUrl(orderId);

  return (
    <div className="mt-6 rounded-sm border border-ink-100 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-700">Packing</h3>
          <p className="mt-1 text-sm text-ink-400">
            Sends this order to FitSolver, then shows the result in FitVisualizer.
          </p>
        </div>
        <Button onClick={onPack} disabled={packing}>
          {packing ? 'Packing...' : summary ? 'Pack again' : 'Pack this order'}
        </Button>
      </div>

      {error && (
        <p className="mt-4 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {summary && (
        <>
          <div className="cut-line my-5" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Boxes" value={summary.BoxCount} />
            <Stat label="Items packed" value={summary.ItemsPacked} />
            <Stat
              label="Rejected"
              value={rejected.length}
              accent={rejected.length > 0}
            />
            <Stat label="Fill rate" value={`${Math.round(summary.FillRate * 1000) / 10}%`} />
          </div>

          {rejected.length > 0 && (
            <ul className="mt-5 space-y-2">
              {rejected.map((reject) => (
                <li
                  key={`${reject.ItemCode}-${reject.Reason}`}
                  className="rounded-sm border border-hazard/40 bg-hazard/10 p-3 text-sm text-hazard-ink"
                >
                  <span className="font-mono font-medium">{reject.ItemCode}</span> could not
                  be packed: {reject.Detail}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-wide text-ink-300">
              Packed as {orderId}
            </p>
            <a
              href={visualiser}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-brand-500 hover:underline"
            >
              Open in a new tab
            </a>
          </div>

          <iframe
            key={`${orderId}-${solveCount}`}
            src={visualiser}
            title={`FitVisualizer, order ${orderId}`}
            className="mt-3 h-[560px] w-full rounded-sm border border-ink-100 bg-white"
          />
        </>
      )}
    </div>
  );
}
