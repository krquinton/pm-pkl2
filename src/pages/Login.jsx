import { useEffect, useRef, useState } from 'react';
import firebase, { auth, fs } from '../firebase.js';
import { EMAIL_DOMAIN, SUPER_EMAIL, USER_RE, go } from '../auth.js';
import './login.css';

export default function Login(){
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alertBox, setAlertBox] = useState(null);   // { kind, title, text }
  const routing = useRef(false);

  useEffect(() => {
    document.title = 'PickleManage · Log in';
    const r = new URLSearchParams(window.location.search).get('reason');
    if (r === 'expired') setAlertBox({ kind:'warn', title:'License has expired', text:'Your license is not valid anymore. Please contact your administrator.' });
    else if (r === 'license') setAlertBox({ kind:'warn', title:'License is not valid', text:'Your account is not active. Please contact your administrator.' });
    const unsub = auth.onAuthStateChanged(u => { if (u) route(u); });
    return unsub;
  }, []);

  async function deny(kind, title, text){
    routing.current = true;
    try { await auth.signOut(); } catch (e) {}
    routing.current = false; setBusy(false);
    setAlertBox({ kind, title, text });
  }
  async function route(user){
    if (routing.current) return;
    routing.current = true; setBusy(true);
    try {
      const isGoogle = user.providerData.some(p => p.providerId === 'google.com');
      if (isGoogle) {
        if ((user.email || '').toLowerCase() === SUPER_EMAIL && user.emailVerified) { go('/superadmin'); return; }
        routing.current = false; return deny('err', 'Not authorized', 'This Google account is not allowed to use PickleManage.');
      }
      const snap = await fs.collection('pm-users').doc(user.uid).get();
      const d = snap.exists ? snap.data() : null;
      if (!d || d.active !== true) { routing.current = false; return deny('err', 'License is not valid', 'Your account is not active. Please contact your administrator.'); }
      if (d.validUntil && d.validUntil.toMillis && d.validUntil.toMillis() < Date.now()) { routing.current = false; return deny('warn', 'License has expired', 'Your license is not valid anymore. Please contact your administrator.'); }
      go(d.role === 'superadmin' ? '/superadmin' : '/app');
    } catch (err) {
      routing.current = false;
      if (err && err.code === 'permission-denied') return deny('err', 'License is not valid', 'Your account is not active. Please contact your administrator.');
      return deny('err', 'Could not verify your account', 'Check your internet connection and try again.');
    }
  }

  async function submit(e){
    e.preventDefault(); setAlertBox(null);
    const u = username.trim().toLowerCase();
    if (!u || !password) { setAlertBox({ kind:'err', title:'', text:'Enter your username and password.' }); return; }
    if (!USER_RE.test(u)) { setAlertBox({ kind:'err', title:'', text:'Incorrect username or password.' }); return; }
    setBusy(true);
    try { await auth.signInWithEmailAndPassword(u + EMAIL_DOMAIN, password); }   // success continues in onAuthStateChanged
    catch (err) {
      setBusy(false);
      const c = err && err.code;
      if (c === 'auth/too-many-requests') setAlertBox({ kind:'warn', title:'Too many attempts', text:'Please wait a few minutes and try again.' });
      else if (c === 'auth/network-request-failed') setAlertBox({ kind:'err', title:'No connection', text:'Check your internet connection and try again.' });
      else if (c === 'auth/operation-not-allowed') setAlertBox({ kind:'err', title:'Setup needed', text:'Email/Password sign-in is not enabled in Firebase yet.' });
      else setAlertBox({ kind:'err', title:'', text:'Incorrect username or password.' });
    }
  }
  async function google(){
    setAlertBox(null); setBusy(true);
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch (err) {
      setBusy(false);
      const c = err && err.code;
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return;
      if (c === 'auth/popup-blocked') setAlertBox({ kind:'warn', title:'Pop-up blocked', text:'Allow pop-ups for this page, then try again.' });
      else if (c === 'auth/unauthorized-domain') setAlertBox({ kind:'err', title:'Setup needed', text:'Add this website’s domain under Firebase → Authentication → Settings → Authorized domains.' });
      else if (c === 'auth/operation-not-allowed') setAlertBox({ kind:'err', title:'Setup needed', text:'Google sign-in is not enabled in Firebase yet.' });
      else setAlertBox({ kind:'err', title:'Google sign-in failed', text:'Please try again.' });
    }
  }

  return (
    <>
      <section className="brand">
        <svg className="court" viewBox="0 0 600 880" fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" aria-hidden="true">
          <rect x="30" y="30" width="540" height="820" rx="6" />
          <line x1="30" y1="440" x2="570" y2="440" strokeWidth="10" />
          <line x1="30" y1="270" x2="570" y2="270" />
          <line x1="30" y1="610" x2="570" y2="610" />
          <line x1="300" y1="30" x2="300" y2="270" />
          <line x1="300" y1="610" x2="300" y2="850" />
        </svg>
        <div>
          <div className="logo-card"><img src="/pklbox-logo.png" alt="PKL Box" /></div>
          <h1 className="display">Ready to<br />play?</h1>
          <p className="lead">Run your events and tournaments like a pro. Queue matches, rotate courts and track every score, all in one place.</p>
          <div className="tag"><i></i>Play More, Manage Less</div>
        </div>
        <footer>© 2026 PickleManageOS. All rights reserved.</footer>
      </section>

      <section className="panel">
        <div className="form">
          <div className="wordmark"><img src="/pklbox-logo.png" alt="" /><span>Pickle<b>Manage</b>OS</span></div>
          <h2>Welcome back!</h2>
          <p className="sub">Accounts are created and activated by your administrator. Don’t have one yet? Reach out to get set up.</p>

          <form onSubmit={submit} autoComplete="on" noValidate>
            <div className="field"><input type="text" name="username" placeholder="Username" autoComplete="username" autoCapitalize="none" spellCheck="false" autoFocus value={username} onChange={e => setUsername(e.target.value)} /></div>
            <div className="field"><input type={showPw ? 'text' : 'password'} name="password" placeholder="Password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" className="eye" title="Show / hide password" aria-label="Show or hide password" onClick={() => setShowPw(v => !v)}>{showPw ? '🙈' : '👁'}</button></div>
            <button type="submit" className={'btn btn-main' + (busy ? ' loading' : '')} disabled={busy}><span className="spin"></span><span>{busy ? 'Signing in…' : 'Log in'}</span></button>
            <div className="or">or</div>
            <button type="button" className="btn btn-google" disabled={busy} onClick={google}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.3-4 6.8-9.9 6.8-17.1z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.6 2.2-8.7 2.2-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
              <span>Login with Google</span>
            </button>
          </form>

          {alertBox && <div className={'alert show ' + alertBox.kind} role="alert">{alertBox.title ? <b>{alertBox.title}</b> : null}<span>{alertBox.text}</span></div>}
          <div className="help">Forgot your password? <strong>Contact your administrator.</strong></div>
        </div>
      </section>
    </>
  );
}
