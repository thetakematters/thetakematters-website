// Sign-in and database for /move and /jobs (from 19 Nov 2026): the "portland-move" Neon database.
// Sign-in: an emailed 6-digit code, through this site's own /api/auth doorway (api/auth.js), so one
// sign-in covers both pages. Data: Neon's Data API, which speaks the same language as Supabase's, so
// the pages keep their supabase-js .from(...) calls; each call carries the sign-in pass (a JWT that
// lasts about 15 minutes, renewed after 10). Only emails on move_editors see anything.
// Needs supabase-js loaded first.
window.NeonMove = (function () {
  var DATA = 'https://ep-solitary-art-ar5f2fop.apirest.c-4.us-west-2.aws.neon.tech/neondb';
  // The pass is kept in this browser while it is less than 10 minutes old, so another page or a reload uses the same pass
  // instead of a new one. Neon answers a brand-new pass unreliably for its first half minute or so (measured 19 Nov 2026:
  // a pass in use for a while answered 100 requests in 100 right; new ones sent back the odd empty answer), and before this
  // every page load started with a brand-new pass.
  var KEEP = 'neon.pass';
  function kept(uid) {
    try {
      var k = JSON.parse(localStorage.getItem(KEEP) || 'null');
      return k && k.uid === uid && k.jwt && Date.now() - k.at < 10 * 60 * 1000 ? k : null;
    } catch (e) { return null; }
  }
  function keep(uid) { try { localStorage.setItem(KEEP, JSON.stringify({ uid: uid, jwt: pass, at: passAt })); } catch (e) {} }
  function forget() { try { localStorage.removeItem(KEEP); } catch (e) {} }
  var pass = null, passAt = 0;

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
      var k = kept(r.data.user.id);
      if (k) { pass = k.jwt; passAt = k.at; }
      else if (r.jwt) { pass = r.jwt; passAt = Date.now(); keep(r.data.user.id); }
      return r.data.user;
    }
    pass = null; forget();
    return null;
  }
  async function token() {
    if (pass && Date.now() - passAt < 10 * 60 * 1000) return pass;
    await session();
    return pass;
  }
  async function sendCode(email) {
    var r = await auth('POST', 'email-otp/send-verification-otp', { email: email, type: 'sign-in' });
    if (!r.ok) throw problem(r, 'The code could not be sent. Try again in a minute.');
  }
  async function signIn(email, code) {
    var r = await auth('POST', 'sign-in/email-otp', { email: email, otp: String(code).replace(/\s+/g, '') });
    if (!r.ok) throw problem(r, 'That code didn’t work. Check it, or ask for a new one.');
    pass = null; forget();
    var user = await session();
    if (!user) throw new Error('Signed in, but the session didn’t stick. Reload the page and try again.');
    return user;
  }
  async function signOut() {
    pass = null; forget();
    await auth('POST', 'sign-out', {});
  }
  // Neon sometimes answers a request as if the person weren't signed in (measured 19 Nov 2026: one to five requests in a
  // hundred, at any time, not only just after signing in, and a quick check of the list can pass at the same moment): a
  // read comes back empty, a change is refused or changes nothing. So such an answer is asked again, twice, a fifth of a
  // second apart, and only then does it stand; in a pass's first 40 seconds, when such answers come in runs, four times,
  // further apart (0.3, 0.6, 1 and 1.5 seconds). A list that really is empty costs a few quick extra requests; asking a
  // change again is safe, since it changes the same rows to the same values.
  async function suspect(r, init) {
    var method = String((init && init.method) || 'GET').toUpperCase();
    if (r.status === 401 || r.status === 403) return true;
    if (method === 'HEAD') return /\/0$/.test(r.headers.get('content-range') || '');
    if (method === 'GET' && r.status === 406) return true;
    if (r.status !== 200 || method === 'POST' && !/\/rpc\//.test(String(r.url || ''))) return false;
    return (await r.clone().text()).trim() === '[]';
  }
  async function guarded(input, init) {
    var r = await fetch(input, init);
    var waits = passAt && Date.now() - passAt < 40000 ? [300, 600, 1000, 1500] : [200, 200];
    for (var i = 0; i < waits.length && (await suspect(r, init)); i++) {
      await new Promise(function (ok) { setTimeout(ok, waits[i]); });
      r = await fetch(input, init);
    }
    return r;
  }
  function client() {
    if (!window.supabase) return null;
    return window.supabase.createClient(DATA, 'neon-data-api', { accessToken: token, global: { fetch: guarded } });
  }

  return { session: session, sendCode: sendCode, signIn: signIn, signOut: signOut, client: client };
})();
