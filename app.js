// UXexpert.ai — application script (externalized so the CSP can forbid inline scripts)
  window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init()

/* ============================================================
   UXexpert audit engine — runs fully client-side.
   Parses HTML/CSS/JS and produces findings across three lenses:
   ux (Principal UX Designer), dev (Full-Stack Engineer),
   gtm (Growth Strategist).
   ============================================================ */

const state = { files: [], images: [] };
const $ = id => document.getElementById(id);

/* ---------- input handling ---------- */
const drop = $('drop'), fileinput = $('fileinput');
drop.addEventListener('click', () => fileinput.click());
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileinput.click(); });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
fileinput.addEventListener('change', () => addFiles(fileinput.files));

// Accept drops anywhere on the page — a drop that misses the dropzone must
// never be silently ignored (or navigate the browser away).
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});

function addFiles(list) {
  [...list].forEach(f => {
    if (/\.(png|jpe?g|webp|gif)$/i.test(f.name) || /^image\//.test(f.type)) { addScreenshot(f); return; }
    if (!/\.(html?|css|js|txt)$/i.test(f.name)) { toast(`Skipped ${f.name} — the playground analyzes HTML, CSS, JS, and screenshots (PNG, JPG, WebP).`); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (state.sampleInEditor) {
        // The demo's sample code must never ride along with a real upload
        $('code').value = ''; state.sampleInEditor = false;
        toast('Sample code cleared — your uploaded files will be audited instead.');
      }
      state.files.push({ name: f.name, size: f.size, text: reader.result });
      renderFiles();
    };
    reader.readAsText(f);
  });
}
// Screenshots: normalized client-side (downscaled to 2000px max, recompressed)
// so vision runs stay fast and token-efficient. Reviewed only by the AI engine.
function addScreenshot(f) {
  if (state.images.length >= 6) { toast('Up to 6 screenshots per audit — remove one to add another.'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const { dataUrl, mediaType } = await normalizeImage(String(reader.result));
      if (state.sampleInEditor) {
        $('code').value = ''; state.sampleInEditor = false;
        toast('Sample code cleared — your uploads will be audited instead.');
      }
      state.images.push({ name: f.name, size: Math.round(dataUrl.length * 0.75), dataUrl, mediaType });
      renderFiles();
      toast(state.engine === 'ai' ? 'Screenshot added.' : 'Screenshot added — visual review uses the Claude AI engine (step 03).');
    } catch (e) { toast('Could not read ' + f.name + ' as an image.'); }
  };
  reader.readAsDataURL(f);
}
function normalizeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 2000;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      if (scale === 1 && dataUrl.length < 3500000) {
        resolve({ dataUrl, mediaType: (dataUrl.match(/^data:(image\/[\w.+-]+);/) || [])[1] || 'image/png' });
        return;
      }
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve({ dataUrl: c.toDataURL('image/jpeg', 0.88), mediaType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
function removeImage(i) { state.images.splice(i, 1); renderFiles(); }

function renderFiles() {
  $('filelist').innerHTML = state.files.map((f, i) =>
    `<div class="f"><b>${esc(f.name)}</b><span>${(f.size/1024).toFixed(1)} KB <button type="button" class="rm" aria-label="Remove file ${esc(f.name)}" data-action="removeFile" data-idx="${i}">&times;</button></span></div>`).join('')
  + state.images.map((im, i) =>
    `<div class="f"><b>${esc(im.name)}</b><span><span class="pill">screenshot</span> ${(im.size/1024).toFixed(0)} KB <button type="button" class="rm" aria-label="Remove screenshot ${esc(im.name)}" data-action="removeImage" data-idx="${i}">&times;</button></span></div>`).join('');
  updateReady();
}
function removeFile(i) { state.files.splice(i, 1); renderFiles(); }

/* ---------- "will audit" status line ---------- */
function updateReady() {
  const el = $('readyline'); if (!el) return;
  const kb = n => (n / 1024).toFixed(1) + ' KB';
  const fileBytes = state.files.reduce((n, f) => n + (f.text ? f.text.length : f.size || 0), 0);
  const code = $('code').value.trim();
  const parts = [];
  if (state.files.length) parts.push(`${state.files.length} uploaded file${state.files.length > 1 ? 's' : ''} (${kb(fileBytes)})`);
  if (state.images.length) parts.push(`${state.images.length} screenshot${state.images.length > 1 ? 's' : ''}`);
  if (code) parts.push(state.sampleInEditor ? `the built-in sample app (${kb(code.length)})` : `pasted code (${kb(code.length)})`);
  if (!parts.length && $('url').value.trim()) parts.push($('url').value.trim().replace(/^https?:\/\//, ''));
  el.textContent = parts.length ? 'Will audit: ' + parts.join(' + ') : 'Nothing to audit yet — add your product in step 01.';
}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 4200);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// Errors persist in the report panel until dismissed or a run succeeds —
// a four-second toast is not enough for something that stopped your audit.
function showError(msg) {
  $('errmsg').textContent = ' ' + msg;
  $('errbox').hidden = false;
  $('auditstatus').textContent = 'Error: ' + msg;
  toast(msg);
}
function clearError() { $('errbox').hidden = true; }

// Funnel analytics — event names and coarse labels only, never code content.
const scrollBehavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// Set to the deployed crawler Worker URL (e.g. 'https://crawl.uxexpert.ai') to
// enable live-URL audits for sites that block CORS. Empty = direct fetch only.
const URL_PROXY = 'https://uxexpert-crawl.kintzele1994.workers.dev';

// Stripe Payment Link for the $19/mo Founding Pro offer. Create it in the
// Stripe dashboard (see SETUP-STRIPE.md) and paste the buy.stripe.com URL here.
// Empty = the button falls back to the email waitlist so nothing looks broken.
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/7sY8wQ88m6AX2tN2L6co001';

function foundingCheckout() {
  track('Founding Checkout', { price: 19 });
  if (STRIPE_PAYMENT_LINK) {
    // Stripe appends the customer email; we tag the source for reconciliation
    window.location.href = STRIPE_PAYMENT_LINK + (STRIPE_PAYMENT_LINK.includes('?') ? '&' : '?') + 'client_reference_id=uxexpert-web';
  } else {
    openWaitlist('pro');
    toast('Founding checkout opens shortly — leave your email and you\'ll be first in.');
  }
}

/* ---------- Founding access (soft, client-side unlock) ----------
   A founding member pastes the code from their welcome email. We store only the
   SHA-256 of accepted codes here, so the plaintext isn't in this public file. This
   is a convenience gate, not hard security (the flag lives in localStorage and can
   be set by a determined user) — it removes the Pro-preview nag and shows the
   founding badge. Real, server-enforced entitlement arrives with hosted features. */
const FOUNDING_HASHES = ['05811c8e31802d582d6bdb26b5b8ad4165a45cabc56fd85dcda51b2d5761624d'];
let unlockLastFocused = null;
async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function isFounding() { try { return localStorage.getItem('uxexpert_founding') === '1'; } catch (e) { return false; } }
function applyFoundingState() {
  const on = isFounding();
  const badge = $('foundingbadge'); if (badge) badge.hidden = !on;
  document.body.classList.toggle('is-founding', on);
  const sb = $('storybtn'); if (sb) sb.textContent = on ? 'User stories' : 'User stories — Pro';
}
function openUnlock() {
  unlockLastFocused = document.activeElement;
  $('unlock-form').style.display = 'block'; $('unlock-ok').style.display = 'none';
  $('unlock-err').hidden = true; $('unlock-code').value = '';
  $('unlock').classList.add('show');
  document.querySelectorAll('nav,main,footer').forEach(n => n.setAttribute('inert', ''));
  $('unlock-code').focus();
}
function closeUnlock() {
  $('unlock').classList.remove('show');
  document.querySelectorAll('nav,main,footer').forEach(n => n.removeAttribute('inert'));
  if (unlockLastFocused && unlockLastFocused.focus) unlockLastFocused.focus();
}
async function submitUnlock() {
  const code = $('unlock-code').value.trim().toUpperCase();
  if (!code) return;
  const btn = $('unlock-submit'); btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const h = await sha256hex(code);
    if (FOUNDING_HASHES.includes(h)) {
      try { localStorage.setItem('uxexpert_founding', '1'); } catch (e) {}
      applyFoundingState();
      $('unlock-form').style.display = 'none'; $('unlock-ok').style.display = 'block';
      track('Founding Unlocked');
    } else {
      $('unlock-err').hidden = false;
      $('unlock-err').textContent = 'That code was not recognized. Check your welcome email, or contact hello@uxexpert.ai.';
    }
  } catch (e) {
    $('unlock-err').hidden = false;
    $('unlock-err').textContent = 'Could not verify the code in this browser — email hello@uxexpert.ai and we will sort it out.';
  } finally { btn.disabled = false; btn.textContent = 'Unlock'; }
}
function track(name, props) {
  try { if (window.plausible) plausible(name, props ? { props } : undefined); } catch (e) {}
}

/* ---------- session persistence ---------- */
// A reload must never destroy a report (an AI run costs real money and minutes).
// Persists the last report, skills, and settings — never uploaded file contents.
function saveState() {
  try {
    localStorage.setItem('uxexpert_state', JSON.stringify({
      v: 1,
      last: state.last || null,
      skills: state.skills,
      persona: $('persona').value,
      engine: state.engine,
      rules: { c: $('r-contrast').checked, a: $('r-anim').checked, d: $('r-dark').checked, m: $('r-mobile').checked }
    }));
  } catch (e) {}
}
function restoreState() {
  try {
    const s = JSON.parse(localStorage.getItem('uxexpert_state') || 'null');
    if (!s || s.v !== 1) return;
    state.restoring = true;
    state.skills = s.skills || [];
    renderSkills();
    if (s.persona) $('persona').value = s.persona;
    $('r-contrast').checked = !!s.rules?.c; $('r-anim').checked = !!s.rules?.a;
    $('r-dark').checked = !!s.rules?.d; $('r-mobile').checked = !!s.rules?.m;
    if (s.engine === 'ai') { document.querySelector('#eng-ai input').checked = true; setEngine('ai'); }
    if (s.last) {
      state.last = s.last;
      renderReport(s.last.result, s.last.opts);
      if (s.last.stories) renderStories();
      // Label restored reports unmistakably — inputs are not saved, so this
      // report cannot be "re-run" without adding the product again
      const note = document.createElement('div');
      note.className = 'callout';
      note.innerHTML = `<b>Restored report from ${esc(s.last.when)}.</b> Your code inputs are not saved between visits — to run a fresh audit, add your product again in step 01.`;
      $('report').prepend(note);
    }
  } catch (e) {}
  finally { state.restoring = false; }
}

/* ---------- waitlist (Formspree) ---------- */
const FORMSPREE_ID = 'mjgndlwd';
let wlPlan = 'pro';
let wlLastFocused = null;
function openWaitlist(plan) {
  wlPlan = plan;
  wlLastFocused = document.activeElement;
  if (!FORMSPREE_ID) { location.href = `mailto:hello@uxexpert.ai?subject=UXexpert%20${plan}%20waitlist`; return; }
  $('wl-title').textContent = plan === 'enterprise' ? 'Talk to us about Enterprise' : 'Join the Pro waitlist';
  $('wl-copy').textContent = plan === 'enterprise'
    ? 'Leave your email and we will reach out about team seats, SSO, and custom rule packs.'
    : "Leave your email and you'll be first to hear when Pro ships. No spam, no sharing.";
  $('wl-form').style.display = 'block'; $('wl-ok').style.display = 'none';
  $('waitlist').classList.add('show');
  // Background becomes inert so virtual-cursor users can't reach behind the dialog
  document.querySelectorAll('nav,main,footer').forEach(n => n.setAttribute('inert', ''));
  $('wl-email').focus();
}
function closeWaitlist() {
  $('waitlist').classList.remove('show');
  document.querySelectorAll('nav,main,footer').forEach(n => n.removeAttribute('inert'));
  if (wlLastFocused && wlLastFocused.focus) wlLastFocused.focus();
}
async function submitWaitlist() {
  const email = $('wl-email').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('That email does not look right — check it and try again.'); return; }
  const btn = $('wl-submit'); btn.disabled = true; btn.textContent = 'Joining…';
  try {
    const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email, plan: wlPlan, source: 'uxexpert.ai' })
    });
    if (!res.ok) throw new Error('Signup failed (' + res.status + ') — try again, or email hello@uxexpert.ai.');
    $('wl-form').style.display = 'none'; $('wl-ok').style.display = 'block';
    track('Waitlist Joined', { plan: wlPlan });
  } catch (e) {
    toast(e.message.includes('fetch') ? 'Could not reach the signup service — check your connection or email hello@uxexpert.ai.' : e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Join';
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeWaitlist(); });
// Trap Tab inside the open waitlist modal (background content stays unreachable)
$('waitlist').addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const f = [...$('waitlist').querySelectorAll('input,button')].filter(x => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---------- mobile nav ---------- */
function toggleNav(force) {
  const links = $('navlinks'), btn = $('navtoggle');
  const open = force !== undefined ? force : !links.classList.contains('open');
  links.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
}

/* ---------- engine selection ---------- */
state.engine = 'local';
function setEngine(engine) {
  state.engine = engine;
  $('eng-local').classList.toggle('active', engine === 'local');
  $('eng-ai').classList.toggle('active', engine === 'ai');
  $('keywrap').classList.toggle('show', engine === 'ai');
  if (engine === 'ai' && !$('apikey').value && !state.restoring) $('apikey').focus();
  if (!state.restoring) saveState();
}
// "Remember on this device" must take effect the moment it's set — not only
// when a run happens to succeed later.
function persistKey() {
  try {
    const k = $('apikey').value.replace(/\s+/g, '');
    if ($('rememberkey').checked && k) localStorage.setItem('uxexpert_api_key', k);
    else localStorage.removeItem('uxexpert_api_key');
  } catch (e) {}
}
(() => {
  const saved = localStorage.getItem('uxexpert_api_key');
  if (saved) { $('apikey').value = saved; $('rememberkey').checked = true; }
  // GitHub token: session-scoped only (repo-read credential, cleared on tab
  // close) — never persisted to localStorage. Clean up any legacy persisted one.
  try { localStorage.removeItem('uxexpert_gh_token'); } catch (e) {}
  const ghSaved = sessionStorage.getItem('uxexpert_gh_token');
  if (ghSaved) $('ghtoken').value = ghSaved;
  $('apikey').addEventListener('input', persistKey);
  $('rememberkey').addEventListener('change', persistKey);
  $('ghtoken').addEventListener('input', () => {
    try {
      const t = $('ghtoken').value.replace(/\s+/g, '');
      t ? sessionStorage.setItem('uxexpert_gh_token', t) : sessionStorage.removeItem('uxexpert_gh_token');
    } catch (e) {}
  });
  // Any manual edit means the editor no longer holds the untouched sample
  $('code').addEventListener('input', () => { state.sampleInEditor = false; updateReady(); });
  $('url').addEventListener('input', updateReady);
  $('url').addEventListener('keydown', e => { if (e.key === 'Enter') runEvaluation(); });
  // Mobile menu closes when a destination is chosen
  $('navlinks').addEventListener('click', e => { if (e.target.closest('a')) toggleNav(false); });
})();

/* ---------- sample app (deliberately flawed) ---------- */
function loadSample() {
  const hadUploads = state.files.length > 0 || state.images.length > 0;
  $('code').value = SAMPLE;
  state.sampleInEditor = true;
  state.files = []; state.images = []; renderFiles();
  toast(hadUploads ? 'Your uploads were cleared — the sample app is loaded now.' : 'Sample app loaded. Run the audit when ready.');
}
function startDemo() {
  loadSample();
  document.getElementById('audit').scrollIntoView({ behavior: scrollBehavior() });
  setTimeout(runEvaluation, 450);
}
const SAMPLE = `<html>
<head>
  <title></title>
  <script src="https://cdn.example.com/analytics.js"><\/script>
  <script src="app.js"><\/script>
  <style>
    body { font-family: Arial; color: #999; background: #fff; }
    .hero h1 { font-size: 40px; color: #bbb; background: #fff; }
    .btn { padding: 4px 8px; font-size: 11px; }
    .banner { animation: flash 0.5s infinite; }
    .x { color: red !important; margin: 0 !important; }
  </style>
</head>
<body>
  <center>
    <img src="logo.png">
    <marquee>LIMITED TIME OFFER — SIGN UP NOW</marquee>
  </center>
  <div class="hero">
    <h4>Welcome</h4>
    <h1>The Best App Ever</h1>
    <p style="font-size:10px;color:#aaa">Do stuff faster with our tool.</p>
    <a href="signup.html" onclick="track()">Click here</a>
  </div>
  <form action="http://api.example.com/signup">
    <input type="text" placeholder="Full name">
    <input type="text" placeholder="Email">
    <input type="text" placeholder="Company">
    <input type="text" placeholder="Phone">
    <input type="text" placeholder="Job title">
    <input type="text" placeholder="Company size">
    <input type="text" placeholder="How did you hear about us?">
    <button></button>
  </form>
  <img src="shot1.png"><img src="shot2.png"><img src="shot3.png">
  <a href="https://twitter.com/app" target="_blank">Twitter</a>
  <video src="promo.mp4" autoplay></video>
  <div id="footer" tabindex="5">© 2026</div>
  <div id="footer">duplicate</div>
  <script>
    var count = 0;
    document.write('<p>loaded</p>');
    console.log('debug: init', count);
  <\/script>
</body>
</html>`;

/* ---------- gather inputs ---------- */
function gatherSource() {
  let html = '', css = '', js = '';
  state.files.forEach(f => {
    if (/\.css$/i.test(f.name)) css += '\n' + f.text;
    else if (/\.js$/i.test(f.name)) js += '\n' + f.text;
    else html += '\n' + f.text;
  });
  html += '\n' + $('code').value;
  return { html: html.trim(), css, js };
}

/* ---------- shared scoring ---------- */
// Severity-weighted deductions per lens, with hard caps when criticals exist:
// a lens carrying critical findings can never score in the "healthy" range.
function computeScores(findings) {
  const deduct = { 3: 16, 2: 9, 1: 4.5, 0: 1.5 };
  const scores = {};
  ['ux', 'dev', 'gtm'].forEach(l => {
    const fs = findings.filter(f => f.lens === l);
    let s = 100;
    fs.forEach(f => s -= deduct[f.sev] * (f.boosted ? 1.25 : 1));
    const crits = fs.filter(f => f.sev === 3).length;
    if (crits >= 3) s = Math.min(s, 15);
    else if (crits === 2) s = Math.min(s, 29);
    else if (crits === 1) s = Math.min(s, 49);
    scores[l] = Math.max(4, Math.round(s));
  });
  scores.overall = Math.round((scores.ux + scores.dev + scores.gtm) / 3);
  return scores;
}

/* ---------- engine ---------- */
function analyze(src, opts) {
  const findings = [];
  const doc = new DOMParser().parseFromString(src.html, 'text/html');
  const rawHtml = src.html;
  let css = src.css;
  doc.querySelectorAll('style').forEach(s => css += '\n' + s.textContent);
  let js = src.js;
  doc.querySelectorAll('script:not([src])').forEach(s => js += '\n' + s.textContent);

  // Pattern checks must not fire on string literals or comments inside scripts —
  // a page that embeds sample code as data is not "using" document.write.
  const jsClean = js
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1');

  // Visible page copy only — script and style content is not user-facing text
  let bodyText = '';
  if (doc.body) {
    const bodyClone = doc.body.cloneNode(true);
    bodyClone.querySelectorAll('script,style').forEach(n => n.remove());
    bodyText = bodyClone.textContent;
  }

  const add = (lens, sev, title, detail, fix, opts2 = {}) =>
    findings.push({ lens, sev, title, detail, fix, snippet: opts2.snippet || null,
      effort: opts2.effort || 'S', impact: opts2.impact || 3, tags: opts2.tags || [], wcag: opts2.wcag || null });

  /* ========== UX / ACCESSIBILITY LENS ========== */
  const title = doc.querySelector('title');
  if (!title || !title.textContent.trim())
    add('ux', 2, 'Missing or empty page <title>', 'The browser tab, bookmarks, screen readers, and search results all rely on the title. An empty title reads as "Untitled" to assistive tech.', 'Write a descriptive, benefit-led title under 60 characters.', { snippet: '<title>VibeApp — Do stuff faster, together</title>', impact: 4, tags: ['a11y','seo'], wcag: 'WCAG 2.4.2' });

  if (!doc.documentElement.getAttribute('lang') && /<html/i.test(rawHtml) && !/<html[^>]+lang=/i.test(rawHtml))
    add('ux', 1, 'Missing lang attribute on <html>', 'Screen readers use lang to pick the right pronunciation engine. Without it, content may be read with the wrong accent or phonemes.', 'Declare the document language.', { snippet: '<html lang="en">', impact: 3, tags: ['a11y'], wcag: 'WCAG 3.1.1' });

  const imgs = [...doc.querySelectorAll('img')];
  const noAlt = imgs.filter(i => !i.hasAttribute('alt'));
  if (noAlt.length)
    add('ux', 3, `${noAlt.length} image${noAlt.length>1?'s':''} missing alt text`, 'Screen-reader users hear the raw filename or nothing at all. This is one of the most common and most impactful accessibility failures.', 'Add descriptive alt text; use alt="" only for purely decorative images.', { snippet: `<img src="${noAlt[0].getAttribute('src')||'logo.png'}" alt="VibeApp logo">`, impact: 5, tags: ['a11y'], wcag: 'WCAG 1.1.1' });

  const hs = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => +h.tagName[1]);
  const h1s = hs.filter(n => n === 1).length;
  if (hs.length && h1s === 0)
    add('ux', 2, 'No <h1> on the page', 'The h1 anchors the document outline for screen readers and tells search engines what the page is about.', 'Make your primary headline an <h1>.', { impact: 4, tags: ['a11y','seo'], wcag: 'WCAG 1.3.1' });
  if (h1s > 1)
    add('ux', 1, `Multiple <h1> elements (${h1s})`, 'Multiple h1s dilute the document outline and confuse the page hierarchy.', 'Keep one h1; demote the rest to h2.', { impact: 2, tags: ['a11y','seo'] });
  for (let i = 1; i < hs.length; i++) {
    if (hs[i] < hs[i-1] && hs[0] > hs[i]) {
      add('ux', 1, 'Heading levels appear out of order', `A lower-level heading (h${hs[i-1]}) appears before a higher one (h${hs[i]}). Screen-reader users navigate by heading structure; skipped or inverted levels break their mental map.`, 'Restructure headings to descend logically: h1, then h2, then h3.', { impact: 3, tags: ['a11y'], wcag: 'WCAG 1.3.1' });
      break;
    }
  }

  const inputs = [...doc.querySelectorAll('input:not([type=hidden]):not([hidden]),textarea,select')];
  const unlabeled = inputs.filter(i => {
    if (i.getAttribute('aria-label') || i.getAttribute('aria-labelledby')) return false;
    const id = i.getAttribute('id');
    if (id && doc.querySelector(`label[for="${CSS.escape(id)}"]`)) return false;
    return !i.closest('label');
  });
  if (unlabeled.length)
    add('ux', 3, `${unlabeled.length} form field${unlabeled.length>1?'s':''} without a label`, 'Placeholder text is not a label: it disappears on focus, fails contrast requirements, and is not reliably announced by screen readers.', 'Pair every field with a visible <label>.', { snippet: '<label for="email">Work email</label>\n<input id="email" type="email" autocomplete="email">', impact: 5, tags: ['a11y','conversion'], wcag: 'WCAG 3.3.2' });

  const wrongType = inputs.filter(i => i.tagName === 'INPUT' && (i.getAttribute('type')||'text') === 'text' && /email|phone|tel/i.test(i.getAttribute('placeholder')||''));
  if (wrongType.length)
    add('ux', 1, 'Email/phone fields using type="text"', 'Correct input types trigger the right mobile keyboard and enable built-in validation — a small change that meaningfully reduces form friction on mobile.', 'Use type="email" and type="tel" with autocomplete attributes.', { snippet: '<input type="email" autocomplete="email" placeholder="you@company.com">', impact: 3, tags: ['mobile','conversion'] });

  const vague = [...doc.querySelectorAll('a')].filter(a => /^(click here|here|learn more|read more|more|link)$/i.test(a.textContent.trim()));
  if (vague.length)
    add('ux', 1, `Vague link text ("${vague[0].textContent.trim()}")`, 'Screen-reader users often navigate by a list of links, where "click here" is meaningless. Descriptive links also lift SEO and scannability.', 'Make link text describe the destination.', { snippet: '<a href="signup.html">Start your free trial</a>', impact: 3, tags: ['a11y','conversion'], wcag: 'WCAG 2.4.4' });

  const emptyCtl = [...doc.querySelectorAll('button,a')].filter(el => !el.textContent.trim() && !el.getAttribute('aria-label') && !el.querySelector('img[alt]'));
  if (emptyCtl.length)
    add('ux', 3, `${emptyCtl.length} button/link with no accessible name`, 'A control with no text and no aria-label is announced as just "button" — unusable for assistive-tech users and a hard WCAG failure.', 'Add visible text or an aria-label.', { snippet: '<button type="submit">Create my account</button>', impact: 5, tags: ['a11y'], wcag: 'WCAG 4.1.2' });

  if (!doc.querySelector('meta[name="viewport"]'))
    add('ux', 2, 'Missing viewport meta tag', 'Without it, mobile browsers render the page at roughly 980px and scale it down — tiny text, horizontal panning, and pinch-zooming everywhere.', 'Add the responsive viewport tag.', { snippet: '<meta name="viewport" content="width=device-width, initial-scale=1">', impact: 5, tags: ['mobile'], effort: 'S' });

  const inlineStyleText = [...doc.querySelectorAll('[style]')].map(e => e.getAttribute('style')).join(';');
  const tiny = (css + ';' + inlineStyleText).match(/font-size:\s*(\d+(?:\.\d+)?)px/g) || [];
  const tinyVals = tiny.map(m => parseFloat(m.match(/(\d+(?:\.\d+)?)/)[1])).filter(v => v < 12);
  if (tinyVals.length)
    add('ux', 1, `Font sizes below 12px detected (${tinyVals.join('px, ')}px)`, 'Sub-12px body text is hard to read for most users and effectively unreadable for older adults or low-vision users on mobile.', 'Use a 16px base with a modular scale; never go below 12px for meaningful text.', { impact: 4, tags: ['a11y','mobile'], wcag: 'WCAG 1.4.4' });

  const contrastIssues = findContrastIssues(css, doc, opts.contrastAAA ? 7 : 4.5);
  if (contrastIssues.length) {
    const thr = opts.contrastAAA ? 7 : 4.5;
    const listed = contrastIssues.slice(0, 5).map(p => `${p.fg} on ${p.bg} at ${p.ratio}:1 (${p.where})`).join('; ');
    const first = contrastIssues[0];
    add('ux', 2,
      `Low text contrast — ${contrastIssues.length} failing color pair${contrastIssues.length > 1 ? 's' : ''}`,
      `The ${opts.contrastAAA ? 'AAA (your custom rule)' : 'AA'} requirement is ${thr}:1 for body text, and these declared pairs fall short: ${listed}${contrastIssues.length > 5 ? '; and more' : ''}. Low contrast is the most commonly reported accessibility complaint.`,
      'Darken the failing text colors (or lighten their backgrounds) until every pair passes.',
      { snippet: `/* before */ color: ${first.fg};\n/* after  */ color: #333; /* or darken until ≥ ${thr}:1 on ${first.bg} */`, impact: 4, tags: ['a11y', 'contrast'], wcag: opts.contrastAAA ? 'WCAG 1.4.6 (AAA)' : 'WCAG 1.4.3' });
  }

  const badTab = [...doc.querySelectorAll('[tabindex]')].filter(el => +el.getAttribute('tabindex') > 0);
  if (badTab.length)
    add('ux', 1, 'Positive tabindex values found', 'tabindex greater than zero hijacks natural focus order, creating unpredictable keyboard navigation that is nearly impossible to maintain.', 'Use tabindex="0" (focusable, natural order) or restructure the DOM.', { snippet: '<div id="footer" tabindex="0">…</div>', impact: 3, tags: ['a11y'], wcag: 'WCAG 2.4.3' });

  if (doc.querySelector('video[autoplay],audio[autoplay]'))
    add('ux', 2, 'Autoplaying media', 'Autoplay video and audio startles users, burns mobile data, competes with screen readers, and most browsers block it with sound anyway.', 'Require a user gesture to play; add muted and controls if it must autoplay.', { snippet: '<video src="promo.mp4" muted controls preload="metadata"></video>', impact: 4, tags: ['mobile','a11y'], wcag: 'WCAG 1.4.2' });

  const hasMarquee = doc.querySelector('marquee,blink');
  if (hasMarquee)
    add('ux', 2, 'Deprecated <marquee> element', 'Scrolling text is a usability anti-pattern: unreadable, distracting, inaccessible, and the element was deprecated decades ago.', 'Replace with static, benefit-led copy. If motion matters, use a subtle CSS animation that respects prefers-reduced-motion.', { impact: 4, tags: ['a11y','animation'] });
  const infiniteAnim = /animation:[^;]*infinite/.test(css);
  if (infiniteAnim && opts.minAnim)
    add('ux', 2, 'Infinite animation violates your minimal-animation rule', 'A looping animation was found (animation: … infinite). Your custom ruleset prioritizes minimal motion, and infinite loops are also a vestibular-disorder trigger.', 'Remove the loop or gate it behind prefers-reduced-motion.', { snippet: '@media (prefers-reduced-motion: no-preference) {\n  .banner { animation: flash 2s ease-in-out 3; }\n}', impact: 4, tags: ['animation','a11y'], wcag: 'WCAG 2.3.3' });
  else if (infiniteAnim && !/prefers-reduced-motion/.test(css))
    add('ux', 1, 'Animations ignore prefers-reduced-motion', 'Users with vestibular disorders enable "reduce motion" at the OS level; infinite animations that ignore it can cause genuine physical discomfort.', 'Wrap animations in a reduced-motion media query.', { snippet: '@media (prefers-reduced-motion: reduce) {\n  * { animation: none !important; transition: none !important; }\n}', impact: 3, tags: ['animation','a11y'], wcag: 'WCAG 2.3.3' });

  const smallBtn = /\.btn[^{]*\{[^}]*padding:\s*[0-4]px/.test(css) || /padding:\s*[0-4]px\s+[0-9]+px[^}]*font-size:\s*(?:[0-9]|1[01])px/.test(css);
  if (smallBtn)
    add('ux', 1, 'Touch targets likely below 44 by 44 pixels', 'Buttons with roughly 4px padding and 11px text land well under the 44px minimum recommended by Apple HIG and WCAG 2.5.8, causing mis-taps on mobile.', 'Increase padding and font size so interactive targets are at least 44 by 44 pixels.', { snippet: '.btn { padding: 12px 20px; font-size: 15px; min-height: 44px; }', impact: 4, tags: ['mobile','a11y'], wcag: 'WCAG 2.5.8' });

  const nodeCount = doc.querySelectorAll('*').length;
  const firstBodyLink = doc.body ? doc.body.querySelector('a') : null;
  const hasSkipLink = firstBodyLink && /^#./.test(firstBodyLink.getAttribute('href') || '');
  if (nodeCount > 60 && !hasSkipLink)
    add('ux', 0, 'No skip-to-content link', 'Keyboard users must tab through every nav item on every page. A skip link is a one-line courtesy that WCAG expects.', 'Add a visually-hidden skip link as the first focusable element.', { snippet: '<a class="skip" href="#main">Skip to content</a>', impact: 2, tags: ['a11y'], wcag: 'WCAG 2.4.1' });

  if (opts.darkMode && !/prefers-color-scheme/.test(css))
    add('ux', 2, 'No dark-mode support (violates your custom rule)', 'Your ruleset requires dark-mode support, but no prefers-color-scheme media query was found. Dark mode is table stakes for developer and Gen Z audiences.', 'Define color tokens and a dark theme via media query.', { snippet: ':root { --bg:#fff; --text:#111; }\n@media (prefers-color-scheme: dark) {\n  :root { --bg:#0b0d12; --text:#e8eaf0; }\n}', impact: 3, tags: ['polish'], effort: 'M' });

  /* ========== ENGINEERING LENS ========== */
  if (!/charset/i.test(rawHtml) && rawHtml.length > 100)
    add('dev', 1, 'Missing charset declaration', 'Without an explicit charset, browsers guess the encoding — special characters can render as mojibake, and it is a minor security hardening item.', 'Declare UTF-8 as the first element in <head>.', { snippet: '<meta charset="utf-8">', impact: 2, tags: ['correctness'] });

  const blockingScripts = [...doc.querySelectorAll('head script[src]')].filter(s => !s.defer && !s.async && !s.type?.includes('module'));
  if (blockingScripts.length)
    add('dev', 2, `${blockingScripts.length} render-blocking script${blockingScripts.length>1?'s':''} in <head>`, 'Each synchronous script in <head> halts HTML parsing until it downloads and executes — often the single biggest first-paint killer on slow connections.', 'Add defer (or async for independent scripts like analytics).', { snippet: blockingScripts.map(s => `<script src="${s.getAttribute('src')}" defer><\/script>`).join('\n'), impact: 5, tags: ['performance','mobile'], effort: 'S' });

  const noDims = imgs.filter(i => !i.getAttribute('width') && !i.getAttribute('height') && !/aspect-ratio/.test(css));
  if (noDims.length >= 2)
    add('dev', 2, `${noDims.length} images without width/height`, 'Images without intrinsic dimensions cause layout shift as they load (poor CLS) — content jumps around under the user\'s finger.', 'Set width and height attributes (or CSS aspect-ratio) so the browser reserves space.', { snippet: '<img src="shot1.png" alt="Dashboard screenshot" width="800" height="500" loading="lazy">', impact: 4, tags: ['performance','mobile'] });

  if (imgs.length >= 3 && !imgs.some(i => i.getAttribute('loading') === 'lazy'))
    add('dev', 1, 'No lazy loading on images', `${imgs.length} images all load eagerly. Below-the-fold images should be deferred, which is free with the loading attribute.`, 'Add loading="lazy" to below-the-fold images.', { snippet: '<img src="shot3.png" alt="…" loading="lazy">', impact: 3, tags: ['performance','mobile'] });

  if (/document\.write\s*\(/.test(jsClean))
    add('dev', 2, 'document.write() usage', 'document.write blocks parsing, breaks entirely when called after load, and is disallowed by many browsers on slow connections. It is a legacy API with no modern use case.', 'Build DOM nodes and append them instead.', { snippet: "const p = document.createElement('p');\np.textContent = 'loaded';\ndocument.body.append(p);", impact: 3, tags: ['correctness','performance'] });

  if (/console\.(log|debug|info)\s*\(/.test(jsClean))
    add('dev', 0, 'console.log left in production code', 'Debug logging leaks implementation details, adds noise, and in hot paths can measurably slow execution.', 'Strip logs in your build step or remove them before shipping.', { snippet: "// esbuild: drop: ['console'] · terser: drop_console: true", impact: 1, tags: ['polish'] });

  if (/\bvar\s+\w/.test(jsClean))
    add('dev', 0, 'var declarations (pre-ES6)', 'var is function-scoped and hoisted, a classic source of subtle bugs. Every modern browser supports let and const.', 'Use const by default; let when reassignment is needed.', { snippet: 'let count = 0;', impact: 1, tags: ['polish'] });

  const inlineHandlers = doc.querySelectorAll('[onclick],[onload],[onchange],[onsubmit],[onmouseover]').length;
  if (inlineHandlers)
    add('dev', 1, `${inlineHandlers} inline event handler${inlineHandlers>1?'s':''} (onclick=…)`, 'Inline handlers mix behavior into markup, break Content-Security-Policy (unsafe-inline), and are hard to test or remove.', 'Attach listeners in JS with addEventListener.', { snippet: "document.querySelector('.cta').addEventListener('click', track);", impact: 2, tags: ['security','polish'] });

  const httpRefs = [...doc.querySelectorAll('[src],[href],[action]')].filter(el =>
    ['src', 'href', 'action'].some(a => /^http:\/\//i.test(el.getAttribute(a) || ''))).length;
  if (httpRefs)
    add('dev', 3, `${httpRefs} insecure http:// reference${httpRefs>1?'s':''}`, 'Mixed content is blocked by modern browsers, and a form posting to http:// sends user data (here: signup details) in cleartext — a genuine security issue.', 'Serve every resource and endpoint over HTTPS.', { snippet: '<form action="https://api.example.com/signup" method="post">', impact: 5, tags: ['security'], effort: 'S' });

  const blankNoRel = [...doc.querySelectorAll('a[target="_blank"]')].filter(a => !/noopener|noreferrer/.test(a.getAttribute('rel') || ''));
  if (blankNoRel.length)
    add('dev', 1, 'target="_blank" without rel="noopener"', 'The opened page gets a window.opener reference to your tab — a tabnabbing phishing vector — and shares your process on some browsers.', 'Add rel="noopener" to every external _blank link.', { snippet: '<a href="https://twitter.com/app" target="_blank" rel="noopener">Twitter</a>', impact: 3, tags: ['security'] });

  const ids = [...doc.querySelectorAll('[id]')].map(e => e.id);
  const dupes = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  if (dupes.length)
    add('dev', 2, `Duplicate id${dupes.length>1?'s':''}: ${dupes.join(', ')}`, 'Duplicate IDs break getElementById, label associations, anchor links, and ARIA references — and the failures are silent.', 'Make every id unique; use classes for repeated styling hooks.', { impact: 3, tags: ['correctness','a11y'], wcag: 'WCAG 4.1.1' });

  const deprecated = ['center','font','marquee','blink','big'].filter(t => doc.querySelector(t));
  if (deprecated.length)
    add('dev', 1, `Deprecated HTML tags: <${deprecated.join('>, <')}>`, 'These elements were removed from the HTML spec; rendering is inconsistent and they signal unmaintained code to any engineer reading it.', 'Replace with semantic elements plus CSS.', { snippet: '<header class="site-header">…</header>\n/* CSS */ .site-header { text-align: center; }', impact: 2, tags: ['polish'] });

  const importantCount = (css.match(/!important/g) || []).length;
  if (importantCount >= 2)
    add('dev', 1, `${importantCount} uses of !important`, 'Heavy !important usage means the cascade is already losing — every future override gets harder, compounding tech debt.', 'Fix specificity at the source; reserve !important for utility overrides only.', { impact: 2, tags: ['polish'], effort: 'M' });

  const inlineStyles = [...doc.querySelectorAll('[style]')].length;
  if (inlineStyles >= 3)
    add('dev', 0, `${inlineStyles} elements with inline styles`, 'Inline styles defeat caching, block CSP style-src hardening, and scatter design decisions across markup.', 'Move styles into classes in your stylesheet.', { impact: 2, tags: ['polish'], effort: 'M' });

  if (!doc.querySelector('meta[name="description"]') && rawHtml.length > 200)
    add('dev', 1, 'Missing meta description', 'Search engines write their own (often bad) snippet without it. This is your one free line of ad copy in every search result.', 'Add a 150-character benefit-led description.', { snippet: '<meta name="description" content="Do stuff faster with VibeApp — the tool 12,000 teams use to ship in half the time.">', impact: 3, tags: ['seo','conversion'] });

  if (nodeCount > 1500)
    add('dev', 2, `Very large DOM (${nodeCount.toLocaleString()} nodes)`, 'DOMs beyond roughly 1,500 nodes slow style recalculation, layout, and memory usage — Lighthouse flags this directly.', 'Virtualize long lists and remove wrapper divs.', { impact: 4, tags: ['performance'], effort: 'L' });

  /* ========== GROWTH LENS ========== */
  const ctaWords = /sign\s?up|get started|start (free|trial|now)|try (it|free|now)|book a demo|join|subscribe|buy|download|create (my|your|an)? ?account/i;
  const ctas = [...doc.querySelectorAll('a,button')].filter(el => ctaWords.test(el.textContent));
  if (!ctas.length && doc.body && doc.body.textContent.trim().length > 40)
    add('gtm', 2, 'No clear call-to-action found', 'No button or link uses action language (sign up, get started, try free). Visitors who are convinced still need to be told exactly what to do next.', 'Add one primary, visually dominant CTA above the fold with benefit-led copy.', { snippet: '<a class="btn-primary" href="/signup">Start free — no credit card</a>', impact: 5, tags: ['conversion'], effort: 'S' });

  const formFields = inputs.filter(i => i.closest('form')).length;
  if (formFields >= 6)
    add('gtm', 2, `Signup form asks for ${formFields} fields`, 'Every added field cuts completion measurably — each field costs roughly 5 to 10 percent of completions. Seven fields before a user has seen any value is a conversion killer.', 'Collect email only at signup; progressive-profile the rest after activation.', { snippet: '<form method="post" action="/signup">\n  <label for="email">Work email</label>\n  <input id="email" type="email" autocomplete="email" required>\n  <button>Start free trial</button>\n</form>', impact: 5, tags: ['conversion','onboarding'], effort: 'M' });

  if (rawHtml.length > 200) {
    const ogMissing = ['og:title', 'og:description', 'og:image'].filter(p => !doc.querySelector(`meta[property="${p}"]`));
    if (ogMissing.length === 3)
      add('gtm', 1, 'No Open Graph tags — shares will look broken', 'When anyone shares your link on Slack, X, LinkedIn, or iMessage, it renders with no image and an auto-scraped title. Social sharing is a free acquisition channel you are forfeiting.', 'Add og:title, og:description, and a 1200 by 630 og:image.', { snippet: '<meta property="og:title" content="VibeApp — ship in half the time">\n<meta property="og:description" content="The tool 12,000 teams rely on.">\n<meta property="og:image" content="https://vibeapp.com/og.png">', impact: 4, tags: ['growth'] });
    else if (ogMissing.length)
      add('gtm', 1, `Open Graph incomplete — missing ${ogMissing.join(' and ')}`, 'Partial Open Graph tags still produce broken-looking shares: without og:image the link unfurls as bare text, and without og:description platforms auto-scrape whatever they find. A share card only works when all three are present.', 'Add the missing tag(s); og:image should be a 1200 by 630 PNG or JPG at an absolute URL.', { snippet: ogMissing.map(p => `<meta property="${p}" content="…">`).join('\n'), impact: 3, tags: ['growth'] });
  }

  const hasProof = /customers|users|teams|rated|reviews|trusted|testimonial|\d{2,3}%|\d+[km]?\+ /i.test(bodyText);
  if (!hasProof && bodyText.trim().length > 60)
    add('gtm', 1, 'No social proof on the page', 'No customer counts, logos, ratings, or testimonials detected. Social proof is the highest-leverage trust element for cold traffic — often worth 10 to 30 percent on conversion.', 'Add a proof strip near the primary CTA: logos, a user count, or one strong quote — real numbers only; invented proof destroys trust when discovered.', { snippet: '<p class="proof">Trusted by [your real count]+ teams · [a real customer quote]</p>', impact: 4, tags: ['conversion'], effort: 'M' });

  const valueProp = doc.querySelector('h1');
  if (valueProp && valueProp.textContent.trim().split(/\s+/).length <= 4 && /best|welcome|home/i.test(valueProp.textContent))
    add('gtm', 1, `Generic headline: "${valueProp.textContent.trim()}"`, 'Superlatives ("the best app ever") carry zero information. Visitors decide in about five seconds whether the page is for them — the headline must state who it is for and what outcome it delivers.', 'Rewrite as outcome plus audience.', { snippet: '<h1>Ship your side project twice as fast — without hiring</h1>', impact: 5, tags: ['conversion'], effort: 'S' });

  const hasAnalytics = /gtag|analytics|plausible|posthog|mixpanel|amplitude|segment|fathom/i.test(rawHtml + js);
  if (!hasAnalytics && rawHtml.length > 300)
    add('gtm', 1, 'No analytics detected — you are flying blind', 'Without measurement you cannot know your activation rate, where users drop off, or whether any change helped. Retention work starts with instrumentation.', 'Add a lightweight, privacy-friendly analytics snippet and define three core events: visit, signup, first value moment.', { snippet: "<script defer data-domain=\"vibeapp.com\" src=\"https://plausible.io/js/script.js\"><\/script>", impact: 4, tags: ['growth'], effort: 'S' });

  const urgencySpam = /limited time|act now|hurry|last chance/i.test(bodyText);
  if (urgencySpam)
    add('gtm', 1, 'False-urgency copy erodes trust', 'Generic "limited time" banners pattern-match to spam for most audiences and are a dark pattern regulators increasingly scrutinize. Trust is the currency of first-visit conversion.', 'Replace with honest, specific value; if scarcity is real, make it concrete ("Beta: 42 of 100 seats left").', { impact: 3, tags: ['conversion','trust'] });

  if (!/privacy|terms/i.test(bodyText) && formFields > 0)
    add('gtm', 0, 'Form collects data with no privacy link in sight', 'Users hesitate to hand over emails without trust signals; regulators (GDPR and CCPA) expect notice at collection.', 'Link your privacy policy near the form.', { snippet: '<small>We never share your email. <a href="/privacy">Privacy</a></small>', impact: 2, tags: ['trust','conversion'] });

  /* ---------- persona re-weighting ---------- */
  const personaBoost = {
    genz:      { mobile: 1.6, performance: 1.5, animation: 1.1, conversion: 1.2 },
    enterprise:{ security: 1.7, a11y: 1.4, trust: 1.5, polish: 1.2 },
    seniors:   { a11y: 1.8, contrast: 1.8, mobile: 1.2 },
    devs:      { performance: 1.4, correctness: 1.4, polish: 1.3, seo: .8 },
    general:   {}
  }[opts.persona] || {};
  findings.forEach(f => {
    let boost = 1;
    f.tags.forEach(t => { if (personaBoost[t]) boost = Math.max(boost, personaBoost[t]); });
    if (opts.mobileFirst && f.tags.includes('mobile')) boost = Math.max(boost, 1.5);
    f.weight = (f.sev + 1) * f.impact * boost;
    f.boosted = boost > 1.2;
  });
  findings.sort((a, b) => b.weight - a.weight || b.sev - a.sev);

  /* ---------- scores ---------- */
  const scores = computeScores(findings);

  const stats = {
    nodes: nodeCount, images: imgs.length,
    scripts: doc.querySelectorAll('script').length,
    words: bodyText.trim().split(/\s+/).filter(Boolean).length,
    kb: (new Blob([rawHtml + css + js]).size / 1024).toFixed(1)
  };
  return { findings, scores, stats };
}

/* ---------- contrast helpers ---------- */
function parseColor(s) {
  s = s.trim().toLowerCase();
  const named = { white:'#ffffff', black:'#000000', red:'#ff0000', gray:'#808080', grey:'#808080', silver:'#c0c0c0' };
  if (named[s]) s = named[s];
  let m = s.match(/^#([0-9a-f]{3})$/); if (m) s = '#' + [...m[1]].map(c => c + c).join('');
  m = s.match(/^#([0-9a-f]{6})$/);
  if (m) return [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)];
  m = s.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/); if (m) return [+m[1], +m[2], +m[3]];
  return null;
}
function luminance([r,g,b]) {
  const f = v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); };
  return .2126*f(r) + .7152*f(g) + .0722*f(b);
}
function ratio(a, b) { const [l1,l2] = [luminance(a), luminance(b)].sort((x,y)=>y-x); return (l1+.05)/(l2+.05); }
// Cross-rule contrast: resolves CSS custom properties and checks text colors
// against the page background when a rule declares no background of its own —
// the most common real-world contrast failure (e.g. a muted .hint class on a
// white body). Base-theme only: @media blocks are excluded so dark-mode
// overrides don't cross-contaminate the light-theme analysis.
function findContrastIssues(css, doc, threshold) {
  const issues = [], seen = new Set();
  const baseCss = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '');
  const rules = baseCss.match(/([^{}]+)\{([^}]*)\}/g) || [];

  // Custom properties (last definition wins), with one-level-deep resolution
  const vars = {};
  rules.forEach(r => {
    (r.split('{')[1] || '').split(';').forEach(d => {
      const m = d.match(/^\s*(--[\w-]+)\s*:\s*(.+)\s*$/);
      if (m) vars[m[1]] = m[2].trim();
    });
  });
  const resolve = (v, depth = 0) => {
    if (!v || depth > 3) return v;
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
    return m ? resolve((vars[m[1]] || m[2] || '').trim(), depth + 1) : v;
  };
  const firstVal = s => resolve(s.trim().split(/\s+/)[0]);

  // Page background: the last html/body/:root rule that declares one
  let pageBg = '#ffffff';
  rules.forEach(r => {
    const sel = (r.split('{')[0] || '').trim();
    if (!/(^|,)\s*(html|body|:root)\s*(,|$)/.test(sel)) return;
    const bg = (r.split('{')[1] || '').match(/background(?:-color)?\s*:\s*([^;}]+)/);
    if (bg && parseColor(firstVal(bg[1]))) pageBg = firstVal(bg[1]);
  });

  const scan = (block, where) => {
    const fg = block.match(/(?:^|[;{\s])color\s*:\s*([^;}]+)/);
    if (!fg) return;
    const bgm = block.match(/background(?:-color)?\s*:\s*([^;}]+)/);
    const fgv = firstVal(fg[1]);
    const bgv = bgm ? firstVal(bgm[1]) : pageBg;
    const c1 = parseColor(fgv), c2 = parseColor(bgv);
    if (!c1 || !c2) return;
    const r = ratio(c1, c2);
    const key = fgv + '|' + bgv;
    if (r < threshold && !seen.has(key)) {
      seen.add(key);
      issues.push({ ratio: r.toFixed(1), fg: fgv, bg: bgv, where: where + (bgm ? '' : ' vs page background') });
    }
  };

  rules.forEach(rule => {
    const sel = (rule.split('{')[0] || '').trim().slice(0, 40);
    if (sel.startsWith('@') || sel.startsWith('--')) return;
    scan(rule.split('{')[1] || '', `"${sel}"`);
  });
  [...doc.querySelectorAll('[style]')].forEach(el => scan(';' + (el.getAttribute('style') || ''), 'inline style'));
  return issues;
}

