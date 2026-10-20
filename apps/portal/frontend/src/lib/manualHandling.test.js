import { describe, expect, it } from 'vitest';
import { needsHandlingWarning, packedWeightKg } from './manualHandling.js';

describe('site-configured handling warnings', () => {
  it.each([
    [19.999, 20, false], [20, 20, true], [20.001, 20, true],
    [100, null, false], [100, undefined, false], [100, 0, false],
    [100, -1, false], [NaN, 20, false], [Infinity, 20, false],
    [1, Infinity, false], [0, 20, false],
  ])('evaluates %s kg against %s kg as %s', (weight, threshold, expected) => {
    expect(needsHandlingWarning(weight, threshold)).toBe(expected);
  });

  it('includes tare weight when checking the packed box', () => {
    const carton = { contents_mass: 19800, tare_mass: 200 };
    expect(packedWeightKg(carton)).toBe(20);
    expect(needsHandlingWarning(packedWeightKg(carton), 20)).toBe(true);
    expect(needsHandlingWarning(carton.contents_mass / 1000, 20)).toBe(false);
  });

  it('treats omitted tare as zero for legacy results', () => {
    expect(packedWeightKg({ contents_mass: 1000 })).toBe(1);
  });
});
