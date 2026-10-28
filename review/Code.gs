/**
 * ======================================================================
 *  ระบบตรวจสอบผลงานทางวิชาการและคุณสมบัติอาจารย์/กรรมการ
 *  ไฟล์: Code.gs  (วางทั้งไฟล์นี้ใน Apps Script ไฟล์ชื่อ "Code")
 *
 *  ส่วนต่าง ๆ ในไฟล์นี้: 1. Config  2. Code  3. Db  4. Auth  5. Connectors  6. ApiConnector  7. Matching  8. Scholar  9. Discovery  10. Sources  11. Criteria  12. Workflow  13. Files  14. Reports  15. Admin  16. Api
 *
 *  หลังวางครบ 3 ไฟล์ (Code.gs, Index.html, appsscript.json):
 *  เลือกฟังก์ชัน setup → กด ▶ เรียกใช้ → อนุญาตสิทธิ์ → Deploy เป็นเว็บแอป
 *  ห้ามใส่รหัสผ่าน/กุญแจเชื่อมต่อในไฟล์นี้ — ใช้ Script Properties เท่านั้น
 * ======================================================================
 */

/* ======================================================================
 * ส่วน: Config.gs
 * ====================================================================== */

/**
 * Config.gs — ค่าคงที่ของระบบตรวจสอบผลงานทางวิชาการและคุณสมบัติอาจารย์/กรรมการ (RV)
 *
 * ค่าที่ "ต้องยืนยันกับหน่วยงาน" ไม่ได้ฝังไว้ในโค้ด แต่อยู่ในหน้า ตั้งค่า (ชีต Settings) และ ชุดเกณฑ์ (ชีต CriteriaSets)
 * ห้ามใส่รหัสผ่าน/กุญแจเชื่อมต่อในไฟล์นี้ — ใช้ Script Properties เท่านั้น
 */

/**
 * ผู้ดูแลระบบคนแรก — ใส่อีเมล @mahidol.ac.th ของผู้ดูแลก่อนรัน setup (คั่นหลายคนด้วย ,)
 * ถ้าเว้นว่าง และผู้รัน setup ใช้บัญชี @mahidol.ac.th ระบบจะตั้งผู้รันเป็นผู้ดูแล
 * (ตั้งค่าแทนได้ใน การตั้งค่าโปรเจ็กต์ → พร็อพเพอร์ตี้ของสคริปต์ ชื่อ FIRST_ADMIN_EMAIL)
 */
const FIRST_ADMIN_EMAIL = '';

/**
 * กุญแจฐานข้อมูลวิชาการ (ตั้งค่าหลังบ้าน) — วางกุญแจระหว่างเครื่องหมาย ' '
 *  SCOPUS_API_KEY   : จาก https://dev.elsevier.com (ล็อกอินด้วยอีเมล @mahidol.ac.th)
 *  SCOPUS_INSTTOKEN : ขอจากหอสมุด (ใส่เมื่อทดสอบแล้วขึ้น 401/403)
 *  WOS_API_KEY      : Web of Science Starter API (ไม่บังคับ)
 * หลังวางแล้ว รันฟังก์ชัน testScopus เพื่อตรวจว่าเชื่อมต่อได้
 * อย่าแชร์ไฟล์นี้หรือส่งกุญแจในแชต/อีเมล — ผู้ที่แก้โปรเจ็กต์ Apps Script นี้ได้จะเห็นกุญแจ
 */
const API_KEYS_IN_CODE = {
  SCOPUS_API_KEY: '',
  SCOPUS_INSTTOKEN: '',
  WOS_API_KEY: ''
};

/** โดเมนอีเมลที่อนุญาตให้เข้าสู่ระบบ (แก้ได้ในหน้า ตั้งค่า) */
const DEFAULT_ALLOWED_DOMAIN = 'mahidol.ac.th';

const APP = {
  name: 'ระบบตรวจสอบผลงานทางวิชาการและคุณสมบัติอาจารย์/กรรมการ',
  short: 'ตรวจสอบผลงานและคุณสมบัติ',
  dbName: 'RV — ฐานข้อมูลระบบตรวจสอบผลงานและคุณสมบัติ',
  schemaVersion: 2
};

/** บทบาท — ผู้ใช้หนึ่งคนมีได้หลายบทบาท แต่ทำงานทีละบทบาท (เลือกจากเมนูผู้ใช้) */
const ROLES = {
  requester: { label: 'ผู้ยื่นเรื่อง', desc: 'สร้างคำขอ เลือกบุคคล รวบรวมผลงาน แนบหลักฐาน ติดตามสถานะ' },
  staff: { label: 'เจ้าหน้าที่', desc: 'ตรวจคำขอ ยืนยันตัวบุคคลและผลงาน ส่งกลับแก้ไข ส่งต่อผู้พิจารณา' },
  reviewer: { label: 'ผู้พิจารณา', desc: 'ดูผลตรวจและหลักฐาน บันทึกผลพิจารณาพร้อมเหตุผล' },
  admin: { label: 'ผู้ดูแลระบบ', desc: 'จัดการผู้ใช้ สิทธิ์ ชุดเกณฑ์ การนำเข้าและการเชื่อมต่อข้อมูล' }
};

/** สิทธิ์ → บทบาทที่ทำได้ (ตรวจที่ฝั่งเซิร์ฟเวอร์ทุกครั้งผ่าน requirePerm_) */
const PERMS = {
  'request.create': ['requester'],
  'request.edit': ['requester'],
  'queue.view': ['staff'],
  'request.review': ['staff'],
  'decision.make': ['reviewer'],
  'reports.view': ['staff', 'reviewer', 'admin'],
  'admin.users': ['admin'],
  'admin.criteria': ['admin'],
  'admin.data': ['admin'],
  'admin.settings': ['admin'],
  'audit.view': ['admin']
};

const TABLES = {
  Users: ['id', 'email', 'name', 'roles', 'units', 'active', 'isTest', 'createdAt', 'updatedAt'],
  Units: ['id', 'code', 'name', 'active'],
  Persons: ['id', 'origin', 'staffCode', 'titleTh', 'firstNameTh', 'lastNameTh', 'firstNameEn', 'lastNameEn', 'formerNames', 'unit', 'position', 'academicRank', 'highestDegree', 'employmentStatus', 'importBatchId', 'fetchedAt', 'sourceUpdatedAt', 'createdAt'],
  SourceWorks: ['id', 'origin', 'staffCode', 'workRef', 'title', 'type', 'year', 'pubDate', 'authors', 'venue', 'doi', 'ref', 'importBatchId', 'fetchedAt', 'sourceUpdatedAt', 'createdAt'],
  ImportBatches: ['id', 'source', 'fileName', 'status', 'rowCount', 'validCount', 'errorCount', 'sourceUpdatedAt', 'note', 'createdBy', 'createdAt', 'committedBy', 'committedAt'],
  ImportRows: ['id', 'batchId', 'rowNo', 'data', 'errors', 'action'],
  RequestTypes: ['id', 'code', 'name', 'description', 'personRole', 'requiredDocs', 'active', 'isDemo', 'createdAt', 'updatedAt'],
  CriteriaSets: ['id', 'code', 'typeId', 'name', 'version', 'effectiveDate', 'referenceSource', 'conditionsText', 'rules', 'status', 'isDemo', 'confirmedBy', 'confirmedAt', 'note', 'createdBy', 'createdAt', 'updatedAt'],
  Requests: ['id', 'code', 'typeId', 'title', 'purpose', 'note', 'unit', 'requesterId', 'status', 'round', 'personSnap', 'authorIds', 'identityStatus', 'identityBasis', 'identityNote', 'identityBy', 'identityAt', 'criteriaSetId', 'assigneeId', 'reviewerId', 'worksComplete', 'worksCompleteNote', 'staffSummary', 'isDemo', 'createdAt', 'updatedAt', 'submittedAt', 'decidedAt', 'closedAt', 'cancelledAt', 'cancelReason'],
  RequestWorks: ['id', 'requestId', 'origin', 'sourceWorkId', 'title', 'type', 'year', 'pubDate', 'authors', 'venue', 'doi', 'ref', 'evidenceId', 'status', 'staffNote', 'addedBy', 'addedRound', 'createdAt', 'updatedAt',
    'database', 'dbGroup', 'quartile', 'quartileSource', 'proof', 'foundIn', 'links', 'dbEvidence', 'checkedAt'],
  JournalIndex: ['issn', 'title', 'database', 'quartile', 'source', 'updatedAt'],
  DupPairs: ['id', 'requestId', 'workA', 'workB', 'basis', 'score', 'status', 'keepWorkId', 'note', 'resolvedBy', 'resolvedAt', 'createdAt'],
  Attachments: ['id', 'requestId', 'workId', 'docType', 'fileName', 'mime', 'size', 'storageId', 'status', 'uploadedBy', 'uploadedAt', 'removedBy', 'removedAt'],
  RevisionItems: ['id', 'requestId', 'round', 'section', 'workId', 'message', 'status', 'response', 'createdBy', 'createdAt', 'addressedAt', 'closedBy', 'closedAt'],
  StaffChecks: ['id', 'requestId', 'criteriaSetId', 'ruleId', 'result', 'reason', 'by', 'at'],
  Evaluations: ['id', 'requestId', 'round', 'criteriaSetId', 'criteriaCode', 'criteriaVersion', 'isDemo', 'overall', 'items', 'snapshot', 'snapshotHash', 'sourceStatus', 'trigger', 'reason', 'by', 'at'],
  Decisions: ['id', 'requestId', 'evaluationId', 'decision', 'reason', 'isDemo', 'by', 'at'],
  StatusHistory: ['id', 'requestId', 'fromStatus', 'toStatus', 'round', 'by', 'byRole', 'note', 'at'],
  Notifications: ['id', 'userId', 'requestId', 'message', 'createdAt', 'readAt'],
  Audit: ['id', 'at', 'userId', 'role', 'action', 'entity', 'entityId', 'fields', 'reason'],
  Settings: ['key', 'value']
};

const ID_PREFIX = {
  Users: 'U', Units: 'UN', Persons: 'P', SourceWorks: 'SW', ImportBatches: 'IB', ImportRows: 'IR', RequestTypes: 'T', CriteriaSets: 'CS',
  Requests: 'R', RequestWorks: 'W', DupPairs: 'D', Attachments: 'F', RevisionItems: 'RI', StaffChecks: 'SC', Evaluations: 'E', Decisions: 'DC',
  StatusHistory: 'H', Notifications: 'N', Audit: 'A'
};

/** ค่าตั้งต้น — ทุกค่าแก้ได้ในหน้า "ตั้งค่า" (ค่าที่มี * ต้องยืนยันกับหน่วยงานก่อนใช้จริง) */
const DEFAULT_SETTINGS = {
  ORG_NAME: 'หน่วยงาน (ยังไม่ได้ตั้งค่า)',
  ALLOWED_DOMAIN: DEFAULT_ALLOWED_DOMAIN,
  AUTO_REGISTER: 'true',
  SIMPLE_MODE: 'true',
  TEST_MODE: 'true',
  MUHR_MODE: 'mock',
  MUREX_MODE: 'mock',
  SIM_OUTAGE_MUHR: 'false',
  SIM_OUTAGE_MUREX: 'false',
  STALE_DAYS: '180',
  MAX_FILE_MB: '10',
  ALLOWED_EXT: 'pdf,png,jpg,jpeg',
  EXTERNAL_NOTIFY: 'off',
  OPENALEX_MAILTO: '',
  SCHOLAR_AFFIL: 'Mahidol University',
  MUHR_API: '',
  MUREX_API: ''
};

/** ค่าที่ยังต้องยืนยันกับหน่วยงาน — แสดงในหน้าตั้งค่าเพื่อไม่ให้ลืม */
const TO_CONFIRM = {
  STALE_DAYS: 'จำนวนวันที่ถือว่าข้อมูลจากระบบต้นทาง "เก่า" ต้องยืนยันกับเจ้าของข้อมูล',
  MAX_FILE_MB: 'ขนาดไฟล์สูงสุดที่ยอมรับ (Apps Script รับได้ไม่เกินประมาณ 50 MB ต่อครั้ง)',
  ALLOWED_EXT: 'ชนิดไฟล์ที่ยอมรับ (ระบบตรวจเนื้อไฟล์จริงสำหรับ pdf, png, jpg)'
};

const STATUSES = {
  draft: { label: 'ร่าง', holder: 'requester', next: 'กรอกข้อมูลให้ครบแล้วกด "ยื่นคำขอ"' },
  submitted: { label: 'ยื่นแล้ว รอเจ้าหน้าที่รับเรื่อง', holder: 'staff', next: 'เจ้าหน้าที่รับเรื่องเพื่อตรวจ' },
  in_review: { label: 'เจ้าหน้าที่กำลังตรวจ', holder: 'staff', next: 'เจ้าหน้าที่ตรวจยืนยันข้อมูล แล้วส่งกลับแก้ไขหรือส่งต่อผู้พิจารณา' },
  returned: { label: 'ส่งกลับให้แก้ไข', holder: 'requester', next: 'แก้ไขตามรายการที่เจ้าหน้าที่ระบุ แล้วยื่นใหม่' },
  pending_decision: { label: 'รอผู้พิจารณา', holder: 'reviewer', next: 'ผู้พิจารณาบันทึกผลพร้อมเหตุผล' },
  decided: { label: 'พิจารณาแล้ว รอแจ้งผล', holder: 'staff', next: 'เจ้าหน้าที่แจ้งผลและปิดงาน' },
  closed: { label: 'ปิดงานแล้ว', holder: '', next: 'เสร็จสิ้น' },
  cancelled: { label: 'ยกเลิกแล้ว', holder: '', next: 'คำขอถูกยกเลิก (ข้อมูลยังเก็บไว้)' }
};
const OPEN_STATUSES = ['submitted', 'in_review', 'returned', 'pending_decision', 'decided'];

const SECTIONS = { info: 'ข้อมูลคำขอ', person: 'ข้อมูลบุคคล', works: 'รายการผลงาน', documents: 'เอกสารแนบ' };

const WORK_TYPES = {
  journal: 'บทความวารสาร', proceeding: 'บทความในการประชุมวิชาการ', book: 'หนังสือ/ตำรา', chapter: 'บทในหนังสือ',
  patent: 'สิทธิบัตร/อนุสิทธิบัตร', report: 'รายงานวิจัย', other: 'อื่น ๆ'
};
const DEGREES = { doctorate: 'ปริญญาเอก', master: 'ปริญญาโท', bachelor: 'ปริญญาตรี' };
const RANKS = { professor: 'ศาสตราจารย์', assoc_prof: 'รองศาสตราจารย์', asst_prof: 'ผู้ช่วยศาสตราจารย์', lecturer: 'อาจารย์', none: 'ไม่มีตำแหน่งทางวิชาการ' };
const EMP_STATUS = { active: 'ปฏิบัติงานอยู่', retired: 'เกษียณ', resigned: 'ลาออก', external: 'บุคคลภายนอก' };

/** ชนิดกฎที่ระบบตรวจได้ — ระบบมีแค่ "วิธีตรวจ" ส่วนค่าเกณฑ์จริงผู้ดูแลต้องกรอกตามประกาศที่ยืนยันแล้ว */
const RULE_KINDS = {
  identity_verified: { label: 'ยืนยันตัวบุคคลแล้ว', params: [] },
  person_status: { label: 'สถานะบุคลากร', params: ['allowed'] },
  min_degree: { label: 'คุณวุฒิ', params: ['allowed'] },
  academic_rank: { label: 'ตำแหน่งทางวิชาการ', params: ['allowed'] },
  min_works: { label: 'จำนวนผลงาน', params: ['min', 'years', 'types', 'databases', 'quartiles'] },
  required_documents: { label: 'เอกสารครบ', params: ['docs'] },
  manual: { label: 'ให้เจ้าหน้าที่พิจารณา', params: ['instruction'] }
};

const RESULT_LABEL = { pass: 'ผ่าน', fail: 'ไม่ผ่าน', inconclusive: 'ยังสรุปไม่ได้' };
const DECISION_LABEL = { approve: 'อนุมัติ/เห็นชอบ', reject: 'ไม่อนุมัติ/ไม่เห็นชอบ', return_to_staff: 'ส่งกลับเจ้าหน้าที่' };

/** ไฟล์ที่ยอมรับ: นามสกุล → ชนิด และไบต์แรกของไฟล์ (ตรวจเนื้อไฟล์จริง ไม่เชื่อแค่ชื่อไฟล์) */
const FILE_TYPES = {
  pdf: { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  png: { mime: 'image/png', magic: [0x89, 0x50, 0x4E, 0x47] },
  jpg: { mime: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF] },
  jpeg: { mime: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF] }
};

/** แหล่งข้อมูลภายนอก — ชั้นเชื่อมต่อแยกจากตรรกะหลัก */
const SOURCES = {
  MUHR: { label: 'MUHR', desc: 'ข้อมูลตัวบุคคล หน่วยงาน สถานะ', table: 'Persons' },
  MUREX: { label: 'MUREX', desc: 'ข้อมูลผลงาน', table: 'SourceWorks' }
};
const SOURCE_MODES = {
  mock: 'ข้อมูลจำลอง (ไม่ใช่ข้อมูลจริง)',
  import: 'นำเข้าจากไฟล์ CSV',
  api: 'เชื่อมต่อ API ของระบบจริง (ต้องตั้งค่าและทดสอบผ่านก่อน)'
};

/** คอลัมน์ CSV ที่รับ (แถวแรกต้องเป็นชื่อคอลัมน์ตามนี้) */
const IMPORT_COLUMNS = {
  MUHR: { required: ['staffCode', 'firstNameTh', 'lastNameTh'], optional: ['titleTh', 'firstNameEn', 'lastNameEn', 'formerNames', 'unit', 'position', 'academicRank', 'highestDegree', 'employmentStatus', 'sourceUpdatedAt'] },
  MUREX: { required: ['staffCode', 'title', 'year'], optional: ['workRef', 'type', 'pubDate', 'authors', 'venue', 'doi', 'ref', 'sourceUpdatedAt'] }
};


/* ======================================================================
 * ส่วน: Code.gs
 * ====================================================================== */

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

/** ▶ ตรวจการเชื่อมต่อฐานข้อมูลทั้งหมด (รันครั้งแรกจะขออนุญาตสิทธิ์ "เชื่อมต่อบริการภายนอก") — ดูผลใน Execution log */
function testConnection() {
  const lines = [];
  const tryFetch = function (label, url) {
    try {
      const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      lines.push(label + ': ' + (r.getResponseCode() < 400 ? 'เชื่อมต่อได้' : 'ตอบกลับรหัส ' + r.getResponseCode()));
    } catch (e) { lines.push(label + ': ไม่ได้ — ' + explainFetchError_(e.message)); }
  };
  tryFetch('OpenAlex', 'https://api.openalex.org/works?per_page=1');
  tryFetch('PubMed', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=mahidol&retmax=1&retmode=json');
  tryFetch('ERIC', 'https://api.ies.ed.gov/eric/?search=thailand&rows=1&format=json');
  tryFetch('Crossref', 'https://api.crossref.org/works?rows=1');
  lines.push(testScopus());
  const msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}

/** ▶ ตรวจว่ากุญแจ Scopus / WoS ใช้ได้หรือไม่ (ดูผลใน Execution log) */
function testScopus() {
  CURRENT_USER_ = { id: 'editor', role: 'admin' };
  try {
    const r = testApiKeys_();
    const msg = 'Scopus: ' + (r.scopus.ok ? 'ผ่าน — ' : 'ไม่ผ่าน — ') + explainFetchError_(r.scopus.message) + '\nWeb of Science: ' + r.wos.message;
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


/* ======================================================================
 * ส่วน: Db.gs
 * ====================================================================== */

/**
 * Db.gs — ชั้นจัดการข้อมูลบน Google Sheets (โครงเดียวกับระบบ MUGR) (1 ชีต = 1 ตาราง, แถวแรกเป็นหัวคอลัมน์)
 */

let SS_ = null;
const TABLE_CACHE_ = {};

const NO_DB_ACCESS_ = 'บัญชีนี้ไม่มีสิทธิ์เปิดไฟล์ฐานข้อมูล (Google Sheets) ของระบบ\n' +
  'วิธีแก้ (ผู้ดูแลระบบ): Deploy แบบ "ดำเนินการในฐานะ: ฉัน" + "ผู้มีสิทธิ์เข้าถึง: ทุกคนในมหาวิทยาลัยมหิดล" (แนะนำ) ' +
  'หรือถ้าใช้ "ผู้ใช้ที่เข้าถึงเว็บแอป" ต้องแชร์ไฟล์ Google Sheets ให้บัญชีนี้เป็น "ผู้แก้ไข"';

/**
 * คืนค่า Spreadsheet ที่ใช้เก็บข้อมูล — ใช้ไฟล์ที่ผูกกับสคริปต์ก่อนเสมอ
 * (ไม่สร้างไฟล์ใหม่เมื่อเปิดไม่ได้ เพื่อไม่ให้ข้อมูลแยกไปอยู่คนละไฟล์)
 */
function getDb_() {
  if (SS_) return SS_;
  const props = PropertiesService.getScriptProperties();
  let active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
  if (active) {
    try { active.getId(); } catch (e) { throw new Error(NO_DB_ACCESS_); }
    SS_ = active;
    if (props.getProperty('DB_ID') !== SS_.getId()) props.setProperty('DB_ID', SS_.getId());
    return SS_;
  }
  const id = props.getProperty('DB_ID');
  if (id) {
    try { SS_ = SpreadsheetApp.openById(id); return SS_; }
    catch (e) { throw new Error(NO_DB_ACCESS_ + '\n(' + e.message + ')'); }
  }
  SS_ = SpreadsheetApp.create(APP.dbName);
  props.setProperty('DB_ID', SS_.getId());
  return SS_;
}

/** สร้างชีตและหัวคอลัมน์ที่ขาด (ทำครั้งเดียวต่อ schemaVersion) */
function ensureSchema_(force) {
  const props = PropertiesService.getScriptProperties();
  const key = 'SCHEMA_' + getDb_().getId();
  if (!force && props.getProperty(key) === String(APP.schemaVersion)) return;
  const ss = getDb_();
  Object.keys(TABLES).forEach(function (name) {
    const cols = TABLES[name];
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), Math.max(sh.getMaxColumns(), cols.length)).setNumberFormat('@');
    }
    const lastCol = sh.getLastColumn();
    const header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const missing = cols.filter(function (c) { return header.indexOf(c) === -1; });
    if (missing.length) {
      const start = header.filter(String).length + 1;
      sh.getRange(1, start, 1, missing.length).setValues([missing]);
      sh.getRange(1, 1, 1, start + missing.length - 1).setFontWeight('bold').setBackground('#e8edf8');
      sh.setFrozenRows(1);
    }
  });
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  props.setProperty(key, String(APP.schemaVersion));
}

function sheet_(name) {
  const sh = getDb_().getSheetByName(name);
  if (!sh) { ensureSchema_(true); return getDb_().getSheetByName(name); }
  return sh;
}

function cellOut_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss");
  return v;
}

function cellIn_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.join(',');
  return String(v);
}

const DB = {
  /** อ่านทั้งตาราง → [{...}] พร้อม _row (เลขแถวในชีต) */
  read_: function (name) {
    if (TABLE_CACHE_[name]) return TABLE_CACHE_[name];
    const sh = sheet_(name);
    const values = sh.getDataRange().getValues();
    const header = (values[0] || []).map(String);
    const rows = [];
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (r.every(function (c) { return c === '' || c === null; })) continue;
      const o = { _row: i + 1 };
      header.forEach(function (h, j) { if (h) o[h] = cellOut_(r[j]); });
      rows.push(o);
    }
    TABLE_CACHE_[name] = { header: header, rows: rows };
    return TABLE_CACHE_[name];
  },

  invalidate_: function (name) { delete TABLE_CACHE_[name]; },

  all: function (name) {
    return this.read_(name).rows.map(function (r) {
      const o = Object.assign({}, r); delete o._row; return o;
    });
  },

  get: function (name, id) {
    return this.all(name).filter(function (r) { return String(r.id) === String(id); })[0] || null;
  },

  insert: function (name, obj) {
    const t = this.read_(name);
    const rec = Object.assign({}, obj);
    if (TABLES[name][0] === 'id' && !rec.id) rec.id = newId_(name);
    if (TABLES[name].indexOf('createdAt') > -1 && !rec.createdAt) rec.createdAt = nowIso_();
    sheet_(name).appendRow(t.header.map(function (h) { return cellIn_(rec[h]); }));
    this.invalidate_(name);
    return rec;
  },

  /** เพิ่มหลายแถวพร้อมกัน (เร็วกว่า appendRow ทีละแถว) */
  insertMany: function (name, list) {
    if (!list.length) return [];
    const t = this.read_(name);
    const sh = sheet_(name);
    const recs = list.map(function (obj) {
      const rec = Object.assign({}, obj);
      if (TABLES[name][0] === 'id' && !rec.id) rec.id = newId_(name);
      if (TABLES[name].indexOf('createdAt') > -1 && !rec.createdAt) rec.createdAt = nowIso_();
      return rec;
    });
    const start = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(start, 1, recs.length, t.header.length)
      .setValues(recs.map(function (rec) { return t.header.map(function (h) { return cellIn_(rec[h]); }); }));
    this.invalidate_(name);
    return recs;
  },

  update: function (name, id, patch) {
    const t = this.read_(name);
    const row = t.rows.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) throw new Error('ไม่พบข้อมูล (' + name + ' ' + id + ')');
    const rec = Object.assign({}, row, patch, { id: row.id });
    if (TABLES[name].indexOf('updatedAt') > -1) rec.updatedAt = nowIso_();
    sheet_(name).getRange(row._row, 1, 1, t.header.length)
      .setValues([t.header.map(function (h) { return cellIn_(rec[h]); })]);
    this.invalidate_(name);
    delete rec._row;
    return rec;
  },

  remove: function (name, id) {
    const row = this.read_(name).rows.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return false;
    sheet_(name).deleteRow(row._row);
    this.invalidate_(name);
    return true;
  },

  /** ลบทุกแถวที่ pred คืนค่า true (เขียนทับทั้งตารางครั้งเดียว) */
  removeWhere: function (name, pred) {
    const t = this.read_(name);
    const keep = t.rows.filter(function (r) { return !pred(r); });
    const removed = t.rows.length - keep.length;
    if (!removed) return 0;
    const sh = sheet_(name);
    const width = t.header.length;
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent();
    if (keep.length) {
      sh.getRange(2, 1, keep.length, width)
        .setValues(keep.map(function (r) { return t.header.map(function (h) { return cellIn_(r[h]); }); }));
    }
    this.invalidate_(name);
    return removed;
  }
};


/* ---------------- Settings ---------------- */

function getSettings_() {
  const s = Object.assign({}, DEFAULT_SETTINGS);
  DB.all('Settings').forEach(function (r) { if (r.key) s[r.key] = String(r.value); });
  return s;
}

function setting_(k) { return getSettings_()[k]; }

function setSettings_(patch) {
  const t = DB.read_('Settings');
  const sh = sheet_('Settings');
  Object.keys(patch).forEach(function (k) {
    const row = t.rows.filter(function (r) { return r.key === k; })[0];
    if (row) sh.getRange(row._row, 2).setValue(cellIn_(patch[k]));
    else sh.appendRow([k, cellIn_(patch[k])]);
  });
  DB.invalidate_('Settings');
}

/* ---------------- Audit ----------------
 * บันทึกว่าใคร ทำอะไร เมื่อไร กับรายการใด ฟิลด์ใดเปลี่ยน และเหตุผล
 * เก็บเฉพาะ "ชื่อฟิลด์" ไม่เก็บค่าข้อมูลส่วนบุคคลลง log (ยกเว้นค่าสถานะที่ไม่ใช่ข้อมูลส่วนบุคคล)
 */
const AUDIT_VALUE_FIELDS_ = ['status', 'decision', 'result', 'version', 'mode', 'active', 'roles', 'units', 'identityStatus', 'worksComplete'];

function audit_(action, entity, entityId, fields, reason) {
  try {
    const u = CURRENT_USER_ || {};
    let f = '';
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      f = Object.keys(fields).map(function (k) {
        return AUDIT_VALUE_FIELDS_.indexOf(k) > -1 ? k + '=' + String(fields[k]).slice(0, 60) : k;
      }).join(', ');
    } else if (Array.isArray(fields)) f = fields.join(', ');
    else f = String(fields || '');
    DB.insert('Audit', { at: nowIso_(), userId: u.id || '', role: u.role || '', action: action, entity: entity || '', entityId: entityId || '', fields: f.slice(0, 400), reason: String(reason || '').slice(0, 300) });
  } catch (e) { /* ไม่ให้การบันทึก log ทำให้งานหลักล้ม */ }
}

/* ---------------- Utils ---------------- */

function newId_(name) {
  return (ID_PREFIX[name] || 'X') + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss");
}

function toBool_(v) { return v === true || String(v).toLowerCase() === 'true' || v === 1 || v === '1'; }

function splitList_(v) {
  return String(v || '').split(/[,|]/).map(function (s) { return s.trim(); }).filter(String);
}

function parseJson_(v, def) {
  if (v === undefined || v === null || v === '') return def;
  try { return JSON.parse(v); } catch (e) { return def; }
}

function daysBetween_(a, b) {
  const da = new Date(a), db = new Date(b || nowIso_());
  if (isNaN(da) || isNaN(db)) return null;
  return (db.getTime() - da.getTime()) / 86400000;
}

function clean_(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 500); }


/* ======================================================================
 * ส่วน: Auth.gs
 * ====================================================================== */

/**
 * Auth.gs — ผู้ใช้ บทบาท ขอบเขตงาน และการตรวจสิทธิ์ (ทำที่ฝั่งเซิร์ฟเวอร์ทุกครั้ง)
 *
 * การเข้าสู่ระบบ: ใช้บัญชี Google ของผู้ใช้ (Session.getActiveUser) จับคู่กับชีต Users
 * เข้าได้เฉพาะบัญชีในโดเมนที่อนุญาต (ค่าเริ่มต้น @mahidol.ac.th) — รวมถึงตอนใช้บัญชีทดสอบ
 * โหมดทดสอบ (TEST_MODE=true): เลือกเข้าใช้เป็น "บัญชีทดสอบ" ได้ เพื่อทดลองทุกบทบาท — ต้องปิดก่อนใช้งานจริง
 */

function allowedDomain_() { return String(setting_('ALLOWED_DOMAIN') || '').trim().toLowerCase().replace(/^@/, ''); }

function emailInDomain_(email) {
  const d = allowedDomain_();
  const e = String(email || '').toLowerCase();
  return !!e && (!d || e.slice(-(d.length + 1)) === '@' + d);
}

let CURRENT_USER_ = null;

function activeEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}

/** อ่านผู้ใช้ของคำขอนี้ — p._as (บัญชีทดสอบ) และ p._role (บทบาทที่กำลังใช้) มาจากหน้าเว็บ แต่ถูกตรวจซ้ำที่นี่เสมอ */
function resolveUser_(p) {
  p = p || {};
  CURRENT_USER_ = null;
  const email = activeEmail_();
  const testMode = toBool_(setting_('TEST_MODE'));
  if (!emailInDomain_(email)) return { email: email, user: null, testMode: testMode, domainBlocked: true, domain: allowedDomain_() };
  let rec = null;
  if (p._as) {
    if (!testMode) throw new Error('ปิดโหมดทดสอบแล้ว กรุณาเข้าใช้ด้วยบัญชีจริง (โหลดหน้าใหม่)');
    rec = DB.get('Users', p._as);
    if (!rec || !toBool_(rec.isTest)) throw new Error('ไม่พบบัญชีทดสอบนี้');
  } else if (email) {
    rec = DB.all('Users').filter(function (u) { return String(u.email).toLowerCase() === email && !toBool_(u.isTest); })[0] || null;
    if (!rec && toBool_(setting_('AUTO_REGISTER'))) rec = autoRegister_(email);
  }
  if (!rec) return { email: email, user: null, testMode: testMode };
  if (!toBool_(rec.active)) throw new Error('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  const roles = splitList_(rec.roles).filter(function (r) { return ROLES[r]; });
  if (!roles.length) throw new Error('บัญชีนี้ยังไม่ได้รับบทบาท กรุณาติดต่อผู้ดูแลระบบ');
  const role = roles.indexOf(p._role) > -1 ? p._role : roles[0];
  const units = splitList_(rec.units);
  CURRENT_USER_ = {
    id: rec.id, email: rec.email, name: rec.name, roles: roles, role: role, units: units,
    allUnits: units.indexOf('*') > -1, isTest: toBool_(rec.isTest), signedInAs: email
  };
  return { email: email, user: CURRENT_USER_, testMode: testMode };
}

/** ทุกคนในโดเมนที่อนุญาตเข้าใช้ได้ทันทีในบทบาท "ผู้ยื่นเรื่อง" — บทบาทอื่นผู้ดูแลเป็นผู้กำหนด */
function autoRegister_(email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    DB.invalidate_('Users');
    const again = DB.all('Users').filter(function (u) { return String(u.email).toLowerCase() === email && !toBool_(u.isTest); })[0];
    if (again) return again;
    const rec = DB.insert('Users', { email: email, name: email.split('@')[0], roles: 'requester', units: '*', active: true, isTest: false });
    CURRENT_USER_ = { id: rec.id, role: 'requester' };
    audit_('user.autoRegister', 'Users', rec.id, { roles: 'requester' }, 'เข้าใช้ครั้งแรก');
    CURRENT_USER_ = null;
    return rec;
  } finally { lock.releaseLock(); }
}

