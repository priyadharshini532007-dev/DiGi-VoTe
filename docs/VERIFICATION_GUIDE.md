# Verification guide: HTML prototype wired to the Spring Boot backend

Everything described here was written and checked **without** a running backend, Maven or MySQL: the Java compiles
(`javac` against the local Maven repository) and the browser side was exercised against a stand-in server that
imitates the API. Nothing below has run against the real stack. This guide is the order in which to find out what
breaks, cheapest check first.

## 0. What changed, in one screen

| Area | Where |
| --- | --- |
| Prototype (the real frontend) | `web/index.html`, served by Spring Boot on the API origin |
| Browser-side bridge | `web/api.js` (mode switch, JWT, errors), `web/live.js` (per-slice overrides), `web/crypto.js` (blind signatures) |
| Old React app | `frontend-react/` (kept, no longer the frontend) |
| New migrations | `V5` to `V14` in `backend/src/main/resources/db/migration` |
| New tests | `DvNumberServiceTest`, `DvNumberIT`, `OrganizationTypeIT`, `ElectionBannerIT`, `SignupIT`, `CandidateDetailsIT`, `RecoveryIT`, `QrConfirmationIT`, `OrganizationPolicyIT`, `StaticWebIT` |

Two modes, chosen per browser: `http://localhost:8080/?mode=demo` (default; runs from localStorage, no API calls) and
`?mode=live` (data from the backend). The mode is remembered; `file://` is always demo.

## 1. Prerequisites

- JDK 21 (already on the PATH here) and Maven 3.9+ (not installed here).
- MySQL 8: `scripts/dev-mysql.sh start` starts a private instance on `127.0.0.1:3307` and writes the DB settings to
  `.env`. Run it from Git Bash. The integration tests use `digivote_test` on that instance and **wipe it** each run.
- `.env` (never committed) needs the settings from `.env.example`. New entries:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DIGIVOTE_PUBLIC_BASE_URL` | links in invitations and receipts; set to `http://localhost:8080` (an old `:5173` value breaks them) | `http://localhost:8080` |
| `DIGIVOTE_SIGNUP_ORG_SLUG` | organization that the Sign up page joins people to; empty disables self sign-up | empty |
| `DIGIVOTE_QR_CONFIRMATION` | `true` = ballots count only after their signed QR receipt is confirmed within 30 s | `false` |
| `DIGIVOTE_WEB_DIR` | folder served as the frontend | `../web` |

## 2. Step one: the existing tests, before trusting anything new

```bash
cd backend
mvn test
```

Expectation: everything that passed before still passes. The existing integration tests exercise the voting,
bulletin board, results and anonymity paths, which I changed (shared queries for ballots, votes and the trust report;
`credentials` are now numbered per voter; the receipt response has new fields; public URLs use `#/`). Any failure in
`VotingWorkflowIT`, `AnonymityIT`, `ClosureRaceIT` or `SecurityIT` is the most important finding of this guide: stop
and read it before going on.

Likely first-run problems, in order of probability:

1. **Flyway**: a migration that MySQL rejects. Suspects: `V5` (window function inside an `UPDATE ... JOIN`),
   `V12` (adding the composite unique index before dropping `uq_credential_voter` while a foreign key uses it),
   `V14` (`DELIMITER` block replacing `sp_election_participation`). The error names the file and line.
2. **Spring wiring**: a constructor changed in `AuthService`, `OrganizationService`, `ElectionService`,
   `BallotTransaction`, `PublicController`, `VotingController`, `ReceiptVerificationService`.
3. **Assertions** in the new `*IT` classes (written without running them): fix the test or the code, whichever is wrong.

Then the opt-in mode, which changes ballot behaviour and has its own test:

```bash
DIGIVOTE_QR_CONFIRMATION=true mvn -Dtest=QrConfirmationIT test
```

(PowerShell: `$env:DIGIVOTE_QR_CONFIRMATION='true'; mvn -Dtest=QrConfirmationIT test`.) The test also sets the
property itself, so it works either way.

## 3. Step two: start the app

```bash
cd backend && mvn spring-boot:run
```

Open `http://localhost:8080/` (demo mode) and `http://localhost:8080/?mode=live`.

Checks:
- `GET /actuator/health` is `UP`; `GET /api/auth/me` without a token is `401`; `GET /index.html` is `200`.
- Browser console has no errors on the landing page in either mode.
- Demo mode: sign in with `DV-2026-00006` / `demo-password` (Voter box). It must behave exactly as before.

## 4. Step three: walk the live flows

Use a clean profile or clear site data between runs. Live mode keeps the JWT in `sessionStorage` and voter
credentials and receipts in `localStorage` (per user). To reset: DevTools, Application, Clear site data.

### A. Organization and sign-in (slice 1)
1. `/?mode=live#/register`: create an organization (pick a type). A dialog shows your **DV number**.
2. Sign out, sign in at `#/login` with the DV number (and again with the email), choose the Organization box.
3. Reload the page: you stay signed in (token restored); the elections list is still there.
4. Expected failures: wrong password gives a generic message; clicking the Voter box with an owner account says "Wrong role".

### B. Elections and lifecycle (slice 2)
1. Elections, New election: fill the wizard (a 20+ character description is required), choose "Create and publish".
2. Rules page: change a rule and save; set voting start and end.
3. Lifecycle page: the preconditions list comes from the server; moving to Campaign needs enough approved
   candidates and voters, opening voting needs the current time inside the voting window.
