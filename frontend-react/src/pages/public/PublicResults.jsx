import { Link, useParams } from 'react-router-dom';
import { Public } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { ErrorState, Loading, PageHeader } from '../../components/ui.jsx';
import ResultsPanel from './ResultsPanel.jsx';

export default function PublicResults() {
  const { electionId } = useParams();
  const { data, loading, error, reload } = useApi(() => Public.results(electionId), [electionId]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader
        title={data ? data.electionTitle : 'Election results'}
        subtitle="Computed from the encrypted ballots recorded on the public bulletin board."
        actions={<Link className="text-sm font-medium text-navy-700" to={`/elections/${electionId}/bulletin`}>View bulletin board →</Link>}
      />
      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && <ResultsPanel result={data} />}
    </div>
  );
}
