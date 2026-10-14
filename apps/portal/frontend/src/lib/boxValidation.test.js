import { describe, expect, it } from 'vitest';
import {
  QUANTITY_OPERATIONS,
  applyQuantityChange,
  calculateResultingQuantity,
  createImportRecords,
  formatMaximumBoxes,
  normaliseBox,
  normaliseMaximumBoxes,
  parseBoxesJson,
  validateImportResults,
} from './boxValidation.js';

const FILE_BOX = {
  Reference: 'SML',
  Width: 150,
  Length: 150,
  Depth: 150,
  MaxWeight: 8.5,
  BoxWeight: 0.5,
  Active: true,
  MaximumBoxes: 20,
};

const without = (box, key) => Object.fromEntries(
  Object.entries(box).filter(([name]) => name !== key)
);

function parseOne(fileBox) {
  const parsed = parseBoxesJson(JSON.stringify([fileBox]));
  expect(parsed.errors).toEqual([]);
  return parsed.boxes[0];
}

function review(fileBox, inventory, changes) {
  const [record] = createImportRecords([parseOne(fileBox)], inventory);
  return changes ? applyQuantityChange(record, changes) : record;
}

describe('parsing boxes.json', () => {
  it('treats omitted and null MaximumBoxes as no limit', () => {
    expect(parseOne(without(FILE_BOX, 'MaximumBoxes')).MaximumBoxes).toBeNull();
    expect(parseOne({ ...FILE_BOX, MaximumBoxes: null }).MaximumBoxes).toBeNull();
  });

  it('keeps explicit quantities, including 0', () => {
    expect(parseOne({ ...FILE_BOX, MaximumBoxes: 0 }).MaximumBoxes).toBe(0);
    expect(parseOne({ ...FILE_BOX, MaximumBoxes: 7 }).MaximumBoxes).toBe(7);
  });

  it('defaults a missing Active to true and keeps explicit values', () => {
    expect(parseOne(without(FILE_BOX, 'Active')).Active).toBe(true);
    expect(parseOne({ ...FILE_BOX, Active: true }).Active).toBe(true);
    expect(parseOne({ ...FILE_BOX, Active: false }).Active).toBe(false);
  });

  it('rejects a non-boolean Active, a negative quantity and a Stock field', () => {
    const parsed = parseBoxesJson(JSON.stringify([
      { ...FILE_BOX, Reference: 'A', Active: 'yes' },
      { ...FILE_BOX, Reference: 'B', MaximumBoxes: -1 },
      { ...FILE_BOX, Reference: 'C', Stock: 5 },
    ]));

    expect(parsed.errors).toEqual([
      'Box 1 (A): "Active" must be true or false when supplied.',
      'Box 2 (B): "MaximumBoxes" must be a whole number of 0 or more when supplied.',
      'Box 3 (C): unrecognised field(s): Stock.',
    ]);
  });
});

describe('first import into an empty inventory', () => {
  it('imports client boxes without MaximumBoxes as no limit, asking for nothing', () => {
    const records = createImportRecords(
      parseBoxesJson(JSON.stringify([
        without({ ...FILE_BOX, Reference: 'Cube' }, 'MaximumBoxes'),
        without({ ...FILE_BOX, Reference: 'Tube' }, 'MaximumBoxes'),
      ])).boxes,
      []
    );

    expect(records.every((record) => !record.needsOperation)).toBe(true);
    expect(validateImportResults(records, [])).toEqual([]);
    expect(records.map((record) => normaliseBox(record.result).MaximumBoxes)).toEqual([null, null]);
  });

  it('imports explicit quantities as given', () => {
    const records = createImportRecords(
      parseBoxesJson(JSON.stringify([
        { ...FILE_BOX, Reference: 'Standard Carton', MaximumBoxes: 2 },
        { ...FILE_BOX, Reference: 'None Left', MaximumBoxes: 0 },
      ])).boxes,
      []
    );

    expect(validateImportResults(records, [])).toEqual([]);
    expect(records.map((record) => normaliseBox(record.result).MaximumBoxes)).toEqual([2, 0]);
  });
});

