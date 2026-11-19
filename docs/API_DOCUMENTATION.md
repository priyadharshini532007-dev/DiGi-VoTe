# DigiVote REST API

Interactive documentation: **Swagger UI** at `http://localhost:8080/swagger-ui.html`, OpenAPI JSON at `http://localhost:8080/v3/api-docs` (import into Postman via *Import → Link*).

## Conventions

* JSON over HTTPS. Authenticated calls send `Authorization: Bearer <token>` from `/api/auth/login`, `/register-organization`, `/activate` or `/firebase`.
* `/api/public/**` needs no token. **Ballot submission must not carry an Authorization header** (it is rejected with `IDENTITY_NOT_ALLOWED`).
* Errors: `{ "timestamp", "status", "code", "message", "fieldErrors"? }`. Common codes: `VALIDATION_FAILED` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404, also for resources in other organizations), `INVALID_TRANSITION` / `OPERATION_NOT_ALLOWED_IN_STATE` / `DUPLICATE_VOTE` / `CREDENTIAL_ALREADY_ISSUED` / `CREDENTIAL_EXPIRED` (409), `INVALID_RULES` / `NOT_READY` / `MANIFESTO_FROZEN` (422), `ACCOUNT_LOCKED` (423).
* Collections are paged: `?page=0&size=50` → `{ content, page, size, totalElements, totalPages }` (size capped at 100).
* No response contains password hashes, private keys, activation codes (except once, to the inviter), credentials or ballot selections.

## Endpoints

