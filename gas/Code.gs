/**
 * ======================================================================
 *  ระบบติดตามผลงานวิชาการ — บัณฑิตวิทยาลัย มหาวิทยาลัยมหิดล (MUGR)
 *  ไฟล์: Code.gs  (วางทั้งไฟล์นี้ใน Apps Script ไฟล์ชื่อ "Code")
 *
 *  ไฟล์นี้รวมโค้ดฝั่งเซิร์ฟเวอร์ทั้งหมดไว้ในไฟล์เดียว เรียงตามส่วน:
 *  1. Config  2. Database  3. Logic  4. Auth  5. Api  6. Reports  7. SampleData  8. Discovery  9. Code
 *
 *  หลังวางครบ 3 ไฟล์ (Code.gs, Index.html, appsscript.json):
 *  เลือกฟังก์ชัน setup → กด ▶ เรียกใช้ → อนุญาตสิทธิ์ → Deploy เป็นเว็บแอป
 * ======================================================================
 */

/* ======================================================================
 * ส่วน: Config.gs
 * ====================================================================== */

/**
 * Config.gs — ค่าคงที่ของระบบ, โครงสร้างตาราง, ฐานข้อมูลวารสาร, น้ำหนักคะแนน และเกณฑ์มาตรฐาน
 *
 * ระบบติดตามผลงานวิชาการ บัณฑิตวิทยาลัย มหาวิทยาลัยมหิดล (MUGR)
 *
 * หมายเหตุ: เกณฑ์และน้ำหนักทั้งหมดในไฟล์นี้เป็น "ค่าเริ่มต้น" — น้ำหนักคะแนนแก้ไขได้จากหน้า
 * จัดการระบบ > น้ำหนักคะแนน โดยไม่ต้องแก้โค้ด ส่วนเกณฑ์คุณสมบัติให้ตรวจสอบกับประกาศฉบับล่าสุด
 * ของ อว./ก.พ.อ. และข้อบังคับมหาวิทยาลัยก่อนใช้งานจริง
 */

const APP = {
  name: 'ระบบติดตามผลงานวิชาการ',
  org: 'บัณฑิตวิทยาลัย มหาวิทยาลัยมหิดล',
  orgShort: 'บัณฑิตวิทยาลัย · มหิดล (MUGR)',
  code: 'MUGR',
  version: '1.0.0',
  schemaVersion: 4,
  windowYears: 5,
  dbName: 'MUGR — ฐานข้อมูลระบบติดตามผลงานวิชาการ',
  reportFolder: 'MUGR — รายงาน PDF',
  evidenceFolder: 'MUGR — ไฟล์ผลงาน'
};

/** บทบาทผู้ใช้งาน */
const ROLES = {
  admin:     { label: 'ผู้ดูแลระบบ', en: 'Admin' },
  chair:     { label: 'ประธานหลักสูตร', en: 'Program Chair' },
  lecturer:  { label: 'อาจารย์', en: 'Lecturer' },
  executive: { label: 'ผู้บริหาร', en: 'Executive' }
};

/** สิทธิ์ตามบทบาท (ใช้ทั้งฝั่งเซิร์ฟเวอร์และส่งให้หน้าเว็บซ่อน/แสดงปุ่ม) */
const PERMISSIONS = {
  admin:     ['view_all', 'edit_pub_all', 'verify_all', 'manage_faculty', 'manage_curriculum', 'manage_expert', 'assess', 'report', 'manage_users', 'manage_settings'],
  chair:     ['view_all', 'edit_pub_own_curriculum', 'verify_own_curriculum', 'manage_faculty_own_curriculum', 'manage_expert', 'assess', 'report'],
  lecturer:  ['edit_pub_self', 'report_self'],
  executive: ['view_all', 'assess_view', 'report']
};

/** โครงสร้างชีต (คอลัมน์แรกต้องเป็น id ทุกตาราง ยกเว้น Settings/Audit) */
const TABLES = {
  Users:        ['id', 'email', 'name', 'role', 'facultyId', 'curriculumIds', 'active', 'isSample', 'createdAt'],
  Curricula:    ['id', 'code', 'nameTh', 'nameEn', 'level', 'criteriaYear', 'chairFacultyId', 'status', 'note', 'isSample', 'createdAt', 'updatedAt'],
  Faculty:      ['id', 'prefix', 'nameTh', 'nameEn', 'email', 'position', 'degree', 'degreeDetail', 'curriculumIds', 'scopusId', 'orcid', 'active', 'isSample', 'createdAt', 'updatedAt'],
  Experts:      ['id', 'prefix', 'nameTh', 'nameEn', 'affiliation', 'position', 'degree', 'degreeDetail', 'roleType', 'level', 'criteriaYear', 'curriculumId', 'researchExp', 'scopusId', 'orcid', 'checkResult', 'checkNote', 'checkedBy', 'checkedAt', 'isSample', 'createdAt', 'updatedAt'],
  Publications: ['id', 'personType', 'personId', 'title', 'source', 'year', 'type', 'database', 'quartile', 'authorRole', 'doi', 'url', 'status', 'verifyNote', 'verifiedBy', 'verifiedAt', 'note', 'isSample', 'createdBy', 'createdAt', 'updatedAt'],
  Assessments:  ['id', 'curriculumId', 'year', 'score', 'summary', 'createdBy', 'createdAt', 'isSample'],
  JournalIndex: ['issn', 'title', 'database', 'quartile', 'source', 'updatedAt'],
  Settings:     ['key', 'value'],
  Audit:        ['ts', 'email', 'action', 'detail']
};

const ID_PREFIX = { Users: 'U', Curricula: 'C', Faculty: 'F', Experts: 'X', Publications: 'P', Assessments: 'A' };

/** ค่าตั้งต้นของระบบ */
const DEFAULT_SETTINGS = {
  EVAL_YEAR: '',            // ว่าง = ปี พ.ศ. ปัจจุบัน
  ALLOW_GUEST: 'false',     // ผู้ใช้ที่ไม่มีในรายชื่อ เข้าดูแบบผู้บริหาร (อ่านอย่างเดียว) ได้หรือไม่
  SAMPLE_DATA: 'false',     // กำลังแสดงข้อมูลตัวอย่างหรือไม่ (ตั้งอัตโนมัติ)
  REPORT_TO_DRIVE: 'true',  // บันทึกสำเนา PDF ลง Google Drive
  ORG_NAME: APP.org,
  OPENALEX_MAILTO: '',      // อีเมลติดต่อสำหรับ OpenAlex (ว่าง = อีเมลผู้ Deploy)
  // ---- น้ำหนักคะแนน (ตามแนวทาง สกอ./สป.อว. ร่วมกับฐานข้อมูลตามประกาศ ก.พ.อ. พ.ศ. 2562) ----
  W_Q1: '1.00', W_Q2: '1.00', W_Q3: '1.00', W_Q4: '1.00', W_NOQ: '1.00',
  W_OTHER_INTL: '0.80', W_TCI1: '0.80', W_TCI2: '0.60', W_OTHER_NAT: '0.40',
  W_PROC_INTL: '0.40', W_PROC_NAT: '0.20',
  W_TEXTBOOK: '1.00', W_BOOK: '1.00', W_PATENT: '1.00', W_PETTY: '0.40', W_SOCIAL: '1.00'
};

/** คำอธิบายน้ำหนักคะแนน (แสดงในหน้าตั้งค่าและคู่มือ) */
const WEIGHT_LABELS = [
  { key: 'W_Q1', label: 'วารสารในฐานข้อมูลนานาชาติตามประกาศ ก.พ.อ. — Quartile 1 (Q1)', group: 'วารสารนานาชาติ (ก.พ.อ.)' },
  { key: 'W_Q2', label: 'วารสารในฐานข้อมูลนานาชาติตามประกาศ ก.พ.อ. — Quartile 2 (Q2)', group: 'วารสารนานาชาติ (ก.พ.อ.)' },
  { key: 'W_Q3', label: 'วารสารในฐานข้อมูลนานาชาติตามประกาศ ก.พ.อ. — Quartile 3 (Q3)', group: 'วารสารนานาชาติ (ก.พ.อ.)' },
  { key: 'W_Q4', label: 'วารสารในฐานข้อมูลนานาชาติตามประกาศ ก.พ.อ. — Quartile 4 (Q4)', group: 'วารสารนานาชาติ (ก.พ.อ.)' },
  { key: 'W_NOQ', label: 'วารสารในฐานข้อมูลนานาชาติตามประกาศ ก.พ.อ. — ไม่มีการจัด Quartile (เช่น ERIC, JSTOR)', group: 'วารสารนานาชาติ (ก.พ.อ.)' },
  { key: 'W_OTHER_INTL', label: 'วารสารนานาชาติที่ไม่อยู่ในฐานข้อมูลตามประกาศ แต่สภาสถาบันอนุมัติ', group: 'วารสารอื่น' },
  { key: 'W_TCI1', label: 'วารสารในฐานข้อมูล TCI กลุ่มที่ 1', group: 'วารสารระดับชาติ (TCI)' },
  { key: 'W_TCI2', label: 'วารสารในฐานข้อมูล TCI กลุ่มที่ 2', group: 'วารสารระดับชาติ (TCI)' },
  { key: 'W_OTHER_NAT', label: 'วารสารระดับชาติที่ไม่อยู่ใน TCI แต่สภาสถาบันอนุมัติ', group: 'วารสารอื่น' },
  { key: 'W_PROC_INTL', label: 'บทความฉบับสมบูรณ์ใน Proceedings ระดับนานาชาติ', group: 'Proceedings' },
  { key: 'W_PROC_NAT', label: 'บทความฉบับสมบูรณ์ใน Proceedings ระดับชาติ', group: 'Proceedings' },
  { key: 'W_TEXTBOOK', label: 'ตำราที่ผ่านการประเมินตามหลักเกณฑ์การขอตำแหน่งทางวิชาการ', group: 'ตำรา/หนังสือ' },
  { key: 'W_BOOK', label: 'หนังสือที่ผ่านการประเมินตามหลักเกณฑ์การขอตำแหน่งทางวิชาการ', group: 'ตำรา/หนังสือ' },
  { key: 'W_PATENT', label: 'ผลงานที่ได้รับการจดสิทธิบัตร', group: 'ทรัพย์สินทางปัญญา' },
  { key: 'W_PETTY', label: 'ผลงานที่ได้รับการจดอนุสิทธิบัตร', group: 'ทรัพย์สินทางปัญญา' },
  { key: 'W_SOCIAL', label: 'ผลงานวิชาการรับใช้สังคมที่ผ่านการประเมินตำแหน่งทางวิชาการ', group: 'อื่น ๆ' }
];

/**
 * ฐานข้อมูลวารสาร
 *  group = kpa_intl  : ฐานข้อมูลระดับนานาชาติตามประกาศ ก.พ.อ. พ.ศ. 2562
 *          tci1/tci2 : ฐานข้อมูลระดับชาติตามประกาศ ก.พ.อ. (TCI กลุ่ม 1, 2)
 *          other_*   : ไม่อยู่ในประกาศ แต่สภาสถาบันอนุมัติ
 *          none      : ไม่นับ (เช่น TCI กลุ่ม 3)
 */
const DATABASES = {
  scopus:      { label: 'Scopus', short: 'Scopus', group: 'kpa_intl', level: 'intl', quartile: true },
  wos:         { label: 'Web of Science (SCIE / SSCI / AHCI)', short: 'WoS', group: 'kpa_intl', level: 'intl', quartile: true },
  pubmed:      { label: 'PubMed', short: 'PubMed', group: 'kpa_intl', level: 'intl', quartile: true },
  eric:        { label: 'ERIC', short: 'ERIC', group: 'kpa_intl', level: 'intl', quartile: false },
  mathscinet:  { label: 'MathSciNet', short: 'MathSciNet', group: 'kpa_intl', level: 'intl', quartile: false },
  jstor:       { label: 'JSTOR', short: 'JSTOR', group: 'kpa_intl', level: 'intl', quartile: false },
  projectmuse: { label: 'Project Muse', short: 'Muse', group: 'kpa_intl', level: 'intl', quartile: false },
  tci1:        { label: 'TCI กลุ่มที่ 1', short: 'TCI 1', group: 'tci1', level: 'nat', quartile: false },
  tci2:        { label: 'TCI กลุ่มที่ 2', short: 'TCI 2', group: 'tci2', level: 'nat', quartile: false },
  tci3:        { label: 'TCI กลุ่มที่ 3 (ไม่นับ)', short: 'TCI 3', group: 'none', level: 'nat', quartile: false },
  other_intl:  { label: 'วารสารนานาชาติอื่น (สภาสถาบันอนุมัติ)', short: 'นานาชาติอื่น', group: 'other_intl', level: 'intl', quartile: false },
  other_nat:   { label: 'วารสารระดับชาติอื่น (สภาสถาบันอนุมัติ)', short: 'ชาติอื่น', group: 'other_nat', level: 'nat', quartile: false },
  none:        { label: 'ไม่อยู่ในฐานข้อมูล / ไม่ระบุ', short: '—', group: 'none', level: '', quartile: false }
};

