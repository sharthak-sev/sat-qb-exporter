const DIGITAL_PRACTICE_HOST = "https://digitalpractice-api.collegeboard.org";
const API_BASE = `${DIGITAL_PRACTICE_HOST}/mspractice-studentquestionbank-prod`;
const AUTH_HEADERS = {
  authentication: "x-cb-catapult-authentication-token",
  authorization: "x-cb-catapult-authorization-token"
};

const STORAGE_KEYS = {
  auth: "satQbExporter.auth",
  page: "satQbExporter.page",
  detectedSection: "satQbExporter.detectedSection"
};

const SECTION_PROFILES = {
  math: {
    label: "Math",
    fileSlug: "math",
    liveSections: ["math"],
    tests: ["math"],
    domains: [
      { code: "H", label: "Algebra" },
      { code: "P", label: "Advanced Math" },
      { code: "Q", label: "Problem-Solving and Data Analysis" },
      { code: "S", label: "Geometry and Trigonometry" }
    ]
  },
  rw: {
    label: "Reading and Writing",
    fileSlug: "rw",
    liveSections: ["reading", "rw", "reading-writing", "reading_and_writing"],
    tests: ["reading", "rw", "reading-writing", "reading_and_writing"],
    domains: [
      { code: "INI", label: "Information and Ideas" },
      { code: "CAS", label: "Craft and Structure" },
      { code: "EOI", label: "Expression of Ideas" },
      { code: "SEC", label: "Standard English Conventions" }
    ]
  }
};

const DIFFICULTY_LABELS = {
  E: "Easy",
  M: "Medium",
  H: "Hard"
};

const ANSWER_MODE_LABELS = {
  "no-answers": "No Correct Answers or Explanations",
  "with-answers": "With Correct Answers and Explanations",
  "no-choices": "Without Answers or Headers"
};

const RW_ALIASES = new Set(["reading", "rw", "reading-writing", "reading_and_writing"]);

const printJobs = new Map();
const printWaiters = new Map();

/* ── Auth header capture ── */

chrome.webRequest.onBeforeSendHeaders.addListener(
  details => {
    const headers = details.requestHeaders || [];
    const found = getAuthFromHeaders(headers);

    if (!found.authenticationToken || !found.authorizationToken) {
      return;
    }

    chrome.storage.local.set({
      [STORAGE_KEYS.auth]: {
        ...found,
        capturedAt: Date.now(),
        capturedFrom: details.url
      }
    });
  },
  {
    urls: [
      `${DIGITAL_PRACTICE_HOST}/mspractice-studentquestionbank-prod/*`,
      `${DIGITAL_PRACTICE_HOST}/mspractice-testresults-prod/*`
    ],
    types: ["xmlhttprequest"]
  },
  ["requestHeaders", "extraHeaders"]
);

/* ── Section auto-detection from API traffic ── */

chrome.webRequest.onBeforeRequest.addListener(
  details => {
    if (details.method !== "POST") {
      return;
    }
    try {
      const raw = details.requestBody?.raw;
      if (!raw?.[0]?.bytes) {
        return;
      }
      const body = JSON.parse(new TextDecoder().decode(raw[0].bytes));
      const apiValue = body.test || body.section;
      if (!apiValue) {
        return;
      }
      const key = RW_ALIASES.has(apiValue) ? "rw" : apiValue === "math" ? "math" : null;
      if (key) {
        chrome.storage.local.set({
          [STORAGE_KEYS.detectedSection]: {
            key,
            apiValue,
            detectedAt: Date.now()
          }
        });
      }
    } catch {
      // Ignore non-JSON or parse errors
    }
  },
  {
    urls: [`${DIGITAL_PRACTICE_HOST}/mspractice-studentquestionbank-prod/*`],
    types: ["xmlhttprequest"]
  },
  ["requestBody"]
);

