import React, { useEffect, useId, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { canConfigureHandlingWarnings } from '../../lib/roles.js';
import Button from '../common/Button.jsx';
import InfoTooltip from '../common/InfoTooltip.jsx';

export default function ManualHandlingSettings() {
  const { identity, handlingSettings, handlingSettingsError, loadingHandlingSettings,
    refreshHandlingSettings, saveHandlingSettings } = useApp();
  const canConfigure = canConfigureHandlingWarnings(identity?.role);
  const current = handlingSettings?.WarningThresholdKg ?? null;
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const headingId = useId();
  useEffect(() => { setDraft(current === null ? '' : String(current)); }, [current]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const valid = draft.trim() !== '' && Number.isFinite(Number(draft)) && Number(draft) > 0;

  const save = async (threshold) => {
    if (inFlight.current || !canConfigure) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await saveHandlingSettings(threshold);
      if (mounted.current) {
        setDraft(threshold === null ? '' : String(threshold));
        setMessage(threshold === null ? 'Handling warnings turned off.' : `Warnings will appear at or above ${threshold} kg.`);
      }
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section id="handling-warnings" aria-labelledby={headingId} className="rounded-sm border border-ink-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id={headingId} className="flex items-center gap-1 text-sm font-semibold text-ink-700">
            Handling warnings
            <InfoTooltip label="About handling warnings" iconSize={12} className="h-5 w-5 text-ink-400 hover:text-ink-700"
              description="Warns when an item or packed box reaches the set weight. Set according to your workplace risk assessment." />
          </h2>
        </div>
        {canConfigure ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (valid && !loadingHandlingSettings && !handlingSettingsError) return save(Number(draft)); }}>
            <label className="flex items-center gap-2 text-xs text-ink-500">
              Warn at
              <input aria-label="Warning threshold (kg)" type="number" min="0.001" step="0.001" value={draft} placeholder="Off"
                className="w-20 rounded-sm border border-ink-100 bg-white px-2 py-1 font-mono text-sm text-ink-700 focus:border-brand-400"
                disabled={busy || loadingHandlingSettings || Boolean(handlingSettingsError)}
                onChange={(event) => { setDraft(event.target.value); setError(''); setMessage(''); }} />
              kg
            </label>
            <Button size="compact" type="submit" disabled={!valid || busy || loadingHandlingSettings || Boolean(handlingSettingsError) || Number(draft) === current}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            {current !== null && <Button size="compact" variant="ghost" disabled={busy || loadingHandlingSettings} onClick={() => save(null)}>Turn off</Button>}
          </form>
        ) : (
          <div className="text-right">
            <p className="text-sm font-medium text-ink-600">
              {loadingHandlingSettings && !handlingSettings ? 'Loading…' : handlingSettingsError && !handlingSettings ? 'Unavailable' : current === null ? 'Warnings off' : `${current} kg and above`}
            </p>
            <p className="text-xs text-ink-400">Administrator or Supervisor access needed to edit. Your account has view-only access.</p>
          </div>
        )}
      </div>
      {handlingSettingsError && (
        <div role="status" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-800">
          Could not load handling warning settings.
          <Button size="compact" variant="secondary" onClick={() => refreshHandlingSettings?.()}>Retry settings</Button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-2 text-sm text-brand-700">{message}</p>}
    </section>
  );
}
