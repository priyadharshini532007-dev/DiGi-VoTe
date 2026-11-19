import { Card, DefinitionList, Hash, StatusBadge, Table } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

function Participation({ p }) {
  return (
    <DefinitionList items={[
      ['Eligible voters', p.eligible_voters],
      ['Credentials issued', p.credentials_issued],
      ['Accepted ballots', p.accepted_ballots],
      ['Turnout', `${p.turnout_percent}%`],
    ]} />
  );
}

function Checks({ checks }) {
  return (
    <Table
      rowKey={(c) => c.key}
      rows={checks}
      columns={[
        { key: 'label', label: 'Check' },
        { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status ?? (c.passed ? 'PASS' : 'FAIL')} /> },
        { key: 'detail', label: 'Detail', className: 'text-slate-600' },
      ]}
    />
  );
}

function Counts({ map }) {
  const rows = Object.entries(map ?? {}).map(([k, v]) => ({ k, v }));
  return <Table rowKey={(r) => r.k} rows={rows} empty="No events recorded." columns={[{ key: 'k', label: 'Type' }, { key: 'v', label: 'Count' }]} />;
}

/** Readable rendering of a stored report snapshot; falls back to JSON for anything unexpected. */
export default function ReportView({ report }) {
  const c = report.content;
  return (
    <Card title={`${report.type} report`} actions={<span className="text-xs text-slate-500">#{report.id}</span>}>
      <DefinitionList items={[
        ['Generated', formatDateTime(report.generatedAt)],
        ['Content hash (SHA-256)', <Hash value={report.contentHash} len={28} />],
        c.electionTitle && ['Election', `${c.electionTitle} (${c.electionStatus})`],
      ]} />
      <div className="mt-5 space-y-5">
        {c.participation && <section><h3 className="mb-2 font-semibold text-navy-900">Participation</h3><Participation p={c.participation} /></section>}
        {c.candidates && (
          <section>
            <h3 className="mb-2 font-semibold text-navy-900">Candidates</h3>
            <Table rowKey={(r) => r.ballotPosition} rows={c.candidates}
              columns={[{ key: 'ballotPosition', label: '#' }, { key: 'name', label: 'Name' }, { key: 'status', label: 'Status' }]} />
          </section>
        )}
        {c.results && (
          <section>
            <h3 className="mb-2 font-semibold text-navy-900">Final results</h3>
            <p className="mb-2 text-sm">{c.results.explanation}</p>
            <Table rowKey={(r) => r.optionIndex} rows={c.results.items}
              columns={[{ key: 'rank', label: 'Rank' }, { key: 'label', label: 'Option' }, { key: 'votes', label: 'Votes' }, { key: 'percent', label: '%' }]} />
          </section>
        )}
        {c.lifecycle && (
          <section>
            <h3 className="mb-2 font-semibold text-navy-900">Lifecycle</h3>
            <Table rowKey={(r) => r.occurredAt + r.to} rows={c.lifecycle}
              columns={[{ key: 'to', label: 'State' }, { key: 'occurredAt', label: 'When', render: (r) => formatDateTime(r.occurredAt) }, { key: 'actorName', label: 'By' }]} />
          </section>
        )}
        {c.auditChain && (
          <section>
            <h3 className="mb-2 font-semibold text-navy-900">Hash-chain verification</h3>
            <p className="text-sm">{c.auditChain.valid ? 'Intact' : 'Integrity violations found'} · {c.auditChain.recordsChecked} records</p>
            {c.auditChain.problems?.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-red-700">{c.auditChain.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </section>
        )}
        {c.trust && <section><h3 className="mb-2 font-semibold text-navy-900">Trust checks ({c.trust.overall})</h3><Checks checks={c.trust.checks} /></section>}
        {c.readiness && <section><h3 className="mb-2 font-semibold text-navy-900">Readiness ({c.readiness.score}%)</h3><Checks checks={c.readiness.checks} /></section>}
        {c.eventsByType && <section><h3 className="mb-2 font-semibold text-navy-900">Audit events by type</h3><Counts map={c.eventsByType} /></section>}
        {c.electionEvents && <section><h3 className="mb-2 font-semibold text-navy-900">Election events</h3><Counts map={c.electionEvents} /></section>}
        {c.securityEventsByType && <section><h3 className="mb-2 font-semibold text-navy-900">Security events by type</h3><Counts map={c.securityEventsByType} /></section>}
        {'authenticationFailures' in c && (
          <DefinitionList items={[
            ['Authentication failures', c.authenticationFailures],
            ['Authorization failures', c.authorizationFailures],
            ['Account lockouts', c.accountLockouts],
            ['Cross-organization attempts', c.crossOrganizationAttempts],
            ['Suspicious ballot activity', c.suspiciousBallotActivity],
            ['Rejected uploads', c.rejectedUploads],
          ]} />
        )}
      </div>
    </Card>
  );
}
