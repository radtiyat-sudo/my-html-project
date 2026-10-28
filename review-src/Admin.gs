/**
 * Admin.gs — ผู้ดูแลระบบ: ผู้ใช้ สิทธิ์ หน่วยงาน ประเภทคำขอ ชุดเกณฑ์ ค่าตั้งค่า แหล่งข้อมูล และบันทึกการใช้งาน
 */

function userView_(u) {
  return { id: u.id, email: u.email, name: u.name, roles: splitList_(u.roles), units: splitList_(u.units), active: toBool_(u.active), isTest: toBool_(u.isTest), updatedAt: u.updatedAt || u.createdAt };
}

function listUsers_() { requirePerm_('admin.users'); return DB.all('Users').map(userView_); }

function saveUser_(p) {
  requirePerm_('admin.users');
  const email = clean_(p.email, 120).toLowerCase();
  const name = clean_(p.name, 120);
  const roles = [].concat(p.roles || []).filter(function (r) { return ROLES[r]; });
  const units = [].concat(p.units || []).map(function (x) { return clean_(x, 40); }).filter(String);
  if (!name) throw new Error('กรอกชื่อผู้ใช้');
  if (!p.isTest && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง');
  if (!p.isTest && !emailInDomain_(email)) throw new Error('ต้องเป็นอีเมล @' + allowedDomain_() + ' เท่านั้น');
  if (!roles.length) throw new Error('เลือกบทบาทอย่างน้อย 1 บทบาท');
  if (!units.length) throw new Error('เลือกหน่วยงานที่รับผิดชอบ (หรือ * = ทุกหน่วยงาน)');
  const fields = { email: email, name: name, roles: roles.join(','), units: units.join(','), active: p.active !== false };
  const dupe = DB.all('Users').filter(function (u) { return email && u.email.toLowerCase() === email && u.id !== p.id && toBool_(u.isTest) === !!p.isTest; })[0];
  if (dupe) throw new Error('มีผู้ใช้อีเมลนี้แล้ว');
  if (p.id) {
    const cur = DB.get('Users', p.id);
    if (!cur) throw new Error('ไม่พบผู้ใช้');
    if (cur.id === me_().id && (roles.indexOf('admin') === -1 || fields.active === false)) throw new Error('ไม่สามารถถอดสิทธิ์ผู้ดูแลหรือระงับบัญชีของตัวเอง');
    const r = DB.update('Users', cur.id, fields);
    audit_('user.update', 'Users', cur.id, { roles: fields.roles, units: fields.units, active: fields.active }, '');
    return userView_(r);
  }
  if (p.isTest && !toBool_(setting_('TEST_MODE'))) throw new Error('สร้างบัญชีทดสอบได้เฉพาะในโหมดทดสอบ');
  const r = DB.insert('Users', Object.assign(fields, { isTest: !!p.isTest }));
  audit_('user.create', 'Users', r.id, { roles: fields.roles, units: fields.units }, '');
  return userView_(r);
}

function saveUnit_(p) {
  requirePerm_('admin.settings');
  const code = clean_(p.code, 40).toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
  const name = clean_(p.name, 200);
  if (!code || !name) throw new Error('กรอกรหัสและชื่อหน่วยงาน');
  if (code === '*') throw new Error('ใช้ * เป็นรหัสหน่วยงานไม่ได้');
  const cur = p.id ? DB.get('Units', p.id) : null;
  if (DB.all('Units').some(function (u) { return u.code === code && (!cur || u.id !== cur.id); })) throw new Error('รหัสหน่วยงานซ้ำ');
  if (cur && cur.code !== code) throw new Error('เปลี่ยนรหัสหน่วยงานที่สร้างแล้วไม่ได้ (คำขอเดิมอ้างอิงอยู่)');
  const r = cur ? DB.update('Units', cur.id, { name: name, active: p.active !== false }) : DB.insert('Units', { code: code, name: name, active: true });
  audit_('unit.save', 'Units', r.id, ['name', 'active'], '');
  return r;
}

function saveType_(p) {
  requirePerm_('admin.criteria');
  const name = clean_(p.name, 200);
  if (!name) throw new Error('กรอกชื่อประเภทคำขอ');
  const seen = {};
  const docs = [].concat(p.requiredDocs || []).map(function (d) {
    const code = clean_(d.code, 40).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!code || !clean_(d.label)) throw new Error('เอกสารต้องมีรหัส (a-z) และชื่อ');
    if (code === 'evidence' || seen[code]) throw new Error('รหัสเอกสารซ้ำหรือสงวนไว้: ' + code);
    seen[code] = true;
    return { code: code, label: clean_(d.label, 200), when: d.when === 'person_not_in_source' ? 'person_not_in_source' : 'always', hint: clean_(d.hint, 200) };
  });
  const fields = { name: name, description: clean_(p.description, 1000), personRole: clean_(p.personRole, 100), requiredDocs: JSON.stringify(docs), active: p.active !== false, isDemo: !!p.isDemo };
  let r;
  if (p.id) { if (!DB.get('RequestTypes', p.id)) throw new Error('ไม่พบประเภทคำขอ'); r = DB.update('RequestTypes', p.id, fields); }
  else r = DB.insert('RequestTypes', Object.assign(fields, { code: clean_(p.code, 40).toUpperCase() || ('TYPE-' + Utilities.getUuid().slice(0, 5).toUpperCase()) }));
  audit_('type.save', 'RequestTypes', r.id, Object.keys(fields), '');
  return typeView_(r);
}

