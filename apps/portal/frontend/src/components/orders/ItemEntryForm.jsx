import React, { useState } from 'react';
import Field, { inputClass } from '../common/Field.jsx';
import Button from '../common/Button.jsx';
import { emptyItemDraft } from '../../data/mockData.js';

export default function ItemEntryForm({ onAdd }) {
  const [draft, setDraft] = useState(emptyItemDraft());
  const [error, setError] = useState('');

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const handleAdd = (e) => {
    e.preventDefault();
    const { ItemCode, ItemReference, Width, Length, Depth, Weight } = draft;
    if (!ItemCode || !ItemReference || !Width || !Length || !Depth || !Weight) {
      setError('Item code, reference, dimensions and weight are required.');
      return;
    }
    onAdd({
      ItemCode: draft.ItemCode,
      ItemReference: draft.ItemReference,
      Width: Number(draft.Width),
      Length: Number(draft.Length),
      Depth: Number(draft.Depth),
      Weight: Number(draft.Weight),
      Quantity: Number(draft.Quantity) || 1,
      Hazardous: draft.Hazardous,
      ...(draft.BoxGroup.trim() ? { BoxGroup: draft.BoxGroup.trim() } : {}),
    });
    setDraft(emptyItemDraft());
    setError('');
  };

  return (
    <form onSubmit={handleAdd} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Item code">
          <input
            className={inputClass('font-mono')}
            placeholder="ITM-004"
            value={draft.ItemCode}
            onChange={update('ItemCode')}
          />
        </Field>
        <Field label="Item reference">
          <input
            className={inputClass()}
            placeholder="Widget C"
            value={draft.ItemReference}
            onChange={update('ItemReference')}
          />
        </Field>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Field label="Width (mm)">
          <input
            type="number"
            min="0"
            className={inputClass('font-mono')}
            value={draft.Width}
            onChange={update('Width')}
          />
        </Field>
        <Field label="Length (mm)">
          <input
            type="number"
            min="0"
            className={inputClass('font-mono')}
            value={draft.Length}
            onChange={update('Length')}
          />
        </Field>
        <Field label="Depth (mm)">
          <input
            type="number"
            min="0"
            className={inputClass('font-mono')}
            value={draft.Depth}
            onChange={update('Depth')}
          />
        </Field>
        <Field label="Weight (kg)">
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClass('font-mono')}
            value={draft.Weight}
            onChange={update('Weight')}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Box group"
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

      <label className="flex items-center gap-2 rounded-sm border border-hazard/40 bg-hazard/10 px-3 py-2 text-sm font-medium text-hazard-ink">
        <input
          type="checkbox"
          className="h-4 w-4 accent-hazard"
          checked={draft.Hazardous}
          onChange={update('Hazardous')}
        />
        Flag as hazardous / dangerous goods
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" className="w-full">
        Add item to order
      </Button>
    </form>
  );
}