function me_() {
  if (!CURRENT_USER_) throw new Error('กรุณาเข้าสู่ระบบ');
  return CURRENT_USER_;
}

function can_(perm) {
  const u = CURRENT_USER_;
  return !!(u && PERMS[perm] && PERMS[perm].indexOf(u.role) > -1);
}

function requirePerm_(perm) {
  if (!can_(perm)) throw new Error('ไม่มีสิทธิ์ทำรายการนี้ (บทบาทปัจจุบัน: ' + (CURRENT_USER_ ? ROLES[CURRENT_USER_.role].label : 'ไม่ได้เข้าสู่ระบบ') + ')');
}

function inScope_(unit, user) {
  const u = user || CURRENT_USER_;
  if (!u) return false;
  return u.allUnits || u.units.indexOf(String(unit)) > -1;
}

/** ผู้ใช้ปัจจุบันเห็นคำขอนี้ได้หรือไม่ — ตามบทบาทและขอบเขตงาน */
function canViewRequest_(req) {
  const u = CURRENT_USER_;
  if (!u || !req) return false;
  switch (u.role) {
    case 'admin': return true;
    case 'requester': return req.requesterId === u.id;
    case 'staff': return req.status !== 'draft' && inScope_(req.unit, u);
    case 'reviewer': return req.reviewerId === u.id;
    default: return false;
  }
}

function loadRequestFor_(id) {
  const req = DB.get('Requests', id);
  if (!req || !canViewRequest_(req)) throw new Error('ไม่พบคำขอ หรือไม่มีสิทธิ์เข้าถึงคำขอนี้');
  return req;
}

function userRec_(id) { return DB.get('Users', id); }

function userName_(id) {
  if (!id) return '';
  const u = USER_NAME_CACHE_[id] || DB.get('Users', id);
  if (!u) return '(ผู้ใช้ที่ถูกลบ)';
  USER_NAME_CACHE_[id] = u;
  return u.name;
}
const USER_NAME_CACHE_ = {};

function userHasRole_(u, role) { return splitList_(u.roles).indexOf(role) > -1; }

/** ผู้ใช้ที่มีบทบาท role และรับผิดชอบหน่วยงาน unit (ใช้หาเจ้าหน้าที่/ผู้พิจารณาที่มอบหมายได้) */
function usersFor_(role, unit, isTestPool) {
  return DB.all('Users').filter(function (u) {
    if (!toBool_(u.active) || !userHasRole_(u, role)) return false;
    if (isTestPool !== undefined && toBool_(u.isTest) !== !!isTestPool) return false;
    const units = splitList_(u.units);
    return units.indexOf('*') > -1 || units.indexOf(String(unit)) > -1;
  });
}


/* ======================================================================
 * ส่วน: Connectors.gs
 * ====================================================================== */

/**
 * Connectors.gs — ชั้นเชื่อมต่อแหล่งข้อมูล MUHR (บุคคล) และ MUREX (ผลงาน)
 *
 * โหมด:
 *   mock   = ข้อมูลจำลองที่ระบบสร้างให้ (ไม่ใช่ข้อมูลจริง)
 *   import = ข้อมูลที่ผู้ดูแลนำเข้าจากไฟล์ CSV (ผ่านหน้าตรวจทานก่อนบันทึก)
 *   api    = เรียก API ของระบบจริง (ดู ApiConnector.gs) — ใช้ได้เมื่อตั้งค่าและ "ทดสอบการเชื่อมต่อ" ผ่านแล้วเท่านั้น
 */

function sourceMode_(src) {
  const m = setting_(src + '_MODE');
  return SOURCE_MODES[m] ? m : 'mock';
}

function sourceError_(src, code, msg) {
  const e = new Error(msg);
  e.sourceError = { source: src, code: code };
  return e;
}

/** ตรวจว่าแหล่งข้อมูลพร้อมใช้งานหรือไม่ — คืนโหมด หรือโยนข้อผิดพลาดที่ระบุชัดว่าเป็นปัญหาของแหล่งข้อมูล */
function sourceReady_(src) {
  const mode = sourceMode_(src);
  if (toBool_(setting_('SIM_OUTAGE_' + src))) {
    throw sourceError_(src, 'outage', 'ระบบต้นทาง ' + src + ' ขัดข้อง/ติดต่อไม่ได้ในขณะนี้ — ข้อมูลที่ต้องใช้จากระบบนี้จะถูกสรุปว่า "ยังสรุปไม่ได้" ไม่ใช่ "ไม่ผ่าน"');
  }
  if (mode === 'api' && !apiConnected_(src)) {
    throw sourceError_(src, 'not_connected', 'ยังไม่ได้เชื่อมต่อ API ของ ' + src + ' (ยังไม่ได้ตั้งค่า หรือยังไม่ผ่านการทดสอบ) — กรอกข้อมูลให้เจ้าหน้าที่ตรวจแทนได้');
  }
  return mode;
}

/** สถานะแหล่งข้อมูล ไม่พยายามติดต่อจริง และไม่อ้างว่าเชื่อมต่อแล้ว */
function sourceStatus_(src) {
  const mode = sourceMode_(src);
  const outage = toBool_(setting_('SIM_OUTAGE_' + src));
  const rows = DB.all(SOURCES[src].table).filter(function (r) { return r.origin === mode; });
  const batches = DB.all('ImportBatches').filter(function (b) { return b.source === src && b.status === 'committed'; });
  const last = batches[batches.length - 1] || null;
  const connected = mode === 'api' && apiConnected_(src);
  const test = apiLastTest_(src);
  let available = !outage && (mode !== 'api' || connected);
  let message = mode === 'mock' ? 'ใช้ข้อมูลจำลองเพื่อทดสอบ — ไม่ใช่ข้อมูลจริงจาก ' + src
    : mode === 'import' ? (last ? 'ใช้ข้อมูลที่นำเข้าเมื่อ ' + last.committedAt + ' (ไม่ได้ดึงสดจาก ' + src + ')' : 'ยังไม่มีข้อมูลนำเข้า')
      : connected ? 'ดึงข้อมูลสดจาก ' + src + ' ผ่าน API (ทดสอบผ่านเมื่อ ' + test.at + ')' : 'ยังไม่ได้เชื่อมต่อ API ของ ' + src + (test && !test.ok ? ' — ทดสอบล่าสุดไม่ผ่าน: ' + test.message : ' — ต้องตั้งค่าและทดสอบในหน้า แหล่งข้อมูล');
  if (outage) message = 'จำลองสถานการณ์ระบบต้นทางขัดข้อง (ตั้งค่าโดยผู้ดูแล)';
  return {
    source: src, label: SOURCES[src].label, desc: SOURCES[src].desc, mode: mode, modeLabel: SOURCE_MODES[mode],
    connected: connected, connectedLabel: connected ? 'เชื่อมต่อระบบจริงแล้ว (ผ่าน API)' : 'ยังไม่ได้เชื่อมต่อระบบจริง', available: available, outage: outage, message: message,
    records: rows.length, lastImport: last ? { at: last.committedAt, fileName: last.fileName, sourceUpdatedAt: last.sourceUpdatedAt, rows: last.validCount } : null
  };
}

function sourceRows_(src) {
  const mode = sourceReady_(src);
  return DB.all(SOURCES[src].table).filter(function (r) { return r.origin === mode; });
}

/** MUHR: หาบุคคลจากรหัสบุคลากร (คืน null ถ้าไม่พบ) */
function muhrByCode_(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  if (sourceReady_('MUHR') === 'api') return apiPersonByCode_('MUHR', c);
  return sourceRows_('MUHR').filter(function (p) { return String(p.staffCode).toUpperCase() === c; })[0] || null;
}

/** MUREX: ผลงานของบุคคลตามรหัสบุคลากร */
function murexWorksFor_(code) {
  const c = String(code || '').trim().toUpperCase();
  if (sourceReady_('MUREX') === 'api') return apiWorksFor_(c).works;
  return sourceRows_('MUREX').filter(function (w) { return String(w.staffCode).toUpperCase() === c; });
}

/** ข้อมูลเก่าเกินกำหนดหรือไม่ (ดูทั้งวันที่ดึงข้อมูล และวันที่ต้นทางปรับปรุงล่าสุด) */
function staleInfo_(rec) {
  const days = Number(setting_('STALE_DAYS')) || 180;
  const ref = rec.sourceUpdatedAt || rec.fetchedAt;
  const age = ref ? daysBetween_(ref) : null;
  return { stale: age === null ? true : age > days, ageDays: age === null ? null : Math.floor(age), limit: days, basis: rec.sourceUpdatedAt ? 'sourceUpdatedAt' : 'fetchedAt' };
}

/* ---------------- นำเข้า CSV (ตรวจทานก่อนบันทึก) ---------------- */

function parseCsv_(text, delim) {
  const d = delim || ',';
  const s = String(text || '').replace(/^﻿/, '');
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
  return rows;
}

const LABEL_TO_CODE_ = function (map, v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (map[s]) return s;
  const k = Object.keys(map).filter(function (x) { return map[x] === s; })[0];
  return k || null;
};

function normYear_(y) {
  const n = Number(String(y || '').trim());
  if (!n) return null;
  if (n > 2400) return n - 543;
  return n;
}

function validDateText_(v) {
  if (!v) return true;
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) && !isNaN(new Date(String(v).slice(0, 10)));
}

function validateImportRow_(src, o) {
  const errs = [];
  const cols = IMPORT_COLUMNS[src];
  cols.required.forEach(function (c) { if (!String(o[c] || '').trim()) errs.push('ไม่มีค่า ' + c); });
  if (o.staffCode && !/^[A-Za-z0-9._\-]{2,30}$/.test(o.staffCode)) errs.push('รูปแบบ staffCode ไม่ถูกต้อง');
  if (!validDateText_(o.sourceUpdatedAt)) errs.push('sourceUpdatedAt ต้องเป็นรูปแบบ YYYY-MM-DD');
  if (src === 'MUHR') {
    [['academicRank', RANKS], ['highestDegree', DEGREES], ['employmentStatus', EMP_STATUS]].forEach(function (x) {
      const code = LABEL_TO_CODE_(x[1], o[x[0]]);
      if (code === null) errs.push(x[0] + ' ไม่รู้จักค่า "' + o[x[0]] + '"'); else o[x[0]] = code;
    });
  } else {
    const y = normYear_(o.year);
    if (!y || y < 1900 || y > new Date().getFullYear() + 1) errs.push('ปีไม่ถูกต้อง'); else o.year = String(y);
    const t = LABEL_TO_CODE_(WORK_TYPES, o.type);
    if (t === null) errs.push('type ไม่รู้จักค่า "' + o.type + '"'); else o.type = t || 'other';
    if (o.doi) { o.doi = normDoi_(o.doi); if (!/^10\.\d{4,9}\/\S+$/.test(o.doi)) errs.push('DOI ไม่ถูกต้อง'); }
    if (!validDateText_(o.pubDate)) errs.push('pubDate ต้องเป็นรูปแบบ YYYY-MM-DD');
  }
  Object.keys(o).forEach(function (k) { if (String(o[k]).length > 1000) errs.push(k + ' ยาวเกินไป'); });
  return errs;
}

function importKey_(src, o) {
  if (src === 'MUHR') return String(o.staffCode).toUpperCase();
  return String(o.staffCode).toUpperCase() + '|' + (o.workRef ? 'ref:' + o.workRef : o.doi ? 'doi:' + normDoi_(o.doi) : 't:' + normTitle_(o.title) + ':' + o.year);
}

