import {
  AuditLog,
  ContextItemStore,
  ProjectStore,
  createChromeStorageAdapter
} from "./core/index.mjs";
import {
  buildCuratorPrompt,
  parseCuratorResponse,
  toContextItemInput
} from "./memory-curator/contract.mjs";

const $ = (id) => document.getElementById(id);
const humanActor = { type: "human", id: "local_user" };
const aiImportActor = { type: "ai", name: "memory_curator_external_ai" };

const adapter = createChromeStorageAdapter(chrome.storage.local);
const auditLog = new AuditLog(adapter);
const projectStore = new ProjectStore(adapter, { auditLog });
const itemStore = new ContextItemStore(adapter, { auditLog });

const projectNameEl = $("projectName");
const depthEl = $("depth");
const modeEl = $("mode");
const existingMemoryWrap = $("existingMemoryWrap");
const existingMemoryEl = $("existingMemory");
const conversationEl = $("conversation");
const outputEl = $("output");
const aiResultEl = $("aiResult");
const reviewSummaryEl = $("reviewSummary");
const itemListEl = $("itemList");

modeEl.addEventListener("change", () => {
  existingMemoryWrap.classList.toggle("hidden", modeEl.value !== "update");
});

function flash(text) {
  const old = document.title;
  document.title = text;
  setTimeout(() => { document.title = old; }, 1400);
}

function projectName() {
  return projectNameEl.value.trim() || "Memory Curator Local";
}

async function findProjectByName(name) {
  const projects = await projectStore.list();
  return projects.find((project) => project.name === name) || null;
}

async function ensureProject(name) {
  const existing = await findProjectByName(name);
  if (existing) return existing;
  return projectStore.create({ name }, { actor: humanActor });
}

async function approvedMemoryForPrompt(name) {
  const project = await findProjectByName(name);
  if (!project) return "";
  const approved = await itemStore.listByProject(project.id, { statuses: ["approved"] });
  const retained = approved.filter((item) => item.memory_policy !== "drop");
  if (!retained.length) return "";
  return JSON.stringify(retained.map((item) => ({
    id: item.id,
    content: item.content,
    kind: item.kind,
    memory_policy: item.memory_policy,
    freshness: item.freshness
  })), null, 2);
}

async function generatePrompt() {
  const conversation = conversationEl.value.trim();
  if (!conversation) {
    outputEl.value = "Please paste a conversation log first.";
    return;
  }

  let existingMemory = existingMemoryEl.value.trim();
  if (modeEl.value === "update" && !existingMemory) {
    existingMemory = await approvedMemoryForPrompt(projectName());
  }

  outputEl.value = buildCuratorPrompt({
    depth: depthEl.value,
    mode: modeEl.value,
    projectName: projectName(),
    existingMemory,
    conversation
  });
}

async function copyText(text, successMessage) {
  const value = String(text || "");
  if (!value.trim()) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch (err) {
    const temp = document.createElement("textarea");
    temp.value = value;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
  }
  flash(successMessage);
}

