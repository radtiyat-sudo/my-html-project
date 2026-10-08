/**
 * Discovery.gs — ค้นหาผลงานอัตโนมัติจากชื่อ (ไทย/อังกฤษ) และตรวจไฟล์ผลงานที่แนบ
 *
 * แหล่งข้อมูล (ฟรี ไม่ต้องใช้ API key):
 *  - OpenAlex (api.openalex.org)  : ค้นนักวิจัยและผลงาน, ISSN ของวารสาร, PMID (บอกว่าอยู่ใน PubMed)
 *  - Crossref (api.crossref.org)  : ค้นผลงานจากชื่อผู้แต่งภาษาไทย และค้นจาก DOI สำรอง
 *
 * การจัดกลุ่มฐานข้อมูลตามประกาศ ก.พ.อ. ใช้ "รายชื่อวารสาร" (ชีต JournalIndex) ที่ผู้ดูแลระบบนำเข้า
 * เช่น SJR (Scopus + Quartile), รายชื่อ TCI กลุ่ม 1/2, Web of Science — จับคู่ด้วย ISSN
 * ระบบไม่ตัดสินแทนผู้ตรวจ: ผลงานที่นำเข้าทุกชิ้นมีสถานะ "รอตรวจรับรอง"
 */

const OPENALEX = 'https://api.openalex.org';
const CROSSREF = 'https://api.crossref.org';
const DB_PRIORITY = ['scopus', 'wos', 'pubmed', 'eric', 'mathscinet', 'jstor', 'projectmuse', 'tci1', 'tci2', 'other_intl', 'other_nat', 'tci3'];

/* ---------------- HTTP ---------------- */

function httpJson_(url, extraHeaders) {
  const cache = CacheService.getScriptCache();
  const key = 'h' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url)).slice(0, 22);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const mail = getSettings_().OPENALEX_MAILTO || Session.getEffectiveUser().getEmail() || '';
  const full = url + (mail && url.indexOf(OPENALEX) === 0 ? (url.indexOf('?') > -1 ? '&' : '?') + 'mailto=' + encodeURIComponent(mail) : '');
  const headers = Object.assign({ 'User-Agent': 'MUGR-Academic-Tracker (Apps Script; mailto:' + mail + ')' }, extraHeaders || {});
  const res = UrlFetchApp.fetch(full, { muteHttpExceptions: true, headers: headers });
  const code = res.getResponseCode();
  if (code === 404) return null;
  if (code === 401 || code === 403) throw new Error('API key ไม่ถูกต้องหรือไม่มีสิทธิ์ (' + code + ') — ตรวจที่ จัดการระบบ > รายชื่อวารสาร > การเชื่อมต่อฐานข้อมูล');
  if (code === 429) throw new Error('ใช้งานเกินโควตาของฐานข้อมูล (429) — ลองใหม่ภายหลัง');
  if (code >= 400) throw new Error('ฐานข้อมูลภายนอกตอบกลับผิดพลาด (' + code + ') กรุณาลองใหม่อีกครั้ง');
  const text = res.getContentText();
  try { if (text.length < 90000) cache.put(key, text, 21600); } catch (e) { /* cache full */ }
  return JSON.parse(text);
}

function shortId_(id) { return String(id || '').replace(/^https?:\/\/openalex\.org\//, ''); }
function cleanDoi_(d) {
  return String(d || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[.,;)\]]+$/, '').toLowerCase();
}
function normIssn_(s) {
  const m = String(s || '').toUpperCase().replace(/[^0-9X]/g, '');
  return m.length === 8 ? m : '';
}
function fmtIssn_(s) { return s ? s.slice(0, 4) + '-' + s.slice(4) : ''; }
function normTitle_(t) { return String(t || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^0-9a-z฀-๿]+/g, ''); }
function hasThai_(s) { return /[฀-๿]/.test(String(s || '')); }

/* ---------------- รายชื่อวารสาร (JournalIndex) ---------------- */

let JOURNAL_MAP_ = null;

