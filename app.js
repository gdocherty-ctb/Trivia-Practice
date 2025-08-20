
// === Online + Offline Trivia App ===
// Uses Open Trivia DB when "Online pool" is enabled; falls back to local bank if offline/fetch fails.

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

const KEY = { BANK: "trivia.bank.v1", CUSTOM: "trivia.custom.v1", HIGH: "trivia.highscore.v1" };
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  session: [],
  idx: 0,
  score: 0,
  locked: false,
  high: Number(localStorage.getItem(KEY.HIGH) || 0),
  onlineCategories: [],   // OpenTDB categories (id + name)
};

const toast = (m) => {
  const t = $("#toast");
  if (!t) { alert(m); return; }
  t.textContent = m;
  t.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.add("hidden"), 1400);
};
const unique = (a) => [...new Set(a)];
const shuffle = (a) => a.sort(()=>Math.random()-0.5);
const sample  = (arr, n) => shuffle([...arr]).slice(0, n);

// --- HTML entities decoder (OpenTDB returns encoded text) ---
const decode = (str) => {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
};

// --- Local bank load (offline/custom) ---
const loadBank = () => {
  const custom = JSON.parse(localStorage.getItem(KEY.CUSTOM) || "[]");
  const bank = DEFAULT_QUESTIONS.concat(custom);
  localStorage.setItem(KEY.BANK, JSON.stringify(bank));
  return bank;
};

// --- Category rendering: combine local categories + online categories (if fetched) ---
const renderCategories = (bank) => {
  const sel = $("#category");
  if (!sel) return;
  const localCats = unique(bank.map(q => q.category || "Other"));

  // Online categories appear as "🔵 Name" to distinguish; value is "otdb:<id>"
  const onlineOpts = state.onlineCategories.map(c => `<option value="otdb:${c.id}">🔵 ${c.name}</option>`);
  const localOpts  = localCats.sort().map(c => `<option value="${c}">${c}</option>`);

  sel.innerHTML = [`<option value="All">All</option>`, ...onlineOpts, ...localOpts].join("");
};

// --- Fetch OpenTDB categories (for online mode) ---
async function fetchOnlineCategories() {
  try {
    const res = await fetch("https://opentdb.com/api_category.php", { cache: "no-store" });
    const data = await res.json();
    state.onlineCategories = (data.trivia_categories || []).map(c => ({ id: c.id, name: c.name }));
  } catch { /* ignore; we'll just show local categories */ }
}

// --- Fetch questions from OpenTDB and map to our format ---
async function fetchFromOpenTDB(amount, mode, otdbCategoryId, difficulty) {
  const params = new URLSearchParams({ amount: String(amount) });
  if (difficulty) params.set("difficulty", difficulty);

  // Mode handling
  if (mode === "multiple") params.set("type", "multiple");
  else if (mode === "truefalse") params.set("type", "boolean"); // OpenTDB uses 'boolean'
  // 'mix' leaves type unspecified to get both

  if (otdbCategoryId) params.set("category", String(otdbCategoryId));

  const res = await fetch(`https://opentdb.com/api.php?${params.toString()}`, { cache: "no-store" });
  const data = await res.json();
  if (!data.results || !Array.isArray(data.results) || data.results.length === 0) throw new Error("No online results");

  // Map to our internal format
  const mapped = data.results.map(item => {
    const type = item.type === "boolean" ? "truefalse" : "multiple";
    const question = decode(item.question);
    const correct = decode(item.correct_answer);
    const incorrect = item.incorrect_answers.map(decode);
    const all = shuffle([correct, ...incorrect]);
    const correctIndex = all.findIndex(x => x === correct);
    return { q: question, a: all, correct: correctIndex, category: decode(item.category || "Online"), type };
  });

  return mapped;
}

// --- Helpers to choose pool ---
const filterBy = (bank, cat, mode) => {
  let pool = bank;
  if (cat !== "All" && !cat.startsWith("otdb:")) pool = pool.filter(q => (q.category || "Other") === cat);
  if (mode === "multiple")  pool = pool.filter(q => (q.type || "multiple") === "multiple");
  if (mode === "truefalse") pool = pool.filter(q => (q.type || "multiple") === "truefalse");
  return pool;
};

// --- UI rendering ---
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
    btn.addEventListener("click", ()=>selectAnswer(i));
    answers.appendChild(btn);
  });
  $("#feedback").textContent = "";
  $("#result").classList.add("hidden");
  $("#nextBtn").classList.add("hidden");
  $("#endBtn").classList.add("hidden");
  state.locked = false;
};

