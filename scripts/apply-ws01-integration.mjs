import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, text) => fs.writeFileSync(path, text);

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`WS-01 migration marker missing: ${label}`);
  return text.replace(from, to);
}

// Room 3: bind the selected One House Project.
{
  const path = "context-bridge.js";
  let text = read(path);
  if (!text.includes("const workspaceProjectId = new URLSearchParams(location.search).get(\"project\");")) {
    text = replaceOnce(
      text,
      'const systemActor = { type: "system", name: "context_bridge_browser_runtime" };',
      'const systemActor = { type: "system", name: "context_bridge_browser_runtime" };\nconst workspaceProjectId = new URLSearchParams(location.search).get("project");',
      "Context Bridge workspace Project"
    );
    text = replaceOnce(
      text,
      "  await loadProjects();\n  await syncSelectedProject();",
      "  await loadProjects(workspaceProjectId);\n  await syncSelectedProject();",
      "Context Bridge bootstrap"
    );
    write(path, text);
  }
}

// Room 4: filter approved sources to the selected One House Project.
{
  const path = "roundtable.js";
  let text = read(path);
  if (!text.includes("const workspaceProjectId = new URLSearchParams(location.search).get(\"project\");")) {
    text = replaceOnce(
      text,
      'const systemActor = { type: "system", name: "roundtable_browser_runtime" };',
      'const systemActor = { type: "system", name: "roundtable_browser_runtime" };\nconst workspaceProjectId = new URLSearchParams(location.search).get("project");',
      "Roundtable workspace Project"
    );

    const sourceBlock = [
      '  const packages = (await coreRows("context-package:"))',
      '    .filter((pkg) => pkg.status === "approved" && pkg.human_gate?.state === "approved")',
      '    .filter((pkg) => pkg.target?.mode === "roundtable" && (pkg.target?.platforms || []).length >= 2)',
      '    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));'
    ].join("\n");
    const replacement = [
      '  let packages = (await coreRows("context-package:"))',
      '    .filter((pkg) => pkg.status === "approved" && pkg.human_gate?.state === "approved")',
      '    .filter((pkg) => pkg.target?.mode === "roundtable" && (pkg.target?.platforms || []).length >= 2)',
      '    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));',
      '  if (workspaceProjectId) packages = packages.filter((pkg) => pkg.project_id === workspaceProjectId);'
    ].join("\n");
    text = replaceOnce(text, sourceBlock, replacement, "Roundtable Project source filter");
    write(path, text);
  }
}

// Stable Decision Gate deep-link from the One House shell.
{
  const path = "roundtable.html";
  let text = read(path);
  if (!text.includes('id="human-decision-gate"')) {
    text = replaceOnce(
      text,
      '<section class="panel decision-panel" data-hg02-panel="human-decision-gate">',
      '<section id="human-decision-gate" class="panel decision-panel" data-hg02-panel="human-decision-gate">',
      "Human Decision Gate anchor"
    );
    write(path, text);
  }
}

// English README.
{
  const path = "README.md";
  let text = read(path);
  text = text.replace(
    "A local-first browser extension for turning long AI conversations into structured memory candidates that a **human explicitly reviews and approves**, with governed Room 3 Context Bridge and Room 4 Roundtable browser runtimes plus a system-wide Human Decision Gate.",
    "A local-first Human Agency browser toolset with a Project-centered **One House Workspace**, Human-reviewed memory, governed Room 3 Context Bridge, Room 4 Roundtable browser runtime, and a system-wide Human Decision Gate."
  );
  text = text.replace(
    /Current extension \/ Core development line: \*\*[^*]+\*\*\./,
    "Current extension / Core development line: **MC-01 + CB-06 + RT-06 + HG-02 + WS-01 / v0.6.0**."
  );
  if (!text.includes("## One House Workspace — WS-01")) {
    const section = [
      "",
      "## One House Workspace — WS-01",
      "",
      "WS-01 adds a Project-centered common workspace for all four rooms plus Human Gate. The Product is integrated while module authority remains separated.",
      "",
      "The workspace can create/select a Human Project, show governed Core counts, and open Room 2, Room 3, Room 4, or the Human Decision Gate with the selected Project ID. It persists only `ws01CurrentProjectId` as lightweight shell state; canonical memory, evidence, packages, reviews, and decisions remain in their existing Core stores.",
      "",
      "Chat Atlas remains separately versioned at WS-01 and is linked without copying its runtime into this repository. No provider API, automatic transport, majority-to-decision conversion, or decision execution is added.",
      ""
    ].join("\n");
    text = text.replace("\n## Room 2 — Memory Curator\n", `${section}\n## Room 2 — Memory Curator\n`);
  }
  if (!text.includes("WS01_INTEGRATED_PROJECT_WORKSPACE_v0.1.md")) {
    text = text.replace(
      "- [`HG-02 Decision Gate Browser Integration`](docs/HG02_DECISION_GATE_BROWSER_INTEGRATION_v0.1.md)",
      "- [`HG-02 Decision Gate Browser Integration`](docs/HG02_DECISION_GATE_BROWSER_INTEGRATION_v0.1.md)\n- [`WS-01 Integrated Project Workspace / One House Shell`](docs/WS01_INTEGRATED_PROJECT_WORKSPACE_v0.1.md)"
    );
  }
  text = text.replace(
    "6. Open the extension popup for Memory Curator, **Open Context Bridge** for Room 3, or **Open Roundtable AI** for Room 4.",
    "6. Open the extension popup and choose **Open One House Workspace** for the Project-centered shell, or open Memory Curator / Context Bridge / Roundtable AI directly."
  );
  write(path, text);
}

