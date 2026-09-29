/* UXexpert auth + entitlement gate — Supabase via plain fetch (no library).
   Email OTP sign-in doubles as consented email capture. The audit still runs
   in the browser; this only gates who can run it and how many. */
(function () {
  var SB_URL = 'https://zntkdduacrfqvjbcikpn.supabase.co';
  var SB_ANON = 'sb_publishable_znJr-9ITxg3XwU82zNgvkg_pUXviS5Z';
  var SKEY = 'ux_session';
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

  /* ---------- the gate the app awaits ---------- */
  async function requireAudit() {
    if (!getSession()) { var ok = await openSignIn(); if (!ok) return false; }
    try { var res = await consumeAudit(); if (res && res.allowed) return true; openPaywall(res && res.reason); return false; }
    catch (e) { openPaywall('error'); return false; }
  }

  function updateAccountUI() {
    var s = getSession(), acct = $('acct'), so = $('acct-signout');
    if (acct) {
      if (s && s.user) { var em = s.user.email || 'Account'; acct.textContent = em.length > 22 ? em.slice(0, 20) + '…' : em; acct.title = em; acct.hidden = false; if (so) so.hidden = false; }
      else { acct.hidden = true; if (so) so.hidden = true; }
    }
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
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSignIn(false); closePaywall(); } });
  updateAccountUI();

  window.requireAudit = requireAudit;
  window.uxAuth = { getSession: getSession, signOut: signOut, updateAccountUI: updateAccountUI };
})();
