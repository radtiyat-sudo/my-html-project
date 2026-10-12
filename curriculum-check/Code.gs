/**
 * ระบบตรวจโครงสร้างหลักสูตร (Google Apps Script)
 * - อัปโหลดเล่มหลักสูตร (มคอ.2) → ระบบอ่านรหัสวิชาว่าอยู่หมวดใด แล้วบันทึกเก็บไว้ใช้ซ้ำ
 * - อัปโหลดไฟล์ผลการเรียนนักศึกษา (PDF / Excel / CSV ได้หลายคนพร้อมกัน) → ตรวจว่าเรียนครบตามเล่มหรือขาดวิชาใด
 *   คำนวณหน่วยกิต ปรับพื้นฐาน/แกน/บังคับ/เลือก/วิทยานิพนธ์ (เรียน/โอน)
 * การอ่านไฟล์ทำในเบราว์เซอร์ (pdf.js / SheetJS) ฝั่งเซิร์ฟเวอร์ทำหน้าที่เก็บข้อมูลใน Google Sheet
 */

var SHEET_CURR = 'หลักสูตร';
var SHEET_COURSE = 'รายวิชาในหลักสูตร';
var SHEET_RESULT = 'ผลการตรวจ';
var CATS = ['ปรับพื้นฐาน', 'แกน', 'บังคับ', 'เลือก', 'วิทยานิพนธ์/สารนิพนธ์'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบตรวจโครงสร้างหลักสูตร')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- Spreadsheet ---------- */
function getSS_() {
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (active) return active;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SS_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  var ss = SpreadsheetApp.create('ฐานข้อมูล ระบบตรวจโครงสร้างหลักสูตร');
  props.setProperty('SS_ID', ss.getId());
  return ss;
}

function sheet_(name, headers) {
  var ss = getSS_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
    var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1');
    if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  }
  return sh;
}
function currSheet_() { return sheet_(SHEET_CURR, ['id', 'รหัสหลักสูตร', 'ชื่อหลักสูตร', 'หน่วยกิตรวม', 'หมวดวิชา (JSON)', 'บันทึกเมื่อ', 'ผู้บันทึก']); }
function courseSheet_() { return sheet_(SHEET_COURSE, ['id หลักสูตร', 'รหัสวิชา', 'ชื่อวิชา', 'หน่วยกิต', 'หมวดในเล่ม', 'หมวดในแบบฟอร์ม']); }
function resultSheet_() {
  var h = ['บันทึกเมื่อ', 'ผู้ตรวจ', 'รหัสนักศึกษา', 'ชื่อ-สกุล', 'หลักสูตร'];
  CATS.forEach(function (c) { h.push(c + ' (เกณฑ์)', c + ' (เรียน)', c + ' (โอน)'); });
  h.push('รวม (เกณฑ์)', 'รวม (เรียน)', 'รวม (โอน)', 'สถานะ', 'หมายเหตุ', 'รายละเอียด (JSON)');
  return sheet_(SHEET_RESULT, h);
}

function getSpreadsheetUrl() { return getSS_().getUrl(); }

/* ---------- อ่านตัวอักษรจากรูปภาพ (OCR) ---------- */
// ใช้ OCR ของ Google Drive (อ่านภาษาไทยได้ดี) — ต้องเปิดบริการ Drive API ใน Apps Script: บริการ ＋ → Drive API → เพิ่ม
function ocrImage(b64, mime, name) {
  if (typeof Drive === 'undefined') {
    throw new Error('ยังไม่ได้เปิดบริการ Drive API — ใน Apps Script กด "บริการ ＋" เลือก Drive API กด "เพิ่ม" แล้ว Deploy เวอร์ชันใหม่');
  }
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime || 'image/png', name || 'image.png');
  var file = typeof Drive.Files.create === 'function'
    ? Drive.Files.create({ name: 'ocr-tmp', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'th' })   // Drive API v3
    : Drive.Files.insert({ title: 'ocr-tmp', mimeType: blob.getContentType() }, blob, { ocr: true, ocrLanguage: 'th' }); // Drive API v2
  try {
    return DocumentApp.openById(file.id).getBody().getText();
  } finally {
    try { DriveApp.getFileById(file.id).setTrashed(true); } catch (e) {}
  }
}

