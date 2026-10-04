/* UXexpert auth + entitlement gate — Supabase via plain fetch (no library).
   Email OTP sign-in doubles as consented email capture. The audit still runs
   in the browser; this only gates who can run it and how many. */
(function () {
  var SB_URL = 'https://zntkdduacrfqvjbcikpn.supabase.co';
  var SB_ANON = 'sb_publishable_znJr-9ITxg3XwU82zNgvkg_pUXviS5Z';
  var SKEY = 'ux_session';
  // Set to the deployed uxexpert-billing Worker URL to switch on Stripe Checkout
  // + Customer Portal (see billing/README.md). Empty = CTAs fall back to /pricing/.
  var BILLING_URL = 'https://uxexpert-billing.kintzele1994.workers.dev';
  function $(id) { return document.getElementById(id); }

  function getSession() { try { var s = JSON.parse(localStorage.getItem(SKEY) || 'null'); return (s && s.access_token) ? s : null; } catch (e) { return null; } }
  function setSession(d) { try { localStorage.setItem(SKEY, JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + ((d.expires_in || 3600) * 1000), user: d.user })); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem(SKEY); } catch (e) {} }

  function sb(path, opts, bearer) {
    opts = opts || {};
    var h = { 'apikey': SB_ANON, 'Content-Type': 'application/json' };
    if (bearer) { var s = getSession(); h['Authorization'] = 'Bearer ' + (s ? s.access_token : SB_ANON); }
    else h['Authorization'] = 'Bearer ' + SB_ANON;
    for (var k in (opts.headers || {})) h[k] = opts.headers[k];
    return fetch(SB_URL + path, { method: opts.method || 'GET', headers: h, body: opts.body });
  }
  function errMsg(j, fallback) { return (j && (j.error_description || j.msg || j.message)) || fallback; }

  async function sendCode(email) {
    var res = await sb('/auth/v1/otp', { method: 'POST', body: JSON.stringify({ email: email, create_user: true }) });
    if (!res.ok) { var j = await res.json().catch(function () { return {}; }); throw new Error(errMsg(j, 'Could not send a code (' + res.status + '). Try again in a minute.')); }
    return true;
  }
  async function verifyCode(email, token) {
    var res = await sb('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'email', email: email, token: token }) });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j.access_token) throw new Error(errMsg(j, 'That code was not accepted — check it and try again.'));
    setSession(j); return j;
  }
  async function refresh() {
    var s = getSession(); if (!s || !s.refresh_token) return null;
    var res = await sb('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token }) });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j.access_token) { clearSession(); return null; }
    setSession(j); return getSession();
  }
  async function consumeAudit() {
    var s = getSession(); if (!s) throw new Error('not signed in');
    if (s.expires_at && Date.now() > s.expires_at - 30000) await refresh();
    var res = await sb('/rest/v1/rpc/consume_audit', { method: 'POST', body: '{}' }, true);
    if (res.status === 401) { if (await refresh()) res = await sb('/rest/v1/rpc/consume_audit', { method: 'POST', body: '{}' }, true); }
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error('entitlement check failed');
    return j; // { allowed, reason }
  }
  async function signOut() { try { await sb('/auth/v1/logout', { method: 'POST', body: '{}' }, true); } catch (e) {} clearSession(); updateAccountUI(); }

  /* ---------- sign-in modal ---------- */
  var resolver = null, pendingEmail = '';
  function showErr(m) { var e = $('si-err'); if (e) { e.hidden = false; e.textContent = m; } }
  function openSignIn() {
    return new Promise(function (resolve) {
      resolver = resolve;
      $('si-form-email').style.display = 'block'; $('si-form-code').style.display = 'none';
      $('si-err').hidden = true; $('si-email').value = ''; $('si-code').value = '';
      $('signin').classList.add('show');
      document.querySelectorAll('nav,main,footer').forEach(function (n) { n.setAttribute('inert', ''); });
      setTimeout(function () { $('si-email').focus(); }, 30);
    });
  }
  function closeSignIn(ok) {
    $('signin').classList.remove('show');
    document.querySelectorAll('nav,main,footer').forEach(function (n) { n.removeAttribute('inert'); });
    var r = resolver; resolver = null; if (r) r(!!ok);
  }
  async function submitEmail() {
    var email = $('si-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr("That email doesn't look right."); return; }
    var b = $('si-email-btn'); b.disabled = true; b.textContent = 'Sending…';
    try {
      await sendCode(email); pendingEmail = email; $('si-sent-to').textContent = email;
      $('si-err').hidden = true; $('si-form-email').style.display = 'none'; $('si-form-code').style.display = 'block';
      setTimeout(function () { $('si-code').focus(); }, 30);
      if (window.track) window.track('Signup Email');
    } catch (e) { showErr(e.message); }
    finally { b.disabled = false; b.textContent = 'Email me a code'; }
  }
  async function submitCode() {
    var token = $('si-code').value.trim().replace(/\s/g, '');
    if (token.length < 4) { showErr('Enter the code from your email.'); return; }
    var b = $('si-code-btn'); b.disabled = true; b.textContent = 'Verifying…';
    try { await verifyCode(pendingEmail, token); updateAccountUI(); if (window.track) window.track('Signed In'); closeSignIn(true); }
    catch (e) { showErr(e.message); }
    finally { b.disabled = false; b.textContent = 'Verify & continue'; }
  }

  /* ---------- paywall ---------- */
  function openPaywall(reason) {
    $('paywall').classList.add('show');
    document.querySelectorAll('nav,main,footer').forEach(function (n) { n.setAttribute('inert', ''); });
    if (window.track) window.track('Paywall Shown', { reason: reason || 'limit' });
  }
  function closePaywall() { $('paywall').classList.remove('show'); document.querySelectorAll('nav,main,footer').forEach(function (n) { n.removeAttribute('inert'); }); }

  /* ---------- the gate the app awaits ----------
     The diagnosis (scores + findings) is free; we only require a verified email
     so we can nurture the account. The fixes, backlog, and exports are gated in
     the report itself by plan (see isPro). */
  async function requireAudit() {
    if (!getSession()) { var ok = await openSignIn(); if (!ok) return false; }
    if (!entitlement.known) { try { await refreshBilling(); } catch (e) {} }
    return true;
  }

  /* ---------- Stripe billing (dormant until BILLING_URL is set) ---------- */
  async function billing(path, body) {
    var s = getSession(); if (!s) throw new Error('not signed in');
    if (s.expires_at && Date.now() > s.expires_at - 30000) { await refresh(); s = getSession(); }
    var res = await fetch(BILLING_URL.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token },
      body: JSON.stringify(body || {})
    });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j.url) throw new Error(j.error || 'Could not start billing. Try again in a minute.');
    return j.url;
  }
  // Resolve the plan: explicit 'monthly'/'annual', else read the pricing toggle.
  function resolvePlan(plan) {
    if (plan === 'monthly' || plan === 'annual') return plan;
    var yr = document.getElementById('bill-yr');
    return (yr && yr.checked) ? 'annual' : 'monthly';
  }
  // Ensure a session. If the sign-in modal exists on this page, open it; else
  // send the visitor to the home audit flow to sign in + take their free audit.
  async function ensureSession() {
    if (getSession()) return true;
    if (document.getElementById('signin')) return await openSignIn();
    location.href = '/#audit';
    return false;
  }
  function billingErr(e) { if (window.toast) window.toast(e.message); else alert(e.message); }
  async function startCheckout(plan) {
    if (!BILLING_URL) { location.href = '/pricing/'; return; }
    plan = resolvePlan(plan);
    if (!(await ensureSession())) return;
    try { if (window.track) window.track('Checkout Started', { plan: plan }); location.href = await billing('/checkout', { plan: plan }); }
    catch (e) { billingErr(e); }
  }
  async function openPortal() {
    if (!BILLING_URL) { location.href = '/pricing/'; return; }
    if (!(await ensureSession())) return;
    try { location.href = await billing('/portal', {}); }
    catch (e) { billingErr(e); }
  }

  function updateAccountUI() {
    var s = getSession(), acct = $('acct'), so = $('acct-signout');
    if (acct) {
      if (s && s.user) { var em = s.user.email || 'Account'; acct.textContent = em.length > 22 ? em.slice(0, 20) + '…' : em; acct.title = em; acct.hidden = false; if (so) so.hidden = false; }
      else { acct.hidden = true; if (so) so.hidden = true; }
    }
    refreshBilling();
  }
  // Entitlement cache: the report reads isPro() to decide whether to reveal the
  // fixes/backlog. Refreshed on load, after sign-in, and after a checkout return.
  var entitlement = { plan: 'free', status: null, known: false };
  var onEntitlementCb = null;
  function isPro() { return entitlement.plan === 'pro' && entitlement.status === 'active'; }
  async function refreshBilling() {
    var b = $('acct-billing');
    if (!getSession()) { entitlement = { plan: 'free', status: null, known: true }; if (b) b.hidden = true; if (onEntitlementCb) onEntitlementCb(); return; }
    try {
      var res = await sb('/rest/v1/profiles?select=plan,subscription_status', {}, true);
      if (res.status === 401 && await refresh()) res = await sb('/rest/v1/profiles?select=plan,subscription_status', {}, true);
      var rows = await res.json().catch(function () { return []; });
      var p = (rows && rows[0]) || {};
      entitlement = { plan: p.plan || 'free', status: p.subscription_status || null, known: true };
    } catch (e) { entitlement.known = true; }
    if (b) b.hidden = !isPro();
    if (onEntitlementCb) onEntitlementCb();
  }

  /* ---------- saved history (Pro) ---------- */
  async function sbAuthed(path, opts) {
    var res = await sb(path, opts || {}, true);
    if (res.status === 401 && await refresh()) res = await sb(path, opts || {}, true);
    return res;
  }
  async function saveAudit(rec) {
    if (!getSession() || !isPro()) return null; // history is a Pro feature
    try {
      var res = await sbAuthed('/rest/v1/audits', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify(rec) });
      var j = await res.json().catch(function () { return null; });
      return res.ok ? (j && j[0]) : null;
    } catch (e) { return null; }
  }
  async function listAudits(limit) {
    if (!getSession()) return [];
    try {
      var res = await sbAuthed('/rest/v1/audits?select=id,created_at,label,engine,overall,ux,dev,gtm,findings&order=created_at.desc&limit=' + (limit || 20));
      var j = await res.json().catch(function () { return []; });
      return res.ok && Array.isArray(j) ? j : [];
    } catch (e) { return []; }
  }
  async function getAudit(id) {
    try {
      var res = await sbAuthed('/rest/v1/audits?id=eq.' + encodeURIComponent(id) + '&select=result');
      var j = await res.json().catch(function () { return []; });
      return (j && j[0] && j[0].result) || null;
    } catch (e) { return null; }
  }

  // Magic-link callback: Supabase redirects the email link back to the site with
  // the session tokens in the URL hash (implicit flow). Parse them, sign in, and
  // clean the URL — so clicking the link works as well as typing the code.
  async function handleAuthRedirect() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return false;
    var p = new URLSearchParams(h);
    if (p.get('error') || p.get('error_description')) {
      history.replaceState(null, '', location.pathname + location.search);
      var d = (p.get('error_description') || 'That sign-in link didn\'t work — request a new code.').replace(/\+/g, ' ');
      try { d = decodeURIComponent(d); } catch (e) {}
      if (typeof window.toast === 'function') window.toast(d);
      return false;
    }
    var at = p.get('access_token'); if (!at) return false;
    setSession({ access_token: at, refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600, user: null });
    history.replaceState(null, '', location.pathname + location.search);
    try {
      var res = await sb('/auth/v1/user', {}, true);
      var u = res.ok ? await res.json().catch(function () { return null; }) : null;
      if (!u || !u.id) { clearSession(); if (typeof window.toast === 'function') window.toast('That sign-in link has expired — enter your email again for a fresh code.'); return false; }
      var s = getSession(); if (s) { s.user = { id: u.id, email: u.email }; try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} }
    } catch (e) { clearSession(); return false; }
    closeSignIn(true);
    updateAccountUI();
    if (window.track) window.track('Signed In', { via: 'link' });
    // Hand off to the app to resume the audit the user started before the email.
    try { document.dispatchEvent(new Event('ux:resume-audit')); } catch (e) {}
    return true;
  }

  // deferred script → DOM is parsed; wire now
  var f1 = $('si-form-email'); if (f1) f1.addEventListener('submit', function (e) { e.preventDefault(); submitEmail(); });
  var f2 = $('si-form-code'); if (f2) f2.addEventListener('submit', function (e) { e.preventDefault(); submitCode(); });
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-auth]'); if (!el) return; e.preventDefault();
    var a = el.dataset.auth;
    if (a === 'close-signin') closeSignIn(false);
    else if (a === 'close-paywall') closePaywall();
    else if (a === 'signout') signOut();
    else if (a === 'signin') openSignIn();
    else if (a === 'resend') submitEmail();
    else if (a === 'checkout') startCheckout(el.dataset.plan);
    else if (a === 'portal') openPortal();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSignIn(false); closePaywall(); } });
  updateAccountUI();
  handleAuthRedirect();

  window.requireAudit = requireAudit;
  window.uxAuth = {
    getSession: getSession, signOut: signOut, updateAccountUI: updateAccountUI,
    startCheckout: startCheckout, openPortal: openPortal,
    billingEnabled: function () { return !!BILLING_URL; },
    isPro: isPro,
    refreshEntitlement: refreshBilling,
    onEntitlement: function (cb) { onEntitlementCb = cb; },
    paywall: function (reason) { openPaywall(reason); },
    saveAudit: saveAudit, listAudits: listAudits, getAudit: getAudit
  };
})();
