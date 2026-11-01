import { useEffect, useMemo, useRef, useState } from 'react';
import firebase, { fs, firebaseConfig } from '../firebase.js';
import AuthGate from '../AuthGate.jsx';
import { EMAIL_DOMAIN, USER_RE } from '../auth.js';
import './superadmin.css';

const COL = 'pm-users';
const FV = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp;
const STATUS_TXT = { active:'Active', inactive:'Inactive', expired:'Expired' };

function statusOf(u){
  if (u.active !== true) return 'inactive';
  if (u.validUntil && u.validUntil.toMillis && u.validUntil.toMillis() < Date.now()) return 'expired';
  return 'active';
}
function fmtDate(ts){ try { return ts && ts.toDate ? ts.toDate().toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' }) : '—'; } catch (e) { return '—'; } }
function dateInputValue(ts){
  if (!ts || !ts.toDate) return '';
  const d = ts.toDate(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/* A second Firebase app creates the login, so the superadmin stays signed in on the main one. */
async function createLogin(username, password){
  const app = firebase.initializeApp(firebaseConfig, 'pm-create-' + Date.now());
  try {
    const a = app.auth();
    try { return (await a.createUserWithEmailAndPassword(username + EMAIL_DOMAIN, password)).user.uid; }
    catch (err) {
      if (err.code !== 'auth/email-already-in-use') throw err;
      try { return (await a.signInWithEmailAndPassword(username + EMAIL_DOMAIN, password)).user.uid; }   // earlier attempt stopped half way
      catch (e2) { const x = new Error('That username is already taken.'); x.code = 'pm/taken'; throw x; }
    } finally { try { await a.signOut(); } catch (e) {} }
  } finally { try { await app.delete(); } catch (e) {} }
}

function Dashboard({ ctx }){
  const [users, setUsers] = useState([]);
  const [, tick] = useState(0);
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('pkl-theme') || 'light');
  const [toastMsg, setToastMsg] = useState({ text:'', err:false, show:false });
  const toastT = useRef(null);
  const blank = { name:'', user:'', pass:'', role:'club', until:'', active:true };
  const [form, setForm] = useState(blank);
  const [addMsg, setAddMsg] = useState({ kind:'', text:'' });
  const [adding, setAdding] = useState(false);

  useEffect(() => { document.title = 'PickleManage · Superadmin'; }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('pkl-theme', theme); }, [theme]);
  useEffect(() => {
    const unsub = fs.collection(COL).orderBy('createdAt', 'desc').onSnapshot(
      snap => setUsers(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
      err => toast('Could not load accounts: ' + err.message, true));
    const t = setInterval(() => tick(n => n + 1), 60000);   // keeps "Expired" up to date
    return () => { unsub(); clearInterval(t); };
  }, []);

  function toast(text, err){ setToastMsg({ text, err: !!err, show:true }); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(m => ({ ...m, show:false })), 3200); }

  const stats = useMemo(() => {
    const st = users.map(statusOf);
    return { total: users.length, active: st.filter(x => x === 'active').length, inactive: st.filter(x => x === 'inactive').length, expired: st.filter(x => x === 'expired').length };
  }, [users, toastMsg]);
  const q = search.trim().toLowerCase();
  const list = users.filter(u => !q || (u.displayName || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q));

  async function toggleActive(u){
    const next = u.active !== true;
    if (!next && !window.confirm(`Deactivate ${u.displayName || u.username}? They will no longer be able to log in.`)) return;
    try { await fs.collection(COL).doc(u.id).update({ active: next, updatedAt: FV.serverTimestamp() }); toast(next ? 'Account activated.' : 'Account deactivated.'); }
    catch (err) { toast('Could not update: ' + err.message, true); }
  }
  async function setValidUntil(u, val){
    try {
      const ts = val ? TS.fromDate(new Date(val + 'T23:59:59')) : null;   // valid through the end of that day (local time)
      await fs.collection(COL).doc(u.id).update({ validUntil: ts, updatedAt: FV.serverTimestamp() });
      toast(val ? 'Validity date saved.' : 'Expiry removed.');
    } catch (err) { toast('Could not update: ' + err.message, true); }
  }
  async function renameUser(u){
    const name = (window.prompt('Name', u.displayName || u.username) || '').trim();
    if (!name || name === u.displayName) return;
    try { await fs.collection(COL).doc(u.id).update({ displayName: name, updatedAt: FV.serverTimestamp() }); toast('Name updated.'); }
    catch (err) { toast('Could not update: ' + err.message, true); }
  }
  function genPass(){
    const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', a = new Uint32Array(10);
    crypto.getRandomValues(a);
    setForm(f => ({ ...f, pass: Array.from(a, n => abc[n % abc.length]).join('') }));
  }
  async function addAccount(e){
    e.preventDefault(); setAddMsg({ kind:'', text:'' });
    const name = form.name.trim(), username = form.user.trim().toLowerCase(), password = form.pass;
    if (!name) return setAddMsg({ kind:'err', text:'Enter a name.' });
    if (!USER_RE.test(username)) return setAddMsg({ kind:'err', text:'Username must be 3–30 characters: a–z, 0–9, dot, dash or underscore.' });
    if (password.length < 6) return setAddMsg({ kind:'err', text:'Password must be at least 6 characters.' });
    if (users.some(u => (u.username || '').toLowerCase() === username)) return setAddMsg({ kind:'err', text:'That username already exists.' });
    setAdding(true); setAddMsg({ kind:'', text:'Creating…' });
    try {
      const uid = await createLogin(username, password);
      if (users.some(u => u.id === uid)) throw Object.assign(new Error('That username is already taken.'), { code:'pm/taken' });
      await fs.collection(COL).doc(uid).set({
        displayName: name, username, role: form.role, active: form.active,
        validUntil: form.until ? TS.fromDate(new Date(form.until + 'T23:59:59')) : null,
        createdAt: FV.serverTimestamp(), createdBy: ctx.user.email || ctx.user.uid
      });
      setAddMsg({ kind:'ok', text:`Account “${username}” created${form.active ? ' and activated' : ' (inactive)'}. Give them the username and password.` });
      setForm(blank);
    } catch (err) {
      const c = err && err.code;
      if (c === 'pm/taken') setAddMsg({ kind:'err', text:'That username is already taken. Pick another one.' });
      else if (c === 'auth/weak-password') setAddMsg({ kind:'err', text:'Password is too weak. Use at least 6 characters.' });
      else if (c === 'auth/operation-not-allowed') setAddMsg({ kind:'err', text:'Enable Email/Password sign-in in Firebase → Authentication → Sign-in method.' });
      else if (c === 'permission-denied') setAddMsg({ kind:'err', text:'Firestore rules blocked this. Publish the provided firestore.rules.' });
      else setAddMsg({ kind:'err', text:'Could not create the account: ' + (err.message || err) });
    } finally { setAdding(false); }
  }

  const who = ctx.user.email && !ctx.profile.username ? `Superadmin (${ctx.user.email})` : `${ctx.profile.displayName || ctx.profile.username} (superadmin)`;
  const f = k => e => setForm(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <>
      <header className="top">
        <img src="/pklbox-logo.png" alt="PKL Box" onError={e => { e.currentTarget.style.display = "none"; }} />
        <div><h1>PickleManage</h1><div className="sub">Superadmin · accounts &amp; licenses</div></div>
        <div className="top-actions">
          <span className="who">👤 {who}</span>
          <a className="btn-top" href="/app" title="Open the queue / DUPR admin">▶ Open admin app</a>
          <button className="btn-top" onClick={ctx.logout}>⎋ Log out</button>
          <div className="toggle-pill" title="Toggle light/dark mode" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}><div className="knob">{theme === 'dark' ? '🌙' : '☀️'}</div></div>
        </div>
      </header>

      <main>
        <div className="tiles">
          <div className="tile"><div className="l">Accounts</div><div className="v">{stats.total}</div></div>
          <div className="tile"><div className="l">Active</div><div className="v" style={{ color:'#2e9e5b' }}>{stats.active}</div></div>
          <div className="tile"><div className="l">Inactive</div><div className="v">{stats.inactive}</div></div>
          <div className="tile"><div className="l">Expired</div><div className="v" style={{ color:'var(--orange)' }}>{stats.expired}</div></div>
        </div>

        <section className="card">
          <div className="card-head"><h3>Add account</h3></div>
          <div className="card-body">
            <form onSubmit={addAccount} autoComplete="off" noValidate>
              <div className="grid">
                <div className="field"><label>Name (club / person)</label><input type="text" maxLength="60" placeholder="e.g. PKL Box" value={form.name} onChange={f('name')} /></div>
                <div className="field"><label>Username</label><input type="text" maxLength="30" placeholder="e.g. pklbox" autoCapitalize="none" spellCheck="false" value={form.user} onChange={f('user')} />
                  <span className="hint">3–30 characters: a–z, 0–9, dot, dash, underscore.</span></div>
                <div className="field"><label>Password / passcode</label>
                  <div className="pw-wrap"><input type="text" maxLength="60" placeholder="min. 6 characters" autoComplete="new-password" value={form.pass} onChange={f('pass')} /><button type="button" className="btn btn-ghost" title="Generate a random passcode" onClick={genPass}>🎲</button></div>
                  <span className="hint">Copy it before saving. It can’t be shown again.</span></div>
                <div className="field"><label>Role</label><select value={form.role} onChange={f('role')}><option value="club">Club user</option><option value="superadmin">Superadmin</option></select></div>
                <div className="field"><label>Valid until (optional)</label><input type="date" value={form.until} onChange={f('until')} /></div>
                <label className="check"><input type="checkbox" checked={form.active} onChange={f('active')} /> Activate now</label>
              </div>
              <div style={{ marginTop:14, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={adding}>＋ Create account</button>
              </div>
              <div className={'msg ' + addMsg.kind}>{addMsg.text}</div>
            </form>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>Accounts</h3><input className="search" type="search" placeholder="Search name or username…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>License</th><th>Valid until</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {list.length ? list.map(u => {
                  const s = statusOf(u), mine = ctx.user.uid === u.id;
                  return (
                    <tr key={u.id}>
                      <td><b>{u.displayName || u.username}</b>{mine ? <span className="you">(you)</span> : null}</td>
                      <td className="username">{u.username}</td>
                      <td><span className="badge role">{u.role === 'superadmin' ? 'Superadmin' : 'Club user'}</span></td>
                      <td><span className={'badge ' + s}>{STATUS_TXT[s]}</span></td>
                      <td><div className="row-actions"><input type="date" defaultValue={dateInputValue(u.validUntil)} key={u.id + dateInputValue(u.validUntil)} onChange={e => setValidUntil(u, e.target.value)} title="Leave empty for no expiry" />
                        {u.validUntil ? <button className="btn btn-ghost btn-sm" title="Remove the expiry date" onClick={() => setValidUntil(u, '')}>✕</button> : <span className="note">no expiry</span>}</div></td>
                      <td>{fmtDate(u.createdAt)}</td>
                      <td><div className="row-actions">
                        <button className={'btn btn-sm ' + (u.active === true ? 'btn-danger' : 'btn-primary')} disabled={mine} title={mine ? 'You can’t deactivate your own account' : undefined} onClick={() => toggleActive(u)}>{u.active === true ? 'Deactivate' : 'Activate'}</button>
                        <button className="btn btn-ghost btn-sm" title="Rename" onClick={() => renameUser(u)}>✎</button>
                      </div></td>
                    </tr>);
                }) : <tr><td colSpan="7" className="empty">{users.length ? 'No match.' : 'No accounts yet. Add the first one above.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card-body note">
            <b>Inactive</b> or <b>expired</b> accounts can’t log in and see “License is not valid”. If they are signed in at that moment, they are sent back to the login page within a minute.
            A forgotten password can’t be reset from here (Spark plan): create a new username and deactivate the old one.
          </div>
        </section>
      </main>
      <div className={'toast' + (toastMsg.show ? ' show' : '') + (toastMsg.err ? ' error' : '')}>{toastMsg.text}</div>
    </>
  );
}

export default function Superadmin(){
  return <AuthGate need="super">{ctx => <Dashboard ctx={ctx} />}</AuthGate>;
}
