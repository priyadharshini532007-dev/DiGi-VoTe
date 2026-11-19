import { useEffect, useState } from 'react';
import { Audit, Orgs } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import DataTable from '../../components/DataTable.jsx';
import { Alert, Button, Card, DefinitionList, ErrorState, Field, Input, Loading, PageHeader, StatCard, StatusBadge } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { describeAuditEvent } from '../../lib/activity.js';
import { ChainResult } from '../shared/AuditLog.jsx';

export default function SecurityCenter() {
  const { active, can } = useAuth();
  const orgId = active.organizationId;
  const org = useApi(() => Orgs.get(orgId), [orgId]);
  const events = useApi(() => Audit.securityEvents(orgId, 0), [orgId]);
  const history = useApi(() => (can('VIEW_AUDIT_LOGS') ? Audit.logs(orgId, 0, 'ORG_SECURITY') : Promise.resolve(null)), [orgId]);
  const [policy, setPolicy] = useState({ passwordMinLength: 12, maxFailedLogins: 5 });
  const [chain, setChain] = useState(null);
  const save = useAction();
  const verify = useAction();
  const editable = can('CONFIGURE_SECURITY_POLICY');

  useEffect(() => {
    if (org.data) setPolicy({ passwordMinLength: org.data.passwordMinLength, maxFailedLogins: org.data.maxFailedLogins });
  }, [org.data]);

  const rows = events.data?.content ?? [];
  const high = rows.filter((e) => e.severity === 'HIGH').length;
  const failedLogins = rows.filter((e) => /LOGIN|AUTH/.test(e.eventType)).length;

  const submit = async (e) => {
    e.preventDefault();
    const body = { passwordMinLength: Number(policy.passwordMinLength), maxFailedLogins: Number(policy.maxFailedLogins) };
    if (await save.run(() => Orgs.securityPolicy(orgId, body), 'Security policy saved')) {
      org.reload();
      history.reload();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Security center" subtitle="Authentication policy, security events and integrity verification for your organization." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon="lock" label="Security events (latest 50)" value={events.loading ? '…' : rows.length} hint="Failed sign-ins, lockouts, denied actions" />
        <StatCard icon="warning" label="High severity" value={events.loading ? '…' : high} tone={high ? 'red' : undefined} hint="Review first" />
        <StatCard icon="person" label="Authentication events" value={events.loading ? '…' : failedLogins} hint="Among the latest 50" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Security policy summary">
          {org.loading && <Loading />}
          {org.error && <ErrorState message={org.error} onRetry={org.reload} />}
          {org.data && (
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Minimum password length" htmlFor="pwlen" hint="8 to 128 characters">
                  <Input id="pwlen" type="number" min={8} max={128} disabled={!editable} value={policy.passwordMinLength}
                    onChange={(e) => setPolicy({ ...policy, passwordMinLength: e.target.value })} />
                </Field>
                <Field label="Failed sign-ins before lockout" htmlFor="maxfail" hint="3 to 20 attempts">
                  <Input id="maxfail" type="number" min={3} max={20} disabled={!editable} value={policy.maxFailedLogins}
                    onChange={(e) => setPolicy({ ...policy, maxFailedLogins: e.target.value })} />
                </Field>
              </div>
              {save.error && <Alert kind="error">{save.error}</Alert>}
              {save.success && <Alert kind="success">{save.success}</Alert>}
              {editable
                ? <Button type="submit" busy={save.busy}>Save policy</Button>
                : <p className="text-sm text-slate-500">Only the Organization Owner can change the policy.</p>}
            </form>
          )}
        </Card>

        <Card title="Integrity verification" actions={can('VERIFY_INTEGRITY') && (
          <Button busy={verify.busy} onClick={async () => setChain(await verify.run(() => Audit.verify(orgId)))}>Verify audit chain</Button>
        )}>
          {verify.error && <Alert kind="error">{verify.error}</Alert>}
          {chain
            ? <ChainResult result={chain} />
            : <p className="text-sm text-slate-600">Recomputes every audit record hash from the first record to confirm none was altered, removed or truncated. Each run is itself audited.</p>}
          <p className="mt-4 text-xs text-slate-500">
            DigiVote offers no control to modify submitted votes, reveal voter identities, delete audit records or alter published results.
          </p>
        </Card>
      </div>

      <Card title="Security events" padded={false}>
        <DataTable
          loading={events.loading}
          error={events.error}
          onRetry={events.reload}
          rows={rows}
          rowKey={(e) => e.id}
          searchLabel="Search security events"
          searchText={(e) => `${e.eventType} ${e.detail ?? ''}`}
          exportName="security-events"
          initialSort={{ key: 'occurredAt', dir: 'desc' }}
          empty="No security events recorded."
          filters={[{ key: 'severity', label: 'Severity', options: ['HIGH', 'MEDIUM', 'LOW'].map((s) => ({ value: s, label: s })), match: (e, v) => e.severity === v }]}
          columns={[
            { key: 'occurredAt', label: 'Time', sortValue: (e) => e.occurredAt, exportValue: (e) => e.occurredAt, render: (e) => formatDateTime(e.occurredAt) },
            { key: 'severity', label: 'Severity', sortValue: (e) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[e.severity]), exportValue: (e) => e.severity, render: (e) => <StatusBadge status={e.severity} /> },
            { key: 'eventType', label: 'Event', sortValue: (e) => e.eventType, exportValue: (e) => e.eventType, render: (e) => <span className="font-medium">{e.eventType.replaceAll('_', ' ')}</span> },
            { key: 'detail', label: 'Detail', exportValue: (e) => e.detail, className: 'text-slate-600' },
            { key: 'principalRef', label: 'Principal', exportValue: (e) => e.principalRef ?? '', render: (e) => <span className="mono text-xs">{e.principalRef ?? '—'}</span> },
          ]}
        />
      </Card>

      {can('VIEW_AUDIT_LOGS') && (
        <Card title="Security configuration history" padded={false}>
          {history.loading && <Loading />}
          {history.data && (
            <DataTable
              rows={history.data.content}
              rowKey={(l) => l.seq}
              empty="The security policy has not been changed since the organization was created."
              columns={[
                { key: 'occurredAt', label: 'When', render: (l) => formatDateTime(l.occurredAt) },
                { key: 'eventType', label: 'Change', render: (l) => describeAuditEvent(l.eventType).label },
                { key: 'actorRef', label: 'By', render: (l) => l.actorRef ?? 'system' },
                { key: 'metadataJson', label: 'Details', render: (l) => <code className="break-all text-xs text-slate-600">{l.metadataJson}</code> },
              ]}
            />
          )}
        </Card>
      )}

      {org.data && (
        <Card title="Current configuration">
          <DefinitionList items={[
            ['Organization', org.data.name],
            ['Status', org.data.status],
            ['Minimum password length', org.data.passwordMinLength],
            ['Lockout threshold', `${org.data.maxFailedLogins} failed sign-ins`],
            ['Created', formatDateTime(org.data.createdAt)],
          ]} />
        </Card>
      )}
    </div>
  );
}
