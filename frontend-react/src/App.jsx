import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PublicLayout from './components/PublicLayout.jsx';
import AppShell from './components/AppShell.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import { useAuth } from './auth/AuthContext.jsx';
import { homeFor } from './components/navigation.js';
import Landing from './pages/public/Landing.jsx';
import About from './pages/public/About.jsx';
import SecurityOverview from './pages/public/SecurityOverview.jsx';
import Login from './pages/public/Login.jsx';
import Register from './pages/public/Register.jsx';
import Activate from './pages/public/Activate.jsx';
import AuthAction from './pages/public/AuthAction.jsx';
import PublicElections from './pages/public/PublicElections.jsx';
import PublicResults from './pages/public/PublicResults.jsx';
import VerifyReceipt from './pages/public/VerifyReceipt.jsx';
import BulletinBoard from './pages/public/BulletinBoard.jsx';
import NotFound from './pages/public/NotFound.jsx';
import Guide from './pages/public/Guide.jsx';

// Authenticated pages are loaded on demand so the first paint stays small.
const OwnerOverview = lazy(() => import('./pages/owner/OwnerOverview.jsx'));
const OrganizationSettings = lazy(() => import('./pages/owner/OrganizationSettings.jsx'));
const Members = lazy(() => import('./pages/owner/Members.jsx'));
const RolesPermissions = lazy(() => import('./pages/owner/RolesPermissions.jsx'));
const SecurityCenter = lazy(() => import('./pages/owner/SecurityCenter.jsx'));
const ElectionArchive = lazy(() => import('./pages/owner/ElectionArchive.jsx'));
const ElectionsList = lazy(() => import('./pages/admin/ElectionsList.jsx'));
const ElectionManage = lazy(() => import('./pages/admin/ElectionManage.jsx'));
const OperationsOverview = lazy(() => import('./pages/admin/OperationsOverview.jsx'));
const CreateElectionWizard = lazy(() => import('./pages/admin/CreateElectionWizard.jsx'));
const CandidateApprovals = lazy(() => import('./pages/admin/CandidateApprovals.jsx'));
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const ActivityPage = named(() => import('./pages/admin/ElectionPages.jsx'), 'ActivityPage');
const LifecyclePage = named(() => import('./pages/admin/ElectionPages.jsx'), 'LifecyclePage');
const ResultsManagementPage = named(() => import('./pages/admin/ElectionPages.jsx'), 'ResultsManagementPage');
const RulesPage = named(() => import('./pages/admin/ElectionPages.jsx'), 'RulesPage');
const VoterManagementPage = named(() => import('./pages/admin/ElectionPages.jsx'), 'VoterManagementPage');
const CandidateOverview = lazy(() => import('./pages/candidate/CandidateOverview.jsx'));
const CandidateSection = lazy(() => import('./pages/candidate/CandidateSection.jsx'));
const CandidacyHome = lazy(() => import('./pages/candidate/CandidacyHome.jsx'));
const CandidateWorkspace = lazy(() => import('./pages/candidate/CandidateWorkspace.jsx'));
const VoterOverview = lazy(() => import('./pages/voter/VoterOverview.jsx'));
const ElectionDirectory = lazy(() => import('./pages/voter/ElectionDirectory.jsx'));
const CandidateDirectory = lazy(() => import('./pages/voter/CandidateDirectory.jsx'));
const CastVoteHub = lazy(() => import('./pages/voter/CastVoteHub.jsx'));
const PublishedResults = lazy(() => import('./pages/voter/PublishedResults.jsx'));
const MyElections = lazy(() => import('./pages/voter/MyElections.jsx'));
const ElectionInfo = lazy(() => import('./pages/voter/ElectionInfo.jsx'));
const CastBallot = lazy(() => import('./pages/voter/CastBallot.jsx'));
const MyReceipts = lazy(() => import('./pages/voter/MyReceipts.jsx'));
const AuditorOverview = lazy(() => import('./pages/auditor/AuditorOverview.jsx'));
const IntegrityDashboard = lazy(() => import('./pages/auditor/IntegrityDashboard.jsx'));
const BulletinPage = named(() => import('./pages/auditor/AuditorPages.jsx'), 'BulletinPage');
const ResultVerificationPage = named(() => import('./pages/auditor/AuditorPages.jsx'), 'ResultVerificationPage');
const ResultsAnalytics = lazy(() => import('./pages/results/ResultsAnalytics.jsx'));
const TrustHealth = lazy(() => import('./pages/trust/TrustHealth.jsx'));
const AuditLog = lazy(() => import('./pages/shared/AuditLog.jsx'));
const Reports = lazy(() => import('./pages/shared/Reports.jsx'));
const Notifications = lazy(() => import('./pages/shared/Notifications.jsx'));
const Profile = lazy(() => import('./pages/shared/Profile.jsx'));
const ComingSoon = lazy(() => import('./pages/shared/ComingSoon.jsx'));

function AppHome() {
  const { active } = useAuth();
  return <Navigate to={active ? homeFor(active.role) : '/app/profile'} replace />;
}

