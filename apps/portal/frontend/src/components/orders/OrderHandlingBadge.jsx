import React from 'react';
import InfoTooltip from '../common/InfoTooltip.jsx';
import { needsHandlingWarning, packedWeightKg } from '../../lib/manualHandling.js';

export default function OrderHandlingBadge({ items = [], solution, summary, maxPackedWeightKg, thresholdKg, compact = false, onSettingsClick }) {
  const heaviestItem = items.reduce((max, item) => Math.max(max, item.Weight), 0);
  const packedWeights = solution?.cartons
    ? solution.cartons.map(packedWeightKg)
    : summary?.Boxes ? summary.Boxes.map((box) => box.PackedWeightKg) : [maxPackedWeightKg];
  const heaviestBox = packedWeights.reduce((max, weight) => Number.isFinite(weight) ? Math.max(max, weight) : max, 0);
  if (!needsHandlingWarning(heaviestItem, thresholdKg) && !needsHandlingWarning(heaviestBox, thresholdKg)) return null;

  const description = 'Weight threshold reached.';
  const warningIcon = (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 3a1.15 1.15 0 0 1 2 0l7 12a1.15 1.15 0 0 1-1 2H3a1.15 1.15 0 0 1-1-2L9 3Z" strokeLinejoin="round" />
      <path d="M10 7v4m0 2v.5" strokeLinecap="round" />
    </svg>
  );

  if (compact) return (
    <span aria-label="Heavy order" className="inline-flex align-middle">
      <InfoTooltip label="Heavy order: open handling settings" icon={warningIcon} description="Heavy order" align="center" compact onClick={onSettingsClick}
        className="h-5 w-5 text-amber-700 hover:bg-amber-50 hover:text-amber-900" />
    </span>
  );

  return (
    <span aria-label="Heavy order" className="inline-flex h-5 items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-1.5 text-[11px] font-medium leading-none text-amber-800">
      {warningIcon}
      Heavy
      <InfoTooltip label={onSettingsClick ? 'Open handling settings' : 'Why this order is heavy'} className="h-4 w-4 text-amber-700 hover:text-amber-900" align="center" compact
        description={description} onClick={onSettingsClick} />
    </span>
  );
}
