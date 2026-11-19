import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthCard from './AuthCard.jsx';
import { Alert, Button, Field, Input } from '../../components/ui.jsx';
import FirebaseAuthPanel from '../../components/FirebaseAuthPanel.jsx';
import { Auth } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { homeFor } from '../../components/navigation.js';
import { firebaseConfigured, firebaseSignOut } from '../../lib/firebase.js';

export default function Activate() {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', activationCode: '', fullName: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [firebaseEnabled, setFirebaseEnabled] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    Auth.config().then((c) => setFirebaseEnabled(c.firebaseEnabled && firebaseConfigured)).catch(() => {});
  }, []);

  const finish = (response) => {
    const s = startSession(response);
    const first = s.user.memberships[0];
    navigate(first ? homeFor(first.role) : '/app', { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      finish(await Auth.activate({ ...form, email: form.email.trim(), activationCode: form.activationCode.trim() }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const activateWithFirebase = async (idToken) => {
    try {
      finish(await Auth.firebaseActivate({ idToken, activationCode: form.activationCode.trim(), fullName: form.fullName }));
    } finally {
      await firebaseSignOut();
    }
  };

  const checkCode = () => (!/^[0-9A-Za-z-]{8,20}$/.test(form.activationCode.trim()) || !form.fullName.trim()
    ? 'Enter your activation code and full name first.' : null);

  const showPassword = !firebaseEnabled || usePassword;

  return (
    <AuthCard title="Accept your invitation"
      subtitle="Enter the one-time activation code your organization gave you, then choose how you will sign in.">
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Activation code" htmlFor="acode" hint="Format XXXX-XXXX-XXXX">
          <Input id="acode" required value={form.activationCode} onChange={set('activationCode')} className="mono uppercase" />
        </Field>
        <Field label="Full name" htmlFor="aname">
          <Input id="aname" required value={form.fullName} onChange={set('fullName')} />
        </Field>
      </div>
      {firebaseEnabled && !usePassword && (
        <div className="mt-6 border-t border-slate-100 pt-6">
          <p className="mb-3 text-sm text-slate-600">Use the same email address the invitation was sent to.</p>
          <FirebaseAuthPanel allowCreate submitLabel="Accept invitation" beforeSubmit={checkCode} onIdToken={activateWithFirebase} />
          <button type="button" className="mt-4 text-sm text-slate-500 hover:text-navy-700" onClick={() => setUsePassword(true)}>
            Use a DigiVote password instead
          </button>
        </div>
      )}
      {showPassword && (
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <Field label="Email" htmlFor="aemail">
            <Input id="aemail" type="email" required value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Password" htmlFor="apass" hint="If you already have a DigiVote account, enter its current password">
            <Input id="apass" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
          </Field>
          <Button type="submit" className="w-full" busy={busy}>Activate account</Button>
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
