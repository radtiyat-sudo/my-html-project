/**
 * ระบบช่วยแยกเอกสาร
 * ประมวลผล PDF ในเบราว์เซอร์ของผู้ใช้ทั้งหมด — ไม่มีการส่ง PDF มายัง Apps Script หรือ Drive
 *
 * วิธีใช้: วางไฟล์นี้ใน Code.gs และสร้างไฟล์ HTML ชื่อ Index (วางเนื้อหาจาก Index.html)
 * แล้ว Deploy → New deployment → Web app
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบช่วยแยกเอกสาร')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