/** โหลดรายชื่อวารสารครั้งเดียวต่อการเรียก → { ISSN: [{database, quartile, title, source}] } */
function journalMap_() {
  if (JOURNAL_MAP_) return JOURNAL_MAP_;
  JOURNAL_MAP_ = {};
  DB.all('JournalIndex').forEach(function (r) {
    const k = normIssn_(r.issn);
    if (!k) return;
    (JOURNAL_MAP_[k] = JOURNAL_MAP_[k] || []).push({ database: r.database, quartile: r.quartile || '', title: r.title || '', source: r.source || '' });
  });
  return JOURNAL_MAP_;
}

function journalIndexStats_() {
  const by = {};
  let total = 0;
  DB.all('JournalIndex').forEach(function (r) { by[r.database] = (by[r.database] || 0) + 1; total++; });
  return { total: total, byDatabase: by };
}

/**
 * จัดกลุ่มผลงาน 1 ชิ้นตามประกาศ ก.พ.อ.
 * input: { issns:[], pmid, sourceType, workType, title, journal }
 */
function classify_(w) {
  const map = journalMap_();
  const evidence = [];
  const hits = [];
  (w.issns || []).map(normIssn_).filter(String).forEach(function (k) {
    (map[k] || []).forEach(function (h) { hits.push(Object.assign({ issn: k }, h)); });
  });
  hits.sort(function (a, b) {
    const d = DB_PRIORITY.indexOf(a.database) - DB_PRIORITY.indexOf(b.database);
    return d || String(a.quartile || 'Q9').localeCompare(String(b.quartile || 'Q9'));
  });
  hits.forEach(function (h) {
    const label = (DATABASES[h.database] || { label: h.database }).label;
    const line = 'ISSN ' + fmtIssn_(h.issn) + ' อยู่ในรายชื่อ ' + label + (h.quartile ? ' (' + h.quartile + ')' : '') + (h.source ? ' — แหล่ง: ' + h.source : '');
    if (evidence.indexOf(line) === -1) evidence.push(line);
  });

  let database = hits.length ? hits[0].database : '';
  let quartile = hits.length && hits[0].quartile ? hits[0].quartile : '';
  const dir = w.direct || {};
  const direct = [];
  // ผลที่ค้นเจอในฐานโดยตรงมาก่อนรายชื่อ ISSN — Scopus เป็นอันดับแรก
  if (dir.scopus) { direct.push('scopus'); evidence.unshift('พบในฐาน Scopus โดยตรง (EID ' + dir.scopus.eid + (dir.scopus.agg ? ', ' + dir.scopus.agg : '') + ')'); }
  if (dir.wos) {
    direct.push('wos');
    const wosListed = hits.some(function (h) { return h.database === 'wos'; });
    evidence.push('พบใน Web of Science Core Collection (' + dir.wos.uid + ')' + (wosListed ? ' และ ISSN อยู่ในรายชื่อ SCIE/SSCI/AHCI' : ' — ตรวจ edition: นับเฉพาะ SCIE/SSCI/AHCI (ESCI ไม่นับ)'));
  }
  if (dir.pubmed) direct.push('pubmed');
  if (dir.eric) { if (dir.eric.journal) { direct.push('eric'); evidence.push('พบในฐาน ERIC (' + dir.eric.id + ', บทความวารสาร)'); } else evidence.push('พบใน ERIC แต่เป็นเอกสารประเภท ED (ไม่ใช่บทความวารสาร)'); }
  const firstDirect = DB_PRIORITY.filter(function (d) { return direct.indexOf(d) > -1; })[0];
  if (firstDirect && (!database || DB_PRIORITY.indexOf(firstDirect) <= DB_PRIORITY.indexOf(database) || (DATABASES[database] || {}).group !== 'kpa_intl')) {
    database = firstDirect;
    const qHit = hits.filter(function (h) { return h.database === firstDirect && /^Q[1-4]$/.test(h.quartile); })[0] ||
                 hits.filter(function (h) { return h.database === 'scopus' && /^Q[1-4]$/.test(h.quartile); })[0];
    quartile = qHit ? qHit.quartile : '';
    if (firstDirect === 'scopus' && !quartile) evidence.push('ไม่พบ Quartile ในรายชื่อ SJR ที่นำเข้า — ตรวจที่ scimagojr.com');
  }
  // ถ้าวารสารอยู่หลายฐาน ใช้ Quartile ที่ดีที่สุดของฐานนานาชาติ
  const kpa = hits.filter(function (h) { return (DATABASES[h.database] || {}).group === 'kpa_intl' && /^Q[1-4]$/.test(h.quartile); });
  if (database && (DATABASES[database] || {}).group === 'kpa_intl' && kpa.length) quartile = kpa.map(function (h) { return h.quartile; }).sort()[0];

  if (w.pmid || dir.pubmed) {
    if (direct.indexOf('pubmed') === -1) direct.push('pubmed');
    if (!w.pmid) w.pmid = dir.pubmed.pmid;
    evidence.push('มีรหัส PubMed (PMID ' + w.pmid + ') → อยู่ในฐานข้อมูล PubMed');
    if (!database || DB_PRIORITY.indexOf(database) > DB_PRIORITY.indexOf('pubmed')) { database = 'pubmed'; quartile = quartile || ''; }
  }

  let type = 'journal';
  const st = String(w.sourceType || '').toLowerCase(), wt = String(w.workType || '').toLowerCase();
  if (dir.eric && !dir.eric.journal && !database) type = 'journal';
  else if (st === 'conference' || /proceedings/.test(wt)) type = hasThai_(w.journal) || hasThai_(w.title) ? 'proceedings_nat' : 'proceedings_intl';
  else if (wt === 'book' || wt === 'monograph') type = 'book';

  let confidence = direct.length ? 'high' : (hits.length ? 'high' : 'unknown');
  if (database === 'wos' && direct.indexOf('wos') > -1 && !hits.some(function (h) { return h.database === 'wos'; })) confidence = 'medium';
  if (type === 'journal' && !database) {
    database = 'none';
    confidence = 'unknown';
    if (direct.length || (dir.eric && !dir.eric.journal)) confidence = 'high';
    evidence.push((w.issns || []).length
      ? 'ไม่พบ ISSN ' + w.issns.map(function (s) { return fmtIssn_(normIssn_(s)); }).filter(String).join(', ') + ' ในรายชื่อวารสารที่นำเข้า — ตรวจด้วยตนเองที่ SCImago / TCI / Web of Science'
      : 'ไม่พบ ISSN ของแหล่งเผยแพร่ — ตรวจด้วยตนเอง');
  }
  if (type !== 'journal') { evidence.push('ประเภท: ' + PUB_TYPES[type].label + ' (จากข้อมูลแหล่งเผยแพร่)' + (dir.scopus ? ' — อยู่ใน Scopus' : '')); confidence = 'medium'; }

  const db = DATABASES[type === 'journal' ? database : 'none'] || DATABASES.none;
  const p = { type: type, database: type === 'journal' ? database : 'none', quartile: type === 'journal' && db.quartile ? quartile : '' };
  const wt2 = pubWeight_(p, getSettings_());
  return Object.assign(p, {
    level: type === 'journal' ? db.level : (PUB_TYPES[type].level || ''),
    group: type === 'journal' ? db.group : 'other',
    accepted: isAccepted_(p),
    weight: wt2.w, basis: wt2.basis, confidence: confidence, evidence: evidence, foundIn: direct
  });
}