/* ── Message handling ── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "getStatus") {
    getStatus().then(sendResponse);
    return true;
  }

  if (message?.type === "clearAuth") {
    chrome.storage.local.remove(STORAGE_KEYS.auth).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === "pageSeen") {
    chrome.storage.local.set({
      [STORAGE_KEYS.page]: {
        href: message.href,
        title: message.title,
        seenAt: message.seenAt || Date.now()
      }
    });
    return false;
  }

  if (message?.type === "getPrintJob") {
    const job = printJobs.get(message.jobId);
    sendResponse({ ok: Boolean(job), job });
    return false;
  }

  if (message?.type === "printReady") {
    const waiter = printWaiters.get(message.jobId);
    if (waiter && (!waiter.tabId || waiter.tabId === sender.tab?.id)) {
      waiter.resolve();
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

/* ── Long-lived port for export jobs ── */

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "sat-qb-export") {
    return;
  }

  let disconnected = false;
  port.onDisconnect.addListener(() => {
    disconnected = true;
  });

  const post = payload => {
    if (disconnected) {
      return;
    }
    try {
      port.postMessage(payload);
    } catch {
      disconnected = true;
    }
  };

  port.onMessage.addListener(message => {
    if (message?.type === "countQuestions") {
      countQuestions(message.options || {}, post).catch(error => postError(post, error));
      return;
    }

    if (message?.type === "exportSample") {
      exportPdfs("sample", message.options || {}, post).catch(error => postError(post, error));
      return;
    }

    if (message?.type === "exportAll") {
      exportPdfs("all", message.options || {}, post).catch(error => postError(post, error));
    }
  });
});

function postError(post, error) {
  post({
    type: "error",
    message: error?.message || String(error)
  });
}

function getAuthFromHeaders(headers) {
  const found = {};

  for (const header of headers) {
    const name = String(header.name || "").toLowerCase();
    if (name === AUTH_HEADERS.authentication) {
      found.authenticationToken = header.value;
    }
    if (name === AUTH_HEADERS.authorization) {
      found.authorizationToken = header.value;
    }
  }

  return found;
}

async function getStatus() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.auth, STORAGE_KEYS.page, STORAGE_KEYS.detectedSection]);
  const auth = stored[STORAGE_KEYS.auth] || null;
  const page = stored[STORAGE_KEYS.page] || null;
  const detected = stored[STORAGE_KEYS.detectedSection] || null;

  return {
    hasAuth: Boolean(auth?.authenticationToken && auth?.authorizationToken),
    capturedAt: auth?.capturedAt || null,
    capturedFrom: auth?.capturedFrom || null,
    page,
    sections: publicSectionProfiles(),
    detectedSection: detected
  };
}

function publicSectionProfiles() {
  return Object.fromEntries(
    Object.entries(SECTION_PROFILES).map(([key, profile]) => [
      key,
      {
        label: profile.label,
        domains: profile.domains
      }
    ])
  );
}

async function countQuestions(options, post) {
  const auth = await getAuthOrThrow();
  const normalized = normalizeOptions(options);

  post({
    type: "progress",
    value: 0.15,
    message: "Counting matching questions"
  });

  const result = await selectQuestions(auth, normalized, post);

  post({
    type: "count",
    value: 1,
    count: result.selected.length,
    section: result.profile.label,
    metadataCount: result.metadata.length,
    liveCount: result.liveIds.length,
    message: `${result.selected.length} matching ${result.profile.label} questions`
  });
}

