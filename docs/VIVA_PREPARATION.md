# DigiVote Viva Preparation

## One-breath pitch

"DigiVote separates voter identity from ballot data with blind-signed credentials, guarantees one vote per eligible voter in the database, encrypts every ballot with Paillier so results are computed without decrypting any ballot, lets every voter check their receipt against a public hash-chained bulletin board, and drives each election through a configurable rule engine and a validated state machine on a normalized MySQL schema with a fully object-oriented Spring Boot backend."

## Demonstration script (27 steps, about 20 minutes)

Preparation: `scripts/dev-mysql.sh start`, start backend and frontend (see README). Optionally run `node scripts/e2e-workflow.mjs --prepare-demo` beforehand as a fallback dataset.

| # | Step | Where in the UI |
|---|---|---|
| 1 | Open the DigiVote landing page | `http://localhost:5173` |
| 2 | Log in as Organization Owner (or *Register organization* to create one live) | Sign in |
| 3 | Create an Election Administrator | Members & roles → Invite member → role *Election Administrator*; copy the activation code; in a private window, *Activate* with it |
| 4 | Create an election | (as admin) Elections → New election |
| 5 | Configure the rules | Rules tab: plurality, NOTA, receipts + QR, voting window starting now; try *max selections = 2* to show the rule engine rejecting it |
| 6 | Register three candidates | Owner invites three *Candidate* members; admin adds voters (Eligible voters → *Add all voters & candidates*); Overview → *Publish election*; each candidate: My candidacy → Apply |
| 7 | Approve the applications | Candidates tab → Review → Approve |
| 8 | Publish profiles and manifestos | Each candidate: Open workspace → write manifesto → *Save and publish*; upload a photo. Admin: *Start campaign* |
| 9 | Open voting | Overview → readiness 100% → *Open voting* (keys generated, manifestos frozen) |
| 10 | Show manifestos are frozen | Candidate workspace shows *Frozen*, fields disabled; API returns `MANIFESTO_FROZEN` |
| 11 | Log in as an eligible voter | Voter → My elections |
| 12 | Open the ballot | *Vote now* → *Obtain anonymous credential* (explain blinding) |
| 13 | Select a candidate | Ballot cards |
| 14 | Confirm the vote | *Review and confirm* → *Cast my ballot* |
| 15 | Receive receipt and QR code | Receipt page (code, commitment, bulletin position, QR) |
| 16 | Attempt a duplicate vote | *Attempt a duplicate vote* |
| 17 | Show the rejection | "Duplicate rejected by the server: This credential has already been used…" |
| 18 | Verify the receipt | *Verify now* (or scan the QR with a phone) → RECEIPT RECOGNIZED: accepted, awaiting a shuffled bulletin batch (BALLOT RECORDED once its batch is published, at the latest when voting closes) |
| 19 | Open the public bulletin board | Elections (public) → Bulletin board: chain verified, commitments only |
| 20 | Close voting | Admin → Overview → *Close voting* (publishes the final shuffled batch; the receipt now shows BALLOT RECORDED with its position) |
| 21 | Generate results | Results tab → *Generate results* (repeat it: same result hash, run 2×) |
| 22 | Publish results | *Publish results*; show public results page; receipt now INCLUDED IN TALLY |
| 23 | Verify the audit hash chain | Auditor → Integrity overview → *Verify now* |
| 24 | Open the Auditor dashboard | Integrity overview, *Recompute* tally aggregation, Security events |
| 25 | Generate reports | Reports → election *ELECTION* and *AUDIT* reports (content hash shown) |
| 26 | Archive the election | Owner/admin → Overview → *Archive election* |
| 27 | Final Election Trust Dashboard | Election → *Health & trust*: ballots, duplicates rejected, bulletin chain, receipt checks, result consistency, audit chain, remaining warnings |

Rule of thumb from the guide: never edit database rows on camera; show the feature working before explaining it.

## Where each concept lives (point at code)

