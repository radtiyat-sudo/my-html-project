/**
 * แบบประเมินค่าดัชนีความสอดคล้อง (IOC) สำหรับผู้เชี่ยวชาญ
 * เรื่อง การประเมินความต้องการจำเป็นของผู้ใช้บริการที่มีต่อคุณภาพการบริการของศูนย์ MU Sport Complex
 *
 * วิธีใช้ (ดูรายละเอียดใน README.md)
 * 1) เปิด Google Sheets ใหม่ → ส่วนขยาย → Apps Script → วางไฟล์นี้ใน Code.gs และสร้างไฟล์ HTML ชื่อ Index
 * 2) รันฟังก์ชัน setupSheets 1 ครั้ง → ระบบสร้างแท็บ "ผู้เชี่ยวชาญ" "คำตอบ" "สรุป IOC"
 * 3) การทำให้ใช้งานได้ → เว็บแอป (ดำเนินการในฐานะ: ฉัน / ผู้มีสิทธิ์เข้าถึง: ทุกคน)
 * 4) กรอกรายชื่อผู้เชี่ยวชาญ แล้วใช้เมนู "📋 แบบประเมิน IOC → ส่งอีเมลเชิญผู้เชี่ยวชาญ"
 * ทุกครั้งที่ผู้เชี่ยวชาญส่งแบบประเมิน ระบบคำนวณ IOC ใหม่ลงแท็บ "สรุป IOC" ให้อัตโนมัติ
 */

// =====================================================================
// ตั้งค่า (แก้เฉพาะส่วนนี้)
// =====================================================================
const CONFIG = {
  TITLE: 'แบบประเมินความสอดคล้องของข้อคำถาม (IOC)',
  SUBTITLE: 'เรื่อง การประเมินความต้องการจำเป็นของผู้ใช้บริการที่มีต่อคุณภาพการบริการของศูนย์ MU Sport Complex มหาวิทยาลัยมหิดล',
  RESEARCHER: '',            // ชื่อผู้วิจัย (แสดงในอีเมลและหน้าแบบประเมิน) เช่น 'นางสาว ก. ข.'
  DEADLINE: '',              // กำหนดส่ง (ข้อความ) เช่น '20 ตุลาคม 2569' — เว้นว่าง = ไม่แสดง

  // ID ของ Spreadsheet (ส่วนระหว่าง /d/ และ /edit ใน URL)
  // เว้นว่างได้ถ้าเปิด Apps Script จาก "ส่วนขยาย → Apps Script" ของชีตนั้น
  SPREADSHEET_ID: '',
  // URL เว็บแอป (ลงท้าย /exec) — เว้นว่าง = ให้ระบบหาเอง
  WEBAPP_URL: '',

  PASS_IOC: 0.5,             // IOC ≥ ค่านี้ = ข้อคำถามใช้ได้
  REQUIRE_TOKEN: false,      // true = ต้องเปิดจากลิงก์ส่วนตัว (?t=...) เท่านั้น
  NOTIFY_ON_SUBMIT: true,    // ส่งอีเมลแจ้งผู้วิจัยเมื่อมีผู้เชี่ยวชาญส่งแบบประเมิน
  NOTIFY_EMAILS: [],         // ผู้รับอีเมลแจ้ง — เว้นว่าง = บัญชีที่รันสคริปต์

  SHEETS: { EXPERTS: 'ผู้เชี่ยวชาญ', RESPONSES: 'คำตอบ', SUMMARY: 'สรุป IOC' }
};

// =====================================================================
// รายชื่อผู้เชี่ยวชาญ (แสดงในช่องเลือกชื่อ และเพิ่มลงแท็บ "ผู้เชี่ยวชาญ" เมื่อรัน setupSheets)
// เพิ่มอีเมลในแท็บ "ผู้เชี่ยวชาญ" ภายหลังได้ ถ้าจะส่งลิงก์ทางอีเมล
// =====================================================================
const EXPERTS = [
  { name: 'อาจารย์ ดร. เอกรัตน์ อ่อนน้อม', workplace: 'วิทยาลัยวิทยาศาสตร์และเทคโนโลยีการกีฬา' },
  { name: 'อาจารย์ ดร. สัจจวัฒน์ จารึกศิลป์', workplace: 'มหาวิทยาลัยเทคโนโลยีราชมงคลตะวันออก วิทยาเขตจักรพงษภูวนารถ คณะศิลปศาสตร์' },
  { name: 'อาจารย์ ดร. อนุชิต กุลวานิช', workplace: 'วิทยาลัยนวัตกรรมและการจัดการ มหาวิทยาลัยราชภัฏสวนสุนันทา' }
];

