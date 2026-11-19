import { useState } from 'react';
import { Elections, Reports as ReportsApi } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Button, Card, ErrorState, Field, Hash, Loading, PageHeader, Select, Table } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import ReportView from './ReportView.jsx';

const ELECTION_TYPES = ['ELECTION', 'PARTICIPATION', 'HEALTH', 'AUDIT', 'SECURITY'];

export default function Reports() {
  const { active, can } = useAuth();
  const orgId = active.organizationId;
  const list = useApi(() => ReportsApi.list(orgId), [orgId]);
  const elections = useApi(() => Elections.list(orgId), [orgId]);
  const [electionId, setElectionId] = useState('');
  const [type, setType] = useState('AUDIT');
  const [current, setCurrent] = useState(null);
  const action = useAction();

  const generate = async (scope) => {
    const r = await action.run(() => (scope === 'org'
      ? ReportsApi.forOrganization(orgId, type)
      : ReportsApi.forElection(electionId, type)), 'Report generated');
    if (r) { setCurrent(r); list.reload(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Snapshots generated from live election data and stored with a SHA-256 content hash." />
      {can('GENERATE_REPORTS') && (
        <Card title="Generate a report">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Election" htmlFor="rep-election">
              <Select id="rep-election" value={electionId} onChange={(e) => {
                setElectionId(e.target.value);
                if (!e.target.value && !['AUDIT', 'SECURITY'].includes(type)) setType('AUDIT');
              }}>
                <option value="">Organization-wide</option>
                {elections.data?.content.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </Select>
            </Field>
            <Field label="Report type" htmlFor="rep-type">
              <Select id="rep-type" value={type} onChange={(e) => setType(e.target.value)}>
                {(electionId ? ELECTION_TYPES : ['AUDIT', 'SECURITY']).map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button busy={action.busy} onClick={() => generate(electionId ? 'election' : 'org')}
                disabled={!electionId && !['AUDIT', 'SECURITY'].includes(type)}>
                Generate
              </Button>
            </div>
          </div>
          {action.error && <div className="mt-4"><Alert kind="error">{action.error}</Alert></div>}
        </Card>
      )}
      {current && <ReportView report={current} />}
      <Card title="Report history" padded={false}>
        {list.loading && <Loading />}
        {list.error && <div className="p-5"><ErrorState message={list.error} onRetry={list.reload} /></div>}
        {list.data && (
          <Table
            rowKey={(r) => r.id}
            rows={list.data.content}
            empty="No reports generated yet."
            columns={[
              { key: 'id', label: '#' },
              { key: 'type', label: 'Type' },
              { key: 'electionId', label: 'Election', render: (r) => r.electionId ?? 'Organization' },
              { key: 'generatedAt', label: 'Generated', render: (r) => formatDateTime(r.generatedAt) },
              { key: 'contentHash', label: 'Hash', render: (r) => <Hash value={r.contentHash} len={12} /> },
              { key: 'open', label: '', render: (r) => <Button size="sm" variant="ghost" onClick={async () => setCurrent(await ReportsApi.get(r.id))}>Open</Button> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
