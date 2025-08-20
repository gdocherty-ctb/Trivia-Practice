
// === Trivia App: Expanded Online Sources (OpenTDB + The Trivia API) ===
// Drop-in replacement for app.js. Keeps your UI behavior but expands online questions.

/* -------------------- Local bank & utilities -------------------- */
const DEFAULT_QUESTIONS = [
  { q: "What is the capital of Australia?", a: ["Sydney","Canberra","Melbourne","Perth"], correct: 1, category: "General Knowledge", type: "multiple" },
  { q: "The Great Barrier Reef is off the coast of Queensland.", a: ["True","False"], correct: 0, category: "Geography", type: "truefalse" },
  { q: "Which company created the iPhone?", a: ["Google","Apple","Samsung","Nokia"], correct: 1, category: "Technology", type: "multiple" },
  { q: "2 + 2 × 3 = ?", a: ["12","8","10","6"], correct: 1, category: "Maths", type: "multiple" },
  { q: "The chemical symbol for Gold is Au.", a: ["True","False"], correct: 0, category: "Science", type: "truefalse" },
  { q: "Who painted the Mona Lisa?", a: ["Van Gogh","Picasso","Da Vinci","Rembrandt"], correct: 2, category: "Art", type: "multiple" },
  { q: "Kangaroos are native to Australia.", a: ["True","False"], correct: 0, category: "Biology", type: "truefalse" },
  { q: "What does GPS stand for?", a: ["Global Positioning System","General Positioning Service","Geo-Positional Set","Global Path System"], correct: 0, category: "Technology", type: "multiple" },
  { q: "The Sydney Harbour Bridge opened in 1932.", a: ["True","False"], correct: 0, category: "History", type: "truefalse" },
  { q: "Which planet is known as the Red Planet?", a: ["Venus","Mars","Jupiter","Mercury"], correct: 1, category: "Science", type: "multiple" }
];

const KEY = { BANK: "trivia.bank.v1", CUSTOM: "trivia.custom.v1", HIGH: "trivia.highscore.v1" };
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = { session:[], idx:0, score:0, locked:false, high:Number(localStorage.getItem(KEY.HIGH)||0), onlineCategories:[] };
const toast = (m)=>{ const t=$("#toast"); if(!t){alert(m);return;} t.textContent=m; t.classList.remove("hidden"); clearTimeout(window.__t); window.__t=setTimeout(()=>t.classList.add("hidden"),1400); };
const unique = (a)=>[...new Set(a)];
const shuffle=(a)=>a.sort(()=>Math.random()-0.5);
const sample=(arr,n)=>shuffle([...arr]).slice(0,Math.max(0,n));
const decode=(s)=>{ const el=document.createElement("textarea"); el.innerHTML=s; return el.value; };

const loadBank=()=>{
  const custom=JSON.parse(localStorage.getItem(KEY.CUSTOM)||"[]");
  const bank=DEFAULT_QUESTIONS.concat(custom);
  localStorage.setItem(KEY.BANK, JSON.stringify(bank));
  return bank;
};

/* -------------------- Categories -------------------- */
function renderCategoriesLocal(bank){
  const sel=$("#category"); if(!sel) return;
  const localCats=unique(bank.map(q=>q.category||"Other")).sort();
  sel.innerHTML=['<option value="All">All</option>', ...localCats.map(c=>`<option value="${c}">${c}</option>`)].join("");
}

async function fetchOnlineCategories(){
  try{
    const res=await fetch("https://opentdb.com/api_category.php",{cache:"no-store"});
    const data=await res.json();
    state.onlineCategories=(data.trivia_categories||[]).map(c=>({id:c.id, name:c.name}));
    const sel=$("#category"); if(!sel) return;
    const prev=sel.value||"All";
    const onlineOpts=state.onlineCategories.map(c=>`<option value="otdb:${c.id}">🔵 ${c.name}</option>`);
    const existing=Array.from(sel.querySelectorAll("option")).map(o=>o.outerHTML);
    sel.innerHTML=[existing[0], ...onlineOpts, ...existing.slice(1)].join("");
    sel.value=prev;
  }catch(e){ /* ignore */ }
}

