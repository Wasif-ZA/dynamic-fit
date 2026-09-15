import React, { useCallback, useEffect, useState } from 'react';
import {
  createUser,
  deleteUser,
  disableUser,
  enableUser,
  listUsers,
  updateUser,
} from '../api/client.js';
import Button from '../components/common/Button.jsx';
import Field, { inputClass } from '../components/common/Field.jsx';
import { useApp } from '../context/AppContext.jsx';
import { ROLE_LABELS, ROLES } from '../lib/roles.js';

const EMPTY_ACCOUNT = {
  Email: '',
  Password: '',
  DisplayName: '',
  Role: ROLES.USER,
};

export default function UserManagementPage() {
  const { identity } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers());
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

  const run = async (userId, action) => {
    setPendingId(userId);
    setError(null);
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(actionError);
    } finally {
      setPendingId(null);
    }
  };

  const canManage = (user) =>
    user.Role === ROLES.USER ||
    (identity.role === ROLES.ADMINISTRATOR && user.Role === ROLES.SUPERVISOR);

  if (loading) {
    return <PanelMessage>Loading Portal accounts…</PanelMessage>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-400">{users.length} Portal accounts</p>
        <Button onClick={() => setCreating(true)}>+ Create account</Button>
      </div>

      {error && (
        <p className="mb-4 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-sm border border-ink-100 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Display name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.Id} className="cut-line">
                <td className="px-4 py-3 text-ink-700">{user.Email}</td>
                <td className="px-4 py-3 text-ink-500">{user.DisplayName || '—'}</td>
                <td className="px-4 py-3 text-ink-500">{ROLE_LABELS[user.Role]}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.Status} />
                </td>
                <td className="px-4 py-3">
                  {canManage(user) && (
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setEditing(user)}>
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={pendingId === user.Id}
                        onClick={() => {
                          const verb = user.Status === 'ACTIVE' ? 'disable' : 're-enable';
                          if (window.confirm(`Are you sure you want to ${verb} ${user.Email}?`)) {
                            run(user.Id, () =>
                              user.Status === 'ACTIVE'
                                ? disableUser(user.Id)
                                : enableUser(user.Id)
                            );
                          }
                        }}
                      >
                        {user.Status === 'ACTIVE' ? 'Disable' : 'Re-enable'}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={pendingId === user.Id}
                        onClick={() => {
                          if (window.confirm(`Permanently delete ${user.Email}? Disable is normally safer.`)) {
                            run(user.Id, () => deleteUser(user.Id));
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <AccountModal
          title="Create account"
          initial={EMPTY_ACCOUNT}
          actorRole={identity.role}
          includeCredentials
          onCancel={() => setCreating(false)}
          onSave={async (account) => {
            await createUser(account);
            setCreating(false);
            await load();
          }}
        />
      )}

      {editing && (
        <AccountModal
          title={`Edit ${editing.Email}`}
          initial={editing}
          actorRole={identity.role}
          onCancel={() => setEditing(null)}
          onSave={async ({ DisplayName, Role }) => {
            await updateUser(editing.Id, { DisplayName: DisplayName || null, Role });
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AccountModal({ title, initial, actorRole, includeCredentials = false, onCancel, onSave }) {
  const [form, setForm] = useState({ ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const roles = actorRole === ROLES.ADMINISTRATOR
    ? [ROLES.USER, ROLES.SUPERVISOR]
    : [ROLES.USER];

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...form,
        Email: form.Email?.trim().toLowerCase(),
        DisplayName: form.DisplayName?.trim() || null,
      });
    } catch (saveError) {
      setError(saveError);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-700/50 p-4" role="dialog" aria-modal="true">
      <form className="w-full max-w-lg rounded-sm bg-white p-6 shadow-xl" onSubmit={submit}>
        <h2 className="font-display text-xl font-semibold text-ink-700">{title}</h2>
        <div className="mt-5 space-y-4">
          {includeCredentials && (
            <>
              <Field label="Email">
                <input type="email" required className={inputClass()} value={form.Email} onChange={update('Email')} autoComplete="off" />
              </Field>
              <Field label="Temporary password">
                <input type="password" required minLength="8" className={inputClass()} value={form.Password} onChange={update('Password')} autoComplete="new-password" />
              </Field>
            </>
          )}
          <Field label="Display name">
            <input className={inputClass()} value={form.DisplayName || ''} onChange={update('DisplayName')} />
          </Field>
          <Field label="Role">
            <select className={inputClass()} value={form.Role} onChange={update('Role')}>
              {roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
          </Field>
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error.message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save account'}</Button>
        </div>
      </form>
    </div>
  );
}

function StatusBadge({ status }) {
  const active = status === 'ACTIVE';
  return (
    <span className={`rounded-sm px-2 py-1 text-xs font-medium ${active ? 'bg-green-50 text-green-700' : 'bg-ink-100 text-ink-500'}`}>
      {active ? 'Active' : 'Disabled'}
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
