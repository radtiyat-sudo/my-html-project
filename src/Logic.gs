/**
 * Logic.gs — คำนวณน้ำหนักคะแนน, ตรวจเกณฑ์อาจารย์/ผู้ทรงคุณวุฒิภายนอก, การแจ้งเตือนอัจฉริยะ
 * และการประเมินคุณภาพหลักสูตร (ฟังก์ชันบริสุทธิ์ ไม่แตะชีตโดยตรง ยกเว้น buildModel_)
 */

function currentBE_() { return new Date().getFullYear() + 543; }

/** รอบประเมิน 5 ปีย้อนหลัง เช่น ปีประเมิน 2569 → 2565–2569 */
function evalWindow_(settings) {
  const end = Number(settings.EVAL_YEAR) || currentBE_();
  return { start: end - APP.windowYears + 1, end: end };
}

/** น้ำหนักคะแนนของผลงาน 1 ชิ้น (0 = ไม่นับ) + เหตุผล */
function pubWeight_(p, settings) {
  const W = function (k) { return Number(settings[k]) || 0; };
  const db = DATABASES[p.database] || DATABASES.none;
  switch (p.type) {
    case 'journal':
      if (db.group === 'kpa_intl') {
        const q = /^Q[1-4]$/.test(p.quartile) ? p.quartile : 'NOQ';
        return { w: W('W_' + q), basis: 'ฐานข้อมูลนานาชาติตามประกาศ ก.พ.อ. (' + db.short + (q !== 'NOQ' ? ' ' + q : '') + ')' };
      }
      if (db.group === 'tci1') return { w: W('W_TCI1'), basis: 'TCI กลุ่มที่ 1' };
      if (db.group === 'tci2') return { w: W('W_TCI2'), basis: 'TCI กลุ่มที่ 2' };
      if (db.group === 'other_intl') return { w: W('W_OTHER_INTL'), basis: 'วารสารนานาชาติอื่น (สภาสถาบันอนุมัติ)' };
      if (db.group === 'other_nat') return { w: W('W_OTHER_NAT'), basis: 'วารสารระดับชาติอื่น (สภาสถาบันอนุมัติ)' };
      return { w: 0, basis: 'ไม่อยู่ในฐานข้อมูลที่ยอมรับ' + (p.database === 'tci3' ? ' (TCI กลุ่มที่ 3)' : '') };
    case 'proceedings_intl': return { w: W('W_PROC_INTL'), basis: 'Proceedings ระดับนานาชาติ' };
    case 'proceedings_nat':  return { w: W('W_PROC_NAT'), basis: 'Proceedings ระดับชาติ' };
    case 'textbook':         return { w: W('W_TEXTBOOK'), basis: 'ตำรา (ผ่านเกณฑ์ประเมินตำแหน่ง)' };
    case 'book':             return { w: W('W_BOOK'), basis: 'หนังสือ (ผ่านเกณฑ์ประเมินตำแหน่ง)' };
    case 'patent':           return { w: W('W_PATENT'), basis: 'สิทธิบัตร' };
    case 'petty_patent':     return { w: W('W_PETTY'), basis: 'อนุสิทธิบัตร' };
    case 'social':           return { w: W('W_SOCIAL'), basis: 'ผลงานวิชาการรับใช้สังคม' };
  }
  return { w: 0, basis: 'ไม่ระบุประเภท' };
}

/** อยู่ในฐานข้อมูลที่ยอมรับตามประกาศ ก.พ.อ. พ.ศ. 2562 (นานาชาติ 7 ฐาน + TCI 1–2) */
function isAccepted_(p) {
  const g = (DATABASES[p.database] || {}).group;
  return p.type === 'journal' && (g === 'kpa_intl' || g === 'tci1' || g === 'tci2');
}

function pubLevel_(p) {
  if (p.type === 'journal') return (DATABASES[p.database] || {}).level || '';
  return (PUB_TYPES[p.type] || {}).level || '';
}

/** เติมฟิลด์คำนวณให้ผลงาน */
function enrichPub_(p, settings, win) {
  const y = Number(p.year) || 0;
  const wt = pubWeight_(p, settings);
  return Object.assign({}, p, {
    year: y,
    weight: wt.w,
    basis: wt.basis,
    accepted: isAccepted_(p),
    level: pubLevel_(p),
    research: !!(PUB_TYPES[p.type] || {}).research,
    inWindow: y >= win.start && y <= win.end,
    expiring: y === win.start,          // จะหลุดรอบในปีถัดไป
    expired: y > 0 && y < win.start,    // เกิน 5 ปี ไม่นับแล้ว
    future: y > win.end
  });
}

