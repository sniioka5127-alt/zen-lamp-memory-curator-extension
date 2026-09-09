import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const artifactDir = path.join(repoRoot, "artifacts");
const reportPath = path.join(artifactDir, "e2e-01-deployment-report.json");
const baseUrl = process.env.CHAT_ATLAS_DEPLOYMENT_URL || "https://zen-lamp.com/tools/chat-atlas/";

function check(name, passed, details = {}) {
  return { name, status: passed ? "pass" : "fail", ...details };
}

async function getText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "HIRAKU-E2E-01-Deployment-Verification/0.1",
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
  const assetUrl = new URL("./chat-atlas/project-binding.js", pageUrl);
  const report = {
    version: "E2E-01",
    scope: "Public Chat Atlas AT-03 deployment verification",
    deployment_url: pageUrl.toString(),
    project_binding_asset_url: assetUrl.toString(),
    checked_at: new Date().toISOString(),
    checks: []
  };

  try {
    const page = await getText(pageUrl);
    report.checks.push(check("Chat Atlas page returns HTTP 2xx", page.ok, {
      http_status: page.status,
      final_url: page.url,
      content_type: page.contentType
    }));

    const htmlMarkers = [
      './chat-atlas/project-binding.js',
      'id="projectBindingStatus"',
      'bootstrapProjectBinding()',
      'project_binding: binding'
    ];
    for (const marker of htmlMarkers) {
      report.checks.push(check(`deployed HTML contains ${marker}`, page.text.includes(marker)));
    }

    const asset = await getText(assetUrl);
    report.checks.push(check("AT-03 project-binding.js returns HTTP 2xx", asset.ok, {
      http_status: asset.status,
      final_url: asset.url,
      content_type: asset.contentType
    }));

    const assetMarkers = [
      'PROJECT_BINDING_VERSION',
      '"AT-03"',
      'projectIdFromFragment',
      'resolveProjectBinding',
      'project_store_verification',
      'human_project_reference'
    ];
    for (const marker of assetMarkers) {
      report.checks.push(check(`deployed AT-03 asset contains ${marker}`, asset.text.includes(marker)));
    }

    report.checks.push(check(
      "AT-03 asset does not add provider transport",
      !/\bfetch\s*\(|XMLHttpRequest|provider[_-]?api/i.test(asset.text)
    ));

    report.status = report.checks.every((entry) => entry.status === "pass") ? "pass" : "fail";
  } catch (error) {
    report.status = "fail";
    report.error = error?.stack || error?.message || String(error);
  }

  await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));
  for (const item of report.checks) {
    console.log(`${item.status === "pass" ? "PASS" : "FAIL"} ${item.name}${item.http_status ? ` (HTTP ${item.http_status})` : ""}`);
  }
  console.log(`Deployment verification: ${report.status.toUpperCase()}`);
  console.log(`Report: ${reportPath}`);

  if (report.status !== "pass") process.exitCode = 1;
}

await main();
