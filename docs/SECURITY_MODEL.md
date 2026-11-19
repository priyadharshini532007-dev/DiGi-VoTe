# DigiVote Security Model

This document states what DigiVote actually guarantees, how, and where the guarantees stop. Nothing here claims end-to-end verifiability or coercion resistance: neither is implemented.

## 1. Threat model

| Actor | Can | Must not be able to |
|---|---|---|
| Outside attacker | Call public endpoints, guess receipt codes, replay requests, upload files as a candidate if they steal a session | Vote without a credential, vote twice, learn choices, alter results |
| Voter | Obtain one credential, cast one ballot, verify own receipt | Vote twice, change an accepted ballot, see others' votes |
| Candidate | Edit own profile/manifesto until voting opens | Approve candidates, see voter identities or intermediate counts, edit after freeze |
| Election administrator | Run the lifecycle of assigned elections, see who obtained a credential | See individual choices, modify accepted ballots, change published results, delete audit history |
| Organization owner | Manage members and all elections of the organization | Same restrictions as administrators on ballots, results and audit |
| Auditor | Read and verify | Change anything |
| Database operator (privileged) | Read and write tables directly | Read choices from ballots (Paillier ciphertexts), forge credentials (needs the RSA key, sealed with the master key). **Can** bypass application rules, see stored data, and, with the master key, decrypt individual ballots. See limitations. |

Assumptions: TLS in front of the API in any real deployment; the master key and JWT secret are kept outside the database (environment or secret manager); the server software is not maliciously modified.

## 2. Authentication

