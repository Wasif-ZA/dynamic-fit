import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import Button from '../components/common/Button.jsx';
import HazardBadge from '../components/common/HazardBadge.jsx';
import { formatCreated, orderTotals } from '../lib/orders.js';

const STATUS_STYLE = {
  Draft: 'bg-ink-50 text-ink-500',
  Packed: 'bg-ink-700 text-white',
};

export default function OrdersListPage() {
  const { orders, ordersError, loadingOrders, refreshOrders } = useApp();

  if (loadingOrders) {
    return (
      <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-400">
        Loading orders...
      </div>
    );
  }

  if (ordersError) {
    return (
      <div className="rounded-sm border border-red-200 bg-red-50 p-10 text-center">
        <p className="font-display text-xl text-red-700">Cannot load orders</p>
        <p className="mt-1 text-sm text-red-600">{ordersError.message}</p>
        <Button className="mt-5" variant="secondary" onClick={refreshOrders}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-400">{orders.length} orders</p>
        <Link to="/orders/new">
          <Button>+ New order</Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center">
          <p className="font-display text-xl text-ink-500">No orders yet</p>
          <p className="mt-1 text-sm text-ink-400">
            Create your first order to send items to FitSolver for packing.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-sm border border-ink-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3 font-mono">Order</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const totals = orderTotals(order.Items);
                return (
                  <tr key={order.OrderId} className="cut-line hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <Link
                        to={`/orders/${order.OrderId}`}
                        className="font-mono font-medium text-brand-600 hover:underline"
                      >
                        {order.OrderId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{order.Reference}</td>
                    <td className="px-4 py-3 text-ink-500">{totals.units} units</td>
                    <td className="px-4 py-3">
                      {totals.hazardCount > 0 && <HazardBadge />}
                    </td>
                    <td className="px-4 py-3 text-ink-400">
                      {formatCreated(order.CreatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-sm px-2 py-1 text-xs font-medium ${STATUS_STYLE[order.Status] || 'bg-ink-50 text-ink-500'}`}
                      >
                        {order.Status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
