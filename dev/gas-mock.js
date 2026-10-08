/*
 * gas-mock.js — จำลองบริการ Google Apps Script ที่ระบบใช้ (SpreadsheetApp, PropertiesService, Session ฯลฯ)
 * สำหรับเปิดดูตัวอย่าง/ทดสอบหน้าเว็บนอก Google (ไม่ได้ใช้บน Apps Script จริง)
 * ข้อมูลเก็บใน localStorage ของเบราว์เซอร์ คีย์ "mugr-preview"
 */
/* eslint-disable no-unused-vars */
function createGasMock(opts) {
  const KEY = 'mugr-preview';
  let store;
  try { store = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { store = null; }
  if (!store || opts.reset) store = { sheets: {}, order: [], script: {}, user: {} };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } };

  function makeRange(sheet, r, c, nr, nc) {
    const grid = () => store.sheets[sheet.name];
    const ensure = () => {
      const g = grid();
      while (g.length < r + nr - 1) g.push([]);
      for (let i = 0; i < g.length; i++) while (g[i].length < c + nc - 1) g[i].push('');
    };
    const self = {
      getValues() {
        const g = grid(), out = [];
        for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (g[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); }
        return out;
      },
      setValues(vals) { ensure(); const g = grid(); vals.forEach((row, i) => row.forEach((v, j) => { g[r - 1 + i][c - 1 + j] = v; })); return self; },
      setValue(v) { return self.setValues([[v]]); },
      clearContent() { ensure(); const g = grid(); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) g[r - 1 + i][c - 1 + j] = ''; return self; },
      setNumberFormat() { return self; }, setFontWeight() { return self; }, setBackground() { return self; }
    };
    return self;
  }
  function trimmed(name) {
    const g = store.sheets[name];
    let lr = g.length; while (lr > 0 && g[lr - 1].every(v => v === '' || v === undefined)) lr--;
    let lc = 0; g.slice(0, lr).forEach(row => { let k = row.length; while (k > 0 && (row[k - 1] === '' || row[k - 1] === undefined)) k--; lc = Math.max(lc, k); });
    return { lr, lc };
  }
  function makeSheet(name) {
    const sheet = { name };
    Object.assign(sheet, {
      getName: () => name,
      getMaxRows: () => Math.max(1000, store.sheets[name].length),
      getMaxColumns: () => 26,
      getLastRow: () => trimmed(name).lr,
      getLastColumn: () => trimmed(name).lc,
      getDataRange: () => { const t = trimmed(name); return makeRange(sheet, 1, 1, Math.max(1, t.lr), Math.max(1, t.lc)); },
      getRange: (r, c, nr, nc) => makeRange(sheet, r, c, nr || 1, nc || 1),
      appendRow: (row) => { const t = trimmed(name); const g = store.sheets[name]; g.length = t.lr; g.push(row.slice()); return sheet; },
      deleteRow: (r) => { store.sheets[name].splice(r - 1, 1); return sheet; },
      setFrozenRows: () => sheet
    });
    return sheet;
  }
  const ss = {
    getId: () => 'preview-db', getUrl: () => '#preview-spreadsheet',
    getSheetByName: (n) => (store.sheets[n] ? makeSheet(n) : null),
    insertSheet: (n) => { store.sheets[n] = []; store.order.push(n); return makeSheet(n); },
    getSheets: () => store.order.map(makeSheet),
    deleteSheet: (s) => { delete store.sheets[s.name]; store.order = store.order.filter(x => x !== s.name); }
  };
  const props = (bag) => ({
    getProperty: k => (k in store[bag] ? store[bag][k] : null),
    setProperty: (k, v) => { store[bag][k] = String(v); },
    deleteProperty: k => { delete store[bag][k]; }
  });

  // ---- บริการภายนอกจำลอง (OpenAlex / Crossref) สำหรับตัวอย่างและการทดสอบ ----
  const W = (id, title, year, issn, journal, extra) => Object.assign({
    id: 'https://openalex.org/' + id, doi: 'https://doi.org/10.9999/' + id.toLowerCase(), title, display_name: title, publication_year: year, type: 'article',
    ids: {}, authorships: [{ author: { display_name: 'Napa Tuayangdee' } }, { author: { display_name: 'Somsak Riandee' } }],
    primary_location: { landing_page_url: '', source: { display_name: journal, issn: issn ? [issn] : null, issn_l: issn, type: 'journal', host_organization_name: 'Sample Publisher' } }
  }, extra || {});
  const WORKS = [
    W('W1', 'Fertility Decline in Southeast Asia (Sample)', 2023, '1744-1730', 'Asian Population Studies (Sample)'),
    W('W2', 'Ageing Society and Long-term Care Policy (Sample)', 2024, '0144-686X', 'Ageing and Society (Sample)', { ids: { pmid: 'https://pubmed.ncbi.nlm.nih.gov/38000001' } }),
    W('W3', 'Intergenerational Households in Rural Thailand (Sample)', 2022, '2465-4418', 'Journal of Population and Social Studies (Sample)'),
    W('W4', 'Migrant Workers and Health Services (Sample)', 2023, '1686-1574', 'Thai Journal of Social Sciences (Sample)'),
    W('W5', 'Household Survey Methods (Sample)', 2020, '9999-9999', 'Unlisted Journal (Sample)'),
    W('W6', 'Population Projection Workshop Paper (Sample)', 2024, null, 'International Conference on Population (Sample)', { type: 'article', primary_location: { source: { display_name: 'International Conference on Population (Sample)', issn: null, issn_l: null, type: 'conference' } } })
  ];
  const json = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  const SC = (eid, title, year, issn, journal, doi, agg) => ({ eid, 'dc:title': title, 'prism:publicationName': journal, 'prism:issn': issn, 'prism:coverDate': year + '-05-01', 'prism:doi': doi, 'dc:creator': 'Tuayangdee N.', 'prism:aggregationType': agg || 'Journal', subtypeDescription: agg === 'Conference Proceeding' ? 'Conference Paper' : 'Article' });
  const SCOPUS = [
    SC('2-s2.0-1', 'Fertility Decline in Southeast Asia (Sample)', 2023, '17441730', 'Asian Population Studies (Sample)', '10.9999/w1'),
    SC('2-s2.0-2', 'Population Ageing Projections in ASEAN (Sample)', 2024, '00324728', 'Population Studies (Sample)', '10.9999/s2'),
    SC('2-s2.0-3', 'Census Data Linkage Methods (Sample)', 2023, '', 'Proceedings of the Asian Population Conference (Sample)', '10.9999/s3', 'Conference Proceeding')
  ];
  const PM = { '38000001': { uid: '38000001', title: 'Ageing Society and Long-term Care Policy (Sample).', fulljournalname: 'Ageing and Society (Sample)', pubdate: '2024 Jan', issn: '0144-686X', essn: '', articleids: [{ idtype: 'doi', value: '10.9999/w2' }], authors: [{ name: 'Tuayangdee N' }] },
    '38000002': { uid: '38000002', title: 'Diabetes Care in Rural Thailand (Sample).', fulljournalname: 'Rural Health Journal (Sample)', pubdate: '2022 Jun', issn: '7777-0007', essn: '', articleids: [], authors: [{ name: 'Tuayangdee N' }] } };
  const UrlFetchApp = { fetch(url, opts) {
    calls.push(url);
    const hdr = (opts && opts.headers) || {};
    if (/api\.elsevier\.com\/content\/serial/.test(url)) {
      if (!hdr['X-ELS-APIKey']) return json(401, { 'service-error': { status: { statusCode: 'AUTHENTICATION_ERROR', statusText: 'Invalid API Key' } } });
      const issn = (url.match(/issn\/(\w+)/) || [])[1];
      const pct = { '00324728': 82, '17441730': 61 }[issn];
      if (pct === undefined) return json(404, {});
      return json(200, { 'serial-metadata-response': { entry: [{ 'dc:title': issn === '00324728' ? 'Population Studies' : 'Asian Population Studies', 'prism:issn': issn, 'source-id': '1' + issn,
        coverageStartYear: '1947', coverageEndYear: '2025', 'subject-area': [{ '@code': '3317', $: 'Demography' }],
        citeScoreYearInfoList: { citeScoreCurrentMetric: '4.1', citeScoreCurrentMetricYear: '2024', citeScoreYearInfo: [{ '@year': '2024', '@status': 'Complete', citeScoreInformationList: [{ citeScoreInfo: [{ citeScoreSubjectRank: [{ subjectCode: '3317', rank: '10', percentile: String(pct) }] }] }] }] },
        link: [{ '@ref': 'scopus-source', '@href': 'https://www.scopus.com/sourceid/1' + issn }] }] } });
    }
    if (/api\.elsevier\.com/.test(url)) {
      if (!hdr['X-ELS-APIKey']) return json(401, {});
      const q = decodeURIComponent((url.match(/query=([^&]+)/) || [])[1] || '');
      const m = q.match(/^DOI\((.+)\)$/);
      const entry = m ? SCOPUS.filter(e => e['prism:doi'] === m[1]) : SCOPUS;
      return json(200, { 'search-results': { 'opensearch:totalResults': String(entry.length), entry: entry.length ? entry : [{ error: 'Result set was empty' }] } });
    }
    if (/api\.clarivate\.com/.test(url)) {
      if (!hdr['X-ApiKey']) return json(401, {});
      return json(200, { metadata: { total: 2 }, hits: [
        { uid: 'WOS:0001', title: 'Ageing Society and Long-term Care Policy (Sample)', source: { sourceTitle: 'AGEING AND SOCIETY', publishYear: 2024 }, identifiers: { doi: '10.9999/w2', issn: '0144-686X' }, types: ['Article'], sourceTypes: ['Journal'] },
        { uid: 'WOS:0002', title: 'Health Equity in Thailand (Sample)', source: { sourceTitle: 'EQUITY JOURNAL', publishYear: 2023 }, identifiers: { doi: '10.9999/x1', issn: '2222-3336' }, types: ['Article'], sourceTypes: ['Journal'] }] });
    }
    if (/esearch\.fcgi/.test(url)) {
      const term = decodeURIComponent((url.match(/term=([^&]+)/) || [])[1] || '');
      const ids = /\[doi\]/.test(term) ? (term.indexOf('10.9999/w2') === 0 ? ['38000001'] : []) : ['38000001', '38000002'];
      return json(200, { esearchresult: { idlist: ids } });
    }
    if (/esummary\.fcgi/.test(url)) {
      const ids = decodeURIComponent((url.match(/id=([^&]+)/) || [])[1] || '').split(',');
      const result = { uids: ids }; ids.forEach(i => { if (PM[i]) result[i] = PM[i]; });
      return json(200, { result });
    }
    if (/api\.ies\.ed\.gov\/eric/.test(url)) return json(200, { response: { docs: [
      { id: 'EJ1400001', title: 'Teaching Demography Online (Sample)', author: ['Tuayangdee, Napa'], source: 'Journal of Population Education (Sample)', publicationdateyear: 2023, issn: ['ISSN-1555-5551'] },
      { id: 'ED600001', title: 'Annual Report on Graduate Studies (Sample)', author: ['Tuayangdee, Napa'], source: '', publicationdateyear: 2022 }] } });
    if (/openalex\.org\/authors\?/.test(url)) {
      const q = decodeURIComponent((url.match(/search=([^&]+)/) || [])[1] || '');
      return json(200, { results: [
        { id: 'https://openalex.org/A5001', display_name: q || 'Sample Author', display_name_alternatives: [], works_count: 6, cited_by_count: 120, orcid: '', last_known_institutions: [{ display_name: 'Mahidol University', country_code: 'TH' }] },
        { id: 'https://openalex.org/A5002', display_name: q + ' (other)', works_count: 2, cited_by_count: 3, last_known_institutions: [{ display_name: 'University of Elsewhere', country_code: 'US' }] }] });
    }
    if (/openalex\.org\/works\?filter=author\.id/.test(url)) return json(200, { results: WORKS });
    if (/openalex\.org\/works\/doi:/.test(url)) {
      const d = decodeURIComponent(url.split('/works/doi:')[1].split(/[?&]/)[0]);
      const w = WORKS.find(x => x.doi.endsWith(d)); return w ? json(200, w) : json(404, {});
    }
    if (/openalex\.org\/works\?search=/.test(url)) return json(200, { results: [WORKS[0]] });
    if (/crossref\.org\/works\?query\.author=/.test(url)) {
      const q = decodeURIComponent((url.match(/query\.author=([^&]+)/) || [])[1] || '');
      return json(200, { message: { items: [
        { DOI: '10.9999/th1', title: ['ครอบครัวข้ามรุ่นในชนบทไทย (ตัวอย่าง)'], ISSN: ['2465-4418'], 'container-title': ['วารสารประชากรและสังคม (ตัวอย่าง)'], issued: { 'date-parts': [[2022]] }, type: 'journal-article', author: [{ name: q }] },
        { DOI: '10.9999/th2', title: ['ไม่ใช่ผลงานของบุคคลนี้'], ISSN: [], 'container-title': ['x'], issued: { 'date-parts': [[2023]] }, type: 'journal-article', author: [{ given: 'อื่น', family: 'ใคร' }] }] } });
    }
    return json(404, {});
  } };
  const cacheBag = {};
  const CacheService = { getScriptCache: () => ({ get: k => cacheBag[k] || null, put: (k, v) => { cacheBag[k] = v; } }) };
  const calls = [];
  const pad = n => String(n).padStart(2, '0');
  const enc = new TextEncoder();
  return {
    persist, calls, UrlFetchApp, CacheService,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, create: () => ss, getUi: () => { throw new Error('no ui'); } },
    PropertiesService: { getScriptProperties: () => props('script'), getUserProperties: () => props('user') },
    Session: { getActiveUser: () => ({ getEmail: () => opts.email }), getEffectiveUser: () => ({ getEmail: () => opts.email }), getScriptTimeZone: () => 'Asia/Bangkok' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()),
      formatDate: d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      base64Encode: bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); },
      newBlob: (content) => ({ getAs: () => { const blob = { setName: () => blob, getBytes: () => Array.from(enc.encode(content)) }; return blob; } }),
      base64Decode: s => Array.from(atob(s), c => c.charCodeAt(0)),
      base64EncodeWebSafe: bytes => btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_'),
      computeDigest: (alg, s) => { let h = 0; const out = []; for (const ch of String(s)) { h = (h * 31 + ch.charCodeAt(0)) >>> 0; } for (let i = 0; i < 16; i++) out.push((h >>> (i % 4 * 8)) & 255 ^ i); return out; },
      DigestAlgorithm: { MD5: 'MD5' }
    },
    DriveApp: { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: () => ({ getUrl: () => 'https://drive.google.com/file/d/preview-evidence' }) }) },
    Logger: { log: (...a) => console.log(...a) },
    HtmlService: {}, ScriptApp: { getService: () => ({ getUrl: () => location.href }) }
  };
}
