// สร้างเว็บแอป "ตรวจผลงานอัตโนมัติ" แบบสาธารณะ เป็น 3 ไฟล์พร้อมวาง: checker/Code.gs, checker/Index.html, checker/appsscript.json
// และไฟล์ตัวอย่าง dev/preview-checker/index.html (รันโค้ดเซิร์ฟเวอร์จริงบนตัวจำลอง)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (...p) => readFileSync(join(root, ...p), 'utf8');
const GS = [['src', 'Config.gs'], ['src', 'Database.gs'], ['src', 'Logic.gs'], ['src', 'Discovery.gs'], ['src', 'Sources.gs'], ['checker-src', 'CheckerMain.gs']];
const bar = '='.repeat(70);
const code = `/**
 * ${bar}
 *  ระบบตรวจผลงานวิชาการอัตโนมัติ (เว็บสาธารณะ) — ไฟล์: Code.gs
 *  วางทั้งไฟล์ใน Apps Script ไฟล์ชื่อ "Code" แล้วรัน setup() เพื่อสร้างชีตและดูรหัสผู้ดูแล
 *  Deploy: ดำเนินการในฐานะ "ฉัน" · ผู้มีสิทธิ์เข้าถึง "ทุกคน"
 * ${bar}
 */

` + GS.map(([d, f]) => `/* ${bar}\n * ส่วน: ${f}\n * ${bar} */\n\n${rd(d, f).trim()}\n`).join('\n\n');

function appLoader(html) {
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const parts = Buffer.from(js, 'utf8').toString('base64').match(/.{1,1000}/g).map(x => '"' + x + '"').join(',\n');
  return `<script>
  /* MUGR checker script, base64-encoded so Apps Script cannot alter it */
  (function () {
    var p = [
${parts}
    ];
    var bin = atob(p.join(''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var el = document.createElement('script');
    el.text = new TextDecoder('utf-8').decode(bytes) + '\\n//# sourceURL=mugr-checker.js';
    document.body.appendChild(el);
  })();
  </script>`;
}
const app = rd('checker-src', 'App.html');
const index = rd('checker-src', 'Index.html')
  .replace(/<\?!= include\('Styles'\) \?>/, () => rd('src', 'Styles.html').trim())
  .replace(/<\?!= include\('App'\) \?>/, () => appLoader(app));
for (const [name, text] of [['Index.html', index], ['Code.gs', code]]) {
  const bad = [...text].filter(ch => ch.codePointAt(0) > 0xFFFF);
  if (bad.length) throw new Error(name + ' contains 4-byte characters: ' + [...new Set(bad)].join(' '));
}
const manifest = {
  timeZone: 'Asia/Bangkok', dependencies: {}, exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8',
  oauthScopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/script.external_request', 'https://www.googleapis.com/auth/userinfo.email'],
  webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }
};
mkdirSync(join(root, 'checker'), { recursive: true });
writeFileSync(join(root, 'checker', 'Code.gs'), code);
writeFileSync(join(root, 'checker', 'Index.html'), index.replace('<head>', '<head>\n  <!-- ระบบตรวจผลงานอัตโนมัติ — ไฟล์: Index.html (วางทั้งไฟล์ในไฟล์ HTML ชื่อ "Index") -->'));
writeFileSync(join(root, 'checker', 'appsscript.json'), JSON.stringify(manifest, null, 2) + '\n');

// ---- preview ----
const services = ['SpreadsheetApp', 'PropertiesService', 'Session', 'LockService', 'Utilities', 'DriveApp', 'Logger', 'HtmlService', 'ScriptApp', 'CacheService', 'UrlFetchApp'];
const harness = `<script>${rd('dev', 'gas-mock.js')}</script><script>
const __q = new URLSearchParams(location.search);
const __gas = createGasMock({ email: '', reset: true });
const __server = (function (${services.join(', ')}) {
${code}
return { checkerApi: checkerApi, setup: setup, importJournalIndex_: importJournalIndex_, setAdmin: function (v) { CHECKER_ADMIN_ = v; } };
})(${services.map(s => '__gas.' + s).join(', ')});
__server.setup();
if (__q.has('seed')) { __server.setAdmin(true); __server.importJournalIndex_({ database: 'scopus', source: 'SJR (ตัวอย่าง)', rows: [{ title: 'Asian Population Studies', issns: ['1744-1730'], quartile: 'Q2' }, { title: 'Ageing and Society', issns: ['0144-686X'], quartile: 'Q1' }, { title: 'JPSS', issns: ['2465-4418'], quartile: 'Q3' }] });
  __server.importJournalIndex_({ database: 'tci2', source: 'TCI 2 (ตัวอย่าง)', rows: [{ title: 'Thai J Soc Sci', issns: ['1686-1574'] }] }); __server.setAdmin(false); }
if (__q.has('key')) __gas.PropertiesService.getScriptProperties().setProperty('SCOPUS_API_KEY', 'demo');
window.__passcode = __gas.PropertiesService.getScriptProperties().getProperty('ADMIN_PASSCODE');
window.google = { script: { run: (function mk(ok, fail) { return new Proxy({}, { get(_, prop) {
  if (prop === 'withSuccessHandler') return h => mk(h, fail); if (prop === 'withFailureHandler') return h => mk(ok, h);
  return (...a) => setTimeout(() => { try { ok && ok(JSON.parse(JSON.stringify(__server[prop](...a)))); } catch (e) { console.error(e); fail && fail(e); } }, 30);
} }); })(null, null) } };
</script>`;
mkdirSync(join(root, 'dev', 'preview-checker'), { recursive: true });
writeFileSync(join(root, 'dev', 'preview-checker', 'index.html'), index.replace(/<\?= appName \?>/g, 'ระบบตรวจผลงานวิชาการอัตโนมัติ').replace('<body>', () => '<body>' + harness));
console.log('checker/Code.gs', code.length, '| checker/Index.html', index.length);
