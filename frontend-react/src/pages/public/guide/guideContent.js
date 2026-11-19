// Content of the on-screen Developer Guide (/guide). Plain data so it can be searched and kept in step with the
// code: when a file is added, renamed or removed, update its entry here.

/** Software needed to run DigiVote locally. `required: false` marks optional tools. */
export const SOFTWARE = [
  {
    name: 'Java JDK 21',
    required: true,
    why: 'Runs the Spring Boot backend. Must be exactly Java 21 (a JDK, not just a JRE).',
    windows: 'winget install EclipseAdoptium.Temurin.21.JDK',
    mac: 'brew install openjdk@21',
    linux: 'sudo apt install openjdk-21-jdk',
    check: 'java -version',
    expect: 'openjdk version "21…"',
  },
  {
    name: 'Apache Maven 3.9+',
    required: true,
    why: 'Builds the backend, downloads its Java libraries and starts it (mvn spring-boot:run).',
    windows: 'Download the "Binary zip" from maven.apache.org, unzip to C:\\tools\\maven, add C:\\tools\\maven\\bin to PATH (or: scoop install maven)',
    mac: 'brew install maven',
    linux: 'sudo apt install maven',
    check: 'mvn -v',
    expect: 'Apache Maven 3.9… and "Java version: 21…"',
  },
  {
    name: 'Node.js 20+ (LTS) with npm',
    required: true,
    why: 'Runs the React/Vite frontend dev server, the frontend tests and the demo scripts.',
    windows: 'winget install OpenJS.NodeJS.LTS',
    mac: 'brew install node',
    linux: 'Install from nodejs.org or with nvm (nvm install --lts)',
    check: 'node -v && npm -v',
    expect: 'v20 or newer',
  },
  {
    name: 'MySQL Server 8.0+',
    required: true,
    why: 'The database. Flyway creates all 28 tables, views, the stored procedure and triggers automatically.',
    windows: 'winget install Oracle.MySQL (or the MySQL Installer from dev.mysql.com; choose "Server only")',
    mac: 'brew install mysql',
    linux: 'sudo apt install mysql-server',
    check: 'mysql --version',
    expect: 'mysql Ver 8… or 9…',
  },
  {
    name: 'Git (with Git Bash on Windows)',
    required: true,
    why: 'Version control. On Windows, Git Bash also runs the .sh helper scripts and provides openssl for generating secrets.',
    windows: 'winget install Git.Git',
    mac: 'xcode-select --install',
    linux: 'sudo apt install git',
    check: 'git --version',
    expect: 'git version 2…',
  },
  {
    name: 'VS Code extensions',
    required: false,
    why: 'Extension Pack for Java, Spring Boot Extension Pack, Tailwind CSS IntelliSense, ESLint. Editor help only.',
    windows: 'Install from the Extensions view (Ctrl+Shift+X)',
    mac: 'Install from the Extensions view (Cmd+Shift+X)',
    linux: 'Install from the Extensions view (Ctrl+Shift+X)',
  },
  {
    name: 'Docker Desktop',
    required: false,
    why: 'Only for the optional docker-compose stack (MySQL + backend in containers). Not needed for normal development.',
    windows: 'winget install Docker.DockerDesktop',
    mac: 'brew install --cask docker',
    linux: 'Install Docker Engine + compose plugin',
    check: 'docker compose version',
  },
  {
    name: 'Firebase CLI',
    required: false,
    why: 'Only for Firebase sign-in testing (Auth emulator) or deploying the frontend to Firebase Hosting.',
    windows: 'npm install -g firebase-tools',
    mac: 'npm install -g firebase-tools',
    linux: 'npm install -g firebase-tools',
    check: 'firebase --version',
  },
];