/** ขั้นที่ 1: อ่านไฟล์ ตรวจ และเก็บเป็น "ชุดรอตรวจทาน" — ยังไม่เขียนลงข้อมูลที่ระบบใช้ */
function importPreview_(p) {
  requirePerm_('admin.data');
  const src = String(p.source || '');
  if (!SOURCES[src]) throw new Error('ไม่รู้จักแหล่งข้อมูล');
  const text = String(p.csv || '');
  if (!text.trim()) throw new Error('ไฟล์ว่างเปล่า');
  if (text.length > 3 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 3 MB — แบ่งไฟล์แล้วนำเข้าทีละส่วน');
  const fileName = clean_(p.fileName, 120);
  if (fileName && !/\.csv$/i.test(fileName)) throw new Error('รับเฉพาะไฟล์ .csv');
  if (!validDateText_(p.sourceUpdatedAt)) throw new Error('วันที่ข้อมูลต้นทางต้องเป็นรูปแบบ YYYY-MM-DD');
  const rows = parseCsv_(text);
  if (rows.length < 2) throw new Error('ต้องมีแถวหัวคอลัมน์และข้อมูลอย่างน้อย 1 แถว');
  if (rows.length > 5001) throw new Error('นำเข้าได้ครั้งละไม่เกิน 5,000 แถว');
  const header = rows[0].map(function (h) { return h.trim(); });
  const cols = IMPORT_COLUMNS[src];
  const known = cols.required.concat(cols.optional);
  const missing = cols.required.filter(function (c) { return header.indexOf(c) === -1; });
  if (missing.length) throw new Error('ไม่มีคอลัมน์ที่จำเป็น: ' + missing.join(', ') + ' (แถวแรกต้องเป็นชื่อคอลัมน์)');
  const unknown = header.filter(function (h) { return h && known.indexOf(h) === -1; });

  const existing = {};
  DB.all(SOURCES[src].table).filter(function (r) { return r.origin === 'import'; }).forEach(function (r) { existing[importKey_(src, r)] = r; });
  const seen = {};
  let valid = 0, bad = 0;
  const out = rows.slice(1).map(function (r, i) {
    const o = {};
    header.forEach(function (h, j) { if (known.indexOf(h) > -1) o[h] = clean_(r[j], 1000); });
    const errs = validateImportRow_(src, o);
    let action = 'new';
    if (!errs.length) {
      const k = importKey_(src, o);
      if (seen[k]) errs.push('ซ้ำกับแถวที่ ' + seen[k] + ' ในไฟล์เดียวกัน');
      seen[k] = i + 2;
      if (existing[k]) action = 'update';
    }
    if (errs.length) { bad++; action = 'skip'; } else valid++;
    return { rowNo: i + 2, data: o, errors: errs, action: action };
  });
  const batch = DB.insert('ImportBatches', {
    source: src, fileName: fileName, status: 'preview', rowCount: out.length, validCount: valid, errorCount: bad,
    sourceUpdatedAt: clean_(p.sourceUpdatedAt, 10), note: clean_(p.note, 300), createdBy: me_().id
  });
  DB.insertMany('ImportRows', out.map(function (r) {
    return { batchId: batch.id, rowNo: r.rowNo, data: JSON.stringify(r.data), errors: r.errors.join('; '), action: r.action };
  }));
  audit_('import.preview', 'ImportBatches', batch.id, { source: src, rows: out.length }, '');
  return importBatchView_(batch.id, unknown);
}

function importBatchView_(id, unknownCols) {
  const b = DB.get('ImportBatches', id);
  if (!b) throw new Error('ไม่พบชุดนำเข้า');
  const rows = DB.all('ImportRows').filter(function (r) { return r.batchId === id; });
  const count = function (a) { return rows.filter(function (r) { return r.action === a; }).length; };
  return {
    batch: b, unknownColumns: unknownCols || [],
    summary: { total: rows.length, new: count('new'), update: count('update'), skip: count('skip') },
    rows: rows.slice(0, 300).map(function (r) { return { rowNo: r.rowNo, data: parseJson_(r.data, {}), errors: r.errors, action: r.action }; }),
    truncated: rows.length > 300
  };
}

/** ขั้นที่ 2: ผู้ดูแลตรวจทานแล้วกดยืนยัน — เขียนเฉพาะแถวที่ผ่านการตรวจ */
function importCommit_(p) {
  requirePerm_('admin.data');
  const b = DB.get('ImportBatches', p.batchId);
  if (!b || b.status !== 'preview') throw new Error('ชุดนำเข้านี้ไม่อยู่ในสถานะรอตรวจทาน');
  const src = b.source;
  const table = SOURCES[src].table;
  const rows = DB.all('ImportRows').filter(function (r) { return r.batchId === b.id && r.action !== 'skip'; });
  const existing = {};
  DB.all(table).filter(function (r) { return r.origin === 'import'; }).forEach(function (r) { existing[importKey_(src, r)] = r; });
  const now = nowIso_();
  const replaceIds = {};
  const recs = rows.map(function (r) {
    const o = parseJson_(r.data, {});
    const old = existing[importKey_(src, o)];
    if (old) replaceIds[old.id] = true;
    return Object.assign({}, o, {
      id: old ? old.id : undefined, origin: 'import', importBatchId: b.id, fetchedAt: now,
      sourceUpdatedAt: o.sourceUpdatedAt || b.sourceUpdatedAt || '', createdAt: old ? old.createdAt : now
    });
  });
  DB.removeWhere(table, function (r) { return replaceIds[r.id]; });
  DB.insertMany(table, recs);
  DB.update('ImportBatches', b.id, { status: 'committed', committedBy: me_().id, committedAt: now });
  audit_('import.commit', 'ImportBatches', b.id, { source: src, rows: recs.length }, '');
  return { batchId: b.id, written: recs.length };
}

function importDiscard_(p) {
  requirePerm_('admin.data');
  const b = DB.get('ImportBatches', p.batchId);
  if (!b || b.status !== 'preview') throw new Error('ชุดนำเข้านี้ไม่อยู่ในสถานะรอตรวจทาน');
  DB.removeWhere('ImportRows', function (r) { return r.batchId === b.id; });
  DB.update('ImportBatches', b.id, { status: 'discarded' });
  audit_('import.discard', 'ImportBatches', b.id, { status: 'discarded' }, '');
  return true;
}


/* ======================================================================
 * ส่วน: ApiConnector.gs
 * ====================================================================== */

/**
 * ApiConnector.gs — เชื่อมต่อ MUHR / MUREX ผ่าน API จริง (โหมด api)
 *
 * - MUREX ของมหาวิทยาลัยมหิดลทำงานบน Elsevier Pure → มีชุดตั้งค่าสำเร็จรูป "pure" (Pure API, ส่ง key ทาง header api-key)
 *   คีย์ต้องขอจากผู้ดูแลระบบ Pure/MUREX (สร้างในแท็บ Administrator ของ Pure พร้อมกำหนดสิทธิ์การเห็นข้อมูล)
 * - MUHR ยังไม่มีเอกสาร API สาธารณะ → ใช้ชุดตั้งค่า "custom": กำหนด URL, header, รูปแบบคำขอ และการจับคู่ฟิลด์เอง
 * - กุญแจเก็บใน Script Properties (MUHR_API_TOKEN / MUREX_API_TOKEN) ไม่อยู่ในโค้ดหรือชีต และไม่ส่งกลับหน้าเว็บ
 * - สถานะ "เชื่อมต่อแล้ว" แสดงเฉพาะเมื่อทดสอบผ่านด้วยค่าตั้งค่าปัจจุบันเท่านั้น
 * - ข้อมูลที่ดึงมาถูกเก็บในชีต Persons / SourceWorks (origin = api) พร้อมวันที่ดึง เพื่อให้คำขอย้อนดูได้ว่าใช้ข้อมูลอะไร
 */

const API_PRESETS = {
  pure: {
    label: 'Elsevier Pure (MUREX)', base: 'https://murex.mahidol.ac.th/ws/api', authHeader: 'api-key', authPrefix: '',
    searchReq: 'POST /persons/search {"searchString":"{q}","size":20}',
    byCodeReq: '',
    worksReq: 'GET /persons/{pid}/research-outputs?size=100',
    listPath: 'items'
  },
  custom: {
    label: 'กำหนดเอง (REST/JSON)', base: '', authHeader: 'Authorization', authPrefix: 'Bearer ',
    searchReq: 'GET /persons?name={q}', byCodeReq: 'GET /persons/{code}', worksReq: 'GET /persons/{code}/works', listPath: 'items',
    personMap: { staffCode: 'staffCode', titleTh: 'titleTh', firstNameTh: 'firstNameTh', lastNameTh: 'lastNameTh', firstNameEn: 'firstNameEn', lastNameEn: 'lastNameEn', formerNames: 'formerNames', unit: 'unit', position: 'position', academicRank: 'academicRank', highestDegree: 'highestDegree', employmentStatus: 'employmentStatus', sourceUpdatedAt: 'updatedAt' },
    workMap: { workRef: 'id', title: 'title', type: 'type', year: 'year', pubDate: 'pubDate', authors: 'authors', venue: 'venue', doi: 'doi', ref: 'ref', sourceUpdatedAt: 'updatedAt' }
  }
};

function apiConf_(src) {
  const raw = parseJson_(setting_(src + '_API'), {}) || {};
  const preset = API_PRESETS[raw.preset] ? raw.preset : (src === 'MUREX' ? 'pure' : 'custom');
  const conf = Object.assign({}, API_PRESETS[preset], raw, { preset: preset });
  conf.token = PropertiesService.getScriptProperties().getProperty(src + '_API_TOKEN') || '';
  conf.configured = !!(conf.base && conf.token && (conf.searchReq || conf.byCodeReq));
  return conf;
}

function apiConfHash_(src) {
  const c = apiConf_(src);
  return hashOf_([c.preset, c.base, c.authHeader, c.authPrefix, c.searchReq, c.byCodeReq, c.worksReq, c.listPath, c.personMap, c.workMap, c.token.length]);
}

function apiLastTest_(src) { return parseJson_(PropertiesService.getScriptProperties().getProperty('SRC_TEST_' + src), null); }

/** เชื่อมต่อแล้ว = โหมด api + ทดสอบผ่าน + ค่าตั้งค่ายังเหมือนตอนทดสอบ */
function apiConnected_(src) {
  const t = apiLastTest_(src);
  return !!(t && t.ok && t.confHash === apiConfHash_(src));
}

/** "METHOD /path {body}" → เรียก API จริง */
function apiCall_(src, tmpl, vars) {
  const c = apiConf_(src);
  if (!c.configured) throw sourceError_(src, 'not_connected', 'ยังไม่ได้ตั้งค่า API ของ ' + src + ' (URL / กุญแจ / รูปแบบคำขอ)');
  const m = String(tmpl || '').trim().match(/^(GET|POST)\s+(\S+)\s*([\s\S]*)$/i);
  if (!m) throw sourceError_(src, 'not_connected', 'รูปแบบคำขอ API ไม่ถูกต้อง: ' + tmpl);
  const sub = function (s, enc) { return s.replace(/\{(\w+)\}/g, function (x, k) { const v = String(vars[k] === undefined ? '' : vars[k]); return enc ? enc(v) : v; }); };
  const url = c.base.replace(/\/+$/, '') + sub(m[2], encodeURIComponent);
  const body = m[3] ? sub(m[3], function (v) { return JSON.stringify(v).slice(1, -1); }) : '';
  const headers = { Accept: 'application/json' };
  headers[c.authHeader || 'Authorization'] = (c.authPrefix || '') + c.token;
  const opt = { method: m[1].toLowerCase(), muteHttpExceptions: true, headers: headers };
  if (body) { opt.payload = body; opt.contentType = 'application/json'; }
  let res;
  try { res = UrlFetchApp.fetch(url, opt); }
  catch (e) { throw sourceError_(src, 'outage', 'ติดต่อ ' + src + ' ไม่ได้: ' + e.message); }
  const code = res.getResponseCode();
  if (code === 404) return null;
  if (code === 401 || code === 403) throw sourceError_(src, 'auth', src + ' ปฏิเสธการเข้าถึง (' + code + ') — ตรวจกุญแจ API และสิทธิ์การเห็นข้อมูลของกุญแจ');
  if (code >= 500 || code === 429) throw sourceError_(src, 'outage', src + ' ขัดข้องหรือใช้งานเกินโควตา (' + code + ')');
  if (code >= 400) throw sourceError_(src, 'outage', src + ' ตอบกลับผิดพลาด (' + code + ') — ตรวจรูปแบบคำขอในหน้าตั้งค่า');
  try { return JSON.parse(res.getContentText()); }
  catch (e) { throw sourceError_(src, 'outage', src + ' ไม่ได้ส่งข้อมูล JSON กลับมา'); }
}

/* ---------------- อ่านค่าจาก JSON ---------------- */

/** "a.b.0.c|x.y" → ค่าแรกที่พบ */
function getPath_(o, path) {
  const alts = String(path || '').split('|');
  for (let i = 0; i < alts.length; i++) {
    let v = o;
    alts[i].split('.').filter(String).forEach(function (k) { v = v === undefined || v === null ? undefined : v[k]; });
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

/** ข้อความหลายภาษาของ Pure: "x" | {value} | {text:[{value}]} | {en_GB:"x", th_TH:"y"} */
function locText_(x, preferTh) {
  if (x === undefined || x === null) return '';
  if (typeof x !== 'object') return String(x);
  if (Array.isArray(x)) return locText_(x[0], preferTh);
  if (x.value !== undefined) return locText_(x.value, preferTh);
  if (x.text) return locText_(x.text, preferTh);
  if (x.term) return locText_(x.term, preferTh);
  const keys = Object.keys(x);
  const th = keys.filter(function (k) { return /^th/i.test(k); })[0], en = keys.filter(function (k) { return /^en/i.test(k); })[0];
  return String(x[preferTh && th ? th : en || th || keys[0]] || '');
}

function listOf_(json, listPath) {
  if (Array.isArray(json)) return json;
  const v = getPath_(json || {}, listPath || 'items');
  return Array.isArray(v) ? v : [];
}

/* ---------------- Pure ---------------- */

function purePersonCode_(it) {
  const ids = [].concat(it.ids || [], it.identifiers || [], it.personIds || []);
  const emp = ids.filter(function (x) { return /employee|staff|personnel|บุคลากร/i.test(locText_(x.type || x.idSource || x.typeDiscriminator)); })[0];
  return String((emp && (emp.id || emp.value)) || it.employeeId || it.externalId || '').trim();
}

function purePerson_(it) {
  const name = it.name || {};
  const org = (it.staffOrganizationAssociations || it.staffOrganisationAssociations || [])[0] || {};
  const orgName = locText_((org.organization || org.organisationalUnit || org.organisationalUnits || {}).name);
  return {
    staffCode: purePersonCode_(it), pureId: it.uuid || it.pureId || '',
    firstNameEn: name.firstName || '', lastNameEn: name.lastName || '',
    firstNameTh: '', lastNameTh: '', formerNames: (it.names || []).map(function (n) { return [n.firstName || (n.name || {}).firstName, n.lastName || (n.name || {}).lastName].filter(String).join(' '); }).filter(String).join('|'),
    unit: orgName, position: locText_(org.jobDescription || org.jobTitle || ''), academicRank: '', highestDegree: '', employmentStatus: '',
    sourceUpdatedAt: String(getPath_(it, 'info.modifiedDate|modifiedDate') || '').slice(0, 10)
  };
}

function pureWorkType_(t) {
  const s = String(t || '').toLowerCase();
  if (/journal|article|review|letter|editorial/.test(s)) return 'journal';
  if (/conference|proceeding|paper/.test(s)) return 'proceeding';
  if (/chapter/.test(s)) return 'chapter';
  if (/book|anthology|monograph/.test(s)) return 'book';
  if (/patent/.test(s)) return 'patent';
  if (/report/.test(s)) return 'report';
  return 'other';
}

function pureWork_(it) {
  const st = [].concat(it.publicationStatuses || []);
  const cur = st.filter(function (x) { return x.current; })[0] || st[0] || {};
  const pd = cur.publicationDate || {};
  const ev = [].concat(it.electronicVersions || []);
  const doiV = ev.filter(function (e) { return e.doi; })[0];
  const ja = it.journalAssociation || {};
  return {
    workRef: it.uuid || it.pureId || '', title: locText_(it.title), type: pureWorkType_(locText_(it.type)),
    year: String(pd.year || ''), pubDate: pd.year && pd.month ? pd.year + '-' + ('0' + pd.month).slice(-2) + '-' + ('0' + (pd.day || 1)).slice(-2) : '',
    authors: [].concat(it.contributors || it.personAssociations || []).map(function (c) { const n = c.name || {}; return [n.firstName, n.lastName].filter(String).join(' '); }).filter(String).slice(0, 15).join(', '),
    venue: locText_(ja.title) || locText_(it.hostPublicationTitle) || locText_((it.event || {}).name), doi: normDoi_(doiV ? doiV.doi : it.doi),
    ref: locText_(ja.issn) ? 'ISSN ' + locText_(ja.issn) : (it.isbns ? 'ISBN ' + [].concat(it.isbns)[0] : ''),
    sourceUpdatedAt: String(getPath_(it, 'info.modifiedDate|modifiedDate') || '').slice(0, 10)
  };
}

/* ---------------- custom ---------------- */

function mapFields_(it, map) {
  const o = {};
  Object.keys(map || {}).forEach(function (k) { const v = getPath_(it, map[k]); o[k] = Array.isArray(v) ? v.map(function (x) { return locText_(x); }).join(', ') : locText_(v); });
  return o;
}

function normPersonCodes_(o) {
  [['academicRank', RANKS], ['highestDegree', DEGREES], ['employmentStatus', EMP_STATUS]].forEach(function (x) {
    const c = LABEL_TO_CODE_(x[1], o[x[0]]);
    o[x[0]] = c || '';
  });
  return o;
}

/* ---------------- เก็บผลลงชีต (origin = api) ---------------- */

function upsertApiRows_(table, recs, keyFn) {
  if (!recs.length) return [];
  const now = nowIso_();
  const existing = {};
  DB.all(table).filter(function (r) { return r.origin === 'api'; }).forEach(function (r) { existing[keyFn(r)] = r; });
  const replace = {};
  const out = recs.map(function (o) {
    const old = existing[keyFn(o)];
    if (old) replace[old.id] = true;
    return Object.assign({}, o, { id: old ? old.id : undefined, origin: 'api', fetchedAt: now, createdAt: old ? old.createdAt : now });
  });
  DB.removeWhere(table, function (r) { return replace[r.id]; });
  return DB.insertMany(table, out);
}

const PERSON_KEY_ = function (r) { return String(r.staffCode || '').toUpperCase(); };
const WORK_KEY_ = function (r) { return String(r.staffCode || '').toUpperCase() + '|' + (r.workRef || r.doi || normTitle_(r.title)); };

/** ค้นบุคคลผ่าน API → บันทึก → คืนระเบียน Persons (origin api) */
function apiSearchPersons_(src, q) {
  const c = apiConf_(src);
  const json = apiCall_(src, c.searchReq || c.byCodeReq, { q: q, code: q });
  const items = json && !Array.isArray(json) && !getPath_(json, c.listPath) && (json.uuid || json.staffCode) ? [json] : listOf_(json, c.listPath);
  const recs = items.slice(0, 50).map(function (it) { return c.preset === 'pure' ? purePerson_(it) : normPersonCodes_(mapFields_(it, c.personMap)); })
    .filter(function (r) { return r.staffCode; });
  return upsertApiRows_('Persons', recs.map(function (r) { const o = Object.assign({}, r); delete o.pureId; return o; }), PERSON_KEY_);
}

function apiPersonByCode_(src, code) {
  const c = apiConf_(src);
  const rows = c.byCodeReq && c.preset !== 'pure' ? (function () {
    const json = apiCall_(src, c.byCodeReq, { code: code, q: code });
    if (!json) return [];
    const it = Array.isArray(json) ? json[0] : (getPath_(json, c.listPath) ? listOf_(json, c.listPath)[0] : json);
    return it ? upsertApiRows_('Persons', [normPersonCodes_(mapFields_(it, c.personMap))].filter(function (r) { return r.staffCode; }), PERSON_KEY_) : [];
  })() : apiSearchPersons_(src, code);
  return rows.filter(function (r) { return PERSON_KEY_(r) === String(code).toUpperCase(); })[0] || null;
}

/** ผลงานของบุคคลจาก MUREX — Pure: หา uuid ของบุคคลจากรหัสบุคลากรก่อน */
function apiWorksFor_(code) {
  const c = apiConf_('MUREX');
  let pid = code;
  if (c.preset === 'pure') {
    const json = apiCall_('MUREX', c.searchReq, { q: code });
    const hit = listOf_(json, c.listPath).filter(function (it) { return purePersonCode_(it).toUpperCase() === String(code).toUpperCase(); })[0];
    if (!hit) return { works: [], note: 'ไม่พบบุคคลรหัส ' + code + ' ใน MUREX (Pure ต้องมีรหัสบุคลากรใน ids ของบุคคล) — เพิ่มผลงานจากฐานวิชาการหรือกรอกเองได้' };
    pid = hit.uuid || hit.pureId;
  }
  const json = apiCall_('MUREX', c.worksReq, { pid: pid, code: code });
  const recs = listOf_(json, c.listPath).slice(0, 300).map(function (it) {
    const w = c.preset === 'pure' ? pureWork_(it) : mapFields_(it, c.workMap);
    w.type = WORK_TYPES[w.type] ? w.type : pureWorkType_(w.type);
    w.year = String(normYear_(w.year) || '');
    w.doi = normDoi_(w.doi);
    return Object.assign(w, { staffCode: code });
  }).filter(function (w) { return w.title; });
  return { works: upsertApiRows_('SourceWorks', recs, WORK_KEY_), note: '' };
}

/* ---------------- ผู้ดูแล: ตั้งค่าและทดสอบ ---------------- */

function apiAdminView_(src) {
  const c = apiConf_(src);
  return {
    source: src, preset: c.preset, presets: Object.keys(API_PRESETS).map(function (k) { return { key: k, label: API_PRESETS[k].label }; }),
    base: c.base, authHeader: c.authHeader, authPrefix: c.authPrefix, searchReq: c.searchReq, byCodeReq: c.byCodeReq, worksReq: c.worksReq, listPath: c.listPath,
    personMap: JSON.stringify(c.personMap || {}, null, 1), workMap: JSON.stringify(c.workMap || {}, null, 1),
    hasToken: !!c.token, configured: c.configured, connected: apiConnected_(src), lastTest: apiLastTest_(src)
  };
}

function saveSourceApi_(p) {
  requirePerm_('admin.data');
  const src = String(p.source || '');
  if (!SOURCES[src]) throw new Error('ไม่รู้จักแหล่งข้อมูล');
  const preset = API_PRESETS[p.preset] ? p.preset : 'custom';
  const base = clean_(p.base, 300);
  if (base && !/^https:\/\/[^\s/]+/i.test(base)) throw new Error('URL ต้องขึ้นต้นด้วย https://');
  const conf = { preset: preset, base: base, authHeader: clean_(p.authHeader, 60) || 'Authorization', authPrefix: String(p.authPrefix || '').slice(0, 30),
    searchReq: clean_(p.searchReq, 500), byCodeReq: clean_(p.byCodeReq, 500), worksReq: clean_(p.worksReq, 500), listPath: clean_(p.listPath, 100) };
  ['searchReq', 'byCodeReq', 'worksReq'].forEach(function (k) { if (conf[k] && !/^(GET|POST)\s+\/\S*/i.test(conf[k])) throw new Error(k + ' ต้องอยู่ในรูป "GET /path" หรือ "POST /path {json}"'); });
  if (preset === 'custom') {
    conf.personMap = parseJson_(p.personMap, null); conf.workMap = parseJson_(p.workMap, null);
    if (!conf.personMap || !conf.personMap.staffCode) throw new Error('การจับคู่ฟิลด์บุคคล (JSON) ต้องมี staffCode');
    if (src === 'MUREX' && (!conf.workMap || !conf.workMap.title)) throw new Error('การจับคู่ฟิลด์ผลงาน (JSON) ต้องมี title');
  }
  setSettings_({ [src + '_API']: JSON.stringify(conf) });
  const props = PropertiesService.getScriptProperties();
  if (p.clearToken) props.deleteProperty(src + '_API_TOKEN');
  else if (String(p.token || '').trim()) props.setProperty(src + '_API_TOKEN', String(p.token).trim());
  audit_('source.apiConfig', 'Settings', src, ['base', 'requests', p.token ? 'token' : '', p.clearToken ? 'token-cleared' : ''].filter(String), '');
  return apiAdminView_(src);
}

/** ทดสอบเรียก API จริงด้วยรหัสหรือชื่อตัวอย่าง — ผลการทดสอบเป็นตัวกำหนดสถานะ "เชื่อมต่อแล้ว" */
function testSourceApi_(p) {
  requirePerm_('admin.data');
  const src = String(p.source || '');
  if (!SOURCES[src]) throw new Error('ไม่รู้จักแหล่งข้อมูล');
  const q = clean_(p.q, 100);
  if (!q) throw new Error('ระบุรหัสบุคลากรหรือชื่อที่ใช้ทดสอบ');
  const out = { ok: false, at: nowIso_(), message: '', sample: null };
  try {
    if (src === 'MUHR') {
      const rows = /\d/.test(q) ? [apiPersonByCode_('MUHR', q)].filter(Boolean) : apiSearchPersons_('MUHR', q);
      out.ok = true;
      out.message = 'เรียก API สำเร็จ — พบ ' + rows.length + ' รายการ' + (rows.length ? '' : ' (ตรวจรหัส/ชื่อทดสอบ หรือการจับคู่ฟิลด์ staffCode)');
      if (rows[0]) out.sample = { staffCode: rows[0].staffCode, unit: rows[0].unit, fields: Object.keys(rows[0]).filter(function (k) { return rows[0][k]; }) };
    } else {
      const persons = apiSearchPersons_('MUREX', q);
      out.ok = true;
      out.message = 'เรียก API สำเร็จ — พบบุคคล ' + persons.length + ' รายการที่มีรหัสบุคลากร';
      if (persons[0]) {
        const w = apiWorksFor_(persons[0].staffCode);
        out.message += ' · ดึงผลงานของรหัส ' + persons[0].staffCode + ' ได้ ' + w.works.length + ' รายการ' + (w.note ? ' (' + w.note + ')' : '');
        out.sample = { staffCode: persons[0].staffCode, works: w.works.length };
      } else out.message += ' — ถ้าพบ 0 แต่มีบุคคลจริง แสดงว่า Pure ไม่ได้ส่งรหัสบุคลากรมาใน ids หรือกุญแจไม่มีสิทธิ์เห็นข้อมูลนี้';
    }
  } catch (e) {
    out.ok = false; out.message = e.message;
  }
  out.confHash = apiConfHash_(src);
  PropertiesService.getScriptProperties().setProperty('SRC_TEST_' + src, JSON.stringify(out));
  audit_('source.apiTest', 'Settings', src, { result: out.ok ? 'pass' : 'fail' }, '');
  return apiAdminView_(src);
}


/* ======================================================================
 * ส่วน: Matching.gs
 * ====================================================================== */

/**
 * Matching.gs — ค้นหา/ยืนยันตัวบุคคล และตรวจผลงานซ้ำ
 *
 * หลักการ
 * - ใช้รหัสบุคลากร (staffCode) เป็นหลักในการยืนยันตัวบุคคล ไม่ยืนยันจากชื่อเพียงอย่างเดียว
 * - ค้นจากชื่อไทย ชื่ออังกฤษ และชื่อเดิมได้ แต่ผลที่ได้จากชื่อ "ต้องให้เจ้าหน้าที่ยืนยัน" เสมอ
 * - ผลงานซ้ำ: ตรวจ DOI ก่อน แล้วจึงดูชื่อเรื่อง+ปี — ไม่รวมรายการให้อัตโนมัติ ให้เจ้าหน้าที่ตัดสิน
 */

const NAME_PREFIX_RE_ = /^(ศาสตราจารย์|รองศาสตราจารย์|ผู้ช่วยศาสตราจารย์|อาจารย์|ศ\.|รศ\.|ผศ\.|อ\.|ดร\.|นายแพทย์|แพทย์หญิง|นพ\.|พญ\.|นางสาว|นาย|นาง|น\.ส\.|prof\.?|professor|assoc\.?|asst\.?|associate|assistant|dr\.?|mr\.?|mrs\.?|ms\.?|miss)\s*/i;

function normName_(s) {
  let t = String(s || '').trim().toLowerCase();
  for (let i = 0; i < 6; i++) {
    const n = t.replace(NAME_PREFIX_RE_, '');
    if (n === t) break;
    t = n.trim();
  }
  return t.replace(/[^a-z฀-๿]/g, '');
}

function personNames_(p) {
  const out = [
    { kind: 'th', text: [p.firstNameTh, p.lastNameTh].join(' ') },
    { kind: 'en', text: [p.firstNameEn, p.lastNameEn].join(' ') },
    { kind: 'en_rev', text: [p.lastNameEn, p.firstNameEn].join(' ') }
  ];
  splitList_(String(p.formerNames || '').replace(/;/g, '|')).forEach(function (n) { out.push({ kind: 'former', text: n }); });
  return out.filter(function (x) { return normName_(x.text); });
}

function personDisplay_(p) {
  return {
    personId: p.id, origin: p.origin, staffCode: p.staffCode, titleTh: p.titleTh,
    nameTh: [p.firstNameTh, p.lastNameTh].filter(String).join(' '), nameEn: [p.firstNameEn, p.lastNameEn].filter(String).join(' '),
    formerNames: p.formerNames || '', unit: p.unit, position: p.position, academicRank: p.academicRank, highestDegree: p.highestDegree,
    employmentStatus: p.employmentStatus, fetchedAt: p.fetchedAt, sourceUpdatedAt: p.sourceUpdatedAt, staleness: staleInfo_(p)
  };
}

/** ค้นหาบุคคลในแหล่ง MUHR (โหมดปัจจุบัน) จากรหัสบุคลากร และ/หรือ ชื่อ */
function searchPersons_(p) {
  const code = String(p.staffCode || '').trim().toUpperCase();
  const name = normName_(p.name);
  if (!code && name.length < 2) throw new Error('กรอกรหัสบุคลากร หรือชื่ออย่างน้อย 2 ตัวอักษร');
  const live = sourceReady_('MUHR') === 'api';
  const rows = !live ? sourceRows_('MUHR') : code ? [apiPersonByCode_('MUHR', code)].filter(Boolean) : apiSearchPersons_('MUHR', String(p.name).trim());
  const results = [];
  rows.forEach(function (r) {
    let basis = '', matchedName = '';
    if (code && String(r.staffCode).toUpperCase() === code) basis = 'staffCode';
    else if (live && !code) { basis = 'name'; matchedName = [r.firstNameTh, r.lastNameTh].join(' ').trim() || [r.firstNameEn, r.lastNameEn].join(' '); } // ระบบต้นทางเป็นผู้ค้นด้วยชื่อ
    else if (!code && name) {
      personNames_(r).forEach(function (n) {
        const nn = normName_(n.text);
        const exact = nn === name, part = !exact && name.length >= 3 && nn.indexOf(name) > -1;
        if ((exact || part) && (!basis || (exact && basis.indexOf('partial') > -1))) {
          basis = (n.kind === 'former' ? 'former_name' : 'name') + (exact ? '' : '_partial');
          matchedName = n.text;
        }
      });
    }
    if (basis) results.push(Object.assign(personDisplay_(r), { matchBasis: basis, matchedName: matchedName }));
  });
  // ชื่อซ้ำ: บุคคลต่างรหัสที่มีชื่อ (ไทยหรืออังกฤษ) ตรงกัน → ต้องระบุรหัสหรือให้เจ้าหน้าที่ยืนยัน
  const keyCount = {};
  rows.forEach(function (r) {
    [normName_([r.firstNameTh, r.lastNameTh].join(' ')), normName_([r.firstNameEn, r.lastNameEn].join(' '))].filter(String).forEach(function (k) { keyCount[k] = (keyCount[k] || 0) + 1; });
  });
  results.forEach(function (x) {
    const k1 = normName_(x.nameTh), k2 = normName_(x.nameEn);
    x.sameNameCount = Math.max(keyCount[k1] || 0, keyCount[k2] || 0);
    x.duplicateName = x.sameNameCount > 1;
  });
  return {
    results: results.slice(0, 30), total: results.length,
    ambiguous: results.filter(function (x) { return x.matchBasis !== 'staffCode'; }).length > 1 || results.some(function (x) { return x.duplicateName; }),
    source: sourceStatus_('MUHR')
  };
}

/** สร้าง snapshot ข้อมูลบุคคล ณ เวลาที่เลือก (เก็บไว้กับคำขอ ใช้ย้อนดูได้ว่าใช้ข้อมูลอะไร) */
function personSnapFromSource_(rec, basis, duplicateName) {
  return Object.assign(personDisplay_(rec), { kind: 'source', source: 'MUHR', matchBasis: basis, duplicateName: !!duplicateName, selectedAt: nowIso_() });
}

function personSnapManual_(p) {
  const s = {
    kind: 'manual', source: 'manual', titleTh: clean_(p.titleTh, 60), nameTh: clean_(p.nameTh, 150), nameEn: clean_(p.nameEn, 150),
    formerNames: clean_(p.formerNames, 200), affiliation: clean_(p.affiliation, 200), position: clean_(p.position, 120),
    academicRank: RANKS[p.academicRank] ? p.academicRank : '', highestDegree: DEGREES[p.highestDegree] ? p.highestDegree : '',
    employmentStatus: 'external', reason: clean_(p.reason, 300), selectedAt: nowIso_()
  };
  if (!s.nameTh && !s.nameEn) throw new Error('กรอกชื่อ-นามสกุล (ไทยหรืออังกฤษ)');
  if (!s.affiliation) throw new Error('กรอกสังกัด/หน่วยงานของบุคคล');
  return s;
}

/** สถานะการยืนยันตัวบุคคลที่ได้จากการเลือก — มีเพียงการจับคู่ด้วยรหัสบุคลากรที่ถือว่ายืนยันแล้ว */
function identityFromSnap_(snap) {
  if (snap.kind === 'source' && snap.matchBasis === 'staffCode') return 'code_match';
  return 'needs_staff_check';
}

const IDENTITY_LABEL = {
  code_match: 'ยืนยันด้วยรหัสบุคลากรจากระบบต้นทาง',
  staff_confirmed: 'เจ้าหน้าที่ยืนยันตัวบุคคลแล้ว',
  needs_staff_check: 'รอเจ้าหน้าที่ยืนยันตัวบุคคล',
  '': 'ยังไม่ได้เลือกบุคคล'
};

function identityVerified_(req) { return req.identityStatus === 'code_match' || req.identityStatus === 'staff_confirmed'; }

/* ---------------- ผลงานซ้ำ ---------------- */

function normDoi_(d) {
  return String(d || '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '').trim();
}


function dice_(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = function (s) { const m = {}; for (let i = 0; i < s.length - 1; i++) { const g = s.substr(i, 2); m[g] = (m[g] || 0) + 1; } return m; };
  const ga = grams(a), gb = grams(b);
  let inter = 0, na = 0, nb = 0;
  Object.keys(ga).forEach(function (g) { na += ga[g]; if (gb[g]) inter += Math.min(ga[g], gb[g]); });
  Object.keys(gb).forEach(function (g) { nb += gb[g]; });
  return na + nb ? (2 * inter) / (na + nb) : 0;
}

const DUP_TITLE_THRESHOLD = 0.88;

/** เปรียบเทียบผลงาน 2 รายการ — คืน {basis, score} หรือ null */
function dupCheck_(a, b) {
  const da = normDoi_(a.doi), db = normDoi_(b.doi);
  if (da && db) return da === db ? { basis: 'doi', score: 1 } : null;
  const s = dice_(normTitle_(a.title), normTitle_(b.title));
  const ya = normYear_(a.year), yb = normYear_(b.year);
  const yearOk = !ya || !yb || Math.abs(ya - yb) <= 1;
  if (s >= DUP_TITLE_THRESHOLD && yearOk) return { basis: s === 1 ? 'title_year' : 'title_similar', score: Math.round(s * 100) / 100 };
  return null;
}

const ACTIVE_WORK_ = function (w) { return w.status !== 'withdrawn'; };

/** หาคู่ที่สงสัยว่าซ้ำในคำขอ แล้วบันทึกเป็น "สงสัยว่าซ้ำ" ให้เจ้าหน้าที่ตัดสิน (ไม่รวมรายการเอง) */
function detectDuplicates_(requestId) {
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === requestId && ACTIVE_WORK_(w); });
  const pairs = DB.all('DupPairs').filter(function (d) { return d.requestId === requestId; });
  const has = {};
  pairs.forEach(function (d) { has[[d.workA, d.workB].sort().join('|')] = true; });
  const add = [];
  for (let i = 0; i < works.length; i++) {
    for (let j = i + 1; j < works.length; j++) {
      const k = [works[i].id, works[j].id].sort().join('|');
      if (has[k]) continue;
      const m = dupCheck_(works[i], works[j]);
      if (m) { add.push({ requestId: requestId, workA: works[i].id, workB: works[j].id, basis: m.basis, score: m.score, status: 'suspected' }); has[k] = true; }
    }
  }
  if (add.length) DB.insertMany('DupPairs', add);
  return add.length;
}

/** คู่ซ้ำที่ยังต้องตัดสิน (ไม่นับคู่ที่ผลงานถูกถอนออกแล้ว) */
function openDupPairs_(requestId, works) {
  const active = {};
  (works || DB.all('RequestWorks').filter(function (w) { return w.requestId === requestId; }))
    .forEach(function (w) { if (ACTIVE_WORK_(w) && w.status !== 'excluded_duplicate') active[w.id] = true; });
  return DB.all('DupPairs').filter(function (d) { return d.requestId === requestId && d.status === 'suspected' && active[d.workA] && active[d.workB]; });
}


/* ======================================================================
 * ส่วน: Scholar.gs
 * ====================================================================== */

/**
 * Scholar.gs — ค้นผลงานจากฐานข้อมูลวิชาการ (Scopus → Web of Science → PubMed → ERIC → TCI/ThaiJO → OpenAlex)
 *
 * ใช้โค้ดค้นหาชุดเดียวกับระบบ MUGR (Discovery.gs + Sources.gs ซึ่งถูกรวมไว้ถัดจากไฟล์นี้)
 * ไฟล์นี้มีเฉพาะค่าที่โค้ดชุดนั้นต้องใช้ และคำสั่งที่ผูกการค้นเข้ากับคำขอ
 *
 * หลักการ
 * - ระบบแสดง "ข้อเท็จจริง" ว่าพบในฐานใด/วารสารอยู่ในฐานใด พร้อมลิงก์ยืนยัน — ไม่ให้คะแนนหรือตัดสินแทนเกณฑ์
 * - แยกผลที่ยืนยันจากฐานโดยตรง (record) / จากรายชื่อวารสาร (journal) / ยังยืนยันไม่ได้
 * - Quartile เก็บพร้อมแหล่งและปีที่ใช้ (CiteScore ปีใด หรือรายชื่อ SJR ที่นำเข้า) ไม่ใช้ค่าคนละแหล่งแทนกันโดยไม่บอก
 * - API key เก็บใน Script Properties เท่านั้น
 */

/** ฐานข้อมูลตามประกาศ ก.พ.อ. 2562 (ข้อเท็จจริงด้านการจัดทำดัชนี ใช้แสดงผลและเป็นตัวเลือกในเกณฑ์) */
const DATABASES = {
  scopus: { label: 'Scopus', short: 'Scopus', group: 'kpa_intl', level: 'intl', quartile: true },
  wos: { label: 'Web of Science (SCIE / SSCI / AHCI)', short: 'WoS', group: 'kpa_intl', level: 'intl', quartile: true },
  pubmed: { label: 'PubMed', short: 'PubMed', group: 'kpa_intl', level: 'intl', quartile: true },
  eric: { label: 'ERIC', short: 'ERIC', group: 'kpa_intl', level: 'intl', quartile: false },
  mathscinet: { label: 'MathSciNet', short: 'MathSciNet', group: 'kpa_intl', level: 'intl', quartile: false },
  jstor: { label: 'JSTOR', short: 'JSTOR', group: 'kpa_intl', level: 'intl', quartile: false },
  projectmuse: { label: 'Project Muse', short: 'Muse', group: 'kpa_intl', level: 'intl', quartile: false },
  tci1: { label: 'TCI กลุ่มที่ 1', short: 'TCI 1', group: 'tci1', level: 'nat', quartile: false },
  tci2: { label: 'TCI กลุ่มที่ 2', short: 'TCI 2', group: 'tci2', level: 'nat', quartile: false },
  tci3: { label: 'TCI กลุ่มที่ 3', short: 'TCI 3', group: 'none', level: 'nat', quartile: false },
  other_intl: { label: 'วารสารนานาชาติอื่น', short: 'นานาชาติอื่น', group: 'other_intl', level: 'intl', quartile: false },
  other_nat: { label: 'วารสารระดับชาติอื่น', short: 'ชาติอื่น', group: 'other_nat', level: 'nat', quartile: false },
  none: { label: 'ไม่พบในฐานข้อมูล / ยังระบุไม่ได้', short: '—', group: 'none', level: '', quartile: false }
};

/** กลุ่มฐานข้อมูลที่ใช้เลือกในเกณฑ์ (ค่าที่เลือกต้องมาจากประกาศที่หน่วยงานยืนยัน) */
const DB_GROUPS = { kpa_intl: 'ฐานนานาชาติตามประกาศ ก.พ.อ. (Scopus/WoS/PubMed/ERIC/...)', tci1: 'TCI กลุ่มที่ 1', tci2: 'TCI กลุ่มที่ 2' };

const PUB_TYPES = {
  journal: { label: 'บทความในวารสารวิชาการ' },
  proceedings_intl: { label: 'Proceedings ระดับนานาชาติ', level: 'intl' },
  proceedings_nat: { label: 'Proceedings ระดับชาติ', level: 'nat' },
  textbook: { label: 'ตำรา' },
  book: { label: 'หนังสือ' },
  patent: { label: 'สิทธิบัตร' },
  petty_patent: { label: 'อนุสิทธิบัตร' },
  social: { label: 'ผลงานวิชาการรับใช้สังคม' }
};
const PUB_TO_WORK_TYPE_ = { journal: 'journal', proceedings_intl: 'proceeding', proceedings_nat: 'proceeding', textbook: 'book', book: 'book', patent: 'patent', petty_patent: 'patent', social: 'other' };

/* ---- ฟังก์ชันที่โค้ดค้นหาของ MUGR เรียกใช้ (ระบบนี้ไม่คิดคะแนนน้ำหนัก) ---- */
function currentBE_() { return Number(nowIso_().slice(0, 4)) + 543; }
function evalWindow_() { const e = currentBE_(); return { start: e - 4, end: e }; }
function pubWeight_() { return { w: '', basis: '' }; }
function isAccepted_(p) { const g = (DATABASES[p.database] || {}).group; return g === 'kpa_intl' || g === 'tci1' || g === 'tci2'; }
function requireRole_() { requirePerm_('admin.data'); }
function currentUser_() { return CURRENT_USER_; }

/* ---- เก็บผลค้นไว้ชั่วคราวฝั่งเซิร์ฟเวอร์ (ไม่เชื่อข้อมูลผลงานที่หน้าเว็บส่งกลับมา) ---- */
function cachePutBig_(key, obj) {
  const s = JSON.stringify(obj);
  const parts = s.match(/[\s\S]{1,90000}/g) || [''];
  const cache = CacheService.getScriptCache();
  const all = { };
  parts.forEach(function (p, i) { all[key + '_' + i] = p; });
  all[key] = String(parts.length);
  cache.putAll ? cache.putAll(all, 3600) : Object.keys(all).forEach(function (k) { cache.put(k, all[k], 3600); });
}
function cacheGetBig_(key) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key));
  if (!n) return null;
  let s = '';
  for (let i = 0; i < n; i++) { const p = cache.get(key + '_' + i); if (p === null) return null; s += p; }
  return JSON.parse(s);
}

function quartileSource_(w) {
  if (!w.quartile) return '';
  const sr = w.direct && w.direct.scopus && w.direct.scopus.serial;
  if ((w.evidence || []).some(function (e) { return e.indexOf('ใช้ Quartile จาก CiteScore') > -1; }) && sr) return 'CiteScore ' + sr.year + ' (Scopus API, percentile ' + sr.percentile + ')';
  return 'รายชื่อวารสารที่นำเข้า (เช่น SJR) — ดูปีของรายชื่อในหน้า แหล่งข้อมูล';
}

/** แปลงผลค้นของ MUGR → ฟิลด์ผลงานในคำขอ */
function scholarFields_(w) {
  return {
    title: clean_(w.title, 500), type: PUB_TO_WORK_TYPE_[w.type] || 'other', year: String(w.yearCE || ''), authors: clean_((w.authors || []).join(', '), 1000),
    venue: clean_(w.journal, 300), doi: normDoi_(w.doi), ref: clean_(w.pmid ? 'PMID ' + w.pmid : (w.sourceId || ''), 200),
    database: w.database || 'none', dbGroup: w.group || (DATABASES[w.database] || {}).group || 'none', quartile: w.quartile || '', quartileSource: quartileSource_(w),
    proof: w.proof || '', foundIn: (w.foundIn || []).join(','), links: JSON.stringify((w.links || []).slice(0, 10)),
    dbEvidence: clean_((w.evidence || []).join(' | '), 2000), checkedAt: nowIso_()
  };
}

function canCollectWorks_(req) {
  return editableSections_(req).indexOf('works') > -1 || actionsFor_(req).indexOf('verify') > -1;
}

/** ค้นทุกฐานสำหรับบุคคลในคำขอ — ผลถูกเก็บชั่วคราว แล้วให้ผู้ใช้เลือกเพิ่มเข้าคำขอ */
function scholarSearch_(p) {
  const req = loadRequestFor_(p.id);
  if (!canCollectWorks_(req)) throw new Error('ค้นเพื่อเพิ่มผลงานได้เฉพาะผู้ยื่นที่แก้ส่วนผลงานได้ หรือเจ้าหน้าที่ผู้ตรวจ');
  const snap = parseJson_(req.personSnap, {}) || {};
  const ids = parseJson_(req.authorIds, {}) || {};
  const q = {
    nameEn: clean_(p.nameEn !== undefined ? p.nameEn : snap.nameEn, 150), nameTh: clean_(p.nameTh !== undefined ? p.nameTh : snap.nameTh, 150),
    scopusId: clean_(p.scopusId !== undefined ? p.scopusId : ids.scopusId, 30).replace(/\D+/g, ''), orcid: clean_(p.orcid !== undefined ? p.orcid : ids.orcid, 60),
    affil: clean_(p.affil !== undefined ? p.affil : setting_('SCHOLAR_AFFIL'), 150),
    fromYear: Number(p.fromYear) || currentBE_() - 4, toYear: Number(p.toYear) || currentBE_()
  };
  if (q.fromYear > q.toYear) throw new Error('ปีเริ่มต้องไม่เกินปีสิ้นสุด');
  if (q.scopusId !== (ids.scopusId || '') || q.orcid !== (ids.orcid || '')) DB.update('Requests', req.id, { authorIds: JSON.stringify({ scopusId: q.scopusId, orcid: q.orcid }) });
  const r = searchAll_(q);
  const existing = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); });
  const has = function (w) { return existing.some(function (x) { return (w.doi && normDoi_(x.doi) === normDoi_(w.doi)) || (!w.doi && normTitle_(x.title) === normTitle_(w.title)); }); };
  const token = Utilities.getUuid().replace(/-/g, '');
  cachePutBig_('sch_' + token, { requestId: req.id, userId: me_().id, works: r.works, query: q, at: nowIso_() });
  audit_('scholar.search', 'Requests', req.id, ['nameEn', 'nameTh', 'scopusId', 'orcid', 'years'], r.works.length + ' รายการ');
  return {
    token: token, query: q, status: r.status, candidates: r.candidates, journalIndex: r.journalIndex, searchedAt: nowIso_(),
    works: r.works.map(function (w, i) {
      return { i: i, title: w.title, journal: w.journal, yearCE: w.yearCE, doi: w.doi, authors: (w.authors || []).slice(0, 6), type: w.type, typeLabel: (PUB_TYPES[w.type] || {}).label,
        database: w.database, dbLabel: (DATABASES[w.database] || DATABASES.none).label, group: w.group, quartile: w.quartile, quartileSource: quartileSource_(w),
        proof: w.proof, links: w.links, foundIn: w.foundIn, origins: w.origins, evidence: w.evidence, confidence: w.confidence, added: has(w) };
    })
  };
}

function addScholarWorks_(p) {
  const req = loadRequestFor_(p.id);
  if (!canCollectWorks_(req)) throw new Error('เพิ่มผลงานไม่ได้ในสถานะนี้');
  const c = cacheGetBig_('sch_' + String(p.token || ''));
  if (!c || c.requestId !== req.id || c.userId !== me_().id) throw new Error('ผลการค้นหมดอายุแล้ว (เก็บไว้ 1 ชั่วโมง) — กรุณาค้นใหม่');
  const picked = [].concat(p.indexes || []).map(Number).filter(function (i, k, a) { return c.works[i] && a.indexOf(i) === k; });
  if (!picked.length) throw new Error('ยังไม่ได้เลือกผลงาน');
  const recs = picked.map(function (i) {
    const w = c.works[i];
    return Object.assign(scholarFields_(w), { requestId: req.id, origin: 'SCHOLAR', sourceWorkId: (w.origins || [w.origin]).join('+') + ':' + (w.sourceId || w.doi || ''), status: 'pending', addedBy: me_().id, addedRound: req.round });
  });
  DB.insertMany('RequestWorks', recs);
  const dups = detectDuplicates_(req.id);
  audit_('works.addScholar', 'Requests', req.id, ['works+' + recs.length], '');
  return { added: recs.length, suspectedDuplicates: dups };
}

/** ตรวจผลงานที่มี DOI กับฐานข้อมูล (Scopus/PubMed โดยตรง + รายชื่อวารสาร) แล้วบันทึกผลไว้กับผลงาน */
function checkWorkDb_(p) {
  const w = DB.get('RequestWorks', p.workId);
  if (!w) throw new Error('ไม่พบผลงาน');
  const req = loadRequestFor_(w.requestId);
  if (!canCollectWorks_(req)) throw new Error('ตรวจได้เฉพาะผู้ยื่นที่แก้ส่วนผลงานได้ หรือเจ้าหน้าที่ผู้ตรวจ');
  if (!w.doi && !w.title) throw new Error('ผลงานนี้ไม่มี DOI หรือชื่อเรื่อง');
  const r = analyzeDocument_({ doi: w.doi, title: w.doi ? '' : w.title });
  if (!r.found) {
    const patch = { database: 'none', dbGroup: 'none', quartile: '', quartileSource: '', proof: '', foundIn: '', links: '[]', dbEvidence: clean_(r.message, 500), checkedAt: nowIso_() };
    DB.update('RequestWorks', w.id, patch);
    return { found: false, message: r.message };
  }
  const f = scholarFields_(r.work);
  const patch = { database: f.database, dbGroup: f.dbGroup, quartile: f.quartile, quartileSource: f.quartileSource, proof: f.proof, foundIn: f.foundIn, links: f.links, dbEvidence: clean_('จับคู่ด้วย ' + r.matchedBy + ' | ' + f.dbEvidence, 2000), checkedAt: f.checkedAt };
  DB.update('RequestWorks', w.id, patch);
  audit_('works.checkDb', 'RequestWorks', w.id, ['database', 'quartile', 'proof'], '');
  return { found: true, database: f.database, quartile: f.quartile, proof: f.proof };
}

/* ---------------- ผู้ดูแล: API key และรายชื่อวารสาร ---------------- */

function scholarAdmin_() {
  requirePerm_('admin.data');
  const inCode = {}; Object.keys(API_KEYS_IN_CODE).forEach(function (k) { inCode[k] = !!String(API_KEYS_IN_CODE[k] || '').trim(); });
  return { keysInCode: inCode, keys: apiKeysStatus_(), lastTest: lastKeyTest_(), journals: journalIndexStats_(), databases: DATABASES, affil: setting_('SCHOLAR_AFFIL'), mailto: setting_('OPENALEX_MAILTO') };
}

