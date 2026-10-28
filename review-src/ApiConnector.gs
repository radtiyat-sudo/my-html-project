/**
 * ApiConnector.gs — เชื่อมต่อ MUHR / MUREX ผ่าน API จริง (โหมด api)
 *
 * - MUREX ของมหาวิทยาลัยมหิดลทำงานบน Elsevier Pure → มีชุดตั้งค่าสำเร็จรูป "pure" (Pure API, ส่ง key ทาง header api-key)
 *   คีย์ต้องขอจากผู้ดูแลระบบ Pure/MUREX (สร้างในแท็บ Administrator ของ Pure พร้อมกำหนดสิทธิ์การเห็นข้อมูล)
 * - MUHR ยังไม่มีเอกสาร API สาธารณะ → ใช้ชุดตั้งค่า "custom": กำหนด URL, header, รูปแบบคำขอ และการจับคู่ฟิลด์เอง
 * - กุญแจเก็บใน Script Properties (MUHR_API_TOKEN / MUREX_API_TOKEN) ไม่อยู่ในโค้ดหรือชีต และไม่ส่งกลับหน้าเว็บ
 * - สถานะ "เชื่อมต่อแล้ว" แสดงเฉพาะเมื่อทดสอบผ่านด้วยค่าตั้งค่าปัจจุบันเท่านั้น
 * - ข้อมูลที่ดึงมาถูกเก็บในชีต Persons / SourceWorks (origin = api) พร้อมวันที่ดึง เพื่อให้คำขอย้อนดูได้ว่าใช้ข้อมูลอะไร
 */

const API_PRESETS = {
  pure: {
    label: 'Elsevier Pure (MUREX)', base: 'https://murex.mahidol.ac.th/ws/api', authHeader: 'api-key', authPrefix: '',
    searchReq: 'POST /persons/search {"searchString":"{q}","size":20}',
    byCodeReq: '',
    worksReq: 'GET /persons/{pid}/research-outputs?size=100',
    listPath: 'items'
  },
  custom: {
    label: 'กำหนดเอง (REST/JSON)', base: '', authHeader: 'Authorization', authPrefix: 'Bearer ',
    searchReq: 'GET /persons?name={q}', byCodeReq: 'GET /persons/{code}', worksReq: 'GET /persons/{code}/works', listPath: 'items',
    personMap: { staffCode: 'staffCode', titleTh: 'titleTh', firstNameTh: 'firstNameTh', lastNameTh: 'lastNameTh', firstNameEn: 'firstNameEn', lastNameEn: 'lastNameEn', formerNames: 'formerNames', unit: 'unit', position: 'position', academicRank: 'academicRank', highestDegree: 'highestDegree', employmentStatus: 'employmentStatus', sourceUpdatedAt: 'updatedAt' },
    workMap: { workRef: 'id', title: 'title', type: 'type', year: 'year', pubDate: 'pubDate', authors: 'authors', venue: 'venue', doi: 'doi', ref: 'ref', sourceUpdatedAt: 'updatedAt' }
  }
};

function apiConf_(src) {
  const raw = parseJson_(setting_(src + '_API'), {}) || {};
  const preset = API_PRESETS[raw.preset] ? raw.preset : (src === 'MUREX' ? 'pure' : 'custom');
  const conf = Object.assign({}, API_PRESETS[preset], raw, { preset: preset });
  conf.token = PropertiesService.getScriptProperties().getProperty(src + '_API_TOKEN') || '';
  conf.configured = !!(conf.base && conf.token && (conf.searchReq || conf.byCodeReq));
  return conf;
}

function apiConfHash_(src) {
  const c = apiConf_(src);
  return hashOf_([c.preset, c.base, c.authHeader, c.authPrefix, c.searchReq, c.byCodeReq, c.worksReq, c.listPath, c.personMap, c.workMap, c.token.length]);
}

function apiLastTest_(src) { return parseJson_(PropertiesService.getScriptProperties().getProperty('SRC_TEST_' + src), null); }

/** เชื่อมต่อแล้ว = โหมด api + ทดสอบผ่าน + ค่าตั้งค่ายังเหมือนตอนทดสอบ */
function apiConnected_(src) {
  const t = apiLastTest_(src);
  return !!(t && t.ok && t.confHash === apiConfHash_(src));
}