/* -------------------- Online fetchers -------------------- */
async function fetchFromOpenTDB(amount,mode,otdbCategoryId,difficulty){
  const params=new URLSearchParams({amount:String(amount)});
  if(difficulty) params.set("difficulty", difficulty);
  if(mode==="multiple") params.set("type","multiple");
  else if(mode==="truefalse") params.set("type","boolean");
  if(otdbCategoryId) params.set("category", String(otdbCategoryId));
  const res=await fetch(`https://opentdb.com/api.php?${params.toString()}`,{cache:"no-store"});
  const data=await res.json();
  if(!data.results || !data.results.length) return [];
  return data.results.map(it=>{
    const type = it.type==="boolean"?"truefalse":"multiple";
    const corr = decode(it.correct_answer);
    const all = shuffle([corr, ...it.incorrect_answers.map(decode)]);
    return { q: decode(it.question), a: all, correct: all.indexOf(corr), category: decode(it.category||"Online"), type };
  });
}

// The Trivia API v2
async function fetchFromTriviaAPI(amount,mode,difficulty){
  const params = new URLSearchParams();
  params.set("limit", String(amount));
  if(mode==="multiple") params.set("types","multiple-choice");
  else if(mode==="truefalse") params.set("types","boolean");
  if(difficulty) params.set("difficulties", difficulty);
  const url = `https://the-trivia-api.com/v2/questions?${params.toString()}`;
  const res = await fetch(url,{cache:"no-store"});
  if(!res.ok) return [];
  const data = await res.json();
  if(!Array.isArray(data) || !data.length) return [];
  return data.map(it=>{
    const type = (it.type==="boolean" || (it.correctAnswer && (it.incorrectAnswers||[]).length===1)) ? "truefalse" : "multiple";
    const corr = it.correctAnswer;
    const incorrect = it.incorrectAnswers || (type==="truefalse" ? [corr==="True"?"False":"True"] : []);
    const all = shuffle([corr, ...incorrect]);
    return { q: it.question && it.question.text ? it.question.text : String(it.question||""), a: all, correct: all.indexOf(corr), category: (it.category||"Online"), type };
  });
}

// Merge, de-duplicate by normalized question text, then sample
function mergeDedup(...arrays){
  const out=[]; const seen=new Set();
  const norm=(s)=>decode(String(s)).replace(/\s+/g," ").trim().toLowerCase();
  arrays.flat().forEach(q=>{
    const key = norm(q.q);
    if(!seen.has(key)){ seen.add(key); out.push(q); }
  });
  return out;
}

async function getOnlineQuestions(count,mode,catValue,difficulty){
  const OVERFETCH = Math.max(2, Math.ceil(count/10)+1);
  const want = count * OVERFETCH;
  let catId = null;
  if(catValue && catValue.startsWith("otdb:")) catId = Number(catValue.split(":")[1]);
  const [a, b] = await Promise.all([
    fetchFromOpenTDB(want, mode, catId, difficulty).catch(()=>[]),
    fetchFromTriviaAPI(want, mode, difficulty).catch(()=>[])
  ]);
  const merged = mergeDedup(a, b);
  return sample(merged, count);
}

/* -------------------- Filters & UI flow -------------------- */
const filterBy=(bank, cat, mode)=>{
  let pool=bank;
  if(cat!=="All" && !cat.startsWith("otdb:")) pool=pool.filter(q=>(q.category||"Other")===cat);
  if(mode==="multiple") pool=pool.filter(q=>(q.type||"multiple")==="multiple");
  if(mode==="truefalse") pool=pool.filter(q=>(q.type||"multiple")==="truefalse");
  return pool;
};

function renderQuestion(){
  const q=state.session[state.idx];
  $("#progress").textContent=`${state.idx+1}/${state.session.length}`;
  $("#score").textContent=`Score: ${state.score} · High: ${state.high}`;
  $("#question").textContent=q.q;
  const answers=$("#answers"); answers.innerHTML="";
  q.a.forEach((opt,i)=>{
    const b=document.createElement("button");
    b.innerHTML = `<span class="letter">${String.fromCharCode(65+i)}</span> ${opt}`;
    b.addEventListener("click",()=>selectAnswer(i));
    answers.appendChild(b);
  });
  $("#feedback").textContent="";
  $("#result").classList.add("hidden");
  $("#nextBtn").classList.add("hidden");
  $("#endBtn").classList.add("hidden");
  state.locked=false;
}

