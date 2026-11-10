import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';

// This test suite refuses to connect to a live database.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Start the Firestore emulator and set FIRESTORE_EMULATOR_HOST before running rules tests.');
}

let environment;
const valid = (patch = {}) => ({
  displayName: 'Jonathan', focus: 'Learn about this project',
  bookmarks: ['mission', 'resources'], updatedAt: serverTimestamp(), ...patch,
});
const dbFor = (uid, claims = {}) => environment.authenticatedContext(uid, {
  email: `${uid}@example.com`, email_verified: true, ...claims,
}).firestore();
const profile = (db, uid = 'owner') => doc(db, 'profiles', uid);

before(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-four-sites',
    firestore: { host, port: Number(port), rules: await readFile(new URL('../'+(process.env.RULES_FILE || 'firestore.rules'), import.meta.url), 'utf8') },
  });
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());

test('verified owner can create, get, update, and delete their profile', async () => {
  const ref = profile(dbFor('owner'));
  await assertSucceeds(setDoc(ref, valid()));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { focus: 'Join the community', updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(ref));
});

test('signed-out users cannot read, list, create, update, or delete profiles', async () => {
  await setDoc(profile(dbFor('owner')), valid());
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(profile(db)));
  await assertFails(getDocs(collection(db, 'profiles')));
  await assertFails(setDoc(profile(db, 'new'), valid()));
  await assertFails(updateDoc(profile(db), { focus: 'Changed', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(profile(db)));
});

test('another user cannot read or mutate an owner profile', async () => {
  await setDoc(profile(dbFor('owner')), valid());
  const db = dbFor('other');
  await assertFails(getDoc(profile(db)));
  await assertFails(setDoc(profile(db), valid()));
  await assertFails(updateDoc(profile(db), { focus: 'Changed', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(profile(db)));
});

test('admins can review, list and remove profiles but never write someone else\'s content', async () => {
  await setDoc(profile(dbFor('owner')), valid());
  const admin = dbFor('boss', { admin: true });
  await assertSucceeds(getDoc(profile(admin)));
  await assertSucceeds(getDocs(collection(admin, 'profiles')));
  await assertFails(setDoc(profile(admin), valid({ focus: 'Overwritten by admin' })));
  await assertFails(updateDoc(profile(admin), { focus: 'Changed', updatedAt: serverTimestamp() }));
  await assertFails(getDocs(collection(dbFor('other', { admin: 'true' }), 'profiles')));
  await assertSucceeds(deleteDoc(profile(admin)));
});

test('owners cannot enumerate profiles or access undeclared paths and subcollections', async () => {
  const db = dbFor('owner');
  await setDoc(profile(db), valid());
  await assertFails(getDocs(collection(db, 'profiles')));
  await assertFails(setDoc(doc(db, 'profiles/owner/cases/example'), { text: 'Private case' }));
  await assertFails(getDoc(doc(db, 'profiles/owner/cases/example')));
  await assertFails(setDoc(doc(db, 'cases/example'), { owner: 'owner' }));
});

test('unverified owners can get their profile but cannot create, update, or delete it', async () => {
  await setDoc(profile(dbFor('owner')), valid());
  const db = dbFor('owner', { email_verified: false });
  await assertSucceeds(getDoc(profile(db)));
  await assertFails(updateDoc(profile(db), { focus: 'Changed', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(profile(db)));
  await assertFails(setDoc(profile(dbFor('unverified', { email_verified: false }), 'unverified'), valid()));
});

test('create rejects missing required fields, unknown fields, role injection, and invalid types', async () => {
  const ref = profile(dbFor('owner'));
  for (const key of ['displayName', 'focus', 'bookmarks', 'updatedAt']) {
    const data = valid();
    delete data[key];
    await assertFails(setDoc(ref, data));
  }
  for (const patch of [
    { role: 'admin' }, { ownerId: 'other' }, { extraData: 'unexpected' },
    { displayName: 123 }, { focus: false }, { bookmarks: 'mission' },
    { bookmarks: [123] }, { bookmarks: ['unknown'] }, { bookmarks: [{ id: 'mission' }] },
    { updatedAt: '2026-11-06' }, { updatedAt: Timestamp.fromMillis(0) },
    { updatedAt: Timestamp.fromMillis(Date.now() + 3600000) },
    { displayName: 'x'.repeat(101) }, { focus: 'x'.repeat(241) },
    { bookmarks: Array(21).fill('mission') },
  ]) await assertFails(setDoc(ref, valid(patch)));
});

test('update validates the complete resulting document and cannot bypass schema or timestamp checks', async () => {
  const ref = profile(dbFor('owner'));
  await setDoc(ref, valid());
  for (const patch of [
    { displayName: deleteField() }, { focus: deleteField() },
    { bookmarks: deleteField() }, { updatedAt: deleteField() },
    { role: 'admin' }, { ownerId: 'other' }, { extraData: 'unexpected' },
    { displayName: 123 }, { focus: false }, { bookmarks: ['unknown'] },
    { bookmarks: [123] }, { bookmarks: Array(21).fill('mission') },
    { displayName: 'x'.repeat(101) }, { focus: 'x'.repeat(241) },
    { updatedAt: Timestamp.fromMillis(0) },
  ]) await assertFails(updateDoc(ref, { updatedAt: serverTimestamp(), ...patch }));
  await assertFails(updateDoc(ref, { focus: 'Missing new server timestamp' }));
});

test('boundary-length values and empty preference lists remain usable', async () => {
  const ref = profile(dbFor('owner'));
  await assertSucceeds(setDoc(ref, valid({ displayName: 'x'.repeat(100), focus: 'x'.repeat(240), bookmarks: [] })));
  await assertSucceeds(updateDoc(ref, { displayName: '', focus: '', bookmarks: ['mission', 'updates', 'resources', 'community'], updatedAt: serverTimestamp() }));
});

// ---- Alerts (official missing-child alerts) ----
const alertData = (patch = {}) => ({
  childName: 'Test Child', age: 9, description: 'Demo description only.',
  lastSeenCity: 'Springfield', lastSeenState: 'IL', lastSeenZip: '62701',
  lastSeenAt: Timestamp.fromMillis(Date.now() - 3600000), photoUrl: 'https://example.org/poster.jpg',
  sourceName: 'Demo Police Department', sourceUrl: 'https://example.org/case/1', caseNumber: 'DEMO-1',
  contactPhone: '911', alertType: 'missing', status: 'active', radiusMiles: 50,
  createdBy: 'boss', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000), ...patch,
});
const adminDb = () => dbFor('boss', { admin: true });
const seedAlert = async (id, patch = {}) => environment.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'alerts', id), { ...alertData(patch), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
});

test('anyone can read active alerts but not resolved ones', async () => {
  await seedAlert('a1');
  await seedAlert('a2', { status: 'found', photoUrl: '', description: '' });
  const anon = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anon, 'alerts', 'a1')));
  await assertFails(getDoc(doc(anon, 'alerts', 'a2')));
  await assertSucceeds(getDocs(query(collection(anon, 'alerts'), where('status', '==', 'active'))));
  await assertFails(getDocs(collection(anon, 'alerts')));
  await assertSucceeds(getDocs(collection(adminDb(), 'alerts')));
});

