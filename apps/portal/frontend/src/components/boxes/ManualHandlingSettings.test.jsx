import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '../../context/AppContext.jsx';
import ManualHandlingSettings from './ManualHandlingSettings.jsx';

vi.mock('../../context/AppContext.jsx', () => ({ useApp: vi.fn() }));
let page;
let context;
function text(node) { return node.children.map((child) => typeof child === 'string' ? child : text(child)).join(''); }
const button = (label) => page.root.findAllByType('button').find((node) => text(node) === label);
function mount() { act(() => { page = create(<ManualHandlingSettings />); }); }

beforeEach(() => {
  vi.resetAllMocks();
  context = {
    identity: { role: 'SUPERVISOR' }, handlingSettings: { WarningThresholdKg: null },
    handlingSettingsError: null, loadingHandlingSettings: false,
    refreshHandlingSettings: vi.fn(), saveHandlingSettings: vi.fn().mockResolvedValue({ WarningThresholdKg: 20 }),
  };
  useApp.mockImplementation(() => context);
});
afterEach(() => { if (page) act(() => page.unmount()); page = null; });

describe('handling configuration permissions', () => {
  it.each(['SUPERVISOR', 'ADMINISTRATOR'])('lets %s set the warning threshold', async (role) => {
    context.identity.role = role;
    mount();
    expect(page.root.findByType('input').props.value).toBe('');
    expect(button('Save').props.disabled).toBe(true);
    act(() => page.root.findByType('input').props.onChange({ target: { value: '20' } }));
    await act(async () => { await page.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }); });
    expect(context.saveHandlingSettings).toHaveBeenCalledWith(20);
    expect(text(page.root)).toContain('Warnings will appear at or above 20 kg');
  });

  it('shows a User the setting without editing controls', () => {
    context.identity.role = 'USER';
    context.handlingSettings.WarningThresholdKg = 20;
    mount();
    expect(text(page.root)).toContain('20 kg and above');
    expect(text(page.root)).toContain('view-only access');
    expect(page.root.findAllByType('input')).toHaveLength(0);
    expect(button('Turn off')).toBeUndefined();
    expect(button('Save')).toBeUndefined();
  });

  it.each(['0', '-1', 'invalid', ''])('does not save an invalid warning value %j', async (value) => {
    mount();
    act(() => page.root.findByType('input').props.onChange({ target: { value } }));
    expect(button('Save').props.disabled).toBe(true);
    await act(async () => { await page.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }); });
    expect(context.saveHandlingSettings).not.toHaveBeenCalled();
  });

  it.each(['SUPERVISOR', 'ADMINISTRATOR'])('lets %s turn a configured warning off', async (role) => {
    context.identity.role = role;
    context.handlingSettings.WarningThresholdKg = 20;
    mount();
    await act(async () => { await button('Turn off').props.onClick(); });
    expect(context.saveHandlingSettings).toHaveBeenCalledWith(null);
  });

  it('keeps a failed save visible and prevents duplicate submissions', async () => {
    let rejectSave;
    context.saveHandlingSettings.mockReturnValue(new Promise((resolve, reject) => { rejectSave = reject; }));
    mount();
    act(() => page.root.findByType('input').props.onChange({ target: { value: '20' } }));
    let pending;
    act(() => {
      const submit = page.root.findByType('form').props.onSubmit;
      pending = submit({ preventDefault: vi.fn() });
      submit({ preventDefault: vi.fn() });
    });
    expect(context.saveHandlingSettings).toHaveBeenCalledTimes(1);
    await act(async () => { rejectSave(new Error('Could not save')); await pending; });
    expect(page.root.findByProps({ role: 'alert' }).children).toEqual(['Could not save']);
    expect(page.root.findByType('input').props.value).toBe('20');
  });
});
