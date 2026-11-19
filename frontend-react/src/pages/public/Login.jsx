import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthCard from './AuthCard.jsx';
import { Alert, Button, Field, Input } from '../../components/ui.jsx';
import { Auth } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { firebaseConfigured, firebaseSignOut } from '../../lib/firebase.js';
import FirebaseAuthPanel from '../../components/FirebaseAuthPanel.jsx';
import { homeFor } from '../../components/navigation.js';

export function validateLogin({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address';
  if (!password) errors.password = 'Password is required';
  return errors;
}

export default function Login() {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [firebaseEnabled, setFirebaseEnabled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    Auth.config().then((c) => setFirebaseEnabled(c.firebaseEnabled && firebaseConfigured)).catch(() => {});
  }, []);

  const finish = (response) => {
    const s = startSession(response);
    const first = s.user.memberships[0];
    navigate(location.state?.from || (first ? homeFor(first.role) : '/app'), { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    const v = validateLogin(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setError(null);
    try {
      finish(await Auth.login({ email: form.email.trim(), password: form.password }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const firebaseSignIn = async (idToken) => {
    try {
      finish(await Auth.firebase(idToken));
    } finally {
      // DigiVote issues its own session; the Firebase browser session is no longer needed.
      await firebaseSignOut();
    }
  };

  return (
    <AuthCard
      title="Sign in to DigiVote"
      subtitle="Use the account you created or activated from an invitation."
      footer={<>New organization? <Link className="font-medium text-navy-700" to="/register">Register</Link> · Have an invitation code? <Link className="font-medium text-navy-700" to="/activate">Activate</Link></>}
    >
      {firebaseEnabled && (
        <>
          <FirebaseAuthPanel onIdToken={firebaseSignIn} submitLabel="Sign in" />
          <div className="mt-6 border-t border-slate-100 pt-4">
            <button type="button" className="text-sm text-slate-500 hover:text-navy-700" aria-expanded={showPassword}
              onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? 'Hide DigiVote password sign-in' : 'Have a DigiVote password (invitation accepted with a password)? Sign in with it'}
            </button>
          </div>
        </>
      )}
      {(!firebaseEnabled || showPassword) && (
      <form className="mt-4 space-y-4" onSubmit={submit} noValidate aria-label="DigiVote password sign-in">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <Input id="password" type="password" autoComplete="current-password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Button type="submit" className="w-full" variant={firebaseEnabled ? 'secondary' : 'primary'} busy={busy}>Sign in</Button>
      </form>
      )}
    </AuthCard>
  );
}
