import React from 'react';

export default function ItemsTable({
  items,
  onRemove,
  onEdit,
  onQuantityChange,
  emptyMessage = 'No items added yet. Use the form to add items to this order.',
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-400">
        {emptyMessage}
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
              <td className="px-3 py-2 text-ink-500">
                {onQuantityChange ? (
                  <input
                    type="number"
                    min="1"
                    className="w-20 rounded-sm border border-ink-100 px-2 py-1 font-mono text-sm"
                    value={item.Quantity}
                    onChange={(event) => onQuantityChange(idx, event.target.value)}
                    aria-label={`Quantity for ${item.ItemCode}`}
                  />
                ) : (
                  item.Quantity || 1
                )}
              </td>
              <td className="px-3 py-2 text-ink-500">
                {item.BoxGroup ? (
                  <span className="font-mono text-xs text-ink-400">{item.BoxGroup}</span>
                ) : (
                  <span className="text-ink-200">—</span>
                )}
              </td>
              {(onEdit || onRemove) && (
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-3">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(idx)}
                        className="text-xs font-medium text-brand-500 hover:text-brand-700"
                      >
                        Edit
                      </button>
                    )}
                    {onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(idx)}
                        className="text-xs font-medium text-ink-300 hover:text-red-600"
                      >
                        {onEdit ? 'Delete' : 'Remove'}
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
