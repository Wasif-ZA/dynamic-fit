import React, { useMemo, useRef, useState } from 'react';
import Button from '../common/Button.jsx';
import ItemEntryForm from './ItemEntryForm.jsx';
import ItemsTable from './ItemsTable.jsx';
import { validateItemFields } from '../../lib/itemValidation.js';

export default function ImportedItemsReviewModal({ items: initialItems, onCancel, onConfirm }) {
  const [items, setItems] = useState(initialItems);
  const [editingIndex, setEditingIndex] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const confirmingRef = useRef(false);

  const validationErrors = useMemo(
    () =>
      items.flatMap((item, index) =>
        validateItemFields(item, { label: `Item ${index + 1}` })
      ),
    [items]
  );
  const totalUnits = items.reduce((sum, item) => sum + (Number(item.Quantity) || 0), 0);

  const updateQuantity = (index, value) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, Quantity: value } : item
      )
    );
    setError('');
  };

  const removeItem = (index) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setEditingIndex((current) => {
      if (current === index) return null;
      return current !== null && current > index ? current - 1 : current;
    });
    setError('');
  };

  const saveEdit = (item) => {
    setItems((current) =>
      current.map((existing, index) => (index === editingIndex ? item : existing))
    );
    setEditingIndex(null);
  };

  const addItem = (item) => {
    setItems((current) => [...current, item]);
    setAdding(false);
  };

  const confirm = () => {
    if (confirmingRef.current) return;
    if (items.length === 0) {
      setError('Add at least one valid item before confirming the import.');
      return;
    }
    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }
    confirmingRef.current = true;
    onConfirm(items);
  };

  const actionInProgress = adding || editingIndex !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-review-title"
    >
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-sm bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="import-review-title" className="font-display text-xl font-semibold text-ink-700">
              Review imported items
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              These items have not been added to the order yet.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-2xl leading-none text-ink-300 hover:text-ink-600"
            aria-label="Cancel import"
          >
            ×
          </button>
        </div>

        <div className="cut-line my-4" />

        <ItemsTable
          items={items}
          onRemove={removeItem}
          onEdit={(index) => {
            setAdding(false);
            setEditingIndex(index);
          }}
          onQuantityChange={updateQuantity}
          emptyMessage="No imported items remain. Add an item to continue."
        />

        {editingIndex !== null && items[editingIndex] && (
          <div className="mt-4 rounded-sm border border-brand-200 bg-brand-50/40 p-4">
            <h3 className="mb-3 font-display font-semibold text-ink-700">Edit imported item</h3>
            <ItemEntryForm
              key={`edit-${editingIndex}`}
              initialItem={items[editingIndex]}
              onAdd={saveEdit}
              onCancel={() => setEditingIndex(null)}
              submitLabel="Save changes"
            />
          </div>
        )}

        {adding && (
          <div className="mt-4 rounded-sm border border-brand-200 bg-brand-50/40 p-4">
            <h3 className="mb-3 font-display font-semibold text-ink-700">Add imported item</h3>
            <ItemEntryForm
              onAdd={addItem}
              onCancel={() => setAdding(false)}
              submitLabel="Add to preview"
            />
          </div>
        )}

        {!actionInProgress && (
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            onClick={() => setAdding(true)}
          >
            + Add item
          </Button>
        )}

        {(error || validationErrors.length > 0) && (
          <p className="mt-4 text-sm text-red-600">{error || validationErrors[0]}</p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={items.length === 0 || validationErrors.length > 0 || actionInProgress}
          >
            Add {totalUnits} {totalUnits === 1 ? 'unit' : 'units'} to order
          </Button>
        </div>
      </div>
    </div>
  );
}
