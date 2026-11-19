# DigiVote Setup and Deployment

## 1. Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| Java | 21 (Temurin or Homebrew `openjdk@21`) | Set `JAVA_HOME` to a JDK 21 |
| Maven | 3.9+ | |
| Node.js | 20+ (tested on 26) | Includes npm |
| MySQL | 8.0+ (tested on 9.7) | Server binaries needed for `scripts/dev-mysql.sh` |

On macOS with Homebrew: `brew install openjdk@21 maven node mysql`, then
`export JAVA_HOME=$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home`.

## 2. Local development (no Docker, no Firebase)

```bash
# 1. Database: a private MySQL owned by your user on 127.0.0.1:3307 (does not touch other MySQL servers).
scripts/dev-mysql.sh start
#    First run creates databases digivote + digivote_test, user 'digivote' with a random password,
#    and writes DB_URL / DB_USERNAME / DB_PASSWORD / TEST_DB_URL into ./.env (git-ignored).

# 2. Backend (Flyway migrates on start). API: http://localhost:8080, Swagger: /swagger-ui.html
cd backend && mvn spring-boot:run

# 3. Frontend (another terminal). App: http://localhost:5173 (proxies /api to :8080)
cd frontend-react && npm install && npm run dev
```

Using an existing MySQL server instead: create a database and user yourself and put `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` in `.env` (see `.env.example`). The schema needs `log_bin_trust_function_creators=1` (or SUPER) to create triggers when binary logging is on.

In dev mode (`DIGIVOTE_DEV_MODE=true`, the default) the backend creates `.local/dev-master.key` and `.local/dev-jwt.key` on first start if `DIGIVOTE_MASTER_KEY` / `DIGIVOTE_JWT_SECRET` are empty. Uploaded media goes to `.local/media`. Keep `.local/` (git-ignored) if you want existing elections to stay tallyable.

### Demo data without manual database edits

There are no seeded accounts or default passwords. Either register an organization in the UI, or run:

```bash
node scripts/e2e-workflow.mjs --prepare-demo   # creates an org, all roles, an election with 3 approved candidates, opens voting
node scripts/e2e-workflow.mjs                  # runs the complete 27-step demonstration end to end
```

Both print the generated accounts and random passwords for that run.

## 3. Environment variables

All backend variables are listed with placeholders in `.env.example`; frontend web config in `frontend-react/.env.example`. Never commit `.env`, service-account JSON or keys (`scripts/check-secrets.sh` checks tracked files).

| Variable | Required in production | Purpose |
|---|---|---|
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | yes | MySQL connection |
| `DIGIVOTE_DEV_MODE` | set `false` | Disables generated local secrets |
| `DIGIVOTE_JWT_SECRET` | yes | ≥ 32-byte session signing secret |
| `DIGIVOTE_MASTER_KEY` | yes | 32-byte base64 key sealing election private keys; back it up |
| `DIGIVOTE_PUBLIC_BASE_URL` | yes | Frontend URL used in receipt QR codes and invitation links |
| `DIGIVOTE_CORS_ORIGINS` | yes | Comma-separated frontend origins |
| `DIGIVOTE_STORAGE_PROVIDER` | optional | `local` or `firebase` |
| `FIREBASE_*`, `GOOGLE_APPLICATION_CREDENTIALS` | optional | See section 5 |
| `VITE_API_BASE_URL` (frontend) | when API is on another origin | e.g. `https://api.example.org` |

## 4. Production deployment

### Backend (Railway / Render / Cloud Run / any JVM host)

```bash
cd backend && mvn -DskipTests package
java -jar target/digivote-backend-1.0.0.jar
```

or build the container: `docker build -t digivote-backend backend/` (multi-stage, runs as a non-root user). Provide the environment variables above through the host's secret store, put TLS in front, and make sure the reverse proxy does not log request bodies; avoid IP logging on `/api/public/elections/*/ballots` if possible (see SECURITY_MODEL.md, correlation risks).