/** นำเข้ารายชื่อวารสารจาก CSV (SJR ใช้ ; คั่น / TCI ใช้ ,) — หาคอลัมน์ ISSN ชื่อวารสาร และ Quartile อัตโนมัติ */
function importJournalCsv_(p) {
  requirePerm_('admin.data');
  const text = String(p.csv || '').replace(/^﻿/, '');
  if (!text.trim()) throw new Error('ไฟล์ว่างเปล่า');
  if (text.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15 MB');
  const first = text.split(/\r?\n/)[0];
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = parseCsv_(text, delim);
  const h = (rows[0] || []).map(function (x) { return String(x).trim().toLowerCase(); });
  const issnCols = h.map(function (x, i) { return /issn/.test(x) ? i : -1; }).filter(function (i) { return i > -1; });
  const titleCol = h.findIndex(function (x) { return /^title$|journal|ชื่อ|source title/.test(x); });
  const qCol = h.findIndex(function (x) { return /quartile/.test(x); });
  if (!issnCols.length) throw new Error('ไม่พบคอลัมน์ ISSN ในแถวแรกของไฟล์');
  const list = rows.slice(1).map(function (r) {
    const issns = [];
    issnCols.forEach(function (i) { String(r[i] || '').split(/[,;\s]+/).forEach(function (s) { if (normIssn_(s)) issns.push(s); }); });
    return { title: titleCol > -1 ? r[titleCol] : '', issns: issns, quartile: qCol > -1 ? r[qCol] : '' };
  }).filter(function (x) { return x.issns.length; });
  if (!list.length) throw new Error('ไม่พบ ISSN ที่ถูกต้องในไฟล์');
  const source = clean_(p.source, 60);
  if (!source) throw new Error('ระบุชื่อแหล่งและปีของรายชื่อ เช่น "SJR 2024" หรือ "TCI กลุ่ม 1 (ประกาศ 2568)"');
  return importJournalIndex_({ database: p.database, source: source, replace: true, rows: list });
}

/* ---------------- ค้นหาแบบง่าย: กรอกชื่อ + ช่วงปี ---------------- */

/** แปลข้อผิดพลาดการเรียกเว็บภายนอกให้ผู้ดูแลรู้ว่าต้องทำอะไร */
function explainFetchError_(m) {
  const s = String(m || '');
  if (/UrlFetchApp|external_request|permission|สิทธิ์ในการเรียก|Authorization is required/i.test(s)) {
    return 'สคริปต์ยังไม่ได้รับอนุญาตให้เชื่อมต่อบริการภายนอก — ผู้ดูแลต้องเปิด Apps Script → เลือกฟังก์ชัน testConnection → Run → อนุญาตสิทธิ์ แล้ว Deploy เวอร์ชันใหม่ (' + s.slice(0, 120) + ')';
  }
  if (/DNS|Address unavailable|timed out|Timeout/i.test(s)) return 'ติดต่อฐานข้อมูลไม่ได้ชั่วคราว ลองใหม่อีกครั้ง (' + s.slice(0, 120) + ')';
  if (/Bandwidth quota|Service invoked too many times/i.test(s)) return 'ใช้โควตาการเชื่อมต่อภายนอกของ Google ต่อวันหมดแล้ว — ลองใหม่พรุ่งนี้ (' + s.slice(0, 120) + ')';
  return s;
}

/** หาชื่อภาษาอังกฤษจากข้อมูลบุคคล (MUHR) เมื่อผู้ใช้กรอกแค่ชื่อไทย — ใช้เฉพาะเมื่อพบคนเดียว */
function englishNameFor_(nameTh) {
  try {
    const r = searchPersons_({ name: nameTh });
    const exact = r.results.filter(function (x) { return x.nameEn && x.matchBasis.indexOf('partial') === -1; });
    if (exact.length === 1) return { nameEn: exact[0].nameEn, note: 'ใช้ชื่ออังกฤษ "' + exact[0].nameEn + '" จากข้อมูลบุคคล ' + r.source.label + ' (' + (r.source.connected ? 'ระบบจริง' : r.source.mode === 'mock' ? 'ข้อมูลจำลอง' : 'ข้อมูลนำเข้า') + ')' };
    if (exact.length > 1) return { nameEn: '', note: 'พบชื่อนี้หลายคนในข้อมูลบุคคล — ใส่ชื่ออังกฤษหรือ Scopus ID เองเพื่อให้ค้นได้ตรงคน' };
  } catch (e) { /* แหล่งข้อมูลบุคคลไม่พร้อม — ค้นต่อด้วยชื่อไทย */ }
  return { nameEn: '', note: '' };
}

function quickSearch_(p) {
  me_();
  const cache = CacheService.getScriptCache();
  const k = 'qs_' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(k) || 0) + 1;
  if (n > 30) throw new Error('มีการค้นพร้อมกันมากเกินไป กรุณารอ 1 นาทีแล้วลองใหม่');
  cache.put(k, String(n), 120);

  const name = clean_(p.name, 150);
  let nameTh = hasThai_(name) ? name : '', nameEn = hasThai_(name) ? '' : name;
  if (clean_(p.nameEn, 150)) nameEn = clean_(p.nameEn, 150);
  const q = {
    nameTh: nameTh, nameEn: nameEn, scopusId: clean_(p.scopusId, 30).replace(/\D+/g, ''), orcid: clean_(p.orcid, 60),
    affil: p.affil !== undefined ? clean_(p.affil, 150) : setting_('SCHOLAR_AFFIL'),
    fromYear: Number(p.fromYear) || currentBE_() - 4, toYear: Number(p.toYear) || currentBE_(), openalexId: clean_(p.openalexId, 30)
  };
  if (!q.nameTh && !q.nameEn && !q.scopusId && !q.orcid) throw new Error('กรอกชื่อ-นามสกุลที่ต้องการค้น');
  if (q.fromYear > q.toYear) throw new Error('ปีเริ่มต้องไม่เกินปีสิ้นสุด');
  if (q.toYear - q.fromYear > 30) throw new Error('ช่วงปีกว้างเกินไป (ไม่เกิน 30 ปี)');
  const notes = [];
  if (q.nameTh && !q.nameEn && !q.scopusId && !q.orcid) {
    const en = englishNameFor_(q.nameTh);
    if (en.nameEn) q.nameEn = en.nameEn;
    if (en.note) notes.push(en.note);
    if (!q.nameEn) notes.push('ค้นด้วยชื่อไทยได้เฉพาะฐานไทย (TCI/ThaiJO) — ฐานนานาชาติ (Scopus/WoS/PubMed) ต้องใช้ชื่ออังกฤษ: กด "ตัวเลือกเพิ่มเติม" แล้วใส่ชื่ออังกฤษ');
  }
  const r = searchAll_(q);
  r.status.forEach(function (s) { if (s.mode === 'error') s.message = explainFetchError_(s.message); });
  const allDown = r.status.filter(function (s) { return s.mode === 'error'; }).length >= 3;
  if (allDown) notes.unshift('ค้นฐานข้อมูลภายนอกไม่ได้เกือบทั้งหมด — ' + r.status.filter(function (s) { return s.mode === 'error'; })[0].message);
  audit_('quickSearch', '', '', ['name', 'years'], r.works.length + ' รายการ');
  const g = { intl: 0, tci1: 0, tci2: 0, other: 0 };
  const works = r.works.map(function (w) {
    const grp = w.type !== 'journal' ? 'other' : w.group === 'kpa_intl' ? 'intl' : w.group === 'tci1' ? 'tci1' : w.group === 'tci2' ? 'tci2' : 'other';
    g[grp]++;
    return { title: w.title, journal: w.journal, yearCE: w.yearCE, doi: w.doi, authors: (w.authors || []).slice(0, 8), typeLabel: (PUB_TYPES[w.type] || {}).label,
      group: grp, database: w.database, dbLabel: (DATABASES[w.database] || DATABASES.none).label, quartile: w.quartile, quartileSource: quartileSource_(w),
      proof: w.proof, links: w.links, foundIn: w.foundIn, origins: w.origins };
  });
  return { query: q, notes: notes, works: works, counts: g, status: r.status, candidates: r.candidates, openalexId: r.openalexId, searchedAt: nowIso_(), scopusKey: !!apiKey_('SCOPUS_API_KEY') };
}


/* ======================================================================
 * ส่วน: Discovery.gs (ใช้ร่วมกับระบบ MUGR)
 * ====================================================================== */

/**
 * Discovery.gs — ค้นหาผลงานอัตโนมัติจากชื่อ (ไทย/อังกฤษ) และตรวจไฟล์ผลงานที่แนบ
 *
 * แหล่งข้อมูล (ฟรี ไม่ต้องใช้ API key):
 *  - OpenAlex (api.openalex.org)  : ค้นนักวิจัยและผลงาน, ISSN ของวารสาร, PMID (บอกว่าอยู่ใน PubMed)
 *  - Crossref (api.crossref.org)  : ค้นผลงานจากชื่อผู้แต่งภาษาไทย และค้นจาก DOI สำรอง
 *
 * การจัดกลุ่มฐานข้อมูลตามประกาศ ก.พ.อ. ใช้ "รายชื่อวารสาร" (ชีต JournalIndex) ที่ผู้ดูแลระบบนำเข้า
 * เช่น SJR (Scopus + Quartile), รายชื่อ TCI กลุ่ม 1/2, Web of Science — จับคู่ด้วย ISSN
 * ระบบไม่ตัดสินแทนผู้ตรวจ: ผลงานที่นำเข้าทุกชิ้นมีสถานะ "รอตรวจรับรอง"
 */

const OPENALEX = 'https://api.openalex.org';
const CROSSREF = 'https://api.crossref.org';
const DB_PRIORITY = ['scopus', 'wos', 'pubmed', 'eric', 'mathscinet', 'jstor', 'projectmuse', 'tci1', 'tci2', 'other_intl', 'other_nat', 'tci3'];

/* ---------------- HTTP ---------------- */

function httpJson_(url, extraHeaders) {
  const cache = CacheService.getScriptCache();
  const key = 'h' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url)).slice(0, 22);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  let mail = getSettings_().OPENALEX_MAILTO || '';
  if (!mail) { try { mail = Session.getEffectiveUser().getEmail() || ''; } catch (e) { mail = ''; } } // ไม่มีสิทธิ์อ่านอีเมล → ค้นต่อได้โดยไม่ใส่อีเมล
  const full = url + (mail && url.indexOf(OPENALEX) === 0 ? (url.indexOf('?') > -1 ? '&' : '?') + 'mailto=' + encodeURIComponent(mail) : '');
  const headers = Object.assign({ 'User-Agent': 'MUGR-Academic-Tracker (Apps Script; mailto:' + mail + ')' }, extraHeaders || {});
  const res = UrlFetchApp.fetch(full, { muteHttpExceptions: true, headers: headers });
  const code = res.getResponseCode();
  if (code === 404) return null;
  if (code === 401 || code === 403) {
    let detail = '';
    try { const b = JSON.parse(res.getContentText()); const se = b['service-error'] && b['service-error'].status; detail = se ? ' [' + se.statusCode + ': ' + se.statusText + ']' : (b.error ? ' [' + (b.error.message || b.error) + ']' : ''); } catch (e) { /* not JSON */ }
    throw new Error('API key ไม่ถูกต้องหรือไม่มีสิทธิ์ (' + code + ')' + detail + ' — ถ้าเป็น Scopus ให้ขอ Institutional Token จากหอสมุด แล้วใส่ในหน้าตั้งค่า');
  }
  if (code === 429) throw new Error('ใช้งานเกินโควตาของฐานข้อมูล (429) — ลองใหม่ภายหลัง');
  if (code >= 400) throw new Error('ฐานข้อมูลภายนอกตอบกลับผิดพลาด (' + code + ') กรุณาลองใหม่อีกครั้ง');
  const text = res.getContentText();
  try { if (text.length < 90000) cache.put(key, text, 21600); } catch (e) { /* cache full */ }
  return JSON.parse(text);
}

function shortId_(id) { return String(id || '').replace(/^https?:\/\/openalex\.org\//, ''); }
function cleanDoi_(d) {
  return String(d || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[.,;)\]]+$/, '').toLowerCase();
}
function normIssn_(s) {
  const m = String(s || '').toUpperCase().replace(/[^0-9X]/g, '');
  return m.length === 8 ? m : '';
}
function fmtIssn_(s) { return s ? s.slice(0, 4) + '-' + s.slice(4) : ''; }
function normTitle_(t) { return String(t || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^0-9a-z฀-๿]+/g, ''); }
function hasThai_(s) { return /[฀-๿]/.test(String(s || '')); }

/* ---------------- รายชื่อวารสาร (JournalIndex) ---------------- */

let JOURNAL_MAP_ = null;

/** โหลดรายชื่อวารสารครั้งเดียวต่อการเรียก → { ISSN: [{database, quartile, title, source}] } */
function journalMap_() {
  if (JOURNAL_MAP_) return JOURNAL_MAP_;
  JOURNAL_MAP_ = {};
  DB.all('JournalIndex').forEach(function (r) {
    const k = normIssn_(r.issn);
    if (!k) return;
    (JOURNAL_MAP_[k] = JOURNAL_MAP_[k] || []).push({ database: r.database, quartile: r.quartile || '', title: r.title || '', source: r.source || '' });
  });
  return JOURNAL_MAP_;
}

function journalIndexStats_() {
  const by = {};
  let total = 0;
  DB.all('JournalIndex').forEach(function (r) { by[r.database] = (by[r.database] || 0) + 1; total++; });
  return { total: total, byDatabase: by };
}

/**
 * จัดกลุ่มผลงาน 1 ชิ้นตามประกาศ ก.พ.อ.
 * input: { issns:[], pmid, sourceType, workType, title, journal }
 */
function classify_(w) {
  const map = journalMap_();
  const evidence = [];
  const hits = [];
  (w.issns || []).map(normIssn_).filter(String).forEach(function (k) {
    (map[k] || []).forEach(function (h) { hits.push(Object.assign({ issn: k }, h)); });
  });
  hits.sort(function (a, b) {
    const d = DB_PRIORITY.indexOf(a.database) - DB_PRIORITY.indexOf(b.database);
    return d || String(a.quartile || 'Q9').localeCompare(String(b.quartile || 'Q9'));
  });
  hits.forEach(function (h) {
    const label = (DATABASES[h.database] || { label: h.database }).label;
    const line = 'ISSN ' + fmtIssn_(h.issn) + ' อยู่ในรายชื่อ ' + label + (h.quartile ? ' (' + h.quartile + ')' : '') + (h.source ? ' — แหล่ง: ' + h.source : '');
    if (evidence.indexOf(line) === -1) evidence.push(line);
  });

  let database = hits.length ? hits[0].database : '';
  let quartile = hits.length && hits[0].quartile ? hits[0].quartile : '';
  const dir = w.direct || {};
  const direct = [];
  // ผลที่ค้นเจอในฐานโดยตรงมาก่อนรายชื่อ ISSN — Scopus เป็นอันดับแรก
  if (dir.scopus) {
    direct.push('scopus');
    evidence.unshift('พบในฐาน Scopus โดยตรง (EID ' + dir.scopus.eid + (dir.scopus.agg ? ', ' + dir.scopus.agg : '') + ')');
    const sr = dir.scopus.serial;
    if (sr) {
      evidence.splice(1, 0, 'ข้อมูลวารสารจาก Scopus: ' + (sr.title || '') + (sr.citeScore ? ' · CiteScore ' + sr.citeScore : '') +
        (sr.percentile !== '' ? ' · percentile ' + sr.percentile + (sr.subject ? ' (' + sr.subject + ')' : '') + ' → ' + sr.quartile + ' (CiteScore ' + sr.year + ')' : '') +
        (sr.coverageEnd ? ' · อยู่ใน Scopus ถึงปี ' + sr.coverageEnd : ''));
      if (sr.coverageEnd && w.yearCE && Number(sr.coverageEnd) < Number(w.yearCE)) evidence.push('⚠ วารสารอยู่ใน Scopus ถึงปี ' + sr.coverageEnd + ' แต่ผลงานพิมพ์ปี ' + w.yearCE + ' — ตรวจว่ายังอยู่ในฐานตอนตีพิมพ์');
    }
  }
  if (dir.wos) {
    direct.push('wos');
    const wosListed = hits.some(function (h) { return h.database === 'wos'; });
    evidence.push('พบใน Web of Science Core Collection (' + dir.wos.uid + ')' + (wosListed ? ' และ ISSN อยู่ในรายชื่อ SCIE/SSCI/AHCI' : ' — ตรวจ edition: นับเฉพาะ SCIE/SSCI/AHCI (ESCI ไม่นับ)'));
  }
  if (dir.pubmed) direct.push('pubmed');
  if (dir.eric) { if (dir.eric.journal) { direct.push('eric'); evidence.push('พบในฐาน ERIC (' + dir.eric.id + ', บทความวารสาร)'); } else evidence.push('พบใน ERIC แต่เป็นเอกสารประเภท ED (ไม่ใช่บทความวารสาร)'); }
  const firstDirect = DB_PRIORITY.filter(function (d) { return direct.indexOf(d) > -1; })[0];
  if (firstDirect && (!database || DB_PRIORITY.indexOf(firstDirect) <= DB_PRIORITY.indexOf(database) || (DATABASES[database] || {}).group !== 'kpa_intl')) {
    database = firstDirect;
    const qHit = hits.filter(function (h) { return h.database === firstDirect && /^Q[1-4]$/.test(h.quartile); })[0] ||
                 hits.filter(function (h) { return h.database === 'scopus' && /^Q[1-4]$/.test(h.quartile); })[0];
    quartile = qHit ? qHit.quartile : '';
    if (firstDirect === 'scopus' && !quartile && dir.scopus && dir.scopus.serial && dir.scopus.serial.quartile) {
      quartile = dir.scopus.serial.quartile;
      evidence.push('ใช้ Quartile จาก CiteScore ของ Scopus (ไม่พบในรายชื่อ SJR ที่นำเข้า)');
    } else if (firstDirect === 'scopus' && !quartile) evidence.push('ไม่พบ Quartile ในรายชื่อ SJR ที่นำเข้า — ตรวจที่ scimagojr.com');
  }
  // ถ้าวารสารอยู่หลายฐาน ใช้ Quartile ที่ดีที่สุดของฐานนานาชาติ
  const kpa = hits.filter(function (h) { return (DATABASES[h.database] || {}).group === 'kpa_intl' && /^Q[1-4]$/.test(h.quartile); });
  if (database && (DATABASES[database] || {}).group === 'kpa_intl' && kpa.length) quartile = kpa.map(function (h) { return h.quartile; }).sort()[0];

  if (w.pmid || dir.pubmed) {
    if (direct.indexOf('pubmed') === -1) direct.push('pubmed');
    if (!w.pmid) w.pmid = dir.pubmed.pmid;
    evidence.push('มีรหัส PubMed (PMID ' + w.pmid + ') → อยู่ในฐานข้อมูล PubMed');
    if (!database || DB_PRIORITY.indexOf(database) > DB_PRIORITY.indexOf('pubmed')) { database = 'pubmed'; quartile = quartile || ''; }
  }

  let type = 'journal';
  const st = String(w.sourceType || '').toLowerCase(), wt = String(w.workType || '').toLowerCase();
  if (dir.eric && !dir.eric.journal && !database) type = 'journal';
  else if (st === 'conference' || /proceedings/.test(wt)) type = hasThai_(w.journal) || hasThai_(w.title) ? 'proceedings_nat' : 'proceedings_intl';
  else if (wt === 'book' || wt === 'monograph') type = 'book';

  let confidence = direct.length ? 'high' : (hits.length ? 'high' : 'unknown');
  if (database === 'wos' && direct.indexOf('wos') > -1 && !hits.some(function (h) { return h.database === 'wos'; })) confidence = 'medium';
  if (type === 'journal' && !database) {
    database = 'none';
    confidence = 'unknown';
    if (direct.length || (dir.eric && !dir.eric.journal)) confidence = 'high';
    evidence.push((w.issns || []).length
      ? 'ไม่พบ ISSN ' + w.issns.map(function (s) { return fmtIssn_(normIssn_(s)); }).filter(String).join(', ') + ' ในรายชื่อวารสารที่นำเข้า — ตรวจด้วยตนเองที่ SCImago / TCI / Web of Science'
      : 'ไม่พบ ISSN ของแหล่งเผยแพร่ — ตรวจด้วยตนเอง');
  }
  if (type !== 'journal') { evidence.push('ประเภท: ' + PUB_TYPES[type].label + ' (จากข้อมูลแหล่งเผยแพร่)' + (dir.scopus ? ' — อยู่ใน Scopus' : '')); confidence = 'medium'; }

  const db = DATABASES[type === 'journal' ? database : 'none'] || DATABASES.none;
  const p = { type: type, database: type === 'journal' ? database : 'none', quartile: type === 'journal' && db.quartile ? quartile : '' };
  const wt2 = pubWeight_(p, getSettings_());
  return Object.assign(p, {
    level: type === 'journal' ? db.level : (PUB_TYPES[type].level || ''),
    group: type === 'journal' ? db.group : 'other',
    accepted: isAccepted_(p),
    weight: wt2.w, basis: wt2.basis, confidence: confidence, evidence: evidence, foundIn: direct,
    scopusUrl: dir.scopus ? scopusRecordUrl_(dir.scopus.eid) : '',
    scopusSourceUrl: dir.scopus && dir.scopus.serial ? dir.scopus.serial.url : ''
  });
}

/* ---------------- OpenAlex / Crossref → รูปแบบกลาง ---------------- */

function fromOpenAlex_(w) {
  const loc = w.primary_location || {};
  const src = loc.source || {};
  const issns = [].concat(src.issn || [], src.issn_l ? [src.issn_l] : []).filter(String);
  const pmid = w.ids && w.ids.pmid ? String(w.ids.pmid).replace(/\D+/g, '') : '';
  return {
    sourceId: shortId_(w.id), origin: 'OpenAlex',
    title: w.title || w.display_name || '', journal: src.display_name || '', publisher: src.host_organization_name || '',
    yearCE: Number(w.publication_year) || 0, doi: cleanDoi_(w.doi), url: w.doi || loc.landing_page_url || '',
    issns: issns.filter(function (v, i, a) { return a.indexOf(v) === i; }), pmid: pmid,
    sourceType: src.type || '', workType: w.type || '',
    authors: (w.authorships || []).map(function (a) { return a.author && a.author.display_name ? a.author.display_name : a.raw_author_name; }).filter(String).slice(0, 12)
  };
}

function fromCrossref_(it) {
  const parts = (it.issued && it.issued['date-parts'] && it.issued['date-parts'][0]) || (it['published-print'] && it['published-print']['date-parts'][0]) || [];
  return {
    sourceId: it.DOI, origin: 'Crossref',
    title: (it.title || [])[0] || '', journal: (it['container-title'] || [])[0] || '', publisher: it.publisher || '',
    yearCE: Number(parts[0]) || 0, doi: cleanDoi_(it.DOI), url: it.DOI ? 'https://doi.org/' + it.DOI : (it.URL || ''),
    issns: it.ISSN || [], pmid: '',
    sourceType: /proceedings/.test(it.type || '') ? 'conference' : 'journal', workType: it.type || '',
    authors: (it.author || []).map(function (a) { return [a.given, a.family].filter(String).join(' ') || a.name || ''; }).filter(String).slice(0, 12)
  };
}

/** เติมการจัดกลุ่ม + ปี พ.ศ. + ตรวจซ้ำกับผลงานในระบบ */
function finishWorks_(list, person) {
  const settings = getSettings_();
  const win = evalWindow_(settings);
  const existing = !TABLES.Publications ? [] : DB.all('Publications').filter(function (p) { return !person || (p.personType === person.personType && p.personId === person.personId); });
  const doiSet = {}, titleSet = {};
  existing.forEach(function (p) { if (p.doi) doiSet[cleanDoi_(p.doi)] = 1; if (normTitle_(p.title)) titleSet[normTitle_(p.title)] = 1; });
  const seen = {};
  return list.filter(function (w) {
    const k = w.doi || normTitle_(w.title) || 'issn:' + (w.issns || []).join(',');
    if (!k || seen[k]) return false;
    seen[k] = 1; return true;
  }).map(function (w) {
    const c = classify_(w);
    const year = w.yearCE ? w.yearCE + 543 : 0;
    const v = verifyLinks_(w, c);
    return Object.assign({}, w, c, {
      year: year, links: v.links, proof: v.proof,
      inWindow: year >= win.start && year <= win.end,
      expired: year > 0 && year < win.start,
      duplicate: !!((w.doi && doiSet[w.doi]) || (normTitle_(w.title) && titleSet[normTitle_(w.title)]))
    });
  }).sort(function (a, b) { return b.year - a.year; });
}

/**
 * ลิงก์ยืนยันว่าผลงาน/วารสารอยู่ในฐานตามประกาศจริง
 * proof: 'record'  = พบตัวบทความในฐานที่จัดกลุ่มโดยตรง
 *        'journal' = ยืนยันจากรายชื่อวารสาร (ISSN) เท่านั้น
 *        ''        = ยังยืนยันไม่ได้
 */
