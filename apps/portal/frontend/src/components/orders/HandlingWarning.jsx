import React from 'react';
import { needsHandlingWarning } from '../../lib/manualHandling.js';
import InfoTooltip from '../common/InfoTooltip.jsx';

export default function HandlingWarning({ weightKg, thresholdKg, kind = 'item', className = '' }) {
  if (!needsHandlingWarning(weightKg, thresholdKg)) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ${className}`}>
      Heavy
      <InfoTooltip
        label={`About this ${kind} handling warning`}
        className="h-4 w-4 text-amber-700 hover:text-amber-900"
        description="Weight threshold reached."
      />
    </span>
  );
}
