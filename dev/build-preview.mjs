// สร้างไฟล์ตัวอย่าง dev/preview/index.html ที่รันโค้ดเซิร์ฟเวอร์ (.gs) จริงในเบราว์เซอร์ผ่าน gas-mock.js
// ใช้: node dev/build-preview.mjs  แล้วเปิด dev/preview/index.html?seed  (เพิ่ม &reset เพื่อเริ่มใหม่)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = f => readFileSync(join(root, 'src', f), 'utf8');
const GS = ['Config.gs', 'Database.gs', 'Logic.gs', 'Auth.gs', 'Api.gs', 'Reports.gs', 'SampleData.gs', 'Discovery.gs', 'Code.gs'];
const server = GS.map(src).join('\n');
const services = ['SpreadsheetApp', 'PropertiesService', 'Session', 'LockService', 'Utilities', 'DriveApp', 'Logger', 'HtmlService', 'ScriptApp', 'CacheService', 'UrlFetchApp'];

const harness = `<script>${readFileSync(join(root, 'dev', 'gas-mock.js'), 'utf8')}</script>
<script>
const __q = new URLSearchParams(location.search);
const __gas = createGasMock({ email: __q.get('email') || 'admin@mahidol.ac.th', reset: __q.has('reset') });
const __server = (function (${services.join(', ')}) {
${server}
return { api: api };
})(${services.map(s => '__gas.' + s).join(', ')});
if (__q.has('seed')) { const r = __server.api('bootstrap', {}); if (r.ok && !r.model.faculty.length) __server.api('seedSample', {}); }
if (__q.get('role')) __server.api('setViewAs', { role: __q.get('role'), facultyId: __q.get('fac') || '' });
__gas.persist();
window.google = { script: { run: (function mk(ok, fail) {
  return new Proxy({}, { get(_, prop) {
    if (prop === 'withSuccessHandler') return h => mk(h, fail);
    if (prop === 'withFailureHandler') return h => mk(ok, h);
    return (...args) => setTimeout(() => {
      try { const r = JSON.parse(JSON.stringify(__server[prop](...args))); __gas.persist(); ok && ok(r); }
      catch (e) { console.error(e); fail && fail(e); }
    }, 40);
  } });
})(null, null) } };
</script>`;

let html = src('Index.html')
  .replace(/<\?= appName \?>/g, 'ระบบติดตามผลงานวิชาการ')
  .replace(/<\?!= include\('Styles'\) \?>/, () => src('Styles.html'))
  .replace(/<\?!= include\('App'\) \?>/, () => harness + '\n' + src('App.html'));
mkdirSync(join(root, 'dev', 'preview'), { recursive: true });
writeFileSync(join(root, 'dev', 'preview', 'index.html'), html);
console.log('wrote dev/preview/index.html (' + html.length + ' bytes)');
