const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const shuffle = (a)=>a.sort(()=>Math.random()-0.5);
const sample = (arr,n)=>shuffle([...arr]).slice(0,n);
const decode = (str)=>{ const t=document.createElement('textarea'); t.innerHTML = str||''; return t.value; };
const norm = (s)=>decode(s).replace(/\s+/g,' ').trim().toLowerCase();

const KEY = { HIGH:'trivia.high.v1', SEEN:'trivia.seen.session.v1' };
const state = { session:[], idx:0, score:0, locked:false, high:Number(localStorage.getItem(KEY.HIGH)||0) };

function getSeen(){ try{ return new Set(JSON.parse(sessionStorage.getItem(KEY.SEEN)||'[]')); }catch{ return new Set(); } }
function addSeen(q){ const s=getSeen(); s.add(norm(q)); sessionStorage.setItem(KEY.SEEN, JSON.stringify([...s])); }

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

function matchesEra(text, era){
  if (era==='any') return true;
  const re=/(^|[^\\d])(1[0-9]{3}|20[0-9]{2})(?!\\d)/g; const years=[]; let m;
  while((m=re.exec(text))){ years.push(Number(m[2])); }
  if (!years.length) return false;
  if (era==='pre1900') return years.some(y=>y<1900);
  const [start,end] = era.split('-').map(Number);
  return years.some(y=>y>=start && y<=end);
}

async function fetchFromOpenTDB(amount, type, difficulty, curatedCategory){
  const params=new URLSearchParams({ amount:String(amount) });
  if (difficulty) params.set('difficulty', difficulty);
  if (type==='multiple') params.set('type','multiple');
  else if (type==='truefalse') params.set('type','boolean');
  const res=await fetch(`https://opentdb.com/api.php?${params.toString()}`,{cache:'no-store'});
  const data=await res.json(); if(!data.results) return [];
  return data.results.map(it=>{
    const correct=decode(it.correct_answer);
    const all=shuffle([correct, ...(it.incorrect_answers||[]).map(decode)]);
    return { q:decode(it.question), a:all, correct:all.indexOf(correct), category:mapToCurated(it.category), type:(it.type==='boolean')?'truefalse':'multiple', _src:'opentdb' };
  }).filter(q=>!curatedCategory || q.category===curatedCategory);
}

async function fetchFromTriviaAPI(amount, type, difficulty, curatedCategory){
  const params=new URLSearchParams({ limit:String(amount) });
  if (difficulty) params.set('difficulties', difficulty);
  if (type==='multiple') params.set('types','multiple-choice'); else if (type==='truefalse') params.set('types','boolean');
  const res=await fetch(`https://the-trivia-api.com/v2/questions?${params.toString()}`,{cache:'no-store'});
  if (!res.ok) return [];
  const data=await res.json();
  return data.map(it=>{
    const correct=decode(it.correctAnswer);
    const all=shuffle([correct, ...(it.incorrectAnswers||[]).map(decode)]);
    return { q:decode(it.question?.text||''), a:all, correct:all.indexOf(correct), category:mapToCurated(it.category), type:(it.type==='boolean')?'truefalse':'multiple', _src:'triviaapi' };
  }).filter(q=>!curatedCategory || q.category===curatedCategory);
}

function dedup(list){
  const seen=new Set(getSeen()); const out=[];
  for(const q of list){ const k=norm(q.q); if(!k||seen.has(k)) continue; if(out.find(x=>norm(x.q)===k)) continue; out.push(q); }
  return out;
}

function applyFilters(list, era, type){
  return list.filter(q=>{
    if (type==='multiple' && (q.type||'multiple')!=='multiple') return false;
    if (type==='truefalse' && (q.type||'multiple')!=='truefalse') return false;
    return matchesEra(`${q.q} ${q.a.join(' ')}`, era);
  });
}

async function getOnline(count, type, difficulty, curatedCategory, era){
  let want = Math.min(50, Math.max(count*4, 20));
  let merged = [];
  for (let attempt=0; attempt<2 && merged.length<count; attempt++){
    const [a,b] = await Promise.all([
      fetchFromOpenTDB(want,type,difficulty,curatedCategory).catch(()=>[]),
      fetchFromTriviaAPI(want,type,difficulty,curatedCategory).catch(()=>[])
    ]);
    merged = dedup(a.concat(b));
    merged = applyFilters(merged, era, type);
    want = Math.min(80, want + count*2);
  }
  return sample(merged, Math.min(count, merged.length));
}