4. Optional banner: upload a PNG/JPEG under 2 MB in the wizard; reload and confirm it is still there.

### C. Candidates (slice 3)
1. Create a Candidate member (see D), sign in as them, apply while the election is in Registration.
2. As the owner: Candidates, review, approve (reject and "request correction" need a reason).
3. As the candidate: edit the profile (Education and Experience are new fields), write a manifesto with
   Initiatives, publish it, upload a PDF supporting document and a photo, remove one file.
4. Opening voting freezes manifestos: edits must then be refused.

### D. Members, voters, invitations, recovery (slice 4)
1. Members, Invite member (role Voter). Copy the one-time code.
2. In a private window: `#/activate`, enter the email and code, choose a password. You get a DV number.
3. Voters page: paste emails (members only; non-members and auditors are rejected with a reason) or "Add all
   active members". Removing a voter who already has a credential must be refused.
4. Members, "Reset password" for a member: a code appears once. Use it at `#/recover`. Wrong codes five times lock
   the account; owners and members of several organizations cannot be reset this way.
5. Self sign-up: set `DIGIVOTE_SIGNUP_ORG_SLUG` to the organization's slug (shown in the organization profile), restart,
   open `#/signup`. Only the Voter and Candidate boxes work. Nobody is added to a voter list automatically.

### E. Voting and receipts (slice 5), the part that matters most
Run it twice: once with `DIGIVOTE_QR_CONFIRMATION=false`, once with `true`.

1. As an eligible voter with the election in Voting: Cast vote, "Get my anonymous credential". Four steps must
   complete (key check, blind, server signs, unblind). Failure here usually means a key or encoding mismatch:
   compare with the React app's `CastBallot` flow, which used the same modules.
2. Select and submit. In DevTools, Network: the `POST /api/public/elections/{id}/ballots` request must have **no
   `Authorization` header**. The server refuses it if one is present.
3. Without confirmation: you get a receipt card immediately. With confirmation: a countdown, "Submit QR to audit desk"
   within 30 s turns it green; submitting twice reports a duplicate; waiting past 30 s voids it and lets you vote again.
4. `#/verify`: paste the receipt code. Expected outcomes are in order "accepted/awaiting batch", "recorded on the
   bulletin board", "included in the tally" (after results).
5. Try voting twice (the "try to vote again" button): the server must answer `409 DUPLICATE_VOTE`.
6. Close browser data after getting a credential but before voting, then try again: the server refuses a second
   credential (by design; there is no admin reset).

### F. Audit, bulletin board, security (slice 6)
1. As an auditor or owner: Audit logs, "Verify chain". The message must say the server **and this browser** agree.
   If only the browser disagrees, the canonical hash format in `web/live.js` (`recomputeAudit`) differs from `AuditHasher`.
2. Integrity dashboard, "Run integrity check": audit chain (server and browser), bulletin board, ballot aggregation.
3. Organization profile and Security policy: save contact details, then change lockout minutes, session minutes and
   the mixed-case rule. Verify they bite: a new session expires after the configured minutes, wrong passwords lock for
   the configured time, a weak new password is refused.

### G. Results, trust, reports, public site (slice 7)
1. Close voting (Verification), Results management, "Generate results", then publish via the lifecycle.
2. Result verification page: "Result hash recomputes in this browser" must pass.
3. Trust and health: six checks from the server; "Probe now" calls `/api/public/health`.
4. Reports: generate a Health and an Audit report; open, download JSON.
5. Signed out (private window), `/?mode=live#/elections`: the public election list, the winner, turnout, and the
   bulletin board with "Chain verified".

## 5. Known limits and deliberate differences

- **No voter-list auto-enrolment at sign-up** (the demo adds new people to open elections; the backend does not).
- **QR confirmation is opt-in.** It omits the demo's "two bad QRs void your vote" rule and the audit-desk email:
  with those, anyone holding a receipt could cancel a counted vote. A ballot cast in the last 30 s before close
  cannot be confirmed after it closes.
- **A lost credential cannot be recovered** (one credential per voter; reissue only after an unconfirmed ballot).
- **Removed members never appear** (the backend hides them).
- **Sessions are capped by the organization policy** (default 120 minutes), which can be shorter than the server-wide token lifetime.
- **Empty in live mode:** hourly turnout, per-ballot timestamps (not stored on purpose), the notification feed and
  mail, auditor "ledger" and live-QR panels (they depend on the demo's audit desk).
- **Old banner files and removed candidate files stay in storage** (the storage layer has no delete).
- **Receipt and invitation links** now point at `/#/verify` and `/#/activate` (hash routing); the React app's routes no longer match them.

## 6. If a live screen misbehaves

- Console first: `DV_API.live` must be `true`; `S.hydrateErrors` lists which slice failed to load and why.
- Network tab: each screen's data comes from a named endpoint (`/api/orgs/{id}/...`, `/api/elections/{id}/...`);
  a `401` means the session expired, a `403` means the role lacks the permission the screen assumes.
- Switch to `?mode=demo` to confirm the prototype itself is fine; demo mode shares no data with live mode.
- Compare against the matching section of `web/live.js`: each slice is one clearly marked block.

## 7. After it passes

Commit any fixes, run `scripts/check-secrets.sh`, and tag the revision. The scratch stand-in server used during
development is not part of the repository, so nothing here depends on it.
