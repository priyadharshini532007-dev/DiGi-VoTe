import { describe, expect, it } from 'vitest';
import { parseVoterList } from '../lib/csv.js';
import { csvEscape, toCsv } from '../lib/download.js';
import { TRUST_STATES, countChecks, trustVerdict, worstVerdict } from '../lib/trustStatus.js';
import { VOTER_STATUS, voterStatusFor } from '../lib/voterStatus.js';
import { applicationCompleteness, profileCompleteness, turnoutPercent, upcomingDeadlines, isUpcoming } from '../lib/elections.js';
import { NAV, crumbsFor, electionPath } from '../components/navigation.js';
import { PERMISSION_ROWS, ROLE_PERMISSIONS, roleHas } from '../lib/permissions.js';
import { verifyStateFor, VERIFY_STATES } from '../pages/public/VerifyReceipt.jsx';
import { describeAuditEvent } from '../lib/activity.js';

describe('voter list parsing', () => {
  it('classifies valid, invalid and duplicate rows and reports line numbers', () => {
    const r = parseVoterList('a@x.org\nnot-an-email\nA@X.org\nb@y.org, c@z.org');
    expect(r.counts).toEqual({ total: 5, valid: 3, invalid: 1, duplicate: 1 });
    expect(r.rows.find((x) => x.status === 'duplicate')).toMatchObject({ line: 3, reason: 'Repeated in this file' });
    expect(r.validEmails).toEqual(['a@x.org', 'b@y.org', 'c@z.org']);
  });

  it('uses the email column of a CSV with a header and ignores other columns', () => {
    const r = parseVoterList('name,Email,dept\nAnn,ann@x.org,HR\nBob,bad,IT');
    expect(r.hasHeader).toBe(true);
    expect(r.validEmails).toEqual(['ann@x.org']);
    expect(r.rows[1]).toMatchObject({ email: 'bad', status: 'invalid', line: 3 });
  });

  it('handles empty input and flags a missing email cell', () => {
    expect(parseVoterList('').counts.total).toBe(0);
    expect(parseVoterList('email\n\n,').rows.every((x) => x.status === 'invalid')).toBe(true);
  });
});

describe('csv export', () => {
  it('quotes separators and neutralises spreadsheet formulas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvEscape(null)).toBe('');
    expect(toCsv([{ label: 'N', value: (r) => r.n }], [{ n: 1 }, { n: '+2' }])).toBe("N\r\n1\r\n'+2");
  });
});

describe('trust verdict rule', () => {
  const check = (status) => ({ key: status, label: status, status, detail: '' });
  it('is Verified only when every check passed', () => {
    expect(trustVerdict({ checks: [check('PASS'), check('PASS')] })).toBe(TRUST_STATES.VERIFIED);
  });
  it('needs attention for warnings, checks not run, or no checks at all', () => {
    expect(trustVerdict({ checks: [check('PASS'), check('NOT_RUN')] })).toBe(TRUST_STATES.ATTENTION_REQUIRED);
    expect(trustVerdict({ checks: [check('WARN')] })).toBe(TRUST_STATES.ATTENTION_REQUIRED);
    expect(trustVerdict({ checks: [] })).toBe(TRUST_STATES.ATTENTION_REQUIRED);
    expect(trustVerdict(null)).toBe(TRUST_STATES.ATTENTION_REQUIRED);
  });
  it('is an integrity failure when any check fails, even if others pass', () => {
    expect(trustVerdict({ checks: [check('PASS'), check('FAIL'), check('NOT_RUN')] })).toBe(TRUST_STATES.INTEGRITY_FAILURE);
    expect(trustVerdict({ overall: 'INTEGRITY_PROBLEMS', checks: [check('PASS')] })).toBe(TRUST_STATES.INTEGRITY_FAILURE);
  });
  it('counts outcomes and picks the worst across elections', () => {
    expect(countChecks([check('PASS'), check('PASS'), check('FAIL'), check('WARN'), check('NOT_RUN')]))
      .toEqual({ total: 5, pass: 2, fail: 1, warn: 1, notRun: 1 });
    expect(worstVerdict([TRUST_STATES.VERIFIED, TRUST_STATES.ATTENTION_REQUIRED])).toBe(TRUST_STATES.ATTENTION_REQUIRED);
    expect(worstVerdict([TRUST_STATES.VERIFIED, TRUST_STATES.INTEGRITY_FAILURE])).toBe(TRUST_STATES.INTEGRITY_FAILURE);
  });
});

describe('voter status wording', () => {
  const election = (status, me = {}) => ({ status, me: { mayVote: true, credentialIssued: false, ...me } });
  it('only claims a submitted vote when a local receipt exists', () => {
    expect(voterStatusFor(election('VOTING'), { receiptCode: 'X' })).toBe(VOTER_STATUS.SUBMITTED);
    expect(voterStatusFor(election('VOTING', { credentialIssued: true }), null)).toBe(VOTER_STATUS.CREDENTIAL_ONLY);
  });
  it('maps every stage', () => {
    expect(voterStatusFor(election('VOTING'), null)).toBe(VOTER_STATUS.READY);
    expect(voterStatusFor(election('VOTING', { mayVote: false }), null)).toBe(VOTER_STATUS.NOT_ELIGIBLE);
    expect(voterStatusFor(election('CAMPAIGN'), null)).toBe(VOTER_STATUS.NOT_YET_OPEN);
    expect(voterStatusFor(election('VERIFICATION'), null)).toBe(VOTER_STATUS.CLOSED);
    expect(voterStatusFor(election('PUBLISHED'), null)).toBe(VOTER_STATUS.PUBLISHED);
  });
});

