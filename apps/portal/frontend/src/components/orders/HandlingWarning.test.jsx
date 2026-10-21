import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HandlingWarning from './HandlingWarning.jsx';
import PackedHandlingWarnings from './PackedHandlingWarnings.jsx';
import ItemEntryForm from './ItemEntryForm.jsx';
import ItemJsonImport from './ItemJsonImport.jsx';
import ItemsTable from './ItemsTable.jsx';
import OrderHandlingBadge from './OrderHandlingBadge.jsx';

let page;
function text(node) { return node.children.map((child) => typeof child === 'string' ? child : text(child)).join(''); }
const ITEM = { ItemCode: 'TEST', ItemReference: 'Test item', Width: 100, Length: 100, Depth: 100, Weight: 20, Quantity: 1 };
afterEach(() => { if (page) act(() => page.unmount()); page = null; });

describe('informational handling warnings', () => {
  it('flags a heavy item before optimisation and explains the threshold', () => {
    act(() => { page = create(<OrderHandlingBadge items={[ITEM]} thresholdKg={20} />); });
    expect(page.root.findByProps({ 'aria-label': 'Heavy order' })).toBeDefined();
    expect(text(page.root)).toContain('Weight threshold reached.');
    expect(text(page.root)).not.toContain('kg');
    expect(page.root.findByProps({ 'aria-label': 'Why this order is heavy' })).toBeDefined();
    act(() => page.update(<OrderHandlingBadge items={[ITEM]} thresholdKg={null} />));
    expect(page.toJSON()).toBeNull();
  });

  it('does not flag an order simply because many light units add up to a heavy total', () => {
    act(() => { page = create(<OrderHandlingBadge items={[{ ...ITEM, Weight: 1, Quantity: 100 }]} thresholdKg={20} />); });
    expect(page.toJSON()).toBeNull();
  });

  it('can flag a packed box from summary-only data and clears after a lighter result', () => {
    act(() => { page = create(<OrderHandlingBadge items={[{ ...ITEM, Weight: 10, Quantity: 2 }]} summary={{ Boxes: [{ PackedWeightKg: 20.2 }] }} thresholdKg={20} />); });
    expect(text(page.root)).toContain('Weight threshold reached.');
    act(() => page.update(<OrderHandlingBadge items={[{ ...ITEM, Weight: 10, Quantity: 2 }]} solution={{ cartons: [{ contents_mass: 10000, tare_mass: 200 }] }} summary={{ Boxes: [{ PackedWeightKg: 20.2 }] }} thresholdKg={20} />));
    expect(page.toJSON()).toBeNull();
  });

  it('shows a compact amber notice and short explanation at the configured boundary', () => {
    act(() => { page = create(<HandlingWarning weightKg={20} thresholdKg={20} />); });
    expect(text(page.root)).toContain('Heavy');
    expect(text(page.root)).toContain('Weight threshold reached.');
    expect(page.root.findAllByType('span').some((node) => node.props.className?.includes('bg-amber-50'))).toBe(true);
    act(() => page.update(<HandlingWarning weightKg={19.999} thresholdKg={20} />));
    expect(page.toJSON()).toBeNull();
  });

  it('allows valid item entry even when a handling warning is present', () => {
    const onAdd = vi.fn();
    act(() => { page = create(<ItemEntryForm initialItem={ITEM} onAdd={onAdd} maxItemWeightKg={38} warningThresholdKg={20} />); });
    expect(text(page.root)).toContain('Heavy');
    expect(page.root.findByProps({ type: 'submit' }).props.disabled).toBe(false);
    act(() => page.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }));
    expect(onAdd).toHaveBeenCalledWith(ITEM);
  });

  it('warns in import review while still allowing the items to be added', () => {
    const onImport = vi.fn();
    act(() => { page = create(<ItemJsonImport onImport={onImport} maxItemWeightKg={38} warningThresholdKg={20} />); });
    act(() => page.root.findByType('textarea').props.onChange({ target: { value: JSON.stringify([ITEM]) } }));
    act(() => page.root.findAllByType('button').find((node) => text(node) === 'Review pasted JSON').props.onClick());
    expect(text(page.root)).toContain('Heavy');
    const confirm = page.root.findAllByType('button').find((node) => text(node) === 'Add 1 unit to order');
    expect(confirm.props.disabled).toBe(false);
    act(() => confirm.props.onClick());
    expect(onImport).toHaveBeenCalledWith([ITEM]);
  });

  it('checks each unit without multiplying by the order quantity', () => {
    act(() => { page = create(<ItemsTable items={[{ ...ITEM, Weight: 1, Quantity: 100 }]} warningThresholdKg={20} />); });
    expect(text(page.root)).not.toContain('Heavy');
  });

  it('uses total packed weight and also handles the summary-only result', () => {
    act(() => { page = create(<PackedHandlingWarnings solution={{ cartons: [{ carton_id: 'c1', sku: 'BOX', contents_mass: 19800, tare_mass: 200 }] }} thresholdKg={20} />); });
    expect(text(page.root)).toContain('1 heavy box');
    expect(text(page.root)).toContain('20 kg');
    expect(text(page.root)).toContain('Weight threshold reached.');
    act(() => page.update(<PackedHandlingWarnings summary={{ Boxes: [{ CartonId: 'c1', BoxType: 'BOX', PackedWeightKg: 20 }] }} thresholdKg={20} />));
    expect(text(page.root)).toContain('1 heavy box');
    act(() => page.update(<PackedHandlingWarnings summary={{ Boxes: [{ CartonId: 'c1', PackedWeightKg: 20 }] }} thresholdKg={25} />));
    expect(page.toJSON()).toBeNull();
  });

  it('limits the result overview to five warnings while retaining the full count', () => {
    act(() => { page = create(<PackedHandlingWarnings summary={{ Boxes: Array.from({ length: 8 }, (_, index) => ({ CartonId: `c${index}`, BoxType: 'BOX', PackedWeightKg: 20 })) }} thresholdKg={20} />); });
    expect(text(page.root)).toContain('8 heavy boxes');
    expect(page.root.findAllByType('li')).toHaveLength(5);
    expect(text(page.root)).toContain('3 more in Packing Details');
  });
});
