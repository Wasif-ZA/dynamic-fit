import { describe, expect, it } from 'vitest';
import { buildBoxGroupLookup, cartonBoxGroups, itemBoxGroups } from './boxGroups.js';

const ITEMS = [
  { ItemCode: 'ACID', ItemReference: 'Acid Bottle (boxed)', BoxGroup: 'CORROSIVE' },
  { ItemCode: 'JUG', ItemReference: 'Bleach Jug', BoxGroup: 'CORROSIVE' },
  { ItemCode: 'TIN', ItemReference: 'Canned Food Tin', BoxGroup: 'FOOD' },
  { ItemCode: 'BRICK', ItemReference: 'Engineering Brick' },
  { ItemCode: 'SHOT', ItemReference: 'Lead Shot Bag', BoxGroup: '  ' },
];

const carton = (...refs) => ({
  placements: refs.map(([item_ref, label]) => ({ item_ref, label })),
});

describe('cartonBoxGroups', () => {
  const lookup = buildBoxGroupLookup(ITEMS);

  it('returns the group of the items in the box once', () => {
    expect(cartonBoxGroups(lookup, carton(
      ['ACID', 'Acid Bottle (boxed)'],
      ['JUG', 'Bleach Jug'],
      ['BRICK', 'Engineering Brick'],
    ))).toEqual(['CORROSIVE']);
  });

  it('returns no groups when no packed item has one', () => {
    expect(cartonBoxGroups(lookup, carton(
      ['BRICK', 'Engineering Brick'],
      ['SHOT', 'Lead Shot Bag'],
    ))).toEqual([]);
  });

  it('matches on item code and reference, so repeated codes stay separate', () => {
    const repeated = buildBoxGroupLookup([
      { ItemCode: 'X', ItemReference: 'Food pack', BoxGroup: 'FOOD' },
      { ItemCode: 'X', ItemReference: 'Loose part' },
    ]);

    expect(cartonBoxGroups(repeated, carton(['X', 'Loose part']))).toEqual([]);
    expect(cartonBoxGroups(repeated, carton(['X', 'Food pack']))).toEqual(['FOOD']);
  });

  it('ignores items that are not in the order', () => {
    expect(cartonBoxGroups(lookup, carton(['GONE', 'Removed']))).toEqual([]);
  });
});

describe('itemBoxGroups', () => {
  const lookup = buildBoxGroupLookup(ITEMS);

  it('returns the group for a grouped item', () => {
    expect(itemBoxGroups(lookup, 'ACID', 'Acid Bottle (boxed)')).toEqual(['CORROSIVE']);
    expect(itemBoxGroups(lookup, 'TIN', 'Canned Food Tin')).toEqual(['FOOD']);
  });

  it('returns nothing for ungrouped, blank or unknown items', () => {
    expect(itemBoxGroups(lookup, 'BRICK', 'Engineering Brick')).toEqual([]);
    expect(itemBoxGroups(lookup, 'SHOT', 'Lead Shot Bag')).toEqual([]);
    expect(itemBoxGroups(lookup, 'GONE', 'Removed')).toEqual([]);
  });
});
