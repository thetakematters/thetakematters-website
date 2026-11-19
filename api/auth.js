// /api/auth/<path>: this site's own doorway to the sign-in service of the "portland-move" database
// (Neon's managed Better Auth), so the sign-in cookie belongs to thetakematters.com: Safari blocks
// cookies set by another site. Copied from the Musician Pay Tracker's doorway (19 Nov 2026).
// Passes requests through as they are. Stores and logs nothing.
// (vercel.json rewrites /api/auth/<path> to /api/auth?path=<path>.)
const AUTH = 'https://ep-solitary-art-ar5f2fop.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth';
const AUTH_ORIGIN = AUTH.split('/').slice(0, 3).join('/');
const SITE = ['https://www.thetakematters.com', 'https://thetakematters.com'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'get_or_post_only' });
  // a sign-in, sign-out or code request only from this site's own pages. This check is the guard
  // against other sites, so the sign-in service is then given its own address as the origin.
  if (req.method === 'POST' && !SITE.includes(req.headers.origin)) return res.status(403).json({ error: 'not_from_the_site' });
  const path = String(req.query.path || '');
  if (!/^[A-Za-z0-9._\/-]+$/.test(path) || path.includes('..')) return res.status(400).json({ error: 'bad_path' });

  const query = new URL(req.url, SITE[0]).searchParams;
  query.delete('path');
  const headers = { accept: req.headers.accept || 'application/json' };
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.method === 'POST') { headers['content-type'] = 'application/json'; headers.origin = AUTH_ORIGIN; }
  let up;
  try {
    up = await fetch(AUTH + '/' + path + (String(query) ? '?' + query : ''), {
      method: req.method, headers, redirect: 'manual',
      body: req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined
    });
  } catch (e) {
    return res.status(502).json({ error: 'sign_in_unreachable' });
  }
  // cookies come back as this site's own (any Domain= for the service's address is dropped)
  const cookies = up.headers.getSetCookie();
  if (cookies.length) res.setHeader('Set-Cookie', cookies.map(function (c) { return c.replace(/;\s*Domain=[^;]*/i, ''); }));
  ['content-type', 'location', 'set-auth-jwt'].forEach(function (h) { const v = up.headers.get(h); if (v) res.setHeader(h, v); });
  return res.status(up.status).send(Buffer.from(await up.arrayBuffer()));
}
