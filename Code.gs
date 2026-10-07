/**
 * ระบบ GRAS.02 — การแต่งตั้งผู้มีความรู้ความเชี่ยวชาญและประสบการณ์สูง
 * 1) ตรวจสอบซ้ำก่อนเสนอแต่งตั้ง  2) สถานะ/แจ้งเตือนครบวาระ 5 ปีอัตโนมัติ  3) ฟอร์มแจ้งอาจารย์
 *
 * วิธีใช้: วางไฟล์นี้ใน Code.gs และสร้างไฟล์ HTML ชื่อ Index
 * 1) รันฟังก์ชัน testSetup เพื่อตรวจว่าระบบหาแท็บรายชื่อและคอลัมน์เจอ (ไม่ส่งอีเมล ไม่เขียนชีต)
 * 2) รันฟังก์ชัน setupDailyTrigger 1 ครั้ง เพื่อเปิดแจ้งเตือนอัตโนมัติ
 * ไม่จำเป็นต้องแก้ CONFIG — ระบบหาแท็บรายชื่อและหัวตารางให้เอง
 */

// =====================================================================
// ตั้งค่า (แก้เฉพาะส่วนนี้)
// =====================================================================
const CONFIG = {
  // ----- แหล่งข้อมูลรายชื่อผู้มีความรู้ความเชี่ยวชาญฯ -----
  // ID ของ Spreadsheet (ส่วนระหว่าง /d/ และ /edit ใน URL)
  // ใช้เมื่อสคริปต์ไม่ได้เปิดจาก "ส่วนขยาย → Apps Script" ของชีตนี้
  EXPERT_SPREADSHEET_ID: '1fxnuxi2RY8tgVzRG4DL_HDBsxavct0ALCcT_HaZDQJs',
  // ชื่อแท็บรายชื่อ — เว้นว่าง = ให้ระบบหาเองจากหัวตาราง
  EXPERT_SHEET_NAME: '',

  // คำที่ใช้หาคอลัมน์จากหัวตาราง (ไล่ตามลำดับ ใช้คอลัมน์แรกที่หัวตารางมีคำนั้น)
  // ถ้าหัวตารางในชีตใช้คำอื่น ให้เพิ่มคำเข้าไปในรายการ
  COLUMNS: {
    // คอลัมน์อีเมล (ใส่ไว้บนสุด เพื่อไม่ให้ "อีเมลผู้ได้รับแต่งตั้ง" ถูกจับเป็นคอลัมน์ "ได้รับแต่งตั้ง")
    // ในเซลล์ใส่ได้หลายอีเมล คั่นด้วย , หรือ ; หรือขึ้นบรรทัดใหม่
    expertEmail:    ['เมลผู้ได้รับแต่งตั้ง', 'เมลผู้ได้รับการแต่งตั้ง', 'เมลผู้เชี่ยวชาญ', 'เมลผู้ทรงคุณวุฒิ'],
    submitterEmail: ['เมลผู้ยื่น', 'เมลผู้เสนอ', 'เมลผู้ขอ'],
    name:      ['ชื่อ-นามสกุล', 'ชื่อ - นามสกุล', 'ชื่อ'],
    dept:      ['เสนอจาก', 'ส่วนงาน'],
    program:   ['หลักสูตร'],
    duty:      ['ปฏิบัติหน้าที่'],
    expertise: ['ความเชี่ยวชาญ'],
    start:     ['ได้รับแต่งตั้ง', 'วันที่แต่งตั้ง', 'เริ่ม'],
    end:       ['สิ้นสุด', 'หมดวาระ', 'หมดอายุ'],
    approval:  ['สถานะการแต่งตั้ง'],
    // วันที่ได้รับอนุมัติ เช่น 7/10/2569 — ใช้เป็นวันเริ่มนับวาระ
    approvedDate: ['วันที่ได้รับอนุมัติ', 'วันที่อนุมัติ', 'อนุมัติเมื่อ', 'วันอนุมัติ']
  },

  // ----- กฎวาระการแต่งตั้ง -----
  // วันครบวาระ = วันที่ได้รับอนุมัติ + TERM_YEARS ปี  (เช่น 7/10/2569 → 7/10/2574)
  // ถ้าไม่มีวันที่อนุมัติ จะใช้ "ได้รับแต่งตั้ง" + 5 ปี หรือคอลัมน์ "สิ้นสุด" ตามลำดับ
  TERM_YEARS: 5,
  WARN_DAYS: 180,         // เหลือน้อยกว่าหรือเท่ากับกี่วัน ถือว่า "ใกล้ครบวาระ"

  // แปลง "ภาค/ปีการศึกษา" เช่น 2/2568 เป็นวันที่
  // ปี ค.ศ. = ปี พ.ศ.การศึกษา + adOffset (ภาค 1 เริ่ม ส.ค. ปีเดียวกัน, ภาค 2 อยู่ต้นปีถัดไป)
  SEMESTER_START: {
    1: { month: 8, day: 1,  adOffset: -543 },
    2: { month: 1, day: 1,  adOffset: -542 },
    3: { month: 6, day: 1,  adOffset: -542 }   // ภาคฤดูร้อน
  },
  SEMESTER_END: {
    1: { month: 12, day: 31, adOffset: -543 },
    2: { month: 5,  day: 31, adOffset: -542 },
    3: { month: 7,  day: 31, adOffset: -542 }
  },

  // ----- แจ้งเตือนอัตโนมัติ -----
  // อีเมลผู้รับอีเมลสรุป เช่น ['a@mahidol.ac.th', 'b@mahidol.ac.th'] — เว้นว่าง = ส่งถึงบัญชีที่รันสคริปต์
  ALERT_EMAILS: [],
  // ส่งแจ้งเตือนเมื่อเหลือ <= กี่วัน (แต่ละรายจะได้แจ้งเตือนครั้งเดียวต่อระดับ) 0 = ครบวาระแล้ว
  ALERT_THRESHOLDS: [180, 90, 30, 0],
  ALERT_HOUR: 8,          // เวลาที่ตรวจสอบทุกวัน (ชั่วโมง ตามเขตเวลาของสคริปต์)
  ALERT_LOG_SHEET: 'AlertLog',

  // ส่งอีเมลแจ้งเตือนรายบุคคล (นอกเหนือจากอีเมลสรุปถึง ALERT_EMAILS)
  NOTIFY_EXPERT: true,      // ส่งถึงผู้ได้รับแต่งตั้ง (To)
  NOTIFY_SUBMITTER: true,   // ส่งถึงผู้ยื่น (CC)
  // ไม่ส่งอีเมลรายบุคคลถึงผู้ที่ครบวาระมานานเกินกี่วันแล้ว (กันส่งย้อนหลังตอนเปิดใช้ครั้งแรก)
  INDIVIDUAL_MAX_OVERDUE_DAYS: 30,

  // เขียนสถานะที่คำนวณได้กลับลงชีต (เพิ่ม 3 คอลัมน์ท้ายตาราง) เพื่อให้ Looker Studio แสดงได้
  WRITE_BACK_STATUS: true,
  STATUS_COLUMN: 'สถานะอัตโนมัติ',
  DAYS_LEFT_COLUMN: 'เหลือ (วัน)',
  END_DATE_COLUMN: 'วันครบวาระ'
};

