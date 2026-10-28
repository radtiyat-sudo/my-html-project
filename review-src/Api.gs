/**
 * Api.gs — จุดเรียกเดียวจากหน้าเว็บ: google.script.run.api(action, payload)
 * ทุกคำสั่งระบุตัวผู้ใช้ใหม่และตรวจสิทธิ์ที่ฝั่งเซิร์ฟเวอร์ (ไม่เชื่อสิทธิ์ที่หน้าเว็บส่งมา)
 */

/** คำสั่งที่อ่านอย่างเดียว (ไม่ต้องล็อก) */
const READ_ONLY_ = ['boot', 'dashboard', 'listRequests', 'getRequest', 'searchPersons', 'sourceWorks', 'downloadFile', 'report', 'notifications', 'adminOverview', 'listUsers', 'importBatch', 'listAudit', 'completeness'];

const ACTIONS_ = {
  boot: boot_,
  dashboard: dashboard_,
  listRequests: function (p) { return listRequests_(p); },
  getRequest: getRequest_,
  completeness: function (p) { return completeness_(loadRequestFor_(p.id)); },

  // ผู้ยื่นเรื่อง
  createRequest: createRequest_,
  updateInfo: updateInfo_,
  searchPersons: function (p) { if (!can_('request.create') && !can_('request.review')) requirePerm_('request.create'); return searchPersons_(p); },
  setPerson: setPerson_,
  sourceWorks: sourceWorksFor_,
  addSourceWorks: addSourceWorks_,
  saveManualWork: saveManualWork_,
  withdrawWork: withdrawWork_,
  uploadFile: uploadFile_,
  removeFile: removeFile_,
  downloadFile: downloadFile_,
  respondRevision: respondRevision_,
  submit: submit_,
  cancel: cancel_,

  // เจ้าหน้าที่
  claim: claim_,
  assign: assign_,
  confirmIdentity: confirmIdentity_,
  verifyWork: verifyWork_,
  resolveDup: resolveDup_,
  setWorksComplete: setWorksComplete_,
  staffCheck: staffCheck_,
  rerun: rerun_,
  returnForRevision: returnForRevision_,
  forward: forward_,
  close: close_,

  // ผู้พิจารณา
  decide: decide_,

  // ทุกบทบาท
  report: report_,
  notifications: function () { return DB.all('Notifications').filter(function (n) { return n.userId === me_().id; }).reverse().slice(0, 50); },
  markRead: function (p) {
    const mine = DB.all('Notifications').filter(function (n) { return n.userId === me_().id && !n.readAt && (!p.id || n.id === p.id); });
    mine.forEach(function (n) { DB.update('Notifications', n.id, { readAt: nowIso_() }); });
    return mine.length;
  },

  // ผู้ดูแลระบบ
  adminOverview: adminOverview_,
  listUsers: listUsers_,
  saveUser: saveUser_,
  saveUnit: saveUnit_,
  saveType: saveType_,
  saveCriteria: saveCriteriaDraft_,
  activateCriteria: activateCriteria_,
  retireCriteria: retireCriteria_,
  saveSettings: saveSettings_,
  importPreview: importPreview_,
  importBatch: function (p) { requirePerm_('admin.data'); return importBatchView_(p.batchId); },
  importCommit: importCommit_,
  importDiscard: importDiscard_,
  listAudit: listAudit_,
  purgeDemo: purgeDemo_
};

function api(action, payload) {
  const p = payload || {};
  let lock = null;
  try {
    ensureSchema_();
    const who = resolveUser_(p);
    delete p._as; delete p._role;
    const fn = ACTIONS_[action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + action);
    if (!who.user && action !== 'boot') throw new Error(who.domainBlocked ? 'ไม่มีสิทธิ์ใช้งาน — ต้องเข้าสู่ระบบด้วยบัญชี @' + who.domain : 'ไม่มีสิทธิ์ใช้งาน — บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ');
    if (READ_ONLY_.indexOf(action) === -1) { lock = LockService.getScriptLock(); lock.waitLock(20000); }
    const data = fn(p, who);
    return JSON.parse(JSON.stringify({ ok: true, data: data }));
  } catch (e) {
    const out = { ok: false, error: e && e.message ? e.message : String(e) };
    if (e && e.sourceError) out.sourceError = e.sourceError;
    return out;
  } finally {
    if (lock) try { lock.releaseLock(); } catch (e) { /* ignore */ }
  }
}

