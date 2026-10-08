/**
 * ระบบประเมิน PLO วิทยานิพนธ์ — Google Apps Script (Code.gs)
 * Backend = Google Sheets (สร้างให้อัตโนมัติ) / Frontend = index.html
 *
 * เริ่มต้นใช้งาน:
 *   1) รันฟังก์ชัน setup() หนึ่งครั้ง (อนุญาตสิทธิ์) เพื่อสร้างชีตและข้อมูลตั้งต้น
 *   2) (ไม่บังคับ) รัน seedSampleData() เพื่อสร้างนักศึกษาตัวอย่างไว้ลองใช้
 *   3) Deploy > New deployment > Web app
 *   4) (ไม่บังคับ) Project Settings > Script properties: ANTHROPIC_API_KEY เพื่อเปิดฟีเจอร์ AI
 */

var APP_TITLE = 'ระบบประเมิน PLOs วิทยานิพนธ์';

var SCHEMA = {
  Faculties: ['facultyId', 'name', 'order'],
  // evalMode = 'plo' (แบบเดิม: เกณฑ์ราย PLO) หรือ 'items' (หัวข้อการสอบวิทยานิพนธ์ที่เชื่อมหลาย PLO)
  // openStatus = สถานะการเปิดรับ (open|paused|closed|new), planIntake = แผนรับนักศึกษาต่อปี
  Programs: ['programId', 'facultyId', 'name', 'level', 'status', 'source', 'ploPass', 'overall', 'fraction', 'target', 'evalMode', 'openStatus', 'planIntake'],
  PLOs: ['programId', 'ploId', 'code', 'titleTh', 'textEn', 'weight', 'order'],
  // d1-d4 = คำอธิบายระดับแบบเก่า (1-4); bA-bE = คำอธิบาย 5 ช่วงคะแนนแบบใหม่ (A 9-10, B 7-8, C 5-6, D 3-4, E 0-2)
  Criteria: ['programId', 'ploId', 'critId', 'name', 'd1', 'd2', 'd3', 'd4', 'order', 'bA', 'bB', 'bC', 'bD', 'bE'],
  // workType = thesis (วิทยานิพนธ์) | thematic (สารนิพนธ์) | is (การค้นคว้าอิสระ), intakeYear = ปีที่เข้า (พ.ศ.), stage = ขั้นความคืบหน้า, examDate = วันสอบ
  Students: ['studentId', 'programId', 'name', 'topic', 'advisor', 'sample', 'code', 'workType', 'intakeYear', 'stage', 'examDate'],
  // Evals = หนึ่งแถวต่อกรรมการต่อนักศึกษา (ความเห็น); คะแนนรายเกณฑ์อยู่ในชีต Scores (อ่านง่าย 1 แถวต่อ 1 เกณฑ์)
  // role = บทบาทของผู้ประเมินในการสอบนักศึกษาคนนี้: chair (ประธานสอบ) | member (กรรมการสอบ) | advisor (อาจารย์ที่ปรึกษา)
  Evals: ['evalKey', 'programId', 'studentId', 'email', 'name', 'scoresJson', 'comment', 'updatedAt', 'role'],
  // level = คะแนน 0-10 เมื่อ scale = 10; แถวเก่าที่ไม่มี scale คือระดับ 1-4 (ระบบแปลงเป็นเต็ม 10 ให้ตอนอ่าน)
  Scores: ['evalKey', 'programId', 'studentId', 'studentCode', 'studentName', 'email', 'evaluator', 'ploCode', 'critId', 'critName', 'level', 'updatedAt', 'scale'],
  AI: ['studentId', 'programId', 'resultJson', 'updatedAt'],
  CrossAI: ['key', 'resultJson', 'updatedAt'],
  Users: ['email', 'name', 'role', 'programs'],
  // หัวข้อการประเมินวิทยานิพนธ์: 1 แถว/หัวข้อ, plos = รหัส PLO ที่สอดคล้อง คั่นด้วยจุลภาค (อย่างน้อย 2), bA-bE = เกณฑ์ 5 ช่วง
  // stdId = รหัสเกณฑ์กลางที่หัวข้อนี้มาจาก (ว่าง = หลักสูตรสร้างเอง)
  Items: ['programId', 'itemId', 'order', 'name', 'detail', 'plos', 'bA', 'bB', 'bC', 'bD', 'bE', 'stdId'],
  // เกณฑ์กลางของบัณฑิตวิทยาลัย: ทุกหลักสูตรใช้ชุดเดียวกัน แล้วจับคู่กับ PLOs ของตนเอง
  StdItems: ['itemId', 'order', 'name', 'detail', 'bA', 'bB', 'bC', 'bD', 'bE'],
  // ผลการสอบที่ประธานสอบสรุป: 1 แถว/นักศึกษา, decision = pass | pass_cond | fail
  Decisions: ['programId', 'studentId', 'decision', 'note', 'email', 'name', 'updatedAt']
};

var SAMPLE_EMAIL = 'sample@example.com';
var WORK_TYPES_ = ['thesis', 'thematic', 'is'];

/* เกณฑ์กลาง 5 ข้อเริ่มต้น (ผู้ดูแลแก้ได้ที่ จัดการระบบ > เกณฑ์กลาง) */
var STD_HINTS_ = [' (10 = โดดเด่นทุกด้าน, 9 = โดดเด่นเกือบทุกด้าน)', ' (8 = ครบและมั่นคง, 7 = ครบแต่ยังไม่สม่ำเสมอ)', ' (6 = ขาดเล็กน้อย, 5 = ขาดหลายจุด)', ' (4 = แก้ได้ตามคำแนะนำ, 3 = ขาดสาระสำคัญ)', ' (2 = มีบางส่วน, 1 = แทบไม่มี, 0 = ไม่มี)'];
var STD_DEFAULT_ = [
  ['ความสำคัญของปัญหาและการทบทวนวรรณกรรม', 'ความชัดเจนของปัญหาวิจัย วัตถุประสงค์ การสังเคราะห์งานที่เกี่ยวข้อง และกรอบแนวคิด', [
    'ระบุปัญหาและช่องว่างขององค์ความรู้ได้ชัดเจน สังเคราะห์วรรณกรรมที่ทันสมัยครบถ้วนเป็นกรอบแนวคิดที่สมเหตุสมผล',
    'ปัญหาและวัตถุประสงค์ชัดเจน ทบทวนวรรณกรรมครอบคลุมและเชื่อมโยงกับงานวิจัยของตน',
    'ปัญหาวิจัยพอเข้าใจ วรรณกรรมยังเป็นการสรุปรายเรื่อง เชื่อมโยงกับกรอบแนวคิดได้บางส่วน',
    'ปัญหาวิจัยไม่ชัด วรรณกรรมไม่เพียงพอหรือไม่ทันสมัย ต้องปรับปรุงมาก',
    'อธิบายปัญหาและที่มาของงานวิจัยไม่ได้ หรือไม่มีการทบทวนวรรณกรรม']],
  ['ระเบียบวิธีวิจัยและการดำเนินการวิจัย', 'ความเหมาะสมของรูปแบบการวิจัย เครื่องมือ การเก็บข้อมูล และความสามารถในการดำเนินการวิจัยด้วยตนเอง', [
    'ออกแบบวิธีวิจัยได้เหมาะสมและรัดกุม เครื่องมือมีคุณภาพ อธิบายเหตุผลและข้อจำกัดได้ดี ดำเนินการได้ด้วยตนเอง',
    'ระเบียบวิธีเหมาะสมกับคำถามวิจัย ขั้นตอนครบถ้วน ดำเนินการได้โดยมีคำแนะนำเล็กน้อย',
    'ระเบียบวิธีพอใช้ได้ แต่มีจุดอ่อนด้านการออกแบบ เครื่องมือ หรือการควบคุมตัวแปร',
    'ระเบียบวิธีมีข้อบกพร่องสำคัญที่กระทบความน่าเชื่อถือของผล ต้องพึ่งอาจารย์มาก',
    'อธิบายหรือดำเนินการตามระเบียบวิธีวิจัยไม่ได้']],
  ['การวิเคราะห์ข้อมูล การอภิปรายผล และข้อสรุป', 'ความถูกต้องของการวิเคราะห์ การแปลผล การอภิปรายเชื่อมโยงทฤษฎี และข้อเสนอแนะ', [
    'วิเคราะห์ถูกต้องเหมาะสม แปลผลแม่นยำ อภิปรายเชิงวิพากษ์เชื่อมโยงทฤษฎีและงานอื่นอย่างลึกซึ้ง ข้อสรุปมีหลักฐานรองรับ',
    'วิเคราะห์และแปลผลถูกต้อง อภิปรายเชื่อมโยงกับวรรณกรรมได้ ข้อสรุปตรงกับผล',
    'วิเคราะห์ถูกต้องเป็นส่วนใหญ่ แต่การอภิปรายเป็นการบรรยายผล ยังขาดการเชื่อมโยงหรือการวิพากษ์',
    'การวิเคราะห์หรือการแปลผลมีข้อผิดพลาดสำคัญ ข้อสรุปเกินกว่าข้อมูล',
    'วิเคราะห์ผิดวิธี หรือไม่มีการอภิปรายผล']],
  ['การเขียน การนำเสนอ และการตอบคำถาม', 'คุณภาพของเล่ม การใช้ภาษาและการอ้างอิง การนำเสนอด้วยวาจา และการตอบคำถามกรรมการ', [
    'เล่มเรียบเรียงดีเยี่ยม ภาษาและการอ้างอิงถูกต้องสมบูรณ์ นำเสนอชัดเจนกระชับ ตอบคำถามได้ลึกและตรงประเด็น',
    'เล่มถูกต้องตามรูปแบบ มีข้อผิดพลาดเล็กน้อย นำเสนอชัดเจน ตอบคำถามได้เป็นส่วนใหญ่',
    'เล่มมีข้อผิดพลาดด้านภาษาหรือรูปแบบหลายจุด นำเสนอพอเข้าใจ ตอบคำถามได้บางส่วน',
    'เล่มต้องแก้ไขมาก การนำเสนอไม่เป็นลำดับ ตอบคำถามไม่ตรงประเด็น',
    'เล่มไม่สมบูรณ์ หรือนำเสนอและตอบคำถามไม่ได้']],
  ['จริยธรรมการวิจัย ความรับผิดชอบ และการนำไปใช้ประโยชน์', 'การปฏิบัติตามจรรยาบรรณ ความซื่อสัตย์ทางวิชาการ การรับข้อเสนอแนะ และคุณค่าของผลงานต่อวิชาชีพหรือสังคม', [
    'ปฏิบัติตามจรรยาบรรณครบถ้วน อ้างอิงถูกต้อง รับข้อเสนอแนะและปรับปรุงได้ดีเยี่ยม ผลงานนำไปใช้ประโยชน์หรือเผยแพร่ได้',
    'ปฏิบัติตามจรรยาบรรณ รับผิดชอบงานตรงเวลา ผลงานมีประโยชน์ชัดเจน',
    'ปฏิบัติตามจรรยาบรรณ แต่มีความล่าช้าหรือการอ้างอิงบางส่วนไม่ครบ การนำไปใช้ยังไม่ชัด',
    'พบข้อบกพร่องด้านจรรยาบรรณหรือความรับผิดชอบที่ต้องแก้ไข',
    'พบการละเมิดจรรยาบรรณการวิจัยหรือความซื่อสัตย์ทางวิชาการ']]
];

/** เกณฑ์กลางปัจจุบัน (ถ้ายังไม่เคยบันทึก ใช้ชุดเริ่มต้น) */
function loadStd_() {
  var rows = readAll_('StdItems');
  if (!rows.length) return STD_DEFAULT_.map(function (d, i) {
    return { id: 'std' + (i + 1), name: d[0], detail: d[1], desc: d[2].map(function (t, bi) { return t + STD_HINTS_[bi]; }) };
  });
  rows.sort(function (a, b) { return num_(a.order, 0) - num_(b.order, 0); });
  return rows.map(function (r) { return { id: s_(r.itemId), name: s_(r.name), detail: s_(r.detail), desc: bandDesc_(r) }; });
}

