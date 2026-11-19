import { Link } from 'react-router-dom';
import { Public } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { EmptyState, ErrorState, Loading, PageHeader, StatusBadge, Table } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

export default function PublicElections() {
  const { data, loading, error, reload } = useApi(() => Public.elections());
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title="Public elections" subtitle="Elections whose organizations publish results openly. Each has a public bulletin board." />
      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState title="No public elections yet">Elections appear here once voting opens.</EmptyState>}
      {data && data.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-panel shadow-sm">
          <Table
            rowKey={(r) => r.id}
            rows={data}
            columns={[
              { key: 'title', label: 'Election', render: (r) => <span className="font-medium text-navy-900">{r.title}</span> },
              { key: 'organizationName', label: 'Organization' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'votingEnd', label: 'Voting closes', render: (r) => formatDateTime(r.votingEnd) },
              {
                key: 'links', label: '', render: (r) => (
                  <div className="flex gap-3 text-sm font-medium">
                    <Link className="text-navy-700 hover:underline" to={`/elections/${r.id}/bulletin`}>Bulletin board</Link>
                    {r.resultsPublished && <Link className="text-navy-700 hover:underline" to={`/elections/${r.id}/results`}>Results</Link>}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