test('only verified admins can post alerts, and they must cite a source and case number', async () => {
  await assertSucceeds(setDoc(doc(adminDb(), 'alerts', 'new'), alertData()));
  await assertFails(setDoc(doc(dbFor('member'), 'alerts', 'x'), alertData({ createdBy: 'member' })));
  await assertFails(setDoc(doc(environment.unauthenticatedContext().firestore(), 'alerts', 'x'), alertData()));
  await assertFails(setDoc(doc(dbFor('boss', { admin: true, email_verified: false }), 'alerts', 'x'), alertData()));
  for (const patch of [
    { sourceUrl: '' }, { sourceUrl: 'http://example.org' }, { sourceUrl: 'javascript:alert(1)' },
    { caseNumber: '' }, { childName: '' }, { photoUrl: 'http://example.org/a.jpg' },
    { lastSeenZip: '1234' }, { lastSeenState: 'il' }, { age: 25 }, { age: '9' },
    { alertType: 'rumor' }, { status: 'found' }, { radiusMiles: 1000 }, { createdBy: 'other' },
    { expiresAt: Timestamp.fromMillis(Date.now() - 1000) }, { createdAt: Timestamp.fromMillis(0) },
    { extra: 'nope' }, { description: 'x'.repeat(1001) },
  ]) await assertFails(setDoc(doc(adminDb(), 'alerts', 'bad'), alertData(patch)));
});

test('resolving an alert requires clearing the photo and description', async () => {
  await seedAlert('a1');
  const ref = doc(adminDb(), 'alerts', 'a1');
  await assertFails(updateDoc(ref, { status: 'found', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { status: 'found', photoUrl: '', description: '', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { createdBy: 'someone-else', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(dbFor('member'), 'alerts', 'a1'), { status: 'closed', updatedAt: serverTimestamp() }));
});

test('members cannot read alert stats or the mail queue', async () => {
  const db = dbFor('member');
  await assertFails(getDoc(doc(db, 'alertStats', 'a1')));
  await assertFails(getDoc(doc(db, 'mail', 'm1')));
  await assertFails(setDoc(doc(db, 'mail', 'm1'), { to: 'x@example.com' }));
  await assertFails(setDoc(doc(adminDb(), 'alertStats', 'a1'), { sent: 1 }));
  await assertSucceeds(getDoc(doc(adminDb(), 'alertStats', 'a1')));
});

// ---- Subscriptions (alert area) ----
const sub = (patch = {}) => ({ zip: '62701', radiusMiles: 25, push: false, email: true, tokens: [], updatedAt: serverTimestamp(), ...patch });

test('members manage only their own alert area', async () => {
  const ref = doc(dbFor('owner'), 'subscriptions', 'owner');
  await assertSucceeds(setDoc(ref, sub()));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, sub({ radiusMiles: 100, push: true, tokens: ['token-1'] })));
  await assertFails(getDoc(doc(dbFor('other'), 'subscriptions', 'owner')));
  await assertFails(setDoc(doc(dbFor('other'), 'subscriptions', 'owner'), sub()));
  await assertFails(getDocs(collection(dbFor('owner'), 'subscriptions')));
  await assertFails(getDocs(collection(adminDb(), 'subscriptions')));
  for (const patch of [{ zip: 'abcde' }, { zip: '123456' }, { radiusMiles: 5000 }, { push: 'yes' },
    { tokens: ['1', '2', '3', '4', '5', '6'] }, { extra: 1 }, { updatedAt: Timestamp.fromMillis(0) }])
    await assertFails(setDoc(ref, sub(patch)));
  await assertSucceeds(deleteDoc(ref));
});