/**
 * ผู้ดูแลบันทึกเกณฑ์กลาง (หลักสูตรที่ใช้อยู่จะได้ข้อความใหม่เมื่อกด "อัปเดตจากเกณฑ์กลาง")
 * กด Run จาก Editor โดยไม่ส่งรายการ = บันทึกเกณฑ์กลางปัจจุบัน/ชุดเริ่มต้นลงชีต StdItems เพื่อแก้ในชีตได้
 */
function saveStdItems(list) {
  need_(['admin']);
  var fromEditor = !list || !list.length;
  if (fromEditor) list = loadStd_();
  return withLock_(function () {
    var rows = (list || []).slice(0, 12).map(function (it, i) {
      var name = s_(it.name).trim();
      if (!name) throw new Error('เกณฑ์ข้อที่ ' + (i + 1) + ' ยังไม่มีชื่อ');
      var b = it.desc && it.desc.length === 5 ? it.desc : ['', '', '', '', ''];
      return { itemId: s_(it.id) || uid_('std'), order: i + 1, name: name.slice(0, 200), detail: s_(it.detail).trim().slice(0, 1000), bA: s_(b[0]), bB: s_(b[1]), bC: s_(b[2]), bD: s_(b[3]), bE: s_(b[4]) };
    });
    if (rows.length < 2) throw new Error('เกณฑ์กลางต้องมีอย่างน้อย 2 ข้อ');
    writeAll_('StdItems', rows);
    if (fromEditor) Logger.log('บันทึกเกณฑ์กลาง ' + rows.length + ' ข้อลงชีต StdItems แล้ว แก้ต่อได้ในชีตหรือที่ จัดการระบบ > เกณฑ์กลาง');
    return loadStd_();
  });
}
var STAGES_ = ['topic', 'proposal', 'research', 'defense', 'revise', 'passed', 'graduated'];
var OPEN_STATUS_ = ['open', 'paused', 'closed', 'new'];

/* เกณฑ์การประเมิน 5 ช่วง ใช้เหมือนกันทุก PLO ทุกหลักสูตร: แต่ละเกณฑ์ให้คะแนน 0-10 */
var MAX_SCORE = 10;
var BANDS = [
  { key: 'A', name: 'สูงกว่าเป้าหมายมาก', min: 9, max: 10 },
  { key: 'B', name: 'ตามเป้าหมาย', min: 7, max: 8 },
  { key: 'C', name: 'ใกล้เคียงเป้าหมาย', min: 5, max: 6 },
  { key: 'D', name: 'ต่ำกว่าเป้าหมาย', min: 3, max: 4 },
  { key: 'E', name: 'ต่ำกว่าเป้าหมายมาก', min: 0, max: 2 }
];

/* ============================================================
 * Web app entry
 * ============================================================ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ============================================================
 * Sheet helpers
 * ============================================================ */
function ss_() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) { p.setProperty('SPREADSHEET_ID', active.getId()); return active; }
  var created = SpreadsheetApp.create('PLO Evaluation Data');
  p.setProperty('SPREADSHEET_ID', created.getId());
  return created;
}

var headerChecked_ = {};

function sheet_(name) {
  var book = ss_();
  var sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold').setBackground('#e3eefb');
    sh.setFrozenRows(1);
    headerChecked_[name] = true;
  } else if (!headerChecked_[name]) {
    // ย้ายข้อมูลรุ่นเก่า: เติมหัวคอลัมน์ที่เพิ่มใหม่ (เช่น Students.code) โดยไม่แตะข้อมูลเดิม
    var have = sh.getRange(1, 1, 1, SCHEMA[name].length).getValues()[0];
    var changed = false;
    SCHEMA[name].forEach(function (h, i) { if (!have[i]) { have[i] = h; changed = true; } });
    if (changed) sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([have]).setFontWeight('bold').setBackground('#e3eefb');
    headerChecked_[name] = true;
  }
  return sh;
}

function readAll_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var head = SCHEMA[name];
  var values = sh.getRange(2, 1, last - 1, head.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] === null) continue;
    var o = {};
    for (var j = 0; j < head.length; j++) o[head[j]] = values[i][j];
    out.push(o);
  }
  return out;
}

function toRow_(name, obj) {
  return SCHEMA[name].map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : obj[h]; });
}

function writeAll_(name, objs) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, SCHEMA[name].length).clearContent();
  if (objs.length) {
    sh.getRange(2, 1, objs.length, SCHEMA[name].length).setValues(objs.map(function (o) { return toRow_(name, o); }));
  }
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name);
  sh.getRange(sh.getLastRow() + 1, 1, objs.length, SCHEMA[name].length).setValues(objs.map(function (o) { return toRow_(name, o); }));
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function s_(v) { return v === null || v === undefined ? '' : String(v); }
function num_(v, d) { var n = Number(v); return isNaN(n) || v === '' ? d : n; }
function uid_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

/* ============================================================
 * Users & roles   (Users sheet: email | name | role | programs)
 * บทบาทบัญชี (ผู้ดูแลกำหนด):
 *   admin      = ผู้ดูแลระบบ: จัดการทุกอย่าง (ส่วนงาน หลักสูตร ผู้ใช้) และประเมินได้
 *   chair      = ประธานหลักสูตร: จัดการ PLO หัวข้อประเมิน รายชื่อนักศึกษา ของหลักสูตรที่รับผิดชอบ และประเมินได้
 *   faculty    = อาจารย์ประจำหลักสูตร: ประเมินนักศึกษาของหลักสูตรที่รับผิดชอบ (เดิมชื่อ evaluator)
 *   curriculum = เจ้าหน้าที่หลักสูตร: กรอกข้อมูลหลักสูตร ไม่ให้คะแนน
 *   executive  = ผู้บริหาร: ดูทุกหลักสูตรอย่างเดียว
 *   programs   = รหัสหลักสูตรที่รับผิดชอบ คั่นด้วยจุลภาค หรือ * = ทุกหลักสูตร (ใช้กับ chair / faculty / curriculum)
 *   email "*"  = บทบาทตั้งต้นของทุกคนที่เข้าได้ (เช่นในโดเมนเดียวกัน)
 * บทบาทในการสอบ (ผู้ประเมินเลือกเองต่อนักศึกษาแต่ละคน เก็บในชีต Evals.role):
 *   chair = ประธานสอบ (สรุปผลการสอบได้, 1 คนต่อนักศึกษา) · member = กรรมการสอบ · advisor = อาจารย์ที่ปรึกษา
 * ============================================================ */
var ROLES_ = ['admin', 'chair', 'faculty', 'curriculum', 'executive'];
var EDIT_ROLES_ = ['admin', 'chair', 'curriculum'];   // แก้ข้อมูลหลักสูตร
var SCORE_ROLES_ = ['admin', 'chair', 'faculty'];     // ให้คะแนน
var EXAM_ROLES_ = ['chair', 'member', 'advisor'];
var DECISIONS_ = ['pass', 'pass_cond', 'fail'];
function normRole_(r) { r = s_(r).toLowerCase(); return r === 'evaluator' ? 'faculty' : r; }
function parsePrograms_(v) {
  var t = s_(v).trim();
  if (!t || t === '*') return ['*'];
  if (t === '-') return [];
  return t.split(/[,\s;]+/).filter(String);
}
function me_() {
  var email = s_(Session.getActiveUser().getEmail()).toLowerCase();
  var owner = s_(Session.getEffectiveUser().getEmail()).toLowerCase();
  var users = readAll_('Users');
  var found = null, star = null;
  users.forEach(function (u) {
    var e = s_(u.email).toLowerCase();
    if (e === '*') star = u;
    else if (email && e === email) found = u;
  });
  var u = found || star;
  var role = u ? normRole_(u.role) : 'viewer';
  if (!email) role = 'viewer';
  if (email && email === owner) role = 'admin';
  if (ROLES_.concat(['viewer']).indexOf(role) < 0) role = 'viewer';
  var progs = (role === 'chair' || role === 'faculty' || role === 'curriculum') ? parsePrograms_(u && u.programs) : ['*'];
  return { email: email || 'anonymous', name: (found && s_(found.name)) || email || 'ผู้ใช้ที่ไม่ระบุตัวตน', role: role, programs: progs };
}

function inScope_(me, pid) {
  return me.programs.indexOf('*') >= 0 || me.programs.indexOf(s_(pid)) >= 0;
}

function need_(roles) {
  var me = me_();
  if (roles.indexOf(me.role) < 0) throw new Error('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ (บทบาท: ' + me.role + ')');
  return me;
}

/** ตรวจบทบาท และตรวจว่าหลักสูตรนี้อยู่ในขอบเขตที่ได้รับมอบหมาย */
function needP_(roles, pid) {
  var me = need_(roles);
  if (!inScope_(me, pid)) throw new Error('หลักสูตรนี้ไม่ได้อยู่ในความรับผิดชอบของบัญชีนี้');
  return me;
}

/* ============================================================
 * Setup & seed
 * ============================================================ */
function setup() {
  Object.keys(SCHEMA).forEach(function (n) { sheet_(n); });
  var book = ss_();
  var def = book.getSheetByName('Sheet1');
  if (def && book.getSheets().length > 1 && def.getLastRow() === 0) book.deleteSheet(def);

  if (!readAll_('Faculties').length) {
    appendRows_('Faculties', [{ facultyId: 'f1', name: 'บัณฑิตวิทยาลัย', order: 1 }, { facultyId: 'f2', name: 'คณะกายภาพบำบัด', order: 2 }]);
  }
  if (!readAll_('Programs').length) {
    var base = { ploPass: 60, overall: 70, fraction: 100, target: 80 };
    appendRows_('Programs', [
      mix_({ programId: '3711MS01', facultyId: 'f1', name: '3711MS01 - วิทยาศาสตรมหาบัณฑิต สาขาวิชาวิทยาการขั้นสูงทางชีวการแพทย์และการสร้างสรรค์ธุรกิจสุขภาพ (ภาคพิเศษ)', level: 'ปริญญาโท', status: 'empty', source: 'รอนำเข้า PLO' }, base),
      mix_({ programId: '3713MS01', facultyId: 'f1', name: '3713MS01 - ศิลปศาสตรและวิทยาศาสตรมหาบัณฑิต สาขาวิชากลยุทธ์ทางธุรกิจ (ภาคพิเศษ)', level: 'ปริญญาโท', status: 'empty', source: 'รอนำเข้า PLO' }, base),
      mix_({ programId: '3703MG01', facultyId: 'f1', name: '3703MG01 - วิทยาศาสตรมหาบัณฑิต สาขาวิชาการแพทย์คลินิก (ปิดปี 2552)', level: 'ปริญญาโท', status: 'empty', source: 'รอนำเข้า PLO' }, base),
      mix_({ programId: '6802CG04', facultyId: 'f2', name: '6802CG04 - ประกาศนียบัตรบัณฑิต สาขาวิชากายภาพบำบัดคลินิก', level: 'ประกาศนียบัตรบัณฑิต', status: 'empty', source: 'รอนำเข้า PLO' }, base),
      mix_({ programId: '6801DG04', facultyId: 'f2', name: '6801DG04 - ปรัชญาดุษฎีบัณฑิต สาขาวิชากายภาพบำบัด (หลักสูตรนานาชาติ)', level: 'ปริญญาเอก', status: 'empty', source: 'รอนำเข้า PLO' }, base),
      mix_({ programId: '6805MG02', facultyId: 'f2', name: '6805MG02 - วิทยาศาสตรมหาบัณฑิต สาขาวิชากายภาพบำบัด (หลักสูตรนานาชาติ)', level: 'ปริญญาโท', status: 'empty', source: 'รอนำเข้า PLO' }, base),
      mix_({ programId: '6801MG04', facultyId: 'f2', name: '6801MG04 - วิทยาศาสตรมหาบัณฑิต สาขาวิชากายภาพบำบัดคลินิก', level: 'ปริญญาโท', status: 'empty', source: 'รอนำเข้า PLO' }, base),
      mix_({ programId: '6806MG01', facultyId: 'f2', name: '6806MG01 - วิทยาศาสตรมหาบัณฑิต สาขาวิชากิจกรรมบำบัดคลินิก', level: 'ปริญญาโท', status: 'empty', source: 'รอนำเข้า PLO' }, base)
    ]);
  }
  if (!readAll_('Users').length) {
    var owner = s_(Session.getEffectiveUser().getEmail());
    var rows = [];
    if (owner) rows.push({ email: owner, name: 'ผู้ดูแลระบบ', role: 'admin', programs: '*' });
    rows.push({ email: '*', name: '(ทุกคนที่เข้าได้)', role: 'executive', programs: '*' });
    appendRows_('Users', rows);
  }
  return 'เรียบร้อย: สร้างชีตแล้วที่ ' + ss_().getUrl();
}

