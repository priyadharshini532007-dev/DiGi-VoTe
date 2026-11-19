import { Elections } from '../../api/endpoints.js';
import { errorCode } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import ElectionScoped from '../../components/ElectionScoped.jsx';
import { Button, EmptyState, ErrorState, Loading } from '../../components/ui.jsx';
import ResultsPanel from '../public/ResultsPanel.jsx';
import { printPage } from '../../lib/download.js';

function Body({ election }) {
  const results = useApi(() => Elections.results(election.id).catch((e) => {
    if (errorCode(e) === 'NOT_FOUND') return null;
    throw e;
  }), [election.id]);
  if (results.loading) return <Loading />;
  if (results.error) return <ErrorState message={results.error} onRetry={results.reload} />;
  if (!results.data) return <EmptyState title="Results are not available">Results appear here only after the election's administrators publish them.</EmptyState>;
  return (
    <div className="space-y-4">
      <div className="no-print flex justify-end"><Button variant="secondary" size="sm" onClick={printPage}>Print or save as PDF</Button></div>
      <ResultsPanel result={results.data} />
    </div>
  );
}

export default function PublishedResults() {
  return (
    <ElectionScoped
      title="Published results"
      subtitle="Official results of completed elections in your organization."
      filter={(e) => ['PUBLISHED', 'ARCHIVED'].includes(e.status)}
      emptyText="No election in your organization has published results yet."
      operatorNote={false}
    >
      {({ election }) => <Body election={election} />}
    </ElectionScoped>
  );
}
