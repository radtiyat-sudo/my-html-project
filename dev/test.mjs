// ทดสอบตรรกะฝั่งเซิร์ฟเวอร์ด้วยตัวจำลอง GAS: node dev/test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const GS = ['Config.gs', 'Database.gs', 'Logic.gs', 'Auth.gs', 'Api.gs', 'Reports.gs', 'SampleData.gs', 'Discovery.gs', 'Code.gs'];

function boot(email) {
  const ctx = { console, TextEncoder, crypto, btoa, localStorage: undefined, location: { href: '' } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(root + 'dev/gas-mock.js', 'utf8'), ctx);
  ctx.__opts = { email, reset: true };
  vm.runInContext('const __g = createGasMock(__opts); var SpreadsheetApp=__g.SpreadsheetApp, PropertiesService=__g.PropertiesService, Session=__g.Session, LockService=__g.LockService, Utilities=__g.Utilities, DriveApp=__g.DriveApp, Logger=__g.Logger, HtmlService=__g.HtmlService, ScriptApp=__g.ScriptApp, CacheService=__g.CacheService, UrlFetchApp=__g.UrlFetchApp;', ctx);
  vm.runInContext(process.env.BUNDLE ? readFileSync(root + 'gas/Code.gs', 'utf8') : GS.map(f => readFileSync(root + 'src/' + f, 'utf8')).join('\n'), ctx);
  // รีเซ็ตแคชผู้ใช้ทุกครั้งที่เรียก api (จำลองการเรียกแยก execution)
  const call = (action, payload) => { vm.runInContext('CURRENT_USER_ = null; for (const k in TABLE_CACHE_) delete TABLE_CACHE_[k];', ctx); return JSON.parse(JSON.stringify(ctx.api(action, payload))); };
  call.setEmail = e => { ctx.__opts.email = e; };
  return call;
}

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('✓', name); };
const api = boot('admin@mahidol.ac.th');

t('first visitor becomes admin', () => { const r = api('bootstrap', {}); assert.equal(r.ok, true); assert.equal(r.user.role, 'admin'); });
const seeded = api('seedSample', {});
t('seed sample data', () => { assert.equal(seeded.ok, true); assert.equal(seeded.data.faculty, 16); assert.equal(seeded.model.settings.SAMPLE_DATA, 'true'); });
const m = seeded.model;
const E = m.window.end;
const pub = (pid, pred) => m.publications.find(p => p.personId === pid && pred(p));