/** ข้อมูลเริ่มต้นของหน้าเว็บ: ผู้ใช้ บทบาท ค่าคงที่ และบัญชีทดสอบ (เฉพาะโหมดทดสอบ) */
function boot_(p, who) {
  const s = getSettings_();
  const base = {
    app: APP, org: s.ORG_NAME, testMode: who.testMode, signedInEmail: who.email, domainBlocked: !!who.domainBlocked, allowedDomain: allowedDomain_(),
    testAccounts: who.testMode && !who.domainBlocked ? DB.all('Users').filter(function (u) { return toBool_(u.isTest) && toBool_(u.active); }).map(function (u) { return { id: u.id, name: u.name, roles: splitList_(u.roles), units: splitList_(u.units) }; }) : []
  };
  if (!who.user) return Object.assign(base, { user: null });
  return Object.assign(base, {
    user: who.user,
    meta: {
      roles: ROLES, statuses: STATUSES, sections: SECTIONS, workTypes: WORK_TYPES, degrees: DEGREES, ranks: RANKS, empStatus: EMP_STATUS,
      ruleKinds: RULE_KINDS, results: RESULT_LABEL, decisions: DECISION_LABEL, identity: IDENTITY_LABEL, sourceModes: SOURCE_MODES,
      allowedExt: splitList_(s.ALLOWED_EXT), maxFileMb: Number(s.MAX_FILE_MB), staleDays: Number(s.STALE_DAYS)
    },
    units: DB.all('Units').filter(function (u) { return toBool_(u.active); }),
    types: DB.all('RequestTypes').filter(function (t) { return toBool_(t.active); }).map(function (t) {
      const c = activeCriteriaFor_(t.id);
      return Object.assign(typeView_(t), { criteria: c ? { id: c.id, name: c.name, version: c.version, isDemo: toBool_(c.isDemo), effectiveDate: c.effectiveDate, referenceSource: c.referenceSource } : null });
    }),
    sources: [sourceStatus_('MUHR'), sourceStatus_('MUREX')],
    unread: DB.all('Notifications').filter(function (n) { return n.userId === who.user.id && !n.readAt; }).length
  });
}

/** งานที่ต้องทำของแต่ละบทบาท */
function dashboard_() {
  const u = me_();
  const list = listRequests_({});
  const by = function (st) { return list.filter(function (r) { return r.status === st; }); };
  const out = { role: u.role, tasks: [], counts: {}, recent: list.slice(0, 8) };
  Object.keys(STATUSES).forEach(function (s) { out.counts[s] = by(s).length; });
  const task = function (key, label, items, hint, tone) { if (items.length) out.tasks.push({ key: key, label: label, count: items.length, items: items.slice(0, 6), hint: hint, tone: tone || 'info' }); };
  if (u.role === 'requester') {
    task('returned', 'ถูกส่งกลับให้แก้ไข', by('returned'), 'เปิดคำขอ แก้ส่วนที่ระบุ ตอบรายการแก้ไข แล้วยื่นใหม่', 'warning');
    task('draft', 'ร่างที่ยังไม่ได้ยื่น', by('draft'), 'ตรวจความครบถ้วนแล้วกดยื่นคำขอ', 'info');
    task('waiting', 'อยู่ระหว่างดำเนินการ', list.filter(function (r) { return ['submitted', 'in_review', 'pending_decision', 'decided'].indexOf(r.status) > -1; }), 'ไม่ต้องทำอะไร — ติดตามสถานะได้ที่หน้าคำขอ', 'neutral');
  } else if (u.role === 'staff') {
    task('unassigned', 'คำขอใหม่ที่ยังไม่มีผู้รับ', list.filter(function (r) { return r.status === 'submitted' && !r.assigneeId; }), 'กด "รับเรื่อง" เพื่อเริ่มตรวจ', 'warning');
    task('mine', 'คำขอที่ฉันกำลังตรวจ/ถูกยื่นใหม่', list.filter(function (r) { return ['in_review', 'submitted'].indexOf(r.status) > -1 && r.assigneeId === u.id; }), 'ยืนยันตัวบุคคลและผลงาน แล้วส่งกลับแก้ไขหรือส่งต่อผู้พิจารณา', 'info');
    task('toclose', 'พิจารณาแล้ว รอแจ้งผลและปิดงาน', by('decided'), 'แจ้งผลและปิดงาน', 'success');
    task('returned', 'รอผู้ยื่นแก้ไข', by('returned'), 'ไม่ต้องทำอะไรจนกว่าผู้ยื่นจะยื่นใหม่', 'neutral');
  } else if (u.role === 'reviewer') {
    task('decide', 'รอคุณพิจารณา', by('pending_decision'), 'ดูผลตรวจรายเกณฑ์และหลักฐาน แล้วบันทึกผลพร้อมเหตุผล', 'warning');
  } else if (u.role === 'admin') {
    const s = getSettings_();
    const alerts = [];
    if (toBool_(s.TEST_MODE)) alerts.push({ tone: 'warning', text: 'โหมดทดสอบเปิดอยู่ — ทุกคนที่เข้าเว็บเลือกใช้บัญชีทดสอบได้ ต้องปิดก่อนใช้งานจริง' });
    ['MUHR', 'MUREX'].forEach(function (k) { const st = sourceStatus_(k); alerts.push({ tone: st.mode === 'mock' || st.outage ? 'warning' : 'info', text: k + ': ' + st.modeLabel + ' — ' + st.message }); });
    const demoActive = DB.all('CriteriaSets').filter(function (c) { return c.status === 'active' && toBool_(c.isDemo); }).length;
    if (demoActive) alerts.push({ tone: 'warning', text: 'มีชุดเกณฑ์สำหรับสาธิตเปิดใช้อยู่ ' + demoActive + ' ชุด — ใช้กับคำขอสาธิตเท่านั้น' });
    const realActive = DB.all('CriteriaSets').filter(function (c) { return c.status === 'active' && !toBool_(c.isDemo); }).length;
    if (!realActive) alerts.push({ tone: 'info', text: 'ยังไม่มีชุดเกณฑ์จริงที่ยืนยันแล้ว — ต้องได้รับเกณฑ์ ประกาศอ้างอิง และผู้ยืนยันจากหน่วยงาน' });
    out.alerts = alerts;
    out.pendingImports = DB.all('ImportBatches').filter(function (b) { return b.status === 'preview'; }).length;
  }
  return out;
}
