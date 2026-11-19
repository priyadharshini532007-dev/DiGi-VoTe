const EVENTS = {
  AUTH_LOGIN_SUCCEEDED: ['Signed in', 'Access'],
  AUTH_LOGIN_FAILED: ['Failed sign-in attempt', 'Security'],
  AUTH_ACCOUNT_LOCKED: ['Account locked after failed sign-ins', 'Security'],
  AUTH_ACCOUNT_ACTIVATED: ['Account activated from an invitation', 'Members'],
  AUTH_PASSWORD_CHANGED: ['Password changed', 'Access'],
  AUTH_FIREBASE_LINKED: ['Firebase sign-in linked to an account', 'Access'],
  ORG_REGISTERED: ['Organization registered', 'Organization'],
  ORG_UPDATED: ['Organization profile updated', 'Organization'],
  ORG_SECURITY_POLICY_UPDATED: ['Security policy changed', 'Security'],
  MEMBER_INVITED: ['Member invited', 'Members'],
  MEMBER_ROLE_CHANGED: ['Role assigned', 'Members'],
  MEMBER_STATUS_CHANGED: ['Member status changed', 'Members'],
  ELECTION_CREATED: ['Election created', 'Elections'],
  ELECTION_UPDATED: ['Election details updated', 'Elections'],
  ELECTION_RULES_UPDATED: ['Election rules updated', 'Elections'],
  ELECTION_ADMIN_ASSIGNED: ['Election administrator assigned', 'Elections'],
  ELECTION_STATE_CHANGED: ['Election moved to a new stage', 'Elections'],
  ELECTION_VOTING_OPENED: ['Voting opened', 'Elections'],
  ELECTION_VOTING_CLOSED: ['Voting closed', 'Elections'],
  ELECTION_ARCHIVED: ['Election archived', 'Elections'],
  ELECTION_KEYS_GENERATED: ['Election keys generated', 'Elections'],
  CANDIDATE_APPLIED: ['Candidate application submitted', 'Candidates'],
  CANDIDATE_REVIEWED: ['Candidate application reviewed', 'Candidates'],
  CANDIDATE_WITHDRAWN: ['Candidate withdrew', 'Candidates'],
  MANIFESTO_PUBLISHED: ['Manifesto published', 'Candidates'],
  MANIFESTOS_FROZEN: ['Manifestos frozen', 'Candidates'],
  MEDIA_UPLOADED: ['Campaign media uploaded', 'Candidates'],
  VOTERS_ADDED: ['Eligible voters added', 'Voting'],
  VOTER_REMOVED: ['Eligible voter removed', 'Voting'],
  CREDENTIAL_ISSUED: ['Voting credential issued', 'Voting'],
  BALLOT_ACCEPTED: ['Ballot accepted (historic record)', 'Voting'],
  BALLOTS_PUBLISHED: ['Ballot batch published to the bulletin board', 'Voting'],
  BALLOT_REJECTED: ['Ballot rejected', 'Security'],
  RESULTS_GENERATED: ['Results generated', 'Results'],
  RESULTS_PUBLISHED: ['Results published', 'Results'],
  RECEIPT_VERIFIED: ['Receipt lookup performed', 'Verification'],
  INTEGRITY_VERIFIED: ['Integrity verification run', 'Verification'],
  REPORT_GENERATED: ['Report generated', 'Reports'],
  SECURITY_EVENT: ['Security event recorded', 'Security'],
};

export function describeAuditEvent(type) {
  const known = EVENTS[type];
  if (known) return { label: known[0], category: known[1] };
  return { label: String(type).replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), category: 'Other' };
}

/** Where an audit event is best inspected for the signed-in role. */
export function auditEventTarget(log, role) {
  const operator = ['ORG_OWNER', 'ELECTION_ADMIN', 'AUDITOR'].includes(role);
  if (log.electionId && operator) return `/app/elections/${log.electionId}?tab=timeline`;
  if (log.eventType.startsWith('MEMBER_') && role === 'ORG_OWNER') return '/app/members';
  if (log.eventType === 'ORG_SECURITY_POLICY_UPDATED' || log.eventType.startsWith('AUTH_')) return role === 'ORG_OWNER' || role === 'AUDITOR' ? '/app/security' : null;
  if (log.eventType.startsWith('ORG_') && role === 'ORG_OWNER') return '/app/organization';
  if (log.eventType === 'REPORT_GENERATED') return '/app/reports';
  return operator ? '/app/audit' : null;
}
