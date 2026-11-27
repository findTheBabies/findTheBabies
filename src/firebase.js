import {initializeApp} from 'firebase/app';
import {getAuth, connectAuthEmulator} from 'firebase/auth';
import {getFirestore, connectFirestoreEmulator} from 'firebase/firestore';
import {brands} from './brands';

export const brand = brands[__SITE__];
export const app = initializeApp(__FIREBASE__);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (import.meta.env.MODE === 'test') {
  if (location.hostname !== '127.0.0.1' || __FIREBASE__.projectId !== 'demo-four-sites') throw Error('Emulators require a local demo project');
  connectAuthEmulator(auth, `http://127.0.0.1:${import.meta.env.VITE_AUTH_PORT || 9099}`, {disableWarnings: true});
  connectFirestoreEmulator(db, '127.0.0.1', Number(import.meta.env.VITE_FIRESTORE_PORT || 8080));
}
