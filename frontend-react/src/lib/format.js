export function formatDateTime(value) {
  if (!value) return '—';
  let s = String(value);
  // Zone-less timestamps from the API (minute-truncated ballot times) are UTC.
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) s += 'Z';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Compact date for dense tables, e.g. "5 Sep, 4:42 am". */
export function formatShort(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Relative time for activity feeds: "just now", "2 mins ago", "1 hour ago", "3 days ago". */
export function timeAgo(value, now = Date.now()) {
  if (!value) return '—';
  let s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) s += 'Z';
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return String(value);
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 45) return 'just now';
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return plural(min, 'min');
  const hr = Math.round(min / 60);
  if (hr < 24) return plural(hr, 'hour');
  const day = Math.round(hr / 24);
  if (day < 30) return plural(day, 'day');
  return new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** "Oct 10, 2026" style date without a time. */
export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function shortHash(hash, len = 12) {
  if (!hash) return '—';
  return hash.length > len ? `${hash.slice(0, len)}…` : hash;
}

export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null;
}

export const ROLE_LABELS = {
  ORG_OWNER: 'Organization Owner',
  ELECTION_ADMIN: 'Election Administrator',
  CANDIDATE: 'Candidate',
  VOTER: 'Voter',
  AUDITOR: 'Auditor',
};

export const STATUS_ORDER = ['DRAFT', 'REGISTRATION', 'CAMPAIGN', 'VOTING', 'VERIFICATION', 'PUBLISHED', 'ARCHIVED'];

export const NEXT_STATUS = {
  DRAFT: 'REGISTRATION',
  REGISTRATION: 'CAMPAIGN',
  CAMPAIGN: 'VOTING',
  VOTING: 'VERIFICATION',
  VERIFICATION: 'PUBLISHED',
  PUBLISHED: 'ARCHIVED',
};

export const TRANSITION_LABELS = {
  REGISTRATION: 'Publish election (open candidate registration)',
  CAMPAIGN: 'Start campaign',
  VOTING: 'Open voting',
  VERIFICATION: 'Close voting',
  PUBLISHED: 'Publish results',
  ARCHIVED: 'Archive election',
};
