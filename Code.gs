/**
 * ระบบแจ้งอาจารย์ — GRAS.02 การแต่งตั้งผู้มีความรู้ความเชี่ยวชาญและประสบการณ์สูง
 * Google Apps Script Web App: บันทึกและแสดงผลข้อมูลจาก Google Sheets
 */

const SHEET_NAME = 'Sheet1';
const HEADERS = ['เวลาที่บันทึก', 'วันที่', 'ชื่อ-นามสกุล', 'รายละเอียด / หมายเหตุ', 'จำนวนเงิน'];

/** แสดงหน้าเว็บ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('แจ้งอาจารย์ GRAS.02')
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
