/**
 * Reports.gs — สร้างรายงาน (HTML → PDF) ส่งกลับให้ดาวน์โหลด และบันทึกสำเนาใน Google Drive (ถ้าเปิดใช้)
 *
 * ชนิดรายงาน (payload.type):
 *  - faculty     : สรุปผลงานอาจารย์ประจำหลักสูตร 5 ปีย้อนหลัง (ทุกหลักสูตร หรือระบุ curriculumId)
 *  - assessment  : ผลประเมินคุณภาพหลักสูตร ตัวบ่งชี้ 4.2 (ต้องระบุ curriculumId, year)
 *  - expert      : แบบตรวจสอบคุณสมบัติผู้ทรงคุณวุฒิภายนอก (ต้องระบุ expertId)
 *  - pubs        : ทะเบียนผลงานวิชาการ (กรองตามสถานะ)
 */

function exportReport_(p) {
  const u = currentUser_();
  const m = buildModel_(u);
  let title, body;
  if (p.type === 'assessment') {
    if (u.role === 'lecturer') throw new Error('คุณไม่มีสิทธิ์ออกรายงานนี้');
    const a = assessCurriculum_(m, p.curriculumId, p.year);
    title = 'รายงานผลการประเมินคุณภาพหลักสูตร ' + (a.curriculum.code || '') + ' ปี ' + a.year;
    body = reportAssessment_(a, m);
  } else if (p.type === 'expert') {
    const x = m.experts.filter(function (e) { return e.id === p.expertId; })[0];
    if (!x) throw new Error('ไม่พบข้อมูลผู้ทรงคุณวุฒิ');
    title = 'แบบตรวจสอบคุณสมบัติผู้ทรงคุณวุฒิภายนอก — ' + x.displayName;
    body = reportExpert_(x, m);
  } else if (p.type === 'pubs') {
    title = 'ทะเบียนผลงานวิชาการ รอบปี ' + m.window.start + '–' + m.window.end;
    body = reportPubs_(m, p.status);
  } else {
    const cs = m.curricula.filter(function (c) { return !p.curriculumId || c.id === p.curriculumId; });
    title = 'รายงานสรุปผลงานวิชาการอาจารย์ประจำหลักสูตร รอบปี ' + m.window.start + '–' + m.window.end;
    body = cs.map(function (c) { return reportFaculty_(c, m); }).join('<div class="pb"></div>') || '<p>ไม่มีข้อมูล</p>';
  }

  const html = reportShell_(title, body, m, u);
  const filename = (title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120)) + '.pdf';
  const out = { filename: filename, html: html, base64: '', url: '' };
  try {
    const pdf = Utilities.newBlob(html, 'text/html', 'report.html').getAs('application/pdf').setName(filename);
    out.base64 = Utilities.base64Encode(pdf.getBytes());
    if (toBool_(getSettings_().REPORT_TO_DRIVE)) out.url = saveToDrive_(pdf);
  } catch (e) {
    out.pdfError = e.message;
  }
  audit_('export_report', p.type + ' ' + (p.curriculumId || p.expertId || ''));
  return out;
}

function saveToDrive_(blob) {
  try {
    const it = DriveApp.getFoldersByName(APP.reportFolder);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder(APP.reportFolder);
    return folder.createFile(blob).getUrl();
  } catch (e) { return ''; }
}

