import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

/* The Firebase web config is public by design. What protects the data is firestore.rules and the Authorized domains list. */
export const firebaseConfig = {
  apiKey: 'AIzaSyDhWLbY2QERNuOn7R-g8VljB4VTKW9RgEs',
  authDomain: 'pklbox-e01b3.firebaseapp.com',
  projectId: 'pklbox-e01b3',
  storageBucket: 'pklbox-e01b3.firebasestorage.app',
  messagingSenderId: '197030960226',
  appId: '1:197030960226:web:529888c44967b2c30d853b'
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const fs = firebase.firestore();
try { fs.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) { console.warn('Firestore settings:', e); }

let offlineOn = false;
/* Offline cache for the admin app only (queue keeps working through a connection drop). */
export function enableOffline(){
  if (offlineOn) return; offlineOn = true;
  fs.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn('Offline persistence is off:', err.code || err.message));
}

export default firebase;
