import React from 'react';

export default function AuthShell({ heading, subheading, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-700 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="font-display text-3xl font-semibold tracking-wide text-white">
            FitPortal
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-ink-300">
            Project Perfect Fit
          </p>
        </div>
        <div className="rounded-sm bg-white p-8 shadow-xl">
          <h1 className="font-display text-2xl font-semibold text-ink-700">{heading}</h1>
          <p className="mt-1 text-sm text-ink-400">{subheading}</p>
          <div className="cut-line my-6" />
          {children}
        </div>
      </div>
    </div>
  );
}
