import { useParams, useSearchParams } from 'react-router-dom';
import { Elections } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ErrorState, Loading, PageHeader, StatusBadge, Tabs } from '../../components/ui.jsx';
import OverviewTab from './OverviewTab.jsx';
import RulesForm from './RulesForm.jsx';
import CandidatesTab from './CandidatesTab.jsx';
import VotersTab from './VotersTab.jsx';
import ProgressTab from './ProgressTab.jsx';
import ResultsTab from './ResultsTab.jsx';
import TrustTab from './TrustTab.jsx';
import TimelineTab from './TimelineTab.jsx';
import BulletinTab from './BulletinTab.jsx';

const EDITABLE_RULES = ['DRAFT', 'REGISTRATION', 'CAMPAIGN'];

export default function ElectionManage() {
  const { electionId } = useParams();
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const { data: election, loading, error, reload } = useApi(() => Elections.get(electionId), [electionId]);
  const tab = params.get('tab') ?? 'overview';

  if (loading && !election) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const operator = election.me.operator;
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'rules', label: 'Rules' },
    { key: 'candidates', label: 'Candidates' },
    { key: 'voters', label: 'Eligible voters' },
    { key: 'progress', label: 'Voting progress' },
    { key: 'bulletin', label: 'Bulletin board' },
    { key: 'results', label: 'Results' },
    { key: 'health', label: 'Health & trust' },
    { key: 'timeline', label: 'Timeline & audit' },
  ];

  return (
    <div>
      <PageHeader
        title={election.title}
        subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={election.status} /> {operator ? 'You operate this election' : 'Read-only view'}</span>}
      />
      <Tabs tabs={tabs} active={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'overview' && <OverviewTab election={election} operator={operator} canAssign={can('ASSIGN_ELECTION_ADMINS')} onChange={reload} />}
      {tab === 'rules' && <RulesForm key={election.updatedAt} election={election} editable={operator && EDITABLE_RULES.includes(election.status)} onSaved={reload} />}
      {tab === 'candidates' && <CandidatesTab election={election} operator={operator} />}
      {tab === 'voters' && <VotersTab election={election} operator={operator} onChange={reload} />}
      {tab === 'progress' && <ProgressTab election={election} />}
      {tab === 'bulletin' && <BulletinTab election={election} />}
      {tab === 'results' && <ResultsTab election={election} operator={operator} canPublish={can('PUBLISH_RESULTS')} onChange={reload} />}
      {tab === 'health' && <TrustTab election={election} />}
      {tab === 'timeline' && <TimelineTab election={election} canAudit={can('VIEW_AUDIT_LOGS')} />}
    </div>
  );
}
