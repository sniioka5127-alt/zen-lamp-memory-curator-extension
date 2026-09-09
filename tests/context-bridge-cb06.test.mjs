import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

async function text(relative) {
  return readFile(path.join(root, relative), "utf8");
}

test("CB-06: dedicated Room 3 runtime exposes the full five-step governed flow", async () => {
  const html = await text("context-bridge.html");
  const requiredIds = [
    "projectSelect",
    "proposeSelection",
    "candidateList",
    "createPackage",
    "submitPackage",
    "approvePackage",
    "scanRedaction",
    "approveTransferView",
    "renderContext",
    "handoffList"
  ];
  for (const id of requiredIds) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /context-bridge\.js/);
  assert.match(html, /Copying is not delivery/);
  assert.match(html, /delivery remains <code>unverified<\/code>/i);
});

test("CB-06: runtime orchestrates CB-01 through CB-05 without provider network automation", async () => {
  const js = await text("context-bridge.js");
  for (const symbol of [
    "ContextPackageStore",
    "ContextSelectionEngine",
    "ContextRedactionLayer",
    "ContextRenderer",
    "OutboundHandoffBoundary"
  ]) assert.match(js, new RegExp(`\\b${symbol}\\b`));

  assert.match(js, /selectionEngine\.propose/);
  assert.match(js, /packageStore\.approve/);
  assert.match(js, /redactionLayer\.approveTransferView/);
  assert.match(js, /renderer\.render/);
  assert.match(js, /outbound\.recordAttempt/);
  assert.match(js, /outbound\.confirmManualHandoff/);

  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /XMLHttpRequest/);
  assert.doesNotMatch(js, /WebSocket/);
  assert.doesNotMatch(js, /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/i);
});

test("CB-06: copy attempt and Human handoff confirmation remain separate actions", async () => {
  const js = await text("context-bridge.js");
  const copyStart = js.indexOf("async function copyRendering");
  const confirmStart = js.indexOf("async function confirmHandoff");
  assert.ok(copyStart >= 0 && confirmStart > copyStart);
  const copyBlock = js.slice(copyStart, confirmStart);
  assert.match(copyBlock, /recordAttempt/);
  assert.doesNotMatch(copyBlock, /confirmManualHandoff/);

  const confirmBlock = js.slice(confirmStart, js.indexOf("function renderHandoffs", confirmStart));
  assert.match(confirmBlock, /confirmManualHandoff/);
  assert.match(confirmBlock, /humanActor/);
});

test("CB-06: session persistence stores Core references, not rendered context copies", async () => {
  const js = await text("context-bridge.js");
  const start = js.indexOf("async function saveSession");
  const end = js.indexOf("async function loadSession", start);
  const block = js.slice(start, end);
  assert.match(block, /package_id/);
  assert.match(block, /redaction_plan_id/);
  assert.match(block, /transfer_view_id/);
  assert.doesNotMatch(block, /rendered_text/);
  assert.doesNotMatch(block, /canonical_json/);
  assert.doesNotMatch(block, /canonical_payload/);
});

test("CB-06: Memory Curator popup launches Room 3 as a dedicated extension page", async () => {
  const html = await text("popup.html");
  const launcher = await text("popup-context-bridge.js");
  assert.match(html, /id="openContextBridge"/);
  assert.match(html, /popup-context-bridge\.js/);
  assert.match(launcher, /chrome\.runtime\.getURL\("context-bridge\.html"\)/);
  assert.match(launcher, /chrome\.tabs\.create/);
});