/** ประเภทผลงาน */
const PUB_TYPES = {
  journal:          { label: 'บทความในวารสารวิชาการ', research: true, usesDb: true },
  proceedings_intl: { label: 'Proceedings ระดับนานาชาติ (ฉบับสมบูรณ์)', research: true, level: 'intl' },
  proceedings_nat:  { label: 'Proceedings ระดับชาติ (ฉบับสมบูรณ์)', research: true, level: 'nat' },
  textbook:         { label: 'ตำรา', research: false },
  book:             { label: 'หนังสือ', research: false },
  patent:           { label: 'สิทธิบัตร', research: true },
  petty_patent:     { label: 'อนุสิทธิบัตร', research: true },
  social:           { label: 'ผลงานวิชาการรับใช้สังคม', research: false }
};

const POSITIONS = {
  'อ.':   { label: 'อาจารย์', rank: 0 },
  'ผศ.':  { label: 'ผู้ช่วยศาสตราจารย์', rank: 1 },
  'รศ.':  { label: 'รองศาสตราจารย์', rank: 2 },
  'ศ.':   { label: 'ศาสตราจารย์', rank: 3 }
};

const DEGREES = {
  doctoral: { label: 'ปริญญาเอกหรือเทียบเท่า', rank: 3 },
  master:   { label: 'ปริญญาโทหรือเทียบเท่า', rank: 2 },
  bachelor: { label: 'ปริญญาตรี', rank: 1 }
};

const LEVELS = {
  master:   { label: 'ปริญญาโท' },
  doctoral: { label: 'ปริญญาเอก' }
};

const PUB_STATUS = {
  pending:  { label: 'รอตรวจรับรอง' },
  verified: { label: 'รับรองแล้ว' },
  rejected: { label: 'ไม่รับรอง' }
};

const EXPERT_ROLES = {
  examiner: 'กรรมการสอบวิทยานิพนธ์',
  coadvisor: 'อาจารย์ที่ปรึกษาวิทยานิพนธ์ร่วม',
  special: 'อาจารย์พิเศษ'
};

/**
 * เกณฑ์อาจารย์ประจำหลักสูตร (ระดับบัณฑิตศึกษา)
 * minPubs = จำนวนผลงานขั้นต่ำในรอบ 5 ปีย้อนหลัง, requireResearch = ต้องเป็นผลงานวิจัยอย่างน้อย 1 รายการ
 * minPositionRank = ตำแหน่งวิชาการขั้นต่ำ หากมีวุฒิปริญญาโท (0=อ., 1=ผศ., 2=รศ.)
 */
const FACULTY_CRITERIA = {
  '2558': {
    label: 'เกณฑ์มาตรฐานหลักสูตรระดับบัณฑิตศึกษา พ.ศ. 2558',
    minFaculty: 3, minPubs: 3, requireResearch: true,
    minPositionRank: { master: 1, doctoral: 2 }
  },
  '2565': {
    label: 'เกณฑ์มาตรฐานหลักสูตรระดับบัณฑิตศึกษา พ.ศ. 2565',
    minFaculty: 3, minPubs: 3, requireResearch: true,
    minPositionRank: { master: 1, doctoral: 2 }
  }
};

/**
 * เกณฑ์คุณสมบัติผู้ทรงคุณวุฒิภายนอก (เทียบทุกปีเกณฑ์)
 * kind: researchExp = มีประสบการณ์ทำวิจัย, intl = นับผลงานระดับนานาชาติ, accepted = นับผลงานในฐานข้อมูลที่ยอมรับ (ก.พ.อ.)
 */
const EXPERT_CRITERIA = {
  '2548': {
    doctoral: { qualText: 'ปริญญาเอกหรือเทียบเท่า หรือปริญญาโทและดำรงตำแหน่งไม่ต่ำกว่ารองศาสตราจารย์', minDegree: 'doctoral', altMasterRank: 2,
                workText: 'มีประสบการณ์ทำวิจัยที่ไม่ใช่ส่วนหนึ่งของการศึกษาเพื่อรับปริญญา', kind: 'researchExp', min: 1 },
    master:   { qualText: 'ปริญญาเอกหรือเทียบเท่า หรือปริญญาโทและดำรงตำแหน่งไม่ต่ำกว่าผู้ช่วยศาสตราจารย์', minDegree: 'doctoral', altMasterRank: 1,
                workText: 'มีประสบการณ์ทำวิจัยที่ไม่ใช่ส่วนหนึ่งของการศึกษาเพื่อรับปริญญา', kind: 'researchExp', min: 1 }
  },
  '2558': {
    doctoral: { qualText: 'ปริญญาเอกหรือเทียบเท่า', minDegree: 'doctoral', altMasterRank: null,
                workText: 'ผลงานตีพิมพ์ระดับนานาชาติ 5 รายการ', kind: 'intl', min: 5 },
    master:   { qualText: 'ปริญญาเอกหรือเทียบเท่า', minDegree: 'doctoral', altMasterRank: null,
                workText: 'ผลงานตีพิมพ์ระดับชาติไม่น้อยกว่า 10 เรื่อง หรือระดับนานาชาติไม่น้อยกว่า 5 เรื่อง', kind: 'nat10_or_intl5', min: 5 }
  },
  '2565': {
    doctoral: { qualText: 'ปริญญาเอกหรือเทียบเท่า', minDegree: 'doctoral', altMasterRank: null,
                workText: 'ผลงานตีพิมพ์ในฐานข้อมูลที่ยอมรับ 10 รายการ (อ้างอิงประกาศ ก.พ.อ. พ.ศ. 2562)', kind: 'accepted', min: 10 },
    master:   { qualText: 'ปริญญาเอกหรือเทียบเท่า', minDegree: 'doctoral', altMasterRank: null,
                workText: 'ผลงานตีพิมพ์ในฐานข้อมูลที่ยอมรับ 5 รายการ (อ้างอิงประกาศ ก.พ.อ. พ.ศ. 2562)', kind: 'accepted', min: 5 }
  }
};

/**
 * ตัวบ่งชี้ประเมินคุณภาพหลักสูตร (องค์ประกอบที่ 4 อาจารย์ — ตัวบ่งชี้ 4.2 คุณภาพอาจารย์)
 * target = ค่าร้อยละที่เทียบเป็นคะแนนเต็ม 5
 */
const QA_TARGETS = {
  master:   { phd: 60, position: 60, pubs: 40 },
  doctoral: { phd: 100, position: 80, pubs: 60 }
};


/* ======================================================================
 * ส่วน: Database.gs
 * ====================================================================== */

/**
 * Database.gs — ชั้นจัดการข้อมูลบน Google Sheets (1 ชีต = 1 ตาราง, แถวแรกเป็นหัวคอลัมน์)
 */

let SS_ = null;
const TABLE_CACHE_ = {};

