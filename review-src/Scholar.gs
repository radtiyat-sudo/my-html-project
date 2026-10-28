/**
 * Scholar.gs — ค้นผลงานจากฐานข้อมูลวิชาการ (Scopus → Web of Science → PubMed → ERIC → TCI/ThaiJO → OpenAlex)
 *
 * ใช้โค้ดค้นหาชุดเดียวกับระบบ MUGR (Discovery.gs + Sources.gs ซึ่งถูกรวมไว้ถัดจากไฟล์นี้)
 * ไฟล์นี้มีเฉพาะค่าที่โค้ดชุดนั้นต้องใช้ และคำสั่งที่ผูกการค้นเข้ากับคำขอ
 *
 * หลักการ
 * - ระบบแสดง "ข้อเท็จจริง" ว่าพบในฐานใด/วารสารอยู่ในฐานใด พร้อมลิงก์ยืนยัน — ไม่ให้คะแนนหรือตัดสินแทนเกณฑ์
 * - แยกผลที่ยืนยันจากฐานโดยตรง (record) / จากรายชื่อวารสาร (journal) / ยังยืนยันไม่ได้
 * - Quartile เก็บพร้อมแหล่งและปีที่ใช้ (CiteScore ปีใด หรือรายชื่อ SJR ที่นำเข้า) ไม่ใช้ค่าคนละแหล่งแทนกันโดยไม่บอก
 * - API key เก็บใน Script Properties เท่านั้น
 */

/** ฐานข้อมูลตามประกาศ ก.พ.อ. 2562 (ข้อเท็จจริงด้านการจัดทำดัชนี ใช้แสดงผลและเป็นตัวเลือกในเกณฑ์) */
const DATABASES = {
  scopus: { label: 'Scopus', short: 'Scopus', group: 'kpa_intl', level: 'intl', quartile: true },
  wos: { label: 'Web of Science (SCIE / SSCI / AHCI)', short: 'WoS', group: 'kpa_intl', level: 'intl', quartile: true },
  pubmed: { label: 'PubMed', short: 'PubMed', group: 'kpa_intl', level: 'intl', quartile: true },
  eric: { label: 'ERIC', short: 'ERIC', group: 'kpa_intl', level: 'intl', quartile: false },
  mathscinet: { label: 'MathSciNet', short: 'MathSciNet', group: 'kpa_intl', level: 'intl', quartile: false },
  jstor: { label: 'JSTOR', short: 'JSTOR', group: 'kpa_intl', level: 'intl', quartile: false },
  projectmuse: { label: 'Project Muse', short: 'Muse', group: 'kpa_intl', level: 'intl', quartile: false },
  tci1: { label: 'TCI กลุ่มที่ 1', short: 'TCI 1', group: 'tci1', level: 'nat', quartile: false },
  tci2: { label: 'TCI กลุ่มที่ 2', short: 'TCI 2', group: 'tci2', level: 'nat', quartile: false },
  tci3: { label: 'TCI กลุ่มที่ 3', short: 'TCI 3', group: 'none', level: 'nat', quartile: false },
  other_intl: { label: 'วารสารนานาชาติอื่น', short: 'นานาชาติอื่น', group: 'other_intl', level: 'intl', quartile: false },
  other_nat: { label: 'วารสารระดับชาติอื่น', short: 'ชาติอื่น', group: 'other_nat', level: 'nat', quartile: false },
  none: { label: 'ไม่พบในฐานข้อมูล / ยังระบุไม่ได้', short: '—', group: 'none', level: '', quartile: false }
};

/** กลุ่มฐานข้อมูลที่ใช้เลือกในเกณฑ์ (ค่าที่เลือกต้องมาจากประกาศที่หน่วยงานยืนยัน) */
const DB_GROUPS = { kpa_intl: 'ฐานนานาชาติตามประกาศ ก.พ.อ. (Scopus/WoS/PubMed/ERIC/...)', tci1: 'TCI กลุ่มที่ 1', tci2: 'TCI กลุ่มที่ 2' };