/* ---------- expertise skills ---------- */
state.skills = [];

const SKILL_TEMPLATES = {
  telco: { name: 'Telco BSS — Finance Collections agent', text:
`Domain: Telecom Business Support Systems (BSS) — billing, accounts receivable, dunning, and collections.

Primary user: Finance Collections agents working queues of delinquent accounts 6-8 hours a day, measured on promise-to-pay conversion, right-party contact rate, and average handle time.

Research and validate: Screens must surface account context instantly — outstanding balance, aging buckets (30/60/90+), dunning stage, last payment, dispute flags, and regulatory contact windows. Validate that workflows match collections reality: promise-to-pay capture, payment-arrangement setup, hardship flags, and escalation paths must be reachable in one or two clicks from the account view. Terminology must match industry usage (dunning, aging, write-off, PTP); mislabeled fields cause costly agent errors.

Design standards: Dense, keyboard-friendly layouts beat whitespace-heavy marketing aesthetics — agents live in tables and queues. Prioritize scan speed, status color-coding with redundant text labels, and zero data loss on navigation. Flag anything that adds clicks to high-frequency tasks.

Red flags: balance or aging data below the fold; modal-heavy flows that block queue work; missing audit trails on payment promises; consumer-style onboarding patterns aimed at the wrong user.` },
  health: { name: 'Healthcare — patient portal', text:
`Domain: Patient-facing healthcare portals — appointments, results, messaging, billing.

Primary user: Patients of all ages and abilities, often anxious, on mobile, in low-bandwidth settings. Accessibility is non-negotiable: audit to WCAG AA minimum, and treat plain-language failures as high severity — medical jargon without explanation excludes the very people the portal serves.

Research and validate: Verify that critical tasks (view results, message a clinician, pay a bill, find what to do next) are reachable within two taps of landing. Health information must never be ambiguous; validate that dates, dosages, and statuses are explicit. Privacy trust signals (HIPAA notices, clear session handling) must be visible near any data entry.

Red flags: low contrast; small touch targets; auto-logout without warning; alarming language around results without context or a next step.` },
  fintech: { name: 'Fintech — B2B analytics dashboard', text:
`Domain: B2B financial analytics — dashboards, reporting, reconciliation.

Primary user: Financial analysts and operations teams who open this product dozens of times a day and judge it on data density, accuracy cues, and export quality.

Research and validate: Numbers are the product. Validate formatting rigor — thousands separators, consistent decimal places, explicit currencies and time zones, and visible as-of timestamps on every dataset. Tables need sort, filter, and export; charts need accessible labels, not color alone. Trust erodes on the first inconsistent figure, so flag any place where totals could disagree between views.

Design standards: Information density over decoration; predictable navigation over novelty. Loading and empty states must state what is happening to the data. Audit keyboard operability throughout — power users do not reach for the mouse.` },
  ecom: { name: 'E-commerce — mobile-first shoppers', text:
`Domain: Consumer e-commerce, mobile-first.

Primary user: Shoppers on phones, often on slow connections, with seconds of patience. The majority of traffic and revenue is mobile; audit mobile behavior first and desktop second.

Research and validate: Speed is revenue — flag every render-blocking resource, unsized image, and layout shift near buy buttons. Validate the purchase path end to end: product findability, variant selection, cart persistence, guest checkout, and payment trust signals. Every extra checkout field measurably cuts conversion.

Design standards: Thumb-reachable primary actions, 44px minimum touch targets, prices and shipping costs visible before commitment. Red flags: hidden costs revealed late, forced account creation, dark-pattern urgency, and carousels hiding key products.` }
};

