import React, { useMemo, useRef, useState } from 'react';
import Button from '../common/Button.jsx';
import Field, { inputClass } from '../common/Field.jsx';
import {
  QUANTITY_OPERATIONS,
  applyQuantityChange,
  createImportRecords,
  formatMaximumBoxes,
  normaliseBox,
  parseBoxesJson,
  validateImportResults,
} from '../../lib/boxValidation.js';

const PLACEHOLDER = `[
  {
    "Reference": "BOX-M",
    "Width": 320,
    "Length": 240,
    "Depth": 180,
    "MaxWeight": 25,
    "BoxWeight": 0.21,
    "Active": true,
    "MaximumBoxes": 20
  }
]`;

export default function BoxJsonImport({ inventory, onCancel, onConfirm }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState([]);
  const [records, setRecords] = useState(null);
  const fileInputRef = useRef(null);

  const review = (jsonText) => {
    const parsed = parseBoxesJson(jsonText);
    if (parsed.errors.length > 0) {
      setErrors(parsed.errors);
      return;
    }
    setErrors([]);
    setRecords(createImportRecords(parsed.boxes, inventory));
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith('.json')) {
      setErrors([`"${file.name}" is not a .json file.`]);
      return;
    }
    try {
      review(await file.text());
    } catch (error) {
      setErrors([`Could not read the file: ${error.message}`]);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (records) {
    return (
      <BoxImportReview
        initialRecords={records}
        inventory={inventory}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <Modal title="Import Box Inventory" onCancel={onCancel}>
      <p className="text-sm text-ink-400">
        Parse and review every resulting value before inventory changes.
      </p>
      <div className="mt-5 text-center">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-400">
          Upload boxes.json
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-ink-100 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
          Choose .json file
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
        {fileName && <p className="mt-2 text-xs text-ink-300">{fileName}</p>}
      </div>

      <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-300">
        <span className="h-px flex-1 bg-ink-100" />
        Or
        <span className="h-px flex-1 bg-ink-100" />
      </div>

      <Field label="Paste Box JSON">
        <textarea
          className="h-56 w-full rounded-sm border border-ink-100 bg-white px-3 py-2 font-mono text-xs text-ink-700 placeholder:text-ink-200 focus:border-brand-400"
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
        />
      </Field>
      <p className="mt-1 text-xs text-ink-300">
        Accepts a top-level array or {'{ "Boxes": [...] }'}. MaximumBoxes is the quantity
        available to use; omit it for no limit.
      </p>

      <ImportErrors errors={errors} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => review(text)} disabled={!text.trim()}>
          Review pasted JSON
        </Button>
      </div>
    </Modal>
  );
}

function BoxImportReview({ initialRecords, inventory, onCancel, onConfirm }) {
  const [records, setRecords] = useState(initialRecords);
  const [confirmError, setConfirmError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const validationErrors = useMemo(
    () => validateImportResults(records, inventory),
    [records, inventory]
  );
  const newCount = records.filter((record) => record.classification === 'NEW').length;
  const existingCount = records.length - newCount;

  const updateResult = (id, field, value) => {
    setRecords((current) => current.map((record) =>
      record.id === id
        ? { ...record, result: { ...record.result, [field]: value } }
        : record
    ));
    setConfirmError('');
  };

  const updateQuantity = (id, changes) => {
    setRecords((current) => current.map((record) =>
      record.id === id ? applyQuantityChange(record, changes) : record
    ));
    setConfirmError('');
  };

  const remove = (id) => {
    setRecords((current) => current.filter((record) => record.id !== id));
    setConfirmError('');
  };

  const confirm = async () => {
    if (validationErrors.length > 0 || confirming) return;
    setConfirming(true);
    setConfirmError('');
    try {
      await onConfirm(records.map((record) => normaliseBox(record.result)));
    } catch (error) {
      setConfirmError(error.message);
      setConfirming(false);
    }
  };

  return (
    <Modal title="Review Box Import" onCancel={onCancel} wide>
      <p className="text-sm text-ink-400">
        {records.length} {records.length === 1 ? 'record' : 'records'} · {newCount} new · {existingCount} existing
      </p>
      <p className="mt-1 text-xs text-ink-300">
        Nothing has changed yet. Result values below are the exact values confirmation will persist.
      </p>

      <div className="mt-5 space-y-4">
        {records.map((record, index) => (
          <article key={record.id} className="rounded-sm border border-ink-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`rounded-sm px-2 py-1 text-xs font-semibold ${record.classification === 'NEW' ? 'bg-brand-50 text-brand-600' : 'bg-amber-50 text-amber-700'}`}>
                  {record.classification}
                </span>
                <span className="font-mono font-semibold text-ink-700">
                  {record.result.Reference || `Record ${index + 1}`}
                </span>
              </div>
              <Button variant="danger" onClick={() => remove(record.id)}>Remove</Button>
            </div>

            {record.needsOperation ? (
              <QuantityReconciliation
                record={record}
                onImportedQuantityChange={(value) =>
                  updateQuantity(record.id, { importedQuantity: value })
                }
                onOperationChange={(quantityOperation) =>
                  updateQuantity(record.id, { quantityOperation })
                }
              />
            ) : record.current && (
              <p className="mt-3 text-xs text-ink-500">
                Available quantity: {formatMaximumBoxes(record.current.MaximumBoxes)} →{' '}
                {formatMaximumBoxes(record.result.MaximumBoxes)}. Taken from the imported file.
              </p>
            )}

            <div className={`mt-4 grid gap-4 ${record.current ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
              {record.current && <Snapshot title="Current" box={record.current} />}
              <Snapshot title="Imported" box={record.imported} />
              <ResultFields
                box={record.result}
                referenceReadOnly={record.classification === 'EXISTING'}
                showQuantity={!record.needsOperation}
                onChange={(field, value) => updateResult(record.id, field, value)}
              />
            </div>
          </article>
        ))}
      </div>

      <ImportErrors errors={validationErrors} />
      {confirmError && <ImportErrors errors={[confirmError]} />}
      <div className="mt-5 flex justify-end gap-2 border-t border-ink-100 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={confirming}>Cancel</Button>
        <Button
          onClick={confirm}
          disabled={records.length === 0 || validationErrors.length > 0 || confirming}
        >
          {confirming ? 'Importing...' : `Confirm Import (${records.length})`}
        </Button>
      </div>
    </Modal>
  );
}

function Snapshot({ title, box }) {
  const values = [
    ['Width', `${box.Width} mm`],
    ['Length', `${box.Length} mm`],
    ['Depth', `${box.Depth} mm`],
    ['Max Weight', box.MaxWeight == null ? '—' : `${box.MaxWeight} kg`],
    ['Box Weight', box.BoxWeight == null ? '—' : `${box.BoxWeight} kg`],
    ['Active', box.Active ? 'Yes' : 'No'],
    ['Available', formatMaximumBoxes(box.MaximumBoxes)],
  ];
  return (
    <section className="rounded-sm bg-ink-50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</h3>
      <dl className="space-y-1 text-xs">
        {values.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-ink-400">{label}</dt>
            <dd className="font-mono text-ink-600">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function QuantityReconciliation({ record, onImportedQuantityChange, onOperationChange }) {
  const resultingQuantity = record.result.MaximumBoxes;
  return (
    <section className="mt-4 rounded-sm border border-amber-200 bg-amber-50/40 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        Quantity reconciliation
      </h3>
      <div className="mt-3 grid gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">Current quantity</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink-700">
            {record.current.MaximumBoxes}
          </p>
        </div>
        <ResultInput
          label="Imported quantity"
          type="number"
          min="0"
          step="1"
          value={record.importedQuantity}
          onChange={onImportedQuantityChange}
        />
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Quantity update
          </legend>
          <QuantityOperationOption
            record={record}
            operation={QUANTITY_OPERATIONS.REPLACE}
            label="Replace existing quantity"
            description="Replaces the existing quantity and updates box settings from the imported file."
            onOperationChange={onOperationChange}
          />
          <QuantityOperationOption
            record={record}
            operation={QUANTITY_OPERATIONS.ADD}
            label="Add to existing quantity"
            description="Adds the imported quantity to the existing quantity. Box settings are updated from the imported file."
            onOperationChange={onOperationChange}
          />
        </fieldset>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">Resulting quantity</p>
          <output
            aria-label="Resulting quantity"
            className="mt-1 block font-mono text-lg font-semibold text-ink-700"
          >
            {resultingQuantity === '' ? 'Select an operation' : resultingQuantity}
          </output>
        </div>
      </div>
    </section>
  );
}

function QuantityOperationOption({ record, operation, label, description, onOperationChange }) {
  return (
    <label className="mt-2 flex items-start gap-2 text-sm text-ink-600">
      <input
        type="radio"
        className="mt-1"
        name={`quantity-operation-${record.id}`}
        checked={record.quantityOperation === operation}
        onChange={() => onOperationChange(operation)}
      />
      <span>
        {label}
        <span className="block text-xs text-ink-400">{description}</span>
      </span>
    </label>
  );
}

function ResultFields({ box, referenceReadOnly, showQuantity, onChange }) {
  return (
    <section className="rounded-sm border border-brand-100 bg-brand-50/30 p-3">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">Result</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <ResultInput label="Reference" value={box.Reference} disabled={referenceReadOnly} onChange={(value) => onChange('Reference', value)} />
        {showQuantity && (
          <ResultInput label="Available quantity" type="number" min="0" step="1" placeholder="No limit" value={box.MaximumBoxes ?? ''} onChange={(value) => onChange('MaximumBoxes', value)} />
        )}
        <ResultInput label="Width (mm)" type="number" min="0.01" value={box.Width} onChange={(value) => onChange('Width', value)} />
        <ResultInput label="Length (mm)" type="number" min="0.01" value={box.Length} onChange={(value) => onChange('Length', value)} />
        <ResultInput label="Depth (mm)" type="number" min="0.01" value={box.Depth} onChange={(value) => onChange('Depth', value)} />
        <ResultInput label="Max weight (kg)" type="number" min="0.01" value={box.MaxWeight ?? ''} onChange={(value) => onChange('MaxWeight', value)} />
        <ResultInput label="Box weight (kg)" type="number" min="0.01" value={box.BoxWeight ?? ''} onChange={(value) => onChange('BoxWeight', value)} />
        <label className="flex items-center gap-2 self-end py-2 text-sm text-ink-600">
          <input type="checkbox" checked={box.Active} onChange={(event) => onChange('Active', event.target.checked)} />
          Active
        </label>
      </div>
    </section>
  );
}

function ResultInput({ label, value, onChange, ...inputProps }) {
  return (
    <Field label={label}>
      <input
        className={inputClass(inputProps.disabled ? 'bg-ink-50 text-ink-400' : '')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
    </Field>
  );
}

function ImportErrors({ errors }) {
  if (!errors.length) return null;
  return (
    <div className="mt-4 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <p className="font-semibold">Import cannot continue:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
      </ul>
    </div>
  );
}

function Modal({ title, onCancel, wide = false, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/50 p-4" role="dialog" aria-modal="true" aria-labelledby="box-import-title">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-sm bg-white p-5 shadow-xl ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="box-import-title" className="font-display text-xl font-semibold text-ink-700">{title}</h2>
          <button type="button" onClick={onCancel} className="text-2xl leading-none text-ink-300 hover:text-ink-600" aria-label="Cancel import">×</button>
        </div>
        <div className="cut-line my-4" />
        {children}
      </div>
    </div>
  );
}
