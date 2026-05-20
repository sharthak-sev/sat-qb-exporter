let activePort = null;

const form = document.querySelector("#exportForm");
const authStatus = document.querySelector("#authStatus");
const statusDot = document.querySelector("#statusDot");
const sectionBadge = document.querySelector("#sectionBadge");
const sectionLabel = document.querySelector("#sectionLabel");
const notice = document.querySelector("#notice");
const refreshStatusBtn = document.querySelector("#refreshStatus");
const countQuestionsBtn = document.querySelector("#countQuestions");
const exportSampleBtn = document.querySelector("#exportSample");
const exportAllBtn = document.querySelector("#exportAll");
const selectedCount = document.querySelector("#selectedCount");
const progress = document.querySelector("#progress");
const progressText = document.querySelector("#progressText");
const downloadsEl = document.querySelector("#downloads");

document.addEventListener("DOMContentLoaded", init);

function init() {
  refreshStatusBtn.addEventListener("click", refreshStatus);
  countQuestionsBtn.addEventListener("click", () => startJob("countQuestions"));
  exportSampleBtn.addEventListener("click", () => startJob("exportSample"));
  exportAllBtn.addEventListener("click", () => startJob("exportAll"));
  refreshStatus();
}

async function refreshStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: "getStatus" });
    updateAuthStatus(status);
    updateSectionBadge(status.detectedSection);
  } catch (error) {
    showNotice(error.message || String(error));
  }
}

function updateAuthStatus(status) {
  if (status.hasAuth) {
    const captured = status.capturedAt ? new Date(status.capturedAt).toLocaleTimeString() : "recently";
    authStatus.textContent = `Session captured ${captured}`;
    statusDot.classList.add("active");
    hideNotice();
    return;
  }

  authStatus.textContent = "No session captured";
  statusDot.classList.remove("active");
  showNotice("Refresh the College Board question bank page after loading this extension. The exporter will capture the page's API headers from normal traffic.");
}

function updateSectionBadge(detected) {
  if (!detected?.key) {
    sectionBadge.classList.remove("detected");
    sectionLabel.textContent = "No section detected yet";
    return;
  }

  const labels = { math: "Math", rw: "Reading & Writing" };
  sectionBadge.classList.add("detected");
  sectionLabel.textContent = `${labels[detected.key] || detected.key} detected`;
}

function startJob(type) {
  if (!hasChecked("difficulty")) {
    showNotice("Select at least one difficulty.");
    return;
  }

  if (activePort) {
    activePort.disconnect();
  }

  downloadsEl.textContent = "";
  hideNotice();

  const options = collectOptions();

  setWorking(true);
  setProgress(0, type === "countQuestions" ? "Counting questions" : "Starting PDF export");

  activePort = chrome.runtime.connect({ name: "sat-qb-export" });
  activePort.onMessage.addListener(message => {
    if (message.type === "progress") {
      setProgress(message.value || 0, message.message || "Working");
    }
    if (message.type === "count") {
      selectedCount.textContent = `${message.count} matching ${message.section || ""} questions`.trim();
      setProgress(1, message.message || "Count complete");
      setWorking(false);
      activePort.disconnect();
      activePort = null;
    }
    if (message.type === "pdfGenerated") {
      appendDownload(message.filename);
    }
    if (message.type === "done") {
      selectedCount.textContent = `${message.count} questions exported`;
      setProgress(1, message.message || "Done");
      setWorking(false);
      refreshStatus();
      activePort.disconnect();
      activePort = null;
    }
    if (message.type === "error") {
      setProgress(0, "Job failed");
      showNotice(message.message || "Job failed");
      setWorking(false);
      activePort.disconnect();
      activePort = null;
    }
  });

  activePort.onDisconnect.addListener(() => {
    if (countQuestionsBtn.disabled) {
      setWorking(false);
    }
    activePort = null;
  });

  activePort.postMessage({ type, options });
}

function collectOptions() {
  const data = new FormData(form);

  return {
    difficulties: data.getAll("difficulty"),
    answerMode: data.get("answerMode") || "no-answers",
    excludeActive: document.querySelector("#excludeActive").checked,
    batchSize: document.querySelector("#batchSize").value,
    sampleSize: document.querySelector("#sampleSize").value
  };
}

function hasChecked(name) {
  return Boolean(form.querySelector(`input[name="${name}"]:checked`));
}

function setWorking(isWorking) {
  for (const element of form.elements) {
    element.disabled = isWorking;
  }
  refreshStatusBtn.disabled = isWorking;
}

function setProgress(value, text) {
  progress.value = Math.max(0, Math.min(1, value));
  progressText.textContent = text;
}

function appendDownload(filename) {
  const item = document.createElement("li");
  item.textContent = `✓ ${filename}`;
  downloadsEl.append(item);
}

function showNotice(text) {
  notice.hidden = false;
  notice.textContent = text;
}

function hideNotice() {
  notice.hidden = true;
  notice.textContent = "";
}
