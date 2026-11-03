import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ItemEntryForm from './ItemEntryForm.jsx';
import ItemJsonImport from './ItemJsonImport.jsx';

const ITEM = {
  ItemCode: 'TEST', ItemReference: 'Character limit test',
  Width: 100, Length: 100, Depth: 100, Weight: 1, Quantity: 1,
};
const FIELDS = [
  ['ItemCode', 32, 'ITM-001'],
  ['ItemReference', 100, 'Widget C'],
];
let page;

function text(node) {
  return node.children.map((child) => typeof child === 'string' ? child : text(child)).join('');
}

afterEach(() => {
  if (page) act(() => page.unmount());
  page = null;
});

describe('item character limits in entry and editing', () => {
  it.each(FIELDS)('shows a clear %s error, prevents saving, and accepts a corrected value', (field, limit, placeholder) => {
    const onAdd = vi.fn();
    act(() => { page = create(<ItemEntryForm initialItem={ITEM} onAdd={onAdd} />); });
    const input = () => page.root.findByProps({ placeholder });
    act(() => { input().props.onChange({ target: { type: 'text', value: 'A'.repeat(limit + 1) } }); });

    expect(input().props.value).toBe('A'.repeat(limit + 1));
    expect(input().props['aria-invalid']).toBe(true);
    expect(text(page.root)).toContain(`"${field}" must be ${limit} characters or fewer.`);
    expect(page.root.findByProps({ type: 'submit' }).props.disabled).toBe(true);
    act(() => { page.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }); });
    expect(onAdd).not.toHaveBeenCalled();

    act(() => { input().props.onChange({ target: { type: 'text', value: '😀'.repeat(limit) } }); });
    expect(input().props['aria-invalid']).toBe(false);
    expect(page.root.findByProps({ type: 'submit' }).props.disabled).toBe(false);
    act(() => { page.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }); });
    expect(onAdd).toHaveBeenCalledWith({ ...ITEM, [field]: '😀'.repeat(limit) });
  });

  it.each(FIELDS)('shows overlong existing %s values for correction without truncation', (field, limit, placeholder) => {
    act(() => {
      page = create(<ItemEntryForm initialItem={{ ...ITEM, [field]: 'A'.repeat(limit + 1) }} onAdd={vi.fn()} />);
    });

    expect(page.root.findByProps({ placeholder }).props.value).toBe('A'.repeat(limit + 1));
    expect(text(page.root)).toContain(`"${field}" must be ${limit} characters or fewer.`);
    expect(page.root.findByProps({ type: 'submit' }).props.disabled).toBe(true);
  });
});

