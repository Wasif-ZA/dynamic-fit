import React, { useEffect, useId, useRef, useState } from 'react';
import { archiveOrder, deleteOrder, holdOrder, resumeOrder } from '../../api/client.js';
import { useApp } from '../../context/AppContext.jsx';
import { canManageOrders } from '../../lib/roles.js';
import Button from '../common/Button.jsx';
import TooltipButton from '../common/TooltipButton.jsx';

const ACTION_BUTTON_CLASS = 'h-7 w-20 shrink-0 whitespace-nowrap';

export default function OrderManagementActions({
  order, onChanged, onDeleted, disabled = false, onPendingChange,
}) {
  const { identity } = useApp();
  const [confirmation, setConfirmation] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const titleId = useId();
  const archived = Boolean(order.ArchivedAt);
  const held = Boolean(order.HeldAt);
  const finalised = order.Status === 'FINAL';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = async (action) => {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setPending(action);
    setError(null);
    onPendingChange?.(true);
    try {
      const operation = { archive: archiveOrder, hold: holdOrder, resume: resumeOrder, delete: deleteOrder }[action];
      await operation(order.OrderId);
      if (!mounted.current) return;
      setConfirmation(null);
      if (action === 'delete') await onDeleted?.();
      else await onChanged?.(action);
    } catch (failure) {
      if (mounted.current) setError(failure);
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setPending(null);
        onPendingChange?.(false);
      }
    }
  };

  if (!canManageOrders(identity?.role) || archived) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-start gap-1.5" role="group" aria-label={`Actions for ${order.OrderId}`}>
        {finalised ? (
          <TooltipButton
            variant="muted" size="compact" className={ACTION_BUTTON_CLASS} disabled={disabled || Boolean(pending)} onClick={() => run('archive')}
            description="Move this finalised order to Archive now. Its items and packing result stay available to view."
          >
            {pending === 'archive' ? 'Archiving...' : 'Archive'}
          </TooltipButton>
        ) : (
          <>
            <TooltipButton
              variant={held ? 'primary' : 'warning'} size="compact" className={`${ACTION_BUTTON_CLASS}${held ? ' border border-transparent' : ''}`} disabled={disabled || Boolean(pending)} onClick={() => run(held ? 'resume' : 'hold')}
              description={held
                ? 'Return this order to Active orders and continue where you left off.'
                : 'Pause this order and move it to On hold. Your items and packing result are saved.'}
            >
              {pending === 'resume' ? 'Resuming...' : pending === 'hold' ? 'Pausing...' : held ? 'Resume' : 'Hold'}
            </TooltipButton>
            <TooltipButton
              variant="danger" size="compact" className={ACTION_BUTTON_CLASS} disabled={disabled || Boolean(pending)}
              onClick={() => { setError(null); setConfirmation('delete'); }}
              description="Permanently delete this order, its items and saved packing result. You will be asked to confirm."
            >
              Delete
            </TooltipButton>
          </>
        )}
      </div>
      {error && !confirmation && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/50 p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="w-full max-w-lg rounded-sm bg-white p-5 text-left shadow-xl">
            <h2 id={titleId} className="font-display text-xl font-semibold text-ink-700">
              Permanently delete {order.OrderId}?
            </h2>
            <p className="mt-3 text-sm text-ink-500">
              This permanently removes the order, its items and its saved packing result. This action cannot be undone.
            </p>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error.message}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" disabled={Boolean(pending)} onClick={() => { setConfirmation(null); setError(null); }}>Cancel</Button>
              <Button
                variant="danger" disabled={Boolean(pending)}
                onClick={() => run(confirmation)}
              >
                {pending ? 'Deleting...' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
