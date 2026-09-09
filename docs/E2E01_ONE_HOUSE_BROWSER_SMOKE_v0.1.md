# E2E-01｜One House End-to-End Browser Smoke Test / Deployment Verification v0.1

Status: **Implementation candidate**

## Purpose

E2E-01 verifies that the integrated One House product can carry one Human-owned Project through the four rooms and the Human Decision boundary in a **real Chromium extension runtime**, while separately checking whether the public Chat Atlas deployment contains the merged AT-03 Project Binding build.

This is a smoke test, not a replacement for the module-specific Core tests.

## Browser path under test

```text
One House Workspace
  ↓ create Human Project through UI
Room 2 Memory Curator
  ↓ same Project ID
Room 3 Context Bridge
  ↓ same Project ID
Room 4 Roundtable AI
  ↓ same Project ID
Human Decision Gate
  ↓ distinct deep link
Room 1 Chat Atlas
  ↓ AT-03 fragment-only Project reference
```

The order above follows the browser actions used by the smoke script. Product semantics remain:

`See → Remember → Transfer → Compare → Decide`.

## Real browser requirement

`scripts/e2e-01-browser-smoke.mjs` launches the repository as an **unpacked Manifest V3 extension in Chromium/Chrome** and communicates with the browser through the Chrome DevTools Protocol over `--remote-debugging-pipe`.

It does not replace `chrome.storage`, `chrome.tabs`, or `chrome.runtime` with a fake browser shim.

The CI workflow runs the script under Xvfb so normal extension support is available even on a Linux runner without a physical display.

## Browser assertions

E2E-01 requires all of the following:

1. The unpacked extension loads.
2. `workspace.html` and `workspace.js` initialize in Chromium.
3. A Human Project can be created through the actual Workspace UI.
4. Room 2 opens as `popup.html?project=<id>` and binds the project field read-only to that Project.
5. Room 3 opens as `context-bridge.html?project=<id>` and selects that Project.
6. Room 4 opens as `roundtable.html?project=<id>`.
7. Human Gate opens as `roundtable.html?project=<id>#human-decision-gate` and the Human Decision Gate element exists.
8. Room 1 opens the public Chat Atlas URL with `#project=<id>`.
9. The Chat Atlas Project ID is **not** present as an HTTP `?project=` query parameter.

The browser report is written to:

`artifacts/e2e-01-browser-report.json`

## Deployment verification

`scripts/e2e-01-deployment-verify.mjs` checks the public Chat Atlas deployment at:

`https://zen-lamp.com/tools/chat-atlas/`

It verifies:

- the public page returns HTTP 2xx;
- the page references `./chat-atlas/project-binding.js`;
- the AT-03 browser integration markers are present;
- the public `project-binding.js` returns HTTP 2xx;
- the asset exposes AT-03 Project Binding markers;
- the asset does not add provider transport code.

The deployment report is written to:

`artifacts/e2e-01-deployment-report.json`

## Source Gate vs Deployment Gate

E2E-01 deliberately separates two claims.

### Source/browser gate

The real Chromium smoke is **blocking**. If the extension cannot load, create a Project, or route the same Project through the rooms and Human Gate, the E2E workflow fails.

### Public deployment observation

The public deployment check is **observational** in E2E-01. A Hostinger/manual deployment can lag behind the merged source repositories, so a stale deployment is reported clearly but does not by itself invalidate a source PR.

A future Production Release Gate may promote deployment verification to blocking once deployment automation and rollback are under formal control.

## Human Agency invariants

E2E-01 does not weaken existing authority boundaries.

- Project selected ≠ Context approved.
- Project bound ≠ Memory persisted.
- Project bound ≠ Transfer approved.
- Project bound ≠ Provider delivery verified.
- Provider comparison ≠ Truth.
- RT-05 accept ≠ Human Decision.
- Human Decision ≠ factual verification.
- Human Decision ≠ execution.

The test performs no provider API call, no automatic Context transfer, no majority vote, and no decision execution.

## Scope limit

E2E-01 validates **navigation, Project continuity, browser initialization, and deployment presence**. It does not automate the entire substantive manual workflow of creating memory candidates, approving every ContextItem, building/redacting a ContextPackage, pasting real provider responses, interpreting conflicts, and finalizing a Human Decision.

Those governed transitions remain covered by MC/CB/RT/HG Core tests. A later scenario suite may build synthetic fixtures and exercise selected full workflows in the browser, but it must not convert manual Human Gates into automatic approvals merely for test convenience.
