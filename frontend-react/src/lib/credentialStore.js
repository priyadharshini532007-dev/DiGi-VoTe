// Voter-device storage for anonymous credentials and receipts.
// Kept only in this browser: the server never learns the token until it is spent with a ballot.
// Entries are keyed by election id and contain no identity and no ballot selection.

const CRED_KEY = 'digivote.credentials';
const RECEIPT_KEY = 'digivote.receipts';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getCredential(electionId) {
  return read(CRED_KEY)[electionId] ?? null;
}

export function saveCredential(electionId, credential) {
  const all = read(CRED_KEY);
  all[electionId] = { ...all[electionId], ...credential };
  return write(CRED_KEY, all);
}

export function getReceipts() {
  return Object.values(read(RECEIPT_KEY)).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export function getReceipt(electionId) {
  return read(RECEIPT_KEY)[electionId] ?? null;
}

export function saveReceipt(receipt) {
  const all = read(RECEIPT_KEY);
  all[receipt.electionId] = { ...receipt, savedAt: new Date().toISOString() };
  return write(RECEIPT_KEY, all);
}
