import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Public } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import BulletinTable from '../shared/BulletinTable.jsx';
import { ErrorState, Loading, PageHeader } from '../../components/ui.jsx';

export default function BulletinBoard() {
  const { electionId } = useParams();
  const [page, setPage] = useState(0);
  const { data, loading, error, reload } = useApi(() => Public.bulletin(electionId, page), [electionId, page]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader
        title={data ? `Bulletin board · ${data.electionTitle}` : 'Bulletin board'}
        subtitle="Each accepted ballot appears as a commitment to its encrypted contents, linked into a hash chain. No identities, no choices."
      />
      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && <BulletinTable data={data} page={page} onPage={setPage} />}
    </div>
  );
}
