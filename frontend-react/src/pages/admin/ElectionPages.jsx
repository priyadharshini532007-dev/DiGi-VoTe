import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Candidates, Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import ElectionScoped from '../../components/ElectionScoped.jsx';
import { Alert, Badge, Button, Card, Loading, StatCard, StatusBadge, Table } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { countChecks } from '../../lib/trustStatus.js';
import OverviewTab from './OverviewTab.jsx';
import RulesForm from './RulesForm.jsx';
import ResultsTab from './ResultsTab.jsx';
import TimelineTab from './TimelineTab.jsx';
import VotersTab from './VotersTab.jsx';
import VoterImport from './VoterImport.jsx';

const RULES_EDITABLE = ['DRAFT', 'REGISTRATION', 'CAMPAIGN'];

export function RulesPage() {
  return (
    <ElectionScoped title="Election rules" subtitle="Configure ballot, counting, receipts and schedule. Rules lock when voting opens.">
      {({ election, operator, reload }) => (
        <RulesForm key={`${election.id}-${election.updatedAt}`} election={election} editable={operator && RULES_EDITABLE.includes(election.status)} onSaved={reload} />
      )}
    </ElectionScoped>
  );
}

function FreezeNotice({ election }) {
  const candidates = useApi(() => Candidates.forElection(election.id), [election.id, election.status]);
  const started = ['VOTING', 'VERIFICATION', 'PUBLISHED', 'ARCHIVED'].includes(election.status);
  const list = candidates.data ?? [];
  const frozen = list.filter((c) => c.manifesto?.frozen).length;
  return (
    <Card title="Manifesto freeze">
      {started
        ? <Alert kind="warning" title="Candidate information is frozen">
            {candidates.loading ? 'Checking…' : `${frozen} of ${list.length} approved candidate manifesto(s) are read-only. Candidates and administrators cannot edit them; the server and the database both refuse changes.`}
          </Alert>
        : <p className="text-sm text-slate-600">
            Every manifesto becomes read-only automatically the moment voting opens, so nobody can change campaign
            material while ballots are being cast. Currently {list.length} approved candidate(s).
          </p>}
    </Card>
  );
}

export function LifecyclePage() {
  const { can } = useAuth();
  return (
    <ElectionScoped title="Election operations" subtitle="Move an election through its lifecycle. The server rejects invalid transitions.">
      {({ election, operator, reload }) => (
        <div className="space-y-6">
          <OverviewTab election={election} operator={operator} canAssign={can('ASSIGN_ELECTION_ADMINS')} onChange={reload} />
          <FreezeNotice election={election} />
        </div>
      )}
    </ElectionScoped>
  );
}

function ResultsManagementBody({ election, operator, reload }) {
  const { can } = useAuth();
  const trust = useApi(() => Elections.trust(election.id), [election.id, election.status]);
  const trail = useApi(() => (can('VIEW_AUDIT_LOGS') ? Elections.auditTrail(election.id) : Promise.resolve([])), [election.id, election.status]);
  const checks = trust.data?.checks ?? [];
  const c = countChecks(checks);
  const results = checks.find((x) => x.key === 'results');
  const history = (trail.data ?? []).filter((r) => ['RESULTS_GENERATED', 'RESULTS_PUBLISHED'].includes(r.eventType));
  const eligibleToPublish = election.status === 'VERIFICATION' && results?.status === 'PASS' && c.fail === 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vote validation" value={trust.loading ? '…' : results ? results.status.replace('_', ' ') : '—'} hint={results?.detail ?? 'Needs voting to have closed'} tone={results?.status === 'FAIL' ? 'red' : undefined} />
        <StatCard label="Accepted ballots" value={trust.loading ? '…' : trust.data?.acceptedBallots ?? '—'} />
        <StatCard label="Failed checks" value={trust.loading ? '…' : c.fail} tone={c.fail ? 'red' : undefined} hint={`${c.notRun} not run yet`} />
        <StatCard label="Publication" value={eligibleToPublish ? 'Eligible' : election.status === 'PUBLISHED' || election.status === 'ARCHIVED' ? 'Published' : 'Not yet'}
          hint={eligibleToPublish ? 'Generated results match the accepted ballots' : 'Needs generated results and no failed check'} />
      </div>
      {trust.error && <Alert kind="warning">Validation figures could not be loaded: {trust.error}</Alert>}

      <ResultsTab election={election} operator={operator} canPublish={can('PUBLISH_RESULTS')} onChange={reload} />

      <Card title="Outstanding integrity checks" padded={false}>
        {trust.loading && <Loading />}
        <Table rowKey={(x) => x.key} rows={checks} empty="Checks appear once the election has data."
          columns={[
            { key: 'label', label: 'Check', render: (x) => <span className="font-medium">{x.label}</span> },
            { key: 'status', label: 'Status', render: (x) => <StatusBadge status={x.status} /> },
            { key: 'detail', label: 'Evidence', className: 'text-slate-600' },
          ]} />
      </Card>

      {can('VIEW_AUDIT_LOGS') && (
        <Card title="Result publication history" padded={false}>
          {trail.loading && <Loading />}
          <Table rowKey={(r) => r.seq} rows={history} empty="No results have been generated yet."
            columns={[
              { key: 'occurredAt', label: 'When', render: (r) => formatDateTime(r.occurredAt) },
              { key: 'eventType', label: 'Event', render: (r) => <Badge tone={r.eventType === 'RESULTS_PUBLISHED' ? 'green' : 'blue'}>{r.eventType.replace('RESULTS_', '').toLowerCase()}</Badge> },
              { key: 'actorRef', label: 'By', render: (r) => r.actorRef ?? 'system' },
              { key: 'metadataJson', label: 'Details', render: (r) => <code className="break-all text-xs text-slate-600">{r.metadataJson}</code> },
            ]} />
        </Card>
      )}
    </div>
  );
}

export function ResultsManagementPage() {
  return (
    <ElectionScoped title="Results management" subtitle="Generate results from validated ballots, verify them, then publish." preferRelevant>
      {(props) => <ResultsManagementBody {...props} />}
    </ElectionScoped>
  );
}

export function ActivityPage() {
  const { can } = useAuth();
  return (
    <ElectionScoped title="Activity timeline" subtitle="Lifecycle history and the hash-chained audit trail of one election.">
      {({ election }) => <TimelineTab election={election} canAudit={can('VIEW_AUDIT_LOGS')} />}
    </ElectionScoped>
  );
}

export function VoterManagementPage() {
  const [tick, setTick] = useState(0);
  return (
    <ElectionScoped title="Voter management" subtitle="Upload and validate the eligible voter list. Individual selections are never visible here.">
      {({ election, operator, reload }) => (
        <div className="space-y-6">
          <VoterImport election={election} operator={operator} onChange={() => { reload(); setTick((t) => t + 1); }} />
          <VotersTab key={tick} election={election} operator={operator} onChange={reload} />
          <p className="text-xs text-slate-500">
            Need a different election? <Link to="/app/elections" className="font-medium text-navy-700">Browse all elections</Link>.{' '}
            <Button size="sm" variant="ghost" onClick={reload}>Refresh counts</Button>
          </p>
        </div>
      )}
    </ElectionScoped>
  );
}