function renderSkills() {
  $('skilllist').innerHTML = state.skills.map((s, i) =>
    `<div class="f"><b>${esc(s.name)}</b><span>${(s.text.length/1024).toFixed(1)} KB <button type="button" class="rm" aria-label="Remove skill ${esc(s.name)}" data-action="removeSkill" data-idx="${i}">&times;</button></span></div>`).join('');
  if (!state.restoring) saveState();
}
function removeSkill(i) { state.skills.splice(i, 1); renderSkills(); }

function addTemplateSkill(sel) {
  const key = sel.value; sel.value = '';
  if (!key) return;
  const tpl = SKILL_TEMPLATES[key];
  if (state.skills.some(s => s.name === tpl.name)) { toast('That skill is already loaded.'); return; }
  state.skills.push({ ...tpl });
  renderSkills();
  track('Skill Added', { kind: 'template', name: tpl.name });
  toast('Skill loaded — the reviewer now audits as an expert in this domain.');
}

$('skillfile').addEventListener('change', function () {
  [...this.files].forEach(f => {
    const reader = new FileReader();
    reader.onload = () => {
      state.skills.push({ name: f.name, text: String(reader.result) });
      renderSkills();
      track('Skill Added', { kind: 'file' });
      toast('Skill loaded — the reviewer now audits as an expert in this domain.');
    };
    reader.readAsText(f);
  });
  this.value = '';
});

