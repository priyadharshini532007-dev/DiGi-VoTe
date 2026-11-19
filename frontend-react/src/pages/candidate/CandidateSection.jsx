import { Link, useParams } from 'react-router-dom';
import { Candidates } from '../../api/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { EmptyState, ErrorState, Loading, PageHeader } from '../../components/ui.jsx';
import CandidateWorkspace from './CandidateWorkspace.jsx';

const VALID = ['profile', 'manifesto', 'media', 'campaign', 'timeline'];

/** Resolves the candidate's own candidacy and shows one section of its workspace. */
export default function CandidateSection() {
  const { section } = useParams();
  const apps = useApi(() => Candidates.myApplications(), []);
  if (!VALID.includes(section)) return <EmptyState title="Unknown section" />;
  if (apps.loading) return <Loading />;
  if (apps.error) return <ErrorState message={apps.error} onRetry={apps.reload} />;
  const approved = (apps.data ?? []).find((a) => a.candidateId);
  if (!approved) {
    return (
      <div>
        <PageHeader title="Not on a ballot yet" />
        <EmptyState title="This section opens once an application is approved"
          action={<Link to="/app/candidacy" className="text-sm font-medium text-navy-700">Go to application status</Link>}>
          Your public profile, manifesto and media are created when an administrator approves your application.
        </EmptyState>
      </div>
    );
  }
  return <CandidateWorkspace key={`${approved.candidateId}-${section}`} candidateId={approved.candidateId} section={section} />;
}
