import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Candidates, Elections, Notifications } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select, StatusBadge, Table, Textarea } from '../../components/ui.jsx';
import { LifecycleStepper } from '../admin/OverviewTab.jsx';
import { formatDateTime } from '../../lib/format.js';
import { milestones } from '../../lib/elections.js';
import { notificationCategory } from '../../components/shell/NotificationBell.jsx';
import AuthImage from '../../components/AuthImage.jsx';

const MEDIA_TYPES = [
  ['PHOTO', 'Photograph (PNG or JPEG)', 'image/png,image/jpeg'],
  ['POSTER', 'Campaign poster (PNG or JPEG)', 'image/png,image/jpeg'],
  ['MANIFESTO_PDF', 'Manifesto PDF', 'application/pdf'],
  ['VIDEO', 'Introduction video (MP4)', 'video/mp4'],
];

const SECTION_TITLES = {
  profile: ['My profile', 'Your public biography as voters see it.'],
  manifesto: ['My manifesto', 'Vision, mission, goals and proposed schemes.'],
  media: ['Campaign media', 'Photograph, poster, manifesto PDF and introduction video.'],
  campaign: ['Campaign', 'Deadlines and election notices that affect your campaign.'],
  timeline: ['Election timeline', 'Where the election is in its lifecycle.'],
};

/**
 * One candidacy. `section` limits the page to a single part (profile, manifesto, media, campaign, timeline);
 * without it every part is shown, which is the full workspace opened from the application list.
 */
