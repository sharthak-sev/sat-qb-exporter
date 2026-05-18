const params = new URLSearchParams(window.location.search);
const jobId = params.get("jobId");

init().catch(error => {
  document.body.textContent = error.message || String(error);
});

async function init() {
  if (!jobId) {
    throw new Error("Missing print job id.");
  }

  const response = await chrome.runtime.sendMessage({ type: "getPrintJob", jobId });
  if (!response?.ok || !response.job) {
    throw new Error("Print job was not found.");
  }

  renderJob(response.job);
  await waitForLayout();
  await chrome.runtime.sendMessage({ type: "printReady", jobId });
}

function renderJob(job) {
  const answerMode = job.answerMode || "no-answers";

  document.title = job.title || "SAT Question Packet";
  document.querySelector("#packetTitle").textContent = job.title || "SAT Question Packet";
  document.querySelector("#packetSubtitle").textContent = job.subtitle || "No Answers";

  const meta = document.querySelector("#packetMeta");
  meta.textContent = "";
  for (const item of job.meta || []) {
    const li = document.createElement("li");
    li.textContent = item;
    meta.append(li);
  }

  const questions = document.querySelector("#questions");
  questions.textContent = "";
  for (const question of job.questions || []) {
    questions.append(renderQuestion(question, answerMode));
  }
}

function renderQuestion(question, answerMode) {
  const article = document.createElement("article");
  article.className = "question";

  // ── "no-choices" mode: minimal — ID chip, stem, choices only, no header/meta ──
  if (answerMode === "no-choices") {
    // ID chip at top
    if (question.questionId) {
      const chip = document.createElement("div");
      chip.className = "id-chip";
      chip.textContent = `ID: ${question.questionId}`;
      article.append(chip);
    }

    // Stem (stimulus + question text)
    const stem = document.createElement("section");
    stem.className = "stem";
    stem.innerHTML = question.stem || "";
    rewriteRelativeUrls(stem);
    removeAccessibilityDescriptions(stem);
    article.append(stem);

    // Answer choices (still shown, just no header/meta)
    if (question.answerOptions?.length) {
      const choices = document.createElement("ol");
      choices.className = "choices";
      choices.type = "A";
      for (const option of question.answerOptions) {
        const item = document.createElement("li");
        item.innerHTML = option.content || "";
        rewriteRelativeUrls(item);
        removeAccessibilityDescriptions(item);
        choices.append(item);
      }
      article.append(choices);
    }

    return article;
  }

  // ── "no-answers" and "with-answers" modes: full layout ──

  const header = document.createElement("header");
  header.className = "question-header";

  const title = document.createElement("div");
  title.className = "question-title";
  title.textContent = question.questionId ? `Question ID ${question.questionId}` : `Question ${question.number}`;
  header.append(title);

  const number = document.createElement("div");
  number.className = "question-number";
  number.textContent = `Question ${question.number}`;
  header.append(number);

  article.append(header);
  article.append(renderQuestionMeta(question));

  if (question.questionId) {
    const chip = document.createElement("div");
    chip.className = "id-chip";
    chip.textContent = `ID: ${question.questionId}`;
    article.append(chip);
  }

  const stem = document.createElement("section");
  stem.className = "stem";
  stem.innerHTML = question.stem || "";
  rewriteRelativeUrls(stem);
  removeAccessibilityDescriptions(stem);
  article.append(stem);

  if (question.answerOptions?.length) {
    const choices = document.createElement("ol");
    choices.className = "choices";
    choices.type = "A";
    for (const option of question.answerOptions) {
      const item = document.createElement("li");
      item.innerHTML = option.content || "";
      rewriteRelativeUrls(item);
      removeAccessibilityDescriptions(item);

      // Highlight correct answer in "with-answers" mode
      if (answerMode === "with-answers" && option.isCorrect) {
        item.classList.add("correct-choice");
      }

      choices.append(item);
    }
    article.append(choices);
  }

  // ── "with-answers" extras: answer bar, correct answer, rationale, difficulty ──
  if (answerMode === "with-answers") {
    // Purple answer bar (matches CB style)
    if (question.questionId) {
      const answerBar = document.createElement("div");
      answerBar.className = "answer-bar";
      answerBar.textContent = `ID: ${question.questionId} Answer`;
      article.append(answerBar);
    }

    // Correct answer line
    if (question.correctAnswer?.length) {
      const correctLine = document.createElement("div");
      correctLine.className = "correct-answer-line";
      correctLine.innerHTML = `<strong>Correct Answer: ${question.correctAnswer.join(", ")}</strong>`;
      article.append(correctLine);
    }

    // Rationale
    if (question.rationale) {
      const rationaleLabel = document.createElement("div");
      rationaleLabel.className = "rationale-label";
      rationaleLabel.textContent = "Rationale";
      article.append(rationaleLabel);

      const rationaleBody = document.createElement("div");
      rationaleBody.className = "rationale-body";
      rationaleBody.innerHTML = question.rationale;
      rewriteRelativeUrls(rationaleBody);
      article.append(rationaleBody);
    }

    // Difficulty line at bottom
    if (question.difficulty) {
      const diffLine = document.createElement("div");
      diffLine.className = "difficulty-line";
      diffLine.textContent = `Question difficulty: ${question.difficulty}`;
      article.append(diffLine);
    }
  }

  return article;
}

