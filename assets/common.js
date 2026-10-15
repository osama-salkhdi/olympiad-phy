/* مكتبة مشتركة: الشبكة، التخزين، الاختبارات، المؤثرات */
(function(){
const CFG = window.CFG || {};
const LET = ['A','B','C','D','E'];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};

/* ---------- الاختبارات ---------- */
const EXAMS = {};
const ctx = {key:''};                    // مفتاح المشرف (تضعه لوحة التحكم)
let META = {};                           // id -> {id,title,desc,count,status,static}
window.registerExam = e => { EXAMS[e.id] = e; };
/* تنسيق نص السؤال المكتوب من لوحة التحكم: {{نص}} = اتجاه يسار-يمين، **نص** = غامق */
const fmt = t => esc(t).replace(/\{\{([\s\S]+?)\}\}/g,'<bdi class="ltr">$1</bdi>').replace(/\*\*([\s\S]+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
/* تنظيف HTML قادم من ملف مستورد: حذف السكربتات والأحداث والروابط الخطرة */
function clean(html){
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,link,meta,base,form,input,button,textarea').forEach(n => n.remove());
  doc.body.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
    if(/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
  }));
  return doc.body.innerHTML;
}
function buildExam(d){
  return {id:d.id, title:d.title, questions:(d.questions||[]).map(q => {
    const fig = (q.fig ? clean(q.fig) : '') + (q.img ? `<img class="qimg" src="${esc(q.img)}" alt="شكل السؤال">` : '');
    return {q:q.h ? clean(q.q) : fmt(q.q), o:q.o, a:q.a, s:q.h ? clean(q.s || '') : fmt(q.s || ''), fig:fig ? () => fig : null};
  })};
}
function setMeta(list){ META = {}; (list||[]).forEach(m => META[m.id] = m); }
async function loadCatalog(){
  const st = (window.EXAMS_MANIFEST||[]).map(m => ({...m, static:true, status:'published'}));
  let dyn = [];
  if(Net.live()){
    try{ const r = await Net.exams(); if(r.ok){ dyn = r.exams; store.set('oly_cat', dyn); } }
    catch(e){ dyn = store.get('oly_cat') || []; }
  }
  const all = [...st, ...dyn.filter(d => !st.some(x => x.id === d.id))];
  setMeta(all); return all;
}
function loadExam(id){
  if(EXAMS[id]) return Promise.resolve(EXAMS[id]);
  const m = (window.EXAMS_MANIFEST||[]).find(x => x.id === id);
  if(!m){                                 // اختبار محفوظ على الخادم
    return Net.getExam(id, ctx.key).then(r => {
      if(!r.ok) throw new Error(r.error === 'not_allowed' || r.error === 'blocked' ? 'NOT_ALLOWED' : 'اختبار غير موجود');
      return (EXAMS[id] = buildExam(r.exam));
    });
  }
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = m.file; s.onload = () => EXAMS[id] ? res(EXAMS[id]) : rej(new Error('ملف الاختبار لا يسجّل نفسه'));
    s.onerror = () => rej(new Error('تعذّر تحميل ملف الاختبار'));
    document.head.appendChild(s);
  });
}
const examMeta = id => META[id] || (window.EXAMS_MANIFEST||[]).find(x => x.id === id) || {id, title:id, count:0};

/* ---------- الترتيب: العلامة الأعلى ثم الزمن الأقل ---------- */
function rankInfo(rows, row){
  const same = rows.filter(r => r.exam === row.exam);
  const better = same.filter(r => r.score > row.score || (r.score === row.score && r.seconds < row.seconds)).length;
  return { rank: better + 1, total: same.length };
}

/* ---------- الشبكة (مع وضع محلي للتجربة بدون خادم) ---------- */
const live = () => !!CFG.SCRIPT_URL;
const localRows = () => store.get('oly_local_rows') || [];
async function g(p){ const r = await fetch(CFG.SCRIPT_URL + '?' + new URLSearchParams(p)); return r.json(); }
async function p(b){ const r = await fetch(CFG.SCRIPT_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(b)}); return r.json(); }
const Net = {
  live,
  async check(exam, reg){
    if(live()) return g({action:'check', exam, reg});
    return {ok:true, exists: localRows().some(r => r.exam === exam && r.reg === reg)};
  },
  async student(reg){
    if(live()) return g({action:'student', reg});
    const all = localRows();
    return {ok:true, results: all.filter(r => r.reg === reg).map(r => ({...r, ...rankInfo(all, r)}))};
  },
  async submit(d){
    if(live()) return p(d);
    const all = localRows();
    if(all.some(r => r.exam === d.exam && r.reg === d.reg)) return {ok:false, error:'dup'};
    const ex = await loadExam(d.exam);
    const score = ex.questions.reduce((t,q,i) => t + (d.answers[i] === LET[q.a] ? 1 : 0), 0);
    const row = {time:new Date().toISOString(), exam:d.exam, reg:d.reg, name:d.name, score, seconds:d.seconds, answers:d.answers};
    all.push(row); store.set('oly_local_rows', all);
    return {ok:true, score, ...rankInfo(all, row)};
  },
  async all(key){
    if(live()) return g({action:'all', key});
    return {ok:true, rows: localRows()};
  },
  async exams(){ return live() ? g({action:'exams'}) : {ok:true, exams:[]}; },
  async getExam(id, key){ return live() ? g({action:'exam', id, key: key || '', reg: ctx.reg || ''}) : {ok:false}; },
  async config(){ return live() ? g({action:'config'}) : {ok:true, restrict:false}; },
  async login(reg){ return live() ? g({action:'login', reg}) : {ok:true, restrict:false, name:''}; },
  async students(key){ return live() ? g({action:'students', key}) : {ok:true, restrict:false, students:[]}; },
  async adminExams(key){ return live() ? g({action:'adminexams', key}) : {ok:true, exams:[]}; },
  async act(body){ return live() ? p(body) : {ok:false, error:'يتطلب ربط الخادم (SCRIPT_URL)'}; }
};

