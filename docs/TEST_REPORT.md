# DigiVote Test Report

Run on 2026-10-10, macOS (Apple silicon), Java 21.0.12 (Homebrew), Maven 3.9.16, Node 26.10, MySQL 9.7.1 (private development instance started by `scripts/dev-mysql.sh`).

## Summary

| Suite | Command | Result |
|---|---|---|
| Backend unit tests | `cd backend && mvn test` | **61 passed**, 0 failed |
| Backend MySQL integration tests | (same command; `*IT` classes) | **25 passed**, 0 failed |
| Frontend tests (Vitest + Testing Library) | `cd frontend && npm test` | **20 passed** in 5 files |
| Frontend production build | `cd frontend && npm run build` | Succeeds (one bundle-size warning: main chunk ~620 kB) |
| End-to-end API workflow | `node scripts/e2e-workflow.mjs` against a running backend | **34 of 34 steps passed** |
| Manual browser walkthrough | Built-in browser against Vite dev server | Voter obtained a blind credential in the browser, voted, got receipt + QR, duplicate rejected, receipt verified; admin closed voting, generated and published results; Trust Dashboard all PASS; auditor verified the audit chain and generated an election report |
| Secret scan | `scripts/check-secrets.sh` | No secrets in tracked files |

Total backend: **86 tests, 0 failures, 0 skipped** (`Tests run: 86, Failures: 0, Errors: 0, Skipped: 0`, BUILD SUCCESS). The concurrency test was additionally repeated three times in isolation without failure.

## Backend unit tests (no database)

| Class | Tests | Covers |
|---|---|---|
| `crypto/PaillierTest` | 8 | Textbook test vector (p=293, q=433, Enc(42)), round trips, randomized encryption, homomorphic sum of 6 ballots, identity element, invalid ciphertext/plaintext rejection, minimum key size, no key material in `toString` |
| `crypto/BlindRsaTest` | 7 | Cross-language FDH vector (same vector in the frontend suite), full blind→sign→unblind→verify, signer cannot link blinded requests to the final signature, forged/mismatched signatures, other key, out-of-range input, weak key sizes |
| `crypto/KeyVaultTest` | 4 | AES-GCM seal/open, associated-data binding, wrong master key, key derivation |
| `election/RuleEngineTest` | 7 | Valid set; plurality/approval selection rules; invalid combinations (single candidate without NOTA, QR without receipts, non-anonymous, overlapping campaign, missing/inverted/past windows, late withdrawal deadline); ballot selection validation; window and withdrawal checks |
| `election/ElectionStateMachineTest` | 16 | All six valid transitions, nine invalid transitions, operations allowed per state |
| `result/CountingStrategyTest` | 7 | Plurality winner with zero-vote candidate ranked, tie (no winner), zero ballots, NOTA never wins, inconsistent totals rejected, approval bounds, strategy registry |
| `audit/AuditHasherTest` | 2 | Canonical hash determinism and sensitivity to every field; metadata sanitization strips secret-like keys |
| `access/RolePolymorphismTest` | 3 | Factory creates the five subclasses; permission matrix; polymorphic voting policy |
| `voting/ReceiptCodesTest` | 2 | Deterministic formatted codes; check character catches typos and garbage |
| `candidate/DomainInvariantsTest` | 5 | Frozen manifesto refuses edits; empty manifesto cannot publish; published results immutable; application workflow guards; malicious upload rejection (HTML as PNG, SVG, wrong PDF, oversize, empty) |

## Backend integration tests (real MySQL, `digivote_test`, schema cleaned and migrated at start)

| Class | Tests | Covers |
|---|---|---|
| `DatabaseIT` | 5 | Fresh-database migration (28 tables, 2 views, procedure, ≥15 triggers, 5 roles); anonymous tables have no identity columns or FKs; every trigger class; check and unique constraints (incl. duplicate spent token and duplicate eligibility); view and stored-procedure figures |
| `VotingWorkflowIT` | 11 | Full lifecycle with consistent results, repeated generation, result visibility before/after publication, published-result protection, receipt `BALLOT_RECORDED`→`INCLUDED_IN_TALLY`, aggregation check, Trust Dashboard; duplicate vote + safe retry + second credential refused; **6 concurrent submissions of one credential → exactly one ballot**; expired credential (clock moved past window, and after close); voting cannot open before its window; forged credential and invalid selections; ballot with identity refused; **failed persistence rolls back everything and the credential stays usable**; zero-ballot election; receipt `INVALID_RECEIPT`/`RECEIPT_NOT_FOUND`; audit chain verification and **corruption detection** |
| `SecurityIT` | 9 | Missing/invalid/forged tokens → 401 + security event; lockout after 5 failures (423) and generic errors for unknown accounts; role restrictions for voter, admin, candidate, auditor (403); cross-organization isolation (404); other users' manifesto/application/notifications; invalid rules (422) and transitions (409); manifesto freeze; malicious and path-traversal uploads; no secrets in responses, sealed private keys |

