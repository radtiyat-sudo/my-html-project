/**
 * Api.gs — จุดเรียกใช้เดียวจากหน้าเว็บ: google.script.run.api(action, payload)
 * ทุก action ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ และคืน { ok, data, model? }
 */

function api(action, payload) {
  const lock = LockService.getScriptLock();
  const writes = !/^(bootstrap|assess|exportReport|audit|findAuthors|findWorks|searchAll|analyzeDocument|saveEvidence|journalStats|apiKeysStatus|testApiKeys)$/.test(action);
  try {
    ensureSchema_();
    if (writes) lock.waitLock(20000);
    const u = currentUser_();
    if (u.role === 'none') throw new Error('บัญชี ' + (u.email || '(ไม่ทราบอีเมล)') + ' ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
    const fn = ACTIONS_[action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + action);
    const data = fn(payload || {});
    const out = { ok: true, data: data === undefined ? null : data };
    if (writes || action === 'bootstrap') {
      out.user = currentUser_();
      out.model = buildModel_(out.user);
      if (out.user.realRole === 'admin') out.users = DB.all('Users');
    }
    return JSON.parse(JSON.stringify(out));
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  } finally {
    if (writes) try { lock.releaseLock(); } catch (e) { /* not held */ }
  }
}

const ACTIONS_ = {
  bootstrap: function () { return { meta: meta_() }; },

  /* ---------- ผลงานวิชาการ ---------- */
  savePublication: function (p) {
    const personType = p.personType === 'expert' ? 'expert' : 'faculty';
    if (!p.personId) throw new Error('กรุณาเลือกเจ้าของผลงาน');
    if (!String(p.title || '').trim()) throw new Error('กรุณากรอกชื่อผลงาน');
    const year = Number(p.year);
    if (!(year >= 2500 && year <= 2700)) throw new Error('ปีที่ตีพิมพ์ต้องเป็นปี พ.ศ. (เช่น 2567)');
    if (!PUB_TYPES[p.type]) throw new Error('ประเภทผลงานไม่ถูกต้อง');
    if (!canEditPerson_(personType, p.personId)) throw new Error('คุณไม่มีสิทธิ์แก้ไขผลงานของบุคคลนี้');
    const u = currentUser_();
    const rec = {
      personType: personType, personId: p.personId, title: String(p.title).trim(), source: p.source || '',
      year: year, type: p.type, database: p.type === 'journal' ? (DATABASES[p.database] ? p.database : 'none') : 'none',
      quartile: p.type === 'journal' && (DATABASES[p.database] || {}).quartile && /^Q[1-4]$/.test(p.quartile) ? p.quartile : '',
      authorRole: p.authorRole || '', doi: p.doi || '', url: p.url || '', note: p.note || ''
    };
    if (p.id) {
      const old = DB.get('Publications', p.id);
      if (!old) throw new Error('ไม่พบผลงาน');
      if (!canEditPerson_(old.personType, old.personId)) throw new Error('คุณไม่มีสิทธิ์แก้ไขผลงานนี้');
      if (old.status === 'verified' && u.role === 'lecturer') throw new Error('ผลงานที่รับรองแล้วแก้ไขไม่ได้ กรุณาติดต่อประธานหลักสูตร');
      // แก้ไขสาระสำคัญ → กลับไปรอตรวจใหม่ (ยกเว้นผู้ตรวจแก้เอง)
      const keyChanged = ['title', 'year', 'type', 'database', 'quartile'].some(function (k) { return String(old[k]) !== String(rec[k]); });
      if (keyChanged && !canVerifyPub_(Object.assign({}, old, rec))) Object.assign(rec, { status: 'pending', verifiedBy: '', verifiedAt: '' });
      audit_('update_pub', p.id + ' ' + rec.title);
      return DB.update('Publications', p.id, rec);
    }
    rec.status = 'pending';
    rec.createdBy = u.email;
    rec.isSample = false;
    const saved = DB.insert('Publications', rec);
    audit_('create_pub', saved.id + ' ' + rec.title);
    return saved;
  },

  deletePublication: function (p) {
    const old = DB.get('Publications', p.id);
    if (!old) throw new Error('ไม่พบผลงาน');
    if (!canEditPerson_(old.personType, old.personId)) throw new Error('คุณไม่มีสิทธิ์ลบผลงานนี้');
    if (old.status === 'verified' && currentUser_().role === 'lecturer') throw new Error('ผลงานที่รับรองแล้วลบไม่ได้');
    DB.remove('Publications', p.id);
    audit_('delete_pub', p.id + ' ' + old.title);
  },

  verifyPublications: function (p) {
    const ids = [].concat(p.ids || p.id || []);
    const decision = p.decision;
    if (['verified', 'rejected', 'pending'].indexOf(decision) === -1) throw new Error('ผลการตรวจไม่ถูกต้อง');
    if (decision === 'rejected' && !String(p.note || '').trim()) throw new Error('กรุณาระบุเหตุผลที่ไม่รับรอง');
    const u = currentUser_();
    let n = 0;
    ids.forEach(function (id) {
      const pub = DB.get('Publications', id);
      if (!pub) return;
      if (!canVerifyPub_(pub)) throw new Error('คุณไม่มีสิทธิ์ตรวจรับรอง: ' + pub.title);
      DB.update('Publications', id, {
        status: decision, verifyNote: p.note || '',
        verifiedBy: decision === 'pending' ? '' : u.email, verifiedAt: decision === 'pending' ? '' : nowIso_()
      });
      n++;
    });
    audit_('verify_' + decision, ids.join(','));
    return { count: n };
  },

  /* ---------- อาจารย์ ---------- */
  saveFaculty: function (f) {
    const u = currentUser_();
    if (!(u.role === 'admin' || u.role === 'chair')) throw new Error('คุณไม่มีสิทธิ์จัดการข้อมูลอาจารย์');
    if (!String(f.nameTh || f.nameEn || '').trim()) throw new Error('กรุณากรอกชื่ออาจารย์');
    const cur = splitIds_(f.curriculumIds);
    if (u.role === 'chair' && !cur.some(function (c) { return u.curriculumIds.indexOf(c) > -1; }))
      throw new Error('ประธานหลักสูตรเพิ่ม/แก้ไขได้เฉพาะอาจารย์ในหลักสูตรของตน');
    const rec = pick_(f, ['prefix', 'nameTh', 'nameEn', 'email', 'position', 'degree', 'degreeDetail', 'scopusId', 'orcid']);
    rec.curriculumIds = cur.join(',');
    rec.active = f.active === undefined ? true : toBool_(f.active);
    if (f.id) {
      if (u.role === 'chair' && !canEditPerson_('faculty', f.id)) throw new Error('คุณไม่มีสิทธิ์แก้ไขอาจารย์ท่านนี้');
      audit_('update_faculty', f.id);
      return DB.update('Faculty', f.id, rec);
    }
    rec.isSample = false;
    const saved = DB.insert('Faculty', rec);
    audit_('create_faculty', saved.id + ' ' + rec.nameTh);
    return saved;
  },

  deleteFaculty: function (p) {
    requireRole_(['admin']);
    const n = DB.removeWhere('Publications', function (r) { return r.personType === 'faculty' && r.personId === p.id; });
    DB.remove('Faculty', p.id);
    audit_('delete_faculty', p.id + ' (+' + n + ' ผลงาน)');
  },

  /* ---------- หลักสูตร ---------- */
  saveCurriculum: function (c) {
    requireRole_(['admin']);
    if (!String(c.nameTh || '').trim()) throw new Error('กรุณากรอกชื่อหลักสูตร');
    const rec = pick_(c, ['code', 'nameTh', 'nameEn', 'level', 'criteriaYear', 'chairFacultyId', 'status', 'note']);
    if (!LEVELS[rec.level]) rec.level = 'master';
    if (!FACULTY_CRITERIA[rec.criteriaYear]) rec.criteriaYear = '2565';
    rec.status = rec.status === 'closed' ? 'closed' : 'open';
    if (c.id) { audit_('update_curriculum', c.id); return DB.update('Curricula', c.id, rec); }
    rec.isSample = false;
    const saved = DB.insert('Curricula', rec);
    audit_('create_curriculum', saved.id + ' ' + rec.nameTh);
    return saved;
  },

  deleteCurriculum: function (p) {
    requireRole_(['admin']);
    DB.remove('Curricula', p.id);
    audit_('delete_curriculum', p.id);
  },

  /* ---------- ผู้ทรงคุณวุฒิภายนอก ---------- */
  saveExpert: function (x) {
    requireRole_(['admin', 'chair']);
    if (!String(x.nameTh || x.nameEn || '').trim()) throw new Error('กรุณากรอกชื่อ');
    const rec = pick_(x, ['prefix', 'nameTh', 'nameEn', 'affiliation', 'position', 'degree', 'degreeDetail', 'roleType', 'level', 'criteriaYear', 'curriculumId', 'scopusId', 'orcid']);
    rec.researchExp = toBool_(x.researchExp);
    if (!EXPERT_CRITERIA[rec.criteriaYear]) rec.criteriaYear = '2565';
    if (x.id) { audit_('update_expert', x.id); return DB.update('Experts', x.id, rec); }
    rec.isSample = false;
    const saved = DB.insert('Experts', rec);
    audit_('create_expert', saved.id + ' ' + rec.nameTh);
    return saved;
  },

  deleteExpert: function (p) {
    requireRole_(['admin', 'chair']);
    DB.removeWhere('Publications', function (r) { return r.personType === 'expert' && r.personId === p.id; });
    DB.remove('Experts', p.id);
    audit_('delete_expert', p.id);
  },

  saveExpertCheck: function (p) {
    requireRole_(['admin', 'chair']);
    const x = DB.get('Experts', p.id);
    if (!x) throw new Error('ไม่พบข้อมูล');
    const res = p.result === 'pass' ? 'pass' : 'fail';
    audit_('expert_check', p.id + ' ' + res);
    return DB.update('Experts', p.id, { checkResult: res, checkNote: p.note || '', checkedBy: currentUser_().email, checkedAt: nowIso_() });
  },

  /* ---------- ผู้ใช้ & ตั้งค่า ---------- */
  saveUser: function (p) {
    requireRole_(['admin']);
    const email = String(p.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง');
    if (!ROLES[p.role]) throw new Error('บทบาทไม่ถูกต้อง');
    const dup = DB.all('Users').filter(function (u) { return u.email.toLowerCase() === email && u.id !== p.id; })[0];
    if (dup) throw new Error('อีเมลนี้มีอยู่ในระบบแล้ว');
    const rec = { email: email, name: p.name || '', role: p.role, facultyId: p.facultyId || '', curriculumIds: splitIds_(p.curriculumIds).join(','), active: p.active === undefined ? true : toBool_(p.active) };
    if (p.id) {
      if (email === currentUser_().email && (p.role !== 'admin' || !rec.active)) throw new Error('ไม่สามารถลดสิทธิ์/ปิดบัญชี Admin ของตนเองได้');
      audit_('update_user', email + ' → ' + p.role);
      return DB.update('Users', p.id, rec);
    }
    rec.isSample = false;
    audit_('create_user', email + ' → ' + p.role);
    return DB.insert('Users', rec);
  },

  deleteUser: function (p) {
    requireRole_(['admin']);
    const u = DB.get('Users', p.id);
    if (u && u.email.toLowerCase() === currentUser_().email) throw new Error('ไม่สามารถลบบัญชีของตนเองได้');
    DB.remove('Users', p.id);
    audit_('delete_user', u ? u.email : p.id);
  },

  saveSettings: function (p) {
    requireRole_(['admin']);
    const allowed = Object.keys(DEFAULT_SETTINGS).filter(function (k) { return k !== 'SAMPLE_DATA'; });
    const patch = {};
    Object.keys(p).forEach(function (k) {
      if (allowed.indexOf(k) === -1) return;
      if (/^W_/.test(k)) {
        const v = Number(p[k]);
        if (!(v >= 0 && v <= 5)) throw new Error('น้ำหนัก ' + k + ' ต้องอยู่ระหว่าง 0–5');
        patch[k] = v.toFixed(2);
      } else if (k === 'EVAL_YEAR') {
        const y = Number(p[k]);
        if (p[k] !== '' && !(y >= 2540 && y <= 2700)) throw new Error('ปีประเมินต้องเป็นปี พ.ศ.');
        patch[k] = p[k] === '' ? '' : String(y);
      } else patch[k] = p[k];
    });
    setSettings_(patch);
    audit_('settings', Object.keys(patch).join(','));
  },

  resetWeights: function () {
    requireRole_(['admin']);
    const patch = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (/^W_/.test(k)) patch[k] = DEFAULT_SETTINGS[k]; });
    setSettings_(patch);
    audit_('settings', 'reset weights');
  },

  setViewAs: function (p) {
    const u = currentUser_();
    if (u.realRole !== 'admin') throw new Error('เฉพาะผู้ดูแลระบบ');
    const props = PropertiesService.getUserProperties();
    if (!p.role || p.role === 'admin') props.deleteProperty('VIEW_AS');
    else props.setProperty('VIEW_AS', JSON.stringify({ role: p.role, facultyId: p.facultyId || '' }));
    CURRENT_USER_ = null;
  },

  seedSample: function () {
    requireRole_(['admin']);
    return seedSampleData_();
  },

  clearSample: function () {
    requireRole_(['admin']);
    return clearData_(true);
  },

  clearAll: function (p) {
    requireRole_(['admin']);
    if (p.confirm !== 'ลบทั้งหมด') throw new Error('กรุณาพิมพ์ "ลบทั้งหมด" เพื่อยืนยัน');
    return clearData_(false);
  },

  saveAssessment: function (p) {
    requireRole_(['admin', 'chair']);
    const u = currentUser_();
    const a = assessCurriculum_(buildModel_({ role: 'admin' }), p.curriculumId, p.year);
    const rec = DB.insert('Assessments', { curriculumId: p.curriculumId, year: a.year, score: a.overall,
      summary: JSON.stringify({ indicators: a.indicators, standard: a.standard, n: a.n }), createdBy: u.email, isSample: false });
    audit_('save_assessment', p.curriculumId + ' ' + a.year + ' = ' + a.overall);
    return rec;
  },

  /* ---------- อ่านอย่างเดียว ---------- */
  assess: function (p) {
    const u = currentUser_();
    const m = buildModel_(u);
    const a = assessCurriculum_(m, p.curriculumId, p.year);
    a.history = DB.all('Assessments').filter(function (r) { return r.curriculumId === p.curriculumId; })
      .map(function (r) { return { year: r.year, score: Number(r.score), createdBy: r.createdBy, createdAt: r.createdAt }; })
      .sort(function (x, y) { return String(y.createdAt).localeCompare(String(x.createdAt)); });
    return a;
  },

  exportReport: function (p) { return exportReport_(p); },

  /* ---------- ค้นหา/ตรวจผลงานอัตโนมัติ (Discovery.gs) ---------- */
  findAuthors: function (p) { requireRole_(['admin', 'chair', 'lecturer']); return findAuthors_(p); },
  findWorks: function (p) { requireRole_(['admin', 'chair', 'lecturer']); return findWorks_(p); },
  searchAll: function (p) { requireRole_(['admin', 'chair', 'lecturer']); return searchAll_(p); },
  apiKeysStatus: function () { return apiKeysStatus_(); },
  saveApiKeys: function (p) { return saveApiKeys_(p); },
  testApiKeys: function () { return testApiKeys_(); },
  analyzeDocument: function (p) { requireRole_(['admin', 'chair', 'lecturer']); return analyzeDocument_(p); },
  saveEvidence: function (p) { return saveEvidence_(p); },
  importWorks: function (p) { return importWorks_(p); },
  journalStats: function () { return journalIndexStats_(); },
  importJournalIndex: function (p) { return importJournalIndex_(p); },
  clearJournalIndex: function (p) { return clearJournalIndex_(p); },

  audit: function () {
    requireRole_(['admin']);
    return DB.all('Audit').slice(-200).reverse();
  }
};

function pick_(o, keys) {
  const r = {};
  keys.forEach(function (k) { r[k] = o[k] === undefined || o[k] === null ? '' : String(o[k]).trim(); });
  return r;
}

/** ค่าคงที่ที่หน้าเว็บใช้สร้างฟอร์ม/ตัวกรอง */
function meta_() {
  const u = currentUser_();
  return {
    app: APP, roles: ROLES, databases: DATABASES, pubTypes: PUB_TYPES, positions: POSITIONS, degrees: DEGREES,
    levels: LEVELS, pubStatus: PUB_STATUS, expertRoles: EXPERT_ROLES, weightLabels: WEIGHT_LABELS,
    facultyCriteria: FACULTY_CRITERIA, expertCriteria: EXPERT_CRITERIA, qaTargets: QA_TARGETS,
    dbUrl: u.realRole === 'admin' ? getDb_().getUrl() : '',
    currentBE: currentBE_()
  };
}