const PUB_TYPES = {
  journal: { label: 'บทความในวารสารวิชาการ' },
  proceedings_intl: { label: 'Proceedings ระดับนานาชาติ', level: 'intl' },
  proceedings_nat: { label: 'Proceedings ระดับชาติ', level: 'nat' },
  textbook: { label: 'ตำรา' },
  book: { label: 'หนังสือ' },
  patent: { label: 'สิทธิบัตร' },
  petty_patent: { label: 'อนุสิทธิบัตร' },
  social: { label: 'ผลงานวิชาการรับใช้สังคม' }
};
const PUB_TO_WORK_TYPE_ = { journal: 'journal', proceedings_intl: 'proceeding', proceedings_nat: 'proceeding', textbook: 'book', book: 'book', patent: 'patent', petty_patent: 'patent', social: 'other' };

/* ---- ฟังก์ชันที่โค้ดค้นหาของ MUGR เรียกใช้ (ระบบนี้ไม่คิดคะแนนน้ำหนัก) ---- */
function currentBE_() { return Number(nowIso_().slice(0, 4)) + 543; }
function evalWindow_() { const e = currentBE_(); return { start: e - 4, end: e }; }
function pubWeight_() { return { w: '', basis: '' }; }
function isAccepted_(p) { const g = (DATABASES[p.database] || {}).group; return g === 'kpa_intl' || g === 'tci1' || g === 'tci2'; }
function requireRole_() { requirePerm_('admin.data'); }
function currentUser_() { return CURRENT_USER_; }

/* ---- เก็บผลค้นไว้ชั่วคราวฝั่งเซิร์ฟเวอร์ (ไม่เชื่อข้อมูลผลงานที่หน้าเว็บส่งกลับมา) ---- */
function cachePutBig_(key, obj) {
  const s = JSON.stringify(obj);
  const parts = s.match(/[\s\S]{1,90000}/g) || [''];
  const cache = CacheService.getScriptCache();
  const all = { };
  parts.forEach(function (p, i) { all[key + '_' + i] = p; });
  all[key] = String(parts.length);
  cache.putAll ? cache.putAll(all, 3600) : Object.keys(all).forEach(function (k) { cache.put(k, all[k], 3600); });
}
function cacheGetBig_(key) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key));
  if (!n) return null;
  let s = '';
  for (let i = 0; i < n; i++) { const p = cache.get(key + '_' + i); if (p === null) return null; s += p; }
  return JSON.parse(s);
}

function quartileSource_(w) {
  if (!w.quartile) return '';
  const sr = w.direct && w.direct.scopus && w.direct.scopus.serial;
  if ((w.evidence || []).some(function (e) { return e.indexOf('ใช้ Quartile จาก CiteScore') > -1; }) && sr) return 'CiteScore ' + sr.year + ' (Scopus API, percentile ' + sr.percentile + ')';
  return 'รายชื่อวารสารที่นำเข้า (เช่น SJR) — ดูปีของรายชื่อในหน้า แหล่งข้อมูล';
}

/** แปลงผลค้นของ MUGR → ฟิลด์ผลงานในคำขอ */
function scholarFields_(w) {
  return {
    title: clean_(w.title, 500), type: PUB_TO_WORK_TYPE_[w.type] || 'other', year: String(w.yearCE || ''), authors: clean_((w.authors || []).join(', '), 1000),
    venue: clean_(w.journal, 300), doi: normDoi_(w.doi), ref: clean_(w.pmid ? 'PMID ' + w.pmid : (w.sourceId || ''), 200),
    database: w.database || 'none', dbGroup: w.group || (DATABASES[w.database] || {}).group || 'none', quartile: w.quartile || '', quartileSource: quartileSource_(w),
    proof: w.proof || '', foundIn: (w.foundIn || []).join(','), links: JSON.stringify((w.links || []).slice(0, 10)),
    dbEvidence: clean_((w.evidence || []).join(' | '), 2000), checkedAt: nowIso_()
  };
}

function canCollectWorks_(req) {
  return editableSections_(req).indexOf('works') > -1 || actionsFor_(req).indexOf('verify') > -1;
}

