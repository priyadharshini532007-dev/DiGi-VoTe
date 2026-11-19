import { Orgs } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Badge, Card, ErrorState, Loading, PageHeader, StatCard } from '../../components/ui.jsx';
import { ROLE_LABELS } from '../../lib/format.js';
import { PERMISSION_ROWS, ROLE_ORDER, roleHas } from '../../lib/permissions.js';

export default function RolesPermissions() {
  const { active } = useAuth();
  const overview = useApi(() => Orgs.overview(active.organizationId), [active.organizationId]);
  const roles = useApi(() => Orgs.roles(), []);
  const counts = overview.data?.membersByRole ?? {};
  const groups = [...new Set(PERMISSION_ROWS.map((r) => r.group))];

  return (
    <div className="space-y-6">
      <PageHeader title="Roles & permissions" subtitle="Which capabilities each role holds. Assign roles from Member management." />
      <Alert kind="info" title="No role can read or change ballots">
        There is no permission in DigiVote that reveals a ballot selection, links a voter to a ballot, or modifies a submitted vote
        or a published result. The role set below is fixed by the platform; the server rejects anything outside it.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {ROLE_ORDER.map((r) => (
          <StatCard key={r} label={ROLE_LABELS[r]} value={overview.loading ? '…' : counts[r] ?? 0} hint="active members" />
        ))}
      </div>

      <Card title="Permission matrix" padded={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <caption className="sr-only">Permissions held by each role</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Capability</th>
                {ROLE_ORDER.map((r) => (
                  <th key={r} scope="col" className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {ROLE_LABELS[r]}{r === active.role && <span className="ml-1 normal-case text-navy-700">(you)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g} className="divide-y divide-slate-100 bg-panel">
                <tr className="bg-slate-50/70"><th colSpan={ROLE_ORDER.length + 1} scope="colgroup" className="px-4 py-1.5 text-left text-xs font-semibold text-navy-800">{g}</th></tr>
                {PERMISSION_ROWS.filter((r) => r.group === g).map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal text-slate-800">
                      {row.label}
                      {row.note && <span className="block text-xs text-slate-500">{row.note}</span>}
                    </th>
                    {ROLE_ORDER.map((r) => (
                      <td key={r} className="px-3 py-2.5 text-center">
                        {roleHas(r, row.key)
                          ? <><span aria-hidden="true" className="font-semibold text-emerald-700">✓</span><span className="sr-only">Allowed</span></>
                          : <><span aria-hidden="true" className="text-slate-300">—</span><span className="sr-only">Not allowed</span></>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          This table reflects the permission sets in the DigiVote backend. Election administrators can operate only the elections they are
          assigned to; the Organization Owner operates every election of the organization.
        </p>
      </Card>

      <Card title="Assignable roles">
        {roles.loading && <Loading />}
        {roles.error && <ErrorState message={roles.error} onRetry={roles.reload} />}
        <ul className="divide-y divide-slate-100">
          {(roles.data ?? []).map((r) => (
            <li key={r.code} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div>
                <p className="font-medium text-navy-900">{r.name}</p>
                <p className="text-sm text-slate-600">{r.description}</p>
              </div>
              <Badge tone="blue">{r.code}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