const selectAnswer = (i) => {
  if (state.locked) return;
  state.locked = true;
  const q = state.session[state.idx];
  const correct = q.correct;
  $$("#answers button").forEach((b, idx)=>{
    if (idx===correct) b.classList.add("correct");
    if (idx===i && i!==correct) b.classList.add("wrong");
    b.disabled = true;
  });
  if (i===correct){ state.score++; $("#feedback").textContent = "✅ Correct!"; }
  else { $("#feedback").textContent = `❌ Incorrect. Answer: ${q.a[correct]}`; }
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
  $("#badgeText").textContent = $("#useOnline").checked ? "Online" : "Offline";
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
  $("#badgeText").textContent = $("#useOnline").checked ? "Online" : "Ready";
};

// --- Import/Export helpers when textarea is removed ---
const bindImportExport = () => {
  const importBtn = document.getElementById("importBtn");
  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearCustomBtn");

  if (importBtn) importBtn.addEventListener("click", ()=>{
    let text = prompt("Paste an array of questions in JSON:", "[\\n  {\\n    \\"q\\": \\"Question?\\",\\n    \\"a\\": [\\"A\\", \\"B\\", \\"C\\", \\"D\\"],\\n    \\"correct\\": 0,\\n    \\"category\\": \\"Custom\\",\\n    \\"type\\": \\"multiple\\"\\n  }\\n]");
    if (text == null) return;
    try{
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("JSON must be an array");
      localStorage.setItem(KEY.CUSTOM, JSON.stringify(parsed));
      toast("Imported ✓");
      location.reload();
    }catch(e){
      toast("Import failed: " + e.message);
    }
  });

  if (exportBtn) exportBtn.addEventListener("click", ()=>{
    const bank = JSON.parse(localStorage.getItem(KEY.BANK) || "[]");
    const blob = new Blob([JSON.stringify(bank, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "trivia-bank.json"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  });

  if (clearBtn) clearBtn.addEventListener("click", ()=>{
    localStorage.removeItem(KEY.CUSTOM);
    toast("Cleared custom questions");
    location.reload();
  });
};

// --- Start / Next flow with Online mode ---
const start = async () => {
  const useOnline = $("#useOnline")?.checked;
  const catValue = $("#category")?.value || "All";   // "All", local name, or "otdb:<id>"
  const count = Number($("#count")?.value || 10);
  const mode = $("#mode")?.value || "multiple";      // multiple | truefalse | mix
  const difficulty = $("#difficulty")?.value || "";  // "", easy, medium, hard

  $("#badgeText").textContent = useOnline ? "Online" : "In Progress";

  if (useOnline) {
    try {
      let otdbCategoryId = null;
      if (catValue.startsWith("otdb:")) {
        otdbCategoryId = Number(catValue.split(":")[1]);
      }
      const online = await fetchFromOpenTDB(count, mode, otdbCategoryId, difficulty);
      state.session = online;
    } catch (e) {
      console.warn("Online fetch failed", e);
      toast("Online fetch failed — using offline questions.");
      const bank = loadBank();
      const pool = filterBy(bank, catValue, mode);
      if (pool.length === 0) { toast("No questions available for this selection."); return; }
      state.session = sample(pool, Math.min(count, pool.length));
    }
  } else {
    const bank = loadBank();
    const pool = filterBy(bank, catValue, mode);
    if (pool.length === 0) { toast("No questions available for this selection."); return; }
    state.session = sample(pool, Math.min(count, pool.length));
  }

  state.idx = 0;
  state.score = 0;
  renderQuestion();
};

const next = () => {
  if (state.idx < state.session.length-1){
    state.idx++;
    renderQuestion();
  }
};

// --- Init ---
window.addEventListener("DOMContentLoaded", async () => {
  await fetchOnlineCategories();
  renderCategories(loadBank());
  reset();

  document.getElementById("startBtn").addEventListener("click", start);
  document.getElementById("nextBtn").addEventListener("click", next);
  document.getElementById("endBtn").addEventListener("click", endSession);
  document.getElementById("resetBtn").addEventListener("click", reset);
  bindImportExport();

  document.getElementById("useOnline").addEventListener("change", () => {
    document.getElementById("badgeText").textContent = document.getElementById("useOnline").checked ? "Online" : "Ready";
  });
});
