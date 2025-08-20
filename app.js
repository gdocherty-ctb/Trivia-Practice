// iPhone-friendly Trivia app with curated categories, decade filter, expanded online sources,
// no repeats per session, difficulty & count selectors, next & refresh buttons, and high score.

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const shuffle = (a)=>a.sort(()=>Math.random()-0.5);
const sample = (arr,n)=>shuffle([...arr]).slice(0,n);
const decode = (str)=>{ const t=document.createElement('textarea'); t.innerHTML = str||''; return t.value; };
const norm = (s)=>decode(s).replace(/\s+/g,' ').trim().toLowerCase();

const KEY = { HIGH:'trivia.high.v1', SEEN:'trivia.seen.session.v1' };

const state = { session:[], idx:0, score:0, locked:false, high:Number(localStorage.getItem(KEY.HIGH)||0) };

// --- session no-repeats ---
function getSeen(){ try{ return new Set(JSON.parse(sessionStorage.getItem(KEY.SEEN)||'[]')); }catch{ return new Set(); } }
function addSeen(q){ const s=getSeen(); s.add(norm(q)); sessionStorage.setItem(KEY.SEEN, JSON.stringify([...s])); }

// --- curated mapping ---
function mapToCurated(cat){
  const c=(cat||'').toLowerCase();
  if (/history/.test(c)) return 'History';
  if (/geograph/.test(c)) return 'Geography';
  if (/science|nature|astronomy|physics|chemistry|biology/.test(c)) return 'Science';
  if (/sport/.test(c)) return 'Sports';
  if (/literature|books|arts_and_literature/.test(c)) return 'Literature';
  if (/animal/.test(c)) return 'Animals';
  if (/food|drink|cuisine/.test(c)) return 'Food and Drink';
  if (/art(?!s_and_literature)|culture|society_and_culture/.test(c)) return 'Art and Culture';
  if (/film|tv|television|music|video game|cartoon|anime|entertainment/.test(c)) return 'Entertainment';
  if (/celebr|pop|culture/.test(c)) return 'Pop Culture';
  if (/general/.test(c)) return 'General Knowledge';
  return 'General Knowledge';
}

// --- era match ---
function matchesDecade(text, decade){
  if (decade==='any') return true;
  const years=[]; const re=/(^|[^\\d])(1[0-9]{3}|20[0-9]{2})(?!\\d)/g; let m;
  while((m=re.exec(text))){ years.push(Number(m[2])); }
  if (!years.length) return false;
  if (decade==='pre1900') return years.some(y=>y<1900);
  const start=Number(decade.slice(0,4)); return years.some(y=>y>=start && y<start+10);
}

// --- providers ---
async function fetchFromOpenTDB(amount, type, difficulty, curatedCategory){
  const params=new URLSearchParams({ amount:String(amount) });
  if (difficulty) params.set('difficulty', difficulty);
  if (type==='multiple') params.set('type','multiple');
  else if (type==='truefalse') params.set('type','boolean');
  const res=await fetch(`https://opentdb.com/api.php?${params.toString()}`,{cache:'no-store'});
  const data=await res.json();
  if (!data.results) return [];
  return data.results.map(it=>{
    const correct=decode(it.correct_answer);
    const incorrect=(it.incorrect_answers||[]).map(decode);
    const all=shuffle([correct,...incorrect]);
    return { q:decode(it.question), a:all, correct:all.indexOf(correct), category:mapToCurated(it.category), type:(it.type==='boolean')?'truefalse':'multiple', _src:'opentdb' };
  }).filter(q=>!curatedCategory || q.category===curatedCategory);
}

async function fetchFromTriviaAPI(amount, type, difficulty, curatedCategory){
  const params=new URLSearchParams({ limit:String(amount) });
  if (difficulty) params.set('difficulties', difficulty);
  if (type==='multiple') params.set('types','multiple-choice');
  else if (type==='truefalse') params.set('types','boolean');
  const res=await fetch(`https://the-trivia-api.com/v2/questions?${params.toString()}`,{cache:'no-store'});
  if (!res.ok) return [];
  const data=await res.json();
  return data.map(it=>{
    const correct=decode(it.correctAnswer);
    const incorrect=(it.incorrectAnswers||[]).map(decode);
    const all=shuffle([correct,...incorrect]);
    return { q:decode(it.question?.text||''), a:all, correct:all.indexOf(correct), category:mapToCurated(it.category), type:(it.type==='boolean')?'truefalse':'multiple', _src:'triviaapi' };
  }).filter(q=>!curatedCategory || q.category===curatedCategory);
}

function dedup(list){
  const seen=new Set(getSeen()); const out=[];
  for(const q of list){ const k=norm(q.q); if(!k||seen.has(k)) continue; if(out.find(x=>norm(x.q)===k)) continue; out.push(q); }
  return out;
}

function applyFilters(list, decade, type){
  return list.filter(q=>{
    if (type==='multiple' && (q.type||'multiple')!=='multiple') return false;
    if (type==='truefalse' && (q.type||'multiple')!=='truefalse') return false;
    const text = `${q.q} ${q.a.join(' ')}`;
    return matchesDecade(text, decade);
  });
}

