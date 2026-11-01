import { createRoot } from 'react-dom/client';
import App from './App.jsx';

/* No StrictMode: the legacy engine must start exactly once. */
createRoot(document.getElementById('root')).render(<App />);
