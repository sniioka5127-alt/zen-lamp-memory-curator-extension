import {
  AuditLog,
  ProjectStore,
  createChromeStorageAdapter
} from "./core/index.mjs";

const $ = (id) => document.getElementById(id);
const humanActor = { type: "human", id: "local_user" };
const adapter = createChromeStorageAdapter(chrome.storage.local);
const auditLog = new AuditLog(adapter);
const projectStore = new ProjectStore(adapter, { auditLog });

const WORKSPACE_STATE_KEY = "ws01CurrentProjectId";
const ATLAS_REPOSITORY_URL = "https://github.com/sniioka5127-alt/zen-lamp-chat-atlas";

const state = {
  project: null,
  summary: null
};

function flash(message, tone = "") {
  const el = $("flash");
  el.textContent = message;
  el.dataset.tone = tone;
}

function makePill(label, value, className = "") {
  const node = document.createElement("span");
  node.className = `pill ${className}`.trim();
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  node.append(document.createTextNode(`${label}: `), strong);
  return node;
}

function makeMetric(label, value) {
  const node = document.createElement("span");
  node.className = "metric";
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const small = document.createElement("span");
  small.textContent = label;
  node.append(strong, small);
  return node;
}

function renderMetrics(targetId, entries) {
  const target = $(targetId);
  target.replaceChildren();
  for (const [label, value] of entries) target.appendChild(makeMetric(label, value));
}

async function rows(prefix) {
  return (await adapter.entries(prefix)).map(([, value]) => value);
}

function belongsToProject(value, projectId) {
  if (!value || !projectId) return false;
  return value.project_id === projectId
    || value.source_project_id === projectId
    || value.project?.id === projectId;
}

async function summarizeProject(projectId) {
  const [items, packages, views, responses, reviews, decisions] = await Promise.all([
    rows("context-item:"),
    rows("context-package:"),
    rows("redaction-view:"),
    rows("roundtable-response:"),
    rows("roundtable-interpretive-review:"),
    rows("human-decision-record:")
  ]);

  const projectItems = items.filter((item) => belongsToProject(item, projectId));
  const projectPackages = packages.filter((pkg) => belongsToProject(pkg, projectId));
  const projectViews = views.filter((view) => belongsToProject(view, projectId));
  const projectResponses = responses.filter((response) => belongsToProject(response, projectId));
  const projectReviews = reviews.filter((review) => belongsToProject(review, projectId));
  const projectDecisions = decisions.filter((decision) => belongsToProject(decision, projectId));

  return {
    memory: {
      total: projectItems.filter((item) => item.status !== "archived").length,
      approved: projectItems.filter((item) => item.status === "approved").length,
      review: projectItems.filter((item) => ["proposed", "needs_review", "stale"].includes(item.status)).length
    },
    bridge: {
      packages: projectPackages.length,
      approvedPackages: projectPackages.filter((pkg) => pkg.status === "approved" && pkg.human_gate?.state === "approved").length,
      approvedViews: projectViews.filter((view) => view.status === "approved" && view.human_gate?.state === "approved").length
    },
    roundtable: {
      responses: projectResponses.length,
      reviews: projectReviews.length,
      finalizedReviews: projectReviews.filter((review) => review.status === "finalized_human_review").length
    },
    decision: {
      total: projectDecisions.length,
      draft: projectDecisions.filter((record) => record.status === "draft_human_decision").length,
      finalized: projectDecisions.filter((record) => record.status === "finalized_human_decision").length,
      revoked: projectDecisions.filter((record) => record.status === "revoked_human_decision").length
    }
  };
}

async function persistCurrentProject(projectId) {
  await chrome.storage.local.set({ [WORKSPACE_STATE_KEY]: projectId || null });
}