* **Passwords**: BCrypt (cost 12). Organization policy sets minimum length (8–128) and lockout threshold (3–20 failures, 15-minute lock). Unknown emails are checked against a random BCrypt hash so timing does not reveal account existence; all failures return the same message.
* **Session tokens**: HS256 JWT (`auth/JwtService.java`) carrying only the user id, issuer, expiry (default 120 minutes) and a random id. Roles are resolved from the database on each request.
* **Invitations**: one-time 60-bit codes (`XXXX-XXXX-XXXX`), stored as SHA-256, expiring after 7 days. Accepting an invitation into a second organization requires the existing account password.
* **Firebase Authentication** (Google and Email/Password): passwords for Firebase accounts are handled only by Firebase; DigiVote stores none for them. The backend verifies every Firebase ID token with the Admin SDK (`verifyIdToken(token, checkRevoked=true)`: signature, project `digi-vote-be516`, expiry, revocation) and rejects tokens whose email is not verified (`EMAIL_NOT_VERIFIED`). Linking rules (`AuthService`): a Firebase uid already linked signs in to its account; otherwise an *active* DigiVote account with the same verified email is linked once; an account linked to a different uid is never relinked (`ALREADY_LINKED`); invited accounts must present their activation code (`/api/auth/firebase/activate`, which also requires the verified email to equal the invited email); organization registration with Firebase creates a new owner only if no account uses that email. Firebase never creates memberships or grants roles; rejected tokens are recorded as security events.
* **Firebase App Check** (optional): `firebase/AppCheckFilter.java` verifies App Check JWTs (RS256 against Google's JWKS, issuer and audience bound to the project number) on login, registration and ballot submission.

## 3. Authorization

`access/AccessControlService.java` is the only authority. For every protected call it loads the caller's active membership in the target organization, builds the role object (`UserFactory`), checks the permission, and for election operations checks that the caller operates that election (owners operate all elections of their organization; administrators only assigned ones). Non-members receive **404** (identifiers cannot be probed) and a `CROSS_ORG_ACCESS` security event; insufficient roles receive **403** and an `AUTHORIZATION_DENIED` event. Object ownership is checked for candidate profiles, manifestos, media, applications and notifications (IDOR protection). Frontend guards are cosmetic.

## 4. Anonymous voting

### Separation of identity and ballots

* Identity side: `users`, `organization_memberships`, `eligible_voters`, `voting_credentials` (stores only the hash of the blinded request and the blind signature).
* Anonymous side: `ballots`, `votes`, `voting_tokens`, `verification_receipts`, `bulletin_board_entries`. No user id, email, membership, credential id, IP address or request id is stored there; the schema test enforces it.

Separate tables alone do not create anonymity. What makes the link unrecoverable from stored data is the **blind signature**:

### Credential issuance (Chaum RSA blind signatures, RSA-FDH)

1. The browser creates a random 32-byte token `t` and computes `m = FDH(t)` where FDH is MGF1-SHA-256 over `"DIGI-VOTE-FDH-v1" || t`, reduced below `2^(|n|-1)`.
2. It blinds: `m' = m · r^e mod n` with a fresh random `r`, and sends `m'` with its session token.
3. The server checks eligibility and the per-voter uniqueness, and returns `s' = m'^d mod n` (Bouncy Castle `RSAEngine`, CRT).
4. The browser unblinds `s = s' · r⁻¹ mod n` and checks `s^e ≡ FDH(t)`.
5. The ballot is sent **without any Authorization header** (the API rejects ballots that carry one) as `(t, s, selections, nonce)`.

`m'` is uniformly distributed and independent of `t`, so the issuance record (`voting_credentials`) cannot be matched with the spent token (`voting_tokens`) by looking at stored values. Implementations: `crypto/BlindRsa.java`, `frontend/src/crypto/blindRsa.js` (same FDH test vector asserted in both test suites).

### One-vote guarantee

* One credential per eligible voter: row lock on `eligible_voters` + UNIQUE(`voting_credentials.eligible_voter_id`). Re-sending the *identical* blinded request returns the same signature (safe retry); a different request is refused.
* One ballot per credential: the ballot transaction serializes on the election's keys row, checks `voting_tokens` for `SHA-256("DIGI-VOTE-TOKEN|election|t")`, and inserts it under UNIQUE(`election_id`,`token_hash`). Six concurrent submissions of one credential yield exactly one accepted ballot (integration test).
* Safe retry: the client stores a random `submissionNonce` before sending; re-sending the same token and nonce returns the original receipt (`replayed: true`) without creating anything. A different nonce is a duplicate and is rejected and recorded.
* Credential expiry: ballots are accepted only in the VOTING state and inside the persisted voting window; credentials are useless afterwards (`CREDENTIAL_EXPIRED`). The one exception is an exact retry (same credential and same submission nonce) of a ballot that was accepted before voting closed: it returns the stored receipt and writes nothing, so a response lost in the closing race can be recovered.
* "Has voted" is never recorded against a person. The identity side only records that a credential was issued.

### Correlation risks and mitigations (P1, 2026-10-11)

**The defect that was fixed.** Until 2026-10-11 every accepted ballot wrote a `BALLOT_ACCEPTED {"bulletinSeq": k}` event into the organization's audit chain, immediately after the voter's own `CREDENTIAL_ISSUED actor=user:N` event; ballots, votes, spent tokens and receipts also had auto-increment ids in acceptance order. An owner, administrator or auditor could therefore pair each named voter with a specific ballot (the choice itself stays Paillier-encrypted). `AnonymityIT` reproduces this attack: run against the old code it paired 8 of 8 voters.

**What DigiVote does now.**

| Correlation path | Now |
|---|---|
| Audit adjacency (`CREDENTIAL_ISSUED` next to a per-ballot event) | No per-ballot audit event is written. Ballots are audited only as batches: `BALLOTS_PUBLISHED {published, trigger}` (no actor; minute precision) when a shuffled batch reaches the bulletin board, and once more when voting closes. Historic `BALLOT_ACCEPTED` records stay in the chain (audit history is never rewritten). |
| Row ids (`ballots`, `votes`, `voting_tokens`, `verification_receipts`) | Random 63-bit ids (`voting/AnonymousIds`), so primary-key order carries no acceptance order. |
| Bulletin-board sequence | Ballots are not appended when accepted. Waiting ballots are published in a SecureRandom-shuffled batch once at least `digivote.anonymity.bulletin-batch-size` (default 10) are waiting, and all remaining ballots as a final shuffled batch when voting closes. Publication runs under the per-election ballot lock (lock order everywhere: `election_keys` row, then `elections` row), so no ballot is published twice or skipped; ballots that waited for the lock while voting closed are refused cleanly (`CREDENTIAL_EXPIRED`), and results require every accepted ballot to be on the board. |
| Timestamps | New ballots and receipts store no time (V4 migration made the columns nullable). Bulletin entries carry the publication minute of their batch, identical for the whole batch. |
| Selection count | New ballots no longer store how many options were chosen (relevant to approval elections). |
| Ballot request identity | Unchanged: no session token; requests carrying `Authorization` are refused. |
| Logs / API | No per-ballot log lines; no API returns ballot ids, insertion order or per-ballot times. |

**Who can read what.** The organization audit chain (owner, administrators, auditors) proves the order and integrity of identity-side and administrative events, including who obtained a credential and when, and that batches of N ballots were published. It no longer contains anything that names a ballot. The bulletin board (public) proves the set and integrity of published ballot commitments; its order is a random permutation within each batch.

**Remaining correlation risks (not eliminated).**

* Batch membership: a voter whose credential was issued since the previous publication is known to be in the next batch, so each ballot hides among the ballots of its batch (an attacker guessing a voter's position inside a batch of size B is right with probability about 1/B) (at least the batch size during voting; the final batch at close can be smaller). Small elections give small anonymity sets.
* A live observer with continuous database, server-memory or network access can still watch a ballot row appear right after a credential request. Random ids and batching defeat after-the-fact analysis of stored data, not real-time surveillance; mixnets or client-side delays would be needed.
* The live participation count (`sp_election_participation`) rises as ballots are accepted; polling it next to credential issuance reveals *that* a voter voted soon after, not which ballot.
* Infrastructure outside the application (reverse-proxy logs with IPs and times, MySQL general/binary logs, backups taken during voting) can correlate requests; deployers must disable or separate such logs.
* Ballots accepted before V4 (historic elections, or the part of an election cast before the upgrade) keep their sequential ids, times and `BALLOT_ACCEPTED` events and remain linkable by an administrator.
* Random ids and coarse times alone do not guarantee anonymity; the guarantee rests on blind signatures plus the absence of the ordering channels above, under the stated assumptions.

## 5. Ballot encryption and tallying (Paillier)

* Per-election Paillier key (`n` 2048 bits in production, `g = n + 1`), generated when voting opens.
* Each ballot is stored as one ciphertext per option: `Enc(1)` for chosen options, `Enc(0)` otherwise. Encryption is randomized, so equal ballots have different ciphertexts.
* **Encryption happens on the server** after the selection is validated against the rules. Client-side encryption would require zero-knowledge proofs that each ciphertext encrypts 0 or 1; those are not implemented, so the server validates the plaintext selection in memory, encrypts it immediately, and never stores or logs it.
* Tally: per option, multiply all ciphertexts mod `n²` (homomorphic addition) and decrypt only that aggregate. Totals are cross-checked against the number of accepted ballots and recorded selection counts; the bulletin chain is verified before tallying.
* Auditors can recompute every ballot commitment from its ciphertexts and re-multiply the aggregates (`GET /api/elections/{id}/integrity/aggregation`). **Decryption correctness is not proven** (no zero-knowledge proof of correct decryption).

## 6. Receipts and the bulletin board

* Ballots reach the board only in shuffled batches (see section 4). Bulletin entry: `seq`, ballot commitment `SHA-256("DIGI-VOTE-BALLOT-v1|election|c0|…|cK")`, previous hash, entry hash `SHA-256("DIGI-VOTE-BB-v1|election|seq|commitment|prev")`, minute. Genesis hash `SHA-256("DIGI-VOTE-BB-GENESIS|election")`.
* Results record the bulletin head hash they were computed over.
* Receipt statuses and what they prove:

| Status | Proves |
|---|---|
| `INVALID_RECEIPT` | Code is malformed or its check character fails; nothing was looked up |
| `RECEIPT_NOT_FOUND` | No accepted ballot carries this code |
| `RECEIPT_RECOGNIZED` | While voting is open: the ballot was accepted and awaits publication in a shuffled bulletin batch (position withheld until then) |
| `BALLOT_RECORDED` | The ballot is on the bulletin board and the chain verifies |
| `INCLUDED_IN_TALLY` | Additionally, results were computed over a bulletin head that includes it, i.e. its ciphertexts were in the decrypted aggregate (server-attested; no decryption proof) |
| `VERIFICATION_UNAVAILABLE` | The bulletin chain failed verification, or the ballot is still missing after voting closed (integrity alert); no positive claim is made |

The QR code encodes only `PUBLIC_BASE_URL/verify?code=<receipt code>`.

## 7. Tamper-evident audit log

Canonical form (`audit/AuditHasher.java`), fields joined by `\n`: `DIGI-VOTE-AUDIT-v1`, chain key, seq, event id, event type, ISO-8601 UTC instant (ms), organization id or `-`, election id or `-`, actor or `-`, metadata JSON (sorted keys), previous hash. Record hash = SHA-256. One chain per organization (`ORG-{id}`) plus `SYSTEM`. Database triggers block UPDATE and DELETE. `AuditIntegrityService` recomputes from genesis and reports modified records, sequence gaps, broken links and head mismatches (truncation).

**Limitation**: hash chaining detects changes; it does not prevent a privileged actor from rewriting the whole chain and its head consistently. Publishing chain heads outside the database (e.g. in reports, or an external timestamping service) narrows this; DigiVote records head hashes in report snapshots and results but does not anchor them externally.

## 8. Key management

| Key | Generation | Storage | Access | Rotation |
|---|---|---|---|---|
| JWT secret | `DIGIVOTE_JWT_SECRET` (≥ 32 bytes) | Environment / secret manager; dev mode generates `.local/dev-jwt.key` | `JwtService` | Rotating invalidates all sessions (users sign in again) |
| Master key | `DIGIVOTE_MASTER_KEY` (32 random bytes) | Environment / secret manager; dev mode generates `.local/dev-master.key` | `KeyVault` only | Not supported in place: re-sealing existing election keys would need a migration tool. Back the key up; losing it makes tallying open elections impossible. |
| Election RSA key (2048-bit) | Bouncy Castle `RSAKeyPairGenerator`, when voting opens | Public in `election_keys`; private AES-256-GCM sealed with AAD `digi-vote:election:{id}:rsa` | Credential issuance only | Never during an election (would invalidate issued credentials) |
| Election Paillier key (2048-bit) | `Paillier.generate` with `SecureRandom` | Public in `election_keys`; private sealed with AAD `…:paillier` | Tally only | Never during an election |
| Receipt key | HMAC-SHA256(master, `receipt-codes-v1`) | Derived in memory | `ReceiptCodes` | Follows master key |

### Credential-key transparency (P3, 2026-10-11)

Threat: blind signatures hide which credential a voter received, but a dishonest server could give each voter a *different* signing key and later recognize a voter's ballot by which key its signature verifies under (key tagging).

* **One key per election.** `election_keys` holds exactly one RSA key per election, generated when voting opens; triggers `trg_election_keys_no_update` / `_no_delete` make it immutable.
* **Canonical fingerprint** (`crypto/CredentialKeyFingerprint`): SHA-256 of `DIGI-VOTE-CREDENTIAL-KEY-v1\nprotocol=RSA-FDH-BLIND/MGF1-SHA256/DIGI-VOTE-FDH-v1\nelection=<id>\nn=<hex>\ne=<hex>`, binding key, protocol version and election. Java and the browser share a test vector.
* **Publication.** `GET /api/public/elections/{id}/credential-key` is unauthenticated and identical for every caller; the fingerprint is also written to the audit chain when the key is generated (`ELECTION_KEYS_GENERATED.publicKeyFingerprintV1`) and listed on `GET /api/public/elections`.
* **Browser check** (`frontend/src/crypto/keyTransparency.js`, used before blinding): validates the key's shape (>= 2048-bit odd modulus, e = 65537, version, protocol, election), recomputes the fingerprint, requires the signed-in key to equal the anonymous public anchor, and pins the fingerprint per election in the browser; any mismatch or change stops the flow with an explanation (fail closed).
* **Remaining trust.** The same server serves both the signed-in key and the public anchor. A server that can distinguish requests (by IP, cookies or timing) could still lie consistently to one browser. The check makes substitution detectable whenever the fingerprint is compared through an independent channel: the audit chain, another device, the auditor's report or a fingerprint published outside DigiVote. External publication is not automated.

## 9. Input and upload safety

Bean Validation on every request DTO; central error handler returns codes without stack traces or SQL. Uploads: allow-listed types per media kind (PNG/JPEG, PDF, MP4), magic-byte check (renamed HTML/SVG/scripts rejected), 10 MB limit, random storage keys, sanitized display filenames, path-traversal-safe local storage, `X-Content-Type-Options: nosniff` and `Content-Disposition` on download. Rejections are security events. Security headers: CSP, `X-Frame-Options: DENY`.

## 10. Known limitations (honest summary)

1. No coercion resistance or receipt-freeness against a coercer who watches the voter.
2. No end-to-end verifiability: there are no zero-knowledge proofs of ballot well-formedness or of correct decryption; the server encrypts ballots and decrypts tallies.
3. Ordering and timing correlation from stored data is removed for new ballots (P1); batch-level membership, real-time observation and infrastructure logs remain (section 4).
4. A privileged operator holding the master key and the database could decrypt individual ballots (still not linked to identities by data) and could rewrite the audit chain consistently.
5. RSA-FDH blind signatures are used instead of the newer RFC 9474 (RSABSSA-PSS); both are established constructions.
6. Credentials live in the voter's browser storage; clearing it before voting loses the credential (the server deliberately cannot reissue it).
7. Session tokens are stored in `localStorage`; an XSS flaw would expose them. CSP and React escaping mitigate this.
8. Firebase Authentication is tested against the Firebase Auth emulator; live sign-in, Storage, Cloud Messaging, App Check and Hosting have not been exercised against the live project yet.
