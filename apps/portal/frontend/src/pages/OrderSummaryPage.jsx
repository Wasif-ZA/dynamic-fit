import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import ItemsTable from '../components/orders/ItemsTable.jsx';
import PackingDetails, { UnpackedItems } from '../components/orders/PackingDetails.jsx';
import InventoryFeasibilityWarning from '../components/orders/InventoryFeasibilityWarning.jsx';
import OrderManagementActions from '../components/orders/OrderManagementActions.jsx';
import OrderStatusBadge from '../components/orders/OrderStatusBadge.jsx';
import HandlingWarningsStatus from '../components/orders/HandlingWarningsStatus.jsx';
import PackedHandlingWarnings from '../components/orders/PackedHandlingWarnings.jsx';
import OrderHandlingBadge from '../components/orders/OrderHandlingBadge.jsx';
import Button from '../components/common/Button.jsx';
import {
  getOrder as fetchOrder,
  getSolution as fetchSolution,
  getSolutionSummary as fetchSolutionSummary,
  getVisualizerHandoff,
  finaliseOrder,
  solveOrder,
  submitOrder,
  visualiserUrl,
} from '../api/client.js';
import { formatCreated, orderTotals } from '../lib/orders.js';
import { orderStatusLabel } from '../lib/orderStatus.js';
import { canManageOrders, canRunSolver } from '../lib/roles.js';
import { formatSolveTime } from '../lib/solveTime.js';

