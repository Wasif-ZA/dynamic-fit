import React, { useId, useState } from 'react';
import Field, { inputClass } from '../common/Field.jsx';
import Button from '../common/Button.jsx';
import InfoTooltip from '../common/InfoTooltip.jsx';
import HandlingWarning from './HandlingWarning.jsx';
import { emptyItemDraft } from '../../data/mockData.js';
import {
  itemWeightError,
  ITEM_TEXT_LIMITS,
  itemTextLimitError,
  normaliseItem,
  validateItemFields,
  weightExceedsLimit,
} from '../../lib/itemValidation.js';

export default function ItemEntryForm({
  onAdd,
  initialItem,
  submitLabel = 'Add item to order',
  onCancel,
  maxItemWeightKg = null,
  checkingWeightLimit = false,
  warningThresholdKg = null,
}) {
  const formId = useId();
  const [draft, setDraft] = useState(() => ({
    ...emptyItemDraft(),
    ...initialItem,
  }));
  const [error, setError] = useState('');

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const weightTooHigh = weightExceedsLimit(draft.Weight, maxItemWeightKg);
  const codeError = itemTextLimitError('ItemCode', draft.ItemCode);
  const referenceError = itemTextLimitError('ItemReference', draft.ItemReference);

  const handleAdd = (e) => {
    e.preventDefault();
    if (checkingWeightLimit) return;
    const candidate = { ...draft };
    const validationErrors = validateItemFields(candidate, { maxItemWeightKg });
    if (validationErrors.length > 0) {
      if (weightExceedsLimit(candidate.Weight, maxItemWeightKg)) {
        setError(itemWeightError(candidate.Weight, maxItemWeightKg));
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
        <Field label="Item code *" hint={`Max ${ITEM_TEXT_LIMITS.ItemCode} characters`}>
          <input
            className={inputClass(`font-mono ${codeError ? 'border-red-400 text-red-600' : ''}`)}
            placeholder="ITM-001"
            value={draft.ItemCode}
            onChange={update('ItemCode')}
            aria-invalid={Boolean(codeError)}
            aria-describedby={codeError ? `${formId}-code-error` : undefined}
          />
          {codeError && <p id={`${formId}-code-error`} className="mt-1 text-sm text-red-600">{codeError}</p>}
        </Field>
        <Field label="Item reference *" hint={`Max ${ITEM_TEXT_LIMITS.ItemReference} characters`}>
          <input
            className={inputClass(referenceError ? 'border-red-400 text-red-600' : '')}
            placeholder="Widget C"
            value={draft.ItemReference}
            onChange={update('ItemReference')}
            aria-invalid={Boolean(referenceError)}
            aria-describedby={referenceError ? `${formId}-reference-error` : undefined}
          />
          {referenceError && <p id={`${formId}-reference-error`} className="mt-1 text-sm text-red-600">{referenceError}</p>}
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
        <div>
          <Field label="Weight (kg) *">
            <input
              type="number"
              min="0"
              max={maxItemWeightKg ?? undefined}
              step="0.001"
              className={inputClass(`font-mono ${weightTooHigh ? 'border-red-400 text-red-600' : ''}`)}
              value={draft.Weight}
              onChange={update('Weight')}
              aria-invalid={weightTooHigh}
              aria-describedby={weightTooHigh ? `${formId}-weight-error` : undefined}
            />
          </Field>
          <div className="mt-1 flex items-center justify-center gap-1 text-xs text-ink-300">
            {checkingWeightLimit ? 'Checking current boxes…' : (
              <>
                <span>{maxItemWeightKg === null ? 'No set limit' : `Max ${maxItemWeightKg} kg`}</span>
                <InfoTooltip
                  label="About the maximum item weight"
                  iconSize={12}
                  className="h-4 w-4 shrink-0 text-ink-400 hover:text-ink-700"
                  description={maxItemWeightKg === null
                    ? 'No weight limit is set for the current boxes.'
                    : 'Based on available box capacity, minus the empty box’s weight.'}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <HandlingWarning weightKg={Number(draft.Weight)} thresholdKg={warningThresholdKg} />

      {weightTooHigh && (
        <p id={`${formId}-weight-error`} className="text-sm text-red-600">
          {itemWeightError(draft.Weight, maxItemWeightKg)}
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
        <Button type="submit" className={onCancel ? '' : 'w-full'} disabled={checkingWeightLimit || weightTooHigh || Boolean(codeError) || Boolean(referenceError)}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
