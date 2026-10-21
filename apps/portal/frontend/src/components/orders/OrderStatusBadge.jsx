import React, { useEffect, useRef, useState } from 'react';
import { orderStatusLabel, orderStatusStyle } from '../../lib/orderStatus.js';
import { getSolutionSummary } from '../../api/client.js';
import InfoTooltip from '../common/InfoTooltip.jsx';

function describeRejections(count, rejections) {
  const prefix = `${count} ${count === 1 ? 'item' : 'items'} could not be packed.`;
  const reasons = new Map();
  for (const rejection of rejections ?? []) {
    const reason = rejection.Detail || rejection.message || (
      (rejection.Reason || rejection.reason_code) === 'NO_FITTING_CARTON'
        ? 'No available box fits this item'
        : (rejection.Reason || rejection.reason_code || '').replaceAll('_', ' ').toLowerCase()
    );
    const clean = reason.trim().replace(/[.!?]+$/, '');
    if (clean) reasons.set(clean, (reasons.get(clean) ?? 0) + 1);
  }
  const summary = [...reasons].slice(0, 2).map(([reason, units]) => {
    const short = reason.length > 80 ? `${reason.slice(0, 77)}…` : reason;
    return `${short}${units > 1 ? ` (${units} items)` : ''}`;
  }).join('; ');
  return `${prefix}${summary ? ` ${summary}.` : ''}${reasons.size > 2 ? ' More reasons are listed in the order.' : ' Open the order for full details.'}`;
}

export default function OrderStatusBadge({ orderId, status, rejectedCount = 0, rejections }) {
  const [loadedRejections, setLoadedRejections] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const rejected = status === 'OPTIMISED' && rejectedCount > 0;

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    setLoadedRejections(null);
    setLoading(false);
    setFailed(false);
    return () => { generation.current += 1; };
  }, [orderId, status, rejectedCount]);

  const loadReasons = async () => {
    if (rejections != null || !orderId || inFlight.current) return;
    const request = ++generation.current;
    inFlight.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const summary = await getSolutionSummary(orderId);
      if (request === generation.current) setLoadedRejections(summary.Rejected ?? []);
    } catch {
      if (request === generation.current) setFailed(true);
    } finally {
      if (request === generation.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  };

  const description = loading
    ? 'Loading rejection reasons…'
    : failed
      ? 'Could not load rejection reasons. Hover or focus this icon again to retry, or open the order for details.'
      : describeRejections(rejectedCount, rejections ?? loadedRejections);

  return (
    <span className="relative inline-flex align-middle">
      <span className={`inline-flex h-5 min-w-[4.75rem] shrink-0 items-center justify-center whitespace-nowrap rounded-sm px-2 text-center text-[11px] font-medium leading-none ${orderStatusStyle(status, rejectedCount)}`}>
        {orderStatusLabel(status, rejectedCount)}
      </span>
      {rejected && (
        <InfoTooltip
          label="Why this order was rejected" description={description} onOpen={loadReasons}
          className="absolute -right-4 top-0.5 h-4 w-4 text-red-600 hover:text-red-800"
        />
      )}
    </span>
  );
}
