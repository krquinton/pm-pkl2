/* Match logs of one session, narrowed by category and/or a player-name search. */
export function filterLogs(logs, sessionId, bucketKey, query){
  const sid = sessionId || null;
  const all = logs.filter(l => (l.sessionId || null) === sid);
  const q = (query || '').trim().toLowerCase();
  const shown = all.filter(l => {
    if (bucketKey && l.bucket !== bucketKey) return false;
    if (q && ![...(l.team1 || []), ...(l.team2 || [])].some(p => (p.name || '').toLowerCase().includes(q))) return false;
    return true;
  });
  return { all, shown };
}
export const teamNames = team => (team || []).map(p => p.name).join(' & ');
export function durationText(sec){ const s = sec || 0; return `${Math.floor(s / 60)}m ${s % 60}s`; }

/* Which session the export buttons apply to (same rule as the legacy engine: the current session). */
export function exportTarget(sessions, session){
  const today = new Date().toISOString().slice(0, 10);
  const found = sessions.find(x => x.id === session.currentSessionId);
  if (found) return found;
  if (session.currentSessionId) return { id: session.currentSessionId, name: session.currentSessionName || 'Session', date: session.currentSessionDate || today };
  if (sessions.length) return sessions[0];
  return { id: null, name: 'Session', date: today };
}
