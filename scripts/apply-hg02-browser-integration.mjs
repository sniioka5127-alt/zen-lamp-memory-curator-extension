import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, text) => fs.writeFileSync(path, text);
function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`HG-02 migration marker missing: ${label}`);
  return text.replace(from, to);
}

const decisionCode = read("scripts/hg02-decision-code.txt").trimEnd();

// roundtable.html
{
  const path = "roundtable.html";
  let text = read(path);
  if (!text.includes('data-hg02="decision-gate-browser-integration"')) {
    text = replaceOnce(text, '<body data-rt06="roundtable-browser-runtime">', '<body data-rt06="roundtable-browser-runtime" data-hg02="decision-gate-browser-integration">', "body");
    text = replaceOnce(text,
      '<strong>Local-first + manual-only.</strong> RT-06 orchestrates RT-01 through RT-05 in the browser. It does not call a provider API, auto-send prompts, majority-vote, rank models, or make the Human decision.',
      '<strong>Local-first + manual-only.</strong> RT-06 orchestrates RT-01 through RT-05 in the browser, and HG-02 exposes the Human Decision Gate after Roundtable review. It does not call a provider API, auto-send prompts, majority-vote, rank models, execute a decision, or let AI finalize Human judgment.',
      "notice");
    text = replaceOnce(text, '      <span data-progress="rt05">RT-05</span>\n', '      <span data-progress="rt05">RT-05</span>\n      <span data-progress="hg01">Decision Gate</span>\n', "progress");

    const panel = [
      '',
      '    <div class="human-boundary" role="separator" aria-label="AI comparison ends; Human Decision Gate begins">',
      '      <span>AI comparison and interpretive review end above</span>',
      '      <strong>Human Decision Gate</strong>',
      '    </div>',
      '',
      '    <section class="panel decision-panel" data-hg02-panel="human-decision-gate">',
      '      <div class="panel-head"><div><span class="step human-step">H</span><h2>HG-01 · Human Decision Record</h2></div><span id="decisionStatus" class="status">Waiting for finalized RT-05</span></div>',
      '      <p class="muted">This is the Human judgment boundary. A finalized decision records what the Human decided and why. It does not certify factual truth and it does not execute the decision.</p>',
      '      <div class="decision-authority"><strong>Human authority only.</strong> RT-05 accept = usable deliberation material, not truth. HG-01 finalize = Human-authored decision record, not AI selection or external execution.</div>',
      '      <div class="grid two">',
      '        <label>Decision question<input id="decisionQuestion" type="text" placeholder="What decision is the Human making?" /></label>',
      '        <label>Disposition<select id="decisionDisposition"><option value="pending">pending</option><option value="decided">decided</option><option value="deferred">deferred</option><option value="no_action">no_action</option></select></label>',
      '      </div>',
      '      <label>Human decision<textarea id="decisionText" placeholder="State the Human decision in your own words."></textarea></label>',
      '      <label>Human rationale<textarea id="decisionRationale" placeholder="Why did you make this decision?"></textarea></label>',
      '      <div class="decision-subsection">',
      '        <h3>Human-accepted RT-05 interpretations used as support</h3>',
      '        <p class="muted">Optional. Only subjects explicitly accepted by the Human in RT-05 can be cited here.</p>',
      '        <div id="decisionSupportingList" class="supporting-list"></div>',
      '      </div>',
      '      <div class="grid two">',
      '        <label>Alternatives considered<textarea id="decisionAlternatives" placeholder="One alternative per line"></textarea></label>',
      '        <label>Unresolved questions<textarea id="decisionUnresolved" placeholder="One unresolved question per line"></textarea></label>',
      '      </div>',
      '      <label>Conditions / safeguards<textarea id="decisionConditions" placeholder="One condition per line"></textarea></label>',
      '      <div class="grid two">',
      '        <label>Revisit trigger<input id="decisionRevisitTrigger" type="text" placeholder="Required for deferred unless a revisit time is set" /></label>',
      '        <label>Revisit time<input id="decisionRevisitAt" type="text" placeholder="Optional checkpoint" /></label>',
      '      </div>',
      '      <label>Revocation reason<input id="decisionRevokeReason" type="text" placeholder="Used only when revoking a finalized Human decision" /></label>',
      '      <div class="actions decision-actions">',
      '        <button id="startDecision" type="button" class="primary">Open Human Decision Gate</button>',
      '        <button id="saveDecision" type="button">Save Human decision draft</button>',
      '        <button id="finalizeDecision" type="button" class="primary">Finalize Human decision</button>',
      '        <button id="revokeDecision" type="button" class="ghost">Revoke finalized decision</button>',
      '        <button id="supersedeDecision" type="button" class="ghost">Create superseding decision</button>',
      '      </div>',
      '      <div id="decisionSummary" class="detail"></div>',
      '    </section>',
      ''
    ].join('\n');
    text = replaceOnce(text, '\n    <section class="panel compact-panel">\n      <div class="panel-head"><div><h2>Runtime controls</h2></div></div>', `${panel}\n    <section class="panel compact-panel">\n      <div class="panel-head"><div><h2>Runtime controls</h2></div></div>`, "decision panel");
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
    text = replaceOnce(text, '  ContextRenderer,\n  RoundtableCanonicalInputBuilder,', '  ContextRenderer,\n  HumanDecisionRecordStore,\n  RoundtableCanonicalInputBuilder,', "store import");
    text = replaceOnce(text, 'const reviewStore = new RoundtableInterpretiveReviewStore(adapter, { auditLog });', 'const reviewStore = new RoundtableInterpretiveReviewStore(adapter, { auditLog });\nconst decisionStore = new HumanDecisionRecordStore(adapter, { auditLog });', "store init");
    text = replaceOnce(text, '  extraction: null,\n  review: null\n};', '  extraction: null,\n  review: null,\n  decision: null\n};', "state");

    text = text.replaceAll('  state.review = null;\n  renderAll();', '  state.review = null;\n  state.decision = null;\n  renderAll();');
    text = text.replaceAll('  state.review = null;\n  renderComparison();', '  state.review = null;\n  state.decision = null;\n  renderComparison();');
    text = text.replaceAll('  state.review = null;\n  renderExtraction();', '  state.review = null;\n  state.decision = null;\n  renderExtraction();');
    text = text.replaceAll('  state.review = null;\n  renderReview();', '  state.review = null;\n  state.decision = null;\n  renderReview();');

    text = replaceOnce(text, '  renderReview();\n  const accepted = acceptedInterpretiveSubjectIds(state.review);', '  state.decision = null;\n  renderReview();\n  renderDecision();\n  const accepted = acceptedInterpretiveSubjectIds(state.review);', "review finalize");
    text = replaceOnce(text, 'function renderProgress() {', `${decisionCode}\n\nfunction renderProgress() {`, "decision code");
    text = replaceOnce(text, '  if (state.review?.status === "finalized_human_review") achieved.add("rt05");', '  if (state.review?.status === "finalized_human_review") achieved.add("rt05");\n  if (state.decision?.status === "finalized_human_decision") achieved.add("hg01");', "progress");
    text = replaceOnce(text, '  renderReview();\n  renderProgress();\n}', '  renderReview();\n  renderDecision();\n  renderProgress();\n}', "render all");
    text = replaceOnce(text, '  state.review = null;\n  $("extractionResult").value = "";', '  state.review = null;\n  state.decision = null;\n  $("extractionResult").value = "";', "reset state");
    text = replaceOnce(text, '  flash("Room 4 runtime reset. Persisted RT-02 responses and RT-05 review records remain intact in Core storage.");', '  flash("Room 4 runtime reset. Persisted RT-02 responses, RT-05 reviews, and HG-01 Human Decision Records remain intact in Core storage.");', "reset flash");
    text = replaceOnce(text, '$("finalizeReview").addEventListener("click", () => run(finalizeReview));\n$("resetRuntime")', '$("finalizeReview").addEventListener("click", () => run(finalizeReview));\n$("startDecision").addEventListener("click", () => run(() => startDecision()));\n$("saveDecision").addEventListener("click", () => run(() => updateDecisionFromForm()));\n$("finalizeDecision").addEventListener("click", () => run(finalizeDecision));\n$("revokeDecision").addEventListener("click", () => run(revokeDecision));\n$("supersedeDecision").addEventListener("click", () => run(() => startDecision({ supersede: true })));\n$("resetRuntime")', "listeners");
    text = replaceOnce(text, '  flash("Roundtable AI ready. Start from an approved Room 3 source; nothing is sent automatically.");', '  flash("Roundtable AI + Human Decision Gate ready. Start from an approved Room 3 source; nothing is sent or executed automatically.");', "ready flash");
    write(path, text);
  }
}