/** Steps to run the app, per operating system where they differ. */
export const RUN_STEPS = [
  {
    title: 'Create the database and its user',
    body: 'DigiVote needs one empty database (digivote), a test database (digivote_test) and a user that owns both. The backend fills them in itself on first start.',
    variants: {
      windows: {
        note: 'Open "MySQL 8.x Command Line Client" (or run mysql -u root -p) and paste this. Choose your own password. SET PERSIST lets Flyway create triggers when binary logging is on, which is the default on Windows.',
        lang: 'sql',
        code: `CREATE DATABASE digivote CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE digivote_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'digivote'@'localhost' IDENTIFIED BY 'choose-a-password';
CREATE USER 'digivote'@'127.0.0.1' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON digivote.* TO 'digivote'@'localhost', 'digivote'@'127.0.0.1';
GRANT ALL PRIVILEGES ON digivote_test.* TO 'digivote'@'localhost', 'digivote'@'127.0.0.1';
SET PERSIST log_bin_trust_function_creators = 1;
FLUSH PRIVILEGES;`,
      },
      unix: {
        note: 'The helper script starts a private MySQL on 127.0.0.1:3307 (it never touches another MySQL you run), creates both databases and the user with a random password, and writes the DB_* settings into .env for you. You can also follow the Windows SQL instead.',
        lang: 'bash',
        code: 'scripts/dev-mysql.sh start      # also: stop | status',
      },
    },
  },
  {
    title: 'Create the .env file in the project root',
    body: 'Copy .env.example to .env (it is git-ignored, never commit it). With DIGIVOTE_DEV_MODE=true the backend generates the JWT secret and master key into .local/ on first start, so the database settings are all you must fill in.',
    variants: {
      windows: {
        note: 'In PowerShell, from P:\\DigiVote. Then edit .env: Windows MySQL listens on port 3306, not 3307.',
        lang: 'powershell',
        code: `Copy-Item .env.example .env
# then set these lines in .env:
DB_URL=jdbc:mysql://127.0.0.1:3306/digivote
DB_USERNAME=digivote
DB_PASSWORD=choose-a-password
TEST_DB_URL=jdbc:mysql://127.0.0.1:3306/digivote_test`,
      },
      unix: {
        note: 'If you used scripts/dev-mysql.sh, the DB_* lines are already written; only copy the file if .env does not exist yet.',
        lang: 'bash',
        code: '[ -f .env ] || cp .env.example .env',
      },
    },
  },
  {
    title: 'Start the backend (terminal 1)',
    body: 'The first run downloads dependencies (a few minutes), migrates the database with Flyway and starts the API on port 8080. Leave this terminal open.',
    lang: 'bash',
    code: `cd backend
mvn spring-boot:run`,
    after: 'Ready when the log shows "Started DigiVoteApplication". Check http://localhost:8080/actuator/health → {"status":"UP"}.',
  },
  {
    title: 'Start the frontend (terminal 2)',
    body: 'npm install is only needed the first time and whenever package.json changes. Vite forwards every /api request to the backend on :8080, so no extra frontend configuration is needed.',
    lang: 'bash',
    code: `cd frontend
npm install
npm run dev`,
    after: 'Open http://localhost:5173 (use localhost, not 127.0.0.1, if you later enable Firebase).',
  },
  {
    title: 'Create data to explore (terminal 3, optional)',
    body: 'There are no built-in accounts or default passwords. Either click "Register organization" in the app, or let the script build a ready-to-vote election through the real API.',
    lang: 'bash',
    code: `node scripts/e2e-workflow.mjs --prepare-demo   # prints owner, admin, 3 candidates, 2 voters, auditor + passwords
node scripts/e2e-workflow.mjs                  # runs and checks the whole demonstration end to end`,
    after: 'Sign in with the printed accounts. Each role lands on its own dashboard.',
  },
];

export const URLS = [
  ['http://localhost:5173', 'The DigiVote web app (frontend)'],
  ['http://localhost:8080/swagger-ui.html', 'Interactive API documentation (try every endpoint)'],
  ['http://localhost:8080/v3/api-docs', 'OpenAPI JSON (importable into Postman)'],
  ['http://localhost:8080/actuator/health', 'Backend health check'],
];

export const ENV_VARS = [
  ['DB_URL, DB_USERNAME, DB_PASSWORD', 'Required', 'How the backend reaches MySQL.'],
  ['TEST_DB_URL', 'For tests', 'Database the integration tests wipe and re-create. Never point it at real data.'],
  ['DIGIVOTE_DEV_MODE', 'Default true', 'true generates local secrets in .local/. Set false in production.'],
  ['DIGIVOTE_JWT_SECRET', 'Production', 'Signs login sessions (≥ 32 bytes, e.g. openssl rand -base64 48).'],
  ['DIGIVOTE_MASTER_KEY', 'Production', 'Encrypts each election\'s private keys. Losing it makes those elections impossible to tally: back it up.'],
  ['DIGIVOTE_PUBLIC_BASE_URL', 'Production', 'Frontend address printed in receipt QR codes and invitation links.'],
  ['DIGIVOTE_CORS_ORIGINS', 'Production', 'Which frontend origins may call the API.'],
  ['DIGIVOTE_STORAGE_PROVIDER', 'Optional', 'local (files in .local/media) or firebase.'],
  ['FIREBASE_*, GOOGLE_APPLICATION_CREDENTIALS', 'Optional', 'Firebase sign-in, storage and push. Off by default.'],
  ['VITE_API_BASE_URL (frontend/.env.local)', 'Optional', 'Only when the API is on another origin; empty in development.'],
  ['VITE_FIREBASE_* (frontend/.env.local)', 'Optional', 'Public Firebase web config. Leave empty to run without Firebase.'],
];

