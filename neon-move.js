// Sign-in and database for /move and /jobs (from 19 Nov 2026): the "portland-move" Neon database.
// Sign-in: an emailed 6-digit code, through this site's own /api/auth doorway (api/auth.js), so one
// sign-in covers both pages. Data: Neon's Data API, which speaks the same language as Supabase's, so
// the pages keep their supabase-js .from(...) calls; each call carries the sign-in pass (a JWT that
// lasts about 15 minutes, renewed after 10). Only emails on move_editors see anything.
// Needs supabase-js loaded first.
window.NeonMove = (function () {
  var DATA = 'https://ep-solitary-art-ar5f2fop.apirest.c-4.us-west-2.aws.neon.tech/neondb';
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
      if (r.jwt) { pass = r.jwt; passAt = Date.now(); }
      return r.data.user;
    }
    pass = null;
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
    pass = null;
    var user = await session();
    if (!user) throw new Error('Signed in, but the session didn’t stick. Reload the page and try again.');
    return user;
  }
  async function signOut() {
    pass = null;
    await auth('POST', 'sign-out', {});
  }
  function client() {
    if (!window.supabase) return null;
    return window.supabase.createClient(DATA, 'neon-data-api', { accessToken: token });
  }

  return { session: session, sendCode: sendCode, signIn: signIn, signOut: signOut, client: client };
})();
