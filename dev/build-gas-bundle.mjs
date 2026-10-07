// รวมโค้ดใน src/ เป็น 3 ไฟล์พร้อมวางใน Apps Script: gas/Code.gs, gas/Index.html, gas/appsscript.json
// ใช้: node dev/build-gas-bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = f => readFileSync(join(root, 'src', f), 'utf8');
const GS = ['Config.gs', 'Database.gs', 'Logic.gs', 'Auth.gs', 'Api.gs', 'Reports.gs', 'SampleData.gs', 'Code.gs'];
const bar = '='.repeat(70);

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
  .replace(/<\?!= include\('App'\) \?>/, () => src('App.html').trim());
if (/include\(/.test(index)) throw new Error('unresolved include in Index.html');

mkdirSync(join(root, 'gas'), { recursive: true });
writeFileSync(join(root, 'gas', 'Code.gs'), code);
writeFileSync(join(root, 'gas', 'Index.html'), index.replace('<head>', '<head>\n  <!-- MUGR — ไฟล์: Index.html (วางทั้งไฟล์นี้ใน Apps Script ไฟล์ HTML ชื่อ "Index") -->'));
writeFileSync(join(root, 'gas', 'appsscript.json'), src('appsscript.json'));
console.log('gas/Code.gs', code.length, '| gas/Index.html', index.length);