// =====================================================================
// รายชื่อผู้เชี่ยวชาญ: ตรวจสอบซ้ำ / สถานะวาระ / แจ้งเตือนอัตโนมัติ
// =====================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// คำนำหน้า/ตำแหน่ง ที่ตัดออกก่อนเปรียบเทียบชื่อ (เรียงคำยาวก่อนคำสั้น)
const NAME_PREFIXES = [
  'ศาสตราจารย์เกียรติคุณ', 'ผู้ช่วยศาสตราจารย์', 'รองศาสตราจารย์', 'ศาสตราจารย์', 'อาจารย์',
  'ทันตแพทย์หญิง', 'ทันตแพทย์', 'นายแพทย์', 'แพทย์หญิง', 'เภสัชกรหญิง', 'เภสัชกร',
  'นายสัตวแพทย์', 'สัตวแพทย์หญิง', 'ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี', 'นางสาว', 'นาง', 'นาย',
  'ศ.ดร.', 'รศ.ดร.', 'ผศ.ดร.', 'ศ.นพ.', 'รศ.นพ.', 'ผศ.นพ.', 'ศ.พญ.', 'รศ.พญ.', 'ผศ.พญ.',
  'ศ.', 'รศ.', 'ผศ.', 'อ.', 'ดร.', 'นพ.', 'พญ.', 'ทพ.', 'ทพญ.', 'ภก.', 'ภญ.', 'สพ.', 'น.ส.',
  'Prof.', 'Assoc.', 'Asst.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Miss'
];

