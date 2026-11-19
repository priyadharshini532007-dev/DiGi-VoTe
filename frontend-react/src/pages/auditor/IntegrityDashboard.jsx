import { useState } from 'react';
import { Audit, Elections } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import ElectionScoped from '../../components/ElectionScoped.jsx';
import DataTable from '../../components/DataTable.jsx';
import { CheckStatusChart } from '../../components/Charts.jsx';
import { Alert, Button, Card, DefinitionList, ErrorState, Loading, StatCard, StatusBadge, Table } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { VOTING_DATA_STATUSES } from '../../lib/elections.js';
import { countChecks, trustVerdict } from '../../lib/trustStatus.js';
import { ChainResult } from '../shared/AuditLog.jsx';

function ElectionIntegrity({ election }) {
  const hasData = VOTING_DATA_STATUSES.includes(election.status);
  const trust = useApi(() => Elections.trust(election.id), [election.id, election.status]);
  const aggregation = useAction();
  const [agg, setAgg] = useState(null);
  const verdict = trust.data ? trustVerdict(trust.data) : null;
  const c = countChecks(trust.data?.checks);

  return (
    <div className="space-y-6">
      {trust.loading && !trust.data && <Loading label="Running integrity checks…" />}
      {trust.error && <ErrorState message={trust.error} onRetry={trust.reload} />}
      {verdict && (
        <>
          <Alert kind={verdict.kind} title={`Election integrity: ${verdict.label}`}>
            Every check is recomputed from stored data when this page loads. A check that cannot run yet is reported as “not run”, never as a pass.
          </Alert>
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <Card title="Integrity checks" padded={false} actions={<Button size="sm" variant="secondary" onClick={trust.reload}>Re-run checks</Button>}>
              <Table rowKey={(x) => x.key} rows={trust.data.checks} columns={[
                { key: 'label', label: 'Check', render: (x) => <span className="font-medium text-navy-900">{x.label}</span> },
                { key: 'status', label: 'Status', render: (x) => <StatusBadge status={x.status} /> },
                { key: 'detail', label: 'Evidence', className: 'text-slate-600' },
              ]} />
            </Card>
            <Card title="Outcome mix"><CheckStatusChart pass={c.pass} warn={c.warn} fail={c.fail} notRun={c.notRun} /></Card>
          </div>
        </>
      )}

      <Card title="Tally aggregation (record consistency)" actions={hasData && (
        <Button size="sm" variant="secondary" busy={aggregation.busy} onClick={async () => setAgg(await aggregation.run(() => Elections.aggregation(election.id)))}>Recompute</Button>
      )}>
        {!hasData && <p className="text-sm text-slate-600">Available once voting has opened.</p>}
        {aggregation.error && <Alert kind="error">{aggregation.error}</Alert>}
        {agg && (
          <>
            <Alert kind={agg.valid ? 'success' : 'error'} title={agg.valid ? 'Aggregation consistent' : 'Inconsistencies found'}>
              {agg.ballotsChecked} ballot commitments and {agg.optionsChecked} option aggregates recomputed.
            </Alert>
            <div className="mt-4">
              <DefinitionList items={[
                ['Commitment mismatches', agg.commitmentMismatches],
                ['Malformed ballots', agg.malformedBallots],
                ['Aggregate mismatches', agg.aggregateMismatches],
              ]} />
            </div>
            {agg.problems.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-red-800">{agg.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </>
        )}
        {hasData && !agg && !aggregation.error && <p className="text-sm text-slate-600">Recomputes every ballot commitment and per-option aggregate to look for missing or inconsistent records.</p>}
      </Card>
    </div>
  );
}

export default function IntegrityDashboard() {
  const { active, can } = useAuth();
  const orgId = active.organizationId;
  const verify = useAction();
  const [chain, setChain] = useState(null);
  const history = useApi(() => Audit.logs(orgId, 0, 'INTEGRITY'), [orgId]);
  const last = history.data?.content?.[0];

  return (
    <ElectionScoped title="Integrity dashboard" subtitle="Hash-chain verification, record consistency and verification history." operatorNote={false} preferRelevant>
      {({ election }) => (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon="shield" label="Audit hash chain" value={chain ? (chain.valid ? 'Intact' : 'Violated') : 'Not checked'}
              tone={chain ? (chain.valid ? 'green' : 'red') : undefined} hint={chain ? `${chain.recordsChecked} records recomputed` : 'Run verification below'} />
            <StatCard icon="clock" label="Last verification run" value={history.loading ? '…' : last ? formatDateTime(last.occurredAt) : 'Never'} hint="From the audit log" />
            <StatCard icon="activity" label="Verification runs on record" value={history.loading ? '…' : history.data?.totalElements ?? 0} />
          </div>

          <Card title="Organization audit chain" actions={can('VERIFY_INTEGRITY') && (
            <Button busy={verify.busy} onClick={async () => { const r = await verify.run(() => Audit.verify(orgId)); if (r) { setChain(r); history.reload(); } }}>Verify now</Button>
          )}>
            {verify.error && <Alert kind="error">{verify.error}</Alert>}
            {chain ? <ChainResult result={chain} /> : <p className="text-sm text-slate-600">Recomputes every audit record hash from genesis to confirm nothing was altered, removed or truncated.</p>}
          </Card>

          <ElectionIntegrity election={election} />

          <Card title="Verification history" padded={false}>
            <DataTable
              loading={history.loading}
              error={history.error}
              onRetry={history.reload}
              rows={history.data?.content ?? []}
              rowKey={(l) => l.seq}
              empty="No verification runs have been recorded yet."
              columns={[
                { key: 'occurredAt', label: 'When', render: (l) => formatDateTime(l.occurredAt) },
                { key: 'actorRef', label: 'Run by', render: (l) => l.actorRef ?? 'system' },
                { key: 'electionId', label: 'Election', render: (l) => l.electionId ?? 'Organization' },
                { key: 'metadataJson', label: 'Result', render: (l) => <code className="break-all text-xs text-slate-600">{l.metadataJson}</code> },
              ]}
            />
          </Card>
        </div>
      )}
    </ElectionScoped>
  );
}
