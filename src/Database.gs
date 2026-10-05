/**
 * Database.gs — ชั้นจัดการข้อมูลบน Google Sheets (1 ชีต = 1 ตาราง, แถวแรกเป็นหัวคอลัมน์)
 */

let SS_ = null;
const TABLE_CACHE_ = {};

/** คืนค่า Spreadsheet ที่ใช้เก็บข้อมูล (ผูกกับสคริปต์ หรือสร้างใหม่และจำ ID ไว้) */
function getDb_() {
  if (SS_) return SS_;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DB_ID');
  if (id) {
    try { SS_ = SpreadsheetApp.openById(id); return SS_; } catch (e) { /* ไฟล์ถูกลบ → สร้างใหม่ */ }
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  SS_ = active || SpreadsheetApp.create(APP.dbName);
  props.setProperty('DB_ID', SS_.getId());
  return SS_;
}

/** สร้างชีตและหัวคอลัมน์ที่ขาด (ทำครั้งเดียวต่อ schemaVersion) */
function ensureSchema_(force) {
  const props = PropertiesService.getScriptProperties();
  const key = 'SCHEMA_' + getDb_().getId();
  if (!force && props.getProperty(key) === String(APP.schemaVersion)) return;
  const ss = getDb_();
  Object.keys(TABLES).forEach(function (name) {
    const cols = TABLES[name];
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), Math.max(sh.getMaxColumns(), cols.length)).setNumberFormat('@');
    }
    const lastCol = sh.getLastColumn();
    const header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const missing = cols.filter(function (c) { return header.indexOf(c) === -1; });
    if (missing.length) {
      const start = header.filter(String).length + 1;
      sh.getRange(1, start, 1, missing.length).setValues([missing]);
      sh.getRange(1, 1, 1, start + missing.length - 1).setFontWeight('bold').setBackground('#e8edf8');
      sh.setFrozenRows(1);
    }
  });
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  props.setProperty(key, String(APP.schemaVersion));
}

function sheet_(name) {
  const sh = getDb_().getSheetByName(name);
  if (!sh) { ensureSchema_(true); return getDb_().getSheetByName(name); }
  return sh;
}

function cellOut_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss");
  return v;
}

function cellIn_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.join(',');
  return String(v);
}

const DB = {
  /** อ่านทั้งตาราง → [{...}] พร้อม _row (เลขแถวในชีต) */
  read_: function (name) {
    if (TABLE_CACHE_[name]) return TABLE_CACHE_[name];
    const sh = sheet_(name);
    const values = sh.getDataRange().getValues();
    const header = (values[0] || []).map(String);
    const rows = [];
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (r.every(function (c) { return c === '' || c === null; })) continue;
      const o = { _row: i + 1 };
      header.forEach(function (h, j) { if (h) o[h] = cellOut_(r[j]); });
      rows.push(o);
    }
    TABLE_CACHE_[name] = { header: header, rows: rows };
    return TABLE_CACHE_[name];
  },

  invalidate_: function (name) { delete TABLE_CACHE_[name]; },

  all: function (name) {
    return this.read_(name).rows.map(function (r) {
      const o = Object.assign({}, r); delete o._row; return o;
    });
  },

  get: function (name, id) {
    return this.all(name).filter(function (r) { return String(r.id) === String(id); })[0] || null;
  },

  insert: function (name, obj) {
    const t = this.read_(name);
    const rec = Object.assign({}, obj);
    if (TABLES[name][0] === 'id' && !rec.id) rec.id = newId_(name);
    if (TABLES[name].indexOf('createdAt') > -1 && !rec.createdAt) rec.createdAt = nowIso_();
    sheet_(name).appendRow(t.header.map(function (h) { return cellIn_(rec[h]); }));
    this.invalidate_(name);
    return rec;
  },

  /** เพิ่มหลายแถวพร้อมกัน (เร็วกว่า appendRow ทีละแถว) */
  insertMany: function (name, list) {
    if (!list.length) return [];
    const t = this.read_(name);
    const sh = sheet_(name);
    const recs = list.map(function (obj) {
      const rec = Object.assign({}, obj);
      if (TABLES[name][0] === 'id' && !rec.id) rec.id = newId_(name);
      if (TABLES[name].indexOf('createdAt') > -1 && !rec.createdAt) rec.createdAt = nowIso_();
      return rec;
    });
    const start = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(start, 1, recs.length, t.header.length)
      .setValues(recs.map(function (rec) { return t.header.map(function (h) { return cellIn_(rec[h]); }); }));
    this.invalidate_(name);
    return recs;
  },

  update: function (name, id, patch) {
    const t = this.read_(name);
    const row = t.rows.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) throw new Error('ไม่พบข้อมูล (' + name + ' ' + id + ')');
    const rec = Object.assign({}, row, patch, { id: row.id });
    if (TABLES[name].indexOf('updatedAt') > -1) rec.updatedAt = nowIso_();
    sheet_(name).getRange(row._row, 1, 1, t.header.length)
      .setValues([t.header.map(function (h) { return cellIn_(rec[h]); })]);
    this.invalidate_(name);
    delete rec._row;
    return rec;
  },

  remove: function (name, id) {
    const row = this.read_(name).rows.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return false;
    sheet_(name).deleteRow(row._row);
    this.invalidate_(name);
    return true;
  },

  /** ลบทุกแถวที่ pred คืนค่า true (เขียนทับทั้งตารางครั้งเดียว) */
  removeWhere: function (name, pred) {
    const t = this.read_(name);
    const keep = t.rows.filter(function (r) { return !pred(r); });
    const removed = t.rows.length - keep.length;
    if (!removed) return 0;
    const sh = sheet_(name);
    const width = t.header.length;
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent();
    if (keep.length) {
      sh.getRange(2, 1, keep.length, width)
        .setValues(keep.map(function (r) { return t.header.map(function (h) { return cellIn_(r[h]); }); }));
    }
    this.invalidate_(name);
    return removed;
  }
};

/* ---------------- Settings ---------------- */

function getSettings_() {
  const s = Object.assign({}, DEFAULT_SETTINGS);
  DB.all('Settings').forEach(function (r) { if (r.key) s[r.key] = String(r.value); });
  return s;
}

function setSettings_(patch) {
  const t = DB.read_('Settings');
  const sh = sheet_('Settings');
  Object.keys(patch).forEach(function (k) {
    const row = t.rows.filter(function (r) { return r.key === k; })[0];
    if (row) sh.getRange(row._row, 2).setValue(cellIn_(patch[k]));
    else sh.appendRow([k, cellIn_(patch[k])]);
  });
  DB.invalidate_('Settings');
}

/* ---------------- Audit ---------------- */

function audit_(action, detail) {
  try {
    const u = typeof CURRENT_USER_ !== 'undefined' && CURRENT_USER_ ? CURRENT_USER_.email : '';
    sheet_('Audit').appendRow([nowIso_(), u, action, String(detail || '').slice(0, 500)]);
    DB.invalidate_('Audit');
  } catch (e) { /* ไม่ให้การบันทึก log ทำให้งานหลักล้ม */ }
}

/* ---------------- Utils ---------------- */

function newId_(name) {
  return (ID_PREFIX[name] || 'R') + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss");
}

function toBool_(v) { return v === true || String(v).toLowerCase() === 'true' || v === 1 || v === '1'; }

function splitIds_(v) {
  return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(String);
}
