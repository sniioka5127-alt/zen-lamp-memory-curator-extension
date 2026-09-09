import {
  AuditLog,
  ContextPackageStore,
  ContextRedactionLayer,
  ContextRenderer,
  HumanDecisionRecordStore,
  RoundtableCanonicalInputBuilder,
  RoundtableComparisonEngine,
  RoundtableInterpretiveExtractionEngine,
  RoundtableInterpretiveReviewStore,
  RoundtableResponseStore,
  acceptedInterpretiveSubjectIds,
  createChromeStorageAdapter
} from "./core/index.mjs";

const $ = (id) => document.getElementById(id);
const humanActor = { type: "human", id: "local_user" };
const systemActor = { type: "system", name: "roundtable_browser_runtime" };
const workspaceProjectId = new URLSearchParams(location.search).get("project");

const adapter = createChromeStorageAdapter(chrome.storage.local);
const auditLog = new AuditLog(adapter);
const packageStore = new ContextPackageStore(adapter, { auditLog });
const redactionLayer = new ContextRedactionLayer(adapter, { auditLog });
const renderer = new ContextRenderer({ auditLog });
const inputBuilder = new RoundtableCanonicalInputBuilder({ auditLog });
const responseStore = new RoundtableResponseStore(adapter, { auditLog });
const comparisonEngine = new RoundtableComparisonEngine({ auditLog });
const extractionEngine = new RoundtableInterpretiveExtractionEngine({ auditLog });
const reviewStore = new RoundtableInterpretiveReviewStore(adapter, { auditLog });
const decisionStore = new HumanDecisionRecordStore(adapter, { auditLog });

const state = {
  pkg: null,
  view: null,
  roundtable: null,
  input: null,
  responses: new Map(),
  comparison: null,
  extractionPrompt: "",
  extraction: null,
  review: null,
  decision: null
};

function flash(message, tone = "") {
  const el = $("flash");
  el.textContent = message;
  el.dataset.tone = tone;
}

function setStatus(id, text, className = "") {
  const el = $(id);
  el.textContent = text;
  el.className = `status ${className}`.trim();
}