function positionRank_(pos) { return (POSITIONS[pos] || { rank: 0 }).rank; }

function personName_(x) { return ((x.prefix || '') + (x.nameTh || x.nameEn || '')).trim(); }

/** ประเมินอาจารย์ประจำหลักสูตร 1 คน */
function evalFaculty_(f, pubs, curricula) {
  const mine = curricula.filter(function (c) { return splitIds_(f.curriculumIds).indexOf(c.id) > -1; });
  const level = mine.some(function (c) { return c.level === 'doctoral'; }) ? 'doctoral' : 'master';
  const cy = mine.map(function (c) { return String(c.criteriaYear); }).sort().pop() || '2565';
  const crit = FACULTY_CRITERIA[cy] || FACULTY_CRITERIA['2565'];

  const inWin = pubs.filter(function (p) { return p.inWindow; });
  const countable = inWin.filter(function (p) { return p.status === 'verified' && p.weight > 0; });
  const pending = inWin.filter(function (p) { return p.status === 'pending'; });
  const hasResearch = countable.some(function (p) { return p.research; });
  const pubsOk = countable.length >= crit.minPubs && (!crit.requireResearch || hasResearch);

  const qualOk = f.degree === 'doctoral' ||
    (f.degree === 'master' && positionRank_(f.position) >= crit.minPositionRank[level]);

  let status = 'pass';
  if (!countable.length) status = 'none';
  else if (!pubsOk) status = 'below';
  if (status === 'pass' && !qualOk) status = 'qual';

  return {
    level: level, criteriaYear: cy, required: crit.minPubs,
    count: countable.length, pendingCount: pending.length,
    totalPubs: pubs.length, hasResearch: hasResearch,
    weightSum: round2_(countable.reduce(function (s, p) { return s + p.weight; }, 0)),
    expiringCount: countable.filter(function (p) { return p.expiring; }).length,
    pubsOk: pubsOk, qualOk: qualOk, meets: pubsOk && qualOk, status: status
  };
}

/** ประเมินผู้ทรงคุณวุฒิภายนอก เทียบเกณฑ์ทุกปี */
function evalExpert_(x, pubs) {
  const level = x.level === 'master' ? 'master' : 'doctoral';
  const confirmed = pubs.filter(function (p) { return p.status === 'verified'; });
  const intl = confirmed.filter(function (p) { return p.level === 'intl' && p.weight > 0; }).length;
  const nat = confirmed.filter(function (p) { return p.level === 'nat' && p.weight > 0; }).length;
  const accepted = confirmed.filter(function (p) { return p.accepted; }).length;
  const notCounted = pubs.filter(function (p) { return p.weight <= 0; }).length;

  const results = {};
  Object.keys(EXPERT_CRITERIA).forEach(function (yr) {
    const c = EXPERT_CRITERIA[yr][level];
    const degRank = (DEGREES[x.degree] || { rank: 0 }).rank;
    const qualOk = degRank >= DEGREES[c.minDegree].rank ||
      (c.altMasterRank !== null && x.degree === 'master' && positionRank_(x.position) >= c.altMasterRank);
    let workOk = false, workValue = '';
    if (c.kind === 'researchExp') {
      workOk = toBool_(x.researchExp) || confirmed.some(function (p) { return p.research; });
      workValue = workOk ? 'มีประสบการณ์ทำวิจัย' : 'ไม่พบประสบการณ์ทำวิจัย';
    } else if (c.kind === 'intl') {
      workOk = intl >= c.min; workValue = 'นานาชาติ ' + intl + '/' + c.min;
    } else if (c.kind === 'nat10_or_intl5') {
      workOk = intl >= 5 || (nat + intl) >= 10; workValue = 'ชาติ ' + (nat + intl) + '/10 · นานาชาติ ' + intl + '/5';
    } else if (c.kind === 'accepted') {
      workOk = accepted >= c.min; workValue = 'ฐานที่ยอมรับ ' + accepted + '/' + c.min;
    }
    results[yr] = {
      qualText: c.qualText, workText: c.workText, qualOk: qualOk,
      qualValue: (DEGREES[x.degree] || { label: '-' }).label + (x.position ? ', ' + (POSITIONS[x.position] || { label: x.position }).label : ''),
      workOk: workOk, workValue: workValue, pass: qualOk && workOk
    };
  });
  const cy = String(x.criteriaYear || '2565');
  return {
    level: level, criteriaYear: cy, results: results,
    pass: results[cy] ? results[cy].pass : false,
    counts: { total: pubs.length, intl: intl, nat: nat, accepted: accepted, notCounted: notCounted, confirmed: confirmed.length }
  };
}

