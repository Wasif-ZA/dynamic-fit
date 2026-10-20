import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import OrderItemsEditor from '../components/orders/OrderItemsEditor.jsx';

export default function OrderCreatePage() {
  const { addOrder, handlingSettings, handlingSettingsError, loadingHandlingSettings, refreshHandlingSettings } = useApp();
  const navigate = useNavigate();

  const create = async (items) => {
    const orderId = await addOrder({ items });
    navigate(`/orders/${orderId}`);
  };

  return (
    <OrderItemsEditor
      handlingSettings={handlingSettings} handlingSettingsError={handlingSettingsError}
      loadingHandlingSettings={loadingHandlingSettings} refreshHandlingSettings={refreshHandlingSettings}
      onSave={create}
      saveLabel="Create order"
      savingLabel="Creating..."
    />
  );
}
