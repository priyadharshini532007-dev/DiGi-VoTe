import { Alert, Button, Card, Hash, Table } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

export default function BulletinTable({ data, page, onPage }) {
  const { entries, chain } = data;
  return (
    <div className="space-y-4">
      <Alert kind={chain.valid ? 'success' : 'error'} title={chain.valid ? 'Hash chain verified' : 'Hash chain FAILED verification'}>
        {chain.entries} entr{chain.entries === 1 ? 'y' : 'ies'} · head <span className="mono">{chain.headHash.slice(0, 24)}…</span>
        {!chain.valid && <ul className="mt-2 list-disc pl-5">{chain.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      </Alert>
      <Card padded={false}>
        <Table
          rowKey={(r) => r.seq}
          rows={entries.content}
          empty="No ballots have been accepted yet."
          columns={[
            { key: 'seq', label: '#' },
            { key: 'ballotCommitment', label: 'Ballot commitment', render: (r) => <Hash value={r.ballotCommitment} len={20} /> },
            { key: 'prevHash', label: 'Previous hash', render: (r) => <Hash value={r.prevHash} len={12} /> },
            { key: 'entryHash', label: 'Entry hash', render: (r) => <Hash value={r.entryHash} len={12} /> },
            { key: 'postedAtMinute', label: 'Posted (minute)', render: (r) => formatDateTime(r.postedAtMinute) },
          ]}
        />
      </Card>
      {entries.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button>
          <span>Page {page + 1} of {entries.totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page + 1 >= entries.totalPages} onClick={() => onPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