// CSS
{
  const path = "roundtable.css";
  let text = read(path);
  if (!text.includes(".human-boundary")) {
    text += [
      '',
      '.human-boundary { margin: 28px 0 18px; padding: 14px 18px; border-top: 2px solid rgba(0,0,0,.18); border-bottom: 2px solid rgba(0,0,0,.18); display: flex; justify-content: space-between; gap: 12px; align-items: center; }',
      '.human-boundary span { font-size: .88rem; opacity: .72; }',
      '.human-boundary strong { font-size: 1rem; letter-spacing: .03em; }',
      '.decision-panel { border-width: 2px; }',
      '.human-step { font-weight: 800; }',
      '.decision-authority { margin: 12px 0 18px; padding: 12px 14px; border-radius: 12px; background: rgba(0,0,0,.045); line-height: 1.55; }',
      '.decision-subsection { margin-top: 18px; }',
      '.decision-subsection h3 { margin-bottom: 4px; }',
      '.supporting-list { display: grid; gap: 8px; margin: 10px 0 16px; }',
      '.supporting-option { display: flex; gap: 8px; align-items: flex-start; padding: 9px 10px; border: 1px solid rgba(0,0,0,.1); border-radius: 10px; font-weight: 500; line-height: 1.45; }',
      '.supporting-option input { margin-top: 3px; }',
      '.decision-panel textarea { min-height: 120px; }',
      '.decision-actions { margin-top: 18px; }',
      '@media (max-width: 720px) { .human-boundary { align-items: flex-start; flex-direction: column; } }',
      ''
    ].join('\n');
    write(path, text);
  }
}

