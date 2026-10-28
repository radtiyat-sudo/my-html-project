// ทดสอบหน้าเว็บตั้งแต่เจ้าหน้าที่ตรวจ → ผู้พิจารณาตัดสิน → ปิดงาน → ผู้ยื่นได้รับแจ้ง
// ใช้: node dev/build-review-bundle.mjs && node dev/e2e-review.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const URL0 = pathToFileURL(process.cwd() + '/dev/preview-review/index.html').href;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.route(/fonts\./, r => r.abort());
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
const as = async (id, role) => { await p.evaluate(([a, r]) => { sessionStorage.setItem('rv-as', a); sessionStorage.setItem('rv-role', r); }, [id, role]); };
await p.goto(URL0); await p.waitForSelector('#nav a');
// สลับบัญชีผ่านเมนู "เปลี่ยนบัญชีทดสอบ" เพื่อใช้ข้อมูลในหน่วยความจำชุดเดียวกัน
async function become(id, role) {
  await as(id, role);
  await p.click('#user-chip'); await p.click('[data-switch]'); await p.waitForSelector('[data-acc]');
  await p.click(`[data-acc="${id}"]`); await p.waitForSelector('#nav a');
}
await become('UT-STAFF2', 'staff');
await p.click('[data-nav="requests"]'); await p.waitForSelector('tr[data-open]'); await p.click('tr[data-open]');
await p.click('[data-act="claim"]'); await p.waitForSelector('[data-act="forward"]');
await p.click('[data-tab="works"]'); await p.waitForSelector('[data-verify]');
await p.click('[data-verify]'); await p.waitForTimeout(500);
await p.click('#w-complete'); await p.fill('#m-reason', 'ตรวจกับ MUREX จำลองแล้ว'); await p.click('[data-ok]'); await p.waitForTimeout(500);
await p.click('[data-tab="results"]'); await p.waitForSelector('[data-sc]');
await p.click('[data-sc] >> nth=-1'); await p.check('input[name=scr][value=pass]'); await p.fill('#m-reason', 'ตรวจหนังสือรับรองแล้ว'); await p.click('[data-ok]'); await p.waitForTimeout(500);
await p.click('[data-act="forward"]'); await p.selectOption('#m-rev', 'UT-REV2'); await p.fill('#m-sum', 'ข้อมูลบุคคลเก่า ผู้พิจารณาโปรดดูข้อ R2'); await p.click('[data-ok]');
await p.waitForSelector('.badge:has-text("รอผู้พิจารณา")');
await become('UT-REV2', 'reviewer');
await p.click('[data-nav="requests"]'); await p.waitForSelector('tr[data-open]'); await p.click('tr[data-open]');
await p.waitForSelector('#decide-form');
await p.check('input[name=dec][value=approve]'); await p.fill('#dec-reason', 'ตรวจหลักฐานคุณวุฒิประกอบแล้ว (สาธิต)'); await p.click('#dec-save');
await p.waitForSelector('.badge:has-text("พิจารณาแล้ว")');
await p.screenshot({ path: 'docs/review-images/26-decision-recorded.png', fullPage: true });
await become('UT-STAFF2', 'staff');
await p.click('[data-nav="requests"]'); await p.waitForSelector('tr[data-open]'); await p.click('tr[data-open]');
await p.click('[data-act="close"]'); await p.click('[data-ok]'); await p.waitForSelector('.badge:has-text("ปิดงานแล้ว")');
await become('UT-REQ2', 'requester');
await p.click('[data-nav="notifications"]'); await p.waitForSelector('.timeline li');
const txt = await p.textContent('.timeline');
console.log(/อนุมัติ/.test(txt) ? 'requester notified' : 'NO NOTIFICATION: ' + txt);
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no page errors');
await b.close();
