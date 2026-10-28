/**
 * Workflow.gs — ขั้นตอนคำขอ: สร้าง → เลือกประเภท → ค้นหาและยืนยันบุคคล → รวบรวมผลงาน → ตรวจตามเกณฑ์
 *               → เจ้าหน้าที่ตรวจยืนยัน → ผู้พิจารณาตัดสิน → แจ้งผลและปิดงาน
 * รองรับร่าง ส่งกลับแก้ไข (แก้เฉพาะส่วนที่ระบุ) ยื่นใหม่ และยกเลิก โดยเก็บประวัติทั้งหมด
 */

/* ---------------- เครื่องมือ ---------------- */

function history_(req, from, to, note) {
  const u = me_();
  DB.insert('StatusHistory', { requestId: req.id, fromStatus: from, toStatus: to, round: req.round, by: u.id, byRole: u.role, note: clean_(note, 500), at: nowIso_() });
}

function transition_(req, to, note, patch) {
  const from = req.status;
  const rec = DB.update('Requests', req.id, Object.assign({ status: to }, patch || {}));
  history_(rec, from, to, note);
  audit_('status', 'Requests', req.id, Object.assign({ status: to }, patch || {}), note);
  return rec;
}

/** แจ้งเตือนภายในระบบเท่านั้น — การส่งอีเมล/ข้อความภายนอกปิดอยู่จนกว่าผู้ดูแลจะตั้งค่าและเปิดใช้ */
function notify_(userIds, req, message) {
  const ids = [].concat(userIds || []).filter(function (x, i, a) { return x && a.indexOf(x) === i && (!CURRENT_USER_ || x !== CURRENT_USER_.id); });
  if (!ids.length) return 0;
  DB.insertMany('Notifications', ids.map(function (id) { return { userId: id, requestId: req ? req.id : '', message: clean_(message, 300) }; }));
  return ids.length;
}

function staffOf_(req) {
  if (req.assigneeId) return [req.assigneeId];
  return usersFor_('staff', req.unit).map(function (u) { return u.id; });
}

function nextCode_() {
  const be = Number(nowIso_().slice(0, 4)) + 543;
  const prefix = 'RQ' + be + '-';
  const n = DB.all('Requests').filter(function (r) { return String(r.code).indexOf(prefix) === 0; }).length + 1;
  return prefix + ('000' + n).slice(-4);
}

function typeView_(t) {
  return t ? Object.assign({}, t, { requiredDocs: parseJson_(t.requiredDocs, []), active: toBool_(t.active), isDemo: toBool_(t.isDemo) }) : null;
}

/* ---------------- สิทธิ์ตามสถานะ ---------------- */

/** ส่วนที่ผู้ยื่นแก้ได้: ร่าง = ทุกส่วน, ส่งกลับ = เฉพาะส่วนที่เจ้าหน้าที่ระบุ */
function editableSections_(req) {
  const u = CURRENT_USER_;
  if (!u || u.role !== 'requester' || req.requesterId !== u.id) return [];
  if (req.status === 'draft') return Object.keys(SECTIONS);
  if (req.status === 'returned') {
    const s = {};
    DB.all('RevisionItems').filter(function (i) { return i.requestId === req.id && i.round === String(req.round) && i.status !== 'accepted'; })
      .forEach(function (i) { s[i.section] = true; });
    return Object.keys(s);
  }
  return [];
}

function requireEditable_(req, section) {
  if (editableSections_(req).indexOf(section) === -1) {
    throw new Error(req.status === 'returned' ? 'ส่วน "' + SECTIONS[section] + '" ไม่อยู่ในรายการที่ต้องแก้ไข — แก้ได้เฉพาะส่วนที่เจ้าหน้าที่ระบุ' : 'คำขอสถานะ "' + STATUSES[req.status].label + '" แก้ไขไม่ได้');
  }
}

function requireStaffOn_(req, statuses) {
  requirePerm_('request.review');
  if (!inScope_(req.unit)) throw new Error('คำขอนี้ไม่อยู่ในหน่วยงานที่คุณรับผิดชอบ');
  if (statuses.indexOf(req.status) === -1) throw new Error('ทำรายการนี้ไม่ได้ในสถานะ "' + STATUSES[req.status].label + '"');
  if (req.assigneeId && req.assigneeId !== CURRENT_USER_.id && req.status === 'in_review') throw new Error('คำขอนี้มอบหมายให้ ' + userName_(req.assigneeId) + ' — ขอให้มอบหมายใหม่ก่อน');
}

function actionsFor_(req) {
  const u = CURRENT_USER_; const a = [];
  if (!u) return a;
  const owner = u.role === 'requester' && req.requesterId === u.id;
  if (owner && ['draft', 'returned'].indexOf(req.status) > -1) a.push('edit', 'submit');
  if (owner && ['draft', 'submitted', 'returned'].indexOf(req.status) > -1) a.push('cancel');
  if (u.role === 'admin' && OPEN_STATUSES.concat('draft').indexOf(req.status) > -1) a.push('cancel');
  if (u.role === 'staff' && inScope_(req.unit)) {
    if (req.status === 'submitted') a.push('claim', 'assign');
    if (req.status === 'in_review') {
      a.push('assign');
      if (!req.assigneeId || req.assigneeId === u.id) a.push('verify', 'return', 'forward', 'rerun');
    }
    if (req.status === 'decided') a.push('close');
  }
  if (u.role === 'reviewer' && req.reviewerId === u.id && req.status === 'pending_decision') a.push('decide');
  return a;
}

