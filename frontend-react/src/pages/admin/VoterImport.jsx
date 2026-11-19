import { useRef, useState } from 'react';
import { Voting } from '../../api/endpoints.js';
import { useAction } from '../../hooks/useApi.js';
import DataTable from '../../components/DataTable.jsx';
import { Alert, Badge, Button, Card, Field, StatCard, Textarea } from '../../components/ui.jsx';
import { parseVoterList } from '../../lib/csv.js';
import { downloadCsv, fileStamp } from '../../lib/download.js';
import { ROLE_LABELS, formatDateTime } from '../../lib/format.js';

const MAX_FILE_BYTES = 1024 * 1024;
const CHUNK = 2000;
const EDITABLE = ['DRAFT', 'REGISTRATION', 'CAMPAIGN'];
const TONES = { valid: 'green', invalid: 'red', duplicate: 'amber' };

export default function VoterImport({ election, operator, onChange }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const importing = useAction();
  const exporting = useAction();
  const editable = operator && EDITABLE.includes(election.status);
  const parsed = parseVoterList(text);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError('Choose a file smaller than 1 MB.');
      return;
    }
    if (!/\.(csv|txt)$/i.test(file.name) && !/^text\//.test(file.type)) {
      setFileError('Upload a .csv or .txt file.');
      return;
    }
    setText(await file.text());
    setFileName(file.name);
    setResult(null);
  };

  const reset = () => {
    setText('');
    setFileName(null);
    setFileError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const runImport = async () => {
    const emails = parsed.validEmails;
    const r = await importing.run(async () => {
      const total = { added: 0, alreadyEligible: 0, rejected: [] };
      for (let i = 0; i < emails.length; i += CHUNK) {
        const part = await Voting.addVoters(election.id, emails.slice(i, i + CHUNK));
        total.added += part.added;
        total.alreadyEligible += part.alreadyEligible;
        total.rejected.push(...part.rejected);
      }
      return total;
    });
    if (r) {
      setResult(r);
      setHistory((h) => [{ at: new Date().toISOString(), file: fileName ?? 'Pasted list', submitted: emails.length, ...r }, ...h]);
      onChange();
    }
  };

  const downloadProblems = () => {
    const bad = parsed.rows.filter((r) => r.status !== 'valid');
    downloadCsv(`voter-import-problems-${fileStamp()}.csv`, [
      { label: 'Line', value: (r) => r.line },
      { label: 'Email', value: (r) => r.email },
      { label: 'Problem', value: (r) => r.status },
      { label: 'Reason', value: (r) => r.reason },
    ], bad);
  };

  const exportList = async () => {
    const all = await exporting.run(async () => {
      const out = [];
      let page = 0;
      let totalPages = 1;
      while (page < totalPages) {
        const p = await Voting.voters(election.id, page);
        out.push(...p.content);
        totalPages = p.totalPages;
        page += 1;
      }
      return out;
    });
    if (all) {
      downloadCsv(`eligible-voters-${election.id}-${fileStamp()}.csv`, [
        { label: 'Name', value: (v) => v.fullName },
        { label: 'Email', value: (v) => v.email },
        { label: 'Role', value: (v) => ROLE_LABELS[v.role] ?? v.role },
        { label: 'Eligibility', value: (v) => v.status },
        { label: 'Credential issued', value: (v) => (v.credentialIssued ? 'yes' : 'no') },
        { label: 'Added', value: (v) => v.addedAt },
      ], all);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Import eligible voters" actions={<Button variant="secondary" size="sm" busy={exporting.busy} onClick={exportList}>Export current list (CSV)</Button>}>
        {!editable && <Alert kind="info">The voter list is locked once voting opens, so imports are disabled.</Alert>}
        {exporting.error && <div className="mt-3"><Alert kind="error">{exporting.error}</Alert></div>}
        {editable && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Field label="CSV or text file" htmlFor="voter-file" hint="A column headed “email”, or one address per line. Maximum 1 MB. The file is read in your browser until you confirm.">
                <input id="voter-file" ref={inputRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="block text-sm" />
              </Field>
              {fileError && <p className="text-sm text-red-700" role="alert">{fileError}</p>}
              {fileName && <p className="text-xs text-slate-500">Loaded {fileName}</p>}
            </div>
            <Field label="…or paste addresses" htmlFor="voter-text">
              <Textarea id="voter-text" rows={4} value={text} onChange={(e) => { setText(e.target.value); setFileName(null); setResult(null); }} />
            </Field>
          </div>
        )}
      </Card>

      {editable && parsed.counts.total > 0 && (
        <Card title="Upload preview" padded={false}
          actions={(
            <>
              {(parsed.counts.invalid + parsed.counts.duplicate) > 0 && <Button size="sm" variant="secondary" onClick={downloadProblems}>Download invalid-row report</Button>}
              <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>
            </>
          )}>
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            <StatCard label="Rows read" value={parsed.counts.total} />
            <StatCard label="Valid" value={parsed.counts.valid} tone="green" />
            <StatCard label="Invalid" value={parsed.counts.invalid} tone={parsed.counts.invalid ? 'red' : undefined} />
            <StatCard label="Duplicates in file" value={parsed.counts.duplicate} tone={parsed.counts.duplicate ? 'amber' : undefined} />
          </div>
          <DataTable
            rows={parsed.rows}
            rowKey={(r) => `${r.line}-${r.email}`}
            pageSize={8}
            filters={[{ key: 'status', label: 'Result', options: ['valid', 'invalid', 'duplicate'].map((s) => ({ value: s, label: s })), match: (r, v) => r.status === v }]}
            searchLabel="Search rows"
            searchText={(r) => r.email}
            columns={[
              { key: 'line', label: 'Line', sortable: true },
              { key: 'email', label: 'Email', render: (r) => <span className="mono text-xs">{r.email}</span> },
              { key: 'status', label: 'Result', render: (r) => <Badge tone={TONES[r.status]}>{r.status}</Badge> },
              { key: 'reason', label: 'Reason', className: 'text-slate-600' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
            <Button busy={importing.busy} disabled={!parsed.counts.valid} onClick={runImport}>
              Import {parsed.counts.valid} valid voter{parsed.counts.valid === 1 ? '' : 's'}
            </Button>
            <p className="text-xs text-slate-500">
              The server also checks that each person is a member with a voting role; anyone it rejects is listed afterwards.
            </p>
          </div>
          {importing.error && <div className="px-5 pb-5"><Alert kind="error">{importing.error}</Alert></div>}
        </Card>
      )}

      {result && (
        <Alert kind={result.rejected.length ? 'warning' : 'success'} title="Import finished" onClose={() => setResult(null)}>
          {result.added} added, {result.alreadyEligible} already eligible
          {result.rejected.length > 0 && (
            <>
              , {result.rejected.length} rejected by the server:
              <ul className="mt-1 list-disc pl-5">{result.rejected.map((r) => <li key={r}>{r}</li>)}</ul>
            </>
          )}
        </Alert>
      )}

      <Card title="Imports in this session" padded={false}>
        <DataTable
          rows={history}
          rowKey={(h) => h.at}
          empty="Nothing imported in this session. DigiVote keeps the resulting eligible list, not past import attempts."
          columns={[
            { key: 'at', label: 'When', render: (h) => formatDateTime(h.at) },
            { key: 'file', label: 'Source' },
            { key: 'submitted', label: 'Sent' },
            { key: 'added', label: 'Added' },
            { key: 'alreadyEligible', label: 'Already eligible' },
            { key: 'rejected', label: 'Rejected', render: (h) => h.rejected.length },
          ]}
        />
      </Card>
    </div>
  );
}
