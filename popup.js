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
const exportInteractiveBtn = document.querySelector("#exportInteractive");
const supportBtn = document.querySelector("#supportBtn");
const supportSection = document.querySelector("#supportSection");
const selectedCount = document.querySelector("#selectedCount");
const progress = document.querySelector("#progress");
const progressText = document.querySelector("#progressText");
const downloadsEl = document.querySelector("#downloads");

const practiceTestCard = document.querySelector("#practiceTestCard");
const practiceTestToggle = document.querySelector("#practiceTestToggle");
const attemptDropdown = document.querySelector("#attemptDropdown");
const exportPracticeBtn = document.querySelector("#exportPracticeBtn");
const practiceTestControls = document.querySelector("#practiceTestControls");
const qbCards = document.querySelectorAll("#exportForm .card:not(#practiceTestCard)");
const actionsPanel = document.querySelector("#exportForm .actions");

document.addEventListener("DOMContentLoaded", init);

function init() {
  refreshStatusBtn.addEventListener("click", refreshStatus);
  countQuestionsBtn.addEventListener("click", () => startJob("countQuestions"));
  exportSampleBtn.addEventListener("click", () => startJob("exportSample"));
  exportAllBtn.addEventListener("click", () => startJob("exportAll"));
  exportInteractiveBtn.addEventListener("click", () => startJob("exportInteractiveTest"));
  
  if (practiceTestToggle) {
    practiceTestToggle.style.display = 'block';
    practiceTestToggle.addEventListener("change", async (e) => {
      if (e.target.checked) {
        attemptDropdown.innerHTML = '<option value="">Loading attempts...</option>';
        try {
          const res = await chrome.runtime.sendMessage({ type: "getPracticeTestScores" });
          if (res && res.ok && res.attempts && res.attempts.length > 0) {
            attemptDropdown.innerHTML = '';
            res.attempts.forEach(attempt => {
              const opt = document.createElement("option");
              opt.value = attempt.rosterEntryId;
              let dateStr = "";
              if (attempt.asmtSubmissionStartTime) {
                const isTimestamp = typeof attempt.asmtSubmissionStartTime === "number";
                dateStr = new Date(isTimestamp ? attempt.asmtSubmissionStartTime * 1000 : attempt.asmtSubmissionStartTime).toLocaleDateString();
              }
              const totalScore = attempt.totalScore?.score || attempt.totalScore || 0;
              const scoreStr = totalScore ? `(Score: ${totalScore})` : "";
              opt.textContent = `${attempt.displayTitle || "Practice Test"} - ${dateStr} ${scoreStr}`.trim();
              attemptDropdown.appendChild(opt);
            });
            attemptDropdown.style.display = 'block';
            exportPracticeBtn.style.display = 'block';
            practiceTestControls.style.display = 'block';
          } else {
            showNotice(res?.error || "No attempts found.");
            practiceTestToggle.checked = false;
            attemptDropdown.style.display = 'none';
            exportPracticeBtn.style.display = 'none';
            practiceTestControls.style.display = 'none';
          }
        } catch (err) {
          showNotice(err.message || String(err));
          practiceTestToggle.checked = false;
          attemptDropdown.style.display = 'none';
          exportPracticeBtn.style.display = 'none';
          practiceTestControls.style.display = 'none';
        }
      } else {
        attemptDropdown.style.display = 'none';
        exportPracticeBtn.style.display = 'none';
        practiceTestControls.style.display = 'none';
      }
    });
  }

  if (exportPracticeBtn) {
    exportPracticeBtn.addEventListener("click", () => {
      startJob("exportPracticeTest");
    });
  }

  supportBtn.addEventListener("click", () => {
    supportSection.style.display = "flex";
    supportSection.scrollIntoView({ behavior: "smooth", block: "end" });
  });

  const closeSupportBtn = document.querySelector("#closeSupportBtn");
  if (closeSupportBtn) {
    closeSupportBtn.addEventListener("click", () => {
      supportSection.style.display = "none";
    });
  }

  refreshStatus();
}

