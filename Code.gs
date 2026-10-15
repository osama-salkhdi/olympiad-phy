/**
 * خادم منصة الاختبارات التجريبية — الإصدار 3 (Google Apps Script)
 * - قائمة الطلاب المسموح لهم (يدوياً أو من إكسل) مع إمكانية تقييد الدخول بها
 * - النتائج في ورقة «نتائج الاختبارات»
 * - الاختبارات الجديدة تُنشأ من لوحة التحكم وتُحفظ في ورقتي «الاختبارات» و«الأسئلة»
 * - صور الأسئلة تُحفظ في مجلد على Google Drive
 */

// ===== عدّل هذه القيمة فقط =====
const ADMIN_KEY = 'ضع-هنا-كلمة-سر-خاصة-بك';   // كلمة سر لوحة التحكم (ضع كلمتك نفسها التي تستعملها الآن)
// ================================

const SHEET_NAME   = 'نتائج الاختبارات';
const EXAMS_SHEET  = 'الاختبارات';
const Q_SHEET      = 'الأسئلة';
const IMG_FOLDER   = 'صور اختبارات الأولمبياد';
const STUDENTS_SHEET = 'الطلاب المسموحون';
const SETTINGS_SHEET = 'الإعدادات';
const LET = 'ABCDE';
// الاختبارات القديمة المكتوبة كملفات في GitHub (مفتاح إجاباتها هنا)
const ANSWER_KEYS = {};   // (اتركها فارغة: كل الاختبارات تُنشأ من لوحة التحكم)

/* ---------- أدوات الأوراق ---------- */
function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
const resSheet_  = () => sheet_(SHEET_NAME, ['الوقت', 'الاختبار', 'رقم الاكتتاب', 'الاسم', 'العلامة', 'الزمن (ثانية)', 'الإجابات']);
const examSheet_ = () => sheet_(EXAMS_SHEET, ['id', 'العنوان', 'الوصف', 'الحالة', 'عدد الأسئلة', 'مفتاح الإجابات', 'تاريخ الإنشاء', 'آخر تعديل']);
const qSheet_    = () => sheet_(Q_SHEET, ['id الاختبار', 'رقم السؤال', 'بيانات السؤال (JSON)']);
const settSheet_ = () => sheet_(SETTINGS_SHEET, ['المفتاح', 'القيمة']);
function studSheet_() {
  const sh = sheet_(STUDENTS_SHEET, ['رقم الاكتتاب', 'الاسم', 'مسموح', 'المصدر', 'تاريخ الإضافة']);
  sh.getRange('A:A').setNumberFormat('@');          // نص: لا تضيع الأصفار في بداية الرقم
  return sh;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- الإعدادات وقائمة الطلاب المسموح لهم ---------- */
function getSetting_(k, def) {
  const sh = settSheet_(), last = sh.getLastRow();
  if (last < 2) return def;
  const r = sh.getRange(2, 1, last - 1, 2).getValues().find(x => String(x[0]) === k);
  return r ? String(r[1]) : def;
}
function setSetting_(k, v) {
  const sh = settSheet_(), last = sh.getLastRow();
  const vals = last < 2 ? [] : sh.getRange(2, 1, last - 1, 2).getValues();
  const i = vals.findIndex(x => String(x[0]) === k);
  if (i >= 0) sh.getRange(i + 2, 2).setValue(v); else sh.appendRow([k, v]);
  bust_();
}
const restrict_ = () => getSetting_('restrict', 'on') === 'on';     // الافتراضي: الدخول مقيّد بالقائمة
function students_() {
  const sh = studSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues().map((r, i) => ({
    reg: String(r[0]), name: String(r[1]), enabled: r[2] === true || String(r[2]).toUpperCase() === 'TRUE',
    source: String(r[3]), added: r[4] instanceof Date ? r[4].toISOString() : String(r[4]), row: i + 2
  }));
}
function allowMap_() {
  return cached_('allow', () => { const m = {}; students_().forEach(s => m[s.reg] = [s.name, s.enabled ? 1 : 0]); return m; });
}
// بوابة الدخول: هل يُسمح لهذا الرقم؟
function gate_(reg) {
  if (!restrict_()) return { ok: true, name: '' };
  const e = allowMap_()[String(reg || '').trim()];
  if (!e) return { ok: false, error: 'not_allowed' };
  if (!e[1]) return { ok: false, error: 'blocked' };
  return { ok: true, name: e[0] };
}
function cleanReg_(v) {
  return String(v || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, '');
}
function addStudents_(d) {
  const list = (d.students || []).slice(0, 3000);
  const sh = studSheet_(), last = sh.getLastRow();
  const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 5).getValues().map(r => [String(r[0]), r[1], r[2], r[3], r[4]]);
  const idx = {}; rows.forEach((r, i) => idx[r[0]] = i);
  const src = d.source === 'manual' ? 'manual' : 'excel', now = new Date();
  let added = 0, updated = 0, same = 0, skipped = 0;
  list.forEach(s => {
    const reg = cleanReg_(s.reg), name = String(s.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!reg || reg.length > 12 || !name) { skipped++; return; }
    if (idx[reg] !== undefined) {                       // موجود: نحدّث الاسم فقط، ولا نغيّر حالة السماح ولا المصدر
      const r = rows[idx[reg]];
      if (r[1] !== name) { r[1] = name; updated++; } else same++;
    } else { idx[reg] = rows.length; rows.push([reg, name, true, src, now]); added++; }
  });
  if (last > 1) sh.getRange(2, 1, last - 1, 5).clearContent();
  if (rows.length) { sh.getRange(2, 1, rows.length, 1).setNumberFormat('@'); sh.getRange(2, 1, rows.length, 5).setValues(rows); }
  bust_();
  return json_({ ok: true, added: added, updated: updated, same: same, skipped: skipped, total: rows.length });
}
function setStudent_(d) {
  const st = students_().find(x => x.reg === String(d.reg));
  if (!st) return json_({ ok: false, error: 'الطالب غير موجود' });
  studSheet_().getRange(st.row, 3).setValue(!!d.enabled); bust_();
  return json_({ ok: true });
}
function deleteStudent_(d) {
  const st = students_().find(x => x.reg === String(d.reg));
  if (!st) return json_({ ok: false, error: 'الطالب غير موجود' });
  studSheet_().deleteRow(st.row); bust_();
  return json_({ ok: true });
}
function clearStudents_() {
  const sh = studSheet_(), last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
  bust_(); return json_({ ok: true });
}