/* ---------------- ครบถ้วนก่อนยื่น ---------------- */

function requiredDocsFor_(req, type, works, atts) {
  const snap = parseJson_(req.personSnap, null);
  const out = [];
  parseJson_(type.requiredDocs, []).forEach(function (d) {
    const need = d.when === 'always' || (d.when === 'person_not_in_source' && snap && snap.kind === 'manual');
    if (need) out.push({ code: d.code, label: d.label, hint: d.hint || '', attached: atts.filter(function (a) { return a.docType === d.code && !a.workId; }).length });
  });
  works.filter(function (w) { return ACTIVE_WORK_(w) && w.origin === 'manual' && !w.doi && !w.ref; }).forEach(function (w) {
    out.push({ code: 'evidence', workId: w.id, label: 'หลักฐานผลงาน: ' + w.title, hint: 'ผลงานที่ไม่มี DOI/เลขอ้างอิง ต้องแนบหลักฐาน', attached: atts.filter(function (a) { return a.workId === w.id; }).length });
  });
  return out;
}

function completeness_(req) {
  const type = DB.get('RequestTypes', req.typeId);
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); });
  const atts = DB.all('Attachments').filter(function (a) { return a.requestId === req.id && a.status === 'active'; });
  const issues = [];
  const add = function (section, msg, blocking) { issues.push({ section: section, message: msg, blocking: blocking !== false }); };
  if (!clean_(req.purpose)) add('info', 'กรอกวัตถุประสงค์/รายละเอียดคำขอ');
  const snap = parseJson_(req.personSnap, null);
  if (!snap) add('person', 'เลือกบุคคลที่ต้องการตรวจ');
  else if (req.identityStatus === 'needs_staff_check') add('person', 'บุคคลนี้เลือกจากชื่อ/กรอกเอง เจ้าหน้าที่จะต้องยืนยันตัวบุคคล (ยื่นได้)', false);
  if (!works.length) add('works', 'ยังไม่มีผลงาน — ข้อเกณฑ์ด้านผลงานจะสรุปไม่ได้ (ยื่นได้ ถ้าประเภทคำขอไม่ต้องใช้ผลงาน)', false);
  works.forEach(function (w) {
    if (!w.title || !normYear_(w.year) || !WORK_TYPES[w.type]) add('works', 'ผลงาน "' + (w.title || '(ไม่มีชื่อ)') + '" ข้อมูลไม่ครบ (ชื่อเรื่อง/ปี/ประเภท)');
  });
  if (type) requiredDocsFor_(req, type, works, atts).forEach(function (d) { if (!d.attached) add('documents', 'แนบ: ' + d.label); });
  if (req.status === 'returned') {
    DB.all('RevisionItems').filter(function (i) { return i.requestId === req.id && i.round === String(req.round) && i.status === 'open'; })
      .forEach(function (i) { add(i.section, 'ยังไม่ได้ตอบรายการแก้ไข: ' + i.message); });
  }
  return { ok: !issues.some(function (i) { return i.blocking; }), issues: issues };
}

/* ---------------- ผู้ยื่นเรื่อง ---------------- */

function createRequest_(p) {
  requirePerm_('request.create');
  const u = me_();
  const type = DB.get('RequestTypes', p.typeId);
  if (!type || !toBool_(type.active)) throw new Error('เลือกประเภทคำขอที่เปิดใช้งาน');
  const unit = clean_(p.unit, 40);
  if (!unit || !inScope_(unit)) throw new Error('เลือกหน่วยงานที่คุณมีสิทธิ์ยื่นเรื่อง');
  const set = activeCriteriaFor_(type.id);
  if (!set) throw new Error('ประเภทคำขอนี้ยังไม่มีชุดเกณฑ์ที่เปิดใช้งาน — แจ้งผู้ดูแลระบบ');
  const demo = toBool_(set.isDemo);
  if (demo && !toBool_(setting_('TEST_MODE'))) throw new Error('ประเภทคำขอนี้มีเฉพาะเกณฑ์สำหรับสาธิต ใช้ยื่นคำขอจริงไม่ได้ — รอผู้ดูแลเปิดใช้เกณฑ์ที่ยืนยันแล้ว');
  const req = DB.insert('Requests', {
    code: nextCode_(), typeId: type.id, title: clean_(p.title, 200) || type.name, purpose: clean_(p.purpose, 2000), note: '',
    unit: unit, requesterId: u.id, status: 'draft', round: '1', identityStatus: '', criteriaSetId: set.id, worksComplete: false, isDemo: demo
  });
  DB.insert('StatusHistory', { requestId: req.id, fromStatus: '', toStatus: 'draft', round: '1', by: u.id, byRole: u.role, note: 'สร้างคำขอ', at: nowIso_() });
  audit_('request.create', 'Requests', req.id, { status: 'draft' }, '');
  return req;
}

