/**
 * Connectors.gs — ชั้นเชื่อมต่อแหล่งข้อมูล MUHR (บุคคล) และ MUREX (ผลงาน)
 *
 * ปัจจุบันรองรับ 2 โหมดเท่านั้น:
 *   mock   = ข้อมูลจำลองที่ระบบสร้างให้ (ไม่ใช่ข้อมูลจริง)
 *   import = ข้อมูลที่ผู้ดูแลนำเข้าจากไฟล์ CSV (ผ่านหน้าตรวจทานก่อนบันทึก)
 * โหมด api ยังไม่ได้พัฒนา เพราะยังไม่มีข้อกำหนด API จริง — ระบบจะแจ้งว่า "ยังไม่ได้เชื่อมต่อ" และไม่แสดงว่าเชื่อมต่อแล้ว
 * จุดที่ต้องเขียนเพิ่มเมื่อได้ข้อกำหนด: fetchPersonsApi_ / fetchWorksApi_ (ดูท้ายไฟล์)
 */

function sourceMode_(src) {
  const m = setting_(src + '_MODE');
  return SOURCE_MODES[m] ? m : 'mock';
}

function sourceError_(src, code, msg) {
  const e = new Error(msg);
  e.sourceError = { source: src, code: code };
  return e;
}

/** ตรวจว่าแหล่งข้อมูลพร้อมใช้งานหรือไม่ — คืนโหมด หรือโยนข้อผิดพลาดที่ระบุชัดว่าเป็นปัญหาของแหล่งข้อมูล */
function sourceReady_(src) {
  const mode = sourceMode_(src);
  if (toBool_(setting_('SIM_OUTAGE_' + src))) {
    throw sourceError_(src, 'outage', 'ระบบต้นทาง ' + src + ' ขัดข้อง/ติดต่อไม่ได้ในขณะนี้ — ข้อมูลที่ต้องใช้จากระบบนี้จะถูกสรุปว่า "ยังสรุปไม่ได้" ไม่ใช่ "ไม่ผ่าน"');
  }
  if (mode === 'api') {
    throw sourceError_(src, 'not_connected', 'ยังไม่ได้เชื่อมต่อ API ของ ' + src + ' (ยังไม่มีข้อกำหนด/สิทธิ์เข้าถึง) — ใช้โหมดนำเข้าไฟล์ หรือกรอกข้อมูลให้เจ้าหน้าที่ตรวจแทน');
  }
  return mode;
}

/** สถานะแหล่งข้อมูล ไม่พยายามติดต่อจริง และไม่อ้างว่าเชื่อมต่อแล้ว */
function sourceStatus_(src) {
  const mode = sourceMode_(src);
  const outage = toBool_(setting_('SIM_OUTAGE_' + src));
  const rows = DB.all(SOURCES[src].table).filter(function (r) { return r.origin === mode; });
  const batches = DB.all('ImportBatches').filter(function (b) { return b.source === src && b.status === 'committed'; });
  const last = batches[batches.length - 1] || null;
  let available = !outage && mode !== 'api';
  let message = mode === 'mock' ? 'ใช้ข้อมูลจำลองเพื่อทดสอบ — ไม่ใช่ข้อมูลจริงจาก ' + src
    : mode === 'import' ? (last ? 'ใช้ข้อมูลที่นำเข้าเมื่อ ' + last.committedAt + ' (ไม่ได้ดึงสดจาก ' + src + ')' : 'ยังไม่มีข้อมูลนำเข้า')
      : 'ยังไม่ได้เชื่อมต่อ API ของ ' + src;
  if (outage) message = 'จำลองสถานการณ์ระบบต้นทางขัดข้อง (ตั้งค่าโดยผู้ดูแล)';
  return {
    source: src, label: SOURCES[src].label, desc: SOURCES[src].desc, mode: mode, modeLabel: SOURCE_MODES[mode],
    connected: false, connectedLabel: 'ยังไม่ได้เชื่อมต่อระบบจริง', available: available, outage: outage, message: message,
    records: rows.length, lastImport: last ? { at: last.committedAt, fileName: last.fileName, sourceUpdatedAt: last.sourceUpdatedAt, rows: last.validCount } : null
  };
}

