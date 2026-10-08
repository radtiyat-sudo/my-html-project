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
