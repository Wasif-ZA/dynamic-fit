import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import Field, { inputClass } from '../components/common/Field.jsx';
import Button from '../components/common/Button.jsx';
import ItemEntryForm from '../components/orders/ItemEntryForm.jsx';
import ItemsTable from '../components/orders/ItemsTable.jsx';
import { orderTotals } from '../lib/orders.js';

export default function OrderCreatePage() {
  const { addOrder } = useApp();
  const navigate = useNavigate();
  const [reference, setReference] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => orderTotals(items), [items]);

  const handleAddItem = (item) => setItems((prev) => [...prev, item]);
  const handleRemoveItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!reference) {
      setError('Add a reference so the depot can identify this order.');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one item before creating the order.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const orderId = await addOrder({ reference, items });
      navigate(`/orders/${orderId}`);
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="rounded-sm border border-ink-100 bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink-700">Order details</h2>
          <div className="cut-line my-4" />
          <Field label="Order reference" hint="Customer, site, or PO number">
            <input
              className={inputClass()}
              placeholder="Bunnings Warehouse - Chullora"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        </section>

        <section className="rounded-sm border border-ink-100 bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink-700">Add items</h2>
          <p className="mt-1 text-sm text-ink-400">
            Enter items to be packed. Dimensions in mm, weight in kg.
          </p>
          <div className="cut-line my-4" />
          <ItemEntryForm onAdd={handleAddItem} />
        </section>
      </div>

      <div className="space-y-6">
        <section className="sticky top-6 rounded-sm border border-ink-100 bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink-700">Order summary</h2>
          <div className="cut-line my-4" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-400">Line items</dt>
              <dd className="font-mono text-ink-700">{items.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-400">Total units</dt>
              <dd className="font-mono text-ink-700">{totals.units}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-400">Total weight</dt>
              <dd className="font-mono text-ink-700">{totals.weight} kg</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-400">Hazardous lines</dt>
              <dd className="font-mono text-hazard-ink">{totals.hazardCount}</dd>
            </div>
          </dl>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <Button className="mt-5 w-full" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create order'}
          </Button>
        </section>
      </div>

      <div className="lg:col-span-3">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-700">
          Items on this order
        </h2>
        <ItemsTable items={items} onRemove={handleRemoveItem} />
      </div>
    </div>
  );
}