t('weights follow ก.พ.อ./สกอ. defaults', () => {
  assert.equal(pub('FS01', p => p.database === 'scopus' && p.quartile === 'Q1').weight, 1);
  assert.equal(pub('FS01', p => p.database === 'tci1').weight, 0.8);
  assert.equal(pub('FS03', p => p.database === 'tci2').weight, 0.6);
  assert.equal(pub('FS06', p => p.database === 'tci3').weight, 0);
  assert.equal(pub('FS09', p => p.type === 'proceedings_nat').weight, 0.2);
  assert.equal(pub('FS10', p => p.type === 'patent').weight, 1);
});
t('5-year window, expiring and expired flags', () => {
  assert.equal(m.window.start, E - 4);
  const old = pub('FS02', () => true);
  assert.equal(old.expired, true); assert.equal(old.inWindow, false);
  assert.equal(pub('FS03', p => p.year === E - 4).expiring, true);
});
t('faculty evaluation counts only verified in-window weighted works', () => {
  const f = id => m.faculty.find(x => x.id === id).eval;
  assert.equal(f('FS01').count, 4); assert.equal(f('FS01').meets, true);
  assert.equal(f('FS02').count, 0); assert.equal(f('FS02').status, 'none');
  assert.equal(f('FS06').count, 1); // tci3 ไม่นับ, proceedings รอตรวจ
  assert.equal(f('FS09').qualOk, false); // ป.โท ไม่มีตำแหน่ง ผศ.
});
t('smart alerts', () => {
  const keys = m.alerts.map(a => a.key);
  ['no_pubs', 'expiring', 'below', 'qual', 'curriculum', 'pending'].forEach(k => assert.ok(keys.includes(k), k));
  assert.ok(m.alerts.find(a => a.key === 'no_pubs').items.some(i => i.name === 'Dr.David Miller'));
});
t('expert evaluation matches reference screenshot (นภา ตัวอย่างดี)', () => {
  const x = m.experts.find(e => e.id === 'XS01').eval;
  assert.equal(x.results['2548'].pass, true);
  assert.equal(x.results['2558'].workValue, 'นานาชาติ 1/5');
  assert.equal(x.results['2565'].workValue, 'ฐานที่ยอมรับ 2/10');
  assert.equal(x.pass, false);
  assert.deepEqual([x.counts.intl, x.counts.nat, x.counts.notCounted], [1, 1, 1]);
  assert.equal(m.experts.find(e => e.id === 'XS02').eval.pass, true);
});
t('curriculum CS04 passes standard', () => { assert.equal(m.curricula.find(c => c.id === 'CS04').eval.pass, true); });
t('assessment indicator 4.2', () => {
  const a = api('assess', { curriculumId: 'CS01', year: E }).data;
  assert.equal(a.indicators.length, 3); assert.ok(a.overall > 0 && a.overall <= 5);
  assert.equal(a.indicators[0].value, 100);
});
t('validation: ค.ศ. year rejected', () => {
  const r = api('savePublication', { personId: 'FS01', title: 'x', year: 2024, type: 'journal', database: 'scopus' });
  assert.equal(r.ok, false); assert.match(r.error, /พ\.ศ\./);
});
t('admin creates, edits and deletes a publication', () => {
  let r = api('savePublication', { personId: 'FS05', title: 'New Paper', year: E, type: 'journal', database: 'scopus', quartile: 'Q2' });
  assert.equal(r.ok, true); assert.equal(r.data.status, 'pending');
  const id = r.data.id;
  r = api('verifyPublications', { ids: [id], decision: 'verified' }); assert.equal(r.ok, true);
  assert.equal(r.model.faculty.find(f => f.id === 'FS05').eval.count, 1);
  r = api('verifyPublications', { ids: [id], decision: 'rejected' }); assert.equal(r.ok, false, 'reject needs reason');
  r = api('deletePublication', { id }); assert.equal(r.ok, true);
});
t('reports render', () => {
  ['faculty', 'pubs'].forEach(type => { const r = api('exportReport', { type }); assert.equal(r.ok, true); assert.ok(r.data.html.includes('<table')); assert.ok(r.data.base64.length > 100); });
  assert.equal(api('exportReport', { type: 'expert', expertId: 'XS01' }).ok, true);
  assert.equal(api('exportReport', { type: 'assessment', curriculumId: 'CS02', year: E }).ok, true);
});

