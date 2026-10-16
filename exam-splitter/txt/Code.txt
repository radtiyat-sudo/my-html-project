/**
 * ตัวช่วยจัดการเอกสาร
 * ประมวลผล PDF ในเบราว์เซอร์ของผู้ใช้ทั้งหมด — ไม่มีการส่ง PDF มายัง Apps Script หรือ Drive
 *
 * วิธีใช้: วางไฟล์นี้ใน Code.gs และสร้างไฟล์ HTML ชื่อ Index (วางเนื้อหาจาก Index.html)
 * แล้ว Deploy → New deployment → Web app
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ตัวช่วยจัดการเอกสาร')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // SECURITY: ห้ามเว็บอื่นฝังหน้านี้ใน iframe (กัน clickjacking) — อย่าเปลี่ยนเป็น ALLOWALL
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
