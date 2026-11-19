import { useState } from 'react';
import { Elections } from '../../api/endpoints.js';
import { useAction } from '../../hooks/useApi.js';
import { Alert, Button, Card, Checkbox, Field, Input, Select } from '../../components/ui.jsx';
import { fromLocalInput, toLocalInput } from '../../lib/format.js';

/** Sensible defaults for a fresh draft: voting opens now and runs for 7 days. */
export function defaultSchedule(now = new Date()) {
  const start = new Date(Math.ceil(now.getTime() / 60000) * 60000);
  const end = new Date(start.getTime() + 7 * 86400000);
  return { campaignStart: now.toISOString(), campaignEnd: start.toISOString(), votingStart: start.toISOString(), votingEnd: end.toISOString(), withdrawalDeadline: start.toISOString() };
}

export function validateRules(r) {
  const e = {};
  if (r.countingMethod === 'PLURALITY' && Number(r.maxSelections) !== 1) e.maxSelections = 'Plurality allows exactly one selection';
  if (r.countingMethod === 'APPROVAL' && Number(r.maxSelections) < 2) e.maxSelections = 'Approval needs at least two selections';
  if (Number(r.minCandidates) === 1 && !r.notaEnabled) e.notaEnabled = 'Single-candidate elections need NOTA';
  if (r.qrReceipts && !r.receiptsRequired) e.qrReceipts = 'QR receipts need receipts enabled';
  if (!r.votingStart || !r.votingEnd) e.votingEnd = 'Set the voting window';
  else if (new Date(r.votingEnd) <= new Date(r.votingStart)) e.votingEnd = 'Voting must end after it starts';
  if (r.campaignEnd && r.votingStart && new Date(r.campaignEnd) > new Date(r.votingStart)) e.campaignEnd = 'Campaign must end by the voting start';
  return e;
}

export default function RulesForm({ election, editable, onSaved }) {
  const initial = election.rules.votingStart ? election.rules : { ...election.rules, ...defaultSchedule() };
  const [r, setR] = useState(initial);
  const [errors, setErrors] = useState({});
  const save = useAction();
  const set = (k, v) => setR({ ...r, [k]: v });
  const time = (k) => (
    <Input id={k} type="datetime-local" disabled={!editable} value={toLocalInput(r[k])} onChange={(e) => set(k, fromLocalInput(e.target.value))} />
  );

  const submit = async (e) => {
    e.preventDefault();
    const v = validateRules(r);
    setErrors(v);
    if (Object.keys(v).length) return;
    const body = { ...r, maxSelections: Number(r.maxSelections), minCandidates: Number(r.minCandidates) };
    if (await save.run(() => Elections.updateRules(election.id, body), 'Rules saved')) onSaved();
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {!editable && <Alert kind="info">Rules are locked in the {election.status} state.</Alert>}
      {save.error && <Alert kind="error">{save.error}</Alert>}
      {save.success && <Alert kind="success">{save.success}</Alert>}
      <Card title="Ballot and counting">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Counting method" htmlFor="countingMethod">
            <Select id="countingMethod" disabled={!editable} value={r.countingMethod} onChange={(e) => setR({ ...r, countingMethod: e.target.value, maxSelections: e.target.value === 'PLURALITY' ? 1 : Math.max(2, r.maxSelections) })}>
              <option value="PLURALITY">Plurality (single choice)</option>
              <option value="APPROVAL">Approval (multiple choices)</option>
            </Select>
          </Field>
          <Field label="Maximum selections" htmlFor="maxSelections" error={errors.maxSelections}>
            <Input id="maxSelections" type="number" min={1} max={50} disabled={!editable} value={r.maxSelections} onChange={(e) => set('maxSelections', e.target.value)} />
          </Field>
          <Field label="Minimum approved candidates" htmlFor="minCandidates">
            <Input id="minCandidates" type="number" min={1} max={100} disabled={!editable} value={r.minCandidates} onChange={(e) => set('minCandidates', e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Checkbox label="Offer None Of The Above (NOTA)" disabled={!editable} checked={r.notaEnabled} onChange={(e) => set('notaEnabled', e.target.checked)} hint={errors.notaEnabled} />
          <Checkbox label="Candidate applications require approval" disabled={!editable} checked={r.requireCandidateApproval} onChange={(e) => set('requireCandidateApproval', e.target.checked)} />
          <Checkbox label="Anonymous voting (blind-signed credentials)" disabled checked={r.anonymousVoting} hint="Always on: DigiVote only runs anonymous elections" />
          <Checkbox label="Candidates may vote" disabled={!editable} checked={r.candidatesMayVote} onChange={(e) => set('candidatesMayVote', e.target.checked)} />
          <Checkbox label="Administrators of this election may vote" disabled={!editable} checked={r.administratorsMayVote} onChange={(e) => set('administratorsMayVote', e.target.checked)} hint="Off by default to avoid conflicts of interest" />
        </div>
      </Card>
      <Card title="Receipts and results">
        <div className="grid gap-4 sm:grid-cols-2">
          <Checkbox label="Issue verification receipts" disabled={!editable} checked={r.receiptsRequired} onChange={(e) => set('receiptsRequired', e.target.checked)} />
          <Checkbox label="Include a QR code on receipts" disabled={!editable} checked={r.qrReceipts} onChange={(e) => set('qrReceipts', e.target.checked)} hint={errors.qrReceipts} />
          <Checkbox label="Results are public" disabled={!editable} checked={r.publicResults} onChange={(e) => set('publicResults', e.target.checked)} hint="Public results and bulletin board are listed on the DigiVote site" />
          <Field label="Result publication policy" htmlFor="policy">
            <Select id="policy" disabled={!editable} value={r.resultPublicationPolicy} onChange={(e) => set('resultPublicationPolicy', e.target.value)}>
              <option value="MANUAL">Publish manually after review</option>
              <option value="AFTER_VERIFICATION">Publish automatically once generated and verified</option>
            </Select>
          </Field>
        </div>
      </Card>
      <Card title="Schedule">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Campaign starts" htmlFor="campaignStart">{time('campaignStart')}</Field>
          <Field label="Campaign ends" htmlFor="campaignEnd" error={errors.campaignEnd}>{time('campaignEnd')}</Field>
          <Field label="Voting opens" htmlFor="votingStart">{time('votingStart')}</Field>
          <Field label="Voting closes" htmlFor="votingEnd" error={errors.votingEnd}>{time('votingEnd')}</Field>
          <Field label="Candidate withdrawal deadline" htmlFor="withdrawalDeadline" hint="Defaults to the voting start">{time('withdrawalDeadline')}</Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">Voting can only be opened inside the voting window, and ballots are only accepted inside it.</p>
      </Card>
      {editable && <Button type="submit" busy={save.busy}>Save rules</Button>}
    </form>
  );
}