/** สรุปสถานะหลักสูตรตามเกณฑ์มาตรฐาน (ข้อ 1.1) */
function evalCurriculum_(c, faculty) {
  const crit = FACULTY_CRITERIA[String(c.criteriaYear)] || FACULTY_CRITERIA['2565'];
  const members = faculty.filter(function (f) { return splitIds_(f.curriculumIds).indexOf(c.id) > -1 && toBool_(f.active); });
  const qualified = members.filter(function (f) { return f.eval.meets; });
  return {
    facultyCount: members.length, qualifiedCount: qualified.length, minFaculty: crit.minFaculty,
    memberIds: members.map(function (f) { return f.id; }),
    pass: members.length >= crit.minFaculty && qualified.length === members.length && members.length > 0
  };
}

/** ประเมินคุณภาพหลักสูตร ตัวบ่งชี้ 4.2 สำหรับปีที่เลือก */
function assessCurriculum_(model, curriculumId, year) {
  const c = model.curricula.filter(function (x) { return x.id === curriculumId; })[0];
  if (!c) throw new Error('ไม่พบหลักสูตร');
  year = Number(year) || model.window.end;
  const t = QA_TARGETS[c.level] || QA_TARGETS.master;
  const members = model.faculty.filter(function (f) { return c.eval.memberIds.indexOf(f.id) > -1; });
  const n = members.length;
  const pubsOfYear = model.publications.filter(function (p) {
    return p.personType === 'faculty' && c.eval.memberIds.indexOf(p.personId) > -1 &&
      p.status === 'verified' && p.year === year && p.weight > 0;
  });
  const phd = members.filter(function (f) { return f.degree === 'doctoral'; }).length;
  const pos = members.filter(function (f) { return positionRank_(f.position) >= 1; }).length;
  const wsum = round2_(pubsOfYear.reduce(function (s, p) { return s + p.weight; }, 0));
  const pct = function (a) { return n ? round2_(a / n * 100) : 0; };
  const score = function (p, target) { return round2_(Math.min(5, p / target * 5)); };

  const ind = [
    { code: '4.2.1', name: 'ร้อยละของอาจารย์ประจำหลักสูตรที่มีคุณวุฒิปริญญาเอก', value: pct(phd), detail: phd + '/' + n + ' คน', target: t.phd },
    { code: '4.2.2', name: 'ร้อยละของอาจารย์ประจำหลักสูตรที่ดำรงตำแหน่งทางวิชาการ', value: pct(pos), detail: pos + '/' + n + ' คน', target: t.position },
    { code: '4.2.3', name: 'ผลงานวิชาการของอาจารย์ประจำหลักสูตร (ผลรวมถ่วงน้ำหนัก/จำนวนอาจารย์ × 100)', value: pct(wsum), detail: 'ผลรวมถ่วงน้ำหนัก ' + wsum.toFixed(2) + ' จาก ' + pubsOfYear.length + ' ผลงาน', target: t.pubs }
  ].map(function (i) { i.score = score(i.value, i.target); return i; });
  const overall = round2_(ind.reduce(function (s, i) { return s + i.score; }, 0) / ind.length);

  const breakdown = {};
  pubsOfYear.forEach(function (p) { const k = p.basis; breakdown[k] = breakdown[k] || { basis: k, weight: p.weight, count: 0 }; breakdown[k].count++; });

  return {
    curriculum: { id: c.id, code: c.code, nameTh: c.nameTh, level: c.level, criteriaYear: c.criteriaYear },
    year: year, n: n,
    standard: [
      { name: 'จำนวนอาจารย์ประจำหลักสูตรไม่น้อยกว่า ' + c.eval.minFaculty + ' คน', ok: n >= c.eval.minFaculty, value: n + ' คน' },
      { name: 'คุณสมบัติอาจารย์ประจำหลักสูตร (คุณวุฒิ/ตำแหน่ง)', ok: n > 0 && members.every(function (f) { return f.eval.qualOk; }), value: members.filter(function (f) { return f.eval.qualOk; }).length + '/' + n + ' คน' },
      { name: 'ผลงานทางวิชาการอย่างน้อย 3 รายการในรอบ 5 ปี (' + model.window.start + '–' + model.window.end + ')', ok: n > 0 && members.every(function (f) { return f.eval.pubsOk; }), value: members.filter(function (f) { return f.eval.pubsOk; }).length + '/' + n + ' คน' }
    ],
    indicators: ind, overall: overall, level: qaLevel_(overall),
    breakdown: Object.keys(breakdown).map(function (k) { return breakdown[k]; }),
    members: members.map(function (f) {
      const ys = pubsOfYear.filter(function (p) { return p.personId === f.id; });
      return { id: f.id, name: f.displayName, position: f.position, degree: f.degree, pubsYear: ys.length,
        weightYear: round2_(ys.reduce(function (s, p) { return s + p.weight; }, 0)), count5: f.eval.count, meets: f.eval.meets };
    })
  };
}

