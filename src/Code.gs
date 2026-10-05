/**
 * Code.gs — จุดเริ่มต้นของ Web App และเมนูใน Google Sheets
 *
 * ติดตั้ง: ดู README.md (หัวข้อ "การติดตั้ง")
 *  1) เปิด Google Sheets ใหม่ → ส่วนขยาย → Apps Script → วางไฟล์ทั้งหมดในโฟลเดอร์ src/
 *  2) รันฟังก์ชัน setup() หนึ่งครั้งเพื่อสร้างชีตและอนุญาตสิทธิ์
 *  3) การทำให้ใช้งานได้ → การทำให้ใช้งานได้รายการใหม่ → เว็บแอป
 */

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP.name;
  return t.evaluate()
    .setTitle(APP.name + ' — ' + APP.code)
    .setFaviconUrl('https://www.gstatic.com/images/icons/material/system/1x/school_black_48dp.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** ใช้ใน template: <?!= include('Styles') ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** รันครั้งแรกจากตัวแก้ไขสคริปต์: สร้างชีต, ตั้งผู้รันเป็น Admin */
function setup() {
  ensureSchema_(true);
  const me = currentUser_();
  Logger.log('ฐานข้อมูล: ' + getDb_().getUrl());
  Logger.log('ผู้ใช้ปัจจุบัน: ' + me.email + ' (' + me.roleLabel + ')');
  return getDb_().getUrl();
}

/** เติมข้อมูลตัวอย่างจากตัวแก้ไขสคริปต์ (ทางเลือก — ทำได้จากหน้าเว็บเช่นกัน) */
function setupWithSampleData() {
  setup();
  return seedSampleData_();
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🎓 ' + APP.code)
      .addItem('ตั้งค่าเริ่มต้น (สร้างชีต)', 'setup')
      .addItem('เติมข้อมูลตัวอย่าง', 'setupWithSampleData')
      .addSeparator()
      .addItem('เปิดลิงก์เว็บแอป', 'showWebAppUrl_')
      .addToUi();
  } catch (e) { /* ไม่ได้เปิดจาก Sheets */ }
}

function showWebAppUrl_() {
  const url = ScriptApp.getService().getUrl();
  const html = url
    ? '<p style="font-family:sans-serif">เปิดระบบได้ที่:<br><a href="' + url + '" target="_blank">' + url + '</a></p>'
    : '<p style="font-family:sans-serif">ยังไม่ได้ Deploy เป็นเว็บแอป — ไปที่ Apps Script → การทำให้ใช้งานได้ → การทำให้ใช้งานได้รายการใหม่ → เว็บแอป</p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(140), APP.name);
}
