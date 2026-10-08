/**
 * CheckerMain.gs — เว็บแอป "ตรวจผลงานอัตโนมัติ" แบบสาธารณะ (ส่งลิงก์ให้ใครก็ใช้ได้)
 *
 * - ทำงานในนามผู้ Deploy เสมอ (ใช้ API key และรายชื่อวารสารของผู้ Deploy)
 * - ทุกการค้นถูกบันทึกในชีต CheckLog และผลที่ผู้ใช้กด "ส่งผลให้ผู้รวบรวม" ถูกเก็บในชีต CheckResults
 * - ส่วนผู้ดูแล (API key, รายชื่อวารสาร) ป้องกันด้วยรหัสผู้ดูแล — ดูรหัสได้จากการรัน setup()
 *
 * ใช้ส่วนค้นหา/จัดกลุ่มชุดเดียวกับระบบหลัก (Config, Database, Logic, Discovery, Sources)
 */

/* ---- ปรับโครงสร้างตารางสำหรับเว็บแอปนี้ (ไม่ใช้ตารางของระบบหลัก) ---- */
['Users', 'Curricula', 'Faculty', 'Experts', 'Publications', 'Assessments'].forEach(function (t) { delete TABLES[t]; });
TABLES.CheckLog = ['ts', 'requester', 'email', 'org', 'nameTh', 'nameEn', 'scopusId', 'orcid', 'fromYear', 'total', 'intl', 'nat', 'other', 'unknown', 'sources'];
TABLES.CheckResults = ['ts', 'batch', 'requester', 'email', 'org', 'personTh', 'personEn', 'title', 'journal', 'year', 'type', 'database', 'quartile', 'groupLabel', 'weight', 'foundIn', 'origins', 'doi', 'url', 'evidence'];
APP.schemaVersion = 101;
APP.checkerName = 'ระบบตรวจผลงานวิชาการอัตโนมัติ';

let CHECKER_ADMIN_ = false;

/* ---- แทนที่ฟังก์ชันสิทธิ์ของระบบหลัก ---- */
function requireRole_() { if (!CHECKER_ADMIN_) throw new Error('ส่วนนี้สำหรับผู้ดูแลเท่านั้น — กรุณาเข้าสู่ระบบผู้ดูแลก่อน'); }
function currentUser_() { return { email: '', name: 'ผู้ใช้ทั่วไป', role: CHECKER_ADMIN_ ? 'admin' : 'public', realRole: CHECKER_ADMIN_ ? 'admin' : 'public', permissions: [] }; }
function canEditPerson_() { return false; }

/* ---- Web app ---- */
function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP.checkerName;
  return t.evaluate()
    .setTitle(APP.checkerName + ' — ก.พ.อ. 2562')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** รันครั้งแรกจากตัวแก้ไขสคริปต์: สร้างชีต และสร้างรหัสผู้ดูแล (ดูได้ใน "บันทึกการดำเนินการ") */
function setup() {
  ensureSchema_(true);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSCODE')) props.setProperty('ADMIN_PASSCODE', randomCode_());
  const msg = 'ฐานข้อมูล: ' + getDb_().getUrl() + '\nรหัสผู้ดูแล (ใช้ในแท็บ "ผู้ดูแล" ของหน้าเว็บ): ' + props.getProperty('ADMIN_PASSCODE');
  Logger.log(msg);
  return msg;
}

/** เปลี่ยนรหัสผู้ดูแลใหม่ (รันจากตัวแก้ไขสคริปต์) */
function resetAdminPasscode() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSCODE', randomCode_());
  return setup();
}

function randomCode_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }

