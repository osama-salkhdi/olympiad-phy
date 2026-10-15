/* لوحة التحكم: النتائج + إدارة الاختبارات + منشئ الاختبارات من PDF */
(function(){
const {LET, esc, clean, store, Net, ctx, loadExam, setMeta, examMeta, rankInfo, brandHTML, fmtTime} = OLY;
document.getElementById('brand').innerHTML = brandHTML();
document.title = 'لوحة التحكم' + (OLY.CFG.SUBJECT ? ' — ' + OLY.CFG.SUBJECT : '');
const $app = document.getElementById('app');
let ALL = [], CAT = [], KEY = sessionStorage.getItem('oly_admin_key') || '', TAB = 'results';
const $ = id => document.getElementById(id);
const fdate = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString('ar-SY') + ' ' + d.toLocaleTimeString('ar-SY',{hour:'2-digit',minute:'2-digit'}); };
const pct = (s, id) => { const n = examMeta(id).count || 1; return Math.round(s / n * 100); };

/* ---------- الدخول والتحميل ---------- */
function login(err=''){
  $app.innerHTML = `<div class="card" style="max-width:460px;margin:auto"><h1>🔐 لوحة التحكم</h1>
  <label>كلمة السر</label><input id="pw" type="password" autocomplete="current-password">
  ${err ? `<div class="msg bad">${err}</div>` : ''}<button class="pulse" id="ok">دخول</button></div>`;
  const go = () => { KEY = $('pw').value; load(); };
  $('ok').onclick = go; $('pw').onkeydown = e => { if(e.key === 'Enter') go(); };
}
async function loadCatalog(){
  const st = (window.EXAMS_MANIFEST||[]).map(m => ({...m, status:'published', static:true}));
  let dyn = [];
  if(Net.live()){ const r = await Net.adminExams(KEY); if(r.ok) dyn = r.exams; }
  CAT = [...st, ...dyn.filter(d => !st.some(s => s.id === d.id))];
  // اختبارات محذوفة لكن لها نتائج: نُبقي لها اسماً وعدد أسئلة تقريبياً
  ALL.forEach(r => { if(!CAT.some(c => c.id === r.exam) && !CAT.some(c => c.deleted && c.id === r.exam))
    CAT.push({id:r.exam, title:'(محذوف) ' + r.exam, count:Math.max(...ALL.filter(x => x.exam === r.exam).map(x => x.answers.length)), status:'deleted', deleted:true}); });
  setMeta(CAT);
}
async function load(){
  $app.innerHTML = '<div class="card"><div class="skel"></div></div>';
  let r; try{ r = await Net.all(KEY); }catch(e){ return login('تعذّر الاتصال بالخادم.'); }
  if(!r.ok) return login('كلمة السر غير صحيحة.');
  sessionStorage.setItem('oly_admin_key', KEY); ctx.key = KEY;
  ALL = (r.rows || []).map(x => ({...x, reg:String(x.reg), score:Number(x.score), seconds:Number(x.seconds), answers:String(x.answers || '')}));
  ALL.forEach(x => Object.assign(x, rankInfo(ALL, x)));
  await loadCatalog();
  shell();
}
function shell(){
  $app.innerHTML = `<div class="tabs"><button id="t_results" class="${TAB === 'results' ? 'on' : ''}">📊 النتائج والطلاب</button>
    <button id="t_exams" class="${TAB === 'exams' ? 'on' : ''}">📝 الاختبارات</button>
    <button id="t_students" class="${TAB === 'students' ? 'on' : ''}">👥 الطلاب المسموحون</button>
    <button class="red sm" id="lo" style="margin-right:auto">خروج</button></div><div id="main"></div>`;
  $('t_results').onclick = () => { TAB = 'results'; shell(); };
  $('t_exams').onclick = () => { TAB = 'exams'; shell(); };
  $('t_students').onclick = () => { TAB = 'students'; shell(); };
  $('lo').onclick = () => { sessionStorage.removeItem('oly_admin_key'); KEY = ''; login(); };
  TAB === 'results' ? resultsTab() : TAB === 'exams' ? examsTab() : studentsTab();
}

/* =====================================================================
   تبويب النتائج
   ===================================================================== */
function resultsTab(){
  $('main').innerHTML = `<div class="card"><div class="top"><h2>لوحة المتابعة</h2><div class="chips">
      <button class="sm" id="rf">🔄 تحديث</button><button class="sec sm" id="csv">⬇ تحميل CSV</button><button class="sec sm" id="cp">📋 نسخ أفضل 10</button></div></div>
    <div class="filters" style="margin-top:12px">
      <div><label>الاختبار</label><select id="fx"><option value="">كل الاختبارات</option>${CAT.map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')}</select></div>
      <div><label>بحث بالاسم أو رقم الاكتتاب</label><input id="fq" placeholder="مثال: 10234 أو أحمد" autocomplete="off"></div>
      <div><button class="sec" id="clr">مسح الفلتر</button></div></div></div>
    <div id="kp"></div><div id="prof"></div><div id="exs"></div><div id="tbl"></div>`;
  $('fx').onchange = view; $('fq').oninput = view;
  $('clr').onclick = () => { $('fx').value = ''; $('fq').value = ''; view(); };
  $('rf').onclick = load; $('csv').onclick = () => exportCSV(current()); $('cp').onclick = copyTop;
  view();
}
function current(){
  const ex = $('fx').value, q = $('fq').value.trim().toLowerCase();
  const rows = ALL.filter(r => (!ex || r.exam === ex) && (!q || r.name.toLowerCase().includes(q) || r.reg.includes(q)));
  const order = id => CAT.findIndex(m => m.id === id);
  rows.sort((a,b) => ex ? a.rank - b.rank : order(a.exam) - order(b.exam) || a.rank - b.rank);
  return rows;
}
function view(){
  const ex = $('fx').value, q = $('fq').value.trim(), rows = current();
  const regs = [...new Set(rows.map(r => r.reg))];
  const avg = rows.length ? Math.round(rows.reduce((t,r) => t + pct(r.score, r.exam), 0) / rows.length) : 0;
  const best = rows.length ? Math.max(...rows.map(r => pct(r.score, r.exam))) : 0;
  $('kp').innerHTML = `<div class="kpis"><div class="kpi"><b>${regs.length}</b><span>طالب</span></div><div class="kpi"><b>${rows.length}</b><span>محاولة</span></div>
    <div class="kpi"><b>${rows.length ? avg + '%' : '—'}</b><span>متوسط النسبة</span></div><div class="kpi"><b>${rows.length ? best + '%' : '—'}</b><span>أعلى نسبة</span></div></div>`;
  if(q && regs.length === 1) studentProfile(regs[0], $('prof')); else $('prof').innerHTML = '';
  if(ex) examStats(ex, $('exs')); else $('exs').innerHTML = '';
  const body = rows.map(r => `<tr class="${ex && r.rank <= 3 ? 'top3' : ''}" data-reg="${esc(r.reg)}"><td>${r.rank} / ${r.total}</td><td>${esc(r.name)}</td><td>${esc(r.reg)}</td>
    <td>${esc(examMeta(r.exam).title)}</td><td><b>${r.score}</b> / ${examMeta(r.exam).count} (${pct(r.score, r.exam)}%)</td><td>${fmtTime(r.seconds)}</td><td>${fdate(r.time)}</td></tr>`).join('');
  $('tbl').innerHTML = `<div class="card"><h2>النتائج ${ex ? '— ' + esc(examMeta(ex).title) : ''} <span class="muted">(${rows.length})</span></h2>
    ${rows.length ? `<div class="scroll"><table class="t"><thead><tr><th>الترتيب</th><th>الاسم</th><th>رقم الاكتتاب</th><th>الاختبار</th><th>العلامة</th><th>الزمن</th><th>التاريخ</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="muted">اضغط على أي صف لعرض الملف الكامل للطالب.</p>` : '<p class="muted">لا توجد نتائج مطابقة.</p>'}</div>`;
  document.querySelectorAll('#tbl tbody tr').forEach(tr => tr.onclick = () => { $('fq').value = tr.dataset.reg; view(); scrollTo({top:0, behavior:'smooth'}); });
}
async function studentProfile(reg, el){
  const mine = ALL.filter(r => r.reg === reg), name = mine[0].name, done = new Set(mine.map(r => r.exam));
  const avg = Math.round(mine.reduce((t,r) => t + pct(r.score, r.exam), 0) / mine.length), secs = mine.reduce((t,r) => t + r.seconds, 0);
  const lines = mine.slice().sort((a,b) => CAT.findIndex(m => m.id === a.exam) - CAT.findIndex(m => m.id === b.exam)).map(r => {
    const p = pct(r.score, r.exam);
    return `<tr style="cursor:default"><td>${esc(examMeta(r.exam).title)}</td><td><b>${r.score}</b> / ${examMeta(r.exam).count}</td>
      <td><div class="hbar"><i style="width:${p}%;background:${p >= 70 ? 'var(--green)' : p >= 50 ? 'var(--amber)' : 'var(--red)'}"></i></div>${p}%</td>
      <td>${r.rank} من ${r.total}</td><td>${fmtTime(r.seconds)}</td><td>${fdate(r.time)}</td><td><div class="rv" id="rv_${esc(r.exam)}"></div></td></tr>`;
  }).join('');
  const missing = CAT.filter(m => !done.has(m.id) && m.status === 'published').map(m => `<span class="badge">${esc(m.title)}</span>`).join(' ');
  el.innerHTML = `<div class="card prof"><div class="ph"><div><h2>👤 ${esc(name)}</h2><div class="muted">رقم الاكتتاب: ${esc(reg)}</div></div>
    <div class="chips"><span class="badge g">${mine.length} اختبارات منجزة</span><span class="badge a">المتوسط ${avg}%</span><span class="badge">إجمالي الزمن ${fmtTime(secs)}</span></div></div>
    <div class="scroll" style="margin-top:12px"><table class="t"><thead><tr><th>الاختبار</th><th>العلامة</th><th>النسبة</th><th>الترتيب بين المقدّمين</th><th>الزمن</th><th>التاريخ</th><th>إجاباته (أخضر صحيح / أحمر خطأ)</th></tr></thead><tbody>${lines}</tbody></table></div>
    ${missing ? `<p class="muted" style="margin-bottom:0">لم يقدّم بعد: ${missing}</p>` : ''}</div>`;
  for(const r of mine){
    try{
      const E = await loadExam(r.exam); const box = $('rv_' + r.exam); if(!box) continue;
      box.innerHTML = E.questions.map((Q,i) => { const c = r.answers[i]; const k = c ? LET.indexOf(c) : -1;
        return `<span class="${k < 0 ? 'n' : k === Q.a ? 'g' : 'r'}" title="س${i+1}${k >= 0 ? ' — ' + c : ''}" style="width:26px;height:26px;font-size:.72rem;cursor:default">${i+1}</span>`; }).join('');
    }catch(e){}
  }
}
async function examStats(id, el){
  const rows = ALL.filter(r => r.exam === id);
  el.innerHTML = '<div class="card"><div class="skel" style="height:80px"></div></div>';
  let E; try{ E = await loadExam(id); }catch(e){ el.innerHTML = ''; return; }
  if($('fx') && $('fx').value !== id) return;
  if(!rows.length){ el.innerHTML = ''; return; }
  const sc = rows.map(r => r.score).sort((a,b) => a - b), n = sc.length;
  const med = n % 2 ? sc[(n-1)/2] : (sc[n/2-1] + sc[n/2]) / 2;
  const stats = E.questions.map((Q,i) => Math.round(rows.filter(r => r.answers[i] === LET[Q.a]).length / n * 100));
  el.innerHTML = `<div class="card"><h2>📊 إحصاءات ${esc(E.title)}</h2>
    <div class="chips"><span class="badge g">أعلى علامة ${sc[n-1]}</span><span class="badge r">أدنى علامة ${sc[0]}</span><span class="badge a">الوسيط ${med}</span></div>
    <p class="muted" style="margin:10px 0 0">نسبة الإجابة الصحيحة لكل سؤال (الأحمر = الأصعب):</p>
    <div class="qgrid">${stats.map((p,i) => `<div class="qs ${p >= 70 ? 'hi' : p >= 40 ? 'mid' : 'lo'}">س${i+1}<b>${p}%</b></div>`).join('')}</div></div>`;
}
function exportCSV(rows){
  const head = ['الترتيب','عدد المقدّمين','الاسم','رقم الاكتتاب','الاختبار','العلامة','من','الزمن بالثواني','التاريخ'];
  const c = '\ufeff' + [head.join(',')].concat(rows.map(r => [r.rank, r.total, '"' + r.name.replace(/"/g,'""') + '"', r.reg, '"' + examMeta(r.exam).title + '"', r.score, examMeta(r.exam).count, r.seconds, r.time].join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], {type:'text/csv'})); a.download = 'results.csv'; a.click();
}
function copyTop(){
  const ex = $('fx').value; if(!ex) return alert('اختر اختباراً محدداً أولاً لنسخ ترتيبه.');
  const rows = ALL.filter(r => r.exam === ex).sort((a,b) => a.rank - b.rank).slice(0,10);
  const txt = '🏆 أفضل النتائج — ' + examMeta(ex).title + '\n' + rows.map((r,i) => `${['🥇','🥈','🥉'][i] || (i+1) + '.'} ${r.name} — ${r.score}/${examMeta(ex).count}`).join('\n');
  navigator.clipboard.writeText(txt).then(() => alert('تم النسخ، الصقه في مجموعة الطلاب'));
}


/* =====================================================================
   تبويب الطلاب المسموح لهم
   ===================================================================== */
let STUD = [], RESTRICT = true, SQ = '', SF = '', SLIM = 200;
async function loadStudents(){
  const r = await Net.students(KEY);
  if(!r.ok) throw new Error(r.error || 'تعذّر تحميل القائمة');
  STUD = r.students || []; RESTRICT = !!r.restrict;
}
async function studentsTab(){
  $('main').innerHTML = '<div class="card"><div class="skel" style="height:120px"></div></div>';
  try{ await loadStudents(); }catch(e){ $('main').innerHTML = `<div class="card"><div class="msg bad">${esc(e.message)}</div></div>`; return; }
  renderStudents();
}
function renderStudents(){
  const taken = new Set(ALL.map(r => r.reg)), allowed = STUD.filter(s => s.enabled).length;
  $('main').innerHTML = `
  <div class="card"><div class="top"><h2>👥 الطلاب المسموح لهم بالاختبارات</h2>
      <div class="switch"><span class="badge ${RESTRICT ? 'g' : 'r'}">${RESTRICT ? 'التقييد مفعّل: المسجّلون فقط' : 'التقييد معطّل: الدخول مفتوح للجميع'}</span>
      <button class="sm ${RESTRICT ? 'sec' : ''}" id="tgl">${RESTRICT ? 'تعطيل التقييد' : 'تفعيل التقييد'}</button></div></div>
    <p class="muted" style="margin:6px 0 0">عند تفعيل التقييد لا يستطيع الدخول أو تقديم الاختبارات إلا الطلاب الموجودون في هذه القائمة والمسموح لهم. ويدخل الطالب برقم الاكتتاب فقط ويُعتمد اسمه المسجّل هنا.</p>
    ${RESTRICT && !allowed ? '<div class="warn">⚠️ التقييد مفعّل والقائمة فارغة: لا يستطيع أي طالب الدخول حالياً. أضف طلاباً أو ارفع ملف إكسل.</div>' : ''}
    <div class="kpis" style="margin:14px 0 0"><div class="kpi"><b>${STUD.length}</b><span>إجمالي القائمة</span></div><div class="kpi"><b>${allowed}</b><span>مسموح</span></div>
      <div class="kpi"><b>${STUD.length - allowed}</b><span>موقوف</span></div><div class="kpi"><b>${STUD.filter(s => taken.has(s.reg)).length}</b><span>قدّموا اختباراً</span></div></div></div>
  <div class="card"><h2>➕ إضافة طالب يدوياً</h2>
    <p class="muted" style="margin-top:0">يُسمح له بالتقديم حتى لو لم يكن في ملف الإكسل، ولا يحذفه رفع الإكسل لاحقاً.</p>
    <div class="filters" style="grid-template-columns:1fr 1.6fr auto;align-items:end"><div><label>رقم الاكتتاب</label><input id="m_reg" inputmode="numeric" autocomplete="off"></div>
      <div><label>الاسم الثلاثي</label><input id="m_nm" autocomplete="off"></div><div><button id="m_add">إضافة</button></div></div><div id="m_msg"></div></div>
  <div class="card"><h2>📊 رفع ملف إكسل بأسماء الطلاب</h2>
    <p class="muted" style="margin-top:0">عمودان: رقم الاكتتاب والاسم (بأي ترتيب، ويُتعرّف عليهما تلقائياً). الأسماء الجديدة تُضاف، والموجودة يُحدَّث اسمها، ولا يُحذف أحد.</p>
    <input type="file" id="xf" accept=".xlsx,.xls,.csv"><div class="chips"><button class="sec sm" id="tpl">⬇ تحميل نموذج إكسل جاهز (عمودان)</button></div><div id="xprev"></div></div>
  <div class="card"><div class="top"><h2>قائمة الطلاب <span class="muted">(${STUD.length})</span></h2><div class="chips">
      <button class="sec sm" id="s_csv">⬇ تصدير CSV</button><button class="red sm" id="s_clr">🗑 حذف كل القائمة</button></div></div>
    <div class="filters" style="grid-template-columns:2fr 1fr;margin-top:10px"><input id="s_q" placeholder="بحث بالاسم أو رقم الاكتتاب" value="${esc(SQ)}" autocomplete="off">
      <select id="s_f"><option value="">الكل</option><option value="on">المسموح</option><option value="off">الموقوف</option><option value="never">لم يقدّم أي اختبار</option></select></div>
    <div id="s_tbl" style="margin-top:12px"></div></div>`;
  $('s_f').value = SF;
  $('tgl').onclick = async () => {
    if(RESTRICT && !confirm('تعطيل التقييد يسمح لأي شخص بالدخول وتقديم الاختبارات. متابعة؟')) return;
    const r = await Net.act({action:'setConfig', key:KEY, restrict:!RESTRICT}); if(!r.ok) return alert(r.error || 'فشل');
    RESTRICT = !RESTRICT; renderStudents();
  };
  $('m_add').onclick = manualAdd; $('m_nm').onkeydown = e => { if(e.key === 'Enter') manualAdd(); };
  $('xf').onchange = onExcel; $('tpl').onclick = downloadTemplate;
  $('s_q').oninput = e => { SQ = e.target.value; SLIM = 200; studentRows(); };
  $('s_f').onchange = e => { SF = e.target.value; SLIM = 200; studentRows(); };
  $('s_csv').onclick = exportStudents;
  $('s_clr').onclick = async () => {
    if(!STUD.length || !confirm(`حذف جميع الطلاب (${STUD.length}) من القائمة؟ لن يستطيع أحد الدخول إذا كان التقييد مفعّلاً.`)) return;
    if(!confirm('تأكيد أخير: هل أنت متأكد؟')) return;
    const r = await Net.act({action:'clearStudents', key:KEY}); if(!r.ok) return alert(r.error || 'فشل'); STUD = []; renderStudents();
  };
  studentRows();
}
function studentRows(){
  const taken = {}; ALL.forEach(r => taken[r.reg] = (taken[r.reg] || 0) + 1);
  const q = SQ.trim().toLowerCase();
  let rows = STUD.filter(s => (!q || s.name.toLowerCase().includes(q) || s.reg.includes(OLY.normDigits(q)))
    && (SF === '' || (SF === 'on' && s.enabled) || (SF === 'off' && !s.enabled) || (SF === 'never' && !taken[s.reg])));
  const shown = rows.slice(0, SLIM);
  $('s_tbl').innerHTML = rows.length ? `<div class="scroll"><table class="t"><thead><tr><th>رقم الاكتتاب</th><th>الاسم</th><th>المصدر</th><th>الاختبارات المقدَّمة</th><th>السماح</th><th></th></tr></thead><tbody>
    ${shown.map(s => `<tr style="cursor:default"><td>${esc(s.reg)}</td><td>${esc(s.name)}</td><td><span class="badge">${s.source === 'manual' ? 'يدوي' : 'إكسل'}</span></td><td>${taken[s.reg] || 0}</td>
      <td><button class="sm ${s.enabled ? '' : 'red'}" data-t="${esc(s.reg)}">${s.enabled ? '✔ مسموح' : '⛔ موقوف'}</button></td>
      <td><button class="sec sm" data-d="${esc(s.reg)}">🗑</button></td></tr>`).join('')}</tbody></table></div>
    ${rows.length > shown.length ? `<div class="chips" style="margin-top:10px"><button class="sec sm" id="s_more">عرض المزيد (${rows.length - shown.length} متبقٍ)</button></div>` : ''}
    <p class="muted" style="margin-bottom:0">اضغط زر السماح لإيقاف الطالب أو إعادته. الموقوف لا يستطيع الدخول ويبقى اسمه في القائمة.</p>` : '<p class="muted">لا توجد نتائج مطابقة.</p>';
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => {
    const s = STUD.find(x => x.reg === b.dataset.t); b.disabled = true;
    const r = await Net.act({action:'setStudent', key:KEY, reg:s.reg, enabled:!s.enabled}); if(!r.ok){ b.disabled = false; return alert(r.error || 'فشل'); }
    s.enabled = !s.enabled; renderStudents();
  });
  document.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
    const s = STUD.find(x => x.reg === b.dataset.d); if(!confirm(`حذف «${s.name}» من القائمة؟`)) return;
    const r = await Net.act({action:'deleteStudent', key:KEY, reg:s.reg}); if(!r.ok) return alert(r.error || 'فشل');
    STUD = STUD.filter(x => x !== s); renderStudents();
  });
  if($('s_more')) $('s_more').onclick = () => { SLIM += 300; studentRows(); };
}
async function manualAdd(){
  const reg = OLY.normDigits($('m_reg').value.trim()), name = $('m_nm').value.trim().replace(/\s+/g, ' '), msg = $('m_msg');
  const bad = m => { msg.innerHTML = `<div class="msg bad">${esc(m)}</div>`; };
  if(!/^\d{1,12}$/.test(reg)) return bad('رقم الاكتتاب يجب أن يكون أرقاماً فقط.');
  if(name.split(' ').length < 3) return bad('اكتب الاسم الثلاثي كاملاً.');
  $('m_add').disabled = true;
  const r = await Net.act({action:'addStudents', key:KEY, source:'manual', students:[{reg, name}]});
  if(!r.ok){ $('m_add').disabled = false; return bad(r.error || 'فشلت الإضافة'); }
  await loadStudents(); renderStudents();
  $('m_msg').innerHTML = `<div class="msg ok">✅ ${r.added ? 'تمت إضافة' : 'تم تحديث'} «${esc(name)}» (${esc(reg)}).</div>`;
}

/* ---- ملف إكسل ---- */
let XP = null;
function loadXlsx(){
  if(window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = res;
    s.onerror = () => rej(new Error('تعذّر تحميل مكتبة قراءة الإكسل، تحقق من الاتصال بالإنترنت.')); document.head.appendChild(s); });
}
/* ملف وصل في عمود واحد (مثل «10001,أحمد محمد») ← نفصله إلى رقم واسم */
function splitCombined(rows){
  const one = rows.filter(r => r.filter(Boolean).length === 1);
  if(!rows.length || one.length < rows.length * 0.8) return rows;
  const D = '[\\d٠-٩۰-۹]';
  const re1 = new RegExp('^[\\s"\']*(' + D + '{3,})[\\s"\']*[,;\\t،|:\\-–\\s]+[\\s"\']*(.+?)[\\s"\']*$');
  const re2 = new RegExp('^[\\s"\']*(.+?)[\\s"\']*[,;\\t،|:\\-–\\s]+[\\s"\']*(' + D + '{3,})[\\s"\']*$');
  return rows.map(r => {
    const t = r.find(Boolean) || '';
    let m = t.match(re1); if(m) return [m[1], m[2]];
    m = t.match(re2); if(m) return [m[2], m[1]];
    return /اكتتاب|اسم|reg|name/i.test(t) ? null : [t];
  }).filter(Boolean);
}
function parseRows(rows){
  const cell = v => String(v ?? '').trim();
  rows = rows.map(r => r.map(cell)).filter(r => r.some(Boolean) && !/^sep=/i.test(r[0]));
  rows = splitCombined(rows);
  let rc = -1, nc = -1, start = 0, rn = '', nn = '';
  const hi = rows.slice(0, 5).findIndex(r => r.some(c => /اكتتاب|رقم|reg|id|number/i.test(c)) && r.some(c => /اسم|name/i.test(c)));
  if(hi >= 0){ const h = rows[hi]; rc = h.findIndex(c => /اكتتاب|رقم|reg|id|number/i.test(c)); nc = h.findIndex(c => /اسم|name/i.test(c)); start = hi + 1; rn = h[rc]; nn = h[nc]; }
  else if(rows.length){
    const f = rows[0]; const isNum = c => /^[\d٠-٩۰-۹\s.]+$/.test(c) && c;
    rc = f.findIndex(isNum); nc = f.findIndex((c, i) => c && i !== rc);
    if(rc < 0 || nc < 0){ rc = 0; nc = 1; }
  }
  const valid = new Map(), invalid = []; let dup = 0;
  rows.slice(start).forEach((r, i) => {
    const reg = OLY.normDigits(r[rc] || '').replace(/\D/g, ''), name = (r[nc] || '').replace(/\s+/g, ' ');
    if(!reg || reg.length > 12) return invalid.push({row:start + i + 1, why:'رقم الاكتتاب غير صالح', v:r.join(' | ')});
    if(!name) return invalid.push({row:start + i + 1, why:'الاسم فارغ', v:r.join(' | ')});
    if(valid.has(reg)) dup++; valid.set(reg, name);
  });
  return {list:[...valid].map(([reg, name]) => ({reg, name})), invalid, dup, rn, nn};
}
async function onExcel(){
  const f = $('xf').files[0]; if(!f) return; const box = $('xprev'); box.innerHTML = '<div class="muted">جارٍ قراءة الملف...</div>';
  try{
    await loadXlsx();
    const wb = /\.csv$/i.test(f.name) ? XLSX.read(await f.text(), {type:'string'}) : XLSX.read(await f.arrayBuffer(), {type:'array'});
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:false, defval:''});
    XP = parseRows(rows);
    if(!XP.list.length) throw new Error('لم أجد أي طالب صالح في الملف. تأكد من وجود عمودي رقم الاكتتاب والاسم.');
    const have = new Set(STUD.map(s => s.reg)), news = XP.list.filter(s => !have.has(s.reg)).length;
    box.innerHTML = `<div class="msg ok" style="margin-top:10px">تم التعرف على <b>${XP.list.length}</b> طالباً: ${news} جديد و${XP.list.length - news} موجود مسبقاً (يُحدَّث اسمه)${XP.dup ? ` — ${XP.dup} مكرر داخل الملف` : ''}.${XP.rn ? `<br><span class="muted">الأعمدة المعتمدة: رقم الاكتتاب ← «${esc(XP.rn)}»، الاسم ← «${esc(XP.nn)}»</span>` : ''}</div>
      <div class="scroll" style="max-height:200px;margin-top:8px"><table class="t"><tbody>${XP.list.slice(0,6).map(s => `<tr style="cursor:default"><td>${esc(s.reg)}</td><td>${esc(s.name)}</td></tr>`).join('')}</tbody></table></div>
      ${XP.invalid.length ? `<div class="warn">تم تجاهل ${XP.invalid.length} صفاً غير صالح، مثلاً: ${XP.invalid.slice(0,3).map(x => `صف ${x.row} (${esc(x.why)})`).join('، ')}</div>` : ''}
      <div class="chips" style="margin-top:10px"><button class="pulse" id="xgo">✅ استيراد ${XP.list.length} طالباً</button></div><div id="xres"></div>`;
    $('xgo').onclick = importExcel;
  }catch(e){ box.innerHTML = `<div class="msg bad">${esc(e.message || e)}</div>`; }
}
async function importExcel(){
  const btn = $('xgo'); btn.disabled = true; const tot = {added:0, updated:0, same:0, skipped:0};
  try{
    for(let i = 0; i < XP.list.length; i += 1000){
      $('xres').innerHTML = `<div class="msg ok">جارٍ الاستيراد... ${Math.min(i + 1000, XP.list.length)} / ${XP.list.length}</div>`;
      const r = await Net.act({action:'addStudents', key:KEY, source:'excel', students:XP.list.slice(i, i + 1000)});
      if(!r.ok) throw new Error(r.error || 'فشل الاستيراد'); for(const k in tot) tot[k] += r[k] || 0;
    }
    await loadStudents(); renderStudents();
    $('xprev').innerHTML = `<div class="msg ok" style="margin-top:10px">✅ تم الاستيراد: ${tot.added} جديد، ${tot.updated} تحديث اسم، ${tot.same} دون تغيير${tot.skipped ? `، ${tot.skipped} متجاهل` : ''}.</div>`;
  }catch(e){ btn.disabled = false; $('xres').innerHTML = `<div class="msg bad">${esc(e.message || e)}</div>`; }
}
function csvDownload(name, text){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + text], {type:'text/csv'})); a.download = name; a.click(); }
async function downloadTemplate(){
  try{
    await loadXlsx();
    const ws = XLSX.utils.aoa_to_sheet([['رقم الاكتتاب', 'الاسم الثلاثي'], ['10001', 'أحمد محمد الأحمد'], ['10002', 'سارة خالد العلي']]);
    ws['!cols'] = [{wch:20}, {wch:36}];
    const wb = XLSX.utils.book_new(); wb.Workbook = {Views:[{RTL:true}]};
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب'); XLSX.writeFile(wb, 'نموذج_الطلاب.xlsx');
  }catch(e){                       // بديل: CSV مع سطر sep=, ليقسمه إكسل إلى عمودين في أي لغة
    csvDownload('نموذج_الطلاب.csv', 'sep=,\nرقم الاكتتاب,الاسم الثلاثي\n10001,أحمد محمد الأحمد\n10002,سارة خالد العلي\n');
  }
}
function exportStudents(){
  csvDownload('students.csv', 'رقم الاكتتاب,الاسم,مسموح,المصدر\n' + STUD.map(s => [s.reg, '"' + s.name.replace(/"/g, '""') + '"', s.enabled ? 'نعم' : 'لا', s.source === 'manual' ? 'يدوي' : 'إكسل'].join(',')).join('\n'));
}

/* =====================================================================
   تبويب الاختبارات
   ===================================================================== */
const STATUS = {published:['منشور','g'], hidden:['مخفي','a'], deleted:['محذوف','r']};
function examsTab(){
  const rows = CAT.filter(c => !c.deleted).map((m,i) => {
    const [lb, cl] = STATUS[m.status] || ['', ''];
    const acts = m.static ? '<span class="muted">اختبار ثابت (ملف في GitHub)</span>' :
      `<button class="sm sec" data-a="edit" data-id="${esc(m.id)}">✏️ تعديل</button>
       <button class="sm ${m.status === 'published' ? 'amber' : ''}" data-a="toggle" data-id="${esc(m.id)}">${m.status === 'published' ? '🙈 إخفاء' : '👁 نشر'}</button>
       <button class="sm red" data-a="del" data-id="${esc(m.id)}">🗑 حذف</button>`;
    return `<tr style="cursor:default"><td>${i+1}</td><td><b>${esc(m.title)}</b><div class="muted">${esc(m.desc || '')}</div></td><td>${m.count}</td>
      <td><span class="badge ${cl}">${lb}</span></td><td>${m.attempts ?? ALL.filter(r => r.exam === m.id).length}</td><td><div class="chips">${acts}</div></td></tr>`;
  }).join('');
  $('main').innerHTML = `<div class="card"><div class="top"><h2>إدارة الاختبارات</h2><div class="chips"><button class="amber" id="impx">📥 استيراد ملف اختبار (HTML)</button><button class="pulse" id="newx">➕ اختبار جديد (من PDF أو يدوياً)</button></div><input type="file" id="impf" accept=".html,.htm,.json" hidden></div>
    ${Net.live() ? '' : '<div class="warn">⚠️ لم يُربط الخادم (SCRIPT_URL فارغ)، لذلك لا يمكن إنشاء اختبارات جديدة.</div>'}
    <div class="scroll" style="margin-top:12px"><table class="t"><thead><tr><th>#</th><th>الاختبار</th><th>الأسئلة</th><th>الحالة</th><th>المحاولات</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  $('newx').onclick = () => builder({id:'', title:'', desc:'', status:'hidden', questions:[]});
  $('impx').onclick = () => $('impf').click();
  $('impf').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if(f) importFile(f); };
  document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => examAction(b.dataset.a, b.dataset.id));
}
async function examAction(a, id){
  const m = CAT.find(c => c.id === id);
  if(a === 'edit'){
    const r = await Net.getExam(id, KEY); if(!r.ok) return alert('تعذّر تحميل الاختبار');
    const att = ALL.filter(x => x.exam === id).length;
    if(att && !confirm(`هذا الاختبار قدّمه ${att} محاولة. تعديل الأسئلة أو الإجابات الصحيحة لا يعيد حساب النتائج القديمة. هل تريد المتابعة؟`)) return;
    return builder({id, title:r.exam.title, desc:r.exam.desc || '', status:r.exam.status,
      questions:r.exam.questions.map(q => ({q:q.q, o:q.o, a:q.a, s:q.s || '', img:q.img || '', fig:q.fig || '', h:q.h ? 1 : 0, imgData:''}))});
  }
  if(a === 'toggle'){
    const r = await Net.act({action:'setStatus', key:KEY, id, status: m.status === 'published' ? 'hidden' : 'published'});
    if(!r.ok) return alert(r.error || 'فشلت العملية'); await loadCatalog(); return examsTab();
  }
  if(a === 'del'){
    if(!confirm(`حذف «${m.title}» نهائياً؟ (نتائج الطلاب السابقة تبقى في الجدول)`)) return;
    const r = await Net.act({action:'deleteExam', key:KEY, id});
    if(!r.ok) return alert(r.error || 'فشل الحذف'); await loadCatalog(); examsTab();
  }
}


/* =====================================================================
   استيراد اختبار من ملف HTML (بصيغة ملف الاختبار الأول) أو JSON
   ===================================================================== */
const ORD = ['','الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن','التاسع','العاشر','الحادي عشر','الثاني عشر','الثالث عشر','الرابع عشر','الخامس عشر'];
function guessTitle(fileName, pageTitle){
  const m = fileName.match(/(\d+)/);
  if(m && +m[1] >= 1) return 'الاختبار التجريبي ' + (ORD[+m[1]] || 'رقم ' + m[1]);
  return (pageTitle || fileName.replace(/\.\w+$/, '')).trim();
}
/* يُشغَّل ملف HTML داخل إطار معزول (sandbox) لا يصل إلى لوحة التحكم، ثم تُقرأ منه مصفوفة QUESTIONS */
function extractFromHtml(html){
  return new Promise((res, rej) => {
    const fr = document.createElement('iframe'); fr.setAttribute('sandbox', 'allow-scripts'); fr.style.display = 'none';
    const tail = `<script>try{var Q=QUESTIONS;parent.postMessage({oly:1,ok:true,page:document.title,q:Q.map(function(x){return{q:String(x.q),o:(x.o||[]).map(String),a:Number(x.a),s:String(x.s||''),fig:typeof x.fig==='function'?String(x.fig()):(x.fig?String(x.fig):'')}})},'*')}catch(e){parent.postMessage({oly:1,ok:false,error:String(e)},'*')}<\/script>`;
    const src = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, tail + '</body>') : html + tail;
    const done = (fn, v) => { clearTimeout(t); removeEventListener('message', on); fr.remove(); fn(v); };
    const on = ev => { if(ev.source === fr.contentWindow && ev.data && ev.data.oly) ev.data.ok ? done(res, ev.data) : done(rej, new Error(ev.data.error)); };
    const t = setTimeout(() => done(rej, new Error('انتهت المهلة')), 8000);
    addEventListener('message', on); fr.srcdoc = src; document.body.appendChild(fr);
  });
}
async function importFile(f){
  try{
    const text = await f.text(); let title = '', desc = '', qs;
    if(/\.json$/i.test(f.name)){
      const j = JSON.parse(text); title = String(j.title || ''); desc = String(j.desc || '');
      qs = (j.questions || []).map(q => ({q:String(q.q || ''), o:(q.o || []).map(String), a:typeof q.a === 'string' ? LET.indexOf(q.a.trim().toUpperCase()) : Number(q.a),
        s:String(q.s || ''), fig:'', h:0, img:/^https?:/.test(q.img || '') ? q.img : '', imgData:/^data:image/.test(q.img || '') ? q.img : ''}));
    }else{
      const r = await extractFromHtml(text);
      qs = r.q.map(q => ({q:q.q, o:q.o, a:q.a, s:q.s, fig:q.fig, h:1, img:'', imgData:''}));
      title = guessTitle(f.name, r.page);
    }
    if(!qs.length) throw new Error('لا توجد أسئلة');
    const bad = qs.findIndex(q => q.o.length < 2 || q.o.length > 5 || !(q.a >= 0 && q.a < q.o.length));
    if(bad >= 0) throw new Error('السؤال ' + (bad + 1) + ' خياراته أو إجابته الصحيحة غير صالحة');
    if(CAT.some(c => c.title === title) && !confirm(`يوجد اختبار بالاسم «${title}» بالفعل. سيُضاف هذا كاختبار جديد بالاسم نفسه (يمكنك تغيير الاسم قبل النشر). متابعة؟`)) return;
    const direct = confirm(`تم العثور على ${qs.length} سؤالاً بعنوان:\n«${title}»\n\nموافق = نشره للطلاب الآن مباشرة\nإلغاء = فتحه للمراجعة والتعديل أولاً`);
    builder({id:'', title, desc, status:'hidden', questions:qs});
    if(direct) save('published');
  }catch(err){
    alert('تعذّر استيراد الملف: ' + (err.message || err) + '\n\nتأكد أن الملف يحتوي مصفوفة const QUESTIONS بنفس صيغة ملف الاختبار الأول.');
  }
}

/* =====================================================================
   منشئ الاختبارات
   ===================================================================== */
let D = null, PDF = null, PG = 1, ZOOM = 1.4, SEL = null, lastField = null;
const emptyQ = () => ({q:'', o:['','','',''], a:-1, s:'', img:'', fig:'', h:0, imgData:''});

function builder(draft){
  D = draft; PDF = null; PG = 1; SEL = null; lastField = null;
  $('main').innerHTML = `
  <div class="card"><div class="top"><h2>${D.id ? '✏️ تعديل اختبار' : '➕ اختبار جديد'}</h2><button class="sec sm" id="bback">⬅ رجوع للقائمة</button></div>
    <label>عنوان الاختبار</label><input id="d_t" value="${esc(D.title)}" placeholder="مثال: الاختبار التجريبي الثاني">
    <label>وصف قصير (يظهر على البطاقة)</label><input id="d_d" value="${esc(D.desc)}" placeholder="مثال: أسئلة المرحلة الثانية 2025"></div>
  <div class="card"><h2>1) مصدر الأسئلة <span class="muted">(اختياري — يمكنك كتابة الأسئلة يدوياً)</span></h2>
    <input type="file" id="pdf" accept="application/pdf">
    <div class="chips"><button class="sm" id="ext" disabled>⚙ استخراج الأسئلة من الـ PDF</button></div>
    <details><summary>أو الصق نص الأسئلة هنا</summary>
      <textarea id="paste" rows="8" placeholder="1. نص السؤال&#10;A) ... B) ... C) ... D) ...&#10;2. ..."></textarea><button class="sm" id="parse">⚙ تحليل النص</button></details>
    <label>مفتاح الإجابات (اختياري): حرف لكل سؤال بالترتيب</label>
    <input id="keyin" dir="ltr" placeholder="ACBCD..." autocomplete="off">
    <div class="warn">الاستخراج التلقائي مسودة فقط: راجع كل سؤال وصحّح النص وحدد الإجابة الصحيحة. للأشكال والجداول استخدم أداة القص أدناه.</div>
    <div id="pdfbox"></div></div>
  <div class="card"><div class="top"><h2>2) مراجعة الأسئلة <span class="muted" id="qc"></span></h2>
      <span class="muted">لنص إنجليزي/كود داخل جملة عربية: حدّده واضغط «LTR»</span></div>
    <div id="cards"></div><button class="sec" id="addq">➕ إضافة سؤال</button></div>
  <div class="card"><h2>3) الحفظ والنشر</h2><div id="saveerr"></div>
    <div class="nav" style="justify-content:flex-start"><button class="sec" id="sv_h">💾 حفظ كمسودة (مخفي)</button><button class="pulse" id="sv_p">🚀 حفظ ونشر للطلاب</button></div></div>`;
  $('bback').onclick = () => { if(!D.questions.length || confirm('الخروج دون حفظ؟ ستضيع التعديلات غير المحفوظة.')) examsTab(); };
  $('addq').onclick = () => { D.questions.push(emptyQ()); renderCards(); };
  $('pdf').onchange = onPdf; $('ext').onclick = extractPdf;
  $('parse').onclick = () => { const t = $('paste').value.trim(); if(t) loadParsed(parseText(t)); };
  $('keyin').onchange = applyKey;
  $('sv_h').onclick = () => save('hidden'); $('sv_p').onclick = () => save('published');
  $('cards').addEventListener('focusin', e => { if(e.target.matches('textarea,input[data-f]')) lastField = e.target; });
  $('cards').addEventListener('input', cardInput); $('cards').addEventListener('change', cardInput);
  $('cards').addEventListener('click', cardClick);
  renderCards();
}

/* ---------- بطاقات الأسئلة ---------- */
function renderCards(){
  $('qc').textContent = `(${D.questions.length})`;
  $('cards').innerHTML = D.questions.length ? D.questions.map((Q,i) => `<div class="qcard" data-i="${i}">
    <div class="top"><b>سؤال ${i+1}${Q.h ? '<span class="tag" title="نص السؤال والحل بصيغة HTML">HTML</span>' : ''}</b><div class="chips">
      <button class="sec sm" data-act="ltr" title="يحيط النص المحدد بعلامتي {{ }} فيُعرض من اليسار لليمين">LTR</button>
      <button class="sec sm" data-act="up">▲</button><button class="sec sm" data-act="dn">▼</button><button class="red sm" data-act="del">🗑</button></div></div>
    <textarea rows="3" data-f="q" placeholder="نص السؤال">${esc(Q.q)}</textarea>
    ${Q.fig ? `<div class="figprev">${clean(Q.fig)}</div><button class="sec sm" data-act="rmfig">إزالة الشكل المرفق</button>` : ''}
    ${(Q.img || Q.imgData) ? `<div class="thumb"><img src="${esc(Q.imgData || Q.img)}" alt=""><button class="sec sm" data-act="rmimg">إزالة الصورة</button></div>` : ''}
    ${Q.o.map((t,k) => `<div class="orow"><label class="rad"><input type="radio" name="a${i}" data-f="a" value="${k}" ${Q.a === k ? 'checked' : ''}>${LET[k]}</label>
      <input data-f="o" data-k="${k}" value="${esc(t)}" placeholder="الخيار ${LET[k]}"><button class="sec sm" data-act="rmo" data-k="${k}">✕</button></div>`).join('')}
    <div class="chips"><button class="sec sm" data-act="addo" ${Q.o.length >= 5 ? 'disabled' : ''}>＋ خيار</button>
      <span class="muted">${Q.a < 0 ? '⚠️ حدد الإجابة الصحيحة بالدائرة' : '✔ الإجابة الصحيحة: ' + LET[Q.a]}</span></div>
    <textarea rows="2" data-f="s" placeholder="طريقة الحل (اختياري)">${esc(Q.s)}</textarea></div>`).join('')
    : '<p class="muted">لا توجد أسئلة بعد. ارفع PDF أو أضف سؤالاً.</p>';
  refreshSelq();
}
function cardInput(e){
  const t = e.target, card = t.closest('.qcard'); if(!card || !t.dataset.f) return;
  const Q = D.questions[+card.dataset.i], f = t.dataset.f;
  if(f === 'q') Q.q = t.value; else if(f === 's') Q.s = t.value;
  else if(f === 'o') Q.o[+t.dataset.k] = t.value;
  else if(f === 'a' && e.type === 'change'){ Q.a = +t.value; renderCards(); }
}
function cardClick(e){
  const b = e.target.closest('button[data-act]'); if(!b) return;
  const card = b.closest('.qcard'), i = +card.dataset.i, Q = D.questions[i], a = b.dataset.act;
  if(a === 'ltr'){
    const f = lastField; if(!f || !card.contains(f) || f.selectionStart === f.selectionEnd) return alert('حدّد أولاً النص الإنجليزي أو الكود داخل الحقل.');
    const s = f.selectionStart, en = f.selectionEnd; f.value = f.value.slice(0,s) + '{{' + f.value.slice(s,en) + '}}' + f.value.slice(en);
    f.dispatchEvent(new Event('input', {bubbles:true})); return;
  }
  if(a === 'del'){ if(!confirm('حذف هذا السؤال؟')) return; D.questions.splice(i,1); }
  else if(a === 'up' && i > 0) [D.questions[i-1], D.questions[i]] = [D.questions[i], D.questions[i-1]];
  else if(a === 'dn' && i < D.questions.length-1) [D.questions[i+1], D.questions[i]] = [D.questions[i], D.questions[i+1]];
  else if(a === 'addo' && Q.o.length < 5) Q.o.push('');
  else if(a === 'rmo'){ if(Q.o.length <= 2) return alert('يجب أن يبقى خياران على الأقل.'); const k = +b.dataset.k; Q.o.splice(k,1); if(Q.a === k) Q.a = -1; else if(Q.a > k) Q.a--; }
  else if(a === 'rmimg'){ Q.img = ''; Q.imgData = ''; }
  else if(a === 'rmfig'){ Q.fig = ''; }
  renderCards();
}
function applyKey(){
  const k = $('keyin').value.toUpperCase().replace(/[^A-E]/g,'');
  D.questions.forEach((Q,i) => { const n = LET.indexOf(k[i]); if(n >= 0 && n < Q.o.length) Q.a = n; });
  renderCards();
}

/* ---------- تحليل النص إلى أسئلة ---------- */
function parseText(text){
  const lines = text.replace(/\r/g,'').split('\n').map(l => l.trim()).filter(Boolean);
  const startRe = /^(?:السؤال|سؤال|س|Q|q)?\s*[\(\[]?(\d{1,3})[\)\]]?\s*[\.\-\):،\u060C]\s*(.*)$/;
  const blocks = []; let cur = null, next = 1;
  for(const ln of lines){
    const m = ln.match(startRe);
    if(m && +m[1] === next){ cur = {raw:m[2]}; blocks.push(cur); next++; continue; }
    if(cur) cur.raw += '\n' + ln;
  }
  return blocks.map(b => splitOptions(b.raw));
}
function splitOptions(raw){
  const sets = [['A','B','C','D','E'], ['a','b','c','d','e'], ['أ','ب','ج','د','هـ']];
  for(const set of sets){
    const pos = []; let from = 0;
    for(const L of set){
      const lab = L === 'هـ' ? 'هـ|ه' : L;
      const re = new RegExp('(^|\\s)[\\(\\[]?(?:' + lab + ')[\\)\\]\\.\\-:–](?=\\s|$)', 'g'); re.lastIndex = from;
      const m = re.exec(raw); if(!m) break;
      pos.push({s:m.index + m[1].length, e:m.index + m[0].length}); from = m.index + m[0].length;
    }
    if(pos.length >= 2){
      const o = pos.map((p,i) => raw.slice(p.e, i + 1 < pos.length ? pos[i+1].s : raw.length).replace(/\s*\n\s*/g,' ').trim());
      return {q:raw.slice(0, pos[0].s).trim(), o, a:-1, s:'', img:'', imgData:''};
    }
  }
  return {q:raw.trim(), o:['','','',''], a:-1, s:'', img:'', imgData:''};
}
function loadParsed(qs){
  if(!qs.length) return alert('لم أستطع التعرف على أسئلة مرقّمة (1. 2. 3. ...). يمكنك إضافتها يدوياً أو تعديل النص ثم إعادة المحاولة.');
  if(D.questions.length && !confirm('سيتم استبدال الأسئلة الحالية بالمستخرجة. متابعة؟')) return;
  D.questions = qs; if($('keyin').value) applyKey(); else renderCards();
  alert(`تم استخراج ${qs.length} سؤالاً كمسودة. راجعها بعناية وحدّد الإجابات الصحيحة.`);
}

/* ---------- PDF ---------- */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = PDFJS;
    s.onload = () => {
      const blob = new Blob([`importScripts("${PDFJS_WORKER}");`], {type:'text/javascript'});
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob); res();
    };
    s.onerror = () => rej(new Error('تعذّر تحميل مكتبة قراءة PDF، تحقق من الاتصال بالإنترنت.')); document.head.appendChild(s);
  });
}
async function onPdf(){
  const f = $('pdf').files[0]; if(!f) return;
  $('ext').disabled = true; $('pdfbox').innerHTML = '<div class="muted">جارٍ قراءة الملف...</div>';
  try{
    await loadPdfJs(); PDF = await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;
    PG = 1; $('ext').disabled = false; viewerUI(); await renderPage();
  }catch(e){ $('pdfbox').innerHTML = `<div class="msg bad">${esc(e.message || 'تعذّر فتح الملف')}</div>`; }
}
function viewerUI(){
  $('pdfbox').innerHTML = `<div class="chips" style="margin-top:12px"><button class="sec sm" id="pp">◀ السابقة</button><b id="pn"></b><button class="sec sm" id="pnx">التالية ▶</button>
    <button class="sec sm" id="zo">−</button><button class="sec sm" id="zi">＋</button></div>
    <div class="chips" style="margin-top:8px"><span class="muted">لإرفاق شكل: اسحب بالفأرة على الصفحة، ثم اختر السؤال:</span>
      <select id="selq" style="width:auto;margin:0"></select><button class="amber sm" id="crop" disabled>✂ إرفاق المحدد بالسؤال</button></div>
    <div class="pdfwrap"><div class="pdfin" id="pin"><canvas id="pc"></canvas><div class="selbox" id="sb"></div></div></div>`;
  $('pp').onclick = () => { if(PG > 1){ PG--; renderPage(); } };
  $('pnx').onclick = () => { if(PG < PDF.numPages){ PG++; renderPage(); } };
  $('zo').onclick = () => { ZOOM = Math.max(.6, ZOOM - .2); renderPage(); };
  $('zi').onclick = () => { ZOOM = Math.min(3, ZOOM + .2); renderPage(); };
  $('crop').onclick = cropToQuestion; refreshSelq();
  const pin = $('pin'); let st = null;
  const pt = e => { const r = $('pc').getBoundingClientRect(); return {x:Math.min(Math.max(e.clientX - r.left,0), r.width), y:Math.min(Math.max(e.clientY - r.top,0), r.height), r}; };
  pin.onpointerdown = e => { st = pt(e); pin.setPointerCapture(e.pointerId); SEL = null; $('crop').disabled = true; };
  pin.onpointermove = e => { if(!st) return; const c = pt(e), sb = $('sb');
    Object.assign(sb.style, {display:'block', left:Math.min(st.x,c.x) + 'px', top:Math.min(st.y,c.y) + 'px', width:Math.abs(c.x-st.x) + 'px', height:Math.abs(c.y-st.y) + 'px'}); };
  pin.onpointerup = e => { if(!st) return; const c = pt(e), k = $('pc').width / c.r.width;
    const x = Math.min(st.x,c.x) * k, y = Math.min(st.y,c.y) * k, w = Math.abs(c.x-st.x) * k, h = Math.abs(c.y-st.y) * k; st = null;
    if(w > 12 && h > 12){ SEL = {x,y,w,h}; $('crop').disabled = !D.questions.length; } else $('sb').style.display = 'none'; };
}
function refreshSelq(){
  const s = $('selq'); if(!s) return; const v = s.value;
  s.innerHTML = D.questions.map((_,i) => `<option value="${i}">سؤال ${i+1}</option>`).join(''); if(v) s.value = v;
  if($('crop')) $('crop').disabled = !SEL || !D.questions.length;
}
async function renderPage(){
  const page = await PDF.getPage(PG), vp = page.getViewport({scale:ZOOM}), cv = $('pc');
  cv.width = vp.width; cv.height = vp.height; $('sb').style.display = 'none'; SEL = null; $('crop').disabled = true;
  $('pn').textContent = `صفحة ${PG} / ${PDF.numPages}`;
  await page.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise;
}
function cropToQuestion(){
  if(!SEL || !D.questions.length) return;
  const src = $('pc'), k = Math.min(1, 1000 / SEL.w), out = document.createElement('canvas');
  out.width = Math.round(SEL.w * k); out.height = Math.round(SEL.h * k);
  const c = out.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0,0,out.width,out.height);
  c.drawImage(src, SEL.x, SEL.y, SEL.w, SEL.h, 0, 0, out.width, out.height);
  const i = +$('selq').value; D.questions[i].imgData = out.toDataURL('image/jpeg', .85);
  $('sb').style.display = 'none'; SEL = null; $('crop').disabled = true; renderCards();
}
async function pdfText(){
  let out = [];
  for(let n = 1; n <= PDF.numPages; n++){
    const tc = await (await PDF.getPage(n)).getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({s:it.str, x:it.transform[4], y:it.transform[5]}));
    items.sort((a,b) => b.y - a.y);
    const lines = []; 
    for(const it of items){ const L = lines[lines.length-1]; if(L && Math.abs(L.y - it.y) <= 3) L.items.push(it); else lines.push({y:it.y, items:[it]}); }
    for(const L of lines){
      const joined = L.items.map(i => i.s).join(''), ar = (joined.match(/[\u0600-\u06FF]/g) || []).length > joined.length * .3;
      L.items.sort((a,b) => ar ? b.x - a.x : a.x - b.x); out.push(L.items.map(i => i.s).join(' ').replace(/\s+/g,' ').trim());
    }
  }
  return out.join('\n');
}
async function extractPdf(){
  const b = $('ext'); b.disabled = true; b.textContent = 'جارٍ الاستخراج...';
  try{
    const txt = await pdfText(); $('paste').value = txt; $('paste').closest('details').open = true;
    if(txt.trim().length < 30) alert('لم يُستخرج نص من الملف (ربما هو صور ممسوحة ضوئياً). يمكنك كتابة الأسئلة يدوياً واستعمال أداة القص لإرفاق صور الأسئلة.');
    else loadParsed(parseText(txt));
  }catch(e){ alert('تعذّر استخراج النص: ' + (e.message || e)); }
  b.disabled = false; b.textContent = '⚙ استخراج الأسئلة من الـ PDF';
}

/* ---------- الحفظ ---------- */
async function save(status){
  const err = $('saveerr'); err.innerHTML = '';
  D.title = $('d_t').value.trim(); D.desc = $('d_d').value.trim();
  const fail = m => { err.innerHTML = `<div class="msg bad">${esc(m)}</div>`; err.scrollIntoView({behavior:'smooth', block:'center'}); };
  if(!D.title) return fail('اكتب عنوان الاختبار.');
  if(!D.questions.length) return fail('أضف سؤالاً واحداً على الأقل.');
  if(!Net.live()) return fail('يجب ربط الخادم (SCRIPT_URL) لحفظ الاختبارات.');
  // تنظيف الخيارات الفارغة مع تصحيح رقم الإجابة الصحيحة
  for(let i = 0; i < D.questions.length; i++){
    const Q = D.questions[i], keep = Q.o.map((t,k) => t.trim() ? k : -1).filter(k => k >= 0);
    if(!Q.q.trim()) return fail(`السؤال ${i+1}: نص السؤال فارغ.`);
    if(keep.length < 2) return fail(`السؤال ${i+1}: يحتاج خيارين على الأقل.`);
    if(Q.a < 0 || !keep.includes(Q.a)) return fail(`السؤال ${i+1}: حدد الإجابة الصحيحة.`);
    Q.a = keep.indexOf(Q.a); Q.o = keep.map(k => Q.o[k].trim());
  }
  const b1 = $('sv_h'), b2 = $('sv_p'); b1.disabled = b2.disabled = true;
  try{
    const withImg = D.questions.filter(Q => Q.imgData);
    for(let j = 0; j < withImg.length; j++){
      err.innerHTML = `<div class="msg ok">جارٍ رفع الصور ${j+1} من ${withImg.length}...</div>`;
      const r = await Net.act({action:'uploadImage', key:KEY, data:withImg[j].imgData.split(',')[1], mime:'image/jpeg'});
      if(!r.ok) throw new Error(r.error || 'فشل رفع صورة');
      withImg[j].img = r.url; withImg[j].imgData = '';
    }
    err.innerHTML = '<div class="msg ok">جارٍ حفظ الاختبار...</div>';
    const r = await Net.act({action:'saveExam', key:KEY, exam:{id:D.id, title:D.title, desc:D.desc, status,
      questions:D.questions.map(({q,o,a,s,img,fig,h}) => ({q,o,a,s,img,fig:fig || '',h:h ? 1 : 0}))}});
    if(!r.ok) throw new Error(r.error || 'فشل الحفظ');
    D.id = r.id; await loadCatalog(); TAB = 'exams'; shell();
    alert(status === 'published' ? '✅ تم النشر، الاختبار ظاهر الآن للطلاب.' : '✅ تم الحفظ كمسودة (مخفي عن الطلاب).');
  }catch(e){ fail('تعذّر الحفظ: ' + (e.message || e)); b1.disabled = b2.disabled = false; }
}

KEY ? load() : login();
})();
