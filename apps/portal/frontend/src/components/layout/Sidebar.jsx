import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import { canManageUsers } from '../../lib/roles.js';

const LINKS = [
  { to: '/orders', label: 'Orders', icon: '01' },
  { to: '/orders/new', label: 'New order', icon: '02' },
  { to: '/boxes', label: 'Box Inventory', icon: '03' },
  { to: '/users', label: 'User management', icon: '04', managersOnly: true },
];

export default function Sidebar() {
  const { identity } = useApp();
  const links = LINKS.filter(
    (link) => !link.managersOnly || canManageUsers(identity?.role)
  );
  return (
    <aside className="hidden w-56 shrink-0 flex-col bg-ink-700 text-ink-50 md:flex">
      <div className="border-b border-ink-600 px-5 py-5">
        <p className="font-display text-2xl font-semibold leading-none tracking-wide">
          FitPortal
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-300">
          Dynamic Fit
        </p>
      </div>
      <nav className="flex-1 px-2 py-4">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/orders'}
            className={({ isActive }) =>
              `mb-1 flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-500 text-white'
                  : 'text-ink-200 hover:bg-ink-600 hover:text-white'
              }`
            }
          >
            <span className="font-mono text-[10px] text-ink-300">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="cut-line mx-4 mb-4" />
      <p className="px-5 pb-5 text-[11px] leading-relaxed text-ink-400">
        FitPortal MVP
      </p>
    </aside>
  );
}