/** คืนค่า Spreadsheet ที่ใช้เก็บข้อมูล (ผูกกับสคริปต์ หรือสร้างใหม่และจำ ID ไว้) */
function getDb_() {
  if (SS_) return SS_;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DB_ID');
  if (id) {
    try { SS_ = SpreadsheetApp.openById(id); return SS_; } catch (e) { /* ไฟล์ถูกลบ → สร้างใหม่ */ }
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  SS_ = active || SpreadsheetApp.create(APP.dbName);
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

/* ---------------- Audit ---------------- */

function audit_(action, detail) {
  try {
    const u = typeof CURRENT_USER_ !== 'undefined' && CURRENT_USER_ ? CURRENT_USER_.email : '';
    sheet_('Audit').appendRow([nowIso_(), u, action, String(detail || '').slice(0, 500)]);
    DB.invalidate_('Audit');
  } catch (e) { /* ไม่ให้การบันทึก log ทำให้งานหลักล้ม */ }
}

/* ---------------- Utils ---------------- */

function newId_(name) {
  return (ID_PREFIX[name] || 'R') + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss");
}

function toBool_(v) { return v === true || String(v).toLowerCase() === 'true' || v === 1 || v === '1'; }

function splitIds_(v) {
  return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(String);
}


/* ======================================================================
 * ส่วน: Logic.gs
 * ====================================================================== */

/**
 * Logic.gs — คำนวณน้ำหนักคะแนน, ตรวจเกณฑ์อาจารย์/ผู้ทรงคุณวุฒิภายนอก, การแจ้งเตือนอัจฉริยะ
 * และการประเมินคุณภาพหลักสูตร (ฟังก์ชันบริสุทธิ์ ไม่แตะชีตโดยตรง ยกเว้น buildModel_)
 */

function currentBE_() { return new Date().getFullYear() + 543; }

/** รอบประเมิน 5 ปีย้อนหลัง เช่น ปีประเมิน 2569 → 2565–2569 */
function evalWindow_(settings) {
  const end = Number(settings.EVAL_YEAR) || currentBE_();
  return { start: end - APP.windowYears + 1, end: end };
}

/** น้ำหนักคะแนนของผลงาน 1 ชิ้น (0 = ไม่นับ) + เหตุผล */
function pubWeight_(p, settings) {
  const W = function (k) { return Number(settings[k]) || 0; };
  const db = DATABASES[p.database] || DATABASES.none;
  switch (p.type) {
    case 'journal':
      if (db.group === 'kpa_intl') {
        const q = /^Q[1-4]$/.test(p.quartile) ? p.quartile : 'NOQ';
        return { w: W('W_' + q), basis: 'ฐานข้อมูลนานาชาติตามประกาศ ก.พ.อ. (' + db.short + (q !== 'NOQ' ? ' ' + q : '') + ')' };
      }
      if (db.group === 'tci1') return { w: W('W_TCI1'), basis: 'TCI กลุ่มที่ 1' };
      if (db.group === 'tci2') return { w: W('W_TCI2'), basis: 'TCI กลุ่มที่ 2' };
      if (db.group === 'other_intl') return { w: W('W_OTHER_INTL'), basis: 'วารสารนานาชาติอื่น (สภาสถาบันอนุมัติ)' };
      if (db.group === 'other_nat') return { w: W('W_OTHER_NAT'), basis: 'วารสารระดับชาติอื่น (สภาสถาบันอนุมัติ)' };
      return { w: 0, basis: 'ไม่อยู่ในฐานข้อมูลที่ยอมรับ' + (p.database === 'tci3' ? ' (TCI กลุ่มที่ 3)' : '') };
    case 'proceedings_intl': return { w: W('W_PROC_INTL'), basis: 'Proceedings ระดับนานาชาติ' };
    case 'proceedings_nat':  return { w: W('W_PROC_NAT'), basis: 'Proceedings ระดับชาติ' };
    case 'textbook':         return { w: W('W_TEXTBOOK'), basis: 'ตำรา (ผ่านเกณฑ์ประเมินตำแหน่ง)' };
    case 'book':             return { w: W('W_BOOK'), basis: 'หนังสือ (ผ่านเกณฑ์ประเมินตำแหน่ง)' };
    case 'patent':           return { w: W('W_PATENT'), basis: 'สิทธิบัตร' };
    case 'petty_patent':     return { w: W('W_PETTY'), basis: 'อนุสิทธิบัตร' };
    case 'social':           return { w: W('W_SOCIAL'), basis: 'ผลงานวิชาการรับใช้สังคม' };
  }
  return { w: 0, basis: 'ไม่ระบุประเภท' };
}

/** อยู่ในฐานข้อมูลที่ยอมรับตามประกาศ ก.พ.อ. พ.ศ. 2562 (นานาชาติ 7 ฐาน + TCI 1–2) */
function isAccepted_(p) {
  const g = (DATABASES[p.database] || {}).group;
  return p.type === 'journal' && (g === 'kpa_intl' || g === 'tci1' || g === 'tci2');
}

function pubLevel_(p) {
  if (p.type === 'journal') return (DATABASES[p.database] || {}).level || '';
  return (PUB_TYPES[p.type] || {}).level || '';
}

/** เติมฟิลด์คำนวณให้ผลงาน */
function enrichPub_(p, settings, win) {
  const y = Number(p.year) || 0;
  const wt = pubWeight_(p, settings);
  return Object.assign({}, p, {
    year: y,
    weight: wt.w,
    basis: wt.basis,
    accepted: isAccepted_(p),
    level: pubLevel_(p),
    research: !!(PUB_TYPES[p.type] || {}).research,
    inWindow: y >= win.start && y <= win.end,
    expiring: y === win.start,          // จะหลุดรอบในปีถัดไป
    expired: y > 0 && y < win.start,    // เกิน 5 ปี ไม่นับแล้ว
    future: y > win.end
  });
}

function positionRank_(pos) { return (POSITIONS[pos] || { rank: 0 }).rank; }

function personName_(x) { return ((x.prefix || '') + (x.nameTh || x.nameEn || '')).trim(); }

/** ประเมินอาจารย์ประจำหลักสูตร 1 คน */
function evalFaculty_(f, pubs, curricula) {
  const mine = curricula.filter(function (c) { return splitIds_(f.curriculumIds).indexOf(c.id) > -1; });
  const level = mine.some(function (c) { return c.level === 'doctoral'; }) ? 'doctoral' : 'master';
  const cy = mine.map(function (c) { return String(c.criteriaYear); }).sort().pop() || '2565';
  const crit = FACULTY_CRITERIA[cy] || FACULTY_CRITERIA['2565'];

  const inWin = pubs.filter(function (p) { return p.inWindow; });
  const countable = inWin.filter(function (p) { return p.status === 'verified' && p.weight > 0; });
  const pending = inWin.filter(function (p) { return p.status === 'pending'; });
  const hasResearch = countable.some(function (p) { return p.research; });
  const pubsOk = countable.length >= crit.minPubs && (!crit.requireResearch || hasResearch);

  const qualOk = f.degree === 'doctoral' ||
    (f.degree === 'master' && positionRank_(f.position) >= crit.minPositionRank[level]);

  let status = 'pass';
  if (!countable.length) status = 'none';
  else if (!pubsOk) status = 'below';
  if (status === 'pass' && !qualOk) status = 'qual';

  return {
    level: level, criteriaYear: cy, required: crit.minPubs,
    count: countable.length, pendingCount: pending.length,
    totalPubs: pubs.length, hasResearch: hasResearch,
    weightSum: round2_(countable.reduce(function (s, p) { return s + p.weight; }, 0)),
    expiringCount: countable.filter(function (p) { return p.expiring; }).length,
    pubsOk: pubsOk, qualOk: qualOk, meets: pubsOk && qualOk, status: status
  };
}

/** ประเมินผู้ทรงคุณวุฒิภายนอก เทียบเกณฑ์ทุกปี */
function evalExpert_(x, pubs) {
  const level = x.level === 'master' ? 'master' : 'doctoral';
  const confirmed = pubs.filter(function (p) { return p.status === 'verified'; });
  const intl = confirmed.filter(function (p) { return p.level === 'intl' && p.weight > 0; }).length;
  const nat = confirmed.filter(function (p) { return p.level === 'nat' && p.weight > 0; }).length;
  const accepted = confirmed.filter(function (p) { return p.accepted; }).length;
  const notCounted = pubs.filter(function (p) { return p.weight <= 0; }).length;

  const results = {};
  Object.keys(EXPERT_CRITERIA).forEach(function (yr) {
    const c = EXPERT_CRITERIA[yr][level];
    const degRank = (DEGREES[x.degree] || { rank: 0 }).rank;
    const qualOk = degRank >= DEGREES[c.minDegree].rank ||
      (c.altMasterRank !== null && x.degree === 'master' && positionRank_(x.position) >= c.altMasterRank);
    let workOk = false, workValue = '';
    if (c.kind === 'researchExp') {
      workOk = toBool_(x.researchExp) || confirmed.some(function (p) { return p.research; });
      workValue = workOk ? 'มีประสบการณ์ทำวิจัย' : 'ไม่พบประสบการณ์ทำวิจัย';
    } else if (c.kind === 'intl') {
      workOk = intl >= c.min; workValue = 'นานาชาติ ' + intl + '/' + c.min;
    } else if (c.kind === 'nat10_or_intl5') {
      workOk = intl >= 5 || (nat + intl) >= 10; workValue = 'ชาติ ' + (nat + intl) + '/10 · นานาชาติ ' + intl + '/5';
    } else if (c.kind === 'accepted') {
      workOk = accepted >= c.min; workValue = 'ฐานที่ยอมรับ ' + accepted + '/' + c.min;
    }
    results[yr] = {
      qualText: c.qualText, workText: c.workText, qualOk: qualOk,
      qualValue: (DEGREES[x.degree] || { label: '-' }).label + (x.position ? ', ' + (POSITIONS[x.position] || { label: x.position }).label : ''),
      workOk: workOk, workValue: workValue, pass: qualOk && workOk
    };
  });
  const cy = String(x.criteriaYear || '2565');
  return {
    level: level, criteriaYear: cy, results: results,
    pass: results[cy] ? results[cy].pass : false,
    counts: { total: pubs.length, intl: intl, nat: nat, accepted: accepted, notCounted: notCounted, confirmed: confirmed.length }
  };
}

/** สรุปสถานะหลักสูตรตามเกณฑ์มาตรฐาน (ข้อ 1.1) */
function evalCurriculum_(c, faculty) {
  const crit = FACULTY_CRITERIA[String(c.criteriaYear)] || FACULTY_CRITERIA['2565'];
  const members = faculty.filter(function (f) { return splitIds_(f.curriculumIds).indexOf(c.id) > -1 && toBool_(f.active); });
  const qualified = members.filter(function (f) { return f.eval.meets; });
  return {
    facultyCount: members.length, qualifiedCount: qualified.length, minFaculty: crit.minFaculty,
    memberIds: members.map(function (f) { return f.id; }),
    pass: members.length >= crit.minFaculty && qualified.length === members.length && members.length > 0
  };
}

/** ประเมินคุณภาพหลักสูตร ตัวบ่งชี้ 4.2 สำหรับปีที่เลือก */
function assessCurriculum_(model, curriculumId, year) {
  const c = model.curricula.filter(function (x) { return x.id === curriculumId; })[0];
  if (!c) throw new Error('ไม่พบหลักสูตร');
  year = Number(year) || model.window.end;
  const t = QA_TARGETS[c.level] || QA_TARGETS.master;
  const members = model.faculty.filter(function (f) { return c.eval.memberIds.indexOf(f.id) > -1; });
  const n = members.length;
  const pubsOfYear = model.publications.filter(function (p) {
    return p.personType === 'faculty' && c.eval.memberIds.indexOf(p.personId) > -1 &&
      p.status === 'verified' && p.year === year && p.weight > 0;
  });
  const phd = members.filter(function (f) { return f.degree === 'doctoral'; }).length;
  const pos = members.filter(function (f) { return positionRank_(f.position) >= 1; }).length;
  const wsum = round2_(pubsOfYear.reduce(function (s, p) { return s + p.weight; }, 0));
  const pct = function (a) { return n ? round2_(a / n * 100) : 0; };
  const score = function (p, target) { return round2_(Math.min(5, p / target * 5)); };

  const ind = [
    { code: '4.2.1', name: 'ร้อยละของอาจารย์ประจำหลักสูตรที่มีคุณวุฒิปริญญาเอก', value: pct(phd), detail: phd + '/' + n + ' คน', target: t.phd },
    { code: '4.2.2', name: 'ร้อยละของอาจารย์ประจำหลักสูตรที่ดำรงตำแหน่งทางวิชาการ', value: pct(pos), detail: pos + '/' + n + ' คน', target: t.position },
    { code: '4.2.3', name: 'ผลงานวิชาการของอาจารย์ประจำหลักสูตร (ผลรวมถ่วงน้ำหนัก/จำนวนอาจารย์ × 100)', value: pct(wsum), detail: 'ผลรวมถ่วงน้ำหนัก ' + wsum.toFixed(2) + ' จาก ' + pubsOfYear.length + ' ผลงาน', target: t.pubs }
  ].map(function (i) { i.score = score(i.value, i.target); return i; });
  const overall = round2_(ind.reduce(function (s, i) { return s + i.score; }, 0) / ind.length);

  const breakdown = {};
  pubsOfYear.forEach(function (p) { const k = p.basis; breakdown[k] = breakdown[k] || { basis: k, weight: p.weight, count: 0 }; breakdown[k].count++; });

  return {
    curriculum: { id: c.id, code: c.code, nameTh: c.nameTh, level: c.level, criteriaYear: c.criteriaYear },
    year: year, n: n,
    standard: [
      { name: 'จำนวนอาจารย์ประจำหลักสูตรไม่น้อยกว่า ' + c.eval.minFaculty + ' คน', ok: n >= c.eval.minFaculty, value: n + ' คน' },
      { name: 'คุณสมบัติอาจารย์ประจำหลักสูตร (คุณวุฒิ/ตำแหน่ง)', ok: n > 0 && members.every(function (f) { return f.eval.qualOk; }), value: members.filter(function (f) { return f.eval.qualOk; }).length + '/' + n + ' คน' },
      { name: 'ผลงานทางวิชาการอย่างน้อย 3 รายการในรอบ 5 ปี (' + model.window.start + '–' + model.window.end + ')', ok: n > 0 && members.every(function (f) { return f.eval.pubsOk; }), value: members.filter(function (f) { return f.eval.pubsOk; }).length + '/' + n + ' คน' }
    ],
    indicators: ind, overall: overall, level: qaLevel_(overall),
    breakdown: Object.keys(breakdown).map(function (k) { return breakdown[k]; }),
    members: members.map(function (f) {
      const ys = pubsOfYear.filter(function (p) { return p.personId === f.id; });
      return { id: f.id, name: f.displayName, position: f.position, degree: f.degree, pubsYear: ys.length,
        weightYear: round2_(ys.reduce(function (s, p) { return s + p.weight; }, 0)), count5: f.eval.count, meets: f.eval.meets };
    })
  };
}

function qaLevel_(s) {
  if (s <= 2) return 'ต้องปรับปรุงเร่งด่วน';
  if (s <= 3) return 'ระดับพอใช้';
  if (s <= 4) return 'ระดับดี';
  return 'ระดับดีมาก';
}

function round2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** การแจ้งเตือนอัจฉริยะ */
function buildAlerts_(model) {
  const alerts = [];
  const fac = model.faculty.filter(function (f) { return toBool_(f.active); });
  const ref = function (f, extra) { return { id: f.id, type: 'faculty', name: f.displayName, extra: extra || '' }; };

  const none = fac.filter(function (f) { return f.eval.count === 0; });
  if (none.length) alerts.push({ level: 'danger', icon: 'x-circle', key: 'no_pubs',
    title: 'อาจารย์ไม่มีผลงานใน 5 ปีย้อนหลัง (' + none.length + ' ท่าน)', items: none.map(function (f) { return ref(f); }) });

  const expiring = {};
  model.publications.forEach(function (p) {
    if (p.personType === 'faculty' && p.expiring && p.status === 'verified' && p.weight > 0) expiring[p.personId] = (expiring[p.personId] || 0) + 1;
  });
  const exp = fac.filter(function (f) { return expiring[f.id]; });
  if (exp.length) alerts.push({ level: 'warning', icon: 'clock', key: 'expiring',
    title: 'ผลงานใกล้หมดอายุ 5 ปี (ตีพิมพ์ปี ' + model.window.start + ' — จะไม่นับในปี ' + (model.window.end + 1) + ')',
    items: exp.map(function (f) { return ref(f, expiring[f.id] + ' เรื่อง'); }) });

  const below = fac.filter(function (f) { return !f.eval.pubsOk; });
  if (below.length) alerts.push({ level: 'danger', icon: 'alert-triangle', key: 'below',
    title: 'อาจารย์ที่ผลงานยังไม่ถึงเกณฑ์ขั้นต่ำ (' + below.length + ' ท่าน)',
    items: below.map(function (f) { return ref(f, f.eval.count + '/' + f.eval.required); }) });

  const qual = fac.filter(function (f) { return !f.eval.qualOk; });
  if (qual.length) alerts.push({ level: 'warning', icon: 'graduation-cap', key: 'qual',
    title: 'คุณวุฒิ/ตำแหน่งวิชาการไม่เป็นไปตามเกณฑ์ (' + qual.length + ' ท่าน)', items: qual.map(function (f) { return ref(f); }) });

  const cur = model.curricula.filter(function (c) { return c.status !== 'closed' && !c.eval.pass; });
  if (cur.length) alerts.push({ level: 'danger', icon: 'layers', key: 'curriculum',
    title: 'หลักสูตรที่ยังไม่ผ่านเกณฑ์มาตรฐาน (' + cur.length + ' หลักสูตร)',
    items: cur.map(function (c) { return { id: c.id, type: 'curriculum', name: c.code || c.nameTh, extra: c.eval.qualifiedCount + '/' + c.eval.facultyCount + ' ผ่าน' }; }) });

  const pend = model.publications.filter(function (p) { return p.status === 'pending'; }).length;
  if (pend) alerts.push({ level: 'info', icon: 'hourglass', key: 'pending',
    title: 'ผลงานรอตรวจรับรอง ' + pend + ' รายการ', items: [], link: 'verify' });

  return alerts;
}

/** ประกอบข้อมูลทั้งหมดที่หน้าเว็บต้องใช้ (กรองตามสิทธิ์ผู้ใช้) */
function buildModel_(user) {
  const settings = getSettings_();
  const win = evalWindow_(settings);
  const curricula = DB.all('Curricula');
  const rawFaculty = DB.all('Faculty');
  const rawExperts = DB.all('Experts');
  const pubs = DB.all('Publications').map(function (p) { return enrichPub_(p, settings, win); });

  const byPerson = {};
  pubs.forEach(function (p) { const k = p.personType + ':' + p.personId; (byPerson[k] = byPerson[k] || []).push(p); });

  const faculty = rawFaculty.map(function (f) {
    const o = Object.assign({}, f, { displayName: personName_(f), curriculumIds: splitIds_(f.curriculumIds).join(',') });
    o.eval = evalFaculty_(o, byPerson['faculty:' + f.id] || [], curricula);
    return o;
  });
  const curr = curricula.map(function (c) {
    const o = Object.assign({}, c);
    o.eval = evalCurriculum_(o, faculty);
    return o;
  });
  const experts = rawExperts.map(function (x) {
    const o = Object.assign({}, x, { displayName: personName_(x) });
    o.eval = evalExpert_(o, byPerson['expert:' + x.id] || []);
    return o;
  });

  const nameOf = {};
  faculty.forEach(function (f) { nameOf['faculty:' + f.id] = f.displayName; });
  experts.forEach(function (x) { nameOf['expert:' + x.id] = x.displayName; });
  pubs.forEach(function (p) { p.personName = nameOf[p.personType + ':' + p.personId] || '(ไม่พบเจ้าของผลงาน)'; });

  let model = { settings: publicSettings_(settings), window: win, curricula: curr, faculty: faculty, experts: experts, publications: pubs };
  model.alerts = buildAlerts_(model);
  model.kpis = buildKpis_(model);
  model.chart = buildChart_(model);
  model.assessments = curr.filter(function (c) { return c.status !== 'closed'; }).map(function (c) {
    const a = assessCurriculum_(model, c.id, win.end);
    return { curriculumId: c.id, overall: a.overall, level: a.level, indicators: a.indicators };
  });
  return scopeModel_(model, user);
}

function buildKpis_(m) {
  const fac = m.faculty.filter(function (f) { return toBool_(f.active); });
  const counted = m.publications.filter(function (p) { return p.personType === 'faculty' && p.inWindow && p.status === 'verified' && p.weight > 0; });
  return {
    curricula: m.curricula.filter(function (c) { return c.status !== 'closed'; }).length,
    curriculaPass: m.curricula.filter(function (c) { return c.status !== 'closed' && c.eval.pass; }).length,
    faculty: fac.length,
    facultyPass: fac.filter(function (f) { return f.eval.meets; }).length,
    counted: counted.length,
    weightSum: round2_(counted.reduce(function (s, p) { return s + p.weight; }, 0)),
    pending: m.publications.filter(function (p) { return p.status === 'pending'; }).length,
    experts: m.experts.length,
    expertsPass: m.experts.filter(function (x) { return x.eval.pass; }).length
  };
}

/** ข้อมูลกราฟ: จำนวนผลงาน (รับรองแล้ว) รายปี แยกกลุ่มฐานข้อมูล */
function buildChart_(m) {
  const years = [];
  for (let y = m.window.start; y <= m.window.end; y++) years.push(y);
  const series = { intl: [], tci: [], other: [] };
  years.forEach(function (y) {
    const ps = m.publications.filter(function (p) { return p.personType === 'faculty' && p.year === y && p.status === 'verified' && p.weight > 0; });
    const g = function (p) { return (DATABASES[p.database] || {}).group; };
    series.intl.push(ps.filter(function (p) { return p.type === 'journal' && g(p) === 'kpa_intl'; }).length);
    series.tci.push(ps.filter(function (p) { return p.type === 'journal' && (g(p) === 'tci1' || g(p) === 'tci2'); }).length);
    series.other.push(ps.length - series.intl[series.intl.length - 1] - series.tci[series.tci.length - 1]);
  });
  return { years: years, series: series };
}

function publicSettings_(s) {
  const o = {};
  Object.keys(s).forEach(function (k) { o[k] = s[k]; });
  return o;
}

/** กรองข้อมูลตามบทบาท */
function scopeModel_(m, user) {
  if (user.role === 'lecturer') {
    const me = m.faculty.filter(function (f) { return f.id === user.facultyId; })[0];
    const myCur = me ? splitIds_(me.curriculumIds) : [];
    m.publications = m.publications.filter(function (p) { return p.personType === 'faculty' && p.personId === user.facultyId; });
    m.faculty = m.faculty.filter(function (f) { return f.id === user.facultyId; });
    m.curricula = m.curricula.filter(function (c) { return myCur.indexOf(c.id) > -1; });
    m.experts = [];
    m.alerts = m.alerts.map(function (a) {
      return Object.assign({}, a, {
        title: a.title.replace(/\s*\(\d+ (ท่าน|หลักสูตร)\)/, ''),
        items: a.items.filter(function (i) { return i.type === 'faculty' ? i.id === user.facultyId : myCur.indexOf(i.id) > -1; })
      });
    }).filter(function (a) { return a.items.length && a.key !== 'pending'; });
    m.assessments = m.assessments.filter(function (a) { return myCur.indexOf(a.curriculumId) > -1; });
  }
  return m;
}


/* ======================================================================
 * ส่วน: Auth.gs
 * ====================================================================== */

/**
 * Auth.gs — ระบุตัวผู้ใช้จากบัญชี Google และตรวจสิทธิ์ตามบทบาท
 *
 * - ผู้ใช้คนแรกที่เปิดระบบ (ตาราง Users ว่าง) จะเป็น Admin อัตโนมัติ
 * - Admin สามารถ "ดูในมุมมองบทบาทอื่น" เพื่อทดสอบสิทธิ์ได้ (เก็บใน UserProperties ของ Admin เท่านั้น)
 */

let CURRENT_USER_ = null;

function currentUser_() {
  if (CURRENT_USER_) return CURRENT_USER_;
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const users = DB.all('Users');
  let rec = email ? users.filter(function (u) { return String(u.email).toLowerCase() === email && toBool_(u.active); })[0] : null;

  if (!rec && users.length === 0) {
    const owner = email || String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    rec = DB.insert('Users', { email: owner, name: 'ผู้ดูแลระบบ', role: 'admin', active: true, isSample: false });
    audit_('first_admin', owner);
  }

  const settings = getSettings_();
  let role = rec ? rec.role : (toBool_(settings.ALLOW_GUEST) ? 'executive' : 'none');
  const realRole = role;
  let facultyId = rec ? rec.facultyId : '';
  let curriculumIds = rec ? splitIds_(rec.curriculumIds) : [];

  if (realRole === 'admin') {
    const view = PropertiesService.getUserProperties().getProperty('VIEW_AS');
    if (view) {
      try {
        const v = JSON.parse(view);
        if (ROLES[v.role]) { role = v.role; facultyId = v.facultyId || facultyId; curriculumIds = []; }
      } catch (e) { /* ignore */ }
    }
  }

  // ประธานหลักสูตร: หลักสูตรที่กำหนดในตารางผู้ใช้ + หลักสูตรที่ตนเป็นประธาน
  if (role === 'chair' && facultyId) {
    DB.all('Curricula').forEach(function (c) {
      if (c.chairFacultyId === facultyId && curriculumIds.indexOf(c.id) === -1) curriculumIds.push(c.id);
    });
  }

  CURRENT_USER_ = {
    email: email || (rec ? rec.email : ''),
    name: rec ? (rec.name || email) : (email || 'ผู้เยี่ยมชม'),
    role: role, realRole: realRole,
    roleLabel: ROLES[role] ? ROLES[role].label : 'ไม่มีสิทธิ์',
    roleEn: ROLES[role] ? ROLES[role].en : '',
    facultyId: facultyId, curriculumIds: curriculumIds,
    permissions: PERMISSIONS[role] || [],
    viewingAs: realRole === 'admin' && role !== 'admin'
  };
  return CURRENT_USER_;
}

function can_(perm) { return currentUser_().permissions.indexOf(perm) > -1; }

function requireRole_(roles) {
  const u = currentUser_();
  if (roles.indexOf(u.role) === -1) throw new Error('คุณไม่มีสิทธิ์ทำรายการนี้ (บทบาท: ' + u.roleLabel + ')');
}

/** ผู้ใช้แก้ไขผลงานของบุคคลนี้ได้หรือไม่ */
function canEditPerson_(personType, personId) {
  const u = currentUser_();
  if (u.role === 'admin') return true;
  if (u.role === 'executive' || u.role === 'none') return false;
  if (personType === 'expert') return u.role === 'chair';
  if (u.role === 'lecturer') return personId === u.facultyId;
  if (u.role === 'chair') {
    if (personId === u.facultyId) return true;
    const f = DB.get('Faculty', personId);
    return !!f && splitIds_(f.curriculumIds).some(function (c) { return u.curriculumIds.indexOf(c) > -1; });
  }
  return false;
}

function canVerifyPub_(pub) {
  const u = currentUser_();
  if (u.role === 'admin') return true;
  if (u.role !== 'chair') return false;
  if (pub.personType === 'expert') return true;
  if (pub.personId === u.facultyId) return false; // ไม่ตรวจรับรองผลงานตนเอง
  const f = DB.get('Faculty', pub.personId);
  return !!f && splitIds_(f.curriculumIds).some(function (c) { return u.curriculumIds.indexOf(c) > -1; });
}


/* ======================================================================
 * ส่วน: Api.gs
 * ====================================================================== */

/**
 * Api.gs — จุดเรียกใช้เดียวจากหน้าเว็บ: google.script.run.api(action, payload)
 * ทุก action ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ และคืน { ok, data, model? }
 */

function api(action, payload) {
  const lock = LockService.getScriptLock();
  const writes = !/^(bootstrap|assess|exportReport|audit|findAuthors|findWorks|analyzeDocument|saveEvidence|journalStats)$/.test(action);
  try {
    ensureSchema_();
    if (writes) lock.waitLock(20000);
    const u = currentUser_();
    if (u.role === 'none') throw new Error('บัญชี ' + (u.email || '(ไม่ทราบอีเมล)') + ' ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
    const fn = ACTIONS_[action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + action);
    const data = fn(payload || {});
    const out = { ok: true, data: data === undefined ? null : data };
    if (writes || action === 'bootstrap') {
      out.user = currentUser_();
      out.model = buildModel_(out.user);
      if (out.user.realRole === 'admin') out.users = DB.all('Users');
    }
    return JSON.parse(JSON.stringify(out));
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  } finally {
    if (writes) try { lock.releaseLock(); } catch (e) { /* not held */ }
  }
}

const ACTIONS_ = {
  bootstrap: function () { return { meta: meta_() }; },

  /* ---------- ผลงานวิชาการ ---------- */
  savePublication: function (p) {
    const personType = p.personType === 'expert' ? 'expert' : 'faculty';
    if (!p.personId) throw new Error('กรุณาเลือกเจ้าของผลงาน');
    if (!String(p.title || '').trim()) throw new Error('กรุณากรอกชื่อผลงาน');
    const year = Number(p.year);
    if (!(year >= 2500 && year <= 2700)) throw new Error('ปีที่ตีพิมพ์ต้องเป็นปี พ.ศ. (เช่น 2567)');
    if (!PUB_TYPES[p.type]) throw new Error('ประเภทผลงานไม่ถูกต้อง');
    if (!canEditPerson_(personType, p.personId)) throw new Error('คุณไม่มีสิทธิ์แก้ไขผลงานของบุคคลนี้');
    const u = currentUser_();
    const rec = {
      personType: personType, personId: p.personId, title: String(p.title).trim(), source: p.source || '',
      year: year, type: p.type, database: p.type === 'journal' ? (DATABASES[p.database] ? p.database : 'none') : 'none',
      quartile: p.type === 'journal' && (DATABASES[p.database] || {}).quartile && /^Q[1-4]$/.test(p.quartile) ? p.quartile : '',
      authorRole: p.authorRole || '', doi: p.doi || '', url: p.url || '', note: p.note || ''
    };
    if (p.id) {
      const old = DB.get('Publications', p.id);
      if (!old) throw new Error('ไม่พบผลงาน');
      if (!canEditPerson_(old.personType, old.personId)) throw new Error('คุณไม่มีสิทธิ์แก้ไขผลงานนี้');
      if (old.status === 'verified' && u.role === 'lecturer') throw new Error('ผลงานที่รับรองแล้วแก้ไขไม่ได้ กรุณาติดต่อประธานหลักสูตร');
      // แก้ไขสาระสำคัญ → กลับไปรอตรวจใหม่ (ยกเว้นผู้ตรวจแก้เอง)
      const keyChanged = ['title', 'year', 'type', 'database', 'quartile'].some(function (k) { return String(old[k]) !== String(rec[k]); });
      if (keyChanged && !canVerifyPub_(Object.assign({}, old, rec))) Object.assign(rec, { status: 'pending', verifiedBy: '', verifiedAt: '' });
      audit_('update_pub', p.id + ' ' + rec.title);
      return DB.update('Publications', p.id, rec);
    }
    rec.status = 'pending';
    rec.createdBy = u.email;
    rec.isSample = false;
    const saved = DB.insert('Publications', rec);
    audit_('create_pub', saved.id + ' ' + rec.title);
    return saved;
  },

  deletePublication: function (p) {
    const old = DB.get('Publications', p.id);
    if (!old) throw new Error('ไม่พบผลงาน');
    if (!canEditPerson_(old.personType, old.personId)) throw new Error('คุณไม่มีสิทธิ์ลบผลงานนี้');
    if (old.status === 'verified' && currentUser_().role === 'lecturer') throw new Error('ผลงานที่รับรองแล้วลบไม่ได้');
    DB.remove('Publications', p.id);
    audit_('delete_pub', p.id + ' ' + old.title);
  },

  verifyPublications: function (p) {
    const ids = [].concat(p.ids || p.id || []);
    const decision = p.decision;
    if (['verified', 'rejected', 'pending'].indexOf(decision) === -1) throw new Error('ผลการตรวจไม่ถูกต้อง');
    if (decision === 'rejected' && !String(p.note || '').trim()) throw new Error('กรุณาระบุเหตุผลที่ไม่รับรอง');
    const u = currentUser_();
    let n = 0;
    ids.forEach(function (id) {
      const pub = DB.get('Publications', id);
      if (!pub) return;
      if (!canVerifyPub_(pub)) throw new Error('คุณไม่มีสิทธิ์ตรวจรับรอง: ' + pub.title);
      DB.update('Publications', id, {
        status: decision, verifyNote: p.note || '',
        verifiedBy: decision === 'pending' ? '' : u.email, verifiedAt: decision === 'pending' ? '' : nowIso_()
      });
      n++;
    });
    audit_('verify_' + decision, ids.join(','));
    return { count: n };
  },

  /* ---------- อาจารย์ ---------- */
  saveFaculty: function (f) {
    const u = currentUser_();
    if (!(u.role === 'admin' || u.role === 'chair')) throw new Error('คุณไม่มีสิทธิ์จัดการข้อมูลอาจารย์');
    if (!String(f.nameTh || f.nameEn || '').trim()) throw new Error('กรุณากรอกชื่ออาจารย์');
    const cur = splitIds_(f.curriculumIds);
    if (u.role === 'chair' && !cur.some(function (c) { return u.curriculumIds.indexOf(c) > -1; }))
      throw new Error('ประธานหลักสูตรเพิ่ม/แก้ไขได้เฉพาะอาจารย์ในหลักสูตรของตน');
    const rec = pick_(f, ['prefix', 'nameTh', 'nameEn', 'email', 'position', 'degree', 'degreeDetail', 'scopusId', 'orcid']);
    rec.curriculumIds = cur.join(',');
    rec.active = f.active === undefined ? true : toBool_(f.active);
    if (f.id) {
      if (u.role === 'chair' && !canEditPerson_('faculty', f.id)) throw new Error('คุณไม่มีสิทธิ์แก้ไขอาจารย์ท่านนี้');
      audit_('update_faculty', f.id);
      return DB.update('Faculty', f.id, rec);
    }
    rec.isSample = false;
    const saved = DB.insert('Faculty', rec);
    audit_('create_faculty', saved.id + ' ' + rec.nameTh);
    return saved;
  },

  deleteFaculty: function (p) {
    requireRole_(['admin']);
    const n = DB.removeWhere('Publications', function (r) { return r.personType === 'faculty' && r.personId === p.id; });
    DB.remove('Faculty', p.id);
    audit_('delete_faculty', p.id + ' (+' + n + ' ผลงาน)');
  },

  /* ---------- หลักสูตร ---------- */
  saveCurriculum: function (c) {
    requireRole_(['admin']);
    if (!String(c.nameTh || '').trim()) throw new Error('กรุณากรอกชื่อหลักสูตร');
    const rec = pick_(c, ['code', 'nameTh', 'nameEn', 'level', 'criteriaYear', 'chairFacultyId', 'status', 'note']);
    if (!LEVELS[rec.level]) rec.level = 'master';
    if (!FACULTY_CRITERIA[rec.criteriaYear]) rec.criteriaYear = '2565';
    rec.status = rec.status === 'closed' ? 'closed' : 'open';
    if (c.id) { audit_('update_curriculum', c.id); return DB.update('Curricula', c.id, rec); }
    rec.isSample = false;
    const saved = DB.insert('Curricula', rec);
    audit_('create_curriculum', saved.id + ' ' + rec.nameTh);
    return saved;
  },

  deleteCurriculum: function (p) {
    requireRole_(['admin']);
    DB.remove('Curricula', p.id);
    audit_('delete_curriculum', p.id);
  },

  /* ---------- ผู้ทรงคุณวุฒิภายนอก ---------- */
  saveExpert: function (x) {
    requireRole_(['admin', 'chair']);
    if (!String(x.nameTh || x.nameEn || '').trim()) throw new Error('กรุณากรอกชื่อ');
    const rec = pick_(x, ['prefix', 'nameTh', 'nameEn', 'affiliation', 'position', 'degree', 'degreeDetail', 'roleType', 'level', 'criteriaYear', 'curriculumId', 'scopusId', 'orcid']);
    rec.researchExp = toBool_(x.researchExp);
    if (!EXPERT_CRITERIA[rec.criteriaYear]) rec.criteriaYear = '2565';
    if (x.id) { audit_('update_expert', x.id); return DB.update('Experts', x.id, rec); }
    rec.isSample = false;
    const saved = DB.insert('Experts', rec);
    audit_('create_expert', saved.id + ' ' + rec.nameTh);
    return saved;
  },

  deleteExpert: function (p) {
    requireRole_(['admin', 'chair']);
    DB.removeWhere('Publications', function (r) { return r.personType === 'expert' && r.personId === p.id; });
    DB.remove('Experts', p.id);
    audit_('delete_expert', p.id);
  },

  saveExpertCheck: function (p) {
    requireRole_(['admin', 'chair']);
    const x = DB.get('Experts', p.id);
    if (!x) throw new Error('ไม่พบข้อมูล');
    const res = p.result === 'pass' ? 'pass' : 'fail';
    audit_('expert_check', p.id + ' ' + res);
    return DB.update('Experts', p.id, { checkResult: res, checkNote: p.note || '', checkedBy: currentUser_().email, checkedAt: nowIso_() });
  },

  /* ---------- ผู้ใช้ & ตั้งค่า ---------- */
  saveUser: function (p) {
    requireRole_(['admin']);
    const email = String(p.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง');
    if (!ROLES[p.role]) throw new Error('บทบาทไม่ถูกต้อง');
    const dup = DB.all('Users').filter(function (u) { return u.email.toLowerCase() === email && u.id !== p.id; })[0];
    if (dup) throw new Error('อีเมลนี้มีอยู่ในระบบแล้ว');
    const rec = { email: email, name: p.name || '', role: p.role, facultyId: p.facultyId || '', curriculumIds: splitIds_(p.curriculumIds).join(','), active: p.active === undefined ? true : toBool_(p.active) };
    if (p.id) {
      if (email === currentUser_().email && (p.role !== 'admin' || !rec.active)) throw new Error('ไม่สามารถลดสิทธิ์/ปิดบัญชี Admin ของตนเองได้');
      audit_('update_user', email + ' → ' + p.role);
      return DB.update('Users', p.id, rec);
    }
    rec.isSample = false;
    audit_('create_user', email + ' → ' + p.role);
    return DB.insert('Users', rec);
  },

  deleteUser: function (p) {
    requireRole_(['admin']);
    const u = DB.get('Users', p.id);
    if (u && u.email.toLowerCase() === currentUser_().email) throw new Error('ไม่สามารถลบบัญชีของตนเองได้');
    DB.remove('Users', p.id);
    audit_('delete_user', u ? u.email : p.id);
  },

  saveSettings: function (p) {
    requireRole_(['admin']);
    const allowed = Object.keys(DEFAULT_SETTINGS).filter(function (k) { return k !== 'SAMPLE_DATA'; });
    const patch = {};
    Object.keys(p).forEach(function (k) {
      if (allowed.indexOf(k) === -1) return;
      if (/^W_/.test(k)) {
        const v = Number(p[k]);
        if (!(v >= 0 && v <= 5)) throw new Error('น้ำหนัก ' + k + ' ต้องอยู่ระหว่าง 0–5');
        patch[k] = v.toFixed(2);
      } else if (k === 'EVAL_YEAR') {
        const y = Number(p[k]);
        if (p[k] !== '' && !(y >= 2540 && y <= 2700)) throw new Error('ปีประเมินต้องเป็นปี พ.ศ.');
        patch[k] = p[k] === '' ? '' : String(y);
      } else patch[k] = p[k];
    });
    setSettings_(patch);
    audit_('settings', Object.keys(patch).join(','));
  },

  resetWeights: function () {
    requireRole_(['admin']);
    const patch = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (/^W_/.test(k)) patch[k] = DEFAULT_SETTINGS[k]; });
    setSettings_(patch);
    audit_('settings', 'reset weights');
  },

  setViewAs: function (p) {
    const u = currentUser_();
    if (u.realRole !== 'admin') throw new Error('เฉพาะผู้ดูแลระบบ');
    const props = PropertiesService.getUserProperties();
    if (!p.role || p.role === 'admin') props.deleteProperty('VIEW_AS');
    else props.setProperty('VIEW_AS', JSON.stringify({ role: p.role, facultyId: p.facultyId || '' }));
    CURRENT_USER_ = null;
  },

  seedSample: function () {
    requireRole_(['admin']);
    return seedSampleData_();
  },

  clearSample: function () {
    requireRole_(['admin']);
    return clearData_(true);
  },

  clearAll: function (p) {
    requireRole_(['admin']);
    if (p.confirm !== 'ลบทั้งหมด') throw new Error('กรุณาพิมพ์ "ลบทั้งหมด" เพื่อยืนยัน');
    return clearData_(false);
  },

  saveAssessment: function (p) {
    requireRole_(['admin', 'chair']);
    const u = currentUser_();
    const a = assessCurriculum_(buildModel_({ role: 'admin' }), p.curriculumId, p.year);
    const rec = DB.insert('Assessments', { curriculumId: p.curriculumId, year: a.year, score: a.overall,
      summary: JSON.stringify({ indicators: a.indicators, standard: a.standard, n: a.n }), createdBy: u.email, isSample: false });
    audit_('save_assessment', p.curriculumId + ' ' + a.year + ' = ' + a.overall);
    return rec;
  },

  /* ---------- อ่านอย่างเดียว ---------- */
  assess: function (p) {
    const u = currentUser_();
    const m = buildModel_(u);
    const a = assessCurriculum_(m, p.curriculumId, p.year);
    a.history = DB.all('Assessments').filter(function (r) { return r.curriculumId === p.curriculumId; })
      .map(function (r) { return { year: r.year, score: Number(r.score), createdBy: r.createdBy, createdAt: r.createdAt }; })
      .sort(function (x, y) { return String(y.createdAt).localeCompare(String(x.createdAt)); });
    return a;
  },

  exportReport: function (p) { return exportReport_(p); },

  /* ---------- ค้นหา/ตรวจผลงานอัตโนมัติ (Discovery.gs) ---------- */
  findAuthors: function (p) { requireRole_(['admin', 'chair', 'lecturer']); return findAuthors_(p); },
  findWorks: function (p) { requireRole_(['admin', 'chair', 'lecturer']); return findWorks_(p); },
  analyzeDocument: function (p) { requireRole_(['admin', 'chair', 'lecturer']); return analyzeDocument_(p); },
  saveEvidence: function (p) { return saveEvidence_(p); },
  importWorks: function (p) { return importWorks_(p); },
  journalStats: function () { return journalIndexStats_(); },
  importJournalIndex: function (p) { return importJournalIndex_(p); },
  clearJournalIndex: function (p) { return clearJournalIndex_(p); },

  audit: function () {
    requireRole_(['admin']);
    return DB.all('Audit').slice(-200).reverse();
  }
};

function pick_(o, keys) {
  const r = {};
  keys.forEach(function (k) { r[k] = o[k] === undefined || o[k] === null ? '' : String(o[k]).trim(); });
  return r;
}

/** ค่าคงที่ที่หน้าเว็บใช้สร้างฟอร์ม/ตัวกรอง */
function meta_() {
  const u = currentUser_();
  return {
    app: APP, roles: ROLES, databases: DATABASES, pubTypes: PUB_TYPES, positions: POSITIONS, degrees: DEGREES,
    levels: LEVELS, pubStatus: PUB_STATUS, expertRoles: EXPERT_ROLES, weightLabels: WEIGHT_LABELS,
    facultyCriteria: FACULTY_CRITERIA, expertCriteria: EXPERT_CRITERIA, qaTargets: QA_TARGETS,
    dbUrl: u.realRole === 'admin' ? getDb_().getUrl() : '',
    currentBE: currentBE_()
  };
}


/* ======================================================================
 * ส่วน: Reports.gs
 * ====================================================================== */

/**
 * Reports.gs — สร้างรายงาน (HTML → PDF) ส่งกลับให้ดาวน์โหลด และบันทึกสำเนาใน Google Drive (ถ้าเปิดใช้)
 *
 * ชนิดรายงาน (payload.type):
 *  - faculty     : สรุปผลงานอาจารย์ประจำหลักสูตร 5 ปีย้อนหลัง (ทุกหลักสูตร หรือระบุ curriculumId)
 *  - assessment  : ผลประเมินคุณภาพหลักสูตร ตัวบ่งชี้ 4.2 (ต้องระบุ curriculumId, year)
 *  - expert      : แบบตรวจสอบคุณสมบัติผู้ทรงคุณวุฒิภายนอก (ต้องระบุ expertId)
 *  - pubs        : ทะเบียนผลงานวิชาการ (กรองตามสถานะ)
 */

function exportReport_(p) {
  const u = currentUser_();
  const m = buildModel_(u);
  let title, body;
  if (p.type === 'assessment') {
    if (u.role === 'lecturer') throw new Error('คุณไม่มีสิทธิ์ออกรายงานนี้');
    const a = assessCurriculum_(m, p.curriculumId, p.year);
    title = 'รายงานผลการประเมินคุณภาพหลักสูตร ' + (a.curriculum.code || '') + ' ปี ' + a.year;
    body = reportAssessment_(a, m);
  } else if (p.type === 'expert') {
    const x = m.experts.filter(function (e) { return e.id === p.expertId; })[0];
    if (!x) throw new Error('ไม่พบข้อมูลผู้ทรงคุณวุฒิ');
    title = 'แบบตรวจสอบคุณสมบัติผู้ทรงคุณวุฒิภายนอก — ' + x.displayName;
    body = reportExpert_(x, m);
  } else if (p.type === 'pubs') {
    title = 'ทะเบียนผลงานวิชาการ รอบปี ' + m.window.start + '–' + m.window.end;
    body = reportPubs_(m, p.status);
  } else {
    const cs = m.curricula.filter(function (c) { return !p.curriculumId || c.id === p.curriculumId; });
    title = 'รายงานสรุปผลงานวิชาการอาจารย์ประจำหลักสูตร รอบปี ' + m.window.start + '–' + m.window.end;
    body = cs.map(function (c) { return reportFaculty_(c, m); }).join('<div class="pb"></div>') || '<p>ไม่มีข้อมูล</p>';
  }

  const html = reportShell_(title, body, m, u);
  const filename = (title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120)) + '.pdf';
  const out = { filename: filename, html: html, base64: '', url: '' };
  try {
    const pdf = Utilities.newBlob(html, 'text/html', 'report.html').getAs('application/pdf').setName(filename);
    out.base64 = Utilities.base64Encode(pdf.getBytes());
    if (toBool_(getSettings_().REPORT_TO_DRIVE)) out.url = saveToDrive_(pdf);
  } catch (e) {
    out.pdfError = e.message;
  }
  audit_('export_report', p.type + ' ' + (p.curriculumId || p.expertId || ''));
  return out;
}

function saveToDrive_(blob) {
  try {
    const it = DriveApp.getFoldersByName(APP.reportFolder);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder(APP.reportFolder);
    return folder.createFile(blob).getUrl();
  } catch (e) { return ''; }
}

function h_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function thaiDate_(d) {
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  d = d || new Date();
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

function badge_(ok, yes, no) {
  return '<span class="b ' + (ok ? 'ok' : 'no') + '">' + (ok ? (yes || 'ผ่าน') : (no || 'ไม่ผ่าน')) + '</span>';
}

function reportShell_(title, body, m, u) {
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + h_(title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<style>' +
    '@page{size:A4;margin:16mm 14mm}' +
    'body{font-family:"Sarabun","TH Sarabun New","Tahoma",sans-serif;font-size:12pt;color:#111;line-height:1.45;margin:0}' +
    '.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1e3a8a;padding-bottom:8px;margin-bottom:14px}' +
    '.org{font-size:11pt;color:#1e3a8a;font-weight:700}.sub{font-size:9.5pt;color:#555}' +
    'h1{font-size:16pt;margin:4px 0 2px}h2{font-size:13.5pt;margin:16px 0 6px;color:#1e3a8a}' +
    'table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:10.5pt}' +
    'th,td{border:1px solid #c7cede;padding:5px 6px;vertical-align:top;text-align:left}' +
    'th{background:#eef2fb;font-weight:700}td.n,th.n{text-align:right;white-space:nowrap}td.c,th.c{text-align:center}' +
    '.b{display:inline-block;padding:1px 8px;border-radius:10px;font-size:9.5pt;font-weight:700}' +
    '.ok{background:#dcfce7;color:#166534}.no{background:#fee2e2;color:#991b1b}.wa{background:#fef3c7;color:#92400e}' +
    '.box{border:1px solid #c7cede;border-radius:6px;padding:10px 12px;margin:8px 0}' +
    '.big{font-size:22pt;font-weight:700;color:#1e3a8a}' +
    '.muted{color:#666;font-size:9.5pt}.pb{page-break-after:always}' +
    '.sign{margin-top:36px;display:flex;justify-content:flex-end}.sign div{text-align:center;width:260px}' +
    '.foot{margin-top:18px;border-top:1px solid #ddd;padding-top:6px;font-size:8.5pt;color:#777}' +
    '</style></head><body>' +
    '<div class="head"><div><div class="org">' + h_(m.settings.ORG_NAME || APP.org) + '</div>' +
    '<h1>' + h_(title) + '</h1><div class="sub">' + h_(APP.name) + ' · ปีประเมิน ' + m.window.end + ' (รอบ ' + m.window.start + '–' + m.window.end + ')</div></div>' +
    '<div class="sub" style="text-align:right">ออกรายงานเมื่อ ' + thaiDate_() + '<br>โดย ' + h_(u.name) + '</div></div>' +
    body +
    '<div class="foot">อ้างอิง: ประกาศ ก.พ.อ. เรื่อง หลักเกณฑ์การพิจารณาวารสารทางวิชาการสำหรับการเผยแพร่ผลงานทางวิชาการ พ.ศ. 2562 · ' +
    'น้ำหนักคะแนนตามการตั้งค่าของระบบ ณ วันที่ออกรายงาน · นับเฉพาะผลงานที่ได้รับการตรวจรับรองแล้ว</div>' +
    '</body></html>';
}

function reportFaculty_(c, m) {
  const members = m.faculty.filter(function (f) { return c.eval.memberIds.indexOf(f.id) > -1; });
  let html = '<h2>' + h_((c.code ? c.code + ' ' : '') + c.nameTh) + '</h2>' +
    '<div class="muted">ระดับ' + h_((LEVELS[c.level] || {}).label || '') + ' · ' + h_((FACULTY_CRITERIA[c.criteriaYear] || {}).label || '') +
    ' · สถานะตามเกณฑ์มาตรฐาน: ' + badge_(c.eval.pass) + ' (ผ่าน ' + c.eval.qualifiedCount + '/' + c.eval.facultyCount + ' คน)</div>';
  html += '<table><tr><th class="c">#</th><th>ชื่อ-สกุล</th><th>ตำแหน่ง/คุณวุฒิ</th><th class="c">ผลงาน 5 ปี</th><th class="n">น้ำหนักรวม</th><th class="c">ใกล้หมดอายุ</th><th class="c">ผล</th></tr>';
  members.forEach(function (f, i) {
    html += '<tr><td class="c">' + (i + 1) + '</td><td>' + h_(f.displayName) + '</td><td>' + h_((POSITIONS[f.position] || { label: f.position }).label) + ' / ' + h_((DEGREES[f.degree] || {}).label || '') +
      '</td><td class="c">' + f.eval.count + '/' + f.eval.required + '</td><td class="n">' + f.eval.weightSum.toFixed(2) + '</td><td class="c">' + (f.eval.expiringCount || '-') +
      '</td><td class="c">' + badge_(f.eval.meets) + '</td></tr>';
  });
  html += '</table>';
  members.forEach(function (f) {
    const ps = m.publications.filter(function (p) { return p.personType === 'faculty' && p.personId === f.id && p.inWindow; })
      .sort(function (a, b) { return b.year - a.year; });
    if (!ps.length) return;
    html += '<div class="muted" style="margin-top:8px;font-weight:700;color:#111">' + h_(f.displayName) + '</div><table><tr><th>ผลงาน</th><th class="c">ปี</th><th>ฐานข้อมูล</th><th class="n">น้ำหนัก</th><th class="c">สถานะ</th></tr>';
    ps.forEach(function (p) {
      html += '<tr><td>' + h_(p.title) + '<div class="muted">' + h_(p.source) + '</div></td><td class="c">' + p.year + (p.expiring ? ' <span class="b wa">ใกล้หมดอายุ</span>' : '') +
        '</td><td>' + h_(p.basis) + '</td><td class="n">' + p.weight.toFixed(2) + '</td><td class="c">' + h_(PUB_STATUS[p.status] ? PUB_STATUS[p.status].label : p.status) + '</td></tr>';
    });
    html += '</table>';
  });
  return html;
}

function reportAssessment_(a, m) {
  let html = '<div class="box" style="display:flex;justify-content:space-between;align-items:center"><div><b>' + h_((a.curriculum.code ? a.curriculum.code + ' ' : '') + a.curriculum.nameTh) +
    '</b><div class="muted">ระดับ' + h_((LEVELS[a.curriculum.level] || {}).label) + ' · อาจารย์ประจำหลักสูตร ' + a.n + ' คน · ปีที่ประเมิน ' + a.year + '</div></div>' +
    '<div style="text-align:right"><div class="big">' + a.overall.toFixed(2) + '</div><div class="muted">คะแนนเฉลี่ยตัวบ่งชี้ 4.2 · ' + h_(a.level) + '</div></div></div>';
  html += '<h2>1. การกำกับมาตรฐาน (เกณฑ์มาตรฐานหลักสูตร)</h2><table><tr><th>เกณฑ์</th><th class="c">ผลการดำเนินงาน</th><th class="c">ผล</th></tr>';
  a.standard.forEach(function (s) { html += '<tr><td>' + h_(s.name) + '</td><td class="c">' + h_(s.value) + '</td><td class="c">' + badge_(s.ok) + '</td></tr>'; });
  html += '</table><h2>2. ตัวบ่งชี้ 4.2 คุณภาพอาจารย์</h2><table><tr><th class="c">ตัวบ่งชี้</th><th>รายการ</th><th class="n">ร้อยละ</th><th class="n">เป้า (=5)</th><th class="n">คะแนน</th></tr>';
  a.indicators.forEach(function (i) {
    html += '<tr><td class="c">' + i.code + '</td><td>' + h_(i.name) + '<div class="muted">' + h_(i.detail) + '</div></td><td class="n">' + i.value.toFixed(2) + '</td><td class="n">' + i.target + '</td><td class="n"><b>' + i.score.toFixed(2) + '</b></td></tr>';
  });
  html += '<tr><th colspan="4" class="n">คะแนนเฉลี่ย</th><th class="n">' + a.overall.toFixed(2) + '</th></tr></table>';
  if (a.breakdown.length) {
    html += '<h2>3. รายละเอียดผลงานถ่วงน้ำหนัก ปี ' + a.year + '</h2><table><tr><th>ระดับคุณภาพ</th><th class="n">น้ำหนัก</th><th class="n">จำนวน</th><th class="n">ผลรวม</th></tr>';
    a.breakdown.forEach(function (b) { html += '<tr><td>' + h_(b.basis) + '</td><td class="n">' + b.weight.toFixed(2) + '</td><td class="n">' + b.count + '</td><td class="n">' + (b.weight * b.count).toFixed(2) + '</td></tr>'; });
    html += '</table>';
  }
  html += '<h2>4. อาจารย์ประจำหลักสูตร</h2><table><tr><th>ชื่อ-สกุล</th><th>ตำแหน่ง</th><th>คุณวุฒิ</th><th class="c">ผลงานปี ' + a.year + '</th><th class="n">น้ำหนัก</th><th class="c">ผลงาน 5 ปี</th><th class="c">เกณฑ์</th></tr>';
  a.members.forEach(function (f) {
    html += '<tr><td>' + h_(f.name) + '</td><td>' + h_(f.position) + '</td><td>' + h_((DEGREES[f.degree] || {}).label || '') + '</td><td class="c">' + f.pubsYear + '</td><td class="n">' + f.weightYear.toFixed(2) + '</td><td class="c">' + f.count5 + '</td><td class="c">' + badge_(f.meets) + '</td></tr>';
  });
  html += '</table><div class="sign"><div>ลงชื่อ ......................................................<br>(......................................................)<br>ประธานหลักสูตร<br>วันที่ ........../........../..........</div></div>';
  return html;
}

function reportExpert_(x, m) {
  const ev = x.eval;
  const cy = ev.criteriaYear;
  let html = '<div class="box"><b>' + h_(x.displayName) + '</b> ' + (x.nameEn ? '<span class="muted">(' + h_(x.nameEn) + ')</span>' : '') +
    '<div class="muted">' + h_(x.affiliation) + ' · ' + h_(EXPERT_ROLES[x.roleType] || x.roleType || '') + ' · ระดับ' + h_((LEVELS[ev.level] || {}).label) + '</div>' +
    '<div style="margin-top:6px">ผลตามเกณฑ์ ' + cy + ' ที่หลักสูตรใช้: ' + badge_(ev.pass) + '</div></div>';
  html += '<h2>ผลการตรวจเทียบเกณฑ์ทุกปี</h2><table><tr><th>คุณสมบัติ</th>';
  Object.keys(ev.results).forEach(function (y) { html += '<th>เกณฑ์ ' + y + (y === cy ? ' ★' : '') + '</th>'; });
  html += '</tr><tr><td><b>คุณวุฒิ</b></td>';
  Object.keys(ev.results).forEach(function (y) { const r = ev.results[y]; html += '<td>' + badge_(r.qualOk) + ' ' + h_(r.qualText) + '</td>'; });
  html += '</tr><tr><td><b>ผลงานทางวิชาการ</b></td>';
  Object.keys(ev.results).forEach(function (y) { const r = ev.results[y]; html += '<td>' + badge_(r.workOk) + ' ' + h_(r.workText) + '<div class="muted">' + h_(r.workValue) + '</div></td>'; });
  html += '</tr><tr><td><b>สรุป</b></td>';
  Object.keys(ev.results).forEach(function (y) { html += '<td class="c">' + badge_(ev.results[y].pass) + '</td>'; });
  html += '</tr></table>';
  const ps = m.publications.filter(function (p) { return p.personType === 'expert' && p.personId === x.id; }).sort(function (a, b) { return b.year - a.year; });
  html += '<h2>ผลงานที่ตรวจพบ (' + ps.length + ') — นานาชาติ ' + ev.counts.intl + ' · ชาติ ' + ev.counts.nat + ' · ไม่นับ ' + ev.counts.notCounted + '</h2>';
  html += '<table><tr><th class="c">#</th><th>ผลงาน</th><th class="c">ปี</th><th>ฐานข้อมูล</th><th class="c">ยืนยัน</th></tr>';
  ps.forEach(function (p, i) {
    html += '<tr><td class="c">' + (i + 1) + '</td><td>' + h_(p.title) + '<div class="muted">' + h_(p.source) + '</div></td><td class="c">' + p.year + '</td><td>' + h_(p.basis) + '</td><td class="c">' + (p.status === 'verified' ? '✓' : 'รอยืนยัน') + '</td></tr>';
  });
  html += '</table>';
  if (x.checkResult) html += '<div class="box"><b>ผลการตรวจที่บันทึก:</b> ' + badge_(x.checkResult === 'pass') + '<div>' + h_(x.checkNote) + '</div><div class="muted">โดย ' + h_(x.checkedBy) + ' เมื่อ ' + h_(x.checkedAt) + '</div></div>';
  html += '<div class="sign"><div>ลงชื่อ ......................................................<br>(......................................................)<br>ผู้ตรวจสอบ<br>วันที่ ........../........../..........</div></div>';
  return html;
}

function reportPubs_(m, status) {
  const ps = m.publications.filter(function (p) { return p.personType === 'faculty' && (!status || p.status === status); })
    .sort(function (a, b) { return b.year - a.year || String(a.personName).localeCompare(String(b.personName)); });
  let html = '<table><tr><th class="c">#</th><th>เจ้าของผลงาน</th><th>ผลงาน</th><th class="c">ปี</th><th>ฐานข้อมูล</th><th class="n">น้ำหนัก</th><th class="c">สถานะ</th></tr>';
  ps.forEach(function (p, i) {
    html += '<tr><td class="c">' + (i + 1) + '</td><td>' + h_(p.personName) + '</td><td>' + h_(p.title) + '<div class="muted">' + h_(p.source) + '</div></td><td class="c">' + p.year +
      (p.expired ? ' <span class="b no">เกิน 5 ปี</span>' : p.expiring ? ' <span class="b wa">ใกล้หมดอายุ</span>' : '') + '</td><td>' + h_(p.basis) + '</td><td class="n">' + p.weight.toFixed(2) +
      '</td><td class="c">' + h_((PUB_STATUS[p.status] || {}).label || p.status) + '</td></tr>';
  });
  return html + '</table><div class="muted">รวม ' + ps.length + ' รายการ</div>';
}


/* ======================================================================
 * ส่วน: SampleData.gs
 * ====================================================================== */

/**
 * SampleData.gs — ข้อมูลตัวอย่าง (สมมติทั้งหมด) สำหรับทดลองใช้งาน/อบรม
 * ล้างได้ที่ จัดการระบบ > ข้อมูล > ล้างข้อมูลตัวอย่าง (ลบเฉพาะแถวที่ isSample = true)
 */

function seedSampleData_() {
  clearData_(true);
  const E = currentBE_();
  const Y = function (k) { return E - k; }; // Y(0)=ปีนี้, Y(4)=ปีแรกของรอบ, Y(5)+ = เกิน 5 ปี

  const curricula = [
    { id: 'CS01', code: 'ปร.ด. ประชากรศึกษา', nameTh: 'หลักสูตรปรัชญาดุษฎีบัณฑิต สาขาวิชาประชากรศึกษา', nameEn: 'Ph.D. in Demography', level: 'doctoral', criteriaYear: '2565', chairFacultyId: 'FS01' },
    { id: 'CS02', code: 'ปร.ด. ประชากรและการพัฒนา', nameTh: 'หลักสูตรปรัชญาดุษฎีบัณฑิต สาขาวิชาประชากรและการพัฒนา', nameEn: 'Ph.D. in Population and Development', level: 'doctoral', criteriaYear: '2565', chairFacultyId: 'FS04' },
    { id: 'CS03', code: 'วท.ม. ชีวสถิติ', nameTh: 'หลักสูตรวิทยาศาสตรมหาบัณฑิต สาขาวิชาชีวสถิติ', nameEn: 'M.Sc. in Biostatistics', level: 'master', criteriaYear: '2565', chairFacultyId: 'FS07' },
    { id: 'CS04', code: 'วท.ม. การจัดการสิ่งแวดล้อม', nameTh: 'หลักสูตรวิทยาศาสตรมหาบัณฑิต สาขาวิชาการจัดการสิ่งแวดล้อม', nameEn: 'M.Sc. in Environmental Management', level: 'master', criteriaYear: '2558', chairFacultyId: 'FS10' },
    { id: 'CS05', code: 'ศศ.ม. สังคมศาสตร์การแพทย์', nameTh: 'หลักสูตรศิลปศาสตรมหาบัณฑิต สาขาวิชาสังคมศาสตร์การแพทย์และสาธารณสุข', nameEn: 'M.A. in Medical and Health Social Sciences', level: 'master', criteriaYear: '2565', chairFacultyId: 'FS13' }
  ].map(function (c) { return Object.assign(c, { status: 'open', note: 'ข้อมูลตัวอย่าง', isSample: true }); });

  // [id, prefix, nameTh, nameEn, position, degree, curricula, pubs: [yearsAgo, type, db, quartile, status]]
  const J = 'journal';
  const fac = [
    ['FS01', 'รศ.ดร.', 'สมศักดิ์ เรียนดี', 'Somsak Riandee', 'รศ.', 'doctoral', 'CS01', [[0, J, 'scopus', 'Q1', 'verified'], [1, J, 'scopus', 'Q2', 'verified'], [2, J, 'tci1', '', 'verified'], [3, 'textbook', '', '', 'verified'], [0, J, 'wos', 'Q2', 'pending']]],
    ['FS02', 'ดร.', 'วีระ พากเพียร', 'Weera Pakpian', 'อ.', 'doctoral', 'CS01', [[6, J, 'scopus', 'Q3', 'verified']]],
    ['FS03', 'ผศ.ดร.', 'สุนทร แก้วมณี', 'Sunthorn Kaewmanee', 'ผศ.', 'doctoral', 'CS01', [[4, J, 'scopus', 'Q2', 'verified'], [1, J, 'tci2', '', 'verified'], [0, 'proceedings_intl', '', '', 'pending']]],
    ['FS04', 'ศ.ดร.', 'ประเสริฐ ทองดี', 'Prasert Thongdee', 'ศ.', 'doctoral', 'CS02', [[4, J, 'scopus', 'Q1', 'verified'], [3, J, 'scopus', 'Q1', 'verified'], [1, J, 'pubmed', 'Q2', 'verified'], [0, J, 'scopus', 'Q1', 'verified']]],
    ['FS05', 'ดร.', 'สุดา ปัญญาดี', 'Suda Panyadee', 'อ.', 'doctoral', 'CS02', []],
    ['FS06', 'ผศ.ดร.', 'อรุณี ศรีสุข', 'Arunee Srisuk', 'ผศ.', 'doctoral', 'CS02', [[2, J, 'tci1', '', 'verified'], [1, J, 'tci3', '', 'verified'], [0, 'proceedings_nat', '', '', 'pending']]],
    ['FS07', 'รศ.ดร.', 'ธนพล บุญมา', 'Thanapol Boonma', 'รศ.', 'doctoral', 'CS03', [[4, J, 'wos', 'Q2', 'verified'], [2, J, 'scopus', 'Q3', 'verified'], [1, J, 'scopus', 'Q4', 'verified'], [0, 'proceedings_intl', '', '', 'verified']]],
    ['FS08', 'ดร.', 'สมชาย ใจดี', 'Somchai Jaidee', 'อ.', 'doctoral', 'CS03', [[7, J, 'tci1', '', 'verified'], [0, J, 'tci2', '', 'rejected']]],
    ['FS09', 'อ.', 'อนุชา มั่นคง', 'Anucha Mankong', 'อ.', 'master', 'CS03', [[1, 'proceedings_nat', '', '', 'verified']]],
    ['FS10', 'รศ.ดร.', 'จันทร์เพ็ญ วงศ์ไทย', 'Chanpen Wongthai', 'รศ.', 'doctoral', 'CS04', [[4, J, 'scopus', 'Q2', 'verified'], [3, J, 'tci1', '', 'verified'], [2, 'patent', '', '', 'verified'], [1, J, 'eric', '', 'verified']]],
    ['FS11', 'ผศ.ดร.', 'มาลัย ใจงาม', 'Malai Jai-ngam', 'ผศ.', 'doctoral', 'CS04', [[3, J, 'tci1', '', 'verified'], [2, J, 'scopus', 'Q3', 'verified'], [1, 'proceedings_intl', '', '', 'verified'], [0, J, 'tci2', '', 'pending']]],
    ['FS12', 'ผศ.ดร.', 'ชัยวัฒน์ พรหมมา', 'Chaiwat Promma', 'ผศ.', 'doctoral', 'CS04', [[3, J, 'tci2', '', 'verified'], [1, J, 'tci1', '', 'verified'], [0, 'proceedings_nat', '', '', 'verified'], [5, J, 'tci1', '', 'verified']]],
    ['FS13', 'รศ.ดร.', 'พิมพ์ชนก สายทอง', 'Pimchanok Saithong', 'รศ.', 'doctoral', 'CS05', [[3, J, 'scopus', 'Q1', 'verified'], [2, 'book', '', '', 'verified'], [1, J, 'tci1', '', 'verified'], [0, 'social', '', '', 'verified']]],
    ['FS14', 'ผศ.ดร.', 'กิตติพงษ์ รุ่งเรือง', 'Kittipong Rungruang', 'ผศ.', 'doctoral', 'CS05', [[2, J, 'scopus', 'Q2', 'verified'], [1, J, 'tci1', '', 'verified'], [1, 'proceedings_intl', '', '', 'verified'], [0, J, 'tci2', '', 'pending']]],
    ['FS15', '', 'Dr.David Miller', 'David Miller', 'อ.', 'doctoral', 'CS05', []],
    ['FS16', 'ผศ.ดร.', 'นันทนา ศรีวงศ์', 'Nantana Sriwong', 'ผศ.', 'doctoral', 'CS01,CS05', [[3, J, 'scopus', 'Q2', 'verified'], [2, J, 'tci1', '', 'verified'], [1, J, 'wos', 'Q1', 'verified'], [0, J, 'other_intl', '', 'pending']]]
  ];

  const titles = [
    'Population Ageing and Intergenerational Support in Thailand', 'ปัจจัยที่มีผลต่อภาวะเจริญพันธุ์ต่ำในเขตเมือง',
    'Migration Networks and Remittances in the Mekong Subregion', 'การเข้าถึงบริการสุขภาพของแรงงานข้ามชาติ',
    'Bayesian Models for Small-Area Mortality Estimation', 'Air Quality and Respiratory Admissions in Bangkok',
    'คุณภาพชีวิตผู้สูงอายุที่อยู่ลำพังในชนบทไทย', 'Household Structure and Child Development Outcomes',
    'Spatial Analysis of Dengue Incidence', 'แนวทางการจัดการขยะชุมชนแบบมีส่วนร่วม',
    'Social Determinants of Mental Health among Youth', 'Climate Change Adaptation in Coastal Communities',
    'การดูแลระยะยาวในชุมชน: บทเรียนจากพื้นที่นำร่อง', 'Machine Learning for Survival Analysis in Cohort Studies',
    'Gender, Work and Fertility Intentions', 'ระบบเฝ้าระวังคุณภาพน้ำด้วยเซนเซอร์ราคาประหยัด'
  ];
  const sources = {
    scopus: 'Asian Population Studies (Sample)', wos: 'Journal of Ageing and Society (Sample)', pubmed: 'BMC Public Health (Sample)',
    eric: 'International Journal of Educational Research (Sample)', tci1: 'วารสารประชากรศาสตร์ (ตัวอย่าง)', tci2: 'วารสารสังคมศาสตร์และมนุษยศาสตร์ (ตัวอย่าง)',
    tci3: 'วารสารวิชาการท้องถิ่น (ตัวอย่าง)', other_intl: 'Journal of Population and Social Studies (Sample)'
  };
  const typeSource = { proceedings_intl: 'International Conference on Population and Development (Sample)', proceedings_nat: 'การประชุมวิชาการระดับชาติ มหิดลวิจัย (ตัวอย่าง)',
    textbook: 'ตำรา — สำนักพิมพ์มหาวิทยาลัย (ตัวอย่าง)', book: 'หนังสือ — สำนักพิมพ์มหาวิทยาลัย (ตัวอย่าง)', patent: 'สิทธิบัตรการประดิษฐ์ เลขที่ 0000 (ตัวอย่าง)', social: 'ผลงานรับใช้สังคม (ตัวอย่าง)' };

  const now = nowIso_();
  const pubs = [];
  let t = 0;
  const faculty = fac.map(function (r) {
    r[7].forEach(function (p) {
      const status = p[4];
      pubs.push({ personType: 'faculty', personId: r[0], title: titles[t++ % titles.length], source: p[1] === J ? sources[p[2]] : typeSource[p[1]],
        year: Y(p[0]), type: p[1], database: p[1] === J ? p[2] : 'none', quartile: p[3], authorRole: t % 3 ? 'ผู้ประพันธ์หลัก' : 'ผู้ประพันธ์บรรณกิจ',
        status: status, verifyNote: status === 'rejected' ? 'ไม่พบชื่อวารสารในฐานข้อมูล TCI ตามที่ระบุ กรุณาแนบหลักฐาน' : '',
        verifiedBy: status === 'pending' ? '' : 'admin@mahidol.ac.th', verifiedAt: status === 'pending' ? '' : now, isSample: true, createdBy: 'sample' });
    });
    return { id: r[0], prefix: r[1], nameTh: r[2], nameEn: r[3], position: r[4], degree: r[5], degreeDetail: r[5] === 'doctoral' ? 'Ph.D.' : 'วท.ม.',
      curriculumIds: r[6], email: r[3].toLowerCase().replace(/[^a-z]+/g, '.') + '@example.ac.th', scopusId: '', orcid: '', active: true, isSample: true };
  });

  const experts = [
    { id: 'XS01', prefix: 'ผศ.ดร.', nameTh: 'นภา ตัวอย่างดี', nameEn: 'Napa Tuayangdee', affiliation: 'สถาบันวิจัยตัวอย่าง (ข้อมูลสมมติ)', position: 'ผศ.', degree: 'doctoral',
      degreeDetail: 'ปร.ด. (ประชากรศึกษา)', roleType: 'examiner', level: 'doctoral', criteriaYear: '2565', curriculumId: 'CS02', researchExp: true },
    { id: 'XS02', prefix: 'Prof.Dr.', nameTh: 'John Carter', nameEn: 'John Carter', affiliation: 'University of Sample (ข้อมูลสมมติ)', position: 'ศ.', degree: 'doctoral',
      degreeDetail: 'Ph.D. (Demography)', roleType: 'examiner', level: 'doctoral', criteriaYear: '2565', curriculumId: 'CS01', researchExp: true },
    { id: 'XS03', prefix: 'ดร.', nameTh: 'วิไล ศรีสวัสดิ์', nameEn: 'Wilai Srisawat', affiliation: 'กรมอนามัย (ข้อมูลสมมติ)', position: '', degree: 'doctoral',
      degreeDetail: 'ส.ด.', roleType: 'special', level: 'master', criteriaYear: '2565', curriculumId: 'CS05', researchExp: true }
  ].map(function (x) { return Object.assign(x, { scopusId: '', orcid: '', checkResult: '', isSample: true }); });

  const xp = function (id, list) {
    list.forEach(function (p) {
      pubs.push({ personType: 'expert', personId: id, title: p[0], source: p[1], year: p[2], type: J, database: p[3], quartile: p[4] || '',
        status: p[5] ? 'verified' : 'pending', isSample: true, createdBy: 'sample' });
    });
  };
  xp('XS01', [
    ['Ageing Society and Care Policy', 'Journal of Ageing and Society (Sample)', Y(1), 'wos', 'Q3', false],
    ['ครอบครัวข้ามรุ่นในชนบทไทย', 'วารสารตัวอย่าง', Y(2), 'tci3', '', true],
    ['Fertility Decline in Southeast Asia', 'Asian Population Studies (Sample)', Y(3), 'scopus', 'Q2', true],
    ['การย้ายถิ่นของแรงงานข้ามชาติ', 'วารสารสังคมศาสตร์และประชากร (ตัวอย่าง)', Y(5), 'tci1', '', true]
  ]);
  const jc = [];
  for (let i = 0; i < 12; i++) jc.push(['Population Dynamics Study ' + (i + 1) + ' (Sample)', i % 2 ? 'Demography (Sample)' : 'Population Studies (Sample)', Y(i % 8), i % 3 ? 'scopus' : 'wos', 'Q' + (1 + i % 3), true]);
  xp('XS02', jc);
  xp('XS03', [
    ['การส่งเสริมสุขภาพผู้สูงอายุในชุมชน', 'วารสารสาธารณสุขศาสตร์ (ตัวอย่าง)', Y(1), 'tci1', '', true],
    ['พฤติกรรมสุขภาพของวัยทำงาน', 'วารสารพยาบาลสาธารณสุข (ตัวอย่าง)', Y(2), 'tci1', '', true],
    ['Health Literacy among Thai Elderly', 'Journal of Health Research (Sample)', Y(3), 'scopus', 'Q3', true],
    ['ปัจจัยที่สัมพันธ์กับการออกกำลังกาย', 'วารสารวิทยาศาสตร์สุขภาพ (ตัวอย่าง)', Y(4), 'tci2', '', true],
    ['ระบบบริการปฐมภูมิ', 'วารสารวิชาการสาธารณสุข (ตัวอย่าง)', Y(6), 'tci2', '', true]
  ]);

  const users = [
    { email: 'chair.demo@example.ac.th', name: 'รศ.ดร.ประเสริฐ ทองดี (ตัวอย่าง)', role: 'chair', facultyId: 'FS04', curriculumIds: 'CS02', active: true, isSample: true },
    { email: 'lecturer.demo@example.ac.th', name: 'ผศ.ดร.สุนทร แก้วมณี (ตัวอย่าง)', role: 'lecturer', facultyId: 'FS03', curriculumIds: '', active: true, isSample: true },
    { email: 'exec.demo@example.ac.th', name: 'ผู้บริหาร (ตัวอย่าง)', role: 'executive', facultyId: '', curriculumIds: '', active: true, isSample: true }
  ];

  DB.insertMany('Curricula', curricula);
  DB.insertMany('Faculty', faculty);
  DB.insertMany('Experts', experts);
  DB.insertMany('Publications', pubs);
  DB.insertMany('Users', users);
  // รายชื่อวารสารตัวอย่าง (ใช้สาธิตการตรวจผลงานอัตโนมัติ) — ใช้จริงให้นำเข้า SJR/TCI ที่ จัดการระบบ > รายชื่อวารสาร
  DB.insertMany('JournalIndex', [
    ['17441730', 'Asian Population Studies (Sample)', 'scopus', 'Q2'], ['0144686X', 'Ageing and Society (Sample)', 'scopus', 'Q1'],
    ['0144686X', 'Ageing and Society (Sample)', 'wos', ''], ['24654418', 'Journal of Population and Social Studies (Sample)', 'tci1', ''],
    ['24654418', 'Journal of Population and Social Studies (Sample)', 'scopus', 'Q3'], ['16861574', 'Thai Journal of Social Sciences (Sample)', 'tci2', '']
  ].map(function (r) { return { issn: r[0], title: r[1], database: r[2], quartile: r[3], source: 'ตัวอย่าง', updatedAt: now }; }));
  if (!getSettings_().EVAL_YEAR) setSettings_({ EVAL_YEAR: String(E) });
  setSettings_({ SAMPLE_DATA: 'true' });
  audit_('seed_sample', pubs.length + ' publications');
  return { curricula: curricula.length, faculty: faculty.length, experts: experts.length, publications: pubs.length };
}

/** ล้างข้อมูล: sampleOnly = true ลบเฉพาะข้อมูลตัวอย่าง, false ลบข้อมูลทั้งหมด (ยกเว้นผู้ใช้จริงและการตั้งค่า) */
function clearData_(sampleOnly) {
  const pred = function (r) { return sampleOnly ? toBool_(r.isSample) : true; };
  const res = {};
  ['Publications', 'Assessments', 'Experts', 'Faculty', 'Curricula'].forEach(function (t) { res[t] = DB.removeWhere(t, pred); });
  res.Users = DB.removeWhere('Users', function (r) { return toBool_(r.isSample); });
  res.JournalIndex = DB.removeWhere('JournalIndex', function (r) { return r.source === 'ตัวอย่าง'; });
  setSettings_({ SAMPLE_DATA: 'false' });
  audit_(sampleOnly ? 'clear_sample' : 'clear_all', JSON.stringify(res));
  return res;
}


/* ======================================================================
 * ส่วน: Discovery.gs
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

function httpJson_(url) {
  const cache = CacheService.getScriptCache();
  const key = 'h' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url)).slice(0, 22);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const mail = getSettings_().OPENALEX_MAILTO || Session.getEffectiveUser().getEmail() || '';
  const full = url + (mail && url.indexOf(OPENALEX) === 0 ? (url.indexOf('?') > -1 ? '&' : '?') + 'mailto=' + encodeURIComponent(mail) : '');
  const res = UrlFetchApp.fetch(full, { muteHttpExceptions: true, headers: { 'User-Agent': 'MUGR-Academic-Tracker (Apps Script; mailto:' + mail + ')' } });
  const code = res.getResponseCode();
  if (code === 404) return null;
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
  // ถ้าวารสารอยู่หลายฐาน ใช้ Quartile ที่ดีที่สุดของฐานนานาชาติ
  const kpa = hits.filter(function (h) { return (DATABASES[h.database] || {}).group === 'kpa_intl' && /^Q[1-4]$/.test(h.quartile); });
  if (database && (DATABASES[database] || {}).group === 'kpa_intl' && kpa.length) quartile = kpa.map(function (h) { return h.quartile; }).sort()[0];

  if (w.pmid) {
    evidence.push('มีรหัส PubMed (PMID ' + w.pmid + ') → อยู่ในฐานข้อมูล PubMed');
    if (!database || DB_PRIORITY.indexOf(database) > DB_PRIORITY.indexOf('pubmed')) { database = 'pubmed'; quartile = quartile || ''; }
  }

  let type = 'journal';
  const st = String(w.sourceType || '').toLowerCase(), wt = String(w.workType || '').toLowerCase();
  if (st === 'conference' || /proceedings/.test(wt)) type = hasThai_(w.journal) || hasThai_(w.title) ? 'proceedings_nat' : 'proceedings_intl';
  else if (wt === 'book' || wt === 'monograph') type = 'book';

  let confidence = 'high';
  if (type === 'journal' && !database) {
    database = 'none';
    confidence = 'unknown';
    evidence.push((w.issns || []).length
      ? 'ไม่พบ ISSN ' + w.issns.map(function (s) { return fmtIssn_(normIssn_(s)); }).filter(String).join(', ') + ' ในรายชื่อวารสารที่นำเข้า — ตรวจด้วยตนเองที่ SCImago / TCI / Web of Science'
      : 'ไม่พบ ISSN ของแหล่งเผยแพร่ — ตรวจด้วยตนเอง');
  }
  if (type !== 'journal') { evidence.push('ประเภท: ' + PUB_TYPES[type].label + ' (จากข้อมูลแหล่งเผยแพร่)'); confidence = 'medium'; }

  const db = DATABASES[type === 'journal' ? database : 'none'] || DATABASES.none;
  const p = { type: type, database: type === 'journal' ? database : 'none', quartile: type === 'journal' && db.quartile ? quartile : '' };
  const wt2 = pubWeight_(p, getSettings_());
  return Object.assign(p, {
    level: type === 'journal' ? db.level : (PUB_TYPES[type].level || ''),
    group: type === 'journal' ? db.group : 'other',
    accepted: isAccepted_(p),
    weight: wt2.w, basis: wt2.basis, confidence: confidence, evidence: evidence
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
  const existing = DB.all('Publications').filter(function (p) { return !person || (p.personType === person.personType && p.personId === person.personId); });
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
    return Object.assign({}, w, c, {
      year: year,
      inWindow: year >= win.start && year <= win.end,
      expired: year > 0 && year < win.start,
      duplicate: !!((w.doi && doiSet[w.doi]) || (normTitle_(w.title) && titleSet[normTitle_(w.title)]))
    });
  }).sort(function (a, b) { return b.year - a.year; });
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
  const res = finishWorks_([work], null)[0];
  // เดาเจ้าของผลงานจากรายชื่อผู้แต่ง
  const owners = [];
  const names = (work.authors || []).map(function (a) { return String(a).toLowerCase(); }).join(' | ');
  DB.all('Faculty').concat(DB.all('Experts').map(function (x) { return Object.assign({ _expert: true }, x); })).forEach(function (f) {
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
 * ส่วน: Code.gs
 * ====================================================================== */

/**
 * Code.gs — จุดเริ่มต้นของ Web App และเมนูใน Google Sheets
 *
 * ติดตั้ง: ดู README.md (หัวข้อ "การติดตั้ง")
 *  1) เปิด Google Sheets ใหม่ → ส่วนขยาย → Apps Script → วางไฟล์ทั้งหมดในโฟลเดอร์ src/
 *  2) รันฟังก์ชัน setup() หนึ่งครั้งเพื่อสร้างชีตและอนุญาตสิทธิ์
 *  3) การทำให้ใช้งานได้ → การทำให้ใช้งานได้รายการใหม่ → เว็บแอป
 */

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP.name;
  return t.evaluate()
    .setTitle(APP.name + ' — ' + APP.code)
    .setFaviconUrl('https://www.gstatic.com/images/icons/material/system/1x/school_black_48dp.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** ใช้ใน template: <?!= include('Styles') ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** รันครั้งแรกจากตัวแก้ไขสคริปต์: สร้างชีต, ตั้งผู้รันเป็น Admin */
function setup() {
  ensureSchema_(true);
  const me = currentUser_();
  Logger.log('ฐานข้อมูล: ' + getDb_().getUrl());
  Logger.log('ผู้ใช้ปัจจุบัน: ' + me.email + ' (' + me.roleLabel + ')');
  return getDb_().getUrl();
}

/** เติมข้อมูลตัวอย่างจากตัวแก้ไขสคริปต์ (ทางเลือก — ทำได้จากหน้าเว็บเช่นกัน) */
function setupWithSampleData() {
  setup();
  return seedSampleData_();
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('\uD83C\uDF93 ' + APP.code)
      .addItem('ตั้งค่าเริ่มต้น (สร้างชีต)', 'setup')
      .addItem('เติมข้อมูลตัวอย่าง', 'setupWithSampleData')
      .addSeparator()
      .addItem('เปิดลิงก์เว็บแอป', 'showWebAppUrl_')
      .addToUi();
  } catch (e) { /* ไม่ได้เปิดจาก Sheets */ }
}

function showWebAppUrl_() {
  const url = ScriptApp.getService().getUrl();
  const html = url
    ? '<p style="font-family:sans-serif">เปิดระบบได้ที่:<br><a href="' + url + '" target="_blank">' + url + '</a></p>'
    : '<p style="font-family:sans-serif">ยังไม่ได้ Deploy เป็นเว็บแอป — ไปที่ Apps Script → การทำให้ใช้งานได้ → การทำให้ใช้งานได้รายการใหม่ → เว็บแอป</p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(140), APP.name);
}
