// ภาพหน้าจอ/ทดสอบหน้าเว็บระบบตรวจสอบผลงานและคุณสมบัติ: node dev/build-review-bundle.mjs && node dev/screenshots-review.mjs [outDir]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const out = process.argv[2] || 'docs/review-images';
const URL0 = pathToFileURL(join(process.cwd(), 'dev/preview-review/index.html')).href;
const browser = await chromium.launch();
const errors = [];
async function open(name, as, role, hash, opts) {
  const ctx = await browser.newContext({ viewport: (opts && opts.vp) || { width: 1400, height: 900 }, colorScheme: (opts && opts.scheme) || 'light' });
  await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  if (as) await ctx.addInitScript(([a, r]) => { sessionStorage.setItem('rv-as', a); sessionStorage.setItem('rv-role', r); }, [as, role]);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(name + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  await page.goto(URL0 + (hash && hash[0] === '?' ? hash : '' + (hash || '')));
  await page.waitForSelector(as ? '#nav a' : (opts && opts.wait) || '.acc-card', { timeout: 15000 });
  await page.waitForTimeout(400);
  return { page, ctx };
}
const shot = async (page, name, full) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${name}.png`, fullPage: full !== false }); };
const openReq = async (page, text) => { await page.click(`tr[data-open]:has-text("${text}")`); await page.waitForSelector('.req-head'); await page.waitForTimeout(300); };

let s = await open('picker', null, null, '?email=visitor@mahidol.ac.th', { wait: '#nav a' });
await s.page.click('#user-chip'); await s.page.click('[data-switch]'); await s.page.waitForSelector('.acc-card');
await shot(s.page, '01-test-accounts'); await s.ctx.close();
s = await open('outside-domain', null, null, '?email=someone@gmail.com', { wait: '.banner.red' });
await shot(s.page, '00-outside-domain-blocked', false); await s.ctx.close();

s = await open('req-dash', 'UT-REQ1', 'requester');
await shot(s.page, '02-requester-dashboard');
await s.page.click('[data-nav="new"]'); await s.page.waitForSelector('[data-type]');
await s.page.click('[data-type] >> nth=1'); await s.page.fill('#n-purpose', 'ทดสอบสร้างคำขอจากหน้าเว็บ');
await shot(s.page, '03-new-request');
await s.page.click('#n-create'); await s.page.waitForSelector('#p-search');
await s.page.fill('#p-name', 'สมชาย ทดสอบดี'); await s.page.click('#p-search'); await s.page.waitForSelector('[data-pick]');
await shot(s.page, '04-person-search-duplicate-names');
await s.page.fill('#p-name', ''); await s.page.fill('#p-code', 'T0001'); await s.page.click('#p-search'); await s.page.waitForSelector('[data-pick]');
await s.page.click('[data-pick]'); await s.page.waitForSelector('.avatar.lg');
await s.page.click('[data-tab="works"]'); await s.page.click('#w-src'); await s.page.waitForSelector('.modal');
await shot(s.page, '05-murex-works', false);
await s.page.click('[data-ok]'); await s.page.waitForSelector('.dup');
await shot(s.page, '06-works-duplicates');
await s.page.click('[data-tab="check"]'); await s.page.waitForSelector('#do-submit');
await shot(s.page, '07-completeness-check');
await s.page.click('[data-nav="requests"]'); await s.page.waitForSelector('tr[data-open]');
await openReq(s.page, 'RQ');
await s.ctx.close();

s = await open('returned', 'UT-REQ1', 'requester', '#requests');
await s.page.waitForSelector('tr[data-open]');
await s.page.click('tr[data-open]:has(.badge.amber:has-text("ส่งกลับ"))'); await s.page.waitForSelector('.req-head');
await shot(s.page, '08-returned-for-revision');
await s.ctx.close();

s = await open('staff', 'UT-STAFF1', 'staff');
await shot(s.page, '09-staff-dashboard');
await s.page.click('[data-nav="requests"]'); await s.page.waitForSelector('tr[data-open]');
await shot(s.page, '10-staff-queue');
await s.page.click('#f-open'); await s.page.waitForTimeout(500);
await s.page.click('tr[data-open]:has(.badge:has-text("ปิดงานแล้ว"))'); await s.page.waitForSelector('.req-head');
await s.page.click('[data-tab="results"]'); await s.page.waitForSelector('.overall');
await shot(s.page, '11-criteria-results');
await s.page.click('[data-tab="history"]'); await shot(s.page, '12-history');
await s.ctx.close();

s = await open('staff2', 'UT-STAFF2', 'staff', '#requests');
await s.page.waitForSelector('tr[data-open]');
await s.page.click('tr[data-open]'); await s.page.waitForSelector('[data-act="claim"]');
await s.page.click('[data-act="claim"]'); await s.page.waitForSelector('[data-act="return"]');
await s.page.click('[data-tab="results"]'); await s.page.waitForSelector('.overall');
await shot(s.page, '13-stale-data-inconclusive');
await s.page.click('[data-act="return"]'); await s.page.fill('[data-k=message]', 'ตัวอย่าง: โปรดแนบหลักฐานคุณวุฒิ'); await shot(s.page, '14-return-modal', false);
await s.page.click('[data-ok]'); await s.page.waitForSelector('.banner.amber');
await s.ctx.close();

s = await open('admin', 'UT-ADMIN', 'admin');
await shot(s.page, '15-admin-dashboard');
for (const [nav, name] of [['criteria', '16-criteria'], ['data', '17-data-sources'], ['users', '18-users'], ['settings', '19-settings'], ['audit', '20-audit'], ['reports', '21-reports'], ['types', '22-types']]) {
  await s.page.click(`[data-nav="${nav}"]`); await s.page.waitForTimeout(600); await shot(s.page, name);
}
await s.page.click('[data-nav="criteria"]'); await s.page.waitForSelector('[data-cver]'); await s.page.click('[data-cver] >> nth=0'); await s.page.waitForSelector('.rule-row');
await shot(s.page, '23-criteria-new-version', false);
await s.ctx.close();

s = await open('reviewer', 'UT-REV1', 'reviewer', '', { scheme: 'dark' });
await shot(s.page, '24-reviewer-dark');
await s.ctx.close();

s = await open('mobile', 'UT-REQ1', 'requester', '', { vp: { width: 390, height: 844 } });
await shot(s.page, '25-mobile', false); await s.ctx.close();

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