function updateInfo_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'info');
  const patch = {};
  if (p.title !== undefined) patch.title = clean_(p.title, 200);
  if (p.purpose !== undefined) patch.purpose = clean_(p.purpose, 2000);
  if (p.note !== undefined) patch.note = clean_(p.note, 1000);
  if (p.typeId !== undefined && p.typeId !== req.typeId) {
    if (req.status !== 'draft') throw new Error('เปลี่ยนประเภทคำขอได้เฉพาะตอนเป็นร่าง');
    const t = DB.get('RequestTypes', p.typeId); const set = t && activeCriteriaFor_(t.id);
    if (!t || !toBool_(t.active) || !set) throw new Error('ประเภทคำขอนี้ใช้ไม่ได้');
    patch.typeId = t.id; patch.criteriaSetId = set.id; patch.isDemo = toBool_(set.isDemo);
  }
  const r = DB.update('Requests', req.id, patch);
  audit_('request.update', 'Requests', req.id, Object.keys(patch), '');
  return r;
}

/** เลือกบุคคล: จากผลค้นใน MUHR (personId + วิธีที่ค้นพบ) หรือกรอกเอง (บุคคลภายนอก) */
function setPerson_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'person');
  let snap;
  if (p.manual) snap = personSnapManual_(p.manual);
  else {
    const rec = DB.get('Persons', p.personId);
    const mode = sourceReady_('MUHR');
    if (!rec || rec.origin !== mode) throw new Error('ไม่พบบุคคลในแหล่งข้อมูล MUHR ปัจจุบัน');
    // ตรวจซ้ำที่เซิร์ฟเวอร์ว่าเลือกจากรหัสจริงหรือไม่ — ไม่เชื่อค่าที่หน้าเว็บส่งมา
    const byCode = p.staffCode && String(p.staffCode).trim().toUpperCase() === String(rec.staffCode).toUpperCase();
    const res = byCode ? null : searchPersons_({ name: p.name || rec.firstNameTh + ' ' + rec.lastNameTh });
    const hit = res && res.results.filter(function (x) { return x.personId === rec.id; })[0];
    snap = personSnapFromSource_(rec, byCode ? 'staffCode' : (hit ? hit.matchBasis : 'name'), hit ? hit.duplicateName : false);
  }
  const identity = identityFromSnap_(snap);
  const r = DB.update('Requests', req.id, { personSnap: JSON.stringify(snap), identityStatus: identity, identityBasis: snap.matchBasis || 'manual', identityNote: '', identityBy: '', identityAt: '' });
  audit_('request.person', 'Requests', req.id, { identityStatus: identity, personSnap: 1 }, '');
  return { request: r, person: snap, identityLabel: IDENTITY_LABEL[identity] };
}

/** ผลงานจาก MUREX ของบุคคลที่เลือก (ให้ผู้ยื่นติ๊กยืนยัน) — บอกด้วยว่ารายการไหนเพิ่มแล้ว */
function sourceWorksFor_(p) {
  const req = loadRequestFor_(p.id);
  const snap = parseJson_(req.personSnap, null);
  if (!snap || snap.kind !== 'source') return { works: [], source: sourceStatus_('MUREX'), note: 'บุคคลที่ไม่อยู่ใน MUHR ไม่มีรายการผลงานจาก MUREX ให้ดึง — เพิ่มผลงานเองได้' };
  const added = {};
  DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); }).forEach(function (w) { if (w.sourceWorkId) added[w.sourceWorkId] = true; });
  const works = murexWorksFor_(snap.staffCode).map(function (w) { return Object.assign({}, w, { added: !!added[w.id], staleness: staleInfo_(w) }); });
  return { works: works, source: sourceStatus_('MUREX') };
}

function addSourceWorks_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'works');
  const snap = parseJson_(req.personSnap, null);
  if (!snap || snap.kind !== 'source') throw new Error('เลือกบุคคลจาก MUHR ก่อน');
  const avail = {};
  murexWorksFor_(snap.staffCode).forEach(function (w) { avail[w.id] = w; });
  const exist = {};
  DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); }).forEach(function (w) { if (w.sourceWorkId) exist[w.sourceWorkId] = true; });
  const recs = [].concat(p.workIds || []).filter(function (id) { return avail[id] && !exist[id]; }).map(function (id) {
    const w = avail[id];
    return { requestId: req.id, origin: 'MUREX-' + w.origin, sourceWorkId: w.id, title: w.title, type: w.type || 'other', year: w.year, pubDate: w.pubDate, authors: w.authors, venue: w.venue, doi: normDoi_(w.doi), ref: w.workRef || w.ref, status: 'pending', addedBy: me_().id, addedRound: req.round };
  });
  if (!recs.length) throw new Error('ไม่มีรายการใหม่ให้เพิ่ม');
  DB.insertMany('RequestWorks', recs);
  const dups = detectDuplicates_(req.id);
  audit_('works.addSource', 'Requests', req.id, ['works+' + recs.length], '');
  return { added: recs.length, suspectedDuplicates: dups };
}