function verifyLinks_(w, c) {
  const d = w.direct || {};
  const issn = (w.issns || []).map(normIssn_).filter(String)[0] || '';
  const fi = fmtIssn_(issn);
  const L = [];
  const add = function (db, kind, label, url) { if (url && !L.some(function (x) { return x.url === url; })) L.push({ db: db, kind: kind, label: label, url: url }); };
  if (d.scopus) add('scopus', 'record', 'บทความใน Scopus', scopusRecordUrl_(d.scopus.eid));
  if (d.scopus && d.scopus.serial && d.scopus.serial.url) add('scopus', 'journal', 'วารสารใน Scopus', d.scopus.serial.url);
  if (d.wos) add('wos', 'record', 'บทความใน Web of Science', 'https://www.webofscience.com/wos/woscc/full-record/' + encodeURIComponent(d.wos.uid));
  if ((d.wos || c.database === 'wos') && fi) add('wos', 'journal', 'ตรวจ SCIE/SSCI/AHCI (Master Journal List)', 'https://mjl.clarivate.com/search-results?issn=' + fi);
  const pmid = w.pmid || (d.pubmed && d.pubmed.pmid);
  if (pmid) add('pubmed', 'record', 'บทความใน PubMed', 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/');
  if (d.eric) add('eric', 'record', 'บทความใน ERIC', 'https://eric.ed.gov/?id=' + encodeURIComponent(d.eric.id));
  if ((c.database === 'scopus' || d.scopus) && issn) add('scopus', 'journal', 'Quartile ที่ SCImago (SJR)', 'https://www.scimagojr.com/journalsearch.php?q=' + issn);
  if (/^tci/.test(c.database) && fi) add(c.database, 'journal', 'ตรวจกลุ่มวารสาร TCI (ค้นด้วย ISSN ' + fi + ')', 'https://tci-thailand.org/');
  if (w.doi) add('doi', 'record', 'DOI', 'https://doi.org/' + w.doi);
  let proof = '';
  if (c.database && c.database !== 'none' && L.some(function (x) { return x.db === c.database && x.kind === 'record'; })) proof = 'record';
  else if (c.database && c.database !== 'none' && c.confidence !== 'unknown') proof = 'journal';
  else if (c.type !== 'journal' && L.some(function (x) { return x.kind === 'record' && ['scopus', 'wos', 'pubmed', 'eric'].indexOf(x.db) > -1; })) proof = 'record';
  return { links: L, proof: proof };
}

/* ---------------- Actions ---------------- */

/** ค้นนักวิจัยจากชื่อภาษาอังกฤษ (OpenAlex) */
function findAuthors_(p) {
  const name = String(p.nameEn || '').trim();
  if (!name) return { candidates: [], note: 'กรอกชื่อภาษาอังกฤษเพื่อค้นใน OpenAlex' };
  const r = httpJson_(OPENALEX + '/authors?search=' + encodeURIComponent(name) + '&per_page=8&select=id,display_name,display_name_alternatives,works_count,cited_by_count,orcid,last_known_institutions');
  const list = ((r && r.results) || []).map(function (a) {
    const inst = (a.last_known_institutions || [])[0] || {};
    return { id: shortId_(a.id), name: a.display_name, alt: (a.display_name_alternatives || []).slice(0, 3), works: a.works_count || 0, cited: a.cited_by_count || 0,
      orcid: a.orcid || '', institution: inst.display_name || '', country: inst.country_code || '' };
  });
  // ให้ผู้ที่สังกัดในประเทศไทยขึ้นก่อน
  list.sort(function (a, b) { return (b.country === 'TH') - (a.country === 'TH') || b.works - a.works; });
  return { candidates: list };
}

/** ดึงผลงานของนักวิจัย (OpenAlex) + ผลงานจากชื่อไทย (Crossref) แล้วจัดกลุ่มตามประกาศ */
function findWorks_(p) {
  const fromYearCE = (Number(p.fromYear) || evalWindow_(getSettings_()).start) - 543;
  const list = [];
  const sources = [];
  if (p.authorId) {
    const sel = 'id,doi,title,display_name,publication_year,type,ids,primary_location,authorships';
    const r = httpJson_(OPENALEX + '/works?filter=author.id:' + encodeURIComponent(p.authorId) + ',from_publication_date:' + fromYearCE + '-01-01&per_page=100&sort=publication_year:desc&select=' + sel);
    ((r && r.results) || []).forEach(function (w) { list.push(fromOpenAlex_(w)); });
    sources.push('OpenAlex ' + ((r && r.results) || []).length + ' รายการ');
  }
  const th = String(p.nameTh || '').trim();
  if (th) {
    const r2 = httpJson_(CROSSREF + '/works?query.author=' + encodeURIComponent(th) + '&filter=from-pub-date:' + fromYearCE + '&rows=40&select=DOI,title,ISSN,container-title,issued,type,author,publisher,URL');
    const items = ((r2 && r2.message && r2.message.items) || []).filter(function (it) {
      // Crossref ค้นแบบคลุมเครือ — เก็บเฉพาะรายการที่มีชื่อผู้แต่งตรงกับชื่อไทยจริง
      const key = th.replace(/\s+/g, '');
      return (it.author || []).some(function (a) { return ([a.given, a.family].join('') + (a.name || '')).replace(/\s+/g, '').indexOf(key) > -1; });
    });
    items.forEach(function (it) { list.push(fromCrossref_(it)); });
    sources.push('Crossref (ชื่อไทย) ' + items.length + ' รายการ');
  }
  const person = p.personId ? { personType: p.personType || 'faculty', personId: p.personId } : null;
  const works = finishWorks_(list, person);
  return { works: works, sources: sources, summary: summarize_(works), journalIndex: journalIndexStats_() };
}

function summarize_(works) {
  const s = { intl: 0, nat: 0, other: 0, unknown: 0, inWindow: 0 };
  works.forEach(function (w) {
    if (w.inWindow) s.inWindow++;
    if (w.confidence === 'unknown') s.unknown++;
    else if (w.group === 'kpa_intl') s.intl++;
    else if (w.group === 'tci1' || w.group === 'tci2') s.nat++;
    else s.other++;
  });
  return s;
}

/** ตรวจไฟล์ผลงาน: รับข้อความที่อ่านจากไฟล์ (หรือ DOI/ชื่อเรื่องที่พิมพ์) → หาเมทาดาทาจริง → จัดกลุ่ม */
function analyzeDocument_(p) {
  const text = String(p.text || '').slice(0, 60000);
  let doi = cleanDoi_(p.doi);
  if (!doi) { const m = text.match(/\b(10\.\d{4,9}\/[^\s"'<>]+)/i); if (m) doi = cleanDoi_(m[1]); }
  const issnFound = [];
  const re = /\b(\d{4}-\d{3}[\dXx])\b/g;
  let m2;
  while ((m2 = re.exec(text)) && issnFound.length < 6) { if (issnFound.indexOf(m2[1].toUpperCase()) === -1) issnFound.push(m2[1].toUpperCase()); }
  [].concat(p.issns || []).forEach(function (s) { if (normIssn_(s) && issnFound.indexOf(s) === -1) issnFound.push(s); });

  let work = null, matchedBy = '';
  if (doi) {
    const r = httpJson_(OPENALEX + '/works/doi:' + encodeURIComponent(doi));
    if (r && r.id) { work = fromOpenAlex_(r); matchedBy = 'DOI ' + doi + ' (OpenAlex)'; }
    else {
      const c = httpJson_(CROSSREF + '/works/' + encodeURIComponent(doi));
      if (c && c.message) { work = fromCrossref_(c.message); matchedBy = 'DOI ' + doi + ' (Crossref)'; }
    }
  }
  const title = String(p.title || '').trim();
  if (!work && title.length > 12) {
    const r = httpJson_(OPENALEX + '/works?search=' + encodeURIComponent(title.slice(0, 250)) + '&per_page=3&select=id,doi,title,display_name,publication_year,type,ids,primary_location,authorships');
    const best = ((r && r.results) || []).filter(function (w) {
      const a = normTitle_(w.title), b = normTitle_(title);
      return a && b && (a.indexOf(b.slice(0, 40)) > -1 || b.indexOf(a.slice(0, 40)) > -1);
    })[0];
    if (best) { work = fromOpenAlex_(best); matchedBy = 'ชื่อบทความ (OpenAlex)'; }
  }
  if (!work) {
    if (!issnFound.length) return { found: false, doi: doi, issns: [], message: 'ไม่พบ DOI, ISSN หรือชื่อบทความที่ค้นเจอในฐานข้อมูล — ลองพิมพ์ DOI หรือชื่อบทความด้วยตนเอง' };
    work = { title: title, journal: '', yearCE: 0, doi: doi, url: doi ? 'https://doi.org/' + doi : '', issns: issnFound, pmid: '', sourceType: 'journal', workType: 'article', authors: [], origin: 'ไฟล์' };
    matchedBy = 'ISSN ที่พบในไฟล์';
  } else {
    issnFound.forEach(function (s) { if (work.issns.indexOf(s) === -1) work.issns.push(s); });
  }
  const dc = directChecksByDoi_(work.doi || doi);
  work.direct = Object.assign({}, work.direct || {}, dc.direct);
  if (!work.pmid && dc.pmid) work.pmid = dc.pmid;
  const res = finishWorks_([work], null)[0];
  res.evidence = res.evidence.concat(dc.evidence);
  // เดาเจ้าของผลงานจากรายชื่อผู้แต่ง
  const owners = [];
  const names = (work.authors || []).map(function (a) { return String(a).toLowerCase(); }).join(' | ');
  (TABLES.Faculty ? DB.all('Faculty').concat(DB.all('Experts').map(function (x) { return Object.assign({ _expert: true }, x); })) : []).forEach(function (f) {
    const en = String(f.nameEn || '').toLowerCase().trim();
    const last = en.split(/\s+/).pop();
    if ((last && last.length > 2 && names.indexOf(last) > -1) || (f.nameTh && (work.authors || []).join(' ').indexOf(String(f.nameTh).split(/\s+/)[0]) > -1 && hasThai_(f.nameTh))) {
      owners.push({ personType: f._expert ? 'expert' : 'faculty', personId: f.id, name: personName_(f) });
    }
  });
  return { found: true, matchedBy: matchedBy, work: res, owners: owners.slice(0, 5), doi: doi, issnsInFile: issnFound };
}

/** นำผลงานที่เลือกเข้าระบบ (สถานะ: รอตรวจรับรอง) */
function importWorks_(p) {
  const personType = p.personType === 'expert' ? 'expert' : 'faculty';
  if (!p.personId) throw new Error('กรุณาเลือกบุคคลที่จะนำเข้าผลงาน');
  if (!canEditPerson_(personType, p.personId)) throw new Error('คุณไม่มีสิทธิ์เพิ่มผลงานให้บุคคลนี้');
  const works = [].concat(p.works || []).slice(0, 200);
  if (!works.length) throw new Error('ยังไม่ได้เลือกผลงาน');
  const existing = DB.all('Publications').filter(function (x) { return x.personType === personType && x.personId === p.personId; });
  const dois = {}, titles = {};
  existing.forEach(function (x) { if (x.doi) dois[cleanDoi_(x.doi)] = 1; titles[normTitle_(x.title)] = 1; });
  const u = currentUser_();
  const rows = [];
  works.forEach(function (w) {
    const doi = cleanDoi_(w.doi);
    if ((doi && dois[doi]) || titles[normTitle_(w.title)]) return;
    const year = Number(w.year);
    if (!String(w.title || '').trim() || !(year >= 2500 && year <= 2700)) return;
    const type = PUB_TYPES[w.type] ? w.type : 'journal';
    const db = type === 'journal' && DATABASES[w.database] ? w.database : 'none';
    rows.push({ personType: personType, personId: p.personId, title: String(w.title).trim().slice(0, 500), source: String(w.journal || '').slice(0, 300),
      year: year, type: type, database: db, quartile: db !== 'none' && DATABASES[db].quartile && /^Q[1-4]$/.test(w.quartile) ? w.quartile : '',
      authorRole: '', doi: doi, url: w.url || (doi ? 'https://doi.org/' + doi : ''), status: 'pending',
      note: ('นำเข้าอัตโนมัติ (' + (w.origin || 'ระบบ') + '): ' + [].concat(w.evidence || []).join(' / ')).slice(0, 900),
      isSample: false, createdBy: u.email });
    if (doi) dois[doi] = 1;
    titles[normTitle_(w.title)] = 1;
  });
  DB.insertMany('Publications', rows);
  audit_('import_works', personType + ':' + p.personId + ' +' + rows.length);
  return { imported: rows.length, skipped: works.length - rows.length };
}

/** บันทึกไฟล์ผลงานที่แนบไว้ใน Google Drive เป็นหลักฐาน */
function saveEvidence_(p) {
  const u = currentUser_();
  if (u.role === 'executive') throw new Error('คุณไม่มีสิทธิ์อัปโหลดไฟล์');
  const bytes = Utilities.base64Decode(String(p.base64 || ''));
  if (!bytes.length) throw new Error('ไม่พบข้อมูลไฟล์');
  if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15 MB');
  const it = DriveApp.getFoldersByName(APP.evidenceFolder);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(APP.evidenceFolder);
  const name = String(p.fileName || 'ผลงาน.pdf').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 150);
  const file = folder.createFile(Utilities.newBlob(bytes, p.mimeType || 'application/pdf', name));
  audit_('upload_evidence', name);
  return { url: file.getUrl(), name: name };
}

/** นำเข้ารายชื่อวารสาร (ISSN → ฐานข้อมูล/Quartile) */
function importJournalIndex_(p) {
  requireRole_(['admin']);
  const database = p.database;
  if (!DATABASES[database] || database === 'none') throw new Error('กรุณาเลือกฐานข้อมูลของรายชื่อนี้');
  const source = String(p.source || database).slice(0, 60);
  if (p.replace) DB.removeWhere('JournalIndex', function (r) { return r.database === database && r.source === source; });
  const seen = {};
  const rows = [];
  [].concat(p.rows || []).forEach(function (r) {
    const q = /^Q[1-4]$/i.test(String(r.quartile || '').trim()) ? String(r.quartile).trim().toUpperCase() : '';
    [].concat(r.issns || []).forEach(function (s) {
      const k = normIssn_(s);
      if (!k || seen[k]) return;
      seen[k] = 1;
      rows.push({ issn: k, title: String(r.title || '').slice(0, 200), database: database, quartile: DATABASES[database].quartile ? q : '', source: source, updatedAt: nowIso_() });
    });
  });
  DB.insertMany('JournalIndex', rows);
  audit_('import_journals', database + ' ' + source + ' +' + rows.length);
  return { added: rows.length, stats: journalIndexStats_() };
}

function clearJournalIndex_(p) {
  requireRole_(['admin']);
  const n = DB.removeWhere('JournalIndex', function (r) { return !p.database || r.database === p.database; });
  audit_('clear_journals', (p.database || 'all') + ' -' + n);
  return { removed: n, stats: journalIndexStats_() };
}


/* ======================================================================
 * ส่วน: Sources.gs (ใช้ร่วมกับระบบ MUGR)
 * ====================================================================== */

/**
 * Sources.gs — ค้นผลงานจากฐานข้อมูลตามประกาศ ก.พ.อ. โดยตรง เรียงตามลำดับความสำคัญ
 *
 *   1. Scopus          (Elsevier Scopus Search API — ต้องมี API key ของสถาบัน)
 *   2. Web of Science  (Clarivate WoS Starter API — ต้องมี API key)
 *   3. PubMed          (NCBI E-utilities — ฟรี)
 *   4. ERIC            (ERIC API — ฟรี)
 *   5. TCI / ThaiJO    (Crossref + OpenAlex ด้วยชื่อไทย แล้วจับคู่ ISSN กับรายชื่อ TCI กลุ่ม 1/2)
 *   6. OpenAlex        (ฐานรวมขนาดใหญ่ — เก็บผลงานที่เหลือ เช่น JSTOR, MathSciNet, Project Muse ผ่านรายชื่อ ISSN)
 *
 * ผลงานจากทุกฐานถูกรวมและตัดรายการซ้ำด้วย DOI / ชื่อบทความ แต่ละชิ้นบอกว่า "พบในฐานใดบ้าง"
 * API key เก็บใน Script Properties (ไม่อยู่ในชีต และไม่ถูกส่งไปหน้าเว็บ)
 */

const SCOPUS_API = 'https://api.elsevier.com/content/search/scopus';
const WOS_API = 'https://api.clarivate.com/apis/wos-starter/v1/documents';
const PUBMED_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const ERIC_API = 'https://api.ies.ed.gov/eric/';

const SOURCE_ORDER = [
  { key: 'scopus', label: 'Scopus', step: 1 },
  { key: 'wos', label: 'Web of Science', step: 2 },
  { key: 'pubmed', label: 'PubMed', step: 3 },
  { key: 'eric', label: 'ERIC', step: 4 },
  { key: 'tci', label: 'TCI / ThaiJO (ชื่อไทย)', step: 5 },
  { key: 'openalex', label: 'OpenAlex (ฐานรวม)', step: 6 }
];

const API_KEY_NAMES = ['SCOPUS_API_KEY', 'SCOPUS_INSTTOKEN', 'WOS_API_KEY', 'NCBI_API_KEY'];

function apiKey_(name) {
  // กุญแจที่ตั้งในโค้ด (API_KEYS_IN_CODE — ถ้าระบบนั้นกำหนดไว้) มาก่อน แล้วจึงใช้ค่าใน Script Properties
  const inCode = typeof API_KEYS_IN_CODE !== 'undefined' && API_KEYS_IN_CODE[name] ? String(API_KEYS_IN_CODE[name]).trim() : '';
  return inCode || PropertiesService.getScriptProperties().getProperty(name) || '';
}

function apiKeysStatus_() {
  requireRole_(['admin']);
  const o = {};
  API_KEY_NAMES.forEach(function (k) { o[k] = !!apiKey_(k); });
  return o;
}

function saveApiKeys_(p) {
  requireRole_(['admin']);
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('LAST_KEY_TEST');
  API_KEY_NAMES.forEach(function (k) {
    if (p['clear_' + k]) props.deleteProperty(k);
    else if (String(p[k] || '').trim()) props.setProperty(k, String(p[k]).trim());
  });
  audit_('api_keys', API_KEY_NAMES.filter(function (k) { return p[k] || p['clear_' + k]; }).join(','));
  return apiKeysStatus_();
}

/** ผลการทดสอบการเชื่อมต่อครั้งล่าสุด (แสดงในหน้าเว็บ) */
function lastKeyTest_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('LAST_KEY_TEST') || 'null'); } catch (e) { return null; } }

/** ทดสอบการเชื่อมต่อ Scopus / WoS ด้วย key ที่บันทึกไว้ */
function testApiKeys_() {
  requireRole_(['admin']);
  const out = {};
  const sk = apiKey_('SCOPUS_API_KEY');
  if (!sk) out.scopus = { ok: false, message: 'ยังไม่ได้ใส่ Scopus API key' };
  else {
    try {
      const h = { 'X-ELS-APIKey': sk, Accept: 'application/json' };
      if (apiKey_('SCOPUS_INSTTOKEN')) h['X-ELS-Insttoken'] = apiKey_('SCOPUS_INSTTOKEN');
      const r = httpJson_(SCOPUS_API + '?query=' + encodeURIComponent('AFFIL(Mahidol University)') + '&count=1&field=eid&nocache=' + Date.now(), h);
      const n = Number(r && r['search-results'] && r['search-results']['opensearch:totalResults']) || 0;
      const ser = scopusSerial_('17441730', h);
      out.scopus = { ok: true, message: 'เชื่อมต่อ Scopus สำเร็จ — ทดสอบค้น AFFIL(Mahidol University) พบ ' + n.toLocaleString() + ' รายการ · ' +
        (ser ? 'ดึงข้อมูลวารสาร (CiteScore/Quartile) ได้' : 'ดึงข้อมูลวารสาร (Serial Title API) ไม่ได้ — จะใช้ Quartile จากรายชื่อ SJR ที่นำเข้าแทน') };
    } catch (e) { out.scopus = { ok: false, message: e.message + ' · ถ้าขึ้น 401/403 ให้ขอ Institutional Token จากหอสมุด แล้วใส่ช่อง Scopus Institutional Token' }; }
  }
  const wk = apiKey_('WOS_API_KEY');
  if (!wk) out.wos = { ok: false, message: 'ยังไม่ได้ใส่ Web of Science API key (ไม่บังคับ)' };
  else {
    try {
      const r = httpJson_(WOS_API + '?db=WOS&limit=1&q=' + encodeURIComponent('OG=(Mahidol University)') + '&nocache=' + Date.now(), { 'X-ApiKey': wk, Accept: 'application/json' });
      out.wos = { ok: true, message: 'เชื่อมต่อ Web of Science สำเร็จ — พบ ' + ((r && r.metadata && r.metadata.total) || 0).toLocaleString() + ' รายการ' };
    } catch (e) { out.wos = { ok: false, message: e.message }; }
  }
  audit_('api_test', JSON.stringify({ scopus: out.scopus.ok, wos: out.wos.ok }));
  out.ts = nowIso_();
  PropertiesService.getScriptProperties().setProperty('LAST_KEY_TEST', JSON.stringify(out));
  return out;
}

/** แยกชื่ออังกฤษ "Firstname Lastname" → { first, last, initial } */
function splitName_(en) {
  const parts = String(en || '').replace(/[,.]/g, ' ').trim().split(/\s+/).filter(String);
  if (!parts.length) return null;
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const first = parts.length > 1 ? parts[0] : '';
  return { first: first, last: last, initial: first ? first.charAt(0).toUpperCase() : '' };
}

/* ---------------- 1. Scopus ---------------- */

function searchScopus_(p, fromCE, toCE) {
  const key = apiKey_('SCOPUS_API_KEY');
  if (!key) return { mode: 'list', items: [], message: 'ยังไม่ได้ใส่ Scopus API key — ตรวจผ่านรายชื่อวารสาร SJR (ISSN) แทน' };
  const n = splitName_(p.nameEn);
  let q;
  if (p.scopusId) q = 'AU-ID(' + String(p.scopusId).replace(/\D+/g, '') + ')';
  else if (n) q = 'AUTHLASTNAME(' + n.last + ')' + (n.first ? ' AND AUTHFIRST(' + n.first + ')' : '');
  else return { mode: 'skipped', items: [], message: 'ต้องมีชื่อภาษาอังกฤษหรือ Scopus Author ID' };
  const affil = String(p.affil || '').trim().replace(/["()]/g, '');
  if (affil && !p.scopusId) q += ' AND AFFIL("' + affil + '")';
  const headers = scopusHeaders_(key);
  const fields = 'dc:title,prism:publicationName,prism:issn,prism:eIssn,prism:coverDate,prism:doi,dc:creator,subtypeDescription,prism:aggregationType,eid,pubmed-id,source-id';
  const items = [];
  let total = 0;
  for (let start = 0; start < 200; start += 25) {
    const r = httpJson_(SCOPUS_API + '?query=' + encodeURIComponent(q) + '&date=' + fromCE + '-' + toCE + '&count=25&start=' + start + '&field=' + fields, headers);
    const sr = (r && r['search-results']) || {};
    total = Number(sr['opensearch:totalResults']) || 0;
    const entries = (sr.entry || []).filter(function (e) { return !e.error; });
    entries.forEach(function (e) {
      const agg = String(e['prism:aggregationType'] || '');
      items.push({
        origin: 'Scopus', sourceId: e.eid, title: e['dc:title'] || '', journal: e['prism:publicationName'] || '',
        yearCE: Number(String(e['prism:coverDate'] || '').slice(0, 4)) || 0, doi: cleanDoi_(e['prism:doi']),
        url: e['prism:doi'] ? 'https://doi.org/' + e['prism:doi'] : scopusRecordUrl_(e.eid), scopusUrl: scopusRecordUrl_(e.eid),
        issns: [e['prism:issn'], e['prism:eIssn']].filter(String), pmid: e['pubmed-id'] || '',
        sourceType: /conference/i.test(agg) ? 'conference' : 'journal', workType: /book/i.test(agg) && !/series/i.test(agg) ? 'book' : (e.subtypeDescription || ''),
        authors: e['dc:creator'] ? [e['dc:creator']] : [],
        direct: { scopus: { eid: e.eid, agg: agg, sourceId: e['source-id'] || '' } }
      });
    });
    if (start + 25 >= total || !entries.length) break;
  }
  // ยืนยันวารสารกับ Scopus โดยตรง (CiteScore / Quartile / ปีที่ยังอยู่ในฐาน)
  const serials = {};
  items.forEach(function (it) {
    const k = it.issns.map(normIssn_).filter(String)[0];
    if (!k) return;
    if (!(k in serials)) serials[k] = Object.keys(serials).length < 40 ? scopusSerial_(k, headers) : null;
    if (serials[k]) it.direct.scopus.serial = serials[k];
  });
  const verifyUrl = 'https://www.scopus.com/results/results.uri?src=s&sot=a&sdt=a&s=' + encodeURIComponent(q + ' AND PUBYEAR > ' + (fromCE - 1) + ' AND PUBYEAR < ' + (toCE + 1));
  return { mode: 'direct', items: items, message: 'ค้นโดยตรงด้วย ' + q + ' (' + total + ' รายการ)', query: q, link: verifyUrl,
    authorUrl: p.scopusId ? 'https://www.scopus.com/authid/detail.uri?authorId=' + String(p.scopusId).replace(/\D+/g, '') : '' };
}

function scopusHeaders_(key) {
  const h = { 'X-ELS-APIKey': key || apiKey_('SCOPUS_API_KEY'), Accept: 'application/json' };
  if (apiKey_('SCOPUS_INSTTOKEN')) h['X-ELS-Insttoken'] = apiKey_('SCOPUS_INSTTOKEN');
  return h;
}
function scopusRecordUrl_(eid) { return eid ? 'https://www.scopus.com/record/display.uri?eid=' + encodeURIComponent(eid) + '&origin=resultslist' : ''; }

/** เก็บค่า percentile ทุกตัวในข้อมูล CiteScore (โครงสร้าง JSON ซ้อนหลายชั้น) */
function collectPercentiles_(o, out, subj) {
  if (!o || typeof o !== 'object') return out;
  if (Array.isArray(o)) { o.forEach(function (x) { collectPercentiles_(x, out, subj); }); return out; }
  if (o.percentile !== undefined && !isNaN(Number(o.percentile))) out.push({ p: Number(o.percentile), code: o.subjectCode || '', rank: o.rank || '' });
  Object.keys(o).forEach(function (k) { if (k !== 'percentile') collectPercentiles_(o[k], out, subj); });
  return out;
}

/** ข้อมูลวารสารจาก Scopus Serial Title API → { title, quartile, percentile, citeScore, year, coverageEnd, url } */
function scopusSerial_(issn, headers) {
  try {
    const r = httpJson_('https://api.elsevier.com/content/serial/title/issn/' + issn + '?view=CITESCORE', headers || scopusHeaders_());
    const e = r && r['serial-metadata-response'] && (r['serial-metadata-response'].entry || [])[0];
    if (!e || e.error) return null;
    const info = e.citeScoreYearInfoList || {};
    const years = [].concat(info.citeScoreYearInfo || []).filter(function (y) { return !y['@status'] || /complete/i.test(y['@status']); });
    const latest = years.sort(function (a, b) { return Number(b['@year']) - Number(a['@year']); })[0];
    const pcts = collectPercentiles_(latest || info, []);
    const best = pcts.sort(function (a, b) { return b.p - a.p; })[0];
    const q = !best ? '' : best.p >= 75 ? 'Q1' : best.p >= 50 ? 'Q2' : best.p >= 25 ? 'Q3' : 'Q4';
    const subj = [].concat(e['subject-area'] || []).filter(function (s) { return best && String(s['@code']) === String(best.code); })[0];
    const link = [].concat(e.link || []).filter(function (l) { return l['@ref'] === 'scopus-source'; })[0];
    return {
      title: e['dc:title'] || '', quartile: q, percentile: best ? best.p : '', subject: subj ? subj['$'] : '',
      citeScore: info.citeScoreCurrentMetric || '', year: latest ? latest['@year'] : (info.citeScoreCurrentMetricYear || ''),
      coverageStart: e.coverageStartYear || '', coverageEnd: e.coverageEndYear || '',
      url: link ? link['@href'] : (e['source-id'] ? 'https://www.scopus.com/sourceid/' + e['source-id'] : '')
    };
  } catch (err) { return null; }
}

/* ---------------- 2. Web of Science ---------------- */

function searchWos_(p, fromCE, toCE) {
  const key = apiKey_('WOS_API_KEY');
  if (!key) return { mode: 'list', items: [], message: 'ยังไม่ได้ใส่ Web of Science API key — ตรวจผ่านรายชื่อวารสาร WoS (ISSN) ถ้านำเข้าไว้' };
  const n = splitName_(p.nameEn);
  if (!n) return { mode: 'skipped', items: [], message: 'ต้องมีชื่อภาษาอังกฤษ' };
  const q = 'AU=(' + n.last + (n.initial ? ' ' + n.initial : '') + ') AND PY=(' + fromCE + '-' + toCE + ')';
  const r = httpJson_(WOS_API + '?db=WOS&limit=50&q=' + encodeURIComponent(q), { 'X-ApiKey': key, Accept: 'application/json' });
  const items = ((r && r.hits) || []).map(function (h) {
    const id = h.identifiers || {}, src = h.source || {};
    return {
      origin: 'Web of Science', sourceId: h.uid, title: h.title || '', journal: src.sourceTitle || '',
      yearCE: Number(src.publishYear) || 0, doi: cleanDoi_(id.doi), url: id.doi ? 'https://doi.org/' + id.doi : '',
      issns: [id.issn, id.eissn].filter(String), pmid: id.pmid || '',
      sourceType: (h.sourceTypes || []).join(' ').match(/proceeding/i) ? 'conference' : 'journal', workType: (h.types || []).join(','),
      authors: ((h.names && h.names.authors) || []).map(function (a) { return a.displayName || a.wosStandard; }).slice(0, 12),
      direct: { wos: { uid: h.uid } }
    };
  });
  return { mode: 'direct', items: items, message: 'ค้นโดยตรงด้วย ' + q + ' (' + ((r && r.metadata && r.metadata.total) || items.length) + ' รายการ)', query: q };
}

/* ---------------- 3. PubMed ---------------- */

function searchPubmed_(p, fromCE, toCE) {
  const n = splitName_(p.nameEn);
  if (!n) return { mode: 'skipped', items: [], message: 'ต้องมีชื่อภาษาอังกฤษ' };
  const key = apiKey_('NCBI_API_KEY');
  const term = n.last + ' ' + (n.initial || '') + '[Author] AND ' + fromCE + ':' + toCE + '[dp]';
  const s = httpJson_(PUBMED_API + '/esearch.fcgi?db=pubmed&retmode=json&retmax=100&term=' + encodeURIComponent(term) + (key ? '&api_key=' + key : ''));
  const ids = (s && s.esearchresult && s.esearchresult.idlist) || [];
  if (!ids.length) return { mode: 'direct', items: [], message: 'ค้นโดยตรงด้วย ' + term + ' (0 รายการ)', query: term };
  const d = httpJson_(PUBMED_API + '/esummary.fcgi?db=pubmed&retmode=json&id=' + ids.join(',') + (key ? '&api_key=' + key : ''));
  const res = (d && d.result) || {};
  const items = ids.map(function (id) {
    const a = res[id];
    if (!a) return null;
    const doi = ((a.articleids || []).filter(function (x) { return x.idtype === 'doi'; })[0] || {}).value || '';
    return {
      origin: 'PubMed', sourceId: id, title: String(a.title || '').replace(/\.$/, ''), journal: a.fulljournalname || a.source || '',
      yearCE: Number(String(a.pubdate || a.epubdate || '').slice(0, 4)) || 0, doi: cleanDoi_(doi),
      url: 'https://pubmed.ncbi.nlm.nih.gov/' + id + '/', issns: [a.issn, a.essn].filter(String), pmid: id,
      sourceType: 'journal', workType: (a.pubtype || []).join(','),
      authors: (a.authors || []).map(function (x) { return x.name; }).slice(0, 12),
      direct: { pubmed: { pmid: id } }
    };
  }).filter(Boolean);
  return { mode: 'direct', items: items, message: 'ค้นโดยตรงด้วย ' + term + ' (' + ids.length + ' รายการ)', query: term };
}

/* ---------------- 4. ERIC ---------------- */

function searchEric_(p, fromCE) {
  const n = splitName_(p.nameEn);
  if (!n) return { mode: 'skipped', items: [], message: 'ต้องมีชื่อภาษาอังกฤษ' };
  const q = 'author:"' + n.last + (n.first ? ', ' + n.first : '') + '" AND publicationdateyear:[' + fromCE + ' TO 3000]';
  const r = httpJson_(ERIC_API + '?format=json&rows=50&fields=id,title,author,source,publicationdateyear,issn,peerreviewed,url&search=' + encodeURIComponent(q));
  const docs = (r && r.response && r.response.docs) || [];
  const items = docs.map(function (d) {
    const isJournal = /^EJ/.test(d.id || '');
    return {
      origin: 'ERIC', sourceId: d.id, title: d.title || '', journal: d.source || '',
      yearCE: Number(d.publicationdateyear) || 0, doi: '', url: 'https://eric.ed.gov/?id=' + d.id,
      issns: [].concat(d.issn || []).map(function (s) { return String(s).replace(/^ISSN-/i, ''); }), pmid: '',
      sourceType: isJournal ? 'journal' : 'report', workType: isJournal ? 'article' : 'report',
      authors: [].concat(d.author || []).slice(0, 12),
      direct: { eric: { id: d.id, journal: isJournal } }
    };
  });
  return { mode: 'direct', items: items, message: 'ค้นโดยตรงด้วย ' + q + ' (' + docs.length + ' รายการ)', query: q };
}

/* ---------------- 5. TCI / ThaiJO (ชื่อไทย) ---------------- */

function searchThai_(p, fromCE) {
  const th = String(p.nameTh || '').trim();
  if (!th) return { mode: 'skipped', items: [], message: 'ไม่ได้กรอกชื่อภาษาไทย' };
  const items = [];
  const key = th.replace(/\s+/g, '');
  const r = httpJson_(CROSSREF + '/works?query.author=' + encodeURIComponent(th) + '&filter=from-pub-date:' + fromCE + '&rows=40&select=DOI,title,ISSN,container-title,issued,type,author,publisher,URL');
  ((r && r.message && r.message.items) || []).filter(function (it) {
    return (it.author || []).some(function (a) { return ([a.given, a.family].join('') + (a.name || '')).replace(/\s+/g, '').indexOf(key) > -1; });
  }).forEach(function (it) { items.push(fromCrossref_(it)); });
  const o = httpJson_(OPENALEX + '/works?filter=raw_author_name.search:' + encodeURIComponent(th) + ',from_publication_date:' + fromCE + '-01-01&per_page=50&select=id,doi,title,display_name,publication_year,type,ids,primary_location,authorships');
  ((o && o.results) || []).forEach(function (w) { items.push(fromOpenAlex_(w)); });
  return { mode: 'list', items: items, message: 'ค้นชื่อไทยใน Crossref/OpenAlex ' + items.length + ' รายการ แล้วจับคู่ ISSN กับรายชื่อ TCI กลุ่ม 1/2' };
}

/* ---------------- 6. OpenAlex (ฐานรวม) ---------------- */

function searchOpenAlex_(p, fromCE) {
  let authorId = p.openalexId || '', candidates = [];
  if (p.orcid) {
    const orcid = String(p.orcid).replace(/^https?:\/\/orcid\.org\//, '').trim();
    const r = httpJson_(OPENALEX + '/authors/orcid:' + encodeURIComponent(orcid));
    if (r && r.id) authorId = shortId_(r.id);
  }
  if (!authorId && p.nameEn) {
    candidates = findAuthors_({ nameEn: p.nameEn }).candidates;
    if (candidates.length) authorId = candidates[0].id;
  }
  if (!authorId) return { mode: 'skipped', items: [], candidates: candidates, message: 'ไม่พบนักวิจัยใน OpenAlex' };
  const sel = 'id,doi,title,display_name,publication_year,type,ids,primary_location,authorships';
  const r2 = httpJson_(OPENALEX + '/works?filter=author.id:' + encodeURIComponent(authorId) + ',from_publication_date:' + fromCE + '-01-01&per_page=100&sort=publication_year:desc&select=' + sel);
  const items = ((r2 && r2.results) || []).map(fromOpenAlex_);
  const who = candidates.filter(function (c) { return c.id === authorId; })[0];
  return { mode: 'direct', items: items, candidates: candidates, authorId: authorId,
    message: 'นักวิจัย ' + (who ? who.name + (who.institution ? ' (' + who.institution + ')' : '') : authorId) + ' · ' + items.length + ' รายการ' };
}

/* ---------------- รวมทุกฐาน ---------------- */

function mergeWorks_(lists) {
  const byKey = {};
  const order = [];
  lists.forEach(function (list) {
    list.forEach(function (w) {
      const k = w.doi || normTitle_(w.title);
      if (!k) return;
      let m = byKey[k];
      if (!m && !w.doi) { // ลองจับคู่ด้วยชื่อเรื่องกับรายการที่มี DOI
        const t = normTitle_(w.title);
        m = order.map(function (x) { return byKey[x]; }).filter(function (x) { return normTitle_(x.title) === t; })[0];
      }
      if (!m) { byKey[k] = Object.assign({}, w, { origins: [w.origin], direct: Object.assign({}, w.direct || {}) }); order.push(k); return; }
      if (m.origins.indexOf(w.origin) === -1) m.origins.push(w.origin);
      Object.assign(m.direct, w.direct || {});
      (w.issns || []).forEach(function (s) { if (m.issns.indexOf(s) === -1) m.issns.push(s); });
      if (!m.pmid && w.pmid) m.pmid = w.pmid;
      if (!m.doi && w.doi) m.doi = w.doi;
      if ((!m.authors || m.authors.length < 2) && w.authors && w.authors.length > 1) m.authors = w.authors;
      if (!m.journal) m.journal = w.journal;
      if (!m.yearCE) m.yearCE = w.yearCE;
    });
  });
  return order.map(function (k) { return byKey[k]; });
}

/** ค้นทุกฐานตามลำดับ Scopus → WoS → PubMed → ERIC → TCI → OpenAlex */
function searchAll_(p) {
  if (!String(p.nameEn || '').trim() && !String(p.nameTh || '').trim() && !p.scopusId && !p.orcid) throw new Error('กรุณากรอกชื่อภาษาไทยหรืออังกฤษ หรือ Scopus Author ID / ORCID');
  const win = evalWindow_(getSettings_());
  const fromCE = (Number(p.fromYear) || win.start) - 543;
  const toCE = Number(p.toYear) ? Number(p.toYear) - 543 : win.end - 543 + 1;
  const run = {
    scopus: function () { return searchScopus_(p, fromCE, toCE); },
    wos: function () { return searchWos_(p, fromCE, toCE); },
    pubmed: function () { return searchPubmed_(p, fromCE, toCE); },
    eric: function () { return searchEric_(p, fromCE); },
    tci: function () { return searchThai_(p, fromCE); },
    openalex: function () { return searchOpenAlex_(p, fromCE); }
  };
  const status = [], lists = [];
  let candidates = [], authorId = '';
  SOURCE_ORDER.forEach(function (s) {
    let r;
    try { r = run[s.key](); }
    catch (e) { r = { mode: 'error', items: [], message: e.message }; }
    status.push({ key: s.key, label: s.label, step: s.step, mode: r.mode, count: r.items.length, message: r.message, link: r.link || '', authorUrl: r.authorUrl || '' });
    lists.push(r.items);
    if (s.key === 'openalex') { candidates = r.candidates || []; authorId = r.authorId || ''; }
  });
  const person = p.personId ? { personType: p.personType || 'faculty', personId: p.personId } : null;
  const works = finishWorks_(mergeWorks_(lists), person);
  return { works: works, status: status, summary: summarize_(works), candidates: candidates, openalexId: authorId, journalIndex: journalIndexStats_() };
}

/** ตรวจ DOI กับ Scopus / PubMed โดยตรง (ใช้ตอนแนบไฟล์ผลงาน) */
function directChecksByDoi_(doi) {
  const out = { direct: {}, pmid: '', evidence: [] };
  if (!doi) return out;
  try {
    const key = apiKey_('SCOPUS_API_KEY');
    if (key) {
      const headers = { 'X-ELS-APIKey': key, Accept: 'application/json' };
      if (apiKey_('SCOPUS_INSTTOKEN')) headers['X-ELS-Insttoken'] = apiKey_('SCOPUS_INSTTOKEN');
      const r = httpJson_(SCOPUS_API + '?query=' + encodeURIComponent('DOI(' + doi + ')') + '&field=eid,prism:aggregationType,prism:issn,prism:eIssn', headers);
      const e = ((r && r['search-results'] && r['search-results'].entry) || []).filter(function (x) { return !x.error; })[0];
      if (e) {
        out.direct.scopus = { eid: e.eid, agg: e['prism:aggregationType'] || '' };
        const k = [e['prism:issn'], e['prism:eIssn']].map(normIssn_).filter(String)[0];
        if (k) { const ser = scopusSerial_(k, headers); if (ser) out.direct.scopus.serial = ser; }
      }
    }
  } catch (err) { out.evidence.push('ตรวจ Scopus ไม่สำเร็จ: ' + err.message); }
  try {
    const s = httpJson_(PUBMED_API + '/esearch.fcgi?db=pubmed&retmode=json&term=' + encodeURIComponent(doi + '[doi]'));
    const id = ((s && s.esearchresult && s.esearchresult.idlist) || [])[0];
    if (id) { out.direct.pubmed = { pmid: id }; out.pmid = id; }
  } catch (err) { out.evidence.push('ตรวจ PubMed ไม่สำเร็จ: ' + err.message); }
  return out;
}


/* ======================================================================
 * ส่วน: Criteria.gs
 * ====================================================================== */

/**
 * Criteria.gs — ชุดเกณฑ์ (มีเวอร์ชัน) และเครื่องตรวจตามเกณฑ์
 *
 * - ระบบไม่สร้างเกณฑ์ทางวิชาการเอง: มีแค่ "ชนิดการตรวจ" (RULE_KINDS) ส่วนค่าเกณฑ์ผู้ดูแลกรอกตามประกาศที่ยืนยันแล้ว
 * - เกณฑ์ตัวอย่างติดป้าย isDemo ("สำหรับสาธิต") และใช้กับคำขอสาธิตเท่านั้น
 * - ผลรายข้อ: pass / fail / inconclusive พร้อมเหตุผล ข้อมูลที่ใช้ และหลักฐาน
 * - ค้นไม่พบ / ข้อมูลไม่ครบ / ข้อมูลเก่า / ต้นทางขัดข้อง → "ยังสรุปไม่ได้" เสมอ ไม่ใช่ "ไม่ผ่าน"
 * - ผลแต่ละครั้งผูกกับเวอร์ชันเกณฑ์และ snapshot ข้อมูล การประเมินซ้ำจะเพิ่มรายการใหม่ ไม่ลบของเดิม
 */

function criteriaView_(c) {
  if (!c) return null;
  return Object.assign({}, c, { rules: parseJson_(c.rules, []), isDemo: toBool_(c.isDemo) });
}

/** ชุดเกณฑ์ที่ใช้งานอยู่ของประเภทคำขอ (มีผลแล้ว ณ วันนี้ — ถ้ามีหลายชุดใช้ชุดที่มีผลล่าสุด) */
function activeCriteriaFor_(typeId) {
  const today = nowIso_().slice(0, 10);
  const list = DB.all('CriteriaSets').filter(function (c) {
    return c.typeId === typeId && c.status === 'active' && (!c.effectiveDate || String(c.effectiveDate).slice(0, 10) <= today);
  });
  list.sort(function (a, b) { return String(b.effectiveDate).localeCompare(String(a.effectiveDate)) || Number(b.version) - Number(a.version); });
  return list[0] || null;
}

function validateRules_(rules) {
  if (!Array.isArray(rules) || !rules.length) throw new Error('ชุดเกณฑ์ต้องมีอย่างน้อย 1 ข้อ');
  const ids = {};
  return rules.map(function (r, i) {
    const kind = String(r.kind || '');
    if (!RULE_KINDS[kind]) throw new Error('ข้อที่ ' + (i + 1) + ': ไม่รู้จักชนิดการตรวจ ' + kind);
    const id = clean_(r.id || ('R' + (i + 1)), 20);
    if (ids[id]) throw new Error('รหัสข้อเกณฑ์ซ้ำ: ' + id);
    ids[id] = true;
    const label = clean_(r.label, 300);
    if (!label) throw new Error('ข้อที่ ' + (i + 1) + ': กรอกข้อความเกณฑ์');
    const pr = r.params || {};
    const params = {};
    if (kind === 'person_status' || kind === 'min_degree' || kind === 'academic_rank') {
      const dict = kind === 'person_status' ? EMP_STATUS : kind === 'min_degree' ? DEGREES : RANKS;
      params.allowed = [].concat(pr.allowed || []).filter(function (x) { return dict[x]; });
      if (!params.allowed.length) throw new Error('ข้อ ' + id + ': เลือกค่าที่ยอมรับอย่างน้อย 1 ค่า');
    }
    if (kind === 'min_works') {
      params.min = Math.max(1, Math.floor(Number(pr.min) || 0));
      params.years = Math.max(0, Math.floor(Number(pr.years) || 0));
      params.types = [].concat(pr.types || []).filter(function (x) { return WORK_TYPES[x]; });
      params.databases = [].concat(pr.databases || []).filter(function (x) { return DB_GROUPS[x] || (DATABASES[x] && x !== 'none'); });
      params.quartiles = [].concat(pr.quartiles || []).filter(function (x) { return /^Q[1-4]$/.test(x); });
      if (!Number(pr.min)) throw new Error('ข้อ ' + id + ': กรอกจำนวนผลงานขั้นต่ำ');
    }
    if (kind === 'required_documents') {
      params.docs = [].concat(pr.docs || []).map(function (x) { return clean_(x, 40); }).filter(String);
      if (!params.docs.length) throw new Error('ข้อ ' + id + ': ระบุรหัสเอกสารที่ต้องมี');
    }
    if (kind === 'manual') params.instruction = clean_(pr.instruction, 500);
    return { id: id, kind: kind, label: label, params: params };
  });
}

/* ---------------- จัดการชุดเกณฑ์ (ผู้ดูแล) ---------------- */

function saveCriteriaDraft_(p) {
  requirePerm_('admin.criteria');
  const type = DB.get('RequestTypes', p.typeId);
  if (!type) throw new Error('เลือกประเภทคำขอ');
  const rules = validateRules_(p.rules);
  const fields = {
    typeId: type.id, name: clean_(p.name, 200), effectiveDate: clean_(p.effectiveDate, 10), referenceSource: clean_(p.referenceSource, 500),
    conditionsText: clean_(p.conditionsText, 3000), rules: JSON.stringify(rules), isDemo: toBool_(p.isDemo), note: clean_(p.note, 500)
  };
  if (!fields.name) throw new Error('กรอกชื่อชุดเกณฑ์');
  if (fields.effectiveDate && !validDateText_(fields.effectiveDate)) throw new Error('วันที่มีผลต้องเป็น YYYY-MM-DD');
  if (p.id) {
    const cur = DB.get('CriteriaSets', p.id);
    if (!cur) throw new Error('ไม่พบชุดเกณฑ์');
    if (cur.status !== 'draft') throw new Error('แก้ได้เฉพาะฉบับร่าง — ชุดที่ใช้งานแล้วต้อง "สร้างเวอร์ชันใหม่"');
    const r = DB.update('CriteriaSets', cur.id, fields);
    audit_('criteria.update', 'CriteriaSets', cur.id, Object.keys(fields), '');
    return criteriaView_(r);
  }
  let code = clean_(p.code, 40).toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
  let version = 1;
  if (p.fromId) {
    const base = DB.get('CriteriaSets', p.fromId);
    if (!base) throw new Error('ไม่พบชุดเกณฑ์ต้นฉบับ');
    code = base.code;
    version = Math.max.apply(null, DB.all('CriteriaSets').filter(function (c) { return c.code === code; }).map(function (c) { return Number(c.version) || 0; })) + 1;
  } else {
    if (!code) code = 'CS-' + Utilities.getUuid().slice(0, 6).toUpperCase();
    if (DB.all('CriteriaSets').some(function (c) { return c.code === code; })) throw new Error('รหัสชุดเกณฑ์ซ้ำ: ' + code);
  }
  const r = DB.insert('CriteriaSets', Object.assign(fields, { code: code, version: String(version), status: 'draft', createdBy: me_().id }));
  audit_('criteria.create', 'CriteriaSets', r.id, { version: version }, '');
  return criteriaView_(r);
}

/** เปิดใช้ชุดเกณฑ์ — เกณฑ์จริงต้องมีแหล่งอ้างอิง วันที่มีผล และผู้ยืนยัน; ชุดเดิมที่รหัสเดียวกันจะถูกเลิกใช้ (ยังเก็บไว้) */
function activateCriteria_(p) {
  requirePerm_('admin.criteria');
  const c = DB.get('CriteriaSets', p.id);
  if (!c || c.status !== 'draft') throw new Error('เปิดใช้ได้เฉพาะฉบับร่าง');
  const confirmedBy = clean_(p.confirmedBy, 200);
  if (!toBool_(c.isDemo)) {
    const miss = [];
    if (!c.referenceSource) miss.push('แหล่งอ้างอิง (ประกาศ/ข้อบังคับ)');
    if (!c.effectiveDate) miss.push('วันที่มีผล');
    if (!confirmedBy) miss.push('ผู้ยืนยันเกณฑ์');
    if (miss.length) throw new Error('เปิดใช้เกณฑ์จริงไม่ได้ ยังขาด: ' + miss.join(', '));
  }
  DB.all('CriteriaSets').filter(function (x) { return x.code === c.code && x.status === 'active'; }).forEach(function (x) {
    DB.update('CriteriaSets', x.id, { status: 'retired' });
    audit_('criteria.retire', 'CriteriaSets', x.id, { status: 'retired' }, 'มีเวอร์ชันใหม่ ' + c.version);
  });
  const r = DB.update('CriteriaSets', c.id, { status: 'active', confirmedBy: confirmedBy || (toBool_(c.isDemo) ? 'สำหรับสาธิต — ไม่มีผู้ยืนยัน' : ''), confirmedAt: nowIso_() });
  audit_('criteria.activate', 'CriteriaSets', c.id, { status: 'active', version: c.version }, '');
  return criteriaView_(r);
}

function retireCriteria_(p) {
  requirePerm_('admin.criteria');
  const c = DB.get('CriteriaSets', p.id);
  if (!c || c.status !== 'active') throw new Error('เลิกใช้ได้เฉพาะชุดที่ใช้งานอยู่');
  if (!clean_(p.reason)) throw new Error('ระบุเหตุผล');
  const r = DB.update('CriteriaSets', c.id, { status: 'retired' });
  audit_('criteria.retire', 'CriteriaSets', c.id, { status: 'retired' }, p.reason);
  return criteriaView_(r);
}

/* ---------------- เครื่องตรวจ ---------------- */

function currentYearCE_() { return Number(nowIso_().slice(0, 4)); }

/** ข้อมูลบุคคลที่ใช้ตรวจ: ดึงจาก MUHR ล่าสุดถ้าทำได้ ไม่ได้ก็ใช้ snapshot เดิมพร้อมบอกเหตุผล */
function personForEval_(req) {
  const snap = parseJson_(req.personSnap, null);
  if (!snap) return { state: 'none', person: null, note: 'ยังไม่ได้เลือกบุคคล' };
  if (snap.kind === 'manual') return { state: 'manual', person: snap, note: 'บุคคลภายนอก/ไม่อยู่ในระบบต้นทาง — ไม่มีข้อมูลจาก MUHR ให้ตรวจ' };
  try {
    const rec = muhrByCode_(snap.staffCode);
    if (!rec) return { state: 'not_found', person: snap, note: 'ไม่พบรหัส ' + snap.staffCode + ' ใน MUHR ขณะประเมิน (อาจถูกนำออกจากชุดข้อมูล)' };
    const fresh = personDisplay_(rec);
    if (fresh.staleness.stale) return { state: 'stale', person: fresh, note: 'ข้อมูลบุคคลเก่ากว่า ' + fresh.staleness.limit + ' วัน (อายุ ' + fresh.staleness.ageDays + ' วัน)' };
    return { state: 'fresh', person: fresh, note: 'ข้อมูลจาก MUHR (' + sourceMode_('MUHR') + ') ดึงเมื่อ ' + fresh.fetchedAt };
  } catch (e) {
    if (e.sourceError) return { state: 'outage', person: snap, note: e.message };
    throw e;
  }
}

function sourceProbe_(src) {
  try { sourceReady_(src); return { source: src, ok: true, mode: sourceMode_(src) }; }
  catch (e) { if (e.sourceError) return { source: src, ok: false, mode: sourceMode_(src), code: e.sourceError.code, message: e.message }; throw e; }
}

function evalContext_(req) {
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); });
  const atts = DB.all('Attachments').filter(function (a) { return a.requestId === req.id && a.status === 'active'; });
  return {
    req: req, personInfo: personForEval_(req), works: works, attachments: atts,
    openDups: openDupPairs_(req.id, works), sources: { MUHR: sourceProbe_('MUHR'), MUREX: sourceProbe_('MUREX') },
    staffChecks: DB.all('StaffChecks').filter(function (s) { return s.requestId === req.id; })
  };
}

const R_ = function (result, reason, dataUsed, evidence) { return { result: result, reason: reason, dataUsed: dataUsed || [], evidence: evidence || [] }; };

/** กฎที่ต้องใช้ข้อมูลบุคคลจากต้นทาง: ยังไม่ยืนยันตัว/ไม่มีข้อมูล/ข้อมูลเก่า/ขัดข้อง → ยังสรุปไม่ได้ */
function personAttrRule_(ctx, field, dict, allowed, what) {
  const pi = ctx.personInfo;
  if (!identityVerified_(ctx.req)) return R_('inconclusive', 'ยังไม่ได้ยืนยันตัวบุคคล — ไม่สามารถใช้ข้อมูล' + what + 'ได้', [IDENTITY_LABEL[ctx.req.identityStatus || '']]);
  if (pi.state !== 'fresh') return R_('inconclusive', pi.note + ' — ให้เจ้าหน้าที่ตรวจ' + what + 'จากหลักฐาน', pi.person && pi.person[field] ? [what + ' (ข้อมูลเดิม): ' + (dict[pi.person[field]] || pi.person[field])] : []);
  const v = pi.person[field];
  if (!v) return R_('inconclusive', 'ต้นทางไม่มีข้อมูล' + what, [pi.note]);
  const used = [what + ': ' + (dict[v] || v), pi.note];
  if (allowed.indexOf(v) > -1) return R_('pass', what + ' "' + (dict[v] || v) + '" อยู่ในรายการที่เกณฑ์ยอมรับ', used);
  return R_('fail', what + ' "' + (dict[v] || v) + '" ไม่อยู่ในรายการที่เกณฑ์ยอมรับ (' + allowed.map(function (a) { return dict[a]; }).join(', ') + ')', used);
}

const RULE_EVAL_ = {
  identity_verified: function (rule, ctx) {
    const st = ctx.req.identityStatus;
    if (st === 'code_match') return R_('pass', IDENTITY_LABEL.code_match, ['รหัสบุคลากร: ' + (parseJson_(ctx.req.personSnap, {}).staffCode || '')]);
    if (st === 'staff_confirmed') return R_('pass', IDENTITY_LABEL.staff_confirmed + ' (' + ctx.req.identityNote + ')', ['ยืนยันโดย ' + userName_(ctx.req.identityBy) + ' เมื่อ ' + ctx.req.identityAt]);
    const snap = parseJson_(ctx.req.personSnap, null);
    const why = !snap ? 'ยังไม่ได้เลือกบุคคล' : snap.duplicateName ? 'เลือกจากชื่อซึ่งมีผู้ใช้ชื่อเดียวกันหลายคน' : snap.kind === 'manual' ? 'บุคคลไม่อยู่ในระบบต้นทาง' : 'เลือกจากชื่อ (ไม่ได้ยืนยันด้วยรหัสบุคลากร)';
    return R_('inconclusive', why + ' — รอเจ้าหน้าที่ยืนยันตัวบุคคล');
  },
  person_status: function (rule, ctx) { return personAttrRule_(ctx, 'employmentStatus', EMP_STATUS, rule.params.allowed, 'สถานะบุคลากร'); },
  min_degree: function (rule, ctx) { return personAttrRule_(ctx, 'highestDegree', DEGREES, rule.params.allowed, 'คุณวุฒิ'); },
  academic_rank: function (rule, ctx) { return personAttrRule_(ctx, 'academicRank', RANKS, rule.params.allowed, 'ตำแหน่งทางวิชาการ'); },
  min_works: function (rule, ctx) {
    const pr = rule.params;
    const fromYear = pr.years ? currentYearCE_() - pr.years + 1 : 0;
    const dbs = pr.databases || [], qs = pr.quartiles || [];
    const typed = ctx.works.filter(function (w) {
      if (w.status === 'excluded_duplicate' || w.status === 'rejected') return false;
      if (pr.types.length && pr.types.indexOf(w.type) === -1) return false;
      const y = normYear_(w.year);
      return !fromYear || (y && y >= fromYear);
    });
    // เงื่อนไขฐานข้อมูล/Quartile: ผลงานที่ยังไม่ได้ตรวจกับฐานข้อมูล หรือไม่มีข้อมูล Quartile → ยังสรุปไม่ได้ (ไม่ใช่ไม่ผ่าน)
    const dbOk = function (w) { return !dbs.length || dbs.indexOf(w.dbGroup) > -1 || dbs.indexOf(w.database) > -1; };
    const unchecked = dbs.length ? typed.filter(function (w) { return !w.checkedAt; }) : [];
    const noQuartile = qs.length ? typed.filter(function (w) { return w.checkedAt && dbOk(w) && !w.quartile; }) : [];
    const inScope = typed.filter(function (w) { return (!dbs.length || w.checkedAt) && dbOk(w) && (!qs.length || qs.indexOf(w.quartile) > -1); });
    const verified = inScope.filter(function (w) { return w.status === 'verified'; });
    const pending = inScope.filter(function (w) { return w.status === 'pending'; });
    const dbText = dbs.map(function (d) { return DB_GROUPS[d] || (DATABASES[d] || {}).label || d; }).join(' / ');
    const cond = 'ต้องมีอย่างน้อย ' + pr.min + ' รายการ' + (pr.types.length ? ' ประเภท ' + pr.types.map(function (t) { return WORK_TYPES[t]; }).join('/') : '') + (fromYear ? ' ตั้งแต่ปี ค.ศ. ' + fromYear + ' (พ.ศ. ' + (fromYear + 543) + ')' : '') +
      (dbs.length ? ' ในฐาน ' + dbText : '') + (qs.length ? ' Quartile ' + qs.join('/') : '');
    const used = ['ผลงานที่เจ้าหน้าที่ยืนยันและเข้าเงื่อนไข: ' + verified.length + ' รายการ', 'รอตรวจ: ' + pending.length + ' รายการ', cond]
      .concat(dbs.length ? verified.map(function (w) { return '• ' + String(w.title).slice(0, 60) + ' — ' + ((DATABASES[w.database] || {}).label || w.database) + (w.quartile ? ' ' + w.quartile + ' (' + w.quartileSource + ')' : ''); }) : []);
    const ev = verified.map(function (w) { return 'work:' + w.id; });
    if (verified.length >= pr.min) return R_('pass', 'มีผลงานที่ยืนยันแล้ว ' + verified.length + ' รายการ ครบตามเกณฑ์ (' + cond + ')', used, ev);
    const gaps = [];
    if (pending.length) gaps.push('มีผลงานรอเจ้าหน้าที่ตรวจ ' + pending.length + ' รายการ');
    if (unchecked.length) gaps.push('ผลงาน ' + unchecked.length + ' รายการยังไม่ได้ตรวจกับฐานข้อมูล (กด "ตรวจกับฐานข้อมูล")');
    if (noQuartile.length) gaps.push('ไม่มีข้อมูล Quartile ' + noQuartile.length + ' รายการ (ต้องนำเข้ารายชื่อ SJR หรือใส่ Scopus API key)');
    if (ctx.openDups.length) gaps.push('มีผลงานที่สงสัยว่าซ้ำรอตัดสิน ' + ctx.openDups.length + ' คู่');
    if (!ctx.sources.MUREX.ok) gaps.push('ระบบผลงาน MUREX ไม่พร้อมใช้งาน (' + (ctx.sources.MUREX.code === 'outage' ? 'ขัดข้อง' : 'ยังไม่ได้เชื่อมต่อ') + ')');
    if (ctx.works.some(function (w) { return !normYear_(w.year); })) gaps.push('มีผลงานที่ไม่ระบุปี');
    if (!toBool_(ctx.req.worksComplete)) gaps.push('เจ้าหน้าที่ยังไม่ได้ยืนยันว่ารายการผลงานครบถ้วน');
    if (gaps.length) return R_('inconclusive', 'นับได้ ' + verified.length + ' จาก ' + pr.min + ' รายการ แต่ยังสรุปไม่ได้เพราะ: ' + gaps.join('; '), used, ev);
    return R_('fail', 'นับได้ ' + verified.length + ' จาก ' + pr.min + ' รายการ (เจ้าหน้าที่ยืนยันว่ารายการผลงานครบถ้วนแล้ว: ' + (ctx.req.worksCompleteNote || '-') + ')', used, ev);
  },
  required_documents: function (rule, ctx) {
    const have = {};
    ctx.attachments.forEach(function (a) { have[a.docType] = (have[a.docType] || []).concat('file:' + a.id); });
    const miss = rule.params.docs.filter(function (d) { return !have[d]; });
    const ev = [].concat.apply([], rule.params.docs.map(function (d) { return have[d] || []; }));
    if (miss.length) return R_('inconclusive', 'ยังไม่มีเอกสาร: ' + miss.map(docLabel_).join(', '), ['แนบแล้ว: ' + Object.keys(have).map(docLabel_).join(', ')], ev);
    return R_('pass', 'มีเอกสารครบ: ' + rule.params.docs.map(docLabel_).join(', '), [], ev);
  },
  manual: function (rule) { return R_('inconclusive', 'ข้อนี้ต้องให้เจ้าหน้าที่พิจารณา' + (rule.params.instruction ? ': ' + rule.params.instruction : '')); }
};

function docLabel_(code) {
  const all = {};
  DB.all('RequestTypes').forEach(function (t) { parseJson_(t.requiredDocs, []).forEach(function (d) { all[d.code] = d.label; }); });
  all.evidence = 'หลักฐานผลงาน';
  return all[code] || code;
}

function snapshotOf_(ctx) {
  return {
    person: ctx.personInfo.person, personState: ctx.personInfo.state, personNote: ctx.personInfo.note,
    identityStatus: ctx.req.identityStatus, worksComplete: toBool_(ctx.req.worksComplete),
    works: ctx.works.map(function (w) { return { id: w.id, title: w.title, type: w.type, year: w.year, doi: w.doi, ref: w.ref, origin: w.origin, status: w.status, evidenceId: w.evidenceId, database: w.database, quartile: w.quartile, quartileSource: w.quartileSource, proof: w.proof }; }),
    attachments: ctx.attachments.map(function (a) { return { id: a.id, docType: a.docType, workId: a.workId, fileName: a.fileName, uploadedAt: a.uploadedAt }; }),
    openDups: ctx.openDups.map(function (d) { return d.id; }),
    staffChecks: ctx.staffChecks.map(function (s) { return { ruleId: s.ruleId, result: s.result, at: s.at }; })
  };
}

function hashOf_(obj) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(obj));
  return bytes.map(function (b) { return ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1); }).join('');
}

