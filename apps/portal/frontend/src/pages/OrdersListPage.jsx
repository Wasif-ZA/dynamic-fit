import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import Button from '../components/common/Button.jsx';
import { formatCreated, orderTotals } from '../lib/orders.js';
import OrderStatusBadge from '../components/orders/OrderStatusBadge.jsx';
import OrderHandlingBadge from '../components/orders/OrderHandlingBadge.jsx';
import { listOrders } from '../api/client.js';
import { canManageOrders } from '../lib/roles.js';
import OrderManagementActions from '../components/orders/OrderManagementActions.jsx';

export default function OrdersListPage({ view = 'active' }) {
  const { identity, orders, ordersError, loadingOrders, refreshOrders, handlingSettings } = useApp();
  const navigate = useNavigate();
  const [viewOrders, setViewOrders] = useState([]);
  const [viewError, setViewError] = useState(null);
  const [loadingView, setLoadingView] = useState(view !== 'active');
  const viewGeneration = useRef(0);
  const loadView = useCallback(async () => {
    const generation = ++viewGeneration.current;
    setLoadingView(true);
    try {
      const loaded = await listOrders({ view });
      if (generation !== viewGeneration.current) return;
      setViewOrders(loaded);
      setViewError(null);
    } catch (error) {
      if (generation === viewGeneration.current) setViewError(error);
    } finally {
      if (generation === viewGeneration.current) setLoadingView(false);
    }
  }, [view]);
  useEffect(() => {
    if (view !== 'active') loadView();
    return () => { viewGeneration.current += 1; };
  }, [view, loadView]);
  const refresh = async () => {
    await refreshOrders();
    if (view !== 'active') await loadView();
  };
  const displayedOrders = view === 'active' ? orders : viewOrders;
  const error = view === 'active' ? ordersError : viewError;
  const managers = canManageOrders(identity?.role) && view !== 'archived';
  const loading = view === 'active' ? loadingOrders : loadingView;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-500">
          {view === 'backlog'
            ? managers
              ? 'Your backlog of paused orders. Select Resume to continue where you left off.'
              : 'Your backlog of paused orders. A Supervisor or Administrator can resume an order.'
            : view === 'archived'
              ? 'Finalised orders kept for reference. Orders move here automatically one month after finalisation.'
              : canManageOrders(identity?.role)
                ? 'Manage current orders. Put unfinished work on hold when you need to come back to it later.'
                : 'View your team’s current orders and their packing results.'}
        </p>
        <Link to="/orders/new">
          <Button>+ New order</Button>
        </Link>
      </div>
      <nav aria-label="Order views" className="mb-5 flex items-center gap-1 border-b border-ink-200 text-sm">
        {[
          ['active', '/orders', 'Active orders'],
          ['backlog', '/orders/backlog', 'On hold'],
          ['archived', '/orders/archived', 'Archive'],
        ].map(([key, to, label]) => (
          <Link
            key={key} to={to} aria-current={view === key ? 'page' : undefined}
            className={`border-b-2 px-4 py-3 transition-colors ${key === 'archived' ? '' : 'font-semibold'} ${view === key ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-700'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {loading ? (
        <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-400" role="status">
          Loading orders...
        </div>
      ) : error ? (
        <div className="rounded-sm border border-red-200 bg-red-50 p-10 text-center" role="alert">
          <p className="font-display text-xl text-red-700">Cannot load orders</p>
          <p className="mt-1 text-sm text-red-600">{error.message}</p>
          <Button className="mt-5" variant="secondary" onClick={refresh}>Try again</Button>
        </div>
      ) : displayedOrders.length === 0 ? (
        <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center">
          <p className="font-display text-xl text-ink-500">{view === 'backlog' ? 'No orders on hold' : view === 'archived' ? 'No archived orders' : 'No active orders'}</p>
          <p className="mt-1 text-sm text-ink-400">
            {view === 'backlog'
              ? 'Put an unfinished order on hold to return to it later.'
              : view === 'archived'
                ? 'Finalised orders move here automatically after one month, or can be archived earlier.'
                : 'Create an order to send items to FitSolver for packing.'}
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-ink-500">
            {displayedOrders.length} {view !== 'backlog' && `${view} `}{displayedOrders.length === 1 ? 'order' : 'orders'}{view === 'backlog' && ' on hold'}
          </p>
          <div className="overflow-x-auto rounded-sm border border-ink-100 bg-white">
            <table className="w-full text-center text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="w-px whitespace-nowrap px-[2ch] py-3 font-mono text-sm">
                    <span className="grid grid-cols-[1.25rem_1fr] items-center gap-x-[2ch]">
                      <span aria-hidden="true" />
                      <span className="text-xs">Order</span>
                    </span>
                  </th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">{view === 'backlog' ? 'On hold since' : view === 'archived' ? 'Archived' : 'Created'}</th>
                  <th className="px-4 py-3 text-center">{view === 'backlog' ? 'Progress saved' : 'Status'}</th>
                  {managers && (
                    <th className="px-4 py-3 text-left">
                      <span className="inline-block w-20 text-center">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayedOrders.map((order) => {
                  const totals = orderTotals(order.Items);
                  return (
                    <tr
                      key={order.OrderId}
                      className="order-row cursor-pointer"
                      onClick={(event) => {
                        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        if (event.target.closest('a, button, input, select, textarea, [role="dialog"], [role="tooltip"]')) return;
                        if (globalThis.getSelection?.()?.toString()) return;
                        navigate(`/orders/${order.OrderId}`);
                      }}
                    >
                      <td className="w-px whitespace-nowrap px-[2ch] py-3 font-mono">
                        <span className="grid grid-cols-[1.25rem_1fr] items-center gap-x-[2ch]">
                          <span className="flex w-5 items-center justify-center">
                            <OrderHandlingBadge compact items={order.Items} maxPackedWeightKg={order.MaxPackedWeightKg}
                              thresholdKg={handlingSettings?.WarningThresholdKg}
                              onSettingsClick={() => navigate('/boxes#handling-warnings')} />
                          </span>
                          <Link
                            to={`/orders/${order.OrderId}`}
                            className="inline-flex min-h-8 items-center justify-center rounded-sm font-medium text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            {order.OrderId}
                          </Link>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-700">
                        <Link
                          to={`/orders/${order.OrderId}`}
                          aria-label={`Open order ${order.OrderId}: ${order.Reference}`}
                          className="inline-flex min-h-8 items-center justify-center rounded-sm px-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          {order.Reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-500">{totals.units} units</td>
                      <td className="px-4 py-3 text-ink-400">
                        {formatCreated(view === 'backlog' ? order.HeldAt : view === 'archived' ? order.ArchivedAt : order.CreatedAt)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <OrderStatusBadge orderId={order.OrderId} status={order.Status} rejectedCount={order.RejectedCount} />
                      </td>
                      {managers && (
                        <td className="min-w-[13rem] px-4 py-3 text-left">
                          <OrderManagementActions
                            order={order}
                            onChanged={async (action) => {
                              await refresh();
                              if (action === 'resume') navigate(`/orders/${order.OrderId}`);
                            }}
                            onDeleted={refresh}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