function toggleComposer(show) {
  const c = $('composer');
  const on = show !== undefined ? show : !c.classList.contains('show');
  c.classList.toggle('show', on);
  if (on) $('skilltext').focus();
}
function addCustomSkill() {
  const t = $('skilltext').value.trim();
  if (t.length < 40) { toast('Describe the domain in a little more detail — a few sentences minimum.'); return; }
  const firstLine = t.split('\n')[0].slice(0, 42);
  state.skills.push({ name: 'Custom skill — ' + firstLine + (t.length > 42 ? '…' : ''), text: t });
  $('skilltext').value = '';
  toggleComposer(false);
  renderSkills();
  track('Skill Added', { kind: 'custom' });
  toast('Skill loaded — the reviewer now audits as an expert in this domain.');
}

/* ---------- Claude AI engine ---------- */
const AI_SYSTEM = `You are UXexpert, an expert product-audit panel combining three reviewers:
- A Principal UX Designer: usability, accessibility (cite specific WCAG success criteria), information hierarchy, visual polish, micro-interactions.
- A Full-Stack Engineer: performance, correctness, security, SEO fundamentals, maintainability. Provide fixed code snippets that can be pasted in as-is.
- A Growth Strategist: onboarding friction, trust signals, conversion, retention, copywriting. Ground every recommendation in what is actually on the page.

Audit the provided web app source exhaustively. Report every issue you find, including ones you are uncertain about or consider low-severity — do not filter for importance; severity and impact scores let the reader rank them. Weight severity and impact for the stated audience, and treat any stated custom rules as hard requirements whose violations are at least high severity. Titles are one short sentence; details explain why it matters to a user or the business; fixes are concrete actions.

Calibration rules:
- Contrast: judge against WCAG AA (1.4.3 — 4.5:1 for body text, 3:1 for large text) by default. Hold to AAA (1.4.6, 7:1) only when a custom rule explicitly demands high contrast, and cite the criterion you actually applied.
- Severity: reserve "critical" for findings that block the user's primary task, create a legal or safety violation (seizure-inducing motion, data transmitted insecurely, discriminatory exclusion), or pose a security risk. Everything else is at most "high". A competently built page should produce few or no criticals — do not inflate.
- Consolidate findings that share a root cause into ONE finding listing every affected element (one palette-wide contrast problem is one finding; one form-labeling pattern is one finding). Real auditors report causes, not instances.
- Audit only what is actually in the provided source. Never report a problem on an element that is implemented correctly, and never describe elements that do not appear in the source.
- Never report that a model identifier, API parameter, package, or version "does not exist" based on your own knowledge — technology newer than your training data is common, and such findings are usually false. Flag only defects verifiable from the source itself.

When screenshots are provided, review them as rendered UI with a principal designer's eye: visual hierarchy, spacing and alignment, contrast as actually seen in the pixels, affordance clarity, consistency, and copy quality. Name the screenshot in each such finding. When both code and screenshots are provided, cross-reference them and flag mismatches between what the code promises and what the pixels show.

When expertise skills are provided, adopt them completely: they are authoritative context about the domain, the real users, and their working conditions. Research the app through that lens, validate terminology, workflows, data presentation, and compliance expectations against the skill, and judge design by the skill's standards rather than generic consumer-web taste. Findings that violate a skill's stated expectations are at least high severity.`;

