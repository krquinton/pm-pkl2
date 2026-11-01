import { createRoot } from 'react-dom/client';
import LeaderboardTab from './components/LeaderboardTab.jsx';
import LogsTab from './components/LogsTab.jsx';

/* React-owned tabs. Each mounts into an empty container that the engine markup provides.
   Tabs not listed here are still rendered by the legacy engine. */
let mounted = false;
export function mountPanels(){
  if (mounted) return; mounted = true;
  const targets = [['lbRoot', LeaderboardTab], ['logsRoot', LogsTab]];
  targets.forEach(([id, Comp]) => {
    const el = document.getElementById(id);
    if (el) createRoot(el).render(<Comp />);
  });
}
