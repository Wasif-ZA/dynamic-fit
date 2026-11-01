import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUser, deleteBox, listUsers } from './client.js';

function respond(status, body) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const quietly = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('API error messages', () => {
  it('uses the server explanation when there is one', async () => {
    quietly();
    respond(409, { detail: 'A user with this email already exists' });
    await expect(createUser({})).rejects.toThrow('A user with this email already exists');
  });

  it('lists field problems from a failed form submission', async () => {
    quietly();
    respond(422, {
      detail: [
        { loc: ['body', 'Password'], msg: 'String should have at least 8 characters', type: 'string_too_short' },
        { loc: ['body', 'Email'], msg: 'Value error, Email must be a valid address', type: 'value_error' },
      ],
    });
    await expect(createUser({})).rejects.toThrow(
      'Password: String should have at least 8 characters Email: Value error, Email must be a valid address'
    );
  });

  it.each([
    [404, 'This record no longer exists on the server. Refresh and try again.'],
    [422, 'The server rejected these details. Check the form and try again.'],
    [500, 'The server ran into a problem. Try again in a moment.'],
    [502, 'The server ran into a problem. Try again in a moment.'],
  ])('falls back to a message that fits any page for %s', async (status, message) => {
    quietly();
    respond(status, {});
    await expect(deleteBox('BOX-S')).rejects.toThrow(message);
  });

  it('never mentions orders when a non-order request fails', async () => {
    quietly();
    for (const status of [404, 422, 500]) {
      respond(status, {});
      await expect(listUsers()).rejects.not.toThrow(/order|packing/i);
    }
  });
});
