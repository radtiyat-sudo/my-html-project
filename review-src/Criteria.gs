/**
 * Criteria.gs — ชุดเกณฑ์ (มีเวอร์ชัน) และเครื่องตรวจตามเกณฑ์
 *
 * - ระบบไม่สร้างเกณฑ์ทางวิชาการเอง: มีแค่ "ชนิดการตรวจ" (RULE_KINDS) ส่วนค่าเกณฑ์ผู้ดูแลกรอกตามประกาศที่ยืนยันแล้ว
 * - เกณฑ์ตัวอย่างติดป้าย isDemo ("สำหรับสาธิต") และใช้กับคำขอสาธิตเท่านั้น
 * - ผลรายข้อ: pass / fail / inconclusive พร้อมเหตุผล ข้อมูลที่ใช้ และหลักฐาน
 * - ค้นไม่พบ / ข้อมูลไม่ครบ / ข้อมูลเก่า / ต้นทางขัดข้อง → "ยังสรุปไม่ได้" เสมอ ไม่ใช่ "ไม่ผ่าน"
 * - ผลแต่ละครั้งผูกกับเวอร์ชันเกณฑ์และ snapshot ข้อมูล การประเมินซ้ำจะเพิ่มรายการใหม่ ไม่ลบของเดิม
 */

function criteriaView_(c) {
  if (!c) return null;
  return Object.assign({}, c, { rules: parseJson_(c.rules, []), isDemo: toBool_(c.isDemo) });
}

/** ชุดเกณฑ์ที่ใช้งานอยู่ของประเภทคำขอ (มีผลแล้ว ณ วันนี้ — ถ้ามีหลายชุดใช้ชุดที่มีผลล่าสุด) */
function activeCriteriaFor_(typeId) {
  const today = nowIso_().slice(0, 10);
  const list = DB.all('CriteriaSets').filter(function (c) {
    return c.typeId === typeId && c.status === 'active' && (!c.effectiveDate || String(c.effectiveDate).slice(0, 10) <= today);
  });
  list.sort(function (a, b) { return String(b.effectiveDate).localeCompare(String(a.effectiveDate)) || Number(b.version) - Number(a.version); });
  return list[0] || null;
}

function validateRules_(rules) {
  if (!Array.isArray(rules) || !rules.length) throw new Error('ชุดเกณฑ์ต้องมีอย่างน้อย 1 ข้อ');
  const ids = {};
  return rules.map(function (r, i) {
    const kind = String(r.kind || '');
    if (!RULE_KINDS[kind]) throw new Error('ข้อที่ ' + (i + 1) + ': ไม่รู้จักชนิดการตรวจ ' + kind);
    const id = clean_(r.id || ('R' + (i + 1)), 20);
    if (ids[id]) throw new Error('รหัสข้อเกณฑ์ซ้ำ: ' + id);
    ids[id] = true;
    const label = clean_(r.label, 300);
    if (!label) throw new Error('ข้อที่ ' + (i + 1) + ': กรอกข้อความเกณฑ์');
    const pr = r.params || {};
    const params = {};
    if (kind === 'person_status' || kind === 'min_degree' || kind === 'academic_rank') {
      const dict = kind === 'person_status' ? EMP_STATUS : kind === 'min_degree' ? DEGREES : RANKS;
      params.allowed = [].concat(pr.allowed || []).filter(function (x) { return dict[x]; });
      if (!params.allowed.length) throw new Error('ข้อ ' + id + ': เลือกค่าที่ยอมรับอย่างน้อย 1 ค่า');
    }
    if (kind === 'min_works') {
      params.min = Math.max(1, Math.floor(Number(pr.min) || 0));
      params.years = Math.max(0, Math.floor(Number(pr.years) || 0));
      params.types = [].concat(pr.types || []).filter(function (x) { return WORK_TYPES[x]; });
      if (!Number(pr.min)) throw new Error('ข้อ ' + id + ': กรอกจำนวนผลงานขั้นต่ำ');
    }
    if (kind === 'required_documents') {
      params.docs = [].concat(pr.docs || []).map(function (x) { return clean_(x, 40); }).filter(String);
      if (!params.docs.length) throw new Error('ข้อ ' + id + ': ระบุรหัสเอกสารที่ต้องมี');
    }
    if (kind === 'manual') params.instruction = clean_(pr.instruction, 500);
    return { id: id, kind: kind, label: label, params: params };
  });
}