/** ตัดคำนำหน้าทั้งหมด แล้วลบช่องว่าง/เครื่องหมาย เพื่อใช้เป็น key เปรียบเทียบชื่อ */
function normalizeName(name) {
  let s = String(name || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of NAME_PREFIXES) {
      if (s.toLowerCase().startsWith(p.toLowerCase()) && s.length > p.length) {
        s = s.slice(p.length).trim();
        changed = true;
      }
    }
  }
  return s.toLowerCase().replace(/[\s.\-,()]/g, '');
}

function midnight_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * แปลงค่าในเซลล์เป็นวันที่: รองรับ Date, "2/2568" (ภาค/ปีการศึกษา), "31/05/2573" หรือ "2031-05-31"
 * @param {'start'|'end'} which ใช้ต้นภาคหรือปลายภาค เมื่อค่าเป็น ภาค/ปี
 */
function parseTermDate_(value, which) {
  if (value instanceof Date && !isNaN(value)) {
    // พิมพ์ปี พ.ศ. ลงเซลล์วันที่ (เช่น 7/10/2569) Sheets จะเก็บเป็นปี ค.ศ. 2569 → แปลงกลับ
    const y = value.getFullYear() > 2400 ? value.getFullYear() - 543 : value.getFullYear();
    return new Date(y, value.getMonth(), value.getDate());
  }
  const s = String(value || '').trim();
  if (!s) return null;

  let m = /^([123])\s*\/\s*(\d{4})$/.exec(s);
  if (m) {
    const map = which === 'start' ? CONFIG.SEMESTER_START : CONFIG.SEMESTER_END;
    const rule = map[m[1]];
    return new Date(Number(m[2]) + rule.adOffset, rule.month - 1, rule.day);
  }

  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) {
    let y = Number(m[3]);
    if (y > 2400) y -= 543;
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }

  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    let y = Number(m[1]);
    if (y > 2400) y -= 543;
    return new Date(y, Number(m[2]) - 1, Number(m[3]));
  }
  return null;
}

/** ไฟล์ชีตที่ใช้งาน: ไฟล์ที่ผูกกับสคริปต์ ถ้าไม่มีให้เปิดจาก EXPERT_SPREADSHEET_ID */
function getSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  if (!CONFIG.EXPERT_SPREADSHEET_ID) {
    throw new Error('สคริปต์ไม่ได้ผูกกับชีต — เปิด Apps Script จากเมนู ส่วนขยาย → Apps Script ในชีต หรือใส่ EXPERT_SPREADSHEET_ID');
  }
  return SpreadsheetApp.openById(CONFIG.EXPERT_SPREADSHEET_ID);
}

const HEADER_SCAN_ROWS = 5;   // หาแถวหัวตารางภายใน 5 แถวแรก

/** อ่านหัวตารางของแท็บ: คืน { headerRow, headers, col } หรือ null ถ้าไม่ใช่ตารางรายชื่อ */
function detectHeader_(sheet) {
  const lastCol = sheet.getLastColumn();
  const rows = Math.min(HEADER_SCAN_ROWS, sheet.getLastRow());
  if (!lastCol || !rows) return null;
  const top = sheet.getRange(1, 1, rows, lastCol).getDisplayValues();
  for (let i = 0; i < top.length; i++) {
    const headers = top[i].map(h => String(h).replace(/\s+/g, ' ').trim());
    try {
      return { headerRow: i + 1, headers, col: mapColumns_(headers) };
    } catch (e) { /* ยังไม่ใช่แถวหัวตาราง */ }
  }
  return null;
}

/** หาแท็บรายชื่อ: ใช้ EXPERT_SHEET_NAME ถ้าระบุ ไม่งั้นไล่หาแท็บที่หัวตารางมี "ชื่อ" + "ได้รับแต่งตั้ง"/"สิ้นสุด"/"วันที่ได้รับอนุมัติ" */
function openExpertSheet_() {
  const ss = getSpreadsheet_();
  const sheets = ss.getSheets();
  const names = sheets.map(sh => sh.getName());

  if (CONFIG.EXPERT_SHEET_NAME) {
    const sheet = ss.getSheetByName(CONFIG.EXPERT_SHEET_NAME);
    if (!sheet) {
      throw new Error('ไม่พบแท็บ "' + CONFIG.EXPERT_SHEET_NAME + '" — แท็บที่มี: ' + names.join(', ') +
        ' (หรือเว้น EXPERT_SHEET_NAME ว่างไว้ให้ระบบหาเอง)');
    }
    const found = detectHeader_(sheet);
    if (!found) throw new Error('แท็บ "' + CONFIG.EXPERT_SHEET_NAME + '" ไม่มีหัวคอลัมน์ "ชื่อ" และ "ได้รับแต่งตั้ง"/"สิ้นสุด"');
    return Object.assign({ sheet }, found);
  }

  const skip = [CONFIG.ALERT_LOG_SHEET, SHEET_NAME];
  for (const sheet of sheets) {
    if (skip.indexOf(sheet.getName()) !== -1) continue;
    const found = detectHeader_(sheet);
    if (found) return Object.assign({ sheet }, found);
  }
  throw new Error('หาแท็บรายชื่อไม่เจอ — ต้องมีหัวคอลัมน์ที่มีคำว่า "ชื่อ" และ "ได้รับแต่งตั้ง" หรือ "สิ้นสุด" ' +
    'ภายใน 5 แถวแรก (แท็บที่มี: ' + names.join(', ') + ')');
}

