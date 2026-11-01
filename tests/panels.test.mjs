/* Renders the React tabs in a simulated browser, feeds them data through the bridge and clicks around. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!DOCTYPE html><body><div id="lb"></div><div id="lg"></div><button id="btnExportDupr"></button></body>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const tmp = path.join(root, '.tmp-test'); fs.mkdirSync(tmp, { recursive: true });
const entry = path.join(tmp, 'entry.jsx');
fs.writeFileSync(entry, `export { default as LeaderboardTab } from '../src/engine/components/LeaderboardTab.jsx';
export { default as LogsTab } from '../src/engine/components/LogsTab.jsx';
export { bridge } from '../src/engine/bridge.js';`);
const out = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile: out, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react-dom', 'react-dom/client'], logLevel: 'error' });
const { LeaderboardTab, LogsTab, bridge } = await import(out);
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const P = (id, name) => ({ participantId: id, name, sourceType: 'guest' });
const buckets = [
  { key: 'b1', label: 'Open Doubles', mode: 'doubles', color: 'var(--blue)', courts: [1, 2], pools: [{ id: 'p1', name: 'Pool A' }] },
  { key: 'b2', label: 'Kitcheneros League', mode: 'team', color: 'var(--blue)', courts: [], pools: [] }
];
const logs = [
  { id: 'L1', matchId: 'M-001', bucket: 'b1', pool: 'p1', poolName: 'Pool A', sessionId: 's1', team1: [P('a', 'Ana'), P('b', 'Ben')], team2: [P('c', 'Cy'), P('d', 'Di')], score1: 11, score2: 7, winner: 'team1', court: 1, durationSeconds: 605 },
  { id: 'L2', matchId: 'M-002', bucket: 'b2', sessionId: 's1', team1: [P('t1', 'Team Rocket')], team2: [P('t2', 'Team Net')], score1: 4, score2: 11, winner: 'team2', court: 2, durationSeconds: 59 },
  { id: 'L3', matchId: 'M-003', bucket: 'b2', sessionId: 'old', team1: [P('t1', 'Team Rocket')], team2: [P('t2', 'Team Net')], score1: 11, score2: 3, winner: 'team1', court: 1, durationSeconds: 10 }
];
bridge.set('buckets', buckets); bridge.set('logs', logs);
bridge.set('sessions', [{ id: 's1', name: 'Saturday', date: '2026-11-01' }, { id: 'old', name: 'Last week', date: '2026-10-25' }]);
bridge.set('session', { currentSessionId: 's1', currentSessionName: 'Saturday', currentSessionDate: '2026-11-01', courtCount: 4 });

const mount = async (id, Comp) => { const r = createRoot(document.getElementById(id)); await act(async () => { r.render(React.createElement(Comp)); }); return document.getElementById(id); };
const change = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  await act(async () => { el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
};

test('Leaderboard: cards, ranks, team wording, pool tag, court tag', async () => {
  const el = await mount('lb', LeaderboardTab);
  const text = el.textContent;
  assert.match(text, /Open Doubles/); assert.match(text, /Kitcheneros League/);
  assert.match(text, /Pool A/); assert.match(text, /Courts 1, 2/);
  assert.match(text, /Ana/); assert.match(text, /Ben/);
  assert.match(text, /Team Net/);
  const headers = [...el.querySelectorAll('th')].map(t => t.textContent);
  assert.ok(headers.includes('Team') && headers.includes('Player'));
  const net = [...el.querySelectorAll('tr')].find(r => r.textContent.includes('Team Net'));
  assert.ok(net.textContent.startsWith('1🥇'), 'winner of the team category ranks first with a medal');
});

test('Leaderboard: switching to an older session and the whole-category view', async () => {
  const el = document.getElementById('lb');
  await change(el.querySelector('#lbSessionFilter'), 'old');
  const rocket = [...el.querySelectorAll('tr')].find(r => r.textContent.includes('Team Rocket'));
  assert.ok(rocket && rocket.textContent.startsWith('1🥇'));
  assert.ok(![...el.querySelectorAll('tr')].some(r => r.textContent.includes('Ana')), 'current-session players are not in the old session');
  await change(el.querySelector('#lbSessionFilter'), '');
  const btn = [...el.querySelectorAll('#lbViewToggle button')].find(b => b.textContent === 'Whole category');
  await act(async () => { btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  assert.doesNotMatch(el.querySelector('.bucket-grid').textContent, /No pool/);
});

test('Leaderboard updates live when new data arrives on the bridge', async () => {
  const el = document.getElementById('lb');
  await act(async () => { bridge.set('logs', [...logs, { id: 'L9', matchId: 'M-009', bucket: 'b2', sessionId: 's1', team1: [P('t3', 'Team Zed')], team2: [P('t2', 'Team Net')], score1: 11, score2: 0, winner: 'team1', court: 1, durationSeconds: 5 }]); });
  assert.match(el.textContent, /Team Zed/);
});

test('Logs: rows, filters, empty state, legacy hooks', async () => {
  await act(async () => { bridge.set('logs', logs); });
  const el = await mount('lg', LogsTab);
  assert.equal(el.querySelectorAll('tbody tr').length, 2, 'only the current session is listed');
  assert.match(el.textContent, /10m 5s/); assert.match(el.textContent, /0m 59s/);
  assert.match(el.querySelector('.count').textContent, /2 matches/);
  await change(el.querySelector('#logSearch'), 'rocket');
  assert.equal(el.querySelectorAll('tbody tr').length, 1);
  assert.match(el.querySelector('.count').textContent, /1 match \(of 2\)/);
  await change(el.querySelector('#logSearch'), 'nobody');
  assert.match(el.textContent, /No matches found\./);
  await change(el.querySelector('#logSearch'), '');
  await change(el.querySelector('#logBucketFilter'), 'b1');
  assert.equal(el.querySelectorAll('tbody tr').length, 1);
  assert.match(el.textContent, /Applies to: Saturday \(2026-11-01\)/);

  const calls = [];
  window.openLogEditModal = id => calls.push(['edit', id]); window.deleteLog = id => calls.push(['del', id]);
  let exported = 0; document.getElementById('btnExportDupr').addEventListener('click', () => exported++);
  await act(async () => { el.querySelector('button[title="Edit result"]').click(); el.querySelector('button[title="Delete"]').click(); });
  assert.deepEqual(calls, [['edit', 'L1'], ['del', 'L1']]);
  await act(async () => { [...el.querySelectorAll('button')].find(b => b.textContent.includes('Export DUPR CSV')).click(); });
  assert.equal(exported, 1);
});

after(() => { fs.rmSync(tmp, { recursive: true, force: true }); dom.window.close(); setTimeout(() => process.exit(0), 50).unref(); });
