import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, text) { fs.writeFileSync(path, text); }
function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`HG-02 migration marker missing: ${label}`);
  return text.replace(from, to);
}

// roundtable.html
{
  const path = "roundtable.html";
  let text = read(path);
  if (!text.includes('data-hg02="decision-gate-browser-integration"')) {
    text = replaceOnce(text,
      '<body data-rt06="roundtable-browser-runtime">',
      '<body data-rt06="roundtable-browser-runtime" data-hg02="decision-gate-browser-integration">',
      "roundtable body marker");
    text = replaceOnce(text,
      '<strong>Local-first + manual-only.</strong> RT-06 orchestrates RT-01 through RT-05 in the browser. It does not call a provider API, auto-send prompts, majority-vote, rank models, or make the Human decision.',
      '<strong>Local-first + manual-only.</strong> RT-06 orchestrates RT-01 through RT-05 in the browser, and HG-02 exposes the Human Decision Gate after Roundtable review. The browser does not call a provider API, auto-send prompts, majority-vote, rank models, execute a decision, or let AI finalize Human judgment.',
      "notice");
    text = replaceOnce(text,
      '      <span data-progress="rt05">RT-05</span>\n',
      '      <span data-progress="rt05">RT-05</span>\n      <span data-progress="hg01">Decision Gate</span>\n',
      "progress");

    const decisionPanel = `\n    <div class="human-boundary" role="separator" aria-label="AI comparison ends; Human Decision Gate begins">\n      <span>AI comparison and interpretive review end above</span>\n      <strong>Human Decision Gate</strong>\n    </div>\n\n    <section class="panel decision-panel" data-hg02-panel="human-decision-gate">\n      <div class="panel-head"><div><span class="step human-step">H</span><h2>HG-01 · Human Decision Record</h2></div><span id="decisionStatus" class="status">Waiting for finalized RT-05</span></div>\n      <p class="muted">This is the Human judgment boundary. A finalized decision records what the Human decided and why. It does not certify factual truth and it does not execute the decision.</p>\n      <div class="decision-authority">\n        <strong>Human authority only.</strong> RT-05 accept = usable deliberation material, not truth. HG-01 finalize = Human-authored decision record, not AI selection or external execution.\n      </div>\n      <div class="grid two">\n        <label>Decision question<input id="decisionQuestion" type="text" placeholder="What decision is the Human making?" /></label>\n        <label>Disposition<select id="decisionDisposition"><option value="pending">pending</option><option value="decided">decided</option><option value="deferred">deferred</option><option value="no_action">no_action</option></select></label>\n      </div>\n      <label>Human decision<textarea id="decisionText" placeholder="State the Human decision in your own words."></textarea></label>\n      <label>Human rationale<textarea id="decisionRationale" placeholder="Why did you make this decision?"></textarea></label>\n\n      <div class="decision-subsection">\n        <h3>Human-accepted RT-05 interpretations used as support</h3>\n        <p class="muted">Optional. Only subjects explicitly accepted by the Human in RT-05 can be cited here.</p>\n        <div id="decisionSupportingList" class="supporting-list"></div>\n      </div>\n\n      <div class="grid two">\n        <label>Alternatives considered<textarea id="decisionAlternatives" placeholder="One alternative per line"></textarea></label>\n        <label>Unresolved questions<textarea id="decisionUnresolved" placeholder="One unresolved question per line"></textarea></label>\n      </div>\n      <label>Conditions / safeguards<textarea id="decisionConditions" placeholder="One condition per line"></textarea></label>\n      <div class="grid two">\n        <label>Revisit trigger<input id="decisionRevisitTrigger" type="text" placeholder="Required when disposition = deferred unless a revisit time is set" /></label>\n        <label>Revisit time<input id="decisionRevisitAt" type="text" placeholder="Optional ISO date/time or Human-readable checkpoint" /></label>\n      </div>\n      <label>Revocation reason<input id="decisionRevokeReason" type="text" placeholder="Used only when revoking a finalized Human decision" /></label>\n\n      <div class="actions decision-actions">\n        <button id="startDecision" type="button" class="primary">Open Human Decision Gate</button>\n        <button id="saveDecision" type="button">Save Human decision draft</button>\n        <button id="finalizeDecision" type="button" class="primary">Finalize Human decision</button>\n        <button id="revokeDecision" type="button" class="ghost">Revoke finalized decision</button>\n        <button id="supersedeDecision" type="button" class="ghost">Create superseding decision</button>\n      </div>\n      <div id="decisionSummary" class="detail"></div>\n    </section>\n`;
    text = replaceOnce(text,
      '\n    <section class="panel compact-panel">\n      <div class="panel-head"><div><h2>Runtime controls</h2></div></div>',
      `${decisionPanel}\n    <section class="panel compact-panel">\n      <div class="panel-head"><div><h2>Runtime controls</h2></div></div>`,
      "decision panel insertion");
    text = replaceOnce(text,
      '<p><strong>Room 4 — Roundtable AI:</strong> same context → raw evidence → descriptive comparison → proposed interpretation → Human review.</p>\n      <p class="muted">RT-01 → RT-06 · No majority-as-truth · No final decision in Room 4.</p>',
      '<p><strong>Room 4 — Roundtable AI:</strong> same context → raw evidence → descriptive comparison → proposed interpretation → Human review.</p>\n      <p><strong>Human Gate:</strong> Human review → Human-authored decision record. The Decision Gate is a system boundary, not a fifth AI room.</p>\n      <p class="muted">RT-01 → RT-06 → HG-01 / HG-02 · No majority-as-truth · No AI-authored final decision · No automatic execution.</p>',
      "footer");
    write(path, text);
  }
}

