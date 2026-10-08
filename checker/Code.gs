/**
 * ======================================================================
 *  ระบบตรวจผลงานวิชาการอัตโนมัติ (เว็บสาธารณะ) — ไฟล์: Code.gs
 *  วางทั้งไฟล์ใน Apps Script ไฟล์ชื่อ "Code" แล้วรัน setup() เพื่อสร้างชีตและดูรหัสผู้ดูแล
 *  Deploy: ดำเนินการในฐานะ "ฉัน" · ผู้มีสิทธิ์เข้าถึง "ทุกคน"
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

function httpJson_(url, extraHeaders) {
  const cache = CacheService.getScriptCache();
  const key = 'h' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url)).slice(0, 22);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const mail = getSettings_().OPENALEX_MAILTO || Session.getEffectiveUser().getEmail() || '';
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
 * ส่วน: Sources.gs
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

function apiKey_(name) { return PropertiesService.getScriptProperties().getProperty(name) || ''; }

function apiKeysStatus_() {
  requireRole_(['admin']);
  const o = {};
  API_KEY_NAMES.forEach(function (k) { o[k] = !!apiKey_(k); });
  return o;
}

function saveApiKeys_(p) {
  requireRole_(['admin']);
  const props = PropertiesService.getScriptProperties();
  API_KEY_NAMES.forEach(function (k) {
    if (p['clear_' + k]) props.deleteProperty(k);
    else if (String(p[k] || '').trim()) props.setProperty(k, String(p[k]).trim());
  });
  audit_('api_keys', API_KEY_NAMES.filter(function (k) { return p[k] || p['clear_' + k]; }).join(','));
  return apiKeysStatus_();
}

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
  const toCE = win.end - 543 + 1;
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
 * ส่วน: CheckerMain.gs
 * ====================================================================== */

/**
 * CheckerMain.gs — เว็บแอป "ตรวจผลงานอัตโนมัติ" แบบสาธารณะ (ส่งลิงก์ให้ใครก็ใช้ได้)
 *
 * - ทำงานในนามผู้ Deploy เสมอ (ใช้ API key และรายชื่อวารสารของผู้ Deploy)
 * - ทุกการค้นถูกบันทึกในชีต CheckLog และผลที่ผู้ใช้กด "ส่งผลให้ผู้รวบรวม" ถูกเก็บในชีต CheckResults
 * - ส่วนผู้ดูแล (API key, รายชื่อวารสาร) ป้องกันด้วยรหัสผู้ดูแล — ดูรหัสได้จากการรัน setup()
 *
 * ใช้ส่วนค้นหา/จัดกลุ่มชุดเดียวกับระบบหลัก (Config, Database, Logic, Discovery, Sources)
 */

/* ---- ปรับโครงสร้างตารางสำหรับเว็บแอปนี้ (ไม่ใช้ตารางของระบบหลัก) ---- */
['Users', 'Curricula', 'Faculty', 'Experts', 'Publications', 'Assessments'].forEach(function (t) { delete TABLES[t]; });
TABLES.CheckLog = ['ts', 'requester', 'email', 'org', 'nameTh', 'nameEn', 'scopusId', 'orcid', 'fromYear', 'total', 'intl', 'nat', 'other', 'unknown', 'sources'];
TABLES.CheckResults = ['ts', 'batch', 'requester', 'email', 'org', 'personTh', 'personEn', 'title', 'journal', 'year', 'type', 'database', 'quartile', 'groupLabel', 'weight', 'foundIn', 'origins', 'doi', 'url', 'evidence'];
APP.schemaVersion = 101;
APP.checkerName = 'ระบบตรวจผลงานวิชาการอัตโนมัติ';

let CHECKER_ADMIN_ = false;

/* ---- แทนที่ฟังก์ชันสิทธิ์ของระบบหลัก ---- */
function requireRole_() { if (!CHECKER_ADMIN_) throw new Error('ส่วนนี้สำหรับผู้ดูแลเท่านั้น — กรุณาเข้าสู่ระบบผู้ดูแลก่อน'); }
function currentUser_() { return { email: '', name: 'ผู้ใช้ทั่วไป', role: CHECKER_ADMIN_ ? 'admin' : 'public', realRole: CHECKER_ADMIN_ ? 'admin' : 'public', permissions: [] }; }
function canEditPerson_() { return false; }

/* ---- Web app ---- */
function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP.checkerName;
  return t.evaluate()
    .setTitle(APP.checkerName + ' — ก.พ.อ. 2562')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** รันครั้งแรกจากตัวแก้ไขสคริปต์: สร้างชีต และสร้างรหัสผู้ดูแล (ดูได้ใน "บันทึกการดำเนินการ") */
function setup() {
  ensureSchema_(true);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSCODE')) props.setProperty('ADMIN_PASSCODE', randomCode_());
  const msg = 'ฐานข้อมูล: ' + getDb_().getUrl() + '\nรหัสผู้ดูแล (ใช้ในแท็บ "ผู้ดูแล" ของหน้าเว็บ): ' + props.getProperty('ADMIN_PASSCODE');
  Logger.log(msg);
  return msg;
}

/** เปลี่ยนรหัสผู้ดูแลใหม่ (รันจากตัวแก้ไขสคริปต์) */
function resetAdminPasscode() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSCODE', randomCode_());
  return setup();
}

function randomCode_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }

/* ---- จุดเรียกจากหน้าเว็บ ---- */
function checkerApi(action, payload) {
  const p = payload || {};
  try {
    ensureSchema_();
    CHECKER_ADMIN_ = false;
    if (p.token) {
      const ok = CacheService.getScriptCache().get('adm_' + p.token);
      if (ok) CHECKER_ADMIN_ = true;
    }
    const fn = CHECKER_ACTIONS_[action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + action);
    return JSON.parse(JSON.stringify({ ok: true, data: fn(p) }));
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function throttle_() {
  const cache = CacheService.getScriptCache();
  const k = 'rl_' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(k) || 0) + 1;
  const max = Number(getSettings_().CHECKER_PER_MINUTE || 20);
  if (n > max) throw new Error('มีผู้ใช้ค้นพร้อมกันมากเกินไป กรุณารอ 1 นาทีแล้วลองใหม่');
  cache.put(k, String(n), 120);
}

const GROUP_LABEL_ = { kpa_intl: 'นานาชาติ (ก.พ.อ.)', tci1: 'ระดับชาติ TCI 1', tci2: 'ระดับชาติ TCI 2' };

const CHECKER_ACTIONS_ = {
  meta: function () {
    const keys = {};
    ['SCOPUS_API_KEY', 'WOS_API_KEY'].forEach(function (k) { keys[k] = !!apiKey_(k); });
    return {
      databases: DATABASES, pubTypes: PUB_TYPES, window: evalWindow_(getSettings_()), keys: keys,
      journalIndex: journalIndexStats_(), org: getSettings_().ORG_NAME || APP.org, admin: CHECKER_ADMIN_
    };
  },

  search: function (p) {
    throttle_();
    const r = searchAll_({ nameTh: p.nameTh, nameEn: p.nameEn, scopusId: p.scopusId, orcid: p.orcid, affil: p.affil, openalexId: p.openalexId, fromYear: p.fromYear });
    const s = r.summary;
    try {
      DB.insert('CheckLog', { ts: nowIso_(), requester: String(p.requester || '').slice(0, 120), email: String(p.email || '').slice(0, 120), org: String(p.org || '').slice(0, 120),
        nameTh: p.nameTh || '', nameEn: p.nameEn || '', scopusId: p.scopusId || '', orcid: p.orcid || '', fromYear: p.fromYear || '',
        total: r.works.length, intl: s.intl, nat: s.nat, other: s.other, unknown: s.unknown,
        sources: r.status.map(function (x) { return x.label + ':' + x.mode + ':' + x.count; }).join(' | ') });
    } catch (e) { /* การบันทึก log ไม่ควรทำให้การค้นล้ม */ }
    return r;
  },

  analyze: function (p) {
    throttle_();
    const r = analyzeDocument_({ text: p.text, title: p.title, doi: p.doi });
    delete r.owners;
    return r;
  },

  /** ผู้ใช้ส่งผลที่เลือกให้ผู้รวบรวม (บันทึกลงชีต CheckResults ของผู้ Deploy) */
  submit: function (p) {
    if (!String(p.requester || '').trim()) throw new Error('กรุณากรอกชื่อผู้ส่ง');
    const works = [].concat(p.works || []).slice(0, 300);
    if (!works.length) throw new Error('ยังไม่ได้เลือกผลงาน');
    const batch = 'B' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
    const ts = nowIso_();
    DB.insertMany('CheckResults', works.map(function (w) {
      return { ts: ts, batch: batch, requester: String(p.requester).slice(0, 120), email: String(p.email || '').slice(0, 120), org: String(p.org || '').slice(0, 120),
        personTh: p.nameTh || '', personEn: p.nameEn || '', title: String(w.title || '').slice(0, 500), journal: String(w.journal || '').slice(0, 300),
        year: w.year || '', type: (PUB_TYPES[w.type] || {}).label || w.type, database: (DATABASES[w.database] || {}).label || w.database,
        quartile: w.quartile || '', groupLabel: w.type !== 'journal' ? 'ผลงานประเภทอื่น' : (GROUP_LABEL_[w.group] || 'ไม่อยู่ในฐานตามประกาศ/ยังระบุไม่ได้'),
        weight: w.weight, foundIn: [].concat(w.foundIn || []).join(', '), origins: [].concat(w.origins || []).join(', '),
        doi: w.doi || '', url: w.url || '', evidence: [].concat(w.evidence || []).join(' / ').slice(0, 1500) };
    }));
    return { batch: batch, count: works.length };
  },

  /* ---- ผู้ดูแล ---- */
  adminLogin: function (p) {
    const code = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSCODE');
    if (!code) throw new Error('ยังไม่ได้รัน setup() ในตัวแก้ไข Apps Script');
    if (String(p.passcode || '').trim().toUpperCase() !== code) { Utilities.sleep(800); throw new Error('รหัสผู้ดูแลไม่ถูกต้อง'); }
    const token = Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('adm_' + token, '1', 7200);
    return { token: token };
  },
  keysStatus: function () { return apiKeysStatus_(); },
  saveKeys: function (p) { return saveApiKeys_(p); },
  testKeys: function () { return testApiKeys_(); },
  journalStats: function () { return journalIndexStats_(); },
  importJournals: function (p) { return importJournalIndex_(p); },
  clearJournals: function (p) { return clearJournalIndex_(p); },
  adminSummary: function () {
    requireRole_();
    const logs = DB.all('CheckLog');
    const results = DB.all('CheckResults');
    return { searches: logs.length, submitted: results.length, recent: logs.slice(-15).reverse(), sheetUrl: getDb_().getUrl() };
  }
};
