import { describe, expect, it } from 'vitest';
import { orderStatusLabel, orderStatusStyle } from './orderStatus.js';

describe('order rejection status', () => {
  it.each([1, 3])('marks an optimised result with %i rejected units in red', (count) => {
    expect(orderStatusLabel('OPTIMISED', count)).toBe('Rejected');
    expect(orderStatusStyle('OPTIMISED', count)).toContain('text-red-700');
  });

  it('returns to Optimised after a result without rejects replaces a rejected result', () => {
    expect(orderStatusLabel('OPTIMISED', 2)).toBe('Rejected');
    expect(orderStatusLabel('OPTIMISED', 0)).toBe('Optimised');
    expect(orderStatusStyle('OPTIMISED', 0)).not.toContain('red');
  });

  it.each([
    ['DRAFT', 'Draft'],
    ['AWAITING_OPTIMISATION', 'Awaiting Optimisation'],
    ['FINAL', 'Finalised'],
  ])('preserves the %s lifecycle label', (status, label) => {
    expect(orderStatusLabel(status, 0)).toBe(label);
    expect(orderStatusStyle(status, 0)).not.toContain('red');
  });

  it('handles orders with no rejection count and unknown status values', () => {
    expect(orderStatusLabel('OPTIMISED')).toBe('Optimised');
    expect(orderStatusStyle('OPTIMISED')).not.toContain('red');
    expect(orderStatusLabel('UNKNOWN')).toBe('UNKNOWN');
    expect(orderStatusStyle('UNKNOWN')).toBe(orderStatusStyle('DRAFT'));
  });
});
