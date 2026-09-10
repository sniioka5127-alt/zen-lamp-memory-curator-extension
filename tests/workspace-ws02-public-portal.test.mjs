import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("WS-02 exposes exactly four rooms and keeps Human Gate outside the room grid", () => {
  const html = read("public-tools/index.html");
  const rooms = [...html.matchAll(/data-room="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rooms, ["chat-atlas", "memory-curator", "context-bridge", "roundtable-ai"]);
  assert.match(html, /class="human-gate shell"/);
  assert.doesNotMatch(html, /data-room="human-gate"/);
});

test("WS-02 publishes the full See Remember Transfer Compare Decide path", () => {
  const html = read("public-tools/index.html");
  for (const term of ["See", "Remember", "Transfer", "Compare", "Decide"]) {
    assert.match(html, new RegExp(term));
  }
  assert.match(html, /AI ANALYSIS ENDS HERE/);
  assert.match(html, /AIの一致/);
});

test("WS-02 links public Chat Atlas directly and extension rooms to One House source", () => {
  const html = read("public-tools/index.html");
  assert.match(html, /href="\/tools\/chat-atlas\/"/);
  assert.match(html, /sniioka5127-alt\/zen-lamp-memory-curator-extension/);
  assert.match(html, /sniioka5127-alt\/zen-lamp-chat-atlas/);
  assert.doesNotMatch(html, /chrome-extension:\/\//);
});

test("WS-02 language runtime is local-only and supports ja en zh ko", () => {
  const js = read("public-tools/tools.js");
  assert.match(js, /version: "WS-02"/);
  for (const lang of ["ja", "en", "zh", "ko"]) assert.match(js, new RegExp(`\\b${lang}: \\{`));
  assert.match(js, /localStorage/);
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/i);
});

test("WS-02 responsive portal provides two-column rooms and one-column mobile fallback", () => {
  const css = read("public-tools/tools.css");
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.room-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /prefers-reduced-motion/);
});

test("WS-02 deployment builder replaces only tools root files and preserves Chat Atlas directory", () => {
  const builder = read("scripts/build-ws02-public-tools.mjs");
  assert.match(builder, /https:\/\/zen-lamp\.com\/tools\//);
  assert.match(builder, /\/public_html\/tools\//);
  assert.match(builder, /Preserve \/tools\/chat-atlas\//);
  for (const file of ["index.html", "tools.css", "tools.js"]) assert.match(builder, new RegExp(file.replace(".", "\\.")));
});