// Manifest version
{
  const path = "manifest.json";
  const manifest = JSON.parse(read(path));
  manifest.version = "0.5.0";
  manifest.description = "Local-first Human Agency tools for human-reviewed memory, governed Context Bridge handoff, Roundtable comparison, and a Human Decision Gate.";
  write(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

// RT-06 version compatibility
{
  const path = "tests/roundtable-rt06-browser.test.mjs";
  let text = read(path);
  text = text.replace('test("RT-06: popup exposes Room 4 and manifest advances to v0.4.0", () => {', 'test("RT-06: popup exposes Room 4 on the integrated browser line", () => {');
  text = text.replace('assert.equal(manifest.version, "0.4.0");', 'assert.match(manifest.version, /^0\\.[45]\\.0$/);');
  write(path, text);
}

// README summaries
for (const path of ["README.md", "README.ja.md"]) {
  let text = read(path);
  if (text.includes("HG-02 — Decision Gate Browser Integration")) continue;
  if (path === "README.md") {
    text = text.replace("Current extension / Core development line: **MC-01 + CB-06 + RT-06 / v0.4.0**.", "Current extension / Core development line: **MC-01 + CB-06 + RT-06 + HG-02 / v0.5.0**.");
    const block = [
      '',
      '## Human Gate — Decide',
      '',
      '### HG-01 — Human Decision Record / Decision Gate',
      '',
      'HG-01 records the final Human judgment after a finalized RT-05 interpretive review. The Human records the decision question, disposition, decision text, rationale, optional Human-accepted RT-05 support references, alternatives, unresolved questions, conditions, and revisit criteria.',
      '',
      '### HG-02 — Decision Gate Browser Integration',
      '',
      'HG-02 places the Human Decision Gate directly after RT-05 in the existing Roundtable workspace rather than creating a fifth AI room. The UI exposes Human-only draft, save, finalize, revoke, and supersede actions through the HG-01 Core contract.',
      '',
      'Only a finalized RT-05 review opens the gate. Only RT-05 subjects explicitly accepted by the Human may be cited as supporting interpretation references. Finalized decisions remain `truth_status = not_independently_verified` and `execution_status = not_executed_by_hg01`.',
      '',
      'No provider API, automatic execution, majority-to-decision conversion, model winner, or AI-authored final judgment is added.',
      ''
    ].join('\n');
    text = text.replace('\n## Local First / Privacy\n', `${block}\n## Local First / Privacy\n`);
  } else {
    text = text.replace(/現在の拡張機能／Core開発ラインは \*\*[^*]+\*\* です。/, "現在の拡張機能／Core開発ラインは **MC-01 + CB-06 + RT-06 + HG-02 / v0.5.0** です。");
    const block = [
      '',
      '## Human Gate — 決める',
      '',
      '### HG-01 — Human Decision Record / Decision Gate',
      '',
      'HG-01は、確定済みRT-05 Human Reviewの後に、人間自身の最終判断を記録する境界です。',
      '',
      '### HG-02 — Decision Gate Browser Integration',
      '',
      'HG-02では第5のAI Roomを作らず、既存Roundtable画面のRT-05直後にHuman Decision Gateを配置します。HG-01 Coreを通じて、HumanだけがDraft作成・保存・確定・取消・差し替えを行えます。',
      '',
      'Decision Gateを開けるのはRT-05確定後だけです。判断材料として参照できるRoundtable解釈はRT-05でHumanがacceptした項目だけです。確定後も `truth_status = not_independently_verified`、`execution_status = not_executed_by_hg01` を維持します。',
      '',
      'Provider API、自動実行、多数派からの自動決定、モデル勝者、AIによる最終判断は追加しません。',
      ''
    ].join('\n');
    text = text.replace('\n## Local First / Privacy\n', `${block}\n## Local First / Privacy\n`);
  }
  write(path, text);
}

console.log("HG-02 browser integration migration applied.");
