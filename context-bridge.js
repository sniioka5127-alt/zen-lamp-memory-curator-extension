import {
  AuditLog,
  ContextItemStore,
  ContextPackageStore,
  ContextRedactionLayer,
  ContextRenderer,
  ContextSelectionEngine,
  OutboundHandoffBoundary,
  ProjectStore,
  assertRoundtableTransferReceiptsEquivalent,
  createChromeStorageAdapter
} from "./core/index.mjs";

const $ = (id) => document.getElementById(id);
const humanActor = { type: "human", id: "local_user" };
const systemActor = { type: "system", name: "context_bridge_browser_runtime" };

const adapter = createChromeStorageAdapter(chrome.storage.local);
const auditLog = new AuditLog(adapter);
const projectStore = new ProjectStore(adapter, { auditLog });
const itemStore = new ContextItemStore(adapter, { auditLog });
const packageStore = new ContextPackageStore(adapter, { auditLog });
const selectionEngine = new ContextSelectionEngine(itemStore);
const redactionLayer = new ContextRedactionLayer(adapter, { auditLog });
const renderer = new ContextRenderer({ auditLog });
const outbound = new OutboundHandoffBoundary(adapter, { auditLog });

const state = {
  project: null,
  selectionPlan: null,
  selectedItemIds: new Set(),
  pkg: null,
  redactionPlan: null,
  transferView: null,
  renderings: [],
  roundtable: null,
  attempts: new Map(),
  receipts: []
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

function splitCsv(value) {
  return String(value || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

function currentTarget() {
  const mode = $("targetMode").value;
  const providers = mode === "generic" ? [] : [...new Set(splitCsv($("providers").value))];
  if (mode === "single" && providers.length !== 1) throw new Error("Single provider mode requires exactly one provider.");
  if (mode === "roundtable" && providers.length < 2) throw new Error("Roundtable mode requires at least two providers.");
  return {
    mode,
    project_id: state.project?.id,
    platforms: providers
  };
}

function resetAfterSelection() {
  state.pkg = null;
  state.redactionPlan = null;
  state.transferView = null;
  state.renderings = [];
  state.roundtable = null;
  state.attempts.clear();
  state.receipts = [];
  renderAllDownstream();
}

function resetAfterPackage() {
  state.redactionPlan = null;
  state.transferView = null;
  state.renderings = [];
  state.roundtable = null;
  state.attempts.clear();
  state.receipts = [];
  renderAllDownstream();
}

function resetAfterTransferView() {
  state.renderings = [];
  state.roundtable = null;
  state.attempts.clear();
  state.receipts = [];
  renderRenderings();
  renderHandoffs();
}

async function loadProjects(preferredId = null) {
  const projects = await projectStore.list();
  const select = $("projectSelect");
  select.replaceChildren();
  for (const project of projects.filter((p) => p.status !== "archived")) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${project.name} · ${project.status}`;
    select.appendChild(option);
  }
  if (!projects.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No projects yet — create one in Memory Curator";
    select.appendChild(option);
    state.project = null;
    return;
  }
  if (preferredId && projects.some((p) => p.id === preferredId)) select.value = preferredId;
  state.project = await projectStore.get(select.value || projects[0].id);
}

async function syncSelectedProject() {
  state.project = $("projectSelect").value ? await projectStore.get($("projectSelect").value) : null;
  state.selectionPlan = null;
  state.selectedItemIds.clear();
  $("candidateList").replaceChildren();
  $("selectionSummary").textContent = state.project ? `Project: ${state.project.name}` : "No project selected.";
  resetAfterSelection();
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

async function proposeSelection() {
  if (!state.project) throw new Error("Select a project first.");
  const purpose = $("purpose").value.trim();
  if (!purpose) throw new Error("Enter a purpose first.");
  const target = currentTarget();
  const extra_keywords = splitCsv($("extraKeywords").value);
  state.selectionPlan = await selectionEngine.propose({
    project_id: state.project.id,
    purpose,
    target,
    extra_keywords
  });
  state.selectedItemIds = new Set(state.selectionPlan.recommended_item_ids);
  resetAfterSelection();
  await renderSelection();
  flash(`Selection proposal created: ${state.selectionPlan.stats.eligible} eligible, ${state.selectionPlan.stats.blocked} blocked.`);
}

async function renderSelection() {
  const list = $("candidateList");
  list.replaceChildren();
  if (!state.selectionPlan) return;
  $("selectionSummary").textContent = `${state.selectionPlan.stats.scanned} scanned · ${state.selectionPlan.stats.eligible} eligible · ${state.selectionPlan.stats.blocked} blocked · authority = proposal_only`;

  for (const candidate of state.selectionPlan.candidates) {
    const item = await itemStore.get(candidate.context_item_id);
    const node = card(candidate.context_item_id, item?.content || "ContextItem unavailable");
    const head = node.querySelector(".card-head");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedItemIds.has(candidate.context_item_id);
    checkbox.setAttribute("aria-label", `Select ${candidate.context_item_id}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedItemIds.add(candidate.context_item_id);
      else state.selectedItemIds.delete(candidate.context_item_id);
      resetAfterSelection();
    });
    head.prepend(checkbox);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.appendChild(makeBadge(candidate.kind));
    meta.appendChild(makeBadge(`${candidate.recommendation} · ${candidate.score}`, candidate.recommendation === "suggest" ? "suggest" : ""));
    for (const warning of candidate.warning_codes) meta.appendChild(makeBadge(warning, "warning"));
    node.appendChild(meta);
    list.appendChild(node);
  }

  if (state.selectionPlan.blocked.length) {
    const blocked = card("Blocked by governance", `${state.selectionPlan.blocked.length} ContextItem(s) are unavailable to this transfer. Blocked content is not copied into the selection plan.`);
    const meta = document.createElement("div");
    meta.className = "card-meta";
    for (const entry of state.selectionPlan.blocked) {
      meta.appendChild(makeBadge(`${entry.context_item_id}: ${entry.reason_codes.join(", ")}`, "warning"));
    }
    blocked.appendChild(meta);
    list.appendChild(blocked);
  }
}

