/**
 * ระบบ GRAS.02 — การแต่งตั้งผู้มีความรู้ความเชี่ยวชาญและประสบการณ์สูง
 * 1) ตรวจสอบซ้ำก่อนเสนอแต่งตั้ง  2) สถานะ/แจ้งเตือนครบวาระ 5 ปีอัตโนมัติ  3) ฟอร์มแจ้งอาจารย์
 *
 * วิธีใช้: วางไฟล์นี้ใน Code.gs และสร้างไฟล์ HTML ชื่อ Index
 * แก้เฉพาะส่วน "ตั้งค่า" (CONFIG) ด้านล่าง แล้วรันฟังก์ชัน setupDailyTrigger 1 ครั้ง
 */

// =====================================================================
// ตั้งค่า (แก้เฉพาะส่วนนี้)
// =====================================================================
const CONFIG = {
  // ----- แหล่งข้อมูลรายชื่อผู้มีความรู้ความเชี่ยวชาญฯ -----
  // ID ของ Spreadsheet (ส่วนระหว่าง /d/ และ /edit ใน URL) เว้นว่าง = ใช้ไฟล์ที่ผูกกับสคริปต์นี้
  EXPERT_SPREADSHEET_ID: '',
  // ชื่อแผ่นงานที่มีรายชื่อ + ภาคการศึกษาที่ได้รับแต่งตั้ง/สิ้นสุด
  EXPERT_SHEET_NAME: 'Experts',
  // แถวที่เป็นหัวตาราง
  HEADER_ROW: 1,

  // คำที่ใช้หาคอลัมน์จากหัวตาราง (ไล่ตามลำดับ ใช้คอลัมน์แรกที่หัวตารางมีคำนั้น)
  // ถ้าหัวตารางในชีตใช้คำอื่น ให้เพิ่มคำเข้าไปในรายการ
  COLUMNS: {
    name:      ['ชื่อ-นามสกุล', 'ชื่อ - นามสกุล', 'ชื่อ'],
    dept:      ['เสนอจาก', 'ส่วนงาน'],
    program:   ['หลักสูตร'],
    duty:      ['ปฏิบัติหน้าที่'],
    expertise: ['ความเชี่ยวชาญ'],
    start:     ['ได้รับแต่งตั้ง', 'วันที่แต่งตั้ง', 'เริ่ม'],
    end:       ['สิ้นสุด', 'หมดวาระ', 'หมดอายุ'],
    approval:  ['สถานะการแต่งตั้ง']
  },

  // ----- กฎวาระการแต่งตั้ง -----
  TERM_YEARS: 5,          // ใช้คำนวณวันสิ้นสุดเมื่อคอลัมน์ "สิ้นสุด" ว่าง
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
  // อีเมลผู้รับ (หลายคนได้) เว้นว่าง = ส่งถึงเจ้าของสคริปต์
  ALERT_EMAILS: [],
  // ส่งแจ้งเตือนเมื่อเหลือ <= กี่วัน (แต่ละรายจะได้แจ้งเตือนครั้งเดียวต่อระดับ) 0 = ครบวาระแล้ว
  ALERT_THRESHOLDS: [180, 90, 30, 0],
  ALERT_HOUR: 8,          // เวลาที่ตรวจสอบทุกวัน (ชั่วโมง ตามเขตเวลาของสคริปต์)
  ALERT_LOG_SHEET: 'AlertLog',

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
  if (value instanceof Date && !isNaN(value)) return midnight_(value);
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

function openExpertSheet_() {
  const ss = CONFIG.EXPERT_SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.EXPERT_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.EXPERT_SHEET_NAME);
  if (!sheet) {
    throw new Error('ไม่พบแผ่นงาน "' + CONFIG.EXPERT_SHEET_NAME + '" — ตั้งค่า EXPERT_SHEET_NAME ในส่วน CONFIG ด้านบนของ Code.gs');
  }
  return sheet;
}

