
// Basic question bank. You can add more in-app via the importer.
const DEFAULT_QUESTIONS = [
  { q: "What is the capital of Australia?", a: ["Sydney","Canberra","Melbourne","Perth"], correct: 1, category: "General Knowledge", type: "multiple" },
  { q: "The Great Barrier Reef is off the coast of Queensland.", a: ["True","False"], correct: 0, category: "Geography", type: "truefalse" },
  { q: "Which company created the iPhone?", a: ["Google","Apple","Samsung","Nokia"], correct: 1, category: "Tech", type: "multiple" },
  { q: "2 + 2 × 3 = ?", a: ["12","8","10","6"], correct: 1, category: "Maths", type: "multiple" },
  { q: "The chemical symbol for Gold is Au.", a: ["True","False"], correct: 0, category: "Science", type: "truefalse" },
  { q: "Who painted the Mona Lisa?", a: ["Van Gogh","Picasso","Da Vinci","Rembrandt"], correct: 2, category: "Art", type: "multiple" },
  { q: "Kangaroos are native to Australia.", a: ["True","False"], correct: 0, category: "Biology", type: "truefalse" },
  { q: "What does GPS stand for?", a: ["Global Positioning System","General Positioning Service","Geo-Positional Set","Global Path System"], correct: 0, category: "Tech", type: "multiple" },
  { q: "The Sydney Harbour Bridge opened in 1932.", a: ["True","False"], correct: 0, category: "History", type: "truefalse" },
  { q: "Which planet is known as the Red Planet?", a: ["Venus","Mars","Jupiter","Mercury"], correct: 1, category: "Science", type: "multiple" }
];

const KEY = {
  BANK: "trivia.bank.v1",
  CUSTOM: "trivia.custom.v1",
  HIGH: "trivia.highscore.v1"
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const state = {
  session: [],
  idx: 0,
  score: 0,
  locked: false,
  high: Number(localStorage.getItem(KEY.HIGH) || 0),
};

const toast = (msg) => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1200);
}

const loadBank = () => {
  const custom = JSON.parse(localStorage.getItem(KEY.CUSTOM) || "[]");
  const bank = DEFAULT_QUESTIONS.concat(custom);
  localStorage.setItem(KEY.BANK, JSON.stringify(bank));
  return bank;
};

const unique = (arr) => [...new Set(arr)];
const shuffle = (arr) => arr.sort(()=>Math.random()-0.5);

const renderCategories = (bank) => {
  const sel = $("#category");
  const cats = ["All"].concat(unique(bank.map(q=>q.category || "Other")).sort());
  sel.innerHTML = cats.map(c=>`<option value="${c}">${c}</option>`).join("");
};

const filterBy = (bank, cat, mode) => {
  let pool = bank;
  if (cat !== "All") pool = pool.filter(q => (q.category || "Other") === cat);
  if (mode === "multiple") pool = pool.filter(q => (q.type||"multiple")==="multiple");
  if (mode === "truefalse") pool = pool.filter(q => (q.type||"multiple")==="truefalse");
  return pool;
};

const sample = (arr, n) => shuffle([...arr]).slice(0, n);

const renderQuestion = () => {
  const q = state.session[state.idx];
  $("#progress").textContent = `${state.idx+1}/${state.session.length}`;
  $("#score").textContent = `Score: ${state.score} · High: ${state.high}`;
  $("#question").textContent = q.q;
  const answers = $("#answers");
  answers.innerHTML = "";
  q.a.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.innerHTML = `<span class="letter">${String.fromCharCode(65+i)}</span> ${opt}`;
    btn.addEventListener("click", ()=>selectAnswer(i, btn));
    answers.appendChild(btn);
  });
  $("#feedback").textContent = "";
  $("#result").classList.add("hidden");
  $("#nextBtn").classList.add("hidden");
  $("#endBtn").classList.add("hidden");
  state.locked = false;
};