const OFFLINE = [
  { q:"Who wrote '1984'?", a:["George Orwell","Aldous Huxley","Mark Twain","Ernest Hemingway"], correct:0, category:"Literature", type:"multiple" },
  { q:"In which year did WW2 end? (1940s)", a:["1943","1944","1945","1946"], correct:2, category:"History", type:"multiple" },
  { q:"The Great Barrier Reef is in Australia.", a:["True","False"], correct:0, category:"Geography", type:"truefalse" },
  { q:"Which planet is known as the Red Planet?", a:["Venus","Mars","Jupiter","Mercury"], correct:1, category:"Science", type:"multiple" },
  { q:"The Mona Lisa was painted by Leonardo da Vinci.", a:["True","False"], correct:0, category:"Art and Culture", type:"truefalse" },
  { q:"What is the capital of Canada?", a:["Vancouver","Ottawa","Toronto","Montreal"], correct:1, category:"Geography", type:"multiple" },
  { q:"Who is known as the King of Pop?", a:["Elvis Presley","Michael Jackson","Prince","Freddie Mercury"], correct:1, category:"Entertainment", type:"multiple" },
  { q:"Pandas primarily eat bamboo.", a:["True","False"], correct:0, category:"Animals", type:"truefalse" },
  { q:"Which chemical element has the symbol 'O'?", a:["Gold","Oxygen","Osmium","Oganesson"], correct:1, category:"Science", type:"multiple" },
  { q:"The first iPhone was released in 2007.", a:["True","False"], correct:0, category:"General Knowledge", type:"truefalse" },
  { q:"Which sport uses a shuttlecock?", a:["Tennis","Badminton","Squash","Table Tennis"], correct:1, category:"Sports", type:"multiple" },
  { q:"What is the main ingredient in guacamole?", a:["Avocado","Tomato","Pepper","Onion"], correct:0, category:"Food and Drink", type:"multiple" },
];

function filterOffline(need, curatedCategory, era, type){
  const list = OFFLINE.filter(q=>{
    if (curatedCategory && q.category!==curatedCategory) return false;
    if (type==='multiple' && q.type!=='multiple') return false;
    if (type==='truefalse' && q.type!=='truefalse') return false;
    return matchesEra(`${q.q} ${q.a.join(' ')}`, era);
  }).filter(q=>!getSeen().has(norm(q.q)));
  return sample(list, Math.min(need, list.length));
}

function updateMeta(){
  $("#progress").textContent = `${state.idx+1}/${state.session.length}`;
  $("#score").textContent = `Score: ${state.score} · High: ${state.high}`;
}

function renderQuestion(){
  const q = state.session[state.idx];
  updateMeta(); $("#question").textContent = q.q; $("#answers").innerHTML = ""; $("#feedback").textContent = "";
  q.a.forEach((opt,i)=>{
    const btn=document.createElement('button');
    btn.innerHTML = `<span class="letter">${String.fromCharCode(65+i)}</span> ${opt}`;
    btn.addEventListener('click',()=>selectAnswer(i)); $("#answers").appendChild(btn);
  });
  $("#nextBtn").classList.add('hidden');
  state.locked=false;
}

function selectAnswer(i){
  if (state.locked) return; state.locked=true;
  const q = state.session[state.idx]; const c = q.correct;
  $$("#answers button").forEach((b,idx)=>{
    if (idx===c) b.classList.add('correct');
    if (idx===i && idx!==c) b.classList.add('wrong');
    b.disabled = true;
  });
  if (i===c){ state.score++; $("#feedback").textContent = "✅ Correct!"; }
  else { $("#feedback").textContent = `❌ Incorrect. Correct answer: ${q.a[c]}`; }
  if (state.score>state.high){ state.high=state.score; localStorage.setItem(KEY.HIGH,String(state.high)); }
  updateMeta(); $("#nextBtn").classList.remove('hidden');
  $("#summary").textContent = `Current: ${state.score}/${state.session.length} — Highest: ${state.high}`;
}

function nextQuestion(){
  if (state.idx < state.session.length-1){ state.idx++; renderQuestion(); }
  else { $("#question").textContent = "Session finished! Tap Refresh for a new set."; $("#answers").innerHTML=""; $("#nextBtn").classList.add('hidden'); }
}

async function startOrRefresh(){
  const curatedCategory = $("#category").value;
  const era = $("#era").value;
  const count = Number($("#count").value||10);
  const type = $("#mode").value || 'multiple';
  const difficulty = $("#difficulty").value || '';
  const online = $("#useOnline").checked;
  $("#badgeText").textContent = online ? "Online" : "Offline";

  let list = [];
  if (online){
    try{ list = await getOnline(count, type, difficulty, curatedCategory, era); } catch(e){ list=[]; }
  }
  if (list.length < count){ list = list.concat( filterOffline(count-list.length, curatedCategory, era, type) ); }
  if (list.length < count){ list = list.concat( filterOffline(count-list.length, curatedCategory, 'any', type) ); }
  if (!list.length){ $("#question").textContent="No questions available for this selection."; return; }

  list.forEach(q=>addSeen(q.q));
  state.session=list; state.idx=0; state.score=0;
  renderQuestion();
}

window.addEventListener('DOMContentLoaded', ()=>{
  $("#score").textContent = `Score: 0 · High: ${state.high}`;
  $("#startBtn").addEventListener('click', startOrRefresh);
  $("#refreshBtn").addEventListener('click', startOrRefresh);
  $("#nextBtn").addEventListener('click', nextQuestion);
  $("#useOnline").addEventListener('change', ()=>{
    $("#badgeText").textContent = $("#useOnline").checked ? "Online" : "Ready";
  });
});
