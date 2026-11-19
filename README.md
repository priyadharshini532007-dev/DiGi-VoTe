# DigiVote

**Universal secure election management platform** · OOPS + DBMS Capstone Project

> Every eligible voter can cast one vote, every accepted ballot can be independently checked, and the election process leaves a verifiable audit trail.

DigiVote lets organizations (universities, companies, housing societies, NGOs, clubs) run complete elections: onboarding, configurable rules, candidate applications and manifestos, eligible voter lists, anonymous voting with blind-signed credentials, Paillier-encrypted tallying, verification receipts with QR codes, a public hash-chained bulletin board, tamper-evident audit logs, reports and an Election Trust Dashboard.

| | |
|---|---|
| Backend | Java 21, Spring Boot 3.5, Spring Security, Spring Data JPA/Hibernate, Bean Validation, Flyway, springdoc-openapi, Bouncy Castle |
| Database | MySQL 8+ (tested on 9.7): 28 tables, 2 views, 1 stored procedure, 16 triggers |
| Frontend | React 19, Vite, Tailwind CSS 4, React Router, Axios, Chart.js |
| Cloud (optional) | Firebase Authentication, Cloud Storage, Cloud Messaging, App Check, Analytics, Hosting |
| Tests | JUnit 5, Mockito, Spring Boot Test (MockMvc on real MySQL), Vitest, Testing Library |

## Quick start (local)

Requires Java 21, Maven, Node 20+, and MySQL server binaries. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for details and troubleshooting.

```bash
scripts/dev-mysql.sh start          # private MySQL on 127.0.0.1:3307, writes DB settings to .env
```

```bash
cd backend && mvn spring-boot:run   # API + HTML prototype (web/) on http://localhost:8080
```

The prototype in `web/` is served by the backend from the same origin (no CORS, edit and refresh). The legacy React app is optional:

```bash
cd frontend-react && npm install && npm run dev   # legacy app on http://localhost:5173
```

Then open http://localhost:8080 and **Register organization**, or create a ready-to-vote demo dataset:

```bash
node scripts/e2e-workflow.mjs --prepare-demo
```

It prints the generated accounts (owner, administrator, three candidates, two voters, auditor) and their random passwords.

For fixed demo logins per role (`owner@digivote.test`, `admin@`, `candidate@`, `voter@`, `auditor@`) on an isolated emulator-based demo stack, run `scripts/demo-setup.sh` and see [docs/DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md). Without `--prepare-demo` it runs the entire 27-step demonstration through the API and checks every step.

* Swagger UI: http://localhost:8080/swagger-ui.html (OpenAPI: `/v3/api-docs`, importable into Postman)
* Health: http://localhost:8080/actuator/health

## Tests

```bash
cd backend && mvn test           # 61 unit + 25 MySQL integration tests
cd frontend-react && npm test          # 20 tests
node scripts/e2e-workflow.mjs    # 34-step end-to-end API run (backend must be running)
scripts/check-secrets.sh         # verifies no secrets are tracked
```

Integration tests use the `digivote_test` database (cleaned and re-migrated on each run) and skip themselves if it is unreachable. Results: [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## How the important parts work

* **Anonymous voting**: the voter's browser blinds a random token; the server signs it after checking eligibility without seeing it (RSA blind signature); the ballot is submitted with the unblinded token and **no login token**. Identity tables and ballot tables share no columns or keys.
* **One vote**: one credential per eligible voter (row lock + unique key) and one ballot per credential (serialized transaction + `UNIQUE(election_id, token_hash)`); concurrent duplicates are tested.
* **Encrypted tally**: each ballot option is a Paillier ciphertext; results multiply ciphertexts and decrypt only the totals.
* **Verification**: receipt code + QR → bulletin board entry → "ballot recorded", then "included in tally" once results are computed over a bulletin head that contains it.
* **Audit**: every significant action is appended to a per-organization SHA-256 hash chain protected by triggers; auditors recompute it from genesis.
* **Rules and lifecycle**: per-election persisted rules interpreted by one rule engine; Draft → Registration → Campaign → Voting → Verification → Published → Archived enforced by a state machine.

Read the guarantees **and limitations** in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md).

## Repository layout

```
backend/                 Spring Boot API (com.digivote.*), Flyway migrations, tests
frontend-react/         React app (pages per role, crypto/blindRsa.js, tests)
web/                    HTML prototype (index.html, images/, oops/) - the real frontend, served by Spring Boot
scripts/dev-mysql.sh     private development MySQL (start|stop|status)
scripts/e2e-workflow.mjs end-to-end demonstration through the API
scripts/check-secrets.sh secret scan of tracked files
docs/                    architecture, database, security, API, tests, deployment, viva
docker-compose.yml       optional MySQL + backend stack
firebase.json            Firebase Hosting for frontend-react/dist
.env.example             configuration placeholders (copy to .env, never commit .env)
```

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, packages, OOPS pillars, design patterns with file paths, class/state/sequence/auth diagrams |
| [DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | ER diagram, tables, normalization, views, procedure, triggers, transactions |
| [SECURITY_MODEL.md](docs/SECURITY_MODEL.md) | Threat model, authentication, authorization, anonymity, cryptography, keys, limitations |
| [API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) | Endpoint reference and conventions |
| [TEST_REPORT.md](docs/TEST_REPORT.md) | What was run and the results, edge-case mapping |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Setup, environment variables, Firebase, hosting, troubleshooting |
| [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) | Completed, partial and not-implemented items |
| [PROJECT_AUDIT.md](docs/PROJECT_AUDIT.md) | Initial workspace inspection and requirement traceability |
| [VIVA_PREPARATION.md](docs/VIVA_PREPARATION.md) | 27-step demo script and question bank |
| [COMPLETION_REPORT.md](docs/COMPLETION_REPORT.md) | Completion report as of 2026-10-10 (dated snapshot; current state in IMPLEMENTATION_STATUS.md) |
| [DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md) | Five emulator demo accounts (one per role): setup, login and checks |
