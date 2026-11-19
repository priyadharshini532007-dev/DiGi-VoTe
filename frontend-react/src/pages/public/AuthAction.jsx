import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthCard from './AuthCard.jsx';
import { Alert, Button, Field, Input, Loading } from '../../components/ui.jsx';
import { applyEmailVerification, checkPasswordResetCode, completePasswordReset } from '../../lib/firebase.js';
import { firebaseErrorMessage } from '../../lib/firebaseErrors.js';

/**
 * Handles Firebase email action links (set as the custom action URL in the Firebase console):
 * mode=verifyEmail applies the verification code; mode=resetPassword lets the user choose a new password.
 */
export default function AuthAction() {
  const [params] = useSearchParams();
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  const [state, setState] = useState({ status: 'working' });
  const [password, setPassword] = useState({ value: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setState({ status: 'error', message: 'This link is incomplete. Request a new email.' });
      return;
    }
    if (mode === 'verifyEmail') {
      applyEmailVerification(oobCode)
        .then(() => setState({ status: 'verified' }))
        .catch((e) => setState({ status: 'error', message: firebaseErrorMessage(e) }));
    } else if (mode === 'resetPassword') {
      checkPasswordResetCode(oobCode)
        .then((email) => setState({ status: 'reset-form', email }))
        .catch((e) => setState({ status: 'error', message: firebaseErrorMessage(e) }));
    } else {
      setState({ status: 'error', message: 'Unsupported link.' });
    }
  }, [mode, oobCode]);

  const reset = async (e) => {
    e.preventDefault();
    if (password.value.length < 10 || !/[A-Za-z]/.test(password.value) || !/\d/.test(password.value)) {
      setState({ ...state, formError: 'Use at least 10 characters with letters and digits.' });
      return;
    }
    if (password.value !== password.confirm) {
      setState({ ...state, formError: 'Passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      await completePasswordReset(oobCode, password.value);
      setState({ status: 'reset-done' });
    } catch (err) {
      setState({ ...state, formError: firebaseErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={mode === 'resetPassword' ? 'Reset your password' : 'Verify your email'}>
      {state.status === 'working' && <Loading label="Checking your link…" />}
      {state.status === 'error' && (
        <div className="space-y-4">
          <Alert kind="error">{state.message}</Alert>
          <Link to="/login" className="text-sm font-medium text-navy-700">Go to sign in to request a new email →</Link>
        </div>
      )}
      {state.status === 'verified' && (
        <div className="space-y-4">
          <Alert kind="success" title="Email verified">You can now return to DigiVote and continue.</Alert>
          <Link to="/login" className="text-sm font-medium text-navy-700">Sign in →</Link>
        </div>
      )}
      {state.status === 'reset-form' && (
        <form className="space-y-4" onSubmit={reset} noValidate>
          <p className="text-sm text-slate-600">Choose a new password for <strong>{state.email}</strong>.</p>
          {state.formError && <Alert kind="error">{state.formError}</Alert>}
          <Field label="New password" htmlFor="np"><Input id="np" type="password" autoComplete="new-password" value={password.value} onChange={(e) => setPassword({ ...password, value: e.target.value })} /></Field>
          <Field label="Confirm new password" htmlFor="npc"><Input id="npc" type="password" autoComplete="new-password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} /></Field>
          <Button type="submit" className="w-full" busy={busy}>Save new password</Button>
        </form>
      )}
      {state.status === 'reset-done' && (
        <div className="space-y-4">
          <Alert kind="success" title="Password changed">Sign in with your new password.</Alert>
          <Link to="/login" className="text-sm font-medium text-navy-700">Sign in →</Link>
        </div>
      )}
    </AuthCard>
  );
}