/** "METHOD /path {body}" → เรียก API จริง */
function apiCall_(src, tmpl, vars) {
  const c = apiConf_(src);
  if (!c.configured) throw sourceError_(src, 'not_connected', 'ยังไม่ได้ตั้งค่า API ของ ' + src + ' (URL / กุญแจ / รูปแบบคำขอ)');
  const m = String(tmpl || '').trim().match(/^(GET|POST)\s+(\S+)\s*([\s\S]*)$/i);
  if (!m) throw sourceError_(src, 'not_connected', 'รูปแบบคำขอ API ไม่ถูกต้อง: ' + tmpl);
  const sub = function (s, enc) { return s.replace(/\{(\w+)\}/g, function (x, k) { const v = String(vars[k] === undefined ? '' : vars[k]); return enc ? enc(v) : v; }); };
  const url = c.base.replace(/\/+$/, '') + sub(m[2], encodeURIComponent);
  const body = m[3] ? sub(m[3], function (v) { return JSON.stringify(v).slice(1, -1); }) : '';
  const headers = { Accept: 'application/json' };
  headers[c.authHeader || 'Authorization'] = (c.authPrefix || '') + c.token;
  const opt = { method: m[1].toLowerCase(), muteHttpExceptions: true, headers: headers };
  if (body) { opt.payload = body; opt.contentType = 'application/json'; }
  let res;
  try { res = UrlFetchApp.fetch(url, opt); }
  catch (e) { throw sourceError_(src, 'outage', 'ติดต่อ ' + src + ' ไม่ได้: ' + e.message); }
  const code = res.getResponseCode();
  if (code === 404) return null;
  if (code === 401 || code === 403) throw sourceError_(src, 'auth', src + ' ปฏิเสธการเข้าถึง (' + code + ') — ตรวจกุญแจ API และสิทธิ์การเห็นข้อมูลของกุญแจ');
  if (code >= 500 || code === 429) throw sourceError_(src, 'outage', src + ' ขัดข้องหรือใช้งานเกินโควตา (' + code + ')');
  if (code >= 400) throw sourceError_(src, 'outage', src + ' ตอบกลับผิดพลาด (' + code + ') — ตรวจรูปแบบคำขอในหน้าตั้งค่า');
  try { return JSON.parse(res.getContentText()); }
  catch (e) { throw sourceError_(src, 'outage', src + ' ไม่ได้ส่งข้อมูล JSON กลับมา'); }
}

/* ---------------- อ่านค่าจาก JSON ---------------- */

