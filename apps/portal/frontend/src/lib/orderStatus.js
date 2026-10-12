export const ORDER_STATUS_LABELS = {
  DRAFT: 'Draft',
  AWAITING_OPTIMISATION: 'Awaiting Optimisation',
  OPTIMISED: 'Optimised',
  FINAL: 'Final',
};

export const ORDER_STATUS_STYLES = {
  DRAFT: 'bg-ink-50 text-ink-500',
  AWAITING_OPTIMISATION: 'bg-brand-50 text-brand-600',
  OPTIMISED: 'bg-ink-700 text-white',
  FINAL: 'bg-brand-600 text-white',
};

export function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status;
}
