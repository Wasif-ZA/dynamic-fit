import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import OrderItemsEditor from '../components/orders/OrderItemsEditor.jsx';
import Button from '../components/common/Button.jsx';
import { getOrder, updateOrder } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { canRunSolver } from '../lib/roles.js';

export default function OrderEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { identity, refreshOrders, handlingSettings, handlingSettingsError, loadingHandlingSettings, refreshHandlingSettings } = useApp();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrder(await getOrder(id));
      setError(null);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <PageMessage>Loading order {id}...</PageMessage>;
  }

  if (error || !order) {
    return <PageMessage>{error?.message || 'Order not found'}</PageMessage>;
  }

  if (order.HeldAt || order.ArchivedAt) {
    return (
      <PageMessage>
        <p>{order.HeldAt ? 'This order is on hold. Resume it before editing.' : 'Archived finalised orders are read-only.'}</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate(`/orders/${id}`)}>
          Return to order
        </Button>
      </PageMessage>
    );
  }

  if (order.Status === 'FINAL') {
    return (
      <PageMessage>
        <p>This order has been finalised and is permanently read-only.</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate(`/orders/${id}`)}>
          Return to order
        </Button>
      </PageMessage>
    );
  }

  const save = async (items) => {
    await updateOrder(id, { items });
    await refreshOrders();
    navigate(`/orders/${id}`);
  };
  const nextStep = canRunSolver(identity.role)
    ? 'You can optimise it directly after saving.'
    : 'You will need to submit it for optimisation again.';

  return (
    <OrderItemsEditor
      handlingSettings={handlingSettings} handlingSettingsError={handlingSettingsError}
      loadingHandlingSettings={loadingHandlingSettings} refreshHandlingSettings={refreshHandlingSettings}
      initialItems={order.Items}
      onSave={save}
      onCancel={() => navigate(`/orders/${id}`)}
      saveLabel="Save order changes"
      savingLabel="Saving..."
      notice={
        order.Status === 'OPTIMISED'
          ? `Editing this order will invalidate the current optimisation. ${nextStep}`
          : order.Status === 'AWAITING_OPTIMISATION'
            ? `Saving changes will return this order to Draft. ${nextStep}`
            : null
      }
    />
  );
}

function PageMessage({ children }) {
  return (
    <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-400">
      {children}
    </div>
  );
}
