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
  const pad = n => String(n).padStart(2, '0');
  const enc = new TextEncoder();
  return {
    persist,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, create: () => ss, getUi: () => { throw new Error('no ui'); } },
    PropertiesService: { getScriptProperties: () => props('script'), getUserProperties: () => props('user') },
    Session: { getActiveUser: () => ({ getEmail: () => opts.email }), getEffectiveUser: () => ({ getEmail: () => opts.email }), getScriptTimeZone: () => 'Asia/Bangkok' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()),
      formatDate: d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      base64Encode: bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); },
      newBlob: (content) => ({ getAs: () => { const blob = { setName: () => blob, getBytes: () => Array.from(enc.encode(content)) }; return blob; } })
    },
    DriveApp: { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: () => ({ getUrl: () => '' }) }) },
    Logger: { log: (...a) => console.log(...a) },
    HtmlService: {}, ScriptApp: { getService: () => ({ getUrl: () => location.href }) }
  };
}