function mix_(a, b) { Object.keys(b).forEach(function (k) { a[k] = b[k]; }); return a; }

function seedPlos_(pid, list) {
  var plos = [], crits = [];
  list.forEach(function (it, i) {
    var ploId = pid + '_' + (i + 1);
    plos.push({ programId: pid, ploId: ploId, code: it[0], titleTh: it[1], textEn: it[2], weight: it[3], order: i + 1 });
    it[4].forEach(function (c, ci) {
      crits.push({ programId: pid, ploId: ploId, critId: ploId + 'c' + (ci + 1), name: c, d1: '', d2: '', d3: '', d4: '', order: ci + 1 });
    });
  });
  appendRows_('PLOs', plos);
  appendRows_('Criteria', crits);
}

/* ---------- ข้อมูลนักศึกษาตัวอย่าง (รันเองเมื่ออยากลอง) ---------- */
var COMM_ = {
  anat: {
    PLO1: ['นักศึกษาตรงต่อเวลา ปฏิบัติตามระเบียบของบัณฑิตวิทยาลัยครบถ้วน และอ้างอิงแหล่งข้อมูลถูกต้อง', 'พบการส่งเอกสารล่าช้าและการอ้างอิงบางส่วนไม่ครบถ้วน ควรทบทวนจรรยาบรรณการวิจัย'],
    PLO2: ['อธิบายพื้นฐานความรู้และที่มาของคำถามวิจัยได้ชัดเจน', 'ยังอธิบายกระบวนการวิจัยและทฤษฎีที่เกี่ยวข้องได้ไม่ครบ'],
    PLO3: ['ใช้เครื่องมือในห้องปฏิบัติการได้คล่องและเลือกวิธีเหมาะกับโจทย์', 'การใช้เครื่องมือยังขาดความมั่นใจ ต้องมีผู้ช่วยตั้งค่าให้'],
    PLO4: ['วิพากษ์ผลการทดลองและเชื่อมโยงกับทฤษฎีได้อย่างเป็นระบบ', 'การอภิปรายผลยังเป็นการบรรยาย ขาดการวิพากษ์และสังเคราะห์'],
    PLO5: ['รับคำแนะนำจากกรรมการและนำไปปรับปรุงงานได้ดี ทำงานร่วมกับผู้อื่นราบรื่น', 'ตอบข้อเสนอแนะของกรรมการช้า และยังไม่แสดงความรับผิดชอบต่อส่วนงานของตน'],
    PLO6: ['เลือกสถิติได้เหมาะสมและแปลผลได้ถูกต้อง', 'เลือกการทดสอบทางสถิติไม่เหมาะกับข้อมูล และแปลผลค่า p คลาดเคลื่อน'],
    PLO7: ['นำเสนอด้วยวาจาชัดเจน ตอบคำถามได้ดี เล่มวิทยานิพนธ์เรียบเรียงดี', 'การนำเสนอยาวเกินเวลาและเล่มมีข้อผิดพลาดด้านภาษา']
  },
  hs: {
    PLO1: ['ออกแบบและดำเนินการวิจัยได้ด้วยตนเองอย่างรัดกุม', 'ระเบียบวิธีวิจัยยังไม่รัดกุมและต้องพึ่งอาจารย์ที่ปรึกษามาก'],
    PLO2: ['วิเคราะห์นโยบายและบริบทระบบสุขภาพได้เฉียบคม ข้อเสนอเชิงนโยบายนำไปใช้ได้', 'ข้อเสนอเชิงนโยบายกว้างเกินไป ยังไม่เชื่อมกับข้อมูลจริง'],
    PLO3: ['แสดงภาวะผู้นำในการตัดสินใจและบริหารผู้มีส่วนได้ส่วนเสียได้ดี', 'ยังไม่แสดงบทบาทผู้นำในการบริหารทรัพยากร'],
    PLO4: ['สื่อสารผลงานต่อผู้เกี่ยวข้องได้ชัดเจนและเสนอแนวคิดเชิงนวัตกรรม', 'การสื่อสารยังไม่ตรงกลุ่มผู้ฟัง และนวัตกรรมที่เสนอยังไม่ชัดเจน']
  }
};

function seedSampleData() {
  return withLock_(function () {
    clearSampleData_();
    var seed = 7;
    function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    var bias = { anat: { PLO3: -0.35, PLO6: -0.6, PLO2: -0.1, PLO7: 0.15 }, hs: { PLO2: -0.1, PLO3: -0.4 } };
    var students = [], evals = [], scoreRows = [];
    readAll_('Programs').map(function (x) { return s_(x.programId); }).forEach(function (pid) {
      var prog = loadProgram_(pid);
      if (!prog || !prog.plos.length) return;
      for (var i = 0; i < 10; i++) {
        var sid = pid + '_s' + (i + 1);
        var sname = 'นักศึกษาตัวอย่าง ' + (i < 9 ? '0' : '') + (i + 1), scode = 'S' + pid.toUpperCase() + ('0' + (i + 1)).slice(-2);
        students.push({ studentId: sid, programId: pid, code: scode, name: sname, topic: 'หัวข้อวิทยานิพนธ์ตัวอย่าง ' + (i + 1), advisor: 'อาจารย์ที่ปรึกษาตัวอย่าง', sample: true });
        var base = 5.2 + rnd() * 3.6, sc = {}, pcts = [];
        prog.plos.forEach(function (p, pi) {
          var sum = 0, n = 0;
          p.crit.forEach(function (c) {
            if (i === 9 && pi >= 3) return;
            var v = Math.max(0, Math.min(MAX_SCORE, Math.round(base + ((bias[pid] || {})[p.code] || 0) * 2.5 + (rnd() - 0.5) * 3.2)));
            sc[c.id] = v; sum += v; n++;
            scoreRows.push({ evalKey: sid + '|' + SAMPLE_EMAIL, programId: pid, studentId: sid, studentCode: scode, studentName: sname, email: SAMPLE_EMAIL, evaluator: 'กรรมการตัวอย่าง', ploCode: p.code, critId: c.id, critName: c.name, level: v, updatedAt: new Date().toISOString(), scale: MAX_SCORE });
          });
          if (n) pcts.push({ code: p.code, pct: sum / (MAX_SCORE * n) });
        });
        pcts.sort(function (a, b) { return b.pct - a.pct; });
        var cm = '', C = COMM_[pid] || {};
        if (pcts.length && C[pcts[0].code]) cm += C[pcts[0].code][0];
        if (pcts.length && C[pcts[pcts.length - 1].code]) cm += ' ' + C[pcts[pcts.length - 1].code][1];
        evals.push({ evalKey: sid + '|' + SAMPLE_EMAIL, programId: pid, studentId: sid, email: SAMPLE_EMAIL, name: 'กรรมการตัวอย่าง', scoresJson: '', comment: cm, updatedAt: new Date().toISOString(), role: 'member' });
      }
    });
    appendRows_('Students', students);
    appendRows_('Evals', evals);
    appendRows_('Scores', scoreRows);
    return 'สร้างนักศึกษาตัวอย่าง ' + students.length + ' คน';
  });
}

function clearSampleData_() {
  var st = readAll_('Students'), ids = {};
  st.forEach(function (s) { if (s.sample === true || String(s.sample).toLowerCase() === 'true') ids[s.studentId] = true; });
  writeAll_('Students', st.filter(function (s) { return !ids[s.studentId]; }));
  writeAll_('Evals', readAll_('Evals').filter(function (e) { return !ids[e.studentId]; }));
  writeAll_('Scores', readAll_('Scores').filter(function (e) { return !ids[e.studentId]; }));
  writeAll_('AI', readAll_('AI').filter(function (e) { return !ids[e.studentId]; }));
  writeAll_('Decisions', readAll_('Decisions').filter(function (e) { return !ids[e.studentId]; }));
}

function clearSampleData() { return withLock_(function () { clearSampleData_(); return 'ลบข้อมูลตัวอย่างแล้ว'; }); }

/* ============================================================
 * Read APIs
 * ============================================================ */
function getBootstrap() {
  var me = me_();
  if (me.role === 'viewer' && !readAll_('Faculties').length) setup();
  var fac = readAll_('Faculties'), prs = readAll_('Programs'), plos = readAll_('PLOs'), sts = readAll_('Students');
  var ploCount = {}, stCount = {};
  plos.forEach(function (p) { ploCount[p.programId] = (ploCount[p.programId] || 0) + 1; });
  sts.forEach(function (s) { stCount[s.programId] = (stCount[s.programId] || 0) + 1; });
  fac.sort(function (a, b) { return num_(a.order, 0) - num_(b.order, 0); });
  return {
    me: me,
    aiEnabled: !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'),
    bands: BANDS, maxScore: MAX_SCORE, stdItems: loadStd_(),
    sheetUrl: me.role === 'admin' ? ss_().getUrl() : '',
    faculties: fac.filter(function (f) {
      return me.role === 'admin' || prs.some(function (p) { return s_(p.facultyId) === s_(f.facultyId) && inScope_(me, p.programId); });
    }).map(function (f) {
      return {
        id: s_(f.facultyId), name: s_(f.name),
        programs: prs.filter(function (p) { return s_(p.facultyId) === s_(f.facultyId) && inScope_(me, p.programId); }).map(function (p) {
          return { id: s_(p.programId), name: s_(p.name), level: s_(p.level), status: s_(p.status), ploCount: ploCount[p.programId] || 0, studentCount: stCount[p.programId] || 0 };
        })
      };
    })
  };
}

/** อ่านชีตที่ใช้สร้างข้อมูลหลักสูตรครั้งเดียว (ใช้กับหลายหลักสูตรพร้อมกันได้โดยไม่อ่านซ้ำ) */
function progSheets_() {
  var by = function (rows) { var m = {}; rows.forEach(function (r) { (m[s_(r.programId)] = m[s_(r.programId)] || []).push(r); }); return m; };
  var fac = {}; readAll_('Faculties').forEach(function (f) { fac[s_(f.facultyId)] = s_(f.name); });
  return { fac: fac, crit: by(readAll_('Criteria')), plos: by(readAll_('PLOs')), items: by(readAll_('Items')) };
}

function buildProgram_(pr, S) {
  var pid = s_(pr.programId), ord = function (a, b) { return num_(a.order, 0) - num_(b.order, 0); };
  var crits = (S.crit[pid] || []).slice().sort(ord), plos = (S.plos[pid] || []).slice().sort(ord), items = (S.items[pid] || []).slice().sort(ord);
  var codes = plos.map(function (p) { return s_(p.code); });
  return {
    id: pid, facultyId: s_(pr.facultyId), facultyName: S.fac[s_(pr.facultyId)] || '', name: s_(pr.name), level: s_(pr.level), status: s_(pr.status), source: s_(pr.source),
    set: { ploPass: num_(pr.ploPass, 60), overall: num_(pr.overall, 70), fraction: num_(pr.fraction, 100), target: num_(pr.target, 80), evalMode: s_(pr.evalMode) === 'items' ? 'items' : 'plo',
      openStatus: OPEN_STATUS_.indexOf(s_(pr.openStatus)) >= 0 ? s_(pr.openStatus) : 'open', planIntake: num_(pr.planIntake, 0) },
    items: items.map(function (it) {
      return { id: s_(it.itemId), name: s_(it.name), detail: s_(it.detail), plos: matchCodes_(s_(it.plos).split(','), codes), desc: bandDesc_(it), stdId: s_(it.stdId) };
    }),
    plos: plos.map(function (p) {
      return {
        id: s_(p.ploId), code: s_(p.code), th: s_(p.titleTh), en: s_(p.textEn), weight: num_(p.weight, 0),
        crit: crits.filter(function (c) { return s_(c.ploId) === s_(p.ploId); }).map(function (c) {
          return { id: s_(c.critId), name: s_(c.name), desc: bandDesc_(c) };
        })
      };
    })
  };
}