const SETTING_RULES_ = {
  ORG_NAME: function (v) { return clean_(v, 200); },
  ALLOWED_DOMAIN: function (v) {
    const d = String(v || '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error('โดเมนไม่ถูกต้อง (เช่น mahidol.ac.th)');
    const me = activeEmail_();
    if (me && me.slice(-(d.length + 1)) !== '@' + d) throw new Error('บัญชีที่คุณใช้อยู่ (' + me + ') ไม่อยู่ในโดเมนนี้ — จะทำให้คุณเข้าระบบไม่ได้');
    return d;
  },
  TEST_MODE: function (v) { return toBool_(v) ? 'true' : 'false'; },
  AUTO_REGISTER: function (v) { return toBool_(v) ? 'true' : 'false'; },
  MUHR_MODE: function (v) { if (!SOURCE_MODES[v]) throw new Error('โหมด MUHR ไม่ถูกต้อง'); return v; },
  MUREX_MODE: function (v) { if (!SOURCE_MODES[v]) throw new Error('โหมด MUREX ไม่ถูกต้อง'); return v; },
  SIM_OUTAGE_MUHR: function (v) { return toBool_(v) ? 'true' : 'false'; },
  SIM_OUTAGE_MUREX: function (v) { return toBool_(v) ? 'true' : 'false'; },
  STALE_DAYS: function (v) { const n = Math.floor(Number(v)); if (!(n >= 1 && n <= 3650)) throw new Error('จำนวนวันข้อมูลเก่าต้องอยู่ระหว่าง 1–3650'); return String(n); },
  MAX_FILE_MB: function (v) { const n = Number(v); if (!(n > 0 && n <= 25)) throw new Error('ขนาดไฟล์ต้องอยู่ระหว่าง 1–25 MB'); return String(n); },
  ALLOWED_EXT: function (v) {
    const list = splitList_(String(v).toLowerCase()).filter(function (x) { return FILE_TYPES[x]; });
    if (!list.length) throw new Error('ต้องอนุญาตอย่างน้อย 1 ชนิด (ระบบรองรับ: ' + Object.keys(FILE_TYPES).join(', ') + ')');
    return list.join(',');
  },
  EXTERNAL_NOTIFY: function (v) {
    if (v !== 'off') throw new Error('ยังเปิดการแจ้งเตือนภายนอกไม่ได้ — ต้องกำหนดช่องทาง ผู้รับ และเพิ่มสิทธิ์ส่งอีเมลในโค้ดก่อน (ดูคู่มือ)');
    return 'off';
  }
};

function saveSettings_(p) {
  requirePerm_('admin.settings');
  const patch = {};
  Object.keys(p.settings || {}).forEach(function (k) { if (SETTING_RULES_[k]) patch[k] = SETTING_RULES_[k](p.settings[k]); });
  if (!Object.keys(patch).length) throw new Error('ไม่มีค่าที่เปลี่ยน');
  setSettings_(patch);
  audit_('settings.save', 'Settings', '', patch.MUHR_MODE || patch.MUREX_MODE ? { mode: (patch.MUHR_MODE || '') + '/' + (patch.MUREX_MODE || '') } : Object.keys(patch), '');
  return getSettings_();
}

function adminOverview_() {
  requirePerm_('admin.settings');
  return {
    settings: getSettings_(), toConfirm: TO_CONFIRM, sources: [sourceStatus_('MUHR'), sourceStatus_('MUREX')],
    users: DB.all('Users').map(userView_), units: DB.all('Units'), types: DB.all('RequestTypes').map(typeView_),
    criteria: DB.all('CriteriaSets').map(function (c) { return Object.assign(criteriaView_(c), { createdByName: userName_(c.createdBy), usedBy: DB.all('Requests').filter(function (r) { return r.criteriaSetId === c.id; }).length }); }),
    batches: DB.all('ImportBatches').reverse().slice(0, 30).map(function (b) { return Object.assign({}, b, { createdByName: userName_(b.createdBy) }); }),
    importColumns: IMPORT_COLUMNS
  };
}

function listAudit_(p) {
  requirePerm_('audit.view');
  let rows = DB.all('Audit');
  if (p.entityId) rows = rows.filter(function (r) { return r.entityId === p.entityId; });
  if (p.action) rows = rows.filter(function (r) { return String(r.action).indexOf(p.action) === 0; });
  return rows.slice(-300).reverse().map(function (r) { return Object.assign({}, r, { userName: userName_(r.userId) }); });
}

/** ล้างข้อมูลสาธิต (คำขอสาธิตและข้อมูลที่เกี่ยวข้อง) ก่อนเริ่มใช้งานจริง — ข้อมูลจำลอง MUHR/MUREX และบัญชีทดสอบลบได้ตามตัวเลือก */
function purgeDemo_(p) {
  requirePerm_('admin.settings');
  if (String(p.confirm || '') !== 'ล้างข้อมูลสาธิต') throw new Error('พิมพ์ "ล้างข้อมูลสาธิต" เพื่อยืนยัน');
  const ids = {};
  DB.all('Requests').forEach(function (r) { if (toBool_(r.isDemo)) ids[r.id] = true; });
  const byReq = function (r) { return ids[r.requestId]; };
  DB.all('Attachments').filter(byReq).forEach(function (a) { try { DriveApp.getFileById(a.storageId).setTrashed(true); } catch (e) { /* ไฟล์ถูกลบไปแล้ว */ } });
  const n = { requests: DB.removeWhere('Requests', function (r) { return ids[r.id]; }) };
  ['RequestWorks', 'DupPairs', 'Attachments', 'RevisionItems', 'StaffChecks', 'Evaluations', 'Decisions', 'StatusHistory', 'Notifications'].forEach(function (t) { n[t] = DB.removeWhere(t, byReq); });
  if (p.mockSources) { n.persons = DB.removeWhere('Persons', function (r) { return r.origin === 'mock'; }); n.works = DB.removeWhere('SourceWorks', function (r) { return r.origin === 'mock'; }); }
  if (p.testUsers) n.testUsers = DB.removeWhere('Users', function (u) { return toBool_(u.isTest); });
  audit_('demo.purge', 'Requests', '', Object.keys(n), JSON.stringify(n));
  return n;
}