/* ---------- النتائج ---------- */
function rows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 7).getValues().map(r => ({
    time: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
    exam: String(r[1]), reg: String(r[2]), name: r[3],
    score: Number(r[4]), seconds: Number(r[5]), answers: String(r[6])
  }));
}
function rankOf_(all, row) {
  const same = all.filter(r => r.exam === row.exam);
  const better = same.filter(r => r.score > row.score || (r.score === row.score && r.seconds < row.seconds)).length;
  return { rank: better + 1, total: same.length };
}

/* ---------- الاختبارات المحفوظة في الجدول ---------- */
function exams_() {
  const sh = examSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 8).getValues().map((r, i) => ({
    id: String(r[0]), title: String(r[1]), desc: String(r[2]), status: String(r[3]),
    count: Number(r[4]), key: String(r[5]), row: i + 2
  }));
}
function questions_(id) {
  const sh = qSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 3).getValues()
    .filter(r => String(r[0]) === id)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(r => JSON.parse(r[2]));
}
function bust_(id) { try { const c = CacheService.getScriptCache(); c.remove('exams'); c.remove('allow'); if (id) c.remove('exam_' + id); } catch (e) {} }
function cached_(key, fn) {
  try {
    const c = CacheService.getScriptCache(), hit = c.get(key);
    if (hit) return JSON.parse(hit);
    const v = fn(); const s = JSON.stringify(v);
    if (s.length < 90000) c.put(key, s, 300);
    return v;
  } catch (e) { return fn(); }
}
const pub_ = e => ({ id: e.id, title: e.title, desc: e.desc, count: e.count });
function examFull_(e) {
  const qs = questions_(e.id);
  return { id: e.id, title: e.title, desc: e.desc, status: e.status,
    questions: qs.map((q, i) => ({ q: q.q, o: q.o, s: q.s || '', img: q.img || '', fig: q.fig || '', h: q.h ? 1 : 0, a: LET.indexOf(e.key[i]) })) };
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === 'check') {
    const exists = rows_(resSheet_()).some(r => r.exam === p.exam && r.reg === String(p.reg));
    return json_({ ok: true, exists: exists });
  }
  if (p.action === 'config') return json_({ ok: true, restrict: restrict_() });
  if (p.action === 'login') {                 // دخول الطالب: يتحقق من القائمة ويعيد اسمه المسجّل
    const g = gate_(p.reg); if (!g.ok) return json_(g);
    return json_({ ok: true, restrict: restrict_(), name: g.name });
  }
  if (p.action === 'student') {
    const g = gate_(p.reg); if (!g.ok) return json_(g);
    const all = rows_(resSheet_());
    const mine = all.filter(r => r.reg === String(p.reg)).map(r => Object.assign({}, r, rankOf_(all, r)));
    return json_({ ok: true, results: mine });
  }
  if (p.action === 'exams') {                 // قائمة الاختبارات المنشورة (للطلاب)
    return json_({ ok: true, exams: cached_('exams', () => exams_().filter(x => x.status === 'published').map(pub_)) });
  }
  if (p.action === 'exam') {                  // أسئلة اختبار (المنشور للجميع، والمخفي للمشرف فقط)
    const ex = exams_().find(x => x.id === String(p.id));
    if (!ex) return json_({ ok: false, error: 'notfound' });
    const admin = p.key === ADMIN_KEY;
    if (ex.status !== 'published' && !admin) return json_({ ok: false, error: 'notfound' });
    if (!admin) { const g = gate_(p.reg); if (!g.ok) return json_(g); }
    const data = admin ? examFull_(ex) : cached_('exam_' + ex.id, () => examFull_(ex));
    return json_({ ok: true, exam: data });
  }
  if (p.key !== ADMIN_KEY && (p.action === 'all' || p.action === 'adminexams' || p.action === 'students'))
    return json_({ ok: false, error: 'bad key' });
  if (p.action === 'students') return json_({ ok: true, restrict: restrict_(), students: students_() });
  if (p.action === 'all') return json_({ ok: true, rows: rows_(resSheet_()) });
  if (p.action === 'adminexams') {
    const att = {};
    rows_(resSheet_()).forEach(r => att[r.exam] = (att[r.exam] || 0) + 1);
    return json_({ ok: true, exams: exams_().map(x => Object.assign(pub_(x), { status: x.status, attempts: att[x.id] || 0 })) });
  }
  return json_({ ok: true, msg: 'running v3' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const d = JSON.parse(e.postData.contents);
    const action = d.action || 'submit';
    if (action === 'submit') return submit_(d);
    if (d.key !== ADMIN_KEY) return json_({ ok: false, error: 'كلمة السر غير صحيحة' });
    if (action === 'uploadImage') return uploadImage_(d);
    if (action === 'saveExam') return saveExam_(d.exam);
    if (action === 'setStatus') return setStatus_(d);
    if (action === 'deleteExam') return deleteExam_(d);
    if (action === 'addStudents') return addStudents_(d);
    if (action === 'setStudent') return setStudent_(d);
    if (action === 'deleteStudent') return deleteStudent_(d);
    if (action === 'clearStudents') return clearStudents_();
    if (action === 'setConfig') { setSetting_('restrict', d.restrict ? 'on' : 'off'); return json_({ ok: true }); }
    return json_({ ok: false, error: 'عملية غير معروفة' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- تسجيل نتيجة طالب ---------- */
function submit_(d) {
  const exam = String(d.exam || '');
  let key = ANSWER_KEYS[exam];
  if (!key) { const ex = exams_().find(x => x.id === exam && x.status === 'published'); key = ex && ex.key; }
  if (!key) return json_({ ok: false, error: 'اختبار غير معروف' });
  const reg = String(d.reg || '').trim();
  const g = gate_(reg);
  if (!g.ok) return json_(g);                       // الطالب غير مسموح له
  const name = (g.name || String(d.name || '')).trim().slice(0, 80);   // عند التقييد نعتمد الاسم المسجّل
  const ans = String(d.answers || '').toUpperCase().slice(0, key.length);   // '-' = بلا إجابة
  if (!/^\d{1,12}$/.test(reg) || (!g.name && name.split(/\s+/).length < 3) || !name) return json_({ ok: false, error: 'بيانات غير صالحة' });
  const sh = resSheet_();
  const all = rows_(sh);
  if (all.some(r => r.exam === exam && r.reg === reg)) return json_({ ok: false, error: 'dup' });
  let score = 0;
  for (let i = 0; i < key.length; i++) if (ans[i] === key[i]) score++;
  const secs = Math.max(0, Math.min(86400, Number(d.seconds) || 0));
  sh.appendRow([new Date(), exam, "'" + reg, name, score, secs, ans]);
  const row = { exam: exam, score: score, seconds: secs };
  const info = rankOf_(all.concat([row]), row);
  return json_({ ok: true, score: score, rank: info.rank, total: info.total });
}

/* ---------- عمليات المشرف ---------- */
function saveExam_(ex) {
  if (!ex || !String(ex.title || '').trim()) return json_({ ok: false, error: 'عنوان الاختبار مطلوب' });
  const qs = ex.questions || [];
  if (!qs.length || qs.length > 300) return json_({ ok: false, error: 'عدد الأسئلة غير صالح' });
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (!String(q.q || '').trim()) return json_({ ok: false, error: 'السؤال ' + (i + 1) + ' بلا نص' });
    if (!Array.isArray(q.o) || q.o.length < 2 || q.o.length > 5 || q.o.some(o => !String(o).trim()))
      return json_({ ok: false, error: 'خيارات السؤال ' + (i + 1) + ' غير صالحة' });
    if (!(q.a >= 0 && q.a < q.o.length)) return json_({ ok: false, error: 'حدد الإجابة الصحيحة للسؤال ' + (i + 1) });
  }
  const status = ex.status === 'published' ? 'published' : 'hidden';
  const key = qs.map(q => LET[q.a]).join('');
  const esh = examSheet_();
  const old = ex.id ? exams_().find(x => x.id === String(ex.id)) : null;
  const id = old ? old.id : 'x' + Date.now().toString(36);
  const now = new Date();
  if (old) {
    esh.getRange(old.row, 2, 1, 4).setValues([[ex.title, ex.desc || '', status, qs.length]]);
    esh.getRange(old.row, 6).setValue(key);
    esh.getRange(old.row, 8).setValue(now);
  } else {
    esh.appendRow([id, ex.title, ex.desc || '', status, qs.length, key, now, now]);
  }
  // استبدال أسئلة هذا الاختبار
  const qsh = qSheet_(), last = qsh.getLastRow();
  const keep = last < 2 ? [] : qsh.getRange(2, 1, last - 1, 3).getValues().filter(r => String(r[0]) !== id);
  const add = qs.map((q, i) => [id, i + 1, JSON.stringify({ q: String(q.q), o: q.o.map(String), s: String(q.s || ''), img: String(q.img || ''), fig: String(q.fig || ''), h: q.h ? 1 : 0 })]);
  const big = add.findIndex(r => r[2].length > 49000);
  if (big >= 0) throw new Error('السؤال ' + (big + 1) + ' كبير جداً (حد خلية Google Sheets 50 ألف حرف)');
  const all = keep.concat(add);
  if (last > 1) qsh.getRange(2, 1, last - 1, 3).clearContent();
  qsh.getRange(2, 1, all.length, 3).setValues(all);
  bust_(id);
  return json_({ ok: true, id: id, count: qs.length });
}
function setStatus_(d) {
  const ex = exams_().find(x => x.id === String(d.id));
  if (!ex) return json_({ ok: false, error: 'اختبار غير موجود' });
  examSheet_().getRange(ex.row, 4).setValue(d.status === 'published' ? 'published' : 'hidden');
  bust_(ex.id);
  return json_({ ok: true });
}
function deleteExam_(d) {
  const ex = exams_().find(x => x.id === String(d.id));
  if (!ex) return json_({ ok: false, error: 'اختبار غير موجود' });
  const qsh = qSheet_(), last = qsh.getLastRow();
  if (last > 1) {
    const keep = qsh.getRange(2, 1, last - 1, 3).getValues().filter(r => String(r[0]) !== ex.id);
    qsh.getRange(2, 1, last - 1, 3).clearContent();
    if (keep.length) qsh.getRange(2, 1, keep.length, 3).setValues(keep);
  }
  examSheet_().deleteRow(ex.row);               // نتائج الطلاب تبقى في ورقة النتائج
  bust_(ex.id);
  return json_({ ok: true });
}
function folder_() {
  const it = DriveApp.getFoldersByName(IMG_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(IMG_FOLDER);
}
function uploadImage_(d) {
  const blob = Utilities.newBlob(Utilities.base64Decode(String(d.data)), d.mime || 'image/jpeg', 'q_' + Date.now() + '.jpg');
  const f = folder_().createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return json_({ ok: true, url: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1400' });
}

/** شغّلها مرة واحدة من المحرر (اختر authorize_ ثم Run) لمنح إذن Google Drive */
function authorize_() { folder_(); }