/** hash ของข้อมูลปัจจุบัน (ไม่รวมวันที่ดึงข้อมูล) — ใช้เทียบว่าข้อมูลเปลี่ยนหลังประเมินครั้งล่าสุดหรือไม่ */
function currentDataHash_(req) {
  const s = snapshotOf_(evalContext_(req));
  if (s.person) s.person = Object.assign({}, s.person, { fetchedAt: '', staleness: null, selectedAt: '' });
  return hashOf_(s);
}

/** ประเมินคำขอตามชุดเกณฑ์ที่ผูกไว้ — บันทึกเป็นรายการใหม่เสมอ */
function evaluate_(req, trigger, reason) {
  const set = DB.get('CriteriaSets', req.criteriaSetId);
  if (!set) throw new Error('คำขอนี้ยังไม่ได้ผูกชุดเกณฑ์');
  if (toBool_(set.isDemo) && !toBool_(req.isDemo)) throw new Error('ห้ามใช้เกณฑ์สำหรับสาธิตกับคำขอจริง');
  const rules = parseJson_(set.rules, []);
  const ctx = evalContext_(req);
  const items = rules.map(function (rule) {
    const fn = RULE_EVAL_[rule.kind];
    let r = fn ? fn(rule, ctx) : R_('inconclusive', 'ระบบไม่รู้จักชนิดการตรวจ ' + rule.kind);
    const item = Object.assign({ ruleId: rule.id, kind: rule.kind, label: rule.label, by: 'system' }, r);
    // ผลตรวจของเจ้าหน้าที่ใช้เติมเฉพาะข้อที่ระบบ "ยังสรุปไม่ได้" ไม่เขียนทับผลของระบบ
    if (item.result === 'inconclusive') {
      const sc = ctx.staffChecks.filter(function (s) { return s.ruleId === rule.id && s.criteriaSetId === set.id; }).pop();
      if (sc) {
        item.systemResult = item.result; item.systemReason = item.reason;
        item.result = sc.result; item.reason = sc.reason; item.by = 'staff';
        item.dataUsed = item.dataUsed.concat(['ตรวจโดยเจ้าหน้าที่ ' + userName_(sc.by) + ' เมื่อ ' + sc.at]);
      }
    }
    return item;
  });
  const overall = items.some(function (i) { return i.result === 'fail'; }) ? 'fail' : items.some(function (i) { return i.result === 'inconclusive'; }) ? 'inconclusive' : 'pass';
  const snapshot = snapshotOf_(ctx);
  const ev = DB.insert('Evaluations', {
    requestId: req.id, round: req.round, criteriaSetId: set.id, criteriaCode: set.code, criteriaVersion: set.version, isDemo: toBool_(set.isDemo),
    overall: overall, items: JSON.stringify(items), snapshot: JSON.stringify(snapshot), snapshotHash: currentDataHash_(req),
    sourceStatus: JSON.stringify(ctx.sources), trigger: trigger, reason: clean_(reason, 300), by: CURRENT_USER_ ? CURRENT_USER_.id : '', at: nowIso_()
  });
  audit_('evaluate', 'Requests', req.id, { result: overall, version: set.version }, trigger);
  return evaluationView_(ev);
}

const TRIGGER_LABEL_ = { submit: 'ระบบตรวจอัตโนมัติเมื่อยื่นคำขอ', resubmit: 'ระบบตรวจอัตโนมัติเมื่อยื่นใหม่', forward: 'ระบบตรวจอัตโนมัติก่อนส่งผู้พิจารณา', rerun: 'ประเมินซ้ำ', staff_check: 'ประเมินหลังเจ้าหน้าที่บันทึกผลตรวจ' };
const AUTO_TRIGGERS_ = ['submit', 'resubmit', 'forward'];

function evaluationView_(e) {
  return Object.assign({}, e, {
    items: parseJson_(e.items, []), snapshot: parseJson_(e.snapshot, {}), sourceStatus: parseJson_(e.sourceStatus, {}),
    isDemo: toBool_(e.isDemo), byName: e.by ? userName_(e.by) : 'ระบบ', triggerLabel: (TRIGGER_LABEL_[e.trigger] || e.trigger) + (AUTO_TRIGGERS_.indexOf(e.trigger) > -1 ? '' : ' โดย ' + (e.by ? userName_(e.by) : '-'))
  });
}


/* ======================================================================
 * ส่วน: Workflow.gs
 * ====================================================================== */

/**
 * Workflow.gs — ขั้นตอนคำขอ: สร้าง → เลือกประเภท → ค้นหาและยืนยันบุคคล → รวบรวมผลงาน → ตรวจตามเกณฑ์
 *               → เจ้าหน้าที่ตรวจยืนยัน → ผู้พิจารณาตัดสิน → แจ้งผลและปิดงาน
 * รองรับร่าง ส่งกลับแก้ไข (แก้เฉพาะส่วนที่ระบุ) ยื่นใหม่ และยกเลิก โดยเก็บประวัติทั้งหมด
 */

/* ---------------- เครื่องมือ ---------------- */

function history_(req, from, to, note) {
  const u = me_();
  DB.insert('StatusHistory', { requestId: req.id, fromStatus: from, toStatus: to, round: req.round, by: u.id, byRole: u.role, note: clean_(note, 500), at: nowIso_() });
}

function transition_(req, to, note, patch) {
  const from = req.status;
  const rec = DB.update('Requests', req.id, Object.assign({ status: to }, patch || {}));
  history_(rec, from, to, note);
  audit_('status', 'Requests', req.id, Object.assign({ status: to }, patch || {}), note);
  return rec;
}

/** แจ้งเตือนภายในระบบเท่านั้น — การส่งอีเมล/ข้อความภายนอกปิดอยู่จนกว่าผู้ดูแลจะตั้งค่าและเปิดใช้ */
function notify_(userIds, req, message) {
  const ids = [].concat(userIds || []).filter(function (x, i, a) { return x && a.indexOf(x) === i && (!CURRENT_USER_ || x !== CURRENT_USER_.id); });
  if (!ids.length) return 0;
  DB.insertMany('Notifications', ids.map(function (id) { return { userId: id, requestId: req ? req.id : '', message: clean_(message, 300) }; }));
  return ids.length;
}

function staffOf_(req) {
  if (req.assigneeId) return [req.assigneeId];
  return usersFor_('staff', req.unit).map(function (u) { return u.id; });
}

function nextCode_() {
  const be = Number(nowIso_().slice(0, 4)) + 543;
  const prefix = 'RQ' + be + '-';
  const n = DB.all('Requests').filter(function (r) { return String(r.code).indexOf(prefix) === 0; }).length + 1;
  return prefix + ('000' + n).slice(-4);
}

function typeView_(t) {
  return t ? Object.assign({}, t, { requiredDocs: parseJson_(t.requiredDocs, []), active: toBool_(t.active), isDemo: toBool_(t.isDemo) }) : null;
}

/* ---------------- สิทธิ์ตามสถานะ ---------------- */

/** ส่วนที่ผู้ยื่นแก้ได้: ร่าง = ทุกส่วน, ส่งกลับ = เฉพาะส่วนที่เจ้าหน้าที่ระบุ */
function editableSections_(req) {
  const u = CURRENT_USER_;
  if (!u || u.role !== 'requester' || req.requesterId !== u.id) return [];
  if (req.status === 'draft') return Object.keys(SECTIONS);
  if (req.status === 'returned') {
    const s = {};
    DB.all('RevisionItems').filter(function (i) { return i.requestId === req.id && i.round === String(req.round) && i.status !== 'accepted'; })
      .forEach(function (i) { s[i.section] = true; });
    return Object.keys(s);
  }
  return [];
}

function requireEditable_(req, section) {
  if (editableSections_(req).indexOf(section) === -1) {
    throw new Error(req.status === 'returned' ? 'ส่วน "' + SECTIONS[section] + '" ไม่อยู่ในรายการที่ต้องแก้ไข — แก้ได้เฉพาะส่วนที่เจ้าหน้าที่ระบุ' : 'คำขอสถานะ "' + STATUSES[req.status].label + '" แก้ไขไม่ได้');
  }
}

function requireStaffOn_(req, statuses) {
  requirePerm_('request.review');
  if (!inScope_(req.unit)) throw new Error('คำขอนี้ไม่อยู่ในหน่วยงานที่คุณรับผิดชอบ');
  if (statuses.indexOf(req.status) === -1) throw new Error('ทำรายการนี้ไม่ได้ในสถานะ "' + STATUSES[req.status].label + '"');
  if (req.assigneeId && req.assigneeId !== CURRENT_USER_.id && req.status === 'in_review') throw new Error('คำขอนี้มอบหมายให้ ' + userName_(req.assigneeId) + ' — ขอให้มอบหมายใหม่ก่อน');
}

function actionsFor_(req) {
  const u = CURRENT_USER_; const a = [];
  if (!u) return a;
  const owner = u.role === 'requester' && req.requesterId === u.id;
  if (owner && ['draft', 'returned'].indexOf(req.status) > -1) a.push('edit', 'submit');
  if (owner && ['draft', 'submitted', 'returned'].indexOf(req.status) > -1) a.push('cancel');
  if (u.role === 'admin' && OPEN_STATUSES.concat('draft').indexOf(req.status) > -1) a.push('cancel');
  if (u.role === 'staff' && inScope_(req.unit)) {
    if (req.status === 'submitted') a.push('claim', 'assign');
    if (req.status === 'in_review') {
      a.push('assign');
      if (!req.assigneeId || req.assigneeId === u.id) a.push('verify', 'return', 'forward', 'rerun');
    }
    if (req.status === 'decided') a.push('close');
  }
  if (u.role === 'reviewer' && req.reviewerId === u.id && req.status === 'pending_decision') a.push('decide');
  return a;
}

/* ---------------- ครบถ้วนก่อนยื่น ---------------- */

function requiredDocsFor_(req, type, works, atts) {
  const snap = parseJson_(req.personSnap, null);
  const out = [];
  parseJson_(type.requiredDocs, []).forEach(function (d) {
    const need = d.when === 'always' || (d.when === 'person_not_in_source' && snap && snap.kind === 'manual');
    if (need) out.push({ code: d.code, label: d.label, hint: d.hint || '', attached: atts.filter(function (a) { return a.docType === d.code && !a.workId; }).length });
  });
  works.filter(function (w) { return ACTIVE_WORK_(w) && w.origin === 'manual' && !w.doi && !w.ref; }).forEach(function (w) {
    out.push({ code: 'evidence', workId: w.id, label: 'หลักฐานผลงาน: ' + w.title, hint: 'ผลงานที่ไม่มี DOI/เลขอ้างอิง ต้องแนบหลักฐาน', attached: atts.filter(function (a) { return a.workId === w.id; }).length });
  });
  return out;
}

function completeness_(req) {
  const type = DB.get('RequestTypes', req.typeId);
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); });
  const atts = DB.all('Attachments').filter(function (a) { return a.requestId === req.id && a.status === 'active'; });
  const issues = [];
  const add = function (section, msg, blocking) { issues.push({ section: section, message: msg, blocking: blocking !== false }); };
  if (!clean_(req.purpose)) add('info', 'กรอกวัตถุประสงค์/รายละเอียดคำขอ');
  const snap = parseJson_(req.personSnap, null);
  if (!snap) add('person', 'เลือกบุคคลที่ต้องการตรวจ');
  else if (req.identityStatus === 'needs_staff_check') add('person', 'บุคคลนี้เลือกจากชื่อ/กรอกเอง เจ้าหน้าที่จะต้องยืนยันตัวบุคคล (ยื่นได้)', false);
  if (!works.length) add('works', 'ยังไม่มีผลงาน — ข้อเกณฑ์ด้านผลงานจะสรุปไม่ได้ (ยื่นได้ ถ้าประเภทคำขอไม่ต้องใช้ผลงาน)', false);
  works.forEach(function (w) {
    if (!w.title || !normYear_(w.year) || !WORK_TYPES[w.type]) add('works', 'ผลงาน "' + (w.title || '(ไม่มีชื่อ)') + '" ข้อมูลไม่ครบ (ชื่อเรื่อง/ปี/ประเภท)');
  });
  if (type) requiredDocsFor_(req, type, works, atts).forEach(function (d) { if (!d.attached) add('documents', 'แนบ: ' + d.label); });
  if (req.status === 'returned') {
    DB.all('RevisionItems').filter(function (i) { return i.requestId === req.id && i.round === String(req.round) && i.status === 'open'; })
      .forEach(function (i) { add(i.section, 'ยังไม่ได้ตอบรายการแก้ไข: ' + i.message); });
  }
  return { ok: !issues.some(function (i) { return i.blocking; }), issues: issues };
}

/* ---------------- ผู้ยื่นเรื่อง ---------------- */

function createRequest_(p) {
  requirePerm_('request.create');
  const u = me_();
  const type = DB.get('RequestTypes', p.typeId);
  if (!type || !toBool_(type.active)) throw new Error('เลือกประเภทคำขอที่เปิดใช้งาน');
  const unit = clean_(p.unit, 40);
  if (!unit || !inScope_(unit)) throw new Error('เลือกหน่วยงานที่คุณมีสิทธิ์ยื่นเรื่อง');
  const set = activeCriteriaFor_(type.id);
  if (!set) throw new Error('ประเภทคำขอนี้ยังไม่มีชุดเกณฑ์ที่เปิดใช้งาน — แจ้งผู้ดูแลระบบ');
  const demo = toBool_(set.isDemo);
  if (demo && !toBool_(setting_('TEST_MODE'))) throw new Error('ประเภทคำขอนี้มีเฉพาะเกณฑ์สำหรับสาธิต ใช้ยื่นคำขอจริงไม่ได้ — รอผู้ดูแลเปิดใช้เกณฑ์ที่ยืนยันแล้ว');
  const req = DB.insert('Requests', {
    code: nextCode_(), typeId: type.id, title: clean_(p.title, 200) || type.name, purpose: clean_(p.purpose, 2000), note: '',
    unit: unit, requesterId: u.id, status: 'draft', round: '1', identityStatus: '', criteriaSetId: set.id, worksComplete: false, isDemo: demo
  });
  DB.insert('StatusHistory', { requestId: req.id, fromStatus: '', toStatus: 'draft', round: '1', by: u.id, byRole: u.role, note: 'สร้างคำขอ', at: nowIso_() });
  audit_('request.create', 'Requests', req.id, { status: 'draft' }, '');
  return req;
}

