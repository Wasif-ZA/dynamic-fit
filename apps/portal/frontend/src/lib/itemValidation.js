// Shared validation for order items - used by manual entry and JSON import so
// both paths enforce identical rules (matches the backend `Item` model in
// backend/app/models.py).

export const MAX_ITEM_WEIGHT_KG = 32;

const REQUIRED_STRING_FIELDS = ['ItemCode', 'ItemReference'];
const REQUIRED_POSITIVE_NUMBER_FIELDS = ['Width', 'Length', 'Depth', 'Weight'];
const KNOWN_FIELDS = new Set([
  'ItemCode',
  'ItemReference',
  'Width',
  'Length',
  'Depth',
  'Weight',
  'BoxGroup',
  'Quantity',
]);

/**
 * Validate a single "raw" item (plain object, values may still be strings,
 * e.g. straight from a form or from parsed JSON). Returns an array of
 * human-readable error strings; an empty array means the item is valid.
 */
export function validateItemFields(raw, { label } = {}) {
  const errors = [];
  const prefix = label ? `${label}: ` : '';

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return [`${prefix}Item must be a JSON object.`];
  }

  const unknownFields = Object.keys(raw).filter((key) => !KNOWN_FIELDS.has(key));
  if (unknownFields.length > 0) {
    errors.push(`${prefix}Unrecognised field(s): ${unknownFields.join(', ')}.`);
  }

  // ItemCode is the client's own identifier: any non-blank text.
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = raw[field];
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${prefix}"${field}" is required and must be a non-empty string.`);
    }
  }

  for (const field of REQUIRED_POSITIVE_NUMBER_FIELDS) {
    const value = raw[field];
    const num = typeof value === 'number' ? value : Number(value);
    if (value === undefined || value === null || value === '' || Number.isNaN(num)) {
      errors.push(`${prefix}"${field}" is required and must be a number.`);
      continue;
    }
    if (num <= 0) {
      errors.push(`${prefix}"${field}" must be greater than 0.`);
      continue;
    }
    if (field === 'Weight' && num > MAX_ITEM_WEIGHT_KG) {
      errors.push(
        `${prefix}"Weight" of ${num} kg exceeds the maximum allowed item weight of ${MAX_ITEM_WEIGHT_KG} kg.`
      );
    }
  }

  if (raw.BoxGroup !== undefined && raw.BoxGroup !== null && typeof raw.BoxGroup !== 'string') {
    errors.push(`${prefix}"BoxGroup" must be a string if provided.`);
  }

  if (raw.Quantity !== undefined && raw.Quantity !== null && raw.Quantity !== '') {
    const qty = Number(raw.Quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      errors.push(`${prefix}"Quantity" must be a whole number of 1 or more if provided.`);
    }
  }

  return errors;
}

/** Check just the weight limit - used for live feedback while typing. */
export function weightExceedsLimit(weight) {
  const num = Number(weight);
  return !Number.isNaN(num) && num > MAX_ITEM_WEIGHT_KG;
}

/** Coerce a validated raw item into the normalised shape used in item state. */
export function normaliseItem(raw) {
  const item = {
    ItemCode: raw.ItemCode.trim(),
    ItemReference: raw.ItemReference.trim(),
    Width: Number(raw.Width),
    Length: Number(raw.Length),
    Depth: Number(raw.Depth),
    Weight: Number(raw.Weight),
    Quantity: raw.Quantity !== undefined && raw.Quantity !== '' ? Number(raw.Quantity) : 1,
  };
  if (typeof raw.BoxGroup === 'string' && raw.BoxGroup.trim()) {
    item.BoxGroup = raw.BoxGroup.trim();
  }
  return item;
}
export function parseItemsJson(jsonText) {
  if (!jsonText || !jsonText.trim()) {
    return { items: null, errors: ['Paste or upload some JSON first.'] };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return { items: null, errors: [`That doesn't look like valid JSON (${err.message}).`] };
  }

  let candidateItems;
  if (Array.isArray(parsed)) {
    candidateItems = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.Items)) {
    candidateItems = parsed.Items;
  } else if (parsed && typeof parsed === 'object') {
    candidateItems = [parsed];
  } else {
    return {
      items: null,
      errors: ['JSON must be an item object, an array of items, or an object with an "Items" array.'],
    };
  }

  if (candidateItems.length === 0) {
    return { items: null, errors: ['No items found in the imported JSON.'] };
  }

  const errors = [];
  candidateItems.forEach((raw, idx) => {
    const label = `Item ${idx + 1}${raw && raw.ItemCode ? ` (${raw.ItemCode})` : ''}`;
    errors.push(...validateItemFields(raw, { label }));
  });

  if (errors.length > 0) {
    return { items: null, errors };
  }

  return { items: candidateItems.map(normaliseItem), errors: [] };
}