async function loadProjects(preferredId = null) {
  const projects = (await projectStore.list()).filter((project) => project.status !== "archived");
  const select = $("projectSelect");
  select.replaceChildren();

  if (!projects.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No Project yet";
    select.appendChild(option);
    state.project = null;
    state.summary = null;
    renderWorkspace();
    return;
  }

  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${project.name} · ${project.status}`;
    select.appendChild(option);
  }

  const preferredExists = preferredId && projects.some((project) => project.id === preferredId);
  select.value = preferredExists ? preferredId : projects[0].id;
  await selectProject(select.value);
}

async function selectProject(projectId) {
  state.project = projectId ? await projectStore.get(projectId) : null;
  state.summary = state.project ? await summarizeProject(state.project.id) : null;
  await persistCurrentProject(state.project?.id ?? null);
  renderWorkspace();
}

function renderWorkspace() {
  const project = state.project;
  const summary = state.summary;
  const enabled = Boolean(project);

  $("projectStatus").disabled = !enabled;
  $("applyProjectStatus").disabled = !enabled;
  $("openMemory").disabled = !enabled;
  $("openBridge").disabled = !enabled;
  $("openRoundtable").disabled = !enabled;
  $("openDecisionGate").disabled = !enabled;

  const projectSummary = $("projectSummary");
  projectSummary.replaceChildren();

  if (!project || !summary) {
    projectSummary.appendChild(makePill("Project", "Create one to begin", "warn"));
    renderMetrics("memoryMetrics", [["ContextItems", 0], ["Human approved", 0], ["Needs review", 0]]);
    renderMetrics("bridgeMetrics", [["Packages", 0], ["Approved", 0], ["TransferViews", 0]]);
    renderMetrics("roundtableMetrics", [["Responses", 0], ["RT-05 reviews", 0], ["Finalized", 0]]);
    renderMetrics("decisionMetrics", [["Finalized", 0], ["Draft", 0], ["Revoked", 0]]);
    renderMetrics("atlasMetrics", [["Project binding", "—"]]);
    return;
  }

  $("projectStatus").value = project.status;
  projectSummary.append(
    makePill("Project ID", project.id),
    makePill("Status", project.status, project.status === "active" ? "good" : "warn"),
    makePill("Local First", project.settings?.local_first === true ? "ON" : "INVALID", project.settings?.local_first === true ? "good" : "warn"),
    makePill("Human Gate", project.settings?.human_gate_required === true ? "REQUIRED" : "INVALID", project.settings?.human_gate_required === true ? "good" : "warn")
  );

  renderMetrics("atlasMetrics", [["Project binding", "ready"]]);
  renderMetrics("memoryMetrics", [
    ["ContextItems", summary.memory.total],
    ["Human approved", summary.memory.approved],
    ["Needs review", summary.memory.review]
  ]);
  renderMetrics("bridgeMetrics", [
    ["Packages", summary.bridge.packages],
    ["Approved", summary.bridge.approvedPackages],
    ["TransferViews", summary.bridge.approvedViews]
  ]);
  renderMetrics("roundtableMetrics", [
    ["Responses", summary.roundtable.responses],
    ["RT-05 reviews", summary.roundtable.reviews],
    ["Finalized", summary.roundtable.finalizedReviews]
  ]);
  renderMetrics("decisionMetrics", [
    ["Finalized", summary.decision.finalized],
    ["Draft", summary.decision.draft],
    ["Revoked", summary.decision.revoked]
  ]);
}

async function createProject() {
  const name = $("newProjectName").value.trim();
  if (!name) throw new Error("Enter a Project name.");
  const project = await projectStore.create({
    name,
    description: $("newProjectDescription").value.trim(),
    default_language: "ja",
    default_transfer_policy: "manual_only"
  }, { actor: humanActor });
  $("newProjectName").value = "";
  $("newProjectDescription").value = "";
  await loadProjects(project.id);
  flash(`Human Project created: ${project.name}.`, "good");
}

async function applyProjectStatus() {
  if (!state.project) throw new Error("Select a Project first.");
  const status = $("projectStatus").value;
  state.project = await projectStore.setStatus(state.project.id, status, {
    actor: humanActor,
    reason: "WS-01 Project Center status change"
  });
  state.summary = await summarizeProject(state.project.id);
  await loadProjects(state.project.id);
  flash(`Project status changed to ${status}.`, "good");
}

async function openLocalRoom(path, { hash = "" } = {}) {
  if (!state.project) throw new Error("Select a Human Project first.");
  const url = new URL(chrome.runtime.getURL(path));
  url.searchParams.set("project", state.project.id);
  if (hash) url.hash = hash;
  await chrome.tabs.create({ url: url.toString() });
}

async function openAtlas() {
  await chrome.tabs.create({ url: ATLAS_REPOSITORY_URL });
  flash("Opened the separately versioned Chat Atlas repository. WS-01 does not duplicate Room 1 runtime code.");
}

async function run(fn) {
  try {
    await fn();
  } catch (error) {
    flash(error?.message || String(error), "error");
  }
}

$("projectSelect").addEventListener("change", () => run(() => selectProject($("projectSelect").value)));
$("refreshWorkspace").addEventListener("click", () => run(async () => {
  await loadProjects(state.project?.id ?? null);
  flash("Workspace refreshed.", "good");
}));
$("createProject").addEventListener("click", () => run(createProject));
$("applyProjectStatus").addEventListener("click", () => run(applyProjectStatus));
$("openAtlas").addEventListener("click", () => run(openAtlas));
$("openMemory").addEventListener("click", () => run(() => openLocalRoom("popup.html")));
$("openBridge").addEventListener("click", () => run(() => openLocalRoom("context-bridge.html")));
$("openRoundtable").addEventListener("click", () => run(() => openLocalRoom("roundtable.html")));
$("openDecisionGate").addEventListener("click", () => run(() => openLocalRoom("roundtable.html", { hash: "human-decision-gate" })));

await run(async () => {
  const params = new URLSearchParams(location.search);
  const saved = await chrome.storage.local.get(WORKSPACE_STATE_KEY);
  const preferred = params.get("project") || saved[WORKSPACE_STATE_KEY] || null;
  await loadProjects(preferred);
  flash("One House Workspace ready. Project identity is shared; module authority remains separated.", "good");
});
