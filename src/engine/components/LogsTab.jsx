import { useMemo, useState } from 'react';
import { useEngine } from '../bridge.js';
import { bucketLabel } from '../logic/labels.js';
import { durationText, exportTarget, filterLogs, teamNames } from '../logic/logs.js';

/* Export / settings / edit / delete still run on the legacy engine for now (PDF + CSV builders, modals).
   These helpers call into it; they move over in a later step. */
const clickLegacy = id => { const el = document.getElementById(id); if (el) el.click(); };

export default function LogsTab(){
  const buckets = useEngine(s => s.buckets);
  const logs = useEngine(s => s.logs);
  const sessions = useEngine(s => s.sessions);
  const session = useEngine(s => s.session);
  const [bucketSel, setBucketSel] = useState('');
  const [query, setQuery] = useState('');
  const bucket = buckets.some(b => b.key === bucketSel) ? bucketSel : '';
  const { all, shown } = useMemo(() => filterLogs(logs, session.currentSessionId, bucket, query), [logs, session.currentSessionId, bucket, query]);
  const target = exportTarget(sessions, session);

  return (
    <div className="bucket-card">
      <div className="bucket-head">
        <h3>Match Logs<span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: 15 }}>{session.currentSessionName ? ` · ${session.currentSessionName}` : ''}</span></h3>
        <span className="count">{shown.length} match{shown.length === 1 ? '' : 'es'}{shown.length !== all.length ? ` (of ${all.length})` : ''}</span>
      </div>
      <div className="logs-toolbar">
        <div className="field" style={{ margin: 0, minWidth: 180 }}><label>Category</label>
          <select id="logBucketFilter" value={bucket} onChange={e => setBucketSel(e.target.value)}>
            <option value="">All categories</option>
            {buckets.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select></div>
        <div className="field" style={{ margin: 0, minWidth: 220 }}><label>Search player</label>
          <input type="text" id="logSearch" placeholder="Type a name…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => clickLegacy('btnDuprSettings')}>⚙ DUPR settings</button>
            <button className="btn btn-primary btn-sm" onClick={() => clickLegacy('btnExportDupr')}>⬇ Export DUPR CSV</button>
            <button className="btn btn-ghost btn-sm" onClick={() => clickLegacy('btnExportScoresheet')}>📄 Export Scoresheet (PDF)</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Applies to: {target.name} ({target.date})</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Match</th><th>Category</th><th>Team 1</th><th>Team 2</th><th>Score</th><th>Winner</th><th>Court</th><th>Duration</th><th>Actions</th></tr></thead>
        <tbody>
          {shown.length ? shown.map(l => {
            const t1 = teamNames(l.team1), t2 = teamNames(l.team2);
            return (
              <tr key={l.id}>
                <td>{l.matchId}</td>
                <td>{bucketLabel(buckets, l.bucket, l.bucketName)}{l.poolName ? <> <span className="pool-tag">{l.poolName}</span></> : null}</td>
                <td>{t1}</td><td>{t2}</td>
                <td>{l.score1} – {l.score2}</td>
                <td>{l.winner === 'team1' ? t1 : t2}</td>
                <td>Court {l.court}</td>
                <td>{durationText(l.durationSeconds)}</td>
                <td><div className="row-actions">
                  <button className="btn-icon" title="Edit result" onClick={() => window.openLogEditModal(l.id)}>✎</button>
                  <button className="btn-icon danger" title="Delete" onClick={() => window.deleteLog(l.id)}>🗑</button>
                </div></td>
              </tr>);
          }) : <tr className="empty-row"><td colSpan="9">{all.length ? 'No matches found.' : 'No matches logged yet.'}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