// ----- สิทธิ์ตามบทบาท (ผ่าน view-as ของ Admin) -----
t('lecturer: own data only, cannot edit others or verify', () => {
  assert.equal(api('setViewAs', { role: 'lecturer', facultyId: 'FS03' }).ok, true);
  const r = api('bootstrap', {});
  assert.equal(r.user.role, 'lecturer');
  assert.ok(r.model.publications.every(p => p.personId === 'FS03'));
  assert.equal(r.model.experts.length, 0);
  assert.equal(api('savePublication', { personId: 'FS01', title: 'x', year: E, type: 'book' }).ok, false);
  const own = api('savePublication', { personId: 'FS03', title: 'mine', year: E, type: 'book' });
  assert.equal(own.ok, true);
  assert.equal(api('verifyPublications', { ids: [own.data.id], decision: 'verified' }).ok, false);
  const verified = r.model.publications.find(p => p.status === 'verified');
  assert.equal(api('deletePublication', { id: verified.id }).ok, false);
  assert.equal(api('saveSettings', { W_Q1: 2 }).ok, false);
});
t('chair: verifies own curriculum but not own work', () => {
  api('setViewAs', { role: 'chair', facultyId: 'FS04' });
  const r = api('bootstrap', {});
  assert.equal(JSON.stringify(r.user.curriculumIds), '["CS02"]');
  const fs06 = r.model.publications.find(p => p.personId === 'FS06' && p.status === 'pending');
  assert.equal(api('verifyPublications', { ids: [fs06.id], decision: 'verified' }).ok, true);
  const own = api('savePublication', { personId: 'FS04', title: 'chair own', year: E, type: 'book' });
  assert.equal(api('verifyPublications', { ids: [own.data.id], decision: 'verified' }).ok, false);
  const other = r.model.publications.find(p => p.personId === 'FS07');
  assert.equal(api('verifyPublications', { ids: [other.id], decision: 'pending' }).ok, false);
  assert.equal(api('saveCurriculum', { nameTh: 'x' }).ok, false);
});
t('executive is read-only', () => {
  api('setViewAs', { role: 'executive' });
  assert.equal(api('savePublication', { personId: 'FS01', title: 'x', year: E, type: 'book' }).ok, false);
  assert.equal(api('exportReport', { type: 'faculty' }).ok, true);
  api('setViewAs', { role: 'admin' });
});
t('weights are configurable', () => {
  const r = api('saveSettings', { W_Q2: '0.9' }); assert.equal(r.ok, true);
  assert.equal(r.model.publications.find(p => p.database === 'scopus' && p.quartile === 'Q2').weight, 0.9);
  assert.equal(api('saveSettings', { W_Q2: '9' }).ok, false);
  api('resetWeights', {});
});
t('unknown user denied unless guest allowed; mapped user gets role', () => {
  api.setEmail('stranger@example.com');
  assert.equal(api('bootstrap', {}).ok, false);
  api.setEmail('admin@mahidol.ac.th');
  api('saveSettings', { ALLOW_GUEST: true });
  api.setEmail('stranger@example.com');
  const g = api('bootstrap', {}); assert.equal(g.ok, true); assert.equal(g.user.role, 'executive');
  api.setEmail('lecturer.demo@example.ac.th');
  const l = api('bootstrap', {}); assert.equal(l.user.role, 'lecturer'); assert.equal(l.user.facultyId, 'FS03');
  assert.equal(api('setViewAs', { role: 'admin' }).ok, false);
  api.setEmail('admin@mahidol.ac.th');
  api('saveSettings', { ALLOW_GUEST: false });
});

