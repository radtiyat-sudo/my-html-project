/**
 * Sources.gs — ค้นผลงานจากฐานข้อมูลตามประกาศ ก.พ.อ. โดยตรง เรียงตามลำดับความสำคัญ
 *
 *   1. Scopus          (Elsevier Scopus Search API — ต้องมี API key ของสถาบัน)
 *   2. Web of Science  (Clarivate WoS Starter API — ต้องมี API key)
 *   3. PubMed          (NCBI E-utilities — ฟรี)
 *   4. ERIC            (ERIC API — ฟรี)
 *   5. TCI / ThaiJO    (Crossref + OpenAlex ด้วยชื่อไทย แล้วจับคู่ ISSN กับรายชื่อ TCI กลุ่ม 1/2)
 *   6. OpenAlex        (ฐานรวมขนาดใหญ่ — เก็บผลงานที่เหลือ เช่น JSTOR, MathSciNet, Project Muse ผ่านรายชื่อ ISSN)
 *
 * ผลงานจากทุกฐานถูกรวมและตัดรายการซ้ำด้วย DOI / ชื่อบทความ แต่ละชิ้นบอกว่า "พบในฐานใดบ้าง"
 * API key เก็บใน Script Properties (ไม่อยู่ในชีต และไม่ถูกส่งไปหน้าเว็บ)
 */

const SCOPUS_API = 'https://api.elsevier.com/content/search/scopus';
const WOS_API = 'https://api.clarivate.com/apis/wos-starter/v1/documents';
const PUBMED_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const ERIC_API = 'https://api.ies.ed.gov/eric/';

const SOURCE_ORDER = [
  { key: 'scopus', label: 'Scopus', step: 1 },
  { key: 'wos', label: 'Web of Science', step: 2 },
  { key: 'pubmed', label: 'PubMed', step: 3 },
  { key: 'eric', label: 'ERIC', step: 4 },
  { key: 'tci', label: 'TCI / ThaiJO (ชื่อไทย)', step: 5 },
  { key: 'openalex', label: 'OpenAlex (ฐานรวม)', step: 6 }
];

const API_KEY_NAMES = ['SCOPUS_API_KEY', 'SCOPUS_INSTTOKEN', 'WOS_API_KEY', 'NCBI_API_KEY'];

function apiKey_(name) { return PropertiesService.getScriptProperties().getProperty(name) || ''; }

function apiKeysStatus_() {
  requireRole_(['admin']);
  const o = {};
  API_KEY_NAMES.forEach(function (k) { o[k] = !!apiKey_(k); });
  return o;
}

function saveApiKeys_(p) {
  requireRole_(['admin']);
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('LAST_KEY_TEST');
  API_KEY_NAMES.forEach(function (k) {
    if (p['clear_' + k]) props.deleteProperty(k);
    else if (String(p[k] || '').trim()) props.setProperty(k, String(p[k]).trim());
  });
  audit_('api_keys', API_KEY_NAMES.filter(function (k) { return p[k] || p['clear_' + k]; }).join(','));
  return apiKeysStatus_();
}

/** ผลการทดสอบการเชื่อมต่อครั้งล่าสุด (แสดงในหน้าเว็บ) */
function lastKeyTest_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('LAST_KEY_TEST') || 'null'); } catch (e) { return null; } }

