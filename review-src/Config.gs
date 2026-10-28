/**
 * Config.gs — ค่าคงที่ของระบบตรวจสอบผลงานทางวิชาการและคุณสมบัติอาจารย์/กรรมการ (RV)
 *
 * ค่าที่ "ต้องยืนยันกับหน่วยงาน" ไม่ได้ฝังไว้ในโค้ด แต่อยู่ในหน้า ตั้งค่า (ชีต Settings) และ ชุดเกณฑ์ (ชีต CriteriaSets)
 * ห้ามใส่รหัสผ่าน/กุญแจเชื่อมต่อในไฟล์นี้ — ใช้ Script Properties เท่านั้น
 */

const APP = {
  name: 'ระบบตรวจสอบผลงานทางวิชาการและคุณสมบัติอาจารย์/กรรมการ',
  short: 'ตรวจสอบผลงานและคุณสมบัติ',
  dbName: 'RV — ฐานข้อมูลระบบตรวจสอบผลงานและคุณสมบัติ',
  schemaVersion: 1
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
  Requests: ['id', 'code', 'typeId', 'title', 'purpose', 'note', 'unit', 'requesterId', 'status', 'round', 'personSnap', 'identityStatus', 'identityBasis', 'identityNote', 'identityBy', 'identityAt', 'criteriaSetId', 'assigneeId', 'reviewerId', 'worksComplete', 'worksCompleteNote', 'staffSummary', 'isDemo', 'createdAt', 'updatedAt', 'submittedAt', 'decidedAt', 'closedAt', 'cancelledAt', 'cancelReason'],
  RequestWorks: ['id', 'requestId', 'origin', 'sourceWorkId', 'title', 'type', 'year', 'pubDate', 'authors', 'venue', 'doi', 'ref', 'evidenceId', 'status', 'staffNote', 'addedBy', 'addedRound', 'createdAt', 'updatedAt'],
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
  TEST_MODE: 'true',
  MUHR_MODE: 'mock',
  MUREX_MODE: 'mock',
  SIM_OUTAGE_MUHR: 'false',
  SIM_OUTAGE_MUREX: 'false',
  STALE_DAYS: '180',
  MAX_FILE_MB: '10',
  ALLOWED_EXT: 'pdf,png,jpg,jpeg',
  EXTERNAL_NOTIFY: 'off'
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
  min_works: { label: 'จำนวนผลงาน', params: ['min', 'years', 'types'] },
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
  api: 'เชื่อมต่อ API (ยังไม่ได้พัฒนา — ต้องได้รับข้อกำหนดจากเจ้าของระบบ)'
};

/** คอลัมน์ CSV ที่รับ (แถวแรกต้องเป็นชื่อคอลัมน์ตามนี้) */
const IMPORT_COLUMNS = {
  MUHR: { required: ['staffCode', 'firstNameTh', 'lastNameTh'], optional: ['titleTh', 'firstNameEn', 'lastNameEn', 'formerNames', 'unit', 'position', 'academicRank', 'highestDegree', 'employmentStatus', 'sourceUpdatedAt'] },
  MUREX: { required: ['staffCode', 'title', 'year'], optional: ['workRef', 'type', 'pubDate', 'authors', 'venue', 'doi', 'ref', 'sourceUpdatedAt'] }
};
