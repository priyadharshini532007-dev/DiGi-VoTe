import { useState } from 'react';
import { Orgs } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Button, Card, ConfirmDialog, ErrorState, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table } from '../../components/ui.jsx';
import { ROLE_LABELS, formatDateTime } from '../../lib/format.js';

const ROLES = ['ELECTION_ADMIN', 'CANDIDATE', 'VOTER', 'AUDITOR', 'ORG_OWNER'];

export default function Members() {
  const { active, user } = useAuth();
  const orgId = active.organizationId;
  const members = useApi(() => Orgs.members(orgId, 0, 100), [orgId]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'ELECTION_ADMIN' });
  const [invitation, setInvitation] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const invite = useAction();
  const update = useAction();

  const doInvite = async (e) => {
    e.preventDefault();
    const r = await invite.run(() => Orgs.invite(orgId, form));
    if (r) {
      setInvitation(r);
      setInviteOpen(false);
      setForm({ email: '', fullName: '', role: form.role });
      members.reload();
    }
  };

  const applyStatus = async () => {
    const { member, status } = confirm;
    if (await update.run(() => Orgs.changeStatus(orgId, member.membershipId, status), 'Member updated')) members.reload();
    setConfirm(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Members & roles" subtitle="Invite people, assign one of the five roles, and suspend or remove access."
        actions={<Button onClick={() => { invite.clear(); setInviteOpen(true); }}>Invite member</Button>} />
      {invitation && (
        <Alert kind="success" title={`Invitation created for ${invitation.member.fullName}`} onClose={() => setInvitation(null)}>
          <p>Share this one-time activation code with them. It is shown only once and expires {formatDateTime(invitation.expiresAt)}.</p>
          <p className="mono mt-2 text-lg font-semibold tracking-wider">{invitation.activationCode}</p>
          <p className="mt-1">They activate at <span className="mono">{invitation.activationUrl}</span> with their email ({invitation.member.email}).</p>
        </Alert>
      )}
      {update.error && <Alert kind="error">{update.error}</Alert>}
      <Card padded={false}>
        {members.loading && <Loading />}
        {members.error && <div className="p-5"><ErrorState message={members.error} onRetry={members.reload} /></div>}
        {members.data && (
          <Table
            rowKey={(m) => m.membershipId}
            rows={members.data.content}
            columns={[
              { key: 'fullName', label: 'Name', render: (m) => <div><p className="font-medium text-navy-900">{m.fullName}</p><p className="text-xs text-slate-500">{m.email}</p></div> },
              {
                key: 'role', label: 'Role', render: (m) => (m.userId === user.id ? ROLE_LABELS[m.role] : (
                  <Select aria-label={`Role for ${m.fullName}`} value={m.role} className="w-52"
                    onChange={async (e) => {
                      if (await update.run(() => Orgs.changeRole(orgId, m.membershipId, e.target.value))) members.reload();
                    }}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </Select>
                )),
              },
              { key: 'status', label: 'Status', render: (m) => <StatusBadge status={m.status} /> },
              { key: 'lastLoginAt', label: 'Last sign-in', render: (m) => formatDateTime(m.lastLoginAt) },
              {
                key: 'actions', label: '', render: (m) => m.userId !== user.id && (
                  <div className="flex gap-1">
                    {m.status === 'ACTIVE' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ member: m, status: 'SUSPENDED' })}>Suspend</Button>}
                    {m.status === 'SUSPENDED' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ member: m, status: 'ACTIVE' })}>Reactivate</Button>}
                    {m.status !== 'REMOVED' && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setConfirm({ member: m, status: 'REMOVED' })}>Remove</Button>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal open={inviteOpen} title="Invite a member" onClose={() => setInviteOpen(false)}>
        <form className="space-y-4" onSubmit={doInvite}>
          {invite.error && <Alert kind="error">{invite.error}</Alert>}
          <Field label="Full name" htmlFor="iname"><Input id="iname" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Email" htmlFor="iemail"><Input id="iemail" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Role" htmlFor="irole">
            <Select id="irole" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button type="submit" busy={invite.busy}>Create invitation</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm ? `${confirm.status === 'REMOVED' ? 'Remove' : confirm.status === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} ${confirm.member.fullName}?` : ''}
        danger={confirm?.status !== 'ACTIVE'}
        busy={update.busy}
        confirmLabel="Confirm"
        onCancel={() => setConfirm(null)}
        onConfirm={applyStatus}
      >
        {confirm?.status === 'REMOVED' ? 'They lose access to this organization. Their past audit history is kept.' :
          confirm?.status === 'SUSPENDED' ? 'They cannot sign in to this organization until reactivated.' : 'They regain access with their current role.'}
      </ConfirmDialog>
    </div>
  );
}