/** ทดสอบการเชื่อมต่อ Scopus / WoS ด้วย key ที่บันทึกไว้ */
function testApiKeys_() {
  requireRole_(['admin']);
  const out = {};
  const sk = apiKey_('SCOPUS_API_KEY');
  if (!sk) out.scopus = { ok: false, message: 'ยังไม่ได้ใส่ Scopus API key' };
  else {
    try {
      const h = { 'X-ELS-APIKey': sk, Accept: 'application/json' };
      if (apiKey_('SCOPUS_INSTTOKEN')) h['X-ELS-Insttoken'] = apiKey_('SCOPUS_INSTTOKEN');
      const r = httpJson_(SCOPUS_API + '?query=' + encodeURIComponent('AFFIL(Mahidol University)') + '&count=1&field=eid&nocache=' + Date.now(), h);
      const n = Number(r && r['search-results'] && r['search-results']['opensearch:totalResults']) || 0;
      const ser = scopusSerial_('17441730', h);
      out.scopus = { ok: true, message: 'เชื่อมต่อ Scopus สำเร็จ — ทดสอบค้น AFFIL(Mahidol University) พบ ' + n.toLocaleString() + ' รายการ · ' +
        (ser ? 'ดึงข้อมูลวารสาร (CiteScore/Quartile) ได้' : 'ดึงข้อมูลวารสาร (Serial Title API) ไม่ได้ — จะใช้ Quartile จากรายชื่อ SJR ที่นำเข้าแทน') };
    } catch (e) { out.scopus = { ok: false, message: e.message + ' · ถ้าขึ้น 401/403 ให้ขอ Institutional Token จากหอสมุด แล้วใส่ช่อง Scopus Institutional Token' }; }
  }
  const wk = apiKey_('WOS_API_KEY');
  if (!wk) out.wos = { ok: false, message: 'ยังไม่ได้ใส่ Web of Science API key (ไม่บังคับ)' };
  else {
    try {
      const r = httpJson_(WOS_API + '?db=WOS&limit=1&q=' + encodeURIComponent('OG=(Mahidol University)') + '&nocache=' + Date.now(), { 'X-ApiKey': wk, Accept: 'application/json' });
      out.wos = { ok: true, message: 'เชื่อมต่อ Web of Science สำเร็จ — พบ ' + ((r && r.metadata && r.metadata.total) || 0).toLocaleString() + ' รายการ' };
    } catch (e) { out.wos = { ok: false, message: e.message }; }
  }
  audit_('api_test', JSON.stringify({ scopus: out.scopus.ok, wos: out.wos.ok }));
  out.ts = nowIso_();
  PropertiesService.getScriptProperties().setProperty('LAST_KEY_TEST', JSON.stringify(out));
  return out;
}

/** แยกชื่ออังกฤษ "Firstname Lastname" → { first, last, initial } */
function splitName_(en) {
  const parts = String(en || '').replace(/[,.]/g, ' ').trim().split(/\s+/).filter(String);
  if (!parts.length) return null;
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const first = parts.length > 1 ? parts[0] : '';
  return { first: first, last: last, initial: first ? first.charAt(0).toUpperCase() : '' };
}

/* ---------------- 1. Scopus ---------------- */

