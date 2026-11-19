import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Elections } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, Textarea } from '../../components/ui.jsx';
import { STATUS_ORDER, formatDateTime } from '../../lib/format.js';

export default function ElectionsList() {
  const { active, can } = useAuth();
  const orgId = active.organizationId;
  const navigate = useNavigate();
  const list = useApi(() => Elections.list(orgId, 0, 100), [orgId]);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const create = useAction();

  const rows = (list.data?.content ?? []).filter((e) => !filter || e.status === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Elections"
        subtitle={can('MANAGE_ELECTION') ? 'Create, configure and run elections through their lifecycle.' : 'Inspect elections (read-only).'}
        actions={can('CREATE_ELECTION') && <Button onClick={() => setOpen(true)}>New election</Button>}
      />
      <Card padded={false} title="All elections" actions={
        <Select aria-label="Filter by status" className="w-44" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_ORDER.map((s) => <option key={s}>{s}</option>)}
        </Select>
      }>
        {list.loading && <Loading />}
        {list.error && <div className="p-5"><ErrorState message={list.error} onRetry={list.reload} /></div>}
        {list.data && rows.length === 0 && (
          <div className="p-5"><EmptyState title="No elections" action={can('CREATE_ELECTION') && <Button onClick={() => setOpen(true)}>Create the first election</Button>} /></div>
        )}
        {rows.length > 0 && (
          <Table
            rowKey={(e) => e.id}
            rows={rows}
            columns={[
              { key: 'title', label: 'Election', render: (e) => <Link className="font-medium text-navy-900 hover:underline" to={`/app/elections/${e.id}`}>{e.title}</Link> },
              { key: 'status', label: 'Status', render: (e) => <StatusBadge status={e.status} /> },
              { key: 'activeCandidates', label: 'Candidates' },
              { key: 'eligibleVoters', label: 'Voters' },
              { key: 'votingStart', label: 'Voting window', render: (e) => e.rules.votingStart ? `${formatDateTime(e.rules.votingStart)} – ${formatDateTime(e.rules.votingEnd)}` : 'Not scheduled' },
              { key: 'me', label: 'Your role', render: (e) => (e.me.operator ? 'Operator' : 'Viewer') },
            ]}
          />
        )}
      </Card>
      <Modal open={open} title="Create an election" onClose={() => setOpen(false)}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const created = await create.run(() => Elections.create(orgId, form));
          if (created) navigate(`/app/elections/${created.id}?tab=rules`);
        }}>
          {create.error && <Alert kind="error">{create.error}</Alert>}
          <Field label="Title" htmlFor="etitle"><Input id="etitle" required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description" htmlFor="edesc"><Textarea id="edesc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <p className="text-xs text-slate-500">The election starts as a draft. You will configure its rules next.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" busy={create.busy}>Create draft</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
