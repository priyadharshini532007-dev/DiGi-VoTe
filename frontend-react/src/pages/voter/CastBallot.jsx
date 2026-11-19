import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Public, Voting } from '../../api/endpoints.js';
import { verifyElectionCredentialKey } from '../../crypto/keyTransparency.js';
import { errorCode, errorMessage } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Button, Card, ConfirmDialog, ErrorState, Loading, PageHeader } from '../../components/ui.jsx';
import AuthImage from '../../components/AuthImage.jsx';
import { prepareCredential, randomNonceHex, unblind, verifyCredential } from '../../crypto/blindRsa.js';
import { getCredential, getReceipt, saveCredential, saveReceipt } from '../../lib/credentialStore.js';
import { formatDateTime } from '../../lib/format.js';
import ReceiptCard from './ReceiptCard.jsx';

/** Toggles an option respecting max selections and NOTA exclusivity. */
export function toggleSelection(selected, option, maxSelections) {
  if (selected.includes(option.index)) return selected.filter((i) => i !== option.index);
  if (option.nota) return [option.index];
  const withoutNota = selected.filter((i) => i !== option.notaIndex);
  if (maxSelections === 1) return [option.index];
  if (withoutNota.length >= maxSelections) return withoutNota;
  return [...withoutNota, option.index];
}