// =====================================================================
// ข้อคำถาม (จากไฟล์แบบประเมิน) — code ต้องไม่ซ้ำกัน
// =====================================================================
const SECTIONS = [
  {
    id: 'P1', part: 'ส่วนที่ 1', title: 'ข้อมูลทั่วไป', subtitle: 'จำนวน 4 ข้อ',
    items: [
      { code: 'G1', no: '1', text: 'เพศ', options: ['ชาย', 'หญิง', 'เพศทางเลือก'] },
      { code: 'G2', no: '2', text: 'อายุ', options: ['18 - 25 ปี', '26 - 35 ปี', '36 - 45 ปี', '46 - 55 ปี', '56 ปีขึ้นไป'] },
      { code: 'G3', no: '3', text: 'ประเภทผู้ใช้บริการ', options: ['นักศึกษาระดับปริญญาตรี', 'บุคลากร มหาวิทยาลัยมหิดล', 'บุคคลทั่วไป'] },
      { code: 'G4', no: '4', text: 'ความถี่ในการใช้บริการ (โดยเฉลี่ย)', options: ['น้อยกว่า 1 ครั้ง/สัปดาห์', '1 - 2 ครั้ง/สัปดาห์', '3 - 4 ครั้ง/สัปดาห์', '5 ครั้ง/สัปดาห์ ขึ้นไป'] }
    ]
  },
  {
    id: 'D1', part: 'ส่วนที่ 2 · มิติที่ 1', title: 'ด้านรูปธรรมของการบริการ', subtitle: 'Tangibles',
    items: [
      { code: '1.1', no: '1.1', text: 'อุปกรณ์กีฬาและเครื่องเล่นฟิตเนสมีความทันสมัยและสภาพสมบูรณ์' },
      { code: '1.2', no: '1.2', text: 'อาคารสถานที่ ห้องน้ำ ห้องอาบน้ำ และห้องเปลี่ยนเสื้อผ้ามีความสะอาด' },
      { code: '1.3', no: '1.3', text: 'สภาพแวดล้อมโดยรวมและภูมิทัศน์ของศูนย์กีฬามีความเป็นระเบียบเรียบร้อย' },
      { code: '1.4', no: '1.4', text: 'บุคลากรผู้ให้บริการแต่งกายสุภาพ เหมาะสม และมีลักษณะภายนอกที่ดี' },
      { code: '1.5', no: '1.5', text: 'ป้ายสัญลักษณ์ ข้อมูล และสื่อประชาสัมพันธ์ภายในศูนย์กีฬามีความชัดเจน' }
    ]
  },
  {
    id: 'D2', part: 'ส่วนที่ 2 · มิติที่ 2', title: 'ด้านความเชื่อมั่นไว้วางใจ', subtitle: 'Reliability',
    items: [
      { code: '2.1', no: '2.1', text: 'ระบบการจองสนาม/คลาส มีความแม่นยำและไม่เกิดความผิดพลาด' },
      { code: '2.2', no: '2.2', text: 'เวลาการเปิด-ปิดให้บริการตรงต่อเวลาตามที่ประกาศไว้' },
      { code: '2.3', no: '2.3', text: 'การดำเนินการเรียกเก็บค่าบริการ/ค่าสมาชิก มีความถูกต้อง โปร่งใส' },
      { code: '2.4', no: '2.4', text: 'อุปกรณ์กีฬาและเครื่องเล่นพร้อมใช้งาน ไม่มีป้ายแจ้งซ่อมบำรุงทิ้งไว้นาน' },
      { code: '2.5', no: '2.5', text: 'เมื่อเกิดปัญหา ศูนย์กีฬาสามารถแก้ไขปัญหาและรักษาสัญญาได้ตามที่ตกลงไว้' }
    ]
  },
  {
    id: 'D3', part: 'ส่วนที่ 2 · มิติที่ 3', title: 'ด้านการตอบสนองต่อผู้รับบริการ', subtitle: 'Responsiveness',
    items: [
      { code: '3.1', no: '3.1', text: 'บุคลากรมีความเต็มใจและกระตือรือร้นที่จะให้ความช่วยเหลือผู้ใช้บริการเสมอ' },
      { code: '3.2', no: '3.2', text: 'ขั้นตอนการลงทะเบียนหรือให้บริการหน้าเคาน์เตอร์มีความรวดเร็ว' },
      { code: '3.3', no: '3.3', text: 'บุคลากรสามารถให้คำแนะนำและแก้ปัญหาเฉพาะหน้าได้อย่างทันท่วงทีรวดเร็ว (เช่น ระบบออนไลน์/คิวอัจฉริยะ)' },
      { code: '3.4', no: '3.4', text: 'ศูนย์กีฬามีการตอบคำถาม/ข้อสงสัยผ่านช่องทางติดต่อต่างๆ ได้อย่างรวดเร็ว' },
      { code: '3.5', no: '3.5', text: 'ความพร้อมของบุคลากรในการรับมือกับสถานการณ์ฉุกเฉินหรืออุบัติเหตุ' }
    ]
  },
  {
    id: 'D4', part: 'ส่วนที่ 2 · มิติที่ 4', title: 'ด้านการประกันความมั่นใจ', subtitle: 'Assurance',
    items: [
      { code: '4.1', no: '4.1', text: 'บุคลากรและผู้ฝึกสอนมีความรู้ความเชี่ยวชาญในการให้คำแนะนำการออกกำลังกาย' },
      { code: '4.2', no: '4.2', text: 'บุคลากรมีมารยาท สุภาพอ่อนน้อม ทำให้ผู้ใช้บริการเกิดความไว้วางใจ' },
      { code: '4.3', no: '4.3', text: 'ศูนย์กีฬามีระบบรักษาความปลอดภัยที่เป็นมาตรฐาน เช่น มี รปภ., กล้องวงจรปิด' },
      { code: '4.4', no: '4.4', text: 'ท่านรู้สึกปลอดภัยในการใช้ชีวิตและทรัพย์สินระหว่างอยู่ภายในบริเวณศูนย์กีฬา' },
      { code: '4.5', no: '4.5', text: 'ภาพลักษณ์และชื่อเสียงของศูนย์กีฬาทำให้ท่านรู้สึกมั่นใจในคุณภาพการบริการ' }
    ]
  },
  {
    id: 'D5', part: 'ส่วนที่ 2 · มิติที่ 5', title: 'ด้านความเอาใจใส่ต่อผู้รับบริการ', subtitle: 'Empathy',
    items: [
      { code: '5.1', no: '5.1', text: 'บุคลากรให้ความสนใจและดูแลผู้ใช้บริการแต่ละท่านอย่างเป็นรายบุคคล' },
      { code: '5.2', no: '5.2', text: 'ศูนย์กีฬามีความเข้าใจและพยายามตอบสนองความต้องการเฉพาะบุคคล' },
      { code: '5.3', no: '5.3', text: 'ช่วงเวลาทำการมีความยืดหยุ่นและสะดวกต่อรูปแบบการใช้ชีวิตของท่าน' },
      { code: '5.4', no: '5.4', text: 'การให้บริการเป็นไปด้วยความเท่าเทียม ไม่มีการเลือกปฏิบัติ' },
      { code: '5.5', no: '5.5', text: 'ศูนย์กีฬามีความใส่ใจในการรับฟังข้อเสนอแนะเพื่อนำไปปรับปรุงแก้ไข' }
    ]
  }
];