describe('item import character limits', () => {
  it.each(['paste', 'upload'])('rejects overlong item fields before review via %s', async (method) => {
    const onImport = vi.fn();
    act(() => { page = create(<ItemJsonImport onImport={onImport} />); });
    const json = JSON.stringify([ITEM, { ...ITEM, ItemCode: 'A'.repeat(33), ItemReference: 'B'.repeat(101) }]);
    if (method === 'paste') {
      act(() => { page.root.findByType('textarea').props.onChange({ target: { value: json } }); });
      act(() => { page.root.findAllByType('button').find((button) => text(button) === 'Review pasted JSON').props.onClick(); });
    } else {
      await act(async () => {
        await page.root.findByProps({ type: 'file' }).props.onChange({
          target: { files: [{ name: 'items.json', text: async () => json }] },
        });
      });
    }

    expect(text(page.root)).toContain('"ItemCode" must be 32 characters or fewer.');
    expect(text(page.root)).toContain('"ItemReference" must be 100 characters or fewer.');
    expect(text(page.root)).toContain('Item 2');
    expect(page.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
    expect(onImport).not.toHaveBeenCalled();
  });
});

describe('dynamic weight capacity in forms and imports', () => {
  it('accepts a heavier item and reacts when the current capacity changes', () => {
    const onAdd = vi.fn();
    act(() => { page = create(<ItemEntryForm initialItem={{ ...ITEM, Weight: 35 }} onAdd={onAdd} maxItemWeightKg={38} />); });
    const weightInput = () => page.root.findAllByType('input').find((node) => node.props.step === '0.001');
    expect(weightInput().props.max).toBe(38);
    expect(weightInput().props['aria-invalid']).toBe(false);
    act(() => { page.update(<ItemEntryForm initialItem={ITEM} onAdd={onAdd} maxItemWeightKg={30} />); });
    expect(weightInput().props.max).toBe(30);
    expect(weightInput().props['aria-invalid']).toBe(true);
    expect(text(page.root)).toContain('30 kg per-item capacity');
    expect(page.root.findByProps({ type: 'submit' }).props.disabled).toBe(true);
    act(() => { weightInput().props.onChange({ target: { type: 'number', value: '30' } }); });
    act(() => { page.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }); });
    expect(onAdd).toHaveBeenCalledWith({ ...ITEM, Weight: 30 });
  });

  it('does not impose a max attribute when weight is unlimited', () => {
    act(() => { page = create(<ItemEntryForm initialItem={{ ...ITEM, Weight: 80 }} onAdd={vi.fn()} />); });
    const input = page.root.findAllByType('input').find((node) => node.props.step === '0.001');
    expect(input.props.max).toBeUndefined();
    expect(input.props['aria-invalid']).toBe(false);
  });

  it.each(['paste', 'upload'])('checks the same current capacity when importing by %s', async (method) => {
    act(() => { page = create(<ItemJsonImport onImport={vi.fn()} maxItemWeightKg={38} />); });
    const json = JSON.stringify([{ ...ITEM, Weight: 39 }]);
    if (method === 'paste') {
      act(() => { page.root.findByType('textarea').props.onChange({ target: { value: json } }); });
      act(() => { page.root.findAllByType('button').find((node) => text(node) === 'Review pasted JSON').props.onClick(); });
    } else {
      await act(async () => {
        await page.root.findByProps({ type: 'file' }).props.onChange({ target: { files: [{ name: 'heavy.json', text: async () => json }] } });
      });
    }
    expect(text(page.root)).toContain('38 kg per-item capacity');
    expect(page.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
  });

  it('revalidates an open import review when inventory capacity drops', () => {
    const onImport = vi.fn();
    act(() => { page = create(<ItemJsonImport onImport={onImport} maxItemWeightKg={38} />); });
    act(() => { page.root.findByType('textarea').props.onChange({ target: { value: JSON.stringify([{ ...ITEM, Weight: 35 }]) } }); });
    act(() => { page.root.findAllByType('button').find((node) => text(node) === 'Review pasted JSON').props.onClick(); });
    expect(page.root.findAllByProps({ role: 'dialog' })).toHaveLength(1);
    act(() => { page.update(<ItemJsonImport onImport={onImport} maxItemWeightKg={30} />); });
    expect(text(page.root)).toContain('30 kg per-item capacity');
    const confirm = page.root.findAllByType('button').find((node) => text(node) === 'Add 1 unit to order');
    expect(confirm.props.disabled).toBe(true);
    act(() => confirm.props.onClick());
    expect(onImport).not.toHaveBeenCalled();
  });
});

describe('item positive value validation', () => {
  it.each(['Width', 'Length', 'Depth', 'Weight'])(
    'rejects zero %s and prevents adding the item',
    (field) => {
      const onAdd = vi.fn();

      act(() => {
        page = create(
          <ItemEntryForm
            initialItem={{ ...ITEM, [field]: 0 }}
            onAdd={onAdd}
          />
        );
      });

      act(() => {
        page.root.findByType('form').props.onSubmit({
          preventDefault: vi.fn(),
        });
      });

      expect(onAdd).not.toHaveBeenCalled();
      expect(text(page.root)).toContain(
        `"${field}" must be greater than 0.`
      );
    }
  );
});

