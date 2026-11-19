# DigiVote Dashboard Feature Inventory

Written 2026-10-12 against the dashboard brief (eight workspaces). It records what exists, what is partial, and which
backend integrations are missing. Nothing here claims behaviour that was not built or tested.

## 1. Starting point (before this work)

React 19 + Vite 8 + Tailwind 4 + Router 7 + Chart.js frontend on a Spring Boot 3 / MySQL backend. Role pages for owner,
administrator, candidate, voter and auditor already existed under `/app/*`, backed by a complete API. They were kept; the
new work extends them.

## 2. Workspace status

| # | Workspace | Entry route | Status |
|---|---|---|---|
| 1 | Organization Owner | `/app/overview` | Done. Overview (6 cards, election table with search/filter/sort/pagination/export, activity, alerts, health), profile, members, **roles & permissions**, oversight, **security center**, reports, **archive** |
| 2 | Election Administrator | `/app/operations` | Done. Operations overview, all elections, **6-step creation wizard**, **cross-election candidate approvals**, **voter import with CSV preview**, rules, lifecycle (with consequences dialog), results management, reports, activity timeline |
| 3 | Candidate Portal | `/app/candidate` | Done. Overview, profile, manifesto, media, application status, campaign, timeline; read-only banner on freeze |
| 4 | Voter | `/app/voter` | Done. Overview, election directory, my elections, candidate directory, cast-vote hub, ballot (existing), receipts, published results |
| 5 | Auditor | `/app/auditor` | Done. Overview, audit logs, **integrity dashboard**, bulletin board, receipt verification, **result verification**, security events, reports. Read-only |
| 6 | Vote Verification Portal | `/verify`, `/app/verify` | Done. Distinct result states, evidence links, optional QR image reading |
| 7 | Results & Analytics | `/app/results` | Done. Overview, results, turnout, historical, report center, export center |
| 8 | Election Trust & System Health | `/app/trust` | Done. Overview, integrity monitor, voting integrity, verification monitor, readiness, system health, trust report |

Shared shell: grouped role navigation with icons, collapsible sidebar (persisted), breadcrumbs, global search of pages
and elections, notification center (unread count, category filter, mark read), help and profile menus, skip link, print styles.

## 3. Trust status rule

Derived only from `GET /api/elections/{id}/trust`:

* **Integrity failure**: any check failed (or the server reports `INTEGRITY_PROBLEMS`).
* **Attention required**: no checks, or any check warned or has not run yet.
* **Verified**: every check passed.

There is deliberately no numeric trust score. Implemented and unit-tested in `src/lib/trustStatus.js`.

## 4. Known gaps and honest limitations

These are visible in the interface as plain statements, not hidden.

| Brief item | Gap | Why / what is needed |
|---|---|---|
| Registration start/end dates | Not a separate window | The backend has campaign window, voting window and withdrawal deadline; candidate registration is the Registration *stage* |
| Election type / category, banner, separate instructions | Not stored | `elections` has title and description only. Counting method is shown as the type |
| Organization logo upload, member password-recovery action | Not available | Logo is an https URL field; no upload or admin reset endpoint |
| Import history, valid/invalid/duplicate counts after import | Session-only | Server stores the resulting eligible list, not import attempts. Preview and invalid-row report run in the browser |
| Candidate "Under review" state | Not modelled | Backend states: SUBMITTED, APPROVED, REJECTED, CORRECTION_REQUESTED, WITHDRAWN |
| Official candidate announcements, FAQs | Not supported | No announcement endpoint; manifesto publication is the campaign channel |
| Hourly turnout trend | Intentionally absent | V4 anonymity hardening stores no per-ballot timestamps |
| Anonymity-controls runtime check | Design statement only | Verified by automated tests; the trust endpoint has no runtime anonymity check |
| Invalid-ballot count for administrators | Not tracked | Aggregation endpoint is owner/auditor only; rejected submissions are never stored as ballots |
| System health: database, storage, error rate, incidents | Not measured | Only `/api/public/health` is exposed. Availability and latency are measured in the browser; database is inferred from successful reads |
| Security-event resolution status | Not available | Events are recorded without a workflow |
| Super Administrator and Observer roles | Not implemented | Backend defines five roles; public pages serve the observer use case |
| Live backend check | Not run on this machine | No Java, Maven or MySQL installed here. See section 5 |

## 5. Verification performed

| Check | Result |
|---|---|
| `npm test` (Vitest) | 75 passed (was 41): logic, DataTable, dashboards, shell, navigation, existing suites |
| `npm run build` | Succeeds; main chunk ~459 kB (was ~620 kB) after route-level code splitting |
| Browser sweep, Edge via Playwright, **mock API** | 53 role/route combinations: no JS errors, no horizontal overflow, no unexpected redirects |
| Browser interaction flows (same mock) | 19/19: wizard validation and creation, CSV preview and import, sidebar persistence, search, notifications, access redirects, skip link |

The browser checks used a throwaway mock API, so they prove the interface behaves correctly against the documented API
shapes, **not** against the live backend. Run `scripts/e2e-workflow.mjs` and click through each role on a machine with the
backend running before demonstrating.
