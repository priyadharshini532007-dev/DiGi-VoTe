import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from './AuthCard.jsx';
import { Alert, Button, Field, Input, Textarea } from '../../components/ui.jsx';
import FirebaseAuthPanel from '../../components/FirebaseAuthPanel.jsx';
import { Auth } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { firebaseConfigured, firebaseSignOut } from '../../lib/firebase.js';

export function validateRegistration(f) {
  const e = validateOrganization(f);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (f.password.length < 10) e.password = 'Use at least 10 characters';
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Use letters and digits';
  if (f.password !== f.confirm) e.confirm = 'Passwords do not match';
  return e;
}

export function validateOrganization(f) {
  const e = {};
  if (!f.organizationName.trim()) e.organizationName = 'Organization name is required';
  if (!f.fullName.trim()) e.fullName = 'Your name is required';
  return e;
}

export default function Register() {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ organizationName: '', organizationDescription: '', fullName: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [firebaseEnabled, setFirebaseEnabled] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    Auth.config().then((c) => setFirebaseEnabled(c.firebaseEnabled && firebaseConfigured)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const v = validateRegistration(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setError(null);
    try {
      const { confirm, ...body } = form;
      startSession(await Auth.registerOrganization(body));
      navigate('/app/overview', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const registerWithFirebase = async (idToken) => {
    try {
      startSession(await Auth.firebaseRegister({ idToken, organizationName: form.organizationName,
        organizationDescription: form.organizationDescription, fullName: form.fullName }));
      navigate('/app/overview', { replace: true });
    } finally {
      await firebaseSignOut();
    }
  };

  const checkOrganization = () => {
    const v = validateOrganization(form);
    setErrors(v);
    return Object.keys(v).length ? 'Fill in the organization name and your name first.' : null;
  };

  const showPasswordForm = !firebaseEnabled || usePassword;

  return (
    <AuthCard
      title="Register your organization"
      subtitle="You become the Organization Owner and can invite administrators, candidates, voters and auditors."
      footer={<>Already registered? <Link className="font-medium text-navy-700" to="/login">Sign in</Link></>}
    >
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Organization name" htmlFor="org" error={errors.organizationName}>
          <Input id="org" value={form.organizationName} onChange={set('organizationName')} />
        </Field>
        <Field label="Description (optional)" htmlFor="desc">
          <Textarea id="desc" rows={2} value={form.organizationDescription} onChange={set('organizationDescription')} />
        </Field>
        <Field label="Your full name" htmlFor="name" error={errors.fullName}>
          <Input id="name" value={form.fullName} onChange={set('fullName')} />
        </Field>
      </div>
      {firebaseEnabled && !usePassword && (
        <div className="mt-6 border-t border-slate-100 pt-6">
          <p className="mb-3 text-sm font-medium text-slate-700">Choose how you will sign in</p>
          <FirebaseAuthPanel allowCreate submitLabel="Create organization" beforeSubmit={checkOrganization}
            onIdToken={registerWithFirebase} />
          <button type="button" className="mt-4 text-sm text-slate-500 hover:text-navy-700" onClick={() => setUsePassword(true)}>
            Use a DigiVote password instead
          </button>
        </div>
      )}
      {showPasswordForm && (
        <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
          <Field label="Email" htmlFor="remail" error={errors.email}>
            <Input id="remail" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Password" htmlFor="rpass" error={errors.password} hint="At least 10 characters with letters and digits">
            <Input id="rpass" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="rconfirm" error={errors.confirm}>
            <Input id="rconfirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </Field>
          <Button type="submit" className="w-full" busy={busy}>Create organization</Button>
          {firebaseEnabled && (
            <button type="button" className="text-sm text-slate-500 hover:text-navy-700" onClick={() => setUsePassword(false)}>
              Use Google or a Firebase email account instead
            </button>
          )}
        </form>
      )}
    </AuthCard>
  );
}