async function getOnline(count, type, difficulty, curatedCategory, decade){
  const over=Math.max(2, Math.ceil(30/Math.max(1,count))); const want=count*over;
  const [a,b]=await Promise.all([
    fetchFromOpenTDB(want,type,difficulty,curatedCategory).catch(()=>[]),
    fetchFromTriviaAPI(want,type,difficulty,curatedCategory).catch(()=>[])
  ]);
  let merged = dedup(a.concat(b));
  merged = applyFilters(merged, decade, type);
  return sample(merged, Math.min(count, merged.length));
}

// --- offline minimal bank as fallback ---
const OFFLINE = [
  { q: "Who wrote '1984'?", a:["George Orwell","Aldous Huxley","Mark Twain","Ernest Hemingway"], correct:0, category:"Literature", type:"multiple" },
  { q: "In which year did WW2 end? (1940s)", a:["1943","1944","1945","1946"], correct:2, category:"History", type:"multiple" },
  { q: "The Great Barrier Reef is in Australia.", a:["True","False"], correct:0, category:"Geography", type:"truefalse" },
  { q: "Which planet is known as the Red Planet?", a:["Venus","Mars","Jupiter","Mercury"], correct:1, category:"Science", type:"multiple" },
];

function filterOffline(count, curatedCategory, decade, type){
  const list = OFFLINE.filter(q=>{
    if (curatedCategory && q.category!==curatedCategory) return false;
    if (type==='multiple' && q.type!=='multiple') return false;
    if (type==='truefalse' && q.type!=='truefalse') return false;
    return matchesDecade(`${q.q} ${q.a.join(' ')}`, decade);
  }).filter(q=>!getSeen().has(norm(q.q)));
  return sample(list, Math.min(count, list.length));
}

// --- UI rendering & flow ---
function updateMeta(){
  $("#progress").textContent = `${state.idx+1}/${state.session.length}`;
  $("#score").textContent = `Score: ${state.score} · High: ${state.high}`;
}

function renderQuestion(){
  const q = state.session[state.idx];
  updateMeta();
  $("#question").textContent = q.q;
  $("#answers").innerHTML = "";
  $("#feedback").textContent = "";
  q.a.forEach((opt,i)=>{
    const btn=document.createElement('button');
    btn.innerHTML = `<span class="letter">${String.fromCharCode(65+i)}</span> ${opt}`;
    btn.addEventListener('click',()=>selectAnswer(i));
    $("#answers").appendChild(btn);
  });
  $("#nextBtn").classList.add('hidden');
  state.locked=false;
}

function selectAnswer(i){
  if (state.locked) return; state.locked=true;
  const q = state.session[state.idx];
  const c = q.correct;
  const buttons = $$("#answers button");
  buttons.forEach((b,idx)=>{
    if (idx===c) b.classList.add('correct');
    if (idx===i && idx!==c) b.classList.add('wrong');
    b.disabled = true;
  });
  if (i===c){ state.score++; $("#feedback").textContent = "✅ Correct!"; }
  else { $("#feedback").textContent = `❌ Incorrect. Correct answer: ${q.a[c]}`; }
  if (state.score>state.high){ state.high=state.score; localStorage.setItem(KEY.HIGH, String(state.high)); }
  updateMeta();
  $("#nextBtn").classList.remove('hidden');
  $("#summary").textContent = `Current: ${state.score}/${state.session.length} — Highest: ${state.high}`;
}

function nextQuestion(){
  if (state.idx < state.session.length-1){ state.idx++; renderQuestion(); }
  else { $("#question").textContent = "Session finished! Tap Refresh for a new set."; $("#answers").innerHTML=""; $("#nextBtn").classList.add('hidden'); }
}

function resetAll(){
  state.session=[]; state.idx=0; state.score=0; state.locked=false;
  $("#question").textContent="Tap Start to begin."; $("#answers").innerHTML=""; $("#feedback").textContent="";
  $("#summary").textContent=""; $("#progress").textContent="0/0"; $("#score").textContent=`Score: 0 · High: ${state.high}`;
  $("#badgeText").textContent = $("#useOnline").checked ? "Online" : "Ready";
}

async function startSession(){
  const curatedCategory = $("#category").value;
  const decade = $("#decade").value;
  const count = Number($("#count").value||10);
  const type = $("#mode").value || 'multiple';
  const difficulty = $("#difficulty").value || '';
  const online = $("#useOnline").checked;
  $("#badgeText").textContent = online ? "Online" : "Offline";

  let list = [];
  if (online){
    try{ list = await getOnline(count, type, difficulty, curatedCategory, decade); } catch(e){ list=[]; }
  }
  if (list.length < count){
    list = list.concat( filterOffline(count-list.length, curatedCategory, decade, type) );
  }
  if (!list.length){ $("#question").textContent="No questions available for this selection."; return; }

  list.forEach(q=>addSeen(q.q)); // mark as seen for session
  state.session=list; state.idx=0; state.score=0;
  renderQuestion();
}

function refreshSession(){ startSession(); }

// init
window.addEventListener('DOMContentLoaded', ()=>{
  $("#score").textContent = `Score: 0 · High: ${state.high}`;
  $("#startBtn").addEventListener('click', startSession);
  $("#refreshBtn").addEventListener('click', refreshSession);
  $("#nextBtn").addEventListener('click', nextQuestion);
  $("#resetBtn").addEventListener('click', resetAll);
  $("#useOnline").addEventListener('change', ()=>{
    $("#badgeText").textContent = $("#useOnline").checked ? "Online" : "Ready";
  });
});
