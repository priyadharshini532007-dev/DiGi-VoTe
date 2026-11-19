import { Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Button, Card, ErrorState, Loading, StatCard, StatusBadge, Table } from '../../components/ui.jsx';

const OVERALL = {
  ALL_CHECKS_PASSED: ['success', 'All integrity checks passed'],
  CHECKS_INCOMPLETE: ['warning', 'Some checks have not run yet'],
  INTEGRITY_PROBLEMS: ['error', 'Integrity problems detected'],
};

export function TrustDashboard({ trust, onRefresh }) {
  const [kind, label] = OVERALL[trust.overall];
  return (
    <div className="space-y-6">
      <Alert kind={kind} title={`Election Trust Dashboard: ${label}`}>
        Every check below is recomputed from stored data when this page loads. “Not run” means the check had nothing to
        verify yet; it is never shown as a pass.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Accepted ballots" value={trust.acceptedBallots} />
        <StatCard label="Credentials issued" value={trust.credentialsIssued} />
        <StatCard label="Spent tokens" value={trust.spentTokens} />
        <StatCard label="Duplicates rejected" value={trust.duplicateRejections} />
        <StatCard label="Receipt checks" value={trust.receiptVerifications} />
      </div>
      <Card title="Integrity checks" padded={false} actions={onRefresh && <Button size="sm" variant="secondary" onClick={onRefresh}>Re-run checks</Button>}>
        <Table
          rowKey={(c) => c.key}
          rows={trust.checks}
          columns={[
            { key: 'label', label: 'Check', render: (c) => <span className="font-medium text-navy-900">{c.label}</span> },
            { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
            { key: 'detail', label: 'Evidence', className: 'text-slate-600' },
          ]}
        />
      </Card>
      {trust.warnings.length > 0 && (
        <Card title="Remaining warnings">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{trust.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}

export default function TrustTab({ election }) {
  const trust = useApi(() => Elections.trust(election.id), [election.id, election.status]);
  if (trust.loading && !trust.data) return <Loading label="Running integrity checks…" />;
  if (trust.error) return <ErrorState message={trust.error} onRetry={trust.reload} />;
  return <TrustDashboard trust={trust.data} onRefresh={trust.reload} />;
}
