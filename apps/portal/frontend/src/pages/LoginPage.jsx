import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import Field, { inputClass } from '../components/common/Field.jsx';
import Button from '../components/common/Button.jsx';
import AuthShell from '../components/layout/AuthShell.jsx';

export default function LoginPage() {
  const { login } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Enter an email and password to continue.');
      return;
    }
    // No backend yet - any well-formed credentials succeed.
    login(email);
    navigate(location.state?.from?.pathname || '/orders', { replace: true });
  };

  return (
    <AuthShell
      heading="Sign in"
      subheading="Access order creation and packing visibility."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Work email">
          <input
            type="email"
            className={inputClass()}
            placeholder="you@thomax.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            className={inputClass()}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-400">
        New to FitPortal?{' '}
        <Link to="/register" className="font-medium text-brand-500 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
