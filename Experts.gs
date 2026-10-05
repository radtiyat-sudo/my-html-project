/**
 * รายชื่อผู้มีความรู้ความเชี่ยวชาญฯ: อ่านข้อมูล คำนวณสถานะวาระ 5 ปี ตรวจสอบซ้ำ และแจ้งเตือนอัตโนมัติ
 */

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
  let s = String(name || '').replace(/[​-‍﻿]/g, '').trim();
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
    throw new Error('ไม่พบแผ่นงาน "' + CONFIG.EXPERT_SHEET_NAME + '" — ตั้งค่า EXPERT_SHEET_NAME ใน Config.gs');
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
