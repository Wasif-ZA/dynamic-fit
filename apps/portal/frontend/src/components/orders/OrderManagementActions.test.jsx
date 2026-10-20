import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveOrder, deleteOrder, holdOrder, resumeOrder } from '../../api/client.js';
import { useApp } from '../../context/AppContext.jsx';
import OrderManagementActions from './OrderManagementActions.jsx';

vi.mock('../../api/client.js', () => ({ archiveOrder: vi.fn(), deleteOrder: vi.fn(), holdOrder: vi.fn(), resumeOrder: vi.fn() }));
vi.mock('../../context/AppContext.jsx', () => ({ useApp: vi.fn() }));

const ORDER = { OrderId: 'ORD-001', Status: 'OPTIMISED' };
const HELD = { ...ORDER, HeldAt: '2026-10-20T00:00:00Z' };
const FINAL = { ...ORDER, Status: 'FINAL', FinalisedAt: '2026-10-20T00:00:00Z' };
let page;
let onChanged;
let onDeleted;

function text(node) {
  return node.children.map((child) => typeof child === 'string' ? child : text(child)).join('');
}
function button(label) {
  return page.root.findAllByType('button').find((node) => text(node) === label);
}
function mount(order = ORDER) {
  act(() => { page = create(<OrderManagementActions order={order} onChanged={onChanged} onDeleted={onDeleted} />); });
}

beforeEach(() => {
  vi.resetAllMocks();
  useApp.mockReturnValue({ identity: { role: 'ADMINISTRATOR' } });
  onChanged = vi.fn().mockResolvedValue(undefined);
  onDeleted = vi.fn().mockResolvedValue(undefined);
  holdOrder.mockResolvedValue(HELD);
  resumeOrder.mockResolvedValue(ORDER);
  archiveOrder.mockResolvedValue({ ...FINAL, ArchivedAt: '2026-11-20T00:00:00Z' });
  deleteOrder.mockResolvedValue(undefined);
});
afterEach(() => { if (page) act(() => page.unmount()); page = null; });

describe('visible order actions', () => {
  it.each(['SUPERVISOR', 'ADMINISTRATOR'])('lets a %s put unfinished work on hold in one action', async (role) => {
    useApp.mockReturnValue({ identity: { role } });
    mount();
    expect(page.root.findAllByType('details')).toHaveLength(0);
    expect(page.root.findByProps({ role: 'group' }).props['aria-label']).toBe('Actions for ORD-001');
    expect(button('Hold')).toBeDefined();
    expect(button('Delete')).toBeDefined();

    await act(async () => { await button('Hold').props.onClick(); });

    expect(holdOrder).toHaveBeenCalledWith('ORD-001');
    expect(archiveOrder).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(page.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
  });

  it.each([ORDER, HELD, FINAL])('hides management actions from regular Users', (order) => {
    useApp.mockReturnValue({ identity: { role: 'USER' } });
    mount(order);
    expect(page.toJSON()).toBeNull();
  });

  it('resumes an order from the backlog without changing its lifecycle', async () => {
    mount(HELD);
    expect(button('Hold')).toBeUndefined();
    expect(button('Resume').props.className).toContain('bg-brand-500');
    await act(async () => { await button('Resume').props.onClick(); });
    expect(resumeOrder).toHaveBeenCalledWith('ORD-001');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith('resume');
  });

  it.each([ORDER, HELD])('allows direct deletion with one confirmation and no archive prerequisite', async (order) => {
    mount(order);
    act(() => button('Delete').props.onClick());
    expect(text(page.root)).toContain('cannot be undone');
    expect(deleteOrder).not.toHaveBeenCalled();
    act(() => button('Cancel').props.onClick());
    expect(deleteOrder).not.toHaveBeenCalled();
    act(() => button('Delete').props.onClick());
    const confirm = button('Delete permanently').props.onClick;

    await act(async () => { await Promise.all([confirm(), confirm()]); });

    expect(deleteOrder).toHaveBeenCalledTimes(1);
    expect(deleteOrder).toHaveBeenCalledWith('ORD-001');
    expect(archiveOrder).not.toHaveBeenCalled();
    expect(holdOrder).not.toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('offers only Archive for a finalised order', async () => {
    mount(FINAL);
    expect(button('Delete')).toBeUndefined();
    expect(button('Hold')).toBeUndefined();
    expect(button('Resume')).toBeUndefined();
    expect(button('Archive').props.className).not.toContain('bg-brand-500');
    await act(async () => { await button('Archive').props.onClick(); });
    expect(archiveOrder).toHaveBeenCalledWith('ORD-001');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('shows no actions on an archived finalised order', () => {
    mount({ ...FINAL, ArchivedAt: '2026-11-20T00:00:00Z' });
    expect(page.toJSON()).toBeNull();
  });

  it('shows failed deletion without removing the order or closing confirmation', async () => {
    deleteOrder.mockRejectedValue(new Error('Finalised orders cannot be permanently deleted'));
    mount();
    act(() => button('Delete').props.onClick());
    await act(async () => { await button('Delete permanently').props.onClick(); });
    expect(page.root.findAllByProps({ role: 'dialog' })).toHaveLength(1);
    expect(text(page.root)).toContain('Finalised orders cannot be permanently deleted');
    expect(button('Cancel').props.disabled).toBe(false);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('does not apply callbacks to a page left during deletion', async () => {
    let finishDelete;
    deleteOrder.mockReturnValue(new Promise((resolve) => { finishDelete = resolve; }));
    mount();
    act(() => button('Delete').props.onClick());
    act(() => { button('Delete permanently').props.onClick(); });
    act(() => page.unmount());
    page = null;
    await act(async () => { finishDelete(); });
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
