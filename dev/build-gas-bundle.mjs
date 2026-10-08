// รวมโค้ดใน src/ เป็น 3 ไฟล์พร้อมวางใน Apps Script: gas/Code.gs, gas/Index.html, gas/appsscript.json
// ใช้: node dev/build-gas-bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = f => readFileSync(join(root, 'src', f), 'utf8');
const GS = ['Config.gs', 'Database.gs', 'Logic.gs', 'Auth.gs', 'Api.gs', 'Reports.gs', 'SampleData.gs', 'Discovery.gs', 'Sources.gs', 'Code.gs'];
const bar = '='.repeat(70);

// สคริปต์หน้าเว็บถูกเข้ารหัส base64 (มีแต่ A-Z a-z 0-9 + / =) เพื่อไม่ให้ Apps Script แก้ไขเนื้อหา JavaScript
// ระหว่างส่งหน้าเว็บ แล้วถอดรหัสและรันในเบราว์เซอร์ — เลขบรรทัดของ error จะตรงกับ src/App.html
function appLoader(html) {
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const b64 = Buffer.from(js, 'utf8').toString('base64');
  const parts = b64.match(/.{1,1000}/g).map(x => '"' + x + '"').join(',\n');
  return `<script>
  /* MUGR app script, base64-encoded so Apps Script cannot alter it */
  (function () {
    var p = [
${parts}
    ];
    var bin = atob(p.join(''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var el = document.createElement('script');
    el.text = new TextDecoder('utf-8').decode(bytes) + '\\n//# sourceURL=mugr-app.js';
    document.body.appendChild(el);
  })();
  </script>`;
}


const code = `/**
 * ${bar}
 *  ระบบติดตามผลงานวิชาการ — บัณฑิตวิทยาลัย มหาวิทยาลัยมหิดล (MUGR)
 *  ไฟล์: Code.gs  (วางทั้งไฟล์นี้ใน Apps Script ไฟล์ชื่อ "Code")
 *
 *  ไฟล์นี้รวมโค้ดฝั่งเซิร์ฟเวอร์ทั้งหมดไว้ในไฟล์เดียว เรียงตามส่วน:
 *  ${GS.map((f, i) => (i + 1) + '. ' + f.replace('.gs', '')).join('  ')}
 *
 *  หลังวางครบ 3 ไฟล์ (Code.gs, Index.html, appsscript.json):
 *  เลือกฟังก์ชัน setup → กด ▶ เรียกใช้ → อนุญาตสิทธิ์ → Deploy เป็นเว็บแอป
 * ${bar}
 */

` + GS.map(f => `/* ${bar}\n * ส่วน: ${f}\n * ${bar} */\n\n${src(f).trim()}\n`).join('\n\n');

const index = src('Index.html')
  .replace(/<\?!= include\('Styles'\) \?>/, () => src('Styles.html').trim())
  .replace(/<\?!= include\('App'\) \?>/, () => appLoader(src('App.html')));
if (/include\(/.test(index)) throw new Error('unresolved include in Index.html');
// Apps Script ทำให้อักขระ 4 ไบต์ (อีโมจิ) ในหน้า HTML เสียหาย → JavaScript พัง — ห้ามมีในไฟล์ที่ส่งออก
for (const [name, text] of [['Index.html', index], ['Code.gs', code]]) {
  const bad = [...text].filter(ch => ch.codePointAt(0) > 0xFFFF);
  if (bad.length) throw new Error(name + ' contains emoji/4-byte characters: ' + [...new Set(bad)].join(' '));
}

mkdirSync(join(root, 'gas'), { recursive: true });
writeFileSync(join(root, 'gas', 'Code.gs'), code);
writeFileSync(join(root, 'gas', 'Index.html'), index.replace('<head>', '<head>\n  <!-- MUGR — ไฟล์: Index.html (วางทั้งไฟล์นี้ใน Apps Script ไฟล์ HTML ชื่อ "Index") -->'));
writeFileSync(join(root, 'gas', 'appsscript.json'), src('appsscript.json'));
console.log('gas/Code.gs', code.length, '| gas/Index.html', index.length);