function updateInfo_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'info');
  const patch = {};
  if (p.title !== undefined) patch.title = clean_(p.title, 200);
  if (p.purpose !== undefined) patch.purpose = clean_(p.purpose, 2000);
  if (p.note !== undefined) patch.note = clean_(p.note, 1000);
  if (p.typeId !== undefined && p.typeId !== req.typeId) {
    if (req.status !== 'draft') throw new Error('เปลี่ยนประเภทคำขอได้เฉพาะตอนเป็นร่าง');
    const t = DB.get('RequestTypes', p.typeId); const set = t && activeCriteriaFor_(t.id);
    if (!t || !toBool_(t.active) || !set) throw new Error('ประเภทคำขอนี้ใช้ไม่ได้');
    patch.typeId = t.id; patch.criteriaSetId = set.id; patch.isDemo = toBool_(set.isDemo);
  }
  const r = DB.update('Requests', req.id, patch);
  audit_('request.update', 'Requests', req.id, Object.keys(patch), '');
  return r;
}

/** เลือกบุคคล: จากผลค้นใน MUHR (personId + วิธีที่ค้นพบ) หรือกรอกเอง (บุคคลภายนอก) */
function setPerson_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'person');
  let snap;
  if (p.manual) snap = personSnapManual_(p.manual);
  else {
    const rec = DB.get('Persons', p.personId);
    const mode = sourceReady_('MUHR');
    if (!rec || rec.origin !== mode) throw new Error('ไม่พบบุคคลในแหล่งข้อมูล MUHR ปัจจุบัน');
    // ตรวจซ้ำที่เซิร์ฟเวอร์ว่าเลือกจากรหัสจริงหรือไม่ — ไม่เชื่อค่าที่หน้าเว็บส่งมา
    const byCode = p.staffCode && String(p.staffCode).trim().toUpperCase() === String(rec.staffCode).toUpperCase();
    const res = byCode ? null : searchPersons_({ name: p.name || rec.firstNameTh + ' ' + rec.lastNameTh });
    const hit = res && res.results.filter(function (x) { return x.personId === rec.id; })[0];
    snap = personSnapFromSource_(rec, byCode ? 'staffCode' : (hit ? hit.matchBasis : 'name'), hit ? hit.duplicateName : false);
  }
  const identity = identityFromSnap_(snap);
  const r = DB.update('Requests', req.id, { personSnap: JSON.stringify(snap), identityStatus: identity, identityBasis: snap.matchBasis || 'manual', identityNote: '', identityBy: '', identityAt: '' });
  audit_('request.person', 'Requests', req.id, { identityStatus: identity, personSnap: 1 }, '');
  return { request: r, person: snap, identityLabel: IDENTITY_LABEL[identity] };
}

/** ผลงานจาก MUREX ของบุคคลที่เลือก (ให้ผู้ยื่นติ๊กยืนยัน) — บอกด้วยว่ารายการไหนเพิ่มแล้ว */
function sourceWorksFor_(p) {
  const req = loadRequestFor_(p.id);
  const snap = parseJson_(req.personSnap, null);
  if (!snap || snap.kind !== 'source') return { works: [], source: sourceStatus_('MUREX'), note: 'บุคคลที่ไม่อยู่ใน MUHR ไม่มีรายการผลงานจาก MUREX ให้ดึง — เพิ่มผลงานเองได้' };
  const added = {};
  DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); }).forEach(function (w) { if (w.sourceWorkId) added[w.sourceWorkId] = true; });
  let note = '', list;
  if (sourceReady_('MUREX') === 'api') { const r = apiWorksFor_(snap.staffCode); list = r.works; note = r.note; }
  else list = murexWorksFor_(snap.staffCode);
  const works = list.map(function (w) { return Object.assign({}, w, { added: !!added[w.id], staleness: staleInfo_(w) }); });
  return { works: works, source: sourceStatus_('MUREX'), note: note };
}

function addSourceWorks_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'works');
  const snap = parseJson_(req.personSnap, null);
  if (!snap || snap.kind !== 'source') throw new Error('เลือกบุคคลจาก MUHR ก่อน');
  const avail = {};
  murexWorksFor_(snap.staffCode).forEach(function (w) { avail[w.id] = w; });
  const exist = {};
  DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); }).forEach(function (w) { if (w.sourceWorkId) exist[w.sourceWorkId] = true; });
  const recs = [].concat(p.workIds || []).filter(function (id) { return avail[id] && !exist[id]; }).map(function (id) {
    const w = avail[id];
    return { requestId: req.id, origin: 'MUREX-' + w.origin, checkedAt: '', sourceWorkId: w.id, title: w.title, type: w.type || 'other', year: w.year, pubDate: w.pubDate, authors: w.authors, venue: w.venue, doi: normDoi_(w.doi), ref: w.workRef || w.ref, status: 'pending', addedBy: me_().id, addedRound: req.round };
  });
  if (!recs.length) throw new Error('ไม่มีรายการใหม่ให้เพิ่ม');
  DB.insertMany('RequestWorks', recs);
  const dups = detectDuplicates_(req.id);
  audit_('works.addSource', 'Requests', req.id, ['works+' + recs.length], '');
  return { added: recs.length, suspectedDuplicates: dups };
}

function workFields_(p) {
  const f = {
    title: clean_(p.title, 500), type: WORK_TYPES[p.type] ? p.type : '', year: String(normYear_(p.year) || ''), pubDate: clean_(p.pubDate, 10),
    authors: clean_(p.authors, 1000), venue: clean_(p.venue, 300), doi: normDoi_(p.doi), ref: clean_(p.ref, 200)
  };
  if (!f.title) throw new Error('กรอกชื่อผลงาน');
  if (!f.type) throw new Error('เลือกประเภทผลงาน');
  if (!f.year || Number(f.year) < 1900 || Number(f.year) > currentYearCE_() + 1) throw new Error('ปีไม่ถูกต้อง (กรอก ค.ศ. หรือ พ.ศ.)');
  if (f.doi && !/^10\.\d{4,9}\/\S+$/.test(f.doi)) throw new Error('DOI ไม่ถูกต้อง (ตัวอย่าง 10.1234/abcd)');
  if (f.pubDate && !validDateText_(f.pubDate)) throw new Error('วันที่เผยแพร่ต้องเป็น YYYY-MM-DD');
  return f;
}

function saveManualWork_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'works');
  const f = workFields_(p.work || {});
  let w;
  if (p.workId) {
    const cur = DB.get('RequestWorks', p.workId);
    if (!cur || cur.requestId !== req.id || !ACTIVE_WORK_(cur)) throw new Error('ไม่พบผลงาน');
    if (cur.origin !== 'manual') throw new Error('ผลงานจากระบบต้นทางแก้ไขไม่ได้ — ถอนออกแล้วเพิ่มเองได้');
    w = DB.update('RequestWorks', cur.id, Object.assign(f, { status: 'pending', staffNote: cur.staffNote }));
    audit_('works.update', 'RequestWorks', cur.id, Object.keys(f), '');
  } else {
    w = DB.insert('RequestWorks', Object.assign(f, { requestId: req.id, origin: 'manual', status: 'pending', addedBy: me_().id, addedRound: req.round }));
    audit_('works.add', 'RequestWorks', w.id, ['manual'], '');
  }
  const dups = detectDuplicates_(req.id);
  return { work: w, suspectedDuplicates: dups };
}

function withdrawWork_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'works');
  const w = DB.get('RequestWorks', p.workId);
  if (!w || w.requestId !== req.id || !ACTIVE_WORK_(w)) throw new Error('ไม่พบผลงาน');
  DB.update('RequestWorks', w.id, { status: 'withdrawn', staffNote: clean_(p.reason, 300) });
  audit_('works.withdraw', 'RequestWorks', w.id, { status: 'withdrawn' }, p.reason);
  return true;
}

function respondRevision_(p) {
  const req = loadRequestFor_(p.id);
  if (req.status !== 'returned' || req.requesterId !== me_().id) throw new Error('ไม่มีรายการแก้ไขที่ต้องตอบ');
  const it = DB.get('RevisionItems', p.itemId);
  if (!it || it.requestId !== req.id || it.round !== String(req.round)) throw new Error('ไม่พบรายการแก้ไข');
  const resp = clean_(p.response, 1000);
  if (!resp) throw new Error('ระบุสิ่งที่แก้ไขแล้ว');
  DB.update('RevisionItems', it.id, { status: 'addressed', response: resp, addressedAt: nowIso_() });
  audit_('revision.respond', 'RevisionItems', it.id, { status: 'addressed' }, '');
  return true;
}

function submit_(p) {
  const req = loadRequestFor_(p.id);
  if (req.requesterId !== me_().id || me_().role !== 'requester') throw new Error('ยื่นได้เฉพาะเจ้าของคำขอ');
  if (['draft', 'returned'].indexOf(req.status) === -1) throw new Error('คำขอนี้ยื่นไปแล้ว');
  const c = completeness_(req);
  if (!c.ok) { const e = new Error('ยังยื่นไม่ได้ — ข้อมูลไม่ครบ:\n- ' + c.issues.filter(function (i) { return i.blocking; }).map(function (i) { return i.message; }).join('\n- ')); throw e; }
  const resubmit = req.status === 'returned';
  const patch = { submittedAt: req.submittedAt || nowIso_() };
  if (resubmit) {
    patch.round = String(Number(req.round) + 1);
  } else {
    const set = activeCriteriaFor_(req.typeId);
    if (!set) throw new Error('ประเภทคำขอนี้ไม่มีชุดเกณฑ์ที่ใช้งานแล้ว — แจ้งผู้ดูแลระบบ');
    if (toBool_(set.isDemo) !== toBool_(req.isDemo)) throw new Error('ชุดเกณฑ์ของประเภทคำขอนี้เปลี่ยนจากเกณฑ์สาธิต/เกณฑ์จริง — สร้างคำขอใหม่');
    patch.criteriaSetId = set.id; // ผูกเกณฑ์ ณ วันที่ยื่น
  }
  const r = transition_(req, 'submitted', resubmit ? 'ยื่นใหม่หลังแก้ไข' : 'ยื่นคำขอ', patch);
  const ev = evaluate_(r, resubmit ? 'resubmit' : 'submit', '');
  notify_(staffOf_(r), r, (resubmit ? 'คำขอยื่นใหม่หลังแก้ไข: ' : 'คำขอใหม่: ') + r.code + ' ' + r.title);
  return { request: r, evaluation: ev };
}

function cancel_(p) {
  const req = loadRequestFor_(p.id);
  if (actionsFor_(req).indexOf('cancel') === -1) throw new Error('ยกเลิกคำขอนี้ไม่ได้');
  const reason = clean_(p.reason, 500);
  if (!reason) throw new Error('ระบุเหตุผลการยกเลิก');
  const r = transition_(req, 'cancelled', reason, { cancelledAt: nowIso_(), cancelReason: reason });
  notify_([r.requesterId].concat(r.assigneeId ? [r.assigneeId] : []), r, 'คำขอ ' + r.code + ' ถูกยกเลิก');
  return r;
}

/* ---------------- เจ้าหน้าที่ ---------------- */

function claim_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['submitted']);
  return transition_(req, 'in_review', 'รับเรื่องตรวจ', { assigneeId: req.assigneeId || me_().id });
}

function assign_(p) {
  const req = loadRequestFor_(p.id);
  requirePerm_('request.review');
  if (!inScope_(req.unit) || ['submitted', 'in_review'].indexOf(req.status) === -1) throw new Error('มอบหมายคำขอนี้ไม่ได้');
  const target = DB.get('Users', p.userId);
  if (!target || !toBool_(target.active) || !userHasRole_(target, 'staff') || !inScope_(req.unit, { allUnits: splitList_(target.units).indexOf('*') > -1, units: splitList_(target.units) })) throw new Error('ผู้รับมอบหมายต้องเป็นเจ้าหน้าที่ในหน่วยงานของคำขอ');
  const r = DB.update('Requests', req.id, { assigneeId: target.id });
  history_(r, req.status, req.status, 'มอบหมายให้ ' + target.name + (p.note ? ' — ' + clean_(p.note, 200) : ''));
  audit_('assign', 'Requests', req.id, ['assigneeId'], p.note);
  notify_([target.id], r, 'ได้รับมอบหมายคำขอ ' + r.code);
  return r;
}

function confirmIdentity_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  if (!req.personSnap) throw new Error('คำขอยังไม่มีข้อมูลบุคคล');
  const note = clean_(p.note, 500);
  if (note.length < 5) throw new Error('ระบุหลักฐาน/วิธีที่ใช้ยืนยันตัวบุคคล (เช่น ตรวจรหัสบุคลากรกับหน่วยงาน)');
  const r = DB.update('Requests', req.id, { identityStatus: 'staff_confirmed', identityNote: note, identityBy: me_().id, identityAt: nowIso_() });
  history_(r, req.status, req.status, 'ยืนยันตัวบุคคล');
  audit_('identity.confirm', 'Requests', req.id, { identityStatus: 'staff_confirmed' }, '');
  return r;
}

function verifyWork_(p) {
  const w = DB.get('RequestWorks', p.workId);
  if (!w) throw new Error('ไม่พบผลงาน');
  const req = loadRequestFor_(w.requestId);
  requireStaffOn_(req, ['in_review']);
  if (['verified', 'rejected', 'pending'].indexOf(p.status) === -1) throw new Error('สถานะไม่ถูกต้อง');
  if (!ACTIVE_WORK_(w) || w.status === 'excluded_duplicate') throw new Error('ผลงานนี้ถูกถอน/คัดออกแล้ว');
  const note = clean_(p.note, 500);
  if (p.status === 'rejected' && !note) throw new Error('ระบุเหตุผลที่ไม่รับผลงานนี้');
  DB.update('RequestWorks', w.id, { status: p.status, staffNote: note });
  audit_('works.verify', 'RequestWorks', w.id, { status: p.status }, note);
  return true;
}

/** ตัดสินคู่ที่สงสัยว่าซ้ำ — "ซ้ำ" จะคัดรายการหนึ่งออก (ไม่ลบ) / "ไม่ซ้ำ" เก็บทั้งคู่ */
function resolveDup_(p) {
  const d = DB.get('DupPairs', p.pairId);
  if (!d) throw new Error('ไม่พบรายการ');
  const req = loadRequestFor_(d.requestId);
  requireStaffOn_(req, ['in_review']);
  const note = clean_(p.note, 500);
  if (p.decision === 'duplicate') {
    if ([d.workA, d.workB].indexOf(p.keepWorkId) === -1) throw new Error('เลือกรายการที่จะเก็บไว้');
    const drop = p.keepWorkId === d.workA ? d.workB : d.workA;
    DB.update('RequestWorks', drop, { status: 'excluded_duplicate', staffNote: 'ซ้ำกับรายการที่เก็บไว้' + (note ? ' — ' + note : '') });
    DB.update('DupPairs', d.id, { status: 'duplicate', keepWorkId: p.keepWorkId, note: note, resolvedBy: me_().id, resolvedAt: nowIso_() });
  } else if (p.decision === 'distinct') {
    if (!note) throw new Error('ระบุเหตุผลที่ถือว่าไม่ซ้ำ');
    DB.update('DupPairs', d.id, { status: 'distinct', note: note, resolvedBy: me_().id, resolvedAt: nowIso_() });
  } else throw new Error('เลือก "ซ้ำ" หรือ "ไม่ซ้ำ"');
  audit_('dup.resolve', 'DupPairs', d.id, { status: p.decision }, note);
  return true;
}

function setWorksComplete_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const note = clean_(p.note, 500);
  const val = toBool_(p.value);
  if (val && !note) throw new Error('ระบุแหล่งที่ใช้ตรวจความครบถ้วน (เช่น ตรวจกับ MUREX และ CV แล้ว)');
  const r = DB.update('Requests', req.id, { worksComplete: val, worksCompleteNote: val ? note : '' });
  audit_('works.complete', 'Requests', req.id, { worksComplete: val }, note);
  return r;
}

/** ผลตรวจของเจ้าหน้าที่ ใช้ได้กับข้อที่ระบบสรุปไม่ได้เท่านั้น */
function staffCheck_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const set = DB.get('CriteriaSets', req.criteriaSetId);
  const rule = parseJson_(set.rules, []).filter(function (r) { return r.id === p.ruleId; })[0];
  if (!rule) throw new Error('ไม่พบข้อเกณฑ์');
  if (['pass', 'fail', 'inconclusive'].indexOf(p.result) === -1) throw new Error('เลือกผล');
  const reason = clean_(p.reason, 1000);
  if (reason.length < 5) throw new Error('ระบุเหตุผลและหลักฐานที่ใช้ตรวจ');
  const latest = latestEvaluation_(req.id);
  const item = latest && latest.items.filter(function (i) { return i.ruleId === rule.id; })[0];
  if (item && item.by === 'system' && item.result !== 'inconclusive') throw new Error('ข้อนี้ระบบสรุปได้แล้ว — เจ้าหน้าที่บันทึกผลแทนได้เฉพาะข้อที่ "ยังสรุปไม่ได้"');
  DB.insert('StaffChecks', { requestId: req.id, criteriaSetId: set.id, ruleId: rule.id, result: p.result, reason: reason, by: me_().id, at: nowIso_() });
  audit_('staffCheck', 'Requests', req.id, { result: p.result }, rule.id);
  return evaluate_(req, 'staff_check', 'บันทึกผลตรวจข้อ ' + rule.id);
}

function latestEvaluation_(requestId) {
  const list = DB.all('Evaluations').filter(function (e) { return e.requestId === requestId; });
  return list.length ? evaluationView_(list[list.length - 1]) : null;
}

/** ประเมินซ้ำ — เลือกใช้เกณฑ์เวอร์ชันเดิมหรือเวอร์ชันปัจจุบัน (ผลเดิมยังเก็บไว้) */
function rerun_(p) {
  let req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const reason = clean_(p.reason, 300);
  if (!reason) throw new Error('ระบุเหตุผลที่ประเมินซ้ำ');
  if (toBool_(p.useLatestCriteria)) {
    const set = activeCriteriaFor_(req.typeId);
    if (!set) throw new Error('ไม่มีชุดเกณฑ์ที่ใช้งานอยู่');
    if (toBool_(set.isDemo) && !toBool_(req.isDemo)) throw new Error('ห้ามใช้เกณฑ์สำหรับสาธิตกับคำขอจริง');
    if (set.id !== req.criteriaSetId) {
      const old = DB.get('CriteriaSets', req.criteriaSetId);
      req = DB.update('Requests', req.id, { criteriaSetId: set.id });
      history_(req, req.status, req.status, 'เปลี่ยนเกณฑ์จากเวอร์ชัน ' + (old ? old.version : '?') + ' เป็น ' + set.version + ' — ' + reason);
      audit_('criteria.switch', 'Requests', req.id, { version: set.version }, reason);
    }
  }
  return evaluate_(req, 'rerun', reason);
}

function returnForRevision_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const items = [].concat(p.items || []).map(function (i) { return { section: i.section, message: clean_(i.message, 1000), workId: clean_(i.workId, 20) }; })
    .filter(function (i) { return SECTIONS[i.section] && i.message; });
  if (!items.length) throw new Error('ระบุรายการที่ต้องแก้ไขอย่างน้อย 1 รายการ (เลือกส่วนและข้อความ)');
  // รายการรอบก่อนที่ผู้ยื่นตอบแล้ว ถือว่าเจ้าหน้าที่รับแล้ว
  DB.all('RevisionItems').filter(function (i) { return i.requestId === req.id && i.status !== 'accepted'; }).forEach(function (i) {
    DB.update('RevisionItems', i.id, { status: 'accepted', closedBy: me_().id, closedAt: nowIso_() });
  });
  DB.insertMany('RevisionItems', items.map(function (i) {
    return { requestId: req.id, round: req.round, section: i.section, workId: i.workId, message: i.message, status: 'open', createdBy: me_().id };
  }));
  const r = transition_(req, 'returned', 'ส่งกลับแก้ไข ' + items.length + ' รายการ: ' + items.map(function (i) { return SECTIONS[i.section]; }).join(', '));
  notify_([r.requesterId], r, 'คำขอ ' + r.code + ' ถูกส่งกลับให้แก้ไข ' + items.length + ' รายการ');
  return r;
}

function forward_(p) {
  let req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const reviewer = DB.get('Users', p.reviewerId);
  if (!reviewer || !toBool_(reviewer.active) || !userHasRole_(reviewer, 'reviewer')) throw new Error('เลือกผู้พิจารณา');
  const units = splitList_(reviewer.units);
  if (units.indexOf('*') === -1 && units.indexOf(req.unit) === -1) throw new Error('ผู้พิจารณาที่เลือกไม่ได้รับผิดชอบหน่วยงานนี้');
  const block = [];
  if (!identityVerified_(req)) block.push('ยืนยันตัวบุคคล');
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); });
  const pending = works.filter(function (w) { return w.status === 'pending'; }).length;
  if (pending) block.push('ตรวจผลงานที่ยังค้าง ' + pending + ' รายการ');
  const dups = openDupPairs_(req.id, works).length;
  if (dups) block.push('ตัดสินผลงานที่สงสัยว่าซ้ำ ' + dups + ' คู่');
  const summary = clean_(p.summary, 2000);
  if (!summary) block.push('เขียนสรุปความเห็นของเจ้าหน้าที่');
  if (block.length) throw new Error('ยังส่งต่อไม่ได้ ต้อง: ' + block.join(', '));
  const ev = evaluate_(req, 'forward', 'ประเมินล่าสุดก่อนส่งผู้พิจารณา');
  req = transition_(req, 'pending_decision', 'ส่งต่อผู้พิจารณา: ' + reviewer.name, { reviewerId: reviewer.id, staffSummary: summary, assigneeId: req.assigneeId || me_().id });
  notify_([reviewer.id], req, 'มีคำขอรอพิจารณา: ' + req.code + ' ' + req.title);
  return { request: req, evaluation: ev };
}

function close_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['decided']);
  const d = DB.all('Decisions').filter(function (x) { return x.requestId === req.id; }).pop();
  const r = transition_(req, 'closed', 'แจ้งผลและปิดงาน' + (p.note ? ': ' + clean_(p.note, 300) : ''), { closedAt: nowIso_() });
  notify_([r.requesterId], r, 'ผลการพิจารณาคำขอ ' + r.code + ': ' + (d ? DECISION_LABEL[d.decision] : '-') + (toBool_(r.isDemo) ? ' (คำขอสาธิต — ไม่มีผลจริง)' : ''));
  return r;
}

/* ---------------- ผู้พิจารณา ---------------- */

function decide_(p) {
  const req = loadRequestFor_(p.id);
  requirePerm_('decision.make');
  if (req.reviewerId !== me_().id) throw new Error('คำขอนี้ไม่ได้ส่งมาให้คุณพิจารณา');
  if (req.status !== 'pending_decision') throw new Error('คำขอนี้ไม่อยู่ในสถานะรอพิจารณา');
  if (!DECISION_LABEL[p.decision]) throw new Error('เลือกผลการพิจารณา');
  const reason = clean_(p.reason, 2000);
  if (reason.length < 5) throw new Error('ระบุเหตุผลประกอบการพิจารณา');
  const ev = latestEvaluation_(req.id);
  const d = DB.insert('Decisions', { requestId: req.id, evaluationId: ev ? ev.id : '', decision: p.decision, reason: reason, isDemo: toBool_(req.isDemo), by: me_().id, at: nowIso_() });
  audit_('decide', 'Requests', req.id, { decision: p.decision }, '');
  let r;
  if (p.decision === 'return_to_staff') {
    r = transition_(req, 'in_review', 'ผู้พิจารณาส่งกลับเจ้าหน้าที่: ' + reason);
    notify_([req.assigneeId], r, 'ผู้พิจารณาส่งคำขอ ' + r.code + ' กลับให้ตรวจเพิ่ม');
  } else {
    r = transition_(req, 'decided', 'บันทึกผลพิจารณา: ' + DECISION_LABEL[p.decision], { decidedAt: nowIso_() });
    notify_(staffOf_(r), r, 'คำขอ ' + r.code + ' พิจารณาแล้ว รอแจ้งผลและปิดงาน');
  }
  return { request: r, decision: d };
}

/* ---------------- รายการและรายละเอียด ---------------- */

function requestSummary_(r) {
  const snap = parseJson_(r.personSnap, null);
  const type = DB.get('RequestTypes', r.typeId);
  const st = STATUSES[r.status] || {};
  const last = DB.all('StatusHistory').filter(function (h) { return h.requestId === r.id; }).pop();
  return {
    id: r.id, code: r.code, title: r.title, typeName: type ? type.name : '', unit: r.unit, status: r.status, statusLabel: st.label, nextStep: st.next,
    holder: st.holder, holderName: st.holder === 'staff' ? (r.assigneeId ? userName_(r.assigneeId) : 'เจ้าหน้าที่ของหน่วยงาน (ยังไม่มีผู้รับ)') : st.holder === 'reviewer' ? userName_(r.reviewerId) : st.holder === 'requester' ? userName_(r.requesterId) : '',
    personName: snap ? (snap.nameTh || snap.nameEn) : '', round: r.round, isDemo: toBool_(r.isDemo), requesterName: userName_(r.requesterId),
    assigneeId: r.assigneeId, assigneeName: userName_(r.assigneeId), reviewerName: userName_(r.reviewerId), identityStatus: r.identityStatus,
    createdAt: r.createdAt, submittedAt: r.submittedAt, updatedAt: r.updatedAt, lastChangeAt: last ? last.at : r.createdAt,
    waitingDays: last ? Math.floor(daysBetween_(last.at) || 0) : 0
  };
}

function listRequests_(p) {
  const u = me_();
  let rows = DB.all('Requests').filter(canViewRequest_);
  const f = p || {};
  if (f.status) rows = rows.filter(function (r) { return r.status === f.status; });
  if (f.open) rows = rows.filter(function (r) { return OPEN_STATUSES.indexOf(r.status) > -1; });
  if (f.typeId) rows = rows.filter(function (r) { return r.typeId === f.typeId; });
  if (f.unit) rows = rows.filter(function (r) { return r.unit === f.unit; });
  if (f.assignee === 'me') rows = rows.filter(function (r) { return r.assigneeId === u.id; });
  else if (f.assignee === 'none') rows = rows.filter(function (r) { return !r.assigneeId; });
  else if (f.assignee) rows = rows.filter(function (r) { return r.assigneeId === f.assignee; });
  let out = rows.map(requestSummary_);
  if (f.q) {
    const q = String(f.q).toLowerCase();
    out = out.filter(function (r) { return [r.code, r.title, r.personName, r.requesterName].join(' ').toLowerCase().indexOf(q) > -1; });
  }
  out.sort(function (a, b) { return String(b.lastChangeAt).localeCompare(String(a.lastChangeAt)); });
  return out;
}

function attachmentView_(a) {
  return { id: a.id, workId: a.workId, docType: a.docType, docLabel: a.docType === 'evidence' ? 'หลักฐานผลงาน' : docLabel_(a.docType), fileName: a.fileName, mime: a.mime, size: Number(a.size), status: a.status, uploadedBy: userName_(a.uploadedBy), uploadedAt: a.uploadedAt, removedAt: a.removedAt };
}

function getRequest_(p) {
  const req = loadRequestFor_(p.id);
  const type = DB.get('RequestTypes', req.typeId);
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id; });
  const atts = DB.all('Attachments').filter(function (a) { return a.requestId === req.id; });
  const evals = DB.all('Evaluations').filter(function (e) { return e.requestId === req.id; }).map(evaluationView_).reverse();
  const set = criteriaView_(DB.get('CriteriaSets', req.criteriaSetId));
  const latestSet = activeCriteriaFor_(req.typeId);
  const latest = evals[0] || null;
  const u = me_();
  const actions = actionsFor_(req);
  const out = {
    request: Object.assign({}, req, { personSnap: parseJson_(req.personSnap, null), isDemo: toBool_(req.isDemo), worksComplete: toBool_(req.worksComplete) }),
    summary: requestSummary_(req), type: typeView_(type), criteria: set,
    newerCriteria: latestSet && set && latestSet.id !== set.id ? { id: latestSet.id, version: latestSet.version, name: latestSet.name, isDemo: toBool_(latestSet.isDemo) } : null,
    identityLabel: IDENTITY_LABEL[req.identityStatus || ''],
    works: works.map(function (w) { return Object.assign({}, w, { evidence: atts.filter(function (a) { return a.workId === w.id && a.status === 'active'; }).map(attachmentView_) }); }),
    dupPairs: DB.all('DupPairs').filter(function (d) { return d.requestId === req.id; }).map(function (d) { return Object.assign({}, d, { resolvedByName: userName_(d.resolvedBy) }); }),
    openDupCount: openDupPairs_(req.id, works).length,
    attachments: atts.filter(function (a) { return a.status === 'active' || u.role !== 'requester'; }).map(attachmentView_),
    requiredDocs: type ? requiredDocsFor_(req, type, works, atts.filter(function (a) { return a.status === 'active'; })) : [],
    revisionItems: DB.all('RevisionItems').filter(function (i) { return i.requestId === req.id; }).map(function (i) { return Object.assign({}, i, { createdByName: userName_(i.createdBy) }); }),
    history: DB.all('StatusHistory').filter(function (h) { return h.requestId === req.id; }).map(function (h) { return Object.assign({}, h, { byName: userName_(h.by), fromLabel: (STATUSES[h.fromStatus] || {}).label || '', toLabel: (STATUSES[h.toStatus] || {}).label || '' }); }),
    evaluations: evals, decisions: DB.all('Decisions').filter(function (d) { return d.requestId === req.id; }).map(function (d) { return Object.assign({}, d, { byName: userName_(d.by), isDemo: toBool_(d.isDemo) }); }),
    actions: actions, editable: editableSections_(req), completeness: ['draft', 'returned'].indexOf(req.status) > -1 ? completeness_(req) : null
  };
  out.dataChanged = !!(latest && actions.indexOf('rerun') > -1 && latest.snapshotHash !== currentDataHash_(req));
  if (actions.indexOf('forward') > -1 || actions.indexOf('assign') > -1) {
    out.staffOptions = usersFor_('staff', req.unit, toBool_(req.isDemo) ? undefined : false).map(function (x) { return { id: x.id, name: x.name }; });
    out.reviewerOptions = usersFor_('reviewer', req.unit, toBool_(req.isDemo) ? undefined : false).map(function (x) { return { id: x.id, name: x.name }; });
  }
  return out;
}


/* ======================================================================
 * ส่วน: Files.gs
 * ====================================================================== */

/**
 * Files.gs — ไฟล์แนบ/หลักฐาน
 *
 * - เก็บใน Google Drive ของผู้ Deploy ในโฟลเดอร์ส่วนตัว (ไม่แชร์ ไม่สร้างลิงก์สาธารณะ)
 * - หน้าเว็บไม่เคยได้รับรหัสไฟล์ Drive — เปิดไฟล์ได้ผ่าน api('downloadFile') ที่ตรวจสิทธิ์ต่อคำขอทุกครั้งเท่านั้น
 * - ตรวจชนิดไฟล์จากนามสกุล + เนื้อไฟล์จริง (magic bytes) และจำกัดขนาด
 */

function storageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FILES_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* โฟลเดอร์ถูกลบ → สร้างใหม่ */ } }
  const f = DriveApp.createFolder('RV — ไฟล์แนบคำขอ (ห้ามแชร์โฟลเดอร์นี้)');
  props.setProperty('FILES_FOLDER_ID', f.getId());
  return f;
}

function safeFileName_(n) {
  const s = clean_(n, 150).replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+/, '');
  return s || 'file';
}

/** ตรวจไฟล์: นามสกุลที่อนุญาต ขนาด และเนื้อไฟล์ตรงชนิด — คืน {ext, mime, bytes} */
function checkUpload_(fileName, b64) {
  const ext = (String(fileName).match(/\.([a-z0-9]+)$/i) || [])[1];
  const allowed = splitList_(setting_('ALLOWED_EXT')).map(function (x) { return x.toLowerCase(); });
  if (!ext || allowed.indexOf(ext.toLowerCase()) === -1 || !FILE_TYPES[ext.toLowerCase()]) throw new Error('ชนิดไฟล์ไม่อนุญาต — รับเฉพาะ ' + allowed.join(', '));
  const t = FILE_TYPES[ext.toLowerCase()];
  const data = String(b64 || '');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(data)) throw new Error('ข้อมูลไฟล์ไม่ถูกต้อง');
  const bytes = Utilities.base64Decode(data);
  const max = (Number(setting_('MAX_FILE_MB')) || 10) * 1024 * 1024;
  if (!bytes.length) throw new Error('ไฟล์ว่างเปล่า');
  if (bytes.length > max) throw new Error('ไฟล์ใหญ่เกิน ' + setting_('MAX_FILE_MB') + ' MB');
  const ok = t.magic.every(function (b, i) { return ((bytes[i] + 256) % 256) === b; });
  if (!ok) throw new Error('เนื้อไฟล์ไม่ตรงกับชนิด .' + ext + ' (ไฟล์อาจเสียหายหรือเปลี่ยนนามสกุล)');
  return { ext: ext.toLowerCase(), mime: t.mime, bytes: bytes };
}

