import React from 'react';
import { needsHandlingWarning, packedWeightKg } from '../../lib/manualHandling.js';
import InfoTooltip from '../common/InfoTooltip.jsx';

export default function PackedHandlingWarnings({ solution, summary, thresholdKg }) {
  const boxes = solution?.cartons
    ? solution.cartons.map((carton, index) => ({ id: carton.carton_id, number: index + 1, reference: carton.sku, weight: packedWeightKg(carton) }))
    : (summary?.Boxes ?? []).map((box, index) => ({ id: box.CartonId, number: index + 1, reference: box.BoxType, weight: box.PackedWeightKg }));
  const warnings = boxes.filter((box) => needsHandlingWarning(box.weight, thresholdKg));
  if (warnings.length === 0) return null;
  return (
    <section aria-label="Packed box handling warnings" className="mt-4 rounded-sm border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-center gap-1 font-semibold">
        {warnings.length} heavy {warnings.length === 1 ? 'box' : 'boxes'}
        <InfoTooltip label="About heavy boxes" description="Weight threshold reached." className="h-4 w-4 text-amber-700" />
      </p>
      <ul className="mt-2 space-y-1">
        {warnings.slice(0, 5).map((box) => (
          <li key={box.id} className="flex flex-wrap items-center gap-2">
            Box {box.number} · {box.reference} · {box.weight} kg
          </li>
        ))}
      </ul>
      {warnings.length > 5 && <p className="mt-2 text-xs">{warnings.length - 5} more in Packing Details below.</p>}
    </section>
  );
}
