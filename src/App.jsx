import { Suspense, lazy } from 'react';

/* Each page is its own lazy chunk and its own document (hard navigation), so page styles never mix. */
const Login = lazy(() => import('./pages/Login.jsx'));
const Engine = lazy(() => import('./pages/Engine.jsx'));
const Superadmin = lazy(() => import('./pages/Superadmin.jsx'));
const Display = lazy(() => import('./pages/Display.jsx'));

export default function App(){
  const path = (window.location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
  let Page = Login;
  if (path === '/app' || path === '/index.html') Page = Engine;
  else if (path === '/superadmin' || path === '/superadmin.html') Page = Superadmin;
  else if (path === '/display' || path === '/display.html') Page = Display;
  return <Suspense fallback={null}><Page /></Suspense>;
}