// roundtable.js
{
  const path = "roundtable.js";
  let text = read(path);
  if (!text.includes("HumanDecisionRecordStore")) {
    text = replaceOnce(text,
      '  ContextRenderer,\n  RoundtableCanonicalInputBuilder,',
      '  ContextRenderer,\n  HumanDecisionRecordStore,\n  RoundtableCanonicalInputBuilder,',
      "HG store import");
    text = replaceOnce(text,
      'const reviewStore = new RoundtableInterpretiveReviewStore(adapter, { auditLog });',
      'const reviewStore = new RoundtableInterpretiveReviewStore(adapter, { auditLog });\nconst decisionStore = new HumanDecisionRecordStore(adapter, { auditLog });',
      "HG store init");
    text = replaceOnce(text,
      '  extraction: null,\n  review: null\n};',
      '  extraction: null,\n  review: null,\n  decision: null\n};',
      "state decision");

    for (const marker of [
      '  state.review = null;\n  renderAll();',
      '  state.review = null;\n  renderAll();',
      '  state.review = null;\n  renderComparison();',
      '  state.review = null;\n  renderExtraction();',
      '  state.review = null;\n  renderReview();'
    ]) {
      if (text.includes(marker)) {
        text = text.replace(marker, marker.replace('  state.review = null;\n', '  state.review = null;\n  state.decision = null;\n'));
      }
    }

    text = replaceOnce(text,
      '  renderReview();\n  const accepted = acceptedInterpretiveSubjectIds(state.review);',
      '  state.decision = null;\n  renderReview();\n  renderDecision();\n  const accepted = acceptedInterpretiveSubjectIds(state.review);',
      "finalize review resets decision");

    const decisionCode = `\nfunction linesFromTextarea(id) {\n  return $(id).value.split(/\\r?\\n/).map((value) => value.trim()).filter(Boolean);\n}\n\nfunction acceptedReviewEntries() {\n  if (state.review?.status !== "finalized_human_review") return [];\n  return state.review.decisions.filter((entry) => entry.decision === "accept");\n}\n\nfunction supportingRefsFromUi() {\n  return Array.from(document.querySelectorAll("input[data-decision-support]:checked")).map((input) => ({\n    subject_type: input.dataset.subjectType,\n    subject_id: input.dataset.subjectId\n  }));\n}\n\nfunction decisionContext() {\n  if (!state.review || !state.extraction || !state.input || !state.comparison) {\n    throw new Error("HG-02 requires the current finalized RT-05 source chain.");\n  }\n  return [state.review, state.extraction, state.input, state.comparison, orderedResponses()];\n}\n\nfunction setDecisionFieldState(enabled) {\n  for (const id of [\n    "decisionQuestion", "decisionDisposition", "decisionText", "decisionRationale",\n    "decisionAlternatives", "decisionUnresolved", "decisionConditions",\n    "decisionRevisitTrigger", "decisionRevisitAt"\n  ]) $(id).disabled = !enabled;\n  for (const input of document.querySelectorAll("input[data-decision-support]")) input.disabled = !enabled;\n}\n\nfunction fillDecisionForm(record) {\n  if (!record) return;\n  $("decisionQuestion").value = record.decision_question || "";\n  $("decisionDisposition").value = record.disposition || "pending";\n  $("decisionText").value = record.decision_text || "";\n  $("decisionRationale").value = record.rationale || "";\n  $("decisionAlternatives").value = (record.alternatives_considered || []).join("\\n");\n  $("decisionUnresolved").value = (record.unresolved_questions || []).join("\\n");\n  $("decisionConditions").value = (record.conditions || []).join("\\n");\n  $("decisionRevisitTrigger").value = record.revisit?.trigger || "";\n  $("decisionRevisitAt").value = record.revisit?.at || "";\n}\n\nfunction renderDecisionSupportingList() {\n  const list = $("decisionSupportingList");\n  list.replaceChildren();\n  const accepted = acceptedReviewEntries();\n  if (!accepted.length) {\n    const p = document.createElement("p");\n    p.className = "muted";\n    p.textContent = state.review?.status === "finalized_human_review"\n      ? "No RT-05 subjects were Human-accepted. The Human may still decide without citing Roundtable interpretations."\n      : "Finalize RT-05 before selecting supporting interpretations.";\n    list.appendChild(p);\n    return;\n  }\n  const selected = new Set((state.decision?.supporting_subject_refs || []).map((entry) => `${entry.subject_type}:${entry.subject_id}`));\n  for (const entry of accepted) {\n    const subject = extractionSubject(entry.subject_type, entry.subject_id);\n    const label = document.createElement("label");\n    label.className = "supporting-option";\n    const checkbox = document.createElement("input");\n    checkbox.type = "checkbox";\n    checkbox.dataset.decisionSupport = "true";\n    checkbox.dataset.subjectType = entry.subject_type;\n    checkbox.dataset.subjectId = entry.subject_id;\n    checkbox.checked = selected.has(`${entry.subject_type}:${entry.subject_id}`);\n    const description = entry.subject_type === "conflict"\n      ? `${subject?.topic || entry.subject_id} — ${subject?.reason || ""}`\n      : subject?.statement || entry.subject_id;\n    label.append(checkbox, document.createTextNode(`${entry.subject_type} · ${entry.subject_id}${entry.provider ? ` · ${entry.provider}` : ""} — ${description}`));\n    list.appendChild(label);\n  }\n}\n\nasync function startDecision({ supersede = false } = {}) {\n  if (state.review?.status !== "finalized_human_review") throw new Error("Finalize RT-05 before opening the Human Decision Gate.");\n  const question = $("decisionQuestion").value.trim();\n  if (!question) throw new Error("Enter the Human decision question first.");\n  const previous = state.decision;\n  if (supersede) {\n    if (!previous || !["finalized_human_decision", "revoked_human_decision"].includes(previous.status)) {\n      throw new Error("Only a finalized or revoked Human Decision Record can be superseded.");\n    }\n  } else if (previous) {\n    throw new Error("A Human Decision Record is already active in this runtime.");\n  }\n  state.decision = await decisionStore.create(...decisionContext(), {\n    actor: humanActor,\n    decision_question: question,\n    supersedes_decision_id: supersede ? previous.id : null\n  });\n  renderDecision();\n  flash(supersede\n    ? `New Human decision draft created to supersede ${previous.id}. The prior record remains unchanged.`\n    : "Human Decision Gate opened. The decision remains a draft until the Human explicitly finalizes it.");\n}\n\nasync function updateDecisionFromForm({ announce = true } = {}) {\n  if (!state.decision || state.decision.status !== "draft_human_decision") throw new Error("Open a Human Decision draft first.");\n  state.decision = await decisionStore.update(\n    state.decision.id,\n    ...decisionContext(),\n    {\n      decision_question: $("decisionQuestion").value,\n      disposition: $("decisionDisposition").value,\n      decision_text: $("decisionText").value,\n      rationale: $("decisionRationale").value,\n      supporting_subject_refs: supportingRefsFromUi(),\n      alternatives_considered: linesFromTextarea("decisionAlternatives"),\n      unresolved_questions: linesFromTextarea("decisionUnresolved"),\n      conditions: linesFromTextarea("decisionConditions"),\n      revisit: {\n        trigger: $("decisionRevisitTrigger").value,\n        at: $("decisionRevisitAt").value\n      }\n    },\n    { actor: humanActor }\n  );\n  renderDecision();\n  if (announce) flash(`Human decision draft saved at revision ${state.decision.revision}. Nothing has been executed.`);\n  return state.decision;\n}\n\nasync function finalizeDecision() {\n  await updateDecisionFromForm({ announce: false });\n  state.decision = await decisionStore.finalize(\n    state.decision.id,\n    ...decisionContext(),\n    { actor: humanActor }\n  );\n  renderDecision();\n  flash(`Human decision finalized at revision ${state.decision.revision}. This records Human judgment; execution_status remains ${state.decision.execution_status}.`);\n}\n\nasync function revokeDecision() {\n  if (!state.decision || state.decision.status !== "finalized_human_decision") throw new Error("Only an active finalized Human Decision Record can be revoked.");\n  state.decision = await decisionStore.revoke(\n    state.decision.id,\n    ...decisionContext(),\n    { actor: humanActor, reason: $("decisionRevokeReason").value }\n  );\n  renderDecision();\n  flash("Human decision revoked. The historical record remains stored; create a superseding decision for a replacement judgment.");\n}\n\nfunction renderDecision() {\n  const summary = $("decisionSummary");\n  summary.replaceChildren();\n  renderDecisionSupportingList();\n  const reviewReady = state.review?.status === "finalized_human_review";\n  const record = state.decision;\n\n  $("startDecision").disabled = !reviewReady || Boolean(record);\n  $("saveDecision").disabled = !record || record.status !== "draft_human_decision";\n  $("finalizeDecision").disabled = !record || record.status !== "draft_human_decision";\n  $("revokeDecision").disabled = !record || record.status !== "finalized_human_decision";\n  $("supersedeDecision").disabled = !record || !["finalized_human_decision", "revoked_human_decision"].includes(record.status);\n  $("decisionRevokeReason").disabled = !record || record.status !== "finalized_human_decision";\n\n  if (!reviewReady) {\n    setStatus("decisionStatus", "Waiting for finalized RT-05");\n    setDecisionFieldState(false);\n    $("decisionQuestion").disabled = true;\n    summary.textContent = "Roundtable AI has not yet reached a finalized Human interpretive review. The final Human Decision Gate remains closed.";\n    return;\n  }\n\n  if (!record) {\n    setStatus("decisionStatus", "Ready for Human decision", "warn");\n    setDecisionFieldState(false);\n    $("decisionQuestion").disabled = false;\n    summary.textContent = "Enter the decision question and explicitly open the Human Decision Gate. No model output is promoted automatically.";\n    return;\n  }\n\n  fillDecisionForm(record);\n  const draft = record.status === "draft_human_decision";\n  setDecisionFieldState(draft);\n  setStatus("decisionStatus", `${record.status} · r${record.revision}`, record.status === "finalized_human_decision" ? "good" : record.status === "revoked_human_decision" ? "error" : "warn");\n  summary.textContent = `authority=${record.authority} · disposition=${record.disposition} · truth_status=${record.truth_status} · execution_status=${record.execution_status}${record.supersedes_decision_id ? ` · supersedes=${record.supersedes_decision_id}` : ""}`;\n}\n\n`;
    text = replaceOnce(text, 'function renderProgress() {', `${decisionCode}function renderProgress() {`, "decision functions");

    text = replaceOnce(text,
      '  if (state.review?.status === "finalized_human_review") achieved.add("rt05");',
      '  if (state.review?.status === "finalized_human_review") achieved.add("rt05");\n  if (state.decision?.status === "finalized_human_decision") achieved.add("hg01");',
      "decision progress");
    text = replaceOnce(text,
      '  renderReview();\n  renderProgress();\n}',
      '  renderReview();\n  renderDecision();\n  renderProgress();\n}',
      "render all decision");
    text = replaceOnce(text,
      '  state.review = null;\n  $("extractionResult").value = "";',
      '  state.review = null;\n  state.decision = null;\n  $("extractionResult").value = "";',
      "reset runtime decision");
    text = replaceOnce(text,
      '  flash("Room 4 runtime reset. Persisted RT-02 responses and RT-05 review records remain intact in Core storage.");',
      '  flash("Room 4 runtime reset. Persisted RT-02 responses, RT-05 reviews, and HG-01 Human Decision Records remain intact in Core storage.");',
      "reset flash");
    text = replaceOnce(text,
      '$("finalizeReview").addEventListener("click", () => run(finalizeReview));\n$("resetRuntime")',
      '$("finalizeReview").addEventListener("click", () => run(finalizeReview));\n$("startDecision").addEventListener("click", () => run(() => startDecision()));\n$("saveDecision").addEventListener("click", () => run(() => updateDecisionFromForm()));\n$("finalizeDecision").addEventListener("click", () => run(finalizeDecision));\n$("revokeDecision").addEventListener("click", () => run(revokeDecision));\n$("supersedeDecision").addEventListener("click", () => run(() => startDecision({ supersede: true })));\n$("resetRuntime")',
      "decision listeners");
    text = replaceOnce(text,
      '  flash("Roundtable AI ready. Start from an approved Room 3 source; nothing is sent automatically.");',
      '  flash("Roundtable AI + Human Decision Gate ready. Start from an approved Room 3 source; nothing is sent or executed automatically.");',
      "startup flash");
    write(path, text);
  }
}

