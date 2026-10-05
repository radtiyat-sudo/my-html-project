/**
 * Auth.gs — ระบุตัวผู้ใช้จากบัญชี Google และตรวจสิทธิ์ตามบทบาท
 *
 * - ผู้ใช้คนแรกที่เปิดระบบ (ตาราง Users ว่าง) จะเป็น Admin อัตโนมัติ
 * - Admin สามารถ "ดูในมุมมองบทบาทอื่น" เพื่อทดสอบสิทธิ์ได้ (เก็บใน UserProperties ของ Admin เท่านั้น)
 */

let CURRENT_USER_ = null;

function currentUser_() {
  if (CURRENT_USER_) return CURRENT_USER_;
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const users = DB.all('Users');
  let rec = email ? users.filter(function (u) { return String(u.email).toLowerCase() === email && toBool_(u.active); })[0] : null;

  if (!rec && users.length === 0) {
    const owner = email || String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    rec = DB.insert('Users', { email: owner, name: 'ผู้ดูแลระบบ', role: 'admin', active: true, isSample: false });
    audit_('first_admin', owner);
  }

  const settings = getSettings_();
  let role = rec ? rec.role : (toBool_(settings.ALLOW_GUEST) ? 'executive' : 'none');
  const realRole = role;
  let facultyId = rec ? rec.facultyId : '';
  let curriculumIds = rec ? splitIds_(rec.curriculumIds) : [];

  if (realRole === 'admin') {
    const view = PropertiesService.getUserProperties().getProperty('VIEW_AS');
    if (view) {
      try {
        const v = JSON.parse(view);
        if (ROLES[v.role]) { role = v.role; facultyId = v.facultyId || facultyId; curriculumIds = []; }
      } catch (e) { /* ignore */ }
    }
  }

  // ประธานหลักสูตร: หลักสูตรที่กำหนดในตารางผู้ใช้ + หลักสูตรที่ตนเป็นประธาน
  if (role === 'chair' && facultyId) {
    DB.all('Curricula').forEach(function (c) {
      if (c.chairFacultyId === facultyId && curriculumIds.indexOf(c.id) === -1) curriculumIds.push(c.id);
    });
  }

  CURRENT_USER_ = {
    email: email || (rec ? rec.email : ''),
    name: rec ? (rec.name || email) : (email || 'ผู้เยี่ยมชม'),
    role: role, realRole: realRole,
    roleLabel: ROLES[role] ? ROLES[role].label : 'ไม่มีสิทธิ์',
    roleEn: ROLES[role] ? ROLES[role].en : '',
    facultyId: facultyId, curriculumIds: curriculumIds,
    permissions: PERMISSIONS[role] || [],
    viewingAs: realRole === 'admin' && role !== 'admin'
  };
  return CURRENT_USER_;
}

function can_(perm) { return currentUser_().permissions.indexOf(perm) > -1; }

function requireRole_(roles) {
  const u = currentUser_();
  if (roles.indexOf(u.role) === -1) throw new Error('คุณไม่มีสิทธิ์ทำรายการนี้ (บทบาท: ' + u.roleLabel + ')');
}

/** ผู้ใช้แก้ไขผลงานของบุคคลนี้ได้หรือไม่ */
function canEditPerson_(personType, personId) {
  const u = currentUser_();
  if (u.role === 'admin') return true;
  if (u.role === 'executive' || u.role === 'none') return false;
  if (personType === 'expert') return u.role === 'chair';
  if (u.role === 'lecturer') return personId === u.facultyId;
  if (u.role === 'chair') {
    if (personId === u.facultyId) return true;
    const f = DB.get('Faculty', personId);
    return !!f && splitIds_(f.curriculumIds).some(function (c) { return u.curriculumIds.indexOf(c) > -1; });
  }
  return false;
}

function canVerifyPub_(pub) {
  const u = currentUser_();
  if (u.role === 'admin') return true;
  if (u.role !== 'chair') return false;
  if (pub.personType === 'expert') return true;
  if (pub.personId === u.facultyId) return false; // ไม่ตรวจรับรองผลงานตนเอง
  const f = DB.get('Faculty', pub.personId);
  return !!f && splitIds_(f.curriculumIds).some(function (c) { return u.curriculumIds.indexOf(c) > -1; });
}