function workFields_(p) {
  const f = {
    title: clean_(p.title, 500), type: WORK_TYPES[p.type] ? p.type : '', year: String(normYear_(p.year) || ''), pubDate: clean_(p.pubDate, 10),
    authors: clean_(p.authors, 1000), venue: clean_(p.venue, 300), doi: normDoi_(p.doi), ref: clean_(p.ref, 200)
  };
  if (!f.title) throw new Error('กรอกชื่อผลงาน');
  if (!f.type) throw new Error('เลือกประเภทผลงาน');
  if (!f.year || Number(f.year) < 1900 || Number(f.year) > currentYearCE_() + 1) throw new Error('ปีไม่ถูกต้อง (กรอก ค.ศ. หรือ พ.ศ.)');
  if (f.doi && !/^10\.\d{4,9}\/\S+$/.test(f.doi)) throw new Error('DOI ไม่ถูกต้อง (ตัวอย่าง 10.1234/abcd)');
  if (f.pubDate && !validDateText_(f.pubDate)) throw new Error('วันที่เผยแพร่ต้องเป็น YYYY-MM-DD');
  return f;
}

function saveManualWork_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'works');
  const f = workFields_(p.work || {});
  let w;
  if (p.workId) {
    const cur = DB.get('RequestWorks', p.workId);
    if (!cur || cur.requestId !== req.id || !ACTIVE_WORK_(cur)) throw new Error('ไม่พบผลงาน');
    if (cur.origin !== 'manual') throw new Error('ผลงานจากระบบต้นทางแก้ไขไม่ได้ — ถอนออกแล้วเพิ่มเองได้');
    w = DB.update('RequestWorks', cur.id, Object.assign(f, { status: 'pending', staffNote: cur.staffNote }));
    audit_('works.update', 'RequestWorks', cur.id, Object.keys(f), '');
  } else {
    w = DB.insert('RequestWorks', Object.assign(f, { requestId: req.id, origin: 'manual', status: 'pending', addedBy: me_().id, addedRound: req.round }));
    audit_('works.add', 'RequestWorks', w.id, ['manual'], '');
  }
  const dups = detectDuplicates_(req.id);
  return { work: w, suspectedDuplicates: dups };
}

function withdrawWork_(p) {
  const req = loadRequestFor_(p.id);
  requireEditable_(req, 'works');
  const w = DB.get('RequestWorks', p.workId);
  if (!w || w.requestId !== req.id || !ACTIVE_WORK_(w)) throw new Error('ไม่พบผลงาน');
  DB.update('RequestWorks', w.id, { status: 'withdrawn', staffNote: clean_(p.reason, 300) });
  audit_('works.withdraw', 'RequestWorks', w.id, { status: 'withdrawn' }, p.reason);
  return true;
}

function respondRevision_(p) {
  const req = loadRequestFor_(p.id);
  if (req.status !== 'returned' || req.requesterId !== me_().id) throw new Error('ไม่มีรายการแก้ไขที่ต้องตอบ');
  const it = DB.get('RevisionItems', p.itemId);
  if (!it || it.requestId !== req.id || it.round !== String(req.round)) throw new Error('ไม่พบรายการแก้ไข');
  const resp = clean_(p.response, 1000);
  if (!resp) throw new Error('ระบุสิ่งที่แก้ไขแล้ว');
  DB.update('RevisionItems', it.id, { status: 'addressed', response: resp, addressedAt: nowIso_() });
  audit_('revision.respond', 'RevisionItems', it.id, { status: 'addressed' }, '');
  return true;
}

function submit_(p) {
  const req = loadRequestFor_(p.id);
  if (req.requesterId !== me_().id || me_().role !== 'requester') throw new Error('ยื่นได้เฉพาะเจ้าของคำขอ');
  if (['draft', 'returned'].indexOf(req.status) === -1) throw new Error('คำขอนี้ยื่นไปแล้ว');
  const c = completeness_(req);
  if (!c.ok) { const e = new Error('ยังยื่นไม่ได้ — ข้อมูลไม่ครบ:\n- ' + c.issues.filter(function (i) { return i.blocking; }).map(function (i) { return i.message; }).join('\n- ')); throw e; }
  const resubmit = req.status === 'returned';
  const patch = { submittedAt: req.submittedAt || nowIso_() };
  if (resubmit) {
    patch.round = String(Number(req.round) + 1);
  } else {
    const set = activeCriteriaFor_(req.typeId);
    if (!set) throw new Error('ประเภทคำขอนี้ไม่มีชุดเกณฑ์ที่ใช้งานแล้ว — แจ้งผู้ดูแลระบบ');
    if (toBool_(set.isDemo) !== toBool_(req.isDemo)) throw new Error('ชุดเกณฑ์ของประเภทคำขอนี้เปลี่ยนจากเกณฑ์สาธิต/เกณฑ์จริง — สร้างคำขอใหม่');
    patch.criteriaSetId = set.id; // ผูกเกณฑ์ ณ วันที่ยื่น
  }
  const r = transition_(req, 'submitted', resubmit ? 'ยื่นใหม่หลังแก้ไข' : 'ยื่นคำขอ', patch);
  const ev = evaluate_(r, resubmit ? 'resubmit' : 'submit', '');
  notify_(staffOf_(r), r, (resubmit ? 'คำขอยื่นใหม่หลังแก้ไข: ' : 'คำขอใหม่: ') + r.code + ' ' + r.title);
  return { request: r, evaluation: ev };
}

