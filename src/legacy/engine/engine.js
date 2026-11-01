import firebase from '../../firebase.js';
import { bridge } from '../../engine/bridge.js';   // feeds the React tabs (Leaderboard, Logs)

/* Legacy queue / DUPR engine, moved as-is into a module. Started once by pages/Engine.jsx after the markup is mounted. */
export function startEngine(ctx){
  /* inline on*="..." handlers in the markup call these by name */
  window['addAllSuggestions'] = addAllSuggestions;
  window['addPool'] = addPool;
  window['addRoundToQueue'] = addRoundToQueue;
  window['addSuggestionToQueue'] = addSuggestionToQueue;
  window['backToQueue'] = backToQueue;
  window['callPlayers'] = callPlayers;
  window['clearBucketParticipants'] = clearBucketParticipants;
  window['clearPools'] = clearPools;
  window['deleteBucket'] = deleteBucket;
  window['deleteLog'] = deleteLog;
  window['deleteQueueMatch'] = deleteQueueMatch;
  window['deleteSnapshot'] = deleteSnapshot;
  window['discardSuggestions'] = discardSuggestions;
  window['dismissDuplicate'] = dismissDuplicate;
  window['holdMatch'] = holdMatch;
  window['moveBucket'] = moveBucket;
  window['moveQueueMatch'] = moveQueueMatch;
  window['openAddModal'] = openAddModal;
  window['openBucketModal'] = openBucketModal;
  window['openCourtModal'] = openCourtModal;
  window['openCustomMatchModal'] = openCustomMatchModal;
  window['openEditQueueModal'] = openEditQueueModal;
  window['openEndModal'] = openEndModal;
  window['openGenerateModal'] = openGenerateModal;
  window['openLogEditModal'] = openLogEditModal;
  window['openPairModal'] = openPairModal;
  window['openRandomizePools'] = openRandomizePools;
  window['openRenameModal'] = openRenameModal;
  window['openReplaceModal'] = openReplaceModal;
  window['openSnapshotView'] = openSnapshotView;
  window['removeParticipant'] = removeParticipant;
  window['removePool'] = removePool;
  window['renamePool'] = renamePool;
  window['resetTimer'] = resetTimer;
  window['restoreSnapshot'] = restoreSnapshot;
  window['resumeMatch'] = resumeMatch;
  window['setGender'] = setGender;
  window['setParticipantPool'] = setParticipantPool;
  window['startGame'] = startGame;
  window['swapPair'] = swapPair;
  window['swapSlot'] = swapSlot;
  window['toggleRest'] = toggleRest;
  window['unpairPlayers'] = unpairPlayers;

  /* account chip, superadmin link and logout come from the React auth gate */
  window.PM = ctx;
  const _u = document.getElementById('pmUser');
  const _p = ctx.profile || {};
  if (_u) _u.textContent = '👤 ' + (_p.displayName || _p.username || ctx.user.displayName || ctx.user.email || '');
  if (ctx.isSuper) { const sa = document.getElementById('btnPmSuper'); if (sa) sa.style.display = ''; }
  document.getElementById('btnLogout').addEventListener('click', () => { if (confirm('Log out of PickleManage?')) ctx.logout(); });


/* ================= Firebase ================= */
/* firebase app + Firestore settings are initialised by the login gate (bottom of this file) */
const db = firebase.firestore();
const MAX_COURTS = 5;
let COURTS = 4;   // number of courts for the current session (1-5), stored on pkl-queue-session/state.courtCount
const BUCKET_COLOR = 'var(--blue)';
let BUCKETS = [];            // live from Firestore: { key:docId, label:name, mode:'singles'|'doubles', size:2|4, color }
let bucketsLoaded = false;
const LEGACY_BUCKET_LABELS = { singles:'Singles', fun:'Fun Mode (Low)', competitive:'Competitive Mode (High)' };
function allCourtsList(n){ return Array.from({ length: n === undefined ? COURTS : n }, (_, i) => i + 1); }
function bucketCourts(key){
  const b = BUCKETS.find(x => x.key === key);
  const list = b && b.courts ? b.courts.filter(c => c <= COURTS) : [];
  return list.length ? list : allCourtsList();
}
function bucketAllowsCourt(key, court){ return bucketCourts(key).includes(Number(court)); }
function bucketHasSpecificCourts(b){ if (!b || !b.courts) return false; const l = b.courts.filter(c => c <= COURTS); return l.length > 0 && l.length < COURTS; }
function freeCourtsFor(key){
  const busy = new Set(queueMatches.filter(m => COURT_BUSY_STATUSES.includes(m.status)).map(m => m.court));
  return bucketCourts(key).filter(c => !busy.has(c)).length;
}
function bucketSize(key){ const b = BUCKETS.find(x => x.key === key); return b ? b.size : 4; }
function normMode(v){ return v === 'singles' ? 'singles' : (v === 'fixed' ? 'fixed' : (v === 'mixed' ? 'mixed' : (v === 'team' ? 'team' : 'doubles'))); }
function modeLabel(m){ return m === 'singles' ? 'Singles' : (m === 'fixed' ? 'Doubles · Fixed Partner' : (m === 'mixed' ? 'Mixed Doubles' : (m === 'team' ? 'Doubles · Team Name' : 'Doubles'))); }
function modeTagHtml(b){
  if (!b || !b.mode) return '';
  let h = `<span class="mode-tag">${modeLabel(b.mode)}</span>`;
  if (bucketHasSpecificCourts(b)) { const l = b.courts.filter(c => c <= COURTS); h += `<span class="mode-tag">Court${l.length===1?'':'s'} ${l.join(', ')}</span>`; }
  return h;
}
let lastQueueOrder = 0;
function nextQueueOrder(){
  const mx = Math.max(Date.now(), lastQueueOrder, ...queueMatches.map(m => Number(m.order) || 0));
  lastQueueOrder = mx + 1;
  return lastQueueOrder;
}
const COURT_BUSY_STATUSES = ['assigned','playing'];
const QUEUE_MATCH_STATUSES = ['waiting','onhold','assigned','playing'];

/* ================= Theme ================= */
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const themeKnob = document.getElementById('themeKnob');
function applyTheme(t){ html.setAttribute('data-theme', t); themeKnob.textContent = t==='dark' ? '🌙' : '☀️'; localStorage.setItem('pkl-theme', t); }
applyTheme(localStorage.getItem('pkl-theme') || 'light');
themeToggle.addEventListener('click', () => applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

/* ================= Tabs ================= */
document.querySelectorAll('nav.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

/* ================= Toast / helpers ================= */
let toastTimer = null;
function showToast(msg, isError){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function setsEqual(a,b){ if(a.size!==b.size) return false; for(const x of a) if(!b.has(x)) return false; return true; }
function formatDuration(totalSeconds){
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  if (h>0) return `${h}h ${m}m`;
  if (m>0) return `${m}m`;
  return `${s}s`;
}
function refKeyFor(p){
  if (p.refKey) return p.refKey;   // kept stable when a guest is renamed so stats/leaderboard history stays together
  return p.sourceType === 'member' ? ('m_' + p.memberId) : ('g_' + (p.name||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_'));
}

/* ================= DUPR helpers ================= */
function parseDupr(raw){
  const v = (raw || '').trim();
  if (v.toUpperCase() === 'NR') return { ok:true, raw:'NR', value:3.0 };
  const num = parseFloat(v);
  if (isNaN(num) || !/^\d+(\.\d+)?$/.test(v) || num < 2 || num > 6) return { ok:false, error:'Enter NR or a number 2.000–6.000' };
  const rounded = Math.round(num * 1000) / 1000;
  return { ok:true, raw: rounded.toFixed(3), value: rounded };
}
function fmtNum(n){ return (Math.round(n*1000)/1000).toFixed(3); }
/* ================= Live data caches ================= */
let participants = [];
let queueMatches = [];
let logs = [];
let sessionsList = [];
let statsCache = {};
let sessionState = { matchCounter:0, partnerCounts:{}, opponentCounts:{} };
let logFilterSessionId = '';
let sessionEnsureAttempted = false;


db.collection('pkl-queue-buckets').onSnapshot(snap => {
  BUCKETS = snap.docs.map(d => {
    const x = d.data(), mode = normMode(x.mode);
    return { key:d.id, label:x.name || 'Category', mode, size: (mode === 'singles' || mode === 'team') ? 2 : 4, color: BUCKET_COLOR, createdAtMs: x.createdAtMs || 0,
      order: (x.order !== undefined && x.order !== null) ? Number(x.order) : (x.createdAtMs || 0),
      courts: (Array.isArray(x.courts) ? x.courts.map(Number).filter(c => c >= 1 && c <= MAX_COURTS) : []).sort((a,b) => a-b),
      pools: Array.isArray(x.pools) ? x.pools.filter(q => q && q.id).map(q => ({ id:String(q.id), name:String(q.name || 'Pool') })) : [] };
  }).sort((a,b) => a.order - b.order || a.createdAtMs - b.createdAtMs);
  bucketsLoaded = true;
  bridge.set('buckets', BUCKETS);
  Object.keys(suggestionState).forEach(k => { if (!BUCKETS.some(b => b.key === k)) delete suggestionState[k]; });
  renderParticipants();
  renderMatchupBuckets();
  renderQueueList();
  renderCourts();
  renderLogBucketFilter();
  renderLogs();
  renderLeaderboard();
  refreshGenList();
  scheduleLeaderboardPush();
}, err => showToast('Categories sync error: ' + err.message, true));

db.collection('pkl-queue-participants').onSnapshot(snap => {
  participants = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  computeDuplicates();
  renderParticipants();
  updateMatchupPoolCounts();
  refreshGenList();
}, err => showToast('Participants sync error: ' + err.message, true));

db.collection('pkl-queue-matches').onSnapshot(snap => {
  queueMatches = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  renderCourts();
  renderQueueList();
  renderParticipants();
  refreshGenList();
}, err => showToast('Queue sync error: ' + err.message, true));

db.collection('pkl-queue-logs').orderBy('completedAt','desc').limit(2000).onSnapshot(snap => {
  logs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  bridge.set('logs', logs);
  renderLogs();
  renderLeaderboard();
  refreshGenList();
  scheduleLeaderboardPush();
}, err => showToast('Logs sync error: ' + err.message, true));

db.collection('pkl-queue-stats').onSnapshot(snap => { statsCache = {}; snap.docs.forEach(d => { statsCache[d.id] = d.data(); }); });

db.collection('pkl-queue-sessions').orderBy('createdAt','desc').onSnapshot(snap => {
  sessionsList = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  bridge.set('sessions', sessionsList);
  renderSessionFilterOptions();
}, err => showToast('Sessions sync error: ' + err.message, true));

db.collection('pkl-queue-session').doc('state').onSnapshot(doc => {
  sessionState = doc.exists ? doc.data() : {};
  bridge.set('session', sessionState);
  const cc = Number(sessionState.courtCount);
  const newCourts = (cc >= 1 && cc <= MAX_COURTS) ? Math.floor(cc) : 4;
  const courtsChanged = newCourts !== COURTS;
  COURTS = newCourts;
  updateSessionLabel();
  updateCourtsButtons();
  renderCourts();
  renderQueueList();
  if (courtsChanged) { renderParticipants(); renderMatchupBuckets(); refreshGenList(); }
  if (!sessionState.currentSessionId && !sessionEnsureAttempted) { sessionEnsureAttempted = true; ensureDefaultSession(); }
});

async function ensureDefaultSession(){
  try {
    const name = 'Session 1';
    const date = new Date().toISOString().slice(0,10);
    const sessRef = await db.collection('pkl-queue-sessions').add({ name, date, eventName: name, location:'', scoreType:'SIDEOUT', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('pkl-queue-session').doc('state').set({
      matchCounter:0, partnerCounts:{}, opponentCounts:{},
      currentSessionId: sessRef.id, currentSessionName: name, currentSessionDate: date
    }, { merge:true });
  } catch(err){ /* best effort */ }
}
function updateSessionLabel(){
  if (typeof renderLogs === 'function') renderLogs();
  if (typeof renderLeaderboard === 'function') renderLeaderboard();
  if (typeof updateExportTargetLabel === 'function') updateExportTargetLabel();
  const el = document.getElementById('sessionLabel');
  el.textContent = sessionState.currentSessionName
    ? `Session: ${sessionState.currentSessionName} (${sessionState.currentSessionDate||''})${sessionState.sessionEndedAt ? ' · ENDED' : ''}`
    : 'Starting session…';
  const eb = document.getElementById('btnEndSession');
  if (eb) eb.textContent = sessionState.sessionEndedAt ? '📊 Session recap' : '⏹ End session';
}

/* ================= Status + elapsed-time tracking (per session) ================= */
const STATUS_LABELS = { active:'Available', queued:'On queue', playing:'Playing', resting:'Resting' };
function playingIds(){
  const ids = new Set();
  queueMatches.forEach(m => { if (m.status === 'playing') [...m.team1, ...m.team2].forEach(e => ids.add(e.participantId)); });
  return ids;
}
function statusKey(p, pIds){
  if (p.status === 'resting') return 'resting';
  if (p.status === 'queued') return (pIds || playingIds()).has(p.id) ? 'playing' : 'queued';
  return 'active';
}
function timeCategory(p){ const k = statusKey(p); return k === 'resting' ? 'resting' : (k === 'playing' ? 'playing' : 'waiting'); }
function statDocId(refKey, sessionId){ return `${sessionId || sessionState.currentSessionId || 'none'}__${refKey}`; }
function courtsActive(){ return !!sessionState.courtsActiveAt; }
/* Timers only count after "Activate Courts (ALL)". Returns the moment counting began for this player's current status. */
function effSince(p){ const act = Number(sessionState.courtsActiveAt) || 0; if (!act) return null; return Math.max(Number(p.statusSince) || act, act); }
function elapsedWrite(p){
  if (!p) return null;
  const since = effSince(p);
  if (!since) return null;
  const elapsed = Math.max(0, Math.round((Date.now() - since) / 1000));
  if (elapsed <= 0) return null;
  const field = { waiting:'totalWaitingSeconds', playing:'totalPlayingSeconds', resting:'totalRestingSeconds' }[timeCategory(p)];
  return { ref: db.collection('pkl-queue-stats').doc(statDocId(refKeyFor(p))),
           data: { name: p.name, sessionId: sessionState.currentSessionId || null, [field]: firebase.firestore.FieldValue.increment(elapsed) } };
}
async function flushElapsed(p){
  const w = elapsedWrite(p);
  if (!w) return;
  try { await w.ref.set(w.data, { merge:true }); }
  catch(err){ /* best effort */ }
}
function participantOf(entry){ return participants.find(x => x.id === (entry.participantId || entry.id)); }

/* ================= PARTICIPANTS ================= */
function bucketLabel(key, fallback){ const b = BUCKETS.find(x => x.key === key); return b ? b.label : (fallback || LEGACY_BUCKET_LABELS[key] || 'Removed category'); }
function bucketLabelHtml(key, fallback){ return escapeHtml(bucketLabel(key, fallback)); }
function logBucketName(l){ return bucketLabel(l.bucket, l.bucketName); }

/* ---- Sync indicator (pending local writes / offline) ---- */
const syncState = { p:false, m:false };
function updateSyncChip(){
  const chip = document.getElementById('syncChip');
  const offline = !navigator.onLine, pending = syncState.p || syncState.m;
  if (!offline && !pending) { chip.style.display = 'none'; return; }
  chip.style.display = '';
  chip.className = 'sync-chip ' + (offline ? 'off' : 'busy');
  chip.textContent = offline ? '⚠ Offline · changes will sync' : '⟳ Syncing…';
}
[['pkl-queue-participants','p'], ['pkl-queue-matches','m']].forEach(([col, k]) =>
  db.collection(col).onSnapshot({ includeMetadataChanges:true }, snap => { syncState[k] = snap.metadata.hasPendingWrites; updateSyncChip(); }, () => {}));
window.addEventListener('online', updateSyncChip);
window.addEventListener('offline', updateSyncChip);

/* ---- Duplicate players (same name or same DUPR ID); flagged players are kept out of matchmaking ---- */
function normName(n){ return (n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function normId(i){ return (i || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
let dupInfo = {};
function computeDuplicates(){
  dupInfo = {};
  participants.forEach(p => {
    const nk = normName(p.name), ik = normId(p.duprId);
    const others = participants.filter(q => q.id !== p.id && ((nk && normName(q.name) === nk) || (ik && normId(q.duprId) === ik)));
    if (others.length && !p.dupDismissed) dupInfo[p.id] = others;
  });
}
function isDuplicate(p){ return !!(p && dupInfo[p.id]); }
function dupTitle(p){ return 'Same name or DUPR ID as: ' + (dupInfo[p.id] || []).map(o => `${o.name} (${bucketLabel(o.bucket)})`).join(', '); }
async function dismissDuplicate(pid){
  const p = participants.find(x => x.id === pid);
  if (!p || !dupInfo[pid]) return;
  const group = [p, ...dupInfo[pid]];
  if (!confirm(`Mark ${group.map(x => x.name).join(', ')} as NOT duplicates? They will become available for matches.`)) return;
  try {
    const batch = db.batch();
    group.forEach(x => batch.update(db.collection('pkl-queue-participants').doc(x.id), { dupDismissed: true }));
    await batch.commit();
    showToast('Duplicate mark removed.');
  } catch (err) { showToast('Could not update: ' + err.message, true); }
}

function renderParticipants(){
  const wrap = document.getElementById('bucketCards-participants');
  if (!bucketsLoaded) { wrap.innerHTML = `<div class="empty-row" style="padding:20px;color:var(--muted);grid-column:1/-1;">Loading…</div>`; return; }
  if (!BUCKETS.length) {
    wrap.innerHTML = `<div class="bucket-card" style="grid-column:1/-1;"><div style="padding:36px 20px;text-align:center;color:var(--muted);"><div style="font-size:34px;margin-bottom:8px;">🏓</div>No categories yet. Add one to start adding participants.<br><button class="btn btn-primary" style="margin-top:14px;" onclick="openBucketModal()">+ Add category</button></div></div>`;
    return;
  }
  const pIds = playingIds();
  wrap.innerHTML = BUCKETS.map((b, bi) => {
    const list = participants.filter(p => p.bucket === b.key).sort(b.mode === 'fixed' ? ((x,y) => pairSortKey(x).localeCompare(pairSortKey(y)) || x.name.localeCompare(y.name)) : ((x,y) => x.name.localeCompare(y.name)));
    const pools = b.pools || [], pooled = pools.length > 0;
    const ncol = (b.mode === 'team' ? 3 : 5) + (pooled ? 1 : 0);
    if (pooled) list.sort((x, y) => (pools.findIndex(q => q.id === x.pool)) - (pools.findIndex(q => q.id === y.pool)));   // stable: unassigned first, then pool order
    const rowHtml = p => {
      const sk = statusKey(p, pIds);
      const movable = p.status !== 'queued';
      const dup = isDuplicate(p);
      return `
      <tr class="${movable ? 'draggable-row' : ''} ${dup ? 'dup-row' : ''}" ${movable ? 'draggable="true"' : ''} data-pid="${p.id}">
        <td class="stat-hover" data-refkey="${refKeyFor(p)}" data-pid="${p.id}">
          <b>${escapeHtml(p.name)}</b>${p.sourceType==='guest' ? ' <span style="color:var(--muted);font-size:11px;">(guest)</span>' : ''}${dup ? ` <span class="badge dup" title="${escapeHtml(dupTitle(p))}">Duplicate</span>` : ''}${b.mode === 'fixed' ? partnerLineHtml(p) : ''}${b.mode === 'mixed' ? genderToggleHtml(p) : ''}
        </td>
        ${b.mode === 'team' ? '' : `<td>${p.duprId ? escapeHtml(p.duprId) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${p.duprRaw || fmtNum(p.dupr)}</td>`}
        ${pooled ? poolSelectCell(b, p) : ''}
        <td><span class="badge ${sk}">${STATUS_LABELS[sk]}</span></td>
        <td><div class="row-actions">
          <button class="btn-icon" title="Edit name" onclick="openRenameModal('${p.id}')">✎</button>
          ${dup ? `<button class="btn-icon" title="Not a duplicate (clear the mark)" onclick="dismissDuplicate('${p.id}')">✓</button>` : ''}
          ${b.mode === 'fixed' && partnerOf(p) ? `<button class="btn-icon" title="Unpair / change partner" ${p.status==='queued'?'disabled':''} onclick="unpairPlayers('${p.id}')">🔗</button>` : ''}<button class="btn-icon warn" title="${p.status==='resting'?'Set available':'Set resting'}" ${p.status==='queued'?'disabled':''} onclick="toggleRest('${p.id}','${p.status}')">${p.status==='resting'?'▶':'⏸'}</button>
          <button class="btn-icon danger" title="Remove" ${p.status==='queued'?'disabled':''} onclick="removeParticipant('${p.id}')">🗑</button>
        </div></td>
      </tr>`; };
    let rows;
    if (pooled) {
      const groups = [{ id:'', name:'Unassigned', un:true }, ...pools].map(g => ({ ...g, arr: list.filter(p => g.un ? !pools.some(q => q.id === p.pool) : p.pool === g.id) })).filter(g => !g.un || g.arr.length);
      rows = groups.map(g => `<tr class="pool-row ${g.un ? 'un' : ''}"><td colspan="${ncol}">${escapeHtml(g.name)} · ${g.arr.length} player${g.arr.length===1?'':'s'}</td></tr>`
        + (g.arr.length ? g.arr.map(rowHtml).join('') : `<tr class="empty-row"><td colspan="${ncol}">Nobody in this pool yet. Use the Pool column to place players.</td></tr>`)).join('');
    } else {
      rows = list.length ? list.map(rowHtml).join('') : `<tr class="empty-row"><td colspan="${ncol}">No one in this category yet. Drag a player here to move them.</td></tr>`;
    }
    return `
    <div class="bucket-card" data-bucket="${b.key}">
      <div class="bucket-head">
        <h3><span class="bucket-tag" style="background:${b.color}"></span>${escapeHtml(b.label)}${modeTagHtml(b)}</h3>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;"><span class="count">${list.length} ${b.mode === 'team' ? 'team' : 'player'}${list.length===1?'':'s'}${b.mode === 'mixed' ? ` · ${list.filter(x => genderOf(x) === 'M').length} M · ${list.filter(x => genderOf(x) === 'F').length} F` : ''}</span>
          <span class="bucket-drag" draggable="true" title="Drag to rearrange categories">⠿</span>
          <button class="btn-icon" title="Move left" ${bi===0?'disabled':''} onclick="moveBucket('${b.key}',-1)">◀</button>
          <button class="btn-icon" title="Move right" ${bi===BUCKETS.length-1?'disabled':''} onclick="moveBucket('${b.key}',1)">▶</button>
          <button class="btn-icon" title="Edit category" onclick="openBucketModal('${b.key}')">✎</button>
          <button class="btn-icon warn" title="Clear participants (queue must be cleared first)" ${list.length?'':'disabled'} onclick="clearBucketParticipants('${b.key}')">🧹</button>
          <button class="btn-icon danger" title="Delete category (must be empty)" onclick="deleteBucket('${b.key}')">🗑</button>
          ${b.mode === 'fixed' ? `<button class="btn btn-ghost btn-sm" onclick="openPairModal('${b.key}')">🔗 Pair players</button>` : ''}<button class="btn btn-ghost btn-sm" title="Add a pool to this category" onclick="addPool('${b.key}')">＋ Pool</button><button class="btn btn-ghost btn-sm" title="Randomly split the players into pools" onclick="openRandomizePools('${b.key}')">🎲 Randomize</button><button class="btn btn-primary btn-sm" onclick="openAddModal('${b.key}')">+ Add</button></div>
      </div>
      ${poolBarHtml(b, list)}
      <table><thead><tr><th>${b.mode === 'team' ? 'Team' : 'Name'}</th>${b.mode === 'team' ? '' : '<th>DUPR ID</th><th>DUPR</th>'}${pooled ? '<th>Pool</th>' : ''}<th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }).join('');
}

/* ================= BUCKETS (add / rename / delete) ================= */
const bucketOverlay = document.getElementById('bucketOverlay');
let editBucketId = null;
function openBucketModal(id){
  editBucketId = id || null;
  const b = id ? BUCKETS.find(x => x.key === id) : null;
  document.getElementById('bucketModalTitle').textContent = b ? 'Edit category' : 'Add category';
  document.getElementById('bucketModalSub').textContent = b ? 'You can change the name and courts. The mode stays fixed.' : 'Give the category a name and choose its mode.';
  document.getElementById('bucketName').value = b ? b.label : '';
  const modeSel = document.getElementById('bucketMode');
  modeSel.value = b ? b.mode : 'doubles';
  modeSel.disabled = !!b;
  document.getElementById('bucketModeHelper').style.display = b ? 'block' : 'none';
  const allowed = b ? bucketCourts(b.key) : Array.from({ length: COURTS }, (_, i) => i + 1);
  document.getElementById('bucketCourts').innerHTML = Array.from({ length: COURTS }, (_, i) => i + 1).map(c =>
    `<label><input type="checkbox" value="${c}" ${allowed.includes(c) ? 'checked' : ''}>Court ${c}</label>`).join('');
  document.getElementById('errBucket').textContent = '';
  bucketOverlay.classList.add('show');
  document.getElementById('bucketName').focus();
}
document.getElementById('btnBucketCancel').addEventListener('click', () => bucketOverlay.classList.remove('show'));
bucketOverlay.addEventListener('click', e => { if (e.target === bucketOverlay) bucketOverlay.classList.remove('show'); });
document.getElementById('bucketName').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btnBucketSave').click(); });
document.getElementById('btnBucketSave').addEventListener('click', async () => {
  const errEl = document.getElementById('errBucket');
  errEl.textContent = '';
  const name = document.getElementById('bucketName').value.trim();
  const mv = document.getElementById('bucketMode').value, mode = normMode(mv);
  const courts = [...document.querySelectorAll('#bucketCourts input:checked')].map(i => Number(i.value));
  if (!name) { errEl.textContent = 'Enter a category name.'; return; }
  if (!courts.length) { errEl.textContent = 'Select at least one court.'; return; }
  if (BUCKETS.some(b => b.key !== editBucketId && b.label.trim().toLowerCase() === name.toLowerCase())) { errEl.textContent = 'A category with this name already exists.'; return; }
  const btn = document.getElementById('btnBucketSave');
  btn.disabled = true;
  try {
    if (editBucketId) { await db.collection('pkl-queue-buckets').doc(editBucketId).update({ name, courts }); showToast('Category updated.'); }
    else { await db.collection('pkl-queue-buckets').add({ name, mode, courts, order: Math.max(0, ...BUCKETS.map(b => b.order)) + 1000, createdAtMs: Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }); showToast('Category added.'); }
    bucketOverlay.classList.remove('show');
  } catch (err) { errEl.textContent = 'Could not save: ' + err.message; }
  finally { btn.disabled = false; }
});
async function deleteBucket(id){
  const b = BUCKETS.find(x => x.key === id);
  if (!b) return;
  const count = participants.filter(p => p.bucket === id).length;
  if (count > 0) { showToast(`Remove the ${count} participant${count===1?'':'s'} from "${b.label}" first (or move them to another category).`, true); return; }
  if (!confirm(`Delete the category "${b.label}"?`)) return;
  try { await db.collection('pkl-queue-buckets').doc(id).delete(); showToast('Category deleted.'); }
  catch (err) { showToast('Delete failed: ' + err.message, true); }
}

/* ================= POOLS (inside a category) ================= */
function bucketPools(bk){ const b = BUCKETS.find(x => x.key === bk); return b && b.pools ? b.pools : []; }
function bucketHasPools(bk){ return bucketPools(bk).length > 0; }
function poolNameOf(bk, id){ const q = bucketPools(bk).find(x => x.id === id); return q ? q.name : ''; }
function poolIdOf(p){ const lp = p && p.id ? (participants.find(x => x.id === p.id) || p) : p; return lp && lp.pool && bucketPools(lp.bucket).some(q => q.id === lp.pool) ? lp.pool : ''; }
function samePoolFor(bk, a, b){ return !bucketHasPools(bk) || poolIdOf(a) === poolIdOf(b); }
function matchPoolId(m){
  if (!m) return '';
  if (m.pool && bucketPools(m.bucket).some(q => q.id === m.pool)) return m.pool;
  const e = m.team1 && m.team1[0], lp = e ? participants.find(x => x.id === e.participantId) : null;
  return lp ? poolIdOf(lp) : '';
}
function poolTagHtml(bk, id){ const n = id ? poolNameOf(bk, id) : ''; return n ? `<span class="pool-tag">${escapeHtml(n)}</span>` : ''; }
function newPoolId(){ return 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function freshPoolName(taken){
  const used = new Set(taken.map(n => n.toLowerCase()));
  for (let i = 0; i < 300; i++){ const nm = 'Pool ' + (i < 26 ? String.fromCharCode(65 + i) : (i + 1)); if (!used.has(nm.toLowerCase())) return nm; }
  return 'Pool ' + Date.now();
}
function poolSelectCell(b, p){
  const cur = poolIdOf(p);
  return `<td><select class="pool-select" onchange="setParticipantPool('${p.id}', this.value)"><option value="">Unassigned</option>${(b.pools || []).map(q => `<option value="${q.id}" ${q.id === cur ? 'selected' : ''}>${escapeHtml(q.name)}</option>`).join('')}</select></td>`;
}
function poolBarHtml(b, list){
  const pools = b.pools || [];
  if (!pools.length) return '';
  const un = list.filter(p => !pools.some(q => q.id === p.pool)).length;
  const chips = pools.map(q => `<span class="pool-chip">${escapeHtml(q.name)} · ${list.filter(p => p.pool === q.id).length}<button title="Rename pool" onclick="renamePool('${b.key}','${q.id}')">✎</button><button title="Remove pool (its players become Unassigned)" onclick="removePool('${b.key}','${q.id}')">✕</button></span>`).join('');
  return `<div class="pool-bar">${chips}${un ? `<span class="pool-chip un">Unassigned · ${un}</span>` : ''}<button class="btn btn-ghost btn-sm" style="text-transform:none;letter-spacing:0;" onclick="clearPools('${b.key}')">Clear pools</button></div>`;
}
async function commitOps(ops){
  for (let i = 0; i < ops.length; i += 400) { const batch = db.batch(); ops.slice(i, i + 400).forEach(f => f(batch)); await batch.commit(); }
}
function poolsChanged(bk){ if (suggestionState[bk] && suggestionState[bk].rounds.length) discardSuggestions(bk); }
async function addPool(bk){
  const cur = bucketPools(bk);
  if (cur.length >= 12) { showToast('A category can have at most 12 pools.', true); return; }
  try {
    await db.collection('pkl-queue-buckets').doc(bk).update({ pools: [...cur, { id:newPoolId(), name:freshPoolName(cur.map(q => q.name)) }] });
    poolsChanged(bk); showToast('Pool added. Use the Pool column to place players, or Randomize.');
  } catch (err) { showToast('Could not add pool: ' + err.message, true); }
}
async function renamePool(bk, id){
  const cur = bucketPools(bk), q = cur.find(x => x.id === id);
  if (!q) return;
  const nm = (prompt('Pool name', q.name) || '').trim();
  if (!nm || nm === q.name) return;
  if (cur.some(x => x.id !== id && x.name.toLowerCase() === nm.toLowerCase())) { showToast('Another pool already has that name.', true); return; }
  try { await db.collection('pkl-queue-buckets').doc(bk).update({ pools: cur.map(x => x.id === id ? { ...x, name: nm } : x) }); }
  catch (err) { showToast('Could not rename: ' + err.message, true); }
}
async function removePool(bk, id){
  const cur = bucketPools(bk), q = cur.find(x => x.id === id);
  if (!q) return;
  const members = participants.filter(p => p.bucket === bk && p.pool === id);
  if (!confirm(`Remove ${q.name}?${members.length ? ` Its ${members.length} player${members.length===1?'':'s'} become Unassigned.` : ''}`)) return;
  try {
    const FV = firebase.firestore.FieldValue;
    await commitOps([b => b.update(db.collection('pkl-queue-buckets').doc(bk), { pools: cur.filter(x => x.id !== id) }),
      ...members.map(p => b => b.update(db.collection('pkl-queue-participants').doc(p.id), { pool: FV.delete() }))]);
    poolsChanged(bk); showToast(`${q.name} removed.`);
  } catch (err) { showToast('Could not remove pool: ' + err.message, true); }
}
async function clearPools(bk){
  const cur = bucketPools(bk);
  if (!cur.length) return;
  if (!confirm(`Remove all ${cur.length} pools from this category? Everyone becomes Unassigned and the category is matched as a whole again.`)) return;
  try {
    const FV = firebase.firestore.FieldValue;
    await commitOps([b => b.update(db.collection('pkl-queue-buckets').doc(bk), { pools: [] }),
      ...participants.filter(p => p.bucket === bk && p.pool).map(p => b => b.update(db.collection('pkl-queue-participants').doc(p.id), { pool: FV.delete() }))]);
    poolsChanged(bk); showToast('Pools cleared.');
  } catch (err) { showToast('Could not clear pools: ' + err.message, true); }
}
async function setParticipantPool(pid, poolId){
  const p = participants.find(x => x.id === pid);
  if (!p) return;
  const q = isFixed(p.bucket) ? partnerOf(p) : null;   // fixed partners always share a pool
  const group = [p, ...(q ? [q] : [])];
  try {
    const FV = firebase.firestore.FieldValue;
    await commitOps(group.map(x => b => b.update(db.collection('pkl-queue-participants').doc(x.id), { pool: poolId || FV.delete() })));
    poolsChanged(p.bucket);
    if (q) showToast(`${p.name} & ${q.name} moved together.`);
  } catch (err) { showToast('Could not set pool: ' + err.message, true); }
}
/* Random split. Fixed Partner: whole pairs move together. Mixed: men and women are dealt separately so every pool stays balanced. */
function buildPoolAssignment(bk, n){
  const b = BUCKETS.find(x => x.key === bk), list = participants.filter(p => p.bucket === bk), at = {};
  list.forEach(p => at[p.id] = -1);
  if (b.mode === 'fixed') shuffle(pairUnits(list)).forEach((u, i) => { at[u.a.id] = i % n; at[u.b.id] = i % n; });
  else if (b.mode === 'mixed') {
    const men = shuffle(list.filter(p => genderOf(p) === 'M')), women = shuffle(list.filter(p => genderOf(p) === 'F'));
    men.forEach((p, i) => at[p.id] = i % n);
    women.forEach((p, i) => at[p.id] = (men.length + i) % n);
  } else shuffle(list).forEach((p, i) => at[p.id] = i % n);
  return at;
}
function poolRandUnits(bk){
  const b = BUCKETS.find(x => x.key === bk), list = participants.filter(p => p.bucket === bk);
  if (b.mode === 'fixed') { const u = pairUnits(list); return { n: u.length, noun: 'pair', skipped: list.length - u.length * 2, why: 'unpaired' }; }
  if (b.mode === 'mixed') { const t = list.filter(p => genderOf(p)).length; return { n: t, noun: 'player', skipped: list.length - t, why: 'without a gender tag' }; }
  return { n: list.length, noun: b.mode === 'team' ? 'team' : 'player', skipped: 0, why: '' };
}
let poolRandBucket = null;
function openRandomizePools(bk){
  const b = BUCKETS.find(x => x.key === bk);
  if (!b) return;
  const u = poolRandUnits(bk);
  if (u.n < 2) { showToast(`Add at least 2 ${u.noun}s first.`, true); return; }
  poolRandBucket = bk;
  const cur = bucketPools(bk).length;
  document.getElementById('poolRandCount').value = Math.min(Math.max(cur, 2), u.n);
  document.getElementById('poolRandSub').textContent = `${b.label} · ${modeLabel(b.mode)}`;
  document.getElementById('poolRandInfo').textContent = `${u.n} ${u.noun}${u.n===1?'':'s'} will be split evenly at random` + (b.mode === 'fixed' ? ' (partners stay together)' : (b.mode === 'mixed' ? ' (men and women balanced across pools)' : '')) + `. Everyone gets reassigned, so the current pools are replaced.` + (u.skipped ? ` ${u.skipped} ${u.why} stay Unassigned.` : '');
  document.getElementById('errPoolRand').textContent = '';
  document.getElementById('poolRandOverlay').classList.add('show');
}
document.getElementById('btnPoolRandCancel').addEventListener('click', () => document.getElementById('poolRandOverlay').classList.remove('show'));
document.getElementById('poolRandOverlay').addEventListener('click', e => { if (e.target.id === 'poolRandOverlay') e.target.classList.remove('show'); });
document.getElementById('btnPoolRandGo').addEventListener('click', async () => {
  const bk = poolRandBucket, errEl = document.getElementById('errPoolRand');
  if (!bk) return;
  const n = Math.floor(Number(document.getElementById('poolRandCount').value));
  const u = poolRandUnits(bk);
  if (!(n >= 2 && n <= 12)) { errEl.textContent = 'Choose between 2 and 12 pools.'; return; }
  if (n > u.n) { errEl.textContent = `Only ${u.n} ${u.noun}${u.n===1?'':'s'} available, so at most ${u.n} pools.`; return; }
  const btn = document.getElementById('btnPoolRandGo'); btn.disabled = true;
  try {
    const FV = firebase.firestore.FieldValue;
    const keep = bucketPools(bk).slice(0, n).map(q => ({ ...q }));
    while (keep.length < n) keep.push({ id:newPoolId(), name:freshPoolName(keep.map(q => q.name)) });
    const at = buildPoolAssignment(bk, n);
    const ops = [b => b.update(db.collection('pkl-queue-buckets').doc(bk), { pools: keep })];
    participants.filter(p => p.bucket === bk).forEach(p => {
      const i = at[p.id];
      if (i >= 0) ops.push(b => b.update(db.collection('pkl-queue-participants').doc(p.id), { pool: keep[i].id }));
      else if (p.pool) ops.push(b => b.update(db.collection('pkl-queue-participants').doc(p.id), { pool: FV.delete() }));
    });
    await commitOps(ops);
    poolsChanged(bk);
    document.getElementById('poolRandOverlay').classList.remove('show');
    showToast(`Split into ${n} pools.`);
  } catch (err) { errEl.textContent = 'Could not randomize: ' + err.message; }
  finally { btn.disabled = false; }
});

/* ---- clear a bucket's participants / rearrange buckets ---- */
async function commitDeletes(refs){
  for (let i = 0; i < refs.length; i += 400) { const batch = db.batch(); refs.slice(i, i + 400).forEach(r => batch.delete(r)); await batch.commit(); }
}
async function clearBucketParticipants(key){
  const b = BUCKETS.find(x => x.key === key);
  if (!b) return;
  const list = participants.filter(p => p.bucket === key);
  if (!list.length) return;
  const live = queueMatches.filter(m => m.bucket === key && QUEUE_MATCH_STATUSES.includes(m.status));
  if (live.length) { showToast(`Clear the queue first. "${b.label}" still has ${live.length} match${live.length===1?'':'es'} in the queue or on a court.`, true); return; }
  if (!confirm(`Remove all ${list.length} participant${list.length===1?'':'s'} from "${b.label}"?`)) return;
  try {
    await Promise.all(list.map(flushElapsed));
    await commitDeletes(list.map(p => db.collection('pkl-queue-participants').doc(p.id)));
    discardSuggestions(key);
    showToast(`"${b.label}" cleared.`);
  } catch (err) { showToast('Clear failed: ' + err.message, true); }
}
async function saveBucketOrder(keys){
  const batch = db.batch();
  keys.forEach((k, i) => batch.update(db.collection('pkl-queue-buckets').doc(k), { order: (i + 1) * 1000 }));
  try { await batch.commit(); } catch (err) { showToast('Could not reorder categories: ' + err.message, true); }
}
function moveBucket(key, dir){
  const keys = BUCKETS.map(b => b.key), i = keys.indexOf(key), j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return;
  keys.splice(j, 0, keys.splice(i, 1)[0]);
  saveBucketOrder(keys);
}
function reorderBucketsTo(dragKey, targetKey){
  const keys = BUCKETS.map(b => b.key), from = keys.indexOf(dragKey), to = keys.indexOf(targetKey);
  if (from < 0 || to < 0 || from === to) return;
  keys.splice(to, 0, keys.splice(from, 1)[0]);
  saveBucketOrder(keys);
}
document.getElementById('bucketCards-participants').addEventListener('dragstart', e => {
  const h = e.target.closest && e.target.closest('.bucket-drag');
  if (!h) return;
  const card = h.closest('.bucket-card');
  e.dataTransfer.setData('application/x-ccpc-bucket', card.dataset.bucket);
  e.dataTransfer.setData('text/plain', 'bucket:' + card.dataset.bucket);
  e.dataTransfer.effectAllowed = 'move';
});

/* ---- drag a participant to another bucket (event delegation; container persists across re-renders) ---- */
(function(){
  const wrap = document.getElementById('bucketCards-participants');
  const clearHighlights = () => wrap.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  wrap.addEventListener('dragstart', e => {
    const tr = e.target.closest && e.target.closest('tr[data-pid]');
    if (!tr || !tr.hasAttribute('draggable')) return;
    e.dataTransfer.setData('application/x-ccpc-participant', tr.dataset.pid);
    e.dataTransfer.setData('text/plain', 'participant:' + tr.dataset.pid);
    e.dataTransfer.effectAllowed = 'move';
    tr.classList.add('dragging');
  });
  wrap.addEventListener('dragend', () => { wrap.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging')); clearHighlights(); });
  wrap.addEventListener('dragover', e => {
    const card = e.target.closest && e.target.closest('.bucket-card[data-bucket]');
    if (!card) return;
    e.preventDefault();
    if (!card.classList.contains('drop-target')) { clearHighlights(); card.classList.add('drop-target'); }
  });
  wrap.addEventListener('drop', e => {
    const card = e.target.closest && e.target.closest('.bucket-card[data-bucket]');
    clearHighlights();
    if (!card) return;
    e.preventDefault();
    const bk = e.dataTransfer.getData('application/x-ccpc-bucket');
    if (bk) { reorderBucketsTo(bk, card.dataset.bucket); return; }
    const pid = e.dataTransfer.getData('application/x-ccpc-participant');
    if (pid) moveParticipantToBucket(pid, card.dataset.bucket);
  });
})();
async function moveParticipantToBucket(pid, bucketKey){
  const p = participants.find(x => x.id === pid);
  if (!p || p.bucket === bucketKey) return;
  if (p.status === 'queued') { showToast(`${p.name} is in a match and can't be moved right now.`, true); return; }
  try {
    const q = partnerOf(p), FV = firebase.firestore.FieldValue, mb = db.batch();
    mb.update(db.collection('pkl-queue-participants').doc(pid), { bucket: bucketKey, sitOutStreak: 0, pairId: FV.delete(), pool: FV.delete() });
    if (q) mb.update(db.collection('pkl-queue-participants').doc(q.id), { pairId: FV.delete() });
    await mb.commit();
    const old = p.bucket;
    if (suggestionState[old] && allRoundParticipants(old).some(x => x.id === pid)) discardSuggestions(old);
    showToast(`${p.name} moved to ${bucketLabel(bucketKey)}.`);
  } catch(err){ showToast('Move failed: ' + err.message, true); }
}

async function toggleRest(id, current){
  const p = participants.find(x=>x.id===id);
  if (!p) return;
  const q = partnerOf(p), group = [p, ...(q && q.status !== 'queued' && p.status !== 'queued' ? [q] : [])];
  await Promise.all(group.map(x => flushElapsed(x)));
  const next = current === 'resting' ? 'active' : 'resting';
  const update = { status: next, statusSince: Date.now() };
  if (next === 'active') update.sitOutStreak = 0;
  try { const batch = db.batch(); group.forEach(x => batch.update(db.collection('pkl-queue-participants').doc(x.id), update)); await batch.commit(); }
  catch(err){ showToast('Update failed: ' + err.message, true); }
}
async function removeParticipant(id){
  const p = participants.find(x=>x.id===id);
  if (!confirm(`Remove ${p ? p.name : 'this participant'} from the category?`)) return;
  try { const q = partnerOf(p); if (p) await flushElapsed(p); await db.collection('pkl-queue-participants').doc(id).delete(); if (q) await db.collection('pkl-queue-participants').doc(q.id).update({ pairId: firebase.firestore.FieldValue.delete() }); }
  catch(err){ showToast('Remove failed: ' + err.message, true); }
}

/* ---- Edit participant name (allowed in any status: available, queued, playing, resting) ---- */
const renameOverlay = document.getElementById('renameOverlay');
let renamePid = null;
function openRenameModal(pid){
  const p = participants.find(x => x.id === pid);
  if (!p) return;
  renamePid = pid;
  document.getElementById('renameSub').textContent = `${bucketLabel(p.bucket)} · ${STATUS_LABELS[statusKey(p)]}`;
  document.getElementById('renameInput').value = p.name || '';
  document.getElementById('errRename').textContent = '';
  renameOverlay.classList.add('show');
  setTimeout(() => { const i = document.getElementById('renameInput'); i.focus(); i.select(); }, 50);
}
document.getElementById('btnRenameCancel').addEventListener('click', () => renameOverlay.classList.remove('show'));
renameOverlay.addEventListener('click', e => { if (e.target === renameOverlay) renameOverlay.classList.remove('show'); });
document.getElementById('renameInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btnRenameSave').click(); });
document.getElementById('btnRenameSave').addEventListener('click', async () => {
  const errEl = document.getElementById('errRename');
  const p = participants.find(x => x.id === renamePid);
  if (!p) { renameOverlay.classList.remove('show'); return; }
  const name = document.getElementById('renameInput').value.trim().replace(/\s+/g, ' ');
  if (!name) { errEl.textContent = 'Name is required.'; return; }
  if (name === p.name) { renameOverlay.classList.remove('show'); return; }
  const clash = participants.find(x => x.id !== p.id && normName(x.name) === normName(name));
  if (clash && !confirm(`${clash.name} (${bucketLabel(clash.bucket)}) already has this name. Save anyway? Both will be marked Duplicate.`)) return;
  const btn = document.getElementById('btnRenameSave');
  btn.disabled = true;
  try {
    const key = refKeyFor(p);   // lock the stats key (matters for guests, whose key comes from the name)
    const pUpdate = { name };
    if (!p.refKey && p.sourceType !== 'member') pUpdate.refKey = key;
    const fix = arr => (arr || []).map(e => e.participantId === p.id ? { ...e, name, ...(p.sourceType !== 'member' ? { refKey: key } : {}) } : e);
    const has = arr => (arr || []).some(e => e.participantId === p.id);
    const ops = [b => b.update(db.collection('pkl-queue-participants').doc(p.id), pUpdate)];
    queueMatches.filter(m => has(m.team1) || has(m.team2)).forEach(m =>
      ops.push(b => b.update(db.collection('pkl-queue-matches').doc(m.id), { team1: fix(m.team1), team2: fix(m.team2) })));
    logs.filter(l => (!l.sessionId || l.sessionId === sessionState.currentSessionId) && (has(l.team1) || has(l.team2))).forEach(l =>
      ops.push(b => b.update(db.collection('pkl-queue-logs').doc(l.id), { team1: fix(l.team1), team2: fix(l.team2) })));
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach(f => f(batch));
      await batch.commit();
    }
    renameOverlay.classList.remove('show');
    showToast('Name updated.');
  } catch (err) { errEl.textContent = 'Could not save: ' + err.message; }
  finally { btn.disabled = false; }
});

/* ---- Hover stat tooltip (this session only) ---- */
function sessionLogs(sessionId){ return logs.filter(l => l.sessionId === (sessionId || sessionState.currentSessionId)); }
function computeSessionStats(refKey){
  let games=0, wins=0, losses=0;
  const partners={}, opponents={};
  sessionLogs().forEach(l => {
    const t1keys = l.team1.map(refKeyFor), t2keys = l.team2.map(refKeyFor);
    const inT1 = t1keys.includes(refKey), inT2 = t2keys.includes(refKey);
    if (!inT1 && !inT2) return;
    games++;
    const won = (inT1 && l.winner==='team1') || (inT2 && l.winner==='team2');
    if (won) wins++; else losses++;
    const mine = inT1 ? l.team1 : l.team2, theirs = inT1 ? l.team2 : l.team1;
    mine.forEach(p => { if (refKeyFor(p) !== refKey) partners[p.name] = (partners[p.name]||0) + 1; });
    theirs.forEach(p => { opponents[p.name] = (opponents[p.name]||0) + 1; });
  });
  return { games, wins, losses, partners, opponents };
}
function showStatTooltip(el){
  const refKey = el.dataset.refkey, pid = el.dataset.pid;
  const live = participants.find(p => p.id === pid);
  if (!live) return;
  const stats = computeSessionStats(refKey);
  const stored = statsCache[statDocId(refKey)] || {};
  const t = { waiting: stored.totalWaitingSeconds || 0, playing: stored.totalPlayingSeconds || 0, resting: stored.totalRestingSeconds || 0 };
  const sn = effSince(live);
  if (sn) t[timeCategory(live)] += Math.max(0, Math.round((Date.now() - sn) / 1000));
  const partnersStr = Object.entries(stats.partners).map(([n,c]) => `${n} (${c})`).join(', ') || '—';
  const opponentsStr = Object.entries(stats.opponents).map(([n,c]) => `${n} (${c})`).join(', ') || '—';
  const tip = document.getElementById('statTooltip');
  tip.innerHTML = `<div class="t-name">${escapeHtml(live.name)} <span style="font-weight:500;font-size:11px;color:#bcd3e2;">· ${STATUS_LABELS[statusKey(live)]}</span></div>
    <div>Games played: ${stats.games} · Record: ${stats.wins}W–${stats.losses}L</div>
    <div>Waiting: ${formatDuration(t.waiting)} · Playing: ${formatDuration(t.playing)}</div>
    <div>Resting: ${formatDuration(t.resting)}</div>
    <div style="margin-top:4px;">Partners: ${partnersStr}</div><div>Opponents: ${opponentsStr}</div>
    <div style="margin-top:4px;font-size:10.5px;color:#8fabbd;">${courtsActive() ? 'This session only' : 'Timers start when courts are activated'}</div>`;
  const rect = el.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 296)) + 'px';
  tip.style.top = (rect.bottom + 8) + 'px';
  tip.classList.add('show');
}
function hideStatTooltip(){ document.getElementById('statTooltip').classList.remove('show'); }
document.addEventListener('mouseover', e => { const el = e.target.closest('.stat-hover'); if (el) showStatTooltip(el); });
document.addEventListener('mouseout', e => { const el = e.target.closest('.stat-hover'); if (el) hideStatTooltip(); });

/* ================= ADD PARTICIPANT MODAL (CSV import + manual entry) ================= */
const addOverlay = document.getElementById('addOverlay');
let addBucket = null, addSource = 'csv', pendingAdds = [];
function bucketModeOf(bk){ const b = BUCKETS.find(x => x.key === bk); return b ? b.mode : 'doubles'; }
function isTeam(bk){ return bucketModeOf(bk) === 'team'; }
function openAddModal(bucketKey){
  addBucket = bucketKey; addSource = 'csv'; pendingAdds = [];
  const team = isTeam(bucketKey);
  document.getElementById('addModalSub').textContent = `Adding to: ${bucketLabel(bucketKey)} · ${modeLabel(bucketModeOf(bucketKey))}`;
  ['guestName','guestDuprId','guestDupr'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('errAdd').textContent = '';
  document.getElementById('errGuestDupr').textContent = '';
  document.getElementById('csvReport').innerHTML = '';
  document.getElementById('csvFile').value = '';
  document.getElementById('csvCols').innerHTML = 'Columns: <b>' + csvColumnsFor(bucketKey).join(', ') + '</b>' + (team ? '' : '. Current DUPR can be blank or NR') + '. Pool is optional (new pool names are created automatically). Rows with problems are skipped and listed below.';
  document.getElementById('guestNameLabel').textContent = team ? 'Team name' : 'Name';
  document.getElementById('guestName').placeholder = team ? 'Team name' : 'Name';
  document.getElementById('guestDuprIdField').style.display = team ? 'none' : '';
  document.getElementById('guestDuprField').style.display = team ? 'none' : '';
  document.getElementById('guestGenderField').style.display = isMixed(bucketKey) ? 'block' : 'none';
  document.getElementById('guestGender').value = '';
  setSourceUI('csv');
  renderPending();
  addOverlay.classList.add('show');
}
function setSourceUI(src){
  addSource = src;
  document.getElementById('srcCsvBtn').classList.toggle('active', src==='csv');
  document.getElementById('srcGuestBtn').classList.toggle('active', src==='guest');
  document.getElementById('csvSourceBlock').style.display = src==='csv' ? 'block' : 'none';
  document.getElementById('guestSourceBlock').style.display = src==='guest' ? 'block' : 'none';
}
document.getElementById('srcCsvBtn').addEventListener('click', () => setSourceUI('csv'));
document.getElementById('srcGuestBtn').addEventListener('click', () => setSourceUI('guest'));
document.getElementById('btnAddCancel').addEventListener('click', () => addOverlay.classList.remove('show'));
addOverlay.addEventListener('click', e => { if (e.target === addOverlay) addOverlay.classList.remove('show'); });
function takenNameSet(){ return new Set(participants.map(p => normName(p.name))); }
function pendingNameSet(){ return new Set(pendingAdds.map(x => normName(x.name))); }

function renderPending(){
  const wrap = document.getElementById('pendingWrap'), list = document.getElementById('pendingList');
  const team = isTeam(addBucket);
  wrap.style.display = pendingAdds.length ? 'flex' : 'none';
  document.getElementById('pendingLabel').textContent = `To be added (${pendingAdds.length})` + (isFixed(addBucket) && pendingAdds.length % 2 ? ' · add 1 more to complete the pair' : '');
  list.innerHTML = pendingAdds.map((x, i) => `
    <div class="pending-item"><span>${isFixed(addBucket) ? `<span class="mode-tag" style="margin:0 6px 0 0;">Pair ${Math.floor(i/2)+1}</span>` : ''}<b>${escapeHtml(x.name)}</b>${team ? '' : `<span style="color:var(--muted);"> · ${escapeHtml(x.duprRaw)}</span>`}${x.poolName ? `<span class="pool-tag">${escapeHtml(x.poolName)}</span>` : ''}${isMixed(addBucket) ? pendingGenderHtml(x, i) : ''}</span><button type="button" data-i="${i}" title="Remove from list">✕</button></div>`).join('');
  document.getElementById('btnAddConfirm').textContent = pendingAdds.length > 1 ? `Add ${pendingAdds.length} to category` : 'Add to category';
}
document.getElementById('pendingList').addEventListener('click', e => {
  const gb = e.target.closest('button[data-gi]');
  if (gb) { pendingAdds[Number(gb.dataset.gi)].gender = gb.dataset.gv; renderPending(); return; }
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  pendingAdds.splice(Number(b.dataset.i), 1);
  renderPending();
});

/* ---- CSV: template + parser ---- */
function csvColumnsFor(bk){
  const mode = bucketModeOf(bk);
  if (mode === 'team') return ['Name', 'Pool'];
  return ['Name', 'DUPR ID', 'Current DUPR', ...(mode === 'mixed' ? ['Gender'] : []), ...(mode === 'fixed' ? ['Pair Number'] : []), 'Pool'];
}
function downloadCsvTemplate(){
  const bk = addBucket, mode = bucketModeOf(bk), cols = csvColumnsFor(bk);
  const n = mode === 'fixed' ? 4 : 2, rows = [];
  for (let i = 0; i < n; i++) {
    const v = {
      'Name': mode === 'team' ? `Sample Team ${i + 1}` : `Sample Player ${i + 1}`,
      'DUPR ID': `ABC${1230 + i}`, 'Current DUPR': (3 + i * 0.25).toFixed(3),
      'Gender': i % 2 ? 'F' : 'M', 'Pair Number': String(Math.floor(i / 2) + 1), 'Pool': 'Pool A'
    };
    rows.push(cols.map(c => csvCell(v[c])).join(','));
  }
  const text = '\uFEFF' + [cols.join(','), ...rows].join('\r\n') + '\r\n';
  const slug = bucketLabel(bk).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type:'text/csv;charset=utf-8' }));
  a.download = `template_${slug}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  showToast('Template downloaded. Delete the sample rows before importing.');
}
document.getElementById('btnCsvTemplate').addEventListener('click', downloadCsvTemplate);
function parseCsvText(text){
  text = String(text || '').replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const cnt = ch => first.split(ch).length;
  const delim = cnt('\t') > cnt(',') ? '\t' : (cnt(';') > cnt(',') ? ';' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
const CSV_ALIAS = { name:'name', playername:'name', teamname:'name', player:'name', team:'name',
  duprid:'duprId', duprno:'duprId', duprnumber:'duprId',
  currentdupr:'dupr', dupr:'dupr', rating:'dupr', duprrating:'dupr', currentrating:'dupr',
  gender:'gender', sex:'gender', pairnumber:'pair', pairno:'pair', pair:'pair', pairid:'pair', pool:'pool', poolname:'pool', group:'pool' };
function csvToPending(text){
  const out = { ok:[], skipped:[], error:'' };
  const rows = parseCsvText(text);
  if (rows.length < 2) { out.error = 'The file has no data rows.'; return out; }
  const map = {};
  rows[0].forEach((h, i) => { const k = CSV_ALIAS[String(h).toLowerCase().replace(/[^a-z0-9]/g, '')]; if (k && !(k in map)) map[k] = i; });
  const mode = bucketModeOf(addBucket), team = mode === 'team', mixed = mode === 'mixed', fixed = mode === 'fixed';
  if (!('name' in map)) { out.error = 'Missing the "Name" column in the header row.'; return out; }
  if (mixed && !('gender' in map)) { out.error = 'This category is Mixed Doubles, so the file needs a "Gender" column.'; return out; }
  if (fixed && !('pair' in map)) { out.error = 'This category is Doubles - Fixed Partner, so the file needs a "Pair Number" column.'; return out; }
  const taken = takenNameSet(), seen = pendingNameSet();
  const get = (r, k) => (k in map) ? String(r[map[k]] === undefined ? '' : r[map[k]]).trim().replace(/\s+/g, ' ') : '';
  const good = [];
  rows.slice(1).forEach((r, ri) => {
    const line = ri + 2, name = get(r, 'name');
    const skip = why => out.skipped.push({ line, name: name || '(blank)', why });
    if (!name) return skip('Name is empty');
    const nk = normName(name);
    if (taken.has(nk)) return skip('Already in a category');
    if (seen.has(nk)) return skip('Duplicate name in this list or file');
    const e = { sourceType:'import', memberId:null, name, duprId:'', dupr:3.0, duprRaw:'NR', gender:'', poolName: get(r, 'pool').slice(0, 40), pairKey:'', line };
    if (!team) {
      e.duprId = get(r, 'duprId');
      const raw = get(r, 'dupr');
      if (raw) { const d = parseDupr(raw); if (!d.ok) return skip(`Current DUPR "${raw}": ${d.error}`); e.dupr = d.value; e.duprRaw = d.raw; }
    }
    if (mixed) { e.gender = normGender(get(r, 'gender')); if (!e.gender) return skip('Gender must be M or F'); }
    if (fixed) { e.pairKey = get(r, 'pair'); if (!e.pairKey) return skip('Pair Number is empty'); }
    seen.add(nk); good.push(e);
  });
  if (fixed) {
    const groups = new Map();
    good.forEach(e => { if (!groups.has(e.pairKey)) groups.set(e.pairKey, []); groups.get(e.pairKey).push(e); });
    groups.forEach((g, key) => {
      if (g.length !== 2) { g.forEach(e => out.skipped.push({ line:e.line, name:e.name, why:`Pair ${key} has ${g.length} valid player${g.length === 1 ? '' : 's'}, needs exactly 2` })); return; }
      if (g[0].poolName && g[1].poolName && g[0].poolName.toLowerCase() !== g[1].poolName.toLowerCase()) { g.forEach(e => out.skipped.push({ line:e.line, name:e.name, why:`Pair ${key}: partners are in different pools` })); return; }
      const pl = g[0].poolName || g[1].poolName; g.forEach(e => { e.poolName = pl; });
      out.ok.push(g[0], g[1]);
    });
  } else out.ok = good;
  out.skipped.sort((a, b) => a.line - b.line);
  return out;
}
document.getElementById('csvFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0], rep = document.getElementById('csvReport');
  if (!f) return;
  const rd = new FileReader();
  rd.onerror = () => { rep.innerHTML = '<span style="color:var(--red);">Could not read the file.</span>'; };
  rd.onload = () => {
    const r = csvToPending(rd.result);
    document.getElementById('csvFile').value = '';
    if (r.error) { rep.innerHTML = `<span style="color:var(--red);">${escapeHtml(r.error)}</span>`; return; }
    pendingAdds.push(...r.ok);
    renderPending();
    rep.innerHTML = `<div class="csv-ok">✓ ${r.ok.length} ready to add</div>` + (r.skipped.length
      ? `<div style="color:var(--orange);font-weight:700;margin-top:4px;">✕ ${r.skipped.length} skipped</div><div class="csv-skip">${r.skipped.slice(0, 100).map(x => `<div>Row ${x.line} · <b>${escapeHtml(x.name)}</b>: ${escapeHtml(x.why)}</div>`).join('')}${r.skipped.length > 100 ? `<div>…and ${r.skipped.length - 100} more</div>` : ''}</div>` : '');
  };
  rd.readAsText(f);
});

/* ---- manual entry ---- */
function addGuestToPending(){
  const errAdd = document.getElementById('errAdd'), errD = document.getElementById('errGuestDupr');
  errAdd.textContent = ''; errD.textContent = '';
  const team = isTeam(addBucket);
  const name = document.getElementById('guestName').value.trim().replace(/\s+/g, ' ');
  if (!name) { errAdd.textContent = team ? 'Team name is required.' : 'Name is required.'; return false; }
  const key = normName(name);
  if (takenNameSet().has(key) || pendingNameSet().has(key)) { errAdd.textContent = `${name} is already in a category or on the list.`; return false; }
  let d = { ok:true, value:3.0, raw:'NR' };
  if (!team) {
    const raw = document.getElementById('guestDupr').value.trim();
    d = raw ? parseDupr(raw) : { ok:true, value:3.0, raw:'NR' };
    if (!d.ok) { errD.textContent = d.error; return false; }
  }
  pendingAdds.push({ sourceType:'manual', memberId:null, name, duprId: team ? '' : document.getElementById('guestDuprId').value.trim(), dupr:d.value, duprRaw:d.raw, poolName:'', gender: isMixed(addBucket) ? document.getElementById('guestGender').value : '' });
  ['guestName','guestDuprId','guestDupr','guestGender'].forEach(id => document.getElementById(id).value = '');
  renderPending();
  document.getElementById('guestName').focus();
  return true;
}
document.getElementById('btnGuestToList').addEventListener('click', addGuestToPending);

document.getElementById('btnAddConfirm').addEventListener('click', async () => {
  const errAdd = document.getElementById('errAdd');
  errAdd.textContent = '';
  if (document.getElementById('guestName').value.trim()) { if (!addGuestToPending()) return; }
  if (!pendingAdds.length) { errAdd.textContent = addSource === 'guest' ? 'Add at least one entry to the list.' : 'Choose a CSV file to load the list.'; return; }
  const takenNames = takenNameSet();
  const conflicts = pendingAdds.filter(x => takenNames.has(normName(x.name)));
  if (conflicts.length) { errAdd.textContent = `Already in a category: ${conflicts.map(x => x.name).join(', ')}. Remove them from the list.`; return; }
  const fixedAdd = isFixed(addBucket);
  if (fixedAdd && pendingAdds.length % 2) { errAdd.textContent = 'Doubles - Fixed Partner needs players in pairs. The list is paired in order (1&2, 3&4…). Add one more player.'; return; }
  const pairIds = pendingAdds.map((_, i) => i % 2 ? null : newPairId());
  const btn = document.getElementById('btnAddConfirm');
  btn.disabled = true;
  try {
    const batch = db.batch(), now = Date.now();
    /* pools named in the CSV: reuse an existing pool with the same name, create the rest */
    const poolMap = {}, names = [...new Set(pendingAdds.map(x => x.poolName).filter(Boolean))];
    if (names.length) {
      const cur = bucketPools(addBucket).slice();
      names.forEach(n => {
        let q = cur.find(x => x.name.toLowerCase() === n.toLowerCase());
        if (!q) { q = { id:newPoolId(), name:n }; cur.push(q); }
        poolMap[n.toLowerCase()] = q.id;
      });
      if (cur.length > 12) throw new Error('A category can have at most 12 pools.');
      batch.update(db.collection('pkl-queue-buckets').doc(addBucket), { pools: cur });
    }
    pendingAdds.forEach((x, ix) => {
      batch.set(db.collection('pkl-queue-participants').doc(), {
        bucket: addBucket, sourceType:x.sourceType, memberId:null, name:x.name, duprId:x.duprId || '',
        dupr:x.dupr, duprRaw:x.duprRaw, status:'active', statusSince: now, sitOutStreak: 0, ...(x.gender ? { gender: x.gender } : {}), ...(fixedAdd ? { pairId: pairIds[ix - (ix % 2)] } : {}),
        ...(x.poolName ? { pool: poolMap[x.poolName.toLowerCase()] } : {}),
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    if (names.length) poolsChanged(addBucket);
    showToast(`${pendingAdds.length} ${isTeam(addBucket) ? 'team' : 'player'}${pendingAdds.length===1?'':'s'} added to ${bucketLabel(addBucket)}.`);
    addOverlay.classList.remove('show');
  } catch (err) { showToast('Add failed: ' + err.message, true); }
  finally { btn.disabled = false; }
});

/* ================= SESSION HISTORY HELPERS ================= */

/* ================= GENDER (Mixed Doubles) ================= */
function isMixed(bk){ const b = BUCKETS.find(x => x.key === bk); return !!b && b.mode === 'mixed'; }
function normGender(v){ const t = String(v || '').trim().toLowerCase(); if (!t) return ''; if (t[0] === 'm') return 'M'; if (t[0] === 'f' || t[0] === 'w') return 'F'; return ''; }
/* A player's gender: the tag on the participant */
function genderOf(p){
  if (!p) return '';
  const live = p.id ? (participants.find(x => x.id === p.id) || p) : p;
  return normGender(live.gender);
}
async function setGender(pid, g){
  const p = participants.find(x => x.id === pid);
  if (!p || genderOf(p) === g) return;
  const live = queueMatches.some(m => QUEUE_MATCH_STATUSES.includes(m.status) && isInMatch(pid, m));
  if (live && isMixed(p.bucket) && !confirm(`${p.name} is in a queued or playing match. Changing the gender may make that match non-mixed. Continue?`)) return;
  try { await db.collection('pkl-queue-participants').doc(pid).update({ gender: g }); }
  catch (err) { showToast('Could not set gender: ' + err.message, true); return; }
  if (suggestionState[p.bucket] && allRoundParticipants(p.bucket).some(x => x.id === pid)) { discardSuggestions(p.bucket); showToast(`Gender changed. Suggestions for ${bucketLabel(p.bucket)} were cleared, generate again.`); }
}
function genderToggleHtml(p){
  const g = genderOf(p);
  return ` <span class="gtoggle"><button type="button" class="${g === 'M' ? 'on m' : ''}" title="Male" onclick="setGender('${p.id}','M')">M</button><button type="button" class="${g === 'F' ? 'on f' : ''}" title="Female" onclick="setGender('${p.id}','F')">F</button></span>${g ? '' : ' <span class="badge nogender" title="Tag male or female so this player can be matched">Tag gender</span>'}`;
}
function genderSym(p){ const g = genderOf(p); return g === 'M' ? ' <span class="gsym m">♂</span>' : (g === 'F' ? ' <span class="gsym f">♀</span>' : ''); }
function pendingGenderHtml(x, i){
  return ` <span class="gtoggle"><button type="button" data-gi="${i}" data-gv="M" class="${x.gender === 'M' ? 'on m' : ''}">M</button><button type="button" data-gi="${i}" data-gv="F" class="${x.gender === 'F' ? 'on f' : ''}">F</button></span>${x.gender ? '' : ' <span class="badge nogender">Tag gender</span>'}`;
}

/* ================= FIXED PARTNER (pairs) ================= */
function isFixed(bk){ const b = BUCKETS.find(x => x.key === bk); return !!b && b.mode === 'fixed'; }
function partnerOf(p){ return p && p.pairId ? participants.find(x => x.pairId === p.pairId && x.id !== p.id) || null : null; }
function newPairId(){ return 'pr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function pairUnits(list){
  const by = {};
  list.forEach(p => { if (p.pairId) (by[p.pairId] = by[p.pairId] || []).push(p); });
  return Object.entries(by).filter(([, v]) => v.length === 2).map(([id, v]) => ({ id, a:v[0], b:v[1], name: v[0].name + ' & ' + v[1].name }));
}
function pairSortKey(p){ const q = partnerOf(p); return q ? [p.name, q.name].sort()[0].toLowerCase() + '|' + p.pairId : '~' + p.name.toLowerCase(); }
function partnerLineHtml(p){
  const q = partnerOf(p);
  if (!q) return `<div style="font-size:11px;color:var(--orange);">Unpaired · use “Pair players”</div>`;
  return `<div style="font-size:11px;color:var(--muted);">👥 ${escapeHtml(q.name)} (${q.duprRaw || fmtNum(q.dupr)}) · Pair avg ${fmtNum(((Number(p.dupr)||0) + (Number(q.dupr)||0)) / 2)}</div>`;
}
function fixedTag(p){ if (!isFixed(p.bucket)) return ''; const q = partnerOf(p); return ` <span class="gen-meta">👥 ${q ? escapeHtml(q.name) : 'unpaired'}</span>`; }
const pairOverlay = document.getElementById('pairOverlay');
let pairBucket = null;
function openPairModal(bk){
  const free = participants.filter(p => p.bucket === bk && !partnerOf(p)).sort((x, y) => x.name.localeCompare(y.name));
  if (free.length < 2) { showToast('Need at least 2 unpaired players in this category.', true); return; }
  pairBucket = bk;
  const opts = `<option value="">Select player…</option>` + free.map(p => `<option value="${p.id}">${escapeHtml(p.name)} · ${p.duprRaw || fmtNum(p.dupr)}</option>`).join('');
  document.getElementById('pairSub').textContent = bucketLabel(bk);
  document.getElementById('pairA').innerHTML = opts; document.getElementById('pairB').innerHTML = opts;
  document.getElementById('errPair').textContent = '';
  pairOverlay.classList.add('show');
}
document.getElementById('btnPairCancel').addEventListener('click', () => pairOverlay.classList.remove('show'));
pairOverlay.addEventListener('click', e => { if (e.target === pairOverlay) pairOverlay.classList.remove('show'); });
document.getElementById('btnPairSave').addEventListener('click', async () => {
  const a = document.getElementById('pairA').value, b = document.getElementById('pairB').value, err = document.getElementById('errPair');
  if (!a || !b) { err.textContent = 'Pick both players.'; return; }
  if (a === b) { err.textContent = 'Pick two different players.'; return; }
  try {
    const pid = newPairId(), batch = db.batch();
    const pl = poolIdOf(participants.find(x => x.id === a)) || poolIdOf(participants.find(x => x.id === b));
    [a, b].forEach(id => batch.update(db.collection('pkl-queue-participants').doc(id), { pairId: pid, ...(pl ? { pool: pl } : {}) }));
    await batch.commit();
    if (suggestionState[pairBucket]) discardSuggestions(pairBucket);
    pairOverlay.classList.remove('show'); showToast('Pair created.');
  } catch (e) { err.textContent = e.message; }
});
async function unpairPlayers(id){
  const p = participants.find(x => x.id === id), q = partnerOf(p);
  if (!p) return;
  if (p.status === 'queued' || (q && q.status === 'queued')) { showToast('This pair is in a queued or playing match.', true); return; }
  if (!confirm(`Unpair ${p.name}${q ? ' & ' + q.name : ''}?`)) return;
  try {
    const FV = firebase.firestore.FieldValue, batch = db.batch();
    [p, q].filter(Boolean).forEach(x => batch.update(db.collection('pkl-queue-participants').doc(x.id), { pairId: FV.delete() }));
    await batch.commit();
    if (suggestionState[p.bucket]) discardSuggestions(p.bucket);
    showToast('Unpaired.');
  } catch (e) { showToast('Unpair failed: ' + e.message, true); }
}

function pairKey(id1, id2){ return [id1, id2].sort().join('__'); }
function partnerCount(id1, id2){ return (sessionState.partnerCounts || {})[pairKey(id1,id2)] || 0; }
function opponentCount(id1, id2){ return (sessionState.opponentCounts || {})[pairKey(id1,id2)] || 0; }

/* ================= SUGGESTION ENGINE ================= */
let suggestionState = {};
function sugg(k){ return suggestionState[k] || (suggestionState[k] = { rounds:[] }); }
function shuffle(arr){ const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* Player state (uses the app's own statusKey: active / queued / playing / resting) */
function playerState(p, pIds){
  const live = participants.find(x => x.id === p.id) || p;
  return statusKey(live, pIds);
}

/* ---- Round builder: minimise repeated partners (weight 5) and opponents (weight 1) ---- */
const PARTNER_W = 5, OPP_W = 1;
function cnt(map, a, b){ return map[pairKey(a,b)] || 0; }
function groupCost(arr, off, g, P, O){
  if (g === 2) return OPP_W * cnt(O, arr[off].id, arr[off+1].id);
  const a = arr[off], b = arr[off+1], c = arr[off+2], d = arr[off+3];
  let cost = PARTNER_W * (cnt(P,a.id,b.id) + cnt(P,c.id,d.id));
  cost += OPP_W * (cnt(O,a.id,c.id) + cnt(O,a.id,d.id) + cnt(O,b.id,c.id) + cnt(O,b.id,d.id));
  return cost;
}
function arrangementCost(arr, g, P, O){ let t = 0; for (let o=0; o<arr.length; o+=g) t += groupCost(arr, o, g, P, O); return t; }
function buildRound(players, g, P, O){
  let best = null;
  const restarts = 10;
  for (let r=0; r<restarts; r++){
    const arr = shuffle(players);
    let cur = arrangementCost(arr, g, P, O);
    let improved = true;
    while (improved && cur > 0){
      improved = false;
      for (let i=0; i<arr.length-1; i++){
        for (let j=i+1; j<arr.length; j++){
          if (Math.floor(i/g) === Math.floor(j/g) && g === 2) continue;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          const c = arrangementCost(arr, g, P, O);
          if (c < cur){ cur = c; improved = true; } else { [arr[i], arr[j]] = [arr[j], arr[i]]; }
        }
      }
    }
    if (!best || cur < best.cost) best = { arr: arr.slice(), cost: cur };
    if (best.cost === 0) break;
  }
  return best;
}
function planRounds(selected, g, roundCount){
  const perRound = Math.floor(selected.length / g) * g;
  let bestPlan = null;
  const attempts = 12;
  for (let at=0; at<attempts; at++){
    const P = Object.assign({}, sessionState.partnerCounts || {});
    const O = Object.assign({}, sessionState.opponentCounts || {});
    const played = {}; selected.forEach(p => played[p.id] = 0);
    const rounds = []; let total = 0;
    for (let r=0; r<roundCount; r++){
      // fair sit-out: those who played the fewest games this run play first; then longest current sit-out streak
      const order = shuffle(selected).sort((x,y) => (played[x.id]-played[y.id]) || ((y.sitOutStreak||0)-(x.sitOutStreak||0)));
      const play = order.slice(0, perRound), bench = order.slice(perRound);
      const built = buildRound(play, g, P, O);
      total += built.cost;
      const matches = [];
      for (let o=0; o<built.arr.length; o+=g){
        const grp = built.arr.slice(o, o+g);
        const m = g === 2 ? { team1:[grp[0]], team2:[grp[1]], added:false } : { team1:[grp[0],grp[1]], team2:[grp[2],grp[3]], added:false };
        matches.push(m);
        if (g === 4){ const kp = pairKey(grp[0].id,grp[1].id), kq = pairKey(grp[2].id,grp[3].id); P[kp]=(P[kp]||0)+1; P[kq]=(P[kq]||0)+1; }
        m.team1.forEach(p => m.team2.forEach(q => { const k = pairKey(p.id,q.id); O[k]=(O[k]||0)+1; }));
        [...m.team1, ...m.team2].forEach(p => played[p.id]++);
      }
      rounds.push({ matches, bench });
    }
    if (!bestPlan || total < bestPlan.total) bestPlan = { rounds, total };
  }
  return bestPlan.rounds;
}

function planFixedRounds(selected, roundCount){
  const units = pairUnits(selected);
  const leftover = selected.filter(p => !units.some(u => u.a.id === p.id || u.b.id === p.id));
  const real = (u, v) => [u.a, u.b].reduce((s, x) => s + [v.a, v.b].reduce((t, y) => t + ((sessionState.opponentCounts || {})[pairKey(x.id, y.id)] || 0), 0), 0);
  const streak = u => Math.max(u.a.sitOutStreak || 0, u.b.sitOutStreak || 0);
  const perRound = Math.floor(units.length / 2) * 2;
  let best = null;
  for (let at = 0; at < 12; at++){
    const O = {}; units.forEach((u, i) => units.forEach((v, j) => { if (i < j) O[pairKey(u.id, v.id)] = real(u, v); }));
    const played = {}; units.forEach(u => played[u.id] = 0);
    const rounds = []; let total = 0;
    for (let r = 0; r < roundCount; r++){
      const order = shuffle(units).sort((x, y) => (played[x.id] - played[y.id]) || (streak(y) - streak(x)));
      const play = order.slice(0, perRound), bench = order.slice(perRound);
      const built = buildRound(play, 2, {}, O);
      total += built.cost;
      const matches = [];
      for (let o = 0; o < built.arr.length; o += 2){
        const u = built.arr[o], v = built.arr[o + 1];
        matches.push({ team1:[u.a, u.b], team2:[v.a, v.b], added:false });
        const k = pairKey(u.id, v.id); O[k] = (O[k] || 0) + 4;
        played[u.id]++; played[v.id]++;
      }
      rounds.push({ matches, bench:[...bench.flatMap(u => [u.a, u.b]), ...leftover] });
    }
    if (!best || total < best.total) best = { rounds, total };
  }
  return best.rounds;
}
function pairSelectHtml(bk, ri, cur){
  const all = pairUnits(roundParticipants(sugg(bk).rounds[ri])), cu = all.find(u => u.id === cur);
  const units = cu ? all.filter(u => samePoolFor(bk, u.a, cu.a)) : all;
  return `<select onchange="swapPair('${bk}', ${ri}, '${cur}', this.value)">${units.map(u => `<option value="${u.id}" ${u.id === cur ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select>`;
}
function swapPair(bk, ri, curId, newId){
  if (curId === newId) return;
  const rd = sugg(bk).rounds[ri], units = pairUnits(roundParticipants(rd));
  const x = units.find(u => u.id === curId), y = units.find(u => u.id === newId);
  if (!x || !y) return;
  const l1 = findLoc(rd, x.a.id), l2 = findLoc(rd, x.b.id), m1 = findLoc(rd, y.a.id), m2 = findLoc(rd, y.b.id);
  setAt(rd, l1, y.a); setAt(rd, l2, y.b); setAt(rd, m1, x.a); setAt(rd, m2, x.b);
  renderSuggestions(bk);
}
function benchPairsHtml(bk, ri){
  const rd = sugg(bk).rounds[ri], units = pairUnits(rd.bench);
  const inPair = new Set(units.flatMap(u => [u.a.id, u.b.id]));
  return units.map(u => `<div class="bench-chip">${pairSelectHtml(bk, ri, u.id)}</div>`).join('')
    + rd.bench.filter(p => !inPair.has(p.id)).map(p => `<div class="bench-chip">${escapeHtml(p.name)} (unpaired)</div>`).join('');
}
/* ---- Mixed doubles: every match = 2 men + 2 women, each team 1 man + 1 woman ---- */
function mixedMatchBest(m1, m2, w1, w2, P, O){
  const opts = [
    { t1:[m1, w1], t2:[m2, w2] },
    { t1:[m1, w2], t2:[m2, w1] }
  ];
  let best = null;
  opts.forEach(o => {
    const c = PARTNER_W * (cnt(P, o.t1[0].id, o.t1[1].id) + cnt(P, o.t2[0].id, o.t2[1].id))
      + OPP_W * (cnt(O, o.t1[0].id, o.t2[0].id) + cnt(O, o.t1[0].id, o.t2[1].id) + cnt(O, o.t1[1].id, o.t2[0].id) + cnt(O, o.t1[1].id, o.t2[1].id));
    if (!best || c < best.cost) best = { ...o, cost:c };
  });
  return best;
}
function mixedArrCost(M, W, P, O){
  let t = 0;
  for (let i = 0; i < M.length; i += 2) t += mixedMatchBest(M[i], M[i+1], W[i], W[i+1], P, O).cost;
  return t;
}
function buildMixedRound(playM, playW, P, O){
  let best = null;
  for (let r = 0; r < 10; r++){
    const M = shuffle(playM), W = shuffle(playW);
    let cur = mixedArrCost(M, W, P, O), improved = true;
    while (improved && cur > 0){
      improved = false;
      [M, W].forEach(arr => {
        for (let i = 0; i < arr.length - 1; i++) for (let j = i + 1; j < arr.length; j++){
          if (Math.floor(i / 2) === Math.floor(j / 2)) continue;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          const c = mixedArrCost(M, W, P, O);
          if (c < cur){ cur = c; improved = true; } else { [arr[i], arr[j]] = [arr[j], arr[i]]; }
        }
      });
    }
    if (!best || cur < best.cost) best = { M: M.slice(), W: W.slice(), cost: cur };
    if (best.cost === 0) break;
  }
  return best;
}
function planMixedRounds(selected, roundCount){
  const men = selected.filter(p => genderOf(p) === 'M'), women = selected.filter(p => genderOf(p) === 'F');
  const k = Math.min(Math.floor(men.length / 2), Math.floor(women.length / 2));
  let bestPlan = null;
  for (let at = 0; at < 12; at++){
    const P = Object.assign({}, sessionState.partnerCounts || {});
    const O = Object.assign({}, sessionState.opponentCounts || {});
    const played = {}; selected.forEach(p => played[p.id] = 0);
    const rounds = []; let total = 0;
    for (let r = 0; r < roundCount; r++){
      // fair sit-out inside each gender: fewest games this run first, then longest sit-out streak
      const ord = arr => shuffle(arr).sort((x, y) => (played[x.id] - played[y.id]) || ((y.sitOutStreak || 0) - (x.sitOutStreak || 0)));
      const mo = ord(men), wo = ord(women);
      const playM = mo.slice(0, 2 * k), playW = wo.slice(0, 2 * k);
      const bench = [...mo.slice(2 * k), ...wo.slice(2 * k)];
      const built = buildMixedRound(playM, playW, P, O);
      total += built.cost;
      const matches = [];
      for (let i = 0; i < built.M.length; i += 2){
        const b = mixedMatchBest(built.M[i], built.M[i+1], built.W[i], built.W[i+1], P, O);
        const m = { team1: b.t1, team2: b.t2, added:false };
        matches.push(m);
        [m.team1, m.team2].forEach(t => { const kp = pairKey(t[0].id, t[1].id); P[kp] = (P[kp] || 0) + 1; });
        m.team1.forEach(a => m.team2.forEach(c => { const kk = pairKey(a.id, c.id); O[kk] = (O[kk] || 0) + 1; }));
        [...m.team1, ...m.team2].forEach(a => played[a.id]++);
      }
      rounds.push({ matches, bench });
    }
    if (!bestPlan || total < bestPlan.total) bestPlan = { rounds, total };
  }
  return bestPlan.rounds;
}
function mergeRounds(plans, n){
  return Array.from({ length: n }, (_, r) => ({ matches: plans.flatMap(pl => (pl[r] ? pl[r].matches : [])), bench: plans.flatMap(pl => (pl[r] ? pl[r].bench : [])) }));
}
function generateSuggestions(bucketKey, selected, roundCount, groups){
  const g = bucketSize(bucketKey);
  const planFor = list => isFixed(bucketKey) ? planFixedRounds(list, roundCount) : (isMixed(bucketKey) ? planMixedRounds(list, roundCount) : planRounds(list, g, roundCount));
  const rounds = groups ? mergeRounds(groups.map(planFor), roundCount) : planFor(selected);
  suggestionState[bucketKey] = { rounds };
  renderSuggestions(bucketKey);
  const placed = new Set();
  rounds.forEach(r => r.matches.forEach(m => [...m.team1, ...m.team2].forEach(p => placed.add(p.id))));
  const batch = db.batch(); let touched = false;
  selected.filter(p => p.status === 'active').forEach(p => {
    const cur = p.sitOutStreak || 0;
    const next = placed.has(p.id) ? 0 : cur + 1;
    if (next !== cur){ batch.update(db.collection('pkl-queue-participants').doc(p.id), { sitOutStreak: next }); touched = true; }
  });
  if (touched) batch.commit().catch(() => {});
}

/* ---- Editing a suggested round (swap players inside a round) ---- */
function roundParticipants(rd){
  const list = [];
  rd.matches.forEach(m => { if (!m.added) list.push(...m.team1, ...m.team2); });
  list.push(...rd.bench);
  return list;
}
function findLoc(rd, participantId){
  for (let mi=0; mi<rd.matches.length; mi++){
    const m = rd.matches[mi]; if (m.added) continue;
    for (let si=0; si<m.team1.length; si++) if (m.team1[si].id === participantId) return {type:'match', mi, side:'team1', si};
    for (let si=0; si<m.team2.length; si++) if (m.team2[si].id === participantId) return {type:'match', mi, side:'team2', si};
  }
  for (let bi=0; bi<rd.bench.length; bi++) if (rd.bench[bi].id === participantId) return {type:'bench', bi};
  return null;
}
function getAt(rd, loc){ return loc.type==='match' ? rd.matches[loc.mi][loc.side][loc.si] : rd.bench[loc.bi]; }
function setAt(rd, loc, p){ if (loc.type==='match') rd.matches[loc.mi][loc.side][loc.si] = p; else rd.bench[loc.bi] = p; }
function swapSlot(bucketKey, ri, selfLoc, newId){
  const rd = sugg(bucketKey).rounds[ri];
  const oldP = getAt(rd, selfLoc);
  const otherLoc = findLoc(rd, newId);
  if (!otherLoc) return;
  const newP = getAt(rd, otherLoc);
  setAt(rd, selfLoc, newP); setAt(rd, otherLoc, oldP);
  renderSuggestions(bucketKey);
}
function stateSuffix(p){ const s = playerState(p); return s==='playing' ? ' · playing' : s==='queued' ? ' · on queue' : s==='resting' ? ' · resting' : ''; }
function allRoundParticipants(bucketKey){ const st = sugg(bucketKey); return st ? st.rounds.flatMap(roundParticipants) : []; }
function slotSelectHtml(bucketKey, ri, loc, current){
  const rd = sugg(bucketKey).rounds[ri];
  const mx = isMixed(bucketKey), cg = mx ? genderOf(current) : '';
  const pool = (mx ? roundParticipants(rd).filter(p => genderOf(p) === cg) : roundParticipants(rd)).filter(p => samePoolFor(bucketKey, p, current));
  const options = pool.map(p => `<option value="${p.id}" ${p.id===current.id?'selected':''}>${escapeHtml(p.name)}${mx ? (genderOf(p) === 'F' ? ' ♀' : ' ♂') : ''}${stateSuffix(p)}</option>`).join('');
  const locStr = JSON.stringify(loc).replace(/"/g,'&quot;');
  return `<select data-loc="${locStr}" onchange="swapSlot('${bucketKey}', ${ri}, JSON.parse(this.dataset.loc), this.value)">${options}</select>`;
}
function renderSuggestions(bucketKey){
  const st = sugg(bucketKey);
  const container = document.getElementById('suggBody-' + bucketKey);
  if (!container) return;
  if (!st.rounds.length){ container.innerHTML = `<div style="padding:8px 0;color:var(--muted);font-size:13px;">No suggestions yet — click "Generate matchups".</div>`; return; }
  container.innerHTML = st.rounds.map((rd, ri) => {
    const pending = rd.matches.filter(m => !m.added).length;
    const head = `<div class="round-head"><div class="round-title">Round ${ri+1}</div>
      <button class="btn btn-ghost btn-sm" ${pending?'':'disabled'} onclick="this.disabled=true; addRoundToQueue('${bucketKey}', ${ri})">${pending?'Add round to queue':'✓ Round added'}</button></div>`;
    const cards = rd.matches.map((m, mi) => {
      if (m.added){
        const n1 = m.team1.map(p=>escapeHtml(p.name)).join(' &amp; '), n2 = m.team2.map(p=>escapeHtml(p.name)).join(' &amp; ');
        return `<div class="sugg-card added"><div class="sugg-side"><div class="side-label">Team A</div>${n1}</div><div class="sugg-vs">VS${poolTagHtml(bucketKey, poolIdOf(m.team1[0]))}</div><div class="sugg-side"><div class="side-label">Team B</div>${n2}</div><div class="sugg-actions"><span class="added-tag">✓ Added</span></div></div>`;
      }
      const t1 = isFixed(bucketKey) ? pairSelectHtml(bucketKey, ri, m.team1[0].pairId) : m.team1.map((p,si) => slotSelectHtml(bucketKey, ri, {type:'match',mi,side:'team1',si}, p)).join('');
      const t2 = isFixed(bucketKey) ? pairSelectHtml(bucketKey, ri, m.team2[0].pairId) : m.team2.map((p,si) => slotSelectHtml(bucketKey, ri, {type:'match',mi,side:'team2',si}, p)).join('');
      return `<div class="sugg-card">
        <div class="sugg-side"><div class="side-label">Team A</div>${t1}</div>
        <div class="sugg-vs">VS${poolTagHtml(bucketKey, poolIdOf(m.team1[0]))}</div>
        <div class="sugg-side"><div class="side-label">Team B</div>${t2}</div>
        <div class="sugg-actions"><button class="btn btn-primary btn-sm" onclick="this.disabled=true; addSuggestionToQueue('${bucketKey}', ${ri}, ${mi})">Add to queue</button></div>
      </div>`;
    }).join('');
    const bench = rd.bench.length ? `<div><div class="side-label" style="margin-bottom:6px;">Sitting out this round</div>
      <div class="bench-wrap">${isFixed(bucketKey) ? benchPairsHtml(bucketKey, ri) : rd.bench.map((p,bi) => `<div class="bench-chip">${slotSelectHtml(bucketKey, ri, {type:'bench',bi}, p)}</div>`).join('')}</div></div>` : '';
    return `<div class="round-block">${head}${cards}${bench}</div>`;
  }).join('');
}

/* ---- Generate modal ---- */
const genOverlay = document.getElementById('genOverlay');
let genBucket = null, genList = [], genSelected = new Set(), genPoolSel = '';
function genInPool(p){
  if (!bucketHasPools(genBucket)) return true;
  const id = poolIdOf(p);
  return genPoolSel === '*' ? !!id : id === genPoolSel;
}
function genBaseList(){ return participants.filter(p => p.bucket === genBucket && !isDuplicate(p) && genInPool(p)).sort((x,y) => x.name.localeCompare(y.name)); }
function genGroups(){
  const sel = genList.filter(p => genSelected.has(p.id) && genEligible(p));
  const ids = genPoolSel === '*' ? bucketPools(genBucket).map(q => q.id) : [genPoolSel];
  return ids.map(id => ({ id, name: poolNameOf(genBucket, id), list: sel.filter(p => poolIdOf(p) === id) }));
}
function genCapacity(list){
  const g = bucketSize(genBucket);
  if (isMixed(genBucket)) { const nm = list.filter(p => genderOf(p) === 'M').length, nw = list.filter(p => genderOf(p) === 'F').length; return { matches: Math.min(Math.floor(nm / 2), Math.floor(nw / 2)), n: nm + nw }; }
  if (isFixed(genBucket)) { const u = pairUnits(list).length; return { matches: Math.floor(u / 2), n: u * 2 }; }
  return { matches: Math.floor(list.length / g), n: list.length };
}
function genEligible(p){ return !isMixed(genBucket) || !!genderOf(p); }
function genUpdateSummary(){
  if (bucketHasPools(genBucket)) {
    const gs = genGroups().map(gr => ({ ...gr, cap: genCapacity(gr.list) }));
    document.getElementById('genSummary').textContent = gs.map(gr => `${gr.name}: ` + (gr.cap.matches >= 1 ? `${gr.cap.n} → ${gr.cap.matches} match${gr.cap.matches===1?'':'es'} per round` + (isMixed(genBucket) ? '' : (gr.cap.n - gr.cap.matches * bucketSize(genBucket) ? `, ${gr.cap.n - gr.cap.matches * bucketSize(genBucket)} sit out` : '')) : 'not enough players, skipped')).join('  ·  ');
    document.getElementById('btnGenConfirm').disabled = !gs.some(gr => gr.cap.matches >= 1);
    return;
  }
  if (isMixed(genBucket)) {
    const sel = genList.filter(p => genSelected.has(p.id) && genderOf(p));
    const nm = sel.filter(p => genderOf(p) === 'M').length, nw = sel.filter(p => genderOf(p) === 'F').length;
    const k = Math.min(Math.floor(nm / 2), Math.floor(nw / 2)), sit = nm + nw - 4 * k;
    const el0 = document.getElementById('genSummary');
    el0.textContent = k < 1 ? `Need at least 2 men and 2 women (selected ${nm} men, ${nw} women).`
      : `${nm} men · ${nw} women → ${k} match${k === 1 ? '' : 'es'} per round (each team 1 man + 1 woman)` + (sit ? `, ${sit} sit out each round (rotated fairly)` : '') + '.';
    document.getElementById('btnGenConfirm').disabled = k < 1;
    return;
  }
  const g = bucketSize(genBucket);
  let n = genSelected.size;
  if (isFixed(genBucket)) n = pairUnits(genList.filter(p => genSelected.has(p.id))).length * 2;
  const perRound = Math.floor(n / g);
  const sit = n - perRound * g;
  const el = document.getElementById('genSummary');
  el.textContent = n < g ? `Need at least ${g} players (selected ${n}).` : `${n} selected → ${perRound} match${perRound===1?'':'es'} per round` + (sit ? `, ${sit} sit out each round (rotated fairly)` : '') + '.';
  document.getElementById('btnGenConfirm').disabled = n < g;
}
function gamesPlayed(p){
  const k = refKeyFor(p);
  return sessionLogs().filter(l => [...(l.team1||[]), ...(l.team2||[])].some(x => refKeyFor(x) === k)).length;
}
function gamesPending(p){ return queueMatches.filter(m => QUEUE_MATCH_STATUSES.includes(m.status) && isInMatch(p.id, m)).length; }
function refreshGenList(){
  if (!genOverlay.classList.contains('show') || !genBucket) return;
  genList = genBaseList();
  const ids = new Set(genList.map(p => p.id));
  genSelected = new Set([...genSelected].filter(id => ids.has(id)));
  genRender();
}
function genRender(){
  const list = document.getElementById('genList');
  const dupNames = participants.filter(p => p.bucket === genBucket && isDuplicate(p)).map(p => p.name);
  const unNames = bucketHasPools(genBucket) ? participants.filter(p => p.bucket === genBucket && !isDuplicate(p) && !poolIdOf(p)).map(p => p.name) : [];
  const dupNote = (dupNames.length ? `<div class="gen-note">Not available (duplicate, resolve first): ${escapeHtml(dupNames.join(', '))}</div>` : '') + (unNames.length ? `<div class="gen-note">Not in a pool yet (assign them in Participants): ${escapeHtml(unNames.join(', '))}</div>` : '');
  if (!genList.length){ list.innerHTML = dupNote + `<div style="padding:16px;color:var(--muted);font-size:13px;text-align:center;">No available participants in this category.</div>`; genUpdateSummary(); return; }
  const pIds = playingIds();
  list.innerHTML = dupNote + genList.map(p => {
    const s = playerState(p, pIds);
    if (isMixed(genBucket) && !genderOf(p)) {
      return `<label class="gen-row nogender"><input type="checkbox" data-id="${p.id}" disabled><span class="gen-name">${escapeHtml(p.name)} <span class="badge nogender">Tag gender</span> <span class="gtoggle"><button type="button" data-gtag="M" data-pid="${p.id}">M</button><button type="button" data-gtag="F" data-pid="${p.id}">F</button></span></span><span class="gen-state s-${s}">${STATUS_LABELS[s]}</span></label>`;
    }
    return `<label class="gen-row"><input type="checkbox" data-id="${p.id}" ${genSelected.has(p.id)?'checked':''}><span class="gen-name">${escapeHtml(p.name)}${isMixed(genBucket) ? genderSym(p) : ''}${fixedTag(p)}${genPoolSel === '*' ? poolTagHtml(p.bucket, poolIdOf(p)) : ''}<span class="gen-meta">(Played: ${gamesPlayed(p)} | Pending: ${gamesPending(p)})</span></span><span class="gen-state s-${s}">${STATUS_LABELS[s]}</span></label>`;
  }).join('');
  list.querySelectorAll('button[data-gtag]').forEach(btn => btn.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    genSelected.add(btn.dataset.pid);
    setGender(btn.dataset.pid, btn.dataset.gtag);
  }));
  list.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) genSelected.add(cb.dataset.id); else genSelected.delete(cb.dataset.id);
    genUpdateSummary();
  }));
  genUpdateSummary();
}
function openGenerateModal(bucketKey){
  genBucket = bucketKey;
  const b = BUCKETS.find(x=>x.key===bucketKey);
  document.getElementById('genTitle').textContent = 'Generate matchups · ' + b.label;
  const gpf = document.getElementById('genPoolField');
  if (bucketHasPools(bucketKey)) {
    genPoolSel = '*';
    document.getElementById('genPool').innerHTML = `<option value="*">All pools (each pool separately)</option>` + bucketPools(bucketKey).map(q => `<option value="${q.id}">${escapeHtml(q.name)}</option>`).join('');
    document.getElementById('genPool').value = '*';
    gpf.style.display = '';
  } else { genPoolSel = ''; gpf.style.display = 'none'; }
  genList = genBaseList();
  genSelected = new Set(genList.filter(p => p.status !== 'resting' && genEligible(p)).map(p => p.id));
  document.getElementById('errGen').textContent = '';
  genRender();
  genOverlay.classList.add('show');
}
document.getElementById('genPool').onchange = e => {
  genPoolSel = e.target.value; genList = genBaseList();
  genSelected = new Set(genList.filter(p => p.status !== 'resting' && genEligible(p)).map(p => p.id));
  document.getElementById('errGen').textContent = '';
  genRender();
};
document.getElementById('genAll').onclick = () => { genSelected = new Set(genList.filter(genEligible).map(p=>p.id)); genRender(); };
document.getElementById('genNone').onclick = () => { genSelected = new Set(); genRender(); };
document.getElementById('genAvail').onclick = () => { genSelected = new Set(genList.filter(p=>p.status==='active' && genEligible(p)).map(p=>p.id)); genRender(); };
document.getElementById('btnGenCancel').onclick = () => genOverlay.classList.remove('show');
document.getElementById('btnGenConfirm').onclick = () => {
  const g = bucketSize(genBucket);
  const selected = genList.filter(p => genSelected.has(p.id) && genEligible(p));
  const rounds = Math.max(1, Math.min(30, parseInt(document.getElementById('genRounds').value, 10) || 1));
  if (bucketHasPools(genBucket)) {
    const valid = genGroups().filter(gr => genCapacity(gr.list).matches >= 1);
    if (!valid.length) { document.getElementById('errGen').textContent = 'No pool has enough selected players to make a match.'; return; }
    generateSuggestions(genBucket, valid.flatMap(v => v.list), rounds, valid.map(v => v.list));
    genOverlay.classList.remove('show');
    return;
  }
  if (isMixed(genBucket)) {
    const nm = selected.filter(p => genderOf(p) === 'M').length, nw = selected.filter(p => genderOf(p) === 'F').length;
    if (nm < 2 || nw < 2) { document.getElementById('errGen').textContent = 'Mixed doubles needs at least 2 men and 2 women (tagged).'; return; }
    generateSuggestions(genBucket, selected, rounds);
    genOverlay.classList.remove('show');
    return;
  }
  const playable = isFixed(genBucket) ? pairUnits(selected).length * 2 : selected.length;
  if (playable < g){ document.getElementById('errGen').textContent = isFixed(genBucket) ? 'Select at least 2 complete pairs (both partners).' : `Select at least ${g} players.`; return; }
  generateSuggestions(genBucket, selected, rounds);
  genOverlay.classList.remove('show');
};

function currentMatchIdSetFrom(arr){ return new Set(arr.map(p => p.id)); }
function matchIdSetFromSnapshot(m){ return new Set([...m.team1, ...m.team2].map(p => p.participantId)); }
function findDuplicateMatch(bucketKey, idSet, excludeMatchId){
  return queueMatches.find(x => x.id !== excludeMatchId && QUEUE_MATCH_STATUSES.includes(x.status) && x.bucket === bucketKey && setsEqual(matchIdSetFromSnapshot(x), idSet));
}
function snapshotArr(arr){ return arr.map(p => ({ participantId:p.id, name:p.name, duprId:p.duprId||'', dupr:p.dupr, sourceType:p.sourceType, memberId:p.memberId||null, ...(p.refKey ? { refKey:p.refKey } : {}) })); }

/* One batch per match (or per round): match, player status, stats and counters together.
   No transaction and no waiting for the server: Firestore applies the write locally right away,
   so the queue updates instantly, and it syncs in the background (also after a connection drop). */
let localMatchCounter = 0, localCounterSession = null;
function nextMatchNo(){
  const sid = sessionState.currentSessionId || null;
  if (sid !== localCounterSession) { localCounterSession = sid; localMatchCounter = 0; }
  const fromDocs = Math.max(0, ...queueMatches.map(m => parseInt(String(m.matchId || '').replace(/\D/g, ''), 10) || 0));
  localMatchCounter = Math.max(localMatchCounter, Number(sessionState.matchCounter) || 0, fromDocs) + 1;
  return localMatchCounter;
}
function queueMatchesBatch(items, onFail){
  const results = [], seen = new Set();
  items.forEach(it => {
    const ids = [...it.team1, ...it.team2].map(p => p.id);
    const key = it.bucketKey + '|' + [...ids].sort().join('|');
    if (seen.has(key) || findDuplicateMatch(it.bucketKey, new Set(ids), null)) { results.push({ ok:false, error:'This exact matchup is already queued.' }); return; }
    seen.add(key); results.push({ ok:true, item: it });
  });
  if (!results.some(r => r.ok)) return { results, commit: null };
  const batch = db.batch(), now = Date.now(), FV = firebase.firestore.FieldValue;
  const partnerInc = {}, opponentInc = {}, players = new Map();
  const bump = (obj, a, b) => { const k = pairKey(a, b); obj[k] = (obj[k] || 0) + 1; };
  let lastNo = 0;
  results.forEach(r => {
    if (!r.ok) return;
    const { bucketKey, team1, team2 } = r.item;
    lastNo = nextMatchNo();
    r.matchId = 'M-' + String(lastNo).padStart(3, '0');
    if (team1.length === 2) bump(partnerInc, team1[0].id, team1[1].id);
    if (team2.length === 2) bump(partnerInc, team2[0].id, team2[1].id);
    for (const p of team1) for (const q of team2) bump(opponentInc, p.id, q.id);
    [...team1, ...team2].forEach(p => players.set(p.id, p));
    batch.set(db.collection('pkl-queue-matches').doc(), { matchId: r.matchId, bucket: bucketKey, ...(poolIdOf(team1[0]) ? { pool: poolIdOf(team1[0]) } : {}), team1: snapshotArr(team1), team2: snapshotArr(team2),
      status:'waiting', court:null, startedAt:null, order: nextQueueOrder(), createdAt: FV.serverTimestamp() });
  });
  players.forEach(p => {
    const lp = participantOf(p) || p;                       // LIVE participant, so the elapsed time is right
    const w = elapsedWrite(lp);
    if (w) batch.set(w.ref, w.data, { merge:true });
    batch.update(db.collection('pkl-queue-participants').doc(p.id), { status:'queued', statusSince: now });
  });
  const toInc = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, FV.increment(v)]));
  const sess = { matchCounter: lastNo };
  if (Object.keys(partnerInc).length) sess.partnerCounts = toInc(partnerInc);      // never send an empty map: with merge it would wipe the history
  if (Object.keys(opponentInc).length) sess.opponentCounts = toInc(opponentInc);
  batch.set(db.collection('pkl-queue-session').doc('state'), sess, { merge:true });
  players.forEach(p => { const lp = participantOf(p); if (lp) { lp.status = 'queued'; lp.statusSince = now; } });   // keep local clock in sync for back-to-back commits
  const commit = batch.commit();
  commit.catch(err => { showToast('Could not save to the server: ' + err.message, true); if (onFail) onFail(err); });
  return { results, commit };
}
function commitMatchToQueue(bucketKey, team1, team2, onFail){
  const { results } = queueMatchesBatch([{ bucketKey, team1, team2 }], onFail);
  if (!results[0].ok) throw new Error(results[0].error);
  return results[0].matchId;
}
function addSuggestionToQueue(bucketKey, ri, mi){
  const m = sugg(bucketKey).rounds[ri]?.matches[mi];
  if (!m || m.added) return;
  try {
    const matchId = commitMatchToQueue(bucketKey, m.team1, m.team2, () => { m.added = false; renderSuggestions(bucketKey); });
    m.added = true;
    renderSuggestions(bucketKey);
    showToast(`${matchId} added to queue.`);
  } catch (err) { showToast('Could not add match: ' + err.message, true); renderSuggestions(bucketKey); }
}
function addRoundToQueue(bucketKey, ri){
  const rd = sugg(bucketKey).rounds[ri];
  if (!rd) return;
  const pending = rd.matches.filter(m => !m.added);
  if (!pending.length) return;
  const { results } = queueMatchesBatch(pending.map(m => ({ bucketKey, team1: m.team1, team2: m.team2 })),
    () => { pending.forEach(m => { m.added = false; }); renderSuggestions(bucketKey); });
  let ok = 0;
  results.forEach((r, i) => { if (r.ok) { pending[i].added = true; ok++; } else showToast(r.error, true); });
  renderSuggestions(bucketKey);
  if (ok) showToast(`Round ${ri+1}: ${ok} match${ok===1?'':'es'} added to queue.`);
}
function addAllSuggestions(bucketKey){
  const pending = sugg(bucketKey).rounds.flatMap(rd => rd.matches).filter(m => !m.added);
  if (!pending.length) return;
  const { results } = queueMatchesBatch(pending.map(m => ({ bucketKey, team1: m.team1, team2: m.team2 })),
    () => { pending.forEach(m => { m.added = false; }); renderSuggestions(bucketKey); });
  let ok = 0;
  results.forEach((r, i) => { if (r.ok) { pending[i].added = true; ok++; } else showToast(r.error, true); });
  renderSuggestions(bucketKey);
  if (ok) showToast(`${ok} match${ok===1?'':'es'} added to queue.`);
}
function discardSuggestions(bucketKey){ suggestionState[bucketKey] = { rounds:[] }; renderSuggestions(bucketKey); }

function renderMatchupBuckets(){
  const wrap = document.getElementById('bucketCards-matchups');
  if (!bucketsLoaded) { wrap.innerHTML = `<div class="empty-row" style="padding:20px;color:var(--muted);grid-column:1/-1;">Loading…</div>`; return; }
  if (!BUCKETS.length) { wrap.innerHTML = `<div class="bucket-card" style="grid-column:1/-1;"><div style="padding:28px 20px;text-align:center;color:var(--muted);">No categories yet. Add categories in the Participants tab and they will show up here.</div></div>`; return; }
  wrap.innerHTML = BUCKETS.map(b => `
    <div class="bucket-card">
      <div class="bucket-head"><h3><span class="bucket-tag" style="background:${b.color}"></span>${escapeHtml(b.label)}${modeTagHtml(b)}</h3><span class="count" id="poolCount-${b.key}"></span></div>
      <div class="sugg-toolbar">
        <button class="btn btn-primary btn-sm" onclick="openGenerateModal('${b.key}')">🔀 Generate matchups</button>
        <button class="btn btn-ghost btn-sm" onclick="openCustomMatchModal('${b.key}')">➕ Custom match</button>
        <button class="btn btn-ghost btn-sm" onclick="this.disabled=true; addAllSuggestions('${b.key}').finally(()=>{this.disabled=false;})">Add all to queue</button>
        <button class="btn btn-ghost btn-sm" onclick="discardSuggestions('${b.key}')">Discard</button>
      </div>
      <div class="sugg-body" id="suggBody-${b.key}"><div style="color:var(--muted);font-size:13px;">No suggestions yet — click "Generate matchups".</div></div>
    </div>`).join('');
  updateMatchupPoolCounts();
  BUCKETS.forEach(b => renderSuggestions(b.key));
}
function updateMatchupPoolCounts(){
  BUCKETS.forEach(b => {
    const el = document.getElementById('poolCount-'+b.key);
    if (!el) return;
    const inBucket = participants.filter(p => p.bucket===b.key);
    const pl = b.pools || [], un = pl.length ? inBucket.filter(p => !pl.some(q => q.id === p.pool)).length : 0;
    el.textContent = `${inBucket.filter(p => p.status==='active').length} available · ${inBucket.length} in category` + (pl.length ? ` · ${pl.length} pools` + (un ? ` · ${un} unassigned` : '') : '');
  });
}

/* ================= COURTS & QUEUE ================= */
function renderCourts(){
  const grid = document.getElementById('courtsGrid');
  const active = queueMatches.filter(m => COURT_BUSY_STATUSES.includes(m.status));
  let html = '';
  for (const c of courtOrder()){
    const m = active.find(x => x.court === c);
    if (!m) {
      if (!courtsActive()) {
        html += `<div class="court-card free inactive" data-court="${c}">
        <div class="court-title"><h3>Court ${c}</h3><span class="court-status free">Not active</span></div>
        <div class="court-empty">Press "Activate Courts (ALL)" to start the session.</div>
      </div>`;
      } else {
        html += `<div class="court-card free" data-court="${c}" data-free="1">
        <div class="court-title"><h3>Court ${c}</h3><span class="court-status free">Available</span></div>
        <div class="court-empty">Drag a match here, or use "Add to court" in the queue.</div>
      </div>`;
      }
    } else if (m.status === 'assigned') {
      const t1=m.team1.map(p=>p.name).join(' & '), t2=m.team2.map(p=>p.name).join(' & ');
      html += `<div class="court-card assigned" data-court="${c}">
        <div class="court-title"><h3>Court ${c}</h3><span class="court-status assigned">Not started</span></div>
        <div class="court-match"><div class="mid">${m.matchId} · ${bucketLabelHtml(m.bucket)}${poolTagHtml(m.bucket, matchPoolId(m))}</div>
          <div class="teams">${escapeHtml(t1)} <span style="color:var(--muted);font-weight:400;">vs</span> ${escapeHtml(t2)}</div></div>
        <div class="row-actions" style="margin-bottom:8px;">
          <button class="btn btn-primary btn-sm" onclick="startGame('${m.id}')">▶ Start game</button>
          <button class="btn btn-ghost btn-sm" onclick="callPlayers('${m.id}')">📣 Call players</button>
        </div>
        <button class="btn btn-ghost btn-sm" style="width:100%;" onclick="backToQueue('${m.id}')">↩ Back to queue</button>
      </div>`;
    } else {
      const t1=m.team1.map(p=>p.name).join(' & '), t2=m.team2.map(p=>p.name).join(' & ');
      html += `<div class="court-card busy" data-court="${c}">
        <div class="court-title"><h3>Court ${c}</h3><span class="court-status busy">In progress</span></div>
        <div class="court-match"><div class="mid">${m.matchId} · ${bucketLabelHtml(m.bucket)}${poolTagHtml(m.bucket, matchPoolId(m))}</div>
          <div class="teams">${escapeHtml(t1)} <span style="color:var(--muted);font-weight:400;">vs</span> ${escapeHtml(t2)}</div></div>
        <div class="court-timer timer" data-started="${m.startedAt}">00:00</div>
        <div class="row-actions">
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="openEndModal('${m.id}')">End match</button>
          <button class="btn-icon" title="Reset timer" onclick="resetTimer('${m.id}')">⟲</button>
        </div>
      </div>`;
    }
  }
  grid.innerHTML = html;
  attachCourtDropZones();
}
/* ---- Activate courts / flip courts (admin view only) ---- */
let flipCourts = localStorage.getItem('pkl-flip-courts') === '1';
function courtOrder(){ const a = Array.from({ length: COURTS }, (_, i) => i + 1); return flipCourts ? a.reverse() : a; }
function updateCourtsButtons(){
  const act = document.getElementById('btnActivateCourts');
  if (!act) return;
  if (courtsActive()) {
    let t = '';
    try { t = new Date(Number(sessionState.courtsActiveAt)).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); } catch (e) {}
    act.textContent = `✓ Courts active${t ? ' · since ' + t : ''}`;
    act.disabled = true; act.classList.remove('btn-primary'); act.classList.add('btn-ghost');
  } else if (sessionState.sessionEndedAt) {
    act.textContent = '⏹ Session ended';
    act.disabled = true; act.classList.remove('btn-primary'); act.classList.add('btn-ghost');
  } else {
    act.textContent = '▶ Activate Courts (ALL)';
    act.disabled = false; act.classList.add('btn-primary'); act.classList.remove('btn-ghost');
  }
  document.getElementById('btnFlipCourts').textContent = flipCourts ? `⇅ Flipped: ${COURTS} → 1 (tap to reset)` : '⇅ Flip courts';
  const lbl = document.getElementById('courtCountLabel');
  if (lbl) lbl.textContent = `${COURTS} court${COURTS===1?'':'s'}`;
  const addB = document.getElementById('btnAddCourt'), remB = document.getElementById('btnRemoveCourt');
  if (addB) { addB.disabled = COURTS >= MAX_COURTS; addB.title = COURTS >= MAX_COURTS ? 'Maximum of 5 courts' : 'Add Court ' + (COURTS + 1); }
  if (remB) { remB.disabled = COURTS <= 1; }
}
document.getElementById('btnActivateCourts').addEventListener('click', async () => {
  if (courtsActive() || sessionState.sessionEndedAt) return;
  if (!confirm('Start the session now?\n\nWaiting, playing and resting timers start counting from this moment, and matches can be assigned to courts.')) return;
  try { await db.collection('pkl-queue-session').doc('state').set({ courtsActiveAt: Date.now() }, { merge:true }); showToast('Courts activated. Timers are running.'); }
  catch (err) { showToast('Could not activate courts: ' + err.message, true); }
});
document.getElementById('btnFlipCourts').addEventListener('click', () => {
  flipCourts = !flipCourts;
  localStorage.setItem('pkl-flip-courts', flipCourts ? '1' : '0');
  updateCourtsButtons();
  renderCourts();
});
updateCourtsButtons();

/* ---- Add / remove a court during the session ---- */
let courtCountBusy = false;
async function changeCourtCount(delta){
  const prev = COURTS, next = prev + delta;
  if (courtCountBusy || next < 1 || next > MAX_COURTS) return;
  if (delta < 0) {
    const inUse = queueMatches.find(m => COURT_BUSY_STATUSES.includes(m.status) && Number(m.court) > next);
    if (inUse) {
      showToast(`Court ${inUse.court} is still in use (${inUse.status === 'playing' ? 'a game is in progress' : 'a match is assigned'}). End it or send it back to the queue first.`, true);
      return;
    }
    if (!confirm(`Remove Court ${prev}? It will disappear from the admin and the TV display, and category court selections are adjusted.`)) return;
  }
  courtCountBusy = true;
  try {
    const batch = db.batch();
    batch.set(db.collection('pkl-queue-session').doc('state'), { courtCount: next }, { merge:true });
    BUCKETS.forEach(b => {
      const raw = b.courts || [];
      if (!raw.length) return;
      let nc = raw;
      if (delta > 0) { if (allCourtsList(prev).every(c => raw.includes(c))) nc = allCourtsList(next); }   // buckets that used every court get the new one too
      else { nc = raw.filter(c => c <= next); if (!nc.length) nc = allCourtsList(next); }
      if (nc.join(',') !== raw.join(',')) batch.update(db.collection('pkl-queue-buckets').doc(b.key), { courts: nc });
    });
    await batch.commit();
    showToast(delta > 0 ? `Court ${next} added.` : `Court ${prev} removed.`);
  } catch (err) { showToast('Could not change courts: ' + err.message, true); }
  finally { courtCountBusy = false; }
}
document.getElementById('btnAddCourt').addEventListener('click', () => changeCourtCount(1));
document.getElementById('btnRemoveCourt').addEventListener('click', () => changeCourtCount(-1));

function attachCourtDropZones(){
  document.querySelectorAll('.court-card[data-free="1"]').forEach(card => {
    card.addEventListener('dragover', e => {
      const dm = draggingQueueId ? queueMatches.find(x => x.id === draggingQueueId) : null;
      if (dm && !bucketAllowsCourt(dm.bucket, card.dataset.court)) { card.style.borderColor='var(--red)'; return; }
      e.preventDefault(); card.style.borderColor='var(--gold)';
    });
    card.addEventListener('dragleave', () => { card.style.borderColor=''; });
    card.addEventListener('drop', e => {
      e.preventDefault(); card.style.borderColor='';
      try { const data = JSON.parse(e.dataTransfer.getData('text/plain')); if (data.type==='queue') assignToCourt(data.id, Number(card.dataset.court)); } catch(err){}
    });
  });
}
setInterval(() => {
  document.querySelectorAll('.timer').forEach(el => {
    const started = Number(el.dataset.started);
    if (!started) return;
    const secs = Math.max(0, Math.floor((Date.now() - started) / 1000));
    el.textContent = `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
  });
}, 1000);

function renderQueueList(){
  const list = queueMatches.filter(m => m.status==='waiting' || m.status==='onhold').sort((a,b) => a.order - b.order);
  const el = document.getElementById('queueList');
  if (!list.length) { el.innerHTML = `<div class="empty-row" style="padding:20px;color:var(--muted);">Queue is empty. Add matches from Match Suggestions.</div>`; return; }
  el.innerHTML = list.map((m, i) => `
    <div class="queue-row ${m.status==='onhold'?'onhold':''}" draggable="true" data-match-id="${m.id}">
      <div class="drag-handle" title="Drag to reorder or assign to a court">⠿</div>
      <div class="row-actions q-move">
        <button class="btn-icon" title="Move up" ${i===0?'disabled':''} onclick="moveQueueMatch('${m.id}',-1)">▲</button>
        <button class="btn-icon" title="Move down" ${i===list.length-1?'disabled':''} onclick="moveQueueMatch('${m.id}',1)">▼</button>
      </div>
      <span class="qlight" data-mid="${m.id}" style="display:none"></span>
      <div class="qid">${m.matchId}</div>
      <div class="qteams">${teamWithWaitHtml(m.team1)}
        <span style="color:var(--muted);font-weight:400;"> vs </span>${teamWithWaitHtml(m.team2)}
        ${m.status==='onhold' ? '<span class="badge hold" style="margin-left:8px;">On hold</span>' : ''}</div>
      <div class="qmeta">${bucketLabelHtml(m.bucket)}${poolTagHtml(m.bucket, matchPoolId(m))}</div>
      <div class="row-actions">
        <button class="btn-icon" title="Edit teams" onclick="openEditQueueModal('${m.id}')">✎</button>
        <button class="btn-icon" title="Replace player" onclick="openReplaceModal('${m.id}')">🔁</button>
        <button class="btn-icon warn" title="${m.status==='onhold'?'Resume':'Hold'}" onclick="${m.status==='onhold'?`resumeMatch('${m.id}')`:`holdMatch('${m.id}')`}">${m.status==='onhold'?'▶':'⏸'}</button>
        <button class="btn-icon danger" title="Delete" onclick="deleteQueueMatch('${m.id}')">🗑</button>
      </div>
      <button class="btn btn-primary btn-sm" title="${courtsActive()?'':'Activate courts first'}" ${m.status==='onhold'||!courtsActive()||freeCourtsFor(m.bucket)<=0?'disabled':''} onclick="openCourtModal('${m.id}')">Add to court</button>
    </div>
  `).join('');
  attachQueueDrag();
  updateWaitTimes();
}
let draggingQueueId = null;
function queueOrderedList(){ return queueMatches.filter(m => m.status==='waiting' || m.status==='onhold').sort((a,b) => a.order - b.order); }
function clearQueueDropMarks(){ document.querySelectorAll('.queue-row.drop-before,.queue-row.drop-after').forEach(r => r.classList.remove('drop-before','drop-after')); }
function attachQueueDrag(){
  document.querySelectorAll('.queue-row[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', e => {
      draggingQueueId = row.dataset.matchId;
      e.dataTransfer.setData('text/plain', JSON.stringify({type:'queue', id: row.dataset.matchId}));
      e.dataTransfer.effectAllowed = 'move';
      row.style.opacity = '0.5';
    });
    row.addEventListener('dragend', () => { row.style.opacity = ''; draggingQueueId = null; clearQueueDropMarks(); });
    row.addEventListener('dragover', e => {
      if (!draggingQueueId || draggingQueueId === row.dataset.matchId) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      clearQueueDropMarks();
      row.classList.add(after ? 'drop-after' : 'drop-before');
    });
    row.addEventListener('dragleave', e => { if (!row.contains(e.relatedTarget)) row.classList.remove('drop-before','drop-after'); });
    row.addEventListener('drop', e => {
      if (!draggingQueueId || draggingQueueId === row.dataset.matchId) return;
      e.preventDefault();
      const after = row.classList.contains('drop-after');
      const dragId = draggingQueueId;
      clearQueueDropMarks();
      const others = queueOrderedList().filter(m => m.id !== dragId);
      const idx = others.findIndex(m => m.id === row.dataset.matchId);
      if (idx < 0) return;
      reorderQueueMatch(dragId, after ? idx + 1 : idx);
    });
  });
}
function moveQueueMatch(id, dir){
  const i = queueOrderedList().findIndex(m => m.id === id);
  if (i < 0) return;
  reorderQueueMatch(id, i + dir);
}
/* Insert (not swap): newIndex is the final position among the other queued matches. */
async function reorderQueueMatch(id, newIndex){
  const list = queueOrderedList();
  const curIndex = list.findIndex(m => m.id === id);
  if (curIndex < 0) return;
  const others = list.filter(m => m.id !== id);
  newIndex = Math.max(0, Math.min(others.length, newIndex));
  if (newIndex === curIndex) return;
  const prev = others[newIndex - 1], next = others[newIndex];
  const col = db.collection('pkl-queue-matches');
  const onErr = err => showToast('Could not move match: ' + err.message, true);
  try {
    if (!prev && !next) return;
    if (!prev) col.doc(id).update({ order: next.order - 1000 }).catch(onErr);
    else if (!next) col.doc(id).update({ order: nextQueueOrder() }).catch(onErr);
    else if (next.order - prev.order > 0.001) col.doc(id).update({ order: (prev.order + next.order) / 2 }).catch(onErr);
    else {
      const seq = others.slice(); seq.splice(newIndex, 0, list[curIndex]);
      const base = Math.min(...list.map(m => m.order));
      const batch = db.batch();
      seq.forEach((m, i) => batch.update(col.doc(m.id), { order: base + i * 1000 }));
      batch.commit().catch(onErr);
    }
  } catch (err) { onErr(err); }
}
/* ---- Optimize queue (preview first; first 4 locked; On Hold stays put) ---- */
const OPT_LOCK = 4;
const OPT_CONSEC = { 1:100, 2:40, 3:12, 4:4, 5:1 };   // penalty per shared player, by how many games apart
const OPT_SAME_BUCKET = 20, OPT_SAME_BUCKET_RUN = 10;
function matchPlayerIds(m){ return [...m.team1, ...m.team2].map(p => p.participantId); }
function planOptimizedQueue(list){
  const n = list.length, result = new Array(n).fill(null);
  const origIdx = new Map(list.map((m, i) => [m.id, i]));
  const movable = [];
  list.forEach((m, i) => { if (i < OPT_LOCK || m.status === 'onhold') result[i] = m; else movable.push(m); });
  const onCourt = queueMatches.filter(m => COURT_BUSY_STATUSES.includes(m.status));
  const courtPlayers = new Set(onCourt.flatMap(matchPlayerIds));
  const busy = new Set(onCourt.map(m => m.court));
  const freeSet = new Set(Array.from({ length: COURTS }, (_, i) => i + 1).filter(c => !busy.has(c)));
  const canClaim = b => bucketCourts(b).some(c => freeSet.has(c));
  const claim = b => { const c = bucketCourts(b).find(x => freeSet.has(x)); if (c !== undefined) freeSet.delete(c); };
  result.forEach(m => { if (m && m.status === 'waiting') claim(m.bucket); });   // locked matches take free courts first
  const now = Date.now();
  const waitMin = m => {
    const ws = matchPlayerIds(m).map(id => { const p = participants.find(x => x.id === id); return p && p.statusSince ? (now - p.statusSince) / 60000 : 0; });
    return ws.reduce((a, b) => a + b, 0) / Math.max(1, ws.length);
  };
  const waits = new Map(movable.map(m => [m.id, waitMin(m)]));
  const remaining = {};
  movable.forEach(m => { remaining[m.bucket] = (remaining[m.bucket] || 0) + 1; });
  const pool = movable.slice();
  const prevPlayable = idx => { const out = []; for (let j = idx - 1; j >= 0 && out.length < 5; j--) if (result[j] && result[j].status !== 'onhold') out.push(result[j]); return out; };
  for (let idx = 0; idx < n; idx++) {
    if (result[idx]) continue;
    const prev = prevPlayable(idx), prevIds = prev.map(matchPlayerIds);
    let best = null, bestCost = Infinity;
    pool.forEach(c => {
      const pids = matchPlayerIds(c);
      let cost = 0;
      prevIds.forEach((ids, k) => { cost += pids.filter(id => ids.includes(id)).length * (OPT_CONSEC[k + 1] || 0); });
      if (OPT_CONSEC[prev.length + 1] && prev.length < 5) cost += pids.filter(id => courtPlayers.has(id)).length * OPT_CONSEC[prev.length + 1];
      if (prev[0] && prev[0].bucket === c.bucket) { cost += OPT_SAME_BUCKET; if (prev[1] && prev[1].bucket === c.bucket) cost += OPT_SAME_BUCKET_RUN; }
      cost -= 8 * ((remaining[c.bucket] || 0) / pool.length);
      cost -= Math.min(30, 1.5 * (waits.get(c.id) || 0));
      cost += 2 * Math.max(0, idx - origIdx.get(c.id));
      if (canClaim(c.bucket)) cost -= 10;
      if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) <= 1e-9 && best && origIdx.get(c.id) < origIdx.get(best.id))) { best = c; bestCost = cost; }
    });
    result[idx] = best;
    pool.splice(pool.indexOf(best), 1);
    remaining[best.bucket]--;
    claim(best.bucket);
  }
  return result;
}
function queueQuality(seq){
  const play = seq.filter(m => m.status !== 'onhold');
  let b2b = 0, sameBucket = 0;
  play.forEach((m, i) => {
    if (i > 0 && play[i - 1].bucket === m.bucket) sameBucket++;
    const ids = matchPlayerIds(m);
    for (let d = 1; d <= 2; d++) { const pr = play[i - d]; if (pr) { const pi = matchPlayerIds(pr); b2b += ids.filter(id => pi.includes(id)).length; } }
  });
  return { b2b, sameBucket };
}
const optOverlay = document.getElementById('optOverlay');
let optPlan = null, lastOptimizeUndo = null;
function optRowHtml(m, i, beforeIdx, isAfter){
  const hold = m.status === 'onhold', locked = i < OPT_LOCK;
  let tag = '';
  if (hold) tag = '<span class="badge hold">On hold</span>';
  else if (locked) tag = '<span title="Locked">🔒</span>';
  else if (isAfter) { const d = beforeIdx.get(m.id) - i; if (d > 0) tag = `<span class="opt-move up">▲ ${d}</span>`; else if (d < 0) tag = `<span class="opt-move down">▼ ${-d}</span>`; }
  const moved = isAfter && !hold && !locked && beforeIdx.get(m.id) !== i;
  return `<div class="opt-row ${moved ? 'moved' : ''} ${(hold || locked) ? 'fixed' : ''}">
    <div class="opt-pos">${i + 1}</div>
    <div class="opt-body"><div class="opt-teams">${escapeHtml(m.team1.map(p => p.name).join(' & '))} <span style="color:var(--muted);font-weight:400;">vs</span> ${escapeHtml(m.team2.map(p => p.name).join(' & '))}</div>
      <div class="opt-sub">${m.matchId} · ${bucketLabelHtml(m.bucket)}${poolTagHtml(m.bucket, matchPoolId(m))}</div></div>${tag}</div>`;
}
function openOptimizeModal(){
  const list = queueOrderedList();
  const movableCount = list.filter((m, i) => i >= OPT_LOCK && m.status === 'waiting').length;
  if (movableCount < 2) { optOverlay.classList.remove('show'); showToast(`Nothing to optimize yet. The first ${OPT_LOCK} matches are locked and at least 2 more are needed.`, true); return; }
  const after = planOptimizedQueue(list);
  if (!after.some((m, i) => m.id !== list[i].id)) { optOverlay.classList.remove('show'); showToast('The queue is already well arranged.'); return; }
  optPlan = { after, signature: list.map(m => m.id).join('|'), orders: list.map(m => m.order) };
  const beforeIdx = new Map(list.map((m, i) => [m.id, i]));
  document.getElementById('optSub').textContent = `First ${OPT_LOCK} matches and On Hold matches stay where they are. Nothing changes until you apply.`;
  document.getElementById('optBefore').innerHTML = list.map((m, i) => optRowHtml(m, i, beforeIdx, false)).join('');
  document.getElementById('optAfter').innerHTML = after.map((m, i) => optRowHtml(m, i, beforeIdx, true)).join('');
  const q0 = queueQuality(list), q1 = queueQuality(after);
  document.getElementById('optMetrics').innerHTML =
    `Back-to-back games (same player within 2 games): <b>${q0.b2b} → ${q1.b2b}</b><br>Same-category matches next to each other: <b>${q0.sameBucket} → ${q1.sameBucket}</b>`;
  optOverlay.classList.add('show');
}
document.getElementById('btnOptimizeQueue').addEventListener('click', openOptimizeModal);
document.getElementById('btnOptCancel').addEventListener('click', () => optOverlay.classList.remove('show'));
optOverlay.addEventListener('click', e => { if (e.target === optOverlay) optOverlay.classList.remove('show'); });
document.getElementById('btnOptApply').addEventListener('click', async () => {
  if (!optPlan) return;
  const cur = queueOrderedList();
  if (cur.map(m => m.id).join('|') !== optPlan.signature) { showToast('The queue changed while you were reviewing. Here is a fresh preview.', true); openOptimizeModal(); return; }
  const btn = document.getElementById('btnOptApply');
  btn.disabled = true;
  try {
    const batch = db.batch(), undo = [];
    optPlan.after.forEach((m, i) => {
      const newOrder = optPlan.orders[i];
      if (m.order !== newOrder) { undo.push({ id: m.id, order: m.order }); batch.update(db.collection('pkl-queue-matches').doc(m.id), { order: newOrder }); }
    });
    batch.commit().catch(err => showToast('Could not optimize: ' + err.message, true));
    lastOptimizeUndo = undo;
    document.getElementById('btnUndoOptimize').style.display = '';
    optOverlay.classList.remove('show');
    showToast(`Queue optimized (${undo.length} match${undo.length === 1 ? '' : 'es'} moved).`);
  } catch (err) { showToast('Could not optimize: ' + err.message, true); }
  finally { btn.disabled = false; }
});
document.getElementById('btnUndoOptimize').addEventListener('click', async () => {
  const undo = lastOptimizeUndo;
  const btn = document.getElementById('btnUndoOptimize');
  if (!undo) { btn.style.display = 'none'; return; }
  const live = new Map(queueMatches.map(m => [m.id, m]));
  try {
    const batch = db.batch(); let n = 0;
    undo.forEach(u => { const m = live.get(u.id); if (m && (m.status === 'waiting' || m.status === 'onhold')) { batch.update(db.collection('pkl-queue-matches').doc(u.id), { order: u.order }); n++; } });
    if (n) await batch.commit();
    lastOptimizeUndo = null; btn.style.display = 'none';
    showToast(n ? 'Previous queue order restored.' : 'Nothing to undo.');
  } catch (err) { showToast('Could not undo: ' + err.message, true); }
});

/* ---- Player wait time since last game (admin queue only) ---- */
function fmtClock(secs){
  secs = Math.max(0, Math.floor(secs));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60, mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function teamWithWaitHtml(team){
  return team.map(p => `${escapeHtml(p.name)} <span class="wt" data-pid="${p.participantId}" data-ref="${escapeHtml(refKeyFor(p))}"></span>`).join(' &amp; ');
}
function lastEndMap(){
  const mp = {};
  sessionLogs().forEach(l => { const t = Number(l.endedAt) || 0; [...l.team1, ...l.team2].forEach(p => { const k = refKeyFor(p); if (t > (mp[k] || 0)) mp[k] = t; }); });
  return mp;
}
/* ---- Queue light: green = good to go, orange = someone just finished, red = someone is playing / on a court ---- */
const LIGHT_ORANGE_MS = 3 * 60 * 1000;
function agoText(ms){ const m = Math.floor(ms / 60000); return m < 1 ? 'less than a minute ago' : `${m} min ago`; }
function queueLightFor(m, mp){
  if (!courtsActive()) return null;
  const now = Date.now(), red = [], orange = [];
  [...m.team1, ...m.team2].forEach(e => {
    const busy = queueMatches.find(x => x.id !== m.id && COURT_BUSY_STATUSES.includes(x.status) && isInMatch(e.participantId, x));
    if (busy) { red.push(`${e.name} ${busy.status === 'playing' ? 'is playing on' : 'is assigned to'} Court ${busy.court}`); return; }
    const t = mp[refKeyFor(e)] || 0;
    if (t && now - t < LIGHT_ORANGE_MS) orange.push(`${e.name} finished ${agoText(now - t)}`);
  });
  if (red.length) return { cls:'red', tip:'Not ready: ' + red.concat(orange).join(' · ') };
  if (orange.length) return { cls:'orange', tip:'Just finished: ' + orange.join(' · ') };
  return { cls:'green', tip:'Good to go: all players are free' };
}
function updateQueueLights(){
  const els = document.querySelectorAll('.qlight');
  if (!els.length) return;
  const mp = lastEndMap();
  els.forEach(el => {
    const m = queueMatches.find(x => x.id === el.dataset.mid), r = m ? queueLightFor(m, mp) : null;
    if (!r) { el.style.display = 'none'; el.className = 'qlight'; el.removeAttribute('title'); return; }
    el.style.display = '';
    const cls = 'qlight ' + r.cls;
    if (el.className !== cls) el.className = cls;
    if (el.title !== r.tip) el.title = r.tip;
  });
}
function updateWaitTimes(){
  updateQueueLights();
  const els = document.querySelectorAll('.wt');
  if (!els.length) return;
  const act = Number(sessionState.courtsActiveAt) || 0, mp = lastEndMap(), playing = playingIds(), now = Date.now();
  const onCourt = new Set(queueMatches.filter(m => m.status === 'assigned').flatMap(m => [...m.team1, ...m.team2].map(p => p.participantId)));
  els.forEach(el => {
    const pid = el.dataset.pid; let txt;
    if (playing.has(pid)) txt = 'playing';
    else if (onCourt.has(pid)) txt = 'on court';
    else if (!act) txt = '--:--';
    else txt = fmtClock((now - Math.max(act, mp[el.dataset.ref] || 0)) / 1000);
    el.textContent = `(${txt})`;
  });
}
setInterval(updateWaitTimes, 1000);

/* ---- Clear all waiting-queue matches ---- */
document.getElementById('btnClearQueue').addEventListener('click', async () => {
  const list = queueOrderedList();
  if (!list.length) { showToast('The waiting queue is already empty.'); return; }
  if (!confirm(`Clear all ${list.length} match${list.length===1?'':'es'} in the waiting queue?\n\nMatches on a court are not affected. Players go back to Available.`)) return;
  const btn = document.getElementById('btnClearQueue');
  btn.disabled = true;
  try {
    const cleared = new Set(list.map(m => m.id));
    const pids = [...new Set(list.flatMap(matchPlayerIds))];
    await Promise.all(pids.map(id => participantOf({ id })).filter(Boolean).map(flushElapsed));
    const ops = [];
    list.forEach(m => ops.push(b => b.delete(db.collection('pkl-queue-matches').doc(m.id))));
    pids.forEach(id => {
      const stillLive = queueMatches.some(x => !cleared.has(x.id) && QUEUE_MATCH_STATUSES.includes(x.status) && isInMatch(id, x));
      ops.push(b => b.update(db.collection('pkl-queue-participants').doc(id), stillLive ? { statusSince: Date.now() } : { status:'active', statusSince: Date.now() }));
    });
    for (let i = 0; i < ops.length; i += 400) { const batch = db.batch(); ops.slice(i, i + 400).forEach(f => f(batch)); await batch.commit(); }
    lastOptimizeUndo = null; document.getElementById('btnUndoOptimize').style.display = 'none';
    showToast(`Queue cleared (${list.length} match${list.length===1?'':'es'}).`);
  } catch (err) { showToast('Could not clear the queue: ' + err.message, true); }
  finally { btn.disabled = false; }
});

/* ---- shared helpers for custom match / replace player ---- */
function playerOptionLabel(p){ return `${p.name} · ${STATUS_LABELS[statusKey(p)]} (Played: ${gamesPlayed(p)} | Pending: ${gamesPending(p)})`; }
function disableDuplicatePicks(selectIds){
  const chosen = selectIds.map(id => document.getElementById(id).value).filter(Boolean);
  selectIds.forEach(id => {
    const sel = document.getElementById(id);
    [...sel.options].forEach(o => { o.disabled = !!o.value && o.value !== sel.value && chosen.includes(o.value); });
  });
}

/* ---- Custom match (per bucket, any status) ---- */
const customOverlay = document.getElementById('customOverlay');
let customBucket = null, customIds = [];
function customScope(b){ return bucketHasPools(b.key) ? `${b.label} · ${poolNameOf(b.key, customPoolSel)}` : b.label; }
function customFail(msg){ document.getElementById('customTeam1').innerHTML = ''; document.getElementById('customTeam2').innerHTML = ''; customIds = []; return msg; }
function renderCustomSlots(){
  const bucketKey = customBucket, b = BUCKETS.find(x => x.key === bucketKey);
  if (!b) return '';
  const list = participants.filter(p => p.bucket === bucketKey && !isDuplicate(p) && (!bucketHasPools(bucketKey) || poolIdOf(p) === customPoolSel)).sort((x, y) => x.name.localeCompare(y.name));
  const fx = b.mode === 'fixed', units = fx ? pairUnits(list) : [];
  if (fx && units.length < 2) return customFail(`Need at least 2 pairs in "${customScope(b)}" for a custom match.`);
  if (list.length < b.size) return customFail(`Need at least ${b.size} participants in "${customScope(b)}" for a custom match.`);
  const mixedB = b.mode === 'mixed', men = list.filter(p => genderOf(p) === 'M'), women = list.filter(p => genderOf(p) === 'F');
  if (mixedB && (men.length < 2 || women.length < 2)) return customFail(`Need at least 2 men and 2 women tagged in "${customScope(b)}" for a custom match.`);
  const per = fx ? 1 : b.size / 2;
  customIds = [];
  const slot = (team, i) => { const id = `cm-${team}-${i}`; customIds.push(id); const pool = mixedB ? (i === 0 ? men : women) : list; return `<select id="${id}"><option value="">${fx ? 'Select pair…' : (mixedB ? (i === 0 ? 'Select man…' : 'Select woman…') : 'Select player…')}</option>${(fx ? units.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`) : pool.map(p => `<option value="${p.id}">${escapeHtml(playerOptionLabel(p))}</option>`)).join('')}</select>`; };
  document.getElementById('customSub').textContent = `${customScope(b)} · ${modeLabel(b.mode)}`;
  document.getElementById('customTeam1').innerHTML = Array.from({ length: per }, (_, i) => slot('t1', i)).join('');
  document.getElementById('customTeam2').innerHTML = Array.from({ length: per }, (_, i) => slot('t2', i)).join('');
  customIds.forEach(id => document.getElementById(id).addEventListener('change', () => disableDuplicatePicks(customIds)));
  document.getElementById('errCustom').textContent = '';
  return '';
}
let customPoolSel = '';
function openCustomMatchModal(bucketKey){
  const b = BUCKETS.find(x => x.key === bucketKey);
  if (!b) return;
  customBucket = bucketKey;
  const hasP = bucketHasPools(bucketKey), pf = document.getElementById('customPoolField');
  if (hasP) {
    const pools = bucketPools(bucketKey);
    const roomy = pools.find(q => participants.filter(p => p.bucket === bucketKey && !isDuplicate(p) && poolIdOf(p) === q.id).length >= b.size);
    customPoolSel = (roomy || pools[0]).id;
    const sel = document.getElementById('customPool');
    sel.innerHTML = pools.map(q => `<option value="${q.id}">${escapeHtml(q.name)}</option>`).join('');
    sel.value = customPoolSel;
    pf.style.display = '';
  } else { customPoolSel = ''; pf.style.display = 'none'; }
  const msg = renderCustomSlots();
  if (msg && !hasP) { showToast(msg, true); return; }
  document.getElementById('errCustom').textContent = msg;
  customOverlay.classList.add('show');
}
document.getElementById('customPool').addEventListener('change', e => {
  customPoolSel = e.target.value;
  document.getElementById('errCustom').textContent = renderCustomSlots();
});
document.getElementById('btnCustomCancel').addEventListener('click', () => customOverlay.classList.remove('show'));
customOverlay.addEventListener('click', e => { if (e.target === customOverlay) customOverlay.classList.remove('show'); });
document.getElementById('btnCustomAdd').addEventListener('click', async () => {
  const errEl = document.getElementById('errCustom');
  errEl.textContent = '';
  const per = customIds.length / 2;
  const vals = customIds.map(id => document.getElementById(id).value);
  if (vals.some(v => !v)) { errEl.textContent = 'Pick a player for every slot.'; return; }
  if (new Set(vals).size !== vals.length) { errEl.textContent = 'Each player can only appear once.'; return; }
  const fxc = isFixed(customBucket), cu = fxc ? pairUnits(participants.filter(p => p.bucket === customBucket)) : [];
  const unitOf = id => { const u = cu.find(x => x.id === id); return u ? [u.a, u.b] : [undefined]; };
  const team1 = fxc ? unitOf(vals[0]) : vals.slice(0, per).map(id => participants.find(p => p.id === id));
  const team2 = fxc ? unitOf(vals[1]) : vals.slice(per).map(id => participants.find(p => p.id === id));
  if ([...team1, ...team2].some(p => !p)) { errEl.textContent = 'A selected player is no longer in this category.'; return; }
  const btn = document.getElementById('btnCustomAdd');
  btn.disabled = true;
  try {
    const matchId = await commitMatchToQueue(customBucket, team1, team2);
    customOverlay.classList.remove('show');
    showToast(`${matchId} added to the queue.`);
  } catch (err) { errEl.textContent = err.message; }
  finally { btn.disabled = false; }
});

/* ---- Replace player in a queued match ---- */
const replaceOverlay = document.getElementById('replaceOverlay');
let replaceMatchId = null;
function openReplaceModal(matchDocId){
  const m = queueMatches.find(x => x.id === matchDocId);
  if (!m) return;
  replaceMatchId = matchDocId;
  document.getElementById('replaceSub').textContent = `${m.matchId} · ${bucketLabel(m.bucket)}`;
  document.getElementById('errReplace').textContent = '';
  const inMatch = new Set(matchPlayerIds(m));
  const mpool = matchPoolId(m);
  const others = participants.filter(p => p.bucket === m.bucket && !inMatch.has(p.id) && !isDuplicate(p) && (!bucketHasPools(m.bucket) || !mpool || poolIdOf(p) === mpool)).sort((x, y) => x.name.localeCompare(y.name));
  const poolFor = entry => { if (!isMixed(m.bucket)) return others; const g = genderOf(participantOf(entry) || {}); return g ? others.filter(x => genderOf(x) === g) : []; };
  const slot = (entry, side, idx) => `<div class="field" style="margin-bottom:10px;"><label>${side === 'team1' ? 'Team 1' : 'Team 2'} · ${escapeHtml(entry.name)}${isMixed(m.bucket) ? ' · same gender only' : ''}</label>
    <select id="rp-${side}-${idx}"><option value="">Keep ${escapeHtml(entry.name)}</option>${poolFor(entry).map(p => `<option value="${p.id}">Replace with ${escapeHtml(playerOptionLabel(p))}</option>`).join('')}</select></div>`;
  document.getElementById('replaceSlots').innerHTML = m.team1.map((e, i) => slot(e, 'team1', i)).join('') + m.team2.map((e, i) => slot(e, 'team2', i)).join('');
  const ids = [...m.team1.map((_, i) => `rp-team1-${i}`), ...m.team2.map((_, i) => `rp-team2-${i}`)];
  ids.forEach(id => document.getElementById(id).addEventListener('change', () => disableDuplicatePicks(ids)));
  replaceOverlay.classList.add('show');
}
document.getElementById('btnReplaceCancel').addEventListener('click', () => replaceOverlay.classList.remove('show'));
replaceOverlay.addEventListener('click', e => { if (e.target === replaceOverlay) replaceOverlay.classList.remove('show'); });
async function applyMatchPlayers(m, newTeam1, newTeam2){
  const allIds = [...newTeam1, ...newTeam2].map(p => p.id), newIdSet = new Set(allIds);
  const dup = findDuplicateMatch(m.bucket, newIdSet, m.id);
  if (dup) throw new Error(`That exact matchup is already in ${dup.matchId}.`);
  const oldIds = new Set(matchPlayerIds(m));
  const removedIds = [...oldIds].filter(id => !newIdSet.has(id));
  const addedIds = allIds.filter(id => !oldIds.has(id));
  await Promise.all([...addedIds, ...removedIds].map(id => { const p = participants.find(x => x.id === id); return p ? flushElapsed(p) : null; }));
  await adjustSessionCounts(m.team1, m.team2, snapshotArr(newTeam1), snapshotArr(newTeam2));
  const batch = db.batch();
  removedIds.forEach(id => batch.update(db.collection('pkl-queue-participants').doc(id), releaseUpdate(id, m.id)));
  addedIds.forEach(id => batch.update(db.collection('pkl-queue-participants').doc(id), { status:'queued', statusSince: Date.now() }));
  batch.update(db.collection('pkl-queue-matches').doc(m.id), { team1: snapshotArr(newTeam1), team2: snapshotArr(newTeam2) });
  await batch.commit();
}
document.getElementById('btnReplaceSave').addEventListener('click', async () => {
  const m = queueMatches.find(x => x.id === replaceMatchId);
  if (!m) return;
  const errEl = document.getElementById('errReplace');
  errEl.textContent = '';
  const pick = (side, entry, idx) => {
    const v = document.getElementById(`rp-${side}-${idx}`).value;
    return v ? participants.find(p => p.id === v) : participantOf(entry);
  };
  const newTeam1 = m.team1.map((e, i) => pick('team1', e, i)), newTeam2 = m.team2.map((e, i) => pick('team2', e, i));
  if ([...newTeam1, ...newTeam2].some(p => !p)) { errEl.textContent = 'A player in this match is no longer in the category.'; return; }
  const all = [...newTeam1, ...newTeam2].map(p => p.id);
  if (new Set(all).size !== all.length) { errEl.textContent = 'Each player can only appear once.'; return; }
  if (all.join('|') === matchPlayerIds(m).join('|')) { errEl.textContent = 'Choose at least one replacement.'; return; }
  const btn = document.getElementById('btnReplaceSave');
  btn.disabled = true;
  try { await applyMatchPlayers(m, newTeam1, newTeam2); replaceOverlay.classList.remove('show'); showToast(`${m.matchId} updated.`); }
  catch (err) { errEl.textContent = err.message; }
  finally { btn.disabled = false; }
});

/* ---- TV display controls: Display queue + Leaderboard popup ---- */
const displayRef = db.collection('pkl-queue-events').doc('displaySettings');   // no createdAt field, so the TV popup listener ignores it
let displaySettings = {}, lbPushTimer = null;
function leaderboardShown(){ return !!(displaySettings.leaderboard && displaySettings.leaderboard.show); }
function updateDisplayControls(){
  document.getElementById('chkDisplayQueue').checked = displaySettings.showQueue !== false;
  document.getElementById('btnShowLeaderboard').textContent = leaderboardShown() ? '🏆 Hide leaderboard' : '🏆 Show leaderboard';
}
displayRef.onSnapshot(doc => { displaySettings = doc.exists ? doc.data() : {}; updateDisplayControls(); }, err => showToast('TV settings sync error: ' + err.message, true));
document.getElementById('chkDisplayQueue').addEventListener('change', async e => {
  try { await displayRef.set({ showQueue: e.target.checked }, { merge:true }); }
  catch (err) { showToast('Could not update the TV: ' + err.message, true); updateDisplayControls(); }
});
function buildDisplayLeaderboard(){
  const data = buildLeaderboard(sessionState.currentSessionId);
  return BUCKETS.slice(0, 3).map(b => ({ name: b.label, rows: (data[b.key] || []).slice(0, 5).map(e => ({ rank:e.rank, name:e.name, w:e.w, l:e.l, pf:e.pf, pd:e.pd })) }));
}
async function pushLeaderboard(show){
  await displayRef.set({ leaderboard: { show, buckets: buildDisplayLeaderboard(), sessionName: sessionState.currentSessionName || '', updatedAt: Date.now() } }, { merge:true });
}
function scheduleLeaderboardPush(){
  if (!leaderboardShown()) return;
  clearTimeout(lbPushTimer);
  lbPushTimer = setTimeout(() => { pushLeaderboard(true).catch(() => {}); }, 800);
}
document.getElementById('btnShowLeaderboard').addEventListener('click', async () => {
  const show = !leaderboardShown();
  if (show && !BUCKETS.length) { showToast('Add a category first.', true); return; }
  try { await pushLeaderboard(show); showToast(show ? 'Leaderboard is showing on the TV.' : 'Leaderboard hidden.'); }
  catch (err) { showToast('Could not update the TV: ' + err.message, true); }
});

async function holdMatch(id){ try { await db.collection('pkl-queue-matches').doc(id).update({ status:'onhold' }); } catch(err){ showToast(err.message, true); } }
async function resumeMatch(id){ try { await db.collection('pkl-queue-matches').doc(id).update({ status:'waiting' }); } catch(err){ showToast(err.message, true); } }
async function deleteQueueMatch(id){
  const m = queueMatches.find(x=>x.id===id);
  if (!m) return;
  if (!confirm(`Delete match ${m.matchId}? Players will return to the category as Active.`)) return;
  try {
    await Promise.all([...m.team1, ...m.team2].map(participantOf).filter(Boolean).map(flushElapsed));
    const batch = db.batch();
    batch.delete(db.collection('pkl-queue-matches').doc(id));
    [...m.team1, ...m.team2].forEach(p => batch.update(db.collection('pkl-queue-participants').doc(p.participantId), releaseUpdate(p.participantId, m.id)));
    await batch.commit();
    showToast('Match deleted.');
  } catch(err){ showToast('Delete failed: ' + err.message, true); }
}

/* ---- Court assignment / game control ---- */
const courtOverlay = document.getElementById('courtOverlay');
function openCourtModal(matchDocId){
  if (!courtsActive()) { showToast('Activate the courts first (▶ Activate Courts).', true); return; }
  const occupied = queueMatches.filter(m => COURT_BUSY_STATUSES.includes(m.status));
  const grid = document.getElementById('courtPickGrid');
  grid.innerHTML = '';
  for (let c=1;c<=COURTS;c++){
    const isBusy = occupied.some(m=>m.court===c);
    const pm = queueMatches.find(x => x.id === matchDocId);
    const allowed = !pm || bucketAllowsCourt(pm.bucket, c);
    const btn = document.createElement('button');
    btn.className = 'court-pick-btn';
    btn.textContent = `Court ${c}` + (isBusy ? ' (busy)' : (!allowed ? ' (not for this category)' : ''));
    btn.disabled = isBusy || !allowed;
    btn.addEventListener('click', () => { btn.disabled = true; assignToCourt(matchDocId, c); });
    grid.appendChild(btn);
  }
  courtOverlay.classList.add('show');
}
document.getElementById('btnCourtCancel').addEventListener('click', () => courtOverlay.classList.remove('show'));
courtOverlay.addEventListener('click', e => { if (e.target===courtOverlay) courtOverlay.classList.remove('show'); });
async function assignToCourt(matchDocId, court){
  if (!courtsActive()) { showToast('Activate the courts first (▶ Activate Courts).', true); courtOverlay.classList.remove('show'); return; }
  const m = queueMatches.find(x=>x.id===matchDocId);
  if (m && !bucketAllowsCourt(m.bucket, court)) { showToast(`${bucketLabel(m.bucket)} can't use Court ${court}.`, true); courtOverlay.classList.remove('show'); return; }
  if (m) {
    const busy = [...m.team1, ...m.team2].filter(p => queueMatches.some(x => x.id !== m.id && COURT_BUSY_STATUSES.includes(x.status) && isInMatch(p.participantId, x)));
    if (busy.length && !confirm(`${busy.map(p => p.name).join(', ')} ${busy.length===1?'is':'are'} still on a court in another match. Assign anyway?`)) return;
  }
  try {
    await db.collection('pkl-queue-matches').doc(matchDocId).update({ status:'assigned', court, startedAt:null });
    courtOverlay.classList.remove('show');
    showToast(`Match assigned to Court ${court}. Calling players…`);
  } catch(err){ showToast('Could not assign court: ' + err.message, true); return; }
  if (m) await sendCallEvent(m, court);
}
const startingGames = new Set();
async function startGame(matchDocId){
  const m = queueMatches.find(x => x.id === matchDocId);
  if (!m || m.status !== 'assigned' || startingGames.has(matchDocId)) return;
  if (!courtsActive()) { showToast('Activate the courts first (▶ Activate Courts).', true); return; }
  startingGames.add(matchDocId);
  try {
    const ps = [...m.team1, ...m.team2].map(participantOf).filter(Boolean);
    await Promise.all(ps.map(flushElapsed));           // close out waiting time before the clock switches to playing time
    const batch = db.batch(), now = Date.now();
    ps.forEach(p => batch.update(db.collection('pkl-queue-participants').doc(p.id), { statusSince: now }));
    batch.update(db.collection('pkl-queue-matches').doc(matchDocId), { status:'playing', startedAt: now });
    await batch.commit();
    showToast('Game started!');
  } catch(err){ showToast('Could not start game: ' + err.message, true); }
  finally { startingGames.delete(matchDocId); }
}
async function backToQueue(matchDocId){
  try { await db.collection('pkl-queue-matches').doc(matchDocId).update({ status:'waiting', court:null, startedAt:null, order: nextQueueOrder() }); showToast('Moved back to queue.'); }
  catch(err){ showToast('Could not move to queue: ' + err.message, true); }
}
async function resetTimer(matchDocId){
  if (!confirm('Reset the timer for this match?')) return;
  try { await db.collection('pkl-queue-matches').doc(matchDocId).update({ startedAt: Date.now() }); }
  catch(err){ showToast('Could not reset timer: ' + err.message, true); }
}
async function sendCallEvent(m, court){
  try {
    await db.collection('pkl-queue-events').add({
      type:'call', matchId:m.matchId, bucket:m.bucket, court,
      team1: m.team1.map(p=>p.name), team2: m.team2.map(p=>p.name),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(err){ showToast('Could not call players: ' + err.message, true); }
}
async function callPlayers(matchDocId){
  const m = queueMatches.find(x=>x.id===matchDocId);
  if (!m) return;
  await sendCallEvent(m, m.court);
  showToast(`Players called to Court ${m.court}.`);
}

/* ---- Edit queue match (full re-pick, current sitting/active only) ---- */
const editQueueOverlay = document.getElementById('editQueueOverlay');
let editQueueMatchId = null;
function inOtherLiveMatch(participantId, excludeDocId){
  return queueMatches.some(x => x.id !== excludeDocId && QUEUE_MATCH_STATUSES.includes(x.status) && isInMatch(participantId, x));
}
/* When a match ends/is removed: back to Available, unless the player is still in another live match (then just restart the clock) */
function releaseUpdate(participantId, excludeDocId){
  return inOtherLiveMatch(participantId, excludeDocId) ? { statusSince: Date.now() } : { status:'active', statusSince: Date.now() };
}
function isInMatch(participantId, m){ return [...m.team1, ...m.team2].some(x=>x.participantId===participantId); }
function openEditQueueModal(matchDocId){
  const m = queueMatches.find(x=>x.id===matchDocId);
  if (!m) return;
  editQueueMatchId = matchDocId;
  document.getElementById('editQueueSub').textContent = `${m.matchId} · ${bucketLabel(m.bucket)}`;
  document.getElementById('errEditQueue').textContent = '';
  const epool = matchPoolId(m);
  const eligible = participants.filter(p => p.bucket===m.bucket && (p.status==='active' || (p.status==='queued' && isInMatch(p.id, m))) && (!bucketHasPools(m.bucket) || !epool || poolIdOf(p) === epool));
  const buildSlots = (team, sideKey) => team.map((occupant, idx) => {
    const mixedB = isMixed(m.bucket), og = mixedB ? genderOf(participants.find(p => p.id === occupant.participantId) || {}) : '';
    const pool = mixedB ? eligible.filter(p => genderOf(p) === og) : eligible;
    const options = pool.map(p => `<option value="${p.id}" ${p.id===occupant.participantId?'selected':''}>${escapeHtml(p.name)}${mixedB && og ? (og === 'F' ? ' ♀' : ' ♂') : ''}</option>`).join('');
    return `<select id="editSlot-${sideKey}-${idx}">${options}</select>`;
  }).join('');
  document.getElementById('editTeam1Slots').innerHTML = buildSlots(m.team1, 'team1');
  document.getElementById('editTeam2Slots').innerHTML = buildSlots(m.team2, 'team2');
  editQueueOverlay.classList.add('show');
}
document.getElementById('btnEditQueueCancel').addEventListener('click', () => editQueueOverlay.classList.remove('show'));
editQueueOverlay.addEventListener('click', e => { if (e.target===editQueueOverlay) editQueueOverlay.classList.remove('show'); });
async function adjustSessionCounts(oldTeam1, oldTeam2, newTeam1, newTeam2){
  const sessionRef = db.collection('pkl-queue-session').doc('state');
  await db.runTransaction(async tx => {
    const snap = await tx.get(sessionRef);
    const data = snap.exists ? snap.data() : {};
    const partnerCounts = { ...(data.partnerCounts||{}) };
    const opponentCounts = { ...(data.opponentCounts||{}) };
    const bump = (obj, a, b, delta) => { const k=pairKey(a,b); obj[k] = Math.max(0, (obj[k]||0)+delta); };
    if (oldTeam1.length===2) bump(partnerCounts, oldTeam1[0].participantId, oldTeam1[1].participantId, -1);
    if (oldTeam2.length===2) bump(partnerCounts, oldTeam2[0].participantId, oldTeam2[1].participantId, -1);
    for (const p of oldTeam1) for (const q of oldTeam2) bump(opponentCounts, p.participantId, q.participantId, -1);
    if (newTeam1.length===2) bump(partnerCounts, newTeam1[0].participantId, newTeam1[1].participantId, 1);
    if (newTeam2.length===2) bump(partnerCounts, newTeam2[0].participantId, newTeam2[1].participantId, 1);
    for (const p of newTeam1) for (const q of newTeam2) bump(opponentCounts, p.participantId, q.participantId, 1);
    tx.set(sessionRef, { partnerCounts, opponentCounts }, { merge:true });
  });
}
document.getElementById('btnEditQueueSave').addEventListener('click', async () => {
  const m = queueMatches.find(x=>x.id===editQueueMatchId);
  if (!m) return;
  const errEl = document.getElementById('errEditQueue');
  errEl.textContent = '';
  const team1Ids = m.team1.map((_,idx)=>document.getElementById(`editSlot-team1-${idx}`).value);
  const team2Ids = m.team2.map((_,idx)=>document.getElementById(`editSlot-team2-${idx}`).value);
  const allIds = [...team1Ids, ...team2Ids];
  if (new Set(allIds).size !== allIds.length) { errEl.textContent = 'Each player can only appear once.'; return; }
  const newTeam1 = team1Ids.map(id => participants.find(p=>p.id===id));
  const newTeam2 = team2Ids.map(id => participants.find(p=>p.id===id));
  if (newTeam1.some(p=>!p) || newTeam2.some(p=>!p)) { errEl.textContent = 'Pick a player for every slot.'; return; }
  const newIdSet = new Set(allIds);
  const dup = findDuplicateMatch(m.bucket, newIdSet, m.id);
  if (dup) { errEl.textContent = `That exact matchup is already in ${dup.matchId}.`; return; }
  const btn = document.getElementById('btnEditQueueSave');
  btn.disabled = true;
  try {
    const oldIds = new Set([...m.team1, ...m.team2].map(p=>p.participantId));
    const removedIds = [...oldIds].filter(id => !newIdSet.has(id));
    const addedIds = allIds.filter(id => !oldIds.has(id));
    await Promise.all([...addedIds, ...removedIds].map(id => { const p = participants.find(x=>x.id===id); return p ? flushElapsed(p) : null; }));
    await adjustSessionCounts(m.team1, m.team2, snapshotArr(newTeam1), snapshotArr(newTeam2));
    const batch = db.batch();
    removedIds.forEach(id => batch.update(db.collection('pkl-queue-participants').doc(id), releaseUpdate(id, m.id)));
    addedIds.forEach(id => batch.update(db.collection('pkl-queue-participants').doc(id), { status:'queued', statusSince: Date.now() }));
    batch.update(db.collection('pkl-queue-matches').doc(m.id), { team1: snapshotArr(newTeam1), team2: snapshotArr(newTeam2) });
    await batch.commit();
    editQueueOverlay.classList.remove('show');
    showToast(`${m.matchId} updated.`);
  } catch (err) { showToast('Could not update match: ' + err.message, true); }
  finally { btn.disabled = false; }
});

/* ---- End match (auto winner by score) ---- */
const endOverlay = document.getElementById('endOverlay');
let endMatchId = null, endTeamNames = {t1:'Team 1', t2:'Team 2'};
function openEndModal(matchDocId){
  const m = queueMatches.find(x=>x.id===matchDocId);
  if (!m) return;
  endMatchId = matchDocId;
  document.getElementById('errEnd').textContent = '';
  document.getElementById('score1Input').value = '';
  document.getElementById('score2Input').value = '';
  document.getElementById('leadingIndicator').textContent = '';
  endTeamNames.t1 = m.team1.map(p=>p.name).join(' & ');
  endTeamNames.t2 = m.team2.map(p=>p.name).join(' & ');
  document.getElementById('endModalSub').textContent = `${m.matchId} · ${bucketLabel(m.bucket)}`;
  document.getElementById('score1Label').textContent = endTeamNames.t1 + ' score';
  document.getElementById('score2Label').textContent = endTeamNames.t2 + ' score';
  endOverlay.classList.add('show');
}
function updateLeadingIndicator(){
  const s1 = document.getElementById('score1Input').value, s2 = document.getElementById('score2Input').value;
  const el = document.getElementById('leadingIndicator');
  if (s1==='' || s2==='') { el.textContent=''; return; }
  const n1=Number(s1), n2=Number(s2);
  if (isNaN(n1)||isNaN(n2)) { el.textContent=''; return; }
  el.textContent = n1===n2 ? 'Scores are tied — adjust to determine a winner.' : `${n1>n2?endTeamNames.t1:endTeamNames.t2} is currently ahead.`;
}
document.getElementById('score1Input').addEventListener('input', updateLeadingIndicator);
document.getElementById('score2Input').addEventListener('input', updateLeadingIndicator);
document.getElementById('btnEndCancel').addEventListener('click', () => endOverlay.classList.remove('show'));
endOverlay.addEventListener('click', e => { if (e.target===endOverlay) endOverlay.classList.remove('show'); });
document.getElementById('btnEndConfirm').addEventListener('click', async () => {
  const errEl = document.getElementById('errEnd');
  errEl.textContent = '';
  const m = queueMatches.find(x=>x.id===endMatchId);
  if (!m) return;
  const s1raw = document.getElementById('score1Input').value, s2raw = document.getElementById('score2Input').value;
  if (s1raw==='' || s2raw==='') { errEl.textContent = 'Enter both scores.'; return; }
  const score1 = Number(s1raw), score2 = Number(s2raw);
  if (isNaN(score1) || isNaN(score2)) { errEl.textContent = 'Scores must be numbers.'; return; }
  if (score1 === score2) { errEl.textContent = "Scores can't be tied — adjust to determine a winner."; return; }
  const winner = score1 > score2 ? 'team1' : 'team2';
  const btn = document.getElementById('btnEndConfirm');
  btn.disabled = true;
  const endedAt = Date.now();
  const duration = Math.max(0, Math.round((endedAt - (m.startedAt || endedAt)) / 1000));
  try {
    await Promise.all([...m.team1, ...m.team2].map(participantOf).filter(Boolean).map(flushElapsed)); // closes out playing time
    const batch = db.batch();
    const logRef = db.collection('pkl-queue-logs').doc();
    batch.set(logRef, {
      matchId: m.matchId, bucket: m.bucket, bucketName: bucketLabel(m.bucket), pool: matchPoolId(m) || null, poolName: poolNameOf(m.bucket, matchPoolId(m)) || '', team1: m.team1, team2: m.team2,
      winner, score1, score2, court: m.court,
      startedAt: m.startedAt || null, endedAt, durationSeconds: duration,
      sessionId: sessionState.currentSessionId || null, sessionName: sessionState.currentSessionName || '', sessionDate: sessionState.currentSessionDate || '',
      completedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.delete(db.collection('pkl-queue-matches').doc(m.id));
    [...m.team1, ...m.team2].forEach(p => { batch.update(db.collection('pkl-queue-participants').doc(p.participantId), releaseUpdate(p.participantId, m.id)); });
    await batch.commit();
    await db.collection('pkl-queue-events').add({
      type:'winner', matchId: m.matchId, bucket: m.bucket, court: m.court,
      team1: m.team1.map(p=>p.name), team2: m.team2.map(p=>p.name), winner, score1, score2,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    endOverlay.classList.remove('show');
    showToast(`${m.matchId} logged. Players returned to their category.`);
  } catch (err) { showToast('Could not save result: ' + err.message, true); }
  finally { btn.disabled = false; }
});

/* ================= LOGS ================= */
function renderSessionFilterOptions(){
  updateExportTargetLabel();
}
/* The Logs and Leaderboard tabs are React now (src/engine/components). These stay as no-ops because other code still calls them. */
function renderLogBucketFilter(){}
function renderLogs(){}
const logEditOverlay = document.getElementById('logEditOverlay');
let logEditId = null, logEditNames = {t1:'Team 1', t2:'Team 2'};
function openLogEditModal(logId){
  const l = logs.find(x=>x.id===logId);
  if (!l) return;
  logEditId = logId;
  logEditNames.t1 = l.team1.map(p=>p.name).join(' & ');
  logEditNames.t2 = l.team2.map(p=>p.name).join(' & ');
  document.getElementById('logEditSub').textContent = `${l.matchId} · ${logBucketName(l)}`;
  document.getElementById('logScore1Label').textContent = logEditNames.t1 + ' score';
  document.getElementById('logScore2Label').textContent = logEditNames.t2 + ' score';
  document.getElementById('logScore1Input').value = l.score1;
  document.getElementById('logScore2Input').value = l.score2;
  document.getElementById('errLogEdit').textContent = '';
  logEditOverlay.classList.add('show');
}
document.getElementById('btnLogEditCancel').addEventListener('click', () => logEditOverlay.classList.remove('show'));
logEditOverlay.addEventListener('click', e => { if (e.target===logEditOverlay) logEditOverlay.classList.remove('show'); });
document.getElementById('btnLogEditSave').addEventListener('click', async () => {
  const errEl = document.getElementById('errLogEdit');
  errEl.textContent = '';
  const s1raw = document.getElementById('logScore1Input').value, s2raw = document.getElementById('logScore2Input').value;
  if (s1raw==='' || s2raw==='') { errEl.textContent = 'Enter both scores.'; return; }
  const score1 = Number(s1raw), score2 = Number(s2raw);
  if (isNaN(score1)||isNaN(score2)) { errEl.textContent='Scores must be numbers.'; return; }
  if (score1===score2) { errEl.textContent = "Scores can't be tied."; return; }
  const winner = score1>score2 ? 'team1' : 'team2';
  const btn = document.getElementById('btnLogEditSave');
  btn.disabled = true;
  try { await db.collection('pkl-queue-logs').doc(logEditId).update({ score1, score2, winner }); logEditOverlay.classList.remove('show'); showToast('Match result updated.'); }
  catch (err) { showToast('Could not update log: ' + err.message, true); }
  finally { btn.disabled = false; }
});
async function deleteLog(logId){
  const l = logs.find(x=>x.id===logId);
  if (!confirm(`Delete log ${l ? l.matchId : ''}? This cannot be undone.`)) return;
  try { await db.collection('pkl-queue-logs').doc(logId).delete(); showToast('Log deleted.'); }
  catch (err) { showToast('Delete failed: ' + err.message, true); }
}

/* ================= NEW SESSION ================= */
const sessionOverlay = document.getElementById('sessionOverlay');
document.getElementById('btnNewSession').addEventListener('click', () => {
  document.getElementById('sessNameInput').value = '';
  document.getElementById('sessDateInput').value = new Date().toISOString().slice(0,10);
  document.getElementById('errSession').textContent = '';
  document.getElementById('sessSaveSnap').checked = true;
  document.getElementById('sessCourts').value = String(COURTS);
  sessionOverlay.classList.add('show');
});
document.getElementById('btnSessionCancel').addEventListener('click', () => sessionOverlay.classList.remove('show'));
sessionOverlay.addEventListener('click', e => { if (e.target===sessionOverlay) sessionOverlay.classList.remove('show'); });
document.getElementById('btnSessionStart').addEventListener('click', async () => {
  const errEl = document.getElementById('errSession');
  errEl.textContent = '';
  const name = document.getElementById('sessNameInput').value.trim();
  const date = document.getElementById('sessDateInput').value;
  if (!name) { errEl.textContent = 'Enter a session name.'; return; }
  if (!date) { errEl.textContent = 'Pick a date.'; return; }
  const courtCount = Math.min(MAX_COURTS, Math.max(1, Number(document.getElementById('sessCourts').value) || 4));
  const btn = document.getElementById('btnSessionStart');
  btn.disabled = true;
  try {
    const live = await readLiveState();
    if (document.getElementById('sessSaveSnap').checked && (live.participants.length || live.matches.length || live.buckets.length)) {
      try { await saveSnapshot('auto', `Before starting "${name}"`, live); }
      catch (e) { throw new Error('Could not auto-save the current session, so nothing was cleared. ' + e.message); }
    }
    const prev = sessionsList.find(x => x.id === sessionState.currentSessionId) || {};
    const sessRef = await db.collection('pkl-queue-sessions').add({ name, date, eventName: name, location: prev.location || '', scoreType: prev.scoreType || 'SIDEOUT', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    const [partsSnap, matchesSnap, bucketsSnap] = await Promise.all([
      db.collection('pkl-queue-participants').get(),
      db.collection('pkl-queue-matches').get(),
      db.collection('pkl-queue-buckets').get()
    ]);
    await Promise.all(partsSnap.docs.map(d => flushElapsed({ id:d.id, ...d.data() })));
    const batch = db.batch();
    partsSnap.forEach(d => batch.delete(d.ref));
    matchesSnap.forEach(d => batch.delete(d.ref));
    bucketsSnap.forEach(d => batch.delete(d.ref));
    batch.set(db.collection('pkl-queue-session').doc('state'), { matchCounter: 0, partnerCounts:{}, opponentCounts:{}, courtsActiveAt: null, courtCount, sessionEndedAt: null, sessionRecap: null, currentSessionId: sessRef.id, currentSessionName: name, currentSessionDate: date }, { merge:true });
    await batch.commit();
    await displayRef.set({ showQueue: true, leaderboard: { show: false, buckets: [] } }, { merge: true });
    lastOptimizeUndo = null; document.getElementById('btnUndoOptimize').style.display = 'none';
    sessionOverlay.classList.remove('show');
    showToast(`Session "${name}" started. Everything was reset.`);
  } catch (err) { showToast('Could not start session: ' + err.message, true); }
  finally { btn.disabled = false; }
});


/* ================= END SESSION (recap + lock) ================= */
const endSessOverlay = document.getElementById('endSessOverlay');
let recapCurrent = null, endSessMode = 'confirm', endSessBusy = false;
function fmtMS(secs){
  if (secs === null || secs === undefined || isNaN(secs)) return '—';
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), sc = secs % 60;
  return h > 0 ? `${h}h ${m}m ${sc}s` : `${m}m ${sc}s`;
}
function endBlockers(){
  const live = queueMatches.filter(m => QUEUE_MATCH_STATUSES.includes(m.status));
  return {
    playing: live.filter(m => m.status === 'playing').length,
    onCourt: live.filter(m => m.status === 'assigned').length,
    waiting: live.filter(m => m.status === 'waiting' || m.status === 'onhold').length,
    total: live.length
  };
}
/* Seconds a player has accumulated since their last flush (not yet in the stats docs) */
function pendingSecs(p){
  const since = effSince(p);
  if (!since) return null;
  const e = Math.max(0, Math.round((Date.now() - since) / 1000));
  return e > 0 ? { cat: timeCategory(p), secs: e } : null;
}
function computeRecap(){
  const sid = sessionState.currentSessionId || null, now = Date.now();
  const act = Number(sessionState.courtsActiveAt) || 0;
  const sl = logs.filter(l => (l.sessionId || null) === sid).slice().sort((a, b) => (Number(a.endedAt) || 0) - (Number(b.endedAt) || 0));
  const prefix = `${sid || 'none'}__`;
  const per = {}, nameOf = {}, bucketOf = {}, gamesBy = {};
  const ent = k => per[k] || (per[k] = { name:'', wait:0, play:0, rest:0 });
  Object.keys(statsCache).forEach(id => {
    if (!id.startsWith(prefix)) return;
    const d = statsCache[id], e = ent(id.slice(prefix.length));
    e.name = d.name || e.name; e.wait += d.totalWaitingSeconds || 0; e.play += d.totalPlayingSeconds || 0; e.rest += d.totalRestingSeconds || 0;
  });
  const fieldOf = { waiting:'wait', playing:'play', resting:'rest' };
  participants.forEach(p => {
    const k = refKeyFor(p), e = ent(k);
    e.name = p.name; nameOf[k] = p.name; bucketOf[k] = p.bucket;
    const ps = pendingSecs(p);
    if (ps) e[fieldOf[ps.cat]] += ps.secs;
  });
  sl.forEach(l => [...(l.team1 || []), ...(l.team2 || [])].forEach(p => {
    const k = refKeyFor(p);
    nameOf[k] = nameOf[k] || p.name; gamesBy[k] = (gamesBy[k] || 0) + 1;
    if (!bucketOf[k]) bucketOf[k] = l.bucket;
  }));
  Object.keys(per).forEach(k => { if (!per[k].name) per[k].name = nameOf[k] || ''; });

  const gstats = arr => {
    const ds = arr.map(l => Number(l.durationSeconds) || 0).filter(d => d > 0);
    return { games: arr.length,
      avgGame: ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null,
      longest: ds.length ? Math.max(...ds) : null, shortest: ds.length ? Math.min(...ds) : null,
      busy: ds.reduce((a, b) => a + b, 0),
      points: arr.reduce((a, l) => a + (Number(l.score1) || 0) + (Number(l.score2) || 0), 0) };
  };
  const timeAvg = keys => {
    const on = keys.filter(k => per[k] && (per[k].wait + per[k].play) > 0), n = on.length;
    return { n, avgWait: n ? Math.round(on.reduce((a, k) => a + per[k].wait, 0) / n) : null,
                avgPlay: n ? Math.round(on.reduce((a, k) => a + per[k].play, 0) / n) : null };
  };
  const g = gstats(sl), ta = timeAvg(Object.keys(per));
  const lengthSec = act ? Math.max(0, Math.round((now - act) / 1000)) : 0;
  const util = lengthSec > 0 && g.busy > 0 ? Math.round(g.busy / (lengthSec * COURTS) * 1000) / 10 : null;
  const courtGames = {};
  sl.forEach(l => { const c = l.court; if (c) courtGames[c] = (courtGames[c] || 0) + 1; });

  let blowout = null, closest = null;
  sl.forEach(l => {
    const s1 = Number(l.score1) || 0, s2 = Number(l.score2) || 0, mg = Math.abs(s1 - s2);
    const row = { score: `${s1} – ${s2}`, margin: mg, matchId: l.matchId || '' };
    if (!blowout || mg > blowout.margin) blowout = row;
    if (!closest || mg < closest.margin) closest = row;
  });
  const mostK = Object.keys(gamesBy).sort((a, b) => gamesBy[b] - gamesBy[a])[0];
  const waitK = Object.keys(per).filter(k => per[k].wait > 0).sort((a, b) => per[b].wait - per[a].wait)[0];
  const hours = {};
  sl.forEach(l => { const t = Number(l.endedAt) || 0; if (t) { const h = new Date(t).getHours(); hours[h] = (hours[h] || 0) + 1; } });
  const hk = Object.keys(hours).sort((a, b) => hours[b] - hours[a])[0];
  const hf = h => `${(h % 12) || 12} ${h < 12 ? 'AM' : 'PM'}`;
  const cur = {}; let streak = { n:0, name:'' };
  sl.forEach(l => {
    const win = l.winner === 'team2' ? (l.team2 || []) : (l.team1 || []), lose = l.winner === 'team2' ? (l.team1 || []) : (l.team2 || []);
    win.forEach(p => { const k = refKeyFor(p); cur[k] = (cur[k] || 0) + 1; if (cur[k] > streak.n) streak = { n:cur[k], name:p.name }; });
    lose.forEach(p => { cur[refKeyFor(p)] = 0; });
  });
  const lbAll = buildLeaderboard(sid);
  const buckets = lbBuckets(sid).map(b => {
    const arr = sl.filter(l => l.bucket === b.key), keys = Object.keys(per).filter(k => bucketOf[k] === b.key);
    const players = new Set([...keys, ...Object.keys(gamesBy).filter(k => bucketOf[k] === b.key)]);
    const bg = gstats(arr), bt = timeAvg(keys), lb = lbAll[b.key] || [];
    return { label: bucketLabel(b.key, b.label), mode: b.mode || null, games: bg.games, players: players.size,
      avgWait: bt.avgWait, avgPlay: bt.avgPlay, avgGame: bg.avgGame, longest: bg.longest, shortest: bg.shortest, points: bg.points,
      top: lb[0] ? `${lb[0].name} (${lb[0].w}W–${lb[0].l}L)` : null };
  }).filter(b => b.games > 0 || b.players > 0);
  const allKeys = new Set([...Object.keys(per), ...Object.keys(gamesBy)]);
  return {
    sessionName: sessionState.currentSessionName || 'Session', sessionDate: sessionState.currentSessionDate || '',
    startedAt: act || null, endedAt: now, lengthSec,
    totals: {
      games: g.games, players: allKeys.size, played: Object.keys(gamesBy).length, points: g.points,
      avgWait: ta.avgWait, avgPlay: ta.avgPlay, avgGame: g.avgGame, longest: g.longest, shortest: g.shortest, util, courtGames,
      blowout, closest,
      mostGames: mostK ? { name: nameOf[mostK] || '', n: gamesBy[mostK] } : null,
      longestWait: waitK ? { name: per[waitK].name, sec: per[waitK].wait } : null,
      busiest: hk !== undefined ? { label: `${hf(Number(hk))}–${hf((Number(hk) + 1) % 24)}`, games: hours[hk] } : null,
      streak: streak.n > 1 ? streak : null
    },
    buckets
  };
}
function renderRecapHtml(r){
  const t = r.totals, tile = (l, v, sub) => `<div class="recap-tile"><div class="l">${l}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  const dash = '—', e = escapeHtml;
  const cg = Object.keys(t.courtGames || {}).sort().map(c => `C${c}: ${t.courtGames[c]}`).join(' · ');
  const head = [
    tile('Average waiting time', fmtMS(t.avgWait), 'per player'),
    tile('Average playing time', fmtMS(t.avgPlay), 'per player'),
    tile('Total games', t.games),
    tile('Longest game', fmtMS(t.longest)),
    tile('Shortest game', fmtMS(t.shortest))
  ].join('');
  const more = [
    tile('Session length', r.startedAt ? fmtMS(r.lengthSec) : dash, 'courts active to end'),
    tile('Players', t.players, `${t.played} played at least 1 game`),
    tile('Average game length', fmtMS(t.avgGame)),
    tile('Total points scored', t.points),
    tile('Court utilization', t.util === null ? dash : t.util + '%', cg ? 'games per court · ' + e(cg) : ''),
    tile('Biggest blowout', t.blowout ? e(t.blowout.score) : dash, t.blowout ? `${e(t.blowout.matchId)} · margin ${t.blowout.margin}` : ''),
    tile('Closest game', t.closest ? e(t.closest.score) : dash, t.closest ? e(t.closest.matchId) : ''),
    tile('Most games played', t.mostGames ? e(t.mostGames.name) : dash, t.mostGames ? t.mostGames.n + ' games' : ''),
    tile('Longest waiter', t.longestWait ? e(t.longestWait.name) : dash, t.longestWait ? fmtMS(t.longestWait.sec) + ' total waiting' : ''),
    tile('Busiest hour', t.busiest ? e(t.busiest.label) : dash, t.busiest ? t.busiest.games + ' games finished' : ''),
    tile('Longest win streak', t.streak ? e(t.streak.name) : dash, t.streak ? t.streak.n + ' wins in a row' : '')
  ].join('');
  const bk = (r.buckets || []).map(b => `<div class="recap-bucket"><h4>${e(b.label)}${b.mode ? `<span class="mode-tag">${modeLabel(b.mode)}</span>` : ''}</h4>
    <div class="recap-kv">
      <div><span>GAMES</span><b>${b.games}</b></div><div><span>PLAYERS</span><b>${b.players}</b></div>
      <div><span>AVG WAITING</span><b>${fmtMS(b.avgWait)}</b></div><div><span>AVG PLAYING</span><b>${fmtMS(b.avgPlay)}</b></div>
      <div><span>AVG GAME</span><b>${fmtMS(b.avgGame)}</b></div><div><span>LONGEST</span><b>${fmtMS(b.longest)}</b></div>
      <div><span>SHORTEST</span><b>${fmtMS(b.shortest)}</b></div><div><span>POINTS</span><b>${b.points}</b></div>
      <div><span>TOP OF LEADERBOARD</span><b>${b.top ? e(b.top) : dash}</b></div>
    </div></div>`).join('');
  let endedTxt = '';
  try { endedTxt = new Date(r.endedAt).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }); } catch (x) {}
  return `<div class="recap-title">🏓 ${e(r.sessionName)}</div>
    <div class="recap-sub">${e(r.sessionDate || '')}${endedTxt ? ' · ended ' + e(endedTxt) : ''}</div>
    <div class="recap-h">Session stats</div><div class="recap-grid">${head}</div>
    <div class="recap-h">More stats</div><div class="recap-grid">${more}</div>
    ${bk ? `<div class="recap-h">Per category</div>${bk}` : ''}`;
}
function setEndSessUI(mode){
  endSessMode = mode;
  const warn = document.getElementById('endSessWarn'), card = document.getElementById('recapCard');
  const confirmBtn = document.getElementById('btnEndSessConfirm'), imgBtn = document.getElementById('btnEndSessImg'), closeBtn = document.getElementById('btnEndSessClose');
  const name = sessionState.currentSessionName || 'Session';
  document.getElementById('errEndSess').textContent = '';
  warn.style.display = mode === 'blocked' ? 'block' : 'none';
  card.style.display = mode === 'blocked' ? 'none' : 'block';
  confirmBtn.style.display = mode === 'confirm' ? '' : 'none';
  imgBtn.style.display = mode === 'blocked' ? 'none' : '';
  closeBtn.textContent = mode === 'confirm' ? 'Cancel' : 'Close';
  document.getElementById('endSessTitle').textContent = mode === 'blocked' ? "Can't end the session yet" : (mode === 'view' ? 'Session recap' : 'End session · recap');
  document.getElementById('endSessSub').textContent = mode === 'confirm'
    ? `Review the stats. Confirming saves "END - ${name}" to Snapshots and locks the session (timers stop, courts deactivate). Logs and the leaderboard stay until you start a New session.`
    : (mode === 'view' ? `Saved as "END - ${name}" in Snapshots.` : '');
}
function openEndSession(){
  if (!sessionState.currentSessionId) { showToast('No active session to end.', true); return; }
  if (sessionState.sessionEndedAt) {
    recapCurrent = sessionState.sessionRecap || computeRecap();
    document.getElementById('recapCard').innerHTML = renderRecapHtml(recapCurrent);
    setEndSessUI('view'); endSessOverlay.classList.add('show'); return;
  }
  const b = endBlockers();
  if (b.total) {
    document.getElementById('endSessWarn').innerHTML = `<b>Finish or clear these first:</b><br>${b.playing} game${b.playing === 1 ? '' : 's'} playing · ${b.onCourt} on a court (not started) · ${b.waiting} waiting in the queue.<br>End the games, then clear the waiting queue, and try again.`;
    setEndSessUI('blocked'); endSessOverlay.classList.add('show'); return;
  }
  recapCurrent = computeRecap();
  document.getElementById('recapCard').innerHTML = renderRecapHtml(recapCurrent);
  setEndSessUI('confirm'); endSessOverlay.classList.add('show');
}
document.getElementById('btnEndSession').addEventListener('click', openEndSession);
document.getElementById('btnEndSessClose').addEventListener('click', () => { if (!endSessBusy) endSessOverlay.classList.remove('show'); });
endSessOverlay.addEventListener('click', e => { if (e.target === endSessOverlay && !endSessBusy) endSessOverlay.classList.remove('show'); });
document.getElementById('btnEndSessConfirm').addEventListener('click', async () => {
  if (endSessBusy || endSessMode !== 'confirm') return;
  const errEl = document.getElementById('errEndSess');
  errEl.textContent = '';
  if (endBlockers().total) { openEndSession(); return; }     // something started while the pop-up was open
  endSessBusy = true;
  const btn = document.getElementById('btnEndSessConfirm'); btn.disabled = true;
  try {
    const recap = JSON.parse(JSON.stringify(computeRecap()));
    const sid = sessionState.currentSessionId, name = sessionState.currentSessionName || 'Session';
    const live = await readLiveState();
    await saveSnapshot('end', `END - ${name}`, live, { recap });          // saved first: if this fails nothing else changes
    const batch = db.batch();
    participants.map(p => elapsedWrite(p)).filter(Boolean).forEach(w => batch.set(w.ref, w.data, { merge:true }));   // lock in everyone's waiting / playing / resting time
    batch.set(db.collection('pkl-queue-session').doc('state'), { courtsActiveAt: null, sessionEndedAt: recap.endedAt, sessionRecap: recap }, { merge:true });
    if (sid) batch.set(db.collection('pkl-queue-sessions').doc(sid), { endedAt: recap.endedAt }, { merge:true });
    await batch.commit();
    BUCKETS.forEach(b => discardSuggestions(b.key));
    recapCurrent = recap;
    document.getElementById('recapCard').innerHTML = renderRecapHtml(recap);
    setEndSessUI('view');
    showToast(`Session ended. Saved as "END - ${name}".`);
  } catch (err) { errEl.textContent = 'Could not end the session: ' + err.message; }
  finally { endSessBusy = false; btn.disabled = false; }
});
document.getElementById('btnEndSessImg').addEventListener('click', async () => {
  if (typeof html2canvas === 'undefined') { showToast('The image tool did not load. Check your internet connection and refresh.', true); return; }
  const node = document.getElementById('recapCard'), btn = document.getElementById('btnEndSessImg');
  btn.disabled = true;
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff';
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: bg, useCORS: true, onclone: doc => {
      let n = doc.getElementById('recapCard');
      while (n) { n.style.maxHeight = 'none'; n.style.overflow = 'visible'; n = n.parentElement; }
    } });
    const fname = `END - ${(recapCurrent && recapCurrent.sessionName) || 'Session'}`.replace(/[\\/:*?"<>|]+/g, '-') + '.png';
    canvas.toBlob(blob => {
      if (!blob) { showToast('Could not create the image.', true); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, 'image/png');
  } catch (err) { showToast('Could not create the image: ' + err.message, true); }
  finally { btn.disabled = false; }
});

/* ================= SNAPSHOTS (save / view / restore a session) ================= */
const SNAP_COL = 'pkl-queue-snapshots';
let snapshotsList = [], snapBusy = false, snapViewId = null;
db.collection(SNAP_COL).orderBy('savedAtMs','desc').limit(60).onSnapshot(snap => {
  snapshotsList = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  renderSnapshotsList();
}, err => showToast('Snapshots sync error: ' + err.message, true));

async function readLiveState(){
  const [pSnap, mSnap, sSnap, bSnap] = await Promise.all([
    db.collection('pkl-queue-participants').get(),
    db.collection('pkl-queue-matches').get(),
    db.collection('pkl-queue-session').doc('state').get(),
    db.collection('pkl-queue-buckets').get()
  ]);
  return {
    buckets: bSnap.docs.map(d => ({ id:d.id, ...d.data() })),
    participants: pSnap.docs.map(d => ({ id:d.id, ...d.data() })),
    matches: mSnap.docs.map(d => ({ id:d.id, ...d.data() })),
    state: sSnap.exists ? sSnap.data() : {}
  };
}
async function saveSnapshot(kind, label, live, extra){
  live = live || await readLiveState();
  const st = live.state || {};
  const ref = await db.collection(SNAP_COL).add({
    kind, label: label || '',
    savedAtMs: Date.now(), savedAt: firebase.firestore.FieldValue.serverTimestamp(),
    sessionId: st.currentSessionId || null, sessionName: st.currentSessionName || '', sessionDate: st.currentSessionDate || '',
    participants: live.participants, matches: live.matches, buckets: live.buckets || [],
    partnerCounts: st.partnerCounts || {}, opponentCounts: st.opponentCounts || {}, matchCounter: st.matchCounter || 0,
    ...(extra || {})
  });
  return ref.id;
}
function fmtSnapTime(ms){ try { return new Date(ms).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }); } catch(e){ return ''; } }
function snapNames(team){ return (team || []).map(p => escapeHtml(p.name)).join(' &amp; '); }

/* --- manual save --- */
const saveSnapOverlay = document.getElementById('saveSnapOverlay');
document.getElementById('btnSaveSnap').addEventListener('click', () => {
  document.getElementById('snapLabelInput').value = '';
  document.getElementById('errSaveSnap').textContent = '';
  document.getElementById('saveSnapSub').textContent = `Saves the current participants, queue and pairing history of "${sessionState.currentSessionName || 'this session'}" so you can view or restore them later.`;
  saveSnapOverlay.classList.add('show');
  document.getElementById('snapLabelInput').focus();
});
document.getElementById('btnSaveSnapCancel').addEventListener('click', () => saveSnapOverlay.classList.remove('show'));
saveSnapOverlay.addEventListener('click', e => { if (e.target === saveSnapOverlay) saveSnapOverlay.classList.remove('show'); });
document.getElementById('btnSaveSnapConfirm').addEventListener('click', async () => {
  const btn = document.getElementById('btnSaveSnapConfirm'), err = document.getElementById('errSaveSnap');
  err.textContent = ''; btn.disabled = true;
  try {
    await saveSnapshot('manual', document.getElementById('snapLabelInput').value.trim());
    saveSnapOverlay.classList.remove('show');
    showToast('Snapshot saved.');
  } catch (e) { err.textContent = 'Could not save: ' + e.message; }
  finally { btn.disabled = false; }
});

/* --- list --- */
const snapListOverlay = document.getElementById('snapListOverlay');
document.getElementById('btnSnapshots').addEventListener('click', () => { renderSnapshotsList(); snapListOverlay.classList.add('show'); });
document.getElementById('btnSnapListClose').addEventListener('click', () => snapListOverlay.classList.remove('show'));
snapListOverlay.addEventListener('click', e => { if (e.target === snapListOverlay) snapListOverlay.classList.remove('show'); });
function renderSnapshotsList(){
  const el = document.getElementById('snapList');
  if (!el) return;
  if (!snapshotsList.length) { el.innerHTML = `<div style="padding:18px;text-align:center;color:var(--muted);font-size:13px;">No snapshots yet. Use 💾 Save, or start a new session and one is saved automatically.</div>`; return; }
  el.innerHTML = snapshotsList.map(s => {
    const auto = s.kind === 'auto', ended = s.kind === 'end';
    return `<div class="snap-item">
      <div><div class="snap-title">${escapeHtml(s.label || s.sessionName || 'Snapshot')}
        <span class="badge" style="background:${ended ? '#c0392b' : (auto ? '#6b7f8c' : '#2e9e5b')};">${ended ? 'Session ended' : (auto ? 'Auto' : 'Manual')}</span></div>
        <div class="snap-meta">${escapeHtml(s.sessionName || '')}${s.sessionDate ? ' · ' + escapeHtml(s.sessionDate) : ''} · saved ${fmtSnapTime(s.savedAtMs)} · ${(s.participants||[]).length} players · ${(s.matches||[]).length} in queue</div></div>
      <div class="snap-actions">
        <button class="btn btn-ghost btn-sm" onclick="openSnapshotView('${s.id}')">View</button>
        <button class="btn btn-primary btn-sm" onclick="restoreSnapshot('${s.id}')">Restore</button>
        <button class="btn btn-ghost btn-sm" title="Delete snapshot" onclick="deleteSnapshot('${s.id}')">✕</button>
      </div></div>`;
  }).join('');
}
async function deleteSnapshot(id){
  const s = snapshotsList.find(x => x.id === id);
  if (!s || !confirm(`Delete snapshot "${s.label || s.sessionName || 'Snapshot'}"? This can't be undone.`)) return;
  try { await db.collection(SNAP_COL).doc(id).delete(); showToast('Snapshot deleted.'); }
  catch (e) { showToast('Delete failed: ' + e.message, true); }
}

/* --- view (read-only) --- */
const snapViewOverlay = document.getElementById('snapViewOverlay');
document.getElementById('btnSnapViewClose').addEventListener('click', () => snapViewOverlay.classList.remove('show'));
snapViewOverlay.addEventListener('click', e => { if (e.target === snapViewOverlay) snapViewOverlay.classList.remove('show'); });
document.getElementById('btnSnapViewRestore').addEventListener('click', () => { if (snapViewId) restoreSnapshot(snapViewId); });
function openSnapshotView(id){
  const s = snapshotsList.find(x => x.id === id);
  if (!s) return;
  snapViewId = id;
  document.getElementById('snapViewTitle').textContent = s.label || s.sessionName || 'Snapshot';
  document.getElementById('snapViewSub').textContent = `${s.sessionName || ''}${s.sessionDate ? ' · ' + s.sessionDate : ''} · saved ${fmtSnapTime(s.savedAtMs)} · ${s.kind === 'auto' ? 'auto-saved' : (s.kind === 'end' ? 'session ended' : 'manual')} · read-only preview`;
  const parts = s.participants || [], ms = (s.matches || []).slice().sort((a,b) => (a.order||0) - (b.order||0));
  const sb = (s.buckets && s.buckets.length) ? s.buckets.map(x => ({ key:x.id, label:x.name })) : BUCKETS.map(x => ({ key:x.key, label:x.label }));
  const sbLabel = k => (sb.find(x => x.key === k) || {}).label || bucketLabel(k);
  const playingSet = new Set();
  ms.forEach(m => { if (m.status === 'playing') [...m.team1, ...m.team2].forEach(p => playingSet.add(p.participantId)); });
  const stLabel = p => p.status === 'resting' ? 'Resting' : (p.status === 'queued' ? (playingSet.has(p.id) ? 'Playing' : 'On queue') : 'Available');
  const partsHtml = sb.map(b => {
    const list = parts.filter(p => p.bucket === b.key).sort((x,y) => (x.name||'').localeCompare(y.name||''));
    return `<div class="snap-sec"><h4>${escapeHtml(b.label)} (${list.length})</h4>` + (list.length
      ? list.map(p => `<div class="snap-line"><span>${escapeHtml(p.name)}</span><span style="color:var(--muted);">${escapeHtml(String(p.duprRaw ?? p.dupr ?? ''))} · ${stLabel(p)}</span></div>`).join('')
      : `<div class="snap-line" style="color:var(--muted);">No one.</div>`) + `</div>`;
  }).join('');
  const matchHtml = ms.length ? ms.map(m => `<div class="snap-line"><span><b>${escapeHtml(m.matchId || '')}</b> · ${snapNames(m.team1)} vs ${snapNames(m.team2)}</span><span style="color:var(--muted);">${escapeHtml(sbLabel(m.bucket))} · ${m.status}${m.court ? ' · Court ' + m.court : ''}</span></div>`).join('')
    : `<div class="snap-line" style="color:var(--muted);">Nothing in the queue.</div>`;
  const pc = Object.keys(s.partnerCounts || {}).length, oc = Object.keys(s.opponentCounts || {}).length;
  let lbHtml = '';
  if (s.sessionId) {
    const data = buildLeaderboard(s.sessionId);
    const done = logs.filter(l => l.sessionId === s.sessionId).length;
    lbHtml = `<div class="snap-sec"><h4>Completed matches in this session: ${done}</h4>` + lbBuckets(s.sessionId).map(b => {
      const top = (data[b.key] || []).slice(0, 3);
      return top.length ? `<div class="snap-line"><span><b>${escapeHtml(b.label)}</b></span><span>${top.map((e,i) => `${i+1}. ${escapeHtml(e.name)} (${e.w}W)`).join(' · ')}</span></div>` : '';
    }).join('') + `</div>`;
  }
  document.getElementById('snapViewBody').innerHTML =
    `<div class="snap-sec"><h4>Queue (${ms.length})</h4>${matchHtml}</div>` + partsHtml +
    `<div class="snap-sec"><h4>Pairing history</h4><div class="snap-line"><span>${pc} partner pair${pc===1?'':'s'} and ${oc} opponent pair${oc===1?'':'s'} tracked</span></div></div>` + lbHtml;
  snapViewOverlay.classList.add('show');
}

/* --- restore --- */
async function restoreSnapshot(id){
  const s = snapshotsList.find(x => x.id === id);
  if (!s || snapBusy) return;
  const np = (s.participants || []).length, nm = (s.matches || []).length;
  const msg = `Restore "${s.label || s.sessionName || 'Snapshot'}"?\n\n` +
    `• Replaces the current participants and queue with the snapshot (${np} players, ${nm} queued matches).\n` +
    `• Switches back to session "${s.sessionName || '—'}".\n` +
    `• Matches that were on a court go back to the waiting queue, and all timers restart now.\n` +
    `• The current state is auto-saved first, so you can undo this.`;
  if (!confirm(msg)) return;
  snapBusy = true;
  try {
    const live = await readLiveState();
    if (live.participants.length || live.matches.length) {
      try { await saveSnapshot('auto', `Before restoring "${s.label || s.sessionName || 'Snapshot'}"`, live); }
      catch (e) { throw new Error('Could not auto-save the current state first, so nothing was changed. ' + e.message); }
    }
    await Promise.all(live.participants.map(flushElapsed));   // close out current timers

    // make sure the session record exists
    if (s.sessionId && !sessionsList.find(x => x.id === s.sessionId)) {
      await db.collection('pkl-queue-sessions').doc(s.sessionId).set({ name: s.sessionName || 'Restored session', date: s.sessionDate || '', eventName: s.sessionName || 'Restored session', location:'', scoreType:'SIDEOUT', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }

    const now = Date.now();
    const haveB = new Set((live.buckets || []).map(x => x.id));
    const restoreOps = [];
    (s.buckets || []).forEach(bk => { if (!haveB.has(bk.id)) { const { id, ...data } = bk; haveB.add(id); restoreOps.push(b => b.set(db.collection('pkl-queue-buckets').doc(id), data)); } });
    const legacyDefs = { singles:{ name:'Singles', mode:'singles' }, fun:{ name:'Fun Mode (Low)', mode:'doubles' }, competitive:{ name:'Competitive Mode (High)', mode:'doubles' } };
    new Set([...(s.participants || []).map(p => p.bucket), ...(s.matches || []).map(m => m.bucket)]).forEach(k => {
      if (!haveB.has(k) && legacyDefs[k]) { haveB.add(k); restoreOps.push(b => b.set(db.collection('pkl-queue-buckets').doc(k), { ...legacyDefs[k], createdAtMs: now, createdAt: firebase.firestore.FieldValue.serverTimestamp() })); }
    });
    const keepP = new Set((s.participants || []).map(p => p.id)), keepM = new Set((s.matches || []).map(m => m.id));
    const ops = [...restoreOps];
    live.participants.filter(p => !keepP.has(p.id)).forEach(p => ops.push(b => b.delete(db.collection('pkl-queue-participants').doc(p.id))));
    live.matches.filter(m => !keepM.has(m.id)).forEach(m => ops.push(b => b.delete(db.collection('pkl-queue-matches').doc(m.id))));
    (s.participants || []).forEach(p => { const { id, ...data } = p; ops.push(b => b.set(db.collection('pkl-queue-participants').doc(id), { ...data, statusSince: now })); });
    (s.matches || []).forEach(m => {
      const { id, ...data } = m;
      const onCourt = COURT_BUSY_STATUSES.includes(data.status);
      ops.push(b => b.set(db.collection('pkl-queue-matches').doc(id), onCourt ? { ...data, status:'waiting', court:null, startedAt:null } : data));
    });
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach(fn => fn(batch));
      await batch.commit();
    }

    // pairing history: snapshot counts merged with what logs + restored queue actually contain (max of both)
    const P = { ...(s.partnerCounts || {}) }, O = { ...(s.opponentCounts || {}) };
    const rP = {}, rO = {};
    const inc = (obj, a, b) => { const k = pairKey(a, b); obj[k] = (obj[k] || 0) + 1; };
    const addTeams = (t1, t2) => {
      if (t1.length === 2) inc(rP, t1[0].participantId, t1[1].participantId);
      if (t2.length === 2) inc(rP, t2[0].participantId, t2[1].participantId);
      t1.forEach(p => t2.forEach(q => inc(rO, p.participantId, q.participantId)));
    };
    if (s.sessionId) logs.filter(l => l.sessionId === s.sessionId).forEach(l => addTeams(l.team1 || [], l.team2 || []));
    (s.matches || []).forEach(m => addTeams(m.team1 || [], m.team2 || []));
    Object.keys(rP).forEach(k => { P[k] = Math.max(P[k] || 0, rP[k]); });
    Object.keys(rO).forEach(k => { O[k] = Math.max(O[k] || 0, rO[k]); });
    await db.collection('pkl-queue-session').doc('state').set({
      partnerCounts: P, opponentCounts: O,
      currentSessionId: s.sessionId || null, currentSessionName: s.sessionName || '', currentSessionDate: s.sessionDate || '',
      matchCounter: Math.max((live.state && live.state.matchCounter) || 0, s.matchCounter || 0),
      sessionEndedAt: null, sessionRecap: null
    }, { mergeFields: ['partnerCounts','opponentCounts','currentSessionId','currentSessionName','currentSessionDate','matchCounter','sessionEndedAt','sessionRecap'] });

    BUCKETS.forEach(b => discardSuggestions(b.key));
    snapViewOverlay.classList.remove('show'); snapListOverlay.classList.remove('show');
    showToast(`Restored "${s.label || s.sessionName || 'snapshot'}".`);
  } catch (e) { showToast('Restore failed: ' + e.message, true); }
  finally { snapBusy = false; }
}


/* ================= LEADERBOARD (per session, per bucket) ================= */
function buildLeaderboard(sessionId, byPool){
  const res = {};
  BUCKETS.forEach(b => res[b.key] = {});
  logs.filter(l => l.sessionId === sessionId).forEach(l => {
    const lbKey = byPool && bucketHasPools(l.bucket) ? l.bucket + '|' + (l.pool || '') : l.bucket;
    const map = res[lbKey] || (res[lbKey] = {});
    const s1 = Number(l.score1) || 0, s2 = Number(l.score2) || 0;
    const fx = (BUCKETS.find(b => b.key === l.bucket) || {}).mode === 'fixed';
    const add = (team, pf, pa, won) => (fx ? [team] : team.map(p => [p])).forEach(grp => {
      const k = grp.map(refKeyFor).sort().join('+'), nm = grp.map(p => p.name).join(' & ');
      const e = map[k] || (map[k] = { name:nm, gp:0, w:0, l:0, pf:0, pa:0 });
      e.name = nm; e.gp++; if (won) e.w++; else e.l++; e.pf += pf; e.pa += pa;
    });
    add(l.team1, s1, s2, l.winner === 'team1');
    add(l.team2, s2, s1, l.winner === 'team2');
  });
  const out = {};
  Object.keys(res).forEach(bk => {
    const arr = Object.values(res[bk]).map(e => ({ ...e, pd: e.pf - e.pa }));
    arr.sort((a,b) => b.w - a.w || b.pf - a.pf || b.pd - a.pd || a.name.localeCompare(b.name));
    arr.forEach((e, i) => { e.rank = (i > 0 && arr[i-1].w === e.w && arr[i-1].pf === e.pf && arr[i-1].pd === e.pd) ? arr[i-1].rank : i + 1; });
    out[bk] = arr;
  });
  return out;
}
function lbBuckets(sessionId){
  const list = BUCKETS.slice(), seen = new Set(list.map(b => b.key));
  logs.filter(l => l.sessionId === sessionId).forEach(l => {
    if (!seen.has(l.bucket)) { seen.add(l.bucket); list.push({ key:l.bucket, label: bucketLabel(l.bucket, l.bucketName), mode:null, color:BUCKET_COLOR }); }
  });
  return list;
}
function renderLeaderboard(){}

/* ================= DUPR CSV EXPORT ================= */
const DUPR_HEADERS = ['matchType','event','date','playerA1','playerA1DuprId','playerA1ExternalId','playerA2','playerA2DuprId','playerA2ExternalId','playerB1','playerB1DuprId','playerB1ExternalId','playerB2','playerB2DuprId','playerB2ExternalId','teamAGame1','teamBGame1','teamAGame2','teamBGame2','teamAGame3','teamBGame3','teamAGame4','teamBGame4','teamAGame5','teamBGame5','location','scoreType'];
function csvCell(v){
  const t = (v === null || v === undefined) ? '' : String(v);
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g,'""') + '"' : t;
}
/* Exports the session picked in the Logs filter, or the current session when the filter is "All sessions". */
function exportTargetSession(){
  const id = logFilterSessionId || sessionState.currentSessionId;
  const found = sessionsList.find(x => x.id === id);
  if (found) return found;
  if (logFilterSessionId) return null;
  // Fallbacks so export/settings still work if the sessions list hasn't loaded or the doc is missing
  if (sessionState.currentSessionId) {
    return { id: sessionState.currentSessionId, name: sessionState.currentSessionName || 'Session',
             date: sessionState.currentSessionDate || new Date().toISOString().slice(0,10), _virtual: true };
  }
  if (sessionsList.length) return sessionsList[0];
  return { id: null, name: 'Session', date: new Date().toISOString().slice(0,10), _virtual: true };
}
function updateExportTargetLabel(){
  const el = document.getElementById('exportTargetLabel');
  if (!el) return;
  const s = exportTargetSession();
  el.textContent = s ? `Applies to: ${s.name} (${s.date})` : '';
}
function buildDuprCsv(sess){
  const all = logs.filter(l => (l.sessionId || null) === (sess.id || null)).slice().reverse(); // oldest first
  const matches = all.filter(l => !isTeam(l.bucket));   // team-name categories have no individual DUPR players
  const skippedTeam = all.length - matches.length;
  const event = sess.eventName || sess.name || '';
  const scoreType = sess.scoreType || 'SIDEOUT';
  const location = sess.location || '';
  let missingIds = 0;
  const rows = matches.map(l => {
    const cell = (team, i) => {
      const p = team[i];
      if (!p) return ['', '', ''];
      if (!p.duprId) missingIds++;
      return [p.name, p.duprId || '', ''];
    };
    const a1 = cell(l.team1,0), a2 = cell(l.team1,1), b1 = cell(l.team2,0), b2 = cell(l.team2,1);
    const row = [(l.team1 || []).length === 1 ? 'S' : 'D', event, sess.date, ...a1, ...a2, ...b1, ...b2,
      l.score1, l.score2, '', '', '', '', '', '', '', '', location, scoreType];
    return row.map(csvCell).join(',');
  });
  return { csv: [DUPR_HEADERS.join(','), ...rows].join('\n') + '\n', count: matches.length, missingIds, location, skippedTeam };
}
document.getElementById('btnExportDupr').addEventListener('click', () => {
  const sess = exportTargetSession();
  if (!sess) { showToast('No session found to export.', true); return; }
  const { csv, count, missingIds, location, skippedTeam } = buildDuprCsv(sess);
  if (!count) { showToast(skippedTeam ? 'Only Team Name matches are logged. They are not included in the DUPR export.' : `No logged matches in "${sess.name}" yet.`, true); return; }
  const slug = (sess.eventName || sess.name || 'session').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dupr-matches_${slug}_${sess.date}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  const notes = [];
  if (missingIds) notes.push(`${missingIds} player slot${missingIds===1?'':'s'} without DUPR ID`);
  if (!location) notes.push('no location set');
  if (skippedTeam) notes.push(`${skippedTeam} Team Name match${skippedTeam===1?'':'es'} left out`);
  showToast(`Exported ${count} match${count===1?'':'es'}.` + (notes.length ? ' Note: ' + notes.join(', ') + '.' : ''));
});

/* ================= SCORESHEET PDF (blank score boxes, A4, queue order) ================= */
function scoresheetEntries(){
  const sid = sessionState.currentSessionId || null;
  const done = logs.filter(l => (l.sessionId || null) === sid).slice().reverse()          // oldest first
    .map(l => ({ t1: l.team1 || [], t2: l.team2 || [], bucket: l.bucketName || bucketLabel(l.bucket), no: l.matchId || '' }));
  const onCourt = queueMatches.filter(m => COURT_BUSY_STATUSES.includes(m.status))
    .sort((a,b) => (a.startedAt||0) - (b.startedAt||0) || (a.court||0) - (b.court||0));
  const waiting = queueMatches.filter(m => m.status === 'waiting' || m.status === 'onhold')
    .sort((a,b) => (a.order||0) - (b.order||0));
  return [...done, ...onCourt, ...waiting].map(x => x.t1 ? x : { t1: x.team1 || [], t2: x.team2 || [], bucket: bucketLabel(x.bucket), no: x.matchId || '' });
}
function scoresheetLogo(){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
      } catch (e) { resolve(null); }       // blocked when the page is opened from a local file (file://)
    };
    img.onerror = () => resolve(null);
    img.src = 'pklbox-logo.png?v=' + Date.now();
  });
}
function buildScoresheetPdf(logo){
  const J = (window.jspdf && window.jspdf.jsPDF) || null;
  if (!J) throw new Error('PDF library not loaded (check your internet connection).');
  const entries = scoresheetEntries();
  if (!entries.length) return null;
  const sess = sessionsList.find(x => x.id === sessionState.currentSessionId) || {};
  const title = (sess.eventName || sessionState.currentSessionName || 'Open Play').toUpperCase();
  const date = sessionState.currentSessionDate || sess.date || '';
  const location = sess.location || '';
  const sub = [date, location].filter(Boolean).join('  •  ');
    const multiBucket = new Set(entries.map(e => e.bucket)).size > 1;

  const doc = new J({ unit:'mm', format:'a4', orientation:'portrait' });
  const W = 210, H = 297, M = 14, LABEL_W = 0, GAP = 8, LINE = 5.4, PAD = 2.6, BOX = 15;
  const cardW = (W - 2*M - LABEL_W - GAP) / 2;
  const NAVY = [8,61,95], GRAY = [120,128,140], LINEC = [150,156,168];

  let y = M, page = 1;
  function header(first){
    y = M;
    if (first) {
      let tx = M;
      if (logo) { const sz = 18, w = sz * logo.w / logo.h; doc.addImage(logo.data, 'PNG', M, y, w, sz); tx = M + w + 4; }
      doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(20,24,32);
      doc.text(title, tx, y + 7, { maxWidth: W - tx - M });
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...GRAY);
      if (sub) doc.text(sub, tx, y + 13);
      y += 24;
    } else {
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...GRAY);
      doc.text(title, M, y + 3); y += 10;
    }
  }
  function fitText(txt, x, ty, maxW, size){
    doc.setFont('helvetica','normal');
    let fs = size; doc.setFontSize(fs);
    while (fs > 6 && doc.getTextWidth(txt) > maxW) { fs -= 0.5; doc.setFontSize(fs); }
    doc.text(txt, x, ty);
  }
  function teamLines(t){ const n = (t || []).map(p => p.name || '').filter(Boolean); return n.length ? n : ['']; }
  function drawCard(x, top, e, court, h1, h2){
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text(e.no ? String(e.no) : '-', x, top - 1.6);
    if (multiBucket && e.bucket) {
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text(String(e.bucket), x + cardW, top - 1.6, { align:'right', maxWidth: cardW * 0.6 });
    }
    doc.setDrawColor(...LINEC); doc.setLineWidth(0.3);
    doc.roundedRect(x, top, cardW, h1 + h2, 1.8, 1.8, 'S');
    doc.line(x, top + h1, x + cardW, top + h1);
    doc.line(x + cardW - BOX, top, x + cardW - BOX, top + h1 + h2);
    doc.setTextColor(20,24,32);
    [[teamLines(e.t1), top], [teamLines(e.t2), top + h1]].forEach(([names, ty]) => {
      names.forEach((n, i) => fitText(n, x + 4, ty + PAD + 3.4 + i * LINE, cardW - BOX - 7, 10));
    });
  }

  header(true);
  for (let i = 0; i < entries.length; i += 2) {
    const row = entries.slice(i, i + 2);
    const hs = row.map(e => [teamLines(e.t1).length * LINE + PAD * 2, teamLines(e.t2).length * LINE + PAD * 2]);
    const h = Math.max(...hs.map(([a, b]) => a + b));
    if (y + h + 11 > H - M - 6) { doc.addPage(); page++; header(false); }
    const top = y + 5;
    row.forEach((e, ci) => drawCard(M + ci * (cardW + GAP), top, e, 0, hs[ci][0], hs[ci][1]));
    y = top + h + 6;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 8, { align:'right' });
  }
  const slug = (sess.eventName || sessionState.currentSessionName || 'session').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return { doc, count: entries.length, file: `scoresheet_${slug}_${date || 'session'}.pdf` };
}
document.getElementById('btnExportScoresheet').addEventListener('click', async () => {
  try {
    const logo = await scoresheetLogo();
    const out = buildScoresheetPdf(logo);
    if (!out) { showToast('No matches in this session yet.', true); return; }
    out.doc.save(out.file);
    showToast(`Scoresheet exported: ${out.count} match${out.count===1?'':'es'}.` + (logo ? '' : ' Note: pklbox-logo.png could not be loaded, so the logo was left out.'), !logo);
  } catch (err) { showToast('Could not create scoresheet: ' + err.message, true); }
});

/* ---- DUPR export settings (stored on the session) ---- */
const duprSettingsOverlay = document.getElementById('duprSettingsOverlay');
document.getElementById('btnDuprSettings').addEventListener('click', () => {
  const sess = exportTargetSession();
  if (!sess) { showToast('No session found.', true); return; }
  document.getElementById('duprSettingsSub').textContent = `Applies to session: ${sess.name}`;
  document.getElementById('dsEvent').value = sess.eventName || sess.name || '';
  document.getElementById('dsDate').value = sess.date || '';
  document.getElementById('dsLocation').value = sess.location || '';
  document.getElementById('dsScoreType').value = sess.scoreType || 'SIDEOUT';
  document.getElementById('errDs').textContent = '';
  duprSettingsOverlay.classList.add('show');
});
document.getElementById('btnDsCancel').addEventListener('click', () => duprSettingsOverlay.classList.remove('show'));
duprSettingsOverlay.addEventListener('click', e => { if (e.target === duprSettingsOverlay) duprSettingsOverlay.classList.remove('show'); });
document.getElementById('btnDsSave').addEventListener('click', async () => {
  const sess = exportTargetSession();
  if (!sess) return;
  const eventName = document.getElementById('dsEvent').value.trim();
  const date = document.getElementById('dsDate').value;
  const errEl = document.getElementById('errDs');
  if (!eventName) { errEl.textContent = 'Enter an event name.'; return; }
  if (!date) { errEl.textContent = 'Pick a date.'; return; }
  const btn = document.getElementById('btnDsSave');
  btn.disabled = true;
  try {
    if (!sess.id) { errEl.textContent = 'No active session yet. Start one with "New session" first.'; return; }
    const data = { name: sess.name, eventName, date, location: document.getElementById('dsLocation').value.trim(), scoreType: document.getElementById('dsScoreType').value };
    if (sess._virtual) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('pkl-queue-sessions').doc(sess.id).set(data, { merge:true });
    if (sess.id === sessionState.currentSessionId) {
      await db.collection('pkl-queue-session').doc('state').set({ currentSessionDate: date }, { merge:true });
    }
    duprSettingsOverlay.classList.remove('show');
    showToast('DUPR export settings saved.');
  } catch (err) { showToast('Could not save settings: ' + err.message, true); }
  finally { btn.disabled = false; }
});

/* ================= INIT ================= */
renderMatchupBuckets();
renderCourts();
renderQueueList();
renderLogs();
renderLeaderboard();

}
