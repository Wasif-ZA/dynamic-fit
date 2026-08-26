// Portal API client. Field names are Portal's (Items, OrderId, Quantity). Backend translates to the solver.

const API_BASE = import.meta.env.VITE_PORTAL_API_BASE || 'http://127.0.0.1:8000';
const VISUALISER_BASE = import.meta.env.VITE_VISUALISER_BASE || 'http://localhost:5173';

export class ApiError extends Error {
  constructor(message, { status = 0, detail = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function describe(status) {
  if (status === 404) return 'That order no longer exists on the server.';
  if (status === 409) return 'The warehouse has no active box types to pack into.';
  if (status === 422) return 'The server rejected this order. Check the item details.';
  if (status >= 500) return 'The packing service failed. Try again in a moment.';
  return `The server returned an unexpected error (${status}).`;
}

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch (cause) {
    console.error(`Portal API unreachable at ${API_BASE}${path}`, cause);
    throw new ApiError(
      `Cannot reach the Portal API at ${API_BASE}. Is the backend running?`,
      { detail: String(cause) }
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`${options?.method || 'GET'} ${path} -> ${response.status}`, detail);
    throw new ApiError(describe(response.status), {
      status: response.status,
      detail,
    });
  }

  if (response.status === 204) return null;
  return response.json();
}

const asJson = (body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export function listOrders() {
  return request('/orders');
}

export function createOrder({ reference, items }) {
  return request('/orders', asJson({ Reference: reference, Items: items }));
}

export function getOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}`);
}

export function solveOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/solve`, { method: 'POST' });
}

export function getSolution(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/solution`);
}

export function getSolutionSummary(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/solution/summary`);
}

export function solutionUrl(orderId) {
  return `${API_BASE}/orders/${encodeURIComponent(orderId)}/solution`;
}

export function visualiserUrl(orderId) {
  return `${VISUALISER_BASE}/?solution=${encodeURIComponent(solutionUrl(orderId))}`;
}