describe('election helpers', () => {
  it('computes turnout against an explicit denominator', () => {
    expect(turnoutPercent(3, 8)).toBe(37.5);
    expect(turnoutPercent(0, 0)).toBeNull();
  });

  it('measures completeness of applications and candidate profiles', () => {
    expect(applicationCompleteness({ displayName: 'A', statement: 'S', qualifications: '', achievements: ' ' }).percent).toBe(50);
    const empty = profileCompleteness({ qualifications: '', manifesto: null });
    expect(empty.percent).toBe(0);
    expect(empty.missing).toContain('Photograph');
    const full = profileCompleteness({
      qualifications: 'q', achievements: 'a', photoUrl: '/p',
      manifesto: { vision: 'v', mission: 'm', goals: 'g', schemes: 's', status: 'PUBLISHED' },
    });
    expect(full.percent).toBe(100);
  });

  it('lists future milestones soonest first and skips finished elections', () => {
    const now = Date.parse('2027-01-10T00:00:00Z');
    const elections = [
      { id: 1, title: 'A', status: 'CAMPAIGN', rules: { votingStart: '2027-01-15T00:00:00Z', votingEnd: '2027-01-20T00:00:00Z', campaignEnd: '2027-01-12T00:00:00Z' } },
      { id: 2, title: 'B', status: 'PUBLISHED', rules: { votingStart: '2027-01-11T00:00:00Z' } },
    ];
    const d = upcomingDeadlines(elections, now);
    expect(d.map((x) => x.key)).toEqual(['campaignEnd', 'votingStart', 'votingEnd']);
    expect(d.every((x) => x.electionId === 1)).toBe(true);
    expect(isUpcoming(elections[0], now)).toBe(true);
    expect(isUpcoming(elections[1], now)).toBe(false);
  });
});

describe('navigation and breadcrumbs', () => {
  it('builds a trail for known pages, detail pages and the role home', () => {
    expect(crumbsFor('/app/overview', 'ORG_OWNER')).toEqual([{ label: 'Dashboard' }]);
    expect(crumbsFor('/app/members', 'ORG_OWNER')).toEqual([{ label: 'Home', to: '/app/overview' }, { label: 'Voter Management' }]);
    expect(crumbsFor('/app/elections/42', 'ELECTION_ADMIN')).toEqual([
      { label: 'Home', to: '/app/operations' }, { label: 'Election List', to: '/app/elections' }, { label: 'Details' },
    ]);
    expect(crumbsFor('/app/elections/new', 'ELECTION_ADMIN')).toEqual([{ label: 'Home', to: '/app/operations' }, { label: 'Create Election' }]);
  });

  it('sends election links to the page the role may read', () => {
    expect(electionPath('ORG_OWNER', 5)).toBe('/app/elections/5');
    expect(electionPath('VOTER', 5)).toBe('/app/e/5');
  });

  it('keeps every role navigation free of duplicate destinations', () => {
    Object.entries(NAV).forEach(([role, items]) => {
      const dests = items.map((i) => i.to);
      expect(new Set(dests).size, role).toBe(dests.length);
    });
  });
});

describe('permission reference', () => {
  it('lists only permissions that exist in at least one role and never grants ballot access', () => {
    const granted = new Set(Object.values(ROLE_PERMISSIONS).flat());
    PERMISSION_ROWS.forEach((row) => expect(granted.has(row.key), row.key).toBe(true));
    expect(PERMISSION_ROWS.some((r) => /ballot selection|read vote|modify vote|decrypt/i.test(r.label))).toBe(false);
  });

  it('keeps the auditor read-only and the voter limited to voting', () => {
    expect(roleHas('AUDITOR', 'CAST_VOTE')).toBe(false);
    expect(roleHas('AUDITOR', 'MANAGE_ELECTION')).toBe(false);
    expect(ROLE_PERMISSIONS.VOTER).toEqual(['CAST_VOTE']);
    expect(roleHas('ELECTION_ADMIN', 'MANAGE_MEMBERS')).toBe(false);
  });
});

describe('verification portal states', () => {
  it('maps backend outcomes to distinct, honest states', () => {
    expect(verifyStateFor({ status: 'INCLUDED_IN_TALLY' }).title).toBe('Vote counted');
    expect(verifyStateFor({ status: 'BALLOT_RECORDED' }).title).toBe('Vote recorded');
    expect(verifyStateFor({ status: 'RECEIPT_RECOGNIZED' }).title).toMatch(/pending/);
    expect(verifyStateFor({ status: 'INVALID_RECEIPT' })).toBe(VERIFY_STATES.INVALID_RECEIPT);
  });

  it('reports an integrity warning only when the verifier says the board failed or lost the ballot', () => {
    expect(verifyStateFor({ status: 'VERIFICATION_UNAVAILABLE', checks: ['Bulletin board hash chain FAILED verification'] })).toBe(VERIFY_STATES.INTEGRITY_WARNING);
    expect(verifyStateFor({ status: 'VERIFICATION_UNAVAILABLE', checks: [] })).toBe(VERIFY_STATES.VERIFICATION_UNAVAILABLE);
  });
});

describe('activity labels', () => {
  it('describes known events and falls back readably for unknown ones', () => {
    expect(describeAuditEvent('MEMBER_INVITED')).toEqual({ label: 'Member invited', category: 'Members' });
    expect(describeAuditEvent('SOMETHING_NEW')).toMatchObject({ label: 'Something new', category: 'Other' });
  });
});
