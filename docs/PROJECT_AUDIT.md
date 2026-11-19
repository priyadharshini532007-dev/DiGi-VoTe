# DigiVote Project Audit

## Initial workspace inspection (2026-10-10)

| Check | Finding |
|---|---|
| Repository | `/Users/rangarajansampath/Desktop/Digi-Vote` was **not a git repository**. Remote `https://github.com/Rishi07-25/Digi-Vote-` existed and was empty (no refs). |
| Existing files | `DIGIVOTE PPT.pptx` (22 MB presentation) and `VoteVeil_Workflow_Guide.pdf` (21-page project guide). No source code, README, schema, migrations, dependency files or tests. |
| Partial implementation | None; the application was built from scratch. |
| Project guide | Read in full. It describes the project under the earlier name "VoteVeil"; per the brief, the application is branded **DigiVote** everywhere. All technical requirements of the guide were kept (5 roles, layered architecture, 3NF MySQL, view/procedure/trigger, 6 patterns, 7-state lifecycle, Paillier, RSA blind signatures, Firebase services, demo flow, viva questions). |
| Java | macOS stub only; Homebrew had OpenJDK 17 and 26. **OpenJDK 21 was installed** with Homebrew (`openjdk@21`). |
| Maven | 3.9.16 |
| Node.js / npm | 26.10 / 11.19 |
| MySQL | Server 9.7.1 running, root password unknown (not requested). A **separate private MySQL instance** owned by the user was created under `.local/mysql-data` on `127.0.0.1:3307` by `scripts/dev-mysql.sh`; the existing server was not touched. |
| Docker | Not installed (Compose file provided but not executed). |
| Firebase | No project or credentials available. |

## Decisions

* Stack as specified: Java 21, Spring Boot 3.5.16, Spring Data JPA/Hibernate, Spring Security (OAuth2 resource server for JWT), Bean Validation, Flyway, MySQL, springdoc-openapi, Bouncy Castle 1.86, Firebase Admin 9.11, ZXing for QR; React 19, Vite 8, Tailwind CSS 4, React Router 7, Axios, Chart.js; JUnit 5, Mockito, Spring test, Vitest, Testing Library.
* Modular monolith, one backend and one frontend.
* No seeded user accounts or invented passwords: organizations are created by registration; members by invitation with one-time activation codes; the demo script generates random passwords per run.
* Ballot encryption on the server (validated plaintext → Paillier), because zero-knowledge ballot proofs are out of scope; documented as a limitation rather than claiming end-to-end verifiability.
* Reference files (`.pptx`, guide PDF) are kept locally and git-ignored (large binaries, earlier branding).

## Requirement traceability (guide → implementation)

| Guide requirement | Implementation |
|---|---|
| Multi-organization platform | `organizations`, memberships, per-request tenant checks (`AccessControlService`) |
| Configurable rules, no hardcoding | `election_rules`, `RuleEngine` |
| Authentication + one-vote guarantee | BCrypt/JWT/Firebase; blind credentials + unique spent tokens + serialized transaction |
| Voter anonymity | Identity/anonymous table split + RSA blind signatures |
| Independent verification (receipt, QR, bulletin) | `ReceiptCodes`, `QrCodes`, `ReceiptVerificationService`, `BulletinBoardService`, public pages |
| Audit trail + tamper detection | Hash-chained `audit_logs`, triggers, `AuditIntegrityService` |
| Automatic results and reports | `ResultService` (Paillier tally), `ReportService`, Trust Dashboard |
| User hierarchy with 5 roles | `access/User` + 5 subclasses, `UserFactory` |
| Singleton, Factory, Observer, Strategy, State, Decorator | See ARCHITECTURE.md §3 |
| View, stored procedure, trigger, transactions | V2 migration; `BallotTransaction` and others |
| Election lifecycle Draft → Archived, manifesto freeze | `ElectionStateMachine`, `ElectionLifecycleService`, `ManifestoFreezeListener` |
| Permission matrix | `Permission` sets per role class; `RolePolymorphismTest`, `SecurityIT` |
| Demo flow + Trust Dashboard | `docs/VIVA_PREPARATION.md`, `scripts/e2e-workflow.mjs`, Health & trust tab |
| Firebase Auth/Storage/FCM/Analytics/App Check/Hosting | `firebase/*`, `candidate/storage/FirebaseMediaStorage`, `notification/PushGateway`, `frontend/src/lib/firebase.js`, `firebase.json` (untested against Firebase) |
| Swagger/OpenAPI, Postman | springdoc at `/swagger-ui.html`, `/v3/api-docs` importable into Postman |