const EXPERT_HEADERS = ['ลำดับ', 'ชื่อ-นามสกุล', 'สถานที่ทำงาน', 'อีเมล', 'รหัส', 'ลิงก์ส่วนตัว', 'สถานะ', 'ส่งอีเมลเมื่อ', 'ตอบเมื่อ'];
const STATUS = { NEW: 'ยังไม่ส่ง', SENT: 'ส่งลิงก์แล้ว', DONE: 'ตอบแล้ว' };

function allItems_() {
  const out = [];
  SECTIONS.forEach(s => s.items.forEach(it => out.push(Object.assign({ section: s }, it))));
  return out;
}

function responseHeaders_() {
  const items = allItems_();
  return ['ส่งเมื่อ', 'รหัส', 'ชื่อ-นามสกุล', 'ตำแหน่ง/สังกัด']
    .concat(items.map(it => it.code))
    .concat(items.map(it => 'ข้อเสนอแนะ ' + it.code))
    .concat(['ข้อเสนอแนะเพิ่มเติม']);
}

// =====================================================================
// เมนูในชีต และการตั้งค่าชีต
// =====================================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📋 แบบประเมิน IOC')
    .addItem('1) สร้าง/ตรวจแท็บข้อมูล', 'setupSheets')
    .addItem('2) สร้างลิงก์ส่วนตัวให้ผู้เชี่ยวชาญ', 'generateLinks')
    .addItem('3) ส่งอีเมลเชิญผู้เชี่ยวชาญ (คนที่ยังไม่ส่ง)', 'sendInvitations')
    .addItem('ส่งอีเมลเตือนคนที่ยังไม่ตอบ', 'sendReminders')
    .addSeparator()
    .addItem('คำนวณ IOC ใหม่', 'computeIOC')
    .addItem('เปิดหน้าแบบประเมิน (ลิงก์กลาง)', 'showWebAppUrl')
    .addToUi();
}

