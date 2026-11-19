import { useState } from 'react';
import { Elections, Orgs } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { Alert, Button, Card, ConfirmDialog, DefinitionList, Field, Input, Select, StatusBadge, Table, Textarea } from '../../components/ui.jsx';
import { NEXT_STATUS, STATUS_ORDER, TRANSITION_LABELS, formatDateTime } from '../../lib/format.js';

const PERMISSION_FOR = { PUBLISHED: 'publish', ARCHIVED: 'archive' };

export function LifecycleStepper({ status }) {
  const current = STATUS_ORDER.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-2">
      {STATUS_ORDER.map((s, i) => (
        <li key={s} className={`rounded-full px-3 py-1 text-xs font-semibold ${i < current ? 'bg-accent-soft text-navy-800' : i === current ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500'}`}>
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

export default function OverviewTab({ election, operator, canAssign, onChange }) {
  const readiness = useApi(() => Elections.readiness(election.id), [election.id, election.status]);
  const admins = useApi(() => Elections.administrators(election.id), [election.id]);
  const members = useApi(() => (canAssign ? Orgs.members(election.organizationId, 0, 100) : Promise.resolve(null)), [canAssign]);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [details, setDetails] = useState({ title: election.title, description: election.description ?? '' });
  const [adminId, setAdminId] = useState('');
  const transition = useAction();
  const saveDetails = useAction();
  const assign = useAction();
  const next = NEXT_STATUS[election.status];
  const editableDetails = operator && ['DRAFT', 'REGISTRATION'].includes(election.status);

  const doTransition = async () => {
    if (await transition.run(() => Elections.transition(election.id, next, note || undefined), `Election moved to ${next}`)) {
      setNote('');
      onChange();
      readiness.reload();
    }
    setConfirm(false);
  };

  return (
    <div className="space-y-6">
      <Card title="Lifecycle">
        <LifecycleStepper status={election.status} />
        {transition.error && <div className="mt-4"><Alert kind="error">{transition.error}</Alert></div>}
        {transition.success && <div className="mt-4"><Alert kind="success">{transition.success}</Alert></div>}
        {next && operator && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => setConfirm(true)} disabled={['VOTING'].includes(next) && readiness.data && !readiness.data.ready}>
              {TRANSITION_LABELS[next]}
            </Button>
            {readiness.data && ['DRAFT', 'REGISTRATION', 'CAMPAIGN'].includes(election.status) && (
              <span className="text-sm text-slate-600">Readiness {readiness.data.score}% {readiness.data.ready ? '· ready' : '· not ready yet'}</span>
            )}
          </div>
        )}
        {!operator && <p className="mt-4 text-sm text-slate-500">Only this election's operators can change its state.</p>}
      </Card>

      {readiness.data && readiness.data.checks.length > 0 && (
        <Card title="Readiness checks" padded={false}>
          <Table
            rowKey={(c) => c.key}
            rows={readiness.data.checks}
            columns={[
              { key: 'label', label: 'Requirement' },
              { key: 'passed', label: 'Status', render: (c) => <StatusBadge status={c.passed ? 'PASS' : 'FAIL'} /> },
              { key: 'detail', label: 'Detail', className: 'text-slate-600' },
            ]}
          />
        </Card>
      )}

      <Card title="Details">
        {editableDetails ? (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            if (await saveDetails.run(() => Elections.update(election.id, details), 'Details saved')) onChange();
          }}>
            <Field label="Title" htmlFor="dtitle"><Input id="dtitle" required value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} /></Field>
            <Field label="Description" htmlFor="ddesc"><Textarea id="ddesc" rows={3} value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} /></Field>
            {saveDetails.error && <Alert kind="error">{saveDetails.error}</Alert>}
            <Button type="submit" busy={saveDetails.busy}>Save details</Button>
          </form>
        ) : (
          <DefinitionList items={[
            ['Description', election.description || '—'],
            ['Created', formatDateTime(election.createdAt)],
            ['Voting window', election.rules.votingStart ? `${formatDateTime(election.rules.votingStart)} – ${formatDateTime(election.rules.votingEnd)}` : 'Not scheduled'],
            ['Approved candidates', election.activeCandidates],
            ['Eligible voters', election.eligibleVoters],
            election.archivedAt && ['Archived', formatDateTime(election.archivedAt)],
          ]} />
        )}
      </Card>

      <Card title="Election administrators" padded={false}>
        <Table
          rowKey={(a) => a.userId}
          rows={admins.data ?? []}
          empty="No administrators assigned. The organization owner can operate every election."
          columns={[
            { key: 'fullName', label: 'Name' },
            { key: 'email', label: 'Email' },
            { key: 'assignedAt', label: 'Assigned', render: (a) => formatDateTime(a.assignedAt) },
          ]}
        />
        {canAssign && election.status !== 'ARCHIVED' && (
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 p-5">
            <Field label="Assign an Election Administrator" htmlFor="assign">
              <Select id="assign" value={adminId} onChange={(e) => setAdminId(e.target.value)} className="w-64">
                <option value="">Choose…</option>
                {(members.data?.content ?? []).filter((m) => m.role === 'ELECTION_ADMIN' && m.status === 'ACTIVE').map((m) => (
                  <option key={m.userId} value={m.userId}>{m.fullName}</option>
                ))}
              </Select>
            </Field>
            <Button disabled={!adminId} busy={assign.busy} onClick={async () => {
              if (await assign.run(() => Elections.assignAdministrator(election.id, Number(adminId)))) { setAdminId(''); admins.reload(); }
            }}>Assign</Button>
            {assign.error && <span className="text-sm text-red-700">{assign.error}</span>}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirm}
        title={next ? TRANSITION_LABELS[next] : ''}
        confirmLabel={next ? `Move to ${next}` : 'Confirm'}
        danger={PERMISSION_FOR[next] === 'archive'}
        busy={transition.busy}
        onCancel={() => setConfirm(false)}
        onConfirm={doTransition}
      >
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="font-medium text-slate-500">Current stage</dt>
          <dd><StatusBadge status={election.status} /></dd>
          <dt className="font-medium text-slate-500">Requested stage</dt>
          <dd><StatusBadge status={next} /></dd>
          <dt className="font-medium text-slate-500">Preconditions</dt>
          <dd>
            {readiness.data && ['DRAFT', 'REGISTRATION', 'CAMPAIGN'].includes(election.status)
              ? (readiness.data.ready
                ? 'All readiness checks pass.'
                : `Not met: ${readiness.data.checks.filter((c) => !c.passed).map((c) => c.label).join('; ')}`)
              : 'Checked by the server when you confirm; invalid transitions are refused.'}
          </dd>
        </dl>
        <p>
          {next === 'VOTING' && 'Opening voting generates the election keys and freezes every manifesto. Rules can no longer change.'}
          {next === 'VERIFICATION' && 'Closing voting stops ballot acceptance immediately. This cannot be undone.'}
          {next === 'PUBLISHED' && 'Publishing makes the generated results final. Published results can never be modified.'}
          {next === 'ARCHIVED' && 'Archived elections become permanently read-only.'}
          {['REGISTRATION', 'CAMPAIGN'].includes(next) && `The election moves to ${next}. This is recorded on the audit chain.`}
        </p>
        <div className="mt-3">
          <Field label="Note for the timeline (optional)" htmlFor="tnote"><Input id="tnote" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </ConfirmDialog>
    </div>
  );
}
