/* واجهة الطالب: الدخول ← قائمة الاختبارات ← الاختبار ← النتيجة/المراجعة */
(function(){
const {CFG, LET, esc, store, Net, ctx, loadExam, loadCatalog, renderMath, brandHTML, initFW, burst, celebrate} = OLY;
document.getElementById('brand').innerHTML = brandHTML(); initFW();
document.title = 'الاختبارات التجريبية' + (CFG.SUBJECT ? ' — ' + CFG.SUBJECT : '');
const DENY = {not_allowed:'رقم الاكتتاب هذا غير مدرج في قائمة المسموح لهم بتقديم الاختبارات. يرجى التواصل مع مكتب الأولمبياد.', blocked:'تم إيقاف تقديم الاختبارات لهذا الرقم مؤقتاً. يرجى التواصل مع مكتب الأولمبياد.'};
const $app = document.getElementById('app'), $ = id => document.getElementById(id);
let MAN = window.EXAMS_MANIFEST || [];   // يُستبدل بالكتالوج (الثابت + المحفوظ على الخادم)
let STU = store.get('oly_student');     // {reg, name}
if(STU) ctx.reg = STU.reg;
let RES = {};                           // examId -> نتيجة الطالب المسجّلة
let S = null, EX = null, showSol = false, justFinished = false;
const stKey = id => `oly_st_${id}_${STU.reg}`;
const save = () => store.set(S.key, S);
const score = () => S.answers.reduce((t,a,i) => t + (a === EX.questions[i].a ? 1 : 0), 0);

/* ---------- الدخول ---------- */
async function loginScreen(err=''){
  $app.innerHTML = '<div class="card"><div class="skel" style="height:140px"></div></div>';
  let restrict = false;
  try{ restrict = !!(await Net.config()).restrict; }catch(e){ err = err || 'تعذّر الاتصال بالخادم، تحقق من الإنترنت وأعد تحميل الصفحة.'; }
  $app.innerHTML = `<div class="card"><h1>مرحباً بك في الاختبارات التجريبية 👋</h1>
  <p class="muted">${restrict ? 'أدخل رقم الاكتتاب الخاص بك. يُسمح بالدخول للطلاب المسجّلين لدى المكتب فقط.' : 'أدخل رقم الاكتتاب والاسم الثلاثي مرة واحدة، وستظهر لك قائمة الاختبارات المتاحة وحالة كل اختبار.'}</p>
  <label>رقم الاكتتاب</label><input id="reg" inputmode="numeric" autocomplete="off">
  ${restrict ? '' : '<label>الاسم الثلاثي</label><input id="nm" autocomplete="off">'}
  ${err ? `<div class="msg bad">${esc(err)}</div>` : ''}
  <button class="pulse" id="go">دخول</button></div>`;
  const go = async () => {
    const reg = OLY.normDigits($('reg').value.trim());
    if(!/^\d{1,12}$/.test(reg)) return loginScreen('رقم الاكتتاب يجب أن يكون أرقاماً فقط.');
    let name = '';
    if(restrict){
      $('go').disabled = true; $('go').textContent = 'جارٍ التحقق...';
      let r; try{ r = await Net.login(reg); }catch(e){ return loginScreen('تعذّر الاتصال بالخادم، حاول مرة أخرى.'); }
      if(!r.ok) return loginScreen(DENY[r.error] || 'تعذّر التحقق من رقم الاكتتاب.');
      name = r.name;
    }else{
      name = $('nm').value.trim().replace(/\s+/g,' ');
      if(name.split(' ').length < 3) return loginScreen('اكتب الاسم الثلاثي كاملاً.');
    }
    STU = {reg, name}; ctx.reg = reg; store.set('oly_student', STU); home();
  };
  $('go').onclick = go;
  $('reg').onkeydown = e => { if(e.key === 'Enter') go(); };
  if($('nm')) $('nm').onkeydown = e => { if(e.key === 'Enter') go(); };
}

/* ---------- الصفحة الرئيسية: قائمة الاختبارات ---------- */
async function home(){
  S = null; EX = null; scrollTo(0,0);
  if(!STU) return loginScreen();
  $app.innerHTML = `<div class="card hello"><div><b>أهلاً ${esc(STU.name)}</b><div class="muted">رقم الاكتتاب: ${esc(STU.reg)}</div></div>
    <button class="sec sm" id="out">تغيير الطالب</button></div>
    <div class="grid"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;
  document.getElementById('out').onclick = () => { store.del('oly_student'); STU = null; ctx.reg = ''; loginScreen(); };
  let offline = false;
  MAN = await loadCatalog();
  try{
    const r = await Net.student(STU.reg);
    if(r.ok === false && DENY[r.error]){ store.del('oly_student'); STU = null; ctx.reg = ''; return loginScreen(DENY[r.error]); }
    RES = {}; (r.results || []).forEach(x => RES[x.exam] = x);
    store.set('oly_res_' + STU.reg, RES);
  }catch(e){ RES = store.get('oly_res_' + STU.reg) || {}; offline = true; }
  renderHome(offline);
}
function renderHome(offline){
  const done = MAN.filter(m => RES[m.id]);
  const avg = done.length ? Math.round(done.reduce((t,m) => t + RES[m.id].score / (m.count || 1) * 100, 0) / done.length) : 0;
  const cards = MAN.map((m, i) => {
    const r = RES[m.id], st = STU && store.get(stKey(m.id));
    const pend = !r && st && st.done;              // انتهى محلياً ولم تُرسل نتيجته
    const prog = !r && st && !st.done;
    let cls = '', info = '', btn = '';
    if(r){
      cls = 'done';
      info = `<span class="badge g">✔ تم تقديمه</span><div class="score-line">العلامة ${r.score} / ${m.count}${r.rank ? ` — الترتيب ${r.rank} من ${r.total}` : ''}</div>`;
      btn = `<button data-act="open" data-id="${m.id}">عرض الحل والأخطاء</button>`;
    }else if(pend){
      cls = 'prog'; info = `<span class="badge r">النتيجة لم تُرسل بعد</span>`;
      btn = `<button class="red pulse" data-act="open" data-id="${m.id}">إرسال النتيجة</button>`;
    }else if(prog){
      const n = st.answers.filter(a => a >= 0).length;
      cls = 'prog'; info = `<span class="badge a">قيد الحل — أجبت عن ${n} من ${m.count}</span>`;
      btn = `<button class="amber pulse" data-act="open" data-id="${m.id}">متابعة الاختبار</button>`;
    }else{
      info = `<span class="badge">${m.count} سؤالاً — لم يُقدَّم بعد</span>`;
      btn = `<button class="pulse" data-act="open" data-id="${m.id}">ابدأ الاختبار</button>`;
    }
    return `<div class="ex ${cls}" style="animation-delay:${i*70}ms"><div class="num">${i+1}</div><h3>${esc(m.title)}</h3>
      <div class="d">${esc(m.desc || '')}</div>${info}${btn}</div>`;
  }).join('');
  $app.innerHTML = `<div class="card hello"><div><b>أهلاً ${esc(STU.name)}</b><div class="muted">رقم الاكتتاب: ${esc(STU.reg)}</div></div>
    <button class="sec sm" id="out">تغيير الطالب</button></div>
    ${offline ? '<div class="msg bad">⚠️ تعذّر الاتصال بالخادم، تظهر آخر حالة محفوظة على هذا الجهاز.</div><br>' : ''}
    <div class="kpis"><div class="kpi"><b>${done.length} / ${MAN.length}</b><span>اختبارات منجزة</span></div>
      <div class="kpi"><b>${done.length ? avg + '%' : '—'}</b><span>متوسط نسبتك</span></div></div>
    <h2>الاختبارات المتاحة</h2><div class="grid">${cards}</div>`;
  document.getElementById('out').onclick = () => { store.del('oly_student'); STU = null; ctx.reg = ''; loginScreen(); };
  document.querySelectorAll('[data-act="open"]').forEach(b => b.onclick = () => openExam(b.dataset.id));
}

/* ---------- فتح اختبار ---------- */
async function openExam(id){
  $app.innerHTML = '<div class="card"><div class="skel"></div></div>'; scrollTo(0,0);
  try{ EX = await loadExam(id); }catch(e){
    if(e.message === 'NOT_ALLOWED'){ store.del('oly_student'); STU = null; ctx.reg = ''; return loginScreen(DENY.not_allowed); }
    alert('تعذّر تحميل الاختبار، تحقق من الاتصال.'); return home();
  }
  const N = EX.questions.length, key = stKey(id), r = RES[id];
  let st = store.get(key);
  if(st && st.answers.length !== N){                 // عُدِّل الاختبار بعد بدء الطالب
    st.answers = Array.from({length:N}, (_, i) => st.answers[i] ?? -1); st.idx = Math.min(st.idx, N-1); store.set(key, st);
  }
  if(r){                                   // مقدَّم مسبقاً: ابنِ الحالة من نتيجة الخادم
    st = {answers: String(r.answers).split('').map(c => LET.indexOf(c)), idx:0, start:0, end:r.seconds*1000, done:true, sent:true};
    while(st.answers.length < N) st.answers.push(-1);
    store.set(key, st);
  }else if(!st){
    try{
      const c = await Net.check(id, STU.reg);
      if(c.exists){ alert('تم تقديم هذا الاختبار مسبقاً برقم الاكتتاب هذا.'); return home(); }
    }catch(e){ alert('تعذّر الاتصال بالخادم، تحقق من الإنترنت وأعد المحاولة.'); return home(); }
    st = {answers:Array(N).fill(-1), idx:0, start:Date.now(), done:false};
  }
  S = st; S.key = key; S.id = id; showSol = S.done;
  if(S.done) return final();
  question();
}

/* ---------- شاشة السؤال ---------- */
function question(){
  const N = EX.questions.length, i = S.idx, Q = EX.questions[i], ans = S.answers[i], locked = ans >= 0 || S.done;
  $app.innerHTML = `<div class="card"><div class="top"><button class="sec sm" id="home">⬅ القائمة الرئيسية</button><span class="muted">${esc(EX.title)} — العلامة الحالية: ${score()}</span></div>
  <div class="top" style="margin-top:12px"><b>السؤال ${i+1} من ${N}</b></div>
  <div class="bar"><i style="width:${(i/N)*100}%"></i></div>
  <div>${Q.q}</div>${Q.fig ? Q.fig() : ''}
  <div id="opts">${Q.o.map((t,k) => `<button class="opt ${locked ? (k === Q.a ? 'ok' : (k === ans ? 'bad' : '')) : ''}" data-k="${k}" ${locked ? 'disabled' : ''}><span class="l">${LET[k]}</span><span dir="auto">${esc(t)}</span></button>`).join('')}</div>
  <div id="fb"></div>
  <div class="nav"><button class="sec" id="prev" ${i === 0 ? 'disabled' : ''}>السابق</button>
  <button class="sec ${locked ? '' : 'hide'}" id="sb">${showSol ? 'إخفاء طريقة الحل' : 'عرض طريقة الحل'}</button>
  <button class="${locked && !(i === N-1 && S.done) ? 'pulse' : ''}" id="next" ${locked ? '' : 'disabled'}>${i === N-1 ? (S.done ? 'العودة للنتيجة' : 'إنهاء الاختبار') : 'التالي'}</button></div>
  <div class="sol ${locked && showSol ? '' : 'hide'}" id="sol"><b>طريقة الحل:</b><br>${Q.s}</div></div>`;
  if(ans >= 0) feedback(ans === Q.a);
  renderMath($app);
  document.getElementById('home').onclick = home;
  document.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const k = +b.dataset.k; S.answers[i] = k; save();
    if(k === Q.a){ const r = b.getBoundingClientRect(); burst(r.left + r.width/2, r.top, 80); celebrate(2); }
    showSol = false; question();
  });
  document.getElementById('prev').onclick = () => { S.idx--; showSol = S.done; save(); question(); };
  document.getElementById('sb').onclick = () => { showSol = !showSol; question(); };
  document.getElementById('next').onclick = () => {
    if(i === N-1) return S.done ? final() : finish();
    S.idx++; showSol = S.done; save(); question(); scrollTo(0,0);
  };
}
function feedback(ok){
  document.getElementById('fb').innerHTML = ok ? '<div class="msg ok">🎉 إجابة صحيحة! أحسنت</div>'
    : '<div class="msg bad">إجابة غير صحيحة — يمكنك الاطلاع على طريقة الحل لتتعلم منها</div>';
}

/* ---------- الإنهاء والإرسال ---------- */
function finish(){
  if(S.answers.some(a => a < 0) && !confirm('لديك أسئلة لم تُجب عنها. هل تريد الإنهاء؟')) return;
  S.done = true; S.end = Date.now(); S.sent = false; save(); justFinished = true; final();
}
let sending = false;
async function send(){
  if(sending) return; sending = true;
  const st = document.getElementById('sendst');
  if(st) st.textContent = Net.live() ? 'جارٍ إرسال النتيجة...' : 'وضع تجريبي: النتيجة تُحفظ على هذا الجهاز فقط.';
  try{
    const secs = Math.round((S.end - S.start) / 1000);
    const answers = S.answers.map(a => a < 0 ? '-' : LET[a]).join('');
    const r = await Net.submit({exam:S.id, reg:STU.reg, name:STU.name, answers, seconds:secs});
    if(r.ok || r.error === 'dup'){
      S.sent = true; save();
      RES[S.id] = {exam:S.id, name:STU.name, score:score(), seconds:secs, answers, rank:r.rank, total:r.total};
      store.set('oly_res_' + STU.reg, RES);
      if(st) st.innerHTML = r.ok ? '✅ تم تسجيل نتيجتك بنجاح.' : 'ℹ️ نتيجتك مسجّلة مسبقاً.';
      const rk = document.getElementById('rk');
      if(rk && r.rank) rk.textContent = `ترتيبك بين المقدّمين: ${r.rank} من ${r.total}`;
    }else if(st) st.innerHTML = 'تعذّر الإرسال: ' + esc(DENY[r.error] || r.error || '') + ' <button class="sm" id="rt">إعادة المحاولة</button>';
  }catch(e){ if(st) st.innerHTML = '⚠️ تعذّر الاتصال بالخادم. <button class="sm" id="rt">إعادة المحاولة</button>'; }
  sending = false; const rt = document.getElementById('rt'); if(rt) rt.onclick = send;
}
function final(){
  const N = EX.questions.length, sc = score(), pc = Math.round(sc / N * 100);
  const praise = pc >= 90 ? 'أداء مذهل! 🏆' : pc >= 70 ? 'ممتاز جداً! 🌟' : pc >= 50 ? 'جيد، وتستطيع التحسّن أكثر 👍' : 'استمر في التدرب، ومراجعة الحلول ستفيدك كثيراً 💪';
  const r = RES[S.id];
  $app.innerHTML = `<div class="card"><h1>${S.sent ? 'نتيجتك في' : 'انتهى'} ${esc(EX.title)}</h1><div class="muted">${esc(STU.name)} — رقم الاكتتاب ${esc(STU.reg)}</div>
  <div class="big">${sc} / ${N}</div><div style="text-align:center"><b>${praise}</b></div>
  <div class="rank" id="rk">${r && r.rank ? `ترتيبك بين المقدّمين: ${r.rank} من ${r.total}` : ''}</div>
  <p id="sendst" class="muted" style="text-align:center"></p>
  <div class="rv">${S.answers.map((a,i) => `<span class="${a < 0 ? 'n' : a === EX.questions[i].a ? 'g' : 'r'}" title="سؤال ${i+1}">${i+1}</span>`).join('')}</div>
  <p class="muted">أخضر = صحيح، أحمر = خطأ، رمادي = بلا إجابة. اضغط على رقم السؤال لمراجعته مع طريقة الحل.</p>
  <div class="nav" style="justify-content:flex-start"><button class="sec" id="rev">مراجعة الأسئلة والحلول</button>
  <button class="pulse" id="back">🏠 العودة إلى قائمة الاختبارات</button></div></div>`;
  document.querySelectorAll('.rv span').forEach((el,i) => el.onclick = () => { S.idx = i; showSol = true; question(); });
  document.getElementById('rev').onclick = () => { S.idx = 0; showSol = true; question(); };
  document.getElementById('back').onclick = home;
  if(!S.sent) send(); else { const st = document.getElementById('sendst'); if(st) st.textContent = '✅ نتيجتك مسجّلة.'; }
  if(justFinished){ justFinished = false; celebrate(pc >= 70 ? 8 : 4); }
}

home();
})();