/* ---------- الترويسة ---------- */
function brandHTML(){
  return `<header class="brand"><div class="brand-in">
    <img class="logo" src="assets/logo.png" alt="شعار الأولمبياد العلمي السوري">
    <div class="office">${esc(CFG.OFFICE)}</div>
    <div class="eng">${esc(CFG.ENGINEER)}</div>
    ${CFG.SUBJECT ? `<div class="subj">منصة الاختبارات التجريبية — ${esc(CFG.SUBJECT)}</div>` : ''}</div><div class="stripe"></div></header>`;
}

/* ---------- الألعاب النارية ---------- */
let cv, cx, parts = [], raf = 0;
function initFW(){
  cv = document.getElementById('fw'); if(!cv) return; cx = cv.getContext('2d');
  const fit = () => { cv.width = innerWidth; cv.height = innerHeight; }; fit(); addEventListener('resize', fit);
}
function burst(x, y, n=70){
  if(!cv) return;
  const h = Math.random()*360;
  for(let i=0;i<n;i++){ const a=Math.random()*6.283, v=2+Math.random()*5; parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:1,h:h+Math.random()*40}); }
  if(!raf) loop();
}
function loop(){
  cx.clearRect(0,0,cv.width,cv.height); parts = parts.filter(q => q.life > 0);
  for(const q of parts){ q.x+=q.vx; q.y+=q.vy; q.vy+=.06; q.vx*=.985; q.life-=.014; cx.globalAlpha=Math.max(q.life,0); cx.fillStyle=`hsl(${q.h},95%,60%)`; cx.beginPath(); cx.arc(q.x,q.y,2.6,0,6.283); cx.fill(); }
  cx.globalAlpha = 1; raf = parts.length ? requestAnimationFrame(loop) : 0; if(!raf) cx.clearRect(0,0,cv.width,cv.height);
}
function celebrate(times=3){ for(let i=0;i<times;i++) setTimeout(() => burst(innerWidth*(.2+Math.random()*.6), innerHeight*(.15+Math.random()*.35)), i*260); }

/* ---------- تأثير الموجة على الأزرار ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b || b.disabled) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
  const s = document.createElement('span'); s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX-r.left-d/2}px;top:${e.clientY-r.top-d/2}px`;
  b.appendChild(s); setTimeout(() => s.remove(), 600);
});

/* عرض المعادلات: $...$ أو \(...\) داخل السطر، و$$...$$ أو \[...\] في سطر مستقل (KaTeX) */
let katexP = null;
function renderMath(root){
  if(!root || !/\$|\\\(|\\\[/.test(root.textContent || '')) return;
  if(!katexP) katexP = new Promise((res, rej) => {
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/';
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'katex.min.css'; document.head.appendChild(css);
    const ld = src => new Promise((r2, j2) => { const sc = document.createElement('script'); sc.src = src; sc.onload = r2; sc.onerror = j2; document.head.appendChild(sc); });
    ld(base + 'katex.min.js').then(() => ld(base + 'contrib/auto-render.min.js')).then(res, rej);
  });
  katexP.then(() => window.renderMathInElement(root, {throwOnError:false, delimiters:[
    {left:'$$', right:'$$', display:true}, {left:'\\[', right:'\\]', display:true},
    {left:'\\(', right:'\\)', display:false}, {left:'$', right:'$', display:false}]})).catch(() => {});
}
const normDigits = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const fmtTime = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
window.OLY = {CFG, LET, esc, fmt, clean, renderMath, normDigits, store, Net, ctx, loadExam, loadCatalog, setMeta, examMeta, rankInfo, brandHTML, initFW, burst, celebrate, fmtTime};
})();
