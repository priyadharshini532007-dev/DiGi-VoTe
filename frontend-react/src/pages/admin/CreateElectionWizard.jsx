import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Elections, Voting } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import { useAction } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Button, Card, Checkbox, ConfirmDialog, DefinitionList, Field, Input, PageHeader, Select, StatusBadge, Stepper, Table, Textarea } from '../../components/ui.jsx';
import { fromLocalInput, toLocalInput, formatDateTime } from '../../lib/format.js';
import { parseVoterList } from '../../lib/csv.js';
import { validateRules } from './RulesForm.jsx';

const STEPS = [
  { key: 'basic', label: 'Basic information' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'rules', label: 'Election rules' },
  { key: 'people', label: 'Candidates & voters' },
  { key: 'security', label: 'Security & verification' },
  { key: 'review', label: 'Review & create' },
];

function defaultRules() {
  const at = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const votingStart = at(3, 9);
  return {
    maxSelections: 1, countingMethod: 'PLURALITY', requireCandidateApproval: true, anonymousVoting: true,
    publicResults: false, qrReceipts: true, receiptsRequired: true, notaEnabled: false, candidatesMayVote: true,
    administratorsMayVote: false, resultPublicationPolicy: 'MANUAL', minCandidates: 2,
    campaignStart: at(1, 9), campaignEnd: votingStart, votingStart, votingEnd: at(10, 17), withdrawalDeadline: votingStart,
  };
}

const STEP_ERROR_KEYS = {
  schedule: ['campaignEnd', 'votingEnd'],
  rules: ['maxSelections', 'notaEnabled', 'qrReceipts'],
};

function stepErrors(step, basic, rules) {
  if (step === 'basic') {
    const e = {};
    if (!basic.title.trim()) e.title = 'Enter an election title';
    else if (basic.title.length > 160) e.title = 'Title is limited to 160 characters';
    if (basic.description.length > 2000) e.description = 'Description is limited to 2000 characters';
    return e;
  }
  const all = validateRules(rules);
  const keys = STEP_ERROR_KEYS[step];
  return keys ? Object.fromEntries(Object.entries(all).filter(([k]) => keys.includes(k))) : {};
}

function rulesBody(r) {
  return { ...r, maxSelections: Number(r.maxSelections), minCandidates: Number(r.minCandidates) };
}

