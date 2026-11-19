import { api, publicApi } from './client.js';

const d = (p) => p.then((r) => r.data);

export const Auth = {
  config: () => d(publicApi.get('/api/auth/config')),
  login: (body) => d(publicApi.post('/api/auth/login', body)),
  registerOrganization: (body) => d(publicApi.post('/api/auth/register-organization', body)),
  activate: (body) => d(publicApi.post('/api/auth/activate', body)),
  firebase: (idToken) => d(publicApi.post('/api/auth/firebase', { idToken })),
  firebaseRegister: (body) => d(publicApi.post('/api/auth/firebase/register-organization', body)),
  firebaseActivate: (body) => d(publicApi.post('/api/auth/firebase/activate', body)),
  me: () => d(api.get('/api/auth/me')),
  updateProfile: (body) => d(api.put('/api/auth/me', body)),
  changePassword: (body) => d(api.post('/api/auth/change-password', body)),
};

export const Orgs = {
  get: (orgId) => d(api.get(`/api/orgs/${orgId}`)),
  update: (orgId, body) => d(api.put(`/api/orgs/${orgId}`, body)),
  securityPolicy: (orgId, body) => d(api.put(`/api/orgs/${orgId}/security-policy`, body)),
  overview: (orgId) => d(api.get(`/api/orgs/${orgId}/overview`)),
  members: (orgId, page = 0, size = 50) => d(api.get(`/api/orgs/${orgId}/members`, { params: { page, size } })),
  invite: (orgId, body) => d(api.post(`/api/orgs/${orgId}/members`, body)),
  changeRole: (orgId, membershipId, role) => d(api.patch(`/api/orgs/${orgId}/members/${membershipId}/role`, { role })),
  changeStatus: (orgId, membershipId, status) =>
    d(api.patch(`/api/orgs/${orgId}/members/${membershipId}/status`, { status })),
  roles: () => d(api.get('/api/roles')),
};

export const Elections = {
  list: (orgId, page = 0, size = 50) => d(api.get(`/api/orgs/${orgId}/elections`, { params: { page, size } })),
  create: (orgId, body) => d(api.post(`/api/orgs/${orgId}/elections`, body)),
  mine: () => d(api.get('/api/me/elections')),
  get: (id) => d(api.get(`/api/elections/${id}`)),
  update: (id, body) => d(api.put(`/api/elections/${id}`, body)),
  updateRules: (id, body) => d(api.put(`/api/elections/${id}/rules`, body)),
  transition: (id, target, note) => d(api.post(`/api/elections/${id}/transitions`, { target, note })),
  readiness: (id) => d(api.get(`/api/elections/${id}/readiness`)),
  timeline: (id) => d(api.get(`/api/elections/${id}/timeline`)),
  administrators: (id) => d(api.get(`/api/elections/${id}/administrators`)),
  assignAdministrator: (id, userId) => d(api.post(`/api/elections/${id}/administrators`, { userId })),
  generateResults: (id) => d(api.post(`/api/elections/${id}/results/generate`)),
  results: (id) => d(api.get(`/api/elections/${id}/results`)),
  trust: (id) => d(api.get(`/api/elections/${id}/trust`)),
  participation: (id) => d(api.get(`/api/elections/${id}/participation`)),
  auditTrail: (id) => d(api.get(`/api/elections/${id}/audit-trail`)),
  bulletin: (id, page = 0) => d(api.get(`/api/elections/${id}/bulletin`, { params: { page, size: 50 } })),
  aggregation: (id) => d(api.get(`/api/elections/${id}/integrity/aggregation`)),
};

