import React, { useRef, useState } from 'react';
import Button from '../common/Button.jsx';
import { parseItemsJson } from '../../lib/itemValidation.js';
import ImportedItemsReviewModal from './ImportedItemsReviewModal.jsx';

const PLACEHOLDER = `[
  {
    "ItemCode": "ITM-004",
    "ItemReference": "Widget C",
    "Width": 200,
    "Length": 300,
    "Depth": 150,
    "Weight": 4.5,
    "Quantity": 2,
    "BoxGroup": "GROUP-A"
  }
]`;

export default function ItemJsonImport({ onImport }) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState([]);
  const [success, setSuccess] = useState('');
  const [fileName, setFileName] = useState('');
  const [previewItems, setPreviewItems] = useState(null);
  const fileInputRef = useRef(null);

  const runImport = (jsonText) => {
    setSuccess('');
    const { items, errors: parseErrors } = parseItemsJson(jsonText);
    if (parseErrors.length > 0) {
      setErrors(parseErrors);
      return;
    }
    setErrors([]);
    setPreviewItems(items);
  };

  const handlePasteImport = () => {
    runImport(text);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSuccess('');

    if (!file.name.toLowerCase().endsWith('.json')) {
      setErrors([`"${file.name}" is not a .json file.`]);
      return;
    }

    try {
      const contents = await file.text();
      runImport(contents);
    } catch (err) {
      setErrors([`Could not read the file: ${err.message}`]);
    } finally {
      // Allow re-selecting the same file again later.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirm = (items) => {
    onImport(items);
    setPreviewItems(null);
    setSuccess(`Added ${items.length} item${items.length === 1 ? '' : 's'} to the order.`);
  };

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">
          Upload JSON file
        </span>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-ink-100 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            Choose .json file
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
          {fileName && <span className="text-xs text-ink-300">{fileName}</span>}
        </div>
      </div>

      <div className="mx-auto flex max-w-2xl items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-300">
        <span className="h-px flex-1 bg-ink-100" />
        Or
        <span className="h-px flex-1 bg-ink-100" />
      </div>

      <div className="mx-auto max-w-2xl">
        <span className="mb-1 block text-center text-xs font-semibold uppercase tracking-wide text-ink-400">
          Paste item JSON
        </span>
        <textarea
          className="h-48 w-full rounded-sm border border-ink-100 bg-white px-3 py-2 font-mono text-xs text-ink-700 placeholder:text-ink-200 focus:border-brand-400"
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        <span className="mt-1 block text-xs text-ink-300">
          Accepts a single item, an array of items, or {'{ "Items": [...] }'}.
        </span>
      </div>

      <div className="text-center">
        <Button type="button" onClick={handlePasteImport} disabled={!text.trim()}>
          Review pasted JSON
        </Button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <p className="font-semibold">
            {errors.length === 1 ? 'Import failed:' : `Import failed with ${errors.length} errors:`}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {success && (
        <p className="rounded-sm border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </p>
      )}

      {previewItems && (
        <ImportedItemsReviewModal
          items={previewItems}
          onCancel={() => setPreviewItems(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
