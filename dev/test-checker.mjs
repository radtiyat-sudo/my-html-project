// ทดสอบเว็บแอปตรวจผลงานสาธารณะ: node dev/test-checker.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
const ctx = { console, TextEncoder, crypto, btoa, atob, localStorage: undefined, location: { href: '' } };
vm.createContext(ctx);
vm.runInContext(readFileSync(root + 'dev/gas-mock.js', 'utf8'), ctx);
ctx.__opts = { email: '', reset: true };
vm.runInContext('const __g = createGasMock(__opts); var SpreadsheetApp=__g.SpreadsheetApp, PropertiesService=__g.PropertiesService, Session=__g.Session, LockService=__g.LockService, Utilities=__g.Utilities, DriveApp=__g.DriveApp, Logger=__g.Logger, HtmlService=__g.HtmlService, ScriptApp=__g.ScriptApp, CacheService=__g.CacheService, UrlFetchApp=__g.UrlFetchApp;', ctx);
vm.runInContext(readFileSync(root + 'checker/Code.gs', 'utf8'), ctx);
const api = (a, p) => { vm.runInContext('for (const k in TABLE_CACHE_) delete TABLE_CACHE_[k];', ctx); return JSON.parse(JSON.stringify(ctx.checkerApi(a, p))); };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

const setupMsg = ctx.setup();
const pass = setupMsg.match(/รหัสผู้ดูแล.*: (\w+)/)[1];
t('setup creates only checker tables and an admin passcode', () => {
  const names = vm.runInContext('SpreadsheetApp.getActiveSpreadsheet().getSheets().map(s => s.getName())', ctx);
  assert.ok(names.includes('CheckLog') && names.includes('CheckResults') && names.includes('JournalIndex'));
  assert.ok(!names.includes('Users') && !names.includes('Faculty'));
  assert.equal(pass.length, 10);
});
t('public meta works without login', () => { const r = api('meta', {}); assert.equal(r.ok, true); assert.equal(r.data.admin, false); assert.equal(r.data.keys.SCOPUS_API_KEY, false); });
t('admin actions are refused without passcode', () => {
  assert.equal(api('saveKeys', { SCOPUS_API_KEY: 'x' }).ok, false);
  assert.equal(api('importJournals', { database: 'scopus', rows: [] }).ok, false);
  assert.equal(api('adminLogin', { passcode: 'WRONG' }).ok, false);
});
const token = api('adminLogin', { passcode: pass }).data.token;
t('admin can save keys and import journal list', () => {
  assert.equal(api('saveKeys', { token, SCOPUS_API_KEY: 'k1' }).data.SCOPUS_API_KEY, true);
  const r = api('importJournals', { token, database: 'scopus', source: 'SJR', rows: [{ title: 'APS', issns: ['1744-1730'], quartile: 'Q2' }] });
  assert.equal(r.data.added, 1);
  assert.equal(api('testKeys', { token }).data.scopus.ok, true);
});
t('public search: Scopus first, logged to CheckLog', () => {
  const r = api('search', { nameEn: 'Napa Tuayangdee', nameTh: 'นภา ตัวอย่างดี', fromYear: 2563, requester: 'ทดสอบ', org: 'หลักสูตรทดสอบ' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.status[0].key, 'scopus'); assert.equal(r.data.status[0].mode, 'direct');
  const w = r.data.works.find(x => x.title.startsWith('Fertility')); assert.equal(w.database, 'scopus'); assert.equal(w.quartile, 'Q2');
  const sum = api('adminSummary', { token }).data; assert.equal(sum.searches, 1); assert.equal(sum.recent[0].requester, 'ทดสอบ');
  const sub = api('submit', { requester: 'ทดสอบ', nameEn: 'Napa Tuayangdee', works: r.data.works.slice(0, 3) });
  assert.equal(sub.data.count, 3);
  assert.equal(api('adminSummary', { token }).data.submitted, 3);
  assert.equal(api('submit', { works: r.data.works.slice(0, 1) }).ok, false, 'requester required');
});
t('public analyze DOI', () => { const r = api('analyze', { text: 'doi 10.9999/w1' }); assert.equal(r.data.found, true); assert.equal(r.data.work.foundIn[0], 'scopus'); assert.equal(r.data.owners, undefined); });
console.log(`\n${n} checker tests passed`);
