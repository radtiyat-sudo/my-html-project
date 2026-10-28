/**
 * Code.gs — จุดเริ่มต้นของเว็บแอป และการติดตั้งครั้งแรก
 *
 * ติดตั้ง: เลือกฟังก์ชัน setup → ▶ เรียกใช้ → อนุญาตสิทธิ์
 *   - สร้างชีตทั้งหมด
 *   - ตั้งบัญชีของผู้รัน setup เป็น "ผู้ดูแลระบบ"
 *   - สร้างข้อมูลสาธิต (ข้อมูลสมมติทั้งหมด ไม่มีข้อมูลบุคคลจริง) และบัญชีทดสอบทุกบทบาท
 */

/** ▶ รันฟังก์ชันนี้จากตัวแก้ไข (เลือก setup ในรายการฟังก์ชันด้านบน) */
function setup() {
  ensureSchema_(true);
  const email = activeEmail_();
  const domain = allowedDomain_();
  let msg = 'ฐานข้อมูล: ' + getDb_().getUrl() + '\nเข้าสู่ระบบได้เฉพาะบัญชี @' + domain;
  // ผู้ดูแลคนแรก: จาก FIRST_ADMIN_EMAIL (หรือ Script Property) ถ้าไม่ระบุ ใช้ผู้รัน setup เฉพาะเมื่ออยู่ในโดเมนที่อนุญาต
  const configured = PropertiesService.getScriptProperties().getProperty('FIRST_ADMIN_EMAIL') || FIRST_ADMIN_EMAIL;
  const wanted = splitList_(String(configured || '').toLowerCase());
  if (!wanted.length && emailInDomain_(email)) wanted.push(email);
  CURRENT_USER_ = { id: 'setup', role: 'admin' };
  wanted.forEach(function (e) {
    if (!emailInDomain_(e)) { msg += '\nข้าม ' + e + ' — ไม่ใช่อีเมล @' + domain; return; }
    if (DB.all('Users').some(function (u) { return u.email.toLowerCase() === e && !toBool_(u.isTest); })) { msg += '\n' + e + ' มีในระบบแล้ว'; return; }
    DB.insert('Users', { email: e, name: 'ผู้ดูแลระบบ (' + e + ')', roles: 'admin,staff,reviewer,requester', units: '*', active: true, isTest: false });
    msg += '\nตั้ง ' + e + ' เป็นผู้ดูแลระบบแล้ว';
  });
  if (!DB.all('Users').some(function (u) { return !toBool_(u.isTest) && userHasRole_(u, 'admin'); })) {
    msg += '\n*** ยังไม่มีผู้ดูแลระบบ: ใส่อีเมล @' + domain + ' ใน FIRST_ADMIN_EMAIL (บรรทัดต้นไฟล์) แล้วรัน setup อีกครั้ง' +
      (email ? ' (บัญชีที่รัน setup คือ ' + email + ' ซึ่งไม่อยู่ในโดเมนนี้)' : '');
  }
  if (!DB.all('RequestTypes').length) { seedDemo_(); msg += '\nสร้างข้อมูลสาธิตและบัญชีทดสอบแล้ว (โหมดทดสอบเปิดอยู่ — ปิดได้ในหน้า ตั้งค่า)'; }
  CURRENT_USER_ = null;
  Logger.log(msg);
  return msg;
}

/** ▶ ตรวจว่ากุญแจ Scopus / WoS ใช้ได้หรือไม่ (ดูผลใน Execution log) */
function testScopus() {
  CURRENT_USER_ = { id: 'editor', role: 'admin' };
  try {
    const r = testApiKeys_();
    const msg = 'Scopus: ' + (r.scopus.ok ? 'ผ่าน — ' : 'ไม่ผ่าน — ') + r.scopus.message + '\nWeb of Science: ' + r.wos.message;
    Logger.log(msg);
    return msg;
  } finally { CURRENT_USER_ = null; }
}

