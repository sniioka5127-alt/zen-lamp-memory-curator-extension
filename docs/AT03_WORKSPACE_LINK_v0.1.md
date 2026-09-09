# AT-03 — One House → Chat Atlas Project Link v0.1

Status: **Implementation candidate**

## Purpose

This integration connects the WS-01 One House Workspace to the separately versioned Chat Atlas AT-03 runtime without copying Room 1 code into the Human Agency Core repository.

## Navigation contract

When the Human clicks **Open Chat Atlas** for a selected Project, One House opens:

```text
https://zen-lamp.com/tools/chat-atlas/#project=prj_...
```

The selected Project ID is placed in the URL **fragment**, not the query string.

This is deliberate:

- the Human explicitly initiates the navigation;
- the fragment is browser-side routing metadata and is not part of the HTTP request target;
- no ContextItem content, memory content, package content, provider response, review, or Human Decision is added to the external URL;
- Chat Atlas AT-03 treats the Project reference as routing metadata only.

## Authority boundary

```text
One House selected Project
        ↓
AT-03 Project reference
        ↓
Chat Atlas proposal envelope
```

This does not mean:

```text
Project selected
≠ ContextItem approved
≠ memory persisted
≠ transfer approved
≠ provider response verified
≠ truth
≠ Human Decision
≠ execution
```

Chat Atlas remains separately versioned and does not directly read Human Agency Core `ProjectStore`. Therefore Chat Atlas records `project_store_verification = not_verified` for the binding.

## Runtime boundary

The One House shell still owns only lightweight Project selection/navigation state. Canonical memory, packages, evidence, reviews, and decisions remain in their governed Core stores.

The workspace does not inject scripts into Chat Atlas, call a provider API, automate transport, or execute decisions.

## Deployment note

The source integration is complete when both repositories contain the AT-03 contract and One House fragment navigation. The public `zen-lamp.com/tools/chat-atlas/` deployment must also contain the AT-03 Chat Atlas build before deployed end-to-end Project binding can be claimed.

Real Chrome/Edge click-through from the extension workspace to the deployed Chat Atlas page remains a deployment smoke test.
