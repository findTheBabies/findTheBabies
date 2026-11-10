// Signed-in alert-area flow against the local emulators (demo data only).
// Run with `npm run emulators` and `npm run dev:test` going; set BASE if Vite picked another port.
import {chromium, expect} from '@playwright/test';
const BASE = process.env.BASE || 'http://127.0.0.1:4174';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
try {
  await page.goto(BASE + '/dashboard');
  const next = page.waitForEvent('popup');
  await page.getByRole('button', {name: 'Continue with Google'}).click();
  const popup = await next; await popup.getByText('Add new account').click();
  // Newer emulator UIs auto-generate the test user; fill fields only when they are shown.
  await popup.getByText('Auto-generate user information').click();
  await popup.getByText('Sign in with Google.com').click();
  await page.getByRole('heading', {name: 'My alert area'}).waitFor();
  await page.getByLabel('Zip code').fill('6270');
  await page.getByRole('button', {name: 'Start alerts'}).click();
  await page.getByRole('alert').filter({hasText: '5-digit'}).waitFor();
  await page.getByLabel('Zip code').fill('62701');
  await page.getByLabel('Watch within').selectOption('50');
  await page.getByRole('button', {name: 'Start alerts'}).click();
  await page.getByRole('status').filter({hasText: 'within 50 miles of 62701'}).waitFor();
  await page.reload();
  await expect(page.getByLabel('Zip code')).toHaveValue('62701');
  await expect(page.getByLabel('Watch within')).toHaveValue('50');
  await page.setViewportSize({width: 375, height: 812});
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Dashboard overflows on mobile');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', {name: 'Stop alerts'}).click();
  await page.getByRole('status').filter({hasText: 'Alerts stopped'}).waitFor();
  console.log('PASS: sign-in, zip validation, save alert area, reload persistence, mobile layout, stop alerts.');
} finally { await browser.close(); }