/* ---------------- จัดการชุดเกณฑ์ (ผู้ดูแล) ---------------- */

function saveCriteriaDraft_(p) {
  requirePerm_('admin.criteria');
  const type = DB.get('RequestTypes', p.typeId);
  if (!type) throw new Error('เลือกประเภทคำขอ');
  const rules = validateRules_(p.rules);
  const fields = {
    typeId: type.id, name: clean_(p.name, 200), effectiveDate: clean_(p.effectiveDate, 10), referenceSource: clean_(p.referenceSource, 500),
    conditionsText: clean_(p.conditionsText, 3000), rules: JSON.stringify(rules), isDemo: toBool_(p.isDemo), note: clean_(p.note, 500)
  };
  if (!fields.name) throw new Error('กรอกชื่อชุดเกณฑ์');
  if (fields.effectiveDate && !validDateText_(fields.effectiveDate)) throw new Error('วันที่มีผลต้องเป็น YYYY-MM-DD');
  if (p.id) {
    const cur = DB.get('CriteriaSets', p.id);
    if (!cur) throw new Error('ไม่พบชุดเกณฑ์');
    if (cur.status !== 'draft') throw new Error('แก้ได้เฉพาะฉบับร่าง — ชุดที่ใช้งานแล้วต้อง "สร้างเวอร์ชันใหม่"');
    const r = DB.update('CriteriaSets', cur.id, fields);
    audit_('criteria.update', 'CriteriaSets', cur.id, Object.keys(fields), '');
    return criteriaView_(r);
  }
  let code = clean_(p.code, 40).toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
  let version = 1;
  if (p.fromId) {
    const base = DB.get('CriteriaSets', p.fromId);
    if (!base) throw new Error('ไม่พบชุดเกณฑ์ต้นฉบับ');
    code = base.code;
    version = Math.max.apply(null, DB.all('CriteriaSets').filter(function (c) { return c.code === code; }).map(function (c) { return Number(c.version) || 0; })) + 1;
  } else {
    if (!code) code = 'CS-' + Utilities.getUuid().slice(0, 6).toUpperCase();
    if (DB.all('CriteriaSets').some(function (c) { return c.code === code; })) throw new Error('รหัสชุดเกณฑ์ซ้ำ: ' + code);
  }
  const r = DB.insert('CriteriaSets', Object.assign(fields, { code: code, version: String(version), status: 'draft', createdBy: me_().id }));
  audit_('criteria.create', 'CriteriaSets', r.id, { version: version }, '');
  return criteriaView_(r);
}

/** เปิดใช้ชุดเกณฑ์ — เกณฑ์จริงต้องมีแหล่งอ้างอิง วันที่มีผล และผู้ยืนยัน; ชุดเดิมที่รหัสเดียวกันจะถูกเลิกใช้ (ยังเก็บไว้) */
function activateCriteria_(p) {
  requirePerm_('admin.criteria');
  const c = DB.get('CriteriaSets', p.id);
  if (!c || c.status !== 'draft') throw new Error('เปิดใช้ได้เฉพาะฉบับร่าง');
  const confirmedBy = clean_(p.confirmedBy, 200);
  if (!toBool_(c.isDemo)) {
    const miss = [];
    if (!c.referenceSource) miss.push('แหล่งอ้างอิง (ประกาศ/ข้อบังคับ)');
    if (!c.effectiveDate) miss.push('วันที่มีผล');
    if (!confirmedBy) miss.push('ผู้ยืนยันเกณฑ์');
    if (miss.length) throw new Error('เปิดใช้เกณฑ์จริงไม่ได้ ยังขาด: ' + miss.join(', '));
  }
  DB.all('CriteriaSets').filter(function (x) { return x.code === c.code && x.status === 'active'; }).forEach(function (x) {
    DB.update('CriteriaSets', x.id, { status: 'retired' });
    audit_('criteria.retire', 'CriteriaSets', x.id, { status: 'retired' }, 'มีเวอร์ชันใหม่ ' + c.version);
  });
  const r = DB.update('CriteriaSets', c.id, { status: 'active', confirmedBy: confirmedBy || (toBool_(c.isDemo) ? 'สำหรับสาธิต — ไม่มีผู้ยืนยัน' : ''), confirmedAt: nowIso_() });
  audit_('criteria.activate', 'CriteriaSets', c.id, { status: 'active', version: c.version }, '');
  return criteriaView_(r);
}

