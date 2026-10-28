// ทดสอบระบบตรวจสอบผลงานและคุณสมบัติ (review-src): node dev/test-review.mjs   (BUNDLE=1 = ทดสอบไฟล์รวม review/Code.gs)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
export const RV_ORDER = ['Config', 'Code', 'Db', 'Auth', 'Connectors', 'ApiConnector', 'Matching', 'Scholar', '../src/Discovery', '../src/Sources', 'Criteria', 'Workflow', 'Files', 'Reports', 'Admin', 'Api'];
const code = process.env.BUNDLE ? readFileSync(root + 'review/Code.gs', 'utf8') : RV_ORDER.map(f => readFileSync(root + 'review-src/' + f + '.gs', 'utf8')).join('\n');

const ctx = { console, TextEncoder, crypto, btoa, atob, localStorage: undefined, location: { href: '' } };
vm.createContext(ctx);
vm.runInContext(readFileSync(root + 'dev/gas-mock.js', 'utf8'), ctx);
ctx.__opts = { email: 'owner@mahidol.ac.th', reset: true };
vm.runInContext('const __g = createGasMock(__opts); var SpreadsheetApp=__g.SpreadsheetApp, PropertiesService=__g.PropertiesService, Session=__g.Session, LockService=__g.LockService, Utilities=__g.Utilities, DriveApp=__g.DriveApp, Logger={log(){}}, HtmlService=__g.HtmlService, ScriptApp=__g.ScriptApp, CacheService=__g.CacheService, UrlFetchApp=__g.UrlFetchApp;', ctx);
vm.runInContext(code, ctx);

const fresh = () => vm.runInContext('JOURNAL_MAP_ = null; for (const k in TABLE_CACHE_) delete TABLE_CACHE_[k]; for (const k in USER_NAME_CACHE_) delete USER_NAME_CACHE_[k];', ctx);
let as = null, role = null;
const login = (id, r) => { as = id; role = r; };
const realLogin = email => { as = null; role = null; ctx.__opts.email = email; };
const api = (a, p) => { fresh(); const pl = Object.assign({}, p || {}); if (as) pl._as = as; if (role) pl._role = role; return JSON.parse(JSON.stringify(ctx.api(a, pl))); };
const ok = (a, p) => { const r = api(a, p); assert.equal(r.ok, true, a + ': ' + r.error); return r.data; };
const no = (a, p, re) => { const r = api(a, p); assert.equal(r.ok, false, a + ' should be refused'); if (re) assert.match(r.error, re); return r; };
const rows = t => { fresh(); return JSON.parse(JSON.stringify(vm.runInContext(`DB.all(${JSON.stringify(t)})`, ctx))); };
const pdf = Buffer.from('%PDF-1.4\n% test file\n').toString('base64');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

const msg = ctx.setup();
const reqs = () => rows('Requests');
const byPurpose = s => reqs().find(r => r.purpose.indexOf(s) > -1);

t('setup: schema, deployer is admin, demo data via real workflow', () => {
  assert.match(msg, /owner@mahidol\.ac\.th/);
  const st = Object.fromEntries(reqs().map(r => [r.purpose.slice(0, 30), r.status]));
  assert.deepEqual(Object.values(st).sort(), ['closed', 'draft', 'returned', 'submitted']);
  const admin = rows('Users').find(u => u.email === 'owner@mahidol.ac.th');
  assert.match(admin.roles, /admin/);
  assert.ok(rows('Persons').every(p => p.origin === 'mock'), 'all persons are mock');
  assert.ok(rows('CriteriaSets').every(c => c.isDemo === 'true' && /สาธิต/.test(c.name)), 'seed criteria are demo-labelled');
});

t('anyone @mahidol.ac.th gets in as requester only; sees nobody else\'s requests', () => {
  realLogin('newcomer@mahidol.ac.th');
  const b = ok('boot');
  assert.deepEqual(JSON.parse(JSON.stringify(b.user.roles)), ['requester']); assert.ok(b.testAccounts.length >= 7);
  assert.equal(ok('listRequests', {}).length, 0);
  no('getRequest', { id: reqs()[0].id }, /ไม่มีสิทธิ์/);
  no('claim', { id: reqs()[0].id });
  assert.equal(ok('boot').user.id, b.user.id, 'registered once');
  assert.equal(rows('Users').filter(u => u.email === 'newcomer@mahidol.ac.th').length, 1);
});

t('auto-register off: unregistered user gets no data', () => {
  realLogin('owner@mahidol.ac.th');
  ok('saveSettings', { settings: { AUTO_REGISTER: false } });
  realLogin('stranger@mahidol.ac.th');
  const b = ok('boot');
  assert.equal(b.user, null); assert.ok(b.testAccounts.length >= 7);
  no('listRequests', {}, /ไม่มีสิทธิ์/);
  no('getRequest', { id: reqs()[0].id }, /ไม่มีสิทธิ์/);
  realLogin('owner@mahidol.ac.th');
  ok('saveSettings', { settings: { AUTO_REGISTER: true } });
});

t('role permissions are enforced server-side (incl. spoofed role)', () => {
  login('UT-REQ1', 'admin'); // ขอบทบาท admin แต่บัญชีไม่มี → ได้ requester
  assert.equal(ok('boot').user.role, 'requester');
  no('saveSettings', { settings: { TEST_MODE: false } }, /ไม่มีสิทธิ์/);
  no('adminOverview', {}, /ไม่มีสิทธิ์/);
  const sub = byPurpose('บุคคลที่ข้อมูลต้นทางเก่า');
  no('getRequest', { id: sub.id }, /ไม่มีสิทธิ์/); // คำขอของคนอื่น
  no('claim', { id: sub.id });
  login('UT-STAFF2', 'staff');
  assert.ok(ok('listRequests', {}).every(r => r.unit === 'FAC-B'), 'staff sees only own unit');
  no('getRequest', { id: byPurpose('ชื่อซ้ำ').id }, /ไม่มีสิทธิ์/);
  assert.equal(ok('listRequests', {}).some(r => r.status === 'draft'), false, 'staff never sees drafts');
  login('UT-REV2', 'reviewer');
  assert.equal(ok('listRequests', {}).length, 0, 'reviewer sees only requests sent to them');
  no('decide', { id: sub.id, decision: 'approve', reason: 'xxxxx' });
  login('UT-REV1', 'reviewer');
  assert.equal(ok('listRequests', {}).length, 1);
});

