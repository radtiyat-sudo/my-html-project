/**
 * Reports.gs — รายงานงานคำขอ พร้อมนิยามการคำนวณ
 * ใช้เฉพาะข้อมูลในระบบ (StatusHistory, Requests, RevisionItems) — ไม่แสดงตัวเลขประหยัดเวลา/ค่าใช้จ่ายที่ไม่มีข้อมูลรองรับ
 */

const REPORT_DEFINITIONS = [
  { key: 'count', label: 'จำนวนคำขอ', def: 'นับคำขอที่สร้างในช่วงวันที่เลือก (ตาม createdAt) แยกตามสถานะปัจจุบัน ไม่รวมร่างที่ยังไม่เคยยื่นในยอด "ยื่นแล้ว"' },
  { key: 'backlog', label: 'งานค้าง', def: 'คำขอที่สถานะปัจจุบันเป็น ยื่นแล้ว / กำลังตรวจ / ส่งกลับแก้ไข / รอพิจารณา / พิจารณาแล้วรอแจ้งผล — อายุงาน = วันนี้ − วันยื่นครั้งแรก' },
  { key: 'cycle', label: 'เวลาตั้งแต่ยื่นจนปิดงาน', def: 'เฉพาะคำขอที่ปิดงานแล้ว: closedAt − submittedAt (วันยื่นครั้งแรก) หน่วยเป็นวันปฏิทิน แสดงค่าเฉลี่ย ค่ามัธยฐาน และจำนวน' },
  { key: 'stage', label: 'เวลารอในแต่ละขั้น', def: 'จาก StatusHistory: ช่วงเวลาตั้งแต่เข้าสถานะหนึ่งจนเปลี่ยนเป็นสถานะถัดไป รวมทุกครั้งที่เข้าสถานะนั้น ช่วงที่ยังไม่จบ (ยังค้างอยู่) แยกนับเป็น "กำลังรอ"' },
  { key: 'returns', label: 'การส่งกลับแก้ไข', def: 'จำนวนครั้งที่เปลี่ยนเป็นสถานะ "ส่งกลับแก้ไข" จำนวนคำขอที่ถูกส่งกลับอย่างน้อย 1 ครั้ง และจำนวนรายการแก้ไขแยกตามส่วนของคำขอ' }
];

function stats_(arr) {
  if (!arr.length) return { n: 0, avg: null, median: null };
  const s = arr.slice().sort(function (a, b) { return a - b; });
  const sum = s.reduce(function (a, b) { return a + b; }, 0);
  const mid = Math.floor(s.length / 2);
  const med = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { n: s.length, avg: Math.round(sum / s.length * 10) / 10, median: Math.round(med * 10) / 10 };
}

function report_(p) {
  requirePerm_('reports.view');
  const from = clean_(p.from, 10), to = clean_(p.to, 10);
  const inRange = function (d) { const x = String(d || '').slice(0, 10); return x && (!from || x >= from) && (!to || x <= to); };
  let reqs = DB.all('Requests').filter(function (r) { return inScope_(r.unit) || CURRENT_USER_.role === 'admin'; });
  if (CURRENT_USER_.role === 'reviewer') reqs = reqs.filter(function (r) { return r.reviewerId === CURRENT_USER_.id; });
  if (!toBool_(p.includeDemo)) reqs = reqs.filter(function (r) { return !toBool_(r.isDemo); });
  if (p.typeId) reqs = reqs.filter(function (r) { return r.typeId === p.typeId; });
  const ids = {}; reqs.forEach(function (r) { ids[r.id] = r; });
  const created = reqs.filter(function (r) { return inRange(r.createdAt); });
  const byStatus = {};
  Object.keys(STATUSES).forEach(function (s) { byStatus[s] = 0; });
  created.forEach(function (r) { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
  const byType = {};
  created.forEach(function (r) { const t = DB.get('RequestTypes', r.typeId); const k = t ? t.name : r.typeId; byType[k] = (byType[k] || 0) + 1; });

  const backlog = reqs.filter(function (r) { return OPEN_STATUSES.indexOf(r.status) > -1; }).map(function (r) {
    return { code: r.code, title: r.title, status: r.status, statusLabel: STATUSES[r.status].label, ageDays: r.submittedAt ? Math.floor(daysBetween_(r.submittedAt)) : null, holder: requestSummary_(r).holderName };
  }).sort(function (a, b) { return (b.ageDays || 0) - (a.ageDays || 0); });

  const closed = reqs.filter(function (r) { return r.status === 'closed' && r.submittedAt && r.closedAt && inRange(r.closedAt); });
  const cycle = stats_(closed.map(function (r) { return daysBetween_(r.submittedAt, r.closedAt); }));

  const hist = DB.all('StatusHistory').filter(function (h) { return ids[h.requestId]; });
  const byReq = {};
  hist.forEach(function (h) { (byReq[h.requestId] = byReq[h.requestId] || []).push(h); });
  const stage = {}, waiting = {};
  Object.keys(byReq).forEach(function (rid) {
    const list = byReq[rid].filter(function (h) { return h.fromStatus !== h.toStatus; });
    list.forEach(function (h, i) {
      const next = list[i + 1];
      if (next) { if (inRange(next.at)) (stage[h.toStatus] = stage[h.toStatus] || []).push(daysBetween_(h.at, next.at)); }
      else if (OPEN_STATUSES.indexOf(h.toStatus) > -1) (waiting[h.toStatus] = waiting[h.toStatus] || []).push(daysBetween_(h.at));
    });
  });
  const stages = OPEN_STATUSES.concat(['draft']).map(function (s) {
    return { status: s, label: STATUSES[s].label, done: stats_(stage[s] || []), waitingNow: stats_(waiting[s] || []) };
  });

  const returnEvents = hist.filter(function (h) { return h.toStatus === 'returned' && inRange(h.at); });
  const returnedReqs = {}; returnEvents.forEach(function (h) { returnedReqs[h.requestId] = true; });
  const items = DB.all('RevisionItems').filter(function (i) { return ids[i.requestId] && inRange(i.createdAt); });
  const bySection = {};
  items.forEach(function (i) { bySection[SECTIONS[i.section] || i.section] = (bySection[SECTIONS[i.section] || i.section] || 0) + 1; });

  return {
    range: { from: from, to: to }, includeDemo: toBool_(p.includeDemo), definitions: REPORT_DEFINITIONS,
    counts: { created: created.length, submitted: created.filter(function (r) { return r.submittedAt; }).length, byStatus: byStatus, byType: byType },
    backlog: { total: backlog.length, list: backlog.slice(0, 50), age: stats_(backlog.filter(function (b) { return b.ageDays !== null; }).map(function (b) { return b.ageDays; })) },
    cycle: cycle, stages: stages,
    returns: { events: returnEvents.length, requests: Object.keys(returnedReqs).length, bySection: bySection, recent: items.slice(-10).reverse().map(function (i) { return { section: SECTIONS[i.section], message: i.message, at: i.createdAt }; }) },
    generatedAt: nowIso_()
  };
}
