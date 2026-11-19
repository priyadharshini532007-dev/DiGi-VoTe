import { useState } from 'react';
import { Elections } from '../../api/endpoints.js';
import { errorCode } from '../../api/client.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { Alert, Button, Card, ConfirmDialog, EmptyState, Loading } from '../../components/ui.jsx';
import ResultsPanel from '../public/ResultsPanel.jsx';

export default function ResultsTab({ election, operator, canPublish, onChange }) {
  const results = useApi(() => {
    if (!['VERIFICATION', 'PUBLISHED', 'ARCHIVED'].includes(election.status)) return Promise.resolve(null);
    return Elections.results(election.id).catch((e) => {
      if (errorCode(e) === 'NOT_FOUND') return null;
      throw e;
    });
  }, [election.id, election.status]);
  const generate = useAction();
  const publish = useAction();
  const [confirm, setConfirm] = useState(false);
  const canGenerate = operator && election.status === 'VERIFICATION';

  return (
    <div className="space-y-6">
      <Card title="Result processing">
        <p className="text-sm text-slate-600">
          Results are computed by multiplying every ballot's encrypted option values (Paillier homomorphic addition) and
          decrypting only the per-option totals. Generation can be repeated until results are published; each run is audited.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {canGenerate && (
            <Button busy={generate.busy} onClick={async () => {
              const r = await generate.run(() => Elections.generateResults(election.id), 'Results generated');
              if (r) { results.setData(r); if (r.status === 'PUBLISHED') onChange(); }
            }}>
              {results.data ? 'Regenerate results' : 'Generate results'}
            </Button>
          )}
          {canGenerate && canPublish && results.data && results.data.status === 'GENERATED' && (
            <Button variant="secondary" onClick={() => setConfirm(true)}>Publish results</Button>
          )}
        </div>
        {!canGenerate && election.status !== 'PUBLISHED' && election.status !== 'ARCHIVED' && (
          <p className="mt-3 text-sm text-slate-500">Results can be generated once voting is closed (VERIFICATION state).</p>
        )}
        {generate.error && <div className="mt-4"><Alert kind="error">{generate.error}</Alert></div>}
        {publish.error && <div className="mt-4"><Alert kind="error">{publish.error}</Alert></div>}
        {generate.success && <div className="mt-4"><Alert kind="success">{generate.success}</Alert></div>}
      </Card>
      {results.loading && <Loading />}
      {!results.loading && !results.data && <EmptyState title="No results yet" />}
      {results.data && <ResultsPanel result={results.data} />}
      <ConfirmDialog open={confirm} title="Publish results?" confirmLabel="Publish" busy={publish.busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          if (await publish.run(() => Elections.transition(election.id, 'PUBLISHED'))) { onChange(); results.reload(); }
          setConfirm(false);
        }}>
        Published results are final and can never be modified or regenerated.
      </ConfirmDialog>
    </div>
  );
}
