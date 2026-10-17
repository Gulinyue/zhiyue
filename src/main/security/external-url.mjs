const portalBase = 'https://github.com';

export function validatedPortalUrl(raw, allowedBase = portalBase) {
  if (typeof raw !== 'string' || raw.length > 4096) throw new Error('PORTAL_URL_INVALID');
  const target = new URL(raw);
  const base = new URL(allowedBase);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (target.origin !== base.origin || target.username || target.password || (target.protocol !== 'https:' && !(local && target.protocol === 'http:'))) {
    throw new Error('PORTAL_URL_NOT_ALLOWED');
  }
  return target.href;
}
