# DigiVote Demo Accounts

One account per role, for testing and for demonstrating DigiVote to faculty.

| Role (proposed name) | DigiVote role code | Email |
|---|---|---|
| ORGANIZATION_OWNER | `ORG_OWNER` | `owner@digivote.test` |
| ELECTION_ADMINISTRATOR | `ELECTION_ADMIN` | `admin@digivote.test` |
| CANDIDATE | `CANDIDATE` | `candidate@digivote.test` |
| VOTER | `VOTER` | `voter@digivote.test` |
| AUDITOR | `AUDITOR` | `auditor@digivote.test` |

## Where these accounts live

**Emulator-only.** The accounts exist in the **Firebase Auth emulator** running on your Mac (project id `digi-vote-be516`, but emulated: nothing is created in the live Firebase project) and in a separate database, **`digivote_demo`**. Your normal development stack (`:8080` / `:5173`, database `digivote`) and the live Firebase project are not touched. `.test` addresses cannot receive mail; the emulator never sends real email.

| Service | Address | Data |
|---|---|---|
| Firebase Auth emulator | `127.0.0.1:9099` | `.local/demo/firebase-emulator` (exported after setup and on clean shutdown) |
| Demo backend | `http://localhost:8082` | MySQL database `digivote_demo`, keys in `.local/demo/backend` |
| Demo frontend | `http://localhost:5174` | signs in against the emulator |

## Commands

```bash
scripts/demo-setup.sh            # starts the demo stack if needed, creates accounts + demo data, runs role checks
scripts/demo-start.sh            # start the demo stack only (before a presentation)
scripts/demo-stop.sh             # stop it (emulator accounts are saved)
scripts/demo-check.sh            # self-check on a throwaway copy, including the full voting lifecycle
```

Options for `demo-setup.sh`: `--open-voting` moves the demo election to VOTING; `--reset-passwords` gives the five emulator accounts new random passwords.

Setup is repeatable: existing accounts, memberships and the demo election are detected and left unchanged; a re-run only re-verifies roles and permissions. It never deletes data. It stops instead of changing anything unexpected (for example an existing account with a different role).

## Passwords

* Generated with Node's `crypto.randomBytes` (96 random bits per password) when an account is created; never hardcoded.
* Printed **once**, when created or reset.
* Stored only in `.local/demo/demo-credentials.json` (git-ignored, permissions 600), so you can look them up later:

```bash
cat .local/demo/demo-credentials.json
```

## How each role is created (no shortcuts)

1. The owner's emulator account is created and its email verified by applying the emulator's verification code (the same thing clicking the email link does; the verified-email requirement stays in force).
2. The owner registers "DigiVote Demo University" through `/api/auth/firebase/register-organization`.
3. The owner invites each other person with an explicit role (`/api/orgs/{id}/members`); each accepts with the one-time activation code and their verified sign-in (`/api/auth/firebase/activate`). No role is derived from an email address.

## Demo data (minimum)

* Organization "DigiVote Demo University" (owner).
* Election "Student Council President (Demo)", created by the administrator: plurality, None Of The Above enabled, minimum 1 candidate, public results, receipts with QR, administrators may not vote, voting window open for 14 days from setup.
* Eligible voters: `voter@digivote.test` and `candidate@digivote.test`.
* The candidate applied ("Priya Sharma"), the administrator approved, and the candidate published a manifesto.
* State after setup: **CAMPAIGN**. The administrator opens voting during the demo, which freezes the manifesto.

The auditor gets no data of their own: their role is read-only by design.

## Logging in

Open `http://localhost:5174/login`, enter the email and password under **"or with email"** and press **Sign in** (do not use "Continue with Google" for these accounts). Each role lands on its own dashboard:

| Account | Lands on | Try |
|---|---|---|
| owner | Overview | Members & roles, Elections, Reports, Audit log, Security alerts, archive at the end |
| admin | Elections | Open the demo election: Overview → Open voting; later Close voting, Results → Generate → Publish |
| candidate | My candidacy | Workspace shows the manifesto (frozen after voting opens); can also vote |
| voter | My elections | Vote now → anonymous credential → ballot → receipt + QR; "Attempt a duplicate vote" |
| auditor | Integrity overview | Verify the audit chain, recompute the tally, bulletin board, reports |

The full 27-step faculty script is in [VIVA_PREPARATION.md](VIVA_PREPARATION.md).

## Live Firebase

No live Firebase accounts were created. To use real sign-ins instead, use real email addresses you control on `http://localhost:5173` (normal stack): register an organization and invite members from the Members page. Do not create test users in the live project for these `.test` addresses: they cannot receive verification emails.