### Mandatory edge cases → tests

| # | Edge case | Test |
|---|---|---|
| 1 | Duplicate vote | `VotingWorkflowIT.duplicateVoteIsRejectedAndSafeRetryReturnsTheSameReceipt`; e2e step 18 |
| 2 | Concurrent duplicate vote | `VotingWorkflowIT.concurrentDuplicateSubmissionsAcceptExactlyOneBallot` |
| 3 | Expired voting credential | `VotingWorkflowIT.credentialExpiresWhenVotingCloses` |
| 4 | Invalid receipt | `VotingWorkflowIT.receiptVerificationOutcomes`; `ReceiptCodesTest`; e2e step 22 |
| 5 | Voting before opening time | `VotingWorkflowIT.votingCannotOpenBeforeTheWindowAndCredentialsCannotBeIssued` |
| 6 | Voting after closing time | `VotingWorkflowIT.credentialExpiresWhenVotingCloses` |
| 7 | Invalid state transition | `ElectionStateMachineTest`; `SecurityIT.invalidRulesAndTransitionsAreRejected`; e2e step 7 |
| 8 | Unauthorized role action | `SecurityIT.rolesCannotPerformOtherRolesActions`; e2e step 30 |
| 9 | Cross-organization access | `SecurityIT.organizationsAreIsolated` |
| 10 | Manifesto modification after freezing | `SecurityIT.manifestoFreezesWhenVotingOpens`; `DomainInvariantsTest`; `DatabaseIT` trigger; e2e step 12 |
| 11 | Published result modification | `VotingWorkflowIT.fullElectionLifecycle…`; `DatabaseIT` triggers; `DomainInvariantsTest`; e2e step 27 |
| 12 | Corrupted audit hash chain | `VotingWorkflowIT.auditChainRecordsTheElectionAndDetectsCorruption`; `AuditHasherTest` |
| 13 | Invalid ballot selection | `VotingWorkflowIT.invalidCredentialAndInvalidSelectionsAreRejected`; `RuleEngineTest` |
| 14 | Invalid authentication token | `SecurityIT.invalidOrMissingTokensAreRejected` |
| 15 | Failed ballot persistence | `VotingWorkflowIT.failedBallotPersistenceLeavesNoPartialStateAndRetrySucceeds` |
| 16 | Election with zero accepted ballots | `VotingWorkflowIT.electionWithZeroBallotsProducesNoWinner`; `CountingStrategyTest` |
| 17 | Candidate with zero votes | `VotingWorkflowIT.fullElectionLifecycle…`; `CountingStrategyTest` |
| 18 | Invalid election rules | `RuleEngineTest`; `SecurityIT.invalidRulesAndTransitionsAreRejected`; e2e step 5 |
| 19 | Repeated result generation | `VotingWorkflowIT.fullElectionLifecycle…`; e2e step 25 |
| 20 | Malicious file upload | `SecurityIT.maliciousUploadsAreRejectedAndRecorded`; `DomainInvariantsTest`; e2e step 10 |
| 21 | Sensitive-data exposure | `SecurityIT.responsesNeverExposeSecrets`; `DatabaseIT.anonymousTablesHoldNoIdentityColumns` |
| 22 | Another voter's resources | `SecurityIT.usersCannotTouchOtherUsersResources`, `rolesCannotPerformOtherRolesActions` |

### Defect found by the tests

`concurrentDuplicateSubmissionsAcceptExactlyOneBallot` initially failed: concurrent rejected ballots each recorded a security event, and the audit append used `INSERT IGNORE` before `SELECT … FOR UPDATE` on the chain head; two shared locks upgrading to exclusive deadlocked, turning some 409 answers into 500s. Fixed by locking the head first (insert only for a brand-new chain) and retrying rejection recording on transient lock errors. The one-vote guarantee itself held throughout (exactly one ballot was always stored).

## Frontend tests

