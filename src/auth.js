export const SUPER_EMAIL = 'ton.quinton@gmail.com';
export const EMAIL_DOMAIN = '@picklemanage.app';   // usernames become username@picklemanage.app behind the scenes
export const USER_RE = /^[a-z0-9._-]{3,30}$/;

/* Pages are separate documents (hard navigation), exactly like the old multi-page version. */
export const go = path => window.location.replace(path);

export function isGoogleSuper(u){
  return !!u && (u.email || '').toLowerCase() === SUPER_EMAIL && u.emailVerified === true && u.providerData.some(p => p.providerId === 'google.com');
}
export function licenseOk(d){
  return !!d && d.active === true && !(d.validUntil && d.validUntil.toMillis && d.validUntil.toMillis() < Date.now());
}
export function licenseReason(d){
  return d && d.active === true && d.validUntil && d.validUntil.toMillis && d.validUntil.toMillis() < Date.now() ? 'expired' : 'license';
}
