import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import Field, { inputClass } from '../components/common/Field.jsx';
import Button from '../components/common/Button.jsx';
import AuthShell from '../components/layout/AuthShell.jsx';

export default function LoginPage() {
  const { identity, authInitializing, authError, login } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authInitializing && identity) {
      navigate(location.state?.from?.pathname || '/orders', { replace: true });
    }
  }, [authInitializing, identity, location.state, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Enter an email and password to continue.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/orders', { replace: true });
    } catch (loginError) {
      setError(loginError.message || 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authInitializing) {
    return <AuthShell heading="Signing in" subheading="Restoring your session…" />;
  }

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
            required
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
            required
          />
        </Field>
        {(error || authError) && (
          <p className="text-sm text-red-600">{error || authError.message}</p>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}
