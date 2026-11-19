import { useState } from 'react';
import { Candidates } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Card, ErrorState, Field, Loading, Modal, StatusBadge, Table, Textarea } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

const REVIEWABLE = ['REGISTRATION', 'CAMPAIGN'];

export default function CandidatesTab({ election, operator }) {
  const apps = useApi(() => Candidates.applications(election.id), [election.id]);
  const candidates = useApi(() => Candidates.forElection(election.id), [election.id]);
  const [review, setReview] = useState(null);
  const [note, setNote] = useState('');
  const [detail, setDetail] = useState(null);
  const action = useAction();
  const canReview = operator && REVIEWABLE.includes(election.status);

  const decide = async (decision) => {
    if (await action.run(() => Candidates.review(review.id, decision, note || undefined), `Application ${decision.toLowerCase().replace('_', ' ')}`)) {
      setReview(null);
      setNote('');
      apps.reload();
      candidates.reload();
    }
  };

  return (
    <div className="space-y-6">
      {action.success && <Alert kind="success">{action.success}</Alert>}
      <Card title="Applications" padded={false}>
        {apps.loading && <Loading />}
        {apps.error && <div className="p-5"><ErrorState message={apps.error} onRetry={apps.reload} /></div>}
        {apps.data && (
          <Table
            rowKey={(a) => a.id}
            rows={apps.data}
            empty={election.status === 'DRAFT' ? 'Applications open once the election is published.' : 'No applications yet.'}
            columns={[
              { key: 'displayName', label: 'Candidate', render: (a) => <div><p className="font-medium text-navy-900">{a.displayName}</p><p className="text-xs text-slate-500">{a.applicantName} · {a.applicantEmail}</p></div> },
              { key: 'submittedAt', label: 'Submitted', render: (a) => formatDateTime(a.submittedAt) },
              { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
              { key: 'reviewerNote', label: 'Note', className: 'text-slate-600' },
              {
                key: 'actions', label: '', render: (a) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(a)}>View</Button>
                    {canReview && a.status === 'SUBMITTED' && <Button size="sm" onClick={() => { action.clear(); setReview(a); }}>Review</Button>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card title="Approved candidates" padded={false}>
        {candidates.data && (
          <Table
            rowKey={(c) => c.id}
            rows={candidates.data}
            empty="No approved candidates yet."
            columns={[
              { key: 'ballotPosition', label: 'Ballot #' },
              { key: 'displayName', label: 'Name', render: (c) => <span className="font-medium">{c.displayName}</span> },
              { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
              { key: 'manifesto', label: 'Manifesto', render: (c) => (c.manifesto ? <span className="flex gap-1"><StatusBadge status={c.manifesto.status} />{c.manifesto.frozen && <Badge tone="red">Frozen</Badge>}</span> : '—') },
              { key: 'media', label: 'Media', render: (c) => c.media.length },
            ]}
          />
        )}
      </Card>

      <Modal open={Boolean(review)} title={review ? `Review ${review.displayName}` : ''} onClose={() => setReview(null)}
        footer={<>
          <Button variant="secondary" onClick={() => decide('REQUEST_CORRECTION')} busy={action.busy}>Request correction</Button>
          <Button variant="danger" onClick={() => decide('REJECT')} busy={action.busy}>Reject</Button>
          <Button onClick={() => decide('APPROVE')} busy={action.busy}>Approve</Button>
        </>}>
        {review && (
          <div className="space-y-3">
            {action.error && <Alert kind="error">{action.error}</Alert>}
            <p><strong>Statement:</strong> {review.statement}</p>
            <p><strong>Qualifications:</strong> {review.qualifications || '—'}</p>
            <p><strong>Achievements:</strong> {review.achievements || '—'}</p>
            <Field label="Note to the applicant (required to reject or request corrections)" htmlFor="rnote">
              <Textarea id="rnote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(detail)} title={detail?.displayName ?? ''} onClose={() => setDetail(null)}
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && (
          <div className="space-y-2">
            <p><strong>Applicant:</strong> {detail.applicantName} ({detail.applicantEmail})</p>
            <p><strong>Statement:</strong> {detail.statement}</p>
            <p><strong>Qualifications:</strong> {detail.qualifications || '—'}</p>
            <p><strong>Achievements:</strong> {detail.achievements || '—'}</p>
            <p><strong>Status:</strong> {detail.status}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
