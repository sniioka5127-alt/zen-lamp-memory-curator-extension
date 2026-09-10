import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const artifactDir = path.join(repoRoot, "artifacts");
const reportPath = path.join(artifactDir, "ws03-global-header-deployment-report.json");
const baseUrl = process.env.WS03_TOOLS_URL || "https://zen-lamp.com/tools/";

function check(name, passed, details = {}) {
  return { name, status: passed ? "pass" : "fail", ...details };
}

async function getText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "ZEN-LAMP-WS-03-Deployment-Verification/0.1",
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
  const headerCssUrl = new URL("./global-header.css", pageUrl);
  const atlasUrl = new URL("./chat-atlas/", pageUrl);

  const report = {
    version: "WS-03",
    scope: "ZEN LAMP Tools global header integration deployment verification",
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
      "data-ws03-global-header",
      "ZEN LAMP PROJECT",
      'href="/app/"',
      'href="/hiraku/"',
      'href="/tools/" aria-current="page">Tools',
      'href="/care/"',
      'href="/hinan-navi/"',
      'href="/fiction/"',
      'href="/music/"',
      'href="#overview"',
      'href="#chat-atlas"',
      'href="#human-gate"',
      './global-header.css'
    ];
    for (const marker of htmlMarkers) {
      report.checks.push(check(`deployed HTML contains ${marker}`, page.text.includes(marker)));
    }

    const headerCss = await getText(headerCssUrl);
    report.checks.push(check("WS-03 global-header.css returns HTTP 2xx", headerCss.ok, {
      http_status: headerCss.status,
      final_url: headerCss.url,
      content_type: headerCss.contentType
    }));
    for (const marker of [".global-header", ".global-nav", ".tools-localbar", "@media (max-width: 560px)"]) {
      report.checks.push(check(`deployed global header CSS contains ${marker}`, headerCss.text.includes(marker)));
    }

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
  console.log(`WS-03 deployment verification: ${report.status.toUpperCase()}`);
  console.log(`Report: ${reportPath}`);

  if (report.status !== "pass") process.exitCode = 1;
}

await main();
