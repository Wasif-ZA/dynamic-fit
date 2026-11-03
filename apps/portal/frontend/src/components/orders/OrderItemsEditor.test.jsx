import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getItemWeightLimit } from '../../api/client.js';
import OrderItemsEditor from './OrderItemsEditor.jsx';

vi.mock('../../api/client.js', () => ({ getItemWeightLimit: vi.fn() }));
const ITEM = { ItemCode: 'HEAVY', ItemReference: 'Heavy test', Width: 100, Length: 100, Depth: 100, Weight: 35, Quantity: 1 };
let page;
let onSave;
let focusListeners;
function text(node) {
  return node.children.map((child) => typeof child === 'string' ? child : text(child)).join('');
}
const button = (label) => page.root.findAllByType('button').find((node) => text(node) === label);
async function mount() {
  await act(async () => { page = create(<OrderItemsEditor initialItems={[ITEM]} onSave={onSave} saveLabel="Save" savingLabel="Saving" />); });
}

beforeEach(() => {
  vi.resetAllMocks();
  focusListeners = new Set();
  vi.stubGlobal('window', {
    addEventListener: (name, callback) => { if (name === 'focus') focusListeners.add(callback); },
    removeEventListener: (name, callback) => { if (name === 'focus') focusListeners.delete(callback); },
  });
  onSave = vi.fn().mockResolvedValue(undefined);
  getItemWeightLimit.mockResolvedValue({ MaxItemWeightKg: 38, HasAvailableBoxes: true });
});
afterEach(() => { if (page) act(() => page.unmount()); page = null; vi.unstubAllGlobals(); });

describe('current inventory limits while editing orders', () => {
  it('refreshes the capacity before saving and stops a stale overweight order', async () => {
    await mount();
    expect(button('Save').props.disabled).toBe(false);
    getItemWeightLimit.mockResolvedValue({ MaxItemWeightKg: 30, HasAvailableBoxes: true });
    await act(async () => { await button('Save').props.onClick(); });
    expect(text(page.root)).toContain('30 kg per-item capacity');
    expect(onSave).not.toHaveBeenCalled();
    expect(button('Save').props.disabled).toBe(true);
  });

  it('saves valid heavy items after checking current capacity', async () => {
    await mount();
    await act(async () => { await button('Save').props.onClick(); });
    expect(onSave).toHaveBeenCalledWith([ITEM]);
    expect(getItemWeightLimit).toHaveBeenCalledTimes(2);
  });

  it('revalidates existing items when returning from Box Inventory', async () => {
    await mount();
    getItemWeightLimit.mockResolvedValue({ MaxItemWeightKg: 10, HasAvailableBoxes: true });
    await act(async () => { for (const callback of [...focusListeners]) callback(); });
    expect(text(page.root)).toContain('10 kg per-item capacity');
    expect(button('Save').props.disabled).toBe(true);
  });

  it('shows a retry option and prevents saving when capacity cannot be checked', async () => {
    getItemWeightLimit.mockRejectedValueOnce(new Error('Inventory unavailable'));
    await mount();
    expect(text(page.root)).toContain('Inventory unavailable');
    expect(button('Save').props.disabled).toBe(true);
    await act(async () => { await button('Try again').props.onClick(); });
    expect(button('Save').props.disabled).toBe(false);
  });

  it('allows preparing drafts without inventory and explains optimisation needs boxes', async () => {
    getItemWeightLimit.mockResolvedValue({ MaxItemWeightKg: null, HasAvailableBoxes: false });
    await mount();
    expect(text(page.root)).toContain('No active boxes are currently available');
    expect(button('Save').props.disabled).toBe(false);
    await act(async () => { await button('Save').props.onClick(); });
    expect(onSave).toHaveBeenCalledWith([ITEM]);
  });

  it('reviews a picked JSON file once the weight check that picking started has finished', async () => {
    await mount();
    await act(async () => { button('Import JSON').props.onClick(); });

    // Closing the file picker refocuses the window, which starts a new check.
    let finish;
    getItemWeightLimit.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await act(async () => { [...focusListeners].forEach((listener) => listener()); });
    const json = JSON.stringify([{ ItemCode: 'ROD', ItemReference: 'Rod', Width: 590, Length: 80, Depth: 80, Weight: 0.9, Quantity: 6 }]);
    const input = page.root.findByProps({ type: 'file' });
    await act(async () => {
      await input.props.onChange({ target: { files: [{ name: 'items.json', text: async () => json }] } });
    });

    expect(page.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
    expect(text(page.root.findByProps({ role: 'status' }))).toContain('Checking current boxes');

    await act(async () => { finish({ MaxItemWeightKg: 38, HasAvailableBoxes: true }); });

    expect(page.root.findAllByProps({ role: 'status' })).toHaveLength(0);
    expect(text(page.root)).toContain('Review imported items');
    expect(text(page.root)).toContain('ROD');
  });

  it('waits for the first capacity check before accepting or saving items', async () => {
    let finish;
    getItemWeightLimit.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await mount();
    expect(button('Save').props.disabled).toBe(true);
    expect(button('Add item to order').props.disabled).toBe(true);
    await act(async () => { finish({ MaxItemWeightKg: 38, HasAvailableBoxes: true }); });
    expect(button('Save').props.disabled).toBe(false);
  });
});
