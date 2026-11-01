/* Boots the whole engine (legacy code + React tabs) in a simulated browser with a fake Firebase that serves realistic data.
   It catches ReferenceErrors / null elements in any render path that the data touches. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markup = fs.readFileSync(path.join(root, 'src/legacy/engine/markup.html'), 'utf8');
const dom = new JSDOM(`<!DOCTYPE html><body><div id="root">${markup}</div></body>`, { pretendToBeVisual: true, url: 'https://example.test/app' });
const w = dom.window;
Object.assign(globalThis, { window: w, document: w.document, HTMLElement: w.HTMLElement, Node: w.Node, localStorage: w.localStorage, sessionStorage: w.sessionStorage, requestAnimationFrame: w.requestAnimationFrame.bind(w), alert: () => {} });
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
w.confirm = () => true; w.prompt = () => '';
const errors = [];
w.addEventListener('error', e => errors.push(e.message + ' @ ' + (e.error && e.error.stack ? e.error.stack.split('\n')[1] : '')));

/* ---------- fake Firebase + realistic fixtures ---------- */
const P = (id, o) => ({ id, status: 'active', statusSince: Date.now(), sitOutStreak: 0, sourceType: 'import', duprId: '', dupr: 3, duprRaw: 'NR', ...o });
const fixtures = {
  'pkl-queue-buckets': [
    { id: 'b1', name: 'Open Doubles', mode: 'doubles', courts: [1, 2, 3, 4], order: 1000, createdAtMs: 1, pools: [{ id: 'p1', name: 'Pool A' }, { id: 'p2', name: 'Pool B' }] },
    { id: 'b2', name: 'Kitcheneros League', mode: 'team', courts: [1, 2], order: 2000, createdAtMs: 2 },
    { id: 'b3', name: 'Fixed Pairs', mode: 'fixed', courts: [], order: 3000, createdAtMs: 3 },
    { id: 'b4', name: 'Mixed', mode: 'mixed', courts: [], order: 4000, createdAtMs: 4 }
  ],
  'pkl-queue-participants': [
    P('a', { bucket: 'b1', name: 'Ana', pool: 'p1', duprId: 'X1', dupr: 3.5, duprRaw: '3.500' }), P('b', { bucket: 'b1', name: 'Ben', pool: 'p1' }),
    P('c', { bucket: 'b1', name: 'Cy', pool: 'p2' }), P('d', { bucket: 'b1', name: 'Di' }),
    P('t1', { bucket: 'b2', name: 'Team Rocket', pool: undefined }), P('t2', { bucket: 'b2', name: 'Team Net' }),
    P('f1', { bucket: 'b3', name: 'Fay', pairId: 'pr1' }), P('f2', { bucket: 'b3', name: 'Gus', pairId: 'pr1' }),
    P('m1', { bucket: 'b4', name: 'Max', gender: 'M' }), P('m2', { bucket: 'b4', name: 'Mia', gender: 'F' })
  ].map(x => { Object.keys(x).forEach(k => x[k] === undefined && delete x[k]); return x; }),
  'pkl-queue-matches': [
    { id: 'q1', matchId: 'M-001', bucket: 'b2', status: 'waiting', order: 1, court: null, team1: [{ participantId: 't1', name: 'Team Rocket' }], team2: [{ participantId: 't2', name: 'Team Net' }] },
    { id: 'q2', matchId: 'M-002', bucket: 'b1', pool: 'p1', status: 'playing', order: 2, court: 1, startedAt: Date.now() - 65000,
      team1: [{ participantId: 'a', name: 'Ana' }, { participantId: 'b', name: 'Ben' }], team2: [{ participantId: 'c', name: 'Cy' }, { participantId: 'd', name: 'Di' }] }
  ],
  'pkl-queue-logs': [
    { id: 'L1', matchId: 'M-000', bucket: 'b2', sessionId: 's1', team1: [{ participantId: 't1', name: 'Team Rocket' }], team2: [{ participantId: 't2', name: 'Team Net' }], score1: 11, score2: 4, winner: 'team1', court: 1, durationSeconds: 300 }
  ],
  'pkl-queue-stats': [], 'pkl-queue-snapshots': [],
  'pkl-queue-sessions': [{ id: 's1', name: 'Saturday', date: '2026-11-01', eventName: 'Saturday' }],
  'pkl-queue-session/state': { currentSessionId: 's1', currentSessionName: 'Saturday', currentSessionDate: '2026-11-01', courtCount: 4, courtsActiveAt: Date.now() - 600000, matchCounter: 2, partnerCounts: {}, opponentCounts: {} },
  'pkl-queue-events/displaySettings': { showQueue: true }
};
const snapOf = arr => ({ docs: arr.map(d => { const { id, ...rest } = d; return { id, data: () => rest }; }), metadata: { hasPendingWrites: false, fromCache: false }, forEach(fn){ this.docs.forEach(fn); }, empty: !arr.length });
const col = name => ({
  onSnapshot(...args){ const cb = args.find(a => typeof a === 'function'); setTimeout(() => cb(snapOf(fixtures[name] || [])), 0); return () => {}; },
  orderBy(){ return col(name); }, limit(){ return col(name); },
  get: async () => snapOf(fixtures[name] || []), add: async () => ({ id: 'new' }),
  doc(id){ const key = name + '/' + id, data = fixtures[key];
    return { id, onSnapshot(...args){ const cb = args.find(a => typeof a === 'function'); setTimeout(() => cb({ exists: data !== undefined, data: () => data || {}, metadata: {} }), 0); return () => {}; },
      get: async () => ({ exists: data !== undefined, data: () => data || {} }), set: async () => {}, update: async () => {}, delete: async () => {} }; }
});
const batch = () => ({ set(){}, update(){}, delete(){}, commit: async () => {} });
const firestore = () => ({ collection: col, batch, settings(){}, enablePersistence: async () => {}, runTransaction: async fn => fn({ get: async () => ({ exists: true, data: () => ({}) }), set(){} }) });
firestore.FieldValue = { serverTimestamp: () => 'ts', increment: n => n, delete: () => null };
globalThis.__fakeFirebase = { firestore, apps: [], auth: () => ({}) };

