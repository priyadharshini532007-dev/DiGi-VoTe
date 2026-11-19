import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Candidates, Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useFanOut } from '../../hooks/useFanOut.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import AuthImage from '../../components/AuthImage.jsx';
import { Badge, Card, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select } from '../../components/ui.jsx';

export default function CandidateDirectory() {
  const { active } = useAuth();
  const list = useApi(() => Elections.list(active.organizationId, 0, 100), [active.organizationId]);
  const elections = useMemo(() => (list.data?.content ?? []).filter((e) => e.status !== 'DRAFT'), [list.data]);
  const fan = useFanOut(elections.map((e) => e.id), (id) => Candidates.forElection(id));
  const [query, setQuery] = useState('');
  const [electionId, setElectionId] = useState('');

  const rows = elections
    .filter((e) => !electionId || String(e.id) === electionId)
    .flatMap((e) => (fan.data[e.id] ?? []).map((c) => ({ ...c, election: e })))
    .filter((c) => !query.trim() || `${c.displayName} ${c.qualifications ?? ''} ${c.election.title}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.election.title.localeCompare(b.election.title) || a.ballotPosition - b.ballotPosition);

  return (
    <div className="space-y-6">
      <PageHeader title="Candidate directory" subtitle="Approved candidates and their published manifestos, presented identically." />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Field label="Search candidates" htmlFor="cand-search"><Input id="cand-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
        </div>
        <Field label="Election" htmlFor="cand-election">
          <Select id="cand-election" value={electionId} onChange={(e) => setElectionId(e.target.value)} className="min-w-[14rem]">
            <option value="">All elections</option>
            {elections.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </Select>
        </Field>
      </div>
      {(list.loading || fan.loading) && <Loading />}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.loading && !fan.loading && rows.length === 0 && <EmptyState title="No candidates to show">Approved candidates appear once an election's candidate review is complete.</EmptyState>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => (
          <Card key={c.id}>
            <div className="flex gap-4">
              {c.photoUrl
                ? <AuthImage src={c.photoUrl} alt={c.displayName} className="h-20 w-20 shrink-0 rounded-md object-cover" />
                : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-md bg-accent-soft text-2xl font-semibold text-navy-800">{c.displayName[0]}</div>}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-slate-500">{c.election.title} · Ballot #{c.ballotPosition}</p>
                <h3 className="text-lg font-semibold text-navy-900">{c.displayName}</h3>
                {c.qualifications && <p className="line-clamp-2 text-sm text-slate-600">{c.qualifications}</p>}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              {c.manifesto ? <Badge tone="blue">Manifesto published</Badge> : <Badge>No manifesto yet</Badge>}
              <Link to={`/app/e/${c.election.id}`} className="text-sm font-medium text-navy-700 hover:underline">Full manifesto</Link>
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-500">Candidates are listed by election and ballot position. DigiVote never ranks, highlights or recommends candidates.</p>
    </div>
  );
}