| Concept | File |
|---|---|
| Abstract user + 5 role subclasses | `backend/src/main/java/com/digivote/access/User.java` and siblings |
| Factory | `access/UserFactory.java` |
| Authorization boundary | `access/AccessControlService.java` |
| State pattern | `election/state/ElectionState.java`, `LifecycleStates.java`, `ElectionStateMachine.java` |
| Lifecycle transitions + guards | `election/state/ElectionLifecycleService.java`, `election/ReadinessService.java` |
| Rule engine | `election/rules/RuleEngine.java` |
| Observer | `election/state/ElectionLifecycleEvent.java`, `candidate/ManifestoFreezeListener.java`, `notification/ElectionNotificationListener.java` |
| Strategy (+ template method) | `result/CountingStrategy.java`, `AbstractRankingStrategy.java`, `PluralityCountingStrategy.java`, `ApprovalCountingStrategy.java` |
| Decorator | `candidate/storage/ValidatingMediaStorage.java` |
| Blind signatures | `crypto/BlindRsa.java`, `frontend/src/crypto/blindRsa.js`, `voting/CredentialIssuanceService.java` |
| Paillier | `crypto/Paillier.java`, `voting/BallotTransaction.java`, `result/ResultService.java` |
| One-vote transaction | `voting/BallotTransaction.java`, `voting/BallotSubmissionService.java` |
| Receipts | `voting/ReceiptCodes.java`, `verification/ReceiptVerificationService.java` |
| Bulletin board | `verification/BulletinBoardService.java` |
| Audit chain | `audit/AuditService.java`, `AuditHasher.java`, `AuditIntegrityService.java` |
| SQL objects | `backend/src/main/resources/db/migration/V2__views_procedures_triggers.sql` |

## Question bank

**Why RBAC instead of simple flags?** Permissions are attached to roles, roles to memberships per organization. One person can be a voter in one organization and an owner in another; the same check (`user.can(permission)`) works everywhere, and a role change takes effect immediately because roles are read from the database on every request, not from the token.

**Why separate identity from vote data?** So that no query can return "who voted for whom". The anonymous tables have no identity columns or foreign keys (enforced by a test). Separation alone is not enough, which is why credentials are blind-signed: the server cannot link the credential it issued to the token later spent.

**How exactly is duplicate voting prevented?** Two layers. (1) One credential per eligible voter: row lock + UNIQUE `eligible_voter_id`. (2) One ballot per credential: ballots for an election are serialized by a row lock, the spent-token table is checked under that lock, and UNIQUE(`election_id`, `token_hash`) is the last line of defence. A test fires six concurrent submissions with one credential: exactly one ballot is stored.

**Why wrap vote casting in a transaction?** A ballot is seven writes (ballot, per-option votes, spent token, receipt, bulletin entry, chain link, audit event). If any fails, none may remain, otherwise a credential could be burnt without a counted ballot or a ballot could exist without its bulletin entry. A test injects a failure mid-way and checks nothing persisted and the credential still works.

**Why store votes encrypted?** Even someone reading the database sees only Paillier ciphertexts. Because Paillier is additively homomorphic, multiplying ciphertexts adds the plaintexts, so the tally decrypts only per-option totals, never an individual ballot.

**Who encrypts, and why on the server?** The server, right after validating the selection. Letting browsers encrypt would require zero-knowledge proofs that each ciphertext is 0 or 1 (otherwise someone could encrypt 1000 votes). Without those proofs, server-side validation then encryption is the honest design; it is documented as a limitation.

**How does receipt verification work without breaking anonymity?** The receipt code is derived from the spent token, not from the voter. It locates a ballot commitment on the public bulletin board and, after tallying, shows that the board head used for the results includes it. It never reveals the choice and never identifies the voter.

**What do "Ballot recorded" and "Included in tally" prove?** Recorded: an accepted ballot with that receipt is on the bulletin board and the chain verifies. Included: results were computed over a bulletin head containing it. Neither proves the decryption was correct (no ZK proof); auditors can recompute the aggregation themselves.

**Why configurable rules instead of hardcoded logic?** Universities, companies and housing societies need different rules (NOTA, number of selections, approval of candidates, publication policy, schedules). Rules are persisted per election and every service asks the single `RuleEngine`, so behaviour changes without code changes and every change is audited.

**Why freeze candidate profiles at voting start?** Fairness: voters must all see the same manifesto. The freeze happens in the same transaction that opens voting, the entity refuses edits, and a database trigger blocks updates.

**Why audit logs with hash chaining?** Each record includes the previous record's hash, so editing, deleting or reordering any record breaks the chain at that point. Triggers block UPDATE/DELETE. Limitation: someone with full database control could rebuild the whole chain consistently; the defence is publishing head hashes elsewhere.

**How is referential and data integrity enforced?** Primary keys, foreign keys with RESTRICT, unique constraints for every "only one" rule, CHECK constraints for enumerations and ranges, triggers for immutability, optimistic locking for concurrent edits, and Flyway so the schema is reproducible.

**Where is each OOPS pillar?** See the table above and ARCHITECTURE.md §3.

**What is not guaranteed?** Coercion resistance, end-to-end verifiability, protection against an operator holding both the database and the master key, and perfect timing unlinkability in tiny elections. See SECURITY_MODEL.md §10.