async function refreshStatus() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeUrl = tabs[0]?.url || "";
    
    const isQbPage = activeUrl.includes("mypractice.collegeboard.org/questionbank/results");
    const isDetailsPage = activeUrl.includes("mypractice.collegeboard.org/details");
    const isDashboardPage = activeUrl.includes("mypractice.collegeboard.org/dashboard");

    if (!isQbPage && !isDetailsPage && !isDashboardPage) {
      authStatus.textContent = "Outside Supported Pages";
      statusDot.classList.remove("active");
      updateSectionBadge(null);
      showNotice("Please visit Question Bank Results, Practice Test Details, or Dashboard to use this exporter.");
      setWorking(true);
      if (practiceTestToggle) {
        practiceTestToggle.disabled = true;
        practiceTestToggle.checked = false;
      }
      refreshStatusBtn.disabled = false;
      return;
    }

    const status = await chrome.runtime.sendMessage({ type: "getStatus" });
    setWorking(false);
    updateAuthStatus(status);
    
    if (isQbPage) {
      updateSectionBadge(status.detectedSection);
      showPracticeTestUi(false);
    } else {
      updateSectionBadge(null);
      showPracticeTestUi(true);
    }
  } catch (error) {
    showNotice(error.message || String(error));
  }
}

function showPracticeTestUi(show) {
  if (practiceTestCard) {
    practiceTestCard.style.display = show ? "block" : "none";
  }
  if (practiceTestToggle) {
    practiceTestToggle.style.display = show ? "block" : "none";
    practiceTestToggle.disabled = false;
  }
  if (!show) {
    if (attemptDropdown) attemptDropdown.style.display = "none";
    if (exportPracticeBtn) exportPracticeBtn.style.display = "none";
    if (practiceTestControls) practiceTestControls.style.display = "none";
  }
  qbCards.forEach(card => {
    card.style.display = show ? "none" : "block";
  });
  if (actionsPanel) {
    actionsPanel.style.display = show ? "none" : "grid";
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

async function startJob(type) {
  if (type !== "exportPracticeTest" && !hasChecked("difficulty")) {
    showNotice("Select at least one difficulty.");
    return;
  }

  if (activePort) {
    activePort.disconnect();
  }

  downloadsEl.textContent = "";
  hideNotice();

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeUrl = tabs[0]?.url || "";

  let rosterEntryId = null;
  let title = "SAT Practice Test";
  if (type === "exportPracticeTest") {
    rosterEntryId = attemptDropdown.value;
    const selectedOption = attemptDropdown.options[attemptDropdown.selectedIndex];
    if (selectedOption) {
      title = selectedOption.text;
    }
    if (!rosterEntryId) {
      const match = activeUrl.match(/\/details\?([^#&]+)/);
      rosterEntryId = match ? match[1] : null;
    }
    if (!rosterEntryId) {
      showNotice("Please select a practice test attempt.");
      if (practiceTestToggle) {
        practiceTestToggle.checked = false;
        practiceTestControls.style.display = 'none';
      }
      return;
    }
  }

  const options = collectOptions();
  options.activeUrl = activeUrl;
  options.rosterEntryId = rosterEntryId;
  options.title = title;

  setWorking(true);
  setProgress(0, type === "exportPracticeTest" ? "Starting practice test export" : getJobStartLabel(type));

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
      if (type === "exportPracticeTest") {
        selectedCount.textContent = "Practice test exported";
      } else {
        selectedCount.textContent = `${message.count} questions exported`;
      }
      if (message.filename) {
        appendDownload(message.filename);
      }
      setProgress(1, message.message || "Done");

      if (practiceTestToggle) {
        practiceTestToggle.checked = false;
        practiceTestControls.style.display = 'none';
      }

      setWorking(false);
      refreshStatus().finally(() => {
        if (message.warnings?.length) {
          showNotice(`Export completed with warnings: ${message.warnings.join(" ")}`);
        }
      });
      activePort.disconnect();
      activePort = null;
    }
    if (message.type === "error") {
      setProgress(0, "Job failed");
      showNotice(message.message || "Job failed");

      if (practiceTestToggle) {
        practiceTestToggle.checked = false;
        practiceTestControls.style.display = 'none';
      }

      setWorking(false);
      activePort.disconnect();
      activePort = null;
    }
  });

  activePort.onDisconnect.addListener(() => {
    if (countQuestionsBtn.disabled) {
      setWorking(false);
    }
    if (practiceTestToggle) {
      practiceTestToggle.checked = false;
      practiceTestControls.style.display = 'none';
    }
    activePort = null;
  });

  activePort.postMessage({ type, options });
}

function collectOptions() {
  const data = new FormData(form);

  return {
    assessment: data.get("assessment") || "99",
    difficulties: data.getAll("difficulty"),
    answerMode: data.get("answerMode") || "no-answers",
    excludeActive: document.querySelector("#excludeActive").checked,
    batchSize: document.querySelector("#batchSize").value,
    sampleSize: document.querySelector("#sampleSize").value
  };
}

function getJobStartLabel(type) {
  if (type === "countQuestions") {
    return "Counting questions";
  }
  if (type === "exportInteractiveTest") {
    return "Starting interactive test export";
  }
  return "Starting PDF export";
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