function loadProgram_(pid) {
  var pr = readAll_('Programs').filter(function (p) { return s_(p.programId) === pid; })[0];
  return pr ? buildProgram_(pr, progSheets_()) : null;
}

/** ข้อมูลนักศึกษาที่ส่งให้หน้าเว็บ (วันที่ในชีตอาจถูกแปลงเป็น Date ให้จัดรูปเป็น yyyy-MM-dd) */
function stuOut_(s) {
  var d = s.examDate;
  if (Object.prototype.toString.call(d) === '[object Date]') d = isNaN(d) ? '' : Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd');
  return {
    id: s_(s.studentId), code: s_(s.code), name: s_(s.name), topic: s_(s.topic), advisor: s_(s.advisor), sample: isSample_(s.sample),
    workType: WORK_TYPES_.indexOf(s_(s.workType)) >= 0 ? s_(s.workType) : 'thesis', intakeYear: s_(s.intakeYear),
    stage: STAGES_.indexOf(s_(s.stage)) >= 0 ? s_(s.stage) : 'research', examDate: s_(d)
  };
}

/** ตรวจ/แปลงค่าฟิลด์นักศึกษาที่แก้ได้ */
function cleanStuField_(k, v) {
  v = s_(v).trim();
  if (k === 'workType') return WORK_TYPES_.indexOf(v) >= 0 ? v : 'thesis';
  if (k === 'stage') return STAGES_.indexOf(v) >= 0 ? v : 'research';
  if (k === 'intakeYear') { var y = v.replace(/[^0-9]/g, ''); if (y.length === 2) y = '25' + y; return y.slice(0, 4); }
  if (k === 'examDate') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? "'" + v : '';
  return v;
}

/** จับคู่รหัส PLO (ไม่สนช่องว่าง/ตัวพิมพ์) กับรหัสจริงของหลักสูตร ตัดตัวที่ไม่มีและตัวซ้ำออก */
function matchCodes_(list, codes) {
  var norm = function (x) { return s_(x).replace(/\s+/g, '').toUpperCase(); }, map = {}, out = [];
  codes.forEach(function (c) { map[norm(c)] = c; });
  (list || []).forEach(function (x) { var c = map[norm(x)]; if (c && out.indexOf(c) < 0) out.push(c); });
  return out;
}

/** หน่วยที่ใช้คิดคะแนนของ PLO: แบบเดิม = เกณฑ์ของ PLO นั้น / แบบหัวข้อ = หัวข้อที่เชื่อมกับ PLO นั้น */
function unitsOfPlo_(prog, p) {
  if (prog.set.evalMode === 'items' && prog.items.length) return prog.items.filter(function (it) { return it.plos.indexOf(p.code) >= 0; });
  return p.crit;
}

/** ตรวจกติกาหัวข้อ: ทุกหัวข้อเชื่อม ≥ 2 PLO และทุก PLO ถูกประเมินอย่างน้อย 1 หัวข้อ */
function checkItems_(codes, items) {
  var probs = [], used = {};
  if (codes.length < 2) probs.push('หลักสูตรต้องมี PLO อย่างน้อย 2 ข้อ');
  if (!items.length) probs.push('ยังไม่มีหัวข้อการประเมิน');
  items.forEach(function (it, i) {
    if (!s_(it.name).trim()) probs.push('หัวข้อที่ ' + (i + 1) + ' ยังไม่มีชื่อ');
    if (it.plos.length < 2) probs.push('หัวข้อที่ ' + (i + 1) + ' เชื่อม PLO น้อยกว่า 2 ข้อ');
    it.plos.forEach(function (c) { used[c] = true; });
  });
  var miss = codes.filter(function (c) { return !used[c]; });
  if (items.length && miss.length) probs.push('ยังไม่มีหัวข้อที่ประเมิน ' + miss.join(', '));
  return probs;
}

/**
 * คำอธิบาย 5 ช่วง [A,B,C,D,E] ของเกณฑ์ หรือ null ถ้ายังไม่ได้เขียน (หน้าเว็บจะใช้ร่างอัตโนมัติ)
 * ข้อมูลรุ่นเก่า (d1-d4) ย้ายมาให้: ระดับ 4→A, 3→B, 2→C, 1→D และ E ใช้ร่างอัตโนมัติ
 */
function bandDesc_(c) {
  var b = [s_(c.bA), s_(c.bB), s_(c.bC), s_(c.bD), s_(c.bE)];
  if (b.join('')) return b;
  var d = [s_(c.d4), s_(c.d3), s_(c.d2), s_(c.d1), ''];
  return d.join('') ? d : null;
}

/** แปลงคะแนนจากชีตเป็นเต็ม 10: แถวที่ไม่มี scale เป็นข้อมูลเก่าระดับ 1-4 */
function toScore10_(v, scale) {
  v = Number(v);
  if (v === null || isNaN(v)) return null;
  if (Number(scale) === MAX_SCORE) return v >= 0 && v <= MAX_SCORE ? v : null;
  return v >= 1 && v <= 4 ? v * MAX_SCORE / 4 : null;
}

/** รวมความเห็น (Evals) กับคะแนนรายเกณฑ์ (Scores) เป็นรายการประเมินต่อกรรมการ; รองรับข้อมูลรุ่นเก่าที่เก็บเป็น scoresJson */
function loadEvals_(pid) {
  var byKey = {};
  readAll_('Scores').forEach(function (r) {
    if (pid && s_(r.programId) !== pid) return;
    if (r.level === '' || r.level === null) return;
    var k = s_(r.evalKey), v = toScore10_(r.level, r.scale);
    if (v !== null) (byKey[k] = byKey[k] || {})[s_(r.critId)] = v;
  });
  return readAll_('Evals').filter(function (e) { return !pid || s_(e.programId) === pid; }).map(function (e) {
    var sc = byKey[s_(e.evalKey)];
    if (!sc) {
      sc = {};
      var old = {}; try { old = JSON.parse(s_(e.scoresJson) || '{}'); } catch (x) { }
      Object.keys(old).forEach(function (c) { var v = toScore10_(old[c], 4); if (v !== null) sc[c] = v; });
    }
    return { studentId: s_(e.studentId), programId: s_(e.programId), email: s_(e.email), name: s_(e.name), scores: sc, comment: s_(e.comment), updatedAt: s_(e.updatedAt), role: EXAM_ROLES_.indexOf(s_(e.role)) >= 0 ? s_(e.role) : 'member' };
  });
}

function getProgram(pid) {
  var me = me_();
  if (!inScope_(me, pid)) throw new Error('หลักสูตรนี้ไม่ได้อยู่ในความรับผิดชอบของบัญชีนี้');
  var prog = loadProgram_(s_(pid));
  if (!prog) throw new Error('ไม่พบหลักสูตร');
  prog.students = readAll_('Students').filter(function (s) { return s_(s.programId) === prog.id; }).map(stuOut_);
  prog.evals = loadEvals_(prog.id);
  prog.decisions = {};
  readAll_('Decisions').filter(function (d) { return s_(d.programId) === prog.id; }).forEach(function (d) {
    prog.decisions[s_(d.studentId)] = { decision: s_(d.decision), note: s_(d.note), email: s_(d.email), name: s_(d.name), updatedAt: s_(d.updatedAt) };
  });
  prog.ai = {};
  readAll_('AI').filter(function (a) { return s_(a.programId) === prog.id; }).forEach(function (a) {
    try { prog.ai[s_(a.studentId)] = JSON.parse(s_(a.resultJson)); } catch (x) { }
  });
  return prog;
}

/** ข้อมูลทุกหลักสูตรในขอบเขตของผู้ใช้ (หน้าเทียบข้ามหลักสูตร และหน้าภาพรวมความคืบหน้า): PLOs + นักศึกษา + คะแนนเฉลี่ยกรรมการ + ผลสอบ */
function getCrossData() {
  var me = me_();
  var evals = loadEvals_(''), students = readAll_('Students'), ais = {};
  readAll_('AI').forEach(function (a) { try { ais[s_(a.studentId)] = JSON.parse(s_(a.resultJson)); } catch (x) { } });
  var byStu = {};
  evals.forEach(function (e) {
    (byStu[s_(e.studentId)] = byStu[s_(e.studentId)] || []).push({ real: s_(e.email) !== SAMPLE_EMAIL, scores: e.scores });
  });
  function nEval(sid) {
    var list = byStu[sid] || [], real = list.filter(function (x) { return x.real; });
    return (real.length ? real : list).filter(function (x) { return Object.keys(x.scores).length; }).length;
  }
  var decs = {};
  readAll_('Decisions').forEach(function (d) { decs[s_(d.studentId)] = { decision: s_(d.decision), name: s_(d.name), updatedAt: s_(d.updatedAt) }; });
  var S = progSheets_();
  function mean(sid) {
    var list = byStu[sid] || [], real = list.filter(function (x) { return x.real; });
    if (real.length) list = real;
    var acc = {};
    list.forEach(function (x) { Object.keys(x.scores).forEach(function (c) { var v = x.scores[c]; if (typeof v === 'number') (acc[c] = acc[c] || []).push(v); }); });
    var out = {};
    Object.keys(acc).forEach(function (c) { out[c] = acc[c].reduce(function (a, b) { return a + b; }, 0) / acc[c].length; });
    return out;
  }
  var cross = readAll_('CrossAI')[0], x = null;
  if (cross) { try { x = JSON.parse(s_(cross.resultJson)); } catch (e) { } }
  return {
    programs: readAll_('Programs').filter(function (p) { return inScope_(me, p.programId); }).map(function (p) {
      var prog = buildProgram_(p, S);
      prog.decisions = {};
      prog.students = students.filter(function (s) { return s_(s.programId) === prog.id; }).map(function (s) {
        var o = stuOut_(s), sid = o.id;
        o.scores = mean(sid); o.ai = ais[sid] || null; o.n = nEval(sid);
        if (decs[sid]) prog.decisions[sid] = decs[sid];
        return o;
      });
      return prog;
    }),
    cross: x
  };
}

/* ============================================================
 * Write APIs
 * ============================================================ */
function createFaculty(name) {
  need_(['admin']);
  name = s_(name).trim(); if (!name) throw new Error('กรอกชื่อส่วนงาน');
  return withLock_(function () {
    var list = readAll_('Faculties');
    appendRows_('Faculties', [{ facultyId: uid_('f'), name: name, order: list.length + 1 }]);
    return getBootstrap();
  });
}

function renameFaculty(facultyId, name) {
  need_(['admin']);
  return withLock_(function () {
    var list = readAll_('Faculties');
    list.forEach(function (f) { if (s_(f.facultyId) === s_(facultyId) && s_(name).trim()) f.name = s_(name).trim(); });
    writeAll_('Faculties', list);
    return getBootstrap();
  });
}

function createProgram(facultyId, name, level) {
  need_(['admin']);
  name = s_(name).trim(); if (!name) throw new Error('กรอกชื่อหลักสูตร');
  return withLock_(function () {
    var id = uid_('p');
    appendRows_('Programs', [{ programId: id, facultyId: s_(facultyId), name: name, level: s_(level), status: 'empty', source: 'รอนำเข้า PLO', ploPass: 60, overall: 70, fraction: 100, target: 80 }]);
    return { id: id, boot: getBootstrap() };
  });
}

function renameProgram(pid, name, level) {
  need_(['admin']);
  name = s_(name).trim(); if (!name) throw new Error('กรอกชื่อหลักสูตร');
  return withLock_(function () {
    var prs = readAll_('Programs');
    prs.forEach(function (p) { if (s_(p.programId) === s_(pid)) { p.name = name; if (level !== undefined) p.level = s_(level); } });
    writeAll_('Programs', prs);
    return getBootstrap();
  });
}

/** ลบหลักสูตรพร้อมข้อมูลทั้งหมดที่ผูกอยู่ (PLO เกณฑ์ นักศึกษา คะแนน) */
function deleteProgram(pid) {
  need_(['admin']);
  return withLock_(function () {
    pid = s_(pid);
    ['Programs', 'PLOs', 'Criteria', 'Items', 'Students', 'Evals', 'Scores', 'AI', 'Decisions'].forEach(function (n) {
      var key = n === 'Programs' ? 'programId' : 'programId';
      writeAll_(n, readAll_(n).filter(function (r) { return s_(r[key]) !== pid; }));
    });
    return getBootstrap();
  });
}