/** ค้นทุกฐานสำหรับบุคคลในคำขอ — ผลถูกเก็บชั่วคราว แล้วให้ผู้ใช้เลือกเพิ่มเข้าคำขอ */
function scholarSearch_(p) {
  const req = loadRequestFor_(p.id);
  if (!canCollectWorks_(req)) throw new Error('ค้นเพื่อเพิ่มผลงานได้เฉพาะผู้ยื่นที่แก้ส่วนผลงานได้ หรือเจ้าหน้าที่ผู้ตรวจ');
  const snap = parseJson_(req.personSnap, {}) || {};
  const ids = parseJson_(req.authorIds, {}) || {};
  const q = {
    nameEn: clean_(p.nameEn !== undefined ? p.nameEn : snap.nameEn, 150), nameTh: clean_(p.nameTh !== undefined ? p.nameTh : snap.nameTh, 150),
    scopusId: clean_(p.scopusId !== undefined ? p.scopusId : ids.scopusId, 30).replace(/\D+/g, ''), orcid: clean_(p.orcid !== undefined ? p.orcid : ids.orcid, 60),
    affil: clean_(p.affil !== undefined ? p.affil : setting_('SCHOLAR_AFFIL'), 150),
    fromYear: Number(p.fromYear) || currentBE_() - 4, toYear: Number(p.toYear) || currentBE_()
  };
  if (q.fromYear > q.toYear) throw new Error('ปีเริ่มต้องไม่เกินปีสิ้นสุด');
  if (q.scopusId !== (ids.scopusId || '') || q.orcid !== (ids.orcid || '')) DB.update('Requests', req.id, { authorIds: JSON.stringify({ scopusId: q.scopusId, orcid: q.orcid }) });
  const r = searchAll_(q);
  const existing = DB.all('RequestWorks').filter(function (w) { return w.requestId === req.id && ACTIVE_WORK_(w); });
  const has = function (w) { return existing.some(function (x) { return (w.doi && normDoi_(x.doi) === normDoi_(w.doi)) || (!w.doi && normTitle_(x.title) === normTitle_(w.title)); }); };
  const token = Utilities.getUuid().replace(/-/g, '');
  cachePutBig_('sch_' + token, { requestId: req.id, userId: me_().id, works: r.works, query: q, at: nowIso_() });
  audit_('scholar.search', 'Requests', req.id, ['nameEn', 'nameTh', 'scopusId', 'orcid', 'years'], r.works.length + ' รายการ');
  return {
    token: token, query: q, status: r.status, candidates: r.candidates, journalIndex: r.journalIndex, searchedAt: nowIso_(),
    works: r.works.map(function (w, i) {
      return { i: i, title: w.title, journal: w.journal, yearCE: w.yearCE, doi: w.doi, authors: (w.authors || []).slice(0, 6), type: w.type, typeLabel: (PUB_TYPES[w.type] || {}).label,
        database: w.database, dbLabel: (DATABASES[w.database] || DATABASES.none).label, group: w.group, quartile: w.quartile, quartileSource: quartileSource_(w),
        proof: w.proof, links: w.links, foundIn: w.foundIn, origins: w.origins, evidence: w.evidence, confidence: w.confidence, added: has(w) };
    })
  };
}

function addScholarWorks_(p) {
  const req = loadRequestFor_(p.id);
  if (!canCollectWorks_(req)) throw new Error('เพิ่มผลงานไม่ได้ในสถานะนี้');
  const c = cacheGetBig_('sch_' + String(p.token || ''));
  if (!c || c.requestId !== req.id || c.userId !== me_().id) throw new Error('ผลการค้นหมดอายุแล้ว (เก็บไว้ 1 ชั่วโมง) — กรุณาค้นใหม่');
  const picked = [].concat(p.indexes || []).map(Number).filter(function (i, k, a) { return c.works[i] && a.indexOf(i) === k; });
  if (!picked.length) throw new Error('ยังไม่ได้เลือกผลงาน');
  const recs = picked.map(function (i) {
    const w = c.works[i];
    return Object.assign(scholarFields_(w), { requestId: req.id, origin: 'SCHOLAR', sourceWorkId: (w.origins || [w.origin]).join('+') + ':' + (w.sourceId || w.doi || ''), status: 'pending', addedBy: me_().id, addedRound: req.round });
  });
  DB.insertMany('RequestWorks', recs);
  const dups = detectDuplicates_(req.id);
  audit_('works.addScholar', 'Requests', req.id, ['works+' + recs.length], '');
  return { added: recs.length, suspectedDuplicates: dups };
}