function h_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function thaiDate_(d) {
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  d = d || new Date();
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

function badge_(ok, yes, no) {
  return '<span class="b ' + (ok ? 'ok' : 'no') + '">' + (ok ? (yes || 'ผ่าน') : (no || 'ไม่ผ่าน')) + '</span>';
}

function reportShell_(title, body, m, u) {
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + h_(title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<style>' +
    '@page{size:A4;margin:16mm 14mm}' +
    'body{font-family:"Sarabun","TH Sarabun New","Tahoma",sans-serif;font-size:12pt;color:#111;line-height:1.45;margin:0}' +
    '.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1e3a8a;padding-bottom:8px;margin-bottom:14px}' +
    '.org{font-size:11pt;color:#1e3a8a;font-weight:700}.sub{font-size:9.5pt;color:#555}' +
    'h1{font-size:16pt;margin:4px 0 2px}h2{font-size:13.5pt;margin:16px 0 6px;color:#1e3a8a}' +
    'table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:10.5pt}' +
    'th,td{border:1px solid #c7cede;padding:5px 6px;vertical-align:top;text-align:left}' +
    'th{background:#eef2fb;font-weight:700}td.n,th.n{text-align:right;white-space:nowrap}td.c,th.c{text-align:center}' +
    '.b{display:inline-block;padding:1px 8px;border-radius:10px;font-size:9.5pt;font-weight:700}' +
    '.ok{background:#dcfce7;color:#166534}.no{background:#fee2e2;color:#991b1b}.wa{background:#fef3c7;color:#92400e}' +
    '.box{border:1px solid #c7cede;border-radius:6px;padding:10px 12px;margin:8px 0}' +
    '.big{font-size:22pt;font-weight:700;color:#1e3a8a}' +
    '.muted{color:#666;font-size:9.5pt}.pb{page-break-after:always}' +
    '.sign{margin-top:36px;display:flex;justify-content:flex-end}.sign div{text-align:center;width:260px}' +
    '.foot{margin-top:18px;border-top:1px solid #ddd;padding-top:6px;font-size:8.5pt;color:#777}' +
    '</style></head><body>' +
    '<div class="head"><div><div class="org">' + h_(m.settings.ORG_NAME || APP.org) + '</div>' +
    '<h1>' + h_(title) + '</h1><div class="sub">' + h_(APP.name) + ' · ปีประเมิน ' + m.window.end + ' (รอบ ' + m.window.start + '–' + m.window.end + ')</div></div>' +
    '<div class="sub" style="text-align:right">ออกรายงานเมื่อ ' + thaiDate_() + '<br>โดย ' + h_(u.name) + '</div></div>' +
    body +
    '<div class="foot">อ้างอิง: ประกาศ ก.พ.อ. เรื่อง หลักเกณฑ์การพิจารณาวารสารทางวิชาการสำหรับการเผยแพร่ผลงานทางวิชาการ พ.ศ. 2562 · ' +
    'น้ำหนักคะแนนตามการตั้งค่าของระบบ ณ วันที่ออกรายงาน · นับเฉพาะผลงานที่ได้รับการตรวจรับรองแล้ว</div>' +
    '</body></html>';
}

function reportFaculty_(c, m) {
  const members = m.faculty.filter(function (f) { return c.eval.memberIds.indexOf(f.id) > -1; });
  let html = '<h2>' + h_((c.code ? c.code + ' ' : '') + c.nameTh) + '</h2>' +
    '<div class="muted">ระดับ' + h_((LEVELS[c.level] || {}).label || '') + ' · ' + h_((FACULTY_CRITERIA[c.criteriaYear] || {}).label || '') +
    ' · สถานะตามเกณฑ์มาตรฐาน: ' + badge_(c.eval.pass) + ' (ผ่าน ' + c.eval.qualifiedCount + '/' + c.eval.facultyCount + ' คน)</div>';
  html += '<table><tr><th class="c">#</th><th>ชื่อ-สกุล</th><th>ตำแหน่ง/คุณวุฒิ</th><th class="c">ผลงาน 5 ปี</th><th class="n">น้ำหนักรวม</th><th class="c">ใกล้หมดอายุ</th><th class="c">ผล</th></tr>';
  members.forEach(function (f, i) {
    html += '<tr><td class="c">' + (i + 1) + '</td><td>' + h_(f.displayName) + '</td><td>' + h_((POSITIONS[f.position] || { label: f.position }).label) + ' / ' + h_((DEGREES[f.degree] || {}).label || '') +
      '</td><td class="c">' + f.eval.count + '/' + f.eval.required + '</td><td class="n">' + f.eval.weightSum.toFixed(2) + '</td><td class="c">' + (f.eval.expiringCount || '-') +
      '</td><td class="c">' + badge_(f.eval.meets) + '</td></tr>';
  });
  html += '</table>';
  members.forEach(function (f) {
    const ps = m.publications.filter(function (p) { return p.personType === 'faculty' && p.personId === f.id && p.inWindow; })
      .sort(function (a, b) { return b.year - a.year; });
    if (!ps.length) return;
    html += '<div class="muted" style="margin-top:8px;font-weight:700;color:#111">' + h_(f.displayName) + '</div><table><tr><th>ผลงาน</th><th class="c">ปี</th><th>ฐานข้อมูล</th><th class="n">น้ำหนัก</th><th class="c">สถานะ</th></tr>';
    ps.forEach(function (p) {
      html += '<tr><td>' + h_(p.title) + '<div class="muted">' + h_(p.source) + '</div></td><td class="c">' + p.year + (p.expiring ? ' <span class="b wa">ใกล้หมดอายุ</span>' : '') +
        '</td><td>' + h_(p.basis) + '</td><td class="n">' + p.weight.toFixed(2) + '</td><td class="c">' + h_(PUB_STATUS[p.status] ? PUB_STATUS[p.status].label : p.status) + '</td></tr>';
    });
    html += '</table>';
  });
  return html;
}

function reportAssessment_(a, m) {
  let html = '<div class="box" style="display:flex;justify-content:space-between;align-items:center"><div><b>' + h_((a.curriculum.code ? a.curriculum.code + ' ' : '') + a.curriculum.nameTh) +
    '</b><div class="muted">ระดับ' + h_((LEVELS[a.curriculum.level] || {}).label) + ' · อาจารย์ประจำหลักสูตร ' + a.n + ' คน · ปีที่ประเมิน ' + a.year + '</div></div>' +
    '<div style="text-align:right"><div class="big">' + a.overall.toFixed(2) + '</div><div class="muted">คะแนนเฉลี่ยตัวบ่งชี้ 4.2 · ' + h_(a.level) + '</div></div></div>';
  html += '<h2>1. การกำกับมาตรฐาน (เกณฑ์มาตรฐานหลักสูตร)</h2><table><tr><th>เกณฑ์</th><th class="c">ผลการดำเนินงาน</th><th class="c">ผล</th></tr>';
  a.standard.forEach(function (s) { html += '<tr><td>' + h_(s.name) + '</td><td class="c">' + h_(s.value) + '</td><td class="c">' + badge_(s.ok) + '</td></tr>'; });
  html += '</table><h2>2. ตัวบ่งชี้ 4.2 คุณภาพอาจารย์</h2><table><tr><th class="c">ตัวบ่งชี้</th><th>รายการ</th><th class="n">ร้อยละ</th><th class="n">เป้า (=5)</th><th class="n">คะแนน</th></tr>';
  a.indicators.forEach(function (i) {
    html += '<tr><td class="c">' + i.code + '</td><td>' + h_(i.name) + '<div class="muted">' + h_(i.detail) + '</div></td><td class="n">' + i.value.toFixed(2) + '</td><td class="n">' + i.target + '</td><td class="n"><b>' + i.score.toFixed(2) + '</b></td></tr>';
  });
  html += '<tr><th colspan="4" class="n">คะแนนเฉลี่ย</th><th class="n">' + a.overall.toFixed(2) + '</th></tr></table>';
  if (a.breakdown.length) {
    html += '<h2>3. รายละเอียดผลงานถ่วงน้ำหนัก ปี ' + a.year + '</h2><table><tr><th>ระดับคุณภาพ</th><th class="n">น้ำหนัก</th><th class="n">จำนวน</th><th class="n">ผลรวม</th></tr>';
    a.breakdown.forEach(function (b) { html += '<tr><td>' + h_(b.basis) + '</td><td class="n">' + b.weight.toFixed(2) + '</td><td class="n">' + b.count + '</td><td class="n">' + (b.weight * b.count).toFixed(2) + '</td></tr>'; });
    html += '</table>';
  }
  html += '<h2>4. อาจารย์ประจำหลักสูตร</h2><table><tr><th>ชื่อ-สกุล</th><th>ตำแหน่ง</th><th>คุณวุฒิ</th><th class="c">ผลงานปี ' + a.year + '</th><th class="n">น้ำหนัก</th><th class="c">ผลงาน 5 ปี</th><th class="c">เกณฑ์</th></tr>';
  a.members.forEach(function (f) {
    html += '<tr><td>' + h_(f.name) + '</td><td>' + h_(f.position) + '</td><td>' + h_((DEGREES[f.degree] || {}).label || '') + '</td><td class="c">' + f.pubsYear + '</td><td class="n">' + f.weightYear.toFixed(2) + '</td><td class="c">' + f.count5 + '</td><td class="c">' + badge_(f.meets) + '</td></tr>';
  });
  html += '</table><div class="sign"><div>ลงชื่อ ......................................................<br>(......................................................)<br>ประธานหลักสูตร<br>วันที่ ........../........../..........</div></div>';
  return html;
}

function reportExpert_(x, m) {
  const ev = x.eval;
  const cy = ev.criteriaYear;
  let html = '<div class="box"><b>' + h_(x.displayName) + '</b> ' + (x.nameEn ? '<span class="muted">(' + h_(x.nameEn) + ')</span>' : '') +
    '<div class="muted">' + h_(x.affiliation) + ' · ' + h_(EXPERT_ROLES[x.roleType] || x.roleType || '') + ' · ระดับ' + h_((LEVELS[ev.level] || {}).label) + '</div>' +
    '<div style="margin-top:6px">ผลตามเกณฑ์ ' + cy + ' ที่หลักสูตรใช้: ' + badge_(ev.pass) + '</div></div>';
  html += '<h2>ผลการตรวจเทียบเกณฑ์ทุกปี</h2><table><tr><th>คุณสมบัติ</th>';
  Object.keys(ev.results).forEach(function (y) { html += '<th>เกณฑ์ ' + y + (y === cy ? ' ★' : '') + '</th>'; });
  html += '</tr><tr><td><b>คุณวุฒิ</b></td>';
  Object.keys(ev.results).forEach(function (y) { const r = ev.results[y]; html += '<td>' + badge_(r.qualOk) + ' ' + h_(r.qualText) + '</td>'; });
  html += '</tr><tr><td><b>ผลงานทางวิชาการ</b></td>';
  Object.keys(ev.results).forEach(function (y) { const r = ev.results[y]; html += '<td>' + badge_(r.workOk) + ' ' + h_(r.workText) + '<div class="muted">' + h_(r.workValue) + '</div></td>'; });
  html += '</tr><tr><td><b>สรุป</b></td>';
  Object.keys(ev.results).forEach(function (y) { html += '<td class="c">' + badge_(ev.results[y].pass) + '</td>'; });
  html += '</tr></table>';
  const ps = m.publications.filter(function (p) { return p.personType === 'expert' && p.personId === x.id; }).sort(function (a, b) { return b.year - a.year; });
  html += '<h2>ผลงานที่ตรวจพบ (' + ps.length + ') — นานาชาติ ' + ev.counts.intl + ' · ชาติ ' + ev.counts.nat + ' · ไม่นับ ' + ev.counts.notCounted + '</h2>';
  html += '<table><tr><th class="c">#</th><th>ผลงาน</th><th class="c">ปี</th><th>ฐานข้อมูล</th><th class="c">ยืนยัน</th></tr>';
  ps.forEach(function (p, i) {
    html += '<tr><td class="c">' + (i + 1) + '</td><td>' + h_(p.title) + '<div class="muted">' + h_(p.source) + '</div></td><td class="c">' + p.year + '</td><td>' + h_(p.basis) + '</td><td class="c">' + (p.status === 'verified' ? '✓' : 'รอยืนยัน') + '</td></tr>';
  });
  html += '</table>';
  if (x.checkResult) html += '<div class="box"><b>ผลการตรวจที่บันทึก:</b> ' + badge_(x.checkResult === 'pass') + '<div>' + h_(x.checkNote) + '</div><div class="muted">โดย ' + h_(x.checkedBy) + ' เมื่อ ' + h_(x.checkedAt) + '</div></div>';
  html += '<div class="sign"><div>ลงชื่อ ......................................................<br>(......................................................)<br>ผู้ตรวจสอบ<br>วันที่ ........../........../..........</div></div>';
  return html;
}

function reportPubs_(m, status) {
  const ps = m.publications.filter(function (p) { return p.personType === 'faculty' && (!status || p.status === status); })
    .sort(function (a, b) { return b.year - a.year || String(a.personName).localeCompare(String(b.personName)); });
  let html = '<table><tr><th class="c">#</th><th>เจ้าของผลงาน</th><th>ผลงาน</th><th class="c">ปี</th><th>ฐานข้อมูล</th><th class="n">น้ำหนัก</th><th class="c">สถานะ</th></tr>';
  ps.forEach(function (p, i) {
    html += '<tr><td class="c">' + (i + 1) + '</td><td>' + h_(p.personName) + '</td><td>' + h_(p.title) + '<div class="muted">' + h_(p.source) + '</div></td><td class="c">' + p.year +
      (p.expired ? ' <span class="b no">เกิน 5 ปี</span>' : p.expiring ? ' <span class="b wa">ใกล้หมดอายุ</span>' : '') + '</td><td>' + h_(p.basis) + '</td><td class="n">' + p.weight.toFixed(2) +
      '</td><td class="c">' + h_((PUB_STATUS[p.status] || {}).label || p.status) + '</td></tr>';
  });
  return html + '</table><div class="muted">รวม ' + ps.length + ' รายการ</div>';
}