function cancel_(p) {
  const req = loadRequestFor_(p.id);
  if (actionsFor_(req).indexOf('cancel') === -1) throw new Error('ยกเลิกคำขอนี้ไม่ได้');
  const reason = clean_(p.reason, 500);
  if (!reason) throw new Error('ระบุเหตุผลการยกเลิก');
  const r = transition_(req, 'cancelled', reason, { cancelledAt: nowIso_(), cancelReason: reason });
  notify_([r.requesterId].concat(r.assigneeId ? [r.assigneeId] : []), r, 'คำขอ ' + r.code + ' ถูกยกเลิก');
  return r;
}

/* ---------------- เจ้าหน้าที่ ---------------- */

function claim_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['submitted']);
  return transition_(req, 'in_review', 'รับเรื่องตรวจ', { assigneeId: req.assigneeId || me_().id });
}

function assign_(p) {
  const req = loadRequestFor_(p.id);
  requirePerm_('request.review');
  if (!inScope_(req.unit) || ['submitted', 'in_review'].indexOf(req.status) === -1) throw new Error('มอบหมายคำขอนี้ไม่ได้');
  const target = DB.get('Users', p.userId);
  if (!target || !toBool_(target.active) || !userHasRole_(target, 'staff') || !inScope_(req.unit, { allUnits: splitList_(target.units).indexOf('*') > -1, units: splitList_(target.units) })) throw new Error('ผู้รับมอบหมายต้องเป็นเจ้าหน้าที่ในหน่วยงานของคำขอ');
  const r = DB.update('Requests', req.id, { assigneeId: target.id });
  history_(r, req.status, req.status, 'มอบหมายให้ ' + target.name + (p.note ? ' — ' + clean_(p.note, 200) : ''));
  audit_('assign', 'Requests', req.id, ['assigneeId'], p.note);
  notify_([target.id], r, 'ได้รับมอบหมายคำขอ ' + r.code);
  return r;
}

function confirmIdentity_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  if (!req.personSnap) throw new Error('คำขอยังไม่มีข้อมูลบุคคล');
  const note = clean_(p.note, 500);
  if (note.length < 5) throw new Error('ระบุหลักฐาน/วิธีที่ใช้ยืนยันตัวบุคคล (เช่น ตรวจรหัสบุคลากรกับหน่วยงาน)');
  const r = DB.update('Requests', req.id, { identityStatus: 'staff_confirmed', identityNote: note, identityBy: me_().id, identityAt: nowIso_() });
  history_(r, req.status, req.status, 'ยืนยันตัวบุคคล');
  audit_('identity.confirm', 'Requests', req.id, { identityStatus: 'staff_confirmed' }, '');
  return r;
}

function verifyWork_(p) {
  const w = DB.get('RequestWorks', p.workId);
  if (!w) throw new Error('ไม่พบผลงาน');
  const req = loadRequestFor_(w.requestId);
  requireStaffOn_(req, ['in_review']);
  if (['verified', 'rejected', 'pending'].indexOf(p.status) === -1) throw new Error('สถานะไม่ถูกต้อง');
  if (!ACTIVE_WORK_(w) || w.status === 'excluded_duplicate') throw new Error('ผลงานนี้ถูกถอน/คัดออกแล้ว');
  const note = clean_(p.note, 500);
  if (p.status === 'rejected' && !note) throw new Error('ระบุเหตุผลที่ไม่รับผลงานนี้');
  DB.update('RequestWorks', w.id, { status: p.status, staffNote: note });
  audit_('works.verify', 'RequestWorks', w.id, { status: p.status }, note);
  return true;
}

/** ตัดสินคู่ที่สงสัยว่าซ้ำ — "ซ้ำ" จะคัดรายการหนึ่งออก (ไม่ลบ) / "ไม่ซ้ำ" เก็บทั้งคู่ */
function resolveDup_(p) {
  const d = DB.get('DupPairs', p.pairId);
  if (!d) throw new Error('ไม่พบรายการ');
  const req = loadRequestFor_(d.requestId);
  requireStaffOn_(req, ['in_review']);
  const note = clean_(p.note, 500);
  if (p.decision === 'duplicate') {
    if ([d.workA, d.workB].indexOf(p.keepWorkId) === -1) throw new Error('เลือกรายการที่จะเก็บไว้');
    const drop = p.keepWorkId === d.workA ? d.workB : d.workA;
    DB.update('RequestWorks', drop, { status: 'excluded_duplicate', staffNote: 'ซ้ำกับรายการที่เก็บไว้' + (note ? ' — ' + note : '') });
    DB.update('DupPairs', d.id, { status: 'duplicate', keepWorkId: p.keepWorkId, note: note, resolvedBy: me_().id, resolvedAt: nowIso_() });
  } else if (p.decision === 'distinct') {
    if (!note) throw new Error('ระบุเหตุผลที่ถือว่าไม่ซ้ำ');
    DB.update('DupPairs', d.id, { status: 'distinct', note: note, resolvedBy: me_().id, resolvedAt: nowIso_() });
  } else throw new Error('เลือก "ซ้ำ" หรือ "ไม่ซ้ำ"');
  audit_('dup.resolve', 'DupPairs', d.id, { status: p.decision }, note);
  return true;
}