async function exportPdfs(mode, options, post) {
  const auth = await getAuthOrThrow();
  const normalized = normalizeOptions(options);
  const selectedResult = await selectQuestions(auth, normalized, post);
  const selected = mode === "sample"
    ? selectedResult.selected.slice(0, normalized.sampleSize)
    : selectedResult.selected;

  if (!selected.length) {
    throw new Error("No questions matched those filters.");
  }

  post({
    type: "progress",
    phase: "details",
    value: 0.18,
    current: 0,
    total: selected.length,
    message: `Fetching details for ${selected.length} ${selectedResult.profile.label} questions`
  });

  const ids = selected.map(question => question.external_id);
  const details = await fetchDetails(ids, 25, auth, progress => {
    post({
      type: "progress",
      phase: "details",
      value: 0.18 + (progress.done / progress.total) * 0.42,
      current: progress.done,
      total: progress.total,
      message: `Fetched ${progress.done} of ${progress.total}`
    });
  });

  const detailMap = new Map(details.map(detail => [detail.externalid || detail.external_id, detail]));
  const rows = selected.map((metadata, index) => ({
    absoluteIndex: mode === "sample" ? index + 1 : selectedResult.indexById.get(metadata.external_id),
    metadata,
    detail: detailMap.get(metadata.external_id) || {}
  }));

  const batches = chunk(rows, mode === "sample" ? rows.length : normalized.batchSize);
  const downloaded = [];

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const part = index + 1;
    const totalParts = batches.length;
    const filename = makePdfFileName(selectedResult.profile, normalized, mode, part, totalParts);

    post({
      type: "progress",
      phase: "pdf",
      value: 0.6 + (index / totalParts) * 0.38,
      current: part,
      total: totalParts,
      message: `Printing PDF ${part} of ${totalParts}`
    });

    const printJob = makePrintJob({
      profile: selectedResult.profile,
      normalized,
      mode,
      part,
      totalParts,
      totalQuestions: selectedResult.selected.length,
      rows: batch
    });
    downloaded.push(await renderPdf(printJob, filename));
  }

  post({
    type: "done",
    value: 1,
    count: rows.length,
    downloads: downloaded,
    message: `Saved ${downloaded.length} PDF${downloaded.length === 1 ? "" : "s"}`
  });
}

async function getAuthOrThrow() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.auth);
  const auth = stored[STORAGE_KEYS.auth];

  if (!auth?.authenticationToken || !auth?.authorizationToken) {
    throw new Error("No College Board auth headers captured yet. Refresh the question bank page, then try again.");
  }

  return auth;
}

async function selectQuestions(auth, normalized, post) {
  // Auto-detect section from captured API traffic
  const sectionStore = await chrome.storage.local.get(STORAGE_KEYS.detectedSection);
  const detected = sectionStore[STORAGE_KEYS.detectedSection];
  const sectionKey = detected?.key && SECTION_PROFILES[detected.key] ? detected.key : normalized.section;
  const profile = SECTION_PROFILES[sectionKey];

  // Use all domains for the detected section
  const domains = profile.domains.map(domain => domain.code);

  let liveIds = [];
  let liveAlias = null;

  if (normalized.excludeActive) {
    post({
      type: "progress",
      phase: "live-items",
      value: 0.05,
      message: "Loading active question IDs"
    });
    const liveResult = await fetchFirstWorking(
      profile.liveSections,
      section => apiPost("/live-items", { section }, auth),
      "live item section"
    );
    liveIds = uniqueStrings(liveResult.value);
    liveAlias = liveResult.alias;
  }

  post({
    type: "progress",
    phase: "metadata",
    value: 0.1,
    message: `Loading ${profile.label} question metadata`
  });

  const questionResult = await fetchFirstWorking(
    profile.tests,
    test => apiPost("/get-questions", {
      asmtEventId: 99,
      test,
      domain: domains.join(",")
    }, auth),
    "question test"
  );

  const metadata = Array.isArray(questionResult.value) ? questionResult.value : [];
  const liveSet = new Set(liveIds);
  const allowedDifficulties = new Set(normalized.difficulties);
  const allowedDomains = new Set(domains);

  let selected = metadata.filter(question => {
    if (!allowedDomains.has(question.primary_class_cd)) {
      return false;
    }
    if (!allowedDifficulties.has(question.difficulty)) {
      return false;
    }
    if (normalized.excludeActive && liveSet.has(question.external_id)) {
      return false;
    }
    return Boolean(question.external_id);
  });

  selected = dedupeBy(selected, question => question.external_id);

  if (!selected.length) {
    throw new Error("No questions matched those filters.");
  }

  return {
    profile,
    metadata,
    selected,
    liveIds,
    liveAlias,
    questionAlias: questionResult.alias,
    indexById: new Map(selected.map((question, index) => [question.external_id, index + 1]))
  };
}

