import { useState } from 'react';
import { Voting } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorState, Field, Loading, StatusBadge, Table, Textarea } from '../../components/ui.jsx';
import { ROLE_LABELS, formatDateTime } from '../../lib/format.js';

const EDITABLE = ['DRAFT', 'REGISTRATION', 'CAMPAIGN'];

export default function VotersTab({ election, operator, onChange }) {
  const voters = useApi(() => Voting.voters(election.id), [election.id]);
  const [emails, setEmails] = useState('');
  const [result, setResult] = useState(null);
  const [remove, setRemove] = useState(null);
  const action = useAction();
  const editable = operator && EDITABLE.includes(election.status);

  const afterAdd = (r) => {
    if (r) {
      setResult(r);
      setEmails('');
      voters.reload();
      onChange();
    }
  };

  return (
    <div className="space-y-6">
      {editable && (
        <Card title="Add eligible voters">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <Field label="Member emails (one per line or comma separated)" htmlFor="vemails" hint="People must already be members of this organization. Auditors cannot vote.">
              <Textarea id="vemails" rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} />
            </Field>
            <div className="flex flex-col justify-end gap-2">
              <Button busy={action.busy} disabled={!emails.trim()} onClick={async () => afterAdd(await action.run(() =>
                Voting.addVoters(election.id, emails.split(/[\s,;]+/).filter(Boolean))))}>Add listed members</Button>
              <Button variant="secondary" busy={action.busy} onClick={async () => afterAdd(await action.run(() => Voting.addAllMembers(election.id)))}>
                Add all voters & candidates
              </Button>
            </div>
          </div>
          {action.error && <div className="mt-3"><Alert kind="error">{action.error}</Alert></div>}
          {result && (
            <div className="mt-3">
              <Alert kind={result.rejected.length ? 'warning' : 'success'} onClose={() => setResult(null)}>
                Added {result.added}; {result.alreadyEligible} already eligible.
                {result.rejected.length > 0 && <ul className="mt-1 list-disc pl-5">{result.rejected.map((r) => <li key={r}>{r}</li>)}</ul>}
              </Alert>
            </div>
          )}
        </Card>
      )}
      {!editable && <Alert kind="info">The voter list is locked once voting opens.</Alert>}
      <Card title="Eligible voter list" padded={false}>
        {voters.loading && <Loading />}
        {voters.error && <div className="p-5"><ErrorState message={voters.error} onRetry={voters.reload} /></div>}
        {voters.data && (
          <Table
            rowKey={(v) => v.id}
            rows={voters.data.content}
            empty="No eligible voters yet."
            columns={[
              { key: 'fullName', label: 'Name', render: (v) => <div><p className="font-medium">{v.fullName}</p><p className="text-xs text-slate-500">{v.email}</p></div> },
              { key: 'role', label: 'Role', render: (v) => ROLE_LABELS[v.role] ?? v.role },
              { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v.status} /> },
              { key: 'credentialIssued', label: 'Credential', render: (v) => (v.credentialIssued ? <Badge tone="green">Issued</Badge> : <Badge>Not issued</Badge>) },
              { key: 'addedAt', label: 'Added', render: (v) => formatDateTime(v.addedAt) },
              { key: 'x', label: '', render: (v) => editable && v.status === 'ELIGIBLE' && !v.credentialIssued && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setRemove(v)}>Remove</Button> },
            ]}
          />
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          “Credential issued” shows who obtained an anonymous voting credential. It does not show whether or how they voted.
        </p>
      </Card>
      <ConfirmDialog open={Boolean(remove)} title={`Remove ${remove?.fullName}?`} danger busy={action.busy} confirmLabel="Remove"
        onCancel={() => setRemove(null)}
        onConfirm={async () => {
          await action.run(() => Voting.removeVoter(election.id, remove.id));
          setRemove(null);
          voters.reload();
          onChange();
        }}>
        They will no longer be able to vote in this election.
      </ConfirmDialog>
    </div>
  );
}
