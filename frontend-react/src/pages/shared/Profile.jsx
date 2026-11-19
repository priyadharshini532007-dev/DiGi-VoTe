import { useState } from 'react';
import { Auth } from '../../api/endpoints.js';
import { useAction } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Table } from '../../components/ui.jsx';
import { ROLE_LABELS } from '../../lib/format.js';
import { sendPasswordReset } from '../../lib/firebase.js';

export default function Profile() {
  const { user, refresh, memberships } = useAuth();
  const [profile, setProfile] = useState({ fullName: user.fullName, mobileNumber: user.mobileNumber ?? '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const save = useAction();
  const change = useAction();
  const reset = useAction();

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle={user.email} />
      <Card title="Personal details">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await save.run(() => Auth.updateProfile(profile), 'Profile saved')) await refresh();
        }}>
          <Field label="Full name" htmlFor="pname">
            <Input id="pname" required value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} />
          </Field>
          <Field label="Mobile number" htmlFor="pmobile">
            <Input id="pmobile" value={profile.mobileNumber} onChange={(e) => setProfile({ ...profile, mobileNumber: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" busy={save.busy}>Save</Button>
            {save.success && <span className="text-sm text-emerald-700">{save.success}</span>}
            {save.error && <span className="text-sm text-red-700">{save.error}</span>}
          </div>
        </form>
      </Card>
      {user.localPassword ? (
      <Card title="Change password">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await change.run(() => Auth.changePassword(pw), 'Password changed') !== undefined) setPw({ currentPassword: '', newPassword: '' });
        }}>
          <Field label="Current password" htmlFor="pcur">
            <Input id="pcur" type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password" htmlFor="pnew" hint="Letters and digits; your organization sets the minimum length">
            <Input id="pnew" type="password" required autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" busy={change.busy}>Change password</Button>
            {change.success && <span className="text-sm text-emerald-700">{change.success}</span>}
          </div>
          {change.error && <div className="sm:col-span-2"><Alert kind="error">{change.error}</Alert></div>}
        </form>
      </Card>
      ) : (
        <Card title="Password">
          <p className="text-sm text-slate-600">
            You sign in with Firebase (Google or email). DigiVote stores no password for this account. If you use an
            email password, you can receive a reset link; Google users manage their password with Google.
          </p>
          <Button variant="secondary" className="mt-3" busy={reset.busy}
            onClick={() => reset.run(() => sendPasswordReset(user.email), 'If this email has a Firebase password, a reset link is on its way.')}>
            Send password reset email
          </Button>
          {reset.success && <p className="mt-2 text-sm text-emerald-700">{reset.success}</p>}
          {reset.error && <p className="mt-2 text-sm text-red-700">{reset.error}</p>}
        </Card>
      )}
      <Card title="Memberships" padded={false}>
        <Table
          rowKey={(m) => m.membershipId}
          rows={memberships}
          empty="No active memberships."
          columns={[
            { key: 'organizationName', label: 'Organization' },
            { key: 'role', label: 'Role', render: (m) => <Badge tone="blue">{ROLE_LABELS[m.role]}</Badge> },
            { key: 'status', label: 'Status' },
          ]}
        />
      </Card>
    </div>
  );
}