// roundtable.css
{
  const path = "roundtable.css";
  let text = read(path);
  if (!text.includes(".human-boundary")) {
    text += `\n.human-boundary { margin: 28px 0 18px; padding: 14px 18px; border-top: 2px solid rgba(0,0,0,.18); border-bottom: 2px solid rgba(0,0,0,.18); display: flex; justify-content: space-between; gap: 12px; align-items: center; }\n.human-boundary span { font-size: .88rem; opacity: .72; }\n.human-boundary strong { font-size: 1rem; letter-spacing: .03em; }\n.decision-panel { border-width: 2px; }\n.human-step { font-weight: 800; }\n.decision-authority { margin: 12px 0 18px; padding: 12px 14px; border-radius: 12px; background: rgba(0,0,0,.045); line-height: 1.55; }\n.decision-subsection { margin-top: 18px; }\n.decision-subsection h3 { margin-bottom: 4px; }\n.supporting-list { display: grid; gap: 8px; margin: 10px 0 16px; }\n.supporting-option { display: flex; gap: 8px; align-items: flex-start; padding: 9px 10px; border: 1px solid rgba(0,0,0,.1); border-radius: 10px; font-weight: 500; line-height: 1.45; }\n.supporting-option input { margin-top: 3px; }\n.decision-panel textarea { min-height: 120px; }\n.decision-actions { margin-top: 18px; }\n@media (max-width: 720px) { .human-boundary { align-items: flex-start; flex-direction: column; } }\n`;
    write(path, text);
  }
}