function normalizeOptions(options) {
  const section = SECTION_PROFILES[options.section] ? options.section : "math";
  const profile = SECTION_PROFILES[section];
  const validDomains = new Set(profile.domains.map(domain => domain.code));
  const validDifficulties = new Set(["E", "M", "H"]);
  const domains = uniqueStrings(options.domains).filter(domain => validDomains.has(domain));
  const difficulties = uniqueStrings(options.difficulties).filter(difficulty => validDifficulties.has(difficulty));
  const validAnswerModes = new Set(["no-answers", "with-answers", "no-choices"]);

  return {
    section,
    domains: domains.length ? domains : profile.domains.map(domain => domain.code),
    difficulties: difficulties.length ? difficulties : ["M", "H"],
    excludeActive: options.excludeActive === true,
    answerMode: validAnswerModes.has(options.answerMode) ? options.answerMode : "no-answers",
    batchSize: clamp(Number.parseInt(options.batchSize, 10) || 100, 1, 250),
    sampleSize: clamp(Number.parseInt(options.sampleSize, 10) || 10, 1, 50)
  };
}

async function fetchFirstWorking(aliases, run, label) {
  const errors = [];

  for (const alias of aliases) {
    try {
      const value = await run(alias);
      if (Array.isArray(value) && value.length > 0) {
        return { alias, value };
      }
      errors.push(`${alias}: unexpected response`);
    } catch (error) {
      errors.push(`${alias}: ${error.message}`);
    }
  }

  throw new Error(`Could not find a working ${label}. Tried ${errors.join("; ")}`);
}