/** ตรวจผลงานที่มี DOI กับฐานข้อมูล (Scopus/PubMed โดยตรง + รายชื่อวารสาร) แล้วบันทึกผลไว้กับผลงาน */
function checkWorkDb_(p) {
  const w = DB.get('RequestWorks', p.workId);
  if (!w) throw new Error('ไม่พบผลงาน');
  const req = loadRequestFor_(w.requestId);
  if (!canCollectWorks_(req)) throw new Error('ตรวจได้เฉพาะผู้ยื่นที่แก้ส่วนผลงานได้ หรือเจ้าหน้าที่ผู้ตรวจ');
  if (!w.doi && !w.title) throw new Error('ผลงานนี้ไม่มี DOI หรือชื่อเรื่อง');
  const r = analyzeDocument_({ doi: w.doi, title: w.doi ? '' : w.title });
  if (!r.found) {
    const patch = { database: 'none', dbGroup: 'none', quartile: '', quartileSource: '', proof: '', foundIn: '', links: '[]', dbEvidence: clean_(r.message, 500), checkedAt: nowIso_() };
    DB.update('RequestWorks', w.id, patch);
    return { found: false, message: r.message };
  }
  const f = scholarFields_(r.work);
  const patch = { database: f.database, dbGroup: f.dbGroup, quartile: f.quartile, quartileSource: f.quartileSource, proof: f.proof, foundIn: f.foundIn, links: f.links, dbEvidence: clean_('จับคู่ด้วย ' + r.matchedBy + ' | ' + f.dbEvidence, 2000), checkedAt: f.checkedAt };
  DB.update('RequestWorks', w.id, patch);
  audit_('works.checkDb', 'RequestWorks', w.id, ['database', 'quartile', 'proof'], '');
  return { found: true, database: f.database, quartile: f.quartile, proof: f.proof };
}

/* ---------------- ผู้ดูแล: API key และรายชื่อวารสาร ---------------- */

function scholarAdmin_() {
  requirePerm_('admin.data');
  const inCode = {}; Object.keys(API_KEYS_IN_CODE).forEach(function (k) { inCode[k] = !!String(API_KEYS_IN_CODE[k] || '').trim(); });
  return { keysInCode: inCode, keys: apiKeysStatus_(), lastTest: lastKeyTest_(), journals: journalIndexStats_(), databases: DATABASES, affil: setting_('SCHOLAR_AFFIL'), mailto: setting_('OPENALEX_MAILTO') };
}

