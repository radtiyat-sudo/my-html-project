/**
 * Files.gs — ไฟล์แนบ/หลักฐาน
 *
 * - เก็บใน Google Drive ของผู้ Deploy ในโฟลเดอร์ส่วนตัว (ไม่แชร์ ไม่สร้างลิงก์สาธารณะ)
 * - หน้าเว็บไม่เคยได้รับรหัสไฟล์ Drive — เปิดไฟล์ได้ผ่าน api('downloadFile') ที่ตรวจสิทธิ์ต่อคำขอทุกครั้งเท่านั้น
 * - ตรวจชนิดไฟล์จากนามสกุล + เนื้อไฟล์จริง (magic bytes) และจำกัดขนาด
 */

function storageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FILES_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* โฟลเดอร์ถูกลบ → สร้างใหม่ */ } }
  const f = DriveApp.createFolder('RV — ไฟล์แนบคำขอ (ห้ามแชร์โฟลเดอร์นี้)');
  props.setProperty('FILES_FOLDER_ID', f.getId());
  return f;
}

function safeFileName_(n) {
  const s = clean_(n, 150).replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+/, '');
  return s || 'file';
}

/** ตรวจไฟล์: นามสกุลที่อนุญาต ขนาด และเนื้อไฟล์ตรงชนิด — คืน {ext, mime, bytes} */
function checkUpload_(fileName, b64) {
  const ext = (String(fileName).match(/\.([a-z0-9]+)$/i) || [])[1];
  const allowed = splitList_(setting_('ALLOWED_EXT')).map(function (x) { return x.toLowerCase(); });
  if (!ext || allowed.indexOf(ext.toLowerCase()) === -1 || !FILE_TYPES[ext.toLowerCase()]) throw new Error('ชนิดไฟล์ไม่อนุญาต — รับเฉพาะ ' + allowed.join(', '));
  const t = FILE_TYPES[ext.toLowerCase()];
  const data = String(b64 || '');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(data)) throw new Error('ข้อมูลไฟล์ไม่ถูกต้อง');
  const bytes = Utilities.base64Decode(data);
  const max = (Number(setting_('MAX_FILE_MB')) || 10) * 1024 * 1024;
  if (!bytes.length) throw new Error('ไฟล์ว่างเปล่า');
  if (bytes.length > max) throw new Error('ไฟล์ใหญ่เกิน ' + setting_('MAX_FILE_MB') + ' MB');
  const ok = t.magic.every(function (b, i) { return ((bytes[i] + 256) % 256) === b; });
  if (!ok) throw new Error('เนื้อไฟล์ไม่ตรงกับชนิด .' + ext + ' (ไฟล์อาจเสียหายหรือเปลี่ยนนามสกุล)');
  return { ext: ext.toLowerCase(), mime: t.mime, bytes: bytes };
}

function uploadFile_(p) {
  const req = loadRequestFor_(p.id);
  const docType = clean_(p.docType, 40);
  let workId = '';
  if (p.workId) {
    requireEditable_(req, 'works');
    const w = DB.get('RequestWorks', p.workId);
    if (!w || w.requestId !== req.id) throw new Error('ไม่พบผลงาน');
    workId = w.id;
  } else {
    requireEditable_(req, 'documents');
    if (!docType) throw new Error('เลือกชนิดเอกสาร');
  }
  const name = safeFileName_(p.fileName);
  const f = checkUpload_(name, p.data);
  const blob = Utilities.newBlob(f.bytes, f.mime, req.code + '_' + name);
  const file = storageFolder_().createFile(blob);
  const a = DB.insert('Attachments', {
    requestId: req.id, workId: workId, docType: workId ? 'evidence' : docType, fileName: name, mime: f.mime, size: f.bytes.length,
    storageId: file.getId(), status: 'active', uploadedBy: me_().id, uploadedAt: nowIso_()
  });
  if (workId) DB.update('RequestWorks', workId, { evidenceId: a.id });
  audit_('file.upload', 'Attachments', a.id, ['docType', 'size'], '');
  return attachmentView_(a);
}

/** นำไฟล์ออกจากคำขอ — เก็บประวัติและไฟล์เดิมไว้ (สถานะ removed) */
function removeFile_(p) {
  const a = DB.get('Attachments', p.fileId);
  if (!a || a.status !== 'active') throw new Error('ไม่พบไฟล์');
  const req = loadRequestFor_(a.requestId);
  requireEditable_(req, a.workId ? 'works' : 'documents');
  DB.update('Attachments', a.id, { status: 'removed', removedBy: me_().id, removedAt: nowIso_() });
  audit_('file.remove', 'Attachments', a.id, { status: 'removed' }, '');
  return true;
}

/** เปิดไฟล์ — ตรวจสิทธิ์ต่อคำขอทุกครั้ง ผู้ยื่นเห็นเฉพาะไฟล์ที่ยังใช้งาน */
function downloadFile_(p) {
  const a = DB.get('Attachments', p.fileId);
  if (!a) throw new Error('ไม่พบไฟล์ หรือไม่มีสิทธิ์เปิดไฟล์นี้');
  const req = DB.get('Requests', a.requestId);
  if (!canViewRequest_(req)) {
    audit_('file.denied', 'Attachments', a.id, [], 'ไม่มีสิทธิ์');
    throw new Error('ไม่พบไฟล์ หรือไม่มีสิทธิ์เปิดไฟล์นี้');
  }
  if (a.status !== 'active' && me_().role === 'requester') throw new Error('ไฟล์นี้ถูกนำออกแล้ว');
  const bytes = DriveApp.getFileById(a.storageId).getBlob().getBytes();
  audit_('file.download', 'Attachments', a.id, [], '');
  return { fileName: a.fileName, mime: a.mime, data: Utilities.base64Encode(bytes) };
}
