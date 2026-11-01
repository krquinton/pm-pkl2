import { useMemo, useState } from 'react';
import { useEngine } from '../bridge.js';
import { buildLeaderboard, lbBuckets } from '../logic/leaderboard.js';
import { courtsCount, entryNoun } from '../logic/labels.js';
import ModeTags from './ModeTags.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];

function Card({ b, suffix, rows, courts }){
  const noun = entryNoun(b.mode);
  return (
    <div className="bucket-card">
      <div className="bucket-head">
        <h3><span className="bucket-tag" style={{ background: b.color }} />{b.label}<ModeTags bucket={b} courts={courts} />{suffix ? <span className="pool-tag">{suffix}</span> : null}</h3>
        <span className="count">{rows.length} {noun}{rows.length === 1 ? '' : 's'}</span>
      </div>
      <table className="lb-table">
        <thead><tr><th className="num">#</th><th>{noun === 'pair' ? 'Pair' : (noun === 'team' ? 'Team' : 'Player')}</th><th className="num">GP</th><th className="num">W</th><th className="num">L</th><th className="num">Pts</th><th className="num">+/−</th></tr></thead>
        <tbody>
          {rows.length ? rows.map(e => (
            <tr key={e.name + '|' + e.rank + '|' + e.gp + '|' + e.pf}>
              <td className="rank">{e.rank}</td>
              <td className="lb-name">{e.rank <= 3 ? MEDALS[e.rank - 1] + ' ' : ''}{e.name}</td>
              <td className="num">{e.gp}</td><td className="num">{e.w}</td><td className="num">{e.l}</td><td className="num">{e.pf}</td>
              <td className={'num ' + (e.pd > 0 ? 'lb-pos' : (e.pd < 0 ? 'lb-neg' : ''))}>{e.pd > 0 ? '+' : ''}{e.pd}</td>
            </tr>
          )) : <tr className="empty-row"><td colSpan="7">No completed matches yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function LeaderboardTab(){
  const buckets = useEngine(s => s.buckets);
  const logs = useEngine(s => s.logs);
  const sessions = useEngine(s => s.sessions);
  const session = useEngine(s => s.session);
  const [picked, setPicked] = useState('');       // '' = current session
  const [view, setView] = useState('pool');       // 'pool' | 'cat'
  const sid = picked || session.currentSessionId;
  const courts = courtsCount(session);
  const anyPools = buckets.some(b => (b.pools || []).length > 0);
  const byPool = anyPools && view === 'pool';
  const data = useMemo(() => buildLeaderboard(logs, buckets, sid, byPool), [logs, buckets, sid, byPool]);
  const list = useMemo(() => lbBuckets(logs, buckets, sid), [logs, buckets, sid]);

  const cards = [];
  list.forEach(b => {
    const pools = b.pools || [];
    const groups = byPool && pools.length
      ? [...pools.map(q => ({ suffix: q.name, rows: data[b.key + '|' + q.id] || [] })), ...((data[b.key + '|'] || []).length ? [{ suffix: 'No pool', rows: data[b.key + '|'] }] : [])]
      : [{ suffix: '', rows: data[b.key] || [] }];
    groups.forEach(g => cards.push(<Card key={b.key + '|' + g.suffix} b={b} suffix={g.suffix} rows={g.rows} courts={courts} />));
  });

  return (
    <>
      <div className="bucket-card" style={{ marginBottom: 18 }}>
        <div className="logs-toolbar">
          <div className="field" style={{ margin: 0, minWidth: 240 }}><label>Session</label>
            <select id="lbSessionFilter" value={picked} onChange={e => setPicked(e.target.value)}>
              <option value="">Current session</option>
              {sessions.map(x => <option key={x.id} value={x.id}>{x.name} · {x.date}</option>)}
            </select></div>
          {anyPools ? <div className="seg" id="lbViewToggle">
            <button className={view === 'pool' ? 'on' : ''} onClick={() => setView('pool')}>By pool</button>
            <button className={view === 'cat' ? 'on' : ''} onClick={() => setView('cat')}>Whole category</button>
          </div> : null}
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Ranked by Wins → Total Points → Point Differential</div>
        </div>
      </div>
      <div className="bucket-grid" id="lbGrid">
        {list.length ? cards : <div className="bucket-card" style={{ gridColumn: '1/-1' }}><div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--muted)' }}>No categories yet.</div></div>}
      </div>
    </>
  );
}
