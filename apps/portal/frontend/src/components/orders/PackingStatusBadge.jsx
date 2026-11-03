import React from 'react';
import { formatCreated } from '../../lib/orders.js';

const BADGES = {
  PACKED: { label: 'Packed', className: 'border-brand-200 bg-brand-50 text-brand-700' },
  INCOMPLETE: { label: 'Packing incomplete', className: 'border-amber-200 bg-amber-50 text-amber-800' },
};

// The pick packer's Done (Packed) or Cancel (Packing incomplete) from the Visualiser.
export default function PackingStatusBadge({ status, updatedAt }) {
  const badge = BADGES[status];
  if (!badge) return null;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-semibold ${badge.className}`}
      title={updatedAt ? `${badge.label} ${formatCreated(updatedAt)}` : undefined}
    >
      {badge.label}
    </span>
  );
}

export function packingMessage(status, updatedAt) {
  const when = updatedAt ? ` on ${formatCreated(updatedAt)}` : '';
  if (status === 'PACKED') return `The pick packer marked this order as packed${when}.`;
  if (status === 'INCOMPLETE') return `The pick packer marked packing as incomplete${when}. Open the Visualiser to finish packing, then select Done.`;
  return 'Open the Visualiser to pack this order. The pick packer selects Done when every item is packed.';
}