async function createPackage() {
  if (!state.selectionPlan) throw new Error("Create a selection proposal first.");
  if (!state.selectedItemIds.size) throw new Error("Select at least one ContextItem.");
  const selected = await selectionEngine.resolveSelectedItems(state.selectionPlan, [...state.selectedItemIds]);
  state.pkg = await packageStore.create({
    project_id: state.project.id,
    purpose: state.selectionPlan.purpose,
    target: state.selectionPlan.target,
    items: selected
  }, { actor: systemActor });
  resetAfterPackage();
  renderPackage();
  flash(`ContextPackage revision ${state.pkg.revision} created as draft.`);
}

async function submitPackage() {
  if (!state.pkg) throw new Error("Create a ContextPackage first.");
  state.pkg = await packageStore.submitForReview(state.pkg.id, { actor: systemActor, reason: "CB-06 browser review" });
  resetAfterPackage();
  renderPackage();
  flash("ContextPackage submitted for Human review.");
}

async function approvePackage() {
  if (!state.pkg) throw new Error("Create a ContextPackage first.");
  const reviewDueIds = state.selectionPlan?.candidates
    .filter((candidate) => state.selectedItemIds.has(candidate.context_item_id) && candidate.warning_codes.includes("freshness_review_due"))
    .map((candidate) => candidate.context_item_id) || [];
  state.pkg = await packageStore.approve(state.pkg.id, {
    actor: humanActor,
    reason: "Approved in CB-06 browser runtime",
    acknowledged_review_due_item_ids: reviewDueIds
  });
  resetAfterPackage();
  renderPackage();
  flash(`Human approved ContextPackage revision ${state.pkg.revision}.`);
}

function renderPackage() {
  const detail = $("packageDetail");
  detail.replaceChildren();
  if (!state.pkg) {
    setStatus("packageStatus", "Not created");
    return;
  }
  const good = state.pkg.status === "approved";
  setStatus("packageStatus", `r${state.pkg.revision} · ${state.pkg.status}`, good ? "good" : "warn");
  detail.textContent = `${state.pkg.items.length} item(s) · target=${state.pkg.target.mode}${state.pkg.target.platforms.length ? ` · ${state.pkg.target.platforms.join(", ")}` : ""} · Human Gate=${state.pkg.human_gate.state}`;
  $("submitPackage").disabled = state.pkg.status !== "draft";
  $("approvePackage").disabled = state.pkg.status !== "pending_review";
}

async function scanRedaction() {
  if (!state.pkg || state.pkg.status !== "approved") throw new Error("Human-approve the ContextPackage first.");
  const custom_literals = $("customLiterals").value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  state.redactionPlan = await redactionLayer.propose(state.pkg, { custom_literals }, { actor: systemActor });
  state.transferView = null;
  resetAfterTransferView();
  renderRedaction();
  flash(`Redaction proposal created with ${state.redactionPlan.stats.findings} finding(s).`);
}