function retireCriteria_(p) {
  requirePerm_('admin.criteria');
  const c = DB.get('CriteriaSets', p.id);
  if (!c || c.status !== 'active') throw new Error('เลิกใช้ได้เฉพาะชุดที่ใช้งานอยู่');
  if (!clean_(p.reason)) throw new Error('ระบุเหตุผล');
  const r = DB.update('CriteriaSets', c.id, { status: 'retired' });
  audit_('criteria.retire', 'CriteriaSets', c.id, { status: 'retired' }, p.reason);
  return criteriaView_(r);
}

/* ---------------- เครื่องตรวจ ---------------- */

function currentYearCE_() { return Number(nowIso_().slice(0, 4)); }

/** ข้อมูลบุคคลที่ใช้ตรวจ: ดึงจาก MUHR ล่าสุดถ้าทำได้ ไม่ได้ก็ใช้ snapshot เดิมพร้อมบอกเหตุผล */
function personForEval_(req) {
  const snap = parseJson_(req.personSnap, null);
  if (!snap) return { state: 'none', person: null, note: 'ยังไม่ได้เลือกบุคคล' };
  if (snap.kind === 'manual') return { state: 'manual', person: snap, note: 'บุคคลภายนอก/ไม่อยู่ในระบบต้นทาง — ไม่มีข้อมูลจาก MUHR ให้ตรวจ' };
  try {
    const rec = muhrByCode_(snap.staffCode);
    if (!rec) return { state: 'not_found', person: snap, note: 'ไม่พบรหัส ' + snap.staffCode + ' ใน MUHR ขณะประเมิน (อาจถูกนำออกจากชุดข้อมูล)' };
    const fresh = personDisplay_(rec);
    if (fresh.staleness.stale) return { state: 'stale', person: fresh, note: 'ข้อมูลบุคคลเก่ากว่า ' + fresh.staleness.limit + ' วัน (อายุ ' + fresh.staleness.ageDays + ' วัน)' };
    return { state: 'fresh', person: fresh, note: 'ข้อมูลจาก MUHR (' + sourceMode_('MUHR') + ') ดึงเมื่อ ' + fresh.fetchedAt };
  } catch (e) {
    if (e.sourceError) return { state: 'outage', person: snap, note: e.message };
    throw e;
  }
}

function sourceProbe_(src) {
  try { sourceReady_(src); return { source: src, ok: true, mode: sourceMode_(src) }; }
  catch (e) { if (e.sourceError) return { source: src, ok: false, mode: sourceMode_(src), code: e.sourceError.code, message: e.message }; throw e; }
}

function evalContext_(req) {
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); });
  const atts = DB.all('Attachments').filter(function (a) { return a.requestId === req.id && a.status === 'active'; });
  return {
    req: req, personInfo: personForEval_(req), works: works, attachments: atts,
    openDups: openDupPairs_(req.id, works), sources: { MUHR: sourceProbe_('MUHR'), MUREX: sourceProbe_('MUREX') },
    staffChecks: DB.all('StaffChecks').filter(function (s) { return s.requestId === req.id; })
  };
}

const R_ = function (result, reason, dataUsed, evidence) { return { result: result, reason: reason, dataUsed: dataUsed || [], evidence: evidence || [] }; };

