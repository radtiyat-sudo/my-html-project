/**
 * Matching.gs — ค้นหา/ยืนยันตัวบุคคล และตรวจผลงานซ้ำ
 *
 * หลักการ
 * - ใช้รหัสบุคลากร (staffCode) เป็นหลักในการยืนยันตัวบุคคล ไม่ยืนยันจากชื่อเพียงอย่างเดียว
 * - ค้นจากชื่อไทย ชื่ออังกฤษ และชื่อเดิมได้ แต่ผลที่ได้จากชื่อ "ต้องให้เจ้าหน้าที่ยืนยัน" เสมอ
 * - ผลงานซ้ำ: ตรวจ DOI ก่อน แล้วจึงดูชื่อเรื่อง+ปี — ไม่รวมรายการให้อัตโนมัติ ให้เจ้าหน้าที่ตัดสิน
 */

const NAME_PREFIX_RE_ = /^(ศาสตราจารย์|รองศาสตราจารย์|ผู้ช่วยศาสตราจารย์|อาจารย์|ศ\.|รศ\.|ผศ\.|อ\.|ดร\.|นายแพทย์|แพทย์หญิง|นพ\.|พญ\.|นางสาว|นาย|นาง|น\.ส\.|prof\.?|professor|assoc\.?|asst\.?|associate|assistant|dr\.?|mr\.?|mrs\.?|ms\.?|miss)\s*/i;

function normName_(s) {
  let t = String(s || '').trim().toLowerCase();
  for (let i = 0; i < 6; i++) {
    const n = t.replace(NAME_PREFIX_RE_, '');
    if (n === t) break;
    t = n.trim();
  }
  return t.replace(/[^a-z฀-๿]/g, '');
}

function personNames_(p) {
  const out = [
    { kind: 'th', text: [p.firstNameTh, p.lastNameTh].join(' ') },
    { kind: 'en', text: [p.firstNameEn, p.lastNameEn].join(' ') },
    { kind: 'en_rev', text: [p.lastNameEn, p.firstNameEn].join(' ') }
  ];
  splitList_(String(p.formerNames || '').replace(/;/g, '|')).forEach(function (n) { out.push({ kind: 'former', text: n }); });
  return out.filter(function (x) { return normName_(x.text); });
}

function personDisplay_(p) {
  return {
    personId: p.id, origin: p.origin, staffCode: p.staffCode, titleTh: p.titleTh,
    nameTh: [p.firstNameTh, p.lastNameTh].filter(String).join(' '), nameEn: [p.firstNameEn, p.lastNameEn].filter(String).join(' '),
    formerNames: p.formerNames || '', unit: p.unit, position: p.position, academicRank: p.academicRank, highestDegree: p.highestDegree,
    employmentStatus: p.employmentStatus, fetchedAt: p.fetchedAt, sourceUpdatedAt: p.sourceUpdatedAt, staleness: staleInfo_(p)
  };
}

/** ค้นหาบุคคลในแหล่ง MUHR (โหมดปัจจุบัน) จากรหัสบุคลากร และ/หรือ ชื่อ */
function searchPersons_(p) {
  const code = String(p.staffCode || '').trim().toUpperCase();
  const name = normName_(p.name);
  if (!code && name.length < 2) throw new Error('กรอกรหัสบุคลากร หรือชื่ออย่างน้อย 2 ตัวอักษร');
  const rows = sourceRows_('MUHR');
  const results = [];
  rows.forEach(function (r) {
    let basis = '', matchedName = '';
    if (code && String(r.staffCode).toUpperCase() === code) basis = 'staffCode';
    else if (!code && name) {
      personNames_(r).forEach(function (n) {
        const nn = normName_(n.text);
        const exact = nn === name, part = !exact && name.length >= 3 && nn.indexOf(name) > -1;
        if ((exact || part) && (!basis || (exact && basis.indexOf('partial') > -1))) {
          basis = (n.kind === 'former' ? 'former_name' : 'name') + (exact ? '' : '_partial');
          matchedName = n.text;
        }
      });
    }
    if (basis) results.push(Object.assign(personDisplay_(r), { matchBasis: basis, matchedName: matchedName }));
  });
  // ชื่อซ้ำ: บุคคลต่างรหัสที่มีชื่อ (ไทยหรืออังกฤษ) ตรงกัน → ต้องระบุรหัสหรือให้เจ้าหน้าที่ยืนยัน
  const keyCount = {};
  rows.forEach(function (r) {
    [normName_([r.firstNameTh, r.lastNameTh].join(' ')), normName_([r.firstNameEn, r.lastNameEn].join(' '))].filter(String).forEach(function (k) { keyCount[k] = (keyCount[k] || 0) + 1; });
  });
  results.forEach(function (x) {
    const k1 = normName_(x.nameTh), k2 = normName_(x.nameEn);
    x.sameNameCount = Math.max(keyCount[k1] || 0, keyCount[k2] || 0);
    x.duplicateName = x.sameNameCount > 1;
  });
  return {
    results: results.slice(0, 30), total: results.length,
    ambiguous: results.filter(function (x) { return x.matchBasis !== 'staffCode'; }).length > 1 || results.some(function (x) { return x.duplicateName; }),
    source: sourceStatus_('MUHR')
  };
}

