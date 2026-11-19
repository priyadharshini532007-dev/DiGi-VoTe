import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Candidates, Elections } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, StatusBadge, Table, Textarea } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

const EMPTY = { displayName: '', statement: '', qualifications: '', achievements: '' };

export default function CandidacyHome() {
  const { active, user } = useAuth();
  const mine = useApi(() => Candidates.myApplications(), []);
  const elections = useApi(() => Elections.list(active.organizationId, 0, 100), [active.organizationId]);
  const [form, setForm] = useState(null);
  const [withdraw, setWithdraw] = useState(null);
  const action = useAction();

  const appliedTo = new Set((mine.data ?? []).map((a) => a.electionId));
  const open = (elections.data?.content ?? []).filter((e) => e.status === 'REGISTRATION' && !appliedTo.has(e.id));

  const submit = async (e) => {
    e.preventDefault();
    const body = { displayName: form.displayName, statement: form.statement, qualifications: form.qualifications, achievements: form.achievements };
    const r = await action.run(() => (form.applicationId ? Candidates.revise(form.applicationId, body) : Candidates.apply(form.electionId, body)),
      form.applicationId ? 'Application resubmitted' : 'Application submitted');
    if (r) { setForm(null); mine.reload(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My candidacy" subtitle="Apply to elections, track your applications and manage your campaign." />
      {action.success && <Alert kind="success" onClose={action.clear}>{action.success}</Alert>}
      <Card title="Elections open for applications" padded={false}>
        {elections.loading && <Loading />}
        {elections.data && open.length === 0 && <p className="px-5 py-6 text-sm text-slate-500">No elections are accepting applications right now.</p>}
        {open.length > 0 && (
          <Table rowKey={(e) => e.id} rows={open} columns={[
            { key: 'title', label: 'Election', render: (e) => <span className="font-medium">{e.title}</span> },
            { key: 'description', label: 'Description', className: 'text-slate-600' },
            { key: 'withdrawal', label: 'Withdrawal deadline', render: (e) => formatDateTime(e.rules.withdrawalDeadline ?? e.rules.votingStart) },
            { key: 'apply', label: '', render: (e) => <Button size="sm" onClick={() => { action.clear(); setForm({ ...EMPTY, displayName: user.fullName, electionId: e.id, electionTitle: e.title }); }}>Apply</Button> },
          ]} />
        )}
      </Card>
      <Card title="My applications" padded={false}>
        {mine.loading && <Loading />}
        {mine.error && <div className="p-5"><ErrorState message={mine.error} onRetry={mine.reload} /></div>}
        {mine.data && mine.data.length === 0 && <div className="p-5"><EmptyState title="You have not applied yet" /></div>}
        {mine.data && mine.data.length > 0 && (
          <Table rowKey={(a) => a.id} rows={mine.data} columns={[
            { key: 'electionTitle', label: 'Election', render: (a) => <span className="font-medium">{a.electionTitle}</span> },
            { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            { key: 'reviewerNote', label: 'Reviewer note', className: 'text-slate-600' },
            { key: 'submittedAt', label: 'Submitted', render: (a) => formatDateTime(a.submittedAt) },
            {
              key: 'actions', label: '', render: (a) => (
                <div className="flex flex-wrap gap-1">
                  {a.candidateId && <Link className="rounded-md px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-panel-2" to={`/app/candidacy/${a.candidateId}`}>Open workspace</Link>}
                  {a.status === 'CORRECTION_REQUESTED' && <Button size="sm" variant="secondary" onClick={() => setForm({ ...a, applicationId: a.id })}>Revise</Button>}
                  {['SUBMITTED', 'CORRECTION_REQUESTED', 'APPROVED'].includes(a.status) && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setWithdraw(a)}>Withdraw</Button>}
                </div>
              ),
            },
          ]} />
        )}
      </Card>

      <Modal open={Boolean(form)} title={form?.applicationId ? 'Revise application' : `Apply: ${form?.electionTitle ?? ''}`} onClose={() => setForm(null)}>
        {form && (
          <form className="space-y-4" onSubmit={submit}>
            {action.error && <Alert kind="error">{action.error}</Alert>}
            <Field label="Name on the ballot" htmlFor="cname"><Input id="cname" required maxLength={120} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
            <Field label="Statement" htmlFor="cstmt"><Textarea id="cstmt" required rows={3} value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} /></Field>
            <Field label="Qualifications" htmlFor="cqual"><Textarea id="cqual" rows={2} value={form.qualifications ?? ''} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} /></Field>
            <Field label="Achievements" htmlFor="cach"><Textarea id="cach" rows={2} value={form.achievements ?? ''} onChange={(e) => setForm({ ...form, achievements: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" busy={action.busy}>Submit</Button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog open={Boolean(withdraw)} title="Withdraw your candidature?" danger confirmLabel="Withdraw" busy={action.busy}
        onCancel={() => setWithdraw(null)}
        onConfirm={async () => { await action.run(() => Candidates.withdraw(withdraw.id), 'Candidature withdrawn'); setWithdraw(null); mine.reload(); }}>
        {action.error && <Alert kind="error">{action.error}</Alert>}
        You will be removed from the ballot. This is only possible before the withdrawal deadline and cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