describe('importing an existing box', () => {
  const current = { ...FILE_BOX, MaximumBoxes: 10 };

  it('requires Add or Replace when both have a quantity', () => {
    const untouched = review(FILE_BOX, [current]);

    expect(untouched.needsOperation).toBe(true);
    expect(validateImportResults([untouched], [current])).toEqual([
      'SML: choose Replace existing quantity or Add to existing quantity.',
    ]);
  });

  it('Add adds the imported quantity', () => {
    const record = review(FILE_BOX, [current], { quantityOperation: QUANTITY_OPERATIONS.ADD });

    expect(validateImportResults([record], [current])).toEqual([]);
    expect(normaliseBox(record.result).MaximumBoxes).toBe(30);
  });

  it('Replace uses the imported quantity, including 0', () => {
    const replaced = review(FILE_BOX, [current], { quantityOperation: QUANTITY_OPERATIONS.REPLACE });
    const zeroed = review({ ...FILE_BOX, MaximumBoxes: 0 }, [current], {
      quantityOperation: QUANTITY_OPERATIONS.REPLACE,
    });

    expect(normaliseBox(replaced.result).MaximumBoxes).toBe(20);
    expect(normaliseBox(zeroed.result).MaximumBoxes).toBe(0);
  });

  it.each([
    ['omitted', without(FILE_BOX, 'MaximumBoxes')],
    ['null', { ...FILE_BOX, MaximumBoxes: null }],
  ])('a file with MaximumBoxes %s sets no limit without asking', (_label, fileBox) => {
    const record = review(fileBox, [current]);

    expect(record.needsOperation).toBe(false);
    expect(validateImportResults([record], [current])).toEqual([]);
    expect(normaliseBox(record.result).MaximumBoxes).toBeNull();
  });

  it('an unlimited box takes the file quantity without asking', () => {
    const unlimited = { ...FILE_BOX, MaximumBoxes: null };
    const record = review(FILE_BOX, [unlimited]);

    expect(record.needsOperation).toBe(false);
    expect(validateImportResults([record], [unlimited])).toEqual([]);
    expect(normaliseBox(record.result).MaximumBoxes).toBe(20);
  });

  it('validates an edited imported quantity', () => {
    const record = review(FILE_BOX, [current], {
      importedQuantity: '-1',
      quantityOperation: QUANTITY_OPERATIONS.ADD,
    });

    expect(validateImportResults([record], [current])).toEqual([
      'SML: imported quantity must be a whole number of 0 or more.',
    ]);
  });

  it('a quantity typed into the result keeps 0, and a cleared input means no limit', () => {
    const record = review(without(FILE_BOX, 'MaximumBoxes'), [current]);

    expect(normaliseBox({ ...record.result, MaximumBoxes: '0' }).MaximumBoxes).toBe(0);
    expect(normaliseBox({ ...record.result, MaximumBoxes: '' }).MaximumBoxes).toBeNull();
  });
});

describe('helpers', () => {
  it('calculates resulting quantity only for valid input', () => {
    expect(calculateResultingQuantity(10, '20', QUANTITY_OPERATIONS.ADD)).toBe(30);
    expect(calculateResultingQuantity(10, '20', QUANTITY_OPERATIONS.REPLACE)).toBe(20);
    expect(calculateResultingQuantity(10, '', QUANTITY_OPERATIONS.ADD)).toBe('');
    expect(calculateResultingQuantity(10, '2.5', QUANTITY_OPERATIONS.ADD)).toBe('');
    expect(calculateResultingQuantity(10, '20', null)).toBe('');
  });

  it('normalises MaximumBoxes: blank means no limit, 0 stays 0', () => {
    expect(normaliseMaximumBoxes(undefined)).toBeNull();
    expect(normaliseMaximumBoxes(null)).toBeNull();
    expect(normaliseMaximumBoxes('')).toBeNull();
    expect(normaliseMaximumBoxes(0)).toBe(0);
    expect(normaliseMaximumBoxes('0')).toBe(0);
    expect(normaliseMaximumBoxes('4')).toBe(4);
  });

  it('displays 0 as a quantity and null as No limit', () => {
    expect(formatMaximumBoxes(0)).toBe(0);
    expect(formatMaximumBoxes(5)).toBe(5);
    expect(formatMaximumBoxes(null)).toBe('No limit');
    expect(formatMaximumBoxes('')).toBe('No limit');
  });
});
