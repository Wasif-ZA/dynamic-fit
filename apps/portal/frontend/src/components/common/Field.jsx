import React from 'react';

export default function Field({ label, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-300">{hint}</span>}
    </label>
  );
}

export function inputClass(extra = '') {
  return `w-full rounded-sm border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 placeholder:text-ink-200 focus:border-brand-400 ${extra}`;
}
