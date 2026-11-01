// Portal API client. Field names are Portal's (Items, OrderId, Quantity). Backend translates to the solver.

const API_BASE = import.meta.env.VITE_PORTAL_API_BASE || 'http://127.0.0.1:8000';
const VISUALISER_BASE = import.meta.env.VITE_VISUALISER_BASE || 'http://localhost:5173';
let accessToken = null;
let authStatusHandler = null;

export function setAccessToken(token) {
  accessToken = token;
}

// Fire-and-forget request so a sleeping hosted backend starts waking while the user signs in.
export function warmUpApi() {
  fetch(`${API_BASE}/health`).catch(() => {});
}

export function setAuthStatusHandler(handler) {
  authStatusHandler = handler;
}

export class ApiError extends Error {
  constructor(message, { status = 0, detail = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function describe(status) {
  if (status === 401) return 'Your session is invalid or has expired. Sign in again.';
  if (status === 403) return 'Your role does not have permission to perform this action.';
  if (status === 404) return 'This record no longer exists on the server. Refresh and try again.';
  if (status === 409) return 'This action conflicts with existing data or its current state.';
  if (status === 422) return 'The server rejected these details. Check the form and try again.';
  if (status >= 500) return 'The server ran into a problem. Try again in a moment.';
  return `The server returned an unexpected error (${status}).`;
}

// FastAPI sends a string detail for its own errors, and a list of field
// problems when a request fails validation.
function usefulJsonDetail(body) {
  try {
    const { detail } = JSON.parse(body) ?? {};
    if (typeof detail === 'string') return detail.trim();
    if (Array.isArray(detail)) {
      const problems = detail
        .filter((problem) => typeof problem?.msg === 'string')
        .map((problem) => {
          const field = Array.isArray(problem.loc) ? problem.loc.at(-1) : null;
          return typeof field === 'string' ? `${field}: ${problem.msg}` : problem.msg;
        });
      return [...new Set(problems)].join(' ');
    }
    return '';
  } catch {
    return '';
  }
}

async function request(path, options = {}) {
  const { skipAuthStatus = false, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  } catch (cause) {
    console.error(`Portal API unreachable at ${API_BASE}${path}`, cause);
    throw new ApiError(
      `Cannot reach the Portal API at ${API_BASE}. Is the backend running?`,
      { detail: String(cause) }
    );
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    const serverDetail = usefulJsonDetail(responseBody);
    console.error(`${fetchOptions.method || 'GET'} ${path} -> ${response.status}`, responseBody);
    if (!skipAuthStatus && [401, 403].includes(response.status)) {
      Promise.resolve(authStatusHandler?.({ status: response.status, path })).catch(() => {});
    }
    throw new ApiError(serverDetail || describe(response.status), {
      status: response.status,
      detail: serverDetail || responseBody,
    });
  }

  if (response.status === 204) return null;
  return response.json();
}

const asJson = (body, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export function listOrders({ view = 'active' } = {}) {
  return request(view === 'active' ? '/orders' : `/orders?view=${encodeURIComponent(view)}`);
}

export function getItemWeightLimit() {
  return request('/orders/item-weight-limit');
}

export function getManualHandlingSettings() {
  return request('/settings/manual-handling');
}

export function updateManualHandlingSettings(WarningThresholdKg) {
  return request('/settings/manual-handling', asJson({ WarningThresholdKg }, 'PUT'));
}

export function archiveOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/archive`, { method: 'POST' });
}

export function holdOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/hold`, { method: 'POST' });
}

export function resumeOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/resume`, { method: 'POST' });
}

export function deleteOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
}

export function createOrder({ items }) {
  return request('/orders', asJson({ Items: items }));
}

export function getOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}`);
}

export function updateOrder(orderId, { items }) {
  return request(`/orders/${encodeURIComponent(orderId)}`, asJson({ Items: items }, 'PUT'));
}

export function submitOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/submit`, { method: 'POST' });
}

// furtherOptimise asks the solver to spend up to 30 s looking for one smaller box.
export function solveOrder(orderId, { furtherOptimise = false } = {}) {
  const query = furtherOptimise ? '?optimise=true' : '';
  return request(`/orders/${encodeURIComponent(orderId)}/solve${query}`, { method: 'POST' });
}

export function finaliseOrder(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/finalise`, { method: 'POST' });
}

export function getSolution(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/solution`);
}

export function getSolutionSummary(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/solution/summary`);
}

export function getVisualizerHandoff(orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/visualizer-handoff`, {
    method: 'POST',
  });
}

export function visualiserUrl(solutionUrl) {
  return `${VISUALISER_BASE}/?solution=${encodeURIComponent(solutionUrl)}`;
}

export function listBoxes() {
  return request('/boxes');
}

export function createBox(box) {
  return request('/boxes', asJson(box));
}

export function updateBox(reference, box) {
  return request(`/boxes/${encodeURIComponent(reference)}`, asJson(box, 'PUT'));
}

export function importBoxes(boxes) {
  return request('/boxes/import', asJson({ Boxes: boxes }));
}

export function deleteBox(reference) {
  return request(`/boxes/${encodeURIComponent(reference)}`, { method: 'DELETE' });
}

export function getCurrentProfile(options) {
  return request('/auth/me', options);
}

export function listUsers() {
  return request('/users');
}

export function createUser(user) {
  return request('/users', asJson(user));
}

export function updateUser(userId, user) {
  return request(`/users/${encodeURIComponent(userId)}`, asJson(user, 'PUT'));
}

export function disableUser(userId) {
  return request(`/users/${encodeURIComponent(userId)}/disable`, { method: 'POST' });
}

export function enableUser(userId) {
  return request(`/users/${encodeURIComponent(userId)}/enable`, { method: 'POST' });
}

export function deleteUser(userId) {
  return request(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
