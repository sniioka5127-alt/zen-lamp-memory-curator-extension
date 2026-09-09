import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as Core from "../core/index.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("RT-06: Roundtable browser workspace exposes the complete RT-01 through RT-05 governed flow", () => {
  const html = read("roundtable.html");
  for (const marker of [
    'data-rt06="roundtable-browser-runtime"',
    'id="packageSelect"',
    'id="viewSelect"',
    'id="prepareInput"',
    'id="responseCaptureList"',
    'id="compareResponses"',
    'id="buildExtractionPrompt"',
    'id="extractionResult"',
    'id="startReview"',
    'id="finalizeReview"',
    'src="roundtable.js"'
  ]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /does not call a provider API/i);
  assert.match(html, /Human decision/i);
});

test("RT-06: all browser-orchestrated Core contracts are exported", () => {
  for (const symbol of [
    "AuditLog",
    "ContextPackageStore",
    "ContextRedactionLayer",
    "ContextRenderer",
    "RoundtableCanonicalInputBuilder",
    "RoundtableResponseStore",
    "RoundtableComparisonEngine",
    "RoundtableInterpretiveExtractionEngine",
    "RoundtableInterpretiveReviewStore",
    "acceptedInterpretiveSubjectIds",
    "createChromeStorageAdapter"
  ]) assert.equal(typeof Core[symbol], "function", `${symbol} must be exported by core/index.mjs`);
});

test("RT-06: runtime delegates authority to Core contracts and keeps provider transport manual", () => {
  const js = read("roundtable.js");
  for (const symbol of [
    "RoundtableCanonicalInputBuilder",
    "RoundtableResponseStore",
    "RoundtableComparisonEngine",
    "RoundtableInterpretiveExtractionEngine",
    "RoundtableInterpretiveReviewStore",
    "renderer.renderRoundtable",
    "inputBuilder.prepare",
    "responseStore.capture",
    "comparisonEngine.compare",
    "extractionEngine.ingest",
    "reviewStore.setDecision",
    "reviewStore.finalize"
  ]) assert.match(js, new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(js, /capture_method:\s*"manual_paste"/);
  assert.match(js, /receipts:\s*null/);
  assert.match(js, /Copy is not delivery/);
  assert.equal(js.includes("innerHTML"), false);
  assert.equal(/fetch\s*\(/.test(js), false);
  assert.equal(/XMLHttpRequest/.test(js), false);
  assert.equal(/majority_choice\s*=|winner\s*=|model_ranking\s*=/.test(js), false);
});

test("RT-06: popup exposes Room 4 on the integrated browser line", () => {
  const popup = read("popup.html");
  const launcher = read("popup-roundtable.js");
  const manifest = JSON.parse(read("manifest.json"));
  assert.match(popup, /Room 4 — Roundtable AI/);
  assert.match(popup, /id="openRoundtable"/);
  assert.match(popup, /popup-roundtable\.js/);
  assert.match(launcher, /roundtable\.html/);
  assert.match(manifest.version, /^0\.[456]\.0$/);
});

test("RT-06: browser module passes JavaScript syntax check", () => {
  const result = spawnSync(process.execPath, ["--check", path.join(root, "roundtable.js")], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