function ss_() {
  return CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** สร้างแท็บ ผู้เชี่ยวชาญ / คำตอบ / สรุป IOC (รันซ้ำได้ ไม่ลบข้อมูลเดิม) */
function setupSheets() {
  const ex = sheet_(CONFIG.SHEETS.EXPERTS, EXPERT_HEADERS);
  // เพิ่มผู้เชี่ยวชาญจาก EXPERTS ที่ยังไม่มีในแท็บ
  const have0 = readExperts_().rows.map(r => normName_(r.name));
  const add = EXPERTS.filter(e => have0.indexOf(normName_(e.name)) === -1);
  if (add.length) {
    const start = ex.getLastRow() + 1;
    ex.getRange(start, 1, add.length, 3).setValues(add.map((e, i) => [start - 1 + i, e.name, e.workplace]));
  }
  ex.setColumnWidth(2, 220); ex.setColumnWidth(3, 220); ex.setColumnWidth(4, 220); ex.setColumnWidth(6, 320);

  const res = sheet_(CONFIG.SHEETS.RESPONSES, responseHeaders_());
  const have = res.getRange(1, 1, 1, res.getLastColumn()).getValues()[0];
  const want = responseHeaders_();
  const missing = want.filter(h => have.indexOf(h) === -1);
  if (missing.length) {
    res.getRange(1, have.length + 1, 1, missing.length).setValues([missing])
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
  }

  sheet_(CONFIG.SHEETS.SUMMARY);
  computeIOC();
  alert_('✅ พร้อมใช้งาน\n\n1) กรอกชื่อ ตำแหน่ง และอีเมลผู้เชี่ยวชาญในแท็บ "' + CONFIG.SHEETS.EXPERTS + '"\n' +
    '2) Deploy เป็นเว็บแอป (ผู้มีสิทธิ์เข้าถึง: ทุกคน)\n3) เมนู 📋 แบบประเมิน IOC → ส่งอีเมลเชิญผู้เชี่ยวชาญ');
}

// =====================================================================
// ผู้เชี่ยวชาญ: ลิงก์ส่วนตัว / ส่งอีเมล
// =====================================================================
function webAppUrl_() {
  const url = CONFIG.WEBAPP_URL || ScriptApp.getService().getUrl();
  if (!url) throw new Error('ยังไม่ได้ Deploy เป็นเว็บแอป หรือใส่ CONFIG.WEBAPP_URL');
  return url;
}

function showWebAppUrl() {
  alert_('ลิงก์กลางของแบบประเมิน (ผู้เชี่ยวชาญกรอกชื่อเอง):\n\n' + webAppUrl_());
}

function readExperts_() {
  const sh = sheet_(CONFIG.SHEETS.EXPERTS, EXPERT_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return { sh: sh, rows: [] };
  const values = sh.getRange(2, 1, last - 1, EXPERT_HEADERS.length).getValues();
  const rows = values.map((r, i) => ({
    row: i + 2, name: String(r[1]).trim(), position: String(r[2]).trim(), email: String(r[3]).trim(),
    token: String(r[4]).trim(), status: String(r[6]).trim()
  })).filter(r => r.name && !/^ตัวอย่าง/.test(r.name));
  return { sh: sh, rows: rows };
}

/** สร้างรหัสและลิงก์ส่วนตัวให้ทุกคนที่ยังไม่มี */
function generateLinks() {
  const rows = ensureLinks_();
  alert_('สร้างลิงก์ส่วนตัวแล้ว ' + rows.length + ' คน (ดูคอลัมน์ "ลิงก์ส่วนตัว")');
}

function ensureLinks_() {
  const data = readExperts_();
  const url = webAppUrl_();
  data.rows.forEach((r, i) => {
    if (!r.token) r.token = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    data.sh.getRange(r.row, 1).setValue(i + 1);
    data.sh.getRange(r.row, 5, 1, 2).setValues([[r.token, url + '?t=' + r.token]]);
    if (!r.status) { r.status = STATUS.NEW; data.sh.getRange(r.row, 7).setValue(STATUS.NEW); }
  });
  return data.rows;
}

function sendInvitations() { sendMail_('invite'); }
function sendReminders() { sendMail_('remind'); }

function sendMail_(kind) {
  const rows = ensureLinks_();
  const sh = sheet_(CONFIG.SHEETS.EXPERTS);
  const url = webAppUrl_();
  let sent = 0, skipped = 0;
  rows.forEach(r => {
    const want = kind === 'invite' ? (r.status === STATUS.NEW || !r.status) : r.status === STATUS.SENT;
    if (!want || !r.email) { skipped++; return; }
    const link = url + '?t=' + r.token;
    const subject = (kind === 'remind' ? '[แจ้งเตือน] ' : '') + 'ขอความอนุเคราะห์ตรวจสอบความสอดคล้องของข้อคำถาม (IOC)';
    MailApp.sendEmail({
      to: r.email,
      subject: subject,
      name: CONFIG.RESEARCHER || undefined,
      htmlBody: inviteHtml_(r, link, kind)
    });
    sh.getRange(r.row, 7, 1, 2).setValues([[STATUS.SENT, new Date()]]);
    sent++;
  });
  alert_('ส่งอีเมลแล้ว ' + sent + ' คน' + (skipped ? '\nข้าม ' + skipped + ' คน (ไม่มีอีเมล หรือสถานะไม่ตรง)' : ''));
}

function inviteHtml_(r, link, kind) {
  const esc = escapeHtml_;
  return '<div style="font-family:Sarabun,Tahoma,sans-serif;font-size:15px;line-height:1.7;color:#1f2937;max-width:560px">' +
    '<p>เรียน ' + esc(r.name) + '</p>' +
    (kind === 'remind' ? '<p>ขออนุญาตเรียนเตือนอีกครั้ง ' : '<p>') +
    'ผู้วิจัยขอความอนุเคราะห์ท่านในฐานะผู้เชี่ยวชาญ พิจารณาความสอดคล้องของข้อคำถาม (IOC) ' +
    esc(CONFIG.SUBTITLE) + ' จำนวน ' + allItems_().length + ' ข้อ ใช้เวลาประมาณ 10 นาที</p>' +
    (CONFIG.DEADLINE ? '<p><b>กำหนดส่ง:</b> ' + esc(CONFIG.DEADLINE) + '</p>' : '') +
    '<p style="margin:24px 0"><a href="' + esc(link) + '" style="background:#1d4ed8;color:#fff;text-decoration:none;' +
    'padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block">เปิดแบบประเมิน</a></p>' +
    '<p style="color:#6b7280;font-size:13px">ลิงก์นี้เป็นลิงก์ส่วนตัวของท่าน สามารถเปิดกลับมาแก้ไขคำตอบได้</p>' +
    '<p>ขอขอบพระคุณเป็นอย่างสูง<br>' + esc(CONFIG.RESEARCHER || 'ผู้วิจัย') + '</p></div>';
}

// =====================================================================
// เว็บแอป (หน้าแบบประเมิน)
// =====================================================================
function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.token = String((e && e.parameter && e.parameter.t) || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  return t.evaluate()
    .setTitle('แบบประเมิน IOC')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** ข้อมูลที่หน้าเว็บใช้แสดงแบบประเมิน (และคำตอบเดิมถ้าเคยส่งแล้ว) */
function getFormData(token) {
  const expert = token ? readExperts_().rows.filter(r => r.token === token)[0] || null : null;
  let previous = null;
  if (expert) {
    const found = findResponseRow_(token, expert.name);
    if (found) previous = found.answer;
  }
  return {
    title: CONFIG.TITLE,
    subtitle: CONFIG.SUBTITLE,
    researcher: CONFIG.RESEARCHER,
    deadline: CONFIG.DEADLINE,
    sections: SECTIONS,
    total: allItems_().length,
    expert: expert ? { name: expert.name, position: expert.position } : null,
    experts: expertChoices_(),
    tokenValid: !!expert,
    tokenGiven: !!token,
    requireToken: CONFIG.REQUIRE_TOKEN,
    previous: previous
  };
}

/** รายชื่อสำหรับช่องเลือกชื่อ: จากแท็บ "ผู้เชี่ยวชาญ" รวมกับ EXPERTS (ไม่ซ้ำกัน) */
function expertChoices_() {
  const out = [], seen = {};
  readExperts_().rows.map(r => ({ name: r.name, workplace: r.position }))
    .concat(EXPERTS)
    .forEach(e => {
      const k = normName_(e.name);
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push({ name: e.name, workplace: e.workplace || '' });
    });
  return out;
}

/** รับคำตอบจากหน้าเว็บ: { token, name, position, scores:{code:-1|0|1}, comments:{code:text}, overall } */
function submitEvaluation(data) {
  data = data || {};
  const token = String(data.token || '').trim();
  const experts = readExperts_();
  let expert = token ? experts.rows.filter(r => r.token === token)[0] : null;
  if (CONFIG.REQUIRE_TOKEN && !expert) throw new Error('ลิงก์ไม่ถูกต้อง กรุณาใช้ลิงก์ส่วนตัวจากอีเมล');

  const name = clip_(data.name || (expert && expert.name)).slice(0, 200);
  const position = clip_(data.position || (expert && expert.position)).slice(0, 200);
  if (!name) throw new Error('กรุณากรอกชื่อ-นามสกุล');
  if (!expert) expert = experts.rows.filter(r => normName_(r.name) === normName_(name))[0] || null;

  const items = allItems_();
  const scores = data.scores || {}, comments = data.comments || {};
  const missing = items.filter(it => [1, 0, -1].indexOf(Number(scores[it.code])) === -1 || scores[it.code] === '' || scores[it.code] == null);
  if (missing.length) throw new Error('ยังไม่ได้ประเมินข้อ ' + missing.map(it => it.no).join(', '));

  let found = null, summary = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(CONFIG.SHEETS.RESPONSES, responseHeaders_());
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const rowObj = {
      'ส่งเมื่อ': new Date(), 'รหัส': expert ? expert.token : token, 'ชื่อ-นามสกุล': name, 'ตำแหน่ง/สังกัด': position,
      'ข้อเสนอแนะเพิ่มเติม': clip_(data.overall)
    };
    items.forEach(it => {
      rowObj[it.code] = Number(scores[it.code]);
      rowObj['ข้อเสนอแนะ ' + it.code] = clip_(comments[it.code]);
    });
    const values = headers.map(h => rowObj.hasOwnProperty(h) ? rowObj[h] : '');

    found = findResponseRow_(rowObj['รหัส'], name);
    const rowNo = found ? found.row : sh.getLastRow() + 1;
    sh.getRange(rowNo, 1, 1, values.length).setValues([values]);
    sh.getRange(rowNo, 1).setNumberFormat('d/m/yyyy HH:mm');

    if (expert) experts.sh.getRange(expert.row, 7).setValue(STATUS.DONE);
    if (expert) experts.sh.getRange(expert.row, 9).setValue(new Date());
    // ผู้เชี่ยวชาญแก้สถานที่ทำงานในแบบประเมิน → อัปเดตในแท็บ "ผู้เชี่ยวชาญ" ด้วย
    if (expert && position && position !== expert.position) experts.sh.getRange(expert.row, 3).setValue(position);
    SpreadsheetApp.flush();
    summary = computeIOC();
  } finally {
    lock.releaseLock();
  }

  if (CONFIG.NOTIFY_ON_SUBMIT) notifyOwner_(name, summary);
  return { ok: true, updated: !!found, count: summary.n };
}

/** ตัดข้อความยาวเกิน และกันข้อความที่ขึ้นต้นด้วย = + - @ ถูกตีความเป็นสูตร */
function clip_(s) {
  const t = String(s || '').trim().slice(0, 2000);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}
function normName_(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

/** หาแถวคำตอบเดิมจากรหัส (หรือชื่อ ถ้าไม่มีรหัส) */
function findResponseRow_(token, name) {
  const sh = sheet_(CONFIG.SHEETS.RESPONSES, responseHeaders_());
  const last = sh.getLastRow();
  if (last < 2) return null;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  const iTok = headers.indexOf('รหัส'), iName = headers.indexOf('ชื่อ-นามสกุล');
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const match = token ? String(r[iTok]) === String(token) : (!r[iTok] && normName_(r[iName]) === normName_(name));
    if (match) return { row: i + 2, answer: rowToAnswer_(headers, r) };
  }
  return null;
}

function rowToAnswer_(headers, r) {
  const ans = { scores: {}, comments: {}, overall: '', name: '', position: '' };
  headers.forEach((h, i) => {
    if (h === 'ชื่อ-นามสกุล') ans.name = String(r[i]);
    else if (h === 'ตำแหน่ง/สังกัด') ans.position = String(r[i]);
    else if (h === 'ข้อเสนอแนะเพิ่มเติม') ans.overall = String(r[i]);
    else if (/^ข้อเสนอแนะ /.test(h)) ans.comments[h.replace('ข้อเสนอแนะ ', '')] = String(r[i]);
    else if (h && r[i] !== '' && ['ส่งเมื่อ', 'รหัส'].indexOf(h) === -1) ans.scores[h] = Number(r[i]);
  });
  return ans;
}

function notifyOwner_(name, summary) {
  try {
    const to = CONFIG.NOTIFY_EMAILS.length ? CONFIG.NOTIFY_EMAILS.join(',') : Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      subject: 'ได้รับแบบประเมิน IOC จาก ' + name + ' (รวม ' + summary.n + ' คน)',
      htmlBody: '<div style="font-family:Sarabun,Tahoma,sans-serif;font-size:15px;line-height:1.7">' +
        '<p><b>' + escapeHtml_(name) + '</b> ส่งแบบประเมินแล้ว — ตอนนี้มีผู้เชี่ยวชาญตอบแล้ว ' + summary.n + ' คน</p>' +
        '<p>IOC เฉลี่ยทั้งฉบับ: <b>' + summary.mean.toFixed(2) + '</b><br>' +
        'ข้อที่ใช้ได้ (IOC ≥ ' + CONFIG.PASS_IOC.toFixed(2) + '): <b>' + summary.pass + '</b> ข้อ · ' +
        'ข้อที่ควรปรับปรุง: <b style="color:#b91c1c">' + summary.fail + '</b> ข้อ' +
        (summary.failList.length ? ' (' + summary.failList.join(', ') + ')' : '') + '</p>' +
        '<p><a href="' + ss_().getUrl() + '">เปิดแท็บ "' + CONFIG.SHEETS.SUMMARY + '"</a></p></div>'
    });
  } catch (err) {
    console.warn('notifyOwner_: ' + err);
  }
}

