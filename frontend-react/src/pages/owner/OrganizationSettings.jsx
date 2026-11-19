import { useEffect, useState } from 'react';
import { Orgs } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Button, Card, ErrorState, Field, Input, Loading, PageHeader, Textarea } from '../../components/ui.jsx';

export default function OrganizationSettings() {
  const { active, refresh } = useAuth();
  const orgId = active.organizationId;
  const org = useApi(() => Orgs.get(orgId), [orgId]);
  const [profile, setProfile] = useState(null);
  const [policy, setPolicy] = useState(null);
  const saveProfile = useAction();
  const savePolicy = useAction();

  useEffect(() => {
    if (org.data) {
      setProfile({ name: org.data.name, description: org.data.description ?? '', logoUrl: org.data.logoUrl ?? '', primaryColor: org.data.primaryColor });
      setPolicy({ passwordMinLength: org.data.passwordMinLength, maxFailedLogins: org.data.maxFailedLogins });
    }
  }, [org.data]);

  if (org.loading || !profile) return org.error ? <ErrorState message={org.error} onRetry={org.reload} /> : <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Organization" subtitle={`Workspace slug: ${org.data.slug}`} />
      <Card title="Profile and branding">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await saveProfile.run(() => Orgs.update(orgId, profile), 'Organization updated')) await refresh();
        }}>
          <Field label="Name" htmlFor="oname"><Input id="oname" required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
          <Field label="Brand colour" htmlFor="ocolor" hint="Hex colour used on your organization's pages">
            <div className="flex gap-2">
              <input aria-label="Pick colour" type="color" value={profile.primaryColor} onChange={(e) => setProfile({ ...profile, primaryColor: e.target.value })} className="h-9 w-12 rounded border border-slate-300" />
              <Input id="ocolor" value={profile.primaryColor} onChange={(e) => setProfile({ ...profile, primaryColor: e.target.value })} />
            </div>
          </Field>
          <div className="sm:col-span-2"><Field label="Description" htmlFor="odesc"><Textarea id="odesc" rows={3} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Logo URL (https)" htmlFor="ologo"><Input id="ologo" value={profile.logoUrl} placeholder="https://…" onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })} /></Field></div>
          {profile.logoUrl?.startsWith('https://') && <img src={profile.logoUrl} alt="Organization logo preview" className="h-12 w-auto rounded border border-slate-200" />}
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" busy={saveProfile.busy}>Save profile</Button>
            {saveProfile.success && <span className="text-sm text-emerald-700">{saveProfile.success}</span>}
          </div>
          {saveProfile.error && <div className="sm:col-span-2"><Alert kind="error">{saveProfile.error}</Alert></div>}
        </form>
      </Card>
      <Card title="Security policy">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          savePolicy.run(() => Orgs.securityPolicy(orgId, { passwordMinLength: Number(policy.passwordMinLength), maxFailedLogins: Number(policy.maxFailedLogins) }), 'Security policy updated');
        }}>
          <Field label="Minimum password length" htmlFor="pmin" hint="8 to 128 characters; applies to new passwords">
            <Input id="pmin" type="number" min={8} max={128} value={policy.passwordMinLength} onChange={(e) => setPolicy({ ...policy, passwordMinLength: e.target.value })} />
          </Field>
          <Field label="Failed sign-ins before lockout" htmlFor="pfail" hint="Accounts lock for 15 minutes">
            <Input id="pfail" type="number" min={3} max={20} value={policy.maxFailedLogins} onChange={(e) => setPolicy({ ...policy, maxFailedLogins: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" busy={savePolicy.busy}>Save policy</Button>
            {savePolicy.success && <span className="text-sm text-emerald-700">{savePolicy.success}</span>}
          </div>
          {savePolicy.error && <div className="sm:col-span-2"><Alert kind="error">{savePolicy.error}</Alert></div>}
        </form>
      </Card>
    </div>
  );
}
