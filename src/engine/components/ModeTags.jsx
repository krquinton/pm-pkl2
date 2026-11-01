import { limitedCourts, modeLabel } from '../logic/labels.js';

export default function ModeTags({ bucket, courts }){
  if (!bucket || !bucket.mode) return null;
  const l = limitedCourts(bucket, courts);
  return (
    <>
      <span className="mode-tag">{modeLabel(bucket.mode)}</span>
      {l.length ? <span className="mode-tag">Court{l.length === 1 ? '' : 's'} {l.join(', ')}</span> : null}
    </>
  );
}