function setWorksComplete_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const note = clean_(p.note, 500);
  const val = toBool_(p.value);
  if (val && !note) throw new Error('ระบุแหล่งที่ใช้ตรวจความครบถ้วน (เช่น ตรวจกับ MUREX และ CV แล้ว)');
  const r = DB.update('Requests', req.id, { worksComplete: val, worksCompleteNote: val ? note : '' });
  audit_('works.complete', 'Requests', req.id, { worksComplete: val }, note);
  return r;
}

/** ผลตรวจของเจ้าหน้าที่ ใช้ได้กับข้อที่ระบบสรุปไม่ได้เท่านั้น */
function staffCheck_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const set = DB.get('CriteriaSets', req.criteriaSetId);
  const rule = parseJson_(set.rules, []).filter(function (r) { return r.id === p.ruleId; })[0];
  if (!rule) throw new Error('ไม่พบข้อเกณฑ์');
  if (['pass', 'fail', 'inconclusive'].indexOf(p.result) === -1) throw new Error('เลือกผล');
  const reason = clean_(p.reason, 1000);
  if (reason.length < 5) throw new Error('ระบุเหตุผลและหลักฐานที่ใช้ตรวจ');
  const latest = latestEvaluation_(req.id);
  const item = latest && latest.items.filter(function (i) { return i.ruleId === rule.id; })[0];
  if (item && item.by === 'system' && item.result !== 'inconclusive') throw new Error('ข้อนี้ระบบสรุปได้แล้ว — เจ้าหน้าที่บันทึกผลแทนได้เฉพาะข้อที่ "ยังสรุปไม่ได้"');
  DB.insert('StaffChecks', { requestId: req.id, criteriaSetId: set.id, ruleId: rule.id, result: p.result, reason: reason, by: me_().id, at: nowIso_() });
  audit_('staffCheck', 'Requests', req.id, { result: p.result }, rule.id);
  return evaluate_(req, 'staff_check', 'บันทึกผลตรวจข้อ ' + rule.id);
}

function latestEvaluation_(requestId) {
  const list = DB.all('Evaluations').filter(function (e) { return e.requestId === requestId; });
  return list.length ? evaluationView_(list[list.length - 1]) : null;
}

/** ประเมินซ้ำ — เลือกใช้เกณฑ์เวอร์ชันเดิมหรือเวอร์ชันปัจจุบัน (ผลเดิมยังเก็บไว้) */
function rerun_(p) {
  let req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const reason = clean_(p.reason, 300);
  if (!reason) throw new Error('ระบุเหตุผลที่ประเมินซ้ำ');
  if (toBool_(p.useLatestCriteria)) {
    const set = activeCriteriaFor_(req.typeId);
    if (!set) throw new Error('ไม่มีชุดเกณฑ์ที่ใช้งานอยู่');
    if (toBool_(set.isDemo) && !toBool_(req.isDemo)) throw new Error('ห้ามใช้เกณฑ์สำหรับสาธิตกับคำขอจริง');
    if (set.id !== req.criteriaSetId) {
      const old = DB.get('CriteriaSets', req.criteriaSetId);
      req = DB.update('Requests', req.id, { criteriaSetId: set.id });
      history_(req, req.status, req.status, 'เปลี่ยนเกณฑ์จากเวอร์ชัน ' + (old ? old.version : '?') + ' เป็น ' + set.version + ' — ' + reason);
      audit_('criteria.switch', 'Requests', req.id, { version: set.version }, reason);
    }
  }
  return evaluate_(req, 'rerun', reason);
}

function returnForRevision_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const items = [].concat(p.items || []).map(function (i) { return { section: i.section, message: clean_(i.message, 1000), workId: clean_(i.workId, 20) }; })
    .filter(function (i) { return SECTIONS[i.section] && i.message; });
  if (!items.length) throw new Error('ระบุรายการที่ต้องแก้ไขอย่างน้อย 1 รายการ (เลือกส่วนและข้อความ)');
  // รายการรอบก่อนที่ผู้ยื่นตอบแล้ว ถือว่าเจ้าหน้าที่รับแล้ว
  DB.all('RevisionItems').filter(function (i) { return i.requestId === req.id && i.status !== 'accepted'; }).forEach(function (i) {
    DB.update('RevisionItems', i.id, { status: 'accepted', closedBy: me_().id, closedAt: nowIso_() });
  });
  DB.insertMany('RevisionItems', items.map(function (i) {
    return { requestId: req.id, round: req.round, section: i.section, workId: i.workId, message: i.message, status: 'open', createdBy: me_().id };
  }));
  const r = transition_(req, 'returned', 'ส่งกลับแก้ไข ' + items.length + ' รายการ: ' + items.map(function (i) { return SECTIONS[i.section]; }).join(', '));
  notify_([r.requesterId], r, 'คำขอ ' + r.code + ' ถูกส่งกลับให้แก้ไข ' + items.length + ' รายการ');
  return r;
}

