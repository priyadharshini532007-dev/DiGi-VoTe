/* DigiVote web/live.js
 * Live-mode overrides for the prototype: in live mode the screens keep reading the same state object `S`, but the
 * data comes from the backend (hydrators) and the mutating helpers call the API instead of editing `S` in place.
 * Loaded after the prototype's scripts. Does nothing in demo mode, so the prototype still runs standalone.
 *
 * Pattern for every slice:
 *   1. a hydrator fills S.<slice> in the shape the screens already read;
 *   2. the prototype's synchronous mutator (e.g. transition()) is replaced by an async one that calls the API and
 *      then re-reads the affected records. Prototype handlers already do `await api(() => mutator(...))`.
 */
(function () {
  'use strict';
  if (!window.DV_API || !DV_API.live) return;

  const { http, ids, ctx } = DV_API;
  const ts = (iso) => (iso ? Date.parse(iso) : null);
  const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
  const uid = (n) => ids.user.to(n);

  // ================================================================ core
  // The prototype wraps every state change in api(fn): simulated latency, outage switch, then save(). In live mode
  // fn may be async (it talks to the server); failures become Errors whose message is safe to show.
  window.api = async function api(fn) {
    try { return await fn(); } catch (e) {
      if (e instanceof DV_API.DvApiError) { const m = new Error(DV_API.errorMessage(e)); m.cause = e; m.fieldErrors = e.fieldErrors; throw m; }
      throw e;
    }
  };

  // ================================================================ elections
  const FROZEN = ['VOTING', 'VERIFICATION', 'PUBLISHED', 'ARCHIVED'];
  // Which backend readiness checks gate leaving each state (mirrors ReadinessService.relevantFor).
  const GATING = {
    DRAFT: ['rules'],
    REGISTRATION: ['rules', 'candidates', 'pendingApplications', 'selections'],
    CAMPAIGN: ['rules', 'candidates', 'pendingApplications', 'selections', 'voters', 'votingWindow'],
  };

  function mapRules(r) {
    return {
      countingMethod: r.countingMethod, maxSelections: r.maxSelections, minCandidates: r.minCandidates, notaEnabled: r.notaEnabled,
      requireCandidateApproval: r.requireCandidateApproval, anonymousVoting: r.anonymousVoting, candidatesMayVote: r.candidatesMayVote,
      administratorsMayVote: r.administratorsMayVote, receiptsRequired: r.receiptsRequired, qrReceipts: r.qrReceipts,
      publicResults: r.publicResults, resultPublicationPolicy: r.resultPublicationPolicy,
      campaignStart: ts(r.campaignStart), campaignEnd: ts(r.campaignEnd), votingStart: ts(r.votingStart), votingEnd: ts(r.votingEnd),
      withdrawalDeadline: ts(r.withdrawalDeadline),
    };
  }
  /** Prototype rules (epoch ms) -> RulesRequest (ISO instants). */
  function rulesBody(r, base = {}) {
    return {
      maxSelections: Number(r.maxSelections), countingMethod: r.countingMethod, requireCandidateApproval: !!r.requireCandidateApproval,
      anonymousVoting: !!r.anonymousVoting, publicResults: !!r.publicResults, qrReceipts: !!r.qrReceipts, receiptsRequired: !!r.receiptsRequired,
      notaEnabled: !!r.notaEnabled, candidatesMayVote: !!r.candidatesMayVote, administratorsMayVote: !!r.administratorsMayVote,
      resultPublicationPolicy: r.resultPublicationPolicy, minCandidates: Number(r.minCandidates),
      campaignStart: iso(r.campaignStart), campaignEnd: iso(r.campaignEnd), votingStart: iso(r.votingStart), votingEnd: iso(r.votingEnd),
      withdrawalDeadline: iso(r.withdrawalDeadline ?? base.withdrawalDeadline),
    };
  }

  const toDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
  const dataUrlToBlob = (url) => { const [head, b64] = url.split(','); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Blob([bytes], { type: head.slice(5, head.indexOf(';')) }); };

  /** The per-election extras only operators may read; failures leave them empty (the screen shows less, not an error). */
  async function extras(v) {
    const perms = (ctx.membership && ctx.membership.permissions) || [];
    const operator = perms.includes('VIEW_ELECTION_INTERNALS');
    const banner = v.hasBanner ? await http.blob(`/api/elections/${v.id}/banner`).then(toDataUrl).catch(() => '') : '';
    const [tl, ad, rd] = await Promise.all([
      http.get(`/api/elections/${v.id}/timeline`).catch(() => []),
      operator ? http.get(`/api/elections/${v.id}/administrators`).catch(() => []) : [],
      operator ? http.get(`/api/elections/${v.id}/readiness`).catch(() => null) : null,
    ]);
    return { tl, ad, rd, banner };
  }

  function mapElection(v, x) {
    const id = ids.election.to(v.id);
    const roleNow = ctx.membership && ctx.membership.role;
    const mine = x.ad.some((a) => uid(a.userId) === S.session) || (v.me && v.me.operator && roleNow === 'ELECTION_ADMIN');
    // adminId drives canManage(): an unassigned election must stay read-only for an Election Administrator.
    const adminId = mine ? S.session : x.ad[0] ? uid(x.ad[0].userId) : (roleNow === 'ELECTION_ADMIN' ? uid(0) : null);
    // The screens read e.eligible (emails). The voters slice fills the real list; until then keep the count right.
    const eligible = Array(Math.max(0, v.eligibleVoters || 0)).fill('');
    const self = S.users.find((u) => u.id === S.session);
    if (v.me && v.me.eligibleVoter && self && eligible.length) eligible[0] = self.email; // myEligible() looks for the signed-in email
    return {
      id, apiId: v.id, title: v.title, description: v.description || '', status: v.status, adminId,
      created: ts(v.createdAt), updated: ts(v.updatedAt), rules: mapRules(v.rules), eligible, frozen: FROZEN.includes(v.status),
      keys: null, banner: x.banner || '', rel: v.me || null, activeCandidates: v.activeCandidates || 0,
    };
  }

  function putElection(v, x) {
    const e = mapElection(v, x);
    const i = S.elections.findIndex((o) => o.id === e.id);
    if (i < 0) S.elections.unshift(e); else S.elections[i] = e;
    S.transitions = (S.transitions || []).filter((t) => t.eid !== e.id)
      .concat(x.tl.map((t) => ({ eid: e.id, from: t.from, to: t.to, at: ts(t.occurredAt), by: t.actorName || 'System', note: t.note || '' })));
    (S.readiness ||= {})[e.id] = x.rd;
    x.ad.forEach((a) => { if (!S.users.some((u) => u.id === uid(a.userId))) S.users.push({ id: uid(a.userId), name: a.fullName, email: a.email, role: 'ELECTION_ADMIN', status: 'ACTIVE', added: ts(a.assignedAt), lastLogin: null, education: '', experience: '', achievements: '', photo: '' }); });
    return e;
  }

  async function refreshElection(eid) {
    const v = await http.get(`/api/elections/${ids.election.from(eid)}`);
    const e = putElection(v, await extras(v));
    // the voter list belongs to the election record the screens read, so keep it fresh with it
    if (((ctx.membership && ctx.membership.permissions) || []).includes('VIEW_ELECTION_INTERNALS')) await loadVoters(e).catch(() => {});
    return e;
  }

  DV_API.addHydrator('elections', async () => {
    S.elections = []; S.transitions = []; S.readiness = {};
    const page = await http.get(`/api/orgs/${ctx.orgId}/elections`, { size: 100 });
    const all = await Promise.all(page.content.map(async (v) => [v, await extras(v)]));
    all.forEach(([v, x]) => putElection(v, x));
    S.elections.sort((a, b) => b.created - a.created);
  });

  // ---- readiness / preconditions come from the server (it is the authority, the screens only display them)
  const checksOf = (e) => ((S.readiness || {})[e.id] || { checks: [] }).checks.map((c) => ({ key: c.key, label: c.label, ok: c.passed, detail: c.detail }));
  window.readiness = (e) => checksOf(e);
  window.readinessScore = (e) => { const rd = (S.readiness || {})[e.id]; return rd ? rd.score : 0; };
  window.preconditions = (e) => {
    if (GATING[e.status]) return checksOf(e).filter((c) => GATING[e.status].includes(c.key));
    if (e.status === 'VOTING') return [{ label: 'Voting is open', ok: true, detail: 'Closing voting stops accepting ballots' }];
    if (e.status === 'VERIFICATION') return [{ label: 'Results are validated by the server when you publish', ok: true, detail: 'Generate results in Results management first' }];
    return [{ label: 'Election published', ok: true, detail: 'No further checks' }];
  };

  // Re-read readiness when the dialog opens: it depends on the clock (voting window) and on other slices' data.
  const openTransition = ACT.transition;
  ACT.transition = async (el) => {
    try { await refreshElection(el.dataset.eid); } catch (e) { toast('error', esc(DV_API.errorMessage(e))); return; }
    openTransition(el);
  };

  /** The only way an election changes status: the server validates the state machine and its preconditions. */
  window.transition = async function transition(eid) {
    const e = election(eid); const t = TRANSITIONS[e.status];
    if (!t) throw new Error(`No transition from ${e.status}`);
    await http.post(`/api/elections/${e.apiId}/transitions`, { target: t.to });
    return refreshElection(eid);
  };

  // ---- rules form
  FORMS.rules = async (f, b) => {
    const e = election(f.dataset.eid); const r = readRules(f, e.rules); const errs = validateRules(r);
    if (!showErrors(f, errs)) return;
    try {
      await withBusy(b, () => api(async () => {
        if (!EDITABLE_STATES.includes(e.status)) throw new Error('Rules are locked.');
        await http.put(`/api/elections/${e.apiId}/rules`, rulesBody(r, e.rules));
        await refreshElection(e.id);
      }));
      toast('success', 'Rules saved.'); rerender();
    } catch (er) { toast('error', esc(er.message)); }
  };

  // ---- create-election wizard: steps stay local, the last step ("Create"/"Create and publish") calls the API
  const stepWizard = FORMS.wizard;
  FORMS.wizard = async (f, b) => {
    const action = (b && b.value) || 'next';
    if (action === 'back' || action === 'next') return stepWizard(f, b);
    const w = UI.wizard; wizardCollect(f);
    const errs = wizardValidate(WIZ_STEPS[w.step][0]);
    if (!showErrors(f, errs)) return;
    try {
      const out = await withBusy(b, () => api(() => createElection(w.data, action)));
      UI.wizard = null;
      toast('success', `${esc(out.e.title)} created${out.e.status === 'REGISTRATION' ? ' and published for registration' : ' as a draft'}.`);
      out.warnings.forEach((m) => toast('warning', esc(m)));
      go(`/app/elections/${out.e.id}`);
    } catch (er) { $('#wiz-msg').innerHTML = `<div style="margin-bottom:16px">${alertBox('error', 'Could not create the election', esc(er.message))}</div>`; }
  };

  /** Create the draft, then rules, voters and (optionally) publish. Once the draft exists, later failures are
   *  reported as warnings instead of throwing, so the person lands on the election and can fix them there. */
  async function createElection(d, action) {
    const description = d.description.trim() + (d.instructions && d.instructions.trim() ? `\n\n${d.instructions.trim()}` : '');
    const v = await http.post(`/api/orgs/${ctx.orgId}/elections`, { title: d.title.trim(), description });
    const warnings = [];
    const step = async (label, fn) => { try { return await fn(); } catch (e) { warnings.push(`${label}: ${DV_API.errorMessage(e)}`); return null; } };
    await step('Rules were not saved', () => http.put(`/api/elections/${v.id}/rules`, rulesBody(d.rules)));
    if (d.voterMode === 'members') await step('Voter list', () => http.post(`/api/elections/${v.id}/voters/add-all-members`, {}));
    else if (d.voterMode === 'paste') {
      const emails = [...new Set(d.emails.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];
      const res = await step('Voter list', () => http.post(`/api/elections/${v.id}/voters`, { emails }));
      if (res && res.rejected && res.rejected.length) warnings.push(`${res.rejected.length} address(es) are not members of the organization and were not added.`);
    }
    if (d.banner) {
      const form = new FormData(); form.append('file', dataUrlToBlob(d.banner), 'banner');
      await step('Banner was not saved', () => http.upload(`/api/elections/${v.id}/banner`, form, { method: 'PUT' }));
    }
    if (action === 'publish') await step('Not published', () => http.post(`/api/elections/${v.id}/transitions`, { target: 'REGISTRATION' }));
    const e = await refreshElection(ids.election.to(v.id));
    return { e, warnings };
  }
  // ================================================================ candidates and approvals
  const KIND_LABEL = { MANIFESTO_PDF: 'Manifesto PDF', POSTER: 'Campaign poster', VIDEO: 'Introductory video', SUPPORTING_DOCUMENT: 'Supporting document' };
  const KIND_TYPE = Object.fromEntries(Object.entries(KIND_LABEL).map(([t, l]) => [l, t]));

  function mapManifesto(m, media) {
    if (!m) return null;
    return { id: m.id, vision: m.vision || '', mission: m.mission || '', goals: m.goals || '', schemes: m.schemes || '', initiatives: m.initiatives || '',
      status: m.status, frozen: !!m.frozen, docs: media.filter((x) => x.mediaType === 'SUPPORTING_DOCUMENT').map((x) => x.originalFilename) };
  }
  const mapMedia = (media) => media.filter((m) => m.mediaType !== 'PHOTO')
    .map((m) => ({ id: m.id, name: m.originalFilename, kind: KIND_LABEL[m.mediaType] || m.mediaType, size: m.sizeBytes, url: m.url }));

  /** One screen-shaped application: the application row plus, once approved, the candidate's profile, manifesto and files. */
  function mapApp(av, cv) {
    const media = cv ? cv.media || [] : [];
    return {
      id: 'a' + av.id, apiId: av.id, eid: ids.election.to(av.electionId), uid: av.applicantUserId ? uid(av.applicantUserId) : null,
      name: cv ? cv.displayName : av.displayName, status: av.status, submitted: ts(av.submittedAt), reviewed: ts(av.reviewedAt),
      qualifications: (cv ? cv.qualifications : av.qualifications) || '', statement: av.statement || '', feedback: av.reviewerNote || '',
      profile: { education: (cv ? cv.education : av.education) || '', experience: (cv ? cv.experience : av.experience) || '', achievements: (cv ? cv.achievements : av.achievements) || '' },
      manifesto: cv ? mapManifesto(cv.manifesto, media) : null, media: mapMedia(media), candidateId: av.candidateId || null,
      photo: '', ballotPosition: cv ? cv.ballotPosition : null,
    };
  }
  /** Voters and others cannot list applications; an approved candidate is shown from its public candidate view. */
  function appFromCandidate(cv) {
    return mapApp({ id: 'c' + cv.id, electionId: cv.electionId, displayName: cv.displayName, status: cv.status === 'ACTIVE' ? 'APPROVED' : 'WITHDRAWN',
      qualifications: cv.qualifications, achievements: cv.achievements, education: cv.education, experience: cv.experience, candidateId: cv.id, applicantUserId: null }, cv);
  }

  async function loadCandidates() {
    const operator = ((ctx.membership && ctx.membership.permissions) || []).includes('VIEW_ELECTION_INTERNALS');
    const known = new Set(S.elections.map((e) => e.apiId));
    const perElection = await Promise.all(S.elections.map(async (e) => {
      const [apps, cands] = await Promise.all([
        operator ? http.get(`/api/elections/${e.apiId}/applications`).catch(() => []) : [],
        http.get(`/api/elections/${e.apiId}/candidates`).catch(() => []),
      ]);
      return { apps, cands };
    }));
    const mine = (await http.get('/api/me/applications').catch(() => [])).filter((a) => known.has(a.electionId));
    const cands = new Map(); perElection.forEach((p) => p.cands.forEach((c) => cands.set(c.id, c)));
    const byId = new Map(); [...perElection.flatMap((p) => p.apps), ...mine].forEach((a) => byId.set(a.id, a));
    const used = new Set(); const apps = [];
    byId.forEach((av) => { const cv = av.candidateId ? cands.get(av.candidateId) : null; if (cv) used.add(cv.id); apps.push(mapApp(av, cv)); });
    cands.forEach((cv, id) => { if (!used.has(id)) apps.push(appFromCandidate(cv)); });
    // photographs are private downloads; fetch them as data URLs for the <img> tags the screens use
    await Promise.all(apps.map(async (a) => {
      const cv = a.candidateId ? cands.get(a.candidateId) : null;
      if (cv && cv.photoUrl) a.photo = await http.blob(cv.photoUrl).then(toDataUrl).catch(() => '');
    }));
    S.apps = apps.sort((x, y) => (y.submitted || 0) - (x.submitted || 0));
  }
  DV_API.addHydrator('candidates', loadCandidates);
  const reloadAll = async (eid) => { await loadCandidates(); if (eid) await refreshElection(eid); };

  // ---- review (approve / reject / request correction)
  const DECISION = { APPROVED: 'APPROVE', REJECTED: 'REJECT', CORRECTION_REQUESTED: 'REQUEST_CORRECTION' };
  ACT['app-decide'] = async (el) => {
    const a = S.apps.find((x) => x.id === el.dataset.id); const d = el.dataset.d; const reason = ($('#reason') && $('#reason').value.trim()) || '';
    if (d !== 'APPROVED' && reason.length < 5) { $('[data-err="reason"]').textContent = 'Give a reason of at least 5 characters.'; $('#reason').focus(); return; }
    try {
      await withBusy(el, () => api(async () => {
        await http.post(`/api/applications/${a.apiId}/review`, { decision: DECISION[d], note: reason || null });
        await reloadAll(a.eid);
      }));
      closeModal(); toast('success', `${esc(a.name)}: ${LABEL[d]}.`); rerender();
    } catch (e) { toast('error', esc(e.message)); }
  };

  // ---- apply / resubmit / withdraw
  const appBody = (name, f, p = {}) => ({ displayName: name, statement: f.as.value.trim(), qualifications: f.aq.value.trim(), achievements: p.achievements || '', education: p.education || '', experience: p.experience || '' });
  FORMS['app-new'] = async (f, b) => {
    if (!showErrors(f, appErrs(f))) return; const e = election(f.dataset.id); const u = me();
    try {
      await withBusy(b, () => api(async () => { await http.post(`/api/elections/${e.apiId}/applications`, appBody(u.name, f)); await reloadAll(e.id); }));
      closeModal(); toast('success', 'Application submitted.'); rerender();
    } catch (er) { toast('error', esc(er.message)); }
  };
  FORMS['app-fix'] = async (f, b) => {
    if (!showErrors(f, appErrs(f))) return; const a = S.apps.find((x) => x.id === f.dataset.id);
    try {
      await withBusy(b, () => api(async () => { await http.put(`/api/applications/${a.apiId}`, appBody(a.name, f, a.profile)); await reloadAll(a.eid); }));
      closeModal(); toast('success', 'Application resubmitted for review.'); rerender();
    } catch (er) { toast('error', esc(er.message)); }
  };
  ACT['app-withdraw'] = (el) => {
    const a = S.apps.find((x) => x.id === el.dataset.id);
    confirmDlg({ title: 'Withdraw your candidacy?', body: `<p>You will no longer appear on the ballot for ${esc(election(a.eid).title)}. This cannot be undone.</p>`, confirmLabel: 'Withdraw', danger: true,
      onConfirm: async () => { await api(async () => { await http.post(`/api/applications/${a.apiId}/withdraw`, {}); await reloadAll(a.eid); }); setTimeout(rerender, 0); } });
  };

  // ---- candidate profile (and photograph)
  FORMS['cand-profile'] = async (f, b) => {
    const a = primaryApp(); const v = Object.fromEntries(new FormData(f)); const errs = {};
    if (v.cname.trim().length < 2) errs.cname = 'Enter your full name'; if (v.qualifications.trim().length < 5) errs.qualifications = 'At least 5 characters';
    if (!showErrors(f, errs)) return;
    try {
      await withBusy(b, () => api(async () => {
        const body = { displayName: v.cname.trim(), qualifications: v.qualifications.trim(), achievements: v.achievements.trim(), education: v.education.trim(), experience: v.experience.trim() };
        if (a.candidateId) {
          await http.put(`/api/candidates/${a.candidateId}/profile`, body);
          const photo = document.querySelector('#photo'); const file = photo && photo.files[0];
          if (file) { const form = new FormData(); form.append('file', file, file.name); await http.upload(`/api/candidates/${a.candidateId}/media`, form, { query: { type: 'PHOTO' } }); UI.photo = null; }
        } else if (['SUBMITTED', 'CORRECTION_REQUESTED'].includes(a.status)) {
          // not approved yet: the profile is the application itself
          await http.put(`/api/applications/${a.apiId}`, { ...body, statement: v.statement.trim() });
        } else throw new Error('Your profile can be edited once your application is approved.');
        await reloadAll();
      }));
      markDone('profile-saved'); toast('success', 'Profile saved.'); rerender();
    } catch (e) { toast('error', esc(e.message)); }
  };

  // ---- manifesto
  FORMS.manifesto = async (f, b) => {
    const a = primaryApp(); const v = Object.fromEntries(new FormData(f)); const pub = b && b.value === 'publish'; const errs = {};
    if (pub) { if (v.vision.trim().length < 10) errs.vision = 'At least 10 characters to publish'; if (v.mission.trim().length < 10) errs.mission = 'At least 10 characters to publish'; if (!v.goals.trim()) errs.goals = 'Add at least one goal'; }
    if (!showErrors(f, errs)) return;
    try {
      await withBusy(b, () => api(async () => {
        if (!a.candidateId) throw new Error('Your application must be approved before you can write a manifesto.');
        await http.put(`/api/candidates/${a.candidateId}/manifesto`, { vision: v.vision.trim(), mission: v.mission.trim(), goals: v.goals.trim(), schemes: v.schemes.trim(), initiatives: v.initiatives.trim() });
        if (pub) await http.post(`/api/candidates/${a.candidateId}/manifesto/publish`, {});
        await reloadAll();
      }));
      toast('success', pub ? 'Manifesto published to voters.' : 'Draft saved.'); rerender();
    } catch (er) { toast('error', esc(er.message)); }
  };

  // ---- campaign media
  CHANGE['media-file'] = (el) => {
    const f = el.files[0]; const errEl = $(`[data-err="${el.id}"]`); errEl.textContent = ''; if (!f) return;
    const fail = (m) => { errEl.textContent = m; el.value = ''; };
    const accepted = el.dataset.accept.split(',').filter((t) => t !== 'video/webm'); // the server accepts MP4 for video
    if (!accepted.includes(f.type)) return fail(`${f.type || 'This file type'} is not accepted for ${el.dataset.kind}${el.dataset.kind === 'Introductory video' ? ' (MP4 only)' : ''}.`);
    if (f.size > Number(el.dataset.mb) * 1024 * 1024) return fail(`The file is larger than ${el.dataset.mb} MB.`);
    const box = $('#upload-progress'); const a = primaryApp();
    if (!a || !a.candidateId) return fail('You can upload files once your application is approved.');
    box.innerHTML = `<p class="small">Uploading ${esc(f.name)}…</p>${progress(50)}`;
    const form = new FormData(); form.append('file', f, f.name);
    http.upload(`/api/candidates/${a.candidateId}/media`, form, { query: { type: KIND_TYPE[el.dataset.kind] } })
      .then(() => loadCandidates()).then(() => { toast('success', `${esc(f.name)} uploaded and validated.`); rerender(); })
      .catch((e) => { box.innerHTML = alertBox('error', 'Upload failed', esc(DV_API.errorMessage(e))); });
  };
  ACT['media-remove'] = (el) => {
    const a = primaryApp(); const m = a.media[Number(el.dataset.i)];
    confirmDlg({ title: 'Remove file?', body: `<p>${esc(m.name)} will be removed from your campaign.</p>`, confirmLabel: 'Remove', danger: true,
      onConfirm: async () => { await api(async () => { await http.del(`/api/media/${m.id}`); await loadCandidates(); }); setTimeout(rerender, 0); } });
  };

  // ================================================================ members, voters, invitations, recovery
  const hasPerm = (p) => ((ctx.membership && ctx.membership.permissions) || []).includes(p);
  const mapMember = (m) => ({ id: uid(m.userId), membershipId: m.membershipId, name: m.fullName, email: m.email, role: m.role, status: m.status,
    added: ts(m.joinedAt), lastLogin: ts(m.lastLoginAt), education: '', experience: '', achievements: '', photo: '' });

  async function loadMembers() {
    if (!(hasPerm('MANAGE_MEMBERS') || hasPerm('MANAGE_ELECTION') || hasPerm('VIEW_AUDIT_LOGS'))) return;
    const all = [];
    for (let page = 0; ; page++) {
      const p = await http.get(`/api/orgs/${ctx.orgId}/members`, { page, size: 100 });
      all.push(...p.content);
      if (page + 1 >= p.totalPages) break;
    }
    all.map(mapMember).forEach((m) => {
      const i = S.users.findIndex((u) => u.id === m.id);
      if (i < 0) S.users.push(m); else Object.assign(S.users[i], m);
    });
  }
  DV_API.addHydrator('members', loadMembers);

  /** Eligible voter list per election (operators only): e.eligible = emails, e.voterIds = email -> eligible voter id. */
  async function loadVoters(e) {
    const rows = [];
    for (let page = 0; ; page++) {
      const p = await http.get(`/api/elections/${e.apiId}/voters`, { page, size: 100 });
      rows.push(...p.content);
      if (page + 1 >= p.totalPages) break;
    }
    const active = rows.filter((r) => r.status === 'ELIGIBLE');
    e.eligible = active.map((r) => r.email);
    e.voterIds = Object.fromEntries(active.map((r) => [r.email, r.id]));
    (S.creds ||= {})[e.id] = active.filter((r) => r.credentialIssued).map((r) => r.email);
  }
  DV_API.addHydrator('voters', async () => {
    if (!hasPerm('VIEW_ELECTION_INTERNALS')) return;
    await Promise.all(S.elections.map((e) => loadVoters(e).catch(() => {})));
  });
  const reloadVoters = (e) => refreshElection(e.id);

  // ---- voter list import
  const _parse = window.parseVoterList;
  window.parseVoterList = (text, e) => _parse(text, e).map((r) => {
    if (r.kind !== 'valid') return r;
    const u = userByEmail(r.raw);
    if (!u || u.status === 'REMOVED') return { ...r, kind: 'invalid', why: 'Not a member of this organization. Invite them first.' };
    if (u.status === 'SUSPENDED') return { ...r, kind: 'invalid', why: 'This member is suspended' };
    if (u.role === 'AUDITOR') return { ...r, kind: 'invalid', why: 'Auditors cannot vote' };
    return r;
  });
  ACT['voter-import'] = async (el) => {
    const e = election(el.dataset.eid); const rows = UI.importPreview.rows;
    try {
      let result;
      await withBusy(el, () => api(async () => {
        if (!EDITABLE_STATES.includes(e.status)) throw new Error('The voter list is locked.');
        const add = rows.filter((r) => r.kind === 'valid').map((r) => r.raw.toLowerCase());
        result = await http.post(`/api/elections/${e.apiId}/voters`, { emails: add });
        S.imports.push({ eid: e.id, at: Date.now(), by: me().name, total: rows.length, valid: result.added, invalid: rows.filter((r) => r.kind === 'invalid').length + (result.rejected || []).length, dup: rows.filter((r) => r.kind === 'dup').length });
        await reloadVoters(e);
      }));
      UI.importPreview = null; UI.importText = '';
      toast('success', `${result.added} voter(s) imported.`);
      if (result.rejected && result.rejected.length) toast('warning', esc(`${result.rejected.length} not added: ${result.rejected[0]}`));
      rerender();
    } catch (er) { toast('error', esc(er.message)); }
  };
  ACT['voter-all'] = (el) => {
    const e = election(el.dataset.eid);
    const add = S.users.filter((u) => u.status === 'ACTIVE' && ['VOTER', 'CANDIDATE'].includes(u.role) && !e.eligible.includes(u.email));
    confirmDlg({ title: 'Add all active members?', body: `<p>${add.length} active voter or candidate account(s) will be added to the eligible list.</p>`, confirmLabel: 'Add members',
      onConfirm: async () => {
        const r = await api(async () => { const res = await http.post(`/api/elections/${e.apiId}/voters/add-all-members`, {}); S.imports.push({ eid: e.id, at: Date.now(), by: me().name, total: res.added, valid: res.added, invalid: 0, dup: res.alreadyEligible }); await reloadVoters(e); return res; });
        toast('success', `${r.added} member(s) added.`); setTimeout(rerender, 0);
      } });
  };
  ACT['voter-remove'] = (el) => {
    const e = election(el.dataset.eid);
    confirmDlg({ title: 'Remove from voter list?', body: `<p><span class="mono">${esc(el.dataset.em)}</span> will no longer be eligible for ${esc(e.title)}.</p>`, confirmLabel: 'Remove', danger: true,
      onConfirm: async () => {
        await api(async () => {
          if (!EDITABLE_STATES.includes(e.status)) throw new Error('The voter list is locked.');
          const id = (e.voterIds || {})[el.dataset.em]; if (!id) throw new Error('That voter is no longer on the list.');
          await http.del(`/api/elections/${e.apiId}/voters/${id}`); await reloadVoters(e);
        });
        setTimeout(rerender, 0);
      } });
  };

  // ---- member management
  const mid = (u) => { if (!u.membershipId) throw new Error('This member record is out of date. Reload the page.'); return u.membershipId; };
  const memberDo = (id, { title, body, label, danger, run, msg }) => {
    const u = user(id);
    confirmDlg({ title, body: `<p>${body.replace('{name}', `<b>${esc(u.name)}</b>`)}</p>`, confirmLabel: label, danger,
      onConfirm: async () => { await api(async () => { await run(u); await loadMembers(); }); toast('success', msg(u)); setTimeout(rerender, 0); } });
  };
  const setStatus = (status) => (u) => http.patch(`/api/orgs/${ctx.orgId}/members/${mid(u)}/status`, { status });
  ACT['member-suspend'] = (el) => memberDo(el.dataset.id, { title: 'Suspend account?', body: '{name} will be signed out and cannot sign in until reactivated. Ballots already cast are unaffected.', label: 'Suspend', danger: true, run: setStatus('SUSPENDED'), msg: (u) => `${u.name} suspended` });
  ACT['member-reactivate'] = (el) => memberDo(el.dataset.id, { title: 'Reactivate account?', body: '{name} will be able to sign in again.', label: 'Reactivate', run: setStatus('ACTIVE'), msg: (u) => `${u.name} reactivated` });
  ACT['member-remove'] = (el) => memberDo(el.dataset.id, { title: 'Remove member?', body: '{name} loses access to this organization. Audit history is kept.', label: 'Remove', danger: true, run: setStatus('REMOVED'), msg: (u) => `${u.name} removed` });
  ACT['member-role'] = (el) => {
    const u = user(el.dataset.id);
    confirmDlg({ title: `Change role for ${esc(u.name)}`, body: `${field('New role', 'newRole', select('newRole', INVITABLE.map((r) => [r, ROLE_LABELS[r]]), u.role))}<p class="xs muted mt-2">Changing a role takes effect immediately: roles are resolved from the database on every request.</p>`, confirmLabel: 'Assign role',
      onConfirm: async () => {
        const r = $('#newRole').value; if (!INVITABLE.includes(r)) throw new Error('This role cannot be assigned.');
        await api(async () => { await http.patch(`/api/orgs/${ctx.orgId}/members/${mid(u)}/role`, { role: r }); await loadMembers(); });
        toast('success', `${u.name} is now ${ROLE_LABELS[r]}`); setTimeout(rerender, 0);
      } });
  };
  // "Simulate acceptance" is a demo shortcut: in live mode people accept on the Accept invitation page.
  const _actions = window.memberActions;
  window.memberActions = (u) => _actions(u).replace(/<button[^>]*data-act="member-accept"[^>]*>.*?<\/button>/s, '');

  FORMS.invite = async (f, b) => {
    const v = Object.fromEntries(new FormData(f)); const errs = {};
    if (v.invName.trim().length < 2) errs.invName = 'Enter the member’s name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.invEmail)) errs.invEmail = 'Enter a valid email address';
    else if (userByEmail(v.invEmail) && userByEmail(v.invEmail).status !== 'REMOVED') errs.invEmail = 'This email already belongs to a member';
    if (!INVITABLE.includes(v.invRole)) errs.invRole = 'This role cannot be assigned by invitation';
    if (!showErrors(f, errs)) return;
    try {
      const inv = await withBusy(b, () => api(async () => {
        const r = await http.post(`/api/orgs/${ctx.orgId}/members`, { email: v.invEmail.trim(), fullName: v.invName.trim(), role: v.invRole });
        await loadMembers(); return r;
      }));
      $('#modal-body').innerHTML = alertBox('success', 'Invitation created', `<p>Share this one-time activation code with ${esc(v.invName)}. It is shown only once and expires ${fmt(ts(inv.expiresAt))}.</p><p class="code-big mt-2">${esc(inv.activationCode)}</p><p class="xs mt-2">The app does not send email; the inviter passes the code on. They accept it at <span class="mono">${esc(inv.activationUrl)}</span>.</p>`);
      $('#modal-foot').innerHTML = btn('Done', { act: 'modal-close' }); MODAL.onClose = rerender;
    } catch (e) { $('#inv-msg').innerHTML = alertBox('error', 'Invitation failed', esc(e.message)); }
  };

  // ---- admin-initiated password recovery
  ACT['member-recover'] = (el) => {
    const u = user(el.dataset.id);
    confirmDlg({ title: 'Start password recovery?', body: `<p>A one-time recovery code is generated for <b>${esc(u.name)}</b>. Their current password stops working once they use it.</p>`, confirmLabel: 'Generate code',
      onConfirm: async () => {
        const r = await api(() => http.post(`/api/orgs/${ctx.orgId}/members/${mid(u)}/recovery`, {}));
        setTimeout(() => modal({ title: 'Recovery code', body: `${alertBox('success', 'Recovery code created', `<p>Give this one-time code to ${esc(u.name)}. It is shown only once and expires ${fmt(ts(r.expiresAt))}.</p><p class="code-big mt-2">${esc(r.recoveryCode)}</p><p class="xs mt-2">They use it at <span class="mono">${esc(r.recoveryUrl)}</span> to choose a new password.</p>`)}`, foot: btn('Done', { act: 'modal-close' }) }), 0);
      } });
  };

  // ---- public pages: accept an invitation, reset a password with a recovery code
  const q = (k) => { try { return route().q.get(k) || ''; } catch { return ''; } };
  const publicPage = (title, intro, msgId, formName, fields, submit) => `<section class="login-page"><div class="wrap section d-loginas"><p class="eyebrow-pill">SECURE &bull; TRANSPARENT &bull; INCLUSIVE</p><h1 tabindex="-1">${title}</h1><p class="muted">${intro}</p><div id="${msgId}"></div>
    <form data-form="${formName}" novalidate><div class="login-fields dv">${fields}</div><div class="row mt-6" style="justify-content:center"><button class="btn primary lg" type="submit">${submit}</button></div></form>
    <p class="muted small" style="margin-top:22px"><a href="#/login">Back to login</a></p></div></section>`;
  window.LIVE_PAGES = [
    ['/activate', () => (me() ? `<div class="wrap section" style="max-width:520px">${alertBox('info', `Signed in as ${esc(me().name)}`, `<a href="#${homeFor(role())}">Open your dashboard</a>`)}</div>`
      : publicPage('Accept your <span class="grad">invitation</span>', 'Enter the email your invitation was made for, the activation code you were given, and choose a password.', 'act-msg', 'activate',
        `${field('Email', 'aemail', input('aemail', q('email'), 'type="email" autocomplete="username"'))}${field('Activation code', 'acode', input('acode', q('code'), 'placeholder="XXXX-XXXX-XXXX" style="font-family:var(--mono);letter-spacing:.04em"'))}${field('Full name', 'aname', input('aname', '', 'autocomplete="name"'))}${field('Choose a password', 'apassword', input('apassword', '', 'type="password" autocomplete="new-password"'))}${field('Confirm password', 'aconfirm', input('aconfirm', '', 'type="password" autocomplete="new-password"'))}`,
        'Activate account'))],
    ['/recover', () => publicPage('Reset your <span class="grad">password</span>', 'Enter your DV number or email, the one-time recovery code from your organization owner, and a new password.', 'rec-msg', 'recover',
      `${field('DV number or email', 'rid', input('rid', '', 'autocomplete="username"'))}${field('Recovery code', 'rcode', input('rcode', q('code'), 'placeholder="XXXX-XXXX-XXXX" style="font-family:var(--mono);letter-spacing:.04em"'))}${field('New password', 'rpassword', input('rpassword', '', 'type="password" autocomplete="new-password"'))}${field('Confirm new password', 'rconfirm', input('rconfirm', '', 'type="password" autocomplete="new-password"'))}`,
      'Set new password')],
  ];

  FORMS.activate = async (f, b) => {
    const v = Object.fromEntries(new FormData(f)); const errs = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.aemail)) errs.aemail = 'Enter a valid email address';
    if (!/^[0-9A-Za-z-]{8,20}$/.test(v.acode.trim())) errs.acode = 'Enter the activation code you were given';
    if (v.aname.trim().length < 2) errs.aname = 'Enter your full name';
    if (v.apassword.length < 8) errs.apassword = 'Use at least 8 characters';
    if (v.aconfirm !== v.apassword) errs.aconfirm = 'Passwords do not match';
    if (!showErrors(f, errs)) return;
    try {
      const r = await withBusy(b, () => DV_API.auth.activate({ email: v.aemail.trim(), activationCode: v.acode.trim(), fullName: v.aname.trim(), password: v.apassword }));
      await DV_API.afterAuth(S, r.user);
      UI.loaded = null; toast('success', 'Invitation accepted. Welcome!'); go(homeFor(role()));
      modal({ title: 'Your DV number', body: `<p class="muted" style="margin-bottom:12px">Use this number, or your email, with your password to sign in next time.</p><p style="text-align:center;margin:16px 0"><b class="mono" style="font-size:22px;letter-spacing:.04em">${esc(r.user.dvNumber)}</b></p>`, foot: btn('Continue', { act: 'modal-close' }) });
    } catch (e) {
      const fe = DV_API.fieldErrors(e, { email: 'aemail', activationCode: 'acode', fullName: 'aname', password: 'apassword' });
      if (Object.keys(fe).length) showErrors(f, fe);
      $('#act-msg').innerHTML = alertBox('error', 'Could not accept the invitation', esc(DV_API.errorMessage(e)));
    }
  };
  FORMS.recover = async (f, b) => {
    const v = Object.fromEntries(new FormData(f)); const errs = {};
    if (!v.rid.trim()) errs.rid = 'Enter your DV number or email';
    if (!/^[0-9A-Za-z-]{8,20}$/.test(v.rcode.trim())) errs.rcode = 'Enter the recovery code you were given';
    if (v.rpassword.length < 8) errs.rpassword = 'Use at least 8 characters';
    if (v.rconfirm !== v.rpassword) errs.rconfirm = 'Passwords do not match';
    if (!showErrors(f, errs)) return;
    const id = v.rid.trim(); const body = { recoveryCode: v.rcode.trim(), newPassword: v.rpassword };
    if (id.includes('@')) body.email = id.toLowerCase(); else body.dvNumber = id.toUpperCase().replace(/\s+/g, '');
    try {
      await withBusy(b, () => DV_API.auth.recover(body));
      toast('success', 'Password changed. Log in with your new password.'); go('/login');
    } catch (e) {
      const fe = DV_API.fieldErrors(e, { newPassword: 'rpassword', recoveryCode: 'rcode', dvNumber: 'rid', email: 'rid' });
      if (Object.keys(fe).length) showErrors(f, fe);
      $('#rec-msg').innerHTML = alertBox('error', 'Password not changed', esc(DV_API.errorMessage(e)));
    }
  };

  // ================================================================ voting, receipts and verification
  // The voter's browser does the blinding (web/crypto.js) so the server signs a credential it cannot read; the ballot is
  // then sent WITHOUT the login token. Signing, Paillier encryption, tallying, receipts and bulletin-board hashing stay
  // on the backend.
  const C = window.DV_CRYPTO;
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const credKey = () => `digivote.live.credentials.${S.session}`;
  const rcptKey = () => `digivote.live.receipts.${S.session}`;
  const credGet = (eid) => lsGet(credKey())[eid] || null;
  const credSave = (eid, patch) => { const all = lsGet(credKey()); all[eid] = { ...all[eid], ...patch }; return lsSet(credKey(), all); };
  const credClear = (eid) => { const all = lsGet(credKey()); delete all[eid]; lsSet(credKey(), all); };
  const rcptSave = (w) => { const all = lsGet(rcptKey()); all[w.eid] = w; lsSet(rcptKey(), all); };
  const rcptClear = (eid) => { const all = lsGet(rcptKey()); delete all[eid]; lsSet(rcptKey(), all); };
  const selfEmail = () => (S.users.find((u) => u.id === S.session) || {}).email;
  const isOperator = () => hasPerm('VIEW_ELECTION_INTERNALS');

  /** Credentials and receipts live only in this browser; rebuild the screens' view of them. */
  function syncVoterState() {
    S.wallet = S.wallet || {}; S.devCred = S.devCred || {}; S.creds = S.creds || {};
    S.wallet[S.session] = Object.values(lsGet(rcptKey()));
    const held = {};
    Object.entries(lsGet(credKey())).forEach(([eid, c]) => { if (c.signatureHex && !c.spent) held[eid] = { token: c.tokenHex }; });
    S.devCred[S.session] = held;
    S.elections.forEach((e) => { if (!isOperator()) S.creds[e.id] = e.rel && e.rel.credentialIssued ? [selfEmail()] : []; });
  }
  DV_API.addHydrator('voting', async () => { syncVoterState(); });

  // ---- step 1: anonymous credential (key check, blind, server signs, unblind)
  ACT['get-cred'] = async (el) => {
    const e = election(el.dataset.eid); const b = UI.ballot;
    const labels = ['Check the election key fingerprint against the published key', 'Generate a random token and blind it in this browser', 'Server checks your eligibility and signs the blinded value', 'Unblind the signature — the server never saw this token'];
    b.proto = labels.map((l) => ({ label: l, state: '' })); rerender();
    const step = async (i, fn) => { b.proto[i].state = 'on'; rerender(); const r = await fn(); b.proto[i].state = 'ok'; return r; };
    try {
      const { key, fingerprint } = await step(0, async () => {
        const [k, anchor] = await Promise.all([http.get(`/api/elections/${e.apiId}/credential-key`), http.get(`/api/public/elections/${e.apiId}/credential-key`, null, { auth: false })]);
        return { key: k, fingerprint: await C.verifyElectionCredentialKey(e.apiId, k, anchor) };
      });
      let pending = credGet(e.id);
      pending = await step(1, async () => {
        // an interrupted attempt is resumed with the same blinded request: the server returns the same signature
        if (pending && pending.blindedMessageHex && pending.keyFingerprint === fingerprint) return pending;
        const fresh = { ...(await C.prepareCredential(key)), keyFingerprint: fingerprint };
        if (!credSave(e.id, fresh)) throw new Error('This browser cannot store the credential; enable site storage to vote.');
        return fresh;
      });
      const issued = await step(2, () => http.post(`/api/elections/${e.apiId}/credentials`, { blindedMessageHex: pending.blindedMessageHex }));
      await step(3, async () => {
        const signatureHex = C.unblind(issued.blindSignatureHex, pending.blindingFactorHex, key);
        if (!(await C.verifyCredential(pending.tokenHex, signatureHex, key))) throw new Error('The credential returned by the server did not verify. Do not vote; contact the election auditor.');
        credSave(e.id, { tokenHex: pending.tokenHex, signatureHex, keyFingerprint: fingerprint, blindingFactorHex: null, blindedMessageHex: null, spent: false });
      });
      (S.devCred[S.session] ||= {})[e.id] = { token: pending.tokenHex };
      if (!isOperator()) S.creds[e.id] = [selfEmail()];
      await delay(200); b.step = 'select'; b.proto = null; rerender();
    } catch (er) {
      b.proto = null; rerender();
      const text = er && er.code && String(er.code).startsWith('KEY_') ? `${er.message} (${er.code})`
        : er && er.code === 'CREDENTIAL_ALREADY_ISSUED' ? 'A credential was already issued to your account, and this browser does not hold it. DigiVote cannot issue a second one, because that would allow voting twice. Use the browser where you started voting.'
        : DV_API.errorMessage(er);
      $('#cred-err').innerHTML = `<div class="mt-3">${alertBox('error', 'Could not get a credential', `${esc(text)} You can try again.`)}</div>`;
    }
  };
  ACT['cred-reset'] = () => toast('error', 'A credential was already issued to you and this browser does not hold it. DigiVote cannot issue a second one: that would allow voting twice. Use the browser where you started voting.');

  // ---- step 2: cast the ballot, anonymously
  async function liveCast(e, sel) {
    if (election(e.id).status !== 'VOTING') throw new Error('Voting has closed. Your ballot was not accepted.');
    const cred = credGet(e.id);
    if (!cred || !cred.signatureHex) throw new Error('No credential on this device.');
    const ballot = await http.get(`/api/elections/${e.apiId}/ballot`);
    const selections = sel.map((k) => {
      const o = k === 'NOTA' ? ballot.options.find((x) => x.nota) : ballot.options.find((x) => x.candidateId && x.candidateId === (S.apps.find((a) => a.id === k) || {}).candidateId);
      if (!o) throw new Error('The selection does not follow this election’s rules.');
      return o.index;
    });
    const nonce = cred.submissionNonce || C.randomNonceHex();
    credSave(e.id, { submissionNonce: nonce }); // stored first, so a retry is recognised as the same submission
    const r = await http.post(`/api/public/elections/${e.apiId}/ballots`, { tokenHex: cred.tokenHex, signatureHex: cred.signatureHex, selections, submissionNonce: nonce }, { auth: false });
    const now = Date.now();
    const w = { eid: e.id, code: r.receiptCode, c: r.ballotCommitment, at: now, th: '—', flags: 0, subs: [], seq: r.bulletinSeq, serverStatus: r.status };
    if (r.confirmationRequired) Object.assign(w, { state: 'PENDING_QR', expires: now + r.confirmWindowSeconds * 1000, qrPayload: r.qrPayload });
    rcptSave(w); credSave(e.id, { spent: true });
    S.wallet[S.session] = Object.values(lsGet(rcptKey())); if (S.devCred[S.session]) delete S.devCred[S.session][e.id];
    return w;
  }
  ACT['ballot-submit'] = (el) => {
    const b = UI.ballot; const e = election(b.eid);
    confirmDlg({ title: 'Submit your ballot?', body: `<p>You are voting for:</p><ul>${b.sel.map((k) => `<li><b>${esc(optionLabel(e.id, k))}</b></li>`).join('')}</ul><p class="small muted">This cannot be undone. Your ballot is sent anonymously.</p>`, confirmLabel: 'Submit ballot',
      onConfirm: async () => {
        const w = await api(() => liveCast(e, b.sel.slice()));
        UI.ballot = { eid: e.id, step: 'done', code: w.code, c: w.c, sel: [] };
        toast('success', w.state === 'PENDING_QR' ? 'Ballot received. Submit your QR receipt within 30 seconds to validate it.' : 'Ballot accepted. Keep your receipt.');
        refreshReceipt(w.code); setTimeout(rerender, 0);
      } });
  };
  ACT['replay-vote'] = async (el) => {
    const e = election(el.dataset.eid); const cred = credGet(e.id);
    try {
      await withBusy(el, () => api(() => { if (!cred || !cred.tokenHex) throw new Error('This credential is no longer stored on this device.'); return http.post(`/api/public/elections/${e.apiId}/ballots`, { tokenHex: cred.tokenHex, signatureHex: cred.signatureHex, selections: [0], submissionNonce: C.randomNonceHex() }, { auth: false }); }));
      toast('error', 'Unexpected: a second ballot was accepted. Report this to the auditor.');
    } catch (er) { toast('error', esc(er.message)); }
  };

  // ---- QR confirmation (the "audit desk"): anonymous, server-signed, 30 s
  async function liveQrSubmit(text, source) {
    const r = await http.post('/api/public/ballots/confirm', { qrPayload: text }, { auth: false });
    const now = Date.now(); const mine = myReceipts().filter((x) => x.state);
    const w = mine.find((x) => x.code === r.receiptCode) || mine.find((x) => x.state === 'PENDING_QR') || null;
    const sub = { id: rid('q'), at: now, result: r.result, detail: r.detail, source, code: w ? w.code : r.receiptCode, eid: w ? w.eid : null, voter: '', th: null };
    (S.qrSubs ||= []).unshift(sub);
    if (w) (w.subs ||= []).unshift({ at: now, result: r.result, detail: r.detail, source });
    if (r.result === 'VALID' && w) { w.state = 'VALIDATED'; w.validatedAt = now; rcptSave(w); refreshReceipt(w.code); }
    else if (r.result === 'EXPIRED' && w && w.state === 'PENDING_QR') voidVote(me(), w, 'The 30-second QR submission window expired', 'EXPIRED');
    return sub;
  }
  /** An unconfirmed ballot is voided on the server (it can never be confirmed or counted) and the voter gets a new credential. */
  window.voidVote = (u, w, reason, kind) => {
    const cred = credGet(w.eid); const e = election(w.eid);
    S.wallet[S.session] = (S.wallet[S.session] || []).filter((x) => x.code !== w.code); rcptClear(w.eid);
    (S.voided ||= []).unshift({ uid: S.session, eid: w.eid, code: w.code, at: Date.now(), reason, kind });
    if (UI.ballot && UI.ballot.eid === w.eid) UI.ballot = null;
    if (!cred || !cred.tokenHex) return;
    http.post(`/api/elections/${e.apiId}/credentials/reissue`, { tokenHex: cred.tokenHex, signatureHex: cred.signatureHex })
      .then(async () => { credClear(w.eid); if (S.devCred[S.session]) delete S.devCred[S.session][w.eid]; await refreshElection(w.eid); syncVoterState(); rerender(); })
      .catch(async (er) => { toast('error', esc(DV_API.errorMessage(er))); await DV_API.hydrate(S); rerender(); });
  };
  Object.assign(ACT, {
    async 'qr-submit'(el) { const w = findMine(el.dataset.code); if (!w) return; await withBusy(el, () => delay(100)); try { showQrResult(await liveQrSubmit(qrPayload(w), 'Receipt QR on this device')); } catch (er) { toast('error', esc(DV_API.errorMessage(er))); } },
  });
  FORMS['qr-text'] = async (f) => { try { showQrResult(await liveQrSubmit(f.qrtext.value, 'Pasted QR content')); } catch (er) { toast('error', esc(DV_API.errorMessage(er))); } };
  CHANGE['qr-sub-file'] = async (el) => {
    const file = el.files[0]; el.value = ''; if (!file) return;
    try { const text = await decodeQrImage(file); showQrResult(await liveQrSubmit(text, `QR image “${file.name}”`)); } catch (er) { toast('error', esc(er.message)); }
  };

  // ---- verification: the server checks the receipt, bulletin board and tally; the screens show its evidence
  VERIFY_STATES.NOT_CONFIRMED = { title: 'Ballot not confirmed', kind: 'error', icon: 'warning', next: 'This ballot was never confirmed with its QR receipt, so it was not counted. If voting is still open you can vote again.' };
  const vcache = {};
  const placeholder = (code, source) => ({ status: 'RECEIPT_RECOGNIZED', steps: [{ label: 'Contacting the verification service…', state: 'wait', detail: '' }], source, at: Date.now(), raw: normalizeCode(code), e: null, r: null });
  function mapVerification(v, code, source) {
    const e = v.electionId ? election(ids.election.to(v.electionId)) || null : null;
    const steps = (v.checks || []).map((c) => ({ label: c, state: /fail/i.test(c) || /missing/i.test(c) ? 'fail' : 'ok', detail: '' }));
    if (v.status === 'RECEIPT_RECOGNIZED') steps.push({ label: 'Ballot commitment on the public bulletin board', state: 'wait', detail: v.meaning });
    if (v.status === 'INVALID_RECEIPT' || v.status === 'RECEIPT_NOT_FOUND') steps.push({ label: v.status === 'INVALID_RECEIPT' ? 'Code format and check character' : 'Receipt record found', state: 'fail', detail: v.meaning });
    const entry = v.bulletinSeq ? { seq: v.bulletinSeq, h: v.entryHash || '', c: v.ballotCommitment, at: v.recordedAtMinute ? Date.parse(v.recordedAtMinute + 'Z') : Date.now() } : null;
    const res = v.status === 'INCLUDED_IN_TALLY' ? { hash: v.resultHash || '', total: '', computedAt: Date.now(), bbHead: v.bulletinHeadAtTally } : null;
    return { status: v.status, steps, source, at: Date.now(), raw: normalizeCode(code), e, r: v.ballotCommitment ? { eid: e ? e.id : ids.election.to(v.electionId), c: v.ballotCommitment, th: '—' } : null, entry, res, detail: v.meaning };
  }
  async function fetchVerification(code, source) {
    const raw = normalizeCode(code); const formatted = formatCode(raw);
    try { const v = await http.get(`/api/public/receipts/${encodeURIComponent(formatted)}`, null, { auth: false }); return (vcache[raw] = mapVerification(v, code, source)); }
    catch (er) { return { status: 'VERIFICATION_UNAVAILABLE', steps: [{ label: 'Contact the verification service', state: 'fail', detail: DV_API.errorMessage(er) }], source, at: Date.now(), raw }; }
  }
  window.verifyReceipt = (input, source = 'Typed code') => vcache[normalizeCode(input)] || placeholder(input, source);
  const refreshReceipt = (code) => fetchVerification(code, 'Receipt on this device').then(() => rerender());
  window.runVerify = (code, source) => {
    const r = placeholder(code, source);
    UI.verifyCode = r.raw ? formatCode(r.raw) : code; UI.verifyResult = r;
    if (me()) markDone('verified');
    fetchVerification(code, source).then((real) => { if (UI.verifyResult === r) { UI.verifyResult = real; if (me() && real.status === 'INCLUDED_IN_TALLY') markDone('verified-counted'); rerender(); } });
    return r;
  };
  DV_API.addHydrator('receipts', async () => { (S.wallet[S.session] || []).forEach((w) => { if (!w.state) fetchVerification(w.code, 'Receipt on this device'); }); });

  // ================================================================ audit log, bulletin board, security events, integrity, organization
  const SUBSYSTEM = [[/^AUTH_/, 'AUTH'], [/^(ORG_|MEMBER_)/, 'ORGANIZATION'], [/^(CANDIDATE_|MANIFESTO|MEDIA_)/, 'CANDIDATE'], [/^(VOTERS?_|CREDENTIAL_)/, 'VOTERS'],
    [/^(BALLOT|RESULTS_|RECEIPT_)/, 'BALLOT'], [/^ELECTION_/, 'ELECTION'], [/^SECURITY_/, 'SECURITY'], [/^(INTEGRITY_|REPORT_)/, 'AUDIT']];
  const subsystemOf = (t) => (SUBSYSTEM.find(([re]) => re.test(t)) || [null, 'SYSTEM'])[1];
  const humanize = (t) => { const s = t.toLowerCase().replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
  function actorName(ref) {
    if (!ref) return 'DigiVote service';
    const u = ref.startsWith('user:') ? S.users.find((x) => x.id === uid(Number(ref.slice(5)))) : null;
    return u ? `${u.name} (${ROLE_LABELS[u.role] || u.role})` : ref.startsWith('user:') ? `Member #${ref.slice(5)}` : ref;
  }
  function mapAudit(l) {
    let meta = {}; try { meta = JSON.parse(l.metadataJson || '{}'); } catch { /* keep empty */ }
    const pairs = Object.entries(meta).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    return { seq: l.seq, eventId: l.eventId, at: ts(l.occurredAt), occurredAt: l.occurredAt, type: l.eventType, actor: actorName(l.actorRef), actorRef: l.actorRef, sub: subsystemOf(l.eventType), outcome: 'SUCCESS',
      detail: humanize(l.eventType) + (pairs.length ? ` · ${pairs.join(', ')}` : ''), metadataJson: l.metadataJson, eid: l.electionId ? ids.election.to(l.electionId) : null, prev: l.prevHash, h: l.recordHash };
  }

  /** Newest `max` audit records of the organization, oldest first (the screens expect ascending order). */
  async function fetchAudit(max = 1000) {
    const rows = [];
    for (let page = 0; rows.length < max; page++) {
      const p = await http.get(`/api/orgs/${ctx.orgId}/audit-logs`, { page, size: 100 });
      rows.push(...p.content);
      if (page + 1 >= p.totalPages) break;
    }
    return rows.map(mapAudit).sort((a, b) => a.seq - b.seq);
  }
  DV_API.addHydrator('audit', async () => { if (hasPerm('VIEW_AUDIT_LOGS')) S.audit = await fetchAudit(); });
  DV_API.addHydrator('security', async () => {
    if (!hasPerm('VIEW_SECURITY_EVENTS')) return;
    const p = await http.get(`/api/orgs/${ctx.orgId}/security-events`, { page: 0, size: 200 });
    S.security = p.content.map((s) => ({ id: 'se' + s.id, at: ts(s.occurredAt), type: s.eventType, severity: s.severity, detail: s.detail, principal: s.principalRef, eid: null }));
  });

  // ---- bulletin board: entries from the server, chain re-checked in this browser with the backend's hash formula
  const BB_GENESIS = (apiId) => sha256(`DIGI-VOTE-BB-GENESIS|${apiId}`);
  const bbEntryHash = (apiId, seq, c, prev) => sha256(`DIGI-VOTE-BB-v1|${apiId}|${seq}|${c}|${prev}`);
  async function loadBulletin(e) {
    const rows = []; let chain = null;
    for (let page = 0; page < 20; page++) {
      const p = await http.get(`/api/elections/${e.apiId}/bulletin`, { page, size: 100 });
      rows.push(...p.entries.content); chain = p.chain;
      if (page + 1 >= p.entries.totalPages) break;
    }
    (S.bulletin ||= {})[e.id] = rows.map((r) => ({ seq: r.seq, c: r.ballotCommitment, prev: r.prevHash, h: r.entryHash, at: r.postedAtMinute ? Date.parse(r.postedAtMinute + 'Z') : null }));
    (S.bbChain ||= {})[e.id] = chain;
  }
  DV_API.addHydrator('bulletin', async () => { await Promise.all(S.elections.filter((e) => e.status !== 'DRAFT').map((e) => loadBulletin(e).catch(() => {}))); });
  window.verifyBoard = (eid) => {
    const e = election(eid); let prev = BB_GENESIS(e.apiId);
    for (const b of boardOf(eid)) {
      if (b.prev !== prev || bbEntryHash(e.apiId, b.seq, b.c, b.prev) !== b.h) return { ok: false, at: b.seq };
      prev = b.h;
    }
    return { ok: true, head: prev, count: boardOf(eid).length };
  };

  // ---- audit chain: the server verifies it, and this browser recomputes every hash independently
  const hexSha = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, '0')).join('');
  async function recomputeAudit(chainKey, rows) {
    let prev = '0'.repeat(64); let expected = rows.length ? rows[0].seq : 1;
    for (const r of rows) {
      if (r.seq !== expected) return { ok: false, at: r.seq, reason: `Sequence gap before record ${r.seq}` };
      if (r.prev !== prev) return { ok: false, at: r.seq, reason: `Record ${r.seq} does not link to the previous record` };
      const canon = ['DIGI-VOTE-AUDIT-v1', chainKey, r.seq, r.eventId, r.type, r.occurredAt, String(ctx.orgId), r.eid ? String(ids.election.from(r.eid)) : '-', r.actorRef || '-', r.metadataJson, r.prev].join('\n');
      if ((await hexSha(canon)) !== r.h) return { ok: false, at: r.seq, reason: `Record ${r.seq} was modified after it was written (hash mismatch)` };
      prev = r.h; expected = r.seq + 1;
    }
    return { ok: true, count: rows.length, head: prev };
  }
  async function verifyAuditLive() {
    const server = await http.post(`/api/orgs/${ctx.orgId}/audit-logs/verify`, {});
    const rows = await fetchAudit(100000);
    const mine = await recomputeAudit(server.chainKey, rows);
    return { server, mine, rows };
  }
  ACT['audit-verify'] = async (el) => {
    markDone('audit-verified');
    try {
      const { server, mine, rows } = await withBusy(el, () => verifyAuditLive());
      S.audit = rows;
      const ok = server.valid && mine.ok;
      $('#audit-result').innerHTML = `<div style="margin-bottom:16px">${ok
        ? alertBox('success', 'Chain verified from genesis', `${server.recordsChecked} records; head ${hash(server.headHash, 24)}. The server and this browser recomputed every hash and agree.`)
        : alertBox('error', 'Chain verification failed', esc((server.problems && server.problems[0]) || mine.reason || 'The hashes do not match.'))}</div>`;
    } catch (e) { toast('error', esc(DV_API.errorMessage(e))); }
  };

  // ---- integrity dashboard
  window.verifyAuditChain = () => { let prev = '0'.repeat(64); for (const r of S.audit) { if (r.prev !== prev) return { ok: false, at: r.seq, reason: `Record ${r.seq} does not link to the previous record` }; prev = r.h; } return { ok: true, count: S.audit.length, head: prev }; };
  async function runIntegrityLive() {
    const { server, mine } = await verifyAuditLive(); const res = [];
    res.push({ target: 'Organization audit chain (server)', sub: 'AUDIT', ok: server.valid, detail: server.valid ? `${server.recordsChecked} records` : (server.problems || [])[0] || 'Failed' });
    res.push({ target: 'Organization audit chain (recomputed in this browser)', sub: 'AUDIT', ok: mine.ok, detail: mine.ok ? `${mine.count} records, every hash matches` : mine.reason });
    for (const e of audited()) {
      await loadBulletin(e).catch(() => {});
      const chain = (S.bbChain || {})[e.id]; const local = verifyBoard(e.id);
      res.push({ target: `Bulletin board · ${e.title}`, sub: 'BULLETIN', ok: !!chain && chain.valid && local.ok, detail: local.ok ? `${local.count} entries; server and browser agree` : `Breaks at entry ${local.at}` });
      try {
        const a = await http.get(`/api/elections/${e.apiId}/integrity/aggregation`);
        res.push({ target: `Ballot aggregation · ${e.title}`, sub: 'VOTING', ok: a.valid, detail: a.valid ? `${a.ballotsChecked} ballots, ${a.optionsChecked} options recomputed` : (a.problems || [])[0] || 'Mismatch' });
      } catch { /* keys exist only after voting opens */ }
    }
    return { at: Date.now(), by: actorLabel(), res, ok: res.every((r) => r.ok) };
  }
  ACT['integrity-run'] = async (el) => {
    try {
      const r = await withBusy(el, () => api(async () => { const run = await runIntegrityLive(); S.integrityRuns.push(run); return run; }));
      toast(r.ok ? 'success' : 'error', r.ok ? 'Integrity check passed.' : 'Integrity check found failures.'); rerender();
    } catch (e) { toast('error', esc(e.message)); }
  };
  // The tamper buttons edit stored records; a real database refuses that, so the simulation card is not shown.
  const _integrityPage = window.integrityPage;
  window.integrityPage = () => {
    const html = _integrityPage(); const at = html.indexOf('Simulation only: tamper with the data'); if (at < 0) return html;
    const start = html.lastIndexOf('<section class="card', at); const end = html.indexOf('</section>', at);
    return start < 0 || end < 0 ? html : html.slice(0, start) + html.slice(end + '</section>'.length);
  };

  { const r = APP_ROUTES.find((x) => x[0] === '/app/integrity'); if (r) r[1] = window.integrityPage; } // the route table holds the function itself

  // ---- organization profile and security policy
  async function loadOrganization() {
    const o = await http.get(`/api/orgs/${ctx.orgId}`);
    Object.assign(S.org, { id: o.id, name: o.name, slug: o.slug, description: o.description || '', type: DV_API.ORG_TYPES[o.type] || S.org.type || '', logoUrl: o.logoUrl || '', primaryColor: o.primaryColor,
      status: o.status, created: ts(o.createdAt), email: o.contactEmail || '', phone: o.phone || '', tagline: o.tagline || '' });
    S.policy = Object.assign(S.policy || {}, { minLength: o.passwordMinLength, lockoutAttempts: o.maxFailedLogins, lockoutMinutes: o.lockoutMinutes, sessionMinutes: o.sessionMinutes, requireMixed: o.requireMixedCase });
    if (hasPerm('VIEW_AUDIT_LOGS')) {
      const p = await http.get(`/api/orgs/${ctx.orgId}/audit-logs`, { page: 0, size: 50, typePrefix: 'ORG_SECURITY_POLICY_UPDATED' }).catch(() => ({ content: [] }));
      S.policy.history = p.content.map(mapAudit).reverse().map((l) => ({ at: l.at, by: l.actor, change: l.detail.replace(/^[^·]*· /, '') }));
    } else S.policy.history = [];
  }
  DV_API.addHydrator('organization', loadOrganization);
  FORMS.org = async (f, b) => {
    const v = Object.fromEntries(new FormData(f)); const errs = {};
    if (v.name.trim().length < 3) errs.name = 'At least 3 characters';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.email = 'Enter a valid email address';
    if (v.phone && !/^[+\d][\d\s-]{5,}$/.test(v.phone)) errs.phone = 'Use digits, spaces, + and - only';
    if (v.logoUrl && !/^https:\/\/\S+$/.test(v.logoUrl)) errs.logoUrl = 'Logo URL must start with https://';
    if (!showErrors(f, errs)) return;
    try {
      await withBusy(b, () => api(async () => {
        await http.put(`/api/orgs/${ctx.orgId}`, { name: v.name.trim(), description: v.description.trim(), type: DV_API.orgTypeCode(v.type), contactEmail: v.email.trim(), phone: v.phone.trim(), tagline: v.tagline.trim(), logoUrl: (v.logoUrl || '').trim(), primaryColor: v.primaryColor });
        await loadOrganization();
      }));
      toast('success', 'Organization profile saved.'); rerender();
    } catch (e) { $('#org-msg').innerHTML = alertBox('error', 'Could not save', esc(e.message)); }
  };
  FORMS.policy = async (f, b) => {
    const v = Object.fromEntries(new FormData(f)); const errs = {};
    const n = (k, lo, hi) => { const x = Number(v[k]); if (!Number.isInteger(x) || x < lo || x > hi) errs[k] = `Between ${lo} and ${hi}`; return x; };
    const np = { minLength: n('minLength', 8, 64), lockoutAttempts: n('lockoutAttempts', 3, 10), lockoutMinutes: n('lockoutMinutes', 5, 120), sessionMinutes: n('sessionMinutes', 15, 480), requireMixed: f.requireMixed.checked };
    if (!showErrors(f, errs)) return;
    try {
      await withBusy(b, () => api(async () => {
        await http.put(`/api/orgs/${ctx.orgId}/security-policy`, { passwordMinLength: np.minLength, maxFailedLogins: np.lockoutAttempts, lockoutMinutes: np.lockoutMinutes, sessionMinutes: np.sessionMinutes, requireMixedCase: np.requireMixed });
        await loadOrganization(); S.audit = hasPerm('VIEW_AUDIT_LOGS') ? await fetchAudit() : S.audit;
      }));
      toast('success', 'Security policy saved.'); rerender();
    } catch (e) { toast('error', esc(e.message)); }
  };
  // logos are an https URL in live mode (the browser-only upload cannot be stored)
  const style = document.createElement('style'); style.textContent = '.field:has(#logoFile){display:none}'; document.head.appendChild(style);

  // ================================================================ results, trust and health, reports, public site
  function mapResult(v) {
    const items = v.items.map((i) => {
      const a = i.candidateId ? S.apps.find((x) => x.candidateId === i.candidateId) : null;
      return { key: i.candidateId ? (a ? a.id : 'c' + i.candidateId) : 'NOTA', optionIndex: i.optionIndex, label: i.label, votes: i.votes, rank: i.rank, winner: i.winner, percent: i.percent };
    });
    return { eid: ids.election.to(v.electionId), items, countingMethod: v.countingMethod, total: v.acceptedBallots, computedAt: ts(v.generatedAt), bbCount: v.acceptedBallots, bbHead: v.bulletinHeadHash,
      tie: v.tieDetected, notaLeads: !!items.length && items[0].key === 'NOTA' && items[0].votes > 0, status: v.publishedAt || v.status === 'PUBLISHED' ? 'PUBLISHED' : 'COMPUTED',
      publishedAt: ts(v.publishedAt), hash: v.resultHash, explanation: v.explanation, generationCount: v.generationCount };
  }
  async function loadResult(e, publicOnly) {
    const path = publicOnly ? `/api/public/elections/${e.apiId}/results` : `/api/elections/${e.apiId}/results`;
    try { (S.results ||= {})[e.id] = mapResult(await http.get(path, null, publicOnly ? { auth: false } : undefined)); } catch (err) { if (!(err instanceof DV_API.DvApiError) || err.status !== 404) throw err; delete S.results[e.id]; }
  }
  DV_API.addHydrator('results', async () => {
    S.results = {};
    await Promise.all(S.elections.filter((e) => ['VERIFICATION', 'PUBLISHED', 'ARCHIVED'].includes(e.status)).map((e) => loadResult(e, false).catch(() => {})));
  });

  // generating results = the server tallies the encrypted ballots homomorphically and decrypts only the totals
  ACT.tally = async (el) => {
    const e = election(el.dataset.eid);
    const labels = ['Verify the bulletin board hash chain', 'Confirm every accepted ballot is on the board', 'Multiply the Paillier ciphertexts of each option across all accepted ballots', 'Unseal the election private key and decrypt only the totals', 'Check totals = ballots = board entries'];
    UI.tally = { eid: e.id, steps: labels.map((l) => ({ label: l, state: '' })) }; rerender();
    let i = 0; const tick = setInterval(() => { if (UI.tally && i < labels.length - 1) { UI.tally.steps[i].state = 'ok'; i++; UI.tally.steps[i].state = 'on'; rerender(); } }, 500);
    UI.tally.steps[0].state = 'on'; rerender();
    try {
      const v = await http.post(`/api/elections/${e.apiId}/results/generate`, {});
      clearInterval(tick); S.results[e.id] = mapResult(v);
      await refreshElection(e.id); await loadResult(e, false).catch(() => {}); await refreshTrust(e);
      toast('success', election(e.id).status === 'PUBLISHED' ? 'Results computed and published automatically.' : 'Results computed. Review them, then publish.');
      UI.tally = null; rerender();
    } catch (er) { clearInterval(tick); UI.tally = null; rerender(); toast('error', esc(DV_API.errorMessage(er))); }
  };
  const _transition = window.transition;
  window.transition = async (eid) => { const r = await _transition(eid); const e = election(eid); await loadResult(e, false).catch(() => {}); await refreshTrust(e); return r; };
  const _pre = window.preconditions;
  window.preconditions = (e) => (e.status === 'VERIFICATION' ? [{ label: 'Results computed from accepted ballots', ok: !!(S.results || {})[e.id], detail: (S.results || {})[e.id] ? `${S.results[e.id].total} ballot(s) tallied` : 'Generate results in Results management first' }] : _pre(e));

  // ---- trust and health: live checks computed by the server
  const TRUST_KEY = { ballots: 'validation', duplicates: 'duplicates', bulletin: 'board', receipts: 'consistency', results: 'tally', audit: 'audit' };
  const TRUST_AREA = { ballots: 'Votes validated', duplicates: 'Duplicate prevention', bulletin: 'Hash integrity', receipts: 'Verification', results: 'Verification', audit: 'Audit completion' };
  async function loadTrust(e) {
    const t = await http.get(`/api/elections/${e.apiId}/trust`);
    (S.trust ||= {})[e.id] = t;
    // the screens count ballots, tokens and pending ballots from these lists; only the counts are known (no ballot data)
    (S.ballots ||= {})[e.id] = Array.from({ length: t.acceptedBallots }, () => ({}));
    (S.spent ||= {})[e.id] = Array.from({ length: t.spentTokens }, (_, i) => `t${i}`);
    (S.pending ||= {})[e.id] = Array.from({ length: Math.max(0, t.acceptedBallots - ((S.bulletin || {})[e.id] || []).length) }, () => 'c');
    (S.verifyCount ||= {})[e.id] = t.receiptVerifications;
    try { (S.aggCheck ||= {})[e.id] = await http.get(`/api/elections/${e.apiId}/integrity/aggregation`); } catch { /* keys exist only once voting opened */ }
  }
  const refreshTrust = async (e) => { if (hasPerm('VIEW_ELECTION_INTERNALS')) await loadTrust(e).catch(() => {}); };
  DV_API.addHydrator('trust', async () => {
    S.trust = {}; S.aggCheck = {};
    if (hasPerm('VIEW_ELECTION_INTERNALS')) await Promise.all(S.elections.filter((e) => e.status !== 'DRAFT').map((e) => loadTrust(e).catch(() => {})));
  });
  window.trustChecks = (eid) => ((S.trust || {})[eid] ? S.trust[eid].checks.map((c) => ({ key: TRUST_KEY[c.key] || c.key, area: TRUST_AREA[c.key] || 'Verification', label: c.label, status: c.status, detail: c.detail })) : []);
  ACT['health-probe'] = async (el) => {
    const t0 = performance.now();
    try { await withBusy(el, () => http.get('/api/public/health', null, { auth: false })); UI.health = { api: 'UP', ms: Math.round(performance.now() - t0), at: Date.now() }; } catch { UI.health = { api: 'DOWN', ms: null, at: Date.now() }; }
    rerender();
  };

  // ---- result verification: the server recomputes the aggregates; this browser recomputes the result hash
  const resultHashOk = (e, res) => {
    const items = res.items.slice().sort((a, b) => a.optionIndex - b.optionIndex);
    return sha256(`${e.apiId}|${res.countingMethod}|${res.total}|${res.bbHead}|${items.map((i) => `${i.optionIndex}:${i.votes}`).join(',')}`) === res.hash;
  };
  window.resultVerification = () => {
    const e = pickElection((x) => (S.results || {})[x.id]);
    if (!e) return `${pageHead('Result verification', 'Recompute the tally from the encrypted ballots and compare with the stored totals.')}${empty('No results to verify yet', 'Results appear after an election is tallied.')}`;
    const res = S.results[e.id]; const agg = (S.aggCheck || {})[e.id]; const chain = verifyBoard(e.id);
    const checks = [
      ['The server re-multiplied every ballot ciphertext and the aggregates match', !!agg && agg.valid, agg ? `${agg.ballotsChecked} ballot commitments and ${agg.optionsChecked} option aggregates recomputed` : 'Not available for your role'],
      ['Ballots tallied = ballots counted by the server', res.total === ballotsOf(e.id).length, `${res.total} tallied`],
      ['Board entries covered = entries on the board', res.bbCount === boardOf(e.id).length, `${res.bbCount} of ${boardOf(e.id).length}`],
      ['Bulletin chain verifies (recomputed in this browser)', chain.ok, chain.ok ? `${chain.count} entries` : `breaks at entry ${chain.at}`],
      ['Result hash recomputes in this browser', resultHashOk(e, res), 'SHA-256 over election, counting method, ballot count, bulletin head and per-option totals'],
    ];
    const rows = res.items.slice().sort((a, b) => a.rank - b.rank);
    return `${pageHead('Result verification', 'Recompute the tally from the encrypted ballots and compare with the stored totals.')}${electionPicker(e, (x) => (S.results || {})[x.id])}<div class="stack">${checks.every((c) => c[1]) ? alertBox('success', 'No discrepancies', 'The server recount and this browser agree with the stored result.') : alertBox('error', 'Discrepancy found', 'At least one check failed; see below.')}
    <div class="grid g-lg-2">${card('Stored totals', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Option</th><th>Votes</th><th>Rank</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.label)}${r.winner ? ` ${badge('green', 'Winner')}` : ''}</td><td>${r.votes}</td><td>${r.rank}</td></tr>`).join('')}</tbody></table></div>`, { flush: true })}${card('Consistency checks', `<ul class="stack-sm" style="list-style:none;margin:0;padding:0">${checks.map(([l, ok, d]) => `<li class="row between" style="flex-wrap:nowrap"><span class="small">${esc(l)}<span class="xs muted" style="display:block">${esc(d)}</span></span>${ok ? status('PASS') : status('FAIL')}</li>`).join('')}</ul><p class="xs muted mt-3">Result hash <span class="mono">${esc(res.hash)}</span></p>`)}</div></div>`;
  };
  { const r = APP_ROUTES.find((x) => x[0] === '/app/result-verification'); if (r) r[1] = window.resultVerification; }

  // ---- reports (aggregate figures only)
  const mapReport = (r) => ({ id: 'r' + r.id, apiId: r.id, type: r.type, eid: r.electionId ? ids.election.to(r.electionId) : null, at: ts(r.generatedAt), by: '', hash: r.contentHash, content: r.content || null });
  DV_API.addHydrator('reports', async () => {
    S.reports = [];
    if (!(hasPerm('GENERATE_REPORTS') || hasPerm('VIEW_REPORTS'))) return;
    const p = await http.get(`/api/orgs/${ctx.orgId}/reports`, { page: 0, size: 100 });
    S.reports = p.content.map(mapReport).reverse();
  });
  const reportDetail = async (r) => { if (!r.content) { const full = await http.get(`/api/reports/${r.apiId}`); r.content = full.content; } return r; };
  const cell = (v) => (v && typeof v === 'object' ? `<pre class="mono xs" style="white-space:pre-wrap;margin:0">${esc(JSON.stringify(v, null, 2))}</pre>` : esc(typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v ?? '—'));
  window.reportHtml = (r) => {
    const rows = Object.entries(r.content || {}).filter(([k]) => k !== 'reportType').map(([k, v]) => [k.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase()),
      Array.isArray(v) && v.length && typeof v[0] === 'object' ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${Object.keys(v[0]).map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${v.map((o) => `<tr>${Object.values(o).map((x) => `<td>${cell(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : cell(v)]);
    return `${kv(rows)}<p class="xs muted mt-3">Content hash (SHA-256): <span class="mono">${esc(r.hash)}</span></p>`;
  };
  FORMS.report = async (f, b) => {
    const type = f.rtype.value, eid = f.reid.value || null;
    if (['ELECTION', 'HEALTH', 'PARTICIPATION'].includes(type) && !eid) { $('#rep-err').textContent = 'Choose an election for this report type.'; return; }
    $('#rep-err').textContent = '';
    try {
      const r = await withBusy(b, () => api(async () => {
        const path = eid ? `/api/elections/${election(eid).apiId}/reports` : `/api/orgs/${ctx.orgId}/reports`;
        const made = mapReport(await http.post(`${path}?type=${type}`, {})); S.reports.push(made); return made;
      }));
      toast('success', 'Report generated.'); rerender(); ACT['report-view']({ dataset: { id: r.id } });
    } catch (e) { $('#rep-err').textContent = e.message; }
  };
  ACT['report-view'] = async (el) => {
    const r = S.reports.find((x) => x.id === el.dataset.id);
    try { await reportDetail(r); } catch (e) { toast('error', esc(DV_API.errorMessage(e))); return; }
    modal({ title: `${REPORT_TYPES.find((x) => x[0] === r.type)[1]}${r.eid ? ' · ' + esc(election(r.eid)?.title) : ''}`, wide: true, body: reportHtml(r), foot: `${btn('Download JSON', { variant: 'secondary', act: 'report-dl', data: { id: r.id }, icon: 'download' })}${btn('Print', { act: 'report-print', data: { id: r.id } })}` });
  };
  const _dl = ACT['report-dl']; const _print = ACT['report-print'];
  ACT['report-dl'] = async (el) => { const r = S.reports.find((x) => x.id === el.dataset.id); try { await reportDetail(r); } catch (e) { toast('error', esc(DV_API.errorMessage(e))); return; } _dl(el); };
  ACT['report-print'] = async (el) => { const r = S.reports.find((x) => x.id === el.dataset.id); try { await reportDetail(r); } catch (e) { toast('error', esc(DV_API.errorMessage(e))); return; } _print(el); };

  // ---- public site: elections, published results and bulletin boards, with or without signing in
  const mapPublicElection = (pe) => ({ id: ids.election.to(pe.id), apiId: pe.id, title: pe.title, description: pe.description || '', status: pe.status, adminId: null, created: null, updated: null,
    rules: { countingMethod: pe.countingMethod || 'PLURALITY', maxSelections: 1, minCandidates: 2, notaEnabled: true, requireCandidateApproval: true, anonymousVoting: true, candidatesMayVote: true, administratorsMayVote: false,
      receiptsRequired: true, qrReceipts: true, publicResults: true, resultPublicationPolicy: 'MANUAL', campaignStart: null, campaignEnd: null, votingStart: ts(pe.votingStart), votingEnd: ts(pe.votingEnd) },
    eligible: Array(Math.max(0, pe.eligibleVoters || 0)).fill(''), frozen: true, keys: null, banner: '', rel: null, orgName: pe.organizationName, publicOnly: true });
  async function loadPublic() {
    const list = await http.get('/api/public/elections', null, { auth: false });
    for (const pe of list) {
      const id = ids.election.to(pe.id);
      let e = S.elections.find((x) => x.id === id);
      if (!e) { e = mapPublicElection(pe); S.elections.push(e); }
      if (!S.org.name && pe.organizationName) S.org.name = pe.organizationName;
      if (!S.results[id] && pe.resultsPublished) await loadResult(e, true).catch(() => {});
      if (!(S.bulletin || {})[id] || !(S.bulletin[id] || []).length) {
        const rows = []; let chain = null;
        for (let page = 0; page < 20; page++) {
          const p = await http.get(`/api/public/elections/${pe.id}/bulletin`, { page, size: 100 }, { auth: false }).catch(() => null);
          if (!p) break; rows.push(...p.entries.content); chain = p.chain; if (page + 1 >= p.entries.totalPages) break;
        }
        (S.bulletin ||= {})[id] = rows.map((r) => ({ seq: r.seq, c: r.ballotCommitment, prev: r.prevHash, h: r.entryHash, at: r.postedAtMinute ? Date.parse(r.postedAtMinute + 'Z') : null }));
        (S.bbChain ||= {})[id] = chain;
      }
    }
  }
  DV_API.addHydrator('public', async () => { await loadPublic().catch(() => {}); });
  // a visitor who is not signed in still sees the public site
  document.addEventListener('DOMContentLoaded', () => { if (!DV_API.auth.hasToken()) loadPublic().then(() => rerender()).catch(() => {}); });

  // ================================================================ self sign-up (voters and candidates)
  const SIGNUP_FIELDS = { fullName: 'sname', gender: 'sgender', dateOfBirth: 'sdob', fatherName: 'sfather', motherName: 'smother', email: 'semail', mobileNumber: 'smobile', address: 'saddress', idType: 'sidtype', idNumber: 'sidno', password: 'spassword', proof: 'sproof' };

  /** Called from the "Confirm sign up" dialog. The backend creates the account, issues the DV number and returns a session. */
  window.createAccount = async function createAccount(v, role) {
    const input = document.querySelector('[data-change="sproof"]'); const file = input && input.files[0];
    if (!file) throw new Error('Upload a photo or scan of your ID');
    const data = { role, fullName: v.name, gender: v.gender, dateOfBirth: v.dob, fatherName: v.father, motherName: v.mother, email: v.email, mobileNumber: v.mobile, address: v.address, idType: v.idType, idNumber: v.idNo, password: v.pw };
    const form = new FormData();
    form.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    form.append('proof', file, file.name);
    let r;
    try { r = await http.upload('/api/auth/signup', form, { auth: false }); } catch (e) {
      const fe = DV_API.fieldErrors(e, SIGNUP_FIELDS);
      if (Object.keys(fe).length) { closeModal(); const f = document.querySelector('form[data-form="signup"]'); if (f) showErrors(f, fe); return; } // show it next to the input
      throw new Error(DV_API.errorMessage(e));
    }
    DV_API.auth.accept(r);
    UI.signupProof = null;
    UI.signupDone = { id: ids.user.to(r.user.id), name: r.user.fullName, email: r.user.email, role, uniqueNo: r.user.dvNumber, _session: r };
    rerender();
  };
  ACT['signup-continue'] = async () => {
    const d = UI.signupDone; UI.signupDone = null;
    try { await DV_API.afterAuth(S, d._session.user, d.role); UI.loaded = null; go(homeFor(d.role)); } catch (e) { toast('error', esc(DV_API.errorMessage(e))); go('/login'); }
  };
  ACT['signup-login'] = () => { DV_API.auth.logout(); UI.signupDone = null; go('/login'); };
  // the first render ran before this file defined its pages (#/activate, #/recover); draw again now that they exist
  render();
})();