export const TROUBLESHOOTING = [
  ['"java" is not recognized / "Unable to locate a Java Runtime"', 'Install JDK 21, set JAVA_HOME to its folder and add %JAVA_HOME%\\bin to PATH, then open a new terminal.'],
  ['mvn -v shows a Java version other than 21', 'JAVA_HOME points to another JDK. Point it at JDK 21 and reopen the terminal.'],
  ['Access denied for user \'digivote\'', 'DB_PASSWORD in .env does not match the user you created, or the port in DB_URL is wrong (3306 for an installed MySQL, 3307 for scripts/dev-mysql.sh).'],
  ['Communications link failure', 'MySQL is not running. On Windows: Services → MySQL80 → Start.'],
  ['Flyway fails creating a trigger ("you do not have the SUPER privilege")', 'Run SET PERSIST log_bin_trust_function_creators = 1; as root, then restart the backend.'],
  ['"Port 8080 was already in use"', 'Another backend is still running. Stop it, or start with PORT=8081 and run the frontend with DIGIVOTE_API_PROXY=http://localhost:8081.'],
  ['Frontend shows network errors on every page', 'The backend is not running or not ready yet: wait for "Started DigiVoteApplication".'],
  ['"Key unsealing failed" when tallying', 'The master key changed after voting opened. Restore the original .local/dev-master.key or DIGIVOTE_MASTER_KEY.'],
  ['Voter: "credential already issued … browser does not hold it"', 'Browser storage was cleared after the credential was obtained. By design it cannot be reissued (that is what keeps votes anonymous).'],
  ['Cannot open voting: "inside the configured voting window"', 'Edit the election rules so the voting window includes the current time.'],
  ['.sh scripts do not run on Windows', 'Run them from Git Bash, not PowerShell. scripts/dev-mysql.sh needs a Unix socket; on Windows use the SQL in step 1 instead.'],
  ['Integration tests are "skipped"', 'digivote_test is unreachable. Check TEST_DB_URL and that MySQL is running.'],
];

/** How a request travels through the system, top to bottom. */
export const LAYERS = [
  ['Browser', 'React pages under frontend/src/pages, one folder per workspace. The voter\'s browser also does the blind-signature cryptography.', 'localhost:5173'],
  ['Vite dev server', 'Serves the frontend and forwards /api/* to the backend (frontend/vite.config.js).', 'proxy /api'],
  ['Controllers', 'REST endpoints (*Controller.java). Read the request, call a service, return a DTO.', 'localhost:8080'],
  ['AccessControlService', 'Looks up the caller\'s role in the organization from the database and checks the Permission. Every protected call passes here.', 'authorization'],
  ['Services', 'Business rules: lifecycle state machine, rule engine, ballot transaction, tally, audit chain.', 'logic'],
  ['Repositories + entities', 'Spring Data JPA interfaces and Hibernate entities mapped to tables.', 'JPA'],
  ['MySQL', 'Schema from Flyway migrations, with views, a stored procedure and triggers that back up the Java rules.', 'database'],
];

/**
 * Code map. Each group explains what the folder is for; each file entry says what it does.
 * Paths are relative to the repository root.
 */