const guard = (element, props = {}) => <RequireAuth {...props}>{element}</RequireAuth>;

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="about" element={<About />} />
        <Route path="security" element={<SecurityOverview />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="activate" element={<Activate />} />
        <Route path="auth/action" element={<AuthAction />} />
        <Route path="elections" element={<PublicElections />} />
        <Route path="elections/:electionId/results" element={<PublicResults />} />
        <Route path="elections/:electionId/bulletin" element={<BulletinBoard />} />
        <Route path="verify" element={<VerifyReceipt />} />
        <Route path="guide" element={<Guide />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<AppHome />} />

        {/* Organization Owner */}
        <Route path="overview" element={guard(<OwnerOverview />, { roles: ['ORG_OWNER'] })} />
        <Route path="organization" element={guard(<OrganizationSettings />, { permission: 'MANAGE_ORGANIZATION' })} />
        <Route path="members" element={guard(<Members />, { permission: 'MANAGE_MEMBERS' })} />
        <Route path="roles" element={guard(<RolesPermissions />, { permission: 'MANAGE_MEMBERS' })} />
        <Route path="archive" element={guard(<ElectionArchive />, { permission: 'VIEW_ELECTION_INTERNALS' })} />
        <Route path="security" element={guard(<SecurityCenter />, { permission: 'VIEW_SECURITY_EVENTS' })} />

        {/* Election Administrator */}
        <Route path="operations" element={guard(<OperationsOverview />, { permission: 'MANAGE_ELECTION' })} />
        <Route path="elections" element={guard(<ElectionsList />, { permission: 'VIEW_ELECTION_INTERNALS' })} />
        <Route path="elections/new" element={guard(<CreateElectionWizard />, { permission: 'CREATE_ELECTION' })} />
        <Route path="elections/:electionId" element={guard(<ElectionManage />, { permission: 'VIEW_ELECTION_INTERNALS' })} />
        <Route path="approvals" element={guard(<CandidateApprovals />, { permission: 'MANAGE_ELECTION' })} />
        <Route path="voters" element={guard(<VoterManagementPage />, { permission: 'MANAGE_ELECTION' })} />
        <Route path="rules" element={guard(<RulesPage />, { permission: 'MANAGE_ELECTION' })} />
        <Route path="lifecycle" element={guard(<LifecyclePage />, { permission: 'MANAGE_ELECTION' })} />
        <Route path="results-management" element={guard(<ResultsManagementPage />, { permission: 'MANAGE_ELECTION' })} />
        <Route path="activity" element={guard(<ActivityPage />, { permission: 'VIEW_ELECTION_INTERNALS' })} />

        {/* Shared insight dashboards */}
        <Route path="results" element={guard(<ResultsAnalytics />, { permission: 'VIEW_ELECTION_INTERNALS' })} />
        <Route path="trust" element={guard(<TrustHealth />, { permission: 'VIEW_ELECTION_INTERNALS' })} />
        <Route path="reports" element={guard(<Reports />, { permission: 'VIEW_REPORTS' })} />
        <Route path="audit" element={guard(<AuditLog />, { permission: 'VIEW_AUDIT_LOGS' })} />

        {/* Auditor */}
        <Route path="auditor" element={guard(<AuditorOverview />, { roles: ['AUDITOR'] })} />
        <Route path="integrity" element={guard(<IntegrityDashboard />, { permission: 'VERIFY_INTEGRITY' })} />
        <Route path="bulletin" element={guard(<BulletinPage />, { permission: 'VIEW_ELECTION_INTERNALS' })} />
        <Route path="result-verification" element={guard(<ResultVerificationPage />, { permission: 'VERIFY_INTEGRITY' })} />

        {/* Candidate */}
        <Route path="candidate" element={guard(<CandidateOverview />, { permission: 'APPLY_AS_CANDIDATE' })} />
        <Route path="candidate/:section" element={guard(<CandidateSection />, { permission: 'APPLY_AS_CANDIDATE' })} />
        <Route path="candidacy" element={guard(<CandidacyHome />, { permission: 'APPLY_AS_CANDIDATE' })} />
        <Route path="candidacy/:candidateId" element={guard(<CandidateWorkspace />, { permission: 'APPLY_AS_CANDIDATE' })} />

        {/* Voter */}
        <Route path="voter" element={guard(<VoterOverview />, { roles: ['VOTER'] })} />
        <Route path="directory" element={<ElectionDirectory />} />
        <Route path="my-elections" element={<MyElections />} />
        <Route path="candidates" element={<CandidateDirectory />} />
        <Route path="cast" element={<CastVoteHub />} />
        <Route path="e/:electionId" element={<ElectionInfo />} />
        <Route path="vote/:electionId" element={<CastBallot />} />
        <Route path="receipts" element={<MyReceipts />} />
        <Route path="verify" element={<VerifyReceipt embedded />} />
        <Route path="published" element={<PublishedResults />} />

        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="soon/:feature" element={<ComingSoon />} />
        <Route path="*" element={<AppHome />} />
      </Route>
    </Routes>
  );
}
