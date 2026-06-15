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

  if (message?.type === "getPracticeTestScores") {
    getPracticeTestScores()
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "exportPracticeTestData") {
    exportPracticeTestDataDirect(message.rosterEntryId, message.title)
      .then(res => sendResponse({ ok: true, status: "Export complete", filename: res.filename, downloadId: res.downloadId, data: res.data }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
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
      return;
    }

    if (message?.type === "exportInteractiveTest") {
      exportInteractiveTest(message.options || {}, post).catch(error => postError(post, error));
      return;
    }

    if (message?.type === "exportPracticeTest") {
      exportPracticeTest(message.options || {}, post).catch(error => postError(post, error));
      return;
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
  const pdfEntries = [];

  let tabId = null;
  let attached = false;

  try {
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL("print.html"),
      active: false
    });
    tabId = tab.id;

    await waitForTabLoad(tabId);
    await chrome.debugger.attach({ tabId }, "1.3");
    attached = true;

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const part = index + 1;
      const totalParts = batches.length;
      const filename = makePdfFileName(selectedResult.profile, normalized, mode, part, totalParts);

      post({
        type: "progress",
        phase: "pdf",
        value: 0.6 + (index / totalParts) * 0.35,
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

      const pdfBase64 = await renderPdfInTab(tabId, printJob);
      pdfEntries.push({ name: filename, data: base64ToBytes(pdfBase64) });

      post({ type: "pdfGenerated", filename, current: part, total: totalParts });
    }
  } finally {
    if (attached && tabId != null) {
      await chrome.debugger.detach({ tabId }).catch(() => {});
    }
    if (tabId != null) {
      await chrome.tabs.remove(tabId).catch(() => {});
    }
  }

  // Bundle all PDFs into a single ZIP — one download, one save dialog
  post({ type: "progress", value: 0.96, message: "Creating ZIP archive…" });
  const zipBytes = createZip(pdfEntries);
  const zipBase64 = bytesToBase64(zipBytes);
  const zipFilename = makeZipFileName(selectedResult.profile, normalized, mode);

  await chrome.downloads.download({
    url: `data:application/zip;base64,${zipBase64}`,
    filename: zipFilename,
    conflictAction: "uniquify",
    saveAs: true
  });

  post({
    type: "done",
    value: 1,
    count: rows.length,
    downloads: pdfEntries.map(e => ({ filename: e.name })),
    zipFilename,
    message: `Saved ${pdfEntries.length} PDF${pdfEntries.length === 1 ? "" : "s"} in ${zipFilename}`
  });
}

async function exportInteractiveTest(options, post) {
  const auth = await getAuthOrThrow();
  const requestedSections = ["math", "rw"];
  const allQuestions = [];
  const sectionSummaries = [];
  const warnings = [];

  for (let sectionIndex = 0; sectionIndex < requestedSections.length; sectionIndex += 1) {
    const section = requestedSections[sectionIndex];
    const normalized = normalizeOptions({ ...options, section });
    const profile = SECTION_PROFILES[section];
    const progressBase = sectionIndex === 0 ? 0.04 : 0.5;

    post({
      type: "progress",
      phase: "interactive-metadata",
      value: progressBase,
      message: `Loading ${profile.label} question list`
    });

    let selectedResult;
    try {
      selectedResult = await selectQuestions(auth, normalized, post, section);
    } catch (error) {
      warnings.push(`${profile.label}: ${error.message}`);
      continue;
    }

    post({
      type: "progress",
      phase: "interactive-details",
      value: progressBase + 0.08,
      current: 0,
      total: selectedResult.selected.length,
      message: `Fetching ${selectedResult.selected.length} ${profile.label} question details`
    });

    const ids = selectedResult.selected.map(question => question.external_id);
    const details = await fetchDetails(ids, 25, auth, progress => {
      post({
        type: "progress",
        phase: "interactive-details",
        value: progressBase + 0.08 + (progress.done / progress.total) * 0.34,
        current: progress.done,
        total: progress.total,
        message: `Fetched ${progress.done} of ${progress.total} ${profile.label} questions`
      });
    });

    const detailMap = new Map(details.map(detail => [detail.externalid || detail.external_id, detail]));
    const rows = selectedResult.selected.map((metadata, index) => ({
      absoluteIndex: selectedResult.indexById.get(metadata.external_id) || index + 1,
      metadata,
      detail: detailMap.get(metadata.external_id) || {}
    }));

    allQuestions.push(...rows.map(row => toInteractiveQuestion(row, profile, section, options.assessment)));
    sectionSummaries.push({
      subject: section,
      label: profile.label,
      selectedCount: rows.length,
      metadataCount: selectedResult.metadata.length,
      domains: profile.domains
    });
  }

  if (!allQuestions.length) {
    throw new Error(`No questions could be exported. ${warnings.join(" ")}`.trim());
  }

  post({
    type: "progress",
    phase: "interactive-save",
    value: 0.92,
    message: "Preparing interactive test file"
  });

  const exportFile = {
    format: "sat-test",
    formatVersion: 1,
    assessmentId: options.assessment,
    source: {
      name: "SAT Question Bank Exporter",
      extensionVersion: chrome.runtime.getManifest().version
    },
    exportedAt: new Date().toISOString(),
    filters: {
      difficulties: normalizeDifficulties(options.difficulties),
      excludeActive: options.excludeActive === true
    },
    sections: sectionSummaries,
    warnings,
    counts: countInteractiveQuestions(allQuestions),
    questions: allQuestions
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(exportFile));
  const filename = makeInteractiveFileName(exportFile);

  await chrome.downloads.download({
    url: `data:application/vnd.sat-test+json;base64,${bytesToBase64(jsonBytes)}`,
    filename,
    conflictAction: "uniquify",
    saveAs: true
  });

  post({
    type: "done",
    value: 1,
    count: allQuestions.length,
    filename,
    warnings,
    message: `Saved ${allQuestions.length} questions to ${filename}`
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

async function selectQuestions(auth, normalized, post, forcedSection = null) {
  // Auto-detect section from captured API traffic
  const sectionStore = await chrome.storage.local.get(STORAGE_KEYS.detectedSection);
  const detected = sectionStore[STORAGE_KEYS.detectedSection];
  const sectionKey = forcedSection || (detected?.key && SECTION_PROFILES[detected.key] ? detected.key : normalized.section);
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

  const eventId = normalized.assessment;
  const metadata = [];
  let questionAlias = null;
  const errors = [];

  try {
      const questionResult = await fetchFirstWorking(
        profile.tests,
        test => apiPost("/get-questions", {
          asmtEventId: eventId,
          test,
          domain: domains.join(",")
        }, auth),
        `question test for event ${eventId}`
      );
      if (Array.isArray(questionResult.value)) {
        metadata.push(...questionResult.value);
        questionAlias = questionAlias || questionResult.alias;
      }
    } catch (err) {
      errors.push(err.message);
    }

  if (metadata.length === 0) {
    throw new Error(`Could not find working question tests. ${errors.join(" | ")}`);
  }

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
    questionAlias,
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
  const validAssessments = new Set([99, 100, 102, "99", "100", "102"]);

  return {
    assessment: validAssessments.has(options.assessment) ? Number(options.assessment) : 99,
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

  const assessmentNames = { 99: "SAT", 100: "PSAT/NMSQT & PSAT 10", 102: "PSAT 8/9" };
  const assessmentName = assessmentNames[normalized.assessment] || "SAT";

  return {
    title: `${assessmentName} ${profile.label} Question Bank`,
    subtitle: `${difficultyText} — ${ANSWER_MODE_LABELS[normalized.answerMode] || "No Answers"}`,
    answerMode: normalized.answerMode,
    meta: [
      `${rows.length} question${rows.length === 1 ? "" : "s"} in this PDF`,
      `${totalQuestions} matching question${totalQuestions === 1 ? "" : "s"} total`,
      `Part ${part} of ${totalParts}`,
      normalized.excludeActive ? "Excluding active questions" : "All matching questions"
    ],
    questions: rows.map(row => toPrintableQuestion(row, profile, normalized.assessment)),
    generatedAt: new Date().toISOString(),
    mode
  };
}

function toPrintableQuestion(row, profile, assessmentId) {
  const detail = row.detail || {};
  const metadata = row.metadata || {};
  const domain = profile.domains.find(item => item.code === metadata.primary_class_cd);
  const options = Array.isArray(detail.answerOptions) ? detail.answerOptions : [];
  const correctAnswers = Array.isArray(detail.correct_answer) ? detail.correct_answer : [];
  const assessmentNames = { 99: "SAT", 100: "PSAT/NMSQT & PSAT 10", 102: "PSAT 8/9" };

  return {
    number: row.absoluteIndex,
    type: detail.type || "",
    externalId: metadata.external_id || detail.externalid || "",
    questionId: metadata.questionId || "",
    assessment: assessmentNames[assessmentId] || "SAT",
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

function toInteractiveQuestion(row, profile, subject, assessmentId) {
  const detail = row.detail || {};
  const metadata = row.metadata || {};
  const domain = profile.domains.find(item => item.code === metadata.primary_class_cd);
  const options = Array.isArray(detail.answerOptions) ? detail.answerOptions : [];
  const correctAnswers = normalizeCorrectAnswers(detail.correct_answer || detail.keys);
  const type = detail.type || (options.length ? "mcq" : "spr");
  const stimulus = firstHtmlField(detail, ["stimulus", "passage", "scenario"]);
  const prompt = firstHtmlField(detail, ["stem", "body", "prompt"]);
  const assessmentNames = { 99: "SAT", 100: "PSAT/NMSQT & PSAT 10", 102: "PSAT 8/9" };

  return {
    id: crypto.randomUUID(),
    assessment: assessmentNames[assessmentId] || "SAT",
    externalId: metadata.external_id || detail.externalid || detail.external_id || "",
    questionId: metadata.questionId || "",
    subject,
    test: profile.label,
    domainCode: metadata.primary_class_cd || "",
    domain: metadata.primary_class_cd_desc || domain?.label || metadata.primary_class_cd || "",
    skillCode: metadata.skill_cd || "",
    skill: metadata.skill_desc || metadata.skill_cd || "",
    difficultyCode: metadata.difficulty || "",
    difficulty: DIFFICULTY_LABELS[metadata.difficulty] || metadata.difficulty || "",
    scoreBand: metadata.score_band_range_cd || null,
    type,
    stimulus,
    prompt,
    answerOptions: options.map((option, index) => ({
      id: option.id || "",
      letter: letterAt(index),
      content: cleanHtml(option.content || "")
    })),
    correctAnswers,
    rationale: cleanHtml(detail.rationale || ""),
    raw: {
      metadata,
      detail
    }
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

/* ── Single-tab PDF rendering — one debugger session for all batches ── */

async function renderPdfInTab(tabId, printJob) {
  const jobId = crypto.randomUUID();
  printJobs.set(jobId, printJob);

  try {
    const printUrl = chrome.runtime.getURL(`print.html?jobId=${encodeURIComponent(jobId)}`);
    await chrome.tabs.update(tabId, { url: printUrl });

    await waitForPrintReady(jobId, tabId);

    await chrome.debugger.sendCommand({ tabId }, "Emulation.setEmulatedMedia", { media: "print" });
    const result = await chrome.debugger.sendCommand({ tabId }, "Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0.45,
      marginBottom: 0.45,
      marginLeft: 0.45,
      marginRight: 0.45
    });

    return result.data; // base64 string — popup handles saving
  } finally {
    printJobs.delete(jobId);
    printWaiters.delete(jobId);
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for print tab to load."));
    }, 15_000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
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
  const answerSlug = { "no-answers": "no-answers", "with-answers": "answers", "no-choices": "no-choices" }[normalized.answerMode];
  const difficultySlug = normalized.difficulties.map(d => d.toLowerCase()).join("");
  const asmtSlugs = { 99: "sat", 100: "psat10", 102: "psat8-9" };
  const asmtSlug = asmtSlugs[normalized.assessment] || "sat";
  return `${asmtSlug}-${profile.fileSlug}-${answerSlug}-${difficultySlug}${mode === "sample" ? "-sample" : ""}-part-${pad(part)}-of-${pad(totalParts)}.pdf`;
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

function normalizeDifficulties(values) {
  const valid = new Set(["E", "M", "H"]);
  const difficulties = uniqueStrings(values).filter(value => valid.has(value));
  return difficulties.length ? difficulties : ["M", "H"];
}

function normalizeCorrectAnswers(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return uniqueStrings(values).map(value => cleanHtml(value).replace(/<[^>]*>/g, "").trim()).filter(Boolean);
}

function countInteractiveQuestions(questions) {
  const bySubject = {};
  const byDomain = {};

  for (const question of questions) {
    bySubject[question.subject] = (bySubject[question.subject] || 0) + 1;
    const domainKey = `${question.subject}:${question.domainCode || "unknown"}`;
    byDomain[domainKey] = {
      subject: question.subject,
      code: question.domainCode || "unknown",
      label: question.domain || "Unknown",
      count: (byDomain[domainKey]?.count || 0) + 1
    };
  }

  return {
    total: questions.length,
    bySubject,
    byDomain: Object.values(byDomain)
  };
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

function makeZipFileName(profile, normalized, mode) {
  const answerSlug = { "no-answers": "no-answers", "with-answers": "answers", "no-choices": "no-choices" }[normalized.answerMode];
  const difficultySlug = normalized.difficulties.map(d => d.toLowerCase()).join("");
  const asmtSlugs = { 99: "sat", 100: "psat10", 102: "psat8-9" };
  const asmtSlug = asmtSlugs[normalized.assessment] || "sat";
  return `${asmtSlug}-${profile.fileSlug}-${answerSlug}-${difficultySlug}${mode === "sample" ? "-sample" : ""}.zip`;
}

function makeInteractiveFileName(exportFile) {
  const stamp = new Date(exportFile.exportedAt)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "z");
  const mathCount = exportFile.counts.bySubject.math || 0;
  const rwCount = exportFile.counts.bySubject.rw || 0;
  const asmtSlugs = { 99: "sat", 100: "psat10", 102: "psat8-9" };
  const asmtSlug = asmtSlugs[exportFile.assessmentId] || "sat";
  return `${asmtSlug}-question-bank-interactive-math-${mathCount}-rw-${rwCount}-${stamp}.sat-test`;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

/* ── Minimal ZIP creator (uncompressed store) ── */

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZip(entries) {
  const enc = new TextEncoder();
  const files = entries.map(e => ({ nameBytes: enc.encode(e.name), data: e.data, crc: crc32(e.data) }));

  // Calculate total size
  let size = 22; // EOCD
  for (const f of files) size += 30 + f.nameBytes.length + f.data.length + 46 + f.nameBytes.length;

  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  let pos = 0;
  const offsets = [];

  // Local file headers + data
  for (const f of files) {
    offsets.push(pos);
    view.setUint32(pos, 0x04034b50, true); // local header sig
    view.setUint16(pos + 4, 20, true);     // version needed
    view.setUint16(pos + 8, 0, true);      // compression: stored
    view.setUint32(pos + 14, f.crc, true);
    view.setUint32(pos + 18, f.data.length, true); // compressed
    view.setUint32(pos + 22, f.data.length, true); // uncompressed
    view.setUint16(pos + 26, f.nameBytes.length, true);
    pos += 30;
    buf.set(f.nameBytes, pos); pos += f.nameBytes.length;
    buf.set(f.data, pos); pos += f.data.length;
  }

  // Central directory
  const cdOffset = pos;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    view.setUint32(pos, 0x02014b50, true); // central dir sig
    view.setUint16(pos + 4, 20, true);     // version made by
    view.setUint16(pos + 6, 20, true);     // version needed
    view.setUint16(pos + 10, 0, true);     // compression: stored
    view.setUint32(pos + 16, f.crc, true);
    view.setUint32(pos + 20, f.data.length, true);
    view.setUint32(pos + 24, f.data.length, true);
    view.setUint16(pos + 28, f.nameBytes.length, true);
    view.setUint32(pos + 42, offsets[i], true); // local header offset
    pos += 46;
    buf.set(f.nameBytes, pos); pos += f.nameBytes.length;
  }

  // End of central directory
  const cdSize = pos - cdOffset;
  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 8, files.length, true);
  view.setUint16(pos + 10, files.length, true);
  view.setUint32(pos + 12, cdSize, true);
  view.setUint32(pos + 16, cdOffset, true);

  return buf;
}

/* ── Practice Test Results Exporter Helpers ── */

const RESULTS_API_BASE = `${DIGITAL_PRACTICE_HOST}/mspractice-testresults-prod`;

async function resultsApiPost(path, body, auth) {
  const response = await fetch(`${RESULTS_API_BASE}${path}`, {
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

function getSectionName(id) {
  const name = String(id || "").toLowerCase();
  if (name === "reading" || name === "rw" || name === "reading and writing" || name === "reading_and_writing") {
    return "Reading and Writing";
  }
  if (name === "math") {
    return "Math";
  }
  return id;
}

async function getPracticeTestScores() {
  const auth = await getAuthOrThrow();
  const res = await resultsApiPost("/scores", null, auth);
  if (!res || !Array.isArray(res.scoreObjects)) {
    throw new Error("Invalid response from scores endpoint.");
  }
  return { ok: true, attempts: res.scoreObjects };
}

async function exportPracticeTestDataDirect(rosterEntryId, title) {
  const auth = await getAuthOrThrow();
  const exportFile = await buildPracticeTestJson(rosterEntryId, title, auth);

  const jsonString = JSON.stringify(exportFile, null, 2);
  const jsonBytes = new TextEncoder().encode(jsonString);
  const base64Data = bytesToBase64(jsonBytes);

  const cleanTitle = (exportFile.displayTitle).replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filename = `sat-practice-test-${exportFile.testId || rosterEntryId}-${cleanTitle}.json`;

  const downloadId = await chrome.downloads.download({
    url: `data:application/json;base64,${base64Data}`,
    filename,
    conflictAction: "uniquify",
    saveAs: true
  });

  return { filename, downloadId, data: exportFile };
}

function getDomainLabel(code) {
  if (!code) return "";
  for (const profile of Object.values(SECTION_PROFILES)) {
    const domain = profile.domains.find(d => d.code === code);
    if (domain) return domain.label;
  }
  return code;
}

async function buildPracticeTestJson(rosterEntryId, title, auth) {
  if (!rosterEntryId) {
    throw new Error("Missing rosterEntryId for practice test export.");
  }

  const scoresResponse = await resultsApiPost("/scores", null, auth);
  if (!scoresResponse?.scoreObjects) {
    throw new Error("Failed to fetch practice test scores.");
  }

  const attemptScoreObj = scoresResponse.scoreObjects.find(obj => obj.rosterEntryId === rosterEntryId);
  if (!attemptScoreObj) {
    throw new Error(`Attempt with rosterEntryId ${rosterEntryId} not found.`);
  }

  const questionsResponse = await resultsApiPost("/questions", {
    rosterEntryId: rosterEntryId,
    asmtFamilyCd: 1
  }, auth);

  if (!Array.isArray(questionsResponse)) {
    throw new Error("Failed to fetch practice test questions details.");
  }

  const sections = questionsResponse.map(sec => {
    const sectionName = getSectionName(sec.id);
    const questions = (sec.items || []).map(item => {
      let choices = null;
      if (item.answer?.choices) {
        choices = {};
        for (const [key, val] of Object.entries(item.answer.choices)) {
          choices[key] = cleanHtml(val?.body || val || "");
        }
      }
      const primaryCd = item.metadata?.PRIMARY_CLASS_CD || "";
      return {
        questionId: item.questionId || "",
        vaultId: item.externalId || item.external_id || "",
        displayNumber: item.displayNumber || "",
        sequence: item.sequence !== undefined ? item.sequence : null,
        prompt: cleanHtml(item.prompt || ""),
        passage: (item.passage && typeof item.passage.body === "string" && item.passage.body.trim()) 
          ? cleanHtml(item.passage.body) 
          : null,
        choices,
        userAnswer: item.answer?.response || "",
        correctAnswer: item.answer?.correctChoice || "",
        isCorrect: item.answer?.correct === true,
        explanation: cleanHtml(item.answer?.rationale || ""),
        domains: {
          primary: primaryCd,
          primaryLabel: getDomainLabel(primaryCd),
          secondary: item.metadata?.SECONDARY_CLASS_CD || "",
          tertiary: item.metadata?.TERTIARY_CLASS_CD || ""
        }
      };
    });

    return {
      sectionName,
      questions
    };
  });

  const rwScoreObj = attemptScoreObj.sectionScores?.find(s => s.tierName === "Reading and Writing" || s.sortOrder === 1) || {};
  const mathScoreObj = attemptScoreObj.sectionScores?.find(s => s.tierName === "Math" || s.sortOrder === 2) || {};

  const scores = {
    totalScore: attemptScoreObj.totalScore?.score || attemptScoreObj.totalScore || 0,
    readingWriting: {
      score: rwScoreObj.score || 0,
      correctAnswers: rwScoreObj.correctAnswers || 0,
      incorrectAnswers: rwScoreObj.incorrectAnswers || 0,
      omittedAnswers: rwScoreObj.omittedAnswers !== undefined ? rwScoreObj.omittedAnswers : 0,
      totalQuestions: rwScoreObj.totalQuestions || 0
    },
    math: {
      score: mathScoreObj.score || 0,
      correctAnswers: mathScoreObj.correctAnswers || 0,
      incorrectAnswers: mathScoreObj.incorrectAnswers || 0,
      omittedAnswers: mathScoreObj.omittedAnswers !== undefined ? mathScoreObj.omittedAnswers : 0,
      totalQuestions: mathScoreObj.totalQuestions || 0
    }
  };

  let startTimeStr = new Date().toISOString();
  if (attemptScoreObj.asmtSubmissionStartTime) {
    if (typeof attemptScoreObj.asmtSubmissionStartTime === "number") {
      startTimeStr = new Date(attemptScoreObj.asmtSubmissionStartTime * 1000).toISOString();
    } else {
      startTimeStr = new Date(attemptScoreObj.asmtSubmissionStartTime).toISOString();
    }
  }

  return {
    testId: attemptScoreObj.testId || "",
    displayTitle: attemptScoreObj.displayTitle || title || "SAT Practice Test",
    rosterEntryId: rosterEntryId,
    asmtSubmissionStartTime: startTimeStr,
    scores,
    sections
  };
}

async function exportPracticeTest(options, post) {
  const { rosterEntryId, title } = options;
  const auth = await getAuthOrThrow();

  post({
    type: "progress",
    value: 0.1,
    message: "Fetching scores summary..."
  });

  const exportFile = await buildPracticeTestJson(rosterEntryId, title, auth);

  post({
    type: "progress",
    value: 0.8,
    message: "Downloading JSON file..."
  });

  const jsonString = JSON.stringify(exportFile, null, 2);
  const jsonBytes = new TextEncoder().encode(jsonString);
  const base64Data = bytesToBase64(jsonBytes);

  const cleanTitle = (exportFile.displayTitle).replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filename = `sat-practice-test-${exportFile.testId || rosterEntryId}-${cleanTitle}.json`;

  await chrome.downloads.download({
    url: `data:application/json;base64,${base64Data}`,
    filename,
    conflictAction: "uniquify",
    saveAs: true
  });

  post({
    type: "done",
    value: 1,
    count: exportFile.sections.reduce((acc, sec) => acc + sec.questions.length, 0),
    filename,
    message: `Successfully exported practice test to ${filename}`
  });
}
