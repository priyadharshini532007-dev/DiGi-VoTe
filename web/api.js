/* DigiVote web/api.js
 * Bridge between the HTML prototype (index.html) and the Spring Boot backend on the SAME origin.
 *
 * Two modes:
 *   demo (default)  the prototype runs standalone from localStorage, exactly as before. Nothing here calls the network.
 *   live            state S is built from the backend after sign-in; no demo data, nothing is written to localStorage.
 * Choose with  ?mode=live  or  ?mode=demo  in the URL (remembered in localStorage), or DV_API.setMode('live').
 * Opening index.html from disk (file://) is always demo mode.
 *
 * Crypto (blind signatures, Paillier, receipts, audit hashing) stays on the backend; this file never signs,
 * hashes or tallies anything. It moves JSON and maps backend shapes to the shapes the screens already read.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- mode
  const MODE_KEY = 'digivote.mode';
  const TOKEN_KEY = 'digivote.api.session';
  const DEFAULT_MODE = 'demo';

  const mem = {}; // fallback when web storage is blocked
  const store = (kind) => ({
    get(k) { try { return window[kind].getItem(k); } catch { return mem[kind + k] ?? null; } },
    set(k, v) { try { window[kind].setItem(k, v); } catch { mem[kind + k] = v; } },
    del(k) { try { window[kind].removeItem(k); } catch { delete mem[kind + k]; } },
  });
  const local = store('localStorage');
  const session = store('sessionStorage'); // the JWT lives only for the tab's lifetime

  function resolveMode() {
    if (location.protocol === 'file:') return 'demo';
    const q = new URLSearchParams(location.search).get('mode');
    if (q === 'live' || q === 'demo') { local.set(MODE_KEY, q); return q; }
    const saved = local.get(MODE_KEY);
    return saved === 'live' || saved === 'demo' ? saved : DEFAULT_MODE;
  }
  const mode = resolveMode();

  // ---------------------------------------------------------------- errors
  /** Error thrown for every failed call. `.message` is safe to show to the user. */
  class DvApiError extends Error {
    constructor(status, code, message, fieldErrors) {
      super(message);
      this.name = 'DvApiError';
      this.status = status;       // HTTP status, 0 = network/timeout
      this.code = code;           // backend ErrorResponse.code, or NETWORK / TIMEOUT / BAD_RESPONSE
      this.fieldErrors = fieldErrors || []; // [{ field, message }]
    }
  }

  // Backend codes -> sentences in the prototype's own voice. Unknown codes fall back to the server message.
  const MESSAGES = {
    UNAUTHORIZED: 'The DV number (or email) or password is incorrect.',
    WRONG_ROLE: 'This account is not registered for that role.',
    ACCOUNT_LOCKED: 'This account is temporarily locked after too many failed attempts. Try again later.',
    ACTIVATION_REQUIRED: 'This account has not been activated yet. Use the activation code from your invitation.',
    NO_ACCOUNT: 'No DigiVote account matches this sign-in.',
    EMAIL_NOT_VERIFIED: 'Verify your email address first, then try again.',
    FORBIDDEN: 'You do not have permission to do that.',
    NOT_FOUND: 'That item was not found.',
    DUPLICATE_VOTE: 'A ballot has already been cast with this credential.',
    VALIDATION_FAILED: 'Some details need fixing.',
    BAD_REQUEST: 'The request was not understood. Check the details and try again.',
    CONCURRENT_MODIFICATION: 'Someone else changed this at the same time. Reload and try again.',
    INTEGRITY_VIOLATION: 'This conflicts with existing data.',
    UPLOAD_TOO_LARGE: 'That file is too large.',
    METHOD_NOT_ALLOWED: 'That action is not available.',
    INTERNAL_ERROR: 'The server hit an unexpected error. Nothing was changed. Try again.',
    NETWORK: 'The DigiVote API did not respond. Nothing was changed. Try again.',
    TIMEOUT: 'The DigiVote API took too long to respond. Nothing was changed. Try again.',
    BAD_RESPONSE: 'The server sent an unexpected reply. Nothing was changed.',
    SESSION_EXPIRED: 'Your session has expired. Sign in again.',
  };

  /** Text for toasts and alert boxes. Specific server messages win over generic ones for 4xx business rules. */
  function errorMessage(err) {
    if (!(err instanceof DvApiError)) return err?.message || String(err);
    const generic = MESSAGES[err.code];
    const specific = err.status >= 400 && err.status < 500 && err.code !== 'VALIDATION_FAILED'
      && !['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST'].includes(err.code);
    if (specific && err.message) return err.message;
    return generic || err.message || 'Something went wrong.';
  }

  /** Turn backend field errors into the {inputName: text} object that the prototype's showErrors() expects.
   *  `aliases` maps backend field names to form input names, e.g. { fullName: 'sname', email: 'semail' }. */
  function fieldErrors(err, aliases = {}) {
    const out = {};
    if (err instanceof DvApiError) for (const fe of err.fieldErrors) out[aliases[fe.field] || fe.field] = fe.message;
    return out;
  }

  // ---------------------------------------------------------------- token
  let current = null; // { token, expiresAt }
  function readSession() {
    try { const j = JSON.parse(session.get(TOKEN_KEY) || 'null'); if (j && j.token) return j; } catch { /* ignore */ }
    return null;
  }
  function setSession(token, expiresAt) { current = { token, expiresAt: expiresAt || null }; session.set(TOKEN_KEY, JSON.stringify(current)); }
  function clearSession() { current = null; session.del(TOKEN_KEY); }
  function token() {
    if (!current) current = readSession();
    if (current && current.expiresAt && Date.parse(current.expiresAt) <= Date.now()) { clearSession(); return null; }
    return current ? current.token : null;
  }

  // ---------------------------------------------------------------- http
  const BASE = (window.DV_API_BASE || '').replace(/\/$/, ''); // same origin by default
  const TIMEOUT_MS = 20000;

  /** request(method, path, { body, query, auth, form, signal }) -> parsed JSON (or null for 204). */
  async function request(method, path, opts = {}) {
    const { body, query, auth = true, form, blob } = opts;
    let url = BASE + path;
    if (query) {
      const qs = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.append(k, v); });
      const s = qs.toString(); if (s) url += (url.includes('?') ? '&' : '?') + s;
    }
    const headers = { Accept: 'application/json' };
    const t = auth ? token() : null;
    if (auth && !t) throw new DvApiError(401, 'SESSION_EXPIRED', MESSAGES.SESSION_EXPIRED);
    if (t) headers.Authorization = 'Bearer ' + t;
    let payload;
    if (form) payload = form; // FormData: the browser sets the multipart boundary
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    if (opts.signal) opts.signal.addEventListener('abort', () => ctl.abort());
    let res;
    try {
      res = await fetch(url, { method, headers, body: payload, signal: ctl.signal, credentials: 'omit' });
    } catch (e) {
      const timedOut = ctl.signal.aborted && !(opts.signal && opts.signal.aborted);
      throw new DvApiError(0, timedOut ? 'TIMEOUT' : 'NETWORK', MESSAGES[timedOut ? 'TIMEOUT' : 'NETWORK']);
    } finally { clearTimeout(timer); }

    if (res.ok && blob) return res.blob();
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }

    if (!res.ok) {
      const err = new DvApiError(res.status, data?.code || (res.status === 401 ? 'UNAUTHORIZED' : 'ERROR'),
        data?.message || res.statusText || 'Request failed', data?.fieldErrors);
      // A rejected token on a protected call means the session is over (login itself is auth:false).
      if (res.status === 401 && auth) { expire(); err.code = 'SESSION_EXPIRED'; err.message = MESSAGES.SESSION_EXPIRED; }
      throw err;
    }
    if (text && data === null) throw new DvApiError(res.status, 'BAD_RESPONSE', MESSAGES.BAD_RESPONSE);
    return data;
  }

  function expire() {
    if (!token() && !current) return;
    clearSession();
    window.dispatchEvent(new CustomEvent('dv:session-expired'));
  }

  const http = {
    get: (p, query, o) => request('GET', p, { ...o, query }),
    post: (p, body, o) => request('POST', p, { ...o, body }),
    put: (p, body, o) => request('PUT', p, { ...o, body }),
    patch: (p, body, o) => request('PATCH', p, { ...o, body }),
    del: (p, o) => request('DELETE', p, o),
    upload: (p, formData, o) => request((o && o.method) || 'POST', p, { ...o, form: formData }),
    blob: (p, o) => request('GET', p, { ...o, blob: true }),
  };

  // ---------------------------------------------------------------- ids
  // The prototype uses string ids ('u3', 'e1'); the backend uses numbers. Keep the mapping in one place.
  const ids = {
    user: { to: (n) => 'u' + n, from: (s) => Number(String(s).slice(1)) },
    election: { to: (n) => 'e' + n, from: (s) => Number(String(s).slice(1)) },
    application: { to: (n) => 'a' + n, from: (s) => Number(String(s).slice(1)) },
  };

  // ---------------------------------------------------------------- state shape
  const DAY = 86400000;
  /** Same top-level shape as the prototype's seed(), but empty. Screens can read it before any data arrives. */
  function emptyState() {
    const now = Date.now();
    return {
      v: 4, session: null, receiptKeys: {}, verifyCount: {}, outage: false, tamper: null, bbTamper: null,
      users: [], elections: [], apps: [], creds: {}, ballots: {}, pending: {}, bulletin: {}, receipts: {},
      wallet: {}, results: {}, audit: [], security: [], notes: [], reports: [], transitions: [], imports: [],
      spent: {}, devCred: {}, integrityRuns: [], seededAt: now, progress: {}, complaints: [], emails: [],
      org: { name: '', type: '', description: '', email: '', phone: '', status: 'ACTIVE', created: now, logoUrl: '', primaryColor: '#0b1f4d', tagline: '' },
      policy: { minLength: 10, lockoutAttempts: 5, lockoutMinutes: 15, sessionMinutes: 120, requireMixed: true, history: [] },
      live: true,
    };
  }

  const ts = (iso) => (iso ? Date.parse(iso) : null);

  /** Pick the membership the prototype will act as. Remembered per tab; defaults to the first ACTIVE one. */
  function chooseMembership(me, role) {
    const list = (me.memberships || []).filter((m) => m.status === 'ACTIVE');
    if (role) return list.find((m) => m.role === role) || null; // the role box the person clicked on the login page
    const wanted = Number(session.get('digivote.api.membership'));
    return list.find((m) => m.membershipId === wanted) || list[0] || null;
  }
  const activeRoles = (me) => (me.memberships || []).filter((m) => m.status === 'ACTIVE').map((m) => m.role);

  /** me (AuthDtos.MeResponse) -> S.users entry in the shape the screens read. */
  function userFromMe(me, m) {
    return {
      id: ids.user.to(me.id), uniqueNo: me.dvNumber, name: me.fullName, email: me.email, role: m ? m.role : null, status: 'ACTIVE',
      added: Date.now(), lastLogin: ts(me.lastLoginAt), mobile: me.mobileNumber || '',
      education: '', experience: '', achievements: '', photo: '',
      permissions: m ? m.permissions : [],
    };
  }

  // Organization types: the registration form shows labels, the backend stores codes.
  const ORG_TYPES = { UNIVERSITY: 'University', COMPANY: 'Company', HOUSING_SOCIETY: 'Housing society', NGO: 'NGO', CLUB: 'Club', OTHER: 'Other' };
  const orgTypeCode = (label) => Object.keys(ORG_TYPES).find((k) => ORG_TYPES[k] === label) || null;

  // ---------------------------------------------------------------- hydration
  // Each feature slice registers a hydrator; hydrate() runs them in order after sign-in. A failing slice is
  // recorded in S.hydrateErrors and does not block the others (the screen shows its own empty/error state).
  const hydrators = [];
  const ctx = { me: null, membership: null, orgId: null };

  /** addHydrator(name, async (S, ctx, http, ids) => void) */
  function addHydrator(name, fn) { hydrators.push({ name, fn }); }

  /** Session-level hydration: who am I, which organization, which role. Always first. */
  function applySession(S, me, role) {
    const m = chooseMembership(me, role);
    if (m) session.set('digivote.api.membership', String(m.membershipId));
    ctx.me = me; ctx.membership = m; ctx.orgId = m ? m.organizationId : null;
    const u = userFromMe(me, m);
    S.users = [u];
    S.session = m ? u.id : null; // a user with no active membership cannot enter the app
    if (m) {
      S.org.type = ORG_TYPES[m.organizationType] || S.org.type;
      S.org.name = m.organizationName; S.org.primaryColor = m.primaryColor || S.org.primaryColor;
      S.org.slug = m.organizationSlug; S.org.id = m.organizationId;
    }
    S.memberships = (me.memberships || []).map((x) => ({ id: x.membershipId, orgId: x.organizationId, org: x.organizationName, role: x.role, status: x.status }));
    return u;
  }

  async function hydrate(S) {
    S.hydrateErrors = {};
    for (const h of hydrators) {
      try { await h.fn(S, ctx, http, ids); } catch (e) {
        if (e instanceof DvApiError && e.code === 'SESSION_EXPIRED') throw e;
        S.hydrateErrors[h.name] = errorMessage(e);
        if (window.console) console.warn('[DV_API] hydrate "' + h.name + '" failed:', e);
      }
    }
  }

  // ---------------------------------------------------------------- auth
  const auth = {
    config: () => http.get('/api/auth/config', null, { auth: false }),
    me: () => http.get('/api/auth/me'),
    /** Check credentials without opening a session (the login page confirms the details first). */
    authenticate(identifier, password) {
      const id = String(identifier).trim();
      const body = id.includes('@') ? { email: id.toLowerCase(), password } : { dvNumber: id.toUpperCase().replace(/\s+/g, ''), password };
      return http.post('/api/auth/login', body, { auth: false });
    },
    accept(r) { setSession(r.token, r.expiresAt); },
    async login(identifier, password) { const r = await auth.authenticate(identifier, password); auth.accept(r); return r; },
    async registerOrganization(body) {
      const r = await http.post('/api/auth/register-organization', body, { auth: false });
      setSession(r.token, r.expiresAt); return r;
    },
    async activate(body) {
      const r = await http.post('/api/auth/activate', body, { auth: false });
      setSession(r.token, r.expiresAt); return r;
    },
    recover: (body) => http.post('/api/auth/recover', body, { auth: false }),
    updateProfile: (body) => http.put('/api/auth/me', body),
    changePassword: (body) => http.post('/api/auth/change-password', body),
    logout() { clearSession(); session.del('digivote.api.membership'); },
    hasToken: () => !!token(),
  };

  /** Sign in with DV number or email + password, then fill S. `role` (optional) = the role the person chose.
   *  Resolves to the prototype user id. */
  async function signIn(S, identifier, password, role) {
    const r = await auth.login(identifier, password);
    return afterAuth(S, r.user, role);
  }
  /** Common tail for login / register / activate: apply the session, then run the slice hydrators. */
  async function afterAuth(S, me, role) {
    if (role && !chooseMembership(me, role)) {
      auth.logout();
      throw new DvApiError(403, 'WRONG_ROLE', 'This account is registered as ' + (activeRoles(me).join(', ') || 'no active role') + ', not ' + role + '.');
    }
    const u = applySession(S, me, role);
    if (!S.session) { auth.logout(); throw new DvApiError(403, 'FORBIDDEN', 'This account has no active organization membership.'); }
    await hydrate(S);
    return u.id;
  }
  /** Page reload in live mode: reuse the tab's token if it is still valid. Resolves to the user id or null. */
  async function restore(S) {
    if (!auth.hasToken()) return null;
    try { return await afterAuth(S, await auth.me()); } catch (e) { if (e instanceof DvApiError && e.status === 0) throw e; auth.logout(); return null; }
  }

  // ---------------------------------------------------------------- public surface
  window.DV_API = {
    mode, live: mode === 'live', demo: mode !== 'live',
    setMode(m) { if (m !== 'live' && m !== 'demo') throw new Error("mode must be 'live' or 'demo'"); local.set(MODE_KEY, m); const u = new URL(location.href); u.searchParams.delete('mode'); location.href = u.toString(); },
    DvApiError, errorMessage, fieldErrors, MESSAGES,
    http, auth, ids, ctx,
    orgTypeCode, ORG_TYPES,
    emptyState, addHydrator, hydrate, applySession, signIn, afterAuth, restore, activeRoles, chooseMembership,
    expire,
  };

  // An expired/rejected token: drop back to the public site. The prototype's own listener (index.html) re-renders.
  window.addEventListener('dv:session-expired', () => { if (window.DV_API) window.DV_API.sessionExpired = true; });
})();
