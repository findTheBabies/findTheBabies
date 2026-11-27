import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { brands } from '../src/brands.js';

// Builds the FindTheBabies site into dist/ and writes firebase.json for it.
const key = 'findthebabies';
const brand = brands[key];
const config = JSON.parse(await readFile(`config/${key}.json`, 'utf8'));
if (config.projectId !== brand.project) throw new Error(`Wrong Firebase project for ${key}`);
await build({ define: { __SITE__: JSON.stringify(key), __FIREBASE__: JSON.stringify(config) }, build: { outDir: 'dist', emptyOutDir: true } });

const htmlPath = 'dist/index.html';
let html = await readFile(htmlPath, 'utf8');
html = html
  .replace('<title>A new beginning</title>', `<title>${brand.name} — ${brand.eyebrow.replaceAll('&', '&amp;')}</title>`)
  .replace('A new place for ideas, community, and meaningful action.', brand.description);
await writeFile(htmlPath, html);

// Real robots.txt and sitemap (otherwise the SPA rewrite serves index.html for them).
const site = `https://${brand.domain}`;
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /dashboard\n\nSitemap: ${site}/sitemap.xml\n`);
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>${site}/alerts</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>\n</urlset>\n`);

// Service worker for device notifications. It must be served from the site root.
const sdk = JSON.parse(await readFile('node_modules/firebase/package.json', 'utf8')).version;
await writeFile('dist/firebase-messaging-sw.js', `importScripts('https://www.gstatic.com/firebasejs/${sdk}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${sdk}/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(config)});
firebase.messaging();
`);

await writeFile('firebase.json', JSON.stringify({
  hosting: {
    site: brand.project, public: 'dist', ignore: ['**/.*'],
    rewrites: [{ source: '**', destination: '/index.html' }],
    headers: [
      { source: '**', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' https://apis.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://us-west2-${brand.project}.cloudfunctions.net; frame-src https://*.firebaseapp.com https://accounts.google.com https://apis.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` },
      ] },
      { source: '/assets/**', headers: [{ key: 'Cache-Control', value: 'public,max-age=31536000,immutable' }] },
      { source: '/firebase-messaging-sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ],
  },
  firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
  extensions: { 'firestore-send-email': 'firebase/firestore-send-email@0.2.10' },
  functions: [{ source: 'functions', codebase: 'default', runtime: 'nodejs22', ignore: ['node_modules', 'test', '*.log'] }],
  auth: { providers: { googleSignIn: {
    oAuthBrandDisplayName: brand.name, supportEmail: 'w3develops@gmail.com',
    authorizedRedirectUris: [
      `https://${brand.project}.firebaseapp.com/__/auth/handler`,
      `https://${brand.project}.web.app/__/auth/handler`,
      `https://${brand.domain}/__/auth/handler`,
      `https://www.${brand.domain}/__/auth/handler`,
    ],
  } } },
  emulators: { firestore: { host: '127.0.0.1', port: 8080 }, auth: { host: '127.0.0.1', port: 9099 }, functions: { host: '127.0.0.1', port: 5001 }, ui: { enabled: false }, singleProjectMode: true },
}, null, 2) + '\n');
