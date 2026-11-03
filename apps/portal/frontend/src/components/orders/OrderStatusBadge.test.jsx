import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSolutionSummary } from '../../api/client.js';
import OrderStatusBadge from './OrderStatusBadge.jsx';

vi.mock('../../api/client.js', () => ({ getSolutionSummary: vi.fn() }));
vi.mock('react-dom', () => ({ createPortal: (children) => children }));

const target = { getBoundingClientRect: () => ({ left: 200, top: 200, bottom: 220 }) };
const rejected = { orderId: 'ORD-001', status: 'OPTIMISED', rejectedCount: 3 };
let page;

const info = () => page.root.findByProps({ 'aria-label': 'Why this order was rejected' });
const tooltip = () => page.root.findByProps({ role: 'tooltip' }).children.join('');
function mount(props = rejected) {
  act(() => { page = create(<OrderStatusBadge {...props} />); });
}
async function hover() {
  await act(async () => { info().props.onMouseEnter({ currentTarget: target }); });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { innerWidth: 800, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { body: {} });
  getSolutionSummary.mockResolvedValue({ Rejected: [
    { ItemCode: 'BIG', Reason: 'NO_FITTING_CARTON', Detail: 'Too large for any box' },
    { ItemCode: 'BIG', Reason: 'NO_FITTING_CARTON', Detail: 'Too large for any box' },
    { ItemCode: 'HEAVY', Reason: 'OVERWEIGHT', Detail: 'Exceeds box weight limit' },
  ] });
});

afterEach(() => {
  if (page) act(() => page.unmount());
  page = null;
  vi.unstubAllGlobals();
});

describe('rejected order explanations', () => {
  it('loads actual reasons only when the icon is used and groups duplicate causes', async () => {
    mount();
    expect(getSolutionSummary).not.toHaveBeenCalled();
    await hover();
    expect(getSolutionSummary).toHaveBeenCalledWith('ORD-001');
    expect(tooltip()).toContain('3 items could not be packed');
    expect(tooltip()).toContain('Too large for any box (2 items)');
    expect(tooltip()).toContain('Exceeds box weight limit');
  });

  it('uses saved raw solution reasons on the order page without another request', async () => {
    mount({ ...rejected, rejectedCount: 1, rejections: [{ item_ref: 'BIG', reason_code: 'NO_FITTING_CARTON', message: 'Too large for any box' }] });
    await hover();
    expect(tooltip()).toContain('1 item could not be packed');
    expect(tooltip()).toContain('Too large for any box');
    expect(getSolutionSummary).not.toHaveBeenCalled();
  });

  it('uses summary reasons when the full solution could not be loaded', async () => {
    mount({ ...rejected, rejections: [{ ItemCode: 'HEAVY', Reason: 'OVERWEIGHT', Detail: 'Exceeds box weight limit' }] });
    await hover();
    expect(tooltip()).toContain('Exceeds box weight limit');
    expect(getSolutionSummary).not.toHaveBeenCalled();
  });

  it.each([['DRAFT', 0], ['AWAITING_OPTIMISATION', 0], ['OPTIMISED', 0], ['FINAL', 0]])(
    'keeps %s tags compact without an irrelevant rejection icon', (status, rejectedCount) => {
      mount({ ...rejected, status, rejectedCount });
      expect(page.root.findAllByType('button')).toHaveLength(0);
      expect(getSolutionSummary).not.toHaveBeenCalled();
    }
  );

  it('deduplicates simultaneous hover and focus requests and shows a loading message', async () => {
    let finish;
    getSolutionSummary.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mount();
    await hover();
    await act(async () => { info().props.onFocus({ currentTarget: target }); });
    expect(tooltip()).toBe('Loading rejection reasons…');
    expect(getSolutionSummary).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ Rejected: [{ Detail: 'Too large' }] }); });
    expect(tooltip()).toContain('Too large');
  });

  it('explains a failed load without inventing a cause and retries on the next hover', async () => {
    getSolutionSummary.mockRejectedValueOnce(new Error('Service unavailable'));
    mount();
    await hover();
    expect(tooltip()).toContain('Could not load rejection reasons');
    await hover();
    expect(tooltip()).toContain('Too large for any box');
    expect(getSolutionSummary).toHaveBeenCalledTimes(2);
  });

  it('keeps missing detail and many different reasons readable', async () => {
    mount({ ...rejected, rejections: [
      { Reason: 'NO_FITTING_CARTON' },
      { Detail: 'Exceeds box weight limit' },
      { Detail: 'Another constraint' },
    ] });
    await hover();
    expect(tooltip()).toContain('No available box fits this item');
    expect(tooltip()).toContain('More reasons are listed in the order');
    expect(tooltip()).not.toContain('NO_FITTING_CARTON');
  });

  it('ignores a late response after the order changes to a successful result', async () => {
    let finish;
    getSolutionSummary.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mount();
    await hover();
    act(() => { page.update(<OrderStatusBadge {...rejected} rejectedCount={0} />); });
    await act(async () => { finish({ Rejected: [{ Detail: 'Too large' }] }); });
    expect(page.root.findAllByType('button')).toHaveLength(0);
    expect(page.root.findAllByProps({ role: 'tooltip' })).toHaveLength(0);
  });
});