t('duplicate names: search by name is ambiguous and never confirms identity', () => {
  login('UT-REQ1', 'requester');
  const s = ok('searchPersons', { name: 'ผศ.ดร. สมชาย ทดสอบดี' });
  assert.equal(s.results.length, 2); assert.equal(s.ambiguous, true);
  assert.ok(s.results.every(r => r.duplicateName && r.sameNameCount === 2));
  assert.equal(s.source.connected, false, 'never claims a real connection');
  const fm = ok('searchPersons', { name: 'Malee Sommatisakul' });
  assert.equal(fm.results[0].staffCode, 'T0003'); assert.equal(fm.results[0].matchBasis, 'former_name');
  const r = byPurpose('ชื่อซ้ำ');
  assert.equal(r.identityStatus, 'needs_staff_check');
  const d = ok('getRequest', { id: r.id });
  const idItem = d.evaluations[0].items.find(i => i.kind === 'identity_verified');
  assert.equal(idItem.result, 'inconclusive'); assert.match(idItem.reason, /ชื่อเดียวกันหลายคน/);
  const byCode = ok('searchPersons', { staffCode: 't0001' });
  assert.equal(byCode.results.length, 1); assert.equal(byCode.results[0].matchBasis, 'staffCode');
});

t('duplicate works: flagged by DOI first and by similar title, never auto-merged', () => {
  const r = byPurpose('ชื่อซ้ำ');
  const pairs = rows('DupPairs').filter(d => d.requestId === r.id);
  assert.equal(pairs.length, 1); assert.equal(pairs[0].basis, 'doi'); assert.equal(pairs[0].status, 'suspected');
  const works = rows('RequestWorks').filter(w => w.requestId === r.id);
  assert.equal(works.length, 4); assert.ok(works.every(w => w.status === 'pending'), 'both duplicates still present');
  // คำขอร่าง: เพิ่มผลงานเองที่ชื่อคล้ายกัน (ไม่มี DOI) → ถูกตั้งเป็นคู่สงสัย
  login('UT-REQ1', 'requester');
  const draft = byPurpose('ร่างคำขอ');
  const res = ok('saveManualWork', { id: draft.id, work: { title: 'Sample external paper (ข้อมูลสมมติ).', type: 'journal', year: new Date().getFullYear() - 1 + 543 } });
  assert.equal(res.suspectedDuplicates, 1);
  assert.equal(rows('DupPairs').filter(d => d.requestId === draft.id)[0].basis, 'title_year');
  // DOI ต่างกัน → ไม่ถือว่าซ้ำแม้ชื่อเหมือน
  ok('saveManualWork', { id: draft.id, work: { title: 'Another Title', type: 'journal', year: 2024, doi: '10.1111/a' } });
  const r2 = ok('saveManualWork', { id: draft.id, work: { title: 'Another Title', type: 'journal', year: 2024, doi: '10.1111/b' } });
  assert.equal(r2.suspectedDuplicates, 0);
});

t('incomplete data blocks submit with a list; missing data is never "fail"', () => {
  login('UT-REQ1', 'requester');
  const types = ok('boot').types;
  const fac = types.find(x => x.code === 'DEMO-FACULTY');
  const r = ok('createRequest', { typeId: fac.id, unit: 'FAC-A' });
  const e = no('submit', { id: r.id });
  assert.match(e.error, /วัตถุประสงค์/); assert.match(e.error, /เลือกบุคคล/); assert.match(e.error, /CV/);
  no('createRequest', { typeId: fac.id, unit: 'FAC-B' }, /หน่วยงาน/); // ไม่อยู่ในขอบเขต
  ok('updateInfo', { id: r.id, purpose: 'ทดสอบข้อมูลไม่ครบ' });
  const p = ok('searchPersons', { staffCode: 'T0006' }).results[0];
  ok('setPerson', { id: r.id, personId: p.personId, staffCode: 'T0006' });
  ok('uploadFile', { id: r.id, docType: 'cv', fileName: 'cv.pdf', data: pdf });
  const s = ok('submit', { id: r.id });
  const items = Object.fromEntries(s.evaluation.items.map(i => [i.kind, i]));
  assert.equal(items.identity_verified.result, 'pass');
  assert.equal(items.academic_rank.result, 'inconclusive'); assert.match(items.academic_rank.reason, /ไม่มีข้อมูล/);
  assert.equal(items.min_works.result, 'inconclusive');
  assert.equal(s.evaluation.overall, 'inconclusive');
});

t('source outage / not connected: search errors clearly, rules become inconclusive', () => {
  login('UT-ADMIN', 'admin');
  ok('saveSettings', { settings: { SIM_OUTAGE_MUHR: true } });
  login('UT-REQ1', 'requester');
  const e = no('searchPersons', { staffCode: 'T0001' }, /ขัดข้อง/);
  assert.equal(e.sourceError.code, 'outage');
  login('UT-STAFF2', 'staff');
  const sub = byPurpose('บุคคลที่ข้อมูลต้นทางเก่า');
  ok('claim', { id: sub.id });
  const ev = ok('rerun', { id: sub.id, reason: 'ทดสอบต้นทางขัดข้อง' });
  const deg = ev.items.find(i => i.kind === 'min_degree');
  assert.equal(deg.result, 'inconclusive'); assert.match(deg.reason, /ขัดข้อง/);
  assert.notEqual(ev.overall, 'fail');
  login('UT-ADMIN', 'admin');
  ok('saveSettings', { settings: { SIM_OUTAGE_MUHR: false, MUREX_MODE: 'api' } });
  const ov = ok('adminOverview');
  const murex = ov.sources.find(x => x.source === 'MUREX');
  assert.equal(murex.connected, false); assert.equal(murex.available, false); assert.match(murex.message, /ยังไม่ได้เชื่อมต่อ/);
  login('UT-STAFF2', 'staff');
  const ev2 = ok('rerun', { id: sub.id, reason: 'MUREX ยังไม่เชื่อม' });
  const deg2 = ev2.items.find(i => i.kind === 'min_degree');
  assert.equal(deg2.result, 'inconclusive'); assert.match(deg2.reason, /เก่ากว่า/, 'stale MUHR data is inconclusive');
  const mw = ev2.items.find(i => i.kind === 'min_works');
  assert.equal(mw.result, 'inconclusive'); assert.match(mw.reason, /MUREX/);
  login('UT-ADMIN', 'admin');
  ok('saveSettings', { settings: { MUREX_MODE: 'mock' } });
});