function deleteFaculty(facultyId) {
  need_(['admin']);
  return withLock_(function () {
    if (readAll_('Programs').some(function (p) { return s_(p.facultyId) === s_(facultyId); })) throw new Error('ลบไม่ได้ เพราะส่วนงานนี้ยังมีหลักสูตร (ลบหลักสูตรก่อน)');
    writeAll_('Faculties', readAll_('Faculties').filter(function (f) { return s_(f.facultyId) !== s_(facultyId); }));
    return getBootstrap();
  });
}

/* ---------- ผู้ใช้และสิทธิ์ (ชีต Users) ---------- */
function getUsers() {
  need_(['admin']);
  return readAll_('Users').map(function (u) { return { email: s_(u.email), name: s_(u.name), role: normRole_(u.role) || 'faculty', programs: s_(u.programs) || '*' }; });
}

function saveUsers(list) {
  var me = need_(['admin']);
  return withLock_(function () {
    var seen = {}, out = [];
    (list || []).forEach(function (u) {
      var email = s_(u.email).trim().toLowerCase();
      if (!email || seen[email]) return;
      if (email !== '*' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง: ' + email);
      var role = normRole_(u.role);
      if (ROLES_.indexOf(role) < 0) role = 'executive';
      seen[email] = true;
      var pg = parsePrograms_(Array.isArray(u.programs) ? u.programs.join(',') : u.programs);
      out.push({ email: email, name: s_(u.name).trim(), role: role, programs: pg.length ? pg.join(',') : '-' });
    });
    if (!out.some(function (u) { return u.role === 'admin' && u.email !== '*'; }) && me.email) out.unshift({ email: me.email, name: me.name, role: 'admin', programs: '*' });
    writeAll_('Users', out);
    return getUsers();
  });
}

/** บันทึกการตั้งค่าหลักสูตร + PLO + เกณฑ์ (แทนที่ทั้งชุดของหลักสูตรนั้น) */
function saveProgram(prog) {
  needP_(EDIT_ROLES_, prog && prog.id);
  return withLock_(function () {
    var pid = s_(prog.id);
    var prs = readAll_('Programs'), found = false;
    prs.forEach(function (p) {
      if (s_(p.programId) !== pid) return;
      found = true;
      p.name = s_(prog.name) || p.name; p.level = s_(prog.level); p.source = s_(prog.source);
      p.status = prog.plos.length ? 'ready' : 'empty';
      p.ploPass = clamp_(prog.set.ploPass); p.overall = clamp_(prog.set.overall); p.fraction = clamp_(prog.set.fraction); p.target = clamp_(prog.set.target);
      if (OPEN_STATUS_.indexOf(s_(prog.set.openStatus)) >= 0) p.openStatus = s_(prog.set.openStatus);
      p.planIntake = Math.max(0, Math.round(num_(prog.set.planIntake, 0)));
    });
    if (!found) throw new Error('ไม่พบหลักสูตร');
    writeAll_('Programs', prs);
    var plos = [], crits = [];
    prog.plos.forEach(function (p, i) {
      var ploId = s_(p.id) || uid_('l');
      plos.push({ programId: pid, ploId: ploId, code: s_(p.code), titleTh: s_(p.th), textEn: s_(p.en), weight: Math.max(0, num_(p.weight, 0)), order: i + 1 });
      p.crit.forEach(function (c, ci) {
        var b = c.desc || ['', '', '', '', ''];
        crits.push({ programId: pid, ploId: ploId, critId: s_(c.id) || uid_('c'), name: s_(c.name), d1: '', d2: '', d3: '', d4: '', order: ci + 1, bA: s_(b[0]), bB: s_(b[1]), bC: s_(b[2]), bD: s_(b[3]), bE: s_(b[4]) });
      });
    });
    writeAll_('PLOs', readAll_('PLOs').filter(function (p) { return s_(p.programId) !== pid; }).concat(plos));
    writeAll_('Criteria', readAll_('Criteria').filter(function (c) { return s_(c.programId) !== pid; }).concat(crits));
    return getProgram(pid);
  });
}

function clamp_(v) { return Math.max(0, Math.min(100, num_(v, 0))); }

/**
 * บันทึกหัวข้อการประเมินวิทยานิพนธ์ (แทนที่ทั้งชุดของหลักสูตร) และรูปแบบการประเมิน
 * items = [{id,name,detail,plos:[รหัส PLO],desc:[A..E]|null}], mode = 'plo' | 'items'
 * ใช้แบบหัวข้อได้เมื่อผ่านกติกา (ทุกหัวข้อเชื่อม ≥ 2 PLO และครอบคลุมทุก PLO) ส่วนแบบเดิมบันทึกร่างไว้ก่อนได้
 */
function saveItems(pid, items, mode) {
  needP_(EDIT_ROLES_, pid);
  return withLock_(function () {
    pid = s_(pid);
    var prog = loadProgram_(pid);
    if (!prog) throw new Error('ไม่พบหลักสูตร');
    var codes = prog.plos.map(function (p) { return p.code; });
    var list = (items || []).slice(0, 30).map(function (it) {
      return { id: s_(it.id) || uid_('i'), name: s_(it.name).trim().slice(0, 200), detail: s_(it.detail).trim().slice(0, 1000), plos: matchCodes_(it.plos, codes), desc: it.desc, stdId: s_(it.stdId) };
    });
    mode = mode === 'items' ? 'items' : 'plo';
    var probs = checkItems_(codes, list);
    if (mode === 'items' && probs.length) throw new Error('ใช้แบบหัวข้อการสอบไม่ได้: ' + probs.join(' · '));
    var rows = list.map(function (it, i) {
      var b = it.desc && it.desc.length === 5 ? it.desc : ['', '', '', '', ''];
      return { programId: pid, itemId: it.id, order: i + 1, name: it.name, detail: it.detail, plos: it.plos.join(','), bA: s_(b[0]), bB: s_(b[1]), bC: s_(b[2]), bD: s_(b[3]), bE: s_(b[4]), stdId: it.stdId };
    });
    writeAll_('Items', readAll_('Items').filter(function (r) { return s_(r.programId) !== pid; }).concat(rows));
    var prs = readAll_('Programs');
    prs.forEach(function (p) { if (s_(p.programId) === pid) p.evalMode = mode; });
    writeAll_('Programs', prs);
    return getProgram(pid);
  });
}

/** list = [{code,titleTh,textEn,weight,crit:[names]?}] */
function importPlos(pid, list, mode) {
  needP_(EDIT_ROLES_, pid);
  return withLock_(function () {
    pid = s_(pid);
    if (!list || !list.length) throw new Error('ไม่มีรายการ PLOs');
    var keepP = readAll_('PLOs').filter(function (p) { return s_(p.programId) !== pid; });
    var keepC = readAll_('Criteria').filter(function (c) { return s_(c.programId) !== pid; });
    var oldP = [], oldC = [];
    if (mode === 'append') {
      oldP = readAll_('PLOs').filter(function (p) { return s_(p.programId) === pid; });
      oldC = readAll_('Criteria').filter(function (c) { return s_(c.programId) === pid; });
    }
    var plos = [], crits = [], start = oldP.length;
    list.forEach(function (it, i) {
      var ploId = uid_('l');
      var text = s_(it.textEn);
      plos.push({ programId: pid, ploId: ploId, code: s_(it.code) || ('PLO' + (start + i + 1)), titleTh: s_(it.titleTh) || shortTitle_(text), textEn: text, weight: it.weight !== undefined && it.weight !== null && it.weight !== '' ? Math.max(0, num_(it.weight, 100)) : 100, order: start + i + 1 });
      var cs = (it.crit && it.crit.length) ? it.crit : draftCriteria_(text + ' ' + s_(it.titleTh));
      cs.forEach(function (c, ci) {
        var name = typeof c === 'object' && c ? c.name : c, b = (c && c.bands && c.bands.length === 5) ? c.bands : ['', '', '', '', ''];
        crits.push({ programId: pid, ploId: ploId, critId: uid_('c'), name: s_(name), d1: '', d2: '', d3: '', d4: '', order: ci + 1, bA: s_(b[0]), bB: s_(b[1]), bC: s_(b[2]), bD: s_(b[3]), bE: s_(b[4]) });
      });
    });
    writeAll_('PLOs', keepP.concat(oldP, plos));
    writeAll_('Criteria', keepC.concat(oldC, crits));
    var prs = readAll_('Programs');
    prs.forEach(function (p) {
      if (s_(p.programId) !== pid) return;
      p.status = 'ready';
      p.source = 'นำเข้าล่าสุด ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd/M/yyyy HH:mm');
    });
    writeAll_('Programs', prs);
    return getProgram(pid);
  });
}

function isSample_(v) { return v === true || String(v).toLowerCase() === 'true'; }

/**
 * เพิ่มนักศึกษาเป็นรายคน list = [{code,name,topic,advisor}]
 * ข้ามรายการซ้ำ (รหัสเดียวกัน หรือชื่อ+หัวข้อเดียวกันในหลักสูตรเดียวกัน)
 */
function addStudentList(pid, list) {
  needP_(EDIT_ROLES_, pid);
  return withLock_(function () {
    pid = s_(pid);
    if (!list || !list.length) throw new Error('ไม่มีรายชื่อนักศึกษา');
    var cur = readAll_('Students').filter(function (x) { return s_(x.programId) === pid; });
    var codes = {}, names = {};
    cur.forEach(function (x) { if (s_(x.code)) codes[s_(x.code).toLowerCase()] = true; names[s_(x.name).trim() + '|' + s_(x.topic).trim()] = true; });
    var rows = [], skipped = [];
    list.forEach(function (it) {
      var name = s_(it.name).trim(), code = s_(it.code).trim(), topic = s_(it.topic).trim() || 'ยังไม่ระบุหัวข้อ';
      if (!name) return;
      var nk = name + '|' + topic;
      if ((code && codes[code.toLowerCase()]) || names[nk]) { skipped.push(name); return; }
      if (code) codes[code.toLowerCase()] = true;
      names[nk] = true;
      rows.push({ studentId: uid_('s'), programId: pid, code: code, name: name, topic: topic, advisor: s_(it.advisor).trim(), sample: false,
        workType: cleanStuField_('workType', it.workType), intakeYear: cleanStuField_('intakeYear', it.intakeYear), stage: cleanStuField_('stage', it.stage), examDate: cleanStuField_('examDate', it.examDate) });
    });
    if (rows.length) appendRows_('Students', rows);
    return { added: rows.length, skipped: skipped.length, program: getProgram(pid) };
  });
}

/** แก้ข้อมูลนักศึกษา (รหัส ชื่อ หัวข้อ ที่ปรึกษา ประเภทงาน ปีที่เข้า ขั้นความคืบหน้า วันสอบ) */
function updateStudent(pid, sid, fields) {
  needP_(EDIT_ROLES_, pid);
  return withLock_(function () {
    var list = readAll_('Students'), hit = false;
    list.forEach(function (x) {
      if (s_(x.studentId) !== s_(sid) || s_(x.programId) !== s_(pid)) return;
      hit = true;
      ['code', 'name', 'topic', 'advisor'].forEach(function (k) { if (fields && fields[k] !== undefined) x[k] = s_(fields[k]).trim(); });
      ['workType', 'intakeYear', 'stage', 'examDate'].forEach(function (k) { if (fields && fields[k] !== undefined) x[k] = cleanStuField_(k, fields[k]); });
      if (!s_(x.name)) throw new Error('ชื่อนักศึกษาต้องไม่ว่าง');
    });
    if (!hit) throw new Error('ไม่พบนักศึกษา');
    writeAll_('Students', list);
    return { ok: true };
  });
}

