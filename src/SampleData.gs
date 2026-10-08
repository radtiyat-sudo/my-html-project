/**
 * SampleData.gs — ข้อมูลตัวอย่าง (สมมติทั้งหมด) สำหรับทดลองใช้งาน/อบรม
 * ล้างได้ที่ จัดการระบบ > ข้อมูล > ล้างข้อมูลตัวอย่าง (ลบเฉพาะแถวที่ isSample = true)
 */

function seedSampleData_() {
  clearData_(true);
  const E = currentBE_();
  const Y = function (k) { return E - k; }; // Y(0)=ปีนี้, Y(4)=ปีแรกของรอบ, Y(5)+ = เกิน 5 ปี

  const curricula = [
    { id: 'CS01', code: 'ปร.ด. ประชากรศึกษา', nameTh: 'หลักสูตรปรัชญาดุษฎีบัณฑิต สาขาวิชาประชากรศึกษา', nameEn: 'Ph.D. in Demography', level: 'doctoral', criteriaYear: '2565', chairFacultyId: 'FS01' },
    { id: 'CS02', code: 'ปร.ด. ประชากรและการพัฒนา', nameTh: 'หลักสูตรปรัชญาดุษฎีบัณฑิต สาขาวิชาประชากรและการพัฒนา', nameEn: 'Ph.D. in Population and Development', level: 'doctoral', criteriaYear: '2565', chairFacultyId: 'FS04' },
    { id: 'CS03', code: 'วท.ม. ชีวสถิติ', nameTh: 'หลักสูตรวิทยาศาสตรมหาบัณฑิต สาขาวิชาชีวสถิติ', nameEn: 'M.Sc. in Biostatistics', level: 'master', criteriaYear: '2565', chairFacultyId: 'FS07' },
    { id: 'CS04', code: 'วท.ม. การจัดการสิ่งแวดล้อม', nameTh: 'หลักสูตรวิทยาศาสตรมหาบัณฑิต สาขาวิชาการจัดการสิ่งแวดล้อม', nameEn: 'M.Sc. in Environmental Management', level: 'master', criteriaYear: '2558', chairFacultyId: 'FS10' },
    { id: 'CS05', code: 'ศศ.ม. สังคมศาสตร์การแพทย์', nameTh: 'หลักสูตรศิลปศาสตรมหาบัณฑิต สาขาวิชาสังคมศาสตร์การแพทย์และสาธารณสุข', nameEn: 'M.A. in Medical and Health Social Sciences', level: 'master', criteriaYear: '2565', chairFacultyId: 'FS13' }
  ].map(function (c) { return Object.assign(c, { status: 'open', note: 'ข้อมูลตัวอย่าง', isSample: true }); });

  // [id, prefix, nameTh, nameEn, position, degree, curricula, pubs: [yearsAgo, type, db, quartile, status]]
  const J = 'journal';
  const fac = [
    ['FS01', 'รศ.ดร.', 'สมศักดิ์ เรียนดี', 'Somsak Riandee', 'รศ.', 'doctoral', 'CS01', [[0, J, 'scopus', 'Q1', 'verified'], [1, J, 'scopus', 'Q2', 'verified'], [2, J, 'tci1', '', 'verified'], [3, 'textbook', '', '', 'verified'], [0, J, 'wos', 'Q2', 'pending']]],
    ['FS02', 'ดร.', 'วีระ พากเพียร', 'Weera Pakpian', 'อ.', 'doctoral', 'CS01', [[6, J, 'scopus', 'Q3', 'verified']]],
    ['FS03', 'ผศ.ดร.', 'สุนทร แก้วมณี', 'Sunthorn Kaewmanee', 'ผศ.', 'doctoral', 'CS01', [[4, J, 'scopus', 'Q2', 'verified'], [1, J, 'tci2', '', 'verified'], [0, 'proceedings_intl', '', '', 'pending']]],
    ['FS04', 'ศ.ดร.', 'ประเสริฐ ทองดี', 'Prasert Thongdee', 'ศ.', 'doctoral', 'CS02', [[4, J, 'scopus', 'Q1', 'verified'], [3, J, 'scopus', 'Q1', 'verified'], [1, J, 'pubmed', 'Q2', 'verified'], [0, J, 'scopus', 'Q1', 'verified']]],
    ['FS05', 'ดร.', 'สุดา ปัญญาดี', 'Suda Panyadee', 'อ.', 'doctoral', 'CS02', []],
    ['FS06', 'ผศ.ดร.', 'อรุณี ศรีสุข', 'Arunee Srisuk', 'ผศ.', 'doctoral', 'CS02', [[2, J, 'tci1', '', 'verified'], [1, J, 'tci3', '', 'verified'], [0, 'proceedings_nat', '', '', 'pending']]],
    ['FS07', 'รศ.ดร.', 'ธนพล บุญมา', 'Thanapol Boonma', 'รศ.', 'doctoral', 'CS03', [[4, J, 'wos', 'Q2', 'verified'], [2, J, 'scopus', 'Q3', 'verified'], [1, J, 'scopus', 'Q4', 'verified'], [0, 'proceedings_intl', '', '', 'verified']]],
    ['FS08', 'ดร.', 'สมชาย ใจดี', 'Somchai Jaidee', 'อ.', 'doctoral', 'CS03', [[7, J, 'tci1', '', 'verified'], [0, J, 'tci2', '', 'rejected']]],
    ['FS09', 'อ.', 'อนุชา มั่นคง', 'Anucha Mankong', 'อ.', 'master', 'CS03', [[1, 'proceedings_nat', '', '', 'verified']]],
    ['FS10', 'รศ.ดร.', 'จันทร์เพ็ญ วงศ์ไทย', 'Chanpen Wongthai', 'รศ.', 'doctoral', 'CS04', [[4, J, 'scopus', 'Q2', 'verified'], [3, J, 'tci1', '', 'verified'], [2, 'patent', '', '', 'verified'], [1, J, 'eric', '', 'verified']]],
    ['FS11', 'ผศ.ดร.', 'มาลัย ใจงาม', 'Malai Jai-ngam', 'ผศ.', 'doctoral', 'CS04', [[3, J, 'tci1', '', 'verified'], [2, J, 'scopus', 'Q3', 'verified'], [1, 'proceedings_intl', '', '', 'verified'], [0, J, 'tci2', '', 'pending']]],
    ['FS12', 'ผศ.ดร.', 'ชัยวัฒน์ พรหมมา', 'Chaiwat Promma', 'ผศ.', 'doctoral', 'CS04', [[3, J, 'tci2', '', 'verified'], [1, J, 'tci1', '', 'verified'], [0, 'proceedings_nat', '', '', 'verified'], [5, J, 'tci1', '', 'verified']]],
    ['FS13', 'รศ.ดร.', 'พิมพ์ชนก สายทอง', 'Pimchanok Saithong', 'รศ.', 'doctoral', 'CS05', [[3, J, 'scopus', 'Q1', 'verified'], [2, 'book', '', '', 'verified'], [1, J, 'tci1', '', 'verified'], [0, 'social', '', '', 'verified']]],
    ['FS14', 'ผศ.ดร.', 'กิตติพงษ์ รุ่งเรือง', 'Kittipong Rungruang', 'ผศ.', 'doctoral', 'CS05', [[2, J, 'scopus', 'Q2', 'verified'], [1, J, 'tci1', '', 'verified'], [1, 'proceedings_intl', '', '', 'verified'], [0, J, 'tci2', '', 'pending']]],
    ['FS15', '', 'Dr.David Miller', 'David Miller', 'อ.', 'doctoral', 'CS05', []],
    ['FS16', 'ผศ.ดร.', 'นันทนา ศรีวงศ์', 'Nantana Sriwong', 'ผศ.', 'doctoral', 'CS01,CS05', [[3, J, 'scopus', 'Q2', 'verified'], [2, J, 'tci1', '', 'verified'], [1, J, 'wos', 'Q1', 'verified'], [0, J, 'other_intl', '', 'pending']]]
  ];

  const titles = [
    'Population Ageing and Intergenerational Support in Thailand', 'ปัจจัยที่มีผลต่อภาวะเจริญพันธุ์ต่ำในเขตเมือง',
    'Migration Networks and Remittances in the Mekong Subregion', 'การเข้าถึงบริการสุขภาพของแรงงานข้ามชาติ',
    'Bayesian Models for Small-Area Mortality Estimation', 'Air Quality and Respiratory Admissions in Bangkok',
    'คุณภาพชีวิตผู้สูงอายุที่อยู่ลำพังในชนบทไทย', 'Household Structure and Child Development Outcomes',
    'Spatial Analysis of Dengue Incidence', 'แนวทางการจัดการขยะชุมชนแบบมีส่วนร่วม',
    'Social Determinants of Mental Health among Youth', 'Climate Change Adaptation in Coastal Communities',
    'การดูแลระยะยาวในชุมชน: บทเรียนจากพื้นที่นำร่อง', 'Machine Learning for Survival Analysis in Cohort Studies',
    'Gender, Work and Fertility Intentions', 'ระบบเฝ้าระวังคุณภาพน้ำด้วยเซนเซอร์ราคาประหยัด'
  ];
  const sources = {
    scopus: 'Asian Population Studies (Sample)', wos: 'Journal of Ageing and Society (Sample)', pubmed: 'BMC Public Health (Sample)',
    eric: 'International Journal of Educational Research (Sample)', tci1: 'วารสารประชากรศาสตร์ (ตัวอย่าง)', tci2: 'วารสารสังคมศาสตร์และมนุษยศาสตร์ (ตัวอย่าง)',
    tci3: 'วารสารวิชาการท้องถิ่น (ตัวอย่าง)', other_intl: 'Journal of Population and Social Studies (Sample)'
  };
  const typeSource = { proceedings_intl: 'International Conference on Population and Development (Sample)', proceedings_nat: 'การประชุมวิชาการระดับชาติ มหิดลวิจัย (ตัวอย่าง)',
    textbook: 'ตำรา — สำนักพิมพ์มหาวิทยาลัย (ตัวอย่าง)', book: 'หนังสือ — สำนักพิมพ์มหาวิทยาลัย (ตัวอย่าง)', patent: 'สิทธิบัตรการประดิษฐ์ เลขที่ 0000 (ตัวอย่าง)', social: 'ผลงานรับใช้สังคม (ตัวอย่าง)' };

  const now = nowIso_();
  const pubs = [];
  let t = 0;
  const faculty = fac.map(function (r) {
    r[7].forEach(function (p) {
      const status = p[4];
      pubs.push({ personType: 'faculty', personId: r[0], title: titles[t++ % titles.length], source: p[1] === J ? sources[p[2]] : typeSource[p[1]],
        year: Y(p[0]), type: p[1], database: p[1] === J ? p[2] : 'none', quartile: p[3], authorRole: t % 3 ? 'ผู้ประพันธ์หลัก' : 'ผู้ประพันธ์บรรณกิจ',
        status: status, verifyNote: status === 'rejected' ? 'ไม่พบชื่อวารสารในฐานข้อมูล TCI ตามที่ระบุ กรุณาแนบหลักฐาน' : '',
        verifiedBy: status === 'pending' ? '' : 'admin@mahidol.ac.th', verifiedAt: status === 'pending' ? '' : now, isSample: true, createdBy: 'sample' });
    });
    return { id: r[0], prefix: r[1], nameTh: r[2], nameEn: r[3], position: r[4], degree: r[5], degreeDetail: r[5] === 'doctoral' ? 'Ph.D.' : 'วท.ม.',
      curriculumIds: r[6], email: r[3].toLowerCase().replace(/[^a-z]+/g, '.') + '@example.ac.th', scopusId: '', orcid: '', active: true, isSample: true };
  });

  const experts = [
    { id: 'XS01', prefix: 'ผศ.ดร.', nameTh: 'นภา ตัวอย่างดี', nameEn: 'Napa Tuayangdee', affiliation: 'สถาบันวิจัยตัวอย่าง (ข้อมูลสมมติ)', position: 'ผศ.', degree: 'doctoral',
      degreeDetail: 'ปร.ด. (ประชากรศึกษา)', roleType: 'examiner', level: 'doctoral', criteriaYear: '2565', curriculumId: 'CS02', researchExp: true },
    { id: 'XS02', prefix: 'Prof.Dr.', nameTh: 'John Carter', nameEn: 'John Carter', affiliation: 'University of Sample (ข้อมูลสมมติ)', position: 'ศ.', degree: 'doctoral',
      degreeDetail: 'Ph.D. (Demography)', roleType: 'examiner', level: 'doctoral', criteriaYear: '2565', curriculumId: 'CS01', researchExp: true },
    { id: 'XS03', prefix: 'ดร.', nameTh: 'วิไล ศรีสวัสดิ์', nameEn: 'Wilai Srisawat', affiliation: 'กรมอนามัย (ข้อมูลสมมติ)', position: '', degree: 'doctoral',
      degreeDetail: 'ส.ด.', roleType: 'special', level: 'master', criteriaYear: '2565', curriculumId: 'CS05', researchExp: true }
  ].map(function (x) { return Object.assign(x, { scopusId: '', orcid: '', checkResult: '', isSample: true }); });

  const xp = function (id, list) {
    list.forEach(function (p) {
      pubs.push({ personType: 'expert', personId: id, title: p[0], source: p[1], year: p[2], type: J, database: p[3], quartile: p[4] || '',
        status: p[5] ? 'verified' : 'pending', isSample: true, createdBy: 'sample' });
    });
  };
  xp('XS01', [
    ['Ageing Society and Care Policy', 'Journal of Ageing and Society (Sample)', Y(1), 'wos', 'Q3', false],
    ['ครอบครัวข้ามรุ่นในชนบทไทย', 'วารสารตัวอย่าง', Y(2), 'tci3', '', true],
    ['Fertility Decline in Southeast Asia', 'Asian Population Studies (Sample)', Y(3), 'scopus', 'Q2', true],
    ['การย้ายถิ่นของแรงงานข้ามชาติ', 'วารสารสังคมศาสตร์และประชากร (ตัวอย่าง)', Y(5), 'tci1', '', true]
  ]);
  const jc = [];
  for (let i = 0; i < 12; i++) jc.push(['Population Dynamics Study ' + (i + 1) + ' (Sample)', i % 2 ? 'Demography (Sample)' : 'Population Studies (Sample)', Y(i % 8), i % 3 ? 'scopus' : 'wos', 'Q' + (1 + i % 3), true]);
  xp('XS02', jc);
  xp('XS03', [
    ['การส่งเสริมสุขภาพผู้สูงอายุในชุมชน', 'วารสารสาธารณสุขศาสตร์ (ตัวอย่าง)', Y(1), 'tci1', '', true],
    ['พฤติกรรมสุขภาพของวัยทำงาน', 'วารสารพยาบาลสาธารณสุข (ตัวอย่าง)', Y(2), 'tci1', '', true],
    ['Health Literacy among Thai Elderly', 'Journal of Health Research (Sample)', Y(3), 'scopus', 'Q3', true],
    ['ปัจจัยที่สัมพันธ์กับการออกกำลังกาย', 'วารสารวิทยาศาสตร์สุขภาพ (ตัวอย่าง)', Y(4), 'tci2', '', true],
    ['ระบบบริการปฐมภูมิ', 'วารสารวิชาการสาธารณสุข (ตัวอย่าง)', Y(6), 'tci2', '', true]
  ]);

  const users = [
    { email: 'chair.demo@example.ac.th', name: 'รศ.ดร.ประเสริฐ ทองดี (ตัวอย่าง)', role: 'chair', facultyId: 'FS04', curriculumIds: 'CS02', active: true, isSample: true },
    { email: 'lecturer.demo@example.ac.th', name: 'ผศ.ดร.สุนทร แก้วมณี (ตัวอย่าง)', role: 'lecturer', facultyId: 'FS03', curriculumIds: '', active: true, isSample: true },
    { email: 'exec.demo@example.ac.th', name: 'ผู้บริหาร (ตัวอย่าง)', role: 'executive', facultyId: '', curriculumIds: '', active: true, isSample: true }
  ];

  DB.insertMany('Curricula', curricula);
  DB.insertMany('Faculty', faculty);
  DB.insertMany('Experts', experts);
  DB.insertMany('Publications', pubs);
  DB.insertMany('Users', users);
  // รายชื่อวารสารตัวอย่าง (ใช้สาธิตการตรวจผลงานอัตโนมัติ) — ใช้จริงให้นำเข้า SJR/TCI ที่ จัดการระบบ > รายชื่อวารสาร
  DB.insertMany('JournalIndex', [
    ['17441730', 'Asian Population Studies (Sample)', 'scopus', 'Q2'], ['0144686X', 'Ageing and Society (Sample)', 'scopus', 'Q1'],
    ['0144686X', 'Ageing and Society (Sample)', 'wos', ''], ['24654418', 'Journal of Population and Social Studies (Sample)', 'tci1', ''],
    ['24654418', 'Journal of Population and Social Studies (Sample)', 'scopus', 'Q3'], ['16861574', 'Thai Journal of Social Sciences (Sample)', 'tci2', '']
  ].map(function (r) { return { issn: r[0], title: r[1], database: r[2], quartile: r[3], source: 'ตัวอย่าง', updatedAt: now }; }));
  if (!getSettings_().EVAL_YEAR) setSettings_({ EVAL_YEAR: String(E) });
  setSettings_({ SAMPLE_DATA: 'true' });
  audit_('seed_sample', pubs.length + ' publications');
  return { curricula: curricula.length, faculty: faculty.length, experts: experts.length, publications: pubs.length };
}

/** ล้างข้อมูล: sampleOnly = true ลบเฉพาะข้อมูลตัวอย่าง, false ลบข้อมูลทั้งหมด (ยกเว้นผู้ใช้จริงและการตั้งค่า) */
function clearData_(sampleOnly) {
  const pred = function (r) { return sampleOnly ? toBool_(r.isSample) : true; };
  const res = {};
  ['Publications', 'Assessments', 'Experts', 'Faculty', 'Curricula'].forEach(function (t) { res[t] = DB.removeWhere(t, pred); });
  res.Users = DB.removeWhere('Users', function (r) { return toBool_(r.isSample); });
  res.JournalIndex = DB.removeWhere('JournalIndex', function (r) { return r.source === 'ตัวอย่าง'; });
  setSettings_({ SAMPLE_DATA: 'false' });
  audit_(sampleOnly ? 'clear_sample' : 'clear_all', JSON.stringify(res));
  return res;
}
