import { useState } from 'react';
import { Audit } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Button, Card, ErrorState, Hash, Loading, PageHeader, Select, Table } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

const PREFIXES = ['', 'AUTH_', 'ORG_', 'MEMBER_', 'ELECTION_', 'CANDIDATE_', 'MANIFESTO', 'VOTER', 'CREDENTIAL_', 'BALLOT_',
  'RESULTS_', 'RECEIPT_', 'INTEGRITY_', 'REPORT_', 'SECURITY_'];

export function ChainResult({ result }) {
  return (
    <Alert kind={result.valid ? 'success' : 'error'} title={result.valid ? 'Audit chain intact' : 'Audit chain integrity violation'}>
      {result.recordsChecked} records recomputed from genesis · head <span className="mono">{result.headHash.slice(0, 24)}…</span>
      {result.problems.length > 0 && <ul className="mt-2 list-disc pl-5">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
    </Alert>
  );
}

export default function AuditLog() {
  const { active, can } = useAuth();
  const orgId = active.organizationId;
  const [page, setPage] = useState(0);
  const [prefix, setPrefix] = useState('');
  const logs = useApi(() => Audit.logs(orgId, page, prefix || undefined), [orgId, page, prefix]);
  const verify = useAction();
  const [chain, setChain] = useState(null);

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Append-only, hash-chained record of every significant action in this organization."
        actions={can('VERIFY_INTEGRITY') && (
          <Button busy={verify.busy} onClick={async () => {
            const r = await verify.run(() => Audit.verify(orgId));
            if (r) { setChain(r); logs.reload(); }
          }}>
            Verify hash chain
          </Button>
        )}
      />
      {verify.error && <Alert kind="error">{verify.error}</Alert>}
      {chain && <div className="mb-5"><ChainResult result={chain} /></div>}
      <Card
        padded={false}
        title="Events"
        actions={
          <Select aria-label="Filter by event type" value={prefix} onChange={(e) => { setPrefix(e.target.value); setPage(0); }} className="w-48">
            {PREFIXES.map((p) => <option key={p} value={p}>{p ? p.replace(/_$/, '') : 'All events'}</option>)}
          </Select>
        }
      >
        {logs.loading && <Loading />}
        {logs.error && <div className="p-5"><ErrorState message={logs.error} onRetry={logs.reload} /></div>}
        {logs.data && (
          <Table
            rowKey={(r) => r.seq}
            rows={logs.data.content}
            columns={[
              { key: 'seq', label: 'Seq' },
              { key: 'occurredAt', label: 'Time', render: (r) => formatDateTime(r.occurredAt) },
              { key: 'eventType', label: 'Event', render: (r) => <span className="font-medium text-navy-900">{r.eventType}</span> },
              { key: 'electionId', label: 'Election', render: (r) => r.electionId ?? '—' },
              { key: 'actorRef', label: 'Actor', render: (r) => r.actorRef ?? 'anonymous / system' },
              { key: 'metadataJson', label: 'Details', render: (r) => <code className="text-xs text-slate-600 break-all">{r.metadataJson}</code> },
              { key: 'recordHash', label: 'Hash', render: (r) => <Hash value={r.recordHash} len={10} /> },
            ]}
          />
        )}
      </Card>
      {logs.data?.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
          <span>Page {page + 1} of {logs.data.totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page + 1 >= logs.data.totalPages} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      )}
    </div>
  );
}
