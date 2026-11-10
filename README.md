# findTheBabies
I want to find the babies mentioned in the Epstein files that was taken away from the autist woman. https://youtu.be/nELNUPooLdk?si=J_NnpIynbImliC9E&t=249

## Website: findthebabies.org

A developing initiative to make trusted missing-child resources easier to find and help communities share information responsibly.

React + Vite single-page site on classic Firebase Hosting (project `studio-578944933-7a8c8`), with Google sign-in, a private `/dashboard`, and Firestore profiles. Admins (custom claim `admin: true`) get an "Admin: member profiles" panel on the dashboard.

## Phase 1: official alerts network

- `/alerts` and `/alerts/:id`: active official alerts (law enforcement / NCMEC only), with a share kit (share, copy post, print poster).
- Dashboard "My alert area": zip code + radius, email and/or device notifications (`subscriptions/{uid}`).
- Admin "Post an alert" form (needs the `admin` custom claim). Every alert requires an agency, an official https link and a case number. Marking an alert found/closed removes the photo and description (enforced in rules).
- `functions/` `notifyAlertArea`: when an alert is published, notifies members whose zip is within range (device push via FCM, email queued in `mail/`). Sends once per alert; results in `alertStats/{id}`.

```bash
npm install && (cd functions && npm install)
npm run dev          # local preview
npm run build        # builds dist/ (incl. firebase-messaging-sw.js) and writes firebase.json
npm test             # rules tests + notification e2e in emulators (needs Java 21+)
npm run emulators    # local emulators (ports 8181/9199/5101) ...
npm run dev:test     # ... and the site wired to them; seed with
FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 node functions/test/seed-demo.mjs
node tests/alerts.e2e.mjs   # signed-in alert-area flow (set BASE if Vite picks another port)
firebase deploy --only hosting,firestore   # site, rules and the alerts index
firebase deploy --only functions           # needs the Blaze plan
```

### One-time setup before notifications work
1. Upgrade the Firebase project to Blaze (Cloud Functions requirement), then `firebase deploy --only functions`.
2. Device push: Project settings → Cloud Messaging → Web Push certificates → Generate key pair; put the public key in `vapidKey` in `src/brands.js`, rebuild, redeploy hosting.
3. Email: install the "Trigger Email from Firestore" extension (collection `mail`) with the Zoho SMTP account.
4. Admin: `node scripts/set-admin.cjs <email>` (add `--revoke` to remove). The person must sign out and back in to pick it up.

Status (Nov 9, 2026): project on Blaze; `notifyAlertArea` live in us-west2 (same region as Firestore); web push key added; owner account is admin; hosting + rules + index deployed. Email: `extensions/firestore-send-email.env` is pre-filled for Zoho (`smtppro.zoho.com:465`, mailbox jonathan@w3develops.org, sending as its alias contact@findthebabies.org). Finish with `firebase deploy --only extensions` and type the mailbox password (or a Zoho app-specific password) when prompted.

DNS is on Cloudflare; mail is Zoho. `scripts/connect-domains.mjs` only adds the Firebase records and refuses to run if mail records would change.

Split out of the shared `communitySites` project on November 7, 2026.