function qaLevel_(s) {
  if (s <= 2) return 'ต้องปรับปรุงเร่งด่วน';
  if (s <= 3) return 'ระดับพอใช้';
  if (s <= 4) return 'ระดับดี';
  return 'ระดับดีมาก';
}

function round2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** การแจ้งเตือนอัจฉริยะ */
function buildAlerts_(model) {
  const alerts = [];
  const fac = model.faculty.filter(function (f) { return toBool_(f.active); });
  const ref = function (f, extra) { return { id: f.id, type: 'faculty', name: f.displayName, extra: extra || '' }; };

  const none = fac.filter(function (f) { return f.eval.count === 0; });
  if (none.length) alerts.push({ level: 'danger', icon: 'x-circle', key: 'no_pubs',
    title: 'อาจารย์ไม่มีผลงานใน 5 ปีย้อนหลัง (' + none.length + ' ท่าน)', items: none.map(function (f) { return ref(f); }) });

  const expiring = {};
  model.publications.forEach(function (p) {
    if (p.personType === 'faculty' && p.expiring && p.status === 'verified' && p.weight > 0) expiring[p.personId] = (expiring[p.personId] || 0) + 1;
  });
  const exp = fac.filter(function (f) { return expiring[f.id]; });
  if (exp.length) alerts.push({ level: 'warning', icon: 'clock', key: 'expiring',
    title: 'ผลงานใกล้หมดอายุ 5 ปี (ตีพิมพ์ปี ' + model.window.start + ' — จะไม่นับในปี ' + (model.window.end + 1) + ')',
    items: exp.map(function (f) { return ref(f, expiring[f.id] + ' เรื่อง'); }) });

  const below = fac.filter(function (f) { return !f.eval.pubsOk; });
  if (below.length) alerts.push({ level: 'danger', icon: 'alert-triangle', key: 'below',
    title: 'อาจารย์ที่ผลงานยังไม่ถึงเกณฑ์ขั้นต่ำ (' + below.length + ' ท่าน)',
    items: below.map(function (f) { return ref(f, f.eval.count + '/' + f.eval.required); }) });

  const qual = fac.filter(function (f) { return !f.eval.qualOk; });
  if (qual.length) alerts.push({ level: 'warning', icon: 'graduation-cap', key: 'qual',
    title: 'คุณวุฒิ/ตำแหน่งวิชาการไม่เป็นไปตามเกณฑ์ (' + qual.length + ' ท่าน)', items: qual.map(function (f) { return ref(f); }) });

  const cur = model.curricula.filter(function (c) { return c.status !== 'closed' && !c.eval.pass; });
  if (cur.length) alerts.push({ level: 'danger', icon: 'layers', key: 'curriculum',
    title: 'หลักสูตรที่ยังไม่ผ่านเกณฑ์มาตรฐาน (' + cur.length + ' หลักสูตร)',
    items: cur.map(function (c) { return { id: c.id, type: 'curriculum', name: c.code || c.nameTh, extra: c.eval.qualifiedCount + '/' + c.eval.facultyCount + ' ผ่าน' }; }) });

  const pend = model.publications.filter(function (p) { return p.status === 'pending'; }).length;
  if (pend) alerts.push({ level: 'info', icon: 'hourglass', key: 'pending',
    title: 'ผลงานรอตรวจรับรอง ' + pend + ' รายการ', items: [], link: 'verify' });

  return alerts;
}