/** หา index คอลัมน์ (0-based) จากหัวตาราง ตามคำใน CONFIG.COLUMNS */
function mapColumns_(headers) {
  const own = [CONFIG.STATUS_COLUMN, CONFIG.DAYS_LEFT_COLUMN, CONFIG.END_DATE_COLUMN];
  const taken = [];
  const map = {};
  Object.keys(CONFIG.COLUMNS).forEach(field => {
    map[field] = -1;
    for (const kw of CONFIG.COLUMNS[field]) {
      const idx = headers.findIndex((h, i) =>
        h && own.indexOf(h) === -1 && taken.indexOf(i) === -1 && h.indexOf(kw) !== -1);
      if (idx !== -1) { map[field] = idx; taken.push(idx); break; }
    }
  });
  if (map.name === -1) throw new Error('ไม่พบคอลัมน์ชื่อ — ตรวจสอบ CONFIG.COLUMNS.name');
  if (map.approvedDate === -1 && map.start === -1 && map.end === -1) {
    throw new Error('ไม่พบคอลัมน์ "วันที่ได้รับอนุมัติ" / "ได้รับแต่งตั้ง" / "สิ้นสุด" — ตรวจสอบ CONFIG.COLUMNS');
  }
  return map;
}

/** คำนวณสถานะของแต่ละรายการ */
function computeStatus_(approval, endDate, today) {
  const approvalText = String(approval || '').trim();
  if (approvalText && !/^อนุมัติ/.test(approvalText)) {   // เช่น รอพิจารณา / ไม่อนุมัติ
    return { code: 'pending', label: approvalText, daysLeft: null };
  }
  if (!endDate) return { code: 'unknown', label: 'ไม่ทราบวันครบวาระ', daysLeft: null };

  const daysLeft = Math.round((endDate - today) / DAY_MS);
  if (daysLeft < 0) return { code: 'expired', label: 'ครบวาระแล้ว', daysLeft };
  if (daysLeft <= CONFIG.WARN_DAYS) return { code: 'expiring', label: 'ใกล้ครบวาระ', daysLeft };
  return { code: 'active', label: 'Active', daysLeft };
}

/** อ่านรายชื่อทั้งหมดพร้อมสถานะ (ใช้ภายในสคริปต์ — มี Date object) */
function readExperts_() {
  const { sheet, headerRow, headers, col } = openExpertSheet_();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= headerRow) return { sheet, headerRow, headers, col, records: [] };

  const range = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol);
  const values = range.getValues();
  const display = range.getDisplayValues();
  const today = midnight_(new Date());

  const get = (r, i, f) => (col[f] === -1 ? '' : (i === 'd' ? display : values)[r][col[f]]);

  const records = [];
  values.forEach((row, r) => {
    const name = String(get(r, 'd', 'name')).trim();
    if (!name) return;

    const approvedDate = col.approvedDate === -1 ? null : parseTermDate_(values[r][col.approvedDate], 'start');
    const startDate = col.start === -1 ? null : parseTermDate_(values[r][col.start], 'start');
    const addTerm = d => new Date(d.getFullYear() + CONFIG.TERM_YEARS, d.getMonth(), d.getDate());

    // วันครบวาระ: วันที่ได้รับอนุมัติ + 5 ปี → ได้รับแต่งตั้ง + 5 ปี → คอลัมน์สิ้นสุด
    let endDate = null;
    if (approvedDate) endDate = addTerm(approvedDate);
    else if (startDate) endDate = addTerm(startDate);
    else if (col.end !== -1) endDate = parseTermDate_(values[r][col.end], 'end');
    const status = computeStatus_(get(r, 'd', 'approval'), endDate, today);

    records.push({
      row: headerRow + 1 + r,
      name,
      key: normalizeName(name),
      dept: String(get(r, 'd', 'dept')),
      program: String(get(r, 'd', 'program')),
      duty: String(get(r, 'd', 'duty')),
      expertise: String(get(r, 'd', 'expertise')),
      startText: String(get(r, 'd', 'start')),
      endText: String(get(r, 'd', 'end')),
      approval: String(get(r, 'd', 'approval')),
      expertEmails: parseEmails_(get(r, 'd', 'expertEmail')),
      submitterEmails: parseEmails_(get(r, 'd', 'submitterEmail')),
      approvedDate,
      startDate,
      endDate,
      status
    });
  });
  return { sheet, headerRow, headers, col, records };
}

