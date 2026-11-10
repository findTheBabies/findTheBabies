// Grants (or with --revoke, removes) the admin custom claim using the Firebase CLI login.
// Usage: node scripts/set-admin.cjs <email> [--revoke]
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const base = path.join(execFileSync('npm', ['root', '-g'], {encoding: 'utf8'}).trim(), 'firebase-tools/lib/');
const {Client} = require(base + 'apiv2');
const project = 'studio-578944933-7a8c8';
(async () => {
  const [email, flag] = process.argv.slice(2);
  if (!email) throw Error('Usage: node scripts/set-admin.cjs <email> [--revoke]');
  await require(base + 'requireAuth').requireAuth({...require(base + 'auth').getGlobalDefaultAccount(), project, nonInteractive: true});
  const user = await require(base + 'gcp/auth').findUser(project, email);
  const claims = JSON.parse(user.customAttributes || '{}');
  if (flag === '--revoke') delete claims.admin; else claims.admin = true;
  const api = new Client({urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v1'});
  await api.post(`/projects/${project}/accounts:update`, {localId: user.localId || user.uid, customAttributes: JSON.stringify(claims)}, {skipLog: {body: true, resBody: true}});
  const after = await require(base + 'gcp/auth').findUser(project, email);
  console.log(JSON.stringify({uid: after.localId || after.uid, email: after.email, emailVerified: after.emailVerified, claims: JSON.parse(after.customAttributes || '{}')}));
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