function uploadFile_(p) {
  const req = loadRequestFor_(p.id);
  const docType = clean_(p.docType, 40);
  let workId = '';
  if (p.workId) {
    requireEditable_(req, 'works');
    const w = DB.get('RequestWorks', p.workId);
    if (!w || w.requestId !== req.id) throw new Error('ไม่พบผลงาน');
    workId = w.id;
  } else {
    requireEditable_(req, 'documents');
    if (!docType) throw new Error('เลือกชนิดเอกสาร');
  }
  const name = safeFileName_(p.fileName);
  const f = checkUpload_(name, p.data);
  const blob = Utilities.newBlob(f.bytes, f.mime, req.code + '_' + name);
  const file = storageFolder_().createFile(blob);
  const a = DB.insert('Attachments', {
    requestId: req.id, workId: workId, docType: workId ? 'evidence' : docType, fileName: name, mime: f.mime, size: f.bytes.length,
    storageId: file.getId(), status: 'active', uploadedBy: me_().id, uploadedAt: nowIso_()
  });
  if (workId) DB.update('RequestWorks', workId, { evidenceId: a.id });
  audit_('file.upload', 'Attachments', a.id, ['docType', 'size'], '');
  return attachmentView_(a);
}

/** นำไฟล์ออกจากคำขอ — เก็บประวัติและไฟล์เดิมไว้ (สถานะ removed) */
function removeFile_(p) {
  const a = DB.get('Attachments', p.fileId);
  if (!a || a.status !== 'active') throw new Error('ไม่พบไฟล์');
  const req = loadRequestFor_(a.requestId);
  requireEditable_(req, a.workId ? 'works' : 'documents');
  DB.update('Attachments', a.id, { status: 'removed', removedBy: me_().id, removedAt: nowIso_() });
  audit_('file.remove', 'Attachments', a.id, { status: 'removed' }, '');
  return true;
}

/** เปิดไฟล์ — ตรวจสิทธิ์ต่อคำขอทุกครั้ง ผู้ยื่นเห็นเฉพาะไฟล์ที่ยังใช้งาน */
function downloadFile_(p) {
  const a = DB.get('Attachments', p.fileId);
  if (!a) throw new Error('ไม่พบไฟล์ หรือไม่มีสิทธิ์เปิดไฟล์นี้');
  const req = DB.get('Requests', a.requestId);
  if (!canViewRequest_(req)) {
    audit_('file.denied', 'Attachments', a.id, [], 'ไม่มีสิทธิ์');
    throw new Error('ไม่พบไฟล์ หรือไม่มีสิทธิ์เปิดไฟล์นี้');
  }
  if (a.status !== 'active' && me_().role === 'requester') throw new Error('ไฟล์นี้ถูกนำออกแล้ว');
  const bytes = DriveApp.getFileById(a.storageId).getBlob().getBytes();
  audit_('file.download', 'Attachments', a.id, [], '');
  return { fileName: a.fileName, mime: a.mime, data: Utilities.base64Encode(bytes) };
}


/* ======================================================================
 * ส่วน: Reports.gs
 * ====================================================================== */

/**
 * Reports.gs — รายงานงานคำขอ พร้อมนิยามการคำนวณ
 * ใช้เฉพาะข้อมูลในระบบ (StatusHistory, Requests, RevisionItems) — ไม่แสดงตัวเลขประหยัดเวลา/ค่าใช้จ่ายที่ไม่มีข้อมูลรองรับ
 */

const REPORT_DEFINITIONS = [
  { key: 'count', label: 'จำนวนคำขอ', def: 'นับคำขอที่สร้างในช่วงวันที่เลือก (ตาม createdAt) แยกตามสถานะปัจจุบัน ไม่รวมร่างที่ยังไม่เคยยื่นในยอด "ยื่นแล้ว"' },
  { key: 'backlog', label: 'งานค้าง', def: 'คำขอที่สถานะปัจจุบันเป็น ยื่นแล้ว / กำลังตรวจ / ส่งกลับแก้ไข / รอพิจารณา / พิจารณาแล้วรอแจ้งผล — อายุงาน = วันนี้ − วันยื่นครั้งแรก' },
  { key: 'cycle', label: 'เวลาตั้งแต่ยื่นจนปิดงาน', def: 'เฉพาะคำขอที่ปิดงานแล้ว: closedAt − submittedAt (วันยื่นครั้งแรก) หน่วยเป็นวันปฏิทิน แสดงค่าเฉลี่ย ค่ามัธยฐาน และจำนวน' },
  { key: 'stage', label: 'เวลารอในแต่ละขั้น', def: 'จาก StatusHistory: ช่วงเวลาตั้งแต่เข้าสถานะหนึ่งจนเปลี่ยนเป็นสถานะถัดไป รวมทุกครั้งที่เข้าสถานะนั้น ช่วงที่ยังไม่จบ (ยังค้างอยู่) แยกนับเป็น "กำลังรอ"' },
  { key: 'returns', label: 'การส่งกลับแก้ไข', def: 'จำนวนครั้งที่เปลี่ยนเป็นสถานะ "ส่งกลับแก้ไข" จำนวนคำขอที่ถูกส่งกลับอย่างน้อย 1 ครั้ง และจำนวนรายการแก้ไขแยกตามส่วนของคำขอ' }
];

function stats_(arr) {
  if (!arr.length) return { n: 0, avg: null, median: null };
  const s = arr.slice().sort(function (a, b) { return a - b; });
  const sum = s.reduce(function (a, b) { return a + b; }, 0);
  const mid = Math.floor(s.length / 2);
  const med = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { n: s.length, avg: Math.round(sum / s.length * 10) / 10, median: Math.round(med * 10) / 10 };
}

function report_(p) {
  requirePerm_('reports.view');
  const from = clean_(p.from, 10), to = clean_(p.to, 10);
  const inRange = function (d) { const x = String(d || '').slice(0, 10); return x && (!from || x >= from) && (!to || x <= to); };
  let reqs = DB.all('Requests').filter(function (r) { return inScope_(r.unit) || CURRENT_USER_.role === 'admin'; });
  if (CURRENT_USER_.role === 'reviewer') reqs = reqs.filter(function (r) { return r.reviewerId === CURRENT_USER_.id; });
  if (!toBool_(p.includeDemo)) reqs = reqs.filter(function (r) { return !toBool_(r.isDemo); });
  if (p.typeId) reqs = reqs.filter(function (r) { return r.typeId === p.typeId; });
  const ids = {}; reqs.forEach(function (r) { ids[r.id] = r; });
  const created = reqs.filter(function (r) { return inRange(r.createdAt); });
  const byStatus = {};
  Object.keys(STATUSES).forEach(function (s) { byStatus[s] = 0; });
  created.forEach(function (r) { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
  const byType = {};
  created.forEach(function (r) { const t = DB.get('RequestTypes', r.typeId); const k = t ? t.name : r.typeId; byType[k] = (byType[k] || 0) + 1; });

  const backlog = reqs.filter(function (r) { return OPEN_STATUSES.indexOf(r.status) > -1; }).map(function (r) {
    return { code: r.code, title: r.title, status: r.status, statusLabel: STATUSES[r.status].label, ageDays: r.submittedAt ? Math.floor(daysBetween_(r.submittedAt)) : null, holder: requestSummary_(r).holderName };
  }).sort(function (a, b) { return (b.ageDays || 0) - (a.ageDays || 0); });

  const closed = reqs.filter(function (r) { return r.status === 'closed' && r.submittedAt && r.closedAt && inRange(r.closedAt); });
  const cycle = stats_(closed.map(function (r) { return daysBetween_(r.submittedAt, r.closedAt); }));

  const hist = DB.all('StatusHistory').filter(function (h) { return ids[h.requestId]; });
  const byReq = {};
  hist.forEach(function (h) { (byReq[h.requestId] = byReq[h.requestId] || []).push(h); });
  const stage = {}, waiting = {};
  Object.keys(byReq).forEach(function (rid) {
    const list = byReq[rid].filter(function (h) { return h.fromStatus !== h.toStatus; });
    list.forEach(function (h, i) {
      const next = list[i + 1];
      if (next) { if (inRange(next.at)) (stage[h.toStatus] = stage[h.toStatus] || []).push(daysBetween_(h.at, next.at)); }
      else if (OPEN_STATUSES.indexOf(h.toStatus) > -1) (waiting[h.toStatus] = waiting[h.toStatus] || []).push(daysBetween_(h.at));
    });
  });
  const stages = OPEN_STATUSES.concat(['draft']).map(function (s) {
    return { status: s, label: STATUSES[s].label, done: stats_(stage[s] || []), waitingNow: stats_(waiting[s] || []) };
  });

  const returnEvents = hist.filter(function (h) { return h.toStatus === 'returned' && inRange(h.at); });
  const returnedReqs = {}; returnEvents.forEach(function (h) { returnedReqs[h.requestId] = true; });
  const items = DB.all('RevisionItems').filter(function (i) { return ids[i.requestId] && inRange(i.createdAt); });
  const bySection = {};
  items.forEach(function (i) { bySection[SECTIONS[i.section] || i.section] = (bySection[SECTIONS[i.section] || i.section] || 0) + 1; });

  return {
    range: { from: from, to: to }, includeDemo: toBool_(p.includeDemo), definitions: REPORT_DEFINITIONS,
    counts: { created: created.length, submitted: created.filter(function (r) { return r.submittedAt; }).length, byStatus: byStatus, byType: byType },
    backlog: { total: backlog.length, list: backlog.slice(0, 50), age: stats_(backlog.filter(function (b) { return b.ageDays !== null; }).map(function (b) { return b.ageDays; })) },
    cycle: cycle, stages: stages,
    returns: { events: returnEvents.length, requests: Object.keys(returnedReqs).length, bySection: bySection, recent: items.slice(-10).reverse().map(function (i) { return { section: SECTIONS[i.section], message: i.message, at: i.createdAt }; }) },
    generatedAt: nowIso_()
  };
}


/* ======================================================================
 * ส่วน: Admin.gs
 * ====================================================================== */

/**
 * Admin.gs — ผู้ดูแลระบบ: ผู้ใช้ สิทธิ์ หน่วยงาน ประเภทคำขอ ชุดเกณฑ์ ค่าตั้งค่า แหล่งข้อมูล และบันทึกการใช้งาน
 */

function userView_(u) {
  return { id: u.id, email: u.email, name: u.name, roles: splitList_(u.roles), units: splitList_(u.units), active: toBool_(u.active), isTest: toBool_(u.isTest), updatedAt: u.updatedAt || u.createdAt };
}

function listUsers_() { requirePerm_('admin.users'); return DB.all('Users').map(userView_); }

function saveUser_(p) {
  requirePerm_('admin.users');
  const email = clean_(p.email, 120).toLowerCase();
  const name = clean_(p.name, 120);
  const roles = [].concat(p.roles || []).filter(function (r) { return ROLES[r]; });
  const units = [].concat(p.units || []).map(function (x) { return clean_(x, 40); }).filter(String);
  if (!name) throw new Error('กรอกชื่อผู้ใช้');
  if (!p.isTest && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง');
  if (!p.isTest && !emailInDomain_(email)) throw new Error('ต้องเป็นอีเมล @' + allowedDomain_() + ' เท่านั้น');
  if (!roles.length) throw new Error('เลือกบทบาทอย่างน้อย 1 บทบาท');
  if (!units.length) throw new Error('เลือกหน่วยงานที่รับผิดชอบ (หรือ * = ทุกหน่วยงาน)');
  const fields = { email: email, name: name, roles: roles.join(','), units: units.join(','), active: p.active !== false };
  const dupe = DB.all('Users').filter(function (u) { return email && u.email.toLowerCase() === email && u.id !== p.id && toBool_(u.isTest) === !!p.isTest; })[0];
  if (dupe) throw new Error('มีผู้ใช้อีเมลนี้แล้ว');
  if (p.id) {
    const cur = DB.get('Users', p.id);
    if (!cur) throw new Error('ไม่พบผู้ใช้');
    if (cur.id === me_().id && (roles.indexOf('admin') === -1 || fields.active === false)) throw new Error('ไม่สามารถถอดสิทธิ์ผู้ดูแลหรือระงับบัญชีของตัวเอง');
    const r = DB.update('Users', cur.id, fields);
    audit_('user.update', 'Users', cur.id, { roles: fields.roles, units: fields.units, active: fields.active }, '');
    return userView_(r);
  }
  if (p.isTest && !toBool_(setting_('TEST_MODE'))) throw new Error('สร้างบัญชีทดสอบได้เฉพาะในโหมดทดสอบ');
  const r = DB.insert('Users', Object.assign(fields, { isTest: !!p.isTest }));
  audit_('user.create', 'Users', r.id, { roles: fields.roles, units: fields.units }, '');
  return userView_(r);
}

function saveUnit_(p) {
  requirePerm_('admin.settings');
  const code = clean_(p.code, 40).toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
  const name = clean_(p.name, 200);
  if (!code || !name) throw new Error('กรอกรหัสและชื่อหน่วยงาน');
  if (code === '*') throw new Error('ใช้ * เป็นรหัสหน่วยงานไม่ได้');
  const cur = p.id ? DB.get('Units', p.id) : null;
  if (DB.all('Units').some(function (u) { return u.code === code && (!cur || u.id !== cur.id); })) throw new Error('รหัสหน่วยงานซ้ำ');
  if (cur && cur.code !== code) throw new Error('เปลี่ยนรหัสหน่วยงานที่สร้างแล้วไม่ได้ (คำขอเดิมอ้างอิงอยู่)');
  const r = cur ? DB.update('Units', cur.id, { name: name, active: p.active !== false }) : DB.insert('Units', { code: code, name: name, active: true });
  audit_('unit.save', 'Units', r.id, ['name', 'active'], '');
  return r;
}

function saveType_(p) {
  requirePerm_('admin.criteria');
  const name = clean_(p.name, 200);
  if (!name) throw new Error('กรอกชื่อประเภทคำขอ');
  const seen = {};
  const docs = [].concat(p.requiredDocs || []).map(function (d) {
    const code = clean_(d.code, 40).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!code || !clean_(d.label)) throw new Error('เอกสารต้องมีรหัส (a-z) และชื่อ');
    if (code === 'evidence' || seen[code]) throw new Error('รหัสเอกสารซ้ำหรือสงวนไว้: ' + code);
    seen[code] = true;
    return { code: code, label: clean_(d.label, 200), when: d.when === 'person_not_in_source' ? 'person_not_in_source' : 'always', hint: clean_(d.hint, 200) };
  });
  const fields = { name: name, description: clean_(p.description, 1000), personRole: clean_(p.personRole, 100), requiredDocs: JSON.stringify(docs), active: p.active !== false, isDemo: !!p.isDemo };
  let r;
  if (p.id) { if (!DB.get('RequestTypes', p.id)) throw new Error('ไม่พบประเภทคำขอ'); r = DB.update('RequestTypes', p.id, fields); }
  else r = DB.insert('RequestTypes', Object.assign(fields, { code: clean_(p.code, 40).toUpperCase() || ('TYPE-' + Utilities.getUuid().slice(0, 5).toUpperCase()) }));
  audit_('type.save', 'RequestTypes', r.id, Object.keys(fields), '');
  return typeView_(r);
}

const SETTING_RULES_ = {
  ORG_NAME: function (v) { return clean_(v, 200); },
  ALLOWED_DOMAIN: function (v) {
    const d = String(v || '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error('โดเมนไม่ถูกต้อง (เช่น mahidol.ac.th)');
    const me = activeEmail_();
    if (me && me.slice(-(d.length + 1)) !== '@' + d) throw new Error('บัญชีที่คุณใช้อยู่ (' + me + ') ไม่อยู่ในโดเมนนี้ — จะทำให้คุณเข้าระบบไม่ได้');
    return d;
  },
  TEST_MODE: function (v) { return toBool_(v) ? 'true' : 'false'; },
  AUTO_REGISTER: function (v) { return toBool_(v) ? 'true' : 'false'; },
  SIMPLE_MODE: function (v) { return toBool_(v) ? 'true' : 'false'; },
  MUHR_MODE: function (v) { if (!SOURCE_MODES[v]) throw new Error('โหมด MUHR ไม่ถูกต้อง'); return v; },
  MUREX_MODE: function (v) { if (!SOURCE_MODES[v]) throw new Error('โหมด MUREX ไม่ถูกต้อง'); return v; },
  SIM_OUTAGE_MUHR: function (v) { return toBool_(v) ? 'true' : 'false'; },
  SIM_OUTAGE_MUREX: function (v) { return toBool_(v) ? 'true' : 'false'; },
  STALE_DAYS: function (v) { const n = Math.floor(Number(v)); if (!(n >= 1 && n <= 3650)) throw new Error('จำนวนวันข้อมูลเก่าต้องอยู่ระหว่าง 1–3650'); return String(n); },
  MAX_FILE_MB: function (v) { const n = Number(v); if (!(n > 0 && n <= 25)) throw new Error('ขนาดไฟล์ต้องอยู่ระหว่าง 1–25 MB'); return String(n); },
  ALLOWED_EXT: function (v) {
    const list = splitList_(String(v).toLowerCase()).filter(function (x) { return FILE_TYPES[x]; });
    if (!list.length) throw new Error('ต้องอนุญาตอย่างน้อย 1 ชนิด (ระบบรองรับ: ' + Object.keys(FILE_TYPES).join(', ') + ')');
    return list.join(',');
  },
  EXTERNAL_NOTIFY: function (v) {
    if (v !== 'off') throw new Error('ยังเปิดการแจ้งเตือนภายนอกไม่ได้ — ต้องกำหนดช่องทาง ผู้รับ และเพิ่มสิทธิ์ส่งอีเมลในโค้ดก่อน (ดูคู่มือ)');
    return 'off';
  }
};

function saveSettings_(p) {
  requirePerm_('admin.settings');
  const patch = {};
  Object.keys(p.settings || {}).forEach(function (k) { if (SETTING_RULES_[k]) patch[k] = SETTING_RULES_[k](p.settings[k]); });
  if (!Object.keys(patch).length) throw new Error('ไม่มีค่าที่เปลี่ยน');
  setSettings_(patch);
  audit_('settings.save', 'Settings', '', patch.MUHR_MODE || patch.MUREX_MODE ? { mode: (patch.MUHR_MODE || '') + '/' + (patch.MUREX_MODE || '') } : Object.keys(patch), '');
  return getSettings_();
}

function adminOverview_() {
  requirePerm_('admin.settings');
  return {
    settings: getSettings_(), toConfirm: TO_CONFIRM, sources: [sourceStatus_('MUHR'), sourceStatus_('MUREX')],
    users: DB.all('Users').map(userView_), units: DB.all('Units'), types: DB.all('RequestTypes').map(typeView_),
    criteria: DB.all('CriteriaSets').map(function (c) { return Object.assign(criteriaView_(c), { createdByName: userName_(c.createdBy), usedBy: DB.all('Requests').filter(function (r) { return r.criteriaSetId === c.id; }).length }); }),
    batches: DB.all('ImportBatches').reverse().slice(0, 30).map(function (b) { return Object.assign({}, b, { createdByName: userName_(b.createdBy) }); }),
    importColumns: IMPORT_COLUMNS
  };
}

function listAudit_(p) {
  requirePerm_('audit.view');
  let rows = DB.all('Audit');
  if (p.entityId) rows = rows.filter(function (r) { return r.entityId === p.entityId; });
  if (p.action) rows = rows.filter(function (r) { return String(r.action).indexOf(p.action) === 0; });
  return rows.slice(-300).reverse().map(function (r) { return Object.assign({}, r, { userName: userName_(r.userId) }); });
}

/** ล้างข้อมูลสาธิต (คำขอสาธิตและข้อมูลที่เกี่ยวข้อง) ก่อนเริ่มใช้งานจริง — ข้อมูลจำลอง MUHR/MUREX และบัญชีทดสอบลบได้ตามตัวเลือก */
function purgeDemo_(p) {
  requirePerm_('admin.settings');
  if (String(p.confirm || '') !== 'ล้างข้อมูลสาธิต') throw new Error('พิมพ์ "ล้างข้อมูลสาธิต" เพื่อยืนยัน');
  const ids = {};
  DB.all('Requests').forEach(function (r) { if (toBool_(r.isDemo)) ids[r.id] = true; });
  const byReq = function (r) { return ids[r.requestId]; };
  DB.all('Attachments').filter(byReq).forEach(function (a) { try { DriveApp.getFileById(a.storageId).setTrashed(true); } catch (e) { /* ไฟล์ถูกลบไปแล้ว */ } });
  const n = { requests: DB.removeWhere('Requests', function (r) { return ids[r.id]; }) };
  ['RequestWorks', 'DupPairs', 'Attachments', 'RevisionItems', 'StaffChecks', 'Evaluations', 'Decisions', 'StatusHistory', 'Notifications'].forEach(function (t) { n[t] = DB.removeWhere(t, byReq); });
  if (p.mockSources) { n.persons = DB.removeWhere('Persons', function (r) { return r.origin === 'mock'; }); n.works = DB.removeWhere('SourceWorks', function (r) { return r.origin === 'mock'; }); }
  if (p.testUsers) n.testUsers = DB.removeWhere('Users', function (u) { return toBool_(u.isTest); });
  audit_('demo.purge', 'Requests', '', Object.keys(n), JSON.stringify(n));
  return n;
}


/* ======================================================================
 * ส่วน: Api.gs
 * ====================================================================== */

/**
 * Api.gs — จุดเรียกเดียวจากหน้าเว็บ: google.script.run.api(action, payload)
 * ทุกคำสั่งระบุตัวผู้ใช้ใหม่และตรวจสิทธิ์ที่ฝั่งเซิร์ฟเวอร์ (ไม่เชื่อสิทธิ์ที่หน้าเว็บส่งมา)
 */

/** คำสั่งที่อ่านอย่างเดียว (ไม่ต้องล็อก) */
// คำสั่งที่ใช้เวลานาน (เรียกฐานข้อมูลภายนอก) ไม่ล็อกทั้งสคริปต์ เพื่อไม่ให้ผู้ใช้อื่นต้องรอ
const READ_ONLY_ = ['quickSearch', 'scholarSearch', 'checkWorkDb', 'testApiKeys', 'testSourceApi', 'scholarAdmin', 'sourceApi', 'boot', 'dashboard', 'listRequests', 'getRequest', 'searchPersons', 'sourceWorks', 'downloadFile', 'report', 'notifications', 'adminOverview', 'listUsers', 'importBatch', 'listAudit', 'completeness'];

const ACTIONS_ = {
  boot: boot_,
  dashboard: dashboard_,
  listRequests: function (p) { return listRequests_(p); },
  getRequest: getRequest_,
  completeness: function (p) { return completeness_(loadRequestFor_(p.id)); },

  // ผู้ยื่นเรื่อง
  createRequest: createRequest_,
  updateInfo: updateInfo_,
  searchPersons: function (p) { if (!can_('request.create') && !can_('request.review')) requirePerm_('request.create'); return searchPersons_(p); },
  setPerson: setPerson_,
  sourceWorks: sourceWorksFor_,
  addSourceWorks: addSourceWorks_,
  saveManualWork: saveManualWork_,
  withdrawWork: withdrawWork_,
  uploadFile: uploadFile_,
  removeFile: removeFile_,
  downloadFile: downloadFile_,
  respondRevision: respondRevision_,
  quickSearch: quickSearch_,
  scholarSearch: scholarSearch_,
  addScholarWorks: addScholarWorks_,
  checkWorkDb: checkWorkDb_,
  submit: submit_,
  cancel: cancel_,

  // เจ้าหน้าที่
  claim: claim_,
  assign: assign_,
  confirmIdentity: confirmIdentity_,
  verifyWork: verifyWork_,
  resolveDup: resolveDup_,
  setWorksComplete: setWorksComplete_,
  staffCheck: staffCheck_,
  rerun: rerun_,
  returnForRevision: returnForRevision_,
  forward: forward_,
  close: close_,

  // ผู้พิจารณา
  decide: decide_,

  // ทุกบทบาท
  report: report_,
  notifications: function () { return DB.all('Notifications').filter(function (n) { return n.userId === me_().id; }).reverse().slice(0, 50); },
  markRead: function (p) {
    const mine = DB.all('Notifications').filter(function (n) { return n.userId === me_().id && !n.readAt && (!p.id || n.id === p.id); });
    mine.forEach(function (n) { DB.update('Notifications', n.id, { readAt: nowIso_() }); });
    return mine.length;
  },

  // ผู้ดูแลระบบ
  adminOverview: adminOverview_,
  listUsers: listUsers_,
  saveUser: saveUser_,
  saveUnit: saveUnit_,
  saveType: saveType_,
  saveCriteria: saveCriteriaDraft_,
  activateCriteria: activateCriteria_,
  retireCriteria: retireCriteria_,
  saveSettings: saveSettings_,
  importPreview: importPreview_,
  importBatch: function (p) { requirePerm_('admin.data'); return importBatchView_(p.batchId); },
  importCommit: importCommit_,
  importDiscard: importDiscard_,
  listAudit: listAudit_,
  purgeDemo: purgeDemo_,
  scholarAdmin: scholarAdmin_,
  saveApiKeys: function (p) { requirePerm_('admin.data'); return saveApiKeys_(p); },
  testApiKeys: function () { requirePerm_('admin.data'); return testApiKeys_(); },
  saveScholarSettings: function (p) { requirePerm_('admin.data'); setSettings_({ SCHOLAR_AFFIL: clean_(p.affil, 150), OPENALEX_MAILTO: clean_(p.mailto, 120) }); return scholarAdmin_(); },
  importJournalCsv: importJournalCsv_,
  clearJournals: function (p) { return clearJournalIndex_(p); },
  sourceApi: function () { requirePerm_('admin.data'); return { MUHR: apiAdminView_('MUHR'), MUREX: apiAdminView_('MUREX') }; },
  saveSourceApi: saveSourceApi_,
  testSourceApi: testSourceApi_
};

function api(action, payload) {
  if (typeof action !== 'string') {
    // ถูกรันจากตัวแก้ไข Apps Script โดยตรง — ฟังก์ชันนี้สำหรับหน้าเว็บเท่านั้น
    const msg = 'ฟังก์ชัน api ใช้สำหรับหน้าเว็บเท่านั้น — ให้เลือกฟังก์ชัน setup ในรายการด้านบน แล้วกด ▶ เรียกใช้';
    Logger.log(msg);
    return msg;
  }
  const p = payload || {};
  let lock = null;
  try {
    ensureSchema_();
    const who = resolveUser_(p);
    delete p._as; delete p._role;
    const fn = ACTIONS_[action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + action);
    if (!who.user && action !== 'boot') throw new Error(who.domainBlocked ? 'ไม่มีสิทธิ์ใช้งาน — ต้องเข้าสู่ระบบด้วยบัญชี @' + who.domain : 'ไม่มีสิทธิ์ใช้งาน — บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ');
    if (READ_ONLY_.indexOf(action) === -1) { lock = LockService.getScriptLock(); lock.waitLock(20000); }
    const data = fn(p, who);
    return JSON.parse(JSON.stringify({ ok: true, data: data }));
  } catch (e) {
    const out = { ok: false, error: e && e.message ? e.message : String(e) };
    if (e && e.sourceError) out.sourceError = e.sourceError;
    return out;
  } finally {
    if (lock) try { lock.releaseLock(); } catch (e) { /* ignore */ }
  }
}

/** ข้อมูลเริ่มต้นของหน้าเว็บ: ผู้ใช้ บทบาท ค่าคงที่ และบัญชีทดสอบ (เฉพาะโหมดทดสอบ) */
function boot_(p, who) {
  const s = getSettings_();
  const base = {
    app: APP, org: s.ORG_NAME, scholarAffil: s.SCHOLAR_AFFIL, simpleMode: toBool_(s.SIMPLE_MODE), testMode: who.testMode, signedInEmail: who.email, domainBlocked: !!who.domainBlocked, allowedDomain: allowedDomain_(),
    testAccounts: who.testMode && !who.domainBlocked ? DB.all('Users').filter(function (u) { return toBool_(u.isTest) && toBool_(u.active); }).map(function (u) { return { id: u.id, name: u.name, roles: splitList_(u.roles), units: splitList_(u.units) }; }) : []
  };
  if (!who.user) return Object.assign(base, { user: null });
  return Object.assign(base, {
    user: who.user,
    meta: {
      roles: ROLES, statuses: STATUSES, sections: SECTIONS, workTypes: WORK_TYPES, degrees: DEGREES, ranks: RANKS, empStatus: EMP_STATUS,
      ruleKinds: RULE_KINDS, results: RESULT_LABEL, decisions: DECISION_LABEL, identity: IDENTITY_LABEL, sourceModes: SOURCE_MODES,
      allowedExt: splitList_(s.ALLOWED_EXT), maxFileMb: Number(s.MAX_FILE_MB), staleDays: Number(s.STALE_DAYS),
      databases: DATABASES, dbGroups: DB_GROUPS, currentBE: currentBE_()
    },
    units: DB.all('Units').filter(function (u) { return toBool_(u.active); }),
    types: DB.all('RequestTypes').filter(function (t) { return toBool_(t.active); }).map(function (t) {
      const c = activeCriteriaFor_(t.id);
      return Object.assign(typeView_(t), { criteria: c ? { id: c.id, name: c.name, version: c.version, isDemo: toBool_(c.isDemo), effectiveDate: c.effectiveDate, referenceSource: c.referenceSource } : null });
    }),
    sources: [sourceStatus_('MUHR'), sourceStatus_('MUREX')],
    unread: DB.all('Notifications').filter(function (n) { return n.userId === who.user.id && !n.readAt; }).length
  });
}

/** งานที่ต้องทำของแต่ละบทบาท */
function dashboard_() {
  const u = me_();
  const list = listRequests_({});
  const by = function (st) { return list.filter(function (r) { return r.status === st; }); };
  const out = { role: u.role, tasks: [], counts: {}, recent: list.slice(0, 8) };
  Object.keys(STATUSES).forEach(function (s) { out.counts[s] = by(s).length; });
  const task = function (key, label, items, hint, tone) { if (items.length) out.tasks.push({ key: key, label: label, count: items.length, items: items.slice(0, 6), hint: hint, tone: tone || 'info' }); };
  if (u.role === 'requester') {
    task('returned', 'ถูกส่งกลับให้แก้ไข', by('returned'), 'เปิดคำขอ แก้ส่วนที่ระบุ ตอบรายการแก้ไข แล้วยื่นใหม่', 'warning');
    task('draft', 'ร่างที่ยังไม่ได้ยื่น', by('draft'), 'ตรวจความครบถ้วนแล้วกดยื่นคำขอ', 'info');
    task('waiting', 'อยู่ระหว่างดำเนินการ', list.filter(function (r) { return ['submitted', 'in_review', 'pending_decision', 'decided'].indexOf(r.status) > -1; }), 'ไม่ต้องทำอะไร — ติดตามสถานะได้ที่หน้าคำขอ', 'neutral');
  } else if (u.role === 'staff') {
    task('unassigned', 'คำขอใหม่ที่ยังไม่มีผู้รับ', list.filter(function (r) { return r.status === 'submitted' && !r.assigneeId; }), 'กด "รับเรื่อง" เพื่อเริ่มตรวจ', 'warning');
    task('mine', 'คำขอที่ฉันกำลังตรวจ/ถูกยื่นใหม่', list.filter(function (r) { return ['in_review', 'submitted'].indexOf(r.status) > -1 && r.assigneeId === u.id; }), 'ยืนยันตัวบุคคลและผลงาน แล้วส่งกลับแก้ไขหรือส่งต่อผู้พิจารณา', 'info');
    task('toclose', 'พิจารณาแล้ว รอแจ้งผลและปิดงาน', by('decided'), 'แจ้งผลและปิดงาน', 'success');
    task('returned', 'รอผู้ยื่นแก้ไข', by('returned'), 'ไม่ต้องทำอะไรจนกว่าผู้ยื่นจะยื่นใหม่', 'neutral');
  } else if (u.role === 'reviewer') {
    task('decide', 'รอคุณพิจารณา', by('pending_decision'), 'ดูผลตรวจรายเกณฑ์และหลักฐาน แล้วบันทึกผลพร้อมเหตุผล', 'warning');
  } else if (u.role === 'admin') {
    const s = getSettings_();
    const alerts = [];
    if (toBool_(s.TEST_MODE)) alerts.push({ tone: 'warning', text: 'โหมดทดสอบเปิดอยู่ — ทุกคนที่เข้าเว็บเลือกใช้บัญชีทดสอบได้ ต้องปิดก่อนใช้งานจริง' });
    ['MUHR', 'MUREX'].forEach(function (k) { const st = sourceStatus_(k); alerts.push({ tone: st.mode === 'mock' || st.outage ? 'warning' : 'info', text: k + ': ' + st.modeLabel + ' — ' + st.message }); });
    const demoActive = DB.all('CriteriaSets').filter(function (c) { return c.status === 'active' && toBool_(c.isDemo); }).length;
    if (demoActive) alerts.push({ tone: 'warning', text: 'มีชุดเกณฑ์สำหรับสาธิตเปิดใช้อยู่ ' + demoActive + ' ชุด — ใช้กับคำขอสาธิตเท่านั้น' });
    const realActive = DB.all('CriteriaSets').filter(function (c) { return c.status === 'active' && !toBool_(c.isDemo); }).length;
    if (!realActive) alerts.push({ tone: 'info', text: 'ยังไม่มีชุดเกณฑ์จริงที่ยืนยันแล้ว — ต้องได้รับเกณฑ์ ประกาศอ้างอิง และผู้ยืนยันจากหน่วยงาน' });
    out.alerts = alerts;
    out.pendingImports = DB.all('ImportBatches').filter(function (b) { return b.status === 'preview'; }).length;
  }
  return out;
}