function Steps({ current }) {
  const steps = ['Eligibility', 'Anonymous credential', 'Ballot', 'Confirm', 'Receipt'];
  return (
    <ol className="mb-6 flex flex-wrap gap-2 text-xs font-semibold">
      {steps.map((s, i) => (
        <li key={s} className={`rounded-full px-3 py-1 ${i < current ? 'bg-accent-soft text-navy-800' : i === current ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500'}`}>
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

export default function CastBallot() {
  const { electionId } = useParams();
  const eligibility = useApi(() => Voting.eligibility(electionId), [electionId]);
  const [credential, setCredential] = useState(() => getCredential(electionId));
  const [receipt, setReceipt] = useState(() => getReceipt(electionId));
  const [ballot, setBallot] = useState(null);
  const [selected, setSelected] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [duplicateResult, setDuplicateResult] = useState(null);

  const hasCredential = Boolean(credential?.signatureHex);

  useEffect(() => {
    if (hasCredential && !receipt && !ballot) {
      Voting.ballot(electionId).then(setBallot).catch((e) => setError(errorMessage(e)));
    }
  }, [hasCredential, receipt, ballot, electionId]);

  const obtainCredential = async () => {
    setBusy(true);
    setError(null);
    try {
      // Key transparency: the key sent to this signed-in voter must equal the election's published key.
      const [key, anchor] = await Promise.all([Voting.credentialKey(electionId), Public.credentialKey(electionId)]);
      const fingerprint = await verifyElectionCredentialKey(electionId, key, anchor);
      // Reuse a pending blinded request after an interrupted attempt: the server returns the same signature.
      let pending = getCredential(electionId);
      if (!pending?.blindedMessageHex || pending.keyFingerprint !== fingerprint) {
        pending = { ...(await prepareCredential(key)), keyFingerprint: fingerprint };
        if (!saveCredential(electionId, pending)) throw new Error('This browser cannot store the credential; enable site storage to vote.');
      }
      const issued = await Voting.issueCredential(electionId, pending.blindedMessageHex);
      const signatureHex = unblind(issued.blindSignatureHex, pending.blindingFactorHex, key);
      if (!(await verifyCredential(pending.tokenHex, signatureHex, key))) {
        throw new Error('The credential returned by the server did not verify. Do not vote; contact the election auditor.');
      }
      const stored = { tokenHex: pending.tokenHex, signatureHex, keyFingerprint: fingerprint };
      saveCredential(electionId, { ...stored, blindingFactorHex: null, blindedMessageHex: null });
      setCredential(stored);
    } catch (e) {
      setError(e?.code?.startsWith?.('KEY_') ? `${e.message} (${e.code})` : errorCode(e) === 'CREDENTIAL_ALREADY_ISSUED'
        ? 'A credential was already issued to your account, and this browser does not hold it. DigiVote cannot issue a second one, because that would allow voting twice. Use the browser where you started voting.'
        : errorMessage(e, e.message));
    } finally {
      setBusy(false);
    }
  };

  const castBallot = async () => {
    setBusy(true);
    setError(null);
    try {
      const nonce = credential.submissionNonce ?? randomNonceHex();
      saveCredential(electionId, { submissionNonce: nonce }); // persisted first so a retry is recognized as the same submission
      const result = await Voting.castBallot(electionId, {
        tokenHex: credential.tokenHex,
        signatureHex: credential.signatureHex,
        selections: selected,
        submissionNonce: nonce,
      });
      saveReceipt(result);
      saveCredential(electionId, { spent: true });
      setReceipt(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const attemptDuplicate = async () => {
    setDuplicateResult(null);
    const cred = getCredential(electionId);
    try {
      await Voting.castBallot(electionId, { tokenHex: cred.tokenHex, signatureHex: cred.signatureHex, selections: [0], submissionNonce: randomNonceHex() });
      setDuplicateResult({ kind: 'error', text: 'Unexpected: a second ballot was accepted. Report this to the auditor.' });
    } catch (e) {
      setDuplicateResult({ kind: 'success', text: `Duplicate rejected by the server: ${errorMessage(e)}` });
    }
  };

  if (eligibility.loading) return <Loading label="Checking your eligibility…" />;
  if (eligibility.error) return <ErrorState message={eligibility.error} onRetry={eligibility.reload} />;
  const elig = eligibility.data;

  if (receipt) {
    return (
      <div className="space-y-5">
        <PageHeader title="Vote recorded" subtitle="Your ballot was accepted, encrypted and added to the public bulletin board." />
        <Steps current={4} />
        <Alert kind="success" title="Thank you for voting">Your choice is not stored with your identity and is not part of this receipt.</Alert>
        <ReceiptCard receipt={receipt} />
        {getCredential(electionId)?.tokenHex && (
          <Card title="Demonstrate the one-vote guarantee">
            <p className="text-sm text-slate-600">Try to submit another ballot with the same anonymous credential. The server must reject it.</p>
            <Button variant="secondary" className="mt-3" onClick={attemptDuplicate}>Attempt a duplicate vote</Button>
            {duplicateResult && <div className="mt-3"><Alert kind={duplicateResult.kind}>{duplicateResult.text}</Alert></div>}
          </Card>
        )}
        <Link to="/app/my-elections" className="text-sm font-medium text-navy-700">← Back to my elections</Link>
      </div>
    );
  }

  if (!elig.mayVote || !elig.votingOpen) {
    return (
      <div>
        <PageHeader title="Cast your vote" />
        <Steps current={0} />
        <Alert kind="warning" title="You cannot vote in this election right now">
          <ul className="list-disc pl-5">{elig.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </Alert>
      </div>
    );
  }

  if (!hasCredential) {
    return (
      <div className="space-y-5">
        <PageHeader title="Cast your vote" subtitle="Step 2: obtain an anonymous voting credential." />
        <Steps current={1} />
        <Card title="Anonymous voting credential">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Your browser creates a random secret token and hides (blinds) it.</li>
            <li>DigiVote confirms you are eligible and signs the hidden token, without being able to see it.</li>
            <li>Your browser removes the blinding. The signed token proves you may vote, but not who you are.</li>
          </ol>
          <p className="mt-3 text-sm text-slate-600">You can obtain only one credential per election. Keep this browser open until you have voted.</p>
          {error && <div className="mt-4"><Alert kind="error">{error}</Alert></div>}
          <Button className="mt-4" busy={busy} onClick={obtainCredential}>Obtain anonymous credential</Button>
        </Card>
      </div>
    );
  }

  const notaIndex = ballot?.options.find((o) => o.nota)?.index;
  const chosen = ballot?.options.filter((o) => selected.includes(o.index)) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title={ballot?.title ?? 'Ballot'} subtitle={ballot ? `Select up to ${ballot.maxSelections} option(s). Voting closes ${formatDateTime(ballot.votingEnd)}.` : ''} />
      <Steps current={2} />
      <Alert kind="info">
        You hold a valid anonymous credential. The ballot is submitted without your login, so the server cannot link it to you.
      </Alert>
      {error && <Alert kind="error">{error}</Alert>}
      {!ballot && !error && <Loading label="Loading ballot…" />}
      {ballot && (
        <fieldset>
          <legend className="sr-only">Ballot options</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {ballot.options.map((o) => {
              const isSelected = selected.includes(o.index);
              return (
                <label key={o.index} className={`flex cursor-pointer items-center gap-4 rounded-lg border p-4 shadow-sm transition-colors ${isSelected ? 'border-navy-900 bg-panel-2 ring-2 ring-navy-900' : 'border-slate-200 bg-panel hover:border-navy-600'}`}>
                  <input
                    type={ballot.maxSelections === 1 ? 'radio' : 'checkbox'}
                    name="ballot"
                    className="h-5 w-5"
                    checked={isSelected}
                    onChange={() => setSelected(toggleSelection(selected, { ...o, notaIndex }, ballot.maxSelections))}
                  />
                  {o.photoUrl ? <AuthImage src={o.photoUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                    : <div className="grid h-14 w-14 place-items-center rounded-md bg-accent-soft text-lg font-semibold text-navy-800">{o.nota ? '∅' : o.label[0]}</div>}
                  <span>
                    <span className="block font-semibold text-navy-900">{o.label}</span>
                    <span className="text-xs text-slate-500">{o.nota ? 'None Of The Above' : `Ballot position ${o.index + 1}`}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button size="lg" disabled={selected.length === 0} onClick={() => setConfirming(true)}>Review and confirm</Button>
            <span className="text-sm text-slate-500">{selected.length} of {ballot.maxSelections} selected</span>
          </div>
        </fieldset>
      )}
      <ConfirmDialog open={confirming} title="Confirm your vote" confirmLabel="Cast my ballot" busy={busy}
        onCancel={() => setConfirming(false)} onConfirm={castBallot}>
        <p>You are voting for:</p>
        <ul className="mt-2 list-disc pl-5 font-semibold text-navy-900">{chosen.map((o) => <li key={o.index}>{o.label}</li>)}</ul>
        <p className="mt-3">An accepted ballot cannot be changed. Your choice is encrypted immediately and is not linked to your identity.</p>
      </ConfirmDialog>
    </div>
  );
}
