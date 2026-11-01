import { useEffect, useRef, useState } from 'react';
import { auth, fs } from './firebase.js';
import { go, isGoogleSuper, licenseOk, licenseReason } from './auth.js';
import './gate.css';

/* Blocks the page until the user is signed in with a valid license.
   need="super" additionally requires the superadmin role (club users are sent to /app).
   children receives { user, profile, isSuper, logout }. */
export default function AuthGate({ need = 'club', children }){
  const [ctx, setCtx] = useState(null);
  const [msg, setMsg] = useState('Checking your license…');
  const [failed, setFailed] = useState(false);
  const bouncing = useRef(false);

  useEffect(() => {
    let unsubProfile = null, profile = null;
    const logout = () => { bouncing.current = true; auth.signOut().catch(() => {}).then(() => go('/login')); };
    const bounce = d => {
      if (bouncing.current) return; bouncing.current = true;
      if (unsubProfile) { try { unsubProfile(); } catch (e) {} }
      auth.signOut().catch(() => {}).then(() => go('/login?reason=' + licenseReason(d)));
    };
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (bouncing.current) return;
      if (!user) { go('/login'); return; }
      if (unsubProfile) { try { unsubProfile(); } catch (e) {} unsubProfile = null; }
      if (isGoogleSuper(user)) { setCtx({ user, profile: { displayName: 'Superadmin' }, isSuper: true, logout }); return; }
      unsubProfile = fs.collection('pm-users').doc(user.uid).onSnapshot(snap => {
        const d = snap.exists ? snap.data() : null;
        if (!d && snap.metadata.fromCache) { setMsg('Waiting for a connection to verify your license…'); return; }
        profile = d;
        if (!licenseOk(d)) { bounce(d); return; }
        const isSuper = d.role === 'superadmin';
        if (need === 'super' && !isSuper) { bouncing.current = true; go('/app'); return; }
        setCtx(prev => prev && prev.user.uid === user.uid && prev.isSuper === isSuper ? prev : { user, profile: d, isSuper, logout });
      }, err => {
        if (err && err.code === 'permission-denied') bounce(null);
        else { setFailed(true); setMsg("Can't verify your account. Check your internet connection and refresh."); }
      });
    });
    const timer = setInterval(() => { if (profile && !licenseOk(profile)) bounce(profile); }, 60000);   // expiry while signed in
    return () => { unsubAuth(); if (unsubProfile) unsubProfile(); clearInterval(timer); };
  }, [need]);

  if (!ctx) return (
    <div className="pm-gate"><div className="pm-gate-box">
      {!failed && <div className="pm-spin" />}
      <div>{msg}</div>
      {failed && <a className="pm-gate-back" href="/login">Back to login</a>}
    </div></div>
  );
  return children(ctx);
}