function renderQuestionMeta(question) {
  const table = document.createElement("table");
  table.className = "question-info";

  const headers = ["Assessment", "Test", "Domain", "Skill", "Difficulty"];
  const values = [
    question.assessment || "SAT",
    question.test || "",
    question.domain || "",
    question.skill || "",
    ""
  ];

  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.append(th);
  }
  table.append(headerRow);

  const valueRow = document.createElement("tr");
  for (const [index, value] of values.entries()) {
    const td = document.createElement("td");
    if (index === values.length - 1) {
      td.append(renderDifficultyBars(question.difficultyCode));
    } else {
      td.textContent = value;
    }
    valueRow.append(td);
  }
  table.append(valueRow);

  return table;
}

function renderDifficultyBars(code) {
  const wrapper = document.createElement("div");
  wrapper.className = `difficulty-bars difficulty-${String(code || "").toLowerCase()}`;
  wrapper.setAttribute("aria-label", `Difficulty ${code || ""}`);

  const active = code === "H" ? 3 : code === "M" ? 2 : code === "E" ? 1 : 0;
  for (let index = 0; index < 3; index += 1) {
    const bar = document.createElement("span");
    bar.className = index < active ? "active" : "";
    wrapper.append(bar);
  }

  return wrapper;
}

function rewriteRelativeUrls(root) {
  for (const element of root.querySelectorAll("[src]")) {
    const value = element.getAttribute("src");
    if (isRelativeUrl(value)) {
      element.setAttribute("src", new URL(value, "https://mypractice.collegeboard.org/").href);
    }
  }

  for (const element of root.querySelectorAll("[href]")) {
    const value = element.getAttribute("href");
    if (isRelativeUrl(value)) {
      element.setAttribute("href", new URL(value, "https://mypractice.collegeboard.org/").href);
    }
  }
}

function removeAccessibilityDescriptions(root) {
  const hiddenSelectors = [
    "[class*='sr-only' i]",
    "[class*='screen-reader' i]",
    "[class*='visually-hidden' i]",
    "[class*='offscreen' i]",
    "[class*='accessib' i]",
    "[class*='a11y' i]",
    "[data-testid*='accessib' i]"
  ];

  for (const element of root.querySelectorAll(hiddenSelectors.join(","))) {
    element.remove();
  }

  const hasGraphic = Boolean(root.querySelector("svg,img,canvas,object,[role='img'],[aria-label*='graph' i]"));
  if (!hasGraphic) {
    return;
  }

  for (const list of root.querySelectorAll("ul,ol")) {
    const text = list.textContent.replace(/\s+/g, " ").trim();
    if (isLikelyGraphicDescription(text)) {
      list.remove();
    }
  }
}

function isLikelyGraphicDescription(text) {
  if (!text) {
    return false;
  }

  return /(?:the\s+(?:line|graph|curve|figure|scatterplot|bar graph)|passes\s+through|approximate\s+points?|slants|horizontal\s+axis|vertical\s+axis)/i.test(text);
}

function isRelativeUrl(value) {
  return Boolean(value) && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
}

async function waitForLayout() {
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  await Promise.all([...document.images].map(image => {
    if (image.complete) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));

  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