t('return for revision: edit only listed sections, answer items, resubmit keeps history', () => {
  const r = byPurpose('ชื่อซ้ำ');
  login('UT-REQ1', 'requester');
  let d = ok('getRequest', { id: r.id });
  assert.deepEqual(d.editable, ['documents']);
  no('saveManualWork', { id: r.id, work: { title: 'x', type: 'journal', year: 2024 } }, /แก้ได้เฉพาะส่วน/);
  no('setPerson', { id: r.id, manual: { nameTh: 'x', affiliation: 'y' } }, /แก้ได้เฉพาะส่วน/);
  const oldCv = d.attachments.find(a => a.docType === 'cv');
  ok('removeFile', { fileId: oldCv.id });
  ok('uploadFile', { id: r.id, docType: 'cv', fileName: 'cv-2.pdf', data: pdf });
  no('submit', { id: r.id }, /ยังไม่ได้ตอบรายการแก้ไข/);
  ok('respondRevision', { id: r.id, itemId: d.revisionItems[0].id, response: 'แนบ CV ฉบับใหม่แล้ว' });
  const s = ok('submit', { id: r.id });
  assert.equal(s.request.round, '2'); assert.equal(s.request.status, 'submitted');
  assert.equal(s.request.assigneeId, 'UT-STAFF1', 'goes back to the same staff');
  const atts = rows('Attachments').filter(a => a.requestId === r.id);
  assert.equal(atts.length, 2); assert.ok(atts.some(a => a.status === 'removed'), 'old file kept as removed');
  const hist = rows('StatusHistory').filter(h => h.requestId === r.id).map(h => h.toStatus);
  assert.deepEqual(hist, ['draft', 'submitted', 'in_review', 'returned', 'submitted']);
  assert.equal(rows('Evaluations').filter(e => e.requestId === r.id).length, 2, 'previous evaluation kept');
});

t('staff verification gates forwarding; duplicates resolved without deleting', () => {
  const r = byPurpose('ชื่อซ้ำ');
  login('UT-STAFF1', 'staff');
  ok('claim', { id: r.id });
  no('forward', { id: r.id, reviewerId: 'UT-REV1', summary: 'x' }, /ยืนยันตัวบุคคล/);
  no('confirmIdentity', { id: r.id, note: '' }, /ระบุหลักฐาน/);
  ok('confirmIdentity', { id: r.id, note: 'ตรวจรหัสบุคลากร T0001 กับหน่วยงานแล้ว' });
  let d = ok('getRequest', { id: r.id });
  const pair = d.dupPairs[0];
  no('resolveDup', { pairId: pair.id, decision: 'distinct' }, /เหตุผล/);
  ok('resolveDup', { pairId: pair.id, decision: 'duplicate', keepWorkId: pair.workA, note: 'DOI เดียวกัน' });
  d = ok('getRequest', { id: r.id });
  assert.equal(d.works.filter(w => w.status === 'excluded_duplicate').length, 1);
  assert.equal(d.works.length, 4, 'nothing deleted');
  no('forward', { id: r.id, reviewerId: 'UT-REV1', summary: 'x' }, /ตรวจผลงานที่ยังค้าง/);
  d.works.filter(w => w.status === 'pending').forEach(w => ok('verifyWork', { workId: w.id, status: 'verified', note: 'ok' }));
  no('forward', { id: r.id, reviewerId: 'UT-REV2', summary: 'x' }, /ไม่ได้รับผิดชอบ/);
  const f = ok('forward', { id: r.id, reviewerId: 'UT-REV1', summary: 'ข้อมูลครบ' });
  assert.equal(f.request.status, 'pending_decision');
});

t('decision is separate from system result, needs reason, only by assigned reviewer', () => {
  const r = byPurpose('ชื่อซ้ำ');
  login('UT-REV1', 'reviewer');
  const d = ok('getRequest', { id: r.id });
  assert.ok(d.actions.includes('decide'));
  no('decide', { id: r.id, decision: 'approve', reason: '' }, /เหตุผล/);
  const res = ok('decide', { id: r.id, decision: 'reject', reason: 'ทดสอบ: ตัดสินต่างจากผลระบบได้' });
  assert.equal(res.request.status, 'decided');
  const ev = rows('Evaluations').filter(e => e.requestId === r.id).pop();
  assert.equal(res.decision.evaluationId, ev.id);
  assert.equal(res.decision.isDemo, true);
  login('UT-STAFF1', 'staff');
  ok('close', { id: r.id });
  assert.ok(rows('Notifications').some(x => x.userId === 'UT-REQ1' && /ไม่อนุมัติ/.test(x.message) && /สาธิต/.test(x.message)));
});

