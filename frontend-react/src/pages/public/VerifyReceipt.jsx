import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Public } from '../../api/endpoints.js';
import { errorMessage } from '../../api/client.js';
import Icon from '../../components/icons.jsx';
import { Alert, Button, Card, DefinitionList, Hash, Input, PageHeader, StatusBadge } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

/** Presentation of each outcome the verifier can return. Wording never claims more than the server confirmed. */
export const VERIFY_STATES = {
  RECEIPT_RECOGNIZED: {
    title: 'Receipt found: verification pending', kind: 'info', icon: 'clock',
    next: 'Check again once voting has closed. Your ballot is added to the public bulletin board in a shuffled batch to protect your anonymity.',
  },
  BALLOT_RECORDED: {
    title: 'Vote recorded', kind: 'success', icon: 'checkCircle',
    next: 'Check again after results are generated to confirm your ballot was included in the tally.',
  },
  INCLUDED_IN_TALLY: {
    title: 'Vote counted', kind: 'success', icon: 'checkCircle',
    next: 'Nothing more to do. You can compare the result hash below with the published results.',
  },
  INVALID_RECEIPT: {
    title: 'Invalid receipt', kind: 'error', icon: 'error',
    next: 'Check the code for typos (the last character is a check digit) and try again.',
  },
  RECEIPT_NOT_FOUND: {
    title: 'Receipt not found', kind: 'error', icon: 'error',
    next: 'Make sure you are using the code from your own receipt. If you voted, contact the election auditor.',
  },
  VERIFICATION_UNAVAILABLE: {
    title: 'Verification unavailable', kind: 'warning', icon: 'warning',
    next: 'Try again later.',
  },
  INTEGRITY_WARNING: {
    title: 'Integrity warning', kind: 'error', icon: 'error',
    next: 'Report this to the election auditor with your receipt code. Do not discard your receipt.',
  },
};

export function verifyStateFor(result) {
  if (result.status === 'VERIFICATION_UNAVAILABLE'
    && (result.checks ?? []).some((c) => /FAILED|missing from the bulletin/i.test(c))) {
    return VERIFY_STATES.INTEGRITY_WARNING;
  }
  return VERIFY_STATES[result.status] ?? VERIFY_STATES.VERIFICATION_UNAVAILABLE;
}

export function ReceiptResult({ result }) {
  const state = verifyStateFor(result);
  return (
    <Card title="Verification result" actions={<StatusBadge status={result.status} />}>
      <Alert kind={state.kind} title={state.title}>
        <p>{result.meaning}</p>
      </Alert>
      <p className="mt-3 text-sm text-slate-700"><strong>Next:</strong> {state.next}</p>
      {result.electionId && (
        <div className="mt-5">
          <DefinitionList items={[
            ['Election', result.electionTitle],
            ['Election status', result.electionStatus],
            ['Bulletin board position', result.bulletinSeq ?? 'Not yet published (shuffled batch)'],
            result.recordedAtMinute && ['Recorded (to the minute)', formatDateTime(result.recordedAtMinute)],
            ['Ballot commitment', <Hash value={result.ballotCommitment} len={28} />],
            ['Bulletin entry hash', <Hash value={result.entryHash} len={28} />],
            result.resultHash && ['Result hash', <Hash value={result.resultHash} len={28} />],
          ]} />
          {result.checks?.length > 0 && (
            <ul className="mt-5 space-y-1 text-sm text-slate-700">
              {result.checks.map((c) => <li key={c}>✓ {c}</li>)}
            </ul>
          )}
          <p className="mt-5 flex flex-wrap gap-4 text-sm">
            <Link className="font-medium text-navy-700 hover:underline" to={`/elections/${result.electionId}/bulletin`}>Open the public bulletin board</Link>
            {result.status === 'INCLUDED_IN_TALLY' && (
              <Link className="font-medium text-navy-700 hover:underline" to={`/elections/${result.electionId}/results`}>Open published results</Link>
            )}
          </p>
        </div>
      )}
    </Card>
  );
}

const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window;

function codeFromScan(raw) {
  try {
    const url = new URL(raw);
    return url.searchParams.get('code') ?? raw;
  } catch {
    return raw;
  }
}

export default function VerifyReceipt({ embedded = false }) {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState(null);
  const fileRef = useRef(null);

  const verify = async (value) => {
    if (!value.trim()) {
      setError('Enter the receipt code printed on your receipt.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await Public.verifyReceipt(value.trim()));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (params.get('code')) verify(params.get('code'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanImage = async (e) => {
    const file = e.target.files?.[0];
    setScanMessage(null);
    if (!file) return;
    if (!canScan) {
      setScanMessage('This browser cannot read QR images. Type the code printed under the QR instead.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const found = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
      if (!found.length) {
        setScanMessage('No QR code was found in that image. Try a sharper photo, or type the code.');
        return;
      }
      const scanned = codeFromScan(found[0].rawValue);
      setCode(scanned);
      verify(scanned);
    } catch {
      setScanMessage('That image could not be read. Type the code instead.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const body = (
    <>
      <PageHeader title="Verify a ballot receipt" subtitle="Enter your receipt code or scan the QR code on your receipt. Verification never reveals how you voted." />
      <Card>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); verify(code); }}>
          <label htmlFor="receipt" className="sr-only">Receipt code</label>
          <Input id="receipt" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-X" value={code} onChange={(e) => setCode(e.target.value)} className="mono uppercase" autoComplete="off" />
          <Button type="submit" busy={busy}>Verify</Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="receipt-qr" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 font-medium text-navy-900 hover:bg-slate-50">
            <Icon name="qr" className="h-4 w-4" /> Read a QR image
          </label>
          <input id="receipt-qr" ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={scanImage} />
          {scanMessage && <span className="text-slate-600" role="status">{scanMessage}</span>}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          “Receipt found” means your ballot was accepted and awaits publication in a shuffled batch.
          “Vote recorded” means your ballot is on the public bulletin board. “Vote counted” additionally means
          the results were computed over a bulletin board that contains it.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Privacy: this lookup sends only the receipt code. The receipt contains no candidate and no identity, and the server cannot reveal either.
        </p>
      </Card>
      {error && <div className="mt-5"><Alert kind="error">{error}</Alert></div>}
      {result && <div className="mt-5"><ReceiptResult result={result} /></div>}
    </>
  );

  return embedded ? <div className="mx-auto max-w-3xl">{body}</div> : <div className="mx-auto max-w-3xl px-4 py-10">{body}</div>;
}