// manifest
{
  const path = "manifest.json";
  const manifest = JSON.parse(read(path));
  manifest.version = "0.5.0";
  manifest.description = "Local-first Human Agency tools for human-reviewed memory, governed Context Bridge handoff, Roundtable comparison, and a Human Decision Gate.";
  write(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

// RT-06 compatibility test should accept the new extension version.
{
  const path = "tests/roundtable-rt06-browser.test.mjs";
  let text = read(path);
  if (text.includes('assert.equal(manifest.version, "0.4.0");')) {
    text = text.replace('test("RT-06: popup exposes Room 4 and manifest advances to v0.4.0", () => {', 'test("RT-06: popup exposes Room 4 and manifest remains on the integrated browser line", () => {');
    text = text.replace('assert.equal(manifest.version, "0.4.0");', 'assert.match(manifest.version, /^0\\.[45]\\.0$/);');
    write(path, text);
  }
}

// README English
{
  const path = "README.md";
  let text = read(path);
  if (!text.includes("### HG-02 — Decision Gate Browser Integration")) {
    text = text.replace("Current extension / Core development line: **MC-01 + CB-06 + RT-06 / v0.4.0**.", "Current extension / Core development line: **MC-01 + CB-06 + RT-06 + HG-02 / v0.5.0**.");
    const block = `\n## Human Gate — Decide\n\n### HG-01 — Human Decision Record / Decision Gate\n\nHG-01 is the system-wide final Human judgment boundary after a finalized RT-05 interpretive review. It records a Human-authored decision question, disposition, decision text, rationale, optional Human-accepted RT-05 support references, alternatives, unresolved questions, conditions, and optional revisit criteria. Finalization does not certify factual truth and does not execute the decision.\n\n### HG-02 — Decision Gate Browser Integration\n\nHG-02 places the Human Decision Gate directly after RT-05 in the existing Roundtable workspace rather than creating a fifth AI room. The browser exposes Human-only draft, save, finalize, revoke, and supersede actions through the HG-01 Core contract.\n\nThe UI visually marks the boundary where AI comparison ends. Only a finalized RT-05 review opens the Decision Gate. Only RT-05 subjects explicitly accepted by the Human may be cited as supporting interpretation references. Finalized decisions remain \\`truth_status = not_independently_verified\\` and \\`execution_status = not_executed_by_hg01\\`.\n\nNo provider API, automatic execution, majority-to-decision conversion, model winner, or AI-authored final judgment is added.\n`;
    text = text.replace("\n## Local First / Privacy\n", `${block}\n## Local First / Privacy\n`);
    text = text.replace("- [`RT-06 Roundtable Browser Runtime Integration`](docs/RT06_ROUNDTABLE_BROWSER_RUNTIME_v0.1.md)", "- [`RT-06 Roundtable Browser Runtime Integration`](docs/RT06_ROUNDTABLE_BROWSER_RUNTIME_v0.1.md)\n- [`HG-01 Human Decision Record / Decision Gate`](docs/HG01_HUMAN_DECISION_RECORD_v0.1.md)\n- [`HG-02 Decision Gate Browser Integration`](docs/HG02_DECISION_GATE_BROWSER_INTEGRATION_v0.1.md)");
    text = text.replace("RT-01 through RT-06 Roundtable contracts.", "RT-01 through RT-06 Roundtable contracts and HG-01 / HG-02 Human Decision Gate contracts.");
    write(path, text);
  }
}

// README Japanese
{
  const path = "README.ja.md";
  let text = read(path);
  if (!text.includes("### HG-02 — Decision Gate Browser Integration")) {
    text = text.replace(/現在の拡張機能／Core開発ラインは \*\*[^*]+\*\* です。/, "現在の拡張機能／Core開発ラインは **MC-01 + CB-06 + RT-06 + HG-02 / v0.5.0** です。");
    const block = `\n## Human Gate — 決める\n\n### HG-01 — Human Decision Record / Decision Gate\n\nHG-01は、確定済みRT-05 Human Reviewの後に置くシステム全体の最終Human判断境界です。人間自身がDecision Question、判断区分、判断本文、理由、必要に応じてRT-05でHumanがacceptした解釈参照、代替案、未解決事項、条件、再検討条件を記録します。確定しても事実の独立検証や外部実行を意味しません。\n\n### HG-02 — Decision Gate Browser Integration\n\nHG-02では、第5のAI Roomを作らず、既存のRoundtable画面でRT-05の直後にHuman Decision Gateを配置します。HG-01 Coreをそのまま使い、HumanだけがDraft作成・保存・確定・取消・差し替えを行えます。\n\nUI上でも「AIによる比較・解釈はここまで」という境界を明示します。Decision Gateを開けるのはRT-05が確定した後だけです。判断の根拠として参照できるRoundtable解釈は、RT-05でHumanがacceptした項目だけです。確定後も \\`truth_status = not_independently_verified\\`、\\`execution_status = not_executed_by_hg01\\` を維持します。\n\nProvider API、自動実行、多数派からの自動決定、モデル勝者、AIによる最終判断は追加しません。\n`;
    text = text.replace("\n## Local First / Privacy\n", `${block}\n## Local First / Privacy\n`);
    text = text.replace("- [`RT-06 Roundtable Browser Runtime Integration`](docs/RT06_ROUNDTABLE_BROWSER_RUNTIME_v0.1.md)", "- [`RT-06 Roundtable Browser Runtime Integration`](docs/RT06_ROUNDTABLE_BROWSER_RUNTIME_v0.1.md)\n- [`HG-01 Human Decision Record / Decision Gate`](docs/HG01_HUMAN_DECISION_RECORD_v0.1.ja.md)\n- [`HG-02 Decision Gate Browser Integration`](docs/HG02_DECISION_GATE_BROWSER_INTEGRATION_v0.1.ja.md)");
    write(path, text);
  }
}

console.log("HG-02 browser integration migration applied.");