// ----- ค้นหา/ตรวจผลงานอัตโนมัติ -----
t('find authors by English name (Thai institutions first)', () => {
  const r = api('findAuthors', { nameEn: 'Napa Tuayangdee' });
  assert.equal(r.ok, true); assert.equal(r.data.candidates[0].country, 'TH'); assert.equal(r.data.candidates[0].id, 'A5001');
});
t('find works and classify by ก.พ.อ. database lists', () => {
  const r = api('findWorks', { authorId: 'A5001', nameTh: 'นภา ตัวอย่างดี', fromYear: E - 6, personType: 'expert', personId: 'XS01' });
  assert.equal(r.ok, true);
  const by = t => r.data.works.find(w => w.title.startsWith(t));
  assert.equal(by('Fertility').database, 'scopus'); assert.equal(by('Fertility').quartile, 'Q2'); assert.equal(by('Fertility').weight, 1);
  assert.equal(by('Fertility').year, 2023 + 543);
  assert.ok(by('Ageing').evidence.some(e => /PubMed/.test(e))); assert.equal(by('Ageing').quartile, 'Q1');
  assert.equal(by('Intergenerational').database, 'scopus'); // อยู่ทั้ง Scopus และ TCI1 → ใช้ฐานนานาชาติ
  assert.equal(by('Migrant').database, 'tci2'); assert.equal(by('Migrant').weight, 0.6);
  assert.equal(by('Household').confidence, 'unknown'); assert.equal(by('Household').weight, 0);
  assert.equal(by('Population Projection').type, 'proceedings_intl');
  assert.ok(by('ครอบครัว'), 'Thai-name result from Crossref'); assert.equal(by('ไม่ใช่'), undefined, 'non-matching Crossref author filtered');
  assert.equal(r.data.summary.intl, 4);
});
t('analyze attached document text: DOI → database + owner suggestion', () => {
  const r = api('analyzeDocument', { text: 'Asian Population Studies\nhttps://doi.org/10.9999/w1.\nISSN 1744-1730' });
  assert.equal(r.ok, true); assert.equal(r.data.found, true);
  assert.equal(r.data.work.database, 'scopus'); assert.equal(r.data.work.quartile, 'Q2');
  assert.ok(r.data.owners.some(o => o.personId === 'FS01'));
  const r2 = api('analyzeDocument', { text: 'วารสารสังคมศาสตร์ ISSN 1686-1574 ปีที่ 5' });
  assert.equal(r2.data.found, true); assert.equal(r2.data.work.database, 'tci2');
  const r3 = api('analyzeDocument', { text: 'no identifiers here' });
  assert.equal(r3.data.found, false);
});
t('import selected works as pending, skip duplicates', () => {
  const found = api('findWorks', { authorId: 'A5001', fromYear: E - 6, personType: 'faculty', personId: 'FS05' }).data.works;
  let r = api('importWorks', { personType: 'faculty', personId: 'FS05', works: found.slice(0, 3) });
  assert.equal(r.ok, true); assert.equal(r.data.imported, 3);
  const mine = r.model.publications.filter(p => p.personId === 'FS05');
  assert.ok(mine.every(p => p.status === 'pending')); assert.ok(mine[0].note.includes('นำเข้าอัตโนมัติ'));
  r = api('importWorks', { personType: 'faculty', personId: 'FS05', works: found.slice(0, 3) });
  assert.equal(r.data.imported, 0); assert.equal(r.data.skipped, 3);
  const again = api('findWorks', { authorId: 'A5001', fromYear: E - 6, personType: 'faculty', personId: 'FS05' }).data.works;
  assert.equal(again.filter(w => w.duplicate).length, 3);
});
t('journal index import (admin only) and lecturer import limits', () => {
  const r = api('importJournalIndex', { database: 'tci1', source: 'TCI test', replace: true, rows: [{ title: 'J', issns: ['1234-5679', 'bad'] }] });
  assert.equal(r.ok, true); assert.equal(r.data.added, 1);
  api('setViewAs', { role: 'lecturer', facultyId: 'FS03' });
  assert.equal(api('importJournalIndex', { database: 'tci1', rows: [] }).ok, false);
  assert.equal(api('importWorks', { personType: 'faculty', personId: 'FS01', works: [{ title: 'x', year: E }] }).ok, false);
  assert.equal(api('findAuthors', { nameEn: 'Sunthorn' }).ok, true);
  api('setViewAs', { role: 'executive' });
  assert.equal(api('findWorks', { authorId: 'A5001' }).ok, false);
  api('setViewAs', { role: 'admin' });
});
t('clear sample keeps real data', () => {
  const keep = api('savePublication', { personId: 'FS01', title: 'real', year: E, type: 'book' });
  assert.equal(keep.ok, true);
  const r = api('clearSample', {});
  assert.equal(r.ok, true); assert.equal(r.model.faculty.length, 0);
  // ผลงานจริงของอาจารย์ตัวอย่างยังอยู่ (ไม่ใช่ข้อมูลตัวอย่าง)
  assert.equal(r.model.publications.filter(p => p.title === 'real').length, 1);
});
console.log(`\n${pass} tests passed`);
