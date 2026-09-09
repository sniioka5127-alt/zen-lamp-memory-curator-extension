import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => fs.readFileSync(path, "utf8");

test("WS-01: One House shell exposes four rooms and Human Gate", () => {
  const html = read("workspace.html");
  assert.match(html, /data-ws01="integrated-project-workspace"/);
  assert.match(html, /Human Project/);
  assert.match(html, /Chat Atlas/);
  assert.match(html, /Memory Curator/);
  assert.match(html, /Context Bridge/);
  assert.match(html, /Roundtable AI/);
  assert.match(html, /Human Decision Gate/);
  assert.match(html, /Product integrated\. Architecture separated\./);
});

test("WS-01: workspace reuses ProjectStore and persists only selected Project identity as workspace state", () => {
  const js = read("workspace.js");
  assert.match(js, /ProjectStore/);
  assert.match(js, /const WORKSPACE_STATE_KEY = "ws01CurrentProjectId"/);
  assert.match(js, /projectStore\.create/);
  assert.match(js, /projectStore\.setStatus/);
  assert.doesNotMatch(js, /context_items\s*:/);
  assert.doesNotMatch(js, /rendered_text\s*:/);
  assert.doesNotMatch(js, /raw_response\s*:/);
});

test("WS-01: project summary reads governed stores without creating a parallel artifact cache", () => {
  const js = read("workspace.js");
  for (const prefix of [
    "context-item:",
    "context-package:",
    "redaction-view:",
    "roundtable-response:",
    "roundtable-interpretive-review:",
    "human-decision-record:"
  ]) assert.match(js, new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("WS-01: Rooms 2 through 4 receive the selected Project ID and Human Gate deep-link", () => {
  const js = read("workspace.js");
  assert.match(js, /url\.searchParams\.set\("project", state\.project\.id\)/);
  assert.match(js, /openLocalRoom\("popup\.html"\)/);
  assert.match(js, /openLocalRoom\("context-bridge\.html"\)/);
  assert.match(js, /openLocalRoom\("roundtable\.html"\)/);
  assert.match(js, /human-decision-gate/);

  const popupJs = read("popup.js");
  const bridgeJs = read("context-bridge.js");
  const roundtableJs = read("roundtable.js");
  assert.match(popupJs, /workspaceProjectId/);
  assert.match(bridgeJs, /workspaceProjectId/);
  assert.match(roundtableJs, /workspaceProjectId/);
});

test("WS-01: workspace does not add provider transport or decision execution", () => {
  const js = read("workspace.js");
  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /XMLHttpRequest/);
  assert.doesNotMatch(js, /provider.*api/i);
  assert.doesNotMatch(js, /executeDecision|decisionExecution|auto.*decision/i);
});

test("WS-01: popup exposes the One House entry point and Manifest is v0.6.0", () => {
  const popup = read("popup.html");
  const manifest = JSON.parse(read("manifest.json"));
  assert.match(popup, /id="openWorkspace"/);
  assert.match(popup, /One House Workspace/);
  assert.equal(manifest.version, "0.6.0");
});

test("WS-01: Roundtable has a stable Human Decision Gate anchor", () => {
  const html = read("roundtable.html");
  assert.match(html, /id="human-decision-gate"/);
  assert.match(html, /data-hg02-panel="human-decision-gate"/);
});

test("WS-01: workspace JavaScript parses as an ES module", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: read("workspace.js"),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
