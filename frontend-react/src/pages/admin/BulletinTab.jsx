import { useState } from 'react';
import { Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { ErrorState, Loading } from '../../components/ui.jsx';
import BulletinTable from '../shared/BulletinTable.jsx';

export default function BulletinTab({ election }) {
  const [page, setPage] = useState(0);
  const b = useApi(() => Elections.bulletin(election.id, page), [election.id, page]);
  if (b.loading && !b.data) return <Loading />;
  if (b.error) return <ErrorState message={b.error} onRetry={b.reload} />;
  return <BulletinTable data={b.data} page={page} onPage={setPage} />;
}
