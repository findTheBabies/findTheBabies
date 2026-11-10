// Sends area notifications when an official alert is first published.
// Push goes through FCM; email is queued in `mail/` for the Firebase
// "Trigger Email from Firestore" extension (configure it with Zoho SMTP).
const {onDocumentWritten} = require('firebase-functions/v2/firestore');
const {setGlobalOptions, logger} = require('firebase-functions/v2');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');
const {getAuth} = require('firebase-admin/auth');
const zipcodes = require('zipcodes');

initializeApp();
setGlobalOptions({region: 'us-west2', maxInstances: 5});
const db = getFirestore();
const SITE = process.env.SITE_URL || 'https://findthebabies.org';

function miles(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

exports.notifyAlertArea = onDocumentWritten('alerts/{alertId}', async (event) => {
  const before = event.data?.before?.data();
  const alert = event.data?.after?.data();
  if (!alert || alert.status !== 'active' || (before && before.status === 'active')) return;
  const id = event.params.alertId;
  const statsRef = db.doc(`alertStats/${id}`);
  try { await statsRef.create({startedAt: FieldValue.serverTimestamp(), recipients: 0}); }
  catch (e) { if (e.code === 6) return; throw e; } // already sent (retry or re-run)

  const origin = zipcodes.lookup(alert.lastSeenZip);
  if (!origin) { await statsRef.update({error: 'unknown-zip'}); return; }

  const link = `${SITE}/alerts/${id}`;
  const subs = await db.collection('subscriptions').get();
  const push = []; const emails = []; let recipients = 0;
  for (const s of subs.docs) {
    const sub = s.data();
    const home = zipcodes.lookup(sub.zip);
    if (!home) continue;
    const d = miles(origin, home);
    if (d > Math.min(sub.radiusMiles, alert.radiusMiles)) continue;
    recipients++;
    if (sub.push) for (const t of sub.tokens || []) if (typeof t === 'string') push.push({uid: s.id, token: t, d});
    if (sub.email) emails.push({uid: s.id, d});
  }

  const title = `Missing child near you: ${alert.childName}, ${alert.age}`;
  const body = (d) => `Last seen in ${alert.lastSeenCity}, ${alert.lastSeenState} (about ${Math.round(d)} mi away). If you see this child, call 911.`;
  let pushSent = 0, pushFailed = 0;
  for (let i = 0; i < push.length; i += 500) {
    const chunk = push.slice(i, i + 500);
    try {
      const res = await getMessaging().sendEach(chunk.map((p) => ({
        token: p.token,
        webpush: {notification: {title, body: body(p.d), requireInteraction: true}, fcmOptions: {link}},
      })));
      res.responses.forEach((r, j) => {
        if (r.success) return pushSent++;
        pushFailed++;
        const code = r.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
          db.doc(`subscriptions/${chunk[j].uid}`).update({tokens: FieldValue.arrayRemove(chunk[j].token)}).catch(() => {});
        }
      });
    } catch (e) { pushFailed += chunk.length; logger.error('push chunk failed', e.message); }
  }

  let emailsQueued = 0;
  for (const e of emails) {
    try {
      const user = await getAuth().getUser(e.uid);
      if (!user.email || !user.emailVerified) continue;
      await db.collection('mail').add({
        to: user.email,
        message: {
          subject: title,
          text: `${body(e.d)}\n\nCase ${alert.caseNumber} (${alert.sourceName}). Tip line: ${alert.contactPhone}\nFull alert: ${link}\nOfficial source: ${alert.sourceUrl}\n\nChange or stop alerts: ${SITE}/dashboard`,
          html: `<p><strong>${esc(title)}</strong></p><p>${esc(body(e.d))}</p><p>Case ${esc(alert.caseNumber)} (${esc(alert.sourceName)}). Tip line: ${esc(alert.contactPhone)}</p><p><a href="${esc(link)}">See the full alert and share it</a> · <a href="${esc(alert.sourceUrl)}">Official source</a></p><p style="color:#666;font-size:12px">Do not approach anyone. <a href="${SITE}/dashboard">Change or stop alerts</a>.</p>`,
        },
      });
      emailsQueued++;
    } catch (err) { logger.warn('email skipped', err.message); }
  }
  await statsRef.update({recipients, pushSent, pushFailed, emailsQueued, finishedAt: FieldValue.serverTimestamp()});
  logger.info('alert notifications', {id, recipients, pushSent, pushFailed, emailsQueued});
});
