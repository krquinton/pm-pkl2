import firebase from '../../firebase.js';

/* Legacy TV display, moved as-is into a module. Started once by pages/Display.jsx. */
export function startDisplay(){

const db = firebase.firestore();
let COURTS = Number(localStorage.getItem('pkl-tv-courts')) || 4;   // live from pkl-queue-session/state.courtCount (1-5)
if (COURTS < 1 || COURTS > 5) COURTS = 4;

/* Theme */
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const themeKnob = document.getElementById('themeKnob');
function applyTheme(t){ html.setAttribute('data-theme', t); themeKnob.textContent = t==='light' ? '☀️' : '🌙'; localStorage.setItem('pkl-tv-theme', t); }
applyTheme(localStorage.getItem('pkl-tv-theme') || 'dark');
themeToggle.addEventListener('click', () => applyTheme(html.getAttribute('data-theme') === 'light' ? 'dark' : 'light'));

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

let queueMatches = [];
let bucketsMap = {};
/* bucket name is shown only for buckets limited to specific courts */
function bucketTag(id){
  const b = bucketsMap[id];
  if (!b || !b.courts) return '';
  const l = b.courts.filter(c => c <= COURTS);
  return l.length && l.length < COURTS ? b.name : '';
}
db.collection('pkl-queue-buckets').onSnapshot(snap => {
  bucketsMap = {};
  snap.docs.forEach(d => { const x = d.data(); bucketsMap[d.id] = { name: x.name || '', courts: Array.isArray(x.courts) ? x.courts.map(Number) : [] }; });
  renderCourts();
  renderNextList();
}, err => console.error(err));

db.collection('pkl-queue-matches').onSnapshot(snap => {
  queueMatches = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  renderCourts();
  renderNextList();
}, err => console.error(err));

function courtBucketHtml(m){ const t = bucketTag(m.bucket); return t ? `<span class="court-bucket">${escapeHtml(t)}</span>` : ''; }
function playersHtml(team){ return `<div class="team">${team.map(p=>`<div class="p fit">${escapeHtml(p.name)}</div>`).join('')}</div>`; }

function matchBodyHtml(m){
  const n1 = m.team1.map(p => escapeHtml(p.name)).join(' &amp; ');
  const n2 = m.team2.map(p => escapeHtml(p.name)).join(' &amp; ');
  if (m.team1.length === 1 && m.team2.length === 1) {
    return `<div class="players single"><div class="oneline fit"><span class="n">${n1}</span><span class="vs">VS</span><span class="n">${n2}</span></div></div>`;
  }
  if (COURTS !== 4) {
    return `<div class="players duo"><div class="tl"><div class="p fit">${n1}</div><div class="vs">VS</div></div><div class="tl"><div class="p fit">${n2}</div></div></div>`;
  }
  return `<div class="players">${playersHtml(m.team1)}<div class="vs">VS</div>${playersHtml(m.team2)}</div>`;
}

function renderCourts(){
  const occupying = queueMatches.filter(m => m.status==='assigned' || m.status==='playing');
  for (let c=1;c<=COURTS;c++){
    const el = document.getElementById('court-'+c);
    if (!el) continue;
    const m = occupying.find(x => x.court === c);
    if (!m) {
      el.className = 'court-card';
      el.innerHTML = `
        <div class="court-num">Court ${c}<span class="court-status-pill free">Available</span></div>
        <div class="free-label">Open court</div>`;
      continue;
    }
    const body = matchBodyHtml(m);
    if (m.status === 'playing'){
      el.className = 'court-card playing';
      el.innerHTML = `
        <div class="court-num"><span>Court ${c}${courtBucketHtml(m)}</span><span class="court-status-pill playing">Playing</span></div>
        ${body}
        <div class="timer" data-started="${m.startedAt}">00:00</div>`;
    } else {
      el.className = 'court-card assigned';
      el.innerHTML = `
        <div class="court-num"><span>Court ${c}${courtBucketHtml(m)}</span><span class="court-status-pill assigned">Getting ready</span></div>
        ${body}
        <div class="ready-note">Please proceed to the court</div>`;
    }
  }
  updateTimers();
  fitAll();
}
function updateTimers(){
  document.querySelectorAll('.timer').forEach(el => {
    const started = Number(el.dataset.started);
    if (!started) return;
    const secs = Math.max(0, Math.floor((Date.now() - started) / 1000));
    el.textContent = `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
  });
}
setInterval(updateTimers, 1000);

const NEXT_SLOTS = 6;
function renderNextList(){
  const list = queueMatches.filter(m => m.status === 'waiting' || m.status === 'onhold').sort((a,b) => a.order - b.order).slice(0, NEXT_SLOTS);
  const el = document.getElementById('nextList');
  let html = '';
  for (let i=0;i<NEXT_SLOTS;i++){
    const m = list[i];
    if (!m) {
      html += `<div class="next-item empty"><div class="pos">${i+1}</div><div class="info"><div class="empty-text">—</div></div></div>`;
      continue;
    }
    html += `
    <div class="next-item${m.status === 'onhold' ? ' onhold' : ''}">
      <div class="pos">${i+1}</div>
      <div class="info">
        <div class="tline fit">${escapeHtml(m.team1.map(p=>p.name).join(' & '))}</div>
        <div class="tline b fit"><span>VS</span>${escapeHtml(m.team2.map(p=>p.name).join(' & '))}</div>
      </div>
      ${(bucketTag(m.bucket) || m.status === 'onhold') ? `<div class="side">${bucketTag(m.bucket) ? `<div class="bucket-sm">${escapeHtml(bucketTag(m.bucket))}</div>` : ''}${m.status === 'onhold' ? '<div class="hold-tag">(On Hold)</div>' : ''}</div>` : ''}
    </div>`;
  }
  el.innerHTML = html;
  fitAll();
}

/* shrink text only when a name would overflow its line, so long names stay fully visible */
function fitAll(){
  requestAnimationFrame(() => {
    document.querySelectorAll('.fit').forEach(el => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      let guard = 0;
      while (el.scrollWidth > el.clientWidth + 1 && size > 14 && guard < 120) {
        size -= 1; el.style.fontSize = size + 'px'; guard++;
      }
    });
    /* both team lines of a stacked doubles card share the smaller size so they look even */
    document.querySelectorAll('.players.duo').forEach(card => {
      const ps = [...card.querySelectorAll('.p.fit')];
      if (ps.length < 2) return;
      const min = Math.min(...ps.map(p => parseFloat(getComputedStyle(p).fontSize)));
      ps.forEach(p => { p.style.fontSize = min + 'px'; });
    });
  });
}
window.addEventListener('resize', fitAll);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

/* Session name (center of the header) */
db.collection('pkl-queue-session').doc('state').onSnapshot(doc => {
  const d = doc.exists ? doc.data() : {};
  const cc = Number(d.courtCount);
  const n = (cc >= 1 && cc <= 5) ? Math.floor(cc) : 4;
  if (n !== COURTS) { COURTS = n; localStorage.setItem('pkl-tv-courts', String(n)); buildLayout(); }
  const name = d.currentSessionName || '';
  document.getElementById('sessionTitle').textContent = name;
  document.getElementById('sessionSep').style.display = name ? '' : 'none';
  document.title = name ? name + ' — PickleManage' : 'PickleManage';
}, err => console.error(err));

/* Display settings from the admin: show/hide the queue, leaderboard popup */
let displaySettings = {};
db.collection('pkl-queue-events').doc('displaySettings').onSnapshot(doc => {
  displaySettings = doc.exists ? doc.data() : {};
  applyDisplaySettings();
}, err => console.error(err));
function applyDisplaySettings(){
  const showQueue = displaySettings.showQueue !== false;
  document.body.classList.toggle('no-queue', !showQueue);
  renderLeaderboardPopup();
  fitAll();
  setTimeout(fitAll, 150);
}
function renderLeaderboardPopup(){
  const ov = document.getElementById('lbOverlay');
  const lb = displaySettings.leaderboard;
  if (!lb || !lb.show) { ov.classList.remove('show'); return; }
  const buckets = (lb.buckets || []).slice(0, 3);
  document.getElementById('lbSub').textContent = (lb.sessionName ? lb.sessionName + ' · ' : '') + 'Top 5 per bucket';
  const cols = document.getElementById('lbCols');
  cols.style.gridTemplateColumns = `repeat(${Math.max(1, buckets.length)}, 1fr)`;
  cols.innerHTML = buckets.map(b => `
    <div class="lb-col">
      <h3>${escapeHtml(b.name)}</h3>
      ${(b.rows && b.rows.length) ? b.rows.map(r => `
        <div class="lb-row">
          <div class="lb-rank">${r.rank}</div>
          <div class="lb-name fit">${escapeHtml(r.name)}</div>
          <div class="lb-stat"><b>${r.w}</b> W<br>${r.pf} pts</div>
        </div>`).join('') : `<div class="lb-empty">No results yet</div>`}
    </div>`).join('');
  ov.classList.add('show');
  fitAll();
}

/* TV events: call players / winner popups */
let eventsInitialized = false;
let lastEventId = null;
db.collection('pkl-queue-events').orderBy('createdAt','desc').limit(1).onSnapshot(snap => {
  if (snap.empty) { eventsInitialized = true; return; }
  const doc = snap.docs[0];
  const data = doc.data();
  if (!data.createdAt) return; // still-pending serverTimestamp write; wait for the confirmed snapshot
  if (!eventsInitialized) { eventsInitialized = true; lastEventId = doc.id; return; }
  if (doc.id === lastEventId) return;
  lastEventId = doc.id;
  const ageMs = Date.now() - data.createdAt.toMillis();
  if (ageMs > 15000) return;
  if (data.type === 'call') showCallPopup(data);
  else if (data.type === 'winner') showWinnerPopup(data);
}, err => console.error(err));

function showCallPopup(data){
  const t1 = data.team1.join(' & ');
  const t2 = data.team2.join(' & ');
  document.getElementById('callCourt').textContent = `Court ${data.court}`;
  document.getElementById('callTeams').innerHTML = `${escapeHtml(t1)}<br><span style="color:var(--muted);font-size:.6em;">vs</span><br>${escapeHtml(t2)}`;
  const ov = document.getElementById('callOverlay');
  ov.classList.add('show');
  setTimeout(() => ov.classList.remove('show'), 5000);
}
function showWinnerPopup(data){
  const t1 = data.team1.join(' & ');
  const t2 = data.team2.join(' & ');
  const winnerNames = data.winner === 'team1' ? t1 : t2;
  document.getElementById('winnerCourt').textContent = `Court ${data.court}`;
  document.getElementById('winnerTeams').innerHTML = `${escapeHtml(t1)} <span style="color:var(--muted);font-size:.5em;">vs</span> ${escapeHtml(t2)}`;
  document.getElementById('winnerScore').textContent = `${data.score1} – ${data.score2}`;
  document.getElementById('winnerName').textContent = winnerNames;
  const ov = document.getElementById('winnerOverlay');
  ov.classList.add('show');
  setTimeout(() => ov.classList.remove('show'), 5000);
}

/* Layout: exactly 4 courts keeps the 2 x 2 grid with the queue in the middle.
   Any other count stacks the courts in ONE column and moves the queue to the far right. */
function buildLayout(){
  const main = document.getElementById('mainGrid');
  const n = COURTS;
  const card = c => `<div class="court-card" id="court-${c}"></div>`;
  const queue = `<div class="col center-col"><div class="center-title">Up Next</div><div class="next-list" id="nextList"></div></div>`;
  document.body.classList.toggle('stacked', n !== 4);
  document.body.setAttribute('data-courts', String(n));
  if (n === 4) {
    main.innerHTML = `<div class="col courts">${card(1)}${card(2)}</div>${queue}<div class="col courts">${card(3)}${card(4)}</div>`;
  } else {
    main.innerHTML = `<div class="col courts stack" style="grid-template-rows:repeat(${n},minmax(0,1fr))">${Array.from({length:n},(_,i)=>card(i+1)).join('')}</div>${queue}`;
  }
  renderCourts();
  renderNextList();
}
buildLayout();

}
