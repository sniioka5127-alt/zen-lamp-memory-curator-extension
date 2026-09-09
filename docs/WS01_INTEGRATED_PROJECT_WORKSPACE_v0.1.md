# WS-01 — Integrated Project Workspace / One House Shell v0.1

Status: **Implementation candidate**

## Purpose

WS-01 creates one visible, Project-centered workspace for the four HIRAKU rooms while preserving hard architectural boundaries between them.

The adopted product principle is:

> **Product is integrated. Architecture is separated.**

The workspace is the common hall of one house. It is not a fifth AI room and it does not become a new authority layer over module-specific Core contracts.

## Product model

```text
Human Project
 ├ Room 1 — Chat Atlas       / See
 ├ Room 2 — Memory Curator   / Remember
 ├ Room 3 — Context Bridge   / Transfer
 ├ Room 4 — Roundtable AI    / Compare
 └ Human Gate                / Decide
```

The Project is the Human-owned center. Provider, model, chat, response, ContextPackage, and Decision Record are resources associated with a Project; none of them defines the Project boundary.

## WS-01 responsibilities

WS-01 may:

- list non-archived Human Projects from `ProjectStore`;
- create a Human Project;
- change a Project among `active`, `paused`, and `completed` through the existing Human-gated Core contract;
- persist only the currently selected Project ID as lightweight workspace state;
- summarize governed Core records by Project;
- open each room with the selected Project ID;
- expose Human Gate status after Room 4.

WS-01 must not:

- approve ContextItems;
- change Memory Policy or Transfer Policy;
- approve ContextPackages or TransferViews;
- perform provider transport;
- interpret or rank provider responses;
- convert agreement into truth;
- create or finalize a Human Decision on behalf of the Human;
- execute a finalized decision;
- duplicate canonical governed artifacts into a new workspace cache.

## Project Center

The workspace uses the existing `ProjectStore` as the only canonical Project authority.

WS-01 does not create a second Project schema. The shell reads the existing Project and displays:

- Project ID;
- status;
- Local First invariant;
- Human Gate invariant;
- Room-level governed artifact counts.

Project archive is intentionally not exposed from WS-01 v0.1 because the current Core treats an archived Project as immutable. Archival remains a deliberate lifecycle operation rather than a casual dashboard action.

## Room navigation

The selected Project ID is added to local room URLs as `?project=<project_id>`.

- Room 2: `popup.html?project=...`
- Room 3: `context-bridge.html?project=...`
- Room 4: `roundtable.html?project=...`
- Human Gate: `roundtable.html?project=...#human-decision-gate`

Room 2, Room 3, and Room 4 remain responsible for their own governed operations.

### Room 1 boundary

Chat Atlas remains separately versioned in `sniioka5127-alt/zen-lamp-chat-atlas` at WS-01. The One House shell links to that runtime's repository but does not vendor or duplicate its implementation into Human Agency Core.

This preserves the current separation of repositories while still presenting Room 1 as part of the same product architecture. A future AT/WS integration phase may define a Project-aware Room 1 handoff contract without weakening the boundary.

## Workspace summary

WS-01 reads existing governed stores and presents counts only. It does not copy artifact content into workspace state.

Current summary sources:

- `context-item:`
- `context-package:`
- `redaction-view:`
- `roundtable-response:`
- `roundtable-interpretive-review:`
- `human-decision-record:`

The only WS-01-specific persisted key is:

```text
ws01CurrentProjectId
```

This is lightweight UI state, consistent with the Project Schema rule that canonical memory, evidence, decisions, and provenance belong to Core objects rather than module-specific UI state.

## Human Agency invariants

```text
Project selected
≠ Context approved
≠ Context transferred
≠ Provider response verified
≠ Interpretation accepted as truth
≠ Human Decision finalized
≠ Decision executed
```

A shared workspace must never collapse these states.

## Local First / Network boundary

The workspace itself does not call an AI API and does not automatically send Project content anywhere.

Opening the Chat Atlas repository is an explicit Human navigation action. No Project content is included in that external URL.

Room 2 / Room 3 / Room 4 links are local extension URLs and carry only the local Project ID.

## Version

WS-01 advances the integrated browser line to Manifest **v0.6.0**.

## Test boundary

Automated tests cover:

- One House shell structure;
- four rooms plus Human Gate;
- ProjectStore authority reuse;
- lightweight selected-Project persistence only;
- governed artifact count prefixes;
- local Project deep links for Rooms 2–4;
- no provider `fetch()` / XHR / auto-execution path in the workspace runtime;
- project-aware Room 2 / Room 3 / Room 4 bootstrap hooks;
- Manifest v0.6.0;
- JavaScript syntax.

This remains Core / Browser Contract coverage. It is not a full real-browser click-through smoke test.
