import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import ItemsTable from '../components/orders/ItemsTable.jsx';
import HazardBadge from '../components/common/HazardBadge.jsx';
import Button from '../components/common/Button.jsx';

export default function OrderSummaryPage() {
  const { id } = useParams();
  const { getOrder } = useApp();
  const order = getOrder(id);

  if (!order) {
    return (
      <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center">
        <p className="font-display text-xl text-ink-500">Order not found</p>
        <Link to="/orders" className="mt-2 inline-block text-sm text-brand-500 hover:underline">
          Back to orders
        </Link>
      </div>
    );
  }

  const hazardItems = order.items.filter((i) => i.Hazardous);
  const units = order.items.reduce((sum, i) => sum + (i.qty || 1), 0);
  const weight = order.items.reduce((sum, i) => sum + i.Weight * (i.qty || 1), 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/orders" className="text-sm text-ink-400 hover:text-ink-700">
          ← Back to orders
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-sm border border-ink-100 bg-white p-6">
        {hazardItems.length > 0 && <HazardBadge size="ribbon" />}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-300">
              Order {order.id}
            </p>
            <h2 className="font-display text-2xl font-semibold text-ink-700">
              {order.reference}
            </h2>
            <p className="mt-1 text-sm text-ink-400">Created {order.createdAt}</p>
          </div>
          <span className="rounded-sm bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600">
            {order.status}
          </span>
        </div>

        <div className="cut-line my-5" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Line items" value={order.items.length} />
          <Stat label="Total units" value={units} />
          <Stat label="Total weight" value={`${Math.round(weight * 100) / 100} kg`} />
          <Stat
            label="Hazard flags"
            value={hazardItems.length}
            accent={hazardItems.length > 0}
          />
        </div>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 font-display text-lg font-semibold text-ink-700">Items</h3>
        <ItemsTable items={order.items} />
      </div>

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
