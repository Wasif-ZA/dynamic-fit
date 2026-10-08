// Box Inventory validation and import reconciliation.
//
// MaximumBoxes is the quantity of a box type available to use. It is optional:
// missing, null or a blank input means no quantity limit, and an explicit 0
// means none are available. Finalising an order subtracts from a set quantity.

const KNOWN_BOX_FIELDS = new Set([
  'Reference',
  'Width',
  'Length',
  'Depth',
  'MaxWeight',
  'BoxWeight',
  'Active',
  'MaximumBoxes',
]);

const POSITIVE_FIELDS = ['Width', 'Length', 'Depth'];
const OPTIONAL_POSITIVE_FIELDS = ['MaxWeight', 'BoxWeight'];

export const QUANTITY_OPERATIONS = Object.freeze({ ADD: 'ADD', REPLACE: 'REPLACE' });

const isBlank = (value) => value === undefined || value === null || value === '';

function isWholeNumber(value) {
  const number = Number(value);
  return !isBlank(value) && Number.isInteger(number) && number >= 0;
}

export function validateBoxFields(raw, { label = 'Box' } = {}) {
  const errors = [];
  const prefix = `${label}: `;

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return [`${prefix}record must be a JSON object.`];
  }

  const unknownFields = Object.keys(raw).filter((key) => !KNOWN_BOX_FIELDS.has(key));
  if (unknownFields.length > 0) {
    errors.push(`${prefix}unrecognised field(s): ${unknownFields.join(', ')}.`);
  }

  if (typeof raw.Reference !== 'string' || !raw.Reference.trim()) {
    errors.push(`${prefix}"Reference" is required and must be a non-empty string.`);
  }

  for (const field of POSITIVE_FIELDS) {
    const value = raw[field];
    const number = Number(value);
    if (isBlank(value) || !Number.isFinite(number)) {
      errors.push(`${prefix}"${field}" is required and must be a number.`);
    } else if (number <= 0) {
      errors.push(`${prefix}"${field}" must be greater than 0.`);
    }
  }

  for (const field of OPTIONAL_POSITIVE_FIELDS) {
    const value = raw[field];
    if (isBlank(value)) continue;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      errors.push(`${prefix}"${field}" must be greater than 0 when supplied.`);
    }
  }

  if (!isBlank(raw.MaximumBoxes) && !isWholeNumber(raw.MaximumBoxes)) {
    errors.push(`${prefix}"MaximumBoxes" must be a whole number of 0 or more when supplied.`);
  }

  if (raw.Active !== undefined && typeof raw.Active !== 'boolean') {
    errors.push(`${prefix}"Active" must be true or false when supplied.`);
  }

  return errors;
}

/** Missing, null or blank means no quantity limit. An explicit 0 stays 0. */
export function normaliseMaximumBoxes(value) {
  return isBlank(value) ? null : Number(value);
}

export function formatMaximumBoxes(value) {
  const maximum = normaliseMaximumBoxes(value);
  return maximum === null ? 'No limit' : maximum;
}

export function normaliseBox(raw) {
  const optionalNumber = (value) => (isBlank(value) ? null : Number(value));

  return {
    Reference: String(raw.Reference).trim(),
    Width: Number(raw.Width),
    Length: Number(raw.Length),
    Depth: Number(raw.Depth),
    MaxWeight: optionalNumber(raw.MaxWeight),
    BoxWeight: optionalNumber(raw.BoxWeight),
    Active: raw.Active === undefined ? true : raw.Active,
    MaximumBoxes: normaliseMaximumBoxes(raw.MaximumBoxes),
  };
}