/* ---- จุดเรียกจากหน้าเว็บ ---- */
function checkerApi(action, payload) {
  const p = payload || {};
  try {
    ensureSchema_();
    CHECKER_ADMIN_ = false;
    if (p.token) {
      const ok = CacheService.getScriptCache().get('adm_' + p.token);
      if (ok) CHECKER_ADMIN_ = true;
    }
    const fn = CHECKER_ACTIONS_[action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + action);
    return JSON.parse(JSON.stringify({ ok: true, data: fn(p) }));
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function throttle_() {
  const cache = CacheService.getScriptCache();
  const k = 'rl_' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(k) || 0) + 1;
  const max = Number(getSettings_().CHECKER_PER_MINUTE || 20);
  if (n > max) throw new Error('มีผู้ใช้ค้นพร้อมกันมากเกินไป กรุณารอ 1 นาทีแล้วลองใหม่');
  cache.put(k, String(n), 120);
}

const GROUP_LABEL_ = { kpa_intl: 'นานาชาติ (ก.พ.อ.)', tci1: 'ระดับชาติ TCI 1', tci2: 'ระดับชาติ TCI 2' };

const CHECKER_ACTIONS_ = {
  meta: function () {
    const keys = {};
    ['SCOPUS_API_KEY', 'WOS_API_KEY'].forEach(function (k) { keys[k] = !!apiKey_(k); });
    return {
      databases: DATABASES, pubTypes: PUB_TYPES, window: evalWindow_(getSettings_()), keys: keys,
      journalIndex: journalIndexStats_(), org: getSettings_().ORG_NAME || APP.org, admin: CHECKER_ADMIN_
    };
  },

  search: function (p) {
    throttle_();
    const r = searchAll_({ nameTh: p.nameTh, nameEn: p.nameEn, scopusId: p.scopusId, orcid: p.orcid, affil: p.affil, openalexId: p.openalexId, fromYear: p.fromYear });
    const s = r.summary;
    try {
      DB.insert('CheckLog', { ts: nowIso_(), requester: String(p.requester || '').slice(0, 120), email: String(p.email || '').slice(0, 120), org: String(p.org || '').slice(0, 120),
        nameTh: p.nameTh || '', nameEn: p.nameEn || '', scopusId: p.scopusId || '', orcid: p.orcid || '', fromYear: p.fromYear || '',
        total: r.works.length, intl: s.intl, nat: s.nat, other: s.other, unknown: s.unknown,
        sources: r.status.map(function (x) { return x.label + ':' + x.mode + ':' + x.count; }).join(' | ') });
    } catch (e) { /* การบันทึก log ไม่ควรทำให้การค้นล้ม */ }
    return r;
  },

  analyze: function (p) {
    throttle_();
    const r = analyzeDocument_({ text: p.text, title: p.title, doi: p.doi });
    delete r.owners;
    return r;
  },

  /** ผู้ใช้ส่งผลที่เลือกให้ผู้รวบรวม (บันทึกลงชีต CheckResults ของผู้ Deploy) */
  submit: function (p) {
    if (!String(p.requester || '').trim()) throw new Error('กรุณากรอกชื่อผู้ส่ง');
    const works = [].concat(p.works || []).slice(0, 300);
    if (!works.length) throw new Error('ยังไม่ได้เลือกผลงาน');
    const batch = 'B' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
    const ts = nowIso_();
    DB.insertMany('CheckResults', works.map(function (w) {
      return { ts: ts, batch: batch, requester: String(p.requester).slice(0, 120), email: String(p.email || '').slice(0, 120), org: String(p.org || '').slice(0, 120),
        personTh: p.nameTh || '', personEn: p.nameEn || '', title: String(w.title || '').slice(0, 500), journal: String(w.journal || '').slice(0, 300),
        year: w.year || '', type: (PUB_TYPES[w.type] || {}).label || w.type, database: (DATABASES[w.database] || {}).label || w.database,
        quartile: w.quartile || '', groupLabel: w.type !== 'journal' ? 'ผลงานประเภทอื่น' : (GROUP_LABEL_[w.group] || 'ไม่อยู่ในฐานตามประกาศ/ยังระบุไม่ได้'),
        weight: w.weight, foundIn: [].concat(w.foundIn || []).join(', '), origins: [].concat(w.origins || []).join(', '),
        doi: w.doi || '', url: w.url || '', evidence: [].concat(w.evidence || []).join(' / ').slice(0, 1500) };
    }));
    return { batch: batch, count: works.length };
  },

  /* ---- ผู้ดูแล ---- */
  adminLogin: function (p) {
    const code = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSCODE');
    if (!code) throw new Error('ยังไม่ได้รัน setup() ในตัวแก้ไข Apps Script');
    if (String(p.passcode || '').trim().toUpperCase() !== code) { Utilities.sleep(800); throw new Error('รหัสผู้ดูแลไม่ถูกต้อง'); }
    const token = Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('adm_' + token, '1', 7200);
    return { token: token };
  },
  keysStatus: function () { return apiKeysStatus_(); },
  saveKeys: function (p) { return saveApiKeys_(p); },
  testKeys: function () { return testApiKeys_(); },
  journalStats: function () { return journalIndexStats_(); },
  importJournals: function (p) { return importJournalIndex_(p); },
  clearJournals: function (p) { return clearJournalIndex_(p); },
  adminSummary: function () {
    requireRole_();
    const logs = DB.all('CheckLog');
    const results = DB.all('CheckResults');
    return { searches: logs.length, submitted: results.length, recent: logs.slice(-15).reverse(), sheetUrl: getDb_().getUrl() };
  }
};