/* ---------- หลักสูตร ---------- */
function listCurricula() {
  var sh = currSheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 6).getValues().map(function (r) {
    return { id: String(r[0]), key: String(r[1]), name: String(r[2]), total: r[3], savedAt: r[5] ? Utilities.formatDate(new Date(r[5]), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') : '' };
  });
}

function getCurriculum(id) {
  var sh = currSheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) throw new Error('ไม่พบหลักสูตร');
  var rows = sh.getRange(2, 1, n, 5).getValues();
  var row = rows.filter(function (r) { return String(r[0]) === String(id); })[0];
  if (!row) throw new Error('ไม่พบหลักสูตร id ' + id);
  var cs = courseSheet_();
  var m = cs.getLastRow() - 1;
  var courses = m < 1 ? [] : cs.getRange(2, 1, m, 6).getValues()
    .filter(function (r) { return String(r[0]) === String(id); })
    .map(function (r) { return { code: String(r[1]), nameEn: String(r[2]), credits: r[3] === '' ? null : Number(r[3]), group: String(r[4]), cat: String(r[5]) }; });
  // หมวดวิชา (JSON): รุ่นเก่าเป็น array ของหมวด รุ่นใหม่เป็น { groups, plans, totalByPlan } (เกณฑ์แยกตามแผน)
  var info = {};
  try { info = JSON.parse(row[4] || '[]'); } catch (e) {}
  if (Array.isArray(info)) info = { groups: info };
  return { id: String(row[0]), key: String(row[1]), name: String(row[2]), totalRequired: row[3] === '' ? null : Number(row[3]),
    groups: info.groups || [], plans: info.plans || [], totalByPlan: info.totalByPlan || {}, courses: courses };
}

function saveCurriculum(c) {
  if (!c || !c.name) throw new Error('กรุณาระบุชื่อหลักสูตร');
  if (!c.courses || !c.courses.length) throw new Error('ไม่มีรายวิชาให้บันทึก');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var id = c.id || Utilities.getUuid().slice(0, 8);
    if (c.id) removeCurriculumRows_(c.id);
    currSheet_().appendRow([id, c.key || '', c.name, c.totalRequired || '', JSON.stringify({ groups: c.groups || [], plans: c.plans || [], totalByPlan: c.totalByPlan || {} }), new Date(), Session.getActiveUser().getEmail() || '']);
    var rows = c.courses.map(function (x) { return [id, x.code, x.nameEn || '', x.credits == null ? '' : x.credits, x.group || '', x.cat || '']; });
    var cs = courseSheet_();
    cs.getRange(cs.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    return id;
  } finally { lock.releaseLock(); }
}

function deleteCurriculum(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { removeCurriculumRows_(id); return true; } finally { lock.releaseLock(); }
}

function removeCurriculumRows_(id) {
  [currSheet_(), courseSheet_()].forEach(function (sh) {
    var n = sh.getLastRow() - 1;
    if (n < 1) return;
    var ids = sh.getRange(2, 1, n, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(id)) sh.deleteRow(i + 2);
  });
}

/* ---------- บันทึกผลการตรวจ ---------- */
function resultRow_(r, who) {
  var row = [new Date(), who, r.studentId || '', r.name || '', r.curriculumName || ''];
  CATS.forEach(function (c) { var s = (r.sum || {})[c] || {}; row.push(s.required || 0, s.study || 0, s.transfer || 0); });
  var t = r.total || {};
  row.push(t.required || 0, t.study || 0, t.transfer || 0, r.status || t.status || '', r.note || '', JSON.stringify({ courses: r.courses, missing: r.missing }).slice(0, 49000));
  return row;
}

// บันทึกผลหลายคนในครั้งเดียว
function saveResults(list) {
  if (!list || !list.length) return 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var who = Session.getActiveUser().getEmail() || '';
    var rows = list.map(function (r) { return resultRow_(r, who); });
    var sh = resultSheet_();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return rows.length;
  } finally { lock.releaseLock(); }
}

function saveResult(r) { return saveResults([r]) > 0; }
