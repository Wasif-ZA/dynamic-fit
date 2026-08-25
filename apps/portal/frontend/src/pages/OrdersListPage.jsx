import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import Button from '../components/common/Button.jsx';
import HazardBadge from '../components/common/HazardBadge.jsx';

const STATUS_STYLE = {
  Draft: 'bg-ink-50 text-ink-500',
  'Ready to pack': 'bg-brand-50 text-brand-600',
  Packed: 'bg-ink-700 text-white',
};

export default function OrdersListPage() {
  const { orders } = useApp();

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
                const hasHazard = order.items.some((i) => i.Hazardous);
                return (
                  <tr key={order.id} className="cut-line hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-mono font-medium text-brand-600 hover:underline"
                      >
                        {order.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{order.reference}</td>
                    <td className="px-4 py-3 text-ink-500">
                      {order.items.reduce((sum, i) => sum + (i.qty || 1), 0)} units
                    </td>
                    <td className="px-4 py-3">{hasHazard && <HazardBadge />}</td>
                    <td className="px-4 py-3 text-ink-400">{order.createdAt}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-sm px-2 py-1 text-xs font-medium ${STATUS_STYLE[order.status] || 'bg-ink-50 text-ink-500'}`}
                      >
                        {order.status}
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