const selectAnswer = (i, btn) => {
  if (state.locked) return;
  state.locked = true;
  const q = state.session[state.idx];
  const correct = q.correct;
  $$("#answers button").forEach((b, idx)=>{
    if (idx===correct) b.classList.add("correct");
    if (idx===i && i!==correct) b.classList.add("wrong");
    b.disabled = true;
  });
  if (i===correct){
    state.score++;
    $("#feedback").textContent = "✅ Correct!";
  } else {
    $("#feedback").textContent = `❌ Incorrect. Answer: ${q.a[correct]}`;
  }
  $("#score").textContent = `Score: ${state.score} · High: ${state.high}`;
  const isLast = state.idx === state.session.length-1;
  $("#nextBtn").classList.toggle("hidden", isLast);
  $("#endBtn").classList.toggle("hidden", !isLast);
};

const endSession = () => {
  $("#answers").innerHTML = "";
  $("#question").textContent = "Session finished!";
  const pct = Math.round((state.score / state.session.length) * 100);
  $("#result").textContent = `You scored ${state.score}/${state.session.length} (${pct}%).`;
  $("#result").classList.remove("hidden");
  if (state.score > state.high){
    state.high = state.score;
    localStorage.setItem(KEY.HIGH, String(state.high));
    toast("New high score 🎉");
  }
  $("#badgeText").textContent = "Done";
};

const start = () => {
  const bank = loadBank();
  const cat = $("#category").value;
  const count = Number($("#count").value);
  const mode = $("#mode").value;
  const pool = filterBy(bank, cat, mode);
  if (pool.length === 0) {
    toast("No questions for this selection yet.");
    return;
  }
  state.session = sample(pool, Math.min(count, pool.length));
  state.idx = 0;
  state.score = 0;
  renderQuestion();
  $("#badgeText").textContent = "In Progress";
};

const next = () => {
  if (state.idx < state.session.length-1){
    state.idx++;
    renderQuestion();
  }
};

const reset = () => {
  state.session = [];
  state.idx = 0;
  state.score = 0;
  $("#progress").textContent = "0/0";
  $("#score").textContent = `Score: 0 · High: ${state.high}`;
  $("#question").textContent = "Tap Start to begin.";
  $("#answers").innerHTML = "";
  $("#result").classList.add("hidden");
  $("#badgeText").textContent = "Ready";
};

const bindImportExport = () => {
  const example = [
    { q: "DJI stands for Da-Jiang Innovations.", a: ["True","False"], correct: 0, category: "RPAS", type: "truefalse" },
    { q: "What does RTK stand for?", a: ["Real-Time Kinematics","Rapid Terrain Kit","Relative Track Keep","Realtime Toolkit"], correct: 0, category: "Geospatial", type: "multiple" },
    { q: "Matrice 350 is made by ______.", a: ["Parrot","Autel","DJI","Skydio"], correct: 2, category: "RPAS", type: "multiple" }
  ];
  $("#customJson").value = JSON.stringify(example, null, 2);

  $("#importBtn").addEventListener("click", ()=>{
    try{
      const parsed = JSON.parse($("#customJson").value);
      if (!Array.isArray(parsed)) throw new Error("JSON must be an array");
      const cleaned = parsed.map(q => {
        if (!q.q || !Array.isArray(q.a) || typeof q.correct !== "number"){
          throw new Error("Each item needs q, a[], correct");
        }
        return {
          q: String(q.q),
          a: q.a.map(String),
          correct: Number(q.correct),
          category: q.category ? String(q.category) : "Custom",
          type: (q.type==="truefalse" ? "truefalse" : "multiple")
        };
      });
      localStorage.setItem(KEY.CUSTOM, JSON.stringify(cleaned));
      toast("Imported ✓");
      reset();
      renderCategories(loadBank());
    }catch(e){
      toast("Import failed: " + e.message);
    }
  });

  $("#exportBtn").addEventListener("click", ()=>{
    const bank = loadBank();
    const blob = new Blob([JSON.stringify(bank, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "trivia-bank.json"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  });

  $("#clearCustomBtn").addEventListener("click", ()=>{
    localStorage.removeItem(KEY.CUSTOM);
    toast("Cleared custom questions");
    reset();
    renderCategories(loadBank());
  });
};

window.addEventListener("DOMContentLoaded", () => {
  renderCategories(loadBank());
  reset();
  $("#startBtn").addEventListener("click", start);
  $("#nextBtn").addEventListener("click", next);
  $("#endBtn").addEventListener("click", endSession);
  $("#resetBtn").addEventListener("click", reset);
  bindImportExport();
});