function renderRedaction() {
  const findings = $("redactionList");
  const exclusions = $("exclusionList");
  findings.replaceChildren();
  exclusions.replaceChildren();
  if (!state.redactionPlan) {
    setStatus("redactionStatus", state.pkg?.status === "approved" ? "Ready to scan" : "Waiting for approved package", state.pkg?.status === "approved" ? "warn" : "");
    return;
  }
  setStatus("redactionStatus", `${state.redactionPlan.stats.findings} finding(s) · proposal_only`, "warn");

  for (const operation of state.redactionPlan.operation_candidates) {
    const node = card(`${operation.category} · ${operation.context_item_id}`, `Range ${operation.start}–${operation.end}. Matched sensitive text is intentionally not duplicated into the RedactionPlan.`);
    const row = document.createElement("div");
    row.className = "choice-row";
    for (const [value, label] of [["redact", "Redact"], ["keep", "Keep + acknowledge"]]) {
      const choice = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `finding-${operation.id}`;
      radio.value = value;
      radio.checked = value === "redact";
      choice.append(radio, document.createTextNode(label));
      row.appendChild(choice);
    }
    node.appendChild(row);
    findings.appendChild(node);
  }

  if (!state.redactionPlan.operation_candidates.length) {
    findings.appendChild(card("No automatic findings", "Human review still applies. You may exclude an entire ContextItem below before approving the TransferView."));
  }

  for (const item of state.pkg.items) {
    const node = card(`Whole-item exclusion · ${item.context_item_id}`, item.content);
    const row = document.createElement("div");
    row.className = "choice-row";
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.excludeItemId = item.context_item_id;
    label.append(checkbox, document.createTextNode("Exclude this whole item from the TransferView"));
    row.appendChild(label);
    node.appendChild(row);
    exclusions.appendChild(node);
  }
}

async function approveTransferView() {
  if (!state.pkg || state.pkg.status !== "approved") throw new Error("An approved ContextPackage is required.");
  if (!state.redactionPlan) throw new Error("Create a RedactionPlan first.");

  const selected_operation_ids = [];
  const acknowledged_unredacted_operation_ids = [];
  for (const operation of state.redactionPlan.operation_candidates) {
    const choice = document.querySelector(`input[name="finding-${CSS.escape(operation.id)}"]:checked`);
    if (!choice) throw new Error(`Choose redact or keep for finding ${operation.id}.`);
    if (choice.value === "redact") selected_operation_ids.push(operation.id);
    else acknowledged_unredacted_operation_ids.push(operation.id);
  }
  const excluded_items = [...document.querySelectorAll("[data-exclude-item-id]:checked")].map((el) => ({
    context_item_id: el.dataset.excludeItemId,
    reason: "Excluded by human in CB-06 browser runtime"
  }));

  state.transferView = await redactionLayer.approveTransferView(state.pkg, state.redactionPlan, {
    actor: humanActor,
    selected_operation_ids,
    acknowledged_unredacted_operation_ids,
    excluded_items,
    reason: "Human-approved privacy-reduced TransferView in CB-06"
  });
  resetAfterTransferView();
  renderTransferView();
  flash(`TransferView approved with ${state.transferView.items.length} transferable item(s).`);
}

function renderTransferView() {
  const detail = $("transferViewDetail");
  detail.replaceChildren();
  if (!state.transferView) return;
  setStatus("redactionStatus", `TransferView approved · ${state.transferView.items.length} item(s)`, "good");
  detail.textContent = `${state.transferView.applied_operations.length} redaction operation(s) · ${state.transferView.excluded_items.length} whole item(s) excluded · Human Gate=${state.transferView.human_gate.state}`;
}

async function renderContext() {
  if (!state.pkg || !state.transferView) throw new Error("Approve a TransferView first.");
  state.attempts.clear();
  state.receipts = [];
  if (state.pkg.target.mode === "roundtable") {
    state.roundtable = await renderer.renderRoundtable(state.pkg, state.transferView, {
      platforms: state.pkg.target.platforms,
      actor: systemActor
    });
    state.renderings = state.roundtable.renderings;
  } else {
    const provider = state.pkg.target.mode === "single" ? state.pkg.target.platforms[0] : "generic";
    state.roundtable = null;
    state.renderings = [await renderer.render(state.pkg, state.transferView, { provider, actor: systemActor })];
  }
  renderRenderings();
  renderHandoffs();
  flash(`Rendered ${state.renderings.length} provider view(s). Nothing has been sent.`);
}

