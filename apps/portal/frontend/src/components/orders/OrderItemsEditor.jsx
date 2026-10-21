import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../common/Button.jsx';
import ItemEntryForm from './ItemEntryForm.jsx';
import ItemJsonImport from './ItemJsonImport.jsx';
import ItemsTable from './ItemsTable.jsx';
import { orderTotals } from '../../lib/orders.js';
import { getItemWeightLimit } from '../../api/client.js';
import { validateItemFields } from '../../lib/itemValidation.js';
import HandlingWarningsStatus from './HandlingWarningsStatus.jsx';

const ENTRY_TABS = [
  { id: 'manual', label: 'Manual entry' },
  { id: 'json', label: 'Import JSON' },
];

export default function OrderItemsEditor({
  initialItems = [],
  onSave,
  onCancel,
  saveLabel,
  savingLabel,
  notice,
  handlingSettings,
  handlingSettingsError,
  loadingHandlingSettings,
  refreshHandlingSettings,
}) {
  const [items, setItems] = useState(() => initialItems.map((item) => ({ ...item })));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [entryTab, setEntryTab] = useState('manual');
  const [editingIndex, setEditingIndex] = useState(null);
  const [capacity, setCapacity] = useState(null);
  const [capacityError, setCapacityError] = useState(null);
  const [loadingCapacity, setLoadingCapacity] = useState(true);
  const capacityGeneration = useRef(0);
  const refreshCapacity = useCallback(async () => {
    const generation = ++capacityGeneration.current;
    setLoadingCapacity(true);
    try {
      const current = await getItemWeightLimit();
      if (generation !== capacityGeneration.current) throw new Error('Box Inventory changed while checking. Please try again.');
      setCapacity(current);
      setCapacityError(null);
      return current;
    } catch (error) {
      if (generation === capacityGeneration.current) setCapacityError(error);
      throw error;
    } finally {
      if (generation === capacityGeneration.current) setLoadingCapacity(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => { refreshCapacity().catch(() => {}); };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { capacityGeneration.current += 1; window.removeEventListener('focus', refresh); };
  }, [refreshCapacity]);

  const maxItemWeightKg = capacity?.MaxItemWeightKg ?? null;
  const warningThresholdKg = handlingSettings?.WarningThresholdKg ?? null;
  const checkingWeightLimit = loadingCapacity || Boolean(capacityError);
  const itemErrors = items.flatMap((item, index) => validateItemFields(item, { label: `Item ${index + 1} (${item.ItemCode})`, maxItemWeightKg }));

  const totals = useMemo(() => orderTotals(items), [items]);

  const handleAddItem = (item) => {
    setError('');
    setItems((current) => [...current, item]);
  };
  const handleImportItems = (importedItems) => {
    setError('');
    setItems((current) => [...current, ...importedItems]);
  };
  const handleRemoveItem = (index) => {
    setError('');
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setEditingIndex((current) => {
      if (current === index) return null;
      return current !== null && current > index ? current - 1 : current;
    });
  };
  const handleEditItem = (item) => {
    setError('');
    setItems((current) =>
      current.map((existing, index) => (index === editingIndex ? item : existing))
    );
    setEditingIndex(null);
  };

  const handleSave = async () => {
    if (items.length === 0) {
      setError('Add at least one item before saving the order.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const current = await refreshCapacity();
      const validationErrors = items.flatMap((item, index) => validateItemFields(item, { label: `Item ${index + 1} (${item.ItemCode})`, maxItemWeightKg: current.MaxItemWeightKg }));
      if (validationErrors.length > 0) {
        return;
      }
      await onSave(items);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {(handlingSettings || handlingSettingsError || loadingHandlingSettings) && (
        <div className="lg:col-span-3"><HandlingWarningsStatus settings={handlingSettings} error={handlingSettingsError} loading={loadingHandlingSettings} onRetry={refreshHandlingSettings} /></div>
      )}
      {notice && (
        <p className="rounded-sm border border-ink-100 bg-white p-3 text-sm text-ink-600 lg:col-span-3">
          {notice}
        </p>
      )}
      {capacityError && (
        <div role="alert" className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700 lg:col-span-3">
          Cannot check current box weight capacities. {capacityError.message}
          <Button className="ml-3" variant="secondary" onClick={() => refreshCapacity().catch(() => {})}>Try again</Button>
        </div>
      )}
      {capacity && !capacity.HasAvailableBoxes && !capacityError && (
        <p className="rounded-sm border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 lg:col-span-3">
          No active boxes are currently available. You can prepare this draft, but add or restock active boxes in Box Inventory before optimising. Item weights will be checked against those boxes.
        </p>
      )}
      <div className="space-y-6 lg:col-span-2">
        <section className="rounded-sm border border-ink-100 bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink-700">Add items</h2>
          <p className="mt-1 text-sm text-ink-400">
            Enter items to be packed. Dimensions in mm, weight in kg.
          </p>
          <div className="mt-4 flex gap-1 rounded-sm border border-ink-100 bg-ink-50 p-1">
            {ENTRY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setEntryTab(tab.id)}
                className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-semibold transition-colors ${
                  entryTab === tab.id
                    ? 'bg-white text-ink-700 shadow-sm'
                    : 'text-ink-400 hover:text-ink-600'
                }`}
                aria-pressed={entryTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="cut-line my-4" />
          {entryTab === 'manual' ? (
            <ItemEntryForm onAdd={handleAddItem} maxItemWeightKg={maxItemWeightKg} checkingWeightLimit={checkingWeightLimit} warningThresholdKg={warningThresholdKg} />
          ) : (
            <ItemJsonImport onImport={handleImportItems} maxItemWeightKg={maxItemWeightKg} checkingWeightLimit={checkingWeightLimit} warningThresholdKg={warningThresholdKg} />
          )}
        </section>
      </div>

      <div className="space-y-6">
        <section className="sticky top-6 rounded-sm border border-ink-100 bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink-700">Order summary</h2>
          <div className="cut-line my-4" />
          <dl className="space-y-2 text-sm">
            <SummaryRow label="Line items" value={items.length} />
            <SummaryRow label="Total units" value={totals.units} />
            <SummaryRow label="Total weight" value={`${totals.weight} kg`} />
          </dl>
          {(error || itemErrors.length > 0) && <p className="mt-4 text-sm text-red-600">{error || itemErrors[0]}</p>}
          <div className="mt-5 flex gap-2">
            {onCancel && (
              <Button className="flex-1" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button className="flex-1" onClick={handleSave} disabled={saving || checkingWeightLimit || itemErrors.length > 0}>
              {saving ? savingLabel : saveLabel}
            </Button>
          </div>
        </section>
      </div>

      <div className="lg:col-span-3">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-700">
          Items on this order
        </h2>
        <ItemsTable
          warningThresholdKg={warningThresholdKg}
          items={items}
          onRemove={handleRemoveItem}
          onEdit={setEditingIndex}
        />

        {editingIndex !== null && items[editingIndex] && (
          <section className="mt-4 rounded-sm border border-brand-200 bg-brand-50/40 p-4">
            <h3 className="mb-3 font-display font-semibold text-ink-700">Edit item</h3>
            <ItemEntryForm
              warningThresholdKg={warningThresholdKg}
              maxItemWeightKg={maxItemWeightKg}
              checkingWeightLimit={checkingWeightLimit}
              key={`edit-${editingIndex}`}
              initialItem={items[editingIndex]}
              onAdd={handleEditItem}
              onCancel={() => setEditingIndex(null)}
              submitLabel="Save item changes"
            />
          </section>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-400">{label}</dt>
      <dd className="font-mono text-ink-700">{value}</dd>
    </div>
  );
}