/** หา index คอลัมน์ (0-based) จากหัวตาราง ตามคำใน CONFIG.COLUMNS */
function mapColumns_(headers) {
  const own = [CONFIG.STATUS_COLUMN, CONFIG.DAYS_LEFT_COLUMN, CONFIG.END_DATE_COLUMN];
  const map = {};
  Object.keys(CONFIG.COLUMNS).forEach(field => {
    map[field] = -1;
    for (const kw of CONFIG.COLUMNS[field]) {
      const idx = headers.findIndex(h => h && own.indexOf(h) === -1 && h.indexOf(kw) !== -1);
      if (idx !== -1) { map[field] = idx; break; }
    }
  });
  if (map.name === -1) throw new Error('ไม่พบคอลัมน์ชื่อ — ตรวจสอบ CONFIG.COLUMNS.name');
  if (map.start === -1 && map.end === -1) {
    throw new Error('ไม่พบคอลัมน์ "ได้รับแต่งตั้ง" หรือ "สิ้นสุด" — ตรวจสอบ CONFIG.COLUMNS');
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
  const sheet = openExpertSheet_();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getDisplayValues()[0].map(h => h.trim());
  const col = mapColumns_(headers);
  if (lastRow <= CONFIG.HEADER_ROW) return { sheet, headers, records: [] };

  const range = sheet.getRange(CONFIG.HEADER_ROW + 1, 1, lastRow - CONFIG.HEADER_ROW, lastCol);
  const values = range.getValues();
  const display = range.getDisplayValues();
  const today = midnight_(new Date());

  const get = (r, i, f) => (col[f] === -1 ? '' : (i === 'd' ? display : values)[r][col[f]]);

  const records = [];
  values.forEach((row, r) => {
    const name = String(get(r, 'd', 'name')).trim();
    if (!name) return;

    const startDate = col.start === -1 ? null : parseTermDate_(values[r][col.start], 'start');
    let endDate = col.end === -1 ? null : parseTermDate_(values[r][col.end], 'end');
    if (!endDate && startDate) {
      endDate = new Date(startDate.getFullYear() + CONFIG.TERM_YEARS, startDate.getMonth(), startDate.getDate() - 1);
    }
    const status = computeStatus_(get(r, 'd', 'approval'), endDate, today);

    records.push({
      row: CONFIG.HEADER_ROW + 1 + r,
      name,
      key: normalizeName(name),
      dept: String(get(r, 'd', 'dept')),
      program: String(get(r, 'd', 'program')),
      duty: String(get(r, 'd', 'duty')),
      expertise: String(get(r, 'd', 'expertise')),
      startText: String(get(r, 'd', 'start')),
      endText: String(get(r, 'd', 'end')),
      approval: String(get(r, 'd', 'approval')),
      startDate,
      endDate,
      status
    });
  });
  return { sheet, headers, records };
}

/** แปลงวันที่เป็นข้อความภาษาไทย (พ.ศ.) */
function thaiDate_(d) {
  if (!d) return '-';
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543);
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
      approval: r.approval,
      status: r.status.code,
      statusLabel: r.status.label,
      daysLeft: r.status.daysLeft
    }))
  };
}

/** หาคอลัมน์ตามชื่อหัวตาราง ถ้าไม่มีให้สร้างต่อท้าย คืนเลขคอลัมน์ (1-based) */
function ensureColumn_(sheet, headers, title) {
  const idx = headers.indexOf(title);
  if (idx !== -1) return idx + 1;
  const colNum = sheet.getLastColumn() + 1;
  sheet.getRange(CONFIG.HEADER_ROW, colNum).setValue(title).setFontWeight('bold');
  headers.push(title);
  return colNum;
}

/** เขียนสถานะ/วันครบวาระ/วันคงเหลือ กลับลงชีต (เฉพาะ 3 คอลัมน์ที่ระบบสร้าง) */
function writeBackStatus_(sheet, headers, records) {
  if (!records.length) return;
  const statusCol = ensureColumn_(sheet, headers, CONFIG.STATUS_COLUMN);
  const endCol = ensureColumn_(sheet, headers, CONFIG.END_DATE_COLUMN);
  const daysCol = ensureColumn_(sheet, headers, CONFIG.DAYS_LEFT_COLUMN);

  const firstRow = CONFIG.HEADER_ROW + 1;
  const n = sheet.getLastRow() - CONFIG.HEADER_ROW;
  const status = Array.from({ length: n }, () => ['']);
  const ends = Array.from({ length: n }, () => ['']);
  const days = Array.from({ length: n }, () => ['']);

  records.forEach(r => {
    const i = r.row - firstRow;
    status[i][0] = r.status.label;
    ends[i][0] = r.endDate || '';
    days[i][0] = r.status.daysLeft == null ? '' : r.status.daysLeft;
  });

  sheet.getRange(firstRow, statusCol, n, 1).setValues(status);
  sheet.getRange(firstRow, endCol, n, 1).setValues(ends).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(firstRow, daysCol, n, 1).setValues(days);
}

function getAlertLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let log = ss.getSheetByName(CONFIG.ALERT_LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(CONFIG.ALERT_LOG_SHEET);
    log.appendRow(['เวลาที่ส่ง', 'Key', 'ชื่อ-นามสกุล', 'วันครบวาระ', 'ระดับแจ้งเตือน (วัน)', 'เหลือ (วัน)']);
    log.getRange(1, 1, 1, 6).setFontWeight('bold');
    log.setFrozenRows(1);
  }
  return log;
}

/**
 * ตรวจสอบวาระทุกวัน (ตั้งเวลาด้วย setupDailyTrigger) และส่งอีเมลแจ้งเตือน
 * แต่ละรายจะได้รับแจ้งครั้งเดียวต่อระดับใน ALERT_THRESHOLDS (เช่น 180 / 90 / 30 / 0 วัน)
 */
function checkExpiryAndNotify() {
  const { sheet, headers, records } = readExperts_();
  if (CONFIG.WRITE_BACK_STATUS) writeBackStatus_(sheet, headers, records);

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
    due.push({ r, level });
    fresh.forEach(t => {
      const key = r.key + '|' + endIso + '|' + t;
      sent.add(key);
      newLogs.push([new Date(), key, r.name, r.endDate, t, d]);
    });
  });

  if (!due.length) return 0;

  sendAlertEmail_(due);
  log.getRange(log.getLastRow() + 1, 1, newLogs.length, 6).setValues(newLogs);
  return due.length;
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sendAlertEmail_(due) {
  due.sort((a, b) => a.r.status.daysLeft - b.r.status.daysLeft);
  const expired = due.filter(x => x.r.status.daysLeft < 0).length;

  const rows = due.map(({ r }) => {
    const d = r.status.daysLeft;
    const color = d < 0 ? '#e11d48' : d <= 30 ? '#ea580c' : '#ca8a04';
    const left = d < 0 ? 'เกินมา ' + Math.abs(d) + ' วัน' : d === 0 ? 'ครบวาระวันนี้' : 'เหลือ ' + d + ' วัน';
    return '<tr>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + escapeHtml_(r.name) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + escapeHtml_(r.dept) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + escapeHtml_(r.program) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + escapeHtml_(r.startText) + ' – ' + escapeHtml_(r.endText) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0">' + thaiDate_(r.endDate) + '</td>' +
      '<td style="padding:6px;border:1px solid #e2e8f0;color:' + color + ';font-weight:bold">' + left + '</td>' +
      '</tr>';
  }).join('');

  let html =
    '<div style="font-family:Sarabun,Tahoma,sans-serif">' +
    '<h2 style="color:#4f46e5">แจ้งเตือนวาระผู้มีความรู้ความเชี่ยวชาญและประสบการณ์สูง (GRAS.02)</h2>' +
    '<p>มีผู้ที่ใกล้ครบ/ครบวาระ ' + CONFIG.TERM_YEARS + ' ปี จำนวน <b>' + due.length + '</b> ราย' +
    (expired ? ' (ครบวาระแล้ว ' + expired + ' ราย)' : '') + ' กรุณาพิจารณาเสนอแต่งตั้งใหม่</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' +
    '<tr style="background:#eef2ff">' +
    ['ชื่อ-นามสกุล', 'เสนอจาก', 'หลักสูตร', 'วาระ', 'วันครบวาระ', 'สถานะ']
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
// หน้าเว็บ และฟอร์มแจ้งอาจารย์ (บันทึกลงแผ่นงาน Sheet1)
// =====================================================================

const SHEET_NAME = 'Sheet1';
const HEADERS = ['เวลาที่บันทึก', 'วันที่', 'ชื่อ-นามสกุล', 'รายละเอียด / หมายเหตุ', 'จำนวนเงิน'];

/** แสดงหน้าเว็บ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบ GRAS.02')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** คืนค่า Sheet1 และสร้างแถวหัวตารางหากยังไม่มี */
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
 * บันทึกข้อมูลลงแถวถัดไปของ Sheet1
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
