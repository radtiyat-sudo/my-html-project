// ถ่ายภาพหน้าจอสำหรับคู่มือ: node dev/screenshots.mjs [outDir]
// ต้องเปิดเซิร์ฟเวอร์ก่อน: npx http-server dev/preview -p 8765
import { chromium } from 'playwright';
const out = process.argv[2] || 'docs/images';
const BASE = 'http://127.0.0.1:8765/index.html';
const shots = [
  ['01-dashboard-dark', '', '', 'dark'],
  ['02-dashboard-light', '', '', 'light'],
  ['03-publications', '', '#publications', 'light'],
  ['04-pub-form', '', '#publications', 'light', async p => { await p.click('[data-act="add-pub"]'); await p.selectOption('#f_personId', { index: 1 }); await p.fill('#f_year', '2563'); await p.fill('#f_title', 'ตัวอย่างผลงาน'); await p.waitForTimeout(200); }],
  ['05-faculty', '', '#faculty', 'light'],
  ['06-faculty-detail', '', '#faculty-detail:FS03', 'light'],
  ['07-verify', '', '#verify', 'light'],
  ['08-expert-detail', '', '#expert-detail:XS01', 'light'],
  ['09-experts', '', '#experts', 'dark'],
  ['10-curricula', '', '#curricula', 'light'],
  ['11-assessment', '', '#assessment', 'light'],
  ['12-reports', '', '#reports', 'dark'],
  ['13-manual-criteria', '', '#manual', 'light', async p => { await p.click('[data-tab="manual"][data-v="criteria"]'); }],
  ['14-manual-faq', '', '#manual', 'dark', async p => { await p.click('[data-tab="manual"][data-v="faq"]'); await p.click('details.faq summary'); }],
  ['15-settings-weights', '', '#settings', 'light', async p => { await p.click('[data-tab="settings"][data-v="weights"]'); }],
  ['16-lecturer-dashboard', '&role=lecturer&fac=FS03', '', 'light'],
  ['17-mobile', '', '', 'dark', null, { width: 390, height: 844 }]
];
const browser = await chromium.launch();
const errors = [];
for (const [name, q, hash, scheme, fn, vp] of shots) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1400, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(name + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  await page.goto(BASE + '?seed' + (q || '') + hash);
  await page.waitForSelector('#nav a', { timeout: 15000 });
  await page.waitForTimeout(500);
  if (fn) await fn(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: !vp && !name.includes('form') });
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