const AI_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lens: { type: 'string', enum: ['ux', 'dev', 'gtm'] },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          fix: { type: 'string' },
          snippet: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          impact: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          wcag: { anyOf: [{ type: 'string' }, { type: 'null' }] }
        },
        required: ['lens', 'severity', 'title', 'detail', 'fix', 'snippet', 'effort', 'impact', 'wcag'],
        additionalProperties: false
      }
    }
  },
  required: ['findings'],
  additionalProperties: false
};

function getApiKey() {
  // Strip whitespace (including line-wraps and non-breaking spaces from copy-paste)
  const key = $('apikey').value.replace(/\s+/g, '');
  if (!key) throw new Error('Enter your Anthropic API key, or switch to the local engine.');
  if (!/^[\x21-\x7E]+$/.test(key)) throw new Error('Your API key contains hidden or non-standard characters — this usually happens when copying from a truncated display. Re-copy the full key from console.anthropic.com and paste it again.');
  if ($('rememberkey').checked) localStorage.setItem('uxexpert_api_key', key);
  else localStorage.removeItem('uxexpert_api_key');
  return key;
}

// Shared streaming call to the Anthropic API: returns the accumulated text of a
// schema-constrained response. Deep reviews legitimately run for many minutes,
// so the ceiling is 10 minutes — but a 90-second stall detector catches dead
// connections fast (a healthy run streams thinking bytes continuously).
async function claudeRequest(key, system, userContent, schema, maxTokens) {
  const controller = new AbortController();
  let abortReason = '';
  let lastByte = Date.now();
  const hardTimer = setTimeout(() => {
    abortReason = 'The review was stopped after 10 minutes — audit fewer files at once (remove some chips) and retry.';
    controller.abort();
  }, 600000);
  const stallTimer = setInterval(() => {
    if (Date.now() - lastByte > 90000) {
      abortReason = 'The connection went quiet for 90 seconds and was stopped — check your network and retry.';
      controller.abort();
    }
  }, 5000);
  const stopTimers = () => { clearTimeout(hardTimer); clearInterval(stallTimer); };

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: maxTokens,
        stream: true,
        thinking: { type: 'adaptive' },
        system,
        messages: [{ role: 'user', content: userContent }],
        output_config: { format: { type: 'json_schema', schema } }
      })
    });
  } catch (e) {
    stopTimers();
    if (e.name === 'AbortError') throw new Error(abortReason || 'The request was stopped — retry.');
    if (e instanceof TypeError) throw new Error('Could not reach the Anthropic API from this environment — the hosted demo blocks external requests; use the full site, or check your connection.');
    throw e;
  }

  if (!res.ok) {
    stopTimers();
    const err = await res.json().catch(() => null);
    if (res.status === 401) throw new Error('That API key was rejected — check it at console.anthropic.com.');
    if (res.status === 429) throw new Error('Rate limited by the Anthropic API — wait a moment and retry.');
    if (res.status === 529) throw new Error('The Anthropic API is temporarily overloaded — retry in a minute.');
    throw new Error('Anthropic API error: ' + (err?.error?.message || res.status + ' ' + res.statusText));
  }

  let text = '', stopReason = null, streamErr = null;
  try {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lastByte = Date.now();
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text;
        else if (ev.type === 'message_delta' && ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        else if (ev.type === 'error') streamErr = ev.error?.message || 'stream error';
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(abortReason || 'The request was stopped — retry.');
    throw new Error('The connection dropped mid-generation — retry.');
  } finally {
    stopTimers();
  }

  if (streamErr) throw new Error('Anthropic API error: ' + streamErr);
  if (stopReason === 'refusal') throw new Error('Claude declined to process this content.');
  if (stopReason === 'max_tokens') throw new Error('The response hit its size limit — reduce the input and retry.');
  if (!text) throw new Error('The model returned nothing — try again.');
  return text;
}

