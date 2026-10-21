import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar.jsx';

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({ identity: { role: 'ADMINISTRATOR' } }),
}));

let page;
afterEach(() => { if (page) act(() => page.unmount()); page = null; });

describe('order navigation in the sidebar', () => {
  it.each(['/orders', '/orders/backlog', '/orders/archived', '/orders/ORD-001', '/orders/ORD-001/edit', '/orders/new', '/orders/new/'])(
    'keeps orders grouped together at %s without extra backlog or archive links', (path) => {
      act(() => {
        page = create(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Sidebar /></MemoryRouter>);
      });
      const links = page.root.findAllByType('a');
      expect(links.map((link) => link.props.href)).toEqual(['/orders', '/orders/new', '/boxes', '/users']);
      const selected = links.filter((link) => link.props.className.includes('bg-brand-500'));
      expect(selected).toHaveLength(1);
      expect(selected[0].props.href).toBe(path.replace(/\/+$/, '') === '/orders/new' ? '/orders/new' : '/orders');
      expect(selected[0].props['aria-current']).toBe('page');
    }
  );
});