| File | Tests | Covers |
|---|---|---|
| `src/crypto/blindRsa.test.js` | 3 | Same FDH vector as Java; blind/sign/unblind/verify against a real 2048-bit RSA key; fresh token and blinding per credential |
| `src/test/forms.test.jsx` | 4 | Login, registration and rule-form validation; empty login shows field errors |
| `src/test/navigation.test.jsx` | 5 | Landing page branding (no "VoteVeil"), auth redirect, 404 page, per-role home routes, voter cannot reach admin pages |
| `src/test/apiErrors.test.jsx` | 3 | Error message mapping; ballot client never sends the session token; receipt page error and success states |
| `src/test/voting.test.jsx` | 5 | Selection rules (single, approval max, NOTA exclusive); full CastBallot flow with real blind-signature math (credential → select → confirm → anonymous submit → receipt, stored receipt has no choice); ineligible voter reasons; no second credential |

## Firebase Authentication (added 2026-10-10)

| Suite | Result |
|---|---|
| `FirebaseAuthIT` (backend, real MySQL, Firebase token verification mocked) | **8 passed**: invalid and expired tokens (401 + security event), unverified emails never used, Firebase-only owner registration without a local password, sign-in without an account refused, one-time linking of an existing password account by verified email and refusal of a second Firebase identity, invitation acceptance requiring code + matching verified email (client-supplied role ignored, single-use code), one Firebase identity cannot be linked to two accounts, Firebase disabled → 503 |
| `src/test/firebaseAuth.test.jsx` (frontend) | **13 passed**: error messages; create account → verification required → continue only once verified; weak/mismatched passwords; duplicate account; unverified sign-in + resend; invalid credentials and backend rejections; Google; password reset email; preconditions; `/auth/action` verify, expired link, reset, invalid link |
| `frontend/scripts/firebase-auth-e2e.mjs` against the **Firebase Auth emulator** (real Firebase JS SDK + real Admin SDK verification in the backend) | **26 of 26 checks passed**: unverified email blocked for registration and sign-in; invalid / reused verification links; verification; Firebase registration; duplicate registration; wrong password; duplicate Firebase account; email sign-in; no DigiVote password for Firebase-only accounts; password reset (old password stops working, used link rejected); malformed, **expired** and **revoked** tokens rejected; Google sign-in cannot bypass an invitation; wrong code; Google invitation acceptance with role from the invitation; no privilege escalation; unverified Google email not linked; verified Google email links an existing password account; Google user without an account refused |
| Live project `digi-vote-be516` (configuration only) | Backend started with the real Admin SDK key (`/api/auth/config` → `firebaseEnabled: true`) and rejected a forged ID token (`FIREBASE_TOKEN_INVALID`); the browser, using the real web config on `http://localhost:5173`, reached Firebase Authentication and received "Incorrect email or password" for a non-existent test address. **No real account was created, no real email was sent, and no live Google sign-in was completed.** |

After these changes the full backend suite is **94 passed** (61 unit + 33 integration), frontend **33 passed**, the 34-step workflow passed again, and the secret scan is clean.

Not covered yet: an expired (as opposed to invalid) email-action link cannot be produced by the emulator (the UI message is unit-tested); live Google and Email/Password sign-in, real verification/reset emails, Firebase Storage, Cloud Messaging and App Check against the live project.

## Anonymity hardening P1 + key transparency P3 (2026-10-11)

