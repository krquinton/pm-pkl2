import { BUCKET_COLOR, bucketLabel } from './labels.js';

/* Same key the legacy engine uses to recognise a player across matches. */
export function refKeyFor(p){
  if (p.refKey) return p.refKey;
  return p.sourceType === 'member' ? ('m_' + p.memberId) : ('g_' + (p.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
}
const poolsOf = (buckets, key) => { const b = buckets.find(x => x.key === key); return b && b.pools ? b.pools : []; };
export const bucketHasPools = (buckets, key) => poolsOf(buckets, key).length > 0;

/* Returns { [bucketKey]: rows } or, with byPool, { ['bucketKey|poolId']: rows } for categories that have pools.
   Ranked by wins, then total points, then point differential. */
export function buildLeaderboard(logs, buckets, sessionId, byPool){
  const res = {};
  buckets.forEach(b => res[b.key] = {});
  logs.filter(l => l.sessionId === sessionId).forEach(l => {
    const lbKey = byPool && bucketHasPools(buckets, l.bucket) ? l.bucket + '|' + (l.pool || '') : l.bucket;
    const map = res[lbKey] || (res[lbKey] = {});
    const s1 = Number(l.score1) || 0, s2 = Number(l.score2) || 0;
    const fx = (buckets.find(b => b.key === l.bucket) || {}).mode === 'fixed';
    const add = (team, pf, pa, won) => (fx ? [team] : team.map(p => [p])).forEach(grp => {
      const k = grp.map(refKeyFor).sort().join('+'), nm = grp.map(p => p.name).join(' & ');
      const e = map[k] || (map[k] = { name: nm, gp: 0, w: 0, l: 0, pf: 0, pa: 0 });
      e.name = nm; e.gp++; if (won) e.w++; else e.l++; e.pf += pf; e.pa += pa;
    });
    add(l.team1, s1, s2, l.winner === 'team1');
    add(l.team2, s2, s1, l.winner === 'team2');
  });
  const out = {};
  Object.keys(res).forEach(bk => {
    const arr = Object.values(res[bk]).map(e => ({ ...e, pd: e.pf - e.pa }));
    arr.sort((a, b) => b.w - a.w || b.pf - a.pf || b.pd - a.pd || a.name.localeCompare(b.name));
    arr.forEach((e, i) => { e.rank = (i > 0 && arr[i - 1].w === e.w && arr[i - 1].pf === e.pf && arr[i - 1].pd === e.pd) ? arr[i - 1].rank : i + 1; });
    out[bk] = arr;
  });
  return out;
}

/* Current categories, plus any deleted category that still has matches in that session. */
export function lbBuckets(logs, buckets, sessionId){
  const list = buckets.slice(), seen = new Set(list.map(b => b.key));
  logs.filter(l => l.sessionId === sessionId).forEach(l => {
    if (!seen.has(l.bucket)) { seen.add(l.bucket); list.push({ key: l.bucket, label: bucketLabel(buckets, l.bucket, l.bucketName), mode: null, color: BUCKET_COLOR }); }
  });
  return list;
}