function searchScopus_(p, fromCE, toCE) {
  const key = apiKey_('SCOPUS_API_KEY');
  if (!key) return { mode: 'list', items: [], message: 'ยังไม่ได้ใส่ Scopus API key — ตรวจผ่านรายชื่อวารสาร SJR (ISSN) แทน' };
  const n = splitName_(p.nameEn);
  let q;
  if (p.scopusId) q = 'AU-ID(' + String(p.scopusId).replace(/\D+/g, '') + ')';
  else if (n) q = 'AUTHLASTNAME(' + n.last + ')' + (n.first ? ' AND AUTHFIRST(' + n.first + ')' : '');
  else return { mode: 'skipped', items: [], message: 'ต้องมีชื่อภาษาอังกฤษหรือ Scopus Author ID' };
  const affil = String(p.affil || '').trim().replace(/["()]/g, '');
  if (affil && !p.scopusId) q += ' AND AFFIL("' + affil + '")';
  const headers = scopusHeaders_(key);
  const fields = 'dc:title,prism:publicationName,prism:issn,prism:eIssn,prism:coverDate,prism:doi,dc:creator,subtypeDescription,prism:aggregationType,eid,pubmed-id,source-id';
  const items = [];
  let total = 0;
  for (let start = 0; start < 200; start += 25) {
    const r = httpJson_(SCOPUS_API + '?query=' + encodeURIComponent(q) + '&date=' + fromCE + '-' + toCE + '&count=25&start=' + start + '&field=' + fields, headers);
    const sr = (r && r['search-results']) || {};
    total = Number(sr['opensearch:totalResults']) || 0;
    const entries = (sr.entry || []).filter(function (e) { return !e.error; });
    entries.forEach(function (e) {
      const agg = String(e['prism:aggregationType'] || '');
      items.push({
        origin: 'Scopus', sourceId: e.eid, title: e['dc:title'] || '', journal: e['prism:publicationName'] || '',
        yearCE: Number(String(e['prism:coverDate'] || '').slice(0, 4)) || 0, doi: cleanDoi_(e['prism:doi']),
        url: e['prism:doi'] ? 'https://doi.org/' + e['prism:doi'] : scopusRecordUrl_(e.eid), scopusUrl: scopusRecordUrl_(e.eid),
        issns: [e['prism:issn'], e['prism:eIssn']].filter(String), pmid: e['pubmed-id'] || '',
        sourceType: /conference/i.test(agg) ? 'conference' : 'journal', workType: /book/i.test(agg) && !/series/i.test(agg) ? 'book' : (e.subtypeDescription || ''),
        authors: e['dc:creator'] ? [e['dc:creator']] : [],
        direct: { scopus: { eid: e.eid, agg: agg, sourceId: e['source-id'] || '' } }
      });
    });
    if (start + 25 >= total || !entries.length) break;
  }
  // ยืนยันวารสารกับ Scopus โดยตรง (CiteScore / Quartile / ปีที่ยังอยู่ในฐาน)
  const serials = {};
  items.forEach(function (it) {
    const k = it.issns.map(normIssn_).filter(String)[0];
    if (!k) return;
    if (!(k in serials)) serials[k] = Object.keys(serials).length < 40 ? scopusSerial_(k, headers) : null;
    if (serials[k]) it.direct.scopus.serial = serials[k];
  });
  const verifyUrl = 'https://www.scopus.com/results/results.uri?src=s&sot=a&sdt=a&s=' + encodeURIComponent(q + ' AND PUBYEAR > ' + (fromCE - 1) + ' AND PUBYEAR < ' + (toCE + 1));
  return { mode: 'direct', items: items, message: 'ค้นโดยตรงด้วย ' + q + ' (' + total + ' รายการ)', query: q, link: verifyUrl,
    authorUrl: p.scopusId ? 'https://www.scopus.com/authid/detail.uri?authorId=' + String(p.scopusId).replace(/\D+/g, '') : '' };
}

function scopusHeaders_(key) {
  const h = { 'X-ELS-APIKey': key || apiKey_('SCOPUS_API_KEY'), Accept: 'application/json' };
  if (apiKey_('SCOPUS_INSTTOKEN')) h['X-ELS-Insttoken'] = apiKey_('SCOPUS_INSTTOKEN');
  return h;
}
function scopusRecordUrl_(eid) { return eid ? 'https://www.scopus.com/record/display.uri?eid=' + encodeURIComponent(eid) + '&origin=resultslist' : ''; }

/** เก็บค่า percentile ทุกตัวในข้อมูล CiteScore (โครงสร้าง JSON ซ้อนหลายชั้น) */
function collectPercentiles_(o, out, subj) {
  if (!o || typeof o !== 'object') return out;
  if (Array.isArray(o)) { o.forEach(function (x) { collectPercentiles_(x, out, subj); }); return out; }
  if (o.percentile !== undefined && !isNaN(Number(o.percentile))) out.push({ p: Number(o.percentile), code: o.subjectCode || '', rank: o.rank || '' });
  Object.keys(o).forEach(function (k) { if (k !== 'percentile') collectPercentiles_(o[k], out, subj); });
  return out;
}

/** ข้อมูลวารสารจาก Scopus Serial Title API → { title, quartile, percentile, citeScore, year, coverageEnd, url } */
function scopusSerial_(issn, headers) {
  try {
    const r = httpJson_('https://api.elsevier.com/content/serial/title/issn/' + issn + '?view=CITESCORE', headers || scopusHeaders_());
    const e = r && r['serial-metadata-response'] && (r['serial-metadata-response'].entry || [])[0];
    if (!e || e.error) return null;
    const info = e.citeScoreYearInfoList || {};
    const years = [].concat(info.citeScoreYearInfo || []).filter(function (y) { return !y['@status'] || /complete/i.test(y['@status']); });
    const latest = years.sort(function (a, b) { return Number(b['@year']) - Number(a['@year']); })[0];
    const pcts = collectPercentiles_(latest || info, []);
    const best = pcts.sort(function (a, b) { return b.p - a.p; })[0];
    const q = !best ? '' : best.p >= 75 ? 'Q1' : best.p >= 50 ? 'Q2' : best.p >= 25 ? 'Q3' : 'Q4';
    const subj = [].concat(e['subject-area'] || []).filter(function (s) { return best && String(s['@code']) === String(best.code); })[0];
    const link = [].concat(e.link || []).filter(function (l) { return l['@ref'] === 'scopus-source'; })[0];
    return {
      title: e['dc:title'] || '', quartile: q, percentile: best ? best.p : '', subject: subj ? subj['$'] : '',
      citeScore: info.citeScoreCurrentMetric || '', year: latest ? latest['@year'] : (info.citeScoreCurrentMetricYear || ''),
      coverageStart: e.coverageStartYear || '', coverageEnd: e.coverageEndYear || '',
      url: link ? link['@href'] : (e['source-id'] ? 'https://www.scopus.com/sourceid/' + e['source-id'] : '')
    };
  } catch (err) { return null; }
}

/* ---------------- 2. Web of Science ---------------- */

function searchWos_(p, fromCE, toCE) {
  const key = apiKey_('WOS_API_KEY');
  if (!key) return { mode: 'list', items: [], message: 'ยังไม่ได้ใส่ Web of Science API key — ตรวจผ่านรายชื่อวารสาร WoS (ISSN) ถ้านำเข้าไว้' };
  const n = splitName_(p.nameEn);
  if (!n) return { mode: 'skipped', items: [], message: 'ต้องมีชื่อภาษาอังกฤษ' };
  const q = 'AU=(' + n.last + (n.initial ? ' ' + n.initial : '') + ') AND PY=(' + fromCE + '-' + toCE + ')';
  const r = httpJson_(WOS_API + '?db=WOS&limit=50&q=' + encodeURIComponent(q), { 'X-ApiKey': key, Accept: 'application/json' });
  const items = ((r && r.hits) || []).map(function (h) {
    const id = h.identifiers || {}, src = h.source || {};
    return {
      origin: 'Web of Science', sourceId: h.uid, title: h.title || '', journal: src.sourceTitle || '',
      yearCE: Number(src.publishYear) || 0, doi: cleanDoi_(id.doi), url: id.doi ? 'https://doi.org/' + id.doi : '',
      issns: [id.issn, id.eissn].filter(String), pmid: id.pmid || '',
      sourceType: (h.sourceTypes || []).join(' ').match(/proceeding/i) ? 'conference' : 'journal', workType: (h.types || []).join(','),
      authors: ((h.names && h.names.authors) || []).map(function (a) { return a.displayName || a.wosStandard; }).slice(0, 12),
      direct: { wos: { uid: h.uid } }
    };
  });
  return { mode: 'direct', items: items, message: 'ค้นโดยตรงด้วย ' + q + ' (' + ((r && r.metadata && r.metadata.total) || items.length) + ' รายการ)', query: q };
}

/* ---------------- 3. PubMed ---------------- */

function searchPubmed_(p, fromCE, toCE) {
  const n = splitName_(p.nameEn);
  if (!n) return { mode: 'skipped', items: [], message: 'ต้องมีชื่อภาษาอังกฤษ' };
  const key = apiKey_('NCBI_API_KEY');
  const term = n.last + ' ' + (n.initial || '') + '[Author] AND ' + fromCE + ':' + toCE + '[dp]';
  const s = httpJson_(PUBMED_API + '/esearch.fcgi?db=pubmed&retmode=json&retmax=100&term=' + encodeURIComponent(term) + (key ? '&api_key=' + key : ''));
  const ids = (s && s.esearchresult && s.esearchresult.idlist) || [];
  if (!ids.length) return { mode: 'direct', items: [], message: 'ค้นโดยตรงด้วย ' + term + ' (0 รายการ)', query: term };
  const d = httpJson_(PUBMED_API + '/esummary.fcgi?db=pubmed&retmode=json&id=' + ids.join(',') + (key ? '&api_key=' + key : ''));
  const res = (d && d.result) || {};
  const items = ids.map(function (id) {
    const a = res[id];
    if (!a) return null;
    const doi = ((a.articleids || []).filter(function (x) { return x.idtype === 'doi'; })[0] || {}).value || '';
    return {
      origin: 'PubMed', sourceId: id, title: String(a.title || '').replace(/\.$/, ''), journal: a.fulljournalname || a.source || '',
      yearCE: Number(String(a.pubdate || a.epubdate || '').slice(0, 4)) || 0, doi: cleanDoi_(doi),
      url: 'https://pubmed.ncbi.nlm.nih.gov/' + id + '/', issns: [a.issn, a.essn].filter(String), pmid: id,
      sourceType: 'journal', workType: (a.pubtype || []).join(','),
      authors: (a.authors || []).map(function (x) { return x.name; }).slice(0, 12),
      direct: { pubmed: { pmid: id } }
    };
  }).filter(Boolean);
  return { mode: 'direct', items: items, message: 'ค้นโดยตรงด้วย ' + term + ' (' + ids.length + ' รายการ)', query: term };
}

/* ---------------- 4. ERIC ---------------- */

function searchEric_(p, fromCE) {
  const n = splitName_(p.nameEn);
  if (!n) return { mode: 'skipped', items: [], message: 'ต้องมีชื่อภาษาอังกฤษ' };
  const q = 'author:"' + n.last + (n.first ? ', ' + n.first : '') + '" AND publicationdateyear:[' + fromCE + ' TO 3000]';
  const r = httpJson_(ERIC_API + '?format=json&rows=50&fields=id,title,author,source,publicationdateyear,issn,peerreviewed,url&search=' + encodeURIComponent(q));
  const docs = (r && r.response && r.response.docs) || [];
  const items = docs.map(function (d) {
    const isJournal = /^EJ/.test(d.id || '');
    return {
      origin: 'ERIC', sourceId: d.id, title: d.title || '', journal: d.source || '',
      yearCE: Number(d.publicationdateyear) || 0, doi: '', url: 'https://eric.ed.gov/?id=' + d.id,
      issns: [].concat(d.issn || []).map(function (s) { return String(s).replace(/^ISSN-/i, ''); }), pmid: '',
      sourceType: isJournal ? 'journal' : 'report', workType: isJournal ? 'article' : 'report',
      authors: [].concat(d.author || []).slice(0, 12),
      direct: { eric: { id: d.id, journal: isJournal } }
    };
  });
  return { mode: 'direct', items: items, message: 'ค้นโดยตรงด้วย ' + q + ' (' + docs.length + ' รายการ)', query: q };
}

/* ---------------- 5. TCI / ThaiJO (ชื่อไทย) ---------------- */

function searchThai_(p, fromCE) {
  const th = String(p.nameTh || '').trim();
  if (!th) return { mode: 'skipped', items: [], message: 'ไม่ได้กรอกชื่อภาษาไทย' };
  const items = [];
  const key = th.replace(/\s+/g, '');
  const r = httpJson_(CROSSREF + '/works?query.author=' + encodeURIComponent(th) + '&filter=from-pub-date:' + fromCE + '&rows=40&select=DOI,title,ISSN,container-title,issued,type,author,publisher,URL');
  ((r && r.message && r.message.items) || []).filter(function (it) {
    return (it.author || []).some(function (a) { return ([a.given, a.family].join('') + (a.name || '')).replace(/\s+/g, '').indexOf(key) > -1; });
  }).forEach(function (it) { items.push(fromCrossref_(it)); });
  const o = httpJson_(OPENALEX + '/works?filter=raw_author_name.search:' + encodeURIComponent(th) + ',from_publication_date:' + fromCE + '-01-01&per_page=50&select=id,doi,title,display_name,publication_year,type,ids,primary_location,authorships');
  ((o && o.results) || []).forEach(function (w) { items.push(fromOpenAlex_(w)); });
  return { mode: 'list', items: items, message: 'ค้นชื่อไทยใน Crossref/OpenAlex ' + items.length + ' รายการ แล้วจับคู่ ISSN กับรายชื่อ TCI กลุ่ม 1/2' };
}

/* ---------------- 6. OpenAlex (ฐานรวม) ---------------- */

function searchOpenAlex_(p, fromCE) {
  let authorId = p.openalexId || '', candidates = [];
  if (p.orcid) {
    const orcid = String(p.orcid).replace(/^https?:\/\/orcid\.org\//, '').trim();
    const r = httpJson_(OPENALEX + '/authors/orcid:' + encodeURIComponent(orcid));
    if (r && r.id) authorId = shortId_(r.id);
  }
  if (!authorId && p.nameEn) {
    candidates = findAuthors_({ nameEn: p.nameEn }).candidates;
    if (candidates.length) authorId = candidates[0].id;
  }
  if (!authorId) return { mode: 'skipped', items: [], candidates: candidates, message: 'ไม่พบนักวิจัยใน OpenAlex' };
  const sel = 'id,doi,title,display_name,publication_year,type,ids,primary_location,authorships';
  const r2 = httpJson_(OPENALEX + '/works?filter=author.id:' + encodeURIComponent(authorId) + ',from_publication_date:' + fromCE + '-01-01&per_page=100&sort=publication_year:desc&select=' + sel);
  const items = ((r2 && r2.results) || []).map(fromOpenAlex_);
  const who = candidates.filter(function (c) { return c.id === authorId; })[0];
  return { mode: 'direct', items: items, candidates: candidates, authorId: authorId,
    message: 'นักวิจัย ' + (who ? who.name + (who.institution ? ' (' + who.institution + ')' : '') : authorId) + ' · ' + items.length + ' รายการ' };
}

/* ---------------- รวมทุกฐาน ---------------- */

function mergeWorks_(lists) {
  const byKey = {};
  const order = [];
  lists.forEach(function (list) {
    list.forEach(function (w) {
      const k = w.doi || normTitle_(w.title);
      if (!k) return;
      let m = byKey[k];
      if (!m && !w.doi) { // ลองจับคู่ด้วยชื่อเรื่องกับรายการที่มี DOI
        const t = normTitle_(w.title);
        m = order.map(function (x) { return byKey[x]; }).filter(function (x) { return normTitle_(x.title) === t; })[0];
      }
      if (!m) { byKey[k] = Object.assign({}, w, { origins: [w.origin], direct: Object.assign({}, w.direct || {}) }); order.push(k); return; }
      if (m.origins.indexOf(w.origin) === -1) m.origins.push(w.origin);
      Object.assign(m.direct, w.direct || {});
      (w.issns || []).forEach(function (s) { if (m.issns.indexOf(s) === -1) m.issns.push(s); });
      if (!m.pmid && w.pmid) m.pmid = w.pmid;
      if (!m.doi && w.doi) m.doi = w.doi;
      if ((!m.authors || m.authors.length < 2) && w.authors && w.authors.length > 1) m.authors = w.authors;
      if (!m.journal) m.journal = w.journal;
      if (!m.yearCE) m.yearCE = w.yearCE;
    });
  });
  return order.map(function (k) { return byKey[k]; });
}

/** ค้นทุกฐานตามลำดับ Scopus → WoS → PubMed → ERIC → TCI → OpenAlex */
function searchAll_(p) {
  if (!String(p.nameEn || '').trim() && !String(p.nameTh || '').trim() && !p.scopusId && !p.orcid) throw new Error('กรุณากรอกชื่อภาษาไทยหรืออังกฤษ หรือ Scopus Author ID / ORCID');
  const win = evalWindow_(getSettings_());
  const fromCE = (Number(p.fromYear) || win.start) - 543;
  const toCE = Number(p.toYear) ? Number(p.toYear) - 543 : win.end - 543 + 1;
  const run = {
    scopus: function () { return searchScopus_(p, fromCE, toCE); },
    wos: function () { return searchWos_(p, fromCE, toCE); },
    pubmed: function () { return searchPubmed_(p, fromCE, toCE); },
    eric: function () { return searchEric_(p, fromCE); },
    tci: function () { return searchThai_(p, fromCE); },
    openalex: function () { return searchOpenAlex_(p, fromCE); }
  };
  const status = [], lists = [];
  let candidates = [], authorId = '';
  SOURCE_ORDER.forEach(function (s) {
    let r;
    try { r = run[s.key](); }
    catch (e) { r = { mode: 'error', items: [], message: e.message }; }
    status.push({ key: s.key, label: s.label, step: s.step, mode: r.mode, count: r.items.length, message: r.message, link: r.link || '', authorUrl: r.authorUrl || '' });
    lists.push(r.items);
    if (s.key === 'openalex') { candidates = r.candidates || []; authorId = r.authorId || ''; }
  });
  const person = p.personId ? { personType: p.personType || 'faculty', personId: p.personId } : null;
  const works = finishWorks_(mergeWorks_(lists), person);
  return { works: works, status: status, summary: summarize_(works), candidates: candidates, openalexId: authorId, journalIndex: journalIndexStats_() };
}

/** ตรวจ DOI กับ Scopus / PubMed โดยตรง (ใช้ตอนแนบไฟล์ผลงาน) */
function directChecksByDoi_(doi) {
  const out = { direct: {}, pmid: '', evidence: [] };
  if (!doi) return out;
  try {
    const key = apiKey_('SCOPUS_API_KEY');
    if (key) {
      const headers = { 'X-ELS-APIKey': key, Accept: 'application/json' };
      if (apiKey_('SCOPUS_INSTTOKEN')) headers['X-ELS-Insttoken'] = apiKey_('SCOPUS_INSTTOKEN');
      const r = httpJson_(SCOPUS_API + '?query=' + encodeURIComponent('DOI(' + doi + ')') + '&field=eid,prism:aggregationType,prism:issn,prism:eIssn', headers);
      const e = ((r && r['search-results'] && r['search-results'].entry) || []).filter(function (x) { return !x.error; })[0];
      if (e) {
        out.direct.scopus = { eid: e.eid, agg: e['prism:aggregationType'] || '' };
        const k = [e['prism:issn'], e['prism:eIssn']].map(normIssn_).filter(String)[0];
        if (k) { const ser = scopusSerial_(k, headers); if (ser) out.direct.scopus.serial = ser; }
      }
    }
  } catch (err) { out.evidence.push('ตรวจ Scopus ไม่สำเร็จ: ' + err.message); }
  try {
    const s = httpJson_(PUBMED_API + '/esearch.fcgi?db=pubmed&retmode=json&term=' + encodeURIComponent(doi + '[doi]'));
    const id = ((s && s.esearchresult && s.esearchresult.idlist) || [])[0];
    if (id) { out.direct.pubmed = { pmid: id }; out.pmid = id; }
  } catch (err) { out.evidence.push('ตรวจ PubMed ไม่สำเร็จ: ' + err.message); }
  return out;
}
