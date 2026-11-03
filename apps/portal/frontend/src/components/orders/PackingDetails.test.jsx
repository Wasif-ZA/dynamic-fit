import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UnpackedItems } from './PackingDetails.jsx';

describe('UnpackedItems', () => {
  it('shows rejection details in red and groups repeated rejected units', () => {
    const reject = {
      item_ref: 'OVERSIZED',
      reason_code: 'NO_FITTING_CARTON',
      message: 'Item exceeds available box dimensions',
    };
    const html = renderToStaticMarkup(<UnpackedItems rejects={[reject, reject]} />);

    expect(html).toContain('text-red-700');
    expect(html).toContain('border-red-200');
    expect(html).toContain('Items not packed');
    expect(html).toContain('OVERSIZED');
    expect(html).toContain('× 2');
    expect(html).toContain(reject.message);
    expect(html).toContain(reject.reason_code);
    expect(html.match(/<li>/g)).toHaveLength(1);
  });

  it('clears rejection details when all items are packed', () => {
    expect(renderToStaticMarkup(<UnpackedItems rejects={[]} />)).toBe('');
  });
});