export const FRONTEND_GROUPS = [
  {
    title: 'Entry point and routing',
    path: 'frontend/',
    summary: 'Where the app starts and how URLs map to pages.',
    files: [
      ['index.html', 'The single HTML page. Vite injects the bundled JavaScript into it.'],
      ['vite.config.js', 'Dev server on port 5173, React + Tailwind plugins, the /api proxy to :8080, and Vitest settings.'],
      ['package.json', 'Frontend dependencies and the npm scripts: dev, build, preview, test.'],
      ['src/main.jsx', 'Mounts React into index.html, wraps the app in the router and the AuthProvider.'],
      ['src/App.jsx', 'Every route. Public pages under PublicLayout; dashboards under /app inside AppShell, each wrapped in RequireAuth with the role or permission it needs. Dashboard pages load lazily.'],
      ['src/index.css', 'Tailwind import and the design tokens (navy colour scale, fonts, focus rings).'],
    ],
  },
  {
    title: 'API layer',
    path: 'frontend/src/api/',
    summary: 'The only place that talks HTTP. Pages call these functions instead of using Axios directly.',
    files: [
      ['client.js', 'Two Axios clients: an authenticated one that attaches the session token, and an anonymous one used for ballots and receipts that never sends it. Also saves and loads the session.'],
      ['endpoints.js', 'One function per backend endpoint, grouped by area (Auth, Organizations, Elections, Candidates, Voting, Public, Audit, Reports…).'],
    ],
  },
  {
    title: 'Authentication state',
    path: 'frontend/src/auth/',
    summary: 'Who is signed in and which organization role they are currently acting as.',
    files: [
      ['AuthContext.jsx', 'React context with the user, their memberships, the active role, login/logout and role switching. Use it with useAuth().'],
    ],
  },
  {
    title: 'Application shell and shared components',
    path: 'frontend/src/components/',
    summary: 'Reusable building blocks used by all eight workspaces, so every dashboard looks and behaves the same.',
    files: [
      ['AppShell.jsx', 'The dashboard frame: collapsible sidebar, top bar with breadcrumbs, search, notifications, help and profile menu, and the page outlet.'],
      ['navigation.js', 'Sidebar items for each role and the home page per role (homeFor). Shapes the UI only; the server still checks every request.'],
      ['RequireAuth.jsx', 'Route guard: sends signed-out users to /login and shows Access denied when the role lacks the permission.'],
      ['PublicLayout.jsx', 'Header and footer for public pages (landing, verify, elections, this guide).'],
      ['ui.jsx', 'The component library: Button, Card, PageHeader, Alert, Badge, StatusBadge, StatCard, Stepper, Modal, ConfirmDialog, Tabs, form fields, Table, Loading/Empty/Error/AccessDenied states.'],
      ['DataTable.jsx', 'Searchable, filterable, sortable, paginated table used for elections, members, audit logs and more.'],
      ['Charts.jsx', 'Chart.js wrappers: results bars, turnout, participation and trust-check breakdown, each with an empty state.'],
      ['ElectionScoped.jsx', 'Election picker driven by the ?election= URL parameter, for pages that work on one election at a time.'],
      ['FirebaseAuthPanel.jsx', 'Optional Google / email sign-in through Firebase, shown only when Firebase is configured.'],
      ['AuthImage.jsx', 'Shows protected images (candidate photos) by fetching them with the session token.'],
      ['Logo.jsx, icons.jsx', 'DigiVote logo and the inline SVG icon set.'],
      ['shell/Breadcrumbs.jsx', 'Breadcrumb trail built from the current URL.'],
      ['shell/GlobalSearch.jsx', 'Top-bar search over the pages your role can open and your organization\'s elections.'],
      ['shell/NotificationBell.jsx', 'Unread count, notification panel with category filter and mark-as-read.'],
      ['shell/ProfileMenu.jsx', 'Profile menu (name, role, settings, logout) and the Help menu.'],
      ['shell/useDismiss.js', 'Closes a popover on outside click or Escape.'],
    ],
  },
  {
    title: 'Hooks',
    path: 'frontend/src/hooks/',
    summary: 'Standard loading / error / success handling so every page shows the same states.',
    files: [
      ['useApi.js', 'useApi(loader) loads data with loading, error and reload; useAction() runs a save/approve/submit with busy, error and success.'],
      ['useFanOut.js', 'Calls one endpoint per election in parallel and collects what succeeded, so one failing election cannot blank a dashboard.'],
    ],
  },
  {
    title: 'Helpers (pure logic)',
    path: 'frontend/src/lib/',
    summary: 'Small functions without UI. Most are unit-tested in src/test/logic.test.js.',
    files: [
      ['permissions.js', 'Display copy of which role has which permission (the backend is authoritative).'],
      ['elections.js', 'Active / completed checks, upcoming milestones, profile and application completeness.'],
      ['voterStatus.js', 'What a voter can truthfully be told for an election: not open, ready, submitted, closed, published.'],
      ['trustStatus.js', 'Turns the server\'s trust checks into Verified / Attention Required / Integrity Failure by an explicit rule. No invented score.'],
      ['credentialStore.js', 'Keeps the voter\'s anonymous credential and receipts in this browser only.'],
      ['csv.js', 'Parses pasted or uploaded voter lists and classifies valid, invalid and duplicate rows.'],
      ['download.js', 'Real CSV / JSON exports built from loaded data, with spreadsheet formula-injection protection.'],
      ['activity.js', 'Human-readable audit event names and where to inspect each one.'],
      ['format.js', 'Date, number and role-label formatting.'],
      ['firebase.js, firebaseErrors.js', 'Optional Firebase setup (no-op without config) and friendly error messages.'],
    ],
  },
  {
    title: 'Voter-side cryptography',
    path: 'frontend/src/crypto/',
    summary: 'Runs in the voter\'s browser so the server never learns which credential belongs to which voter.',
    files: [
      ['blindRsa.js', 'RSA blind signatures: blind a random token, unblind the server\'s signature. Mirrors backend crypto/BlindRsa.java.'],
      ['keyTransparency.js', 'Checks that the signing key this voter received equals the key published for everyone, so one voter cannot be singled out.'],
      ['*.test.js', 'Tests that the browser and Java implementations agree.'],
    ],
  },
  {
    title: 'Public pages (no sign-in)',
    path: 'frontend/src/pages/public/',
    summary: 'What anyone can open: landing, sign-in, registration, verification portal, published results.',
    files: [
      ['Landing.jsx, About.jsx, SecurityOverview.jsx', 'Home page, project description and the plain-language security model.'],
      ['Login.jsx, Register.jsx, Activate.jsx, AuthCard.jsx', 'Sign in, register a new organization (becomes its owner), accept an invitation with an activation code.'],
      ['AuthAction.jsx', 'Handles Firebase email verification and password-reset links.'],
      ['VerifyReceipt.jsx', 'Vote Verification Portal: enter or scan a receipt code; shows Recorded, Counted, Pending, Invalid… exactly as the server confirms.'],
      ['BulletinBoard.jsx', 'Public hash-chained list of ballot commitments for an election.'],
      ['PublicElections.jsx, PublicResults.jsx, ResultsPanel.jsx', 'Elections whose rules make results public, and their published results.'],
      ['NotFound.jsx', '404 page.'],
      ['Guide.jsx, guide/guideContent.js', 'This guide. The text lives in guideContent.js.'],
    ],
  },
  {
    title: 'Dashboard 01 — Organization Owner',
    path: 'frontend/src/pages/owner/',
    summary: 'Organization-level control. The owner can never see ballots or change votes.',
    files: [
      ['OwnerOverview.jsx', 'Six statistic cards, election overview table, recent activity, security alerts, election health.'],
      ['OrganizationSettings.jsx', 'Organization profile and branding form with validation.'],
      ['Members.jsx', 'Invite, assign roles, suspend, reactivate, remove members (with confirmations).'],
      ['RolesPermissions.jsx', 'Permission matrix: which role may do what.'],
      ['SecurityCenter.jsx', 'Security policy summary and account-security events.'],
      ['ElectionArchive.jsx', 'Completed elections, read-only.'],
    ],
  },
  {
    title: 'Dashboard 02 — Election Administrator',
    path: 'frontend/src/pages/admin/',
    summary: 'Creating and running elections from draft to archive.',
    files: [
      ['OperationsOverview.jsx', 'Statistic cards, lifecycle timeline, candidate queue, voter readiness, deadlines, quick actions.'],
      ['ElectionsList.jsx', 'All elections table with lifecycle filters.'],
      ['CreateElectionWizard.jsx', 'Six-step wizard: basics, schedule, rules, candidates & voters, security, review and create.'],
      ['RulesForm.jsx', 'The rules form and its validation (dates in order, selection limits, NOTA, visibility).'],
      ['ElectionManage.jsx', 'One election\'s detail page; hosts the tabs below.'],
      ['OverviewTab.jsx, TimelineTab.jsx, ProgressTab.jsx', 'Lifecycle stepper and transitions, timeline of state changes, participation progress.'],
      ['CandidatesTab.jsx, CandidateApprovals.jsx', 'Review applications: approve, reject with reason, request corrections.'],
      ['VotersTab.jsx, VoterImport.jsx', 'Eligible voter list, import preview with invalid and duplicate rows.'],
      ['ResultsTab.jsx', 'Compute the encrypted tally and publish results when every check allows it.'],
      ['TrustTab.jsx, BulletinTab.jsx', 'Election trust checks and its bulletin board.'],
      ['ElectionPages.jsx', 'Sidebar pages that pick an election then reuse the tabs: Voter management, Rules, Operations, Results management, Activity.'],
    ],
  },
  {
    title: 'Dashboard 03 — Candidate Portal',
    path: 'frontend/src/pages/candidate/',
    summary: 'A candidate\'s own application, profile, manifesto and media. No vote totals, no voter data.',
    files: [
      ['CandidateOverview.jsx', 'Status cards, my election, profile preview, manifesto summary, application stepper.'],
      ['CandidacyHome.jsx', 'Apply for an election and list my applications.'],
      ['CandidateWorkspace.jsx', 'Profile, manifesto builder, campaign media uploads, campaign info and timeline. Becomes read-only when voting opens.'],
      ['CandidateSection.jsx', 'Opens one section of the workspace from the sidebar (/app/candidate/:section).'],
    ],
  },
  {
    title: 'Dashboard 04 — Voter Portal',
    path: 'frontend/src/pages/voter/',
    summary: 'From finding an election to casting an anonymous ballot and keeping the receipt.',
    files: [
      ['VoterOverview.jsx', 'Five cards, my elections, voting status, candidate highlights, receipts.'],
      ['ElectionDirectory.jsx, MyElections.jsx, ElectionInfo.jsx', 'Browse elections, the ones I am eligible for, and one election\'s rules and candidates.'],
      ['CandidateDirectory.jsx', 'Approved candidates and their manifestos.'],
      ['CastVoteHub.jsx', 'Lists elections open for voting right now.'],
      ['CastBallot.jsx', 'The ballot: get a blind-signed credential, select within the limits, review, confirm, submit anonymously, receive a receipt. Success is shown only after the server accepts.'],
      ['MyReceipts.jsx, ReceiptCard.jsx', 'Receipt wallet with QR code, verification code, download and print.'],
      ['PublishedResults.jsx', 'Results of elections that have published them.'],
    ],
  },
  {
    title: 'Dashboard 05 — Auditor',
    path: 'frontend/src/pages/auditor/',
    summary: 'Independent and read-only: nothing here changes data.',
    files: [
      ['AuditorOverview.jsx', 'Checks passed / failed / pending, alerts, verification queue.'],
      ['IntegrityDashboard.jsx', 'Re-verifies the audit hash chain and shows consistency results and history.'],
      ['AuditorPages.jsx', 'Bulletin board inspection and result verification (totals vs. ballots).'],
    ],
  },
  {
    title: 'Dashboards 06–08 — Verification, Results, Trust',
    path: 'frontend/src/pages/results/, trust/, public/VerifyReceipt.jsx',
    summary: 'Shared workspaces opened from several roles.',
    files: [
      ['results/ResultsAnalytics.jsx', 'Results & Analytics: eligible, recorded, turnout, validated ballots, candidate chart, turnout and historical comparison, exports.'],
      ['trust/TrustHealth.jsx', 'Trust & System Health: validation, duplicate prevention, anonymity, hash integrity, audit completion and backend health, each from real checks.'],
      ['public/VerifyReceipt.jsx', 'The Vote Verification Portal (also embedded at /app/verify).'],
    ],
  },
  {
    title: 'Pages shared by several roles',
    path: 'frontend/src/pages/shared/',
    summary: 'One implementation reused wherever the role has the permission.',
    files: [
      ['AuditLog.jsx', 'Searchable audit log with chain verification.'],
      ['Reports.jsx, ReportView.jsx', 'Generate, list, view and export reports.'],
      ['BulletinTable.jsx', 'Bulletin board table used by the public, admin and auditor pages.'],
      ['Notifications.jsx', 'Full notification list with filters.'],
      ['Profile.jsx', 'Account details, password change, notification preferences.'],
    ],
  },
  {
    title: 'Frontend tests',
    path: 'frontend/src/test/',
    summary: 'Vitest + Testing Library. Run with npm test.',
    files: [
      ['navigation.test.jsx', 'Routing, sign-in redirect, per-role home pages, this guide.'],
      ['dashboards.test.jsx, dataTable.test.jsx, forms.test.jsx', 'Dashboard rendering, table search/sort/paging, form validation.'],
      ['voting.test.jsx', 'Ballot selection limits, NOTA and the submit flow.'],
      ['apiErrors.test.jsx, firebaseAuth.test.jsx, logic.test.js', 'Error states, Firebase sign-in UI, helper functions.'],
      ['setup.js', 'Test environment setup.'],
    ],
  },
];