export default function OrderSummaryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { identity, refreshOrders, handlingSettings, handlingSettingsError, loadingHandlingSettings, refreshHandlingSettings } = useApp();
  const warningThresholdKg = handlingSettings?.WarningThresholdKg ?? null;

  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState(null);
  const [solution, setSolution] = useState(null);
  const [optimising, setOptimising] = useState(false);
  const [packError, setPackError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [solveCount, setSolveCount] = useState(0);
  const [actionPending, setActionPending] = useState(false);
  const [managementPending, setManagementPending] = useState(false);
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [showReoptimiseConfirm, setShowReoptimiseConfirm] = useState(false);
  const [showFinaliseConfirm, setShowFinaliseConfirm] = useState(false);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setSummary(null);
    setSolution(null);
    setOptimising(false);
    setManagementPending(false);
    setPackError(null);
    setSuccessMessage('');
    try {
      const loaded = await fetchOrder(id);
      if (generation !== loadGeneration.current) return;
      setOrder(loaded);
      setLoadError(null);

      if (['OPTIMISED', 'FINAL'].includes(loaded.Status)) {
        const [loadedSummary, loadedSolution] = await Promise.allSettled([
          fetchSolutionSummary(id),
          fetchSolution(id),
        ]);
        if (generation !== loadGeneration.current) return;
        if (loadedSummary.status === 'fulfilled') setSummary(loadedSummary.value);
        if (loadedSolution.status === 'fulfilled') setSolution(loadedSolution.value);
        if (loadedSummary.status === 'rejected' || loadedSolution.status === 'rejected') {
          setPackError(new Error('Some optimisation details could not be loaded. Refresh the page to try again.'));
        }
      }
    } catch (error) {
      if (generation === loadGeneration.current) setLoadError(error);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    return () => { loadGeneration.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!order || optimising || actionPending || managementPending) return undefined;
    const refresh = async () => {
      await load();
      await refreshOrders();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [load, Boolean(order), optimising, actionPending, managementPending, refreshOrders]);

  const submit = async () => {
    setActionPending(true);
    setPackError(null);
    try {
      const submitted = await submitOrder(id);
      setOrder(submitted);
      await refreshOrders();
    } catch (error) {
      setPackError(error);
    } finally {
      setActionPending(false);
    }
  };

  const optimise = async ({ reoptimising = false } = {}) => {
    const generation = loadGeneration.current;
    setOptimising(true);
    setPackError(null);
    setSuccessMessage('');
    try {
      const updatedSolution = await solveOrder(id);
      if (generation !== loadGeneration.current) return;
      setSummary(null);
      setSolution(updatedSolution);
      setSolveCount((count) => count + 1);
      setOrder((current) => (current ? {
        ...current,
        Status: 'OPTIMISED',
        RejectedCount: updatedSolution.rejects.length,
      } : current));
      await refreshOrders();
      if (generation !== loadGeneration.current) return;
      const updatedSummary = await fetchSolutionSummary(id);
      if (generation !== loadGeneration.current) return;
      setSummary(updatedSummary);
      setSuccessMessage(
        reoptimising
          ? 'Re-optimisation completed using the current Box Inventory.'
          : 'Optimisation completed.'
      );
    } catch (error) {
      if (generation === loadGeneration.current) setPackError(error);
    } finally {
      if (generation === loadGeneration.current) setOptimising(false);
    }
  };

  const finalise = async () => {
    setActionPending(true);
    setPackError(null);
    setSuccessMessage('');
    try {
      const finalised = await finaliseOrder(id);
      setOrder(finalised);
      setSuccessMessage('Order finalised successfully. Box Inventory quantities have been updated.');
      await refreshOrders();
    } catch (error) {
      setPackError(error);
    } finally {
      setActionPending(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-400">
        Loading order {id}...
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center">
        <p className="font-display text-xl text-ink-500">Order not available</p>
        <p className="mt-1 text-sm text-ink-400">
          {loadError ? loadError.message : 'Order not found'}
        </p>
        <Link to="/orders" className="mt-2 inline-block text-sm text-brand-500 hover:underline">
          Back to orders
        </Link>
      </div>
    );
  }

  const totals = orderTotals(order.Items);
  const rejectedCount = solution?.rejects?.length ?? order.RejectedCount ?? 0;
  const archived = Boolean(order.ArchivedAt);
  const held = Boolean(order.HeldAt);
  const ordersUrl = held ? '/orders/backlog' : archived ? '/orders/archived' : '/orders';
  const feasibility =
    !archived && !held && order.Status === 'OPTIMISED' ? summary?.InventoryFeasibility ?? null : null;
  const editOrder = () => {
    if (order.Status === 'OPTIMISED') {
      setShowEditWarning(true);
      return;
    }
    navigate(`/orders/${id}/edit`);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link to={ordersUrl} className="text-sm text-ink-400 hover:text-ink-700">
          ← Back to {held ? 'orders on hold' : archived ? 'archive' : 'orders'}
        </Link>
      </div>

      {(handlingSettings || handlingSettingsError || loadingHandlingSettings) && (
        <div className="mb-4"><HandlingWarningsStatus settings={handlingSettings} error={handlingSettingsError} loading={loadingHandlingSettings} onRetry={refreshHandlingSettings} /></div>
      )}

      <div className="relative overflow-hidden rounded-sm border border-ink-100 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-300">
              Order {order.OrderId}
            </p>
            <h2 className="font-display text-2xl font-semibold text-ink-700">
              {order.Reference}
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              Created {formatCreated(order.CreatedAt)}
            </p>
            {order.FinalisedAt && <p className="mt-1 text-sm text-ink-400">Finalised {formatCreated(order.FinalisedAt)}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OrderHandlingBadge items={order.Items} solution={solution} summary={summary} maxPackedWeightKg={order.MaxPackedWeightKg} thresholdKg={warningThresholdKg}
              onSettingsClick={() => navigate('/boxes#handling-warnings')} />
            <OrderStatusBadge
              orderId={order.OrderId} status={order.Status} rejectedCount={rejectedCount}
              rejections={solution?.rejects ?? summary?.Rejected}
            />
          </div>
        </div>

        <div className="cut-line my-5" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Line items" value={order.Items.length} />
          <Stat label="Total units" value={totals.units} />
          <Stat label="Total weight" value={`${totals.weight} kg`} />
        </div>
      </div>

      <LifecycleActions
        archived={archived}
        held={held}
        status={order.Status}
        rejectedCount={rejectedCount}
        pending={actionPending || optimising || managementPending}
        optimising={optimising}
        finalising={actionPending && order.Status === 'OPTIMISED'}
        error={packError}
        onEdit={editOrder}
        onSubmit={submit}
        onOptimise={optimise}
        onReoptimise={() => setShowReoptimiseConfirm(true)}
        onFinalise={() => setShowFinaliseConfirm(true)}
        canOptimise={canRunSolver(identity.role)}
        successMessage={successMessage}
        feasibility={feasibility}
        managementActions={canManageOrders(identity.role) && !archived ? (
          <OrderManagementActions
            key={order.OrderId}
            order={order}
            disabled={actionPending || optimising}
            onPendingChange={setManagementPending}
            onChanged={async () => { await load(); await refreshOrders(); }}
            onDeleted={async () => { await refreshOrders(); navigate(ordersUrl); }}
          />
        ) : null}
      />

      <div className="mt-6">
        <h3 className="mb-3 font-display text-lg font-semibold text-ink-700">Items</h3>
        <ItemsTable items={order.Items} warningThresholdKg={warningThresholdKg} />
      </div>

      <OptimisationPanel
        warningThresholdKg={warningThresholdKg}
        orderId={order.OrderId}
        summary={summary}
        solution={solution}
        solveCount={solveCount}
        items={order.Items}
      />

      <div className="mt-6 flex justify-end gap-3">
        <Link to={ordersUrl}>
          <Button variant="secondary">Done</Button>
        </Link>
      </div>

      {showEditWarning && (
        <EditWarningModal
          canOptimise={canRunSolver(identity.role)}
          onCancel={() => setShowEditWarning(false)}
          onContinue={() => navigate(`/orders/${id}/edit`)}
        />
      )}
      {showReoptimiseConfirm && (
        <ReoptimiseModal
          onCancel={() => setShowReoptimiseConfirm(false)}
          onConfirm={() => {
            setShowReoptimiseConfirm(false);
            optimise({ reoptimising: true });
          }}
        />
      )}
      {showFinaliseConfirm && (
        <FinaliseModal
          onCancel={() => setShowFinaliseConfirm(false)}
          onConfirm={() => {
            setShowFinaliseConfirm(false);
            finalise();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, warning = false }) {
  return (
    <div>
      <p className={`text-xs uppercase tracking-wide ${warning ? 'text-red-700' : 'text-ink-400'}`}>{label}</p>
      <p className={`font-mono text-xl font-semibold ${warning ? 'text-red-700' : 'text-ink-700'}`}>{value}</p>
    </div>
  );
}

function LifecycleActions({
  archived,
  held,
  status,
  rejectedCount,
  pending,
  optimising,
  finalising,
  error,
  onEdit,
  onSubmit,
  onOptimise,
  onReoptimise,
  onFinalise,
  canOptimise,
  successMessage,
  feasibility,
  managementActions,
}) {
  const inventoryIsShort = Boolean(feasibility) && !feasibility.Sufficient;
  const hasRejects = !archived && !held && status === 'OPTIMISED' && rejectedCount > 0;
  let message;
  let primaryAction;

  if (archived) {
    message = 'This finalised order is archived and read-only. Its items and packing result are retained for reference.';
  } else if (held) {
    message = canOptimise
      ? 'This order is paused. Select Resume to return it to Active orders and continue where you left off. Your items and packing result are saved.'
      : 'This order is paused. Ask a Supervisor or Administrator to resume it. Its items and packing result are saved.';
  } else if (status === 'DRAFT') {
    message = canOptimise
      ? 'This draft order can be edited or optimised directly.'
      : 'This order can still be edited before it is submitted for optimisation.';
    primaryAction = canOptimise ? (
      <Button onClick={onOptimise} disabled={pending}>
        {pending ? 'Running...' : 'Run Optimisation'}
      </Button>
    ) : (
      <Button onClick={onSubmit} disabled={pending}>
        {pending ? 'Submitting...' : 'Submit for Optimisation'}
      </Button>
    );
  } else if (status === 'AWAITING_OPTIMISATION') {
    message = canOptimise
      ? 'This order is awaiting optimisation. Editing it will return it to Draft.'
      : 'This order is waiting for a Supervisor to run optimisation.';
    if (canOptimise) {
      primaryAction = (
        <Button onClick={onOptimise} disabled={pending}>
          {pending ? 'Running...' : 'Run Optimisation'}
        </Button>
      );
    }
  } else if (status === 'OPTIMISED') {
    message = hasRejects
      ? `${rejectedCount} ${rejectedCount === 1 ? 'item was' : 'items were'} not packed. Review the rejected items below, then edit the order or re-optimise before finalising.`
      : 'This order has a current optimisation result.';
    if (canOptimise) {
      primaryAction = (
        <>
          <Button onClick={onReoptimise} disabled={pending}>
            {optimising ? 'Re-optimising...' : 'Re-optimise'}
          </Button>
          <Button
            variant="danger"
            onClick={onFinalise}
            disabled={pending || inventoryIsShort || hasRejects}
            title={
              hasRejects
                ? 'Resolve the rejected items and re-optimise before finalising'
                : inventoryIsShort
                  ? 'Box Inventory cannot currently fulfil this optimisation'
                  : undefined
            }
          >
            {finalising ? 'Finalising...' : 'Finalise Order'}
          </Button>
        </>
      );
    }
  } else {
    message = 'This order has been finalised and is now read-only. It will be archived automatically one month after finalisation.';
  }

  return (
    <section className={`mt-6 rounded-sm border p-5 ${held ? 'border-amber-200 bg-amber-50' : 'border-ink-100 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className={`font-display text-lg font-semibold ${hasRejects ? 'text-red-700' : 'text-ink-700'}`}>
            {held ? 'Order on hold' : archived ? 'Archived' : orderStatusLabel(status, rejectedCount)}
          </h3>
          <p className={`mt-1 text-sm ${hasRejects ? 'text-red-700' : 'text-ink-500'}`}>{message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!archived && !held && status !== 'FINAL' && (
            <Button variant="secondary" onClick={onEdit} disabled={pending}>
              Edit order
            </Button>
          )}
          {primaryAction}
          {(held || status === 'FINAL') && managementActions}
        </div>
      </div>
      {!held && status !== 'FINAL' && managementActions && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
          <p className="text-sm text-ink-500">Need to come back later? Put this order on hold.</p>
          {managementActions}
        </div>
      )}
      {error && (
        <p className="mt-4 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </p>
      )}
      {successMessage && !error && !hasRejects && (
        <p className="mt-4 rounded-sm border border-brand-100 bg-brand-50 p-3 text-sm text-brand-700">
          {successMessage}
        </p>
      )}
      <InventoryFeasibilityWarning feasibility={feasibility} />
      {inventoryIsShort && canOptimise && (
        <p className="mt-2 text-sm text-ink-400">
          Finalise Order is unavailable until Box Inventory can cover every box
          this optimisation requires.
        </p>
      )}
    </section>
  );
}

function OptimisationPanel({ orderId, summary, solution, solveCount, items, warningThresholdKg }) {
  const [handoff, setHandoff] = useState(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffError, setHandoffError] = useState(null);

  useEffect(() => {
    setHandoff(null);
    setHandoffError(null);
  }, [orderId, solution, solveCount]);

  const openVisualizer = async () => {
    setHandoffLoading(true);
    setHandoffError(null);
    try {
      setHandoff(await getVisualizerHandoff(orderId));
    } catch (error) {
      setHandoffError(error);
    } finally {
      setHandoffLoading(false);
    }
  };

  if (!summary && !solution) return null;

  const rejectedCount = solution?.rejects?.length ?? summary?.Rejected?.length ?? 0;
  const boxCount = summary?.BoxCount ?? solution.cartons.length;
  const itemsPacked = summary?.ItemsPacked ?? solution.cartons.reduce(
    (total, carton) => total + carton.placements.length, 0
  );
  const fillRate = summary?.FillRate ?? solution.metrics.fill_rate;
  const solveTime = solution?.solver?.elapsed_ms ?? summary?.SolveTimeMs;
  const visualiser = handoff ? visualiserUrl(handoff.SolutionUrl) : null;

  return (
    <div className="mt-6 rounded-sm border border-ink-100 bg-white p-6">
      <h3 className="font-display text-lg font-semibold text-ink-700">Optimisation result</h3>
      <p className="mt-1 text-sm text-ink-400">
        FitSolver result and FitVisualizer layout for the current order items.
      </p>
      <div className="cut-line my-5" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Boxes" value={boxCount} />
        <Stat label="Items packed" value={itemsPacked} />
        <Stat label="Rejected" value={rejectedCount} warning={rejectedCount > 0} />
        <Stat label="Fill rate" value={`${Math.round(fillRate * 1000) / 10}%`} />
        <Stat label="Execution time" value={formatSolveTime(solveTime)} />
      </div>

      <PackedHandlingWarnings solution={solution} summary={summary} thresholdKg={warningThresholdKg} />
      {solution && <UnpackedItems rejects={solution.rejects} />}
      {solution && <PackingDetails key={solution.solution_id} solution={solution} items={items} warningThresholdKg={warningThresholdKg} />}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-300">
          Result for order {orderId}
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={openVisualizer} disabled={handoffLoading || !solution}>
            {handoffLoading
              ? 'Opening Visualizer…'
              : visualiser
                ? 'Refresh Visualizer access'
                : 'Open Visualizer'}
          </Button>
          {visualiser && (
            <a
              href={visualiser}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-brand-500 hover:underline"
            >
              Open in a new tab
            </a>
          )}
        </div>
      </div>

      {visualiser ? (
        <iframe
          key={`${orderId}-${solveCount}`}
          src={visualiser}
          title={`FitVisualizer, order ${orderId}`}
          className="mt-3 h-[560px] w-full rounded-sm border border-ink-100 bg-white"
        />
      ) : handoffError ? (
        <div className="mt-3 rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {handoffError.message}
        </div>
      ) : (
        <div className="mt-3 flex h-32 items-center justify-center rounded-sm border border-ink-100 bg-ink-50 text-sm text-ink-400">
          Open the Visualizer to generate short-lived access.
        </div>
      )}
    </div>
  );
}

function ReoptimiseModal({ onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reoptimise-title"
    >
      <div className="w-full max-w-lg rounded-sm bg-white p-5 shadow-xl">
        <h2 id="reoptimise-title" className="font-display text-xl font-semibold text-ink-700">
          Re-optimise Order?
        </h2>
        <p className="mt-3 text-sm text-ink-500">
          This will run the Solver again using the current Box Inventory and replace
          the current optimisation result if successful.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Re-optimise</Button>
        </div>
      </div>
    </div>
  );
}

function FinaliseModal({ onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finalise-title"
    >
      <div className="w-full max-w-lg rounded-sm bg-white p-5 shadow-xl">
        <h2 id="finalise-title" className="font-display text-xl font-semibold text-ink-700">
          Finalise Order?
        </h2>
        <p className="mt-3 text-sm text-ink-500">
          This will approve the current packing solution, deduct the required boxes
          from inventory, and permanently lock this order.
        </p>
        <p className="mt-3 text-sm font-semibold text-red-600">
          This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Finalise Order</Button>
        </div>
      </div>
    </div>
  );
}

function EditWarningModal({ onCancel, onContinue, canOptimise }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-warning-title"
    >
      <div className="w-full max-w-lg rounded-sm bg-white p-5 shadow-xl">
        <h2 id="edit-warning-title" className="font-display text-xl font-semibold text-ink-700">
          Edit order and discard its optimisation result?
        </h2>
        <p className="mt-3 text-sm text-ink-500">
          Editing this order will invalidate the current optimisation and return it to Draft.
          {' '}{canOptimise
            ? 'You can optimise it directly after saving.'
            : 'You will need to submit it for optimisation again.'}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onContinue}>Continue to edit</Button>
        </div>
      </div>
    </div>
  );
}
