const categories = [
  "All",
  "Popular Culture",
  "General Knowledge",
  "Entertainment",
  "Animals",
  "Geography",
  "Politics",
  "Science",
  "History",
  "Sport",
  "Music",
  "Literature",
  "Art and Culture",
  "Christmas",
  "Halloween",
  "Movies",
  "TV Shows"
];

const categorySelect = document.getElementById("category");
categories.forEach(cat => {
  const option = document.createElement("option");
  option.value = cat;
  option.textContent = cat;
  categorySelect.appendChild(option);
});

async function startTrivia() {
  const selected = categorySelect.value;
  let url = "https://opentdb.com/api.php?amount=10&type=multiple";

  // Map some categories to OpenTDB IDs
  const categoryMap = {
    "General Knowledge": 9,
    "Entertainment": 11,
    "Animals": 27,
    "Geography": 22,
    "Politics": 24,
    "Science": 17,
    "History": 23,
    "Sport": 21,
    "Music": 12,
    "Movies": 11,
    "TV Shows": 14
  };

  if (categoryMap[selected]) {
    url += `&category=${categoryMap[selected]}`;
  }

  let response = await fetch(url);
  let data = await response.json();
  let questions = data.results;

  // Handle seasonal categories by keyword filter
  if (selected === "Christmas" || selected === "Halloween") {
    questions = questions.filter(q =>
      q.question.toLowerCase().includes(selected.toLowerCase())
    );
  }

  const container = document.getElementById("question-container");
  container.innerHTML = "";
  questions.forEach(q => {
    const div = document.createElement("div");
    div.innerHTML = `<p>${q.question}</p>`;
    container.appendChild(div);
  });
}