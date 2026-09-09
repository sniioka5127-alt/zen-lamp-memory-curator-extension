import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const artifactDir = path.join(repoRoot, "artifacts");
const reportPath = path.join(artifactDir, "e2e-01-browser-report.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Chrome/Chromium not found. Checked: ${candidates.join(", ")}`);
}

class CdpPipe {
  constructor(child) {
    this.child = child;
    this.input = child.stdio[3];
    this.output = child.stdio[4];
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.buffer = Buffer.alloc(0);
    this.output.on("data", (chunk) => this.#onData(chunk));
    this.output.on("error", (error) => this.#failAll(error));
    child.on("exit", (code, signal) => {
      if (code !== 0 && code !== null) this.#failAll(new Error(`Chrome exited with code ${code}${signal ? ` (${signal})` : ""}.`));
    });
  }

  #failAll(error) {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const nul = this.buffer.indexOf(0);
      if (nul < 0) break;
      const raw = this.buffer.subarray(0, nul).toString("utf8");
      this.buffer = this.buffer.subarray(nul + 1);
      if (!raw) continue;
      let message;
      try {
        message = JSON.parse(raw);
      } catch (error) {
        this.#failAll(new Error(`Invalid CDP JSON: ${error.message}`));
        continue;
      }
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result || {});
      } else {
        this.events.push(message);
        if (this.events.length > 1000) this.events.shift();
      }
    }
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.input.write(`${JSON.stringify(payload)}\0`, "utf8", (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }
}

async function readJsonRetry(file, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await fsp.readFile(file, "utf8"));
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }
  throw new Error(`Could not read ${file}: ${lastError?.message || "timeout"}`);
}

async function discoverExtensionId(profileDir) {
  const preferencesPath = path.join(profileDir, "Default", "Preferences");
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const prefs = await readJsonRetry(preferencesPath, 1000);
      const settings = prefs?.extensions?.settings || {};
      for (const [id, entry] of Object.entries(settings)) {
        const manifestName = entry?.manifest?.name || "";
        const entryPath = entry?.path ? path.resolve(entry.path) : null;
        if (manifestName === "ZEN LAMP Memory Curator" || entryPath === repoRoot) return id;
      }
    } catch {
      // Chrome may still be writing the profile.
    }
    await sleep(200);
  }
  throw new Error("Could not discover unpacked extension ID from Chrome Preferences.");
}

async function attachPage(cdp, url) {
  const { targetId } = await cdp.send("Target.createTarget", { url });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  return { targetId, sessionId, url };
}

async function evaluate(cdp, sessionId, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  }, sessionId);
  if (response.exceptionDetails) {
    const text = response.exceptionDetails.exception?.description
      || response.exceptionDetails.text
      || "Runtime.evaluate failed";
    throw new Error(text);
  }
  return response.result?.value;
}

async function waitFor(cdp, sessionId, expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(cdp, sessionId, expression);
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await sleep(150);
  }
  throw new Error(`Timeout waiting for ${label}. Last result: ${String(last)}`);
}

async function listTargets(cdp) {
  const { targetInfos } = await cdp.send("Target.getTargets");
  return targetInfos || [];
}

async function clickAndFindTarget(cdp, workspaceSessionId, buttonId, matcher, label) {
  const before = new Set((await listTargets(cdp)).map((target) => target.targetId));
  await evaluate(cdp, workspaceSessionId, `document.getElementById(${JSON.stringify(buttonId)}).click(); true`);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const targets = await listTargets(cdp);
    const found = targets.find((target) => !before.has(target.targetId) && matcher(target.url || ""));
    if (found) return found;
    await sleep(150);
  }
  const urls = (await listTargets(cdp)).map((target) => target.url).filter(Boolean);
  throw new Error(`${label}: new target not found. Targets: ${urls.join(" | ")}`);
}

async function attachExistingTarget(cdp, target) {
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  return sessionId;
}

function safeProjectForExpression(projectId) {
  return JSON.stringify(projectId);
}