export default function CreateElectionWizard() {
  const { active } = useAuth();
  const orgId = active.organizationId;
  const [step, setStep] = useState(0);
  const [basic, setBasic] = useState({ title: '', description: '' });
  const [rules, setRules] = useState(defaultRules);
  const [people, setPeople] = useState({ mode: 'later', text: '' });
  const [errors, setErrors] = useState({});
  const [outcome, setOutcome] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const create = useAction();
  const publish = useAction();

  const key = STEPS[step].key;
  const set = (k, v) => setRules((r) => ({ ...r, [k]: v }));
  const time = (k, label, hint) => (
    <Field label={label} htmlFor={`w-${k}`} hint={hint} error={errors[k]}>
      <Input id={`w-${k}`} type="datetime-local" value={toLocalInput(rules[k])} onChange={(e) => set(k, fromLocalInput(e.target.value))} />
    </Field>
  );

  const parsed = parseVoterList(people.text);
  const allErrors = { ...stepErrors('basic', basic, rules), ...stepErrors('schedule', basic, rules), ...stepErrors('rules', basic, rules) };
  const blocking = Object.keys(allErrors).length > 0;

  const next = () => {
    const e = stepErrors(key, basic, rules);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    const result = await create.run(async () => {
      const election = await Elections.create(orgId, { title: basic.title.trim(), description: basic.description.trim() });
      const out = { election, problems: [], votersResult: null, readiness: null };
      try {
        await Elections.updateRules(election.id, rulesBody(rules));
      } catch (e) {
        out.problems.push(`The draft was created but its rules were not saved: ${errorMessage(e)}`);
      }
      try {
        if (people.mode === 'all') out.votersResult = await Voting.addAllMembers(election.id);
        if (people.mode === 'paste' && parsed.validEmails.length) out.votersResult = await Voting.addVoters(election.id, parsed.validEmails);
      } catch (e) {
        out.problems.push(`Eligible voters were not added: ${errorMessage(e)}`);
      }
      try {
        out.readiness = await Elections.readiness(election.id);
      } catch (e) {
        out.problems.push(`Readiness could not be evaluated: ${errorMessage(e)}`);
      }
      return out;
    });
    if (result) setOutcome(result);
  };

  if (outcome) {
    const { election, readiness, votersResult, problems } = outcome;
    return (
      <div className="space-y-6">
        <PageHeader title="Draft election created" subtitle={election.title} />
        {problems.map((p) => <Alert key={p} kind="warning">{p}</Alert>)}
        {publish.error && <Alert kind="error">{publish.error}</Alert>}
        {publish.success && <Alert kind="success">{publish.success}</Alert>}
        <Card title="Next steps">
          <DefinitionList items={[
            ['Status', <StatusBadge status={publish.success ? 'REGISTRATION' : election.status} />],
            votersResult && ['Voters added', `${votersResult.added} added, ${votersResult.alreadyEligible} already eligible${votersResult.rejected.length ? `, ${votersResult.rejected.length} rejected` : ''}`],
            readiness && ['Readiness', `${readiness.score}% — ${readiness.ready ? 'ready to open candidate registration' : 'not ready yet'}`],
          ]} />
          {votersResult?.rejected.length > 0 && (
            <p className="mt-3 text-sm text-amber-800">Rejected: {votersResult.rejected.join(', ')}</p>
          )}
        </Card>
        {readiness && (
          <Card title="Readiness checks" padded={false}>
            <Table rowKey={(c) => c.key} rows={readiness.checks} columns={[
              { key: 'label', label: 'Requirement' },
              { key: 'passed', label: 'Status', render: (c) => <StatusBadge status={c.passed ? 'PASS' : 'FAIL'} /> },
              { key: 'detail', label: 'Detail', className: 'text-slate-600' },
            ]} />
          </Card>
        )}
        <div className="flex flex-wrap gap-3">
          <Link to={`/app/elections/${election.id}`} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">Open election workspace</Link>
          <Link to={`/app/rules?election=${election.id}`} className="rounded-md border border-slate-300 bg-panel px-4 py-2 text-sm font-medium text-navy-900 hover:bg-slate-50">Adjust rules</Link>
          <Button disabled={!readiness?.ready || Boolean(publish.success)} onClick={() => { publish.clear(); setConfirmPublish(true); }}>
            Publish election (open candidate registration)
          </Button>
        </div>
        {!readiness?.ready && <p className="text-sm text-slate-500">Publishing unlocks when every required readiness check passes.</p>}
        <ConfirmDialog open={confirmPublish} title="Publish this election?" confirmLabel="Publish" busy={publish.busy}
          onCancel={() => setConfirmPublish(false)}
          onConfirm={async () => {
            await publish.run(() => Elections.transition(election.id, 'REGISTRATION'), 'Election published: candidate registration is open');
            setConfirmPublish(false);
          }}>
          Candidates can start applying and voters can see the election. The move is recorded on the audit chain.
        </ConfirmDialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Create election" subtitle="A guided set-up. Nothing is saved until the final step." />
      <Card><Stepper ariaLabel="Election set-up steps" steps={STEPS} current={key} /></Card>

      {key === 'basic' && (
        <Card title="Basic information">
          <div className="space-y-4">
            <Field label="Election title" htmlFor="w-title" error={errors.title}>
              <Input id="w-title" maxLength={160} value={basic.title} onChange={(e) => setBasic({ ...basic, title: e.target.value })} />
            </Field>
            <Field label="Description and voter instructions" htmlFor="w-desc" error={errors.description}
              hint="Shown to everyone who can see the election. Write instructions here; the platform stores one description field.">
              <Textarea id="w-desc" rows={5} maxLength={2000} value={basic.description} onChange={(e) => setBasic({ ...basic, description: e.target.value })} />
            </Field>
            <p className="text-xs text-slate-500">Organization: <strong>{active.organizationName}</strong>. Banner images are not supported by the server yet.</p>
          </div>
        </Card>
      )}

      {key === 'schedule' && (
        <Card title="Schedule">
          <div className="grid gap-4 sm:grid-cols-2">
            {time('campaignStart', 'Campaign opens', 'Candidates can publish manifestos from here.')}
            {time('campaignEnd', 'Campaign closes', 'Must not be later than the voting start.')}
            {time('votingStart', 'Voting opens', 'Ballots are accepted only inside the voting window.')}
            {time('votingEnd', 'Voting closes', 'Verification starts after closing; results are generated afterwards.')}
            {time('withdrawalDeadline', 'Candidate withdrawal deadline', 'Defaults to the voting start.')}
          </div>
          <p className="mt-4 text-xs text-slate-500">Candidate registration is open while the election is in the Registration stage; its length is controlled by when you publish and advance the election.</p>
        </Card>
      )}

      {key === 'rules' && (
        <Card title="Election rules">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Counting method" htmlFor="w-method" hint="Plurality: one choice, most votes wins. Approval: several choices, most approvals wins.">
              <Select id="w-method" value={rules.countingMethod} onChange={(e) => setRules((r) => ({ ...r, countingMethod: e.target.value, maxSelections: e.target.value === 'PLURALITY' ? 1 : Math.max(2, Number(r.maxSelections)) }))}>
                <option value="PLURALITY">Plurality (single choice)</option>
                <option value="APPROVAL">Approval (multiple choices)</option>
              </Select>
            </Field>
            <Field label="Maximum selections" htmlFor="w-max" error={errors.maxSelections}>
              <Input id="w-max" type="number" min={1} max={50} value={rules.maxSelections} onChange={(e) => set('maxSelections', e.target.value)} />
            </Field>
            <Field label="Minimum approved candidates" htmlFor="w-min" hint="Voting cannot open with fewer.">
              <Input id="w-min" type="number" min={1} max={100} value={rules.minCandidates} onChange={(e) => set('minCandidates', e.target.value)} />
            </Field>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Checkbox label="Offer None Of The Above (NOTA)" checked={rules.notaEnabled} onChange={(e) => set('notaEnabled', e.target.checked)} hint={errors.notaEnabled ?? 'Required for single-candidate elections.'} />
            <Checkbox label="Candidate applications require approval" checked={rules.requireCandidateApproval} onChange={(e) => set('requireCandidateApproval', e.target.checked)} hint="Only approved candidates appear on the ballot." />
            <Checkbox label="Candidates may vote" checked={rules.candidatesMayVote} onChange={(e) => set('candidatesMayVote', e.target.checked)} />
            <Checkbox label="Administrators of this election may vote" checked={rules.administratorsMayVote} onChange={(e) => set('administratorsMayVote', e.target.checked)} hint="Off by default to avoid conflicts of interest." />
            <Checkbox label="Issue verification receipts" checked={rules.receiptsRequired} onChange={(e) => set('receiptsRequired', e.target.checked)} />
            <Checkbox label="Include a QR code on receipts" checked={rules.qrReceipts} onChange={(e) => set('qrReceipts', e.target.checked)} hint={errors.qrReceipts ?? 'Needs receipts enabled.'} />
            <Checkbox label="Results are public" checked={rules.publicResults} onChange={(e) => set('publicResults', e.target.checked)} hint="Lists the election, results and bulletin board on the public site." />
            <Field label="Result publication" htmlFor="w-policy">
              <Select id="w-policy" value={rules.resultPublicationPolicy} onChange={(e) => set('resultPublicationPolicy', e.target.value)}>
                <option value="MANUAL">Publish manually after review</option>
                <option value="AFTER_VERIFICATION">Publish automatically once generated and verified</option>
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {key === 'people' && (
        <Card title="Candidates and eligible voters">
          <p className="text-sm text-slate-600">
            Candidates apply themselves once the election is published; you review them under Candidate approvals.
            Choose how to seed the eligible voter list now (you can change it until voting opens).
          </p>
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 text-sm"><input type="radio" name="mode" checked={people.mode === 'later'} onChange={() => setPeople({ ...people, mode: 'later' })} className="mt-0.5" /> <span><span className="font-medium">Add voters later</span><span className="block text-xs text-slate-500">Use Voter management to upload a CSV.</span></span></label>
            <label className="flex items-start gap-3 text-sm"><input type="radio" name="mode" checked={people.mode === 'all'} onChange={() => setPeople({ ...people, mode: 'all' })} className="mt-0.5" /> <span><span className="font-medium">Add every voter and candidate member</span><span className="block text-xs text-slate-500">Everyone with those roles in this organization.</span></span></label>
            <label className="flex items-start gap-3 text-sm"><input type="radio" name="mode" checked={people.mode === 'paste'} onChange={() => setPeople({ ...people, mode: 'paste' })} className="mt-0.5" /> <span><span className="font-medium">Paste an email list</span><span className="block text-xs text-slate-500">One per line or comma separated. People must already be members.</span></span></label>
          </div>
          {people.mode === 'paste' && (
            <div className="mt-4 space-y-3">
              <Field label="Member emails" htmlFor="w-emails">
                <Textarea id="w-emails" rows={5} value={people.text} onChange={(e) => setPeople({ ...people, text: e.target.value })} />
              </Field>
              <p className="text-sm text-slate-600">
                {parsed.counts.valid} valid · {parsed.counts.invalid} invalid · {parsed.counts.duplicate} duplicate
              </p>
            </div>
          )}
        </Card>
      )}

      {key === 'security' && (
        <Card title="Security and verification">
          <DefinitionList items={[
            ['Ballot privacy', 'Always on: blind-signed one-time credentials separate the voter from the ballot.'],
            ['Receipts', rules.receiptsRequired ? `Enabled${rules.qrReceipts ? ' with QR codes' : ''}` : 'Disabled'],
            ['Integrity logging', 'Always on: hash-chained audit log and public bulletin board.'],
            ['Manifesto freeze', 'Automatic when voting opens.'],
            ['Result visibility', rules.publicResults ? 'Public after publication' : 'Organization members after publication'],
          ]} />
          <p className="mt-4 text-sm text-slate-600">
            The server evaluates readiness checks (complete rules, enough approved candidates, no pending applications,
            at least one eligible voter, voting window) after the draft is saved; publication is blocked until they pass.
          </p>
        </Card>
      )}

      {key === 'review' && (
        <Card title="Review">
          {blocking && (
            <Alert kind="error" title="Fix these before creating">
              <ul className="list-disc pl-5">{Object.values(allErrors).map((m) => <li key={m}>{m}</li>)}</ul>
            </Alert>
          )}
          <div className={blocking ? 'mt-4' : ''}>
            <DefinitionList items={[
              ['Title', basic.title || '—'],
              ['Description', basic.description || '—'],
              ['Counting', `${rules.countingMethod}, up to ${rules.maxSelections} selection(s)${rules.notaEnabled ? ', NOTA offered' : ''}`],
              ['Minimum candidates', rules.minCandidates],
              ['Campaign', `${formatDateTime(rules.campaignStart)} – ${formatDateTime(rules.campaignEnd)}`],
              ['Voting', `${formatDateTime(rules.votingStart)} – ${formatDateTime(rules.votingEnd)}`],
              ['Withdrawal deadline', formatDateTime(rules.withdrawalDeadline)],
              ['Receipts', rules.receiptsRequired ? (rules.qrReceipts ? 'With QR' : 'Yes') : 'No'],
              ['Public results', rules.publicResults ? 'Yes' : 'No'],
              ['Eligible voters', people.mode === 'later' ? 'Add later' : people.mode === 'all' ? 'All voters and candidates' : `${parsed.counts.valid} listed`],
            ]} />
          </div>
          {create.error && <div className="mt-4"><Alert kind="error">{create.error}</Alert></div>}
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" disabled={step === 0 || create.busy} onClick={() => setStep((s) => s - 1)}>Back</Button>
        {step < STEPS.length - 1
          ? <Button onClick={next}>Next</Button>
          : <Button busy={create.busy} disabled={blocking} onClick={submit}>Create draft election</Button>}
      </div>
    </div>
  );
}
