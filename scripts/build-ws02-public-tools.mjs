import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(repoRoot, "public-tools");
const outRoot = path.join(repoRoot, "artifacts", "ws02-public-one-house-tools");

const files = ["index.html", "tools.css", "tools.js"];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function assertContract() {
  const html = await fsp.readFile(path.join(sourceRoot, "index.html"), "utf8");
  const js = await fsp.readFile(path.join(sourceRoot, "tools.js"), "utf8");
  const css = await fsp.readFile(path.join(sourceRoot, "tools.css"), "utf8");

  const requiredHtml = [
    'data-room="chat-atlas"',
    'data-room="memory-curator"',
    'data-room="context-bridge"',
    'data-room="roundtable-ai"',
    'HUMAN GATE',
    '/tools/chat-atlas/',
    'zen-lamp-memory-curator-extension'
  ];
  for (const marker of requiredHtml) {
    if (!html.includes(marker)) throw new Error(`WS-02 HTML missing ${marker}`);
  }

  if (!js.includes('version: "WS-02"')) throw new Error("WS-02 runtime version marker missing");
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/i.test(js)) {
    throw new Error("WS-02 public portal must not add network transport");
  }
  if (!css.includes("@media (max-width: 720px)")) throw new Error("WS-02 responsive mobile breakpoint missing");
}

async function main() {
  await assertContract();
  await fsp.rm(outRoot, { recursive: true, force: true });
  await fsp.mkdir(outRoot, { recursive: true });

  const manifestFiles = [];
  for (const file of files) {
    const source = path.join(sourceRoot, file);
    const target = path.join(outRoot, file);
    const content = await fsp.readFile(source);
    await fsp.writeFile(target, content);
    manifestFiles.push({ path: file, bytes: content.length, sha256: sha256(content) });
  }

  const manifest = {
    schema_version: "0.1",
    deployment: "WS-02 Public One House Landing / Tools Portal",
    target_url: "https://zen-lamp.com/tools/",
    target_directory_hint: "/public_html/tools/",
    source_repository: "sniioka5127-alt/zen-lamp-memory-curator-extension",
    source_commit: process.env.GITHUB_SHA || "local-build",
    generated_at: new Date().toISOString(),
    overwrite_policy: "Replace /tools/index.html and add or replace /tools/tools.css and /tools/tools.js. Preserve /tools/chat-atlas/ and every unrelated child directory.",
    files: manifestFiles
  };

  await fsp.writeFile(
    path.join(outRoot, "DEPLOYMENT_MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  console.log(`WS-02 public tools bundle ready: ${outRoot}`);
  for (const file of manifestFiles) console.log(`${file.sha256}  ${file.path}`);
}

await main();
