/**
 * Reference copy of the role permission sets enforced by the backend (access/*User.java).
 * It is display-only: the server is authoritative and checks every request itself.
 */
export const ROLE_ORDER = ['ORG_OWNER', 'ELECTION_ADMIN', 'CANDIDATE', 'VOTER', 'AUDITOR'];

export const ROLE_PERMISSIONS = {
  ORG_OWNER: [
    'MANAGE_ORGANIZATION', 'MANAGE_MEMBERS', 'ASSIGN_ROLES', 'CONFIGURE_SECURITY_POLICY', 'CREATE_ELECTION',
    'MANAGE_ELECTION', 'ASSIGN_ELECTION_ADMINS', 'PUBLISH_RESULTS', 'ARCHIVE_ELECTION', 'VIEW_ELECTION_INTERNALS',
    'CAST_VOTE', 'VIEW_AUDIT_LOGS', 'VERIFY_INTEGRITY', 'VIEW_SECURITY_EVENTS', 'GENERATE_REPORTS', 'VIEW_REPORTS',
  ],
  ELECTION_ADMIN: [
    'CREATE_ELECTION', 'MANAGE_ELECTION', 'PUBLISH_RESULTS', 'ARCHIVE_ELECTION', 'VIEW_ELECTION_INTERNALS',
    'CAST_VOTE', 'VIEW_AUDIT_LOGS', 'GENERATE_REPORTS', 'VIEW_REPORTS',
  ],
  CANDIDATE: ['APPLY_AS_CANDIDATE', 'CAST_VOTE'],
  VOTER: ['CAST_VOTE'],
  AUDITOR: [
    'VIEW_ELECTION_INTERNALS', 'VIEW_AUDIT_LOGS', 'VERIFY_INTEGRITY', 'VIEW_SECURITY_EVENTS', 'GENERATE_REPORTS',
    'VIEW_REPORTS',
  ],
};

export const PERMISSION_ROWS = [
  { group: 'Organization', key: 'MANAGE_ORGANIZATION', label: 'Manage organization profile and branding' },
  { group: 'Organization', key: 'MANAGE_MEMBERS', label: 'Invite, suspend and remove members' },
  { group: 'Organization', key: 'ASSIGN_ROLES', label: 'Assign roles to members' },
  { group: 'Organization', key: 'CONFIGURE_SECURITY_POLICY', label: 'Configure password and lockout policy' },
  { group: 'Elections', key: 'CREATE_ELECTION', label: 'Create elections' },
  { group: 'Elections', key: 'MANAGE_ELECTION', label: 'Configure rules, approve candidates, manage voter lists, run lifecycle', note: 'Only for elections the user operates' },
  { group: 'Elections', key: 'ASSIGN_ELECTION_ADMINS', label: 'Assign election administrators' },
  { group: 'Elections', key: 'PUBLISH_RESULTS', label: 'Publish results' },
  { group: 'Elections', key: 'ARCHIVE_ELECTION', label: 'Archive elections' },
  { group: 'Elections', key: 'VIEW_ELECTION_INTERNALS', label: 'Inspect election internals (readiness, voters, progress)' },
  { group: 'Participation', key: 'APPLY_AS_CANDIDATE', label: 'Apply as a candidate and manage own campaign' },
  { group: 'Participation', key: 'CAST_VOTE', label: 'Vote (subject to eligibility and election rules)' },
  { group: 'Oversight', key: 'VIEW_AUDIT_LOGS', label: 'View audit logs' },
  { group: 'Oversight', key: 'VERIFY_INTEGRITY', label: 'Run integrity verification' },
  { group: 'Oversight', key: 'VIEW_SECURITY_EVENTS', label: 'View security events' },
  { group: 'Oversight', key: 'GENERATE_REPORTS', label: 'Generate reports' },
  { group: 'Oversight', key: 'VIEW_REPORTS', label: 'View reports' },
];

export function roleHas(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
