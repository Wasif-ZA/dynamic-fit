import React from 'react';
import { createPortal } from 'react-dom';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TooltipButton from './TooltipButton.jsx';

vi.mock('react-dom', () => ({ createPortal: vi.fn((children) => children) }));

const DESCRIPTION = 'Pause this order and save your progress.';
const target = { getBoundingClientRect: () => ({ left: 320, top: 200, bottom: 240 }) };
const tooltipTarget = { nodeType: 1 };
let page;
let listeners;
let onClick;

const button = () => page.root.findAllByType('button').find((node) => !node.props['aria-label']);
const infoButton = () => page.root.findByProps({ 'aria-label': 'About Hold' });
const tooltips = () => page.root.findAllByProps({ role: 'tooltip' });

beforeEach(() => {
  vi.clearAllMocks();
  listeners = {};
  vi.stubGlobal('window', {
    innerWidth: 400,
    addEventListener: vi.fn((name, handler) => { listeners[name] = handler; }),
    removeEventListener: vi.fn((name) => { delete listeners[name]; }),
  });
  vi.stubGlobal('document', { body: {} });
  onClick = vi.fn();
  act(() => {
    page = create(<TooltipButton description={DESCRIPTION} onClick={onClick}>Hold</TooltipButton>, {
      createNodeMock: () => ({
        contains: (node) => {
          if (node && !node.nodeType) throw new TypeError('Expected a DOM node');
          return node === tooltipTarget;
        },
      }),
    });
  });
});

afterEach(() => {
  act(() => page.unmount());
  vi.unstubAllGlobals();
});

describe('action button descriptions', () => {
  it('keeps the accessible description separate from the short button label', () => {
    expect(button().children).toEqual(['Hold']);
    const description = page.root.findByProps({ id: button().props['aria-describedby'] });
    expect(description.children).toEqual([DESCRIPTION]);
    expect(tooltips()).toHaveLength(0);
    expect(button().props.onMouseEnter).toBeUndefined();
    expect(button().props.onFocus).toBeUndefined();
  });

  it('shows the description on hover outside the table and inside the viewport', () => {
    act(() => infoButton().props.onMouseEnter({ currentTarget: target }));
    expect(createPortal).toHaveBeenLastCalledWith(expect.anything(), document.body);
    expect(tooltips()[0].children).toEqual([DESCRIPTION]);
    expect(tooltips()[0].props.id).toBe(button().props['aria-describedby']);
    expect(tooltips()[0].parent.props.style.left).toBe(136);
    act(() => infoButton().props.onMouseLeave({ relatedTarget: null }));
    expect(tooltips()).toHaveLength(0);
  });

  it('shows the description on keyboard focus and allows Escape to dismiss it', () => {
    act(() => infoButton().props.onFocus({ currentTarget: target }));
    act(() => infoButton().props.onMouseLeave({ relatedTarget: null }));
    expect(tooltips()).toHaveLength(1);
    act(() => listeners.keydown({ key: 'Escape' }));
    expect(tooltips()).toHaveLength(0);
    act(() => infoButton().props.onBlur());
  });

  it('keeps the description open while the pointer moves onto it', () => {
    act(() => infoButton().props.onMouseEnter({ currentTarget: target }));
    act(() => infoButton().props.onMouseLeave({ relatedTarget: tooltipTarget }));
    expect(tooltips()).toHaveLength(1);
    act(() => tooltips()[0].parent.props.onMouseLeave());
    expect(tooltips()).toHaveLength(0);
  });

  it('dismisses safely when the pointer leaves the browser window', () => {
    act(() => infoButton().props.onMouseEnter({ currentTarget: target }));
    act(() => infoButton().props.onMouseLeave({ relatedTarget: window }));
    expect(tooltips()).toHaveLength(0);
  });

  it('hides the description on blur and places it below buttons near the top', () => {
    act(() => infoButton().props.onFocus({ currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 10, bottom: 50 }) } }));
    expect(tooltips()[0].parent.props.style).toMatchObject({ left: 8, top: 50 });
    act(() => infoButton().props.onBlur());
    expect(tooltips()).toHaveLength(0);
  });

  it.each(['scroll', 'resize'])('dismisses on %s so the description cannot drift away from its button', (event) => {
    act(() => infoButton().props.onMouseEnter({ currentTarget: target }));
    act(() => listeners[event]());
    expect(tooltips()).toHaveLength(0);
  });

  it('dismisses on click and performs the existing action once', () => {
    act(() => infoButton().props.onFocus({ currentTarget: target }));
    act(() => button().props.onClick());
    expect(tooltips()).toHaveLength(0);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('opens the explanation by tapping the info icon without performing the action', () => {
    const stopPropagation = vi.fn();
    act(() => infoButton().props.onClick({ currentTarget: target, stopPropagation }));
    expect(tooltips()).toHaveLength(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps clicks inside the tooltip from opening its containing order row', () => {
    const stopPropagation = vi.fn();
    act(() => infoButton().props.onMouseEnter({ currentTarget: target }));
    act(() => tooltips()[0].parent.props.onClick({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
