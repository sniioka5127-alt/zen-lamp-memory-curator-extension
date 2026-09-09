import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("E2E-01 browser smoke uses a real unpacked Chromium extension path", () => {
  const script = read("scripts/e2e-01-browser-smoke.mjs");
  assert.match(script, /--disable-extensions-except=/);
  assert.match(script, /--load-extension=/);
  assert.match(script, /--remote-debugging-pipe/);
  assert.match(script, /chrome-extension:\/\//);
  assert.match(script, /Human Project created through Workspace UI/);
});

test("E2E-01 walks One House Room 1 through Room 4 plus Human Gate", () => {
  const script = read("scripts/e2e-01-browser-smoke.mjs");
  for (const id of ["openAtlas", "openMemory", "openBridge", "openRoundtable", "openDecisionGate"]) {
    assert.match(script, new RegExp(id));
  }
  assert.match(script, /Memory Curator receives and enforces Project binding/);
  assert.match(script, /Context Bridge receives Project binding/);
  assert.match(script, /Roundtable AI opens under the same Project/);
  assert.match(script, /Human Gate remains a distinct deep-linked boundary/);
});

test("E2E-01 keeps Chat Atlas Project identity out of the HTTP query string", () => {
  const workspace = read("workspace.js");
  const script = read("scripts/e2e-01-browser-smoke.mjs");
  assert.match(workspace, /url\.hash = `project=/);
  assert.doesNotMatch(workspace, /ATLAS_PROJECT_PAGE_URL[\s\S]{0,600}searchParams\.set\("project"/);
  assert.match(script, /Project ID leaked into Chat Atlas HTTP query string/);
  assert.match(script, /#project=/);
});

test("E2E-01 locks the Memory Curator popup startup regression", () => {
  const popup = read("popup.js");
  assert.match(popup, /async function copyOutput\(\)/);
  assert.match(popup, /\$\("copy"\)\.addEventListener\("click", copyOutput\)/);
});

test("E2E-01 deployment verifier requires the AT-03 public markers", () => {
  const script = read("scripts/e2e-01-deployment-verify.mjs");
  assert.match(script, /https:\/\/zen-lamp\.com\/tools\/chat-atlas\//);
  assert.match(script, /project-binding\.js/);
  assert.match(script, /projectBindingStatus/);
  assert.match(script, /ATLAS_PROJECT_BINDING_VERSION/);
  assert.match(script, /project_store_verification/);
  assert.match(script, /human_project_reference/);
});

test("E2E-01 workflow blocks on browser smoke but observes deployment independently", () => {
  const workflow = read(".github/workflows/e2e-01-one-house.yml");
  assert.match(workflow, /xvfb-run -a node scripts\/e2e-01-browser-smoke\.mjs/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /e2e-01-browser-report/);
  assert.match(workflow, /e2e-01-deployment-report/);
  assert.doesNotMatch(workflow, /instrument-memory/);
});