function renderRenderings() {
  const list = $("renderList");
  list.replaceChildren();
  if (!state.renderings.length) {
    setStatus("renderStatus", state.transferView ? "Ready to render" : "Waiting for approved TransferView", state.transferView ? "warn" : "");
    return;
  }
  setStatus("renderStatus", `${state.renderings.length} rendered · not sent`, "warn");
  for (const rendering of state.renderings) {
    const node = card(`${rendering.provider} · ${rendering.profile}`);
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.appendChild(makeBadge(rendering.status, "warning"));
    meta.appendChild(makeBadge(`${rendering.semantic_fingerprint.algorithm}:${rendering.semantic_fingerprint.value}`));
    node.appendChild(meta);
    const pre = document.createElement("pre");
    pre.className = "rendered";
    pre.textContent = rendering.rendered_text;
    node.appendChild(pre);
    list.appendChild(node);
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const temp = document.createElement("textarea");
    temp.value = value;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
  }
}

async function copyRendering(rendering) {
  await copyText(rendering.rendered_text);
  const attempt = await outbound.recordAttempt(state.pkg, state.transferView, rendering, {
    actor: humanActor,
    transport: "manual_paste",
    destination_label: $("destinationLabel").value.trim() || null
  });
  state.attempts.set(rendering.id, attempt);
  renderHandoffs();
  flash(`${rendering.provider}: copied. Attempt recorded; delivery is not claimed.`);
}

async function confirmHandoff(rendering) {
  const attempt = state.attempts.get(rendering.id);
  if (!attempt) throw new Error("Copy this rendered context first so an outbound attempt is recorded.");
  const receipt = await outbound.confirmManualHandoff(state.pkg, state.transferView, rendering, {
    actor: humanActor,
    transport: "manual_paste",
    destination_label: $("destinationLabel").value.trim() || null,
    attempt_id: attempt.id,
    reason: "Human confirmed manual handoff in CB-06"
  });
  state.receipts = state.receipts.filter((r) => r.provider !== receipt.provider).concat(receipt);
  if (state.pkg.target.mode === "roundtable" && state.receipts.length === state.renderings.length) {
    assertRoundtableTransferReceiptsEquivalent(state.receipts);
  }
  renderHandoffs();
  flash(`${rendering.provider}: manual handoff confirmed. Provider delivery remains unverified.`);
}

function renderHandoffs() {
  const list = $("handoffList");
  const receiptList = $("receiptList");
  list.replaceChildren();
  receiptList.replaceChildren();

  if (!state.renderings.length) {
    setStatus("handoffStatus", "Nothing handed off");
    return;
  }

  for (const rendering of state.renderings) {
    const attempt = state.attempts.get(rendering.id);
    const receipt = state.receipts.find((r) => r.rendering_id === rendering.id);
    const node = card(`${rendering.provider} outbound boundary`, receipt ? "Human-confirmed manual handoff; delivery_status = unverified." : attempt ? "Attempt recorded; no delivery claim." : "Rendered only; not sent.");
    const actions = document.createElement("div");
    actions.className = "actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "primary";
    copy.textContent = attempt ? "Copy again + new attempt" : "Copy rendered context";
    copy.addEventListener("click", () => run(() => copyRendering(rendering)));
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = receipt ? "Handoff confirmed" : "I handed this off manually";
    confirm.disabled = !attempt || Boolean(receipt);
    confirm.addEventListener("click", () => run(() => confirmHandoff(rendering)));
    actions.append(copy, confirm);
    node.appendChild(actions);
    list.appendChild(node);
  }

  for (const receipt of state.receipts) {
    const node = card(`Receipt · ${receipt.provider}`, `status=${receipt.status} · delivery_status=${receipt.delivery_status} · transport=${receipt.transport}`);
    node.classList.add("receipt");
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.appendChild(makeBadge(receipt.id));
    meta.appendChild(makeBadge(`${receipt.semantic_fingerprint.algorithm}:${receipt.semantic_fingerprint.value}`));
    node.appendChild(meta);
    receiptList.appendChild(node);
  }

  if (state.receipts.length) {
    const roundtableReady = state.pkg?.target.mode === "roundtable" && state.receipts.length === state.renderings.length;
    setStatus("handoffStatus", roundtableReady ? "Roundtable handoff confirmed · delivery unverified" : `${state.receipts.length} handoff(s) confirmed · delivery unverified`, "good");
  } else if (state.attempts.size) {
    setStatus("handoffStatus", `${state.attempts.size} attempt(s) · not confirmed`, "warn");
  } else {
    setStatus("handoffStatus", "Rendered · not sent", "warn");
  }
}