export default function CandidateWorkspace({ candidateId: idProp, section }) {
  const params = useParams();
  const candidateId = idProp ?? params.candidateId;
  const candidate = useApi(() => Candidates.get(candidateId), [candidateId]);
  const election = useApi(() => (candidate.data ? Elections.get(candidate.data.electionId) : Promise.resolve(null)), [candidate.data?.electionId]);
  const timeline = useApi(() => (section === 'timeline' && candidate.data ? Elections.timeline(candidate.data.electionId) : Promise.resolve([])), [section, candidate.data?.electionId]);
  const notices = useApi(() => (section === 'campaign' ? Notifications.list() : Promise.resolve(null)), [section]);
  const [profile, setProfile] = useState(null);
  const [manifesto, setManifesto] = useState(null);
  const [mediaType, setMediaType] = useState('PHOTO');
  const [file, setFile] = useState(null);
  const saveProfile = useAction();
  const saveManifesto = useAction();
  const upload = useAction();
  const show = (name) => !section || section === name;

  useEffect(() => {
    const c = candidate.data;
    if (c) {
      setProfile({ displayName: c.displayName, qualifications: c.qualifications ?? '', achievements: c.achievements ?? '' });
      setManifesto({ vision: c.manifesto?.vision ?? '', mission: c.manifesto?.mission ?? '', goals: c.manifesto?.goals ?? '', schemes: c.manifesto?.schemes ?? '' });
    }
  }, [candidate.data]);

  if (candidate.loading && !candidate.data) return <Loading />;
  if (candidate.error) return <ErrorState message={candidate.error} onRetry={candidate.reload} />;
  const c = candidate.data;
  const frozen = c.manifesto?.frozen;
  const editable = !frozen && ['REGISTRATION', 'CAMPAIGN'].includes(election.data?.status);
  const [title, subtitle] = section ? SECTION_TITLES[section] : [c.displayName, election.data ? `Candidate in ${election.data.title}` : ''];

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={section ? `${subtitle}${election.data ? ` · ${election.data.title}` : ''}` : subtitle}
        actions={!section && <Link to="/app/candidacy" className="text-sm font-medium text-navy-700">← All applications</Link>} />

      {(show('timeline') || !section) && election.data && (
        <Card title="Election timeline">
          <LifecycleStepper status={election.data.status} />
          <p className="mt-3 text-sm text-slate-600">Voting window: {formatDateTime(election.data.rules.votingStart)} – {formatDateTime(election.data.rules.votingEnd)}</p>
          {section === 'timeline' && (
            <ol className="mt-5 space-y-3 border-l border-slate-200 pl-5">
              {(timeline.data ?? []).map((t, i) => (
                <li key={i}>
                  <p className="text-sm font-medium text-navy-900"><StatusBadge status={t.to} /> {t.from ? `from ${t.from}` : 'created'}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(t.occurredAt)}{t.note ? ` · ${t.note}` : ''}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {(show('manifesto') || show('profile')) && frozen && (
        <Alert kind="warning" title="Read-only: voting has opened">
          Your profile and manifesto were frozen on {formatDateTime(c.manifesto.frozenAt)}. Editing is disabled here and refused by the server.
        </Alert>
      )}
      {(show('manifesto') || show('profile')) && !frozen && election.data && !['REGISTRATION', 'CAMPAIGN'].includes(election.data.status) && (
        <Alert kind="info">Profile and manifesto can be edited during the Registration and Campaign stages.</Alert>
      )}

      {show('profile') && (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <Card title="Candidate profile">
            {profile && (
              <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await saveProfile.run(() => Candidates.updateProfile(c.id, profile), 'Profile saved')) candidate.reload(); }}>
                <Field label="Name on ballot" htmlFor="wname"><Input id="wname" disabled={!editable} required value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} /></Field>
                <Field label="Qualifications and education" htmlFor="wqual"><Textarea id="wqual" disabled={!editable} rows={3} value={profile.qualifications} onChange={(e) => setProfile({ ...profile, qualifications: e.target.value })} /></Field>
                <Field label="Achievements and experience" htmlFor="wach"><Textarea id="wach" disabled={!editable} rows={3} value={profile.achievements} onChange={(e) => setProfile({ ...profile, achievements: e.target.value })} /></Field>
                {saveProfile.error && <Alert kind="error">{saveProfile.error}</Alert>}
                {editable && (
                  <div className="flex gap-2">
                    <Button type="submit" busy={saveProfile.busy}>Save profile</Button>
                    <Button variant="secondary" onClick={() => setProfile({ displayName: c.displayName, qualifications: c.qualifications ?? '', achievements: c.achievements ?? '' })}>Cancel changes</Button>
                  </div>
                )}
                {saveProfile.success && <span className="text-sm text-emerald-700">{saveProfile.success}</span>}
              </form>
            )}
          </Card>
          <Card title="Photograph">
            {c.photoUrl ? <AuthImage src={c.photoUrl} alt={`Photograph of ${c.displayName}`} className="aspect-square w-full rounded-md object-cover" /> : <p className="text-sm text-slate-500">No photograph uploaded. Add one under Campaign media.</p>}
          </Card>
        </div>
      )}

      {show('manifesto') && (
        <Card title="Manifesto" actions={c.manifesto && <span className="flex gap-1"><StatusBadge status={c.manifesto.status} />{frozen && <Badge tone="red">Frozen</Badge>}</span>}>
          {manifesto && (
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await saveManifesto.run(() => Candidates.saveManifesto(c.id, manifesto), 'Manifesto saved')) candidate.reload(); }}>
              {['vision', 'mission', 'goals', 'schemes'].map((k) => (
                <Field key={k} label={k === 'schemes' ? 'Proposed schemes' : k[0].toUpperCase() + k.slice(1)} htmlFor={`m-${k}`}>
                  <Textarea id={`m-${k}`} rows={5} disabled={!editable} value={manifesto[k]} onChange={(e) => setManifesto({ ...manifesto, [k]: e.target.value })} />
                </Field>
              ))}
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                {editable && <Button type="submit" busy={saveManifesto.busy}>Save draft</Button>}
                {editable && <Button variant="secondary" busy={saveManifesto.busy} onClick={async () => {
                  if (await saveManifesto.run(async () => { await Candidates.saveManifesto(c.id, manifesto); return Candidates.publishManifesto(c.id); }, 'Manifesto published to voters')) candidate.reload();
                }}>Save and publish</Button>}
                {c.manifesto?.publishedAt && <span className="text-xs text-slate-500">Published {formatDateTime(c.manifesto.publishedAt)}</span>}
                {saveManifesto.success && <span className="text-sm text-emerald-700">{saveManifesto.success}</span>}
              </div>
              {saveManifesto.error && <div className="sm:col-span-2"><Alert kind="error">{saveManifesto.error}</Alert></div>}
            </form>
          )}
        </Card>
      )}

      {show('media') && (
        <Card title="Campaign media" padded={false}>
          {editable && (
            <form className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-5" onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target;
              if (await upload.run(() => Candidates.upload(c.id, mediaType, file), 'Uploaded')) { setFile(null); form.reset(); candidate.reload(); }
            }}>
              <Field label="Type" htmlFor="mtype">
                <Select id="mtype" value={mediaType} onChange={(e) => setMediaType(e.target.value)} className="w-64">
                  {MEDIA_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="File (max 10 MB)" htmlFor="mfile">
                <input id="mfile" type="file" required accept={MEDIA_TYPES.find((m) => m[0] === mediaType)[2]} onChange={(e) => setFile(e.target.files[0])} className="text-sm" />
              </Field>
              <Button type="submit" busy={upload.busy} disabled={!file}>Upload</Button>
              {upload.error && <span className="text-sm text-red-700" role="alert">{upload.error}</span>}
              {upload.success && <span className="text-sm text-emerald-700">{upload.success}</span>}
            </form>
          )}
          <Table rowKey={(m) => m.id} rows={c.media} empty="No media uploaded." columns={[
            { key: 'mediaType', label: 'Type', render: (m) => m.mediaType.replace('_', ' ').toLowerCase() },
            { key: 'originalFilename', label: 'File' },
            { key: 'sizeBytes', label: 'Size', render: (m) => `${(m.sizeBytes / 1024).toFixed(1)} KB` },
            { key: 'uploadedAt', label: 'Uploaded', render: (m) => formatDateTime(m.uploadedAt) },
            { key: 'sha256', label: 'SHA-256', render: (m) => <span className="mono text-xs">{m.sha256.slice(0, 12)}…</span> },
          ]} />
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Files are validated by content type and signature on upload. Once voting opens, media can no longer be added or removed.
          </p>
        </Card>
      )}

      {section === 'campaign' && (
        <>
          <Card title="Campaign deadlines" padded={false}>
            {election.data && milestones(election.data).length === 0
              ? <div className="p-5"><EmptyState title="No schedule set yet" /></div>
              : <Table rowKey={(m) => m.key} rows={election.data ? milestones(election.data) : []} columns={[
                { key: 'label', label: 'Milestone', render: (m) => <span className="font-medium">{m.label}</span> },
                { key: 'at', label: 'When', render: (m) => formatDateTime(m.at) },
              ]} />}
          </Card>
          <Card title="Election notices">
            {notices.loading && <Loading />}
            <ul className="divide-y divide-slate-100">
              {(notices.data?.page.content ?? []).filter((n) => String(n.electionId) === String(c.electionId)).slice(0, 8).map((n) => (
                <li key={n.id} className="py-3">
                  <p className="text-sm font-medium text-navy-900">{n.title} <Badge tone="blue">{notificationCategory(n.type)}</Badge></p>
                  <p className="text-sm text-slate-600">{n.body}</p>
                  <p className="text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
            {notices.data && notices.data.page.content.filter((n) => String(n.electionId) === String(c.electionId)).length === 0 && (
              <p className="text-sm text-slate-500">No notices for this election yet.</p>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Public announcements from candidates are not supported by the server yet; manifesto publication is the campaign channel.
              Candidates never see voter identities or intermediate results.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
