import React from 'react';

const VARIANTS = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600',
  secondary: 'bg-white text-ink-700 border border-ink-100 hover:bg-ink-50',
  ghost: 'text-ink-500 hover:bg-ink-50',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
};

export default function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
