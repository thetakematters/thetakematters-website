// Sign-in and database for /move and /jobs (from 19 Nov 2026): the "portland-move" Neon database.
// Sign-in: an emailed 6-digit code, through this site's own /api/auth doorway (api/auth.js), so one
// sign-in covers both pages. Data: Neon's Data API, which speaks the same language as Supabase's, so
// the pages keep their supabase-js .from(...) calls; each call carries the sign-in pass (a JWT that
// lasts about 15 minutes, renewed after 10). Only emails on move_editors see anything.
// Needs supabase-js loaded first.
window.NeonMove = (function () {
  var DATA = 'https://ep-solitary-art-ar5f2fop.apirest.c-4.us-west-2.aws.neon.tech/neondb';
  var pass = null, passAt = 0;
  // Right after a pass is issued, Neon sometimes answers the first requests as if the person weren't on the list (seen
  // 19 Nov 2026 on the lab and the scripts; on this page, a trip once showed no items). So a new pass is used only once
  // three checks at once can see its own line on the list (about 10 seconds at most), and an empty answer soon after is
  // checked again (guarded, below). Copied from the lab's neon-labs.js.
  var settled = null, settling = null, settledAt = 0;
  async function probe(t) {
    try {
      var r = await fetch(DATA + '/rest/v1/move_editors?select=email', { headers: { authorization: 'Bearer ' + t, accept: 'application/json' } });
      return r.ok && (await r.json()).length > 0;
    } catch (e) { return false; }
  }
  async function settle(t) {
    if (settled === t) return t;
    if (settling && settling.t === t) return settling.p;
    var p = (async function () {
      for (var i = 0; i < 8; i++) {
        var ok = await Promise.all([probe(t), probe(t), probe(t)]);
        if (ok.every(Boolean)) break;
        await new Promise(function (ok2) { setTimeout(ok2, 1500); });
      }
      settled = t;
      settledAt = Date.now();
      return t;
    })();
    settling = { t: t, p: p };
    return p;
  }

  async function auth(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: { accept: 'application/json' } };
    if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var r = await fetch('/api/auth/' + path, opts);
    var data = null;
    try { data = await r.json(); } catch (e) { /* empty answer */ }
    return { ok: r.ok, status: r.status, data: data, jwt: r.headers.get('set-auth-jwt') };
  }
  function problem(r, fallback) {
    var m = r.data && (r.data.message || r.data.error);
    return new Error(typeof m === 'string' && m ? m : fallback);
  }

  // the signed-in person ({email, ...}) or null; also picks up a fresh pass
  async function session() {
    var r = await auth('GET', 'get-session');
    if (r.ok && r.data && r.data.user) {
      if (r.jwt) { pass = r.jwt; passAt = Date.now(); }
      return r.data.user;
    }
    pass = null;
    return null;
  }
  async function token() {
    if (pass && Date.now() - passAt < 10 * 60 * 1000) return settle(pass);
    await session();
    return pass ? settle(pass) : pass;
  }
  async function sendCode(email) {
    var r = await auth('POST', 'email-otp/send-verification-otp', { email: email, type: 'sign-in' });
    if (!r.ok) throw problem(r, 'The code could not be sent. Try again in a minute.');
  }
  async function signIn(email, code) {
    var r = await auth('POST', 'sign-in/email-otp', { email: email, otp: String(code).replace(/\s+/g, '') });
    if (!r.ok) throw problem(r, 'That code didn’t work. Check it, or ask for a new one.');
    pass = null;
    var user = await session();
    if (!user) throw new Error('Signed in, but the session didn’t stick. Reload the page and try again.');
    return user;
  }
  async function signOut() {
    pass = null;
    await auth('POST', 'sign-out', {});
  }
  // A read that comes back empty in the first minute and a half after a new pass is asked once more at once, together
  // with a quick check that the pass can see its own line on the list. If the pass works and the answer is still empty,
  // the list really is empty and the page goes on without waiting; only when the pass isn't working yet does it wait a
  // second and a half and try again, up to four times. (19 Nov 2026: the first version waited six seconds on every list
  // that really is empty, which made the lab slow to load.)
  function passOf(init) {
    try {
      var a = new Headers(init && init.headers).get('authorization') || '';
      return a.indexOf('Bearer ') === 0 ? a.slice(7) : null;
    } catch (e) { return null; }
  }
  async function isEmpty(r) { return r.status === 200 && (await r.clone().text()).trim() === '[]'; }
  async function guarded(input, init) {
    var r = await fetch(input, init);
    var method = (init && init.method) || 'GET';
    if (method !== 'GET' || !settledAt || Date.now() - settledAt > 90000 || !(await isEmpty(r))) return r;
    var t = passOf(init);
    for (var i = 0; i < 4; i++) {
      var both = await Promise.all([fetch(input, init), t ? probe(t) : Promise.resolve(true)]);
      if (!(await isEmpty(both[0])) || both[1]) return both[0];
      await new Promise(function (ok) { setTimeout(ok, 1500); });
    }
    return r;
  }
  function client() {
    if (!window.supabase) return null;
    return window.supabase.createClient(DATA, 'neon-data-api', { accessToken: token, global: { fetch: guarded } });
  }

  return { session: session, sendCode: sendCode, signIn: signIn, signOut: signOut, client: client };
})();
