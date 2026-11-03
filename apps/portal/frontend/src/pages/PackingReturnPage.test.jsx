import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { recordPacking } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import PackingReturnPage from './PackingReturnPage.jsx';
import PackingStatusBadge, { packingMessage } from '../components/orders/PackingStatusBadge.jsx';

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: vi.fn(),
  useSearchParams: vi.fn(),
}));
vi.mock('../api/client.js', () => ({ recordPacking: vi.fn() }));
vi.mock('../context/AppContext.jsx', () => ({ useApp: vi.fn() }));

let page;
let navigate;
let refreshOrders;
const text = (node) => node.children.map((child) => (typeof child === 'string' ? child : text(child))).join('');

async function open(query) {
  useSearchParams.mockReturnValue([new URLSearchParams(query)]);
  await act(async () => { page = create(<PackingReturnPage />); });
}

beforeEach(() => {
  vi.resetAllMocks();
  navigate = vi.fn();
  useNavigate.mockReturnValue(navigate);
  refreshOrders = vi.fn().mockResolvedValue(undefined);
  useApp.mockReturnValue({ refreshOrders });
});
afterEach(() => { if (page) act(() => page.unmount()); page = null; });

describe('returning from the Visualiser', () => {
  it.each([['true', true], ['false', false]])('records complete=%s and opens the order', async (value, complete) => {
    recordPacking.mockResolvedValue({});
    await open(`OrderID=ORD-007&complete=${value}`);

    expect(recordPacking).toHaveBeenCalledWith('ORD-007', complete);
    expect(refreshOrders).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/orders/ORD-007', { replace: true });
  });

  it('explains a failure and links back to the order', async () => {
    recordPacking.mockRejectedValue(new Error('Only finalised orders can be marked as packed. Finalise the order first.'));
    await open('OrderID=ORD-007&complete=true');

    expect(navigate).not.toHaveBeenCalled();
    expect(text(page.root)).toContain('Packing result not recorded');
    expect(text(page.root)).toContain('Finalise the order first');
    expect(page.root.findByType('a').props.href).toBe('/orders/ORD-007');
  });

  it.each(['', 'OrderID=ORD-007', 'OrderID=ORD-007&complete=maybe', 'complete=true'])(
    'does not record anything for an incomplete link (%s)', async (query) => {
      await open(query);
      expect(recordPacking).not.toHaveBeenCalled();
      expect(text(page.root)).toContain('did not say which order was packed');
    }
  );
});

describe('packing badge', () => {
  const render = (props) => { let badge; act(() => { badge = create(<PackingStatusBadge {...props} />); }); return badge; };

  it('shows Packed and Packing incomplete, and nothing before a result', () => {
    expect(render({ status: 'PACKED' }).toJSON().children).toEqual(['Packed']);
    expect(render({ status: 'INCOMPLETE' }).toJSON().children).toEqual(['Packing incomplete']);
    expect(render({ status: undefined }).toJSON()).toBeNull();
  });

  it('describes the packing result for the order page', () => {
    expect(packingMessage('PACKED')).toBe('The pick packer marked this order as packed.');
    expect(packingMessage('INCOMPLETE')).toContain('select Done');
    expect(packingMessage(undefined)).toContain('Open the Visualiser to pack this order');
  });
});