/* ---------------- OpenAlex / Crossref → รูปแบบกลาง ---------------- */

function fromOpenAlex_(w) {
  const loc = w.primary_location || {};
  const src = loc.source || {};
  const issns = [].concat(src.issn || [], src.issn_l ? [src.issn_l] : []).filter(String);
  const pmid = w.ids && w.ids.pmid ? String(w.ids.pmid).replace(/\D+/g, '') : '';
  return {
    sourceId: shortId_(w.id), origin: 'OpenAlex',
    title: w.title || w.display_name || '', journal: src.display_name || '', publisher: src.host_organization_name || '',
    yearCE: Number(w.publication_year) || 0, doi: cleanDoi_(w.doi), url: w.doi || loc.landing_page_url || '',
    issns: issns.filter(function (v, i, a) { return a.indexOf(v) === i; }), pmid: pmid,
    sourceType: src.type || '', workType: w.type || '',
    authors: (w.authorships || []).map(function (a) { return a.author && a.author.display_name ? a.author.display_name : a.raw_author_name; }).filter(String).slice(0, 12)
  };
}

function fromCrossref_(it) {
  const parts = (it.issued && it.issued['date-parts'] && it.issued['date-parts'][0]) || (it['published-print'] && it['published-print']['date-parts'][0]) || [];
  return {
    sourceId: it.DOI, origin: 'Crossref',
    title: (it.title || [])[0] || '', journal: (it['container-title'] || [])[0] || '', publisher: it.publisher || '',
    yearCE: Number(parts[0]) || 0, doi: cleanDoi_(it.DOI), url: it.DOI ? 'https://doi.org/' + it.DOI : (it.URL || ''),
    issns: it.ISSN || [], pmid: '',
    sourceType: /proceedings/.test(it.type || '') ? 'conference' : 'journal', workType: it.type || '',
    authors: (it.author || []).map(function (a) { return [a.given, a.family].filter(String).join(' ') || a.name || ''; }).filter(String).slice(0, 12)
  };
}

