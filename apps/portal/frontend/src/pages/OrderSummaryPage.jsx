import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import ItemsTable from '../components/orders/ItemsTable.jsx';
import PackingDetails, { UnpackedItems } from '../components/orders/PackingDetails.jsx';
import InventoryFeasibilityWarning from '../components/orders/InventoryFeasibilityWarning.jsx';
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
import { ORDER_STATUS_STYLES, orderStatusLabel } from '../lib/orderStatus.js';
import { canRunSolver } from '../lib/roles.js';

export default function OrderSummaryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { identity, refreshOrders } = useApp();

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
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [showReoptimiseConfirm, setShowReoptimiseConfirm] = useState(false);
  const [showFinaliseConfirm, setShowFinaliseConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await fetchOrder(id);
      setOrder(loaded);
      setLoadError(null);

      if (['OPTIMISED', 'FINAL'].includes(loaded.Status)) {
        try {
          const [loadedSummary, loadedSolution] = await Promise.all([
            fetchSolutionSummary(id),
            fetchSolution(id),
          ]);
          setSummary(loadedSummary);
          setSolution(loadedSolution);
        } catch {
          setSummary(null);
          setSolution(null);
        }
      }
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (order?.Status !== 'OPTIMISED') return undefined;
    const refresh = async () => {
      try {
        setSummary(await fetchSolutionSummary(id));
      } catch {
      }
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [id, order?.Status]);

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
    setOptimising(true);
    setPackError(null);
    setSuccessMessage('');
    try {
      await solveOrder(id);
      const [updatedSummary, updatedSolution] = await Promise.all([
        fetchSolutionSummary(id),
        fetchSolution(id),
      ]);
      setSummary(updatedSummary);
      setSolution(updatedSolution);
      setSolveCount((count) => count + 1);
      setOrder((current) => (current ? { ...current, Status: 'OPTIMISED' } : current));
      setSuccessMessage(
        reoptimising
          ? 'Re-optimisation completed using the current Box Inventory.'
          : 'Optimisation completed.'
      );
      await refreshOrders();
    } catch (error) {
      setPackError(error);
    } finally {
      setOptimising(false);
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
  const feasibility =
    order.Status === 'OPTIMISED' ? summary?.InventoryFeasibility ?? null : null;
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
        <Link to="/orders" className="text-sm text-ink-400 hover:text-ink-700">
          ← Back to orders
        </Link>
      </div>

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
          </div>
          <span
            className={`rounded-sm px-3 py-1 text-sm font-medium ${ORDER_STATUS_STYLES[order.Status] || 'bg-ink-50 text-ink-500'}`}
          >
            {orderStatusLabel(order.Status)}
          </span>
        </div>

        <div className="cut-line my-5" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Line items" value={order.Items.length} />
          <Stat label="Total units" value={totals.units} />
          <Stat label="Total weight" value={`${totals.weight} kg`} />
        </div>
      </div>

      <LifecycleActions
        status={order.Status}
        pending={actionPending || optimising}
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
      />

      <div className="mt-6">
        <h3 className="mb-3 font-display text-lg font-semibold text-ink-700">Items</h3>
        <ItemsTable items={order.Items} />
      </div>

      <OptimisationPanel
        orderId={order.OrderId}
        summary={summary}
        solution={solution}
        solveCount={solveCount}
        items={order.Items}
      />

      <div className="mt-6 flex justify-end gap-3">
        <Link to="/orders">
          <Button variant="secondary">Done</Button>
        </Link>
      </div>

      {showEditWarning && (
        <EditWarningModal
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

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="font-mono text-xl font-semibold text-ink-700">{value}</p>
    </div>
  );
}

function LifecycleActions({
  status,
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
}) {
  const inventoryIsShort = Boolean(feasibility) && !feasibility.Sufficient;
  let message;
  let primaryAction;

  if (status === 'DRAFT') {
    message = 'This order can still be edited before it is submitted for optimisation.';
    primaryAction = (
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
    message = 'This order has a current optimisation result.';
    if (canOptimise) {
      primaryAction = (
        <>
          <Button onClick={onReoptimise} disabled={pending}>
            {optimising ? 'Re-optimising...' : 'Re-optimise'}
          </Button>
          <Button
            variant="danger"
            onClick={onFinalise}
            disabled={pending || inventoryIsShort}
            title={
              inventoryIsShort
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
    message = 'This order has been finalised and is now read-only.';
  }

  return (
    <section className="mt-6 rounded-sm border border-ink-100 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-700">
            {orderStatusLabel(status)}
          </h3>
          <p className="mt-1 text-sm text-ink-400">{message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status !== 'FINAL' && (
            <Button variant="secondary" onClick={onEdit} disabled={pending}>
              Edit order
            </Button>
          )}
          {primaryAction}
        </div>
      </div>
      {error && (
        <p className="mt-4 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </p>
      )}
      {successMessage && !error && (
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

function OptimisationPanel({ orderId, summary, solution, solveCount, items }) {
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

  if (!summary) return null;

  const rejected = summary?.Rejected ?? [];
  const visualiser = handoff ? visualiserUrl(handoff.SolutionUrl) : null;

  return (
    <div className="mt-6 rounded-sm border border-ink-100 bg-white p-6">
      <h3 className="font-display text-lg font-semibold text-ink-700">Optimisation result</h3>
      <p className="mt-1 text-sm text-ink-400">
        FitSolver result and FitVisualizer layout for the current order items.
      </p>
      <div className="cut-line my-5" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Boxes" value={summary.BoxCount} />
        <Stat label="Items packed" value={summary.ItemsPacked} />
        <Stat label="Rejected" value={rejected.length} />
        <Stat label="Fill rate" value={`${Math.round(summary.FillRate * 1000) / 10}%`} />
      </div>

      {solution && <UnpackedItems rejects={solution.rejects} />}
      {solution && <PackingDetails key={solution.solution_id} solution={solution} items={items} />}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-300">
          Optimised order {orderId}
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

function EditWarningModal({ onCancel, onContinue }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-warning-title"
    >
      <div className="w-full max-w-lg rounded-sm bg-white p-5 shadow-xl">
        <h2 id="edit-warning-title" className="font-display text-xl font-semibold text-ink-700">
          Edit optimised order?
        </h2>
        <p className="mt-3 text-sm text-ink-500">
          Editing this order will invalidate the current optimisation. You will need to
          submit and optimise the order again.
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
