import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../common/Button.jsx';

export default function HandlingWarningsStatus({ settings, error, loading, onRetry }) {
  if (error) return (
    <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-amber-800">
      Handling warnings are unavailable. Check handling before lifting.
      <Button size="compact" variant="secondary" onClick={() => onRetry?.()}>Retry warnings</Button>
    </div>
  );
  if (loading && !settings) return <p className="text-xs text-ink-400">Loading handling warnings…</p>;
  if (!settings) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-ink-100 bg-white px-3 py-2 text-sm">
      <p className="text-ink-500">Handling warnings: <span className="font-semibold text-ink-700">{settings.WarningThresholdKg === null ? 'Off' : `${settings.WarningThresholdKg} kg and above`}</span></p>
      <Link to="/boxes#handling-warnings" className="font-semibold text-brand-600 hover:underline">Handling settings →</Link>
    </div>
  );
}