function forward_(p) {
  let req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['in_review']);
  const reviewer = DB.get('Users', p.reviewerId);
  if (!reviewer || !toBool_(reviewer.active) || !userHasRole_(reviewer, 'reviewer')) throw new Error('เลือกผู้พิจารณา');
  const units = splitList_(reviewer.units);
  if (units.indexOf('*') === -1 && units.indexOf(req.unit) === -1) throw new Error('ผู้พิจารณาที่เลือกไม่ได้รับผิดชอบหน่วยงานนี้');
  const block = [];
  if (!identityVerified_(req)) block.push('ยืนยันตัวบุคคล');
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); });
  const pending = works.filter(function (w) { return w.status === 'pending'; }).length;
  if (pending) block.push('ตรวจผลงานที่ยังค้าง ' + pending + ' รายการ');
  const dups = openDupPairs_(req.id, works).length;
  if (dups) block.push('ตัดสินผลงานที่สงสัยว่าซ้ำ ' + dups + ' คู่');
  const summary = clean_(p.summary, 2000);
  if (!summary) block.push('เขียนสรุปความเห็นของเจ้าหน้าที่');
  if (block.length) throw new Error('ยังส่งต่อไม่ได้ ต้อง: ' + block.join(', '));
  const ev = evaluate_(req, 'forward', 'ประเมินล่าสุดก่อนส่งผู้พิจารณา');
  req = transition_(req, 'pending_decision', 'ส่งต่อผู้พิจารณา: ' + reviewer.name, { reviewerId: reviewer.id, staffSummary: summary, assigneeId: req.assigneeId || me_().id });
  notify_([reviewer.id], req, 'มีคำขอรอพิจารณา: ' + req.code + ' ' + req.title);
  return { request: req, evaluation: ev };
}

function close_(p) {
  const req = loadRequestFor_(p.id);
  requireStaffOn_(req, ['decided']);
  const d = DB.all('Decisions').filter(function (x) { return x.requestId === req.id; }).pop();
  const r = transition_(req, 'closed', 'แจ้งผลและปิดงาน' + (p.note ? ': ' + clean_(p.note, 300) : ''), { closedAt: nowIso_() });
  notify_([r.requesterId], r, 'ผลการพิจารณาคำขอ ' + r.code + ': ' + (d ? DECISION_LABEL[d.decision] : '-') + (toBool_(r.isDemo) ? ' (คำขอสาธิต — ไม่มีผลจริง)' : ''));
  return r;
}

/* ---------------- ผู้พิจารณา ---------------- */

function decide_(p) {
  const req = loadRequestFor_(p.id);
  requirePerm_('decision.make');
  if (req.reviewerId !== me_().id) throw new Error('คำขอนี้ไม่ได้ส่งมาให้คุณพิจารณา');
  if (req.status !== 'pending_decision') throw new Error('คำขอนี้ไม่อยู่ในสถานะรอพิจารณา');
  if (!DECISION_LABEL[p.decision]) throw new Error('เลือกผลการพิจารณา');
  const reason = clean_(p.reason, 2000);
  if (reason.length < 5) throw new Error('ระบุเหตุผลประกอบการพิจารณา');
  const ev = latestEvaluation_(req.id);
  const d = DB.insert('Decisions', { requestId: req.id, evaluationId: ev ? ev.id : '', decision: p.decision, reason: reason, isDemo: toBool_(req.isDemo), by: me_().id, at: nowIso_() });
  audit_('decide', 'Requests', req.id, { decision: p.decision }, '');
  let r;
  if (p.decision === 'return_to_staff') {
    r = transition_(req, 'in_review', 'ผู้พิจารณาส่งกลับเจ้าหน้าที่: ' + reason);
    notify_([req.assigneeId], r, 'ผู้พิจารณาส่งคำขอ ' + r.code + ' กลับให้ตรวจเพิ่ม');
  } else {
    r = transition_(req, 'decided', 'บันทึกผลพิจารณา: ' + DECISION_LABEL[p.decision], { decidedAt: nowIso_() });
    notify_(staffOf_(r), r, 'คำขอ ' + r.code + ' พิจารณาแล้ว รอแจ้งผลและปิดงาน');
  }
  return { request: r, decision: d };
}

/* ---------------- รายการและรายละเอียด ---------------- */

function requestSummary_(r) {
  const snap = parseJson_(r.personSnap, null);
  const type = DB.get('RequestTypes', r.typeId);
  const st = STATUSES[r.status] || {};
  const last = DB.all('StatusHistory').filter(function (h) { return h.requestId === r.id; }).pop();
  return {
    id: r.id, code: r.code, title: r.title, typeName: type ? type.name : '', unit: r.unit, status: r.status, statusLabel: st.label, nextStep: st.next,
    holder: st.holder, holderName: st.holder === 'staff' ? (r.assigneeId ? userName_(r.assigneeId) : 'เจ้าหน้าที่ของหน่วยงาน (ยังไม่มีผู้รับ)') : st.holder === 'reviewer' ? userName_(r.reviewerId) : st.holder === 'requester' ? userName_(r.requesterId) : '',
    personName: snap ? (snap.nameTh || snap.nameEn) : '', round: r.round, isDemo: toBool_(r.isDemo), requesterName: userName_(r.requesterId),
    assigneeId: r.assigneeId, assigneeName: userName_(r.assigneeId), reviewerName: userName_(r.reviewerId), identityStatus: r.identityStatus,
    createdAt: r.createdAt, submittedAt: r.submittedAt, updatedAt: r.updatedAt, lastChangeAt: last ? last.at : r.createdAt,
    waitingDays: last ? Math.floor(daysBetween_(last.at) || 0) : 0
  };
}