export const BACKEND_GROUPS = [
  {
    title: 'Application start and configuration',
    path: 'backend/src/main/java/com/digivote/ + config/',
    summary: 'Boots Spring and wires security, settings and documentation.',
    files: [
      ['DigiVoteApplication.java', 'main() — starts the Spring Boot application.'],
      ['config/SecurityConfig.java', 'Spring Security: which URLs are public, JWT authentication, CORS, stateless sessions.'],
      ['config/DigiVoteProperties.java', 'Typed access to the digivote.* settings in application.yml (all from environment variables).'],
      ['config/OpenApiConfig.java', 'Swagger UI / OpenAPI setup.'],
      ['config/TimeConfig.java', 'A shared Clock, so tests can control time.'],
      ['resources/application.yml', 'Database, Flyway, upload limits, ports and every DigiVote setting with its env-variable name. Reads ../.env automatically.'],
      ['pom.xml', 'Maven build: Spring Boot 3.5, Java 21, JPA, Security, Flyway, MySQL driver, Bouncy Castle, ZXing, Firebase Admin.'],
    ],
  },
  {
    title: 'access — roles and authorization',
    path: 'access/',
    summary: 'OOP heart of authorization: one class per role, all asked the same question.',
    files: [
      ['User.java', 'Abstract user acting inside one organization (abstraction + inheritance).'],
      ['OrganizationOwnerUser, ElectionAdministratorUser, CandidateUser, VoterUser, AuditorUser', 'Each role\'s own permission set (polymorphism). AuditorUser has no write permission at all.'],
      ['UserFactory.java', 'Factory pattern: builds the right role object from a database membership.'],
      ['Permission.java', 'The list of fine-grained capabilities (MANAGE_ELECTION, VERIFY_INTEGRITY…).'],
      ['AccessControlService.java', 'The authorization boundary. Reads the role from the database (never from the token), checks the permission and organization.'],
    ],
  },
  {
    title: 'auth — sign-in and sessions',
    path: 'auth/',
    summary: 'Accounts get in; roles are always looked up fresh.',
    files: [
      ['AuthController.java', '/api/auth endpoints: register organization, login, activate invitation, Firebase login, profile, password.'],
      ['AuthService.java', 'Password hashing, lockout after failed attempts, activation codes, Firebase account linking.'],
      ['JwtService.java', 'Issues and verifies the session token (HS256). Roles are not inside it, so revoking a role works instantly.'],
      ['CurrentUser.java', 'Reads the signed-in account id from the verified token.'],
      ['AuthDtos.java', 'Request/response records for auth endpoints.'],
    ],
  },
  {
    title: 'organization and user — tenants and accounts',
    path: 'organization/, user/',
    summary: 'Multi-organization data isolation.',
    files: [
      ['Organization.java, OrganizationService.java, OrganizationController.java', 'Organization profile, branding and members (invite, assign role, suspend, remove).'],
      ['Membership.java, RoleCode.java', 'Links an account to an organization with one of the five roles.'],
      ['user/UserAccount.java, UserStatus.java', 'The identity record. The password hash is private and never sent to the API.'],
    ],
  },
  {
    title: 'election — elections, rules and lifecycle',
    path: 'election/',
    summary: 'Draft → Registration → Campaign → Voting → Verification → Published → Archived, enforced in one place.',
    files: [
      ['Election.java', 'Aggregate root. Its status can only change through the lifecycle service.'],
      ['ElectionController.java, ElectionService.java', 'Create, list, update elections and assign administrators.'],
      ['ElectionRule.java, RuleSettings.java, rules/RuleEngine.java', 'Per-election rules (max selections, NOTA, counting method, result visibility) and the single engine that interprets them.'],
      ['state/ElectionState.java, LifecycleStates.java, ElectionStateMachine.java', 'State pattern: each state says which transitions and operations it allows.'],
      ['state/ElectionLifecycleService.java', 'The only way to change status: validates the move, runs readiness checks and side effects (e.g. key generation when voting opens) atomically.'],
      ['state/ElectionLifecycleEvent.java', 'Observer pattern: event published after each accepted transition.'],
      ['ReadinessService.java', 'Checks that guard transitions and feed the readiness panels.'],
      ['StateTransition.java', 'Timeline entry stored for every transition.'],
    ],
  },
  {
    title: 'candidate — applications, manifestos, media',
    path: 'candidate/',
    summary: 'Candidate workflow and campaign content.',
    files: [
      ['CandidateApplication.java', 'Workflow: SUBMITTED → (CORRECTION_REQUESTED → SUBMITTED)* → APPROVED / REJECTED / WITHDRAWN.'],
      ['Candidate.java', 'An approved contestant that appears on the ballot.'],
      ['Manifesto.java, ManifestoFreezeListener.java', 'Manifesto content; the listener freezes all manifestos when voting opens (also enforced by a DB trigger).'],
      ['CandidateService.java, CandidateController.java', 'Apply, review, approve/reject, edit profile and manifesto, upload media.'],
      ['storage/MediaStorage, LocalMediaStorage, FirebaseMediaStorage', 'Where uploaded files live: .local/media in development, or Firebase Storage.'],
      ['storage/ValidatingMediaStorage.java', 'Decorator pattern: checks file type and real file signature before storing.'],
    ],
  },
  {
    title: 'voting — eligibility, credentials and ballots',
    path: 'voting/',
    summary: 'Split into an identity side (who may vote) and an anonymous side (what was voted). The two share no keys.',
    files: [
      ['EligibleVoter.java, EligibilityService.java', 'Identity side: the eligible voter list.'],
      ['CredentialIssuanceService.java, VotingCredential.java', 'Signs each eligible voter\'s blinded token once. The server never sees the token itself.'],
      ['VotingController.java', 'Endpoints for credentials, the anonymous ballot submission (no login token) and receipts.'],
      ['BallotSubmissionService.java, BallotTransaction.java', 'One transaction: check the signature, block duplicates under a lock, validate selections, encrypt, store, issue receipt.'],
      ['Ballot.java, Vote.java, VotingToken.java', 'Anonymous side: ballot, one Paillier ciphertext per option, spent token (UNIQUE so it can never vote twice).'],
      ['ElectionKeys.java, ElectionKeyService.java', 'Per-election keys created when voting opens; private keys sealed with the master key.'],
      ['VerificationReceipt.java, ReceiptCodes.java, QrCodes.java', 'Receipt codes (only their hash is stored) and QR images.'],
      ['BulletinBoardEntry.java, BallotCommitments.java', 'Hash-chained public record per ballot.'],
      ['AnonymousIds.java', 'Random ids for anonymous rows so ordering cannot link a ballot to a voter.'],
    ],
  },
  {
    title: 'result — counting',
    path: 'result/',
    summary: 'Totals are computed from encrypted ballots; individual ballots are never decrypted.',
    files: [
      ['ResultService.java', 'Multiplies the ciphertexts of each option (homomorphic addition) and decrypts only the totals.'],
      ['CountingStrategy.java, CountingStrategyRegistry.java', 'Strategy pattern: picks the counting algorithm from the election\'s rules.'],
      ['AbstractRankingStrategy.java, PluralityCountingStrategy.java, ApprovalCountingStrategy.java', 'Template method: shared ranking and tie handling; plurality and approval rules.'],
      ['ElectionResult.java, ElectionResultItem.java', 'Stored outcome; immutable once published (also enforced by a trigger).'],
    ],
  },
  {
    title: 'verification — public checking',
    path: 'verification/',
    summary: 'Unauthenticated endpoints for anyone to verify.',
    files: [
      ['PublicController.java', '/api/public: public elections, results, bulletin board, receipt verification, anonymous ballot submission.'],
      ['ReceiptVerificationService.java', 'Each outcome states exactly what it proves: recorded, included in the tally, pending, invalid.'],
      ['BulletinBoardService.java', 'Appends ballots to the board in shuffled batches and verifies the chain.'],
    ],
  },
  {
    title: 'audit — tamper-evident logs',
    path: 'audit/',
    summary: 'Every significant action is chained with SHA-256 so edits or deletions are detectable.',
    files: [
      ['AuditService.java, AuditLog.java, AuditChainHead.java', 'Appends records to a per-organization hash chain, locking the head so it never forks.'],
      ['AuditHasher.java', 'The exact canonical form that is hashed.'],
      ['AuditIntegrityService.java', 'Recomputes the chain from the start and reports edited, missing or reordered records.'],
      ['SecurityEvent.java, SecurityEventService.java', 'Failed logins, rejected duplicate ballots and similar events, saved even when the request fails.'],
      ['AuditController.java', 'Endpoints for logs, security events and chain verification.'],
    ],
  },
  {
    title: 'report, notification, crypto, firebase, common',
    path: 'report/, notification/, crypto/, firebase/, common/',
    summary: 'Supporting services.',
    files: [
      ['report/ReportService.java, TrustService.java', 'Aggregate-only report snapshots; live trust checks that report NOT_RUN instead of a fake pass.'],
      ['notification/*', 'In-app notifications after lifecycle changes (Observer) and optional Firebase push.'],
      ['crypto/BlindRsa.java, Paillier.java', 'Blind signatures for anonymous credentials; additively homomorphic encryption for the tally.'],
      ['crypto/KeyVault.java, SecureTokens.java, CredentialKeyFingerprint.java', 'AES-256-GCM key sealing, secure random ids, published key fingerprint.'],
      ['firebase/*', 'Optional Firebase Admin: ID-token verification and App Check. Off unless FIREBASE_ENABLED=true.'],
      ['common/ApiException, GlobalExceptionHandler, ErrorResponse, PageResponse, Hashing', 'Consistent error JSON (no stack traces to clients), paging wrapper, SHA-256 helpers.'],
    ],
  },
  {
    title: 'Database migrations',
    path: 'backend/src/main/resources/db/migration/',
    summary: 'Flyway runs these in order on backend start. Never edit an applied migration; add a new V5__… file.',
    files: [
      ['V1__core_schema.sql', 'The 28 tables: organizations, users, memberships, elections, rules, candidates, eligible voters, credentials, ballots, votes, receipts, bulletin board, audit, results, reports, notifications.'],
      ['V2__views_procedures_triggers.sql', 'Views, the stored procedure and the triggers that protect audit logs, frozen manifestos and published results.'],
      ['V3__reference_data.sql', 'Reference rows such as the five roles.'],
      ['V4__anonymity_hardening.sql', 'Removes ordering and timing data that could pair a voter with a ballot; locks the signing key once voting opens.'],
    ],
  },
  {
    title: 'Backend tests',
    path: 'backend/src/test/java/com/digivote/',
    summary: 'mvn test. Unit tests always run; *IT integration tests use the digivote_test database and skip themselves if it is unreachable.',
    files: [
      ['crypto/*, audit/AuditHasherTest, voting/ReceiptCodesTest', 'Blind RSA, Paillier, key vault, hashing and receipt codes.'],
      ['election/ElectionStateMachineTest, RuleEngineTest', 'Allowed and rejected lifecycle transitions; rule evaluation.'],
      ['access/RolePolymorphismTest, result/CountingStrategyTest', 'Role permissions and counting algorithms.'],
      ['integration/VotingWorkflowIT, AnonymityIT, ClosureRaceIT, SecurityIT, DatabaseIT', 'Whole flows on real MySQL, including concurrent duplicate votes and authorization.'],
    ],
  },
];

