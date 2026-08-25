import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import Field, { inputClass } from '../components/common/Field.jsx';
import Button from '../components/common/Button.jsx';
import AuthShell from '../components/layout/AuthShell.jsx';

export default function RegisterPage() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', depot: '' });
  const [error, setError] = useState('');

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError('Fill in name, email and password.');
      return;
    }
    // No backend yet - registering signs the user straight in.
    login(form.email);
    navigate('/orders', { replace: true });
  };

  return (
    <AuthShell heading="Create account" subheading="Set up operational access to FitPortal.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <input
            className={inputClass()}
            placeholder="Jordan Lee"
            value={form.name}
            onChange={update('name')}
          />
        </Field>
        <Field label="Work email">
          <input
            type="email"
            className={inputClass()}
            placeholder="you@thomax.com"
            value={form.email}
            onChange={update('email')}
          />
        </Field>
        <Field label="Depot / site" hint="Optional - helps route your orders">
          <input
            className={inputClass()}
            placeholder="Chullora DC"
            value={form.depot}
            onChange={update('depot')}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            className={inputClass()}
            placeholder="••••••••"
            value={form.password}
            onChange={update('password')}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-400">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-500 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