/** กฎที่ต้องใช้ข้อมูลบุคคลจากต้นทาง: ยังไม่ยืนยันตัว/ไม่มีข้อมูล/ข้อมูลเก่า/ขัดข้อง → ยังสรุปไม่ได้ */
function personAttrRule_(ctx, field, dict, allowed, what) {
  const pi = ctx.personInfo;
  if (!identityVerified_(ctx.req)) return R_('inconclusive', 'ยังไม่ได้ยืนยันตัวบุคคล — ไม่สามารถใช้ข้อมูล' + what + 'ได้', [IDENTITY_LABEL[ctx.req.identityStatus || '']]);
  if (pi.state !== 'fresh') return R_('inconclusive', pi.note + ' — ให้เจ้าหน้าที่ตรวจ' + what + 'จากหลักฐาน', pi.person && pi.person[field] ? [what + ' (ข้อมูลเดิม): ' + (dict[pi.person[field]] || pi.person[field])] : []);
  const v = pi.person[field];
  if (!v) return R_('inconclusive', 'ต้นทางไม่มีข้อมูล' + what, [pi.note]);
  const used = [what + ': ' + (dict[v] || v), pi.note];
  if (allowed.indexOf(v) > -1) return R_('pass', what + ' "' + (dict[v] || v) + '" อยู่ในรายการที่เกณฑ์ยอมรับ', used);
  return R_('fail', what + ' "' + (dict[v] || v) + '" ไม่อยู่ในรายการที่เกณฑ์ยอมรับ (' + allowed.map(function (a) { return dict[a]; }).join(', ') + ')', used);
}