t('criteria version change: new version, old results kept, re-run is explicit', () => {
  login('UT-ADMIN', 'admin');
  const ov = ok('adminOverview');
  const v1 = ov.criteria.find(c => c.code === 'CS-DEMO-FACULTY');
  no('saveCriteria', { id: v1.id, typeId: v1.typeId, name: v1.name, rules: v1.rules }, /ฉบับร่าง/);
  const rules = v1.rules.map(x => x.kind === 'min_works' ? Object.assign({}, x, { params: Object.assign({}, x.params, { min: 2 }) }) : x);
  const v2 = ok('saveCriteria', { fromId: v1.id, typeId: v1.typeId, name: v1.name + ' (ปรับปรุง)', rules, isDemo: true, effectiveDate: '2020-01-01' });
  assert.equal(v2.version, '2'); assert.equal(v2.status, 'draft');
  ok('activateCriteria', { id: v2.id });
  assert.equal(rows('CriteriaSets').find(c => c.id === v1.id).status, 'retired');
  const r = byPurpose('ทดสอบข้อมูลไม่ครบ');
  const before = rows('Evaluations').filter(e => e.requestId === r.id);
  assert.equal(before[0].criteriaVersion, '1');
  login('UT-STAFF1', 'staff');
  ok('claim', { id: r.id });
  const d = ok('getRequest', { id: r.id });
  assert.equal(d.newerCriteria.version, '2');
  const ev = ok('rerun', { id: r.id, reason: 'ประกาศใหม่', useLatestCriteria: true });
  assert.equal(ev.criteriaVersion, '2');
  const after = rows('Evaluations').filter(e => e.requestId === r.id);
  assert.equal(after.length, before.length + 1); assert.equal(after[0].criteriaVersion, '1');
});

t('real criteria need reference + confirmer; demo criteria never judge real requests', () => {
  login('UT-ADMIN', 'admin');
  const type = ok('saveType', { name: 'ประเภทจริง (ทดสอบ)', requiredDocs: [{ code: 'cv', label: 'CV', when: 'always' }] });
  const rules = [{ id: 'R1', kind: 'identity_verified', label: 'ยืนยันตัวบุคคล' }];
  const real = ok('saveCriteria', { typeId: type.id, name: 'เกณฑ์จริง', rules, isDemo: false });
  no('activateCriteria', { id: real.id }, /แหล่งอ้างอิง.*วันที่มีผล.*ผู้ยืนยัน/);
  ok('saveCriteria', { id: real.id, typeId: type.id, name: 'เกณฑ์จริง', rules, isDemo: false, referenceSource: 'ประกาศทดสอบ ข้อ 1', effectiveDate: '2020-01-01' });
  ok('activateCriteria', { id: real.id, confirmedBy: 'ผู้ยืนยันทดสอบ' });
  login('UT-REQ1', 'requester');
  const r = ok('createRequest', { typeId: type.id, unit: 'FAC-A', purpose: 'คำขอจริง' });
  assert.equal(r.isDemo, false);
  login('UT-ADMIN', 'admin');
  const demo = ok('saveCriteria', { fromId: real.id, typeId: type.id, name: 'สาธิตทับ', rules, isDemo: true, effectiveDate: '2021-01-01' });
  ok('activateCriteria', { id: demo.id });
  login('UT-REQ1', 'requester');
  ok('setPerson', { id: r.id, personId: ok('searchPersons', { staffCode: 'T0003' }).results[0].personId, staffCode: 'T0003' });
  ok('uploadFile', { id: r.id, docType: 'cv', fileName: 'a.pdf', data: pdf });
  no('submit', { id: r.id }, /เกณฑ์สาธิต\/เกณฑ์จริง/);
});

t('files: type/size/content checks and no access without permission', () => {
  login('UT-REQ1', 'requester');
  const draft = byPurpose('ร่างคำขอ');
  no('uploadFile', { id: draft.id, docType: 'cv', fileName: 'a.exe', data: pdf }, /ชนิดไฟล์ไม่อนุญาต/);
  no('uploadFile', { id: draft.id, docType: 'cv', fileName: 'fake.pdf', data: Buffer.from('MZ fake exe').toString('base64') }, /เนื้อไฟล์ไม่ตรง/);
  ctx.__big = Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(11 * 1024 * 1024)]).toString('base64');
  no('uploadFile', { id: draft.id, docType: 'cv', fileName: 'big.pdf', data: ctx.__big }, /ใหญ่เกิน/);
  const closed = reqs().find(x => x.status === 'closed' && /กรรมการสอบ/.test(x.purpose));
  const fileId = rows('Attachments').find(a => a.requestId === closed.id).id;
  const d = ok('getRequest', { id: closed.id });
  assert.equal(JSON.stringify(d).indexOf('storageId'), -1, 'Drive file id never sent to the browser');
  assert.equal(ok('downloadFile', { fileId }).mime, 'application/pdf');
  login('UT-REQ2', 'requester'); no('downloadFile', { fileId }, /ไม่มีสิทธิ์/);
  login('UT-STAFF2', 'staff'); no('downloadFile', { fileId }, /ไม่มีสิทธิ์/);
  login('UT-REV2', 'reviewer'); no('downloadFile', { fileId }, /ไม่มีสิทธิ์/);
  login('UT-STAFF1', 'staff'); assert.ok(ok('downloadFile', { fileId }).data.length > 10);
  assert.ok(rows('Audit').some(a => a.action === 'file.denied'));
});

t('CSV import: preview first, invalid rows skipped, labelled as imported', () => {
  login('UT-STAFF1', 'staff');
  no('importPreview', { source: 'MUHR', csv: 'a' }, /ไม่มีสิทธิ์/);
  login('UT-ADMIN', 'admin');
  no('importPreview', { source: 'MUHR', csv: 'name\nx' }, /staffCode/);
  const csv = 'staffCode,firstNameTh,lastNameTh,firstNameEn,lastNameEn,highestDegree,employmentStatus,sourceUpdatedAt\n' +
    'I001,ทดลอง,นำเข้า,Tod,Namkhao,ปริญญาเอก,active,2026-01-10\nI002,,ไม่มีชื่อ,,,,,\nI003,ซ้ำ,หนึ่ง,,,phd?,active,\nI001,ซ้ำ,รหัส,,,,,';
  const pv = ok('importPreview', { source: 'MUHR', csv, fileName: 'muhr.csv' });
  assert.deepEqual(pv.summary, { total: 4, new: 1, update: 0, skip: 3 });
  assert.equal(rows('Persons').filter(p => p.origin === 'import').length, 0, 'nothing written before commit');
  ok('importCommit', { batchId: pv.batch.id });
  const p = rows('Persons').filter(x => x.origin === 'import');
  assert.equal(p.length, 1); assert.equal(p[0].highestDegree, 'doctorate'); assert.ok(p[0].fetchedAt);
  ok('saveSettings', { settings: { MUHR_MODE: 'import' } });
  login('UT-REQ1', 'requester');
  assert.equal(ok('searchPersons', { name: 'ทดลอง นำเข้า' }).results[0].origin, 'import');
  assert.equal(ok('searchPersons', { name: 'มาลี' }).results.length, 0, 'mock data not mixed into import mode');
  login('UT-ADMIN', 'admin'); ok('saveSettings', { settings: { MUHR_MODE: 'mock' } });
});

