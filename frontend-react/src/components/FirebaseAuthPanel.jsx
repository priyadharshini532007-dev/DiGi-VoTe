import { useState } from 'react';
import { Alert, Button, Field, Input } from './ui.jsx';
import {
  registerWithEmail, resendVerificationEmail, sendPasswordReset, signInWithEmail, signInWithGoogle,
  verifiedIdTokenOrNull,
} from '../lib/firebase.js';
import { firebaseErrorMessage } from '../lib/firebaseErrors.js';

/**
 * Firebase identity step shared by sign-in, organization registration and invitation acceptance.
 * Obtains a Firebase ID token for a *verified* email (Google, or Email/Password after the verification link),
 * then hands it to `onIdToken`, which calls the DigiVote backend. Passwords go only to Firebase.
 *
 * @param allowCreate whether "Create account" is offered (registration and invitations)
 * @param submitLabel label for the final action, e.g. "Sign in" or "Create organization"
 */
export default function FirebaseAuthPanel({ onIdToken, allowCreate = false, submitLabel = 'Continue', beforeSubmit }) {
  const [mode, setMode] = useState(allowCreate ? 'create' : 'signin');
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [stage, setStage] = useState('form'); // form | verify | reset-sent
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const run = async (fn) => {
    if (beforeSubmit) {
      const problem = beforeSubmit();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      if (e?.code === 'auth/email-not-verified') {
        setStage('verify');
      } else {
        setError(firebaseErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode === 'create') {
      if (form.password.length < 10 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
        setError('Use at least 10 characters with letters and digits.');
        return;
      }
      if (form.password !== form.confirm) {
        setError('Passwords do not match.');
        return;
      }
      run(async () => {
        await registerWithEmail(form.email.trim(), form.password);
        setStage('verify');
      });
    } else {
      run(async () => onIdToken(await signInWithEmail(form.email.trim(), form.password)));
    }
  };

  const continueAfterVerification = () => run(async () => {
    const token = await verifiedIdTokenOrNull();
    if (!token) {
      setError('Your email is not verified yet. Open the link in the email we sent, then try again.');
      return;
    }
    await onIdToken(token);
  });

  if (stage === 'verify') {
    return (
      <div className="space-y-4" data-testid="verify-email">
        <Alert kind="info" title="Verify your email address">
          We sent a verification link to <strong>{form.email}</strong>. Open it, then come back and continue.
          The link expires; if it does, send a new one.
        </Alert>
        {error && <Alert kind="error">{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button busy={busy} onClick={continueAfterVerification}>I have verified, {submitLabel.toLowerCase()}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => run(async () => {
            await resendVerificationEmail();
            setNotice('A new verification email is on its way.');
          })}>Resend email</Button>
          <Button variant="ghost" onClick={() => { setStage('form'); setMode('signin'); setError(null); }}>Back</Button>
        </div>
      </div>
    );
  }

  if (stage === 'reset-sent') {
    return (
      <div className="space-y-4">
        <Alert kind="success" title="Check your inbox">
          If an account exists for {form.email}, a password reset link is on its way.
        </Alert>
        <Button variant="secondary" onClick={() => { setStage('form'); setMode('signin'); }}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      <Button variant="secondary" className="w-full" disabled={busy}
        onClick={() => run(async () => onIdToken(await signInWithGoogle()))}>
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />or with email<span className="h-px flex-1 bg-slate-200" />
      </div>
      {allowCreate && (
        <div className="flex gap-1 rounded-md bg-slate-100 p-1 text-sm" role="tablist">
          {[['create', 'Create account'], ['signin', 'I already have one']].map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m}
              className={`flex-1 rounded px-3 py-1.5 font-medium ${mode === m ? 'bg-panel text-navy-900 shadow-sm' : 'text-slate-600'}`}
              onClick={() => { setMode(m); setError(null); }}>{label}</button>
          ))}
        </div>
      )}
      <form className="space-y-3" onSubmit={submitEmail} noValidate>
        <Field label="Email" htmlFor="fb-email">
          <Input id="fb-email" type="email" autoComplete="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="fb-password" hint={mode === 'create' ? 'At least 10 characters with letters and digits' : undefined}>
          <Input id="fb-password" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {mode === 'create' && (
          <Field label="Confirm password" htmlFor="fb-confirm">
            <Input id="fb-confirm" type="password" autoComplete="new-password" value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </Field>
        )}
        <Button type="submit" className="w-full" busy={busy}>
          {mode === 'create' ? 'Create account and send verification email' : submitLabel}
        </Button>
        {mode === 'signin' && (
          <button type="button" className="text-sm font-medium text-navy-700 hover:underline"
            onClick={() => {
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
                setError('Enter your email address above, then choose "Forgot password".');
                return;
              }
              run(async () => {
                await sendPasswordReset(form.email.trim());
                setStage('reset-sent');
              });
            }}>
            Forgot password?
          </button>
        )}
      </form>
    </div>
  );
}