function selectAnswer(i){
  if(state.locked) return; state.locked=true;
  const q=state.session[state.idx]; const c=q.correct;
  $$("#answers button").forEach((b,idx)=>{
    if(idx===c) b.classList.add("correct");
    if(idx===i && i!==c) b.classList.add("wrong");
    b.disabled=true;
  });
  if(i===c){ state.score++; $("#feedback").textContent="✅ Correct!"; }
  else { $("#feedback").textContent=`❌ Incorrect. Answer: ${q.a[c]}`; }
  $("#score").textContent=`Score: ${state.score} · High: ${state.high}`;
  const last = state.idx === state.session.length-1;
  $("#nextBtn").classList.toggle("hidden", last);
  $("#endBtn").classList.toggle("hidden", !last);
}

function endSession(){
  $("#answers").innerHTML="";
  $("#question").textContent="Session finished!";
  const pct=Math.round((state.score/state.session.length)*100);
  $("#result").textContent=`You scored ${state.score}/${state.session.length} (${pct}%).`;
  $("#result").classList.remove("hidden");
  if(state.score>state.high){ state.high=state.score; localStorage.setItem(KEY.HIGH,String(state.high)); toast("New high score 🎉"); }
  $("#badgeText").textContent = $("#useOnline").checked ? "Online" : "Offline";
}

function reset(){
  state.session=[]; state.idx=0; state.score=0;
  $("#progress").textContent="0/0"; $("#score").textContent=`Score: 0 · High: ${state.high}`;
  $("#question").textContent="Tap Start to begin."; $("#answers").innerHTML="";
  $("#result").classList.add("hidden"); $("#badgeText").textContent = $("#useOnline").checked ? "Online" : "Ready";
}

function bindImportExport(){
  document.getElementById("importBtn")?.addEventListener("click", ()=>{
    const text = prompt("Paste an array of questions in JSON:", '[\\n  {\\n    "q": "Question?",\\n    "a": ["A","B","C","D"],\\n    "correct": 0,\\n    "category": "Custom",\\n    "type": "multiple"\\n  }\\n]');
    if(text==null) return;
    try{
      const parsed=JSON.parse(text);
      if(!Array.isArray(parsed)) throw new Error("JSON must be an array");
      localStorage.setItem(KEY.CUSTOM, JSON.stringify(parsed));
      toast("Imported ✓"); location.reload();
    }catch(e){ toast("Import failed: "+e.message); }
  });
  document.getElementById("exportBtn")?.addEventListener("click", ()=>{
    const bank = JSON.parse(localStorage.getItem(KEY.BANK)||"[]");
    const blob=new Blob([JSON.stringify(bank,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="trivia-bank.json"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  });
  document.getElementById("clearCustomBtn")?.addEventListener("click", ()=>{
    localStorage.removeItem(KEY.CUSTOM); toast("Cleared custom questions"); location.reload();
  });
}

async function start(){
  const useOnline=$("#useOnline")?.checked;
  const cat=$("#category")?.value || "All";
  const count=Number($("#count")?.value||10);
  const mode=$("#mode")?.value || "multiple";
  const difficulty=$("#difficulty")?.value || "";

  $("#badgeText").textContent = useOnline ? "Online" : "In Progress";

  if(useOnline){
    try{
      const online = await getOnlineQuestions(count, mode, cat, difficulty);
      if(online.length < count){
        const pool=filterBy(loadBank(), cat, mode);
        const need=count-online.length;
        state.session = online.concat(sample(pool.filter(p=>!online.find(o=>o.q===p.q)), need));
      }else{
        state.session = online;
      }
    }catch(e){
      console.warn(e); toast("Online fetch failed — using offline.");
      const pool=filterBy(loadBank(), cat, mode);
      if(!pool.length){ toast("No questions available."); return; }
      state.session=sample(pool, Math.min(count, pool.length));
    }
  }else{
    const pool=filterBy(loadBank(), cat, mode);
    if(!pool.length){ toast("No questions available."); return; }
    state.session=sample(pool, Math.min(count, pool.length));
  }
  state.idx=0; state.score=0; renderQuestion();
}

function next(){ if(state.idx < state.session.length-1){ state.idx++; renderQuestion(); } }

window.addEventListener("DOMContentLoaded", async ()=>{
  const bank = loadBank();
  renderCategoriesLocal(bank);
  reset();
  bindImportExport();
  fetchOnlineCategories();
  document.getElementById("startBtn").addEventListener("click", start);
  document.getElementById("nextBtn").addEventListener("click", next);
  document.getElementById("endBtn").addEventListener("click", endSession);
  document.getElementById("resetBtn").addEventListener("click", reset);
  document.getElementById("useOnline").addEventListener("change", ()=>{
    $("#badgeText").textContent = $("#useOnline").checked ? "Online" : "Ready";
  });
});