function makeBadge(text, className = "") {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`.trim();
  badge.textContent = text;
  return badge;
}

function card(title, content = "") {
  const node = document.createElement("article");
  node.className = "card";
  const head = document.createElement("div");
  head.className = "card-head";
  const strong = document.createElement("strong");
  strong.textContent = title;
  head.appendChild(strong);
  node.appendChild(head);
  if (content) {
    const body = document.createElement("p");
    body.className = "card-content";
    body.textContent = content;
    node.appendChild(body);
  }
  return node;
}

function resetAfterSource() {
  state.roundtable = null;
  state.input = null;
  state.responses.clear();
  state.comparison = null;
  state.extractionPrompt = "";
  state.extraction = null;
  state.review = null;
  state.decision = null;
  renderAll();
}

function resetAfterInput() {
  state.responses.clear();
  state.comparison = null;
  state.extractionPrompt = "";
  state.extraction = null;
  state.review = null;
  state.decision = null;
  renderAll();
}

function resetAfterResponse() {
  state.comparison = null;
  state.extractionPrompt = "";
  state.extraction = null;
  state.review = null;
  state.decision = null;
  renderComparison();
  renderExtraction();
  renderReview();
  renderDecision();
  renderProgress();
}

function resetAfterComparison() {
  state.extractionPrompt = "";
  state.extraction = null;
  state.review = null;
  state.decision = null;
  renderExtraction();
  renderReview();
  renderDecision();
  renderProgress();
}

function resetAfterExtraction() {
  state.review = null;
  state.decision = null;
  renderReview();
  renderDecision();
  renderProgress();
}

async function coreRows(prefix) {
  return (await adapter.entries(prefix)).map(([, value]) => value);
}

async function refreshSources({ preferredPackage = null, preferredView = null } = {}) {
  let packages = (await coreRows("context-package:"))
    .filter((pkg) => pkg.status === "approved" && pkg.human_gate?.state === "approved")
    .filter((pkg) => pkg.target?.mode === "roundtable" && (pkg.target?.platforms || []).length >= 2)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  if (workspaceProjectId) packages = packages.filter((pkg) => pkg.project_id === workspaceProjectId);

  const packageSelect = $("packageSelect");
  packageSelect.replaceChildren();
  if (!packages.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No approved Roundtable ContextPackage";
    packageSelect.appendChild(option);
  } else {
    for (const pkg of packages) {
      const option = document.createElement("option");
      option.value = pkg.id;
      option.textContent = `${pkg.purpose} · r${pkg.revision} · ${pkg.target.platforms.join(", ")}`;
      packageSelect.appendChild(option);
    }
    if (preferredPackage && packages.some((pkg) => pkg.id === preferredPackage)) packageSelect.value = preferredPackage;
  }
  await refreshViews(preferredView);
}

async function refreshViews(preferredView = null) {
  const packageId = $("packageSelect").value;
  const views = (await coreRows("redaction-view:"))
    .filter((view) => view.status === "approved" && view.human_gate?.state === "approved")
    .filter((view) => view.package_id === packageId)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  const select = $("viewSelect");
  select.replaceChildren();
  if (!views.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = packageId ? "No approved TransferView for this package" : "Select a package first";
    select.appendChild(option);
  } else {
    for (const view of views) {
      const option = document.createElement("option");
      option.value = view.id;
      option.textContent = `${view.id} · ${view.items.length} item(s)`;
      select.appendChild(option);
    }
    if (preferredView && views.some((view) => view.id === preferredView)) select.value = preferredView;
  }
}

async function loadSource() {
  const packageId = $("packageSelect").value;
  const viewId = $("viewSelect").value;
  if (!packageId || !viewId) throw new Error("Choose an approved Roundtable ContextPackage and TransferView.");
  const pkg = await packageStore.get(packageId);
  const view = await redactionLayer.getTransferView(viewId);
  if (!pkg || pkg.status !== "approved" || pkg.human_gate?.state !== "approved") throw new Error("ContextPackage is not Human-approved.");
  if (pkg.target?.mode !== "roundtable") throw new Error("RT-06 requires target.mode = roundtable.");
  if (!view || view.status !== "approved" || view.human_gate?.state !== "approved") throw new Error("TransferView is not Human-approved.");
  if (view.package_id !== pkg.id || view.package_revision !== pkg.revision) throw new Error("TransferView does not match the selected ContextPackage revision.");
  state.pkg = pkg;
  state.view = view;
  resetAfterSource();
  renderSource();
  flash(`Approved Room 3 source loaded: ${pkg.target.platforms.join(", ")}.`);
}

function renderSource() {
  const detail = $("sourceDetail");
  detail.replaceChildren();
  if (!state.pkg || !state.view) return;
  detail.textContent = `${state.pkg.id} · revision ${state.pkg.revision} · ${state.view.id} · ${state.view.items.length} transferable item(s) · providers=${state.pkg.target.platforms.join(", ")}`;
}

async function prepareInput() {
  if (!state.pkg || !state.view) throw new Error("Load an approved Room 3 source first.");
  state.roundtable = await renderer.renderRoundtable(state.pkg, state.view, {
    platforms: state.pkg.target.platforms,
    actor: systemActor
  });
  state.input = await inputBuilder.prepare(state.pkg, state.view, state.roundtable, {
    receipts: null,
    actor: systemActor
  });
  resetAfterInput();
  renderInput();
  flash(`RT-01 prepared one canonical context for ${state.input.providers.length} providers. Nothing has been sent.`);
}

async function copyText(text, message) {
  await navigator.clipboard.writeText(text);
  flash(message);
}

function renderInput() {
  const list = $("providerPromptList");
  list.replaceChildren();
  if (!state.input) {
    setStatus("rt01Status", state.pkg ? "Ready to prepare" : "Waiting for source", state.pkg ? "warn" : "");
    return;
  }
  setStatus("rt01Status", `${state.input.providers.length} providers · prepared_not_executed`, "good");
  for (const providerInput of state.input.provider_inputs) {
    const node = card(providerInput.provider, `profile=${providerInput.profile} · rendering=${providerInput.rendering_id}`);
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.appendChild(makeBadge(`${state.input.semantic_fingerprint.algorithm}:${state.input.semantic_fingerprint.value}`, "suggest"));
    meta.appendChild(makeBadge("same canonical context"));
    node.appendChild(meta);
    const textarea = document.createElement("textarea");
    textarea.className = "provider-prompt";
    textarea.readOnly = true;
    textarea.value = providerInput.rendered_text;
    node.appendChild(textarea);
    const actions = document.createElement("div");
    actions.className = "actions compact";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = `Copy ${providerInput.provider} prompt`;
    copy.addEventListener("click", () => run(() => copyText(providerInput.rendered_text, `${providerInput.provider} prompt copied. Copy is not delivery.`)));
    actions.appendChild(copy);
    node.appendChild(actions);
    list.appendChild(node);
  }
}

function responseFor(provider) {
  return state.responses.get(provider) || null;
}

async function captureResponse(provider, rawResponse, sourceLabel, claimedModel) {
  if (!state.input || !state.roundtable) throw new Error("Prepare RT-01 first.");
  const previous = responseFor(provider);
  const captured = await responseStore.capture(state.input, state.pkg, state.view, state.roundtable, {
    provider,
    raw_response: rawResponse,
    actor: humanActor,
    capture_method: "manual_paste",
    source_label: sourceLabel,
    claimed_model: claimedModel,
    receipts: null,
    supersedes_response_id: previous?.id ?? null
  });
  state.responses.set(provider, captured);
  resetAfterResponse();
  renderResponses();
  flash(`${provider} response captured as raw uninterpreted evidence${previous ? " and supersedes the previous capture" : ""}.`);
}

function renderResponses() {
  const list = $("responseCaptureList");
  list.replaceChildren();
  if (!state.input) {
    setStatus("rt02Status", "No responses captured");
    return;
  }
  const capturedCount = state.input.providers.filter((provider) => state.responses.has(provider)).length;
  setStatus("rt02Status", `${capturedCount}/${state.input.providers.length} captured`, capturedCount === state.input.providers.length ? "good" : "warn");

  for (const provider of state.input.providers) {
    const providerInput = state.input.provider_inputs.find((entry) => entry.provider === provider);
    const existing = responseFor(provider);
    const node = card(provider, existing ? `Captured ${existing.raw_response_length} chars · ${existing.response_fingerprint.value}` : "Awaiting exact manual response paste");

    const response = document.createElement("textarea");
    response.className = "response-input";
    response.placeholder = `Paste the exact ${provider} response here.`;
    if (existing) response.value = existing.raw_response;
    node.appendChild(response);

    const grid = document.createElement("div");
    grid.className = "grid two";
    const sourceLabelWrap = document.createElement("label");
    sourceLabelWrap.appendChild(document.createTextNode("Source label"));
    const sourceLabel = document.createElement("input");
    sourceLabel.type = "text";
    sourceLabel.value = existing?.source_provenance?.source_label || `${provider} manual Roundtable chat`;
    sourceLabelWrap.appendChild(sourceLabel);
    const modelWrap = document.createElement("label");
    modelWrap.appendChild(document.createTextNode("Claimed model (optional)"));
    const model = document.createElement("input");
    model.type = "text";
    model.value = existing?.source_provenance?.claimed_model || "";
    modelWrap.appendChild(model);
    grid.append(sourceLabelWrap, modelWrap);
    node.appendChild(grid);

    const actions = document.createElement("div");
    actions.className = "actions compact";
    const copyPrompt = document.createElement("button");
    copyPrompt.type = "button";
    copyPrompt.textContent = "Copy canonical prompt";
    copyPrompt.addEventListener("click", () => run(() => copyText(providerInput.rendered_text, `${provider} prompt copied. Copy is not delivery.`)));
    const capture = document.createElement("button");
    capture.type = "button";
    capture.className = "primary";
    capture.textContent = existing ? "Capture corrected response" : "Capture raw response";
    capture.addEventListener("click", () => run(() => captureResponse(provider, response.value, sourceLabel.value, model.value)));
    actions.append(copyPrompt, capture);
    node.appendChild(actions);
    list.appendChild(node);
  }
}

function orderedResponses() {
  if (!state.input) return [];
  return state.input.providers.map((provider) => state.responses.get(provider)).filter(Boolean);
}

async function compareResponses() {
  const responses = orderedResponses();
  if (!state.input || responses.length !== state.input.providers.length) throw new Error("Capture exactly one current response for every RT-01 provider first.");
  state.comparison = await comparisonEngine.compare(state.input, responses, { actor: systemActor });
  resetAfterComparison();
  renderComparison();
  flash("RT-03 comparison created. Lexical overlap is descriptive only and does not determine truth.");
}

function renderComparison() {
  const detail = $("comparisonDetail");
  detail.replaceChildren();
  if (!state.comparison) {
    const complete = state.input && orderedResponses().length === state.input.providers.length;
    setStatus("rt03Status", complete ? "Ready to compare" : "Waiting for all providers", complete ? "warn" : "");
    return;
  }
  setStatus("rt03Status", "compared_not_decided", "good");

  const shared = card("Exact shared wording", `${state.comparison.exact_shared_wording.length} exact normalized segment(s). This is not factual consensus.`);
  for (const item of state.comparison.exact_shared_wording.slice(0, 12)) {
    const p = document.createElement("p");
    p.className = "evidence";
    p.textContent = item.preview;
    shared.appendChild(p);
  }
  detail.appendChild(shared);

  for (const entry of state.comparison.provider_unique_segments) {
    const node = card(`${entry.provider} · unique wording`, `${entry.segments.length} segment(s) not exactly shared with every other provider.`);
    for (const segment of entry.segments.slice(0, 10)) {
      const p = document.createElement("p");
      p.className = "evidence";
      p.textContent = segment.preview;
      node.appendChild(p);
    }
    detail.appendChild(node);
  }

  const matrixCard = card("Pairwise lexical diagnostics", "Overlap measures wording, not semantic agreement, truth, or model quality.");
  const table = document.createElement("table");
  table.className = "matrix";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Pair", "Lexical overlap", "Relationship", "Exact shared", "Length ratio"]) {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  }
  head.appendChild(headRow);
  table.appendChild(head);
  const body = document.createElement("tbody");
  for (const pair of state.comparison.pairwise_matrix) {
    const row = document.createElement("tr");
    const values = [
      `${pair.provider_a} ↔ ${pair.provider_b}`,
      String(pair.lexical_overlap),
      pair.relationship,
      String(pair.exact_shared_segment_count),
      String(pair.length_ratio_short_to_long)
    ];
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = value;
      row.appendChild(td);
    }
    body.appendChild(row);
  }
  table.appendChild(body);
  matrixCard.appendChild(table);
  detail.appendChild(matrixCard);
}

async function buildExtractionPrompt() {
  if (!state.comparison) throw new Error("Build RT-03 comparison first.");
  state.extractionPrompt = extractionEngine.buildPrompt(state.input, state.comparison, orderedResponses());
  $("extractionPrompt").value = state.extractionPrompt;
  setStatus("rt04Status", "Prompt ready · proposal only", "warn");
  flash("RT-04 governed extraction prompt built. It may be copied manually; nothing is sent automatically.");
}

async function importExtraction() {
  if (!state.comparison) throw new Error("Build RT-03 comparison first.");
  const raw = $("extractionResult").value;
  state.extraction = await extractionEngine.ingest(
    state.input,
    state.comparison,
    orderedResponses(),
    raw,
    { actor: systemActor, extractor_label: "manual external interpretive model" }
  );
  resetAfterExtraction();
  renderExtraction();
  flash(`RT-04 proposal imported: ${state.extraction.claims.length} claims, ${state.extraction.assumptions.length} assumptions, ${state.extraction.conflicts.length} conflicts. Human review is still required.`);
}

function addEvidence(node, evidence) {
  for (const entry of evidence || []) {
    const p = document.createElement("p");
    p.className = "evidence";
    p.textContent = `${entry.provider} · ${entry.response_id} · ${entry.start}-${entry.end}\n${entry.quote}`;
    node.appendChild(p);
  }
}

function renderExtraction() {
  $("extractionPrompt").value = state.extractionPrompt;
  const detail = $("extractionDetail");
  detail.replaceChildren();
  if (!state.extraction) {
    if (!state.comparison) setStatus("rt04Status", "Waiting for comparison");
    else if (state.extractionPrompt) setStatus("rt04Status", "Prompt ready · proposal only", "warn");
    else setStatus("rt04Status", "Ready to build prompt", "warn");
    return;
  }
  setStatus("rt04Status", "proposed_not_human_reviewed", "warn");
  for (const claim of state.extraction.claims) {
    const node = card(`Claim · ${claim.provider} · ${claim.id}`, claim.statement);
    addEvidence(node, claim.evidence);
    detail.appendChild(node);
  }
  for (const assumption of state.extraction.assumptions) {
    const node = card(`Assumption · ${assumption.provider} · ${assumption.id}`, assumption.statement);
    addEvidence(node, assumption.evidence);
    detail.appendChild(node);
  }
  for (const conflict of state.extraction.conflicts) {
    const node = card(`Conflict · ${conflict.id} · ${conflict.conflict_type}`, `${conflict.topic} — ${conflict.reason}`);
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.appendChild(makeBadge("resolution=unresolved", "warning"));
    meta.appendChild(makeBadge("truth_status=not_evaluated", "warning"));
    for (const side of conflict.sides) meta.appendChild(makeBadge(`${side.provider}: ${(side.claim_ids || []).concat(side.assumption_ids || []).join(", ")}`));
    node.appendChild(meta);
    detail.appendChild(node);
  }
}

async function startReview() {
  if (!state.extraction) throw new Error("Import an RT-04 interpretive proposal first.");
  state.decision = null;
  state.review = await reviewStore.create(
    state.extraction,
    state.input,
    state.comparison,
    orderedResponses(),
    { actor: humanActor }
  );
  renderReview();
  renderDecision();
  flash("RT-05 Human review started. Every subject requires an explicit accept, reject, or hold decision.");
}

function extractionSubject(type, id) {
  const source = type === "claim"
    ? state.extraction?.claims
    : type === "assumption"
      ? state.extraction?.assumptions
      : state.extraction?.conflicts;
  return (source || []).find((entry) => entry.id === id) || null;
}

async function saveReviewDecision(entry, selectedDecision, note) {
  if (!selectedDecision) throw new Error(`Choose accept, reject, or hold for ${entry.subject_type}:${entry.subject_id}.`);
  state.review = await reviewStore.setDecision(
    state.review.id,
    state.extraction,
    state.input,
    state.comparison,
    orderedResponses(),
    {
      subject_type: entry.subject_type,
      subject_id: entry.subject_id,
      decision: selectedDecision,
      note,
      actor: humanActor
    }
  );
  renderReview();
  flash(`${entry.subject_type}:${entry.subject_id} recorded as ${selectedDecision}.`);
}

async function finalizeReview() {
  if (!state.review) throw new Error("Start RT-05 Human review first.");
  state.review = await reviewStore.finalize(
    state.review.id,
    state.extraction,
    state.input,
    state.comparison,
    orderedResponses(),
    { actor: humanActor }
  );
  state.decision = null;
  renderReview();
  renderDecision();
  const accepted = acceptedInterpretiveSubjectIds(state.review);
  flash(`RT-05 finalized at revision ${state.review.revision}. ${accepted.length} interpretation subject(s) accepted for deliberation — not as truth or final decision.`);
}

function renderReview() {
  const list = $("reviewList");
  list.replaceChildren();
  $("reviewSummary").replaceChildren();
  if (!state.review) {
    setStatus("rt05Status", state.extraction ? "Ready for Human review" : "Waiting for RT-04", state.extraction ? "warn" : "");
    $("finalizeReview").disabled = true;
    return;
  }

  const finalized = state.review.status === "finalized_human_review";
  setStatus("rt05Status", `${state.review.status} · r${state.review.revision}`, finalized ? "good" : "warn");
  $("finalizeReview").disabled = finalized || state.review.summary.pending !== 0;

  for (const entry of state.review.decisions) {
    const subject = extractionSubject(entry.subject_type, entry.subject_id);
    const text = entry.subject_type === "conflict"
      ? `${subject?.topic || entry.subject_id} — ${subject?.reason || ""}`
      : subject?.statement || entry.subject_id;
    const node = card(`${entry.subject_type} · ${entry.subject_id}${entry.provider ? ` · ${entry.provider}` : ""}`, text);
    const row = document.createElement("div");
    row.className = "review-actions";
    const groupName = `review-${entry.subject_type}-${entry.subject_id}`;
    for (const decision of ["accept", "reject", "hold"]) {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = groupName;
      radio.value = decision;
      radio.checked = entry.decision === decision;
      radio.disabled = finalized;
      label.append(radio, document.createTextNode(decision));
      row.appendChild(label);
    }
    node.appendChild(row);

    const noteLabel = document.createElement("label");
    noteLabel.appendChild(document.createTextNode("Human note (optional)"));
    const note = document.createElement("input");
    note.type = "text";
    note.value = entry.note || "";
    note.disabled = finalized;
    noteLabel.appendChild(note);
    node.appendChild(noteLabel);

    if (!finalized) {
      const actions = document.createElement("div");
      actions.className = "actions compact";
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Record Human review";
      save.addEventListener("click", () => run(() => {
        const selected = node.querySelector(`input[name="${CSS.escape(groupName)}"]:checked`);
        return saveReviewDecision(entry, selected?.value || null, note.value);
      }));
      actions.appendChild(save);
      node.appendChild(actions);
    } else {
      const meta = document.createElement("div");
      meta.className = "card-meta";
      meta.appendChild(makeBadge(entry.decision, entry.decision === "accept" ? "suggest" : entry.decision === "hold" ? "warning" : ""));
      meta.appendChild(makeBadge(entry.interpretation_effect));
      node.appendChild(meta);
    }
    list.appendChild(node);
  }

  const summary = state.review.summary;
  $("reviewSummary").textContent = `${summary.total} subjects · ${summary.accept} accept · ${summary.reject} reject · ${summary.hold} hold · ${summary.pending} pending · truth_status=${state.review.truth_status} · final_decision_status=${state.review.final_decision_status}`;
}

function linesFromTextarea(id) {
  return $(id).value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function acceptedReviewEntries() {
  if (state.review?.status !== "finalized_human_review") return [];
  return state.review.decisions.filter((entry) => entry.decision === "accept");
}

function supportingRefsFromUi() {
  return Array.from(document.querySelectorAll("input[data-decision-support]:checked")).map((input) => ({
    subject_type: input.dataset.subjectType,
    subject_id: input.dataset.subjectId
  }));
}

function decisionContext() {
  if (!state.review || !state.extraction || !state.input || !state.comparison) {
    throw new Error("HG-02 requires the current finalized RT-05 source chain.");
  }
  return [state.review, state.extraction, state.input, state.comparison, orderedResponses()];
}

function setDecisionFieldState(enabled) {
  for (const id of [
    "decisionQuestion", "decisionDisposition", "decisionText", "decisionRationale",
    "decisionAlternatives", "decisionUnresolved", "decisionConditions",
    "decisionRevisitTrigger", "decisionRevisitAt"
  ]) $(id).disabled = !enabled;
  for (const input of document.querySelectorAll("input[data-decision-support]")) input.disabled = !enabled;
}

function fillDecisionForm(record) {
  if (!record) return;
  $("decisionQuestion").value = record.decision_question || "";
  $("decisionDisposition").value = record.disposition || "pending";
  $("decisionText").value = record.decision_text || "";
  $("decisionRationale").value = record.rationale || "";
  $("decisionAlternatives").value = (record.alternatives_considered || []).join("\n");
  $("decisionUnresolved").value = (record.unresolved_questions || []).join("\n");
  $("decisionConditions").value = (record.conditions || []).join("\n");
  $("decisionRevisitTrigger").value = record.revisit?.trigger || "";
  $("decisionRevisitAt").value = record.revisit?.at || "";
}

function renderDecisionSupportingList() {
  const list = $("decisionSupportingList");
  list.replaceChildren();
  const accepted = acceptedReviewEntries();
  if (!accepted.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = state.review?.status === "finalized_human_review"
      ? "No RT-05 subjects were Human-accepted. The Human may still decide without citing Roundtable interpretations."
      : "Finalize RT-05 before selecting supporting interpretations.";
    list.appendChild(p);
    return;
  }
  const selected = new Set((state.decision?.supporting_subject_refs || []).map((entry) => `${entry.subject_type}:${entry.subject_id}`));
  for (const entry of accepted) {
    const subject = extractionSubject(entry.subject_type, entry.subject_id);
    const label = document.createElement("label");
    label.className = "supporting-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.decisionSupport = "true";
    checkbox.dataset.subjectType = entry.subject_type;
    checkbox.dataset.subjectId = entry.subject_id;
    checkbox.checked = selected.has(`${entry.subject_type}:${entry.subject_id}`);
    const description = entry.subject_type === "conflict"
      ? `${subject?.topic || entry.subject_id} — ${subject?.reason || ""}`
      : subject?.statement || entry.subject_id;
    label.append(checkbox, document.createTextNode(`${entry.subject_type} · ${entry.subject_id}${entry.provider ? ` · ${entry.provider}` : ""} — ${description}`));
    list.appendChild(label);
  }
}

async function startDecision({ supersede = false } = {}) {
  if (state.review?.status !== "finalized_human_review") throw new Error("Finalize RT-05 before opening the Human Decision Gate.");
  const question = $("decisionQuestion").value.trim();
  if (!question) throw new Error("Enter the Human decision question first.");
  const previous = state.decision;
  if (supersede) {
    if (!previous || !["finalized_human_decision", "revoked_human_decision"].includes(previous.status)) {
      throw new Error("Only a finalized or revoked Human Decision Record can be superseded.");
    }
  } else if (previous) {
    throw new Error("A Human Decision Record is already active in this runtime.");
  }
  state.decision = await decisionStore.create(...decisionContext(), {
    actor: humanActor,
    decision_question: question,
    supersedes_decision_id: supersede ? previous.id : null
  });
  renderDecision();
  flash(supersede
    ? `New Human decision draft created to supersede ${previous.id}. The prior record remains unchanged.`
    : "Human Decision Gate opened. The decision remains a draft until the Human explicitly finalizes it.");
}

async function updateDecisionFromForm({ announce = true } = {}) {
  if (!state.decision || state.decision.status !== "draft_human_decision") throw new Error("Open a Human Decision draft first.");
  state.decision = await decisionStore.update(
    state.decision.id,
    ...decisionContext(),
    {
      decision_question: $("decisionQuestion").value,
      disposition: $("decisionDisposition").value,
      decision_text: $("decisionText").value,
      rationale: $("decisionRationale").value,
      supporting_subject_refs: supportingRefsFromUi(),
      alternatives_considered: linesFromTextarea("decisionAlternatives"),
      unresolved_questions: linesFromTextarea("decisionUnresolved"),
      conditions: linesFromTextarea("decisionConditions"),
      revisit: {
        trigger: $("decisionRevisitTrigger").value,
        at: $("decisionRevisitAt").value
      }
    },
    { actor: humanActor }
  );
  renderDecision();
  if (announce) flash(`Human decision draft saved at revision ${state.decision.revision}. Nothing has been executed.`);
  return state.decision;
}

async function finalizeDecision() {
  await updateDecisionFromForm({ announce: false });
  state.decision = await decisionStore.finalize(
    state.decision.id,
    ...decisionContext(),
    { actor: humanActor }
  );
  renderDecision();
  flash(`Human decision finalized at revision ${state.decision.revision}. This records Human judgment; execution_status remains ${state.decision.execution_status}.`);
}

async function revokeDecision() {
  if (!state.decision || state.decision.status !== "finalized_human_decision") throw new Error("Only an active finalized Human Decision Record can be revoked.");
  state.decision = await decisionStore.revoke(
    state.decision.id,
    ...decisionContext(),
    { actor: humanActor, reason: $("decisionRevokeReason").value }
  );
  renderDecision();
  flash("Human decision revoked. The historical record remains stored; create a superseding decision for a replacement judgment.");
}

function renderDecision() {
  const summary = $("decisionSummary");
  summary.replaceChildren();
  renderDecisionSupportingList();
  const reviewReady = state.review?.status === "finalized_human_review";
  const record = state.decision;

  $("startDecision").disabled = !reviewReady || Boolean(record);
  $("saveDecision").disabled = !record || record.status !== "draft_human_decision";
  $("finalizeDecision").disabled = !record || record.status !== "draft_human_decision";
  $("revokeDecision").disabled = !record || record.status !== "finalized_human_decision";
  $("supersedeDecision").disabled = !record || !["finalized_human_decision", "revoked_human_decision"].includes(record.status);
  $("decisionRevokeReason").disabled = !record || record.status !== "finalized_human_decision";

  if (!reviewReady) {
    setStatus("decisionStatus", "Waiting for finalized RT-05");
    setDecisionFieldState(false);
    $("decisionQuestion").disabled = true;
    summary.textContent = "Roundtable AI has not yet reached a finalized Human interpretive review. The final Human Decision Gate remains closed.";
    return;
  }

  if (!record) {
    setStatus("decisionStatus", "Ready for Human decision", "warn");
    setDecisionFieldState(false);
    $("decisionQuestion").disabled = false;
    summary.textContent = "Enter the decision question and explicitly open the Human Decision Gate. No model output is promoted automatically.";
    return;
  }

  fillDecisionForm(record);
  const draft = record.status === "draft_human_decision";
  setDecisionFieldState(draft);
  setStatus("decisionStatus", `${record.status} · r${record.revision}`, record.status === "finalized_human_decision" ? "good" : record.status === "revoked_human_decision" ? "error" : "warn");
  summary.textContent = `authority=${record.authority} · disposition=${record.disposition} · truth_status=${record.truth_status} · execution_status=${record.execution_status}${record.supersedes_decision_id ? ` · supersedes=${record.supersedes_decision_id}` : ""}`;
}

function renderProgress() {
  const achieved = new Set();
  if (state.pkg && state.view) achieved.add("source");
  if (state.input) achieved.add("rt01");
  if (state.input && orderedResponses().length === state.input.providers.length) achieved.add("rt02");
  if (state.comparison) achieved.add("rt03");
  if (state.extraction) achieved.add("rt04");
  if (state.review?.status === "finalized_human_review") achieved.add("rt05");
  if (state.decision?.status === "finalized_human_decision") achieved.add("hg01");
  for (const el of document.querySelectorAll("[data-progress]")) {
    el.classList.toggle("active", achieved.has(el.dataset.progress));
  }
}

function renderAll() {
  renderSource();
  renderInput();
  renderResponses();
  renderComparison();
  renderExtraction();
  renderReview();
  renderDecision();
  renderProgress();
}

async function resetRuntime() {
  state.pkg = null;
  state.view = null;
  state.roundtable = null;
  state.input = null;
  state.responses.clear();
  state.comparison = null;
  state.extractionPrompt = "";
  state.extraction = null;
  state.review = null;
  state.decision = null;
  $("extractionResult").value = "";
  renderAll();
  flash("Room 4 runtime reset. Persisted RT-02 responses, RT-05 reviews, and HG-01 Human Decision Records remain intact in Core storage.");
}

async function run(fn) {
  try {
    await fn();
    renderProgress();
  } catch (error) {
    flash(error?.message || String(error), "error");
  }
}

$("refreshSources").addEventListener("click", () => run(() => refreshSources()));
$("packageSelect").addEventListener("change", () => run(() => refreshViews()));
$("loadSource").addEventListener("click", () => run(loadSource));
$("prepareInput").addEventListener("click", () => run(prepareInput));
$("compareResponses").addEventListener("click", () => run(compareResponses));
$("buildExtractionPrompt").addEventListener("click", () => run(buildExtractionPrompt));
$("copyExtractionPrompt").addEventListener("click", () => run(() => {
  if (!state.extractionPrompt) throw new Error("Build the RT-04 extraction prompt first.");
  return copyText(state.extractionPrompt, "RT-04 extraction prompt copied. Copy is not delivery.");
}));
$("importExtraction").addEventListener("click", () => run(importExtraction));
$("startReview").addEventListener("click", () => run(startReview));
$("finalizeReview").addEventListener("click", () => run(finalizeReview));
$("startDecision").addEventListener("click", () => run(() => startDecision()));
$("saveDecision").addEventListener("click", () => run(() => updateDecisionFromForm()));
$("finalizeDecision").addEventListener("click", () => run(finalizeDecision));
$("revokeDecision").addEventListener("click", () => run(revokeDecision));
$("supersedeDecision").addEventListener("click", () => run(() => startDecision({ supersede: true })));
$("resetRuntime").addEventListener("click", () => run(resetRuntime));

await run(async () => {
  const params = new URLSearchParams(location.search);
  await refreshSources({
    preferredPackage: params.get("package"),
    preferredView: params.get("view")
  });
  renderAll();
  flash("Roundtable AI + Human Decision Gate ready. Start from an approved Room 3 source; nothing is sent or executed automatically.");
});