function deleteStudent(pid, sid) {
  needP_(EDIT_ROLES_, pid);
  return withLock_(function () {
    // กันลบนักศึกษาของหลักสูตรอื่นที่ไม่ได้รับผิดชอบ
    if (!readAll_('Students').some(function (s) { return s_(s.studentId) === s_(sid) && s_(s.programId) === s_(pid); })) throw new Error('ไม่พบนักศึกษาในหลักสูตรนี้');
    writeAll_('Students', readAll_('Students').filter(function (s) { return s_(s.studentId) !== s_(sid); }));
    writeAll_('Evals', readAll_('Evals').filter(function (e) { return s_(e.studentId) !== s_(sid); }));
    writeAll_('Scores', readAll_('Scores').filter(function (e) { return s_(e.studentId) !== s_(sid); }));
    writeAll_('AI', readAll_('AI').filter(function (e) { return s_(e.studentId) !== s_(sid); }));
    writeAll_('Decisions', readAll_('Decisions').filter(function (e) { return s_(e.studentId) !== s_(sid); }));
    return getProgram(pid);
  });
}

/**
 * บันทึกคะแนนและความเห็นของผู้ใช้ปัจจุบัน
 *  - Evals : 1 แถว/กรรมการ/นักศึกษา (ความเห็น)
 *  - Scores: 1 แถว/เกณฑ์ที่ให้คะแนน พร้อมรหัส-ชื่อนักศึกษา ชื่อกรรมการ PLO เกณฑ์ ระดับ (เปิดดูและทำ Pivot ในชีตได้ตรง ๆ)
 */
function saveEval(pid, sid, scores, comment, examRole) {
  var me = needP_(SCORE_ROLES_, pid);
  examRole = EXAM_ROLES_.indexOf(s_(examRole)) >= 0 ? s_(examRole) : 'member';
  return withLock_(function () {
    pid = s_(pid); sid = s_(sid);
    var st = readAll_('Students').filter(function (s) { return s_(s.studentId) === sid && s_(s.programId) === pid; })[0];
    if (!st) throw new Error('ไม่พบนักศึกษา');
    var prog = loadProgram_(pid);
    var meta = {};
    prog.plos.forEach(function (p) { p.crit.forEach(function (c) { meta[c.id] = { ploCode: p.code, name: c.name }; }); });
    // คะแนนหัวข้อการสอบ (ที่เชื่อมหลาย PLO) เก็บในชีต Scores เหมือนกัน โดย ploCode = รหัส PLO ทั้งหมดของหัวข้อนั้น
    prog.items.forEach(function (it) { meta[it.id] = { ploCode: it.plos.join(','), name: it.name }; });
    var now = new Date().toISOString(), key = sid + '|' + me.email;
    var allEvals = readAll_('Evals');
    if (examRole === 'chair') {
      // นักศึกษา 1 คนมีประธานสอบได้คนเดียว
      var other = allEvals.filter(function (e) { return s_(e.studentId) === sid && s_(e.role) === 'chair' && s_(e.evalKey) !== key; })[0];
      if (other) throw new Error('นักศึกษาคนนี้มีประธานสอบแล้ว (' + s_(other.name) + ') เลือกบทบาทกรรมการสอบแทน');
    }
    var rows = [];
    Object.keys(scores || {}).forEach(function (k) {
      if (scores[k] === null || scores[k] === '') return;
      var v = Math.round(Number(scores[k]));
      if (!meta[k] || !(v >= 0 && v <= MAX_SCORE)) return;
      rows.push({ evalKey: key, programId: pid, studentId: sid, studentCode: s_(st.code), studentName: s_(st.name), email: me.email, evaluator: me.name, ploCode: meta[k].ploCode, critId: k, critName: meta[k].name, level: v, updatedAt: now, scale: MAX_SCORE });
    });
    writeAll_('Scores', readAll_('Scores').filter(function (r) { return s_(r.evalKey) !== key; }).concat(rows));
    var head = { evalKey: key, programId: pid, studentId: sid, email: me.email, name: me.name, scoresJson: '', comment: s_(comment).slice(0, 4000), updatedAt: now, role: examRole };
    var list = allEvals, done = false;
    list = list.map(function (e) { if (s_(e.evalKey) === key) { done = true; return head; } return e; });
    if (!done) list.push(head);
    writeAll_('Evals', list);
    return { ok: true, updatedAt: now };
  });
}

/**
 * ประธานสอบสรุปผลการสอบของนักศึกษา 1 คน: decision = pass | pass_cond | fail ('' = ล้างผล)
 * ต้องเป็นผู้ที่บันทึกบทบาท "ประธานสอบ" ของนักศึกษาคนนี้ไว้แล้ว (หรือผู้ดูแลระบบ)
 */
function saveDecision(pid, sid, decision, note) {
  var me = needP_(SCORE_ROLES_, pid);
  return withLock_(function () {
    pid = s_(pid); sid = s_(sid); decision = s_(decision);
    if (!readAll_('Students').some(function (s) { return s_(s.studentId) === sid && s_(s.programId) === pid; })) throw new Error('ไม่พบนักศึกษา');
    var isChair = readAll_('Evals').some(function (e) { return s_(e.evalKey) === sid + '|' + me.email && s_(e.role) === 'chair'; });
    if (!isChair && me.role !== 'admin') throw new Error('สรุปผลการสอบได้เฉพาะประธานสอบของนักศึกษาคนนี้');
    if (decision && DECISIONS_.indexOf(decision) < 0) throw new Error('ผลการสอบไม่ถูกต้อง');
    var list = readAll_('Decisions').filter(function (d) { return !(s_(d.studentId) === sid && s_(d.programId) === pid); });
    var row = null;
    if (decision) { row = { programId: pid, studentId: sid, decision: decision, note: s_(note).slice(0, 2000), email: me.email, name: me.name, updatedAt: new Date().toISOString() }; list.push(row); }
    writeAll_('Decisions', list);
    // ผลสอบเปลี่ยนขั้นความคืบหน้าของนักศึกษา: ผ่าน → สอบผ่าน, ผ่านโดยมีเงื่อนไข → แก้ไขหลังสอบ, ไม่ผ่าน → รอสอบใหม่
    if (decision) {
      var stg = { pass: 'passed', pass_cond: 'revise', fail: 'defense' }[decision], sts = readAll_('Students');
      sts.forEach(function (x) { if (s_(x.studentId) === sid && s_(x.programId) === pid && x.stage !== 'graduated') x.stage = stg; });
      writeAll_('Students', sts);
    }
    return row ? { decision: row.decision, note: row.note, email: row.email, name: row.name, updatedAt: row.updatedAt } : null;
  });
}

/** ส่งออกตารางไปชีตใหม่ในสเปรดชีตเดียวกัน */
function exportToSheet(title, rows) {
  need_(ROLES_);
  var book = ss_();
  var name = ('Report_' + s_(title)).replace(/[\[\]\*\?\/\\:]/g, '_').slice(0, 90);
  var sh = book.getSheetByName(name) || book.insertSheet(name);
  sh.clear();
  var w = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  var data = rows.map(function (r) { var c = r.slice(); while (c.length < w) c.push(''); return c; });
  sh.getRange(1, 1, data.length, w).setValues(data);
  sh.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#e3eefb');
  sh.setFrozenRows(1);
  return book.getUrl() + '#gid=' + sh.getSheetId();
}

/* ============================================================
 * นำเข้า PLO: แยกข้อความ / ดึงจาก Google Docs
 * ============================================================ */
function fetchDocText(urlOrId) {
  need_(EDIT_ROLES_);
  var m = String(urlOrId || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
  var id = m ? m[1] : String(urlOrId || '').trim();
  if (!id) throw new Error('ใส่ลิงก์หรือรหัส Google Docs');
  try {
    return DocumentApp.openById(id).getBody().getText();
  } catch (e) {
    throw new Error('เปิดเอกสารไม่ได้ ตรวจว่าบัญชีที่รันสคริปต์มีสิทธิ์เข้าถึง (' + e.message + ')');
  }
}

function parsePloText(text) {
  need_(EDIT_ROLES_);
  return parsePlo_(String(text || ''));
}

function parsePlo_(text) {
  var lines = text.split(/\r?\n/).map(function (l) { return l.replace(/^[\s•\-\*]+/, '').trim(); });
  var out = [], seen = {};
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]; if (!line) continue;
    var m = line.match(/^(?:PLO|ผลลัพธ์การเรียนรู้(?:ที่)?)\s*[-:]?\s*(\d+)\s*[:.\-–),\t ]*\s*(.*)$/i);
    if (!m) continue;
    var body = m[2].trim();
    if (!body) { // รหัสอยู่บรรทัดหนึ่ง ข้อความอยู่บรรทัดถัดไป
      for (var j = i + 1; j < lines.length && j <= i + 3; j++) { if (lines[j] && !/^(?:PLO|ผลลัพธ์การเรียนรู้)/i.test(lines[j])) { body = lines[j]; break; } }
    }
    body = body.replace(/^["“'‘]+|["”'’]+$/g, '').trim();
    var code = 'PLO' + m[1];
    if (body.length < 4 || seen[code]) continue;
    seen[code] = true;
    out.push({ code: code, titleTh: shortTitle_(body), textEn: body, crit: draftCriteria_(body) });
  }
  return out;
}

function shortTitle_(t) { return s_(t).split(/[,;，]/)[0].replace(/\s+/g, ' ').trim().slice(0, 56); }

var RULES_ = [
  [/ethic|honest|disciplin|punctual|complian|regulat|จริยธรรม|ซื่อสัตย์|วินัย/i, ['การปฏิบัติตามระเบียบและจรรยาบรรณ', 'ความตรงต่อเวลาและความรับผิดชอบ']],
  [/statist|mathemat|data|สถิติ/i, ['การวิเคราะห์ข้อมูลด้วยวิธีที่เหมาะสม', 'การแปลผลและสรุปผลได้ถูกต้อง']],
  [/equipment|instrument|tool|technique|เครื่องมือ/i, ['การใช้เครื่องมือหรือเทคนิคได้ถูกต้อง', 'การประยุกต์ให้เหมาะกับโจทย์วิจัย']],
  [/analy|critic|synthes|evaluat|วิเคราะห์|สังเคราะห์/i, ['การวิเคราะห์และวิพากษ์ปัญหา', 'การสังเคราะห์และประเมินข้อสรุปอย่างเป็นระบบ']],
  [/communicat|present|oral|written|สื่อสาร|นำเสนอ/i, ['การนำเสนอด้วยวาจา', 'การเขียนรายงานวิทยานิพนธ์']],
  [/leader|team|relationship|feedback|responsib|ผู้นำ|ข้อเสนอแนะ/i, ['การรับและประมวลผลข้อเสนอแนะ', 'ความรับผิดชอบและการทำงานร่วมกับผู้อื่น']],
  [/explain|knowledge|concept|understand|อธิบาย|องค์ความรู้/i, ['การอธิบายองค์ความรู้ที่เกี่ยวข้อง', 'การเชื่อมโยงกับหัวข้อวิจัยของตน']],
  [/policy|health|นโยบาย/i, ['การวิเคราะห์นโยบายและบริบท', 'การเสนอแนะที่นำไปปฏิบัติได้']]
];

function draftCriteria_(text) {
  for (var i = 0; i < RULES_.length; i++) if (RULES_[i][0].test(text)) return RULES_[i][1].slice();
  return ['การแสดงผลลัพธ์ตาม PLO นี้ในงานวิทยานิพนธ์', 'หลักฐานสนับสนุนจากงานของนักศึกษา'];
}

/* ============================================================
 * AI (Anthropic API) — ต้องตั้ง Script property: ANTHROPIC_API_KEY
 *   ตัวเลือก: CLAUDE_MODEL (ค่าตั้งต้น claude-opus-5-5)
 *   เปิด server-side fallback ไว้: ถ้าตัวกรองความปลอดภัยปฏิเสธคำขอ API จะลองรุ่นสำรองให้เองในคำขอเดียวกัน
 * ============================================================ */