t('reports with definitions; external notifications cannot be enabled', () => {
  login('UT-STAFF1', 'staff');
  const rep = ok('report', { includeDemo: true });
  assert.ok(rep.definitions.length >= 5);
  assert.ok(rep.counts.created >= 3);
  assert.ok(rep.cycle.n >= 1);
  assert.ok(rep.returns.events >= 1);
  assert.ok(rep.stages.find(s => s.status === 'in_review').done.n >= 1);
  assert.equal(JSON.stringify(rep).search(/ประหยัด|saving/i), -1);
  assert.equal(ok('report', {}).counts.created, 1, 'demo excluded by default');
  login('UT-ADMIN', 'admin');
  no('saveSettings', { settings: { EXTERNAL_NOTIFY: 'email' } }, /ยังเปิด/);
});

t('audit log records who/what/fields without personal data', () => {
  const audit = rows('Audit');
  assert.ok(audit.length > 20);
  const text = JSON.stringify(audit);
  ['สมชาย', 'มาลี', 'Thotsobdee', 'กมล', 'ทดลอง'].forEach(s => assert.equal(text.indexOf(s), -1, 'personal name in log: ' + s));
  assert.ok(audit.some(a => a.action === 'status' && /status=returned/.test(a.fields)));
});

t('only @mahidol.ac.th accounts can sign in (even with test accounts)', () => {
  realLogin('someone@gmail.com');
  const b = ok('boot');
  assert.equal(b.user, null); assert.equal(b.domainBlocked, true); assert.equal(b.testAccounts.length, 0);
  as = 'UT-ADMIN'; role = 'admin';
  no('listRequests', {}, /@mahidol\.ac\.th/);
  realLogin('owner@mahidol.ac.th');
  no('saveUser', { name: 'x', email: 'x@gmail.com', roles: ['staff'], units: ['FAC-A'] }, /mahidol/);
  no('saveSettings', { settings: { ALLOWED_DOMAIN: 'gmail.com' } }, /ไม่อยู่ในโดเมน/);
  const u = ok('saveUser', { name: 'เจ้าหน้าที่จริง', email: 'Staff.Real@mahidol.ac.th', roles: ['staff'], units: ['FAC-A'] });
  realLogin('staff.real@mahidol.ac.th');
  assert.equal(ok('boot').user.id, u.id);
  realLogin('owner@mahidol.ac.th');
});

t('setup: creator outside the domain is not made admin; FIRST_ADMIN_EMAIL is used', () => {
  realLogin('creator@gmail.com');
  assert.match(ctx.setup(), /เฉพาะบัญชี @mahidol\.ac\.th/);
  assert.equal(rows('Users').some(u => u.email === 'creator@gmail.com'), false);
  vm.runInContext("PropertiesService.getScriptProperties().setProperty('FIRST_ADMIN_EMAIL', 'boss@mahidol.ac.th, x@gmail.com')", ctx);
  const m = ctx.setup();
  assert.match(m, /ตั้ง boss@mahidol\.ac\.th เป็นผู้ดูแลระบบแล้ว/); assert.match(m, /ข้าม x@gmail\.com/);
  realLogin('boss@mahidol.ac.th');
  assert.ok(ok('boot').user.roles.includes('admin'));
  realLogin('owner@mahidol.ac.th');
});

t('test mode off: test accounts refused, real users still work', () => {
  login('UT-ADMIN', 'admin');
  ok('saveSettings', { settings: { TEST_MODE: false } });
  no('boot', {}, /ปิดโหมดทดสอบ/);
  realLogin('owner@mahidol.ac.th');
  const b = ok('boot');
  assert.equal(b.testAccounts.length, 0); assert.equal(b.user.role, 'admin');
  realLogin('another@mahidol.ac.th');
  assert.equal(ok('boot').user.role, 'requester', 'real domain users still auto-registered');
});

// ---- ระบบภายนอกจำลอง: Pure (MUREX) และ HR (MUHR) ----
let pureDown = false;
ctx.__fake = (url, opts) => {
  const h = (opts && opts.headers) || {};
  const J = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  if (url.indexOf('https://pure.test/ws/api') === 0) {
    if (pureDown) return J(503, {});
    if (h['api-key'] !== 'pure-key') return J(401, { message: 'invalid key' });
    if (/\/persons\/search$/.test(url)) {
      const q = JSON.parse(opts.payload).searchString;
      const P = { uuid: 'u-1', name: { firstName: 'Anong', lastName: 'Testpure' }, ids: [{ typeDiscriminator: 'ClassifiedId', id: 'P1001', type: { term: { en_GB: 'Employee ID' } } }],
        staffOrganizationAssociations: [{ organization: { name: { en_GB: 'Faculty of Test' } } }] };
      return J(200, { count: 1, items: /P1001|Anong/i.test(q) ? [P] : [] });
    }
    if (/\/persons\/u-1\/research-outputs/.test(url)) return J(200, { items: [
      { uuid: 'ro-1', title: { value: 'Fertility Decline in Southeast Asia (Sample)' }, type: { term: { en_GB: 'Contribution to journal/Article' } }, publicationStatuses: [{ current: true, publicationDate: { year: 2023, month: 5 } }],
        electronicVersions: [{ doi: '10.9999/w1' }], journalAssociation: { title: { value: 'Asian Population Studies' }, issn: { value: '1744-1730' } }, contributors: [{ name: { firstName: 'Anong', lastName: 'Testpure' } }] },
      { uuid: 'ro-2', title: { value: 'Pure Conference Paper' }, type: { term: { en_GB: 'Chapter in Book/Report/Conference proceeding/Conference contribution' } }, publicationStatuses: [{ current: true, publicationDate: { year: 2024 } }] }] });
    return J(404, {});
  }
  if (url.indexOf('https://hr.test/api') === 0) {
    if (h.Authorization !== 'Bearer hr-token') return J(403, {});
    const rec = { emp: { code: 'H001' }, th: { first: 'อนงค์', last: 'ทดสอบเอพีไอ' }, en: { first: 'Anong', last: 'Testapi' }, org: 'FAC-A', degree: 'ปริญญาเอก', rank: 'asst_prof', status: 'active', updated: '2026-09-01' };
    if (/\/staff\/H001$/.test(url)) return J(200, rec);
    if (/\/staff\?name=/.test(url)) return J(200, { data: [rec, Object.assign({}, rec, { emp: { code: 'H002' }, org: 'FAC-B' })] });
    return J(404, {});
  }
  return null;
};
vm.runInContext('(function (orig) { UrlFetchApp.fetch = function (u, o) { return __fake(u, o) || orig.call(UrlFetchApp, u, o); }; })(UrlFetchApp.fetch);', ctx);

