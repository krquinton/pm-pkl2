/* Differential test: the new leaderboard logic must give EXACTLY the same result as the legacy engine function,
   on lots of random data (pools, fixed pairs, team names, ties, deleted categories, several sessions). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildLeaderboard, lbBuckets, refKeyFor } from '../src/engine/logic/leaderboard.js';

const src = fs.readFileSync(new URL('../src/legacy/engine/engine.js', import.meta.url), 'utf8');
const a = src.indexOf('function buildLeaderboard('), b = src.indexOf('function renderLeaderboard(){}');
assert.ok(a > 0 && b > a, 'legacy functions not found');
const legacyBody = src.slice(a, b);

function legacyFor(BUCKETS, logs){
  const LEGACY = { singles:'Singles', fun:'Fun Mode (Low)', competitive:'Competitive Mode (High)' };
  const bucketLabel = (key, fb) => { const x = BUCKETS.find(y => y.key === key); return x ? x.label : (fb || LEGACY[key] || 'Removed category'); };
  const bucketPools = key => { const x = BUCKETS.find(y => y.key === key); return x && x.pools ? x.pools : []; };
  const bucketHasPools = key => bucketPools(key).length > 0;
  const f = new Function('BUCKETS', 'logs', 'bucketHasPools', 'bucketPools', 'refKeyFor', 'bucketLabel', 'BUCKET_COLOR',
    legacyBody + '; return { buildLeaderboard, lbBuckets };');
  return f(BUCKETS, logs, bucketHasPools, bucketPools, refKeyFor, bucketLabel, 'var(--blue)');
}

let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = arr => arr[Math.floor(rnd() * arr.length)];

function makeData(){
  const modes = ['singles', 'doubles', 'fixed', 'mixed', 'team'];
  const buckets = modes.slice(0, 2 + Math.floor(rnd() * 4)).map((mode, i) => ({
    key: 'b' + i, label: 'Cat ' + i, mode, color: 'var(--blue)', courts: [],
    pools: rnd() < 0.5 ? [{ id: 'p1', name: 'Pool A' }, { id: 'p2', name: 'Pool B' }] : []
  }));
  const players = Array.from({ length: 10 }, (_, i) => ({ participantId: 'x' + i, name: 'Player ' + String.fromCharCode(65 + i), sourceType: rnd() < 0.5 ? 'member' : 'guest', memberId: 'm' + i }));
  const logs = [];
  const n = 5 + Math.floor(rnd() * 60);
  for (let i = 0; i < n; i++) {
    const b = rnd() < 0.1 ? { key: 'gone', mode: 'doubles' } : pick(buckets);
    const per = (b.mode === 'singles' || b.mode === 'team') ? 1 : 2;
    const ps = [...players].sort(() => rnd() - 0.5);
    const s1 = Math.floor(rnd() * 12), s2 = Math.floor(rnd() * 12);
    logs.push({ id: 'l' + i, bucket: b.key, bucketName: b.key === 'gone' ? 'Old Cat' : undefined, pool: rnd() < 0.6 ? pick(['p1', 'p2']) : undefined,
      sessionId: rnd() < 0.8 ? 's1' : 's2', team1: ps.slice(0, per), team2: ps.slice(per, per * 2),
      score1: s1, score2: s2, winner: s1 >= s2 ? 'team1' : 'team2' });
  }
  return { buckets, logs };
}

test('buildLeaderboard and lbBuckets match the legacy engine on random data', () => {
  for (let round = 0; round < 300; round++) {
    const { buckets, logs } = makeData();
    const leg = legacyFor(buckets, logs);
    for (const sid of ['s1', 's2', 'nope', undefined]) for (const byPool of [false, true]) {
      assert.deepStrictEqual(buildLeaderboard(logs, buckets, sid, byPool), leg.buildLeaderboard(sid, byPool), `leaderboard round ${round} sid ${sid} byPool ${byPool}`);
    }
    for (const sid of ['s1', 's2']) assert.deepStrictEqual(lbBuckets(logs, buckets, sid), leg.lbBuckets(sid), `lbBuckets round ${round}`);
  }
});

test('ties share a rank and the next rank is skipped', () => {
  const buckets = [{ key: 'b', label: 'B', mode: 'singles', pools: [] }];
  const P = (id, name) => ({ participantId: id, name, sourceType: 'guest' });
  const logs = [
    { id: '1', bucket: 'b', sessionId: 's', team1: [P('a', 'A')], team2: [P('b', 'B')], score1: 11, score2: 5, winner: 'team1' },
    { id: '2', bucket: 'b', sessionId: 's', team1: [P('c', 'C')], team2: [P('d', 'D')], score1: 11, score2: 5, winner: 'team1' }
  ];
  const rows = buildLeaderboard(logs, buckets, 's', false).b;
  assert.deepStrictEqual(rows.map(r => [r.name, r.rank]), [['A', 1], ['C', 1], ['B', 3], ['D', 3]]);
});
