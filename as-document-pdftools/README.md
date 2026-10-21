# แยก / รวม PDF สำหรับ as-document (ระบบปรับเอกสาร)

ย้าย "ตัวช่วยจัดการเอกสาร" (เว็บ Apps Script — แยก PDF รายคน / รวม PDF) เข้าไปเป็นประเภทเอกสาร `pdftools`
ใน [supawitmar/as-document](https://github.com/supawitmar/as-document) ให้ทำงานในเครื่องทั้งหมด
ไม่ต้องใช้บัญชี Google/อินเทอร์เน็ต ตามสถาปัตยกรรม hub + doctypes ของระบบนั้น

ต่อจาก `97be497` (version 1.3.1) ของ as-document

## นำไปใช้ (เลือกวิธีใดวิธีหนึ่ง)

**ก. ใน repo as-document (เครื่องพัฒนา)**
```
git am --3way "as-document-pdftools.patch"
python -m unittest discover -s tests
python tools/release.py "เพิ่มประเภทเอกสาร แยก / รวม PDF" -i "แยก PDF ผลสอบเป็นไฟล์รายคน (ZIP)" -i "รวม PDF หลายไฟล์เป็นไฟล์เดียว"
```

**ข. คัดลอกไฟล์** — แตก `as-document-pdftools-files.zip` ทับโฟลเดอร์โปรแกรม (โครงสร้างโฟลเดอร์ตรงกัน)

## สิ่งที่เปลี่ยน

| ไฟล์ | ทำอะไร |
|---|---|
| `doctypes/pdftools/__init__.py` | ประเภทเอกสาร "แยก / รวม PDF" (การ์ดสี teal) |
| `doctypes/pdftools/web/index.html` | หน้าจอแยก/รวม PDF (สี/โหมดมืดตาม hub) |
| `doctypes/pdftools/web/lib/` | pdf.js 3.11.174, pdf-lib 1.17.1, JSZip 3.10.1 + `VERSIONS.txt` (SHA-384) |
| `core/doctype.py` | เพิ่ม `page` — ประเภทที่มีหน้าจอของตัวเอง |
| `app.py` | เส้นทาง `/tool/<รหัส>/` (ต้องมี token, เฉพาะไฟล์ใน web/, ส่ง Content-Security-Policy ห้ามติดต่อนอกเครื่อง) |
| `web/index.html` | แสดงหน้าจอของประเภทนั้นในกรอบแทนช่องวางไฟล์ |
| `tests/test_pdftools.py` | 9 ทดสอบ (token, path traversal, CSP, ไม่มีลิงก์อินเทอร์เน็ต, SHA ของไลบรารี) |
| `HANDOFF.md`, `README.md`, `doctypes/README.md` | เอกสาร |
