import { useMemo, useState } from 'react';
import { Candidates } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useFanOut } from '../../hooks/useFanOut.js';
import { useElectionChoice } from '../../components/ElectionScoped.jsx';
import DataTable from '../../components/DataTable.jsx';
import AuthImage from '../../components/AuthImage.jsx';
import { Alert, Badge, Button, Card, EmptyState, Field, Loading, Modal, PageHeader, StatusBadge, Tabs, Textarea } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { applicationCompleteness } from '../../lib/elections.js';

const TABS = [
  { key: 'SUBMITTED', label: 'Pending' },
  { key: 'CORRECTION_REQUESTED', label: 'Correction requested' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'WITHDRAWN', label: 'Withdrawn' },
];
const REVIEWABLE = ['REGISTRATION', 'CAMPAIGN'];

function ApplicationDetail({ app }) {
  const candidate = useApi(() => (app.candidateId ? Candidates.get(app.candidateId) : Promise.resolve(null)), [app.candidateId]);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex gap-4">
        {candidate.data?.photoUrl
          ? <AuthImage src={candidate.data.photoUrl} alt={`Photograph of ${app.displayName}`} className="h-20 w-20 rounded-md object-cover" />
          : <div className="grid h-20 w-20 place-items-center rounded-md bg-accent-soft text-2xl font-semibold text-navy-800">{app.displayName[0]}</div>}
        <div>
          <p className="text-base font-semibold text-navy-900">{app.displayName}</p>
          <p className="text-slate-600">{app.applicantName} · {app.applicantEmail}</p>
          <p className="text-xs text-slate-500">Submitted {formatDateTime(app.submittedAt)} · <StatusBadge status={app.status} /></p>
        </div>
      </div>
      <p><strong>Statement:</strong> {app.statement}</p>
      <p><strong>Qualifications:</strong> {app.qualifications || '—'}</p>
      <p><strong>Achievements:</strong> {app.achievements || '—'}</p>
      {app.reviewerNote && <p><strong>Reviewer note:</strong> {app.reviewerNote}</p>}
      {candidate.loading && <Loading />}
      {candidate.data && (
        <div>
          <p className="font-semibold text-navy-900">Manifesto</p>
          {candidate.data.manifesto
            ? <p className="text-slate-600">Status: {candidate.data.manifesto.status}{candidate.data.manifesto.frozen ? ' (frozen)' : ''}</p>
            : <p className="text-slate-500">No manifesto yet.</p>}
          <p className="mt-2 font-semibold text-navy-900">Submitted documents</p>
          {candidate.data.media.length === 0
            ? <p className="text-slate-500">No files uploaded.</p>
            : <ul className="list-disc pl-5 text-slate-600">{candidate.data.media.map((m) => <li key={m.id}>{m.mediaType.replace('_', ' ').toLowerCase()}: {m.originalFilename}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

const reviewable = (e) => e.me.operator && e.status !== 'DRAFT';

export default function CandidateApprovals() {
  const { list, choices, selected, select } = useElectionChoice(reviewable);
  const apps = useFanOut(choices.map((e) => e.id), (id) => Candidates.applications(id));
  const [tab, setTab] = useState('SUBMITTED');
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(null);
  const action = useAction();

  const rows = useMemo(() => {
    if (!selected) return [];
    return (apps.data[selected.id] ?? []).map((a) => ({ ...a, election: selected, completeness: applicationCompleteness(a) }));
  }, [selected, apps.data]);
  const counts = Object.fromEntries(TABS.map((t) => [t.key, rows.filter((r) => r.status === t.key).length]));
  const scoped = rows.filter((r) => r.status === tab);
  const operated = choices;

  const decide = async (decision) => {
    if ((decision === 'REJECT' || decision === 'REQUEST_CORRECTION') && !note.trim()) {
      setNoteError('Add a note for the applicant before rejecting or requesting corrections.');
      return;
    }
    setNoteError(null);
    const label = { APPROVE: 'approved', REJECT: 'rejected', REQUEST_CORRECTION: 'sent back for correction' }[decision];
    if (await action.run(() => Candidates.review(open.id, decision, note.trim() || undefined), `Application ${label}`)) {
      setOpen(null);
      setNote('');
      apps.reload();
    }
  };

  const canReview = open && REVIEWABLE.includes(open.election.status) && open.election.me.operator && open.status === 'SUBMITTED';

  return (
    <div className="space-y-6">
      <PageHeader title="Candidate approvals" subtitle="Review applications across the elections you operate. Every decision is recorded on the audit chain." />
      {action.success && <Alert kind="success" onClose={action.clear}>{action.success}</Alert>}

      {!list.loading && operated.length === 0 && (
        <EmptyState title="No applications yet">Applications appear after an election you operate is published.</EmptyState>
      )}

      {operated.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Election" htmlFor="appr-election">
              <select id="appr-election" className="block min-w-[16rem] rounded-md border border-slate-300 bg-panel px-3 py-2 text-sm"
                value={selected?.id ?? ''} onChange={(e) => select(e.target.value)}>
                {choices.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.status}</option>)}
              </select>
            </Field>
            {apps.failed > 0 && <span className="text-sm text-amber-800">Some elections could not be loaded.</span>}
          </div>
          <Tabs active={tab} onChange={setTab} tabs={TABS.map((t) => ({ key: t.key, label: `${t.label} (${counts[t.key] ?? 0})` }))} />
          <Card padded={false}>
            <DataTable
              loading={apps.loading}
              rows={scoped}
              rowKey={(a) => a.id}
              searchLabel="Search candidates"
              searchText={(a) => `${a.displayName} ${a.applicantName} ${a.applicantEmail}`}
              exportName={`applications-${tab.toLowerCase()}`}
              empty="Nothing in this tab for the selected election."
              columns={[
                { key: 'displayName', label: 'Candidate', sortValue: (a) => a.displayName, exportValue: (a) => a.displayName, render: (a) => <div><p className="font-medium text-navy-900">{a.displayName}</p><p className="text-xs text-slate-500">{a.applicantName} · {a.applicantEmail}</p></div> },
                { key: 'election', label: 'Election', exportValue: (a) => a.election.title, render: (a) => a.election.title },
                { key: 'submittedAt', label: 'Applied', sortValue: (a) => a.submittedAt, exportValue: (a) => a.submittedAt, render: (a) => formatDateTime(a.submittedAt) },
                { key: 'completeness', label: 'Profile completeness', sortValue: (a) => a.completeness.percent, exportValue: (a) => `${a.completeness.percent}%`, render: (a) => <Badge tone={a.completeness.percent === 100 ? 'green' : 'amber'}>{a.completeness.percent}%</Badge> },
                { key: 'status', label: 'Status', exportValue: (a) => a.status, render: (a) => <StatusBadge status={a.status} /> },
                { key: 'review', label: '', render: (a) => <Button size="sm" variant={a.status === 'SUBMITTED' ? 'primary' : 'ghost'} onClick={() => { action.clear(); setNoteError(null); setNote(''); setOpen(a); }}>{a.status === 'SUBMITTED' ? 'Review' : 'View'}</Button> },
              ]}
            />
          </Card>
        </>
      )}

      <Modal open={Boolean(open)} title={open ? `Application: ${open.displayName}` : ''} onClose={() => setOpen(null)}
        footer={canReview ? (
          <>
            <Button variant="secondary" busy={action.busy} onClick={() => decide('REQUEST_CORRECTION')}>Request corrections</Button>
            <Button variant="danger" busy={action.busy} onClick={() => decide('REJECT')}>Reject</Button>
            <Button busy={action.busy} onClick={() => decide('APPROVE')}>Approve</Button>
          </>
        ) : <Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>}>
        {open && (
          <div className="space-y-4">
            {(action.error || noteError) && <Alert kind="error">{noteError ?? action.error}</Alert>}
            <ApplicationDetail app={open} />
            {canReview && (
              <Field label="Note to the applicant (required to reject or request corrections)" htmlFor="appr-note">
                <Textarea id="appr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            )}
            {!canReview && open.status === 'SUBMITTED' && <Alert kind="info">Applications can only be reviewed during the Registration and Campaign stages.</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}