export const OTHER_FILES = [
  ['scripts/e2e-workflow.mjs', 'Drives the whole election through the API. --prepare-demo creates accounts and an open election.'],
  ['scripts/dev-mysql.sh', 'Private development MySQL on port 3307 (macOS / Linux).'],
  ['scripts/demo-*.sh', 'Isolated demo stack with fixed per-role accounts (see docs/DEMO_ACCOUNTS.md).'],
  ['scripts/check-secrets.sh', 'Fails if a secret file is tracked by git.'],
  ['docker-compose.yml, backend/Dockerfile', 'Optional containerised MySQL + backend.'],
  ['firebase.json, storage.rules', 'Firebase Hosting for frontend/dist and deny-all storage rules.'],
  ['.env.example, frontend/.env.example', 'Every configuration variable with placeholders.'],
  ['docs/', 'Architecture, database design, security model, API reference, test report, deployment, viva preparation.'],
];

/** End-to-end flows, step by step, naming the code involved. */
export const FLOWS = [
  {
    title: 'Running an election',
    steps: [
      'Owner registers the organization (Register.jsx → AuthService) and invites members (Members.jsx → OrganizationService).',
      'Administrator creates a draft with the wizard (CreateElectionWizard.jsx → ElectionService) and its rules (RuleSettings).',
      'Each lifecycle button calls ElectionLifecycleService, which asks the state machine and ReadinessService before changing status.',
      'Opening voting generates the election keys (ElectionKeyService) and freezes manifestos (ManifestoFreezeListener) in the same transaction.',
      'After voting closes, ResultService tallies the encrypted ballots; publishing makes results immutable.',
    ],
  },
  {
    title: 'Casting an anonymous vote',
    steps: [
      'The voter\'s browser makes a random token and blinds it (crypto/blindRsa.js), after checking the key fingerprint (keyTransparency.js).',
      'Signed in, it asks for a credential: CredentialIssuanceService checks eligibility and signs the blinded value once per voter.',
      'The browser unblinds the signature and stores it locally (credentialStore.js).',
      'The ballot is sent with the anonymous client — no login token — to BallotTransaction, which checks the signature, rejects reused tokens, encrypts each option and stores it.',
      'The voter gets a receipt code + QR (ReceiptCodes, QrCodes) and can verify it later in the portal.',
    ],
  },
  {
    title: 'Verifying and auditing',
    steps: [
      'Receipt code → ReceiptVerificationService → bulletin board entry: "recorded"; once results include that board state: "counted".',
      'Anyone can browse the hash-chained bulletin board (BulletinBoard.jsx → BulletinBoardService).',
      'Auditors re-run the audit chain from genesis (IntegrityDashboard.jsx → AuditIntegrityService).',
      'TrustService computes each trust check live; trustStatus.js maps them to Verified / Attention Required / Integrity Failure.',
    ],
  },
];

export const COMMANDS = [
  ['cd backend && mvn spring-boot:run', 'Start the API'],
  ['cd backend && mvn test', 'Backend unit + integration tests'],
  ['cd backend && mvn -DskipTests package', 'Build backend/target/digivote-backend-1.0.0.jar'],
  ['cd frontend && npm run dev', 'Start the frontend dev server'],
  ['cd frontend && npm test', 'Frontend tests'],
  ['cd frontend && npm run build', 'Production build into frontend/dist'],
  ['node scripts/e2e-workflow.mjs --prepare-demo', 'Create demo accounts and an open election'],
];