async function apiPost(path, body, auth) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "accept": "application/json, text/plain, */*",
      "content-type": "application/json",
      [AUTH_HEADERS.authentication]: auth.authenticationToken,
      [AUTH_HEADERS.authorization]: auth.authorizationToken
    },
    body: JSON.stringify(body || {})
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`${path} failed with HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function fetchDetails(ids, preferredChunkSize, auth, onProgress) {
  const total = ids.length;
  let done = 0;
  const details = [];

  for (let index = 0; index < ids.length; index += preferredChunkSize) {
    const chunkIds = ids.slice(index, index + preferredChunkSize);
    const chunkDetails = await fetchDetailsChunk(chunkIds, auth);
    details.push(...chunkDetails);
    done += chunkIds.length;
    onProgress({ done, total });
    await sleep(150);
  }

  return details;
}

async function fetchDetailsChunk(ids, auth) {
  try {
    const value = await apiPost("/pdf-download", { external_ids: ids }, auth);
    if (Array.isArray(value)) {
      return value;
    }
    throw new Error("pdf-download returned an unexpected response");
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      throw error;
    }

    if (ids.length === 1) {
      return [await apiPost("/get-question", { external_id: ids[0] }, auth)];
    }

    const mid = Math.ceil(ids.length / 2);
    const left = await fetchDetailsChunk(ids.slice(0, mid), auth);
    const right = await fetchDetailsChunk(ids.slice(mid), auth);
    return [...left, ...right];
  }
}

function makePrintJob({ profile, normalized, mode, part, totalParts, totalQuestions, rows }) {
  const difficultyText = normalized.difficulties.map(code => DIFFICULTY_LABELS[code] || code).join(", ");

  return {
    title: `SAT ${profile.label} Question Bank`,
    subtitle: `${difficultyText} — ${ANSWER_MODE_LABELS[normalized.answerMode] || "No Answers"}`,
    answerMode: normalized.answerMode,
    meta: [
      `${rows.length} question${rows.length === 1 ? "" : "s"} in this PDF`,
      `${totalQuestions} matching question${totalQuestions === 1 ? "" : "s"} total`,
      `Part ${part} of ${totalParts}`,
      normalized.excludeActive ? "Excluding active questions" : "All matching questions"
    ],
    questions: rows.map(row => toPrintableQuestion(row, profile)),
    generatedAt: new Date().toISOString(),
    mode
  };
}

function toPrintableQuestion(row, profile) {
  const detail = row.detail || {};
  const metadata = row.metadata || {};
  const domain = profile.domains.find(item => item.code === metadata.primary_class_cd);
  const options = Array.isArray(detail.answerOptions) ? detail.answerOptions : [];
  const correctAnswers = Array.isArray(detail.correct_answer) ? detail.correct_answer : [];

  return {
    number: row.absoluteIndex,
    type: detail.type || "",
    externalId: metadata.external_id || detail.externalid || "",
    questionId: metadata.questionId || "",
    assessment: "SAT",
    test: profile.label,
    domain: metadata.primary_class_cd_desc || domain?.label || metadata.primary_class_cd || "",
    skill: metadata.skill_desc || metadata.skill_cd || "",
    difficultyCode: metadata.difficulty || "",
    difficulty: DIFFICULTY_LABELS[metadata.difficulty] || metadata.difficulty || "",
    stem: firstHtmlField(detail, ["stimulus", "passage", "scenario", "body", "prompt", "stem"]),
    answerOptions: options.map((option, index) => ({
      letter: letterAt(index),
      content: cleanHtml(option.content || ""),
      isCorrect: correctAnswers.includes(letterAt(index))
    })),
    correctAnswer: correctAnswers,
    rationale: cleanHtml(detail.rationale || "")
  };
}

function firstHtmlField(detail, keys) {
  for (const key of keys) {
    if (typeof detail[key] === "string" && detail[key].trim()) {
      return cleanHtml(detail[key]);
    }
  }
  return "";
}

async function renderPdf(printJob, filename) {
  const jobId = crypto.randomUUID();
  printJobs.set(jobId, printJob);

  let tabId = null;
  let attached = false;

  try {
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL(`print.html?jobId=${encodeURIComponent(jobId)}`),
      active: false
    });
    tabId = tab.id;

    await waitForPrintReady(jobId, tabId);
    await chrome.debugger.attach({ tabId }, "1.3");
    attached = true;
    await chrome.debugger.sendCommand({ tabId }, "Emulation.setEmulatedMedia", { media: "print" });
    const result = await chrome.debugger.sendCommand({ tabId }, "Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0.45,
      marginBottom: 0.45,
      marginLeft: 0.45,
      marginRight: 0.45
    });

    const downloadId = await chrome.downloads.download({
      url: `data:application/pdf;base64,${result.data}`,
      filename,
      conflictAction: "uniquify",
      saveAs: false
    });

    return { id: downloadId, filename };
  } finally {
    printJobs.delete(jobId);
    printWaiters.delete(jobId);
    if (attached && tabId != null) {
      await chrome.debugger.detach({ tabId }).catch(() => {});
    }
    if (tabId != null) {
      await chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

function waitForPrintReady(jobId, tabId) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      printWaiters.delete(jobId);
      reject(new Error("Timed out while preparing the print page."));
    }, 45_000);

    printWaiters.set(jobId, {
      tabId,
      resolve: () => {
        clearTimeout(timeoutId);
        printWaiters.delete(jobId);
        resolve();
      }
    });
  });
}

function makePdfFileName(profile, normalized, mode, part, totalParts) {
  const difficultySlug = normalized.difficulties.map(code => code.toLowerCase()).join("");
  const answerSlugs = {
    "no-answers": "no-answers",
    "with-answers": "with-answers",
    "no-choices": "questions-only"
  };
  const answerSlug = answerSlugs[normalized.answerMode] || "no-answers";
  const prefix = `sat-${profile.fileSlug}-${answerSlug}-${difficultySlug}`;

  if (mode === "sample") {
    return `${prefix}-sample.pdf`;
  }

  return `${prefix}-part-${pad(part)}-of-${pad(totalParts)}.pdf`;
}

function cleanHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value)).filter(Boolean))];
}

function dedupeBy(values, keyFn) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function chunk(values, size) {
  const result = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

function letterAt(index) {
  return String.fromCharCode(65 + index);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
