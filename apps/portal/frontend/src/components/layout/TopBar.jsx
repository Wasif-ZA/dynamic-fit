import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';
import Button from '../common/Button.jsx';

export default function TopBar({ title, subtitle }) {
  const { user, logout } = useApp();
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between border-b border-ink-100 bg-white px-6 py-4">
      <div>
        <h1 className="font-display text-2xl font-semibold leading-none text-ink-700">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-ink-700">{user?.name}</p>
          <p className="text-xs text-ink-300">{user?.email}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}
