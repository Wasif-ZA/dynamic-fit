import React, { useCallback, useEffect, useState } from 'react';
import { createBox, deleteBox, importBoxes, listBoxes, updateBox } from '../api/client.js';
import Button from '../components/common/Button.jsx';
import Field, { inputClass } from '../components/common/Field.jsx';
import BoxJsonImport from '../components/boxes/BoxJsonImport.jsx';
import { useApp } from '../context/AppContext.jsx';
import { formatMaximumBoxes, normaliseMaximumBoxes } from '../lib/boxValidation.js';
import { canManageBoxInventory } from '../lib/roles.js';

const EMPTY_BOX = {
  Reference: '',
  Width: '',
  Length: '',
  Depth: '',
  MaxWeight: '',
  BoxWeight: '',
  MaximumBoxes: '',
  Active: true,
};

export default function BoxInventoryPage() {
  const { identity } = useApp();
  const canManage = canManageBoxInventory(identity.role);
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState('');
  const [savingReference, setSavingReference] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBoxes(await listBoxes());
      setError(null);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (payload) => {
    setSuccess('');
    if (editing?.Reference) {
      await updateBox(editing.Reference, withoutReference(payload));
    } else {
      await createBox(payload);
    }
    setEditing(null);
    await load();
  };

  const remove = async (reference) => {
    setSuccess('');
    await deleteBox(reference);
    setEditing(null);
    setSuccess(`Deleted box type ${reference}.`);
    await load();
  };

  const toggleActive = async (box) => {
    setSuccess('');
    setSavingReference(box.Reference);
    setError(null);
    try {
      await updateBox(box.Reference, withoutReference({ ...box, Active: !box.Active }));
      await load();
    } catch (updateError) {
      setError(updateError);
    } finally {
      setSavingReference(null);
    }
  };

  const confirmImport = async (resultBoxes) => {
    const response = await importBoxes(resultBoxes);
    setImporting(false);
    setSuccess(
      `Imported ${response.Imported} box ${response.Imported === 1 ? 'record' : 'records'}.`
    );
    await load();
  };

  if (loading) {
    return <PanelMessage>Loading box inventory...</PanelMessage>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-400">{boxes.length} reusable box types</p>
          {!canManage && (
            <p className="mt-1 text-xs uppercase tracking-wide text-ink-300">
              Read-only access
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              Import JSON
            </Button>
            <Button onClick={() => setEditing(EMPTY_BOX)}>+ Add Box Type</Button>
          </div>
        )}
      </div>

      {success && (
        <p className="mb-4 rounded-sm border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error.message}</p>
          <Button className="mt-3" variant="secondary" onClick={load}>
            Try again
          </Button>
        </div>
      )}

      {boxes.length === 0 ? (
        <PanelMessage>No box types are configured.</PanelMessage>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-ink-100 bg-white">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3 font-mono">Reference</th>
                <th className="px-4 py-3">Dimensions</th>
                <th className="px-4 py-3">Max weight</th>
                <th className="px-4 py-3">Box weight</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {boxes.map((box) => (
                <tr key={box.Reference} className="cut-line">
                  <td className="px-4 py-3 font-mono font-medium text-ink-700">
                    {box.Reference}
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {box.Width} × {box.Length} × {box.Depth} mm
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {box.MaxWeight == null ? '—' : `${box.MaxWeight} kg`}
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {box.BoxWeight == null ? '—' : `${box.BoxWeight} kg`}
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-700">
                    {formatMaximumBoxes(box.MaximumBoxes)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge active={box.Active} />
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setEditing(box)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={savingReference === box.Reference}
                          onClick={() => toggleActive(box)}
                        >
                          {savingReference === box.Reference
                            ? 'Saving...'
                            : box.Active
                              ? 'Deactivate'
                              : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <BoxFormModal
          initialBox={editing}
          isEditing={Boolean(editing.Reference)}
          onCancel={() => setEditing(null)}
          onSave={save}
          onDelete={editing.Reference ? () => remove(editing.Reference) : undefined}
        />
      )}


      {importing && (
        <BoxJsonImport
          inventory={boxes}
          onCancel={() => setImporting(false)}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}

function BoxFormModal({ initialBox, isEditing, onCancel, onSave, onDelete }) {
  const [form, setForm] = useState({ ...initialBox });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;

  const remove = async () => {
    const confirmed = window.confirm(
      `Permanently delete box type ${initialBox.Reference}? Deactivate keeps it out of packing without deleting it.`
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (deleteError) {
      setError(deleteError);
      setDeleting(false);
    }
  };

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(toPayload(form));
    } catch (saveError) {
      setError(saveError);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="box-form-title"
    >
      <form className="w-full max-w-2xl rounded-sm bg-white p-6 shadow-xl" onSubmit={submit}>
        <h2 id="box-form-title" className="font-display text-xl font-semibold text-ink-700">
          {isEditing ? `Edit ${initialBox.Reference}` : 'Add Box Type'}
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Reference *">
            <input
              className={inputClass(isEditing ? 'bg-ink-50 text-ink-400' : '')}
              required
              disabled={isEditing}
              value={form.Reference}
              onChange={update('Reference')}
            />
          </Field>
          <NumberField label="Available quantity" field="MaximumBoxes" min="0" step="1" form={form} update={update} optional placeholder="No limit" hint="Leave blank for no limit. Reduced when orders are finalised." />
          <NumberField label="Width (mm) *" field="Width" min="0.01" form={form} update={update} />
          <NumberField label="Length (mm) *" field="Length" min="0.01" form={form} update={update} />
          <NumberField label="Depth (mm) *" field="Depth" min="0.01" form={form} update={update} />
          <NumberField label="Max weight (kg)" field="MaxWeight" min="0.01" form={form} update={update} optional />
          <NumberField label="Box weight (kg)" field="BoxWeight" min="0.01" form={form} update={update} optional />
          <label className="flex items-center gap-3 self-end py-2 text-sm font-medium text-ink-600">
            <input type="checkbox" checked={form.Active} onChange={update('Active')} />
            Active
          </label>
        </div>
        {error && (
          <p className="mt-4 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error.message}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div>
            {isEditing && onDelete && (
              <Button variant="danger" onClick={remove} disabled={busy}>
                {deleting ? 'Deleting...' : 'Delete box type'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{saving ? 'Saving...' : 'Save box type'}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function NumberField({ label, field, min, step = 'any', form, update, optional = false, hint, placeholder }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        step={step}
        min={min}
        required={!optional}
        placeholder={placeholder}
        className={inputClass()}
        value={form[field] ?? ''}
        onChange={update(field)}
      />
    </Field>
  );
}

function StatusBadge({ active }) {
  return (
    <span className={`rounded-sm px-2 py-1 text-xs font-medium ${active ? 'bg-green-50 text-green-700' : 'bg-ink-100 text-ink-500'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function PanelMessage({ children }) {
  return (
    <div className="rounded-sm border border-dashed border-ink-200 bg-white p-10 text-center text-sm text-ink-400">
      {children}
    </div>
  );
}

function withoutReference(box) {
  const { Reference: _reference, ...editableFields } = box;
  return editableFields;
}

function toPayload(form) {
  const optionalNumber = (value) => value === '' || value == null ? null : Number(value);
  return {
    Reference: form.Reference.trim(),
    Width: Number(form.Width),
    Length: Number(form.Length),
    Depth: Number(form.Depth),
    MaxWeight: optionalNumber(form.MaxWeight),
    BoxWeight: optionalNumber(form.BoxWeight),
    MaximumBoxes: normaliseMaximumBoxes(form.MaximumBoxes),
    Active: form.Active,
  };
}