function callClaude_(prompt, maxTokens, effort) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Script properties');
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    payload: JSON.stringify({
      model: props.getProperty('CLAUDE_MODEL') || 'claude-opus-5-5',
      max_tokens: maxTokens || 4000,
      output_config: { effort: effort || 'medium' },
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  var code = res.getResponseCode(), body = res.getContentText();
  if (code !== 200) throw new Error('เรียก AI ไม่สำเร็จ (' + code + '): ' + body.slice(0, 200));
  var txt = '', msg;
  try { msg = JSON.parse(body); } catch (e) { throw new Error('รูปแบบคำตอบ AI ไม่ถูกต้อง'); }
  if (msg.stop_reason === 'refusal') throw new Error('AI ปฏิเสธคำขอนี้ ลองปรับข้อความแล้วลองใหม่');
  if (msg.stop_reason === 'max_tokens') throw new Error('คำตอบ AI ยาวเกินกำหนด ลองแบ่งข้อความให้สั้นลง');
  txt = (msg.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text || ''; }).join('');
  var a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI ตอบรูปแบบไม่ถูกต้อง ลองใหม่อีกครั้ง');
  try { return JSON.parse(txt.slice(a, b + 1)); } catch (e2) { throw new Error('AI ตอบ JSON ไม่สมบูรณ์ ลองใหม่อีกครั้ง'); }
}

/** รันใน Editor หนึ่งครั้งหลังตั้ง ANTHROPIC_API_KEY เพื่ออนุญาตสิทธิ์เชื่อมต่อภายนอกและทดสอบว่า AI ใช้ได้ */
function testAI() {
  var r = callClaude_('ทดสอบการเชื่อมต่อ ตอบเป็น JSON เท่านั้น: {"ok":true,"msg":"พร้อมใช้งาน"}', 1000, 'low');
  Logger.log('AI: ' + (r && r.msg ? r.msg : JSON.stringify(r)));
  return r;
}

function norm100_(map, ids) {
  var raw = ids.map(function (id) { return Math.max(0, Number(map && map[id]) || 0); });
  var sum = raw.reduce(function (a, b) { return a + b; }, 0);
  if (!sum) return null;
  var sc = raw.map(function (v) { return v / sum * 100; }), fl = sc.map(Math.floor);
  var rem = 100 - fl.reduce(function (a, b) { return a + b; }, 0);
  sc.map(function (v, i) { return [v - fl[i], i]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, rem).forEach(function (x) { fl[x[1]]++; });
  var out = {}; ids.forEach(function (id, i) { out[id] = fl[i]; });
  return out;
}

/** AI วิเคราะห์ความเห็นกรรมการ → สัดส่วน PLO รวม 100 + ธงเตือน */
function aiAnalyzeStudent(pid, sid) {
  needP_(SCORE_ROLES_, pid);
  var prog = getProgram(pid);
  var st = prog.students.filter(function (s) { return s.id === sid; })[0];
  if (!st) throw new Error('ไม่พบนักศึกษา');
  var evs = prog.evals.filter(function (e) { return e.studentId === sid; });
  var real = evs.filter(function (e) { return e.email !== SAMPLE_EMAIL; });
  if (real.length) evs = real;
  var withC = evs.filter(function (e) { return e.comment && e.comment.trim(); });
  if (!withC.length) throw new Error('ต้องมีความเห็นของกรรมการอย่างน้อย 1 รายการ');
  var acc = {};
  evs.forEach(function (e) { Object.keys(e.scores).forEach(function (c) { (acc[c] = acc[c] || []).push(e.scores[c]); }); });
  var ids = prog.plos.map(function (p) { return p.id; });
  var plos = prog.plos.map(function (p) {
    var s = 0, n = 0;
    unitsOfPlo_(prog, p).forEach(function (c) { (acc[c.id] || []).forEach(function (v) { s += v; n++; }); });
    return { id: p.id, code: p.code, ชื่อ: p.th, ข้อความ: p.en.replace(/\(draft wording[^)]*\)/i, ''), คะแนนเฉลี่ยเต็ม10: n ? Math.round(s / n * 10) / 10 : null, เกณฑ์: p.crit.map(function (c) { return c.name; }) };
  });
  var prompt = 'คุณช่วยวิเคราะห์การประเมินวิทยานิพนธ์ระดับบัณฑิตศึกษา\nงาน: อ่านความเห็นของกรรมการ แล้วแมปว่าความเห็นกล่าวถึงผลลัพธ์การเรียนรู้ (PLO) ข้อใดบ้างและสัดส่วนเท่าไร พร้อมตรวจว่าคะแนนรูบริกสอดคล้องกับความเห็นหรือไม่\n\nPLO ของหลักสูตร ' + prog.name + ' (พร้อมคะแนนเฉลี่ยของ PLO นั้น เต็ม 10 โดย 9-10 สูงกว่าเป้าหมายมาก, 7-8 ตามเป้าหมาย, 5-6 ใกล้เคียงเป้าหมาย, 3-4 ต่ำกว่าเป้าหมาย, 0-2 ต่ำกว่าเป้าหมายมาก):\n' + JSON.stringify(plos) +
    '\n\nความเห็นของกรรมการ:\n' + withC.map(function (e, i) { return (i + 1) + '. ' + e.name + ': ' + e.comment; }).join('\n') +
    '\n\nตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น รูปแบบ:\n{"shares":{"<id ของ PLO>":จำนวนเต็ม},"evidence":{"<id>":["ข้อความสั้น ๆ ที่ยกมาจากความเห็นจริง"]},"flags":[{"plo":"<id>","type":"ขัดแย้ง" หรือ "ไม่มีหลักฐานในความเห็น" หรือ "คะแนนไม่สะท้อนความเห็น","note":"อธิบายสั้น ๆ ภาษาไทย"}],"summary":"สรุป 1-2 ประโยคภาษาไทย"}\nกติกา: shares ต้องมี id ของทุก PLO รวมกันได้ 100 โดยแบ่งตามสัดส่วนเนื้อหาความเห็นที่เกี่ยวกับ PLO นั้น (0 ถ้าไม่ได้พูดถึง) ห้ามแต่งความเห็นขึ้นเอง ใช้เฉพาะ id ที่ให้ไว้';
  var r = callClaude_(prompt, 1500);
  var shares = norm100_(r.shares, ids);
  if (!shares) throw new Error('AI ไม่ได้แจกสัดส่วน ลองใหม่อีกครั้ง');
  var evd = {};
  ids.forEach(function (id) { var l = r.evidence && r.evidence[id]; if (Object.prototype.toString.call(l) === '[object Array]') evd[id] = l.slice(0, 3).map(function (q) { return String(q).slice(0, 200); }); });
  var flags = (Object.prototype.toString.call(r.flags) === '[object Array]' ? r.flags : []).filter(function (f) { return f && ids.indexOf(f.plo) >= 0; }).slice(0, 8).map(function (f) { return { plo: f.plo, type: String(f.type || '').slice(0, 40), note: String(f.note || '').slice(0, 300) }; });
  var result = { studentId: sid, at: Date.now(), by: me_().name, shares: shares, evidence: evd, flags: flags, summary: String(r.summary || '').slice(0, 400) };
  withLock_(function () {
    var list = readAll_('AI').filter(function (a) { return s_(a.studentId) !== s_(sid); });
    list.push({ studentId: sid, programId: pid, resultJson: JSON.stringify(result), updatedAt: new Date().toISOString() });
    writeAll_('AI', list);
  });
  return result;
}

var BAND_GUIDE_ = 'ช่วงคะแนน (เต็ม 10 ใช้เหมือนกันทุก PLO):\n' +
  'A = 9-10 สูงกว่าเป้าหมายมาก\nB = 7-8 ตามเป้าหมาย\nC = 5-6 ใกล้เคียงเป้าหมาย\nD = 3-4 ต่ำกว่าเป้าหมาย\nE = 0-2 ต่ำกว่าเป้าหมายมาก\n' +
  'คำอธิบายแต่ละช่วงต้องบอกเป็นรูปธรรมว่านักศึกษาต้องแสดงอะไร (สังเกตได้จากเล่มวิทยานิพนธ์ การนำเสนอ หรือการตอบคำถาม) และบอกด้วยว่าอะไรทำให้ได้คะแนนบนหรือล่างของช่วง ' +
  'เช่น ช่วง A: "...  ได้ 10 เมื่อ ... ได้ 9 เมื่อ ..." ช่วง E ให้บอกว่า 0, 1, 2 ต่างกันอย่างไร เขียนภาษาไทย กระชับ แต่ละช่วงไม่เกิน 3 ประโยค';

function cleanBands_(r, maxN) {
  return (r && r.criteria || []).slice(0, maxN || 3).filter(function (c) { return c && c.name && c.bands && c.bands.length === 5; }).map(function (c) {
    return { name: String(c.name).slice(0, 160), bands: c.bands.map(function (x) { return String(x).slice(0, 500); }) };
  });
}

/** AI ร่างเกณฑ์ 5 ช่วงคะแนน (A-E เต็ม 10) สำหรับ PLO เดียว ให้เจ้าหน้าที่ตรวจแก้ก่อนบันทึก */
function aiDraftRubric(pid, ploId) {
  needP_(EDIT_ROLES_, pid);
  var prog = loadProgram_(s_(pid));
  var p = prog && prog.plos.filter(function (x) { return x.id === s_(ploId); })[0];
  if (!p) throw new Error('ไม่พบ PLOs');
  var prompt = 'ช่วยร่างเกณฑ์การประเมินวิทยานิพนธ์ระดับบัณฑิตศึกษา ให้สอดคล้องกับ PLO นี้ของหลักสูตร "' + prog.name + '":\n' + p.code + ' ' + p.th + ': ' + p.en.replace(/\(draft wording[^)]*\)/i, '') + '\n\n' +
    'สร้าง 1-3 ตัวชี้วัด (เกณฑ์) ที่วัดได้จากการสอบวิทยานิพนธ์ แต่ละตัวชี้วัดมีคำอธิบาย 5 ช่วงคะแนน\n' + BAND_GUIDE_ +
    '\nตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น: {"criteria":[{"name":"ชื่อตัวชี้วัดขึ้นต้นด้วยคำว่า การ...","bands":["ช่วง A","ช่วง B","ช่วง C","ช่วง D","ช่วง E"]}]}';
  var list = cleanBands_(callClaude_(prompt, 4000, 'low'), 3);
  if (!list.length) throw new Error('AI ไม่ได้ส่งเกณฑ์ที่ใช้ได้ ลองใหม่อีกครั้ง');
  return list;
}

/**
 * AI ดึง PLO จากข้อความเล่มหลักสูตร (รูปแบบใดก็ได้ จำนวน PLO เท่าไรก็ได้)
 * คืน [{code,titleTh,textEn,crit}] เพื่อแสดงตัวอย่างก่อนนำเข้า เกณฑ์ 5 ช่วงให้ร่างต่อทีละ PLO ด้วย aiDraftRubric
 */
function aiExtractPlos(text) {
  need_(EDIT_ROLES_);
  text = String(text || '').trim();
  if (text.length < 20) throw new Error('วางข้อความจากเล่มหลักสูตรก่อน');
  if (text.length > 60000) throw new Error('ข้อความยาวเกินไป (เกิน 60,000 ตัวอักษร) ให้วางเฉพาะส่วนที่มี PLOs');
  var prompt = 'นี่คือข้อความจากเล่มหลักสูตรระดับบัณฑิตศึกษา:\n<doc>\n' + text + '\n</doc>\n\n' +
    'งาน: ดึงผลลัพธ์การเรียนรู้ระดับหลักสูตร (PLO) ทุกข้อตามที่เขียนไว้ในเอกสาร ไม่แต่งเพิ่ม ไม่รวมหรือแยกข้อเอง ถ้าเอกสารใช้ชื่ออื่น เช่น ผลลัพธ์การเรียนรู้ที่คาดหวัง หรือ ELO ก็ให้นับเป็น PLO ' +
    'ไม่ต้องดึงผลลัพธ์ระดับรายวิชา (CLO) หรือผลลัพธ์ย่อย (Sub-PLO) ถ้ามีทั้ง PLO และข้อย่อย ให้ใช้ระดับ PLO\n' +
    'ตอบเป็น JSON เท่านั้น: {"plos":[{"code":"PLO1","titleTh":"ชื่อสั้นภาษาไทยไม่เกิน 40 ตัวอักษร","text":"ข้อความ PLO ตามต้นฉบับ (ภาษาเดิมของเอกสาร)"}]}';
  var r = callClaude_(prompt, 8000, 'low');
  var seen = {}, out = [];
  (r && r.plos || []).forEach(function (p, i) {
    var body = s_(p && p.text).trim();
    if (body.length < 4) return;
    var code = s_(p.code).replace(/\s+/g, '').toUpperCase() || ('PLO' + (i + 1));
    if (seen[code]) return;
    seen[code] = true;
    out.push({ code: code.slice(0, 20), titleTh: s_(p.titleTh).trim().slice(0, 56) || shortTitle_(body), textEn: body.slice(0, 2000), crit: draftCriteria_(body) });
  });
  if (!out.length) throw new Error('AI ไม่พบ PLOs ในข้อความนี้');
  return out.slice(0, 30);
}