function listRequests_(p) {
  const u = me_();
  let rows = DB.all('Requests').filter(canViewRequest_);
  const f = p || {};
  if (f.status) rows = rows.filter(function (r) { return r.status === f.status; });
  if (f.open) rows = rows.filter(function (r) { return OPEN_STATUSES.indexOf(r.status) > -1; });
  if (f.typeId) rows = rows.filter(function (r) { return r.typeId === f.typeId; });
  if (f.unit) rows = rows.filter(function (r) { return r.unit === f.unit; });
  if (f.assignee === 'me') rows = rows.filter(function (r) { return r.assigneeId === u.id; });
  else if (f.assignee === 'none') rows = rows.filter(function (r) { return !r.assigneeId; });
  else if (f.assignee) rows = rows.filter(function (r) { return r.assigneeId === f.assignee; });
  let out = rows.map(requestSummary_);
  if (f.q) {
    const q = String(f.q).toLowerCase();
    out = out.filter(function (r) { return [r.code, r.title, r.personName, r.requesterName].join(' ').toLowerCase().indexOf(q) > -1; });
  }
  out.sort(function (a, b) { return String(b.lastChangeAt).localeCompare(String(a.lastChangeAt)); });
  return out;
}

function attachmentView_(a) {
  return { id: a.id, workId: a.workId, docType: a.docType, docLabel: a.docType === 'evidence' ? 'หลักฐานผลงาน' : docLabel_(a.docType), fileName: a.fileName, mime: a.mime, size: Number(a.size), status: a.status, uploadedBy: userName_(a.uploadedBy), uploadedAt: a.uploadedAt, removedAt: a.removedAt };
}

function getRequest_(p) {
  const req = loadRequestFor_(p.id);
  const type = DB.get('RequestTypes', req.typeId);
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id; });
  const atts = DB.all('Attachments').filter(function (a) { return a.requestId === req.id; });
  const evals = DB.all('Evaluations').filter(function (e) { return e.requestId === req.id; }).map(evaluationView_).reverse();
  const set = criteriaView_(DB.get('CriteriaSets', req.criteriaSetId));
  const latestSet = activeCriteriaFor_(req.typeId);
  const latest = evals[0] || null;
  const u = me_();
  const actions = actionsFor_(req);
  const out = {
    request: Object.assign({}, req, { personSnap: parseJson_(req.personSnap, null), isDemo: toBool_(req.isDemo), worksComplete: toBool_(req.worksComplete) }),
    summary: requestSummary_(req), type: typeView_(type), criteria: set,
    newerCriteria: latestSet && set && latestSet.id !== set.id ? { id: latestSet.id, version: latestSet.version, name: latestSet.name, isDemo: toBool_(latestSet.isDemo) } : null,
    identityLabel: IDENTITY_LABEL[req.identityStatus || ''],
    works: works.map(function (w) { return Object.assign({}, w, { evidence: atts.filter(function (a) { return a.workId === w.id && a.status === 'active'; }).map(attachmentView_) }); }),
    dupPairs: DB.all('DupPairs').filter(function (d) { return d.requestId === req.id; }).map(function (d) { return Object.assign({}, d, { resolvedByName: userName_(d.resolvedBy) }); }),
    openDupCount: openDupPairs_(req.id, works).length,
    attachments: atts.filter(function (a) { return a.status === 'active' || u.role !== 'requester'; }).map(attachmentView_),
    requiredDocs: type ? requiredDocsFor_(req, type, works, atts.filter(function (a) { return a.status === 'active'; })) : [],
    revisionItems: DB.all('RevisionItems').filter(function (i) { return i.requestId === req.id; }).map(function (i) { return Object.assign({}, i, { createdByName: userName_(i.createdBy) }); }),
    history: DB.all('StatusHistory').filter(function (h) { return h.requestId === req.id; }).map(function (h) { return Object.assign({}, h, { byName: userName_(h.by), fromLabel: (STATUSES[h.fromStatus] || {}).label || '', toLabel: (STATUSES[h.toStatus] || {}).label || '' }); }),
    evaluations: evals, decisions: DB.all('Decisions').filter(function (d) { return d.requestId === req.id; }).map(function (d) { return Object.assign({}, d, { byName: userName_(d.by), isDemo: toBool_(d.isDemo) }); }),
    actions: actions, editable: editableSections_(req), completeness: ['draft', 'returned'].indexOf(req.status) > -1 ? completeness_(req) : null
  };
  out.dataChanged = !!(latest && actions.indexOf('rerun') > -1 && latest.snapshotHash !== currentDataHash_(req));
  if (actions.indexOf('forward') > -1 || actions.indexOf('assign') > -1) {
    out.staffOptions = usersFor_('staff', req.unit, toBool_(req.isDemo) ? undefined : false).map(function (x) { return { id: x.id, name: x.name }; });
    out.reviewerOptions = usersFor_('reviewer', req.unit, toBool_(req.isDemo) ? undefined : false).map(function (x) { return { id: x.id, name: x.name }; });
  }
  return out;
}
