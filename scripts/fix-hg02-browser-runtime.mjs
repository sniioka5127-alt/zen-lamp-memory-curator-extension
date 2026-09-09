import fs from "node:fs";

const path = "roundtable.js";
let text = fs.readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (!text.includes(from)) throw new Error(`HG-02 consistency marker missing: ${label}`);
  text = text.replace(from, to);
}

if (!/function renderAll\(\) \{[\s\S]*?renderReview\(\);\n  renderDecision\(\);\n  renderProgress\(\);/.test(text)) {
  replaceOnce(
    '  renderExtraction();\n  renderReview();\n  renderProgress();\n}\n\nasync function resetRuntime()',
    '  renderExtraction();\n  renderReview();\n  renderDecision();\n  renderProgress();\n}\n\nasync function resetRuntime()',
    "renderAll decision rendering"
  );
}

if (!text.includes('function resetAfterComparison() {\n  state.extractionPrompt = "";\n  state.extraction = null;\n  state.review = null;\n  state.decision = null;\n  renderExtraction();\n  renderReview();\n  renderDecision();')) {
  replaceOnce(
    '  state.decision = null;\n  renderExtraction();\n  renderReview();\n  renderProgress();\n}\n\nfunction resetAfterExtraction()',
    '  state.decision = null;\n  renderExtraction();\n  renderReview();\n  renderDecision();\n  renderProgress();\n}\n\nfunction resetAfterExtraction()',
    "resetAfterComparison decision rendering"
  );
}

if (!text.includes('function resetAfterExtraction() {\n  state.review = null;\n  state.decision = null;\n  renderReview();\n  renderDecision();')) {
  replaceOnce(
    'function resetAfterExtraction() {\n  state.review = null;\n  state.decision = null;\n  renderReview();\n  renderProgress();\n}',
    'function resetAfterExtraction() {\n  state.review = null;\n  state.decision = null;\n  renderReview();\n  renderDecision();\n  renderProgress();\n}',
    "resetAfterExtraction decision rendering"
  );
}

if (!text.includes('async function startReview() {\n  if (!state.extraction) throw new Error("Import an RT-04 interpretive proposal first.");\n  state.decision = null;')) {
  replaceOnce(
    'async function startReview() {\n  if (!state.extraction) throw new Error("Import an RT-04 interpretive proposal first.");\n  state.review = await reviewStore.create(',
    'async function startReview() {\n  if (!state.extraction) throw new Error("Import an RT-04 interpretive proposal first.");\n  state.decision = null;\n  state.review = await reviewStore.create(',
    "startReview clears current runtime decision"
  );
  replaceOnce(
    '  );\n  renderReview();\n  flash("RT-05 Human review started.',
    '  );\n  renderReview();\n  renderDecision();\n  flash("RT-05 Human review started.',
    "startReview renders decision gate"
  );
}

fs.writeFileSync(path, text);
console.log("HG-02 browser runtime consistency fix applied.");
