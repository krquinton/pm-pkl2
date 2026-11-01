export const BUCKET_COLOR = 'var(--blue)';
const LEGACY_BUCKET_LABELS = { singles:'Singles', fun:'Fun Mode (Low)', competitive:'Competitive Mode (High)' };

export function modeLabel(m){
  return m === 'singles' ? 'Singles' : (m === 'fixed' ? 'Doubles · Fixed Partner' : (m === 'mixed' ? 'Mixed Doubles' : (m === 'team' ? 'Doubles · Team Name' : 'Doubles')));
}
export function bucketLabel(buckets, key, fallback){
  const b = buckets.find(x => x.key === key);
  return b ? b.label : (fallback || LEGACY_BUCKET_LABELS[key] || 'Removed category');
}
/* number of courts in the current session (1-5, default 4), same rule as the legacy engine */
export function courtsCount(session){
  const cc = Number(session && session.courtCount);
  return (cc >= 1 && cc <= 5) ? Math.floor(cc) : 4;
}
/* the courts a category is limited to, or [] when it may use every court */
export function limitedCourts(bucket, courts){
  if (!bucket || !bucket.courts) return [];
  const l = bucket.courts.filter(c => c <= courts);
  return l.length > 0 && l.length < courts ? l : [];
}
export function entryNoun(mode){ return mode === 'fixed' ? 'pair' : (mode === 'team' ? 'team' : 'player'); }
