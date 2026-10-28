/**
 * Auth.gs — ผู้ใช้ บทบาท ขอบเขตงาน และการตรวจสิทธิ์ (ทำที่ฝั่งเซิร์ฟเวอร์ทุกครั้ง)
 *
 * การเข้าสู่ระบบ: ใช้บัญชี Google ของผู้ใช้ (Session.getActiveUser) จับคู่กับชีต Users
 * โหมดทดสอบ (TEST_MODE=true): เลือกเข้าใช้เป็น "บัญชีทดสอบ" ได้ เพื่อทดลองทุกบทบาท — ต้องปิดก่อนใช้งานจริง
 */

let CURRENT_USER_ = null;

function activeEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}

/** อ่านผู้ใช้ของคำขอนี้ — p._as (บัญชีทดสอบ) และ p._role (บทบาทที่กำลังใช้) มาจากหน้าเว็บ แต่ถูกตรวจซ้ำที่นี่เสมอ */
function resolveUser_(p) {
  p = p || {};
  CURRENT_USER_ = null;
  const email = activeEmail_();
  const testMode = toBool_(setting_('TEST_MODE'));
  let rec = null;
  if (p._as) {
    if (!testMode) throw new Error('ปิดโหมดทดสอบแล้ว กรุณาเข้าใช้ด้วยบัญชีจริง (โหลดหน้าใหม่)');
    rec = DB.get('Users', p._as);
    if (!rec || !toBool_(rec.isTest)) throw new Error('ไม่พบบัญชีทดสอบนี้');
  } else if (email) {
    rec = DB.all('Users').filter(function (u) { return String(u.email).toLowerCase() === email && !toBool_(u.isTest); })[0] || null;
  }
  if (!rec) return { email: email, user: null, testMode: testMode };
  if (!toBool_(rec.active)) throw new Error('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  const roles = splitList_(rec.roles).filter(function (r) { return ROLES[r]; });
  if (!roles.length) throw new Error('บัญชีนี้ยังไม่ได้รับบทบาท กรุณาติดต่อผู้ดูแลระบบ');
  const role = roles.indexOf(p._role) > -1 ? p._role : roles[0];
  const units = splitList_(rec.units);
  CURRENT_USER_ = {
    id: rec.id, email: rec.email, name: rec.name, roles: roles, role: role, units: units,
    allUnits: units.indexOf('*') > -1, isTest: toBool_(rec.isTest), signedInAs: email
  };
  return { email: email, user: CURRENT_USER_, testMode: testMode };
}

function me_() {
  if (!CURRENT_USER_) throw new Error('กรุณาเข้าสู่ระบบ');
  return CURRENT_USER_;
}

function can_(perm) {
  const u = CURRENT_USER_;
  return !!(u && PERMS[perm] && PERMS[perm].indexOf(u.role) > -1);
}

function requirePerm_(perm) {
  if (!can_(perm)) throw new Error('ไม่มีสิทธิ์ทำรายการนี้ (บทบาทปัจจุบัน: ' + (CURRENT_USER_ ? ROLES[CURRENT_USER_.role].label : 'ไม่ได้เข้าสู่ระบบ') + ')');
}

function inScope_(unit, user) {
  const u = user || CURRENT_USER_;
  if (!u) return false;
  return u.allUnits || u.units.indexOf(String(unit)) > -1;
}

/** ผู้ใช้ปัจจุบันเห็นคำขอนี้ได้หรือไม่ — ตามบทบาทและขอบเขตงาน */
function canViewRequest_(req) {
  const u = CURRENT_USER_;
  if (!u || !req) return false;
  switch (u.role) {
    case 'admin': return true;
    case 'requester': return req.requesterId === u.id;
    case 'staff': return req.status !== 'draft' && inScope_(req.unit, u);
    case 'reviewer': return req.reviewerId === u.id;
    default: return false;
  }
}

function loadRequestFor_(id) {
  const req = DB.get('Requests', id);
  if (!req || !canViewRequest_(req)) throw new Error('ไม่พบคำขอ หรือไม่มีสิทธิ์เข้าถึงคำขอนี้');
  return req;
}

function userRec_(id) { return DB.get('Users', id); }

function userName_(id) {
  if (!id) return '';
  const u = USER_NAME_CACHE_[id] || DB.get('Users', id);
  if (!u) return '(ผู้ใช้ที่ถูกลบ)';
  USER_NAME_CACHE_[id] = u;
  return u.name;
}
const USER_NAME_CACHE_ = {};

function userHasRole_(u, role) { return splitList_(u.roles).indexOf(role) > -1; }

/** ผู้ใช้ที่มีบทบาท role และรับผิดชอบหน่วยงาน unit (ใช้หาเจ้าหน้าที่/ผู้พิจารณาที่มอบหมายได้) */
function usersFor_(role, unit, isTestPool) {
  return DB.all('Users').filter(function (u) {
    if (!toBool_(u.active) || !userHasRole_(u, role)) return false;
    if (isTestPool !== undefined && toBool_(u.isTest) !== !!isTestPool) return false;
    const units = splitList_(u.units);
    return units.indexOf('*') > -1 || units.indexOf(String(unit)) > -1;
  });
}