export const Candidates = {
  apply: (electionId, body) => d(api.post(`/api/elections/${electionId}/applications`, body)),
  applications: (electionId) => d(api.get(`/api/elections/${electionId}/applications`)),
  myApplications: () => d(api.get('/api/me/applications')),
  revise: (applicationId, body) => d(api.put(`/api/applications/${applicationId}`, body)),
  review: (applicationId, decision, note) => d(api.post(`/api/applications/${applicationId}/review`, { decision, note })),
  withdraw: (applicationId) => d(api.post(`/api/applications/${applicationId}/withdraw`)),
  forElection: (electionId) => d(api.get(`/api/elections/${electionId}/candidates`)),
  get: (candidateId) => d(api.get(`/api/candidates/${candidateId}`)),
  updateProfile: (candidateId, body) => d(api.put(`/api/candidates/${candidateId}/profile`, body)),
  saveManifesto: (candidateId, body) => d(api.put(`/api/candidates/${candidateId}/manifesto`, body)),
  publishManifesto: (candidateId) => d(api.post(`/api/candidates/${candidateId}/manifesto/publish`)),
  upload: (candidateId, type, file) => {
    const form = new FormData();
    form.append('file', file);
    return d(api.post(`/api/candidates/${candidateId}/media`, form, { params: { type } }));
  },
  mediaBlob: (url) => d(api.get(url, { responseType: 'blob' })),
};

export const Voting = {
  voters: (electionId, page = 0) => d(api.get(`/api/elections/${electionId}/voters`, { params: { page, size: 100 } })),
  addVoters: (electionId, emails) => d(api.post(`/api/elections/${electionId}/voters`, { emails })),
  addAllMembers: (electionId) => d(api.post(`/api/elections/${electionId}/voters/add-all-members`)),
  removeVoter: (electionId, eligibleVoterId) => d(api.delete(`/api/elections/${electionId}/voters/${eligibleVoterId}`)),
  eligibility: (electionId) => d(api.get(`/api/elections/${electionId}/eligibility`)),
  credentialKey: (electionId) => d(api.get(`/api/elections/${electionId}/credential-key`)),
  issueCredential: (electionId, blindedMessageHex) =>
    d(api.post(`/api/elections/${electionId}/credentials`, { blindedMessageHex })),
  ballot: (electionId) => d(api.get(`/api/elections/${electionId}/ballot`)),
  /** Anonymous: sent without the session token. */
  castBallot: (electionId, body) => d(publicApi.post(`/api/public/elections/${electionId}/ballots`, body)),
};

export const Audit = {
  logs: (orgId, page = 0, typePrefix) =>
    d(api.get(`/api/orgs/${orgId}/audit-logs`, { params: { page, size: 50, typePrefix } })),
  verify: (orgId) => d(api.post(`/api/orgs/${orgId}/audit-logs/verify`)),
  securityEvents: (orgId, page = 0) => d(api.get(`/api/orgs/${orgId}/security-events`, { params: { page, size: 50 } })),
};

export const Reports = {
  forElection: (electionId, type) => d(api.post(`/api/elections/${electionId}/reports`, null, { params: { type } })),
  forOrganization: (orgId, type) => d(api.post(`/api/orgs/${orgId}/reports`, null, { params: { type } })),
  list: (orgId) => d(api.get(`/api/orgs/${orgId}/reports`, { params: { size: 50 } })),
  get: (reportId) => d(api.get(`/api/reports/${reportId}`)),
};

export const Notifications = {
  list: () => d(api.get('/api/me/notifications', { params: { size: 50 } })),
  markRead: (id) => d(api.post(`/api/me/notifications/${id}/read`)),
  registerDevice: (token) => d(api.post('/api/me/device-tokens', { token })),
};

export const Public = {
  health: () => d(publicApi.get('/api/public/health')),
  elections: () => d(publicApi.get('/api/public/elections')),
  results: (electionId) => d(publicApi.get(`/api/public/elections/${electionId}/results`)),
  bulletin: (electionId, page = 0) =>
    d(publicApi.get(`/api/public/elections/${electionId}/bulletin`, { params: { page, size: 50 } })),
  verifyReceipt: (code) => d(publicApi.get(`/api/public/receipts/${encodeURIComponent(code)}`)),
  /** Election-wide credential key anchor, fetched without the session (identical for every caller). */
  credentialKey: (electionId) => d(publicApi.get(`/api/public/elections/${electionId}/credential-key`)),
};
