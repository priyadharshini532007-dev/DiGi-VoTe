# DigiVote Implementation Status

Legend: **Done** = implemented and verified by automated tests and/or the end-to-end run in this environment. **Done (untested externally)** = implemented, compiles, disabled by default, not exercised against the external service. **Partial** = works with a documented gap.

## Definition of done

| Requirement | Status | Evidence |
|---|---|---|
| DigiVote branding throughout | Done | UI, titles, README/docs, API title; navigation test asserts no "VoteVeil" on the landing page |
| Backend builds | Done | `mvn package` → `digivote-backend-1.0.0.jar` |
| Frontend builds | Done | `npm run build` |
| Database schema and migrations work | Done | Flyway V1–V4 on fresh DB (`DatabaseIT`), dev and demo DBs |
| Authentication works in the configured environment | Done | Password + lockout, invitations, JWT (`SecurityIT`, e2e); Firebase Google + Email/Password: tested against the Firebase Auth emulator; live project verified for configuration only (see TEST_REPORT) |
| All five roles supported | Done | Role subclasses, dashboards per role |
| Server-side authorization | Done | `AccessControlService`; `SecurityIT.rolesCannotPerformOtherRolesActions` |
| Organization isolation | Done | `SecurityIT.organizationsAreIsolated` |
| Elections can be created and configured | Done | UI + API, rule engine |
| Lifecycle transitions | Done | State machine tests, e2e |
| Candidate registration and approval | Done | e2e steps 8–9, UI walkthrough |
| Manifesto freezing | Done | Entity, listener, trigger; tests |
| Eligible voters can access the ballot | Done | e2e, UI walkthrough |
| Voting workflow | Done | Browser blind credential + ballot verified in the UI |
| Duplicate submissions rejected | Done | Sequential and concurrent tests |
| Identity and ballot data separated | Done | Schema test, blind signatures |
| Verification receipts generated | Done | Code + QR |
| Receipt verification | Done | All six outcomes defined; tests for four |
| Bulletin board | Done | Public and member views, chain verification |
| Results from accepted ballots | Done | Paillier homomorphic tally with consistency checks |
| Results can be published | Done | Manual and automatic policy |
| Audit hash-chain verification | Done | Integrity service; corruption test |
| Reports use actual data | Done | ELECTION, PARTICIPATION, HEALTH, AUDIT, SECURITY |
| SQL view, procedure, trigger work | Done | `DatabaseIT` |
| OOPS concepts in real code | Done | ARCHITECTURE.md §3 |
| Design patterns implemented meaningfully | Done | Singleton, Factory, Observer, Strategy, State (+ Template method, Decorator) |
| Major frontend screens functional | Done | Public, owner, admin, candidate, voter, auditor pages backed by the API |
| Frontend and backend integrated | Done | Vite proxy, UI walkthrough |
| Automated tests executed | Done | 86 backend + 20 frontend + 34-step e2e, all passing |
| Main election demonstration works | Done | `scripts/e2e-workflow.mjs` and UI walkthrough, no manual DB edits |
| Documentation matches implementation | Done | `docs/` |
| Security limitations documented | Done | SECURITY_MODEL.md §10 |
| No secrets committed | Done | `.gitignore`, `scripts/check-secrets.sh` |

## Feature notes

| Area | Status | Notes |
|---|---|---|
| RSA blind signatures | Done | Chaum RSA-FDH with Bouncy Castle; browser implementation shares a test vector with Java. RFC 9474 RSABSSA not used. |
| Voter-to-ballot correlation hardening (P1, 2026-10-11) | Done (stored data) | Random ids on anonymous-side rows, no per-ballot timestamps, selection counts or audit events, shuffled bulletin batches with a final batch at close; `AnonymityIT`, `ClosureRaceIT`. Batch-level anonymity sets, real-time observation and pre-V4 ballots remain (SECURITY_MODEL §4) |
| Credential-key transparency (P3, 2026-10-11) | Done; same-server anchor | Public fingerprint endpoint, audit record, immutable `election_keys`, fail-closed browser check with pinning; `KeyTransparencyIT`. Detecting a consistent first-contact substitution needs an independent comparison (SECURITY_MODEL §8) |
| Published verification package, decryption proofs, ballot-validity proofs (P2, P4, P5) | Not implemented | |
| Paillier encrypted tallying | Done | 2048-bit; server-side encryption after validation; no ZK proofs of ballot validity or decryption |
| Counting methods | Done | Plurality and Approval (single winner, explicit tie and NOTA policy). No ranked-choice/STV. |
| Firebase Authentication | Done; emulator-tested; live sign-in not yet exercised | Google + Email/Password, email verification, password reset, `/auth/action` page, Firebase registration and invitation acceptance, verified-email linking |
| Firebase Cloud Storage | Done (untested externally) | `FirebaseMediaStorage` behind the validating decorator |
| Firebase Cloud Messaging | Done (untested externally) | Device registration + async push on lifecycle events |
| Firebase App Check | Done (untested externally) | Backend filter + frontend header |
| Firebase Analytics | Done (untested externally) | Page views only |
| Firebase Hosting | Done (untested externally) | `firebase.json`, deploy steps in DEPLOYMENT.md |
| Docker Compose | Partial | Files provided; not run (Docker unavailable) |
| Email delivery of invitations | Not implemented | Activation codes are shown once to the inviter to pass on; no mail server configured |
| Password reset by email | Not implemented | Users change passwords while signed in; owners can re-invite. Requires an email service. |
| Master-key rotation | Not implemented | Documented in SECURITY_MODEL.md §8 |
| CSV voter import | Partial | Paste emails (one per line or comma separated) or add all members; no file upload |
| Coercion resistance / end-to-end verifiability | Not implemented (by design, documented) | |

## Known issues

* Frontend main bundle is ~620 kB (Chart.js + Firebase SDK are loaded lazily only where possible); code splitting is a possible improvement.
* Readiness checks are also displayed (informational) after voting has opened.
* Ballots are hidden only among the ballots of their shuffled bulletin batch; small elections and small final batches give small anonymity sets. Ballots accepted before the V4 migration keep their linkable per-ballot metadata (see security model, section 4).