function renderProgress() {
  const achieved = new Set(["select"]);
  if (state.pkg) achieved.add("package");
  if (state.transferView) achieved.add("redact");
  if (state.renderings.length) achieved.add("render");
  if (state.receipts.length) achieved.add("handoff");
  for (const el of document.querySelectorAll("[data-progress]")) {
    el.classList.toggle("active", achieved.has(el.dataset.progress));
  }
}

function renderAllDownstream() {
  renderPackage();
  renderRedaction();
  renderTransferView();
  renderRenderings();
  renderHandoffs();
  renderProgress();
}

async function saveSession() {
  await chrome.storage.local.set({
    cb06Session: {
      project_id: state.project?.id ?? null,
      purpose: $("purpose").value,
      target_mode: $("targetMode").value,
      providers: $("providers").value,
      extra_keywords: $("extraKeywords").value,
      custom_literals: $("customLiterals").value,
      package_id: state.pkg?.id ?? null,
      redaction_plan_id: state.redactionPlan?.id ?? null,
      transfer_view_id: state.transferView?.id ?? null
    }
  });
  flash("Session references saved locally. Rendered context is not duplicated in the session record.");
}

async function loadSession() {
  const { cb06Session } = await chrome.storage.local.get("cb06Session");
  if (!cb06Session) throw new Error("No CB-06 session references saved.");
  await loadProjects(cb06Session.project_id);
  $("purpose").value = cb06Session.purpose || "";
  $("targetMode").value = cb06Session.target_mode || "single";
  $("providers").value = cb06Session.providers || "gpt";
  $("extraKeywords").value = cb06Session.extra_keywords || "";
  $("customLiterals").value = cb06Session.custom_literals || "";
  state.selectionPlan = null;
  state.selectedItemIds.clear();
  state.pkg = cb06Session.package_id ? await packageStore.get(cb06Session.package_id) : null;
  state.redactionPlan = cb06Session.redaction_plan_id ? await redactionLayer.getPlan(cb06Session.redaction_plan_id) : null;
  state.transferView = cb06Session.transfer_view_id ? await redactionLayer.getTransferView(cb06Session.transfer_view_id) : null;
  state.renderings = [];
  state.roundtable = null;
  state.attempts.clear();
  state.receipts = state.project ? await outbound.listReceiptsByProject(state.project.id) : [];
  await renderSelection();
  renderAllDownstream();
  flash("Session references restored. Render again before any new handoff confirmation.");
}

async function resetSession() {
  state.selectionPlan = null;
  state.selectedItemIds.clear();
  state.pkg = null;
  state.redactionPlan = null;
  state.transferView = null;
  state.renderings = [];
  state.roundtable = null;
  state.attempts.clear();
  state.receipts = [];
  $("candidateList").replaceChildren();
  $("selectionSummary").textContent = state.project ? `Project: ${state.project.name}` : "No project selected.";
  renderAllDownstream();
  flash("Runtime state reset. Persisted Core records remain intact.");
}

async function run(fn) {
  try {
    await fn();
    renderProgress();
  } catch (error) {
    flash(error?.message || String(error), "error");
  }
}

$("refreshProjects").addEventListener("click", () => run(async () => { await loadProjects(state.project?.id); await syncSelectedProject(); }));
$("projectSelect").addEventListener("change", () => run(syncSelectedProject));
$("targetMode").addEventListener("change", () => {
  const mode = $("targetMode").value;
  if (mode === "generic") $("providers").value = "";
  else if (mode === "single" && splitCsv($("providers").value).length !== 1) $("providers").value = "gpt";
  else if (mode === "roundtable" && splitCsv($("providers").value).length < 2) $("providers").value = "gpt, claude, gemini";
});
$("proposeSelection").addEventListener("click", () => run(proposeSelection));
$("createPackage").addEventListener("click", () => run(createPackage));
$("submitPackage").addEventListener("click", () => run(submitPackage));
$("approvePackage").addEventListener("click", () => run(approvePackage));
$("scanRedaction").addEventListener("click", () => run(scanRedaction));
$("approveTransferView").addEventListener("click", () => run(approveTransferView));
$("renderContext").addEventListener("click", () => run(renderContext));
$("saveSession").addEventListener("click", () => run(saveSession));
$("loadSession").addEventListener("click", () => run(loadSession));
$("resetSession").addEventListener("click", () => run(resetSession));

await run(async () => {
  await loadProjects();
  await syncSelectedProject();
  renderAllDownstream();
  flash("Context Bridge ready. Nothing leaves the browser automatically.");
});
