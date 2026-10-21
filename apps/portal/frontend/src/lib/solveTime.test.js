import { describe, expect, it } from 'vitest';
import { formatSolveTime } from './solveTime.js';

describe('formatSolveTime', () => {
  it.each([
    [0, '<1 ms'],
    [0.9, '<1 ms'],
    [1, '1 ms'],
    [42, '42 ms'],
    [999, '999 ms'],
    [999.9, '1 s'],
    [1000, '1 s'],
    [1234, '1.23 s'],
    [59994, '59.99 s'],
    [59999, '1 min 0 s'],
    [60000, '1 min 0 s'],
    [125000, '2 min 5 s'],
    [3599999, '1 h 0 min 0 s'],
    [3661000, '1 h 1 min 1 s'],
  ])('formats %s milliseconds as %s', (milliseconds, expected) => {
    expect(formatSolveTime(milliseconds)).toBe(expected);
  });

  it.each([undefined, null, -1, NaN, Infinity, -Infinity, '1000'])('handles unavailable or invalid timing %s', (value) => {
    expect(formatSolveTime(value)).toBe('Unavailable');
  });
});
