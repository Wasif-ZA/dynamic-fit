import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InfoTooltip from './InfoTooltip.jsx';

vi.mock('react-dom', () => ({ createPortal: (children) => children }));
let page;
beforeEach(() => {
  vi.stubGlobal('document', { body: {} });
  vi.stubGlobal('window', {
    innerWidth: 800, innerHeight: 600,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  if (page) act(() => page.unmount());
  page = null;
  vi.unstubAllGlobals();
});

describe('centred Heavy explanations', () => {
  it.each([
    [300, 60, 240], // Centred above the badge using the actual bubble width.
    [750, 40, 612], // Keep the explanation inside the right edge.
    [0, 40, 8], // Keep the explanation inside the left edge.
  ])('positions a badge at %s with width %s inside the viewport', (left, width, expectedLeft) => {
    act(() => {
      page = create(<InfoTooltip label="Why heavy" description="Weight threshold reached." align="center" compact />, {
        createNodeMock: () => ({ getBoundingClientRect: () => ({ width: 180, height: 40 }) }),
      });
    });
    const target = { getBoundingClientRect: () => ({ left, width, top: 200, bottom: 220 }) };
    act(() => page.root.findByType('button').props.onMouseEnter({ currentTarget: target }));
    const tooltip = page.root.findByProps({ role: 'tooltip' });
    expect(tooltip.parent.props.style.left).toBe(expectedLeft);
    expect(tooltip.parent.props.style.top).toBe(200);
    expect(tooltip.children).toEqual(['Weight threshold reached.']);
  });
});