async function analyzeWithClaude(src, opts, personaLabel) {
  const key = getApiKey();

  const rules = [
    opts.contrastAAA && 'enforce WCAG AAA (7:1) contrast',
    opts.minAnim && 'prefer minimal animation',
    opts.darkMode && 'dark-mode support is required',
    opts.mobileFirst && 'apply mobile-first strictness'
  ].filter(Boolean);

  const source = (src.html
    + (src.css ? '\n\n/* ---- uploaded CSS ---- */\n' + src.css : '')
    + (src.js ? '\n\n/* ---- uploaded JS ---- */\n' + src.js : '')).slice(0, 120000);

  const skillBlock = state.skills.length
    ? '\n\nExpertise skills (authoritative domain context — audit as an expert in this domain):\n\n'
      + state.skills.map(s => `--- SKILL: ${s.name} ---\n${s.text.slice(0, 24000)}`).join('\n\n').slice(0, 60000)
    : '';

  // Multimodal content: screenshots (labeled) lead, then the text brief.
  // 16k output budget: adaptive thinking and a long findings list share
  // max_tokens, and a deep audit can truncate at 8k
  const content = [];
  state.images.forEach((im, i) => {
    content.push({ type: 'text', text: `Screenshot ${i + 1} of ${state.images.length}: ${im.name}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.dataUrl.split(',')[1] } });
  });
  content.push({
    type: 'text',
    text: `Audience to evaluate for: ${personaLabel}\nCustom rules: ${rules.join('; ') || 'none'}${skillBlock}`
      + (source ? `\n\nWeb app source to audit:\n\n${source}` : '\n\nNo code was provided — audit the screenshots.')
  });
  const text = await claudeRequest(key, AI_SYSTEM, content, AI_SCHEMA, 16000);

  const SEVN = { critical: 3, high: 2, medium: 1, low: 0 };
  const findings = JSON.parse(text).findings.map(f => ({
    lens: f.lens, sev: SEVN[f.severity] ?? 1, title: f.title, detail: f.detail, fix: f.fix,
    snippet: f.snippet || null, effort: f.effort, impact: f.impact, tags: [], wcag: f.wcag || null, boosted: false
  }));
  findings.sort((a, b) => (b.sev + 1) * b.impact - (a.sev + 1) * a.impact || b.sev - a.sev);

  const scores = computeScores(findings);

  const doc = new DOMParser().parseFromString(src.html, 'text/html');
  const stats = {
    nodes: doc.querySelectorAll('*').length,
    images: doc.querySelectorAll('img').length,
    scripts: doc.querySelectorAll('script').length,
    kb: (new Blob([src.html + src.css + src.js]).size / 1024).toFixed(1),
    shots: state.images.length
  };
  return { findings, scores, stats };
}

/* ---------- user stories (Pro) ---------- */
const STORY_SYSTEM = `You are a principal product manager turning audit findings into a development-ready backlog. Consolidate related findings into single stories (one story per root cause, not per instance). Write each story in the standard format "As a <specific user>, I want <capability>, so that <outcome>" — the user is whoever benefits (an end user of the audited product, or where appropriate the business). Acceptance criteria are 3 to 6 testable statements per story, written as Given/When/Then or verifiable checks a reviewer could confirm; include the measurable bar where one exists (contrast ratios, tap-target sizes, load behavior). Priorities: P0 for critical or task-blocking findings, P1 for high-impact improvements, P2 for polish. Effort is the implementation size (S under a day, M a few days, L a week or more). Order the backlog P0 first.`;

const STORY_SCHEMA = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          story: { type: 'string' },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          lens: { type: 'string', enum: ['ux', 'dev', 'gtm'] }
        },
        required: ['title', 'story', 'acceptance_criteria', 'priority', 'effort', 'lens'],
        additionalProperties: false
      }
    }
  },
  required: ['stories'],
  additionalProperties: false
};

async function generateStories() {
  if (!state.last) { toast('Run an audit first — stories are written from its findings.'); return; }
  let key;
  try { key = getApiKey(); }
  catch (e) {
    toast(isFounding()
      ? 'Add your Anthropic API key in step 03 to generate stories now — hosted, no-key generation for founding members is coming soon.'
      : 'User stories are a Pro capability — during beta, preview them by adding your Anthropic API key in step 03.');
    setEngine('ai');
    return;
  }
  const btn = $('storybtn');
  btn.disabled = true; btn.textContent = 'Writing stories…';
  try {
    const sevName = ['low', 'medium', 'high', 'critical'];
    const findings = state.last.result.findings.map(f =>
      ({ lens: f.lens, severity: sevName[f.sev], title: f.title, detail: f.detail, fix: f.fix }));
    const userContent =
      `Audience: ${$('persona').selectedOptions[0].textContent}\n`
      + (state.last.skills.length ? `Domain skills applied: ${state.last.skills.join('; ')}\n` : '')
      + `\nAudit findings to convert into a backlog:\n${JSON.stringify(findings, null, 1)}`;
    const text = await claudeRequest(key, STORY_SYSTEM, userContent, STORY_SCHEMA, 6000);
    state.last.stories = JSON.parse(text).stories;
    renderStories();
    track('Stories Generated', { count: state.last.stories.length });
    saveState();
    toast(isFounding()
      ? `${state.last.stories.length} user stories ready.`
      : `${state.last.stories.length} user stories ready — a Pro feature, free to preview during beta.`);
  } catch (e) { showError(e.message); }
  finally { btn.disabled = false; btn.textContent = isFounding() ? 'User stories' : 'User stories — Pro'; }
}

function renderStories() {
  const host = $('stories');
  if (!host || !state.last?.stories) return;
  const P = { P0: 'var(--red)', P1: '#B45309', P2: 'var(--slate-500)' };
  host.innerHTML = `<h3 class="storyhead">Development backlog — user stories</h3>`
    + `<p class="hitl">AI-drafted stories and acceptance criteria — a first draft for your backlog, not final scope. A product owner should review, refine, and confirm each one before it enters a sprint.</p>`
    + state.last.stories.map(s => `
      <div class="story">
        <div class="top">
          <span class="pill" style="color:${P[s.priority]};border-color:currentColor;font-weight:700">${s.priority}</span>
          <span class="pill">Effort ${s.effort}</span>
          <span class="pill">${LENS[s.lens]?.label || s.lens}</span>
        </div>
        <h4>${esc(s.title)}</h4>
        <p class="narr">${esc(s.story)}</p>
        <ul class="ac">${s.acceptance_criteria.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
      </div>`).join('')
    + `<div class="export-row" style="margin-top:12px"><button class="btn btn-quiet btn-sm" data-action="exportStories">Download backlog (Markdown)</button></div>`;
  host.style.display = 'block';
  host.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
}

function buildStoriesMarkdown() {
  let md = `# UXexpert Development Backlog\n\n_Generated from the audit of ${state.last.when} · ${state.last.stories.length} stories_\n\n> AI-drafted stories and acceptance criteria. Review, refine, and confirm each one with a product owner before it enters a sprint — treat this as a first draft, not final scope.\n\n`;
  state.last.stories.forEach((s, i) => {
    md += `## ${i + 1}. [${s.priority}] ${s.title}\n\n${s.story}\n\n**Lens:** ${LENS[s.lens]?.label || s.lens} · **Effort:** ${s.effort}\n\n**Acceptance criteria:**\n`;
    s.acceptance_criteria.forEach(a => md += `- [ ] ${a}\n`);
    md += '\n';
  });
  return md;
}
function exportStories() {
  if (!state.last?.stories) return;
  const blob = new Blob([buildStoriesMarkdown()], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'uxexpert-backlog.md'; a.click();
  URL.revokeObjectURL(a.href);
  toast('Backlog downloaded as Markdown — checkbox format pastes cleanly into Jira, Linear, and Notion.');
}

/* ---------- GitHub repo input ---------- */
async function fetchGitHubRepo(url) {
  const m = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^\/]+)\/([^\/#?]+)(?:\/(tree|blob)\/([^\/]+)(?:\/([^#?]*))?)?/);
  if (!m) throw new Error('That does not look like a GitHub repository URL.');
  const [, owner, repoRaw, kind, branchIn, sub] = m;
  const repo = repoRaw.replace(/\.git$/, '');
  const token = $('ghtoken').value.replace(/\s+/g, '');
  try { token ? sessionStorage.setItem('uxexpert_gh_token', token) : sessionStorage.removeItem('uxexpert_gh_token'); } catch (e) {}
  toast(`Fetching ${owner}/${repo} from GitHub…`);

  const gh = async path => {
    let r;
    try {
      r = await fetch(`https://api.github.com/${path}`, {
        headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: 'Bearer ' + token } : {}) }
      });
    }
    catch (e) { throw new Error('Could not reach GitHub from this environment. The hosted demo blocks external requests — use the full site, or check your connection.'); }
    if (r.status === 401) throw new Error('GitHub rejected that token — check it has repository read access and has not expired.');
    if (r.status === 403 || r.status === 429) throw new Error(token ? 'GitHub rate limit reached — wait a few minutes and retry.' : 'GitHub rate limit reached for your network (60/hour without a token) — add a GitHub token below the URL field, or wait a few minutes.');
    if (r.status === 404) throw new Error(token ? 'Repository not found — check the URL and that your token can read this repo.' : 'Repository not found. Check the URL — and for private repos, add a GitHub token below the URL field.');
    if (!r.ok) throw new Error('GitHub returned an error (' + r.status + ').');
    return r.json();
  };

  // With a token, fetch file contents through the API (works for private repos);
  // without one, the public raw endpoint is faster and spends no API quota.
  const fetchFile = async (branch, path) => {
    if (token) {
      const d = await gh(`repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
      if (!d.content) return null;
      const bytes = Uint8Array.from(atob(d.content.replace(/\n/g, '')), c => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
    return r.ok ? r.text() : null;
  };

  const branch = branchIn || (await gh(`repos/${owner}/${repo}`)).default_branch;

  // Single-file link (github.com/.../blob/branch/path)
  if (kind === 'blob' && sub) {
    const text = await fetchFile(branch, sub);
    if (text === null) throw new Error('Could not fetch that file from GitHub.');
    state.files.push({ name: sub.split('/').pop(), size: text.length, text });
    renderFiles();
    toast(`Loaded 1 file from ${owner}/${repo}.`);
    return;
  }

  const tree = await gh(`repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const EXCLUDE = /(^|\/)(node_modules|vendor|dist|build|out|coverage|third_party|\.next)\//;
  const ORDER = { html: 0, htm: 0, css: 1, js: 2 };
  const blobs = (tree.tree || []).filter(f => f.type === 'blob'
    && (!sub || f.path === sub || f.path.startsWith(sub.replace(/\/$/, '') + '/')));
  const webFiles = blobs.filter(f => /\.(html?|css|js)$/i.test(f.path));
  const candidates = webFiles
    .filter(f => !/\.(min|bundle)\.(js|css)$/i.test(f.path) && !EXCLUDE.test(f.path))
    .sort((a, b) => {
      const ea = ORDER[a.path.split('.').pop().toLowerCase()], eb = ORDER[b.path.split('.').pop().toLowerCase()];
      return ea - eb || a.path.split('/').length - b.path.split('/').length;
    });
  if (!candidates.length) {
    const hint = webFiles.length
      ? 'the only HTML/CSS/JS files are minified bundles or build output, which are excluded'
      : blobs.some(f => /\.(jsx|tsx|vue|svelte)$/i.test(f.path))
        ? 'this looks like a framework app (JSX/TSX source) — build it and audit the rendered HTML, or paste the served pages'
        : 'it contains no HTML, CSS, or JS files';
    throw new Error(`Nothing auditable in that repository — ${hint}.`);
  }

  // Keep the playground fast: up to 25 files within a ~400 KB budget
  let budget = 400000; const picked = [];
  for (const f of candidates) {
    if (picked.length >= 25) break;
    if (f.size > 120000 || f.size > budget) continue;
    budget -= f.size; picked.push(f);
  }
  if (!picked.length) throw new Error('The files in that repository are too large for the playground — paste the key pages instead.');

  const loaded = (await Promise.all(picked.map(async f => {
    const text = await fetchFile(branch, f.path).catch(() => null);
    return text !== null ? { name: f.path, size: f.size, text } : null;
  }))).filter(Boolean);
  if (!loaded.length) throw new Error('Could not download files from that repository.');

  state.files.push(...loaded);
  renderFiles();

  // Persistent accounting so "why only N files?" is answerable at a glance
  const budgetSkipped = candidates.length - loaded.length;
  const excluded = webFiles.length - candidates.length;
  const nonWeb = blobs.length - webFiles.length;
  const parts = [`Loaded ${loaded.length} of ${candidates.length} auditable file${candidates.length === 1 ? '' : 's'} from ${owner}/${repo}@${branch}`];
  if (budgetSkipped > 0) parts.push(`${budgetSkipped} skipped by the 25-file / 400 KB playground budget`);
  if (excluded > 0) parts.push(`${excluded} minified or build-output file${excluded === 1 ? '' : 's'} excluded`);
  if (nonWeb > 0) parts.push(`${nonWeb} non-HTML/CSS/JS file${nonWeb === 1 ? '' : 's'} ignored`);
  const sum = $('ghsummary');
  sum.textContent = parts.join(' · ') + '.';
  sum.style.display = 'block';

  track('GitHub Fetch', { files: loaded.length });
  toast(`Loaded ${loaded.length} file${loaded.length === 1 ? '' : 's'} from ${owner}/${repo}${budgetSkipped > 0 ? ` — ${budgetSkipped} more skipped to keep the audit fast` : ''}.`);
}

/* ---------- run + render ---------- */
async function runEvaluation() {
  let src = gatherSource();
  let url = $('url').value.trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;

  if (!src.html && !src.css && !src.js && url) {
    if (/^https?:\/\/(www\.)?github\.com\//i.test(url)) {
      try { await fetchGitHubRepo(url); } catch (e) { showError(e.message); return; }
      src = gatherSource();
    } else {
      toast('Fetching URL…');
      try {
        // URL_PROXY (set after deploying the crawler worker) fetches server-side,
        // bypassing CORS; until then, direct fetch works only for permissive sites
        const target = URL_PROXY ? URL_PROXY + '?url=' + encodeURIComponent(url) : url;
        const res = await fetch(target, { mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        src.html = await res.text();
      } catch (e) {
        showError(URL_PROXY
          ? 'Could not fetch that URL — the site may be down or blocking crawlers. Paste the page HTML or use a GitHub link instead.'
          : 'Could not fetch that URL — most sites block cross-origin requests (CORS), a browser limitation. Paste the page HTML or use a GitHub link instead.');
        return;
      }
    }
  }
  const hasShots = state.images.length > 0;
  if (!src.html && !src.css && !src.js && !hasShots) {
    // Loud and persistent: with a restored report on screen, a quiet toast here
    // reads as "the audit ran and gave the same results"
    showError(state.last
      ? `Nothing new was audited — the report below is the one generated ${state.last.when}. Code inputs are not saved between visits, so add your product again in step 01 (drop files, paste code, or a GitHub link) and run.`
      : 'Nothing to audit yet — add your product in step 01: drop files, paste code, or enter a GitHub link. Or load the sample app.');
    return;
  }
  if (hasShots && state.engine !== 'ai') {
    showError('Screenshots need the Claude AI engine — the local engine reads code, not pixels. Choose Claude AI review in step 03 (with your API key) and run again.');
    setEngine('ai');
    return;
  }

  const opts = {
    persona: $('persona').value,
    contrastAAA: $('r-contrast').checked,
    minAnim: $('r-anim').checked,
    darkMode: $('r-dark').checked,
    mobileFirst: $('r-mobile').checked
  };

  const useAI = state.engine === 'ai';
  const personaLabel = $('persona').selectedOptions[0].textContent;
  const prog = $('prog'), bar = prog.querySelector('i'), btn = $('runbtn');
  const cleanup = () => {
    clearInterval(prog._t); clearInterval(prog._tick);
    prog.style.display = 'none'; bar.style.width = '0';
    btn.disabled = false; btn.textContent = 'Run audit';
  };
  btn.disabled = true; btn.textContent = useAI ? 'Claude is reviewing…' : 'Auditing…';
  prog.style.display = 'block'; bar.style.width = '12%';
  if (useAI) {
    // creep toward 90% while the API call is in flight, with a live elapsed
    // clock — deep reviews can run several minutes and must not look frozen
    let p = 12;
    prog._t = setInterval(() => { p = Math.min(90, p + (90 - p) * 0.04); bar.style.width = p + '%'; }, 400);
    const t0 = Date.now();
    prog._tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      btn.textContent = `Claude is reviewing… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
  } else {
    await new Promise(r => setTimeout(r, 250)); bar.style.width = '55%';
  }

  let result;
  try { result = useAI ? await analyzeWithClaude(src, opts, personaLabel) : analyze(src, opts); }
  catch (e) { cleanup(); showError(e.message); return; }

  clearInterval(prog._t);
  bar.style.width = '100%';
  await new Promise(r => setTimeout(r, 250));
  cleanup();

  state.last = { result, opts, engine: state.engine, skills: state.skills.map(s => s.name), when: new Date().toLocaleString() };
  renderReport(result, opts);
  track('Audit Run', {
    engine: state.engine,
    source: state.files.length ? 'files' : (state.images.length ? 'screenshots' : (state.sampleInEditor ? 'sample' : ($('code').value.trim() ? 'paste' : 'url'))),
    skills: state.skills.length
  });
  saveState();
  toast(`Audit complete — ${result.findings.length} findings across three lenses.`);
}

const LENS = {
  ux:  { label: 'UX Design',   role: 'Principal UX Designer', color: 'var(--indigo)' },
  dev: { label: 'Engineering', role: 'Full-Stack Engineer',   color: 'var(--teal)' },
  gtm: { label: 'Growth',      role: 'Growth Strategist',     color: 'var(--emerald)' }
};
const SEVNAME = ['Low','Medium','High','Critical'];
// Text numerals use the darker text-safe variants; ring strokes and bars keep
// the bright brand colors (non-text elements are not bound by 4.5:1).
const scoreColor = s => s >= 80 ? 'var(--emerald)' : s >= 55 ? 'var(--amber)' : 'var(--red)';
const scoreTextColor = s => s >= 80 ? 'var(--emerald-text)' : s >= 55 ? 'var(--amber-text)' : 'var(--red)';

function renderReport(result, opts) {
  clearError();
  $('placeholder').hidden = true;
  const rep = $('report'); rep.hidden = false;
  const { findings, scores, stats } = result;
  const circ = 2 * Math.PI * 54;

  const personaLabel = $('persona').selectedOptions[0].textContent;
  const activeRules = ['r-contrast','r-anim','r-dark','r-mobile'].filter(id => $(id).checked).length;

  rep.innerHTML = `
    <div class="scorebar">
      <div class="ring">
        <svg aria-hidden="true" focusable="false" width="124" height="124"><circle cx="62" cy="62" r="54" fill="none" stroke="var(--line)" stroke-width="8"/>
        <circle cx="62" cy="62" r="54" fill="none" stroke="${scoreColor(scores.overall)}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - scores.overall/100)}"/></svg>
        <div class="val">${scores.overall}<small>OVERALL</small></div>
      </div>
      ${['ux','dev','gtm'].map(l => `
        <div class="lens-score"><div class="lbl">${LENS[l].label}</div>
        <div class="n" style="color:${scoreTextColor(scores[l])}">${scores[l]}</div>
        <div class="bar"><i style="width:${scores[l]}%;background:${LENS[l].color}"></i></div></div>`).join('')}
    </div>
    <p class="metaline">Audited by <b>${state.last?.engine === 'ai' ? 'Claude Opus 4.8' : 'the local engine'}</b> for <b>${esc(personaLabel)}</b> with <b>${activeRules}</b> custom rule${activeRules===1?'':'s'} and <b>${state.last?.skills.length || 0}</b> expertise skill${state.last?.skills.length===1?'':'s'} · ${stats.nodes} DOM nodes · ${stats.images} images · ${stats.scripts} scripts · ${stats.kb} KB source${stats.shots ? ` · ${stats.shots} screenshot${stats.shots > 1 ? 's' : ''}` : ''} · ${esc(state.last?.when || '')}</p>
    <p class="hitl">${state.last?.engine === 'ai' ? 'AI-assisted analysis' : 'Automated analysis'} — a starting point, not a verdict. Review, validate, and edit every finding before you act on it. You are the human in the loop; treat these as suggestions, not verified facts or professional advice.</p>
    ${!state.last?.skills.length ? `<div class="callout"><b>Make this audit domain-expert.</b> Add an expertise skill describing your industry and your real users — say, a Finance Collections agent inside a telco BSS suite — and the reviewer will research, validate, and judge design against that world instead of generic web standards. <a href="#skills-block" data-action="scrollToSkills">Add a skill</a></div>` : ''}
    <div class="tabs">
      <button class="tab active" data-lens="all" data-action="filterLens">All findings (${findings.length})</button>
      ${['ux','dev','gtm'].map(l => `<button class="tab" data-lens="${l}" data-action="filterLens">${LENS[l].label} (${findings.filter(f=>f.lens===l).length})</button>`).join('')}
    </div>
    <h3 class="sr-only">Audit findings</h3>
    <div id="findings">${findings.map(renderFinding).join('') || '<div class="empty-lens">No issues found — remarkably clean.</div>'}</div>
    ${renderPlaybook(findings)}
    <div id="stories" style="display:none"></div>
    <div class="export-row">
      <button class="btn btn-primary btn-sm" id="storybtn" data-action="generateStories">User stories — Pro</button>
      <button class="btn btn-quiet btn-sm" data-action="exportMarkdown">Download Markdown</button>
      <button class="btn btn-quiet btn-sm" data-action="copyReport">Copy report</button>
      <button class="btn btn-quiet btn-sm" data-action="comingSoon">Share link — soon</button>
    </div>`;
  applyFoundingState();
  if (!state.restoring) {
    $('auditstatus').textContent = `Audit complete: ${findings.length} findings, overall score ${scores.overall} out of 100.`;
    $('results').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }
}

function renderFinding(f, i) {
  return `<div class="finding s${f.sev}" data-lens="${f.lens}">
    <div class="top">
      <span class="sev sev-${f.sev}">${SEVNAME[f.sev]}</span>
      <span class="pill">${LENS[f.lens].role}</span>
      <span class="pill">Effort ${f.effort}</span>
      <span class="pill">Impact ${f.impact}/5</span>
      ${f.wcag ? `<span class="pill">${f.wcag}</span>` : ''}
      ${f.boosted ? `<span class="pill up">Raised for your audience</span>` : ''}
    </div>
    <h4>${i+1}. ${esc(f.title)}</h4>
    <p>${esc(f.detail)}</p>
    <div class="fix"><b>Fix</b> — ${esc(f.fix)}</div>
    ${f.snippet ? `<pre>${esc(f.snippet)}</pre>` : ''}
  </div>`;
}

function renderPlaybook(findings) {
  const conv = findings.filter(f => f.lens === 'gtm').slice(0, 3);
  const quick = findings.filter(f => f.effort === 'S' && f.sev >= 2).slice(0, 3);
  return `<div class="playbook">
    <h3 class="playhead">Growth playbook — where to start</h3>
    <ul>
      <li><b>This week (quick wins):</b> ${quick.length ? quick.map(f => esc(f.title)).join(' · ') : 'No critical quick wins — polish the medium-severity items.'}</li>
      <li><b>First A/B hypothesis:</b> ${conv[0] ? `Fixing "${esc(conv[0].title)}" — measure signup-start rate before and after.` : 'Test a benefit-led headline variant against the current one.'}</li>
      <li><b>Retention loop:</b> Instrument visit, signup, and first-value-moment events, then reach out to users who stall between the last two within 24 hours.</li>
      <li><b>Next iteration:</b> Re-run this audit after your fixes and compare the scores.</li>
    </ul>
  </div>`;
}

function filterLens(btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const lens = btn.dataset.lens;
  let shown = 0;
  document.querySelectorAll('#findings .finding').forEach(el => {
    const show = lens === 'all' || el.dataset.lens === lens;
    el.style.display = show ? '' : 'none'; if (show) shown++;
  });
  let empty = document.querySelector('#findings .empty-lens');
  if (!shown) {
    if (!empty) { empty = document.createElement('div'); empty.className = 'empty-lens'; $('findings').append(empty); }
    empty.textContent = 'No issues from this lens — nice work.'; empty.style.display = '';
  } else if (empty) empty.style.display = 'none';
}

/* ---------- exports ---------- */
function buildMarkdown() {
  const { result, opts, when } = state.last;
  const { findings, scores, stats } = result;
  let md = `# UXexpert Audit Report\n\n_Generated ${when} · engine: ${state.last.engine === 'ai' ? 'Claude Opus 4.8' : 'local'} · audience: ${$('persona').selectedOptions[0].textContent}_\n\n> ${state.last.engine === 'ai' ? 'AI-assisted' : 'Automated'} analysis — a starting point, not a verdict. Review, validate, and edit every finding before acting on it. These are suggestions, not verified facts or professional advice.\n\n`;
  if (state.last.skills.length) md += `_Expertise skills: ${state.last.skills.join(' · ')}_\n\n`;
  md += `## Scores\n\n| Lens | Score |\n|---|---|\n| **Overall** | **${scores.overall}/100** |\n| UX Design | ${scores.ux}/100 |\n| Engineering | ${scores.dev}/100 |\n| Growth | ${scores.gtm}/100 |\n\n`;
  md += `_${stats.nodes} DOM nodes · ${stats.images} images · ${stats.scripts} scripts · ${stats.kb} KB source_\n\n## Findings (${findings.length})\n\n`;
  findings.forEach((f, i) => {
    md += `### ${i+1}. [${SEVNAME[f.sev].toUpperCase()}] ${f.title}\n`;
    md += `**Lens:** ${LENS[f.lens].role} · **Effort:** ${f.effort} · **Impact:** ${f.impact}/5${f.wcag ? ' · ' + f.wcag : ''}\n\n${f.detail}\n\n**Fix:** ${f.fix}\n`;
    if (f.snippet) md += `\n\`\`\`\n${f.snippet}\n\`\`\`\n`;
    md += '\n';
  });
  if (state.last.stories?.length) md += '\n---\n\n' + buildStoriesMarkdown().split('\n').slice(2).join('\n');
  return md;
}
function exportMarkdown() {
  if (!state.last) return;
  const blob = new Blob([buildMarkdown()], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'uxexpert-report.md'; a.click();
  URL.revokeObjectURL(a.href);
  track('Export', { format: 'markdown' });
  toast('Report downloaded as Markdown.');
}
function copyReport() {
  if (!state.last) return;
  navigator.clipboard.writeText(buildMarkdown()).then(() => toast('Report copied to clipboard.'));
}

/* ---------- boot: restore the previous session ---------- */
restoreState();
updateReady();
['persona', 'r-contrast', 'r-anim', 'r-dark', 'r-mobile'].forEach(id =>
  $(id).addEventListener('change', saveState));

/* ---------- event delegation (CSP: no inline handlers) ---------- */
const ACTIONS = {
  runEvaluation, generateStories, exportStories, exportMarkdown, copyReport, clearError,
  addCustomSkill, closeWaitlist, toggleNav, loadSample, startDemo, foundingCheckout,
  foundingUnlock: () => openUnlock(), closeUnlock,
  toggleComposer: () => toggleComposer(),
  toggleComposerClose: () => toggleComposer(false),
  filterLens: (el) => filterLens(el),
  removeFile: (el) => removeFile(+el.dataset.idx),
  removeImage: (el) => removeImage(+el.dataset.idx),
  removeSkill: (el) => removeSkill(+el.dataset.idx),
  openWaitlist: (el) => openWaitlist(el.dataset.arg),
  comingSoon: () => toast('Shareable links, PDF, Jira, and Figma exports are coming soon — for now, everything stays local.'),
  browseSkillFile: () => $('skillfile').click(),
  scrollToSkills: () => document.getElementById('skills-block').scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
};
const CHANGES = {
  setEngine: (el) => setEngine(el.dataset.arg),
  addTemplateSkill: (el) => addTemplateSkill(el)
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el, e);
});
document.getElementById('wl-form').addEventListener('submit', e => { e.preventDefault(); submitWaitlist(); });
document.getElementById('unlock-form').addEventListener('submit', e => { e.preventDefault(); submitUnlock(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeUnlock(); });

// Apply any saved founding state on load (badge + de-nag the Pro-preview copy)
applyFoundingState();

// Post-checkout: /welcome/ is the primary landing, but keep the legacy home handler.
if (new URLSearchParams(location.search).get('founding') === 'success') {
  track('Founding Joined');
  toast('Welcome aboard, founding member — check your email for your founding code and receipt.');
  history.replaceState(null, '', location.pathname);
}
// Deep link from the welcome page opens the unlock prompt directly.
if (new URLSearchParams(location.search).get('unlock') === '1') {
  openUnlock();
  history.replaceState(null, '', location.pathname);
}
