export const ORDER_STATUS_LABELS = {
  DRAFT: 'Draft',
  AWAITING_OPTIMISATION: 'Awaiting Optimisation',
  OPTIMISED: 'Optimised',
  FINAL: 'Finalised',
};

export const ORDER_STATUS_STYLES = {
  DRAFT: 'bg-ink-50 text-ink-500',
  AWAITING_OPTIMISATION: 'bg-brand-50 text-brand-600',
  OPTIMISED: 'bg-ink-700 text-white',
  FINAL: 'bg-brand-600 text-white',
};

export function orderStatusLabel(status, rejectedCount = 0) {
  if (status === 'OPTIMISED' && rejectedCount > 0) return 'Rejected';
  return ORDER_STATUS_LABELS[status] || status;
}

export function orderStatusStyle(status, rejectedCount = 0) {
  if (status === 'OPTIMISED' && rejectedCount > 0) return 'bg-red-50 text-red-700';
  return ORDER_STATUS_STYLES[status] || ORDER_STATUS_STYLES.DRAFT;
}