| Suite | Result |
|---|---|
| `AnonymityIT` (real MySQL) | **4 passed**. Seven elections of 8 voters each: four sequential issue-then-vote runs (the interleaving where issuance order equals arrival order), plus issue-all-then-vote in reverse and random order and concurrent submissions. Exact checks in every run: original audit-adjacency attack pairs 0 voters, no `BALLOT_ACCEPTED` events, batch events carry no actor, no per-ballot times or selection counts, batches during voting cover ≥ 3 ballots, one publication minute per batch. Ordering attacks (k-th credential ↔ k-th row) are scored on the sequential runs against an exact null model: random ids give a uniformly random permutation (expected 1 correct per run), and a uniform shuffle inside a bulletin batch of size B is guessed correctly with probability 1/B (expected 1 per batch). Each channel must have p ≥ 10⁻⁶ under that model, and the test checks it has power: full pairing (what the old code produced) has p < 10⁻⁶. Typical run: `ballots.id` 3/32 (chance 4), `votes.id` 1/32, `voting_tokens.id` 4/32, `verification_receipts.id` 4/32 (chance 4 each), bulletin `seq` 12/32 (chance 12). False-failure probability below 5 × 10⁻⁶ per run. The control test still confirms the attack code fully pairs sequential metadata. |
| Same `AnonymityIT` run against the pre-fix commit `fccbc83` (scratch copy) | **Failed as expected**: the audit-adjacency attack paired 8 of 8 voters in each sequential run; with the exact checks skipped (scratch variant), the `ballots.id` ordering attack paired 32 of 32 (p ≈ 4 × 10⁻¹⁹) |
| `ClosureRaceIT` (real MySQL, real transactions) | **4 passed**. A final-batch test covers 0, 2, 3 and 7 ballots (no batch, fewer than a batch, exactly one batch, two batches plus a final batch of 1): pending receipts show `RECEIPT_RECOGNIZED`, the close publishes exactly the pending ones in one `BALLOTS_PUBLISHED` event, repeated close and reopening are refused with `INVALID_TRANSITION`, receipts become `BALLOT_RECORDED` and then `INCLUDED_IN_TALLY`. Two deterministic tests hold the `election_keys` row from a separate connection, queue ballots and the close behind it (confirmed in the processlist), then release it: ballots queued before the close are accepted and published in the final batch; ballots queued behind the close are refused with `CREDENTIAL_EXPIRED`. A repeated test runs 10 rounds of 5 ballots, 2 credential requests, a result generation and the close with seeded random start offsets (typically about 23 accepted and 27 rejected; results generated during 4 of 10 races always matched the final ballot count, otherwise refused with 409). After every race: no HTTP 500, every accepted ballot has its token record, receipt, ciphertexts and exactly one bulletin entry, an exact retry after close returns the same receipt while a new nonce is refused, rejected ballots left no rows, the hash chain verifies, results cannot be generated while ballots are unpublished, and the tally equals the bulletin count. Against the previous lock order the same tests failed with MySQL deadlocks (HTTP 500 on ballot inserts); with the new lock order but repeatable-read isolation the close failed on a duplicate bulletin sequence number |
| `KeyTransparencyIT` | **4 passed**: anonymous anchor equals the key given to each voter; fingerprint recomputed, audited and listed publicly; 404 before voting; stable across VOTING→PUBLISHED; database refuses key update/delete; 5 concurrent credential requests all signed by the published key; fingerprints differ per election |
| `CredentialKeyFingerprintTest` | **4 passed** (cross-language vector, canonical hex, election/protocol/key binding) |
| Frontend `keyTransparency.test.js` + updated `voting.test.jsx` | **8 new tests passed**: correct key, substituted key, fingerprint mismatch, key change after pinning, other election/protocol, malformed keys (missing, non-hex, short, even modulus, wrong exponent, missing fingerprint); UI fails closed on a substituted key without requesting a credential |
| Browser (dev stack, real vote page, XHR responses rewritten in the page) | Tampered modulus refused (`KEY_FINGERPRINT_MISMATCH`); a substituted key with a matching fingerprint on the signed-in endpoint refused (`KEY_SUBSTITUTED`); the same key on both endpoints after the browser had pinned the real fingerprint refused (`KEY_CHANGED`); no credential request was sent in these three cases. The same key on both endpoints with no pin (first contact) is not detected in the browser, as documented |
| HTTP race on the dev stack | 4 rounds of 5 ballots fired together with the close: all 20 accepted and published, results generated for 5 ballots each, no HTTP 500 (before the fix all 20 failed with deadlocks) |

Totals after the change: backend **110 passed** (61 + 4 unit, 45 integration; `ClosureRaceIT` repeated 3 more times, 0 deadlocks), frontend **41 passed**, production build OK, 34-step workflow passed, demo self-check passed, secret scan clean.

## Not executed (infrastructure unavailable)

* **Firebase** live end-to-end sign-in, Cloud Storage, Cloud Messaging, App Check and Hosting have not been exercised against the live project (authentication is emulator-tested; see above).
* **Docker Compose** stack: Docker is not installed on this machine; `docker-compose.yml` and `backend/Dockerfile` were not built.
* Load/performance testing beyond the 6-thread concurrency test.

## How to reproduce

```bash
scripts/dev-mysql.sh start          # private MySQL on 127.0.0.1:3307, writes .env
cd backend && mvn test              # 86 tests (integration tests skip if MySQL is unreachable)
cd ../frontend && npm install && npm test && npm run build
cd ../backend && mvn spring-boot:run          # in another terminal
node scripts/e2e-workflow.mjs                  # 34-step API demonstration
```
