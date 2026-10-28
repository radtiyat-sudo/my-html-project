// รวมโค้ดใน review-src/ เป็น 3 ไฟล์พร้อมวางใน Apps Script: review/Code.gs, review/Index.html, review/appsscript.json
// และสร้างหน้าตัวอย่าง dev/preview-review/index.html (รันโค้ดเซิร์ฟเวอร์จริงในเบราว์เซอร์ผ่าน gas-mock.js)
// ใช้: node dev/build-review-bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (dir, f) => readFileSync(join(root, dir, f), 'utf8');
// ไฟล์จาก src/ (โค้ดค้นฐานข้อมูลวิชาการของ MUGR) ใช้ร่วมกัน ระบุด้วย ../src/
const ORDER = ['Config', 'Db', 'Auth', 'Connectors', 'ApiConnector', 'Matching', 'Scholar', '../src/Discovery', '../src/Sources', 'Criteria', 'Workflow', 'Files', 'Reports', 'Admin', 'Api', 'Code'];
const bar = '='.repeat(70);

const code = `/**
 * ${bar}
 *  ระบบตรวจสอบผลงานทางวิชาการและคุณสมบัติอาจารย์/กรรมการ
 *  ไฟล์: Code.gs  (วางทั้งไฟล์นี้ใน Apps Script ไฟล์ชื่อ "Code")
 *
 *  ส่วนต่าง ๆ ในไฟล์นี้: ${ORDER.map((f, i) => (i + 1) + '. ' + f.replace('../src/', '')).join('  ')}
 *
 *  หลังวางครบ 3 ไฟล์ (Code.gs, Index.html, appsscript.json):
 *  เลือกฟังก์ชัน setup → กด ▶ เรียกใช้ → อนุญาตสิทธิ์ → Deploy เป็นเว็บแอป
 *  ห้ามใส่รหัสผ่าน/กุญแจเชื่อมต่อในไฟล์นี้ — ใช้ Script Properties เท่านั้น
 * ${bar}
 */

` + ORDER.map(f => `/* ${bar}\n * ส่วน: ${f.replace('../src/', '')}.gs${f.startsWith('../') ? ' (ใช้ร่วมกับระบบ MUGR)' : ''}\n * ${bar} */\n\n${rd('review-src', f + '.gs').trim()}\n`).join('\n\n');

function appLoader(html) {
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const parts = Buffer.from(js, 'utf8').toString('base64').match(/.{1,1000}/g).map(x => '"' + x + '"').join(',\n');
  return `<script>
  /* app script, base64-encoded so Apps Script cannot alter it */
  (function () {
    var p = [
${parts}
    ];
    var bin = atob(p.join(''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var el = document.createElement('script');
    el.text = new TextDecoder('utf-8').decode(bytes) + '\\n//# sourceURL=rv-app.js';
    document.body.appendChild(el);
  })();
  </script>`;
}

const styles = s => s
  .replace(/<\?!= include\('Styles'\) \?>/, () => rd('src', 'Styles.html').trim())
  .replace(/<\?!= include\('ReviewStyles'\) \?>/, () => rd('review-src', 'ReviewStyles.html').trim());
const app = rd('review-src', 'App.html');
const index = styles(rd('review-src', 'Index.html')).replace(/<\?!= include\('App'\) \?>/, () => appLoader(app));
if (/include\(/.test(index)) throw new Error('unresolved include in Index.html');
for (const [name, text] of [['Index.html', index], ['Code.gs', code]]) {
  const bad = [...text].filter(ch => ch.codePointAt(0) > 0xFFFF);
  if (bad.length) throw new Error(name + ' contains emoji/4-byte characters: ' + [...new Set(bad)].join(' '));
}
const manifest = {
  timeZone: 'Asia/Bangkok', dependencies: {}, exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8',
  oauthScopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/script.external_request'],
  webapp: { executeAs: 'USER_DEPLOYING', access: 'DOMAIN' }
};
mkdirSync(join(root, 'review'), { recursive: true });
writeFileSync(join(root, 'review', 'Code.gs'), code);
writeFileSync(join(root, 'review', 'Index.html'), index.replace('<head>', '<head>\n  <!-- ระบบตรวจสอบผลงานและคุณสมบัติ — ไฟล์: Index.html (วางทั้งไฟล์ในไฟล์ HTML ชื่อ "Index") -->'));
writeFileSync(join(root, 'review', 'appsscript.json'), JSON.stringify(manifest, null, 2) + '\n');

// ---- หน้าตัวอย่าง (ข้อมูลอยู่ในหน่วยความจำ เริ่มใหม่ทุกครั้งที่โหลด) ----
const services = ['SpreadsheetApp', 'PropertiesService', 'Session', 'LockService', 'Utilities', 'DriveApp', 'Logger', 'HtmlService', 'ScriptApp', 'CacheService', 'UrlFetchApp'];
const harness = `<script>${rd('dev', 'gas-mock.js')}</script><script>
const __q = new URLSearchParams(location.search);
const __opts = { email: 'owner@mahidol.ac.th', reset: true };
const __gas = createGasMock(__opts);
__gas.Logger = { log: function () {} };
const __server = (function (${services.join(', ')}) {
${code}
return { api: api, setup: setup };
})(${services.map(s => '__gas.' + s).join(', ')});
__server.setup();
if (__q.has('key')) __gas.PropertiesService.getScriptProperties().setProperty('SCOPUS_API_KEY', 'demo'); // ?key = จำลองว่ามี Scopus API key
if (__q.get('email')) __opts.email = __q.get('email'); // ?email=... จำลองผู้ใช้อื่นที่ยังไม่ได้ลงทะเบียน
window.google = { script: { run: (function mk(ok, fail) { return new Proxy({}, { get(_, prop) {
  if (prop === 'withSuccessHandler') return h => mk(h, fail); if (prop === 'withFailureHandler') return h => mk(ok, h);
  return (...a) => setTimeout(() => { try { ok && ok(JSON.parse(JSON.stringify(__server[prop](...a)))); } catch (e) { console.error(e); fail && fail(e); } }, 30);
} }); })(null, null) } };
</script>`;
const preview = styles(rd('review-src', 'Index.html')).replace(/<\?= appName \?>/g, 'ระบบตรวจสอบผลงานและคุณสมบัติ')
  .replace(/<\?!= include\('App'\) \?>/, () => harness + '\n' + app);
mkdirSync(join(root, 'dev', 'preview-review'), { recursive: true });
writeFileSync(join(root, 'dev', 'preview-review', 'index.html'), preview);
console.log('review/Code.gs', code.length, '| review/Index.html', index.length, '| preview', preview.length);
