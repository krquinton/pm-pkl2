import { memo, useEffect, useRef } from 'react';
import AuthGate from '../AuthGate.jsx';
import markup from '../legacy/engine/markup.html?raw';
import '../legacy/engine/engine.css';

/* The queue / DUPR engine. Markup is mounted once and the engine module drives it.
   The (large) engine code, PDF and image libraries load only after the license check passes. */
const Host = memo(function Host({ ctx }){
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    document.title = 'PickleManage';
    (async () => {
      const [pdf, h2c, fb, eng] = await Promise.all([import('jspdf'), import('html2canvas'), import('../firebase.js'), import('../legacy/engine/engine.js')]);
      window.jspdf = { jsPDF: pdf.jsPDF || (pdf.default && pdf.default.jsPDF) };
      window.html2canvas = h2c.default || h2c;
      fb.enableOffline();
      eng.startEngine(ctx);
    })();
  }, []);
  return <div className="legacy-host" dangerouslySetInnerHTML={{ __html: markup }} />;
}, () => true);

export default function Engine(){
  return <AuthGate need="club">{ctx => <Host ctx={ctx} />}</AuthGate>;
}