/** แยกอีเมลจากเซลล์ (คั่นด้วย , ; ช่องว่าง หรือขึ้นบรรทัดใหม่) เก็บเฉพาะที่รูปแบบถูกต้อง */
function parseEmails_(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map(e => e.trim())
    .filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

/** แปลงวันที่เป็นข้อความภาษาไทย (พ.ศ.) */
function thaiDate_(d) {
  if (!d) return '-';
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

/** วันที่แบบตัวเลข พ.ศ. เช่น 7/10/2574 */
function thaiNumericDate_(d) {
  return d.getDate() + '/' + (d.getMonth() + 1) + '/' + (d.getFullYear() + 543);
}

/**
 * เรียกจากหน้าเว็บ: คืนรายชื่อทั้งหมด (แปลง Date เป็นข้อความ เพราะ google.script.run ส่ง Date ไม่ได้)
 */
function getExperts() {
  const { records } = readExperts_();
  return {
    warnDays: CONFIG.WARN_DAYS,
    termYears: CONFIG.TERM_YEARS,
    generatedAt: thaiDate_(new Date()),
    records: records.map(r => ({
      name: r.name,
      key: r.key,
      dept: r.dept,
      program: r.program,
      duty: r.duty,
      expertise: r.expertise,
      startText: r.startText,
      endText: r.endText,
      endThai: thaiDate_(r.endDate),
      approvedThai: r.approvedDate ? thaiDate_(r.approvedDate) : '',
      expertEmails: r.expertEmails.join(', '),
      submitterEmails: r.submitterEmails.join(', '),
      approval: r.approval,
      status: r.status.code,
      statusLabel: r.status.label,
      daysLeft: r.status.daysLeft
    }))
  };
}

/** หาคอลัมน์ตามชื่อหัวตาราง ถ้าไม่มีให้สร้างต่อท้าย คืนเลขคอลัมน์ (1-based) */
function ensureColumn_(sheet, headerRow, headers, title) {
  const idx = headers.indexOf(title);
  if (idx !== -1) return idx + 1;
  const colNum = sheet.getLastColumn() + 1;
  sheet.getRange(headerRow, colNum).setValue(title).setFontWeight('bold');
  headers.push(title);
  return colNum;
}

/** เขียนสถานะ/วันครบวาระ/วันคงเหลือ กลับลงชีต (เฉพาะ 3 คอลัมน์ที่ระบบสร้าง) */
function writeBackStatus_(sheet, headerRow, headers, records) {
  if (!records.length) return;
  const statusCol = ensureColumn_(sheet, headerRow, headers, CONFIG.STATUS_COLUMN);
  const endCol = ensureColumn_(sheet, headerRow, headers, CONFIG.END_DATE_COLUMN);
  const daysCol = ensureColumn_(sheet, headerRow, headers, CONFIG.DAYS_LEFT_COLUMN);

  const firstRow = headerRow + 1;
  const n = sheet.getLastRow() - headerRow;
  const status = Array.from({ length: n }, () => ['']);
  const ends = Array.from({ length: n }, () => ['']);
  const days = Array.from({ length: n }, () => ['']);

  records.forEach(r => {
    const i = r.row - firstRow;
    status[i][0] = r.status.label;
    ends[i][0] = r.endDate ? thaiNumericDate_(r.endDate) : '';
    days[i][0] = r.status.daysLeft == null ? '' : r.status.daysLeft;
  });

  sheet.getRange(firstRow, statusCol, n, 1).setValues(status);
  sheet.getRange(firstRow, endCol, n, 1).setNumberFormat('@').setValues(ends);
  sheet.getRange(firstRow, daysCol, n, 1).setValues(days);
}

function getAlertLogSheet_() {
  const ss = getSpreadsheet_();
  let log = ss.getSheetByName(CONFIG.ALERT_LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(CONFIG.ALERT_LOG_SHEET);
    log.appendRow(['เวลาที่ส่ง', 'Key', 'ชื่อ-นามสกุล', 'วันครบวาระ', 'ระดับแจ้งเตือน (วัน)', 'เหลือ (วัน)', 'ส่งรายบุคคลถึง']);
    log.getRange(1, 1, 1, 7).setFontWeight('bold');
    log.setFrozenRows(1);
  }
  return log;
}

/**
 * ตรวจสอบวาระทุกวัน (ตั้งเวลาด้วย setupDailyTrigger) และส่งอีเมลแจ้งเตือน
 * แต่ละรายจะได้รับแจ้งครั้งเดียวต่อระดับใน ALERT_THRESHOLDS (เช่น 180 / 90 / 30 / 0 วัน)
 */
function checkExpiryAndNotify() {
  const { sheet, headerRow, headers, records } = readExperts_();
  if (CONFIG.WRITE_BACK_STATUS) writeBackStatus_(sheet, headerRow, headers, records);

  const log = getAlertLogSheet_();
  const sent = new Set(
    log.getLastRow() > 1 ? log.getRange(2, 2, log.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : []
  );
  const tz = Session.getScriptTimeZone();
  const thresholds = CONFIG.ALERT_THRESHOLDS.slice().sort((a, b) => b - a);

  const due = [];
  const newLogs = [];
  records.forEach(r => {
    const d = r.status.daysLeft;
    if (d == null || r.status.code === 'pending') return;
    const endIso = Utilities.formatDate(r.endDate, tz, 'yyyy-MM-dd');
    const crossed = thresholds.filter(t => d <= t);
    const fresh = crossed.filter(t => !sent.has(r.key + '|' + endIso + '|' + t));
    if (!fresh.length) return;

    const level = Math.min.apply(null, crossed);
    const sentTo = sendIndividualEmail_(r);
    due.push({ r, level, sentTo });
    fresh.forEach(t => {
      const key = r.key + '|' + endIso + '|' + t;
      sent.add(key);
      newLogs.push([new Date(), key, r.name, r.endDate, t, d, sentTo]);
    });
  });

  if (!due.length) return 0;

  sendAlertEmail_(due);
  log.getRange(log.getLastRow() + 1, 1, newLogs.length, 7).setValues(newLogs);
  return due.length;
}

/**
 * ส่งอีเมลถึงผู้ได้รับแต่งตั้ง (To) และผู้ยื่น (CC) ของรายการนั้น
 * คืนข้อความสรุปผู้รับ (หรือเหตุผลที่ไม่ส่ง) เพื่อบันทึกใน AlertLog
 */
function sendIndividualEmail_(r) {
  const d = r.status.daysLeft;
  if (d < -CONFIG.INDIVIDUAL_MAX_OVERDUE_DAYS) return 'ไม่ส่ง (ครบวาระนานแล้ว)';

  let to = CONFIG.NOTIFY_EXPERT ? r.expertEmails.slice() : [];
  let cc = CONFIG.NOTIFY_SUBMITTER ? r.submitterEmails.filter(e => to.indexOf(e) === -1) : [];
  if (!to.length) { to = cc; cc = []; }
  if (!to.length) return 'ไม่มีอีเมล';
  if (MailApp.getRemainingDailyQuota() < 1) return 'ไม่ส่ง (เกินโควตาอีเมลวันนี้)';

  const when = d < 0
    ? 'ได้ครบวาระแล้วเมื่อวันที่ <b>' + thaiDate_(r.endDate) + '</b>'
    : d === 0
      ? 'จะครบวาระใน<b>วันนี้</b> (' + thaiDate_(r.endDate) + ')'
      : 'จะครบวาระในวันที่ <b>' + thaiDate_(r.endDate) + '</b> (อีก ' + d + ' วัน)';
  const since = r.approvedDate ? thaiDate_(r.approvedDate) : (r.startText || '-');

  const html =
    '<div style="font-family:Sarabun,Tahoma,sans-serif;font-size:15px;line-height:1.7">' +
    '<p>เรียน ' + escapeHtml_(r.name) + '</p>' +
    '<p>ตามที่ท่านได้รับการแต่งตั้งเป็น<b>ผู้มีความรู้ความเชี่ยวชาญและประสบการณ์สูง</b> (GRAS.02)</p>' +
    '<table style="border-collapse:collapse;margin:8px 0">' +
    [['หลักสูตร', r.program], ['เสนอจาก', r.dept], ['ความเชี่ยวชาญ', r.expertise],
     ['วันที่ได้รับอนุมัติ', since], ['วาระ', CONFIG.TERM_YEARS + ' ปี']]
      .filter(x => x[1])
      .map(x => '<tr><td style="padding:2px 12px 2px 0;color:#64748b">' + x[0] + '</td><td>' + escapeHtml_(x[1]) + '</td></tr>')
      .join('') +
    '</table>' +
    '<p>การแต่งตั้งดังกล่าว' + when + '</p>' +
    '<p>หากประสงค์จะให้ดำเนินการต่อ กรุณายื่นเสนอแต่งตั้ง (GRAS.02) วาระใหม่</p>' +
    '<p style="color:#94a3b8;font-size:12px">อีเมลฉบับนี้ส่งจากระบบแจ้งเตือนอัตโนมัติ</p></div>';

  const options = {
    to: to.join(','),
    subject: '[GRAS.02] แจ้งเตือนวาระการแต่งตั้ง — ' + r.name,
    htmlBody: html
  };
  if (cc.length) options.cc = cc.join(',');
  if (CONFIG.ALERT_EMAILS.length) options.replyTo = CONFIG.ALERT_EMAILS[0];

  try {
    MailApp.sendEmail(options);
    return to.concat(cc).join(', ');
  } catch (e) {
    return 'ส่งไม่สำเร็จ: ' + e.message;
  }
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sendAlertEmail_(due) {
  due.sort((a, b) => a.r.status.daysLeft - b.r.status.daysLeft);
  const expired = due.filter(x => x.r.status.daysLeft < 0).length;

  const rows = due.map(({ r, sentTo }) => {
    const d = r.status.daysLeft;
    const color = d < 0 ? '#e11d48' : d <= 30 ? '#ea580c' : '#ca8a04';
    const left = d < 0 ? 'เกินมา ' + Math.abs(d) + ' วัน' : d === 0 ? 'ครบวาระวันนี้' : 'เหลือ ' + d + ' วัน';
    return '<tr>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + escapeHtml_(r.name) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + escapeHtml_(r.dept) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + escapeHtml_(r.program) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + escapeHtml_(r.approvedDate ? thaiDate_(r.approvedDate) : r.startText) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + thaiDate_(r.endDate) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0;color:' + color + ';font-weight:bold">' + left + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0;font-size:12px">' + escapeHtml_(sentTo) + '</td>' +
      '</tr>';
  }).join('');

  let html =
    '<div style="font-family:Sarabun,Tahoma,sans-serif">' +
    '<h2 style="color:#4f46e5">แจ้งเตือนวาระผู้มีความรู้ความเชี่ยวชาญและประสบการณ์สูง (GRAS.02)</h2>' +
    '<p>มีผู้ที่ใกล้ครบ/ครบวาระ ' + CONFIG.TERM_YEARS + ' ปี จำนวน <b>' + due.length + '</b> ราย' +
    (expired ? ' (ครบวาระแล้ว ' + expired + ' ราย)' : '') + ' กรุณาพิจารณาเสนอแต่งตั้งใหม่</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' +
    '<tr style="background:#eef2ff">' +
    ['ชื่อ-นามสกุล', 'เสนอจาก', 'หลักสูตร', 'วันที่อนุมัติ/แต่งตั้ง', 'วันครบวาระ', 'สถานะ', 'แจ้งรายบุคคลถึง']
      .map(h => '<th style="padding:6px;border:1px solid #e2e8f0;text-align:left">' + h + '</th>').join('') +
    '</tr>' + rows + '</table>';

  const url = ScriptApp.getService().getUrl();
  if (url) html += '<p><a href="' + url + '">เปิดระบบตรวจสอบ</a></p>';
  html += '</div>';

  const to = (CONFIG.ALERT_EMAILS.length ? CONFIG.ALERT_EMAILS : [Session.getEffectiveUser().getEmail()]).join(',');
  MailApp.sendEmail({
    to,
    subject: '[GRAS.02] แจ้งเตือนครบวาระ ' + CONFIG.TERM_YEARS + ' ปี — ' + due.length + ' ราย',
    htmlBody: html
  });
}

/**
 * รันจากหน้า Editor เพื่อตรวจการตั้งค่า (อ่านอย่างเดียว: ไม่ส่งอีเมล ไม่เขียนชีต)
 * ดูผลที่ "บันทึกการดำเนินการ" ด้านล่างหน้าจอ
 */
function testSetup() {
  const lines = [];
  const ss = getSpreadsheet_();
  lines.push('✅ ไฟล์ชีต: ' + ss.getName());
  lines.push('   แท็บทั้งหมด: ' + ss.getSheets().map(sh => sh.getName()).join(', '));

  const { sheet, headerRow, headers, col, records } = readExperts_();
  lines.push('✅ แท็บรายชื่อ: "' + sheet.getName() + '" (หัวตารางแถวที่ ' + headerRow + ')');
  Object.keys(col).forEach(f => {
    lines.push('   ' + (col[f] === -1 ? '— ' : '✓ ') + f + ': ' +
      (col[f] === -1 ? 'ไม่พบ (' + CONFIG.COLUMNS[f][0] + ')' : '"' + headers[col[f]] + '"'));
  });

  const count = s => records.filter(r => r.status.code === s).length;
  lines.push('✅ อ่านได้ ' + records.length + ' แถว: Active ' + count('active') + ', ใกล้ครบวาระ ' + count('expiring') +
    ', ครบวาระแล้ว ' + count('expired') + ', รอพิจารณา ' + count('pending') + ', ไม่ทราบวัน ' + count('unknown'));
  records.slice(0, 3).forEach(r => lines.push('   ตัวอย่าง: ' + r.name + ' → ครบวาระ ' + thaiDate_(r.endDate) +
    ' (' + r.status.label + (r.status.daysLeft != null ? ', เหลือ ' + r.status.daysLeft + ' วัน' : '') + ')'));
  lines.push('✅ อีเมลสรุปจะส่งถึง: ' +
    (CONFIG.ALERT_EMAILS.length ? CONFIG.ALERT_EMAILS.join(', ') : Session.getEffectiveUser().getEmail()));
  lines.push('ถ้าถูกต้องแล้ว ให้รัน setupDailyTrigger ต่อได้เลย');

  const text = lines.join('\n');
  console.log(text);
  return text;
}

/** รันครั้งเดียวจากหน้า Editor: ตั้งเวลาตรวจสอบและแจ้งเตือนอัตโนมัติทุกวัน */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'checkExpiryAndNotify')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('checkExpiryAndNotify')
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.ALERT_HOUR)
    .create();

  return checkExpiryAndNotify();
}

// =====================================================================
// หน้าเว็บ และฟอร์มแจ้งอาจารย์ (บันทึกลงแท็บ "แจ้งอาจารย์" — ระบบสร้างให้เอง)
// =====================================================================

const SHEET_NAME = 'แจ้งอาจารย์';
const HEADERS = ['เวลาที่บันทึก', 'วันที่', 'ชื่อ-นามสกุล', 'รายละเอียด / หมายเหตุ', 'จำนวนเงิน'];

/** แสดงหน้าเว็บ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบ GRAS.02')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** คืนค่าแท็บฟอร์มแจ้งอาจารย์ และสร้างแถวหัวตารางหากยังไม่มี */
function getSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#4f46e5')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** ป้องกันการแทรกสูตร (formula injection) เมื่อข้อความขึ้นต้นด้วย = + - @ */
function safeText_(value) {
  const text = String(value == null ? '' : value).trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

/**
 * บันทึกข้อมูลลงแถวถัดไปของแท็บฟอร์มแจ้งอาจารย์
 * @param {{date: string, name: string, details: string, amount: string|number}} form
 */
function saveData(form) {
  if (!form || !String(form.name || '').trim()) {
    throw new Error('กรุณากรอกชื่อ-นามสกุล');
  }

  let amount = '';
  if (form.amount !== '' && form.amount != null) {
    amount = Number(form.amount);
    if (isNaN(amount)) throw new Error('จำนวนเงินต้องเป็นตัวเลข');
  }

  const tz = Session.getScriptTimeZone();
  const date = form.date || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    sheet.appendRow([
      new Date(),
      date,
      safeText_(form.name),
      safeText_(form.details),
      amount
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return { success: true, message: 'บันทึกข้อมูลสำเร็จ' };
}

/**
 * ดึงข้อมูลทั้งหมด (ใหม่สุดอยู่บน)
 * แปลง Date เป็นข้อความก่อนส่ง เพราะ google.script.run ส่ง Date object กลับไม่ได้
 */
function getData() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const tz = Session.getScriptTimeZone();
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  const fmt = (v, pattern) =>
    v instanceof Date ? Utilities.formatDate(v, tz, pattern) : String(v);

  return values
    .filter(row => row.some(cell => cell !== ''))
    .map(row => ({
      timestamp: fmt(row[0], 'yyyy-MM-dd HH:mm:ss'),
      date: fmt(row[1], 'yyyy-MM-dd'),
      name: String(row[2]),
      details: String(row[3]),
      amount: row[4] === '' ? '' : Number(row[4])
    }))
    .reverse();
}
