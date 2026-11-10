// Seeds demo alerts into the LOCAL emulator for previewing the site. Demo data only.
import {initializeApp} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Emulator only.');
initializeApp({projectId: 'demo-four-sites'});
const db = getFirestore();
const base = {description: 'Demo alert for local preview. 4 ft 2 in, brown hair, last seen wearing a red hoodie and jeans.', photoUrl: '',
  sourceName: 'Demo Police Department', sourceUrl: 'https://example.org/case', contactPhone: '1-800-843-5678', status: 'active', radiusMiles: 50,
  createdBy: 'demo', updatedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000)};
const rows = [['Demo Child A', 8, 'Springfield', 'IL', '62701', 'missing'], ['Demo Child B', 14, 'Peoria', 'IL', '61602', 'endangered'], ['Demo Child C', 5, 'Austin', 'TX', '78701', 'amber']];
for (const [i, [childName, age, lastSeenCity, lastSeenState, lastSeenZip, alertType]] of rows.entries())
  await db.doc(`alerts/demo-${i + 1}`).set({...base, childName, age, lastSeenCity, lastSeenState, lastSeenZip, alertType, caseNumber: 'DEMO-' + (i + 1),
    lastSeenAt: Timestamp.fromMillis(Date.now() - (i + 1) * 7200000), createdAt: Timestamp.fromMillis(Date.now() - i * 60000)});
console.log('seeded', rows.length);