const RULE_EVAL_ = {
  identity_verified: function (rule, ctx) {
    const st = ctx.req.identityStatus;
    if (st === 'code_match') return R_('pass', IDENTITY_LABEL.code_match, ['รหัสบุคลากร: ' + (parseJson_(ctx.req.personSnap, {}).staffCode || '')]);
    if (st === 'staff_confirmed') return R_('pass', IDENTITY_LABEL.staff_confirmed + ' (' + ctx.req.identityNote + ')', ['ยืนยันโดย ' + userName_(ctx.req.identityBy) + ' เมื่อ ' + ctx.req.identityAt]);
    const snap = parseJson_(ctx.req.personSnap, null);
    const why = !snap ? 'ยังไม่ได้เลือกบุคคล' : snap.duplicateName ? 'เลือกจากชื่อซึ่งมีผู้ใช้ชื่อเดียวกันหลายคน' : snap.kind === 'manual' ? 'บุคคลไม่อยู่ในระบบต้นทาง' : 'เลือกจากชื่อ (ไม่ได้ยืนยันด้วยรหัสบุคลากร)';
    return R_('inconclusive', why + ' — รอเจ้าหน้าที่ยืนยันตัวบุคคล');
  },
  person_status: function (rule, ctx) { return personAttrRule_(ctx, 'employmentStatus', EMP_STATUS, rule.params.allowed, 'สถานะบุคลากร'); },
  min_degree: function (rule, ctx) { return personAttrRule_(ctx, 'highestDegree', DEGREES, rule.params.allowed, 'คุณวุฒิ'); },
  academic_rank: function (rule, ctx) { return personAttrRule_(ctx, 'academicRank', RANKS, rule.params.allowed, 'ตำแหน่งทางวิชาการ'); },
  min_works: function (rule, ctx) {
    const pr = rule.params;
    const fromYear = pr.years ? currentYearCE_() - pr.years + 1 : 0;
    const inScope = ctx.works.filter(function (w) {
      if (w.status === 'excluded_duplicate' || w.status === 'rejected') return false;
      if (pr.types.length && pr.types.indexOf(w.type) === -1) return false;
      const y = normYear_(w.year);
      return !fromYear || (y && y >= fromYear);
    });
    const verified = inScope.filter(function (w) { return w.status === 'verified'; });
    const pending = inScope.filter(function (w) { return w.status === 'pending'; });
    const cond = 'ต้องมีอย่างน้อย ' + pr.min + ' รายการ' + (pr.types.length ? ' ประเภท ' + pr.types.map(function (t) { return WORK_TYPES[t]; }).join('/') : '') + (fromYear ? ' ตั้งแต่ปี ค.ศ. ' + fromYear + ' (พ.ศ. ' + (fromYear + 543) + ')' : '');
    const used = ['ผลงานที่เจ้าหน้าที่ยืนยันและเข้าเงื่อนไข: ' + verified.length + ' รายการ', 'รอตรวจ: ' + pending.length + ' รายการ', cond];
    const ev = verified.map(function (w) { return 'work:' + w.id; });
    if (verified.length >= pr.min) return R_('pass', 'มีผลงานที่ยืนยันแล้ว ' + verified.length + ' รายการ ครบตามเกณฑ์ (' + cond + ')', used, ev);
    const gaps = [];
    if (pending.length) gaps.push('มีผลงานรอเจ้าหน้าที่ตรวจ ' + pending.length + ' รายการ');
    if (ctx.openDups.length) gaps.push('มีผลงานที่สงสัยว่าซ้ำรอตัดสิน ' + ctx.openDups.length + ' คู่');
    if (!ctx.sources.MUREX.ok) gaps.push('ระบบผลงาน MUREX ไม่พร้อมใช้งาน (' + (ctx.sources.MUREX.code === 'outage' ? 'ขัดข้อง' : 'ยังไม่ได้เชื่อมต่อ') + ')');
    if (ctx.works.some(function (w) { return !normYear_(w.year); })) gaps.push('มีผลงานที่ไม่ระบุปี');
    if (!toBool_(ctx.req.worksComplete)) gaps.push('เจ้าหน้าที่ยังไม่ได้ยืนยันว่ารายการผลงานครบถ้วน');
    if (gaps.length) return R_('inconclusive', 'นับได้ ' + verified.length + ' จาก ' + pr.min + ' รายการ แต่ยังสรุปไม่ได้เพราะ: ' + gaps.join('; '), used, ev);
    return R_('fail', 'นับได้ ' + verified.length + ' จาก ' + pr.min + ' รายการ (เจ้าหน้าที่ยืนยันว่ารายการผลงานครบถ้วนแล้ว: ' + (ctx.req.worksCompleteNote || '-') + ')', used, ev);
  },
  required_documents: function (rule, ctx) {
    const have = {};
    ctx.attachments.forEach(function (a) { have[a.docType] = (have[a.docType] || []).concat('file:' + a.id); });
    const miss = rule.params.docs.filter(function (d) { return !have[d]; });
    const ev = [].concat.apply([], rule.params.docs.map(function (d) { return have[d] || []; }));
    if (miss.length) return R_('inconclusive', 'ยังไม่มีเอกสาร: ' + miss.map(docLabel_).join(', '), ['แนบแล้ว: ' + Object.keys(have).map(docLabel_).join(', ')], ev);
    return R_('pass', 'มีเอกสารครบ: ' + rule.params.docs.map(docLabel_).join(', '), [], ev);
  },
  manual: function (rule) { return R_('inconclusive', 'ข้อนี้ต้องให้เจ้าหน้าที่พิจารณา' + (rule.params.instruction ? ': ' + rule.params.instruction : '')); }
};

function docLabel_(code) {
  const all = {};
  DB.all('RequestTypes').forEach(function (t) { parseJson_(t.requiredDocs, []).forEach(function (d) { all[d.code] = d.label; }); });
  all.evidence = 'หลักฐานผลงาน';
  return all[code] || code;
}

function snapshotOf_(ctx) {
  return {
    person: ctx.personInfo.person, personState: ctx.personInfo.state, personNote: ctx.personInfo.note,
    identityStatus: ctx.req.identityStatus, worksComplete: toBool_(ctx.req.worksComplete),
    works: ctx.works.map(function (w) { return { id: w.id, title: w.title, type: w.type, year: w.year, doi: w.doi, ref: w.ref, origin: w.origin, status: w.status, evidenceId: w.evidenceId }; }),
    attachments: ctx.attachments.map(function (a) { return { id: a.id, docType: a.docType, workId: a.workId, fileName: a.fileName, uploadedAt: a.uploadedAt }; }),
    openDups: ctx.openDups.map(function (d) { return d.id; }),
    staffChecks: ctx.staffChecks.map(function (s) { return { ruleId: s.ruleId, result: s.result, at: s.at }; })
  };
}