/** เติมการจัดกลุ่ม + ปี พ.ศ. + ตรวจซ้ำกับผลงานในระบบ */
function finishWorks_(list, person) {
  const settings = getSettings_();
  const win = evalWindow_(settings);
  const existing = !TABLES.Publications ? [] : DB.all('Publications').filter(function (p) { return !person || (p.personType === person.personType && p.personId === person.personId); });
  const doiSet = {}, titleSet = {};
  existing.forEach(function (p) { if (p.doi) doiSet[cleanDoi_(p.doi)] = 1; if (normTitle_(p.title)) titleSet[normTitle_(p.title)] = 1; });
  const seen = {};
  return list.filter(function (w) {
    const k = w.doi || normTitle_(w.title) || 'issn:' + (w.issns || []).join(',');
    if (!k || seen[k]) return false;
    seen[k] = 1; return true;
  }).map(function (w) {
    const c = classify_(w);
    const year = w.yearCE ? w.yearCE + 543 : 0;
    return Object.assign({}, w, c, {
      year: year,
      inWindow: year >= win.start && year <= win.end,
      expired: year > 0 && year < win.start,
      duplicate: !!((w.doi && doiSet[w.doi]) || (normTitle_(w.title) && titleSet[normTitle_(w.title)]))
    });
  }).sort(function (a, b) { return b.year - a.year; });
}

/* ---------------- Actions ---------------- */

/** ค้นนักวิจัยจากชื่อภาษาอังกฤษ (OpenAlex) */
function findAuthors_(p) {
  const name = String(p.nameEn || '').trim();
  if (!name) return { candidates: [], note: 'กรอกชื่อภาษาอังกฤษเพื่อค้นใน OpenAlex' };
  const r = httpJson_(OPENALEX + '/authors?search=' + encodeURIComponent(name) + '&per_page=8&select=id,display_name,display_name_alternatives,works_count,cited_by_count,orcid,last_known_institutions');
  const list = ((r && r.results) || []).map(function (a) {
    const inst = (a.last_known_institutions || [])[0] || {};
    return { id: shortId_(a.id), name: a.display_name, alt: (a.display_name_alternatives || []).slice(0, 3), works: a.works_count || 0, cited: a.cited_by_count || 0,
      orcid: a.orcid || '', institution: inst.display_name || '', country: inst.country_code || '' };
  });
  // ให้ผู้ที่สังกัดในประเทศไทยขึ้นก่อน
  list.sort(function (a, b) { return (b.country === 'TH') - (a.country === 'TH') || b.works - a.works; });
  return { candidates: list };
}

