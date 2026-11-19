import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Elections } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import DataTable from '../../components/DataTable.jsx';
import { Alert, Button, Card, ConfirmDialog, PageHeader, StatusBadge } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { COMPLETED_STATUSES } from '../../lib/elections.js';

export default function ElectionArchive() {
  const { active, can } = useAuth();
  const orgId = active.organizationId;
  const list = useApi(() => Elections.list(orgId, 0, 100), [orgId]);
  const [toArchive, setToArchive] = useState(null);
  const action = useAction();
  const rows = (list.data?.content ?? []).filter((e) => COMPLETED_STATUSES.includes(e.status));

  return (
    <div className="space-y-6">
      <PageHeader title="Election archive" subtitle="Completed elections. Archived elections are permanently read-only." />
      {action.error && <Alert kind="error">{action.error}</Alert>}
      {action.success && <Alert kind="success" onClose={action.clear}>{action.success}</Alert>}
      <Card padded={false}>
        <DataTable
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rows={rows}
          rowKey={(e) => e.id}
          searchLabel="Search archive"
          searchText={(e) => e.title}
          exportName="election-archive"
          empty="No completed elections yet. Elections appear here once their results are published."
          filters={[{ key: 'status', label: 'State', options: [{ value: 'PUBLISHED', label: 'Published (not archived)' }, { value: 'ARCHIVED', label: 'Archived' }], match: (e, v) => e.status === v }]}
          initialSort={{ key: 'updatedAt', dir: 'desc' }}
          columns={[
            { key: 'title', label: 'Election', sortValue: (e) => e.title, exportValue: (e) => e.title, render: (e) => <Link className="font-medium text-navy-900 hover:underline" to={`/app/elections/${e.id}?tab=results`}>{e.title}</Link> },
            { key: 'status', label: 'State', exportValue: (e) => e.status, render: (e) => <StatusBadge status={e.status} /> },
            { key: 'eligibleVoters', label: 'Eligible voters', sortable: true, exportValue: (e) => e.eligibleVoters },
            { key: 'activeCandidates', label: 'Candidates', sortable: true, exportValue: (e) => e.activeCandidates },
            { key: 'votingEnd', label: 'Voting ended', sortValue: (e) => e.rules.votingEnd, exportValue: (e) => e.rules.votingEnd ?? '', render: (e) => formatDateTime(e.rules.votingEnd) },
            { key: 'updatedAt', label: 'Last change', sortValue: (e) => e.updatedAt, exportValue: (e) => e.updatedAt, render: (e) => formatDateTime(e.archivedAt ?? e.updatedAt) },
            {
              key: 'actions', label: '', render: (e) => (
                <div className="flex gap-1">
                  <Link to={`/app/elections/${e.id}?tab=timeline`} className="rounded-md px-2 py-1 text-sm font-medium text-navy-700 hover:bg-panel-2">Timeline</Link>
                  {e.status === 'PUBLISHED' && can('ARCHIVE_ELECTION') && <Button size="sm" variant="ghost" onClick={() => { action.clear(); setToArchive(e); }}>Archive</Button>}
                </div>
              ),
            },
          ]}
        />
      </Card>
      <ConfirmDialog open={Boolean(toArchive)} title={`Archive "${toArchive?.title}"?`} danger confirmLabel="Archive election" busy={action.busy}
        onCancel={() => setToArchive(null)}
        onConfirm={async () => {
          const r = await action.run(() => Elections.transition(toArchive.id, 'ARCHIVED'), 'Election archived');
          setToArchive(null);
          if (r) list.reload();
        }}>
        Archived elections become permanently read-only. This is recorded on the audit chain.
      </ConfirmDialog>
    </div>
  );
}
