import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from './AppContext.jsx';
import * as api from '../api/client.js';
import { supabase } from '../auth/supabase.js';

vi.mock('../api/client.js', () => ({
  createOrder: vi.fn(),
  getCurrentProfile: vi.fn(),
  getManualHandlingSettings: vi.fn(),
  listOrders: vi.fn(),
  setAccessToken: vi.fn(),
  setAuthStatusHandler: vi.fn(),
  updateManualHandlingSettings: vi.fn(),
}));
vi.mock('../auth/supabase.js', () => {
  const client = {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
  };
  return { supabase: client, requireSupabase: () => client };
});

const PROFILE = {
  Id: 'u1', AuthUserId: 'a1', Email: 'supervisor@local.test', DisplayName: 'Supervisor',
  Role: 'SUPERVISOR', Status: 'ACTIVE',
};
const failure = (status) => Object.assign(new Error(`failed ${status}`), { status });

let page;
let latest;
function Probe() {
  latest = useApp();
  return null;
}
async function mount() {
  await act(async () => { page = create(<AppProvider><Probe /></AppProvider>); });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { setTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null });
  supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  supabase.auth.signOut.mockResolvedValue({});
  api.listOrders.mockResolvedValue([]);
  api.getManualHandlingSettings.mockResolvedValue({ WarningThresholdKg: null });
});
afterEach(() => {
  if (page) act(() => page.unmount());
  page = null;
  vi.unstubAllGlobals();
});

describe('restoring a session when the page loads', () => {
  it('keeps the user signed in when the backend cannot be reached', async () => {
    api.getCurrentProfile.mockRejectedValue(failure(0));
    await mount();

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(latest.connectionError).toBeTruthy();
    expect(latest.identity).toBeNull();
  });

  it.each([502, 503])('keeps the user signed in when the backend returns %s while waking', async (status) => {
    api.getCurrentProfile.mockRejectedValue(failure(status));
    await mount();

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(latest.connectionError).toBeTruthy();
  });

  it('signs in once a retry reaches the backend', async () => {
    api.getCurrentProfile.mockRejectedValueOnce(failure(0)).mockResolvedValue(PROFILE);
    await mount();
    await act(async () => { await latest.retryConnection(); });

    expect(latest.connectionError).toBeNull();
    expect(latest.identity.email).toBe('supervisor@local.test');
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it.each([401, 403])('still signs out when the backend rejects the session with %s', async (status) => {
    api.getCurrentProfile.mockRejectedValue(failure(status));
    await mount();

    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(latest.connectionError).toBeNull();
    expect(latest.authError.message).toBe(`failed ${status}`);
  });

  it('signs out when a retry finds the session is no longer valid', async () => {
    api.getCurrentProfile.mockRejectedValueOnce(failure(0)).mockRejectedValue(failure(401));
    await mount();
    await act(async () => { await latest.retryConnection(); });

    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(latest.connectionError).toBeNull();
  });
});