async function main() {
  await fsp.mkdir(artifactDir, { recursive: true });
  const chrome = findChrome();
  const profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), "hiraku-e2e01-"));
  const chromeArgs = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${repoRoot}`,
    `--load-extension=${repoRoot}`,
    "--remote-debugging-pipe",
    "about:blank"
  ];
  if (process.env.E2E_HEADLESS === "1") chromeArgs.unshift("--headless=new");

  const child = spawn(chrome, chromeArgs, {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "inherit", "pipe", "pipe"]
  });
  const cdp = new CdpPipe(child);
  const report = {
    version: "E2E-01",
    scope: "One House real Chromium extension browser smoke",
    chrome,
    started_at: new Date().toISOString(),
    checks: [],
    status: "running"
  };

  const record = (name, details = {}) => {
    report.checks.push({ name, status: "pass", ...details });
    console.log(`PASS ${name}`);
  };

  try {
    await cdp.send("Browser.getVersion");
    const extensionId = await discoverExtensionId(profileDir);
    report.extension_id = extensionId;
    record("unpacked extension loaded", { extension_id: extensionId });

    const workspaceUrl = `chrome-extension://${extensionId}/workspace.html`;
    const workspace = await attachPage(cdp, workspaceUrl);
    await waitFor(cdp, workspace.sessionId, `document.readyState === "complete" && !!document.getElementById("createProject")`, "workspace DOM");
    await waitFor(cdp, workspace.sessionId, `document.getElementById("flash")?.textContent.includes("Workspace ready")`, "workspace module initialization");
    record("One House Workspace initializes in real Chromium");

    const projectName = `E2E-01 ${Date.now()}`;
    await evaluate(cdp, workspace.sessionId, `(() => {
      const name = document.getElementById("newProjectName");
      const description = document.getElementById("newProjectDescription");
      name.value = ${JSON.stringify(projectName)};
      description.value = "E2E-01 browser smoke project";
      name.dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("createProject").click();
      return true;
    })()`);
    const projectId = await waitFor(cdp, workspace.sessionId, `(() => {
      const value = document.getElementById("projectSelect")?.value || "";
      return value.startsWith("prj_") ? value : "";
    })()`, "Human Project creation");
    assert(/^prj_[A-Za-z0-9_.:-]+$/.test(projectId), `Unexpected Project ID: ${projectId}`);
    report.project_id = projectId;
    record("Human Project created through Workspace UI", { project_id: projectId });

    const p = safeProjectForExpression(projectId);
    await waitFor(cdp, workspace.sessionId, `document.getElementById("projectSummary")?.textContent.includes(${p})`, "Project summary binding");
    record("Workspace renders selected Human Project identity");

    const memoryTarget = await clickAndFindTarget(
      cdp,
      workspace.sessionId,
      "openMemory",
      (url) => url.includes(`/popup.html?project=${encodeURIComponent(projectId)}`),
      "Memory Curator navigation"
    );
    const memorySession = await attachExistingTarget(cdp, memoryTarget);
    await waitFor(cdp, memorySession, `document.readyState === "complete" && document.getElementById("projectName")?.readOnly === true`, "Memory Curator Project binding");
    const memoryTitle = await evaluate(cdp, memorySession, `document.getElementById("projectName")?.title || ""`);
    assert(memoryTitle.includes(projectId), "Memory Curator did not bind the Workspace Project ID.");
    record("Room 2 Memory Curator receives and enforces Project binding", { url: memoryTarget.url });

    const bridgeTarget = await clickAndFindTarget(
      cdp,
      workspace.sessionId,
      "openBridge",
      (url) => url.includes(`/context-bridge.html?project=${encodeURIComponent(projectId)}`),
      "Context Bridge navigation"
    );
    const bridgeSession = await attachExistingTarget(cdp, bridgeTarget);
    await waitFor(cdp, bridgeSession, `document.readyState === "complete" && document.getElementById("projectSelect")?.value === ${p}`, "Context Bridge Project binding");
    record("Room 3 Context Bridge receives Project binding", { url: bridgeTarget.url });

    const roundtableTarget = await clickAndFindTarget(
      cdp,
      workspace.sessionId,
      "openRoundtable",
      (url) => url.includes(`/roundtable.html?project=${encodeURIComponent(projectId)}`) && !url.includes("human-decision-gate"),
      "Roundtable navigation"
    );
    const roundtableSession = await attachExistingTarget(cdp, roundtableTarget);
    await waitFor(cdp, roundtableSession, `document.readyState === "complete" && !!document.getElementById("prepareInput")`, "Roundtable browser runtime");
    const roundtableSearch = await evaluate(cdp, roundtableSession, `location.search`);
    assert(new URLSearchParams(roundtableSearch).get("project") === projectId, "Roundtable query did not carry Project ID.");
    record("Room 4 Roundtable AI opens under the same Project", { url: roundtableTarget.url });

    const decisionTarget = await clickAndFindTarget(
      cdp,
      workspace.sessionId,
      "openDecisionGate",
      (url) => url.includes(`/roundtable.html?project=${encodeURIComponent(projectId)}`) && url.includes("#human-decision-gate"),
      "Human Decision Gate navigation"
    );
    const decisionSession = await attachExistingTarget(cdp, decisionTarget);
    await waitFor(cdp, decisionSession, `document.readyState === "complete" && !!document.getElementById("human-decision-gate")`, "Human Decision Gate DOM");
    const decisionHash = await evaluate(cdp, decisionSession, `location.hash`);
    assert(decisionHash === "#human-decision-gate", `Unexpected Decision Gate hash: ${decisionHash}`);
    record("Human Gate remains a distinct deep-linked boundary", { url: decisionTarget.url });

    const atlasTarget = await clickAndFindTarget(
      cdp,
      workspace.sessionId,
      "openAtlas",
      (url) => url.startsWith("https://zen-lamp.com/tools/chat-atlas/") && url.includes(`#project=${encodeURIComponent(projectId)}`),
      "Chat Atlas navigation"
    );
    const atlasUrl = new URL(atlasTarget.url);
    assert(atlasUrl.searchParams.get("project") === null, "Project ID leaked into Chat Atlas HTTP query string.");
    assert(atlasUrl.hash === `#project=${encodeURIComponent(projectId)}`, "Chat Atlas Project fragment mismatch.");
    record("Room 1 Chat Atlas receives only fragment-based AT-03 Project reference", { url: atlasTarget.url });

    report.status = "pass";
    report.finished_at = new Date().toISOString();
    await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`E2E-01 browser smoke PASS (${report.checks.length} checks).`);
  } catch (error) {
    report.status = "fail";
    report.error = error?.stack || error?.message || String(error);
    report.finished_at = new Date().toISOString();
    await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));
    throw error;
  } finally {
    try {
      await cdp.send("Browser.close");
    } catch {
      child.kill("SIGTERM");
    }
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
    await fsp.rm(profileDir, { recursive: true, force: true });
  }
}

await main();