// =====================================================================
// ประมวลผล IOC
// IOC = ΣR / N   (R = คะแนนของผู้เชี่ยวชาญแต่ละคน +1/0/-1, N = จำนวนผู้เชี่ยวชาญ)
// IOC ≥ 0.50 → ข้อคำถามใช้ได้   IOC < 0.50 → ควรปรับปรุง/ตัดทิ้ง
// =====================================================================
function computeIOC() {
  const items = allItems_();
  const res = sheet_(CONFIG.SHEETS.RESPONSES, responseHeaders_());
  const headers = res.getRange(1, 1, 1, res.getLastColumn()).getValues()[0];
  const answers = res.getLastRow() < 2 ? [] :
    res.getRange(2, 1, res.getLastRow() - 1, headers.length).getValues()
      .filter(r => r[headers.indexOf('ชื่อ-นามสกุล')] !== '')
      .map(r => rowToAnswer_(headers, r));
  const n = answers.length;

  const sh = sheet_(CONFIG.SHEETS.SUMMARY);
  sh.clear();

  const width = 3 + n + 4;
  const title = [['สรุปผลการหาค่าดัชนีความสอดคล้อง (IOC)']];
  sh.getRange(1, 1).setValues(title).setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 1).setValue(CONFIG.SUBTITLE).setFontColor('#475569');
  sh.getRange(3, 1).setValue('IOC = ΣR / N  ·  เกณฑ์: IOC ≥ ' + CONFIG.PASS_IOC.toFixed(2) + ' = ใช้ได้  ·  อัปเดตล่าสุด ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd/M/yyyy HH:mm')).setFontColor('#475569');

  // รายชื่อผู้เชี่ยวชาญ
  let r = 5;
  sh.getRange(r, 1).setValue('ผู้เชี่ยวชาญ (N = ' + n + ')').setFontWeight('bold');
  answers.forEach((a, i) => sh.getRange(r + 1 + i, 1, 1, 3).setValues([['คนที่ ' + (i + 1), a.name, a.position]]));
  r += Math.max(n, 1) + 2;

  // ตารางรายข้อ
  const head = ['ข้อ', 'ส่วน/มิติ', 'ข้อคำถาม']
    .concat(answers.map((a, i) => 'คนที่ ' + (i + 1)))
    .concat(['ΣR', 'IOC', 'ผลการพิจารณา', 'ข้อเสนอแนะจากผู้เชี่ยวชาญ']);
  const tableTop = r;
  sh.getRange(r, 1, 1, width).setValues([head])
    .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  r++;

  const out = { n: n, pass: 0, fail: 0, mean: 0, failList: [], sections: [] };
  const rows = [], colors = [];
  let sumAll = 0;
  SECTIONS.forEach(sec => {
    let secSum = 0;
    sec.items.forEach(it => {
      const rs = answers.map(a => a.scores[it.code]).map(v => (v === 1 || v === 0 || v === -1) ? v : '');
      const sigma = rs.reduce((s, v) => s + (v === '' ? 0 : v), 0);
      const ioc = n ? sigma / n : '';
      const ok = n && ioc >= CONFIG.PASS_IOC;
      const result = !n ? 'ยังไม่มีผู้ตอบ' : ok ? 'ใช้ได้' : 'ควรปรับปรุง';
      const notes = answers.map((a, i) => a.comments[it.code] ? 'คนที่ ' + (i + 1) + ': ' + a.comments[it.code] : '')
        .filter(String).join('\n');
      rows.push([it.no, sec.part + ' ' + sec.title, it.text].concat(rs).concat([n ? sigma : '', ioc, result, notes]));
      colors.push(!n ? '#ffffff' : ok ? '#dcfce7' : '#fee2e2');
      if (n) { if (ok) out.pass++; else { out.fail++; out.failList.push(it.no); } }
      secSum += n ? ioc : 0; sumAll += n ? ioc : 0;
    });
    out.sections.push({ name: sec.part + ' ' + sec.title, mean: n ? secSum / sec.items.length : 0, count: sec.items.length });
  });
  out.mean = n ? sumAll / items.length : 0;

  const body = sh.getRange(r, 1, rows.length, width);
  body.setValues(rows).setVerticalAlignment('top').setWrap(true);
  sh.getRange(r, 4, rows.length, n + 1).setHorizontalAlignment('center');
  sh.getRange(r, 4 + n + 1, rows.length, 1).setNumberFormat('0.00').setHorizontalAlignment('center').setFontWeight('bold');
  const resultCol = sh.getRange(r, 4 + n + 2, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold');
  resultCol.setBackgrounds(colors.map(c => [c]));
  sh.getRange(tableTop, 1, rows.length + 1, width).setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  r += rows.length + 2;

  // สรุปภาพรวม
  sh.getRange(r, 1).setValue('สรุปภาพรวม').setFontWeight('bold').setFontSize(12);
  const sumRows = [
    ['จำนวนผู้เชี่ยวชาญ (N)', n, ''],
    ['จำนวนข้อคำถามทั้งหมด', items.length, 'ข้อ'],
    ['ข้อที่ใช้ได้ (IOC ≥ ' + CONFIG.PASS_IOC.toFixed(2) + ')', n ? out.pass : '-', 'ข้อ'],
    ['ข้อที่ควรปรับปรุง (IOC < ' + CONFIG.PASS_IOC.toFixed(2) + ')', n ? out.fail : '-', out.failList.length ? 'ข้อ ' + out.failList.join(', ') : 'ข้อ'],
    ['IOC เฉลี่ยทั้งฉบับ', n ? out.mean : '-', '']
  ].concat(out.sections.map(s => ['IOC เฉลี่ย ' + s.name, n ? s.mean : '-', '']));
  sh.getRange(r + 1, 1, sumRows.length, 3).setValues(sumRows);
  sh.getRange(r + 1, 2, sumRows.length, 1).setNumberFormat('0.00').setHorizontalAlignment('center').setFontWeight('bold');
  sh.getRange(r + 1, 2, 2, 1).setNumberFormat('0');
  sh.getRange(r + 3, 2, 2, 1).setNumberFormat('0');

  sh.setColumnWidth(1, 70); sh.setColumnWidth(2, 220); sh.setColumnWidth(3, 380);
  for (let c = 4; c < 4 + n; c++) sh.setColumnWidth(c, 70);
  sh.setColumnWidth(4 + n, 60); sh.setColumnWidth(5 + n, 70); sh.setColumnWidth(6 + n, 120); sh.setColumnWidth(7 + n, 360);
  sh.setFrozenRows(0);
  return out;
}

// =====================================================================
// ตัวช่วย
// =====================================================================
function escapeHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** แสดงข้อความในชีต (ถ้ารันจากตัวแก้ไขสคริปต์ จะเขียนลง Log แทน) */
function alert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
