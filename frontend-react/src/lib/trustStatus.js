/**
 * Trust verdict for an election, derived only from the checks returned by GET /api/elections/{id}/trust.
 * There is no numeric "trust score": the verdict follows the explicit rule below.
 */
export const TRUST_RULE =
  'Integrity failure if any check fails. Attention required if no checks exist, or any check raised a warning or has not run yet. Verified only when every check passed.';

export const TRUST_STATES = {
  VERIFIED: { key: 'VERIFIED', label: 'Verified', kind: 'success', tone: 'green', icon: 'checkCircle' },
  ATTENTION_REQUIRED: { key: 'ATTENTION_REQUIRED', label: 'Attention required', kind: 'warning', tone: 'amber', icon: 'warning' },
  INTEGRITY_FAILURE: { key: 'INTEGRITY_FAILURE', label: 'Integrity failure', kind: 'error', tone: 'red', icon: 'error' },
};

export function countChecks(checks = []) {
  const count = (s) => checks.filter((c) => c.status === s).length;
  return { total: checks.length, pass: count('PASS'), fail: count('FAIL'), warn: count('WARN'), notRun: count('NOT_RUN') };
}

export function trustVerdict(trust) {
  const checks = trust?.checks ?? [];
  if (trust?.overall === 'INTEGRITY_PROBLEMS' || checks.some((c) => c.status === 'FAIL')) {
    return TRUST_STATES.INTEGRITY_FAILURE;
  }
  if (!checks.length || checks.some((c) => c.status === 'WARN' || c.status === 'NOT_RUN')) {
    return TRUST_STATES.ATTENTION_REQUIRED;
  }
  return TRUST_STATES.VERIFIED;
}

/** Worst verdict across several elections (used for organization-level summaries). */
export function worstVerdict(verdicts) {
  if (verdicts.some((v) => v.key === 'INTEGRITY_FAILURE')) return TRUST_STATES.INTEGRITY_FAILURE;
  if (verdicts.some((v) => v.key === 'ATTENTION_REQUIRED')) return TRUST_STATES.ATTENTION_REQUIRED;
  return verdicts.length ? TRUST_STATES.VERIFIED : TRUST_STATES.ATTENTION_REQUIRED;
}