### Authentication
| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/auth/config` | public | Firebase enabled? dev mode? |
| POST | `/api/auth/register-organization` | public | Create organization + owner, returns session |
| POST | `/api/auth/login` | public | Password login (lockout after policy failures) |
| POST | `/api/auth/activate` | public | Accept invitation with activation code |
| POST | `/api/auth/firebase` | public | Exchange a verified Firebase ID token (Google or Email/Password) for a session; links an existing account by verified email |
| POST | `/api/auth/firebase/register-organization` | public | Create an organization whose owner signs in with Firebase (verified email required) |
| POST | `/api/auth/firebase/activate` | public | Accept an invitation with its code and a Firebase sign-in whose verified email matches the invitation |
| GET / PUT | `/api/auth/me` | any user | Own profile and memberships (role, permissions, home) / update profile |
| POST | `/api/auth/change-password` | any user | Change password |

### Organizations, members, roles
| Method | Path | Who |
|---|---|---|
| GET | `/api/roles` | any user |
| GET / PUT | `/api/orgs/{orgId}` | member / owner |
| PUT | `/api/orgs/{orgId}/security-policy` | owner |
| GET | `/api/orgs/{orgId}/overview` | owner, admin, auditor |
| GET / POST | `/api/orgs/{orgId}/members` | owner, admin, auditor (list) / owner (invite → one-time activation code) |
| PATCH | `/api/orgs/{orgId}/members/{membershipId}/role` | owner |
| PATCH | `/api/orgs/{orgId}/members/{membershipId}/status` | owner (ACTIVE, SUSPENDED, REMOVED) |

### Elections, rules, lifecycle
| Method | Path | Who |
|---|---|---|
| GET / POST | `/api/orgs/{orgId}/elections` | members (drafts only for operators/auditors) / owner, admin |
| GET | `/api/me/elections` | elections where the caller is an eligible voter |
| GET / PUT | `/api/elections/{id}` | member / operator (DRAFT, REGISTRATION) |
| PUT | `/api/elections/{id}/rules` | operator (DRAFT–CAMPAIGN), validated by the rule engine |
| POST | `/api/elections/{id}/rules/validate` | operator (dry run for publication) |
| POST | `/api/elections/{id}/transitions` `{target, note}` | operator; PUBLISHED needs publish permission, ARCHIVED archive permission |
| GET | `/api/elections/{id}/readiness` | operators, auditors |
| GET | `/api/elections/{id}/timeline` | members |
| GET / POST | `/api/elections/{id}/administrators` | operators, auditors / owner |

### Candidates and manifestos
| Method | Path | Who |
|---|---|---|
| POST | `/api/elections/{id}/applications` | candidate (REGISTRATION) |
| GET | `/api/elections/{id}/applications` | operators, auditors |
| GET | `/api/me/applications` | candidate |
| PUT | `/api/applications/{id}` | the applicant (after a correction request) |
| POST | `/api/applications/{id}/review` `{decision: APPROVE\|REJECT\|REQUEST_CORRECTION, note}` | operator |
| POST | `/api/applications/{id}/withdraw` | the applicant, before the withdrawal deadline |
| GET | `/api/elections/{id}/candidates`, `/api/candidates/{id}` | members (published manifestos only) |
| PUT | `/api/candidates/{id}/profile`, `/api/candidates/{id}/manifesto` | the candidate, until voting opens |
| POST | `/api/candidates/{id}/manifesto/publish` | the candidate |
| POST | `/api/candidates/{id}/media?type=PHOTO\|POSTER\|MANIFESTO_PDF\|VIDEO` (multipart `file`) | the candidate |
| GET | `/api/media/{id}` | members of the election's organization |

### Eligible voters, credentials, ballots
| Method | Path | Who |
|---|---|---|
| GET / POST | `/api/elections/{id}/voters` `{emails: []}` | operators, auditors / operator |
| POST | `/api/elections/{id}/voters/add-all-members` | operator |
| DELETE | `/api/elections/{id}/voters/{eligibleVoterId}` | operator, before a credential is issued |
| GET | `/api/elections/{id}/eligibility` | caller's own eligibility with reasons |
| GET | `/api/elections/{id}/credential-key` | members (RSA public key, canonical v1 fingerprint) |
| GET | `/api/public/elections/{id}/credential-key` | **anonymous**: the same key and fingerprint for every caller (key-transparency anchor) |
| POST | `/api/elections/{id}/credentials` `{blindedMessageHex}` | eligible voter; one per voter |
| GET | `/api/elections/{id}/ballot` | members while VOTING |
| POST | `/api/public/elections/{id}/ballots` `{tokenHex, signatureHex, selections, submissionNonce}` | **anonymous** |

### Receipts, bulletin board, results
| Method | Path | Who |
|---|---|---|
| GET | `/api/public/receipts/{code}` | public |
| GET | `/api/public/elections` | public (public-results elections in VOTING or later) |
| GET | `/api/public/elections/{id}/bulletin` | public (public-results elections) |
| GET | `/api/elections/{id}/bulletin` | members |
| GET | `/api/public/elections/{id}/results` | public, once published and if public |
| POST | `/api/elections/{id}/results/generate` | operator (VERIFICATION); repeatable until published |
| GET | `/api/elections/{id}/results` | members once published; operators/auditors earlier |

### Audit, security, integrity, reports
| Method | Path | Who |
|---|---|---|
| GET | `/api/orgs/{orgId}/audit-logs?typePrefix=` | owner, admin, auditor |
| POST | `/api/orgs/{orgId}/audit-logs/verify` | owner, auditor |
| GET | `/api/orgs/{orgId}/security-events` | owner, auditor |
| GET | `/api/elections/{id}/audit-trail` | owner, admin, auditor |
| GET | `/api/elections/{id}/integrity/aggregation` | owner, auditor |
| GET | `/api/elections/{id}/trust` | operators, auditors (Election Trust Dashboard) |
| GET | `/api/elections/{id}/participation` | operators, auditors (stored procedure) |
| POST | `/api/elections/{id}/reports?type=ELECTION\|PARTICIPATION\|HEALTH\|AUDIT\|SECURITY` | owner, admin, auditor |
| POST | `/api/orgs/{orgId}/reports?type=AUDIT\|SECURITY` | owner, admin, auditor |
| GET | `/api/orgs/{orgId}/reports`, `/api/reports/{id}` | owner, admin, auditor |

### Notifications and health
| Method | Path | Who |
|---|---|---|
| GET | `/api/me/notifications` | any user |
| POST | `/api/me/notifications/{id}/read` | owner of the notification |
| POST | `/api/me/device-tokens` `{token}` | any user (FCM registration) |
| GET | `/api/public/health`, `/actuator/health` | public |

## Example: complete flow with curl

`scripts/e2e-workflow.mjs` drives every step of the demonstration through this API (including the voter-side blind-signature math) and is the most precise executable example.
