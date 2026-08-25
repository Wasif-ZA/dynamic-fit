import React from 'react';
import HazardBadge from '../common/HazardBadge.jsx';

export default function ItemsTable({ items, onRemove }) {
  if (items.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-400">
        No items added yet. Use the form to add items to this order.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-sm border border-ink-100 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
          <tr>
            <th className="px-3 py-2 font-mono">Code</th>
            <th className="px-3 py-2">Reference</th>
            <th className="px-3 py-2 font-mono">W×L×D (mm)</th>
            <th className="px-3 py-2 font-mono">Weight</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Box group</th>
            <th className="px-3 py-2"></th>
            {onRemove && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={`${item.ItemCode}-${idx}`} className="cut-line">
              <td className="px-3 py-2 font-mono text-ink-600">{item.ItemCode}</td>
              <td className="px-3 py-2 text-ink-700">{item.ItemReference}</td>
              <td className="px-3 py-2 font-mono text-ink-500">
                {item.Width}×{item.Length}×{item.Depth}
              </td>
              <td className="px-3 py-2 font-mono text-ink-500">{item.Weight} kg</td>
              <td className="px-3 py-2 text-ink-500">{item.qty || 1}</td>
              <td className="px-3 py-2 text-ink-500">
                {item.BoxGroup ? (
                  <span className="font-mono text-xs text-ink-400">{item.BoxGroup}</span>
                ) : (
                  <span className="text-ink-200">—</span>
                )}
              </td>
              <td className="px-3 py-2">{item.Hazardous && <HazardBadge />}</td>
              {onRemove && (
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="text-xs font-medium text-ink-300 hover:text-red-600"
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
