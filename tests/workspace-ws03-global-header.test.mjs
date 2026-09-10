import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("WS-03 exposes the ZEN LAMP global navigation and marks Tools current", () => {
  const html = read("public-tools/index.html");
  assert.match(html, /data-ws03-global-header/);
  assert.match(html, /class="project-brand" href="\/"/);
  for (const label of ["Why", "App", "HIRAKU", "Tools", "Care", "防災", "小説", "音楽", "Papers", "Founder"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /href="\/tools\/" aria-current="page">Tools<\/a>/);
});

test("WS-03 keeps language controls in the global header with a single persisted runtime", () => {
  const html = read("public-tools/index.html");
  const buttons = [...html.matchAll(/data-lang="(ja|en|zh|ko)"/g)].map((m) => m[1]);
  assert.deepEqual(buttons, ["ja", "en", "zh", "ko"]);
  const js = read("public-tools/tools.js");
  assert.match(js, /zenLampToolsLanguage/);
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/i);
});

test("WS-03 provides local Tools navigation for four rooms plus Human Gate", () => {
  const html = read("public-tools/index.html");
  for (const anchor of ["#overview", "#chat-atlas", "#memory-curator", "#context-bridge", "#roundtable-ai", "#human-gate"]) {
    assert.match(html, new RegExp(`href="${anchor}"`));
  }
  for (const id of ["overview", "chat-atlas", "memory-curator", "context-bridge", "roundtable-ai", "human-gate"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("WS-03 header remains responsive without a new JavaScript navigation authority", () => {
  const css = read("public-tools/global-header.css");
  assert.match(css, /\.global-header \{/);
  assert.match(css, /position: sticky/);
  assert.match(css, /\.global-nav/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("WS-03 deployment bundle includes the global header stylesheet and preserves Chat Atlas", () => {
  const builder = read("scripts/build-ws02-public-tools.mjs");
  assert.match(builder, /"global-header\.css"/);
  assert.match(builder, /Preserve \/tools\/chat-atlas\//);
  assert.match(builder, /WS-02 \+ WS-03 Public One House Landing/);
});
