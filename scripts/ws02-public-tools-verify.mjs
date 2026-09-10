import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const artifactDir = path.join(repoRoot, "artifacts");
const reportPath = path.join(artifactDir, "ws02-public-deployment-report.json");
const baseUrl = process.env.WS02_TOOLS_URL || "https://zen-lamp.com/tools/";

function check(name, passed, details = {}) {
  return { name, status: passed ? "pass" : "fail", ...details };
}

async function getText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "ZEN-LAMP-WS-02-Deployment-Verification/0.1",
      "cache-control": "no-cache",
      pragma: "no-cache"
    },
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  return {
    url: response.url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    text
  };
}

async function main() {
  await fsp.mkdir(artifactDir, { recursive: true });
  const pageUrl = new URL(baseUrl);
  const cssUrl = new URL("./tools.css", pageUrl);
  const jsUrl = new URL("./tools.js", pageUrl);
  const atlasUrl = new URL("./chat-atlas/", pageUrl);

  const report = {
    version: "WS-02",
    scope: "Public One House Landing / Tools Portal deployment verification",
    deployment_url: pageUrl.toString(),
    checked_at: new Date().toISOString(),
    checks: []
  };

  try {
    const page = await getText(pageUrl);
    report.checks.push(check("ZEN LAMP Tools page returns HTTP 2xx", page.ok, {
      http_status: page.status,
      final_url: page.url,
      content_type: page.contentType
    }));

    const htmlMarkers = [
      "ONE HOUSE",
      'data-room="chat-atlas"',
      'data-room="memory-curator"',
      'data-room="context-bridge"',
      'data-room="roundtable-ai"',
      "HUMAN GATE",
      "AI ANALYSIS ENDS HERE",
      './tools.css',
      './tools.js',
      '/tools/chat-atlas/'
    ];
    for (const marker of htmlMarkers) {
      report.checks.push(check(`deployed HTML contains ${marker}`, page.text.includes(marker)));
    }

    const css = await getText(cssUrl);
    report.checks.push(check("WS-02 tools.css returns HTTP 2xx", css.ok, {
      http_status: css.status,
      final_url: css.url,
      content_type: css.contentType
    }));
    report.checks.push(check(
      "deployed CSS contains mobile one-column contract",
      css.text.includes("@media (max-width: 720px)") && css.text.includes(".room-grid { grid-template-columns: 1fr; }")
    ));

    const js = await getText(jsUrl);
    report.checks.push(check("WS-02 tools.js returns HTTP 2xx", js.ok, {
      http_status: js.status,
      final_url: js.url,
      content_type: js.contentType
    }));
    for (const marker of ['version: "WS-02"', 'ja:', 'en:', 'zh:', 'ko:', 'zenLampToolsLanguage']) {
      report.checks.push(check(`deployed JS contains ${marker}`, js.text.includes(marker)));
    }
    report.checks.push(check(
      "WS-02 portal runtime adds no automatic network transport",
      !/\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/i.test(js.text)
    ));

    const atlas = await getText(atlasUrl);
    report.checks.push(check("Existing Chat Atlas remains available", atlas.ok, {
      http_status: atlas.status,
      final_url: atlas.url,
      content_type: atlas.contentType
    }));

    report.status = report.checks.every((entry) => entry.status === "pass") ? "pass" : "fail";
  } catch (error) {
    report.status = "fail";
    report.error = error?.stack || error?.message || String(error);
  }

  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  for (const item of report.checks) {
    console.log(`${item.status === "pass" ? "PASS" : "FAIL"} ${item.name}${item.http_status ? ` (HTTP ${item.http_status})` : ""}`);
  }
  console.log(`WS-02 deployment verification: ${report.status.toUpperCase()}`);
  console.log(`Report: ${reportPath}`);

  if (report.status !== "pass") process.exitCode = 1;
}

await main();
