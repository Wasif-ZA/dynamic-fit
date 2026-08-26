// FitPortal API client. The Portal owns the order, FitSolver packs it, and the
// visualiser draws the result the Portal hands back.

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8100';
const VISUALISER_BASE = import.meta.env.VITE_VISUALISER_BASE || 'http://127.0.0.1:5173';

// The API forbids unknown fields, and `Hazardous` and `qty` are Portal-side
// concepts the contract has no column for. See issue: the two disagree.
const CONTRACT_FIELDS = ['ItemCode', 'ItemReference', 'Width', 'Length', 'Depth', 'Weight'];

function toContractItems(items) {
  return items.flatMap((item, index) => {
    const base = {};
    for (const field of CONTRACT_FIELDS) base[field] = item[field];
    if (item.BoxGroup) base.BoxGroup = item.BoxGroup;

    const quantity = Math.max(1, item.qty || 1);
    return Array.from({ length: quantity }, (_, copy) => ({
      ...base,
      ItemCode: quantity > 1 ? `${base.ItemCode}-${copy + 1}` : base.ItemCode,
      ItemReference: `${base.ItemReference}${quantity > 1 ? ` (${copy + 1}/${quantity})` : ''}`,
    }));
  });
}

async function send(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${options?.method || 'GET'} ${path} failed: ${response.status} ${detail}`);
  }
  return response.json();
}

export async function packOrder(items) {
  const created = await send('/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ Items: toContractItems(items) }),
  });
  const orderId = created.OrderId;
  const solution = await send(`/orders/${orderId}/solve`, { method: 'POST' });
  return { orderId, solution };
}

export function visualiserUrl(orderId) {
  const solution = `${API_BASE}/orders/${orderId}/solution`;
  return `${VISUALISER_BASE}/?solution=${encodeURIComponent(solution)}`;
}
