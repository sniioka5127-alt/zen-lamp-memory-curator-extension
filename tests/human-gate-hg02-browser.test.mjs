import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const html = fs.readFileSync(new URL("../roundtable.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../roundtable.js", import.meta.url), "utf8");
const core = fs.readFileSync(new URL("../core/human-decision-record-store.mjs", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

test("HG-02: Human Decision Gate is visibly downstream of RT-05 and is not presented as a fifth AI room", () => {
  assert.match(html, /data-hg02="decision-gate-browser-integration"/);
  assert.match(html, /AI comparison and interpretive review end above/);
  assert.match(html, /Human Decision Gate/);
  assert.match(html, /not a fifth AI room/);
  assert.ok(html.indexOf('RT-05 · Interpretive Review / Human Gate') < html.indexOf('data-hg02-panel="human-decision-gate"'));
  assert.match(html, /data-progress="hg01">Decision Gate</);
});

test("HG-02: browser delegates Human judgment authority to the HG-01 Core contract", () => {
  assert.match(js, /HumanDecisionRecordStore/);
  assert.match(js, /new HumanDecisionRecordStore\(adapter, \{ auditLog \}\)/);
  assert.match(js, /decisionStore\.create\(/);
  assert.match(js, /decisionStore\.update\(/);
  assert.match(js, /decisionStore\.finalize\(/);
  assert.match(js, /decisionStore\.revoke\(/);
  assert.match(js, /supersedes_decision_id/);
  assert.match(js, /state\.review\?\.status !== "finalized_human_review"/);
  assert.match(js, /entry\.decision === "accept"/);
});

test("HG-02: decision UI exposes explicit Human-authored fields and lifecycle controls", () => {
  for (const id of [
    "decisionQuestion",
    "decisionDisposition",
    "decisionText",
    "decisionRationale",
    "decisionSupportingList",
    "decisionAlternatives",
    "decisionUnresolved",
    "decisionConditions",
    "decisionRevisitTrigger",
    "decisionRevisitAt",
    "startDecision",
    "saveDecision",
    "finalizeDecision",
    "revokeDecision",
    "supersedeDecision",
    "decisionSummary"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /value="decided"/);
  assert.match(html, /value="deferred"/);
  assert.match(html, /value="no_action"/);
});

test("HG-02: Human Decision remains separate from truth and execution", () => {
  assert.match(core, /truth_status: "not_independently_verified"/);
  assert.match(core, /execution_status: "not_executed_by_hg01"/);
  assert.match(html, /does not certify factual truth/);
  assert.match(html, /does not execute the decision/);
  assert.match(js, /Nothing has been executed/);
  assert.match(js, /execution_status remains/);
});

test("HG-02: runtime invalidates the current Decision Gate artifact when upstream Roundtable state changes", () => {
  assert.match(js, /function resetAfterResponse\(\)[\s\S]*?state\.decision = null;[\s\S]*?renderDecision\(\);/);
  assert.match(js, /function resetAfterComparison\(\)[\s\S]*?state\.decision = null;[\s\S]*?renderDecision\(\);/);
  assert.match(js, /function resetAfterExtraction\(\)[\s\S]*?state\.decision = null;[\s\S]*?renderDecision\(\);/);
  assert.match(js, /async function startReview\(\)[\s\S]*?state\.decision = null;[\s\S]*?renderDecision\(\);/);
  assert.match(js, /function renderAll\(\)[\s\S]*?renderReview\(\);\s*renderDecision\(\);\s*renderProgress\(\);/);
});

test("HG-02: browser adds no automated provider transport or decision execution path", () => {
  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /XMLHttpRequest/);
  assert.doesNotMatch(js, /chrome\.scripting\.executeScript/);
  assert.doesNotMatch(js, /\.submit\s*\(/);
  assert.doesNotMatch(js, /innerHTML\s*=/);
  assert.doesNotMatch(js, /majority_choice|recommended_provider|best_provider|correct_provider/);
});

test("HG-02: extension version advances to v0.5.0 and Roundtable browser JavaScript parses", () => {
  assert.equal(manifest.version, "0.5.0");
  execFileSync(process.execPath, ["--check", new URL("../roundtable.js", import.meta.url).pathname], { stdio: "pipe" });
});