/** นำเข้ารายชื่อวารสารจาก CSV (SJR ใช้ ; คั่น / TCI ใช้ ,) — หาคอลัมน์ ISSN ชื่อวารสาร และ Quartile อัตโนมัติ */
function importJournalCsv_(p) {
  requirePerm_('admin.data');
  const text = String(p.csv || '').replace(/^﻿/, '');
  if (!text.trim()) throw new Error('ไฟล์ว่างเปล่า');
  if (text.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15 MB');
  const first = text.split(/\r?\n/)[0];
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = parseCsv_(text, delim);
  const h = (rows[0] || []).map(function (x) { return String(x).trim().toLowerCase(); });
  const issnCols = h.map(function (x, i) { return /issn/.test(x) ? i : -1; }).filter(function (i) { return i > -1; });
  const titleCol = h.findIndex(function (x) { return /^title$|journal|ชื่อ|source title/.test(x); });
  const qCol = h.findIndex(function (x) { return /quartile/.test(x); });
  if (!issnCols.length) throw new Error('ไม่พบคอลัมน์ ISSN ในแถวแรกของไฟล์');
  const list = rows.slice(1).map(function (r) {
    const issns = [];
    issnCols.forEach(function (i) { String(r[i] || '').split(/[,;\s]+/).forEach(function (s) { if (normIssn_(s)) issns.push(s); }); });
    return { title: titleCol > -1 ? r[titleCol] : '', issns: issns, quartile: qCol > -1 ? r[qCol] : '' };
  }).filter(function (x) { return x.issns.length; });
  if (!list.length) throw new Error('ไม่พบ ISSN ที่ถูกต้องในไฟล์');
  const source = clean_(p.source, 60);
  if (!source) throw new Error('ระบุชื่อแหล่งและปีของรายชื่อ เช่น "SJR 2024" หรือ "TCI กลุ่ม 1 (ประกาศ 2568)"');
  return importJournalIndex_({ database: p.database, source: source, replace: true, rows: list });
}

/* ---------------- ค้นหาแบบง่าย: กรอกชื่อ + ช่วงปี ---------------- */

/** แปลข้อผิดพลาดการเรียกเว็บภายนอกให้ผู้ดูแลรู้ว่าต้องทำอะไร */
function explainFetchError_(m) {
  const s = String(m || '');
  if (/UrlFetchApp|external_request|permission|สิทธิ์ในการเรียก|Authorization is required/i.test(s)) {
    return 'สคริปต์ยังไม่ได้รับอนุญาตให้เชื่อมต่อบริการภายนอก — ผู้ดูแลต้องเปิด Apps Script → เลือกฟังก์ชัน testConnection → Run → อนุญาตสิทธิ์ แล้ว Deploy เวอร์ชันใหม่ (' + s.slice(0, 120) + ')';
  }
  if (/DNS|Address unavailable|timed out|Timeout/i.test(s)) return 'ติดต่อฐานข้อมูลไม่ได้ชั่วคราว ลองใหม่อีกครั้ง (' + s.slice(0, 120) + ')';
  if (/Bandwidth quota|Service invoked too many times/i.test(s)) return 'ใช้โควตาการเชื่อมต่อภายนอกของ Google ต่อวันหมดแล้ว — ลองใหม่พรุ่งนี้ (' + s.slice(0, 120) + ')';
  return s;
}

/** หาชื่อภาษาอังกฤษจากข้อมูลบุคคล (MUHR) เมื่อผู้ใช้กรอกแค่ชื่อไทย — ใช้เฉพาะเมื่อพบคนเดียว */
function englishNameFor_(nameTh) {
  try {
    const r = searchPersons_({ name: nameTh });
    const exact = r.results.filter(function (x) { return x.nameEn && x.matchBasis.indexOf('partial') === -1; });
    if (exact.length === 1) return { nameEn: exact[0].nameEn, note: 'ใช้ชื่ออังกฤษ "' + exact[0].nameEn + '" จากข้อมูลบุคคล ' + r.source.label + ' (' + (r.source.connected ? 'ระบบจริง' : r.source.mode === 'mock' ? 'ข้อมูลจำลอง' : 'ข้อมูลนำเข้า') + ')' };
    if (exact.length > 1) return { nameEn: '', note: 'พบชื่อนี้หลายคนในข้อมูลบุคคล — ใส่ชื่ออังกฤษหรือ Scopus ID เองเพื่อให้ค้นได้ตรงคน' };
  } catch (e) { /* แหล่งข้อมูลบุคคลไม่พร้อม — ค้นต่อด้วยชื่อไทย */ }
  return { nameEn: '', note: '' };
}

/**
 * หาชื่ออังกฤษ (และรหัสนักวิจัย OpenAlex) จากชื่อไทย โดยใช้ข้อมูลจริงใน OpenAlex — ไม่ใช่การแปลงอักษรเอง
 *  1) นักวิจัยที่มีชื่อไทยนี้เป็นชื่อสำรอง (display_name_alternatives)
 *  2) ผลงานที่ระบุชื่อผู้แต่งเป็นภาษาไทยตรงกับชื่อนี้ → โปรไฟล์ผู้แต่งของผลงานนั้น (มักเป็นชื่ออังกฤษ)
 * คืนรายชื่อผู้ที่เป็นไปได้ ให้ผู้ใช้เลือกถ้ามีมากกว่า 1 คน
 */
function englishFromOpenAlex_(nameTh, affil) {
  const key = String(nameTh || '').replace(/\s+/g, '');
  const byId = {};
  const add = function (id, name, inst, country, works, how) {
    id = shortId_(id);
    if (!id || !name || hasThai_(name)) return;
    const c = byId[id] || (byId[id] = { id: id, name: name, institution: inst || '', country: country || '', works: works || 0, hits: 0, how: how });
    c.hits++;
    if (!c.institution && inst) { c.institution = inst; c.country = country || ''; }
    if (works > c.works) c.works = works;
  };
  try {
    const a = httpJson_(OPENALEX + '/authors?search=' + encodeURIComponent(nameTh) + '&per_page=10&select=id,display_name,display_name_alternatives,works_count,last_known_institutions');
    ((a && a.results) || []).forEach(function (x) {
      const alts = [x.display_name].concat(x.display_name_alternatives || []).map(function (n) { return String(n).replace(/\s+/g, ''); });
      if (alts.indexOf(key) === -1) return;
      const inst = (x.last_known_institutions || [])[0] || {};
      add(x.id, hasThai_(x.display_name) ? (x.display_name_alternatives || []).filter(function (n) { return !hasThai_(n); })[0] : x.display_name, inst.display_name, inst.country_code, x.works_count, 'ชื่อสำรองของนักวิจัย');
    });
  } catch (e) { /* ค้นวิธีถัดไป */ }
  try {
    const w = httpJson_(OPENALEX + '/works?filter=raw_author_name.search:' + encodeURIComponent(nameTh) + '&per_page=50&select=id,authorships');
    ((w && w.results) || []).forEach(function (r) {
      (r.authorships || []).forEach(function (au) {
        if (String(au.raw_author_name || '').replace(/\s+/g, '').indexOf(key) === -1 || !au.author) return;
        const inst = (au.institutions || [])[0] || {};
        add(au.author.id, au.author.display_name, inst.display_name, inst.country_code, 0, 'ผู้แต่งในผลงานภาษาไทย');
      });
    });
  } catch (e) { /* ไม่มีข้อมูล */ }
  const af = String(affil || '').toLowerCase();
  const list = Object.keys(byId).map(function (k) { return byId[k]; });
  list.sort(function (x, y) {
    const sx = (af && x.institution.toLowerCase().indexOf(af) > -1 ? 4 : 0) + (x.country === 'TH' ? 2 : 0), sy = (af && y.institution.toLowerCase().indexOf(af) > -1 ? 4 : 0) + (y.country === 'TH' ? 2 : 0);
    return sy - sx || y.hits - x.hits || y.works - x.works;
  });
  return list.slice(0, 8);
}

function quickSearch_(p) {
  me_();
  const cache = CacheService.getScriptCache();
  const k = 'qs_' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(k) || 0) + 1;
  if (n > 30) throw new Error('มีการค้นพร้อมกันมากเกินไป กรุณารอ 1 นาทีแล้วลองใหม่');
  cache.put(k, String(n), 120);

  const name = clean_(p.name, 150);
  let nameTh = hasThai_(name) ? name : '', nameEn = hasThai_(name) ? '' : name;
  if (clean_(p.nameEn, 150)) nameEn = clean_(p.nameEn, 150);
  const q = {
    nameTh: nameTh, nameEn: nameEn, scopusId: clean_(p.scopusId, 30).replace(/\D+/g, ''), orcid: clean_(p.orcid, 60),
    affil: p.affil !== undefined ? clean_(p.affil, 150) : setting_('SCHOLAR_AFFIL'),
    fromYear: Number(p.fromYear) || currentBE_() - 4, toYear: Number(p.toYear) || currentBE_(), openalexId: clean_(p.openalexId, 30)
  };
  if (!q.nameTh && !q.nameEn && !q.scopusId && !q.orcid) throw new Error('กรอกชื่อ-นามสกุลที่ต้องการค้น');
  if (q.fromYear > q.toYear) throw new Error('ปีเริ่มต้องไม่เกินปีสิ้นสุด');
  if (q.toYear - q.fromYear > 30) throw new Error('ช่วงปีกว้างเกินไป (ไม่เกิน 30 ปี)');
  const notes = [];
  let enCandidates = [];
  if (q.nameTh && !q.nameEn && !q.scopusId && !q.orcid) {
    const en = englishNameFor_(q.nameTh);
    if (en.nameEn) q.nameEn = en.nameEn;
    if (en.note) notes.push(en.note);
    if (!q.nameEn) {
      enCandidates = englishFromOpenAlex_(q.nameTh, q.affil);
      const pick = q.openalexId ? enCandidates.filter(function (c) { return c.id === q.openalexId; })[0] : enCandidates[0];
      if (pick) {
        q.nameEn = pick.name; q.openalexId = pick.id;
        notes.push('ไม่ได้กรอกชื่ออังกฤษ — ระบบพบชื่อ "' + pick.name + '"' + (pick.institution ? ' (' + pick.institution + ')' : '') + ' จาก OpenAlex (' + pick.how + ') แล้วใช้ค้นฐานนานาชาติต่อ' +
          (enCandidates.length > 1 ? ' · พบ ' + enCandidates.length + ' คน ถ้าไม่ใช่คนนี้ให้เลือกคนที่ถูกต้องด้านล่าง' : ' · ตรวจว่าเป็นคนเดียวกัน'));
      } else notes.push('ไม่พบชื่ออังกฤษของ "' + q.nameTh + '" ใน OpenAlex — ค้นได้เฉพาะฐานไทย (TCI/ThaiJO) · ใส่ชื่ออังกฤษใน "ตัวเลือกเพิ่มเติม" เพื่อค้น Scopus/WoS/PubMed');
    }
  }
  const r = searchAll_(q);
  r.status.forEach(function (s) { if (s.mode === 'error') s.message = explainFetchError_(s.message); });
  const allDown = r.status.filter(function (s) { return s.mode === 'error'; }).length >= 3;
  if (allDown) notes.unshift('ค้นฐานข้อมูลภายนอกไม่ได้เกือบทั้งหมด — ' + r.status.filter(function (s) { return s.mode === 'error'; })[0].message);
  audit_('quickSearch', '', '', ['name', 'years'], r.works.length + ' รายการ');
  const g = { intl: 0, tci1: 0, tci2: 0, other: 0 };
  const works = r.works.map(function (w) {
    const grp = w.type !== 'journal' ? 'other' : w.group === 'kpa_intl' ? 'intl' : w.group === 'tci1' ? 'tci1' : w.group === 'tci2' ? 'tci2' : 'other';
    g[grp]++;
    return { title: w.title, journal: w.journal, yearCE: w.yearCE, doi: w.doi, authors: (w.authors || []).slice(0, 8), typeLabel: (PUB_TYPES[w.type] || {}).label,
      group: grp, database: w.database, dbLabel: (DATABASES[w.database] || DATABASES.none).label, quartile: w.quartile, quartileSource: quartileSource_(w),
      proof: w.proof, links: w.links, foundIn: w.foundIn, origins: w.origins };
  });
  const ji = journalIndexStats_();
  if (!apiKey_('SCOPUS_API_KEY') && !(ji.byDatabase.scopus > 0)) notes.push('ยังไม่มี Scopus API key และยังไม่มีรายชื่อวารสาร Scopus (SJR) — ผลงานจะยังระบุไม่ได้ว่าอยู่ใน Scopus หรือไม่ (ผู้ดูแลรันฟังก์ชัน importSjr ครั้งเดียว)');
  return { query: q, notes: notes, works: works, counts: g, status: r.status, enCandidates: enCandidates, journalIndex: ji, candidates: r.candidates, openalexId: r.openalexId, searchedAt: nowIso_(), scopusKey: !!apiKey_('SCOPUS_API_KEY') };
}