/** ดึงผลงานของนักวิจัย (OpenAlex) + ผลงานจากชื่อไทย (Crossref) แล้วจัดกลุ่มตามประกาศ */
function findWorks_(p) {
  const fromYearCE = (Number(p.fromYear) || evalWindow_(getSettings_()).start) - 543;
  const list = [];
  const sources = [];
  if (p.authorId) {
    const sel = 'id,doi,title,display_name,publication_year,type,ids,primary_location,authorships';
    const r = httpJson_(OPENALEX + '/works?filter=author.id:' + encodeURIComponent(p.authorId) + ',from_publication_date:' + fromYearCE + '-01-01&per_page=100&sort=publication_year:desc&select=' + sel);
    ((r && r.results) || []).forEach(function (w) { list.push(fromOpenAlex_(w)); });
    sources.push('OpenAlex ' + ((r && r.results) || []).length + ' รายการ');
  }
  const th = String(p.nameTh || '').trim();
  if (th) {
    const r2 = httpJson_(CROSSREF + '/works?query.author=' + encodeURIComponent(th) + '&filter=from-pub-date:' + fromYearCE + '&rows=40&select=DOI,title,ISSN,container-title,issued,type,author,publisher,URL');
    const items = ((r2 && r2.message && r2.message.items) || []).filter(function (it) {
      // Crossref ค้นแบบคลุมเครือ — เก็บเฉพาะรายการที่มีชื่อผู้แต่งตรงกับชื่อไทยจริง
      const key = th.replace(/\s+/g, '');
      return (it.author || []).some(function (a) { return ([a.given, a.family].join('') + (a.name || '')).replace(/\s+/g, '').indexOf(key) > -1; });
    });
    items.forEach(function (it) { list.push(fromCrossref_(it)); });
    sources.push('Crossref (ชื่อไทย) ' + items.length + ' รายการ');
  }
  const person = p.personId ? { personType: p.personType || 'faculty', personId: p.personId } : null;
  const works = finishWorks_(list, person);
  return { works: works, sources: sources, summary: summarize_(works), journalIndex: journalIndexStats_() };
}

function summarize_(works) {
  const s = { intl: 0, nat: 0, other: 0, unknown: 0, inWindow: 0 };
  works.forEach(function (w) {
    if (w.inWindow) s.inWindow++;
    if (w.confidence === 'unknown') s.unknown++;
    else if (w.group === 'kpa_intl') s.intl++;
    else if (w.group === 'tci1' || w.group === 'tci2') s.nat++;
    else s.other++;
  });
  return s;
}

