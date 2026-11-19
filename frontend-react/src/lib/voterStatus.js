/**
 * What the voter can truthfully be told about one election.
 *
 * The server deliberately cannot link a ballot to a voter, so "vote submitted" is only known when this
 * device holds the receipt. Without a local receipt, an issued credential is reported as exactly that.
 */
export const VOTER_STATUS = {
  NOT_YET_OPEN: { key: 'NOT_YET_OPEN', label: 'Not yet open', tone: 'gray' },
  READY: { key: 'READY', label: 'Ready to vote', tone: 'green' },
  SUBMITTED: { key: 'SUBMITTED', label: 'Vote submitted', tone: 'green' },
  CREDENTIAL_ONLY: { key: 'CREDENTIAL_ONLY', label: 'Credential obtained, no receipt on this device', tone: 'amber' },
  NOT_ELIGIBLE: { key: 'NOT_ELIGIBLE', label: 'Not permitted to vote', tone: 'amber' },
  CLOSED: { key: 'CLOSED', label: 'Voting closed', tone: 'gray' },
  PUBLISHED: { key: 'PUBLISHED', label: 'Results published', tone: 'blue' },
};

export function voterStatusFor(election, receipt) {
  if (receipt) return VOTER_STATUS.SUBMITTED;
  const s = election.status;
  if (s === 'PUBLISHED' || s === 'ARCHIVED') return VOTER_STATUS.PUBLISHED;
  if (s === 'VERIFICATION') return VOTER_STATUS.CLOSED;
  if (s === 'VOTING') {
    if (election.me?.credentialIssued) return VOTER_STATUS.CREDENTIAL_ONLY;
    return election.me?.mayVote ? VOTER_STATUS.READY : VOTER_STATUS.NOT_ELIGIBLE;
  }
  return VOTER_STATUS.NOT_YET_OPEN;
}