/** สร้าง snapshot ข้อมูลบุคคล ณ เวลาที่เลือก (เก็บไว้กับคำขอ ใช้ย้อนดูได้ว่าใช้ข้อมูลอะไร) */
function personSnapFromSource_(rec, basis, duplicateName) {
  return Object.assign(personDisplay_(rec), { kind: 'source', source: 'MUHR', matchBasis: basis, duplicateName: !!duplicateName, selectedAt: nowIso_() });
}

function personSnapManual_(p) {
  const s = {
    kind: 'manual', source: 'manual', titleTh: clean_(p.titleTh, 60), nameTh: clean_(p.nameTh, 150), nameEn: clean_(p.nameEn, 150),
    formerNames: clean_(p.formerNames, 200), affiliation: clean_(p.affiliation, 200), position: clean_(p.position, 120),
    academicRank: RANKS[p.academicRank] ? p.academicRank : '', highestDegree: DEGREES[p.highestDegree] ? p.highestDegree : '',
    employmentStatus: 'external', reason: clean_(p.reason, 300), selectedAt: nowIso_()
  };
  if (!s.nameTh && !s.nameEn) throw new Error('กรอกชื่อ-นามสกุล (ไทยหรืออังกฤษ)');
  if (!s.affiliation) throw new Error('กรอกสังกัด/หน่วยงานของบุคคล');
  return s;
}

/** สถานะการยืนยันตัวบุคคลที่ได้จากการเลือก — มีเพียงการจับคู่ด้วยรหัสบุคลากรที่ถือว่ายืนยันแล้ว */
function identityFromSnap_(snap) {
  if (snap.kind === 'source' && snap.matchBasis === 'staffCode') return 'code_match';
  return 'needs_staff_check';
}

const IDENTITY_LABEL = {
  code_match: 'ยืนยันด้วยรหัสบุคลากรจากระบบต้นทาง',
  staff_confirmed: 'เจ้าหน้าที่ยืนยันตัวบุคคลแล้ว',
  needs_staff_check: 'รอเจ้าหน้าที่ยืนยันตัวบุคคล',
  '': 'ยังไม่ได้เลือกบุคคล'
};

function identityVerified_(req) { return req.identityStatus === 'code_match' || req.identityStatus === 'staff_confirmed'; }

/* ---------------- ผลงานซ้ำ ---------------- */

function normDoi_(d) {
  return String(d || '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '').trim();
}

function normTitle_(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9฀-๿]/g, ''); }

function dice_(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = function (s) { const m = {}; for (let i = 0; i < s.length - 1; i++) { const g = s.substr(i, 2); m[g] = (m[g] || 0) + 1; } return m; };
  const ga = grams(a), gb = grams(b);
  let inter = 0, na = 0, nb = 0;
  Object.keys(ga).forEach(function (g) { na += ga[g]; if (gb[g]) inter += Math.min(ga[g], gb[g]); });
  Object.keys(gb).forEach(function (g) { nb += gb[g]; });
  return na + nb ? (2 * inter) / (na + nb) : 0;
}

const DUP_TITLE_THRESHOLD = 0.88;

/** เปรียบเทียบผลงาน 2 รายการ — คืน {basis, score} หรือ null */
function dupCheck_(a, b) {
  const da = normDoi_(a.doi), db = normDoi_(b.doi);
  if (da && db) return da === db ? { basis: 'doi', score: 1 } : null;
  const s = dice_(normTitle_(a.title), normTitle_(b.title));
  const ya = normYear_(a.year), yb = normYear_(b.year);
  const yearOk = !ya || !yb || Math.abs(ya - yb) <= 1;
  if (s >= DUP_TITLE_THRESHOLD && yearOk) return { basis: s === 1 ? 'title_year' : 'title_similar', score: Math.round(s * 100) / 100 };
  return null;
}

const ACTIVE_WORK_ = function (w) { return w.status !== 'withdrawn'; };

/** หาคู่ที่สงสัยว่าซ้ำในคำขอ แล้วบันทึกเป็น "สงสัยว่าซ้ำ" ให้เจ้าหน้าที่ตัดสิน (ไม่รวมรายการเอง) */
function detectDuplicates_(requestId) {
  const works = DB.all('RequestWorks').filter(function (w) { return w.requestId === requestId && ACTIVE_WORK_(w); });
  const pairs = DB.all('DupPairs').filter(function (d) { return d.requestId === requestId; });
  const has = {};
  pairs.forEach(function (d) { has[[d.workA, d.workB].sort().join('|')] = true; });
  const add = [];
  for (let i = 0; i < works.length; i++) {
    for (let j = i + 1; j < works.length; j++) {
      const k = [works[i].id, works[j].id].sort().join('|');
      if (has[k]) continue;
      const m = dupCheck_(works[i], works[j]);
      if (m) { add.push({ requestId: requestId, workA: works[i].id, workB: works[j].id, basis: m.basis, score: m.score, status: 'suspected' }); has[k] = true; }
    }
  }
  if (add.length) DB.insertMany('DupPairs', add);
  return add.length;
}

/** คู่ซ้ำที่ยังต้องตัดสิน (ไม่นับคู่ที่ผลงานถูกถอนออกแล้ว) */
function openDupPairs_(requestId, works) {
  const active = {};
  (works || DB.all('RequestWorks').filter(function (w) { return w.requestId === requestId; }))
    .forEach(function (w) { if (ACTIVE_WORK_(w) && w.status !== 'excluded_duplicate') active[w.id] = true; });
  return DB.all('DupPairs').filter(function (d) { return d.requestId === requestId && d.status === 'suspected' && active[d.workA] && active[d.workB]; });
}