async function copyOutput() {
  if (!outputEl.value.trim()) await generatePrompt();
  await copyText(outputEl.value, "Copied prompt.");
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function importCandidates() {
  const raw = aiResultEl.value.trim();
  if (!raw) {
    flash("Paste the AI result first.");
    return;
  }

  try {
    const parsed = parseCuratorResponse(raw);
    const project = await ensureProject(projectName());
    const existing = await itemStore.listByProject(project.id);
    const seen = new Set(existing.map((item) => `${item.kind}\u0000${item.content}`));
    let imported = 0;
    let skipped = 0;

    for (const candidate of parsed.context_items) {
      const key = `${candidate.kind}\u0000${candidate.content}`;
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      await itemStore.create(
        toContextItemInput(candidate, { projectId: project.id }),
        { actor: aiImportActor }
      );
      seen.add(key);
      imported += 1;
    }

    await renderProject(project.id);
    reviewSummaryEl.textContent = `${imported} candidate(s) imported as PROPOSED. ${skipped} duplicate(s) skipped. Human review is required.`;
    flash("Candidates imported.");
  } catch (error) {
    reviewSummaryEl.textContent = error.message;
    flash("Import failed.");
  }
}

function addBadge(parent, text, className = "") {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`.trim();
  badge.textContent = text;
  parent.appendChild(badge);
}

function makeButton(text, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  if (className) button.className = className;
  button.addEventListener("click", handler);
  return button;
}

async function renderProject(projectId = null) {
  let project = null;
  if (projectId) project = await projectStore.get(projectId);
  if (!project) project = await findProjectByName(projectName());

  itemListEl.replaceChildren();
  if (!project) {
    reviewSummaryEl.textContent = "No local ContextItems for this project yet.";
    return;
  }

  const items = (await itemStore.listByProject(project.id)).filter((item) => item.status !== "archived");
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const reviewCount = items.filter((item) => ["proposed", "needs_review", "stale"].includes(item.status)).length;
  reviewSummaryEl.textContent = `${items.length} item(s) · ${approvedCount} approved · ${reviewCount} awaiting/requiring review`;

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "memory-card";

    const meta = document.createElement("div");
    meta.className = "memory-meta";
    addBadge(meta, item.status, `status-${item.status}`);
    addBadge(meta, item.kind);
    card.appendChild(meta);

    const content = document.createElement("p");
    content.className = "memory-content";
    content.textContent = item.content;
    card.appendChild(content);

    const policyRow = document.createElement("label");
    policyRow.className = "policy-row";
    policyRow.textContent = "Memory policy";
    const policySelect = document.createElement("select");
    for (const value of ["keep", "temporary", "review", "drop"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = item.memory_policy === value;
      policySelect.appendChild(option);
    }
    policySelect.disabled = item.status === "archived";
    policySelect.addEventListener("change", async () => {
      await itemStore.setMemoryPolicy(item.id, policySelect.value, {
        actor: humanActor,
        reason: "Memory Curator human review"
      });
      await renderProject(project.id);
      flash("Memory policy updated.");
    });
    policyRow.appendChild(policySelect);
    card.appendChild(policyRow);

    const actions = document.createElement("div");
    actions.className = "review-actions";

    if (["proposed", "needs_review", "stale"].includes(item.status)) {
      actions.appendChild(makeButton("Approve", "primary small", async () => {
        await itemStore.approve(item.id, { actor: humanActor, reason: "Approved in Memory Curator" });
        await renderProject(project.id);
        flash("Approved by human.");
      }));
    }

    if (["proposed", "needs_review"].includes(item.status)) {
      actions.appendChild(makeButton("Reject", "small", async () => {
        await itemStore.reject(item.id, { actor: humanActor, reason: "Rejected in Memory Curator" });
        await renderProject(project.id);
        flash("Candidate rejected.");
      }));
    }

    if (item.status === "approved") {
      const approved = document.createElement("span");
      approved.className = "human-approved";
      approved.textContent = "Human approved";
      actions.appendChild(approved);
    }

    card.appendChild(actions);
    itemListEl.appendChild(card);
  }
}

async function copyApprovedMemory() {
  const project = await findProjectByName(projectName());
  if (!project) {
    flash("No project memory yet.");
    return;
  }
  const items = await itemStore.listByProject(project.id, { statuses: ["approved"] });
  const payload = {
    schema_version: "0.1",
    project: { id: project.id, name: project.name },
    context_items: items.filter((item) => item.memory_policy !== "drop")
  };
  await copyText(JSON.stringify(payload, null, 2), "Approved memory copied.");
}

async function saveDraft() {
  await chrome.storage.local.set({
    mc01Draft: {
      projectName: projectNameEl.value,
      existingMemory: existingMemoryEl.value,
      conversation: conversationEl.value,
      output: outputEl.value,
      aiResult: aiResultEl.value,
      depth: depthEl.value,
      mode: modeEl.value
    }
  });
  flash("Draft saved locally.");
}

async function loadDraft() {
  const data = await chrome.storage.local.get(["mc01Draft", "existingMemory", "conversation", "output", "depth", "mode"]);
  const draft = data.mc01Draft || {};
  projectNameEl.value = draft.projectName || "Memory Curator Local";
  existingMemoryEl.value = draft.existingMemory ?? data.existingMemory ?? "";
  conversationEl.value = draft.conversation ?? data.conversation ?? "";
  outputEl.value = draft.output ?? data.output ?? "";
  aiResultEl.value = draft.aiResult || "";
  depthEl.value = draft.depth ?? data.depth ?? "simple";
  modeEl.value = draft.mode ?? data.mode ?? "initial";
  existingMemoryWrap.classList.toggle("hidden", modeEl.value !== "update");
  await renderProject();
  flash("Local draft loaded.");
}

$("grabSelection").addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    const res = await chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" });
    if (res?.text) {
      conversationEl.value = res.text;
      flash("Selected text loaded.");
    } else {
      flash("No selected text found.");
    }
  } catch (err) {
    flash("Could not read selected text.");
  }
});

$("generate").addEventListener("click", generatePrompt);
$("copy").addEventListener("click", copyOutput);
$("importCandidates").addEventListener("click", importCandidates);
$("copyApproved").addEventListener("click", copyApprovedMemory);
$("save").addEventListener("click", saveDraft);
$("load").addEventListener("click", loadDraft);
$("refreshItems").addEventListener("click", () => renderProject());
$("clear").addEventListener("click", () => {
  existingMemoryEl.value = "";
  conversationEl.value = "";
  outputEl.value = "";
  aiResultEl.value = "";
  flash("Draft fields cleared.");
});
projectNameEl.addEventListener("change", () => renderProject());

renderProject();
