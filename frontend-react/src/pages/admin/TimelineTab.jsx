import { Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { Card, Hash, Loading, StatusBadge, Table } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

export default function TimelineTab({ election, canAudit }) {
  const timeline = useApi(() => Elections.timeline(election.id), [election.id]);
  const trail = useApi(() => (canAudit ? Elections.auditTrail(election.id) : Promise.resolve([])), [election.id, canAudit]);
  return (
    <div className="space-y-6">
      <Card title="Election timeline">
        {timeline.loading && <Loading />}
        <ol className="relative space-y-4 border-l border-slate-200 pl-6">
          {(timeline.data ?? []).map((t, i) => (
            <li key={i}>
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-brand" />
              <p className="text-sm font-medium text-navy-900"><StatusBadge status={t.to} /> {t.from ? `from ${t.from}` : 'created'}</p>
              <p className="text-xs text-slate-500">{formatDateTime(t.occurredAt)} · {t.actorName ?? 'system'}{t.note ? ` · ${t.note}` : ''}</p>
            </li>
          ))}
        </ol>
      </Card>
      {canAudit && (
        <Card title="Audit trail for this election" padded={false}>
          {trail.loading && <Loading />}
          <Table
            rowKey={(r) => r.seq}
            rows={trail.data ?? []}
            columns={[
              { key: 'seq', label: 'Seq' },
              { key: 'occurredAt', label: 'Time', render: (r) => formatDateTime(r.occurredAt) },
              { key: 'eventType', label: 'Event', render: (r) => <span className="font-medium">{r.eventType}</span> },
              { key: 'actorRef', label: 'Actor', render: (r) => r.actorRef ?? 'anonymous' },
              { key: 'metadataJson', label: 'Details', render: (r) => <code className="break-all text-xs text-slate-600">{r.metadataJson}</code> },
              { key: 'recordHash', label: 'Hash', render: (r) => <Hash value={r.recordHash} len={10} /> },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
