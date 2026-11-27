// End-to-end check of notifyAlertArea against the local emulators only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore, Timestamp, FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('Run inside the emulators only.');
initializeApp({projectId: 'demo-four-sites'});
const db = getFirestore(), auth = getAuth();
const wait = async (fn, ms = 20000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error('timed out'); await new Promise((r) => setTimeout(r, 300)); } };

test('notifies members in range by email, skips those out of range, and sends only once', async () => {
  const users = {near: '62702', far: '90210', noEmail: '62703'};
  for (const [uid, zip] of Object.entries(users)) {
    await auth.createUser({uid, email: `${uid}@example.com`, emailVerified: true}).catch(() => {});
    await db.doc(`subscriptions/${uid}`).set({zip, radiusMiles: 25, push: false, email: uid !== 'noEmail', tokens: [], updatedAt: FieldValue.serverTimestamp()});
  }
  const ref = db.collection('alerts').doc('e2e-alert');
  await ref.set({childName: 'Test Child', age: 9, description: 'Demo only', lastSeenCity: 'Springfield', lastSeenState: 'IL', lastSeenZip: '62701',
    lastSeenAt: Timestamp.now(), photoUrl: '', sourceName: 'Demo PD', sourceUrl: 'https://example.org/case', caseNumber: 'DEMO-1', contactPhone: '911',
    alertType: 'missing', status: 'active', radiusMiles: 50, createdBy: 'boss', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 86400000)});
  const stats = await wait(async () => (await db.doc('alertStats/e2e-alert').get()).data()?.finishedAt && (await db.doc('alertStats/e2e-alert').get()).data());
  assert.equal(stats.recipients, 2);
  assert.equal(stats.emailsQueued, 1);
  const mail = await db.collection('mail').get();
  assert.deepEqual(mail.docs.map((d) => d.data().to), ['near@example.com']);
  assert.match(mail.docs[0].data().message.text, /alerts\/e2e-alert/);

  await ref.update({description: 'Edited', updatedAt: Timestamp.now()});
  await new Promise((r) => setTimeout(r, 3000));
  assert.equal((await db.collection('mail').get()).size, 1, 'editing an active alert must not resend');
});