function sourceRows_(src) {
  const mode = sourceReady_(src);
  return DB.all(SOURCES[src].table).filter(function (r) { return r.origin === mode; });
}

/** MUHR: หาบุคคลจากรหัสบุคลากร (คืน null ถ้าไม่พบ) */
function muhrByCode_(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  return sourceRows_('MUHR').filter(function (p) { return String(p.staffCode).toUpperCase() === c; })[0] || null;
}

/** MUREX: ผลงานของบุคคลตามรหัสบุคลากร */
function murexWorksFor_(code) {
  const c = String(code || '').trim().toUpperCase();
  return sourceRows_('MUREX').filter(function (w) { return String(w.staffCode).toUpperCase() === c; });
}

/** ข้อมูลเก่าเกินกำหนดหรือไม่ (ดูทั้งวันที่ดึงข้อมูล และวันที่ต้นทางปรับปรุงล่าสุด) */
function staleInfo_(rec) {
  const days = Number(setting_('STALE_DAYS')) || 180;
  const ref = rec.sourceUpdatedAt || rec.fetchedAt;
  const age = ref ? daysBetween_(ref) : null;
  return { stale: age === null ? true : age > days, ageDays: age === null ? null : Math.floor(age), limit: days, basis: rec.sourceUpdatedAt ? 'sourceUpdatedAt' : 'fetchedAt' };
}

/* ---------------- นำเข้า CSV (ตรวจทานก่อนบันทึก) ---------------- */

function parseCsv_(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
  return rows;
}

const LABEL_TO_CODE_ = function (map, v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (map[s]) return s;
  const k = Object.keys(map).filter(function (x) { return map[x] === s; })[0];
  return k || null;
};

function normYear_(y) {
  const n = Number(String(y || '').trim());
  if (!n) return null;
  if (n > 2400) return n - 543;
  return n;
}

function validDateText_(v) {
  if (!v) return true;
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) && !isNaN(new Date(String(v).slice(0, 10)));
}

function validateImportRow_(src, o) {
  const errs = [];
  const cols = IMPORT_COLUMNS[src];
  cols.required.forEach(function (c) { if (!String(o[c] || '').trim()) errs.push('ไม่มีค่า ' + c); });
  if (o.staffCode && !/^[A-Za-z0-9._\-]{2,30}$/.test(o.staffCode)) errs.push('รูปแบบ staffCode ไม่ถูกต้อง');
  if (!validDateText_(o.sourceUpdatedAt)) errs.push('sourceUpdatedAt ต้องเป็นรูปแบบ YYYY-MM-DD');
  if (src === 'MUHR') {
    [['academicRank', RANKS], ['highestDegree', DEGREES], ['employmentStatus', EMP_STATUS]].forEach(function (x) {
      const code = LABEL_TO_CODE_(x[1], o[x[0]]);
      if (code === null) errs.push(x[0] + ' ไม่รู้จักค่า "' + o[x[0]] + '"'); else o[x[0]] = code;
    });
  } else {
    const y = normYear_(o.year);
    if (!y || y < 1900 || y > new Date().getFullYear() + 1) errs.push('ปีไม่ถูกต้อง'); else o.year = String(y);
    const t = LABEL_TO_CODE_(WORK_TYPES, o.type);
    if (t === null) errs.push('type ไม่รู้จักค่า "' + o.type + '"'); else o.type = t || 'other';
    if (o.doi) { o.doi = normDoi_(o.doi); if (!/^10\.\d{4,9}\/\S+$/.test(o.doi)) errs.push('DOI ไม่ถูกต้อง'); }
    if (!validDateText_(o.pubDate)) errs.push('pubDate ต้องเป็นรูปแบบ YYYY-MM-DD');
  }
  Object.keys(o).forEach(function (k) { if (String(o[k]).length > 1000) errs.push(k + ' ยาวเกินไป'); });
  return errs;
}