export function parseBoxesJson(jsonText) {
  if (!jsonText || !jsonText.trim()) {
    return { boxes: null, errors: ['Paste or upload some box JSON first.'] };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      boxes: null,
      errors: [`That doesn't look like valid JSON (${error.message}).`],
    };
  }

  const candidateBoxes = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray(parsed.Boxes)
      ? parsed.Boxes
      : null;

  if (!candidateBoxes) {
    return {
      boxes: null,
      errors: ['JSON must be an array of box records or an object with a "Boxes" array.'],
    };
  }
  if (candidateBoxes.length === 0) {
    return { boxes: null, errors: ['No box records found in the imported JSON.'] };
  }

  const errors = candidateBoxes.flatMap((box, index) =>
    validateBoxFields(box, {
      label: `Box ${index + 1}${box?.Reference ? ` (${box.Reference})` : ''}`,
    })
  );
  if (errors.length > 0) return { boxes: null, errors };

  const boxes = candidateBoxes.map(normaliseBox);
  const references = boxes.map((box) => box.Reference);
  const duplicates = [...new Set(references.filter(
    (reference, index) => references.indexOf(reference) !== index
  ))];
  if (duplicates.length > 0) {
    return {
      boxes: null,
      errors: [`Duplicate box Reference values in import: ${duplicates.join(', ')}.`],
    };
  }

  return { boxes, errors: [] };
}

export function calculateResultingQuantity(currentQuantity, importedQuantity, operation) {
  if (!isWholeNumber(importedQuantity) || !operation) return '';
  const imported = Number(importedQuantity);
  return operation === QUANTITY_OPERATIONS.ADD
    ? Number(currentQuantity) + imported
    : imported;
}

/**
 * Build review records. Box settings come from the file. Add or Replace is only
 * needed when both the file and the existing box have a quantity; otherwise the
 * file's value (a number, or no limit when omitted) is used as-is.
 */
export function createImportRecords(importedBoxes, inventory) {
  const currentByReference = new Map(inventory.map((box) => [box.Reference, box]));
  return importedBoxes.map((imported, index) => {
    const current = currentByReference.get(imported.Reference) ?? null;
    const needsOperation = current !== null
      && current.MaximumBoxes != null
      && imported.MaximumBoxes != null;
    return {
      id: `${imported.Reference}-${index}`,
      classification: current ? 'EXISTING' : 'NEW',
      current,
      imported,
      needsOperation,
      importedQuantity: needsOperation ? imported.MaximumBoxes : '',
      quantityOperation: null,
      result: {
        ...imported,
        MaximumBoxes: needsOperation ? '' : imported.MaximumBoxes,
      },
    };
  });
}

export function applyQuantityChange(record, changes) {
  const importedQuantity = Object.hasOwn(changes, 'importedQuantity')
    ? changes.importedQuantity
    : record.importedQuantity;
  const quantityOperation = Object.hasOwn(changes, 'quantityOperation')
    ? changes.quantityOperation
    : record.quantityOperation;
  return {
    ...record,
    importedQuantity,
    quantityOperation,
    result: {
      ...record.result,
      MaximumBoxes: calculateResultingQuantity(
        record.current.MaximumBoxes,
        importedQuantity,
        quantityOperation
      ),
    },
  };
}

export function validateImportResults(records, inventory) {
  if (records.length === 0) return ['Keep at least one box record before confirming.'];

  const errors = records.flatMap((record, index) => {
    const label = `Result ${index + 1}`;
    if (!record.needsOperation) return validateBoxFields(record.result, { label });

    const name = String(record.result.Reference ?? '').trim() || label;
    const recordErrors = validateBoxFields({ ...record.result, MaximumBoxes: null }, { label });
    if (!isWholeNumber(record.importedQuantity)) {
      recordErrors.push(`${name}: imported quantity must be a whole number of 0 or more.`);
    }
    if (!record.quantityOperation) {
      recordErrors.push(
        `${name}: choose Replace existing quantity or Add to existing quantity.`
      );
    }
    return recordErrors;
  });
  const references = records.map((record) => String(record.result.Reference ?? '').trim());
  const duplicates = [...new Set(references.filter(
    (reference, index) => reference && references.indexOf(reference) !== index
  ))];
  if (duplicates.length > 0) {
    errors.push(`Result Reference values must be unique: ${duplicates.join(', ')}.`);
  }

  const existingReferences = new Set(inventory.map((box) => box.Reference));
  for (const record of records) {
    const resultReference = String(record.result.Reference ?? '').trim();
    if (record.classification === 'NEW' && existingReferences.has(resultReference)) {
      errors.push(
        `${resultReference} already exists. Remove it and import it as an existing record.`
      );
    }
  }

  return errors;
}