// Japanese README.
{
  const path = "README.ja.md";
  let text = read(path);
  text = text.replace(
    "長いAI対話から「次に残す価値のある記憶」を整理し、**人間が承認する**ためのローカル動作ブラウザ拡張機能です。現在はRoom 3のContext Bridge Browser Runtimeと、Room 4のRoundtable Core証跡／比較／解釈レビュー層まで統合しています。",
    "Human Projectを中心に4つのRoomとHuman Gateを一つのWorkspaceから扱う、ローカルファーストのHuman Agencyブラウザツールです。Memory Curator、Context Bridge、Roundtable AI、Human Decision Gateを統合しつつ、各ModuleのAuthorityは分離します。"
  );
  text = text.replace(
    /現在の拡張機能／Core開発ラインは \*\*[^*]+\*\* です。/,
    "現在の拡張機能／Core開発ラインは **MC-01 + CB-06 + RT-06 + HG-02 + WS-01 / v0.6.0** です。"
  );
  if (!text.includes("## One House Workspace — WS-01")) {
    const section = [
      "",
      "## One House Workspace — WS-01",
      "",
      "WS-01では、4つのRoomとHuman GateをHuman Project中心の共通Workspaceから見渡し、行き来できるようにします。**Productは統合し、Architectureは分離したまま**です。",
      "",
      "WorkspaceではHuman Projectの作成・選択、Governed Core Recordの件数表示、選択Project IDを指定したRoom 2 / Room 3 / Room 4 / Human Decision Gateへの移動ができます。WS-01独自に保存するのは軽量UI Stateの`ws01CurrentProjectId`だけで、Memory・Evidence・ContextPackage・Review・Decision本文は既存Core Storeへ残します。",
      "",
      "Chat AtlasはWS-01時点では別RepoでVersion管理を継続し、RuntimeをこのRepoへ複製しません。Provider API、自動送信、多数派からの自動Decision、Decision自動実行は追加しません。",
      ""
    ].join("\n");
    text = text.replace("\n## Room 2 — Memory Curator\n", `${section}\n## Room 2 — Memory Curator\n`);
  }
  if (!text.includes("WS01_INTEGRATED_PROJECT_WORKSPACE_v0.1.ja.md")) {
    text = text.replace(
      "- [`HG-02 Decision Gate Browser Integration`](docs/HG02_DECISION_GATE_BROWSER_INTEGRATION_v0.1.ja.md)",
      "- [`HG-02 Decision Gate Browser Integration`](docs/HG02_DECISION_GATE_BROWSER_INTEGRATION_v0.1.ja.md)\n- [`WS-01 Integrated Project Workspace / One House Shell`](docs/WS01_INTEGRATED_PROJECT_WORKSPACE_v0.1.ja.md)"
    );
  }
  text = text.replace(
    "6. Memory Curatorは通常のPopupから、Room 3は **Open Context Bridge**、Room 4とHuman Decision Gateは **Open Roundtable AI** から開く。",
    "6. Popupの **Open One House Workspace** からProject中心の共通Workspaceを開く。Memory Curator / Context Bridge / Roundtable AIを直接開くこともできます。"
  );
  write(path, text);
}
