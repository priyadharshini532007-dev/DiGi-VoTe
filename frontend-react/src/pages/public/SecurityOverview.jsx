const SECTIONS = [
  ['Identity is separated from ballots',
    'Eligibility and credential issuance live in identity tables (users, eligible_voters, voting_credentials). Ballots, encrypted votes, spent tokens, receipts and bulletin entries live in anonymous tables that store no user id, email or credential reference. Ballot submission is sent without any login token.'],
  ['Blind-signed credentials',
    'Your browser creates a random token, blinds it and asks the server to sign the blinded value after checking your eligibility. Your browser removes the blinding and later presents the token with your ballot. The server can check the signature but cannot tell which voter it issued it to.'],
  ['One vote per credential',
    'Each eligible voter can obtain one credential. Each credential can be spent once: the spent-token table has a unique constraint and ballot acceptance is serialized per election inside one database transaction.'],
  ['Encrypted ballots and tallying',
    'Each ballot is stored as one Paillier ciphertext per option. Results are computed by multiplying ciphertexts (homomorphic addition) and decrypting only the per-option totals.'],
  ['Receipts and the bulletin board',
    'A receipt proves that a ballot was recorded on the public, hash-chained bulletin board, and after tallying that it was in the aggregated set. It never reveals the choice.'],
  ['Tamper-evident audit log',
    'Audit records are hash-chained and protected by database triggers against update and delete. Recomputing the chain detects modification, removal and truncation.'],
];

const LIMITS = [
  'The server sees each selection briefly in memory while validating and encrypting it. Selections are never stored in plaintext, logged, or linked to an identity.',
  'Tally decryption has no zero-knowledge proof; auditors can verify the aggregation of ciphertexts but must trust the decryption.',
  'Ballots cast since the October 2026 anonymity update, and their receipts, store no time and no per-ballot audit event; ballots reach the public bulletin board only in shuffled batches (and the rest when voting closes). A ballot is hidden among the ballots of its batch, so small elections and small final batches give small anonymity sets.',
  'Ballots cast before that update keep their original records: sequential ids, minute timestamps and per-ballot audit events. An administrator who can read the database or audit log may still be able to link those voters to their ballots.',
  'These protections cover stored data. Someone watching the database, server or network in real time while voting is open, or reading proxy and database logs, could still match a credential request with the ballot that follows it.',
  'Your browser checks that the election key you receive matches the key published for everyone, and remembers it. Both are served by the DigiVote server, so a server that lies the same way to a first-time voter is only caught when the fingerprint is compared through an independent channel (another device, the audit report, a published copy).',
  'DigiVote does not provide coercion resistance: a voter could be forced to vote in front of someone.',
  'Hash chaining detects changes, but a privileged operator who rewrites the entire chain consistently is not prevented; publishing chain heads externally narrows this.',
];

export default function SecurityOverview() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-navy-900">Security overview</h1>
      <p className="mt-3 text-slate-600">What DigiVote guarantees, how, and where its guarantees end.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map(([t, d]) => (
          <div key={t} className="rounded-lg border border-slate-200 bg-panel p-5 shadow-sm">
            <h2 className="font-semibold text-navy-900">{t}</h2>
            <p className="mt-2 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-900">Known limitations</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-900">
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </div>
    </div>
  );
}
