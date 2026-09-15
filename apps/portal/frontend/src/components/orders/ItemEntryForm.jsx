import React, { useState } from 'react';
import Field, { inputClass } from '../common/Field.jsx';
import Button from '../common/Button.jsx';
import { emptyItemDraft } from '../../data/mockData.js';
import {
  MAX_ITEM_WEIGHT_KG,
  normaliseItem,
  validateItemFields,
  weightExceedsLimit,
} from '../../lib/itemValidation.js';

export default function ItemEntryForm({
  onAdd,
  initialItem,
  submitLabel = 'Add item to order',
  onCancel,
}) {
  const [draft, setDraft] = useState(() => ({
    ...emptyItemDraft(),
    ...initialItem,
  }));
  const [error, setError] = useState('');

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const weightTooHigh = weightExceedsLimit(draft.Weight);

  const handleAdd = (e) => {
    e.preventDefault();
    const candidate = { ...draft };
    const validationErrors = validateItemFields(candidate);
    if (validationErrors.length > 0) {
      if (weightExceedsLimit(candidate.Weight)) {
        setError(
          `Item weight of ${candidate.Weight} kg exceeds the maximum allowed item weight of ${MAX_ITEM_WEIGHT_KG} kg. Reduce the weight or split it into multiple items.`
        );
        return;
      }
      setError(
        validationErrors.length === 1
          ? validationErrors[0]
          : 'Item code, reference, positive dimensions, weight and a valid quantity are required.'
      );
      return;
    }
    onAdd(normaliseItem(candidate));
    setDraft(emptyItemDraft());
    setError('');
  };

  return (
    <form onSubmit={handleAdd} className="space-y-4">
      <p className="text-xs text-ink-300">* Required</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Item code *">
          <input
            className={inputClass('font-mono')}
            placeholder="ITM-001"
            value={draft.ItemCode}
            onChange={update('ItemCode')}
          />
        </Field>
        <Field label="Item reference *">
          <input
            className={inputClass()}
            placeholder="Widget C"
            value={draft.ItemReference}
            onChange={update('ItemReference')}
          />
        </Field>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Field label="Width (mm) *">
          <input
            type="number"
            min="0"
            className={inputClass('font-mono')}
            value={draft.Width}
            onChange={update('Width')}
          />
        </Field>
        <Field label="Length (mm) *">
          <input
            type="number"
            min="0"
            className={inputClass('font-mono')}
            value={draft.Length}
            onChange={update('Length')}
          />
        </Field>
        <Field label="Depth (mm) *">
          <input
            type="number"
            min="0"
            className={inputClass('font-mono')}
            value={draft.Depth}
            onChange={update('Depth')}
          />
        </Field>
        <Field
          label="Weight (kg) *"
          hint={`Max ${MAX_ITEM_WEIGHT_KG} kg per item`}
        >
          <input
            type="number"
            min="0"
            max={MAX_ITEM_WEIGHT_KG}
            step="0.01"
            className={inputClass(`font-mono ${weightTooHigh ? 'border-red-400 text-red-600' : ''}`)}
            value={draft.Weight}
            onChange={update('Weight')}
            aria-invalid={weightTooHigh}
          />
        </Field>
      </div>

      {weightTooHigh && (
        <p className="text-sm text-red-600">
          This item exceeds the {MAX_ITEM_WEIGHT_KG} kg maximum weight limit.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Box group (optional)"
          hint="Optional - items in different groups are never packed in the same box"
        >
          <input
            className={inputClass('font-mono')}
            placeholder="GROUP-A"
            value={draft.BoxGroup}
            onChange={update('BoxGroup')}
          />
        </Field>
        <Field label="Quantity">
          <input
            type="number"
            min="1"
            className={inputClass('font-mono')}
            value={draft.Quantity}
            onChange={update('Quantity')}
          />
        </Field>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" className={onCancel ? '' : 'w-full'} disabled={weightTooHigh}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
