const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const HEADER_NAMES = new Set(['email', 'e-mail', 'email address', 'emailaddress', 'mail']);

/**
 * Parses an eligible-voter list pasted or uploaded as text: either one email per line / comma separated,
 * or a CSV whose first row has an "email" column. Nothing is sent anywhere; this only classifies rows.
 * Row status is one of "valid", "invalid" or "duplicate" (a repeat within the same file).
 */
export function parseVoterList(text) {
  const rows = [];
  const seen = new Set();
  let emailCol = null;
  let headerHandled = false;
  let hasHeader = false;

  String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));

    if (!headerHandled) {
      headerHandled = true;
      const col = cells.findIndex((c) => HEADER_NAMES.has(c.toLowerCase()));
      if (col >= 0) {
        emailCol = col;
        hasHeader = true;
        return;
      }
    }

    const candidates = emailCol === null ? cells : [cells[emailCol] ?? ''];
    candidates.forEach((cell) => {
      if (emailCol === null && !cell) return;
      const email = cell.trim().toLowerCase();
      let status = 'valid';
      let reason = '';
      if (!email) {
        status = 'invalid';
        reason = 'Missing email address';
      } else if (email.length > 254 || !EMAIL.test(email)) {
        status = 'invalid';
        reason = 'Not a valid email address';
      } else if (seen.has(email)) {
        status = 'duplicate';
        reason = 'Repeated in this file';
      } else {
        seen.add(email);
      }
      rows.push({ line: index + 1, email: email || cell, status, reason });
    });
  });

  const count = (s) => rows.filter((r) => r.status === s).length;
  return {
    rows,
    hasHeader,
    validEmails: rows.filter((r) => r.status === 'valid').map((r) => r.email),
    counts: { total: rows.length, valid: count('valid'), invalid: count('invalid'), duplicate: count('duplicate') },
  };
}