t('Scopus + databases: search for the request person, add with verification links', () => {
  realLogin('owner@mahidol.ac.th'); ok('saveSettings', { settings: { TEST_MODE: true } }); // การทดสอบก่อนหน้าปิดโหมดทดสอบไว้
  login('UT-ADMIN', 'admin');
  ok('saveApiKeys', { SCOPUS_API_KEY: 'k1' });
  assert.equal(ok('testApiKeys').scopus.ok, true);
  login('UT-REQ1', 'requester');
  const draft = byPurpose('ร่างคำขอ');
  const r = ok('scholarSearch', { id: draft.id, nameEn: 'Napa Tuayangdee', nameTh: 'นภา ตัวอย่างดี', scopusId: '', fromYear: 2560, toYear: 2570 });
  assert.equal(r.status[0].key, 'scopus'); assert.equal(r.status[0].mode, 'direct');
  const i = r.works.findIndex(w => /^Fertility/.test(w.title));
  assert.equal(r.works[i].database, 'scopus'); assert.equal(r.works[i].proof, 'record'); assert.equal(r.works[i].quartile, 'Q2');
  assert.match(r.works[i].quartileSource, /CiteScore 2024/);
  login('UT-REQ2', 'requester'); no('addScholarWorks', { id: draft.id, token: r.token, indexes: [i] }, /ไม่มีสิทธิ์/);
  login('UT-REQ1', 'requester');
  no('addScholarWorks', { id: draft.id, token: 'forged', indexes: [i] }, /หมดอายุ/);
  assert.equal(ok('addScholarWorks', { id: draft.id, token: r.token, indexes: [i] }).added, 1);
  const w = rows('RequestWorks').find(x => x.requestId === draft.id && x.origin === 'SCHOLAR');
  assert.equal(w.database, 'scopus'); assert.equal(w.proof, 'record'); assert.ok(JSON.parse(w.links).some(l => /scopus\.com\/record/.test(l.url)));
  assert.equal(ok('scholarSearch', { id: draft.id, fromYear: 2560, toYear: 2570 }).works[i].added, true, 'marks already-added');
  // ผลงานกรอกเองที่มี DOI → ตรวจกับฐานข้อมูล
  const mw = ok('saveManualWork', { id: draft.id, work: { title: 'Ageing Society paper', type: 'journal', year: 2024, doi: '10.9999/w2' } }).work;
  const c = ok('checkWorkDb', { workId: mw.id });
  assert.equal(c.found, true); assert.ok(['scopus', 'wos', 'pubmed'].includes(c.database));
});