/** ตรวจไฟล์ผลงาน: รับข้อความที่อ่านจากไฟล์ (หรือ DOI/ชื่อเรื่องที่พิมพ์) → หาเมทาดาทาจริง → จัดกลุ่ม */
function analyzeDocument_(p) {
  const text = String(p.text || '').slice(0, 60000);
  let doi = cleanDoi_(p.doi);
  if (!doi) { const m = text.match(/\b(10\.\d{4,9}\/[^\s"'<>]+)/i); if (m) doi = cleanDoi_(m[1]); }
  const issnFound = [];
  const re = /\b(\d{4}-\d{3}[\dXx])\b/g;
  let m2;
  while ((m2 = re.exec(text)) && issnFound.length < 6) { if (issnFound.indexOf(m2[1].toUpperCase()) === -1) issnFound.push(m2[1].toUpperCase()); }
  [].concat(p.issns || []).forEach(function (s) { if (normIssn_(s) && issnFound.indexOf(s) === -1) issnFound.push(s); });

  let work = null, matchedBy = '';
  if (doi) {
    const r = httpJson_(OPENALEX + '/works/doi:' + encodeURIComponent(doi));
    if (r && r.id) { work = fromOpenAlex_(r); matchedBy = 'DOI ' + doi + ' (OpenAlex)'; }
    else {
      const c = httpJson_(CROSSREF + '/works/' + encodeURIComponent(doi));
      if (c && c.message) { work = fromCrossref_(c.message); matchedBy = 'DOI ' + doi + ' (Crossref)'; }
    }
  }
  const title = String(p.title || '').trim();
  if (!work && title.length > 12) {
    const r = httpJson_(OPENALEX + '/works?search=' + encodeURIComponent(title.slice(0, 250)) + '&per_page=3&select=id,doi,title,display_name,publication_year,type,ids,primary_location,authorships');
    const best = ((r && r.results) || []).filter(function (w) {
      const a = normTitle_(w.title), b = normTitle_(title);
      return a && b && (a.indexOf(b.slice(0, 40)) > -1 || b.indexOf(a.slice(0, 40)) > -1);
    })[0];
    if (best) { work = fromOpenAlex_(best); matchedBy = 'ชื่อบทความ (OpenAlex)'; }
  }
  if (!work) {
    if (!issnFound.length) return { found: false, doi: doi, issns: [], message: 'ไม่พบ DOI, ISSN หรือชื่อบทความที่ค้นเจอในฐานข้อมูล — ลองพิมพ์ DOI หรือชื่อบทความด้วยตนเอง' };
    work = { title: title, journal: '', yearCE: 0, doi: doi, url: doi ? 'https://doi.org/' + doi : '', issns: issnFound, pmid: '', sourceType: 'journal', workType: 'article', authors: [], origin: 'ไฟล์' };
    matchedBy = 'ISSN ที่พบในไฟล์';
  } else {
    issnFound.forEach(function (s) { if (work.issns.indexOf(s) === -1) work.issns.push(s); });
  }
  const dc = directChecksByDoi_(work.doi || doi);
  work.direct = Object.assign({}, work.direct || {}, dc.direct);
  if (!work.pmid && dc.pmid) work.pmid = dc.pmid;
  const res = finishWorks_([work], null)[0];
  res.evidence = res.evidence.concat(dc.evidence);
  // เดาเจ้าของผลงานจากรายชื่อผู้แต่ง
  const owners = [];
  const names = (work.authors || []).map(function (a) { return String(a).toLowerCase(); }).join(' | ');
  (TABLES.Faculty ? DB.all('Faculty').concat(DB.all('Experts').map(function (x) { return Object.assign({ _expert: true }, x); })) : []).forEach(function (f) {
    const en = String(f.nameEn || '').toLowerCase().trim();
    const last = en.split(/\s+/).pop();
    if ((last && last.length > 2 && names.indexOf(last) > -1) || (f.nameTh && (work.authors || []).join(' ').indexOf(String(f.nameTh).split(/\s+/)[0]) > -1 && hasThai_(f.nameTh))) {
      owners.push({ personType: f._expert ? 'expert' : 'faculty', personId: f.id, name: personName_(f) });
    }
  });
  return { found: true, matchedBy: matchedBy, work: res, owners: owners.slice(0, 5), doi: doi, issnsInFile: issnFound };
}

/** นำผลงานที่เลือกเข้าระบบ (สถานะ: รอตรวจรับรอง) */
function importWorks_(p) {
  const personType = p.personType === 'expert' ? 'expert' : 'faculty';
  if (!p.personId) throw new Error('กรุณาเลือกบุคคลที่จะนำเข้าผลงาน');
  if (!canEditPerson_(personType, p.personId)) throw new Error('คุณไม่มีสิทธิ์เพิ่มผลงานให้บุคคลนี้');
  const works = [].concat(p.works || []).slice(0, 200);
  if (!works.length) throw new Error('ยังไม่ได้เลือกผลงาน');
  const existing = DB.all('Publications').filter(function (x) { return x.personType === personType && x.personId === p.personId; });
  const dois = {}, titles = {};
  existing.forEach(function (x) { if (x.doi) dois[cleanDoi_(x.doi)] = 1; titles[normTitle_(x.title)] = 1; });
  const u = currentUser_();
  const rows = [];
  works.forEach(function (w) {
    const doi = cleanDoi_(w.doi);
    if ((doi && dois[doi]) || titles[normTitle_(w.title)]) return;
    const year = Number(w.year);
    if (!String(w.title || '').trim() || !(year >= 2500 && year <= 2700)) return;
    const type = PUB_TYPES[w.type] ? w.type : 'journal';
    const db = type === 'journal' && DATABASES[w.database] ? w.database : 'none';
    rows.push({ personType: personType, personId: p.personId, title: String(w.title).trim().slice(0, 500), source: String(w.journal || '').slice(0, 300),
      year: year, type: type, database: db, quartile: db !== 'none' && DATABASES[db].quartile && /^Q[1-4]$/.test(w.quartile) ? w.quartile : '',
      authorRole: '', doi: doi, url: w.url || (doi ? 'https://doi.org/' + doi : ''), status: 'pending',
      note: ('นำเข้าอัตโนมัติ (' + (w.origin || 'ระบบ') + '): ' + [].concat(w.evidence || []).join(' / ')).slice(0, 900),
      isSample: false, createdBy: u.email });
    if (doi) dois[doi] = 1;
    titles[normTitle_(w.title)] = 1;
  });
  DB.insertMany('Publications', rows);
  audit_('import_works', personType + ':' + p.personId + ' +' + rows.length);
  return { imported: rows.length, skipped: works.length - rows.length };
}

/** บันทึกไฟล์ผลงานที่แนบไว้ใน Google Drive เป็นหลักฐาน */
function saveEvidence_(p) {
  const u = currentUser_();
  if (u.role === 'executive') throw new Error('คุณไม่มีสิทธิ์อัปโหลดไฟล์');
  const bytes = Utilities.base64Decode(String(p.base64 || ''));
  if (!bytes.length) throw new Error('ไม่พบข้อมูลไฟล์');
  if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15 MB');
  const it = DriveApp.getFoldersByName(APP.evidenceFolder);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(APP.evidenceFolder);
  const name = String(p.fileName || 'ผลงาน.pdf').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 150);
  const file = folder.createFile(Utilities.newBlob(bytes, p.mimeType || 'application/pdf', name));
  audit_('upload_evidence', name);
  return { url: file.getUrl(), name: name };
}

/** นำเข้ารายชื่อวารสาร (ISSN → ฐานข้อมูล/Quartile) */
function importJournalIndex_(p) {
  requireRole_(['admin']);
  const database = p.database;
  if (!DATABASES[database] || database === 'none') throw new Error('กรุณาเลือกฐานข้อมูลของรายชื่อนี้');
  const source = String(p.source || database).slice(0, 60);
  if (p.replace) DB.removeWhere('JournalIndex', function (r) { return r.database === database && r.source === source; });
  const seen = {};
  const rows = [];
  [].concat(p.rows || []).forEach(function (r) {
    const q = /^Q[1-4]$/i.test(String(r.quartile || '').trim()) ? String(r.quartile).trim().toUpperCase() : '';
    [].concat(r.issns || []).forEach(function (s) {
      const k = normIssn_(s);
      if (!k || seen[k]) return;
      seen[k] = 1;
      rows.push({ issn: k, title: String(r.title || '').slice(0, 200), database: database, quartile: DATABASES[database].quartile ? q : '', source: source, updatedAt: nowIso_() });
    });
  });
  DB.insertMany('JournalIndex', rows);
  audit_('import_journals', database + ' ' + source + ' +' + rows.length);
  return { added: rows.length, stats: journalIndexStats_() };
}

function clearJournalIndex_(p) {
  requireRole_(['admin']);
  const n = DB.removeWhere('JournalIndex', function (r) { return !p.database || r.database === p.database; });
  audit_('clear_journals', (p.database || 'all') + ' -' + n);
  return { removed: n, stats: journalIndexStats_() };
}