const tmp = path.join(root, '.tmp-smoke'); fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'stub.js'), 'export default globalThis.__fakeFirebase;');
fs.writeFileSync(path.join(tmp, 'entry.js'), `export { startEngine } from '../src/legacy/engine/engine.js'; export { mountPanels } from '../src/engine/panels.jsx';`);
await build({ entryPoints: [path.join(tmp, 'entry.js')], outfile: path.join(tmp, 'bundle.mjs'), bundle: true, format: 'esm', platform: 'node', jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/client'], logLevel: 'error',
  plugins: [{ name: 'stub', setup(b){ b.onResolve({ filter: /firebase\.js$/ }, () => ({ path: path.join(tmp, 'stub.js') })); } }] });
const { startEngine, mountPanels } = await import(path.join(tmp, 'bundle.mjs'));
const { act } = await import('react');

test('engine boots and renders every tab from realistic data without errors', async () => {
  await act(async () => {
    startEngine({ user: { uid: 'u', email: 'a@b.c' }, profile: { displayName: 'Test Club' }, isSuper: false, logout(){} });
    mountPanels();
    await new Promise(r => setTimeout(r, 200));
  });
  assert.deepEqual(errors, [], 'no runtime errors');
  const $ = id => document.getElementById(id);

  const parts = $('bucketCards-participants').textContent;
  for (const n of ['Open Doubles', 'Kitcheneros League', 'Fixed Pairs', 'Mixed', 'Pool A', 'Pool B', 'Team Rocket', 'Ana', 'Fay', 'Mia']) assert.match(parts, new RegExp(n));
  const teamCard = [...document.querySelectorAll('#bucketCards-participants .bucket-card')].find(c => c.textContent.includes('Kitcheneros'));
  assert.ok(![...teamCard.querySelectorAll('th')].some(t => t.textContent === 'DUPR ID'), 'team category has no DUPR columns');
  assert.ok([...teamCard.querySelectorAll('th')].some(t => t.textContent === 'Team'));
  const doublesCard = [...document.querySelectorAll('#bucketCards-participants .bucket-card')].find(c => c.textContent.includes('Open Doubles'));
  assert.ok([...doublesCard.querySelectorAll('th')].some(t => t.textContent === 'Pool'), 'pooled category shows the Pool column');

  assert.match($('courtsGrid').textContent, /Court 1/); assert.match($('courtsGrid').textContent, /In progress/);
  assert.match($('queueList').textContent, /Team Rocket/);
  assert.match($('bucketCards-matchups').textContent, /Generate matchups/);

  assert.match($('lbRoot').textContent, /Team Rocket/, 'React leaderboard shows the team result');
  assert.match($('logsRoot').textContent, /M-000/, 'React logs tab shows the logged match');
  assert.match($('pmUser').textContent, /Test Club/);
});

test('Add participant modal opens for each mode with the right CSV columns', async () => {
  const cols = {};
  for (const [key, label] of [['b1', 'Open Doubles'], ['b2', 'Kitcheneros League'], ['b3', 'Fixed Pairs'], ['b4', 'Mixed']]) {
    window.openAddModal(key);
    cols[label] = document.getElementById('csvCols').textContent.replace(/\s+/g, ' ');
  }
  assert.match(cols['Kitcheneros League'], /Columns: Name, Pool/);
  assert.match(cols['Fixed Pairs'], /Pair Number/); assert.doesNotMatch(cols['Fixed Pairs'], /Gender/);
  assert.match(cols['Mixed'], /Gender/); assert.match(cols['Open Doubles'], /Name, DUPR ID, Current DUPR, Pool/);
  assert.deepEqual(errors, []);
});

after(() => { fs.rmSync(tmp, { recursive: true, force: true }); dom.window.close(); setTimeout(() => process.exit(0), 50).unref(); });