t('rule with database + quartile: unchecked works are inconclusive, never fail', () => {
  login('UT-ADMIN', 'admin');
  const type = ok('saveType', { name: 'สาธิต ฐานข้อมูล', requiredDocs: [], isDemo: true });
  const rules = [{ id: 'R1', kind: 'min_works', label: '[สาธิต] ผลงานในฐานนานาชาติ Q1-Q2', params: { min: 1, years: 10, types: ['journal'], databases: ['kpa_intl'], quartiles: ['Q1', 'Q2'] } }];
  const cs = ok('saveCriteria', { typeId: type.id, name: 'สาธิต Q', rules, isDemo: true, effectiveDate: '2020-01-01' });
  assert.deepEqual(cs.rules[0].params.databases, ['kpa_intl']);
  ok('activateCriteria', { id: cs.id });
  login('UT-REQ1', 'requester');
  const r = ok('createRequest', { typeId: type.id, unit: 'FAC-A', purpose: 'ทดสอบเกณฑ์ฐานข้อมูล' });
  ok('setPerson', { id: r.id, personId: ok('searchPersons', { staffCode: 'T0003' }).results[0].personId, staffCode: 'T0003' });
  const w = ok('saveManualWork', { id: r.id, work: { title: 'Fertility Decline in Southeast Asia (Sample)', type: 'journal', year: 2023, doi: '10.9999/w1' } }).work;
  let ev = ok('submit', { id: r.id }).evaluation;
  assert.equal(ev.items[0].result, 'inconclusive'); assert.match(ev.items[0].reason, /ยังไม่ได้ตรวจกับฐานข้อมูล/);
  login('UT-STAFF1', 'staff');
  ok('claim', { id: r.id });
  ok('checkWorkDb', { workId: w.id });
  ok('verifyWork', { workId: w.id, status: 'verified' });
  ev = ok('rerun', { id: r.id, reason: 'ตรวจฐานข้อมูลแล้ว' });
  assert.equal(ev.items[0].result, 'pass', ev.items[0].reason);
  assert.ok(ev.items[0].dataUsed.some(x => /Scopus Q2 \(CiteScore 2024/.test(x)));
});

t('MUREX via Pure API: not connected until tested; live works with source label', () => {
  login('UT-ADMIN', 'admin');
  ok('saveSettings', { settings: { MUREX_MODE: 'api' } });
  let st = ok('adminOverview').sources.find(x => x.source === 'MUREX');
  assert.equal(st.connected, false); assert.equal(st.available, false);
  let v = ok('saveSourceApi', { source: 'MUREX', preset: 'pure', base: 'https://pure.test/ws/api', authHeader: 'api-key', searchReq: 'POST /persons/search {"searchString":"{q}","size":20}', worksReq: 'GET /persons/{pid}/research-outputs?size=100', listPath: 'items', token: 'wrong' });
  v = ok('testSourceApi', { source: 'MUREX', q: 'P1001' });
  assert.equal(v.connected, false); assert.match(v.lastTest.message, /ปฏิเสธ/);
  ok('saveSourceApi', { source: 'MUREX', preset: 'pure', base: 'https://pure.test/ws/api', authHeader: 'api-key', searchReq: 'POST /persons/search {"searchString":"{q}","size":20}', worksReq: 'GET /persons/{pid}/research-outputs?size=100', listPath: 'items', token: 'pure-key' });
  assert.equal(ok('sourceApi').MUREX.connected, false, 'changed config needs a new test');
  v = ok('testSourceApi', { source: 'MUREX', q: 'P1001' });
  assert.equal(v.connected, true, v.lastTest.message); assert.equal(JSON.stringify(ok('sourceApi')).indexOf('pure-key'), -1, 'key never returned');
  st = ok('adminOverview').sources.find(x => x.source === 'MUREX');
  assert.equal(st.connected, true); assert.match(st.connectedLabel, /เชื่อมต่อระบบจริงแล้ว/);
  // คำขอของบุคคลรหัส P1001 (ข้อมูลบุคคลกรอกเอง แต่ผลงานดึงจาก MUREX จริงไม่ได้ถ้าไม่ได้มาจาก MUHR) → ใช้ staffCode จาก MUHR จำลองที่เพิ่ม
  vm.runInContext("DB.insert('Persons', { origin: 'mock', staffCode: 'P1001', firstNameTh: 'อนงค์', lastNameTh: 'เพียวทดสอบ', firstNameEn: 'Anong', lastNameEn: 'Testpure', unit: 'FAC-A', highestDegree: 'doctorate', employmentStatus: 'active', fetchedAt: nowIso_(), sourceUpdatedAt: nowIso_().slice(0,10) })", ctx);
  login('UT-REQ1', 'requester');
  const fac = ok('boot').types.find(x => x.code === 'DEMO-FACULTY');
  const r = ok('createRequest', { typeId: fac.id, unit: 'FAC-A', purpose: 'ทดสอบ MUREX API' });
  ok('setPerson', { id: r.id, personId: ok('searchPersons', { staffCode: 'P1001' }).results[0].personId, staffCode: 'P1001' });
  const sw = ok('sourceWorks', { id: r.id });
  assert.equal(sw.works.length, 2); assert.equal(sw.works[0].origin, 'api'); assert.equal(sw.works[0].doi, '10.9999/w1'); assert.equal(sw.works[1].type, 'proceeding');
  assert.equal(sw.source.connected, true);
  assert.equal(ok('addSourceWorks', { id: r.id, workIds: sw.works.map(w => w.id) }).added, 2);
  assert.equal(rows('RequestWorks').filter(w => w.requestId === r.id)[0].origin, 'MUREX-api');
  pureDown = true;
  const e = no('sourceWorks', { id: r.id }, /ขัดข้อง/); assert.equal(e.sourceError.code, 'outage');
  pureDown = false;
  login('UT-ADMIN', 'admin'); ok('saveSettings', { settings: { MUREX_MODE: 'mock' } });
});

t('MUHR via custom REST API with field mapping; name results still need staff check', () => {
  login('UT-ADMIN', 'admin');
  no('saveSourceApi', { source: 'MUHR', preset: 'custom', base: 'http://hr.test', searchReq: 'GET /x', personMap: '{}' }, /https/);
  ok('saveSourceApi', { source: 'MUHR', preset: 'custom', base: 'https://hr.test/api', authHeader: 'Authorization', authPrefix: 'Bearer ', token: 'hr-token',
    searchReq: 'GET /staff?name={q}', byCodeReq: 'GET /staff/{code}', listPath: 'data',
    personMap: JSON.stringify({ staffCode: 'emp.code', firstNameTh: 'th.first', lastNameTh: 'th.last', firstNameEn: 'en.first', lastNameEn: 'en.last', unit: 'org', highestDegree: 'degree', academicRank: 'rank', employmentStatus: 'status', sourceUpdatedAt: 'updated' }) });
  const v = ok('testSourceApi', { source: 'MUHR', q: 'H001' });
  assert.equal(v.connected, true, v.lastTest.message);
  ok('saveSettings', { settings: { MUHR_MODE: 'api' } });
  login('UT-REQ1', 'requester');
  const byCode = ok('searchPersons', { staffCode: 'H001' });
  assert.equal(byCode.results[0].origin, 'api'); assert.equal(byCode.results[0].highestDegree, 'doctorate'); assert.equal(byCode.results[0].matchBasis, 'staffCode');
  const byName = ok('searchPersons', { name: 'อนงค์ ทดสอบเอพีไอ' });
  assert.equal(byName.results.length, 2); assert.ok(byName.results.every(x => x.matchBasis === 'name')); assert.equal(byName.ambiguous, true);
  login('UT-ADMIN', 'admin'); ok('saveSettings', { settings: { MUHR_MODE: 'mock' } });
});

t('simple search: any @mahidol.ac.th user, name + years only; API key from code', () => {
  vm.runInContext("PropertiesService.getScriptProperties().deleteProperty('SCOPUS_API_KEY'); API_KEYS_IN_CODE.SCOPUS_API_KEY = 'key-in-code';", ctx);
  assert.match(ctx.testScopus(), /Scopus: ผ่าน/);
  as = null; role = null;
  realLogin('anyone@mahidol.ac.th');
  const b = ok('boot');
  assert.equal(b.simpleMode, true); assert.ok(b.user);
  no('quickSearch', { name: '', fromYear: 2565, toYear: 2569 }, /กรอกชื่อ/);
  no('quickSearch', { name: 'Napa Tuayangdee', fromYear: 2569, toYear: 2565 }, /ปีเริ่ม/);
  const r = ok('quickSearch', { name: 'Napa Tuayangdee', fromYear: 2560, toYear: 2570 });
  assert.equal(r.query.nameEn, 'Napa Tuayangdee'); assert.equal(r.scopusKey, true);
  assert.equal(r.status[0].mode, 'direct', 'Scopus searched with the key from code');
  assert.ok(r.works.length > 0); assert.ok(r.counts.intl >= 1);
  assert.ok(r.works.every(w => Array.isArray(w.links)));
  const th = ok('quickSearch', { name: 'มาลี ตัวอย่างงาม', fromYear: 2560, toYear: 2570 });
  assert.equal(th.query.nameEn, 'Malee Tuayang-ngam', 'English name found from person data');
  assert.match(th.notes[0], /ข้อมูลจำลอง/);
  realLogin('someone@gmail.com');
  no('quickSearch', { name: 'Napa Tuayangdee' }, /@mahidol\.ac\.th/);
  vm.runInContext("API_KEYS_IN_CODE.SCOPUS_API_KEY = '';", ctx);
  realLogin('owner@mahidol.ac.th');
});

t('missing permission for external requests is explained, not shown as "no results"', () => {
  vm.runInContext("var __origFetch = UrlFetchApp.fetch; UrlFetchApp.fetch = function () { throw new Error('You do not have permission to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request'); }; CacheService.getScriptCache().get = function () { return null; };", ctx);
  realLogin('anyone@mahidol.ac.th');
  const r = ok('quickSearch', { name: 'Someone Uncached', fromYear: 2565, toYear: 2569 });
  assert.match(r.notes[0], /testConnection/);
  assert.ok(r.status.filter(x => x.mode === 'error').every(x => /อนุญาตสิทธิ์/.test(x.message)));
  assert.match(ctx.testConnection(), /OpenAlex: ไม่ได้ — สคริปต์ยังไม่ได้รับอนุญาต/);
  vm.runInContext('UrlFetchApp.fetch = __origFetch;', ctx);
  realLogin('owner@mahidol.ac.th');
});

t('Thai name only: English name found from OpenAlex, then all databases searched; SJR list import', () => {
  const TH = encodeURIComponent('กมล ทดสอบไทย');
  const prev = ctx.__fake;
  ctx.__fake = (url, opts) => {
    const J = (code, body, hdr) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body), getHeaders: () => hdr || {} });
    if (url.indexOf('api.openalex.org/authors?search=' + TH) > -1) return J(200, { results: [
      { id: 'https://openalex.org/A9', display_name: 'Kamon Testthai', display_name_alternatives: ['กมล ทดสอบไทย', 'K. Testthai'], works_count: 5, last_known_institutions: [{ display_name: 'Mahidol University', country_code: 'TH' }] },
      { id: 'https://openalex.org/A8', display_name: 'Someone Else', display_name_alternatives: [], works_count: 9 }] });
    if (url.indexOf('raw_author_name.search:' + TH) > -1) return J(200, { results: [] });
    if (/scimagojr\.com/.test(url)) return J(200, 'Rank;Sourceid;Title;Type;Issn;SJR;SJR Best Quartile\n1;1;"Asian Population Studies";journal;"17441730, 17441749";1,2;Q2\n2;2;"Population Studies";journal;"00324728";2,1;Q1\n', { 'Content-Disposition': 'attachment; filename="scimagojr 2024.csv"' });
    return prev(url, opts);
  };
  realLogin('anyone@mahidol.ac.th');
  const r = ok('quickSearch', { name: 'กมล ทดสอบไทย', fromYear: 2560, toYear: 2570 });
  assert.equal(r.query.nameEn, 'Kamon Testthai'); assert.equal(r.query.openalexId, 'A9');
  assert.match(r.notes.join(' '), /พบชื่อ "Kamon Testthai".*OpenAlex/);
  assert.equal(r.enCandidates.length, 1, 'only authors whose Thai name matches');
  assert.ok(r.status.find(x => x.key === 'pubmed').mode === 'direct', 'PubMed searched with the English name');
  assert.match(r.notes.join(' '), /importSjr/);
  assert.match(ctx.importSjr(), /SJR 2024.*3 ISSN/);
  const r2 = ok('quickSearch', { name: 'Napa Tuayangdee', fromYear: 2560, toYear: 2570 });
  assert.doesNotMatch(r2.notes.join(' '), /importSjr/);
  const w = r2.works.find(x => /^Fertility/.test(x.title));
  assert.equal(w.database, 'scopus'); assert.equal(w.quartile, 'Q2'); assert.match(w.quartileSource, /รายชื่อวารสาร/);
  ctx.__fake = prev;
  realLogin('owner@mahidol.ac.th');
});

t('fresh install run by an account outside the domain: demo data still created, no admin until configured', () => {
  const c2 = { console, TextEncoder, crypto, btoa, atob, location: { href: '' } };
  vm.createContext(c2);
  vm.runInContext(readFileSync(root + 'dev/gas-mock.js', 'utf8'), c2);
  c2.__opts = { email: 'creator@gmail.com', reset: true };
  vm.runInContext('const __g = createGasMock(__opts); var SpreadsheetApp=__g.SpreadsheetApp, PropertiesService=__g.PropertiesService, Session=__g.Session, LockService=__g.LockService, Utilities=__g.Utilities, DriveApp=__g.DriveApp, Logger={log(){}}, HtmlService=__g.HtmlService;', c2);
  vm.runInContext(code, c2);
  assert.match(c2.setup(), /ยังไม่มีผู้ดูแลระบบ.*creator@gmail\.com/);
  assert.equal(vm.runInContext("DB.all('Requests').length", c2), 4);
  assert.equal(vm.runInContext("DB.all('Users').filter(u => u.isTest !== 'true').length", c2), 0);
});

console.log(`\n${n} review-system tests passed`);