/** "a.b.0.c|x.y" → ค่าแรกที่พบ */
function getPath_(o, path) {
  const alts = String(path || '').split('|');
  for (let i = 0; i < alts.length; i++) {
    let v = o;
    alts[i].split('.').filter(String).forEach(function (k) { v = v === undefined || v === null ? undefined : v[k]; });
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

/** ข้อความหลายภาษาของ Pure: "x" | {value} | {text:[{value}]} | {en_GB:"x", th_TH:"y"} */
function locText_(x, preferTh) {
  if (x === undefined || x === null) return '';
  if (typeof x !== 'object') return String(x);
  if (Array.isArray(x)) return locText_(x[0], preferTh);
  if (x.value !== undefined) return locText_(x.value, preferTh);
  if (x.text) return locText_(x.text, preferTh);
  if (x.term) return locText_(x.term, preferTh);
  const keys = Object.keys(x);
  const th = keys.filter(function (k) { return /^th/i.test(k); })[0], en = keys.filter(function (k) { return /^en/i.test(k); })[0];
  return String(x[preferTh && th ? th : en || th || keys[0]] || '');
}

function listOf_(json, listPath) {
  if (Array.isArray(json)) return json;
  const v = getPath_(json || {}, listPath || 'items');
  return Array.isArray(v) ? v : [];
}

/* ---------------- Pure ---------------- */

function purePersonCode_(it) {
  const ids = [].concat(it.ids || [], it.identifiers || [], it.personIds || []);
  const emp = ids.filter(function (x) { return /employee|staff|personnel|บุคลากร/i.test(locText_(x.type || x.idSource || x.typeDiscriminator)); })[0];
  return String((emp && (emp.id || emp.value)) || it.employeeId || it.externalId || '').trim();
}

function purePerson_(it) {
  const name = it.name || {};
  const org = (it.staffOrganizationAssociations || it.staffOrganisationAssociations || [])[0] || {};
  const orgName = locText_((org.organization || org.organisationalUnit || org.organisationalUnits || {}).name);
  return {
    staffCode: purePersonCode_(it), pureId: it.uuid || it.pureId || '',
    firstNameEn: name.firstName || '', lastNameEn: name.lastName || '',
    firstNameTh: '', lastNameTh: '', formerNames: (it.names || []).map(function (n) { return [n.firstName || (n.name || {}).firstName, n.lastName || (n.name || {}).lastName].filter(String).join(' '); }).filter(String).join('|'),
    unit: orgName, position: locText_(org.jobDescription || org.jobTitle || ''), academicRank: '', highestDegree: '', employmentStatus: '',
    sourceUpdatedAt: String(getPath_(it, 'info.modifiedDate|modifiedDate') || '').slice(0, 10)
  };
}

function pureWorkType_(t) {
  const s = String(t || '').toLowerCase();
  if (/journal|article|review|letter|editorial/.test(s)) return 'journal';
  if (/conference|proceeding|paper/.test(s)) return 'proceeding';
  if (/chapter/.test(s)) return 'chapter';
  if (/book|anthology|monograph/.test(s)) return 'book';
  if (/patent/.test(s)) return 'patent';
  if (/report/.test(s)) return 'report';
  return 'other';
}

function pureWork_(it) {
  const st = [].concat(it.publicationStatuses || []);
  const cur = st.filter(function (x) { return x.current; })[0] || st[0] || {};
  const pd = cur.publicationDate || {};
  const ev = [].concat(it.electronicVersions || []);
  const doiV = ev.filter(function (e) { return e.doi; })[0];
  const ja = it.journalAssociation || {};
  return {
    workRef: it.uuid || it.pureId || '', title: locText_(it.title), type: pureWorkType_(locText_(it.type)),
    year: String(pd.year || ''), pubDate: pd.year && pd.month ? pd.year + '-' + ('0' + pd.month).slice(-2) + '-' + ('0' + (pd.day || 1)).slice(-2) : '',
    authors: [].concat(it.contributors || it.personAssociations || []).map(function (c) { const n = c.name || {}; return [n.firstName, n.lastName].filter(String).join(' '); }).filter(String).slice(0, 15).join(', '),
    venue: locText_(ja.title) || locText_(it.hostPublicationTitle) || locText_((it.event || {}).name), doi: normDoi_(doiV ? doiV.doi : it.doi),
    ref: locText_(ja.issn) ? 'ISSN ' + locText_(ja.issn) : (it.isbns ? 'ISBN ' + [].concat(it.isbns)[0] : ''),
    sourceUpdatedAt: String(getPath_(it, 'info.modifiedDate|modifiedDate') || '').slice(0, 10)
  };
}

/* ---------------- custom ---------------- */

function mapFields_(it, map) {
  const o = {};
  Object.keys(map || {}).forEach(function (k) { const v = getPath_(it, map[k]); o[k] = Array.isArray(v) ? v.map(function (x) { return locText_(x); }).join(', ') : locText_(v); });
  return o;
}

function normPersonCodes_(o) {
  [['academicRank', RANKS], ['highestDegree', DEGREES], ['employmentStatus', EMP_STATUS]].forEach(function (x) {
    const c = LABEL_TO_CODE_(x[1], o[x[0]]);
    o[x[0]] = c || '';
  });
  return o;
}

/* ---------------- เก็บผลลงชีต (origin = api) ---------------- */

function upsertApiRows_(table, recs, keyFn) {
  if (!recs.length) return [];
  const now = nowIso_();
  const existing = {};
  DB.all(table).filter(function (r) { return r.origin === 'api'; }).forEach(function (r) { existing[keyFn(r)] = r; });
  const replace = {};
  const out = recs.map(function (o) {
    const old = existing[keyFn(o)];
    if (old) replace[old.id] = true;
    return Object.assign({}, o, { id: old ? old.id : undefined, origin: 'api', fetchedAt: now, createdAt: old ? old.createdAt : now });
  });
  DB.removeWhere(table, function (r) { return replace[r.id]; });
  return DB.insertMany(table, out);
}

const PERSON_KEY_ = function (r) { return String(r.staffCode || '').toUpperCase(); };
const WORK_KEY_ = function (r) { return String(r.staffCode || '').toUpperCase() + '|' + (r.workRef || r.doi || normTitle_(r.title)); };

/** ค้นบุคคลผ่าน API → บันทึก → คืนระเบียน Persons (origin api) */
function apiSearchPersons_(src, q) {
  const c = apiConf_(src);
  const json = apiCall_(src, c.searchReq || c.byCodeReq, { q: q, code: q });
  const items = json && !Array.isArray(json) && !getPath_(json, c.listPath) && (json.uuid || json.staffCode) ? [json] : listOf_(json, c.listPath);
  const recs = items.slice(0, 50).map(function (it) { return c.preset === 'pure' ? purePerson_(it) : normPersonCodes_(mapFields_(it, c.personMap)); })
    .filter(function (r) { return r.staffCode; });
  return upsertApiRows_('Persons', recs.map(function (r) { const o = Object.assign({}, r); delete o.pureId; return o; }), PERSON_KEY_);
}

function apiPersonByCode_(src, code) {
  const c = apiConf_(src);
  const rows = c.byCodeReq && c.preset !== 'pure' ? (function () {
    const json = apiCall_(src, c.byCodeReq, { code: code, q: code });
    if (!json) return [];
    const it = Array.isArray(json) ? json[0] : (getPath_(json, c.listPath) ? listOf_(json, c.listPath)[0] : json);
    return it ? upsertApiRows_('Persons', [normPersonCodes_(mapFields_(it, c.personMap))].filter(function (r) { return r.staffCode; }), PERSON_KEY_) : [];
  })() : apiSearchPersons_(src, code);
  return rows.filter(function (r) { return PERSON_KEY_(r) === String(code).toUpperCase(); })[0] || null;
}

/** ผลงานของบุคคลจาก MUREX — Pure: หา uuid ของบุคคลจากรหัสบุคลากรก่อน */
function apiWorksFor_(code) {
  const c = apiConf_('MUREX');
  let pid = code;
  if (c.preset === 'pure') {
    const json = apiCall_('MUREX', c.searchReq, { q: code });
    const hit = listOf_(json, c.listPath).filter(function (it) { return purePersonCode_(it).toUpperCase() === String(code).toUpperCase(); })[0];
    if (!hit) return { works: [], note: 'ไม่พบบุคคลรหัส ' + code + ' ใน MUREX (Pure ต้องมีรหัสบุคลากรใน ids ของบุคคล) — เพิ่มผลงานจากฐานวิชาการหรือกรอกเองได้' };
    pid = hit.uuid || hit.pureId;
  }
  const json = apiCall_('MUREX', c.worksReq, { pid: pid, code: code });
  const recs = listOf_(json, c.listPath).slice(0, 300).map(function (it) {
    const w = c.preset === 'pure' ? pureWork_(it) : mapFields_(it, c.workMap);
    w.type = WORK_TYPES[w.type] ? w.type : pureWorkType_(w.type);
    w.year = String(normYear_(w.year) || '');
    w.doi = normDoi_(w.doi);
    return Object.assign(w, { staffCode: code });
  }).filter(function (w) { return w.title; });
  return { works: upsertApiRows_('SourceWorks', recs, WORK_KEY_), note: '' };
}

/* ---------------- ผู้ดูแล: ตั้งค่าและทดสอบ ---------------- */

function apiAdminView_(src) {
  const c = apiConf_(src);
  return {
    source: src, preset: c.preset, presets: Object.keys(API_PRESETS).map(function (k) { return { key: k, label: API_PRESETS[k].label }; }),
    base: c.base, authHeader: c.authHeader, authPrefix: c.authPrefix, searchReq: c.searchReq, byCodeReq: c.byCodeReq, worksReq: c.worksReq, listPath: c.listPath,
    personMap: JSON.stringify(c.personMap || {}, null, 1), workMap: JSON.stringify(c.workMap || {}, null, 1),
    hasToken: !!c.token, configured: c.configured, connected: apiConnected_(src), lastTest: apiLastTest_(src)
  };
}

function saveSourceApi_(p) {
  requirePerm_('admin.data');
  const src = String(p.source || '');
  if (!SOURCES[src]) throw new Error('ไม่รู้จักแหล่งข้อมูล');
  const preset = API_PRESETS[p.preset] ? p.preset : 'custom';
  const base = clean_(p.base, 300);
  if (base && !/^https:\/\/[^\s/]+/i.test(base)) throw new Error('URL ต้องขึ้นต้นด้วย https://');
  const conf = { preset: preset, base: base, authHeader: clean_(p.authHeader, 60) || 'Authorization', authPrefix: String(p.authPrefix || '').slice(0, 30),
    searchReq: clean_(p.searchReq, 500), byCodeReq: clean_(p.byCodeReq, 500), worksReq: clean_(p.worksReq, 500), listPath: clean_(p.listPath, 100) };
  ['searchReq', 'byCodeReq', 'worksReq'].forEach(function (k) { if (conf[k] && !/^(GET|POST)\s+\/\S*/i.test(conf[k])) throw new Error(k + ' ต้องอยู่ในรูป "GET /path" หรือ "POST /path {json}"'); });
  if (preset === 'custom') {
    conf.personMap = parseJson_(p.personMap, null); conf.workMap = parseJson_(p.workMap, null);
    if (!conf.personMap || !conf.personMap.staffCode) throw new Error('การจับคู่ฟิลด์บุคคล (JSON) ต้องมี staffCode');
    if (src === 'MUREX' && (!conf.workMap || !conf.workMap.title)) throw new Error('การจับคู่ฟิลด์ผลงาน (JSON) ต้องมี title');
  }
  setSettings_({ [src + '_API']: JSON.stringify(conf) });
  const props = PropertiesService.getScriptProperties();
  if (p.clearToken) props.deleteProperty(src + '_API_TOKEN');
  else if (String(p.token || '').trim()) props.setProperty(src + '_API_TOKEN', String(p.token).trim());
  audit_('source.apiConfig', 'Settings', src, ['base', 'requests', p.token ? 'token' : '', p.clearToken ? 'token-cleared' : ''].filter(String), '');
  return apiAdminView_(src);
}

/** ทดสอบเรียก API จริงด้วยรหัสหรือชื่อตัวอย่าง — ผลการทดสอบเป็นตัวกำหนดสถานะ "เชื่อมต่อแล้ว" */
function testSourceApi_(p) {
  requirePerm_('admin.data');
  const src = String(p.source || '');
  if (!SOURCES[src]) throw new Error('ไม่รู้จักแหล่งข้อมูล');
  const q = clean_(p.q, 100);
  if (!q) throw new Error('ระบุรหัสบุคลากรหรือชื่อที่ใช้ทดสอบ');
  const out = { ok: false, at: nowIso_(), message: '', sample: null };
  try {
    if (src === 'MUHR') {
      const rows = /\d/.test(q) ? [apiPersonByCode_('MUHR', q)].filter(Boolean) : apiSearchPersons_('MUHR', q);
      out.ok = true;
      out.message = 'เรียก API สำเร็จ — พบ ' + rows.length + ' รายการ' + (rows.length ? '' : ' (ตรวจรหัส/ชื่อทดสอบ หรือการจับคู่ฟิลด์ staffCode)');
      if (rows[0]) out.sample = { staffCode: rows[0].staffCode, unit: rows[0].unit, fields: Object.keys(rows[0]).filter(function (k) { return rows[0][k]; }) };
    } else {
      const persons = apiSearchPersons_('MUREX', q);
      out.ok = true;
      out.message = 'เรียก API สำเร็จ — พบบุคคล ' + persons.length + ' รายการที่มีรหัสบุคลากร';
      if (persons[0]) {
        const w = apiWorksFor_(persons[0].staffCode);
        out.message += ' · ดึงผลงานของรหัส ' + persons[0].staffCode + ' ได้ ' + w.works.length + ' รายการ' + (w.note ? ' (' + w.note + ')' : '');
        out.sample = { staffCode: persons[0].staffCode, works: w.works.length };
      } else out.message += ' — ถ้าพบ 0 แต่มีบุคคลจริง แสดงว่า Pure ไม่ได้ส่งรหัสบุคลากรมาใน ids หรือกุญแจไม่มีสิทธิ์เห็นข้อมูลนี้';
    }
  } catch (e) {
    out.ok = false; out.message = e.message;
  }
  out.confHash = apiConfHash_(src);
  PropertiesService.getScriptProperties().setProperty('SRC_TEST_' + src, JSON.stringify(out));
  audit_('source.apiTest', 'Settings', src, { result: out.ok ? 'pass' : 'fail' }, '');
  return apiAdminView_(src);
}
