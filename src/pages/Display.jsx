import { memo, useEffect, useRef } from 'react';
import markup from '../legacy/display/markup.html?raw';
import '../legacy/display/display.css';

/* TV display: public and read-only (Firestore rules allow reads of the queue collections). */
const Host = memo(function Host(){
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    document.title = 'PickleManage — Display';
    import('../legacy/display/display.js').then(m => m.startDisplay());
  }, []);
  return <div className="legacy-host" dangerouslySetInnerHTML={{ __html: markup }} />;
}, () => true);

export default function Display(){ return <Host />; }