function ploList_(prog) {
  return prog.plos.map(function (p) { return { code: p.code, ชื่อ: p.th, ข้อความ: p.en.replace(/\(draft wording[^)]*\)/i, '') }; });
}

/**
 * AI สร้างหัวข้อการประเมินวิทยานิพนธ์ n ข้อ แต่ละข้อเชื่อม ≥ 2 PLO และรวมกันครอบคลุมทุก PLO
 * คืนเฉพาะชื่อ รายละเอียด และ PLO ที่สอดคล้อง (เกณฑ์ A-E ให้ร่างต่อทีละหัวข้อด้วย aiItemBands เพื่อไม่ให้หมดเวลา)
 */
function aiDraftItems(pid, n) {
  needP_(EDIT_ROLES_, pid);
  var prog = loadProgram_(s_(pid));
  if (!prog) throw new Error('ไม่พบหลักสูตร');
  if (prog.plos.length < 2) throw new Error('หลักสูตรต้องมี PLOs อย่างน้อย 2 ข้อ');
  n = Math.max(2, Math.min(12, Math.round(num_(n, 5))));
  var codes = prog.plos.map(function (p) { return p.code; });
  var prompt = 'คุณช่วยออกแบบแบบประเมินการสอบวิทยานิพนธ์ระดับบัณฑิตศึกษาของหลักสูตร "' + prog.name + '"\n' +
    'PLO ของหลักสูตร:\n' + JSON.stringify(ploList_(prog)) + '\n\n' +
    'งาน: สร้างหัวข้อการประเมินจำนวน ' + n + ' ข้อ ที่กรรมการสอบใช้ให้คะแนนวิทยานิพนธ์ได้จริง (เช่น ที่มาและการทบทวนวรรณกรรม ระเบียบวิธีวิจัย การวิเคราะห์และอภิปรายผล การนำเสนอและตอบคำถาม จริยธรรมและการเขียน) แล้วระบุว่าแต่ละหัวข้อสอดคล้องกับ PLO ใด\n' +
    'กติกาบังคับ: 1) แต่ละหัวข้อต้องสอดคล้องกับ PLO อย่างน้อย 2 ข้อ (แสดงความสัมพันธ์ระหว่าง PLO) 2) รวมทุกหัวข้อแล้วต้องครอบคลุม PLO ครบทุกข้อ (' + codes.join(', ') + ') 3) เชื่อมเฉพาะ PLO ที่หัวข้อนั้นวัดได้จริง อธิบายเหตุผลสั้น ๆ\n' +
    'ตอบเป็น JSON เท่านั้น: {"items":[{"name":"ชื่อหัวข้อการประเมิน","detail":"สิ่งที่กรรมการดู 1-2 ประโยค","plos":["PLO2","PLO4"],"why":"เหตุผลที่สอดคล้องกับ PLO เหล่านี้"}]}';
  var r = callClaude_(prompt, 4000, 'medium');
  var out = (r && r.items || []).slice(0, n).filter(function (it) { return it && it.name; }).map(function (it) {
    return { name: s_(it.name).slice(0, 200), detail: s_(it.detail).slice(0, 600), plos: matchCodes_(it.plos, codes), why: s_(it.why).slice(0, 400) };
  });
  if (!out.length) throw new Error('AI ไม่ได้ส่งหัวข้อที่ใช้ได้ ลองใหม่อีกครั้ง');
  return out;
}

/** AI เขียนเกณฑ์ 5 ช่วง (A-E เต็ม 10) ให้หัวข้อการประเมิน 1 ข้อ โดยอิง PLO ที่หัวข้อนั้นเชื่อมอยู่ */
function aiItemBands(pid, item) {
  needP_(EDIT_ROLES_, pid);
  var prog = loadProgram_(s_(pid));
  if (!prog) throw new Error('ไม่พบหลักสูตร');
  var codes = matchCodes_(item && item.plos, prog.plos.map(function (p) { return p.code; }));
  var linked = ploList_(prog).filter(function (p) { return codes.indexOf(p.code) >= 0; });
  if (!s_(item && item.name).trim()) throw new Error('หัวข้อยังไม่มีชื่อ');
  var prompt = 'ช่วยเขียนเกณฑ์การให้คะแนนการสอบวิทยานิพนธ์ระดับบัณฑิตศึกษา หลักสูตร "' + prog.name + '"\n' +
    'หัวข้อการประเมิน: ' + s_(item.name) + (item.detail ? '\nรายละเอียด: ' + s_(item.detail) : '') + '\n' +
    'หัวข้อนี้ใช้วัด PLO ต่อไปนี้ คำอธิบายทุกช่วงต้องสะท้อน PLO เหล่านี้ทุกข้อ:\n' + JSON.stringify(linked) + '\n\n' + BAND_GUIDE_ +
    '\nตอบเป็น JSON เท่านั้น: {"bands":["ช่วง A","ช่วง B","ช่วง C","ช่วง D","ช่วง E"]}';
  var r = callClaude_(prompt, 3000, 'low');
  if (!r || !r.bands || r.bands.length !== 5) throw new Error('AI ไม่ได้ส่งเกณฑ์ครบ 5 ช่วง ลองใหม่อีกครั้ง');
  return r.bands.map(function (x) { return String(x).slice(0, 500); });
}

/** AI เทียบ PLO ข้ามหลักสูตร + ร่าง PLO หลักสูตรผสมผสาน */
function aiCompare(stats) {
  var me = need_(['admin', 'chair', 'curriculum', 'executive']);
  var progs = readAll_('Programs').filter(function (p) { return inScope_(me, p.programId); }).map(function (p) { return loadProgram_(s_(p.programId)); }).filter(function (p) { return p && p.plos.length; });
  if (progs.length < 2) throw new Error('ต้องมีอย่างน้อย 2 หลักสูตรที่มี PLOs');
  var data = progs.map(function (pr) { return { programId: pr.id, name: pr.name, plos: pr.plos.map(function (p) { return { id: p.id, code: p.code, th: p.th, en: p.en.replace(/\(draft wording[^)]*\)/i, '') }; }) }; });
  var ids = {}; progs.forEach(function (pr) { pr.plos.forEach(function (p) { ids[pr.id + ':' + p.id] = true; }); });
  var pids = {}; progs.forEach(function (pr) { pids[pr.id] = true; });
  function n1(v) { return v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Math.round(Number(v) * 10) / 10; }
  var st = [];
  (Object.prototype.toString.call(stats) === '[object Array]' ? stats : []).forEach(function (x) {
    if (!x || !pids[s_(x.programId)]) return;
    st.push({ programId: s_(x.programId), done: n1(x.done), students: n1(x.students), meanScore: n1(x.mean), passAllPct: n1(x.passAll), outcomeIndex: n1(x.index), plosOnTarget: n1(x.onTarget), ploCount: n1(x.ploCount), perPlo: (Object.prototype.toString.call(x.plos) === '[object Array]' ? x.plos : []).slice(0, 20).map(function (p) { return { code: s_(p.code), meanPct: n1(p.mean), passPct: n1(p.pass) }; }) });
  });
  var prompt = 'คุณช่วยออกแบบและทบทวนหลักสูตรบัณฑิตศึกษา\nนี่คือ PLO ของหลายหลักสูตร (ref ของ PLO คือ programId:id):\n' + JSON.stringify(data) +
    '\n\nงาน: 1) หาคู่ PLO ข้ามหลักสูตรที่มีความหมายคล้ายกัน (ไม่เกิน 8 คู่) พร้อมคะแนนความคล้าย 0-100 และเหตุผลสั้น ๆ 2) เสนอ PLO ที่ควรนำมาใช้ซ้ำในหลักสูตรอื่นหรือหลักสูตรผสมผสาน 3) ร่าง PLO สำหรับหลักสูตรผสมผสานข้ามศาสตร์ 5-8 ข้อ ที่ดึงจุดแข็งของแต่ละหลักสูตร\n4) จากผลลัพธ์การเรียนรู้จริงต่อไปนี้ (done = นักศึกษาที่ประเมินครบ, outcomeIndex เต็ม 100 = 40% คะแนนเฉลี่ย + 30% อัตราผ่าน + 30% สัดส่วน PLO ถึงเป้า) ให้ข้อเสนอรายหลักสูตรว่าควร expand (พิจารณาขยายรับ) / maintain (คงรับและปรับ PLO ที่ต่ำ) / review (ทบทวนก่อน) / insufficient_data (done น้อยกว่า 5) และเสนอไอเดียหลักสูตรใหม่หรือข้ามศาสตร์ที่ดึง PLO แกนร่วมของหลักสูตรที่ผลลัพธ์ดี (ไม่เกิน 3 ไอเดีย) ห้ามอ้างต้นทุนหรือตลาด เพราะไม่มีข้อมูล ให้ระบุข้อจำกัดเมื่อกลุ่มตัวอย่างเล็ก ผลลัพธ์รายหลักสูตร: ' + JSON.stringify(st) + '\nตอบเป็น JSON เท่านั้น:\n{"decisions":[{"programId":"...","recommendation":"expand|maintain|review|insufficient_data","reason":"เหตุผลจากตัวเลข ภาษาไทย"}],"ideas":[{"title":"ชื่อหลักสูตรที่เสนอ","sources":["programId"],"rationale":"...","risk":"..."}],"pairs":[{"a":"prog:id","b":"prog:id","similarity":จำนวนเต็ม,"reason":"..."}],"reuse":[{"ref":"prog:id","why":"..."}],"blended":[{"th":"ข้อความภาษาไทย","en":"English wording","sources":["prog:id"],"rationale":"..."}],"notes":"ข้อควรระวังหนึ่งถึงสองประโยค"}\nใช้เฉพาะ ref ที่ให้ไว้ ตอบเหตุผลเป็นภาษาไทย';
  var r = callClaude_(prompt, 3000);
  function arr(x) { return Object.prototype.toString.call(x) === '[object Array]' ? x : []; }
  var out = {
    at: Date.now(),
    pairs: arr(r.pairs).filter(function (p) { return ids[p.a] && ids[p.b]; }).slice(0, 8).map(function (p) { return { a: p.a, b: p.b, similarity: Math.max(0, Math.min(100, Number(p.similarity) || 0)), reason: String(p.reason || '').slice(0, 300) }; }),
    reuse: arr(r.reuse).filter(function (p) { return ids[p.ref]; }).slice(0, 8).map(function (p) { return { ref: p.ref, why: String(p.why || '').slice(0, 300) }; }),
    blended: arr(r.blended).slice(0, 10).map(function (p) { return { th: String(p.th || '').slice(0, 300), en: String(p.en || '').slice(0, 400), sources: arr(p.sources).filter(function (x) { return ids[x]; }).slice(0, 4), rationale: String(p.rationale || '').slice(0, 300) }; }),
    decisions: arr(r.decisions).filter(function (d) { return d && pids[s_(d.programId)]; }).slice(0, 20).map(function (d) { var rec = String(d.recommendation || ''); if (['expand', 'maintain', 'review', 'insufficient_data'].indexOf(rec) < 0) rec = 'review'; return { programId: s_(d.programId), recommendation: rec, reason: String(d.reason || '').slice(0, 400) }; }),
    ideas: arr(r.ideas).slice(0, 3).map(function (d) { return { title: String(d.title || '').slice(0, 200), sources: arr(d.sources).filter(function (x) { return pids[s_(x)]; }).slice(0, 4), rationale: String(d.rationale || '').slice(0, 400), risk: String(d.risk || '').slice(0, 300) }; }),
    notes: String(r.notes || '').slice(0, 500)
  };
  withLock_(function () { writeAll_('CrossAI', [{ key: 'latest', resultJson: JSON.stringify(out), updatedAt: new Date().toISOString() }]); });
  return out;
}