function doGet() {
  // ไม่มีเส้นทางเปิดไฟล์ผ่าน URL — ไฟล์แนบเปิดได้ผ่าน api('downloadFile') ที่ตรวจสิทธิ์เท่านั้น
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP.name;
  return t.evaluate()
    .setTitle(APP.name)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/* ---------------- ข้อมูลสาธิต (สมมติทั้งหมด) ---------------- */

const DEMO_PDF_ = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 14 Tf 20 50 Td (DEMO FILE - NOT REAL) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

function demoPdfB64_() { return Utilities.base64Encode(Utilities.newBlob(DEMO_PDF_).getBytes()); }

/** ใช้ตอนสร้างข้อมูลสาธิตเท่านั้น: ทำงานในนามบัญชีทดสอบโดยไม่ผ่านการตรวจโดเมนของผู้รัน setup */
function asUser_(id, role) {
  const u = DB.get('Users', id);
  CURRENT_USER_ = { id: u.id, email: u.email, name: u.name, roles: splitList_(u.roles), role: role, units: splitList_(u.units), allUnits: splitList_(u.units).indexOf('*') > -1, isTest: true, signedInEmail: '' };
}

function seedDemo_() {
  CURRENT_USER_ = { id: 'seed', role: 'admin' };
  setSettings_({ TEST_MODE: 'true', MUHR_MODE: 'mock', MUREX_MODE: 'mock' });
  DB.insertMany('Units', [
    { code: 'FAC-A', name: 'คณะตัวอย่าง ก (สมมติ)', active: true },
    { code: 'FAC-B', name: 'คณะตัวอย่าง ข (สมมติ)', active: true }
  ]);
  const U = function (key, name, roles, units) { return { id: 'UT-' + key, email: key + '@example.test', name: name, roles: roles, units: units, active: true, isTest: true }; };
  DB.insertMany('Users', [
    U('REQ1', 'ผู้ยื่นทดสอบ ก', 'requester', 'FAC-A'),
    U('REQ2', 'ผู้ยื่นทดสอบ ข', 'requester', 'FAC-B'),
    U('STAFF1', 'เจ้าหน้าที่ทดสอบ ก', 'staff', 'FAC-A'),
    U('STAFF2', 'เจ้าหน้าที่ทดสอบ ข', 'staff', 'FAC-B'),
    U('REV1', 'ผู้พิจารณาทดสอบ ก', 'reviewer', 'FAC-A'),
    U('REV2', 'ผู้พิจารณาทดสอบ ข', 'reviewer', 'FAC-B'),
    U('ADMIN', 'ผู้ดูแลทดสอบ', 'admin', '*')
  ]);

  const now = nowIso_();
  const P = function (code, th, en, unit, rank, degree, status, extra) {
    return Object.assign({ origin: 'mock', staffCode: code, titleTh: '', firstNameTh: th[0], lastNameTh: th[1], firstNameEn: en[0], lastNameEn: en[1], formerNames: '', unit: unit, position: 'อาจารย์', academicRank: rank, highestDegree: degree, employmentStatus: status, fetchedAt: now, sourceUpdatedAt: now.slice(0, 10) }, extra || {});
  };
  DB.insertMany('Persons', [
    P('T0001', ['สมชาย', 'ทดสอบดี'], ['Somchai', 'Thotsobdee'], 'FAC-A', 'asst_prof', 'doctorate', 'active'),
    P('T0002', ['สมชาย', 'ทดสอบดี'], ['Somchai', 'Thotsobdee'], 'FAC-B', 'lecturer', 'master', 'active'),
    P('T0003', ['มาลี', 'ตัวอย่างงาม'], ['Malee', 'Tuayang-ngam'], 'FAC-A', 'assoc_prof', 'doctorate', 'active', { formerNames: 'มาลี สมมติสกุล|Malee Sommatisakul' }),
    P('T0004', ['วิชัย', 'จำลองศรี'], ['Wichai', 'Jamlongsri'], 'FAC-A', 'professor', 'doctorate', 'retired'),
    P('T0005', ['นภา', 'ข้อมูลเก่า'], ['Napa', 'Khomunkao'], 'FAC-B', 'lecturer', 'doctorate', 'active', { fetchedAt: '2024-01-15T09:00:00', sourceUpdatedAt: '2023-12-01' }),
    P('T0006', ['ปรีชา', 'ไม่ครบ'], ['Preecha', 'Maikhrop'], 'FAC-A', '', '', 'active')
  ]);
  const y = Number(now.slice(0, 4));
  const W = function (code, ref, title, type, year, venue, doi) { return { origin: 'mock', staffCode: code, workRef: ref, title: title + ' (ข้อมูลสมมติ)', type: type, year: String(year), authors: 'ผู้แต่งสมมติ', venue: venue, doi: doi, fetchedAt: now, sourceUpdatedAt: now.slice(0, 10) }; };
  DB.insertMany('SourceWorks', [
    W('T0001', 'MX-1001', 'Community Health Survey Methods', 'journal', y - 1, 'Journal of Sample Studies', '10.5555/demo.0001'),
    W('T0001', 'MX-1002', 'Community health survey methods', 'journal', y - 1, 'J. Sample Stud.', 'https://doi.org/10.5555/DEMO.0001'),
    W('T0001', 'MX-1003', 'Rural Clinic Data Linkage', 'proceeding', y - 2, 'Sample Conference on Health Data', ''),
    W('T0001', 'MX-1004', 'Early Work on Survey Weights', 'journal', y - 8, 'Journal of Sample Studies', '10.5555/demo.0004'),
    W('T0003', 'MX-2001', 'Ageing and Household Structure', 'journal', y - 1, 'Sample Population Review', '10.5555/demo.0101'),
    W('T0003', 'MX-2002', 'Long-term Care Financing', 'journal', y - 2, 'Sample Policy Journal', '10.5555/demo.0102'),
    W('T0003', 'MX-2003', 'Caregiver Time Use', 'proceeding', y - 3, 'Sample Conference on Ageing', ''),
    W('T0005', 'MX-3001', 'Migration and Schooling', 'journal', y - 2, 'Sample Education Review', '10.5555/demo.0201'),
    W('T0004', 'MX-4001', 'Demographic Transition Notes', 'book', y - 4, 'Sample University Press', '')
  ]);

  const demoRef = 'ไม่มี — เกณฑ์สมมติสำหรับทดสอบระบบเท่านั้น ห้ามใช้ตัดสินคำขอจริง';
  const t1 = DB.insert('RequestTypes', {
    code: 'DEMO-EXAMINER', name: '[สาธิต] เสนอชื่อกรรมการสอบวิทยานิพนธ์', description: 'ตัวอย่างประเภทคำขอเพื่อทดลองระบบ', personRole: 'กรรมการสอบ', active: true, isDemo: true,
    requiredDocs: JSON.stringify([
      { code: 'cv', label: 'ประวัติและผลงาน (CV)', when: 'always', hint: 'ไฟล์ PDF' },
      { code: 'consent', label: 'หนังสือตอบรับเป็นกรรมการ', when: 'person_not_in_source', hint: 'เฉพาะบุคคลภายนอก' }
    ])
  });
  const t2 = DB.insert('RequestTypes', {
    code: 'DEMO-FACULTY', name: '[สาธิต] ตรวจคุณสมบัติอาจารย์ประจำหลักสูตร', description: 'ตัวอย่างประเภทคำขอเพื่อทดลองระบบ', personRole: 'อาจารย์', active: true, isDemo: true,
    requiredDocs: JSON.stringify([{ code: 'cv', label: 'ประวัติและผลงาน (CV)', when: 'always', hint: 'ไฟล์ PDF' }])
  });
  const cs = function (code, type, name, rules) {
    return { code: code, typeId: type.id, name: name, version: '1', effectiveDate: now.slice(0, 10), referenceSource: demoRef, conditionsText: 'ค่าทุกข้อเป็นค่าสมมติเพื่อทดสอบการทำงานของระบบ', rules: JSON.stringify(rules), status: 'active', isDemo: true, confirmedBy: 'สำหรับสาธิต — ไม่มีผู้ยืนยัน', confirmedAt: now, createdBy: 'UT-ADMIN' };
  };
  DB.insertMany('CriteriaSets', [
    cs('CS-DEMO-EXAMINER', t1, '[สำหรับสาธิต] เกณฑ์ตัวอย่างกรรมการสอบ', [
      { id: 'R1', kind: 'identity_verified', label: 'ยืนยันตัวบุคคลแล้ว', params: {} },
      { id: 'R2', kind: 'min_degree', label: '[สาธิต] คุณวุฒิตามที่กำหนด (ค่าสมมติ: ปริญญาเอก)', params: { allowed: ['doctorate'] } },
      { id: 'R3', kind: 'min_works', label: '[สาธิต] ผลงานย้อนหลัง (ค่าสมมติ: 3 รายการใน 5 ปี)', params: { min: 3, years: 5, types: ['journal', 'proceeding'] } },
      { id: 'R4', kind: 'required_documents', label: 'มี CV', params: { docs: ['cv'] } },
      { id: 'R5', kind: 'manual', label: '[สาธิต] ไม่มีส่วนได้เสียกับผู้ถูกสอบ', params: { instruction: 'ตรวจจากหนังสือรับรอง/ข้อมูลประกอบ' } }
    ]),
    cs('CS-DEMO-FACULTY', t2, '[สำหรับสาธิต] เกณฑ์ตัวอย่างอาจารย์ประจำหลักสูตร', [
      { id: 'R1', kind: 'identity_verified', label: 'ยืนยันตัวบุคคลแล้ว', params: {} },
      { id: 'R2', kind: 'person_status', label: '[สาธิต] ยังปฏิบัติงานอยู่', params: { allowed: ['active'] } },
      { id: 'R3', kind: 'academic_rank', label: '[สาธิต] ตำแหน่งทางวิชาการ (ค่าสมมติ: ผศ. ขึ้นไป)', params: { allowed: ['asst_prof', 'assoc_prof', 'professor'] } },
      { id: 'R4', kind: 'min_works', label: '[สาธิต] ผลงานย้อนหลัง (ค่าสมมติ: 1 รายการใน 5 ปี)', params: { min: 1, years: 5, types: [] } },
      { id: 'R5', kind: 'required_documents', label: 'มี CV', params: { docs: ['cv'] } }
    ])
  ]);

  // คำขอตัวอย่างในสถานะต่าง ๆ — สร้างผ่านขั้นตอนจริงของระบบ
  try {
    asUser_('UT-REQ1', 'requester');
    let r = createRequest_({ typeId: t1.id, unit: 'FAC-A', purpose: 'ตัวอย่าง: เสนอชื่อกรรมการสอบวิทยานิพนธ์ (สมมติ)' });
    let hit = searchPersons_({ staffCode: 'T0003' }).results[0];
    setPerson_({ id: r.id, personId: hit.personId, staffCode: 'T0003' });
    addSourceWorks_({ id: r.id, workIds: sourceWorksFor_({ id: r.id }).works.map(function (w) { return w.id; }) });
    uploadFile_({ id: r.id, docType: 'cv', fileName: 'cv-demo.pdf', data: demoPdfB64_() });
    submit_({ id: r.id });
    asUser_('UT-STAFF1', 'staff');
    claim_({ id: r.id });
    DB.all('RequestWorks').filter(function (w) { return w.requestId === r.id; }).forEach(function (w) { verifyWork_({ workId: w.id, status: 'verified', note: 'ตรวจกับข้อมูลสมมติแล้ว' }); });
    setWorksComplete_({ id: r.id, value: true, note: 'ตรวจกับ MUREX (จำลอง) และ CV แล้ว' });
    staffCheck_({ id: r.id, ruleId: 'R5', result: 'pass', reason: 'ตัวอย่าง: ตรวจหนังสือรับรองแล้ว ไม่มีส่วนได้เสีย' });
    forward_({ id: r.id, reviewerId: 'UT-REV1', summary: 'ตัวอย่าง: ข้อมูลครบ ผลตรวจผ่านทุกข้อ' });
    asUser_('UT-REV1', 'reviewer');
    decide_({ id: r.id, decision: 'approve', reason: 'ตัวอย่าง: เห็นชอบตามผลตรวจ (คำขอสาธิต)' });
    asUser_('UT-STAFF1', 'staff');
    close_({ id: r.id });

    asUser_('UT-REQ1', 'requester');
    r = createRequest_({ typeId: t2.id, unit: 'FAC-A', purpose: 'ตัวอย่าง: ตรวจคุณสมบัติอาจารย์ (เลือกจากชื่อซึ่งมีชื่อซ้ำ)' });
    hit = searchPersons_({ name: 'สมชาย ทดสอบดี' }).results.filter(function (x) { return x.staffCode === 'T0001'; })[0];
    setPerson_({ id: r.id, personId: hit.personId, name: 'สมชาย ทดสอบดี' });
    addSourceWorks_({ id: r.id, workIds: sourceWorksFor_({ id: r.id }).works.map(function (w) { return w.id; }) });
    uploadFile_({ id: r.id, docType: 'cv', fileName: 'cv-old.pdf', data: demoPdfB64_() });
    submit_({ id: r.id });
    asUser_('UT-STAFF1', 'staff');
    claim_({ id: r.id });
    returnForRevision_({ id: r.id, items: [{ section: 'documents', message: 'ตัวอย่าง: CV เป็นฉบับเก่า กรุณาแนบฉบับปรับปรุงล่าสุด' }] });

    asUser_('UT-REQ2', 'requester');
    r = createRequest_({ typeId: t1.id, unit: 'FAC-B', purpose: 'ตัวอย่าง: บุคคลที่ข้อมูลต้นทางเก่า' });
    hit = searchPersons_({ staffCode: 'T0005' }).results[0];
    setPerson_({ id: r.id, personId: hit.personId, staffCode: 'T0005' });
    addSourceWorks_({ id: r.id, workIds: sourceWorksFor_({ id: r.id }).works.map(function (w) { return w.id; }) });
    uploadFile_({ id: r.id, docType: 'cv', fileName: 'cv.pdf', data: demoPdfB64_() });
    submit_({ id: r.id });

    asUser_('UT-REQ1', 'requester');
    r = createRequest_({ typeId: t1.id, unit: 'FAC-A', purpose: 'ตัวอย่าง: ร่างคำขอ กรรมการภายนอก' });
    setPerson_({ id: r.id, manual: { nameTh: 'กมล ภายนอกสมมติ', nameEn: 'Kamol Painok', affiliation: 'มหาวิทยาลัยสมมติ', academicRank: 'assoc_prof', highestDegree: 'doctorate', reason: 'บุคคลภายนอก' } });
    saveManualWork_({ id: r.id, work: { title: 'Sample External Paper (ข้อมูลสมมติ)', type: 'journal', year: y - 1, venue: 'Sample Journal' } });
  } finally {
    CURRENT_USER_ = null;
  }
}