function importKey_(src, o) {
  if (src === 'MUHR') return String(o.staffCode).toUpperCase();
  return String(o.staffCode).toUpperCase() + '|' + (o.workRef ? 'ref:' + o.workRef : o.doi ? 'doi:' + normDoi_(o.doi) : 't:' + normTitle_(o.title) + ':' + o.year);
}

/** ขั้นที่ 1: อ่านไฟล์ ตรวจ และเก็บเป็น "ชุดรอตรวจทาน" — ยังไม่เขียนลงข้อมูลที่ระบบใช้ */
function importPreview_(p) {
  requirePerm_('admin.data');
  const src = String(p.source || '');
  if (!SOURCES[src]) throw new Error('ไม่รู้จักแหล่งข้อมูล');
  const text = String(p.csv || '');
  if (!text.trim()) throw new Error('ไฟล์ว่างเปล่า');
  if (text.length > 3 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 3 MB — แบ่งไฟล์แล้วนำเข้าทีละส่วน');
  const fileName = clean_(p.fileName, 120);
  if (fileName && !/\.csv$/i.test(fileName)) throw new Error('รับเฉพาะไฟล์ .csv');
  if (!validDateText_(p.sourceUpdatedAt)) throw new Error('วันที่ข้อมูลต้นทางต้องเป็นรูปแบบ YYYY-MM-DD');
  const rows = parseCsv_(text);
  if (rows.length < 2) throw new Error('ต้องมีแถวหัวคอลัมน์และข้อมูลอย่างน้อย 1 แถว');
  if (rows.length > 5001) throw new Error('นำเข้าได้ครั้งละไม่เกิน 5,000 แถว');
  const header = rows[0].map(function (h) { return h.trim(); });
  const cols = IMPORT_COLUMNS[src];
  const known = cols.required.concat(cols.optional);
  const missing = cols.required.filter(function (c) { return header.indexOf(c) === -1; });
  if (missing.length) throw new Error('ไม่มีคอลัมน์ที่จำเป็น: ' + missing.join(', ') + ' (แถวแรกต้องเป็นชื่อคอลัมน์)');
  const unknown = header.filter(function (h) { return h && known.indexOf(h) === -1; });

  const existing = {};
  DB.all(SOURCES[src].table).filter(function (r) { return r.origin === 'import'; }).forEach(function (r) { existing[importKey_(src, r)] = r; });
  const seen = {};
  let valid = 0, bad = 0;
  const out = rows.slice(1).map(function (r, i) {
    const o = {};
    header.forEach(function (h, j) { if (known.indexOf(h) > -1) o[h] = clean_(r[j], 1000); });
    const errs = validateImportRow_(src, o);
    let action = 'new';
    if (!errs.length) {
      const k = importKey_(src, o);
      if (seen[k]) errs.push('ซ้ำกับแถวที่ ' + seen[k] + ' ในไฟล์เดียวกัน');
      seen[k] = i + 2;
      if (existing[k]) action = 'update';
    }
    if (errs.length) { bad++; action = 'skip'; } else valid++;
    return { rowNo: i + 2, data: o, errors: errs, action: action };
  });
  const batch = DB.insert('ImportBatches', {
    source: src, fileName: fileName, status: 'preview', rowCount: out.length, validCount: valid, errorCount: bad,
    sourceUpdatedAt: clean_(p.sourceUpdatedAt, 10), note: clean_(p.note, 300), createdBy: me_().id
  });
  DB.insertMany('ImportRows', out.map(function (r) {
    return { batchId: batch.id, rowNo: r.rowNo, data: JSON.stringify(r.data), errors: r.errors.join('; '), action: r.action };
  }));
  audit_('import.preview', 'ImportBatches', batch.id, { source: src, rows: out.length }, '');
  return importBatchView_(batch.id, unknown);
}

function importBatchView_(id, unknownCols) {
  const b = DB.get('ImportBatches', id);
  if (!b) throw new Error('ไม่พบชุดนำเข้า');
  const rows = DB.all('ImportRows').filter(function (r) { return r.batchId === id; });
  const count = function (a) { return rows.filter(function (r) { return r.action === a; }).length; };
  return {
    batch: b, unknownColumns: unknownCols || [],
    summary: { total: rows.length, new: count('new'), update: count('update'), skip: count('skip') },
    rows: rows.slice(0, 300).map(function (r) { return { rowNo: r.rowNo, data: parseJson_(r.data, {}), errors: r.errors, action: r.action }; }),
    truncated: rows.length > 300
  };
}

/** ขั้นที่ 2: ผู้ดูแลตรวจทานแล้วกดยืนยัน — เขียนเฉพาะแถวที่ผ่านการตรวจ */
function importCommit_(p) {
  requirePerm_('admin.data');
  const b = DB.get('ImportBatches', p.batchId);
  if (!b || b.status !== 'preview') throw new Error('ชุดนำเข้านี้ไม่อยู่ในสถานะรอตรวจทาน');
  const src = b.source;
  const table = SOURCES[src].table;
  const rows = DB.all('ImportRows').filter(function (r) { return r.batchId === b.id && r.action !== 'skip'; });
  const existing = {};
  DB.all(table).filter(function (r) { return r.origin === 'import'; }).forEach(function (r) { existing[importKey_(src, r)] = r; });
  const now = nowIso_();
  const replaceIds = {};
  const recs = rows.map(function (r) {
    const o = parseJson_(r.data, {});
    const old = existing[importKey_(src, o)];
    if (old) replaceIds[old.id] = true;
    return Object.assign({}, o, {
      id: old ? old.id : undefined, origin: 'import', importBatchId: b.id, fetchedAt: now,
      sourceUpdatedAt: o.sourceUpdatedAt || b.sourceUpdatedAt || '', createdAt: old ? old.createdAt : now
    });
  });
  DB.removeWhere(table, function (r) { return replaceIds[r.id]; });
  DB.insertMany(table, recs);
  DB.update('ImportBatches', b.id, { status: 'committed', committedBy: me_().id, committedAt: now });
  audit_('import.commit', 'ImportBatches', b.id, { source: src, rows: recs.length }, '');
  return { batchId: b.id, written: recs.length };
}

function importDiscard_(p) {
  requirePerm_('admin.data');
  const b = DB.get('ImportBatches', p.batchId);
  if (!b || b.status !== 'preview') throw new Error('ชุดนำเข้านี้ไม่อยู่ในสถานะรอตรวจทาน');
  DB.removeWhere('ImportRows', function (r) { return r.batchId === b.id; });
  DB.update('ImportBatches', b.id, { status: 'discarded' });
  audit_('import.discard', 'ImportBatches', b.id, { status: 'discarded' }, '');
  return true;
}

/* ---------------- จุดต่อ API จริง (ยังไม่ได้ทำ) ----------------
 * เมื่อได้ข้อกำหนดจากเจ้าของระบบ MUHR/MUREX ให้เขียนฟังก์ชันด้านล่าง แล้วให้ sourceRows_ เรียกใช้เมื่อโหมดเป็น api
 * กุญแจ/รหัสต้องเก็บใน Script Properties เช่น MUHR_API_TOKEN — ห้ามใส่ในโค้ด
 */
function fetchPersonsApi_() { throw sourceError_('MUHR', 'not_connected', 'ยังไม่ได้พัฒนาการเชื่อมต่อ API ของ MUHR'); }
function fetchWorksApi_() { throw sourceError_('MUREX', 'not_connected', 'ยังไม่ได้พัฒนาการเชื่อมต่อ API ของ MUREX'); }