/** ประกอบข้อมูลทั้งหมดที่หน้าเว็บต้องใช้ (กรองตามสิทธิ์ผู้ใช้) */
function buildModel_(user) {
  const settings = getSettings_();
  const win = evalWindow_(settings);
  const curricula = DB.all('Curricula');
  const rawFaculty = DB.all('Faculty');
  const rawExperts = DB.all('Experts');
  const pubs = DB.all('Publications').map(function (p) { return enrichPub_(p, settings, win); });

  const byPerson = {};
  pubs.forEach(function (p) { const k = p.personType + ':' + p.personId; (byPerson[k] = byPerson[k] || []).push(p); });

  const faculty = rawFaculty.map(function (f) {
    const o = Object.assign({}, f, { displayName: personName_(f), curriculumIds: splitIds_(f.curriculumIds).join(',') });
    o.eval = evalFaculty_(o, byPerson['faculty:' + f.id] || [], curricula);
    return o;
  });
  const curr = curricula.map(function (c) {
    const o = Object.assign({}, c);
    o.eval = evalCurriculum_(o, faculty);
    return o;
  });
  const experts = rawExperts.map(function (x) {
    const o = Object.assign({}, x, { displayName: personName_(x) });
    o.eval = evalExpert_(o, byPerson['expert:' + x.id] || []);
    return o;
  });

  const nameOf = {};
  faculty.forEach(function (f) { nameOf['faculty:' + f.id] = f.displayName; });
  experts.forEach(function (x) { nameOf['expert:' + x.id] = x.displayName; });
  pubs.forEach(function (p) { p.personName = nameOf[p.personType + ':' + p.personId] || '(ไม่พบเจ้าของผลงาน)'; });

  let model = { settings: publicSettings_(settings), window: win, curricula: curr, faculty: faculty, experts: experts, publications: pubs };
  model.alerts = buildAlerts_(model);
  model.kpis = buildKpis_(model);
  model.chart = buildChart_(model);
  model.assessments = curr.filter(function (c) { return c.status !== 'closed'; }).map(function (c) {
    const a = assessCurriculum_(model, c.id, win.end);
    return { curriculumId: c.id, overall: a.overall, level: a.level, indicators: a.indicators };
  });
  return scopeModel_(model, user);
}

function buildKpis_(m) {
  const fac = m.faculty.filter(function (f) { return toBool_(f.active); });
  const counted = m.publications.filter(function (p) { return p.personType === 'faculty' && p.inWindow && p.status === 'verified' && p.weight > 0; });
  return {
    curricula: m.curricula.filter(function (c) { return c.status !== 'closed'; }).length,
    curriculaPass: m.curricula.filter(function (c) { return c.status !== 'closed' && c.eval.pass; }).length,
    faculty: fac.length,
    facultyPass: fac.filter(function (f) { return f.eval.meets; }).length,
    counted: counted.length,
    weightSum: round2_(counted.reduce(function (s, p) { return s + p.weight; }, 0)),
    pending: m.publications.filter(function (p) { return p.status === 'pending'; }).length,
    experts: m.experts.length,
    expertsPass: m.experts.filter(function (x) { return x.eval.pass; }).length
  };
}

/** ข้อมูลกราฟ: จำนวนผลงาน (รับรองแล้ว) รายปี แยกกลุ่มฐานข้อมูล */
function buildChart_(m) {
  const years = [];
  for (let y = m.window.start; y <= m.window.end; y++) years.push(y);
  const series = { intl: [], tci: [], other: [] };
  years.forEach(function (y) {
    const ps = m.publications.filter(function (p) { return p.personType === 'faculty' && p.year === y && p.status === 'verified' && p.weight > 0; });
    const g = function (p) { return (DATABASES[p.database] || {}).group; };
    series.intl.push(ps.filter(function (p) { return p.type === 'journal' && g(p) === 'kpa_intl'; }).length);
    series.tci.push(ps.filter(function (p) { return p.type === 'journal' && (g(p) === 'tci1' || g(p) === 'tci2'); }).length);
    series.other.push(ps.length - series.intl[series.intl.length - 1] - series.tci[series.tci.length - 1]);
  });
  return { years: years, series: series };
}

function publicSettings_(s) {
  const o = {};
  Object.keys(s).forEach(function (k) { o[k] = s[k]; });
  return o;
}

/** กรองข้อมูลตามบทบาท */
function scopeModel_(m, user) {
  if (user.role === 'lecturer') {
    const me = m.faculty.filter(function (f) { return f.id === user.facultyId; })[0];
    const myCur = me ? splitIds_(me.curriculumIds) : [];
    m.publications = m.publications.filter(function (p) { return p.personType === 'faculty' && p.personId === user.facultyId; });
    m.faculty = m.faculty.filter(function (f) { return f.id === user.facultyId; });
    m.curricula = m.curricula.filter(function (c) { return myCur.indexOf(c.id) > -1; });
    m.experts = [];
    m.alerts = m.alerts.map(function (a) {
      return Object.assign({}, a, {
        title: a.title.replace(/\s*\(\d+ (ท่าน|หลักสูตร)\)/, ''),
        items: a.items.filter(function (i) { return i.type === 'faculty' ? i.id === user.facultyId : myCur.indexOf(i.id) > -1; })
      });
    }).filter(function (a) { return a.items.length && a.key !== 'pending'; });
    m.assessments = m.assessments.filter(function (a) { return myCur.indexOf(a.curriculumId) > -1; });
  }
  return m;
}