function hashOf_(obj) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(obj));
  return bytes.map(function (b) { return ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1); }).join('');
}

/** hash ของข้อมูลปัจจุบัน (ไม่รวมวันที่ดึงข้อมูล) — ใช้เทียบว่าข้อมูลเปลี่ยนหลังประเมินครั้งล่าสุดหรือไม่ */
function currentDataHash_(req) {
  const s = snapshotOf_(evalContext_(req));
  if (s.person) s.person = Object.assign({}, s.person, { fetchedAt: '', staleness: null, selectedAt: '' });
  return hashOf_(s);
}

/** ประเมินคำขอตามชุดเกณฑ์ที่ผูกไว้ — บันทึกเป็นรายการใหม่เสมอ */
function evaluate_(req, trigger, reason) {
  const set = DB.get('CriteriaSets', req.criteriaSetId);
  if (!set) throw new Error('คำขอนี้ยังไม่ได้ผูกชุดเกณฑ์');
  if (toBool_(set.isDemo) && !toBool_(req.isDemo)) throw new Error('ห้ามใช้เกณฑ์สำหรับสาธิตกับคำขอจริง');
  const rules = parseJson_(set.rules, []);
  const ctx = evalContext_(req);
  const items = rules.map(function (rule) {
    const fn = RULE_EVAL_[rule.kind];
    let r = fn ? fn(rule, ctx) : R_('inconclusive', 'ระบบไม่รู้จักชนิดการตรวจ ' + rule.kind);
    const item = Object.assign({ ruleId: rule.id, kind: rule.kind, label: rule.label, by: 'system' }, r);
    // ผลตรวจของเจ้าหน้าที่ใช้เติมเฉพาะข้อที่ระบบ "ยังสรุปไม่ได้" ไม่เขียนทับผลของระบบ
    if (item.result === 'inconclusive') {
      const sc = ctx.staffChecks.filter(function (s) { return s.ruleId === rule.id && s.criteriaSetId === set.id; }).pop();
      if (sc) {
        item.systemResult = item.result; item.systemReason = item.reason;
        item.result = sc.result; item.reason = sc.reason; item.by = 'staff';
        item.dataUsed = item.dataUsed.concat(['ตรวจโดยเจ้าหน้าที่ ' + userName_(sc.by) + ' เมื่อ ' + sc.at]);
      }
    }
    return item;
  });
  const overall = items.some(function (i) { return i.result === 'fail'; }) ? 'fail' : items.some(function (i) { return i.result === 'inconclusive'; }) ? 'inconclusive' : 'pass';
  const snapshot = snapshotOf_(ctx);
  const ev = DB.insert('Evaluations', {
    requestId: req.id, round: req.round, criteriaSetId: set.id, criteriaCode: set.code, criteriaVersion: set.version, isDemo: toBool_(set.isDemo),
    overall: overall, items: JSON.stringify(items), snapshot: JSON.stringify(snapshot), snapshotHash: currentDataHash_(req),
    sourceStatus: JSON.stringify(ctx.sources), trigger: trigger, reason: clean_(reason, 300), by: CURRENT_USER_ ? CURRENT_USER_.id : '', at: nowIso_()
  });
  audit_('evaluate', 'Requests', req.id, { result: overall, version: set.version }, trigger);
  return evaluationView_(ev);
}

function evaluationView_(e) {
  return Object.assign({}, e, {
    items: parseJson_(e.items, []), snapshot: parseJson_(e.snapshot, {}), sourceStatus: parseJson_(e.sourceStatus, {}),
    isDemo: toBool_(e.isDemo), byName: e.by ? userName_(e.by) : 'ระบบ'
  });
}
