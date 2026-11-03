import React from 'react';

const VARIANTS = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600',
  secondary: 'bg-white text-ink-700 border border-ink-100 hover:bg-ink-50',
  warning: 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100',
  muted: 'bg-ink-50 text-ink-400 border border-ink-100 hover:bg-ink-100',
  ghost: 'text-ink-500 hover:bg-ink-50',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
};

export default function Button({
  variant = 'primary',
  size = 'default',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size === 'compact' ? 'rounded px-2 py-1 text-xs' : 'rounded-sm px-4 py-2 text-sm'} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