`docker-compose.yml` runs MySQL 8.4 + backend for a self-contained deployment (`cp .env.example .env`, set `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `DIGIVOTE_JWT_SECRET`, `DIGIVOTE_MASTER_KEY`, then `docker compose up --build`). It was not run in the development environment because Docker was unavailable.

### Frontend (Firebase Hosting)

```bash
cd frontend-react
echo "VITE_API_BASE_URL=https://<your-api-host>" > .env.production.local
npm run build                      # outputs frontend-react/dist
cd .. && npm install -g firebase-tools && firebase login
firebase use --add                 # pick your Firebase project
firebase deploy --only hosting     # uses firebase.json (SPA rewrite + security headers)
```

Set `DIGIVOTE_PUBLIC_BASE_URL` and `DIGIVOTE_CORS_ORIGINS` on the backend to the Hosting URL.

## 5. Firebase setup (project `digi-vote-be516`)

### Firebase Console settings

| Setting | Where | Status for digi-vote-be516 |
|---|---|---|
| Web app registered | Project settings → General → Your apps | Done ("DigiVote Web") |
| Email/Password provider | Authentication → Sign-in method | Enabled |
| Google provider | Authentication → Sign-in method | Enabled (set a project support email if prompted) |
| Authorized domains | Authentication → Settings → Authorized domains | `localhost`, `digi-vote-be516.firebaseapp.com`, `digi-vote-be516.web.app`. Use `http://localhost:5173` (not `127.0.0.1`) in development; add your production domain later. |
| Email action URL (optional) | Authentication → Templates → (pencil) → Customize action URL | Default Firebase handler works. To use DigiVote's own page set `https://<your-domain>/auth/action` (for local testing `http://localhost:5173/auth/action`). |
| Email templates | Authentication → Templates | Optional: set sender name "DigiVote" |
| Cloud Storage | Build → Storage | Only if `DIGIVOTE_STORAGE_PROVIDER=firebase`; deploy `storage.rules` (deny all client access) with `firebase deploy --only storage` |
| Cloud Messaging web push key | Project settings → Cloud Messaging → Web Push certificates | Needed only for push notifications (`VITE_FIREBASE_VAPID_KEY`) |
| App Check | App Check → register the web app with reCAPTCHA v3 | Leave **disabled** (`FIREBASE_APP_CHECK_ENABLED=false`) until validated |

### Environment variables

Frontend, `frontend-react/.env.local` (git-ignored; public web config only):

| Variable | Value source |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Web app config (required) |
| `VITE_FIREBASE_MEASUREMENT_ID` | Web app config (Analytics, optional) |
| `VITE_FIREBASE_VAPID_KEY` | Web Push key (optional) |
| `VITE_FIREBASE_APP_CHECK_SITE_KEY` | reCAPTCHA v3 site key (leave empty until App Check is validated) |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST` | Only for emulator testing, e.g. `127.0.0.1:9099`; empty for real Firebase |

Backend, repository-root `.env` (git-ignored):

| Variable | Value |
|---|---|
| `FIREBASE_ENABLED` | `true` |
| `FIREBASE_PROJECT_ID` | `digi-vote-be516` |
| `FIREBASE_PROJECT_NUMBER` | `754902167761` (App Check only) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to the Admin SDK JSON **outside the repository**, e.g. `~/.config/digivote/<file>.json` (permissions 600) |
| `FIREBASE_STORAGE_BUCKET` | `digi-vote-be516.firebasestorage.app` (only with `DIGIVOTE_STORAGE_PROVIDER=firebase`) |
| `DIGIVOTE_STORAGE_PROVIDER` | `local` (default) or `firebase` |
| `FIREBASE_APP_CHECK_ENABLED` | `false` until validated |
| `FIREBASE_AUTH_EMULATOR_HOST` | Only for emulator testing; never in production |

The service-account JSON is never copied into Docker images (the backend image's build context is `backend/`, which contains no credentials). In a container, mount it read-only at runtime and point `GOOGLE_APPLICATION_CREDENTIALS` at the mount, or use the platform's workload identity.

### How sign-in works

* **Google** and **Email/Password** both go through Firebase in the browser; passwords are handled only by Firebase. The browser sends the Firebase ID token to DigiVote, which verifies it with the Admin SDK (signature, project, expiry, revocation) and issues its own session.
* Email/Password accounts must click the verification link before DigiVote accepts them. Unverified emails are never used for registration, invitations or linking.
* Password recovery: "Forgot password?" sends Firebase's reset email; the link opens Firebase's handler or `/auth/action`.
* New organization owners can register with Firebase (Register page). Invited members accept with their activation code and a Firebase sign-in whose verified email equals the invited email (Activate page).
* An existing DigiVote password account is linked once to a Firebase identity with the same verified email; an account linked to another Firebase identity is never relinked. Roles always come from DigiVote memberships.
* The original DigiVote password sign-in remains available for accounts that were activated with a password.

### Testing Firebase sign-in with the emulator

```bash
npx firebase-tools emulators:start --only auth --project digi-vote-be516          # terminal 1 (needs Java 21 on PATH)
cd backend && PORT=8081 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 mvn spring-boot:run   # terminal 2
node frontend-react/scripts/firebase-auth-e2e.mjs http://localhost:8081                  # terminal 3
```

To click through the UI against the emulator, also set `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in `frontend-react/.env.local` and point the Vite proxy at the emulator-backed backend. Verification and reset emails are not sent by the emulator; their links are listed at `http://127.0.0.1:9099/emulator/v1/projects/digi-vote-be516/oobCodes`.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `Unable to locate a Java Runtime` / wrong Java | Export `JAVA_HOME` to JDK 21 |
| Backend: `Access denied for user 'digivote'` | Run `scripts/dev-mysql.sh start` again, or check `.env` values |
| Flyway: "MySQL 9.x is newer than this version of Flyway" | Warning only; migrations work (tested on 9.7) |
| Trigger creation fails with binary logging | Start MySQL with `log_bin_trust_function_creators=1` (the dev script does) |
| Integration tests "skipped" | The test database is unreachable; start the dev MySQL |
| "Key unsealing failed" when tallying | Master key changed since the election opened; restore the original `DIGIVOTE_MASTER_KEY` / `.local/dev-master.key` |
| Voter sees "credential already issued … browser does not hold it" | Browser storage was cleared after obtaining a credential; by design it cannot be reissued |
| Cannot open voting: "inside the configured voting window" | Edit the rules so the voting window includes the current time |
| Frontend 404 on refresh in production | Ensure the SPA rewrite in `firebase.json` (or your host) is active |
