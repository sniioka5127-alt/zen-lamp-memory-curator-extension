# WS-02｜Public One House Landing / Tools Portal Integration v0.1

Status: **Implementation candidate**

## Purpose

Bring the public `https://zen-lamp.com/tools/` landing page in line with the implemented One House architecture:

**See → Remember → Transfer → Compare → Decide**

The public portal presents one integrated product with four separated rooms and one Human Gate. Human Gate is a decision boundary, not a fifth AI room.

## Public information architecture

```text
ZEN LAMP Tools
  └─ One House
      ├─ Room 1 Chat Atlas        See
      ├─ Room 2 Memory Curator    Remember
      ├─ Room 3 Context Bridge    Transfer
      ├─ Room 4 Roundtable AI     Compare
      └─ Human Gate               Decide
```

### Room status

- Chat Atlas: public web runtime at `/tools/chat-atlas/`.
- Memory Curator: One House browser extension.
- Context Bridge: One House browser extension.
- Roundtable AI: One House browser extension.
- Human Gate: part of the One House decision flow, not a separate public AI app.

The portal must not pretend that extension-only rooms are independently hosted web applications.

## Human Agency boundaries

The public copy must preserve these distinctions:

- AI proposal ≠ Human approval.
- Memory ≠ Context transfer.
- Comparison ≠ decision.
- AI agreement ≠ truth.
- Human decision ≠ independently verified truth.
- Human decision ≠ external execution.

## Language support

WS-02 supports:

- Japanese
- English
- Simplified Chinese
- Korean

Language switching is local browser behavior using `localStorage`. No translation API or external network call is introduced.

## Privacy / network posture

The portal is a static public page. `tools.js` performs no `fetch`, XHR, WebSocket, provider API request, analytics call, or automatic context transfer.

External navigation is limited to explicit user clicks on public links.

## Responsive layout

- desktop: two-column room grid
- tablet: compact five-step flow
- mobile: one-column room grid and vertical flow
- keyboard focus styling is explicit
- reduced-motion preference is respected

## Deployment bundle

`node scripts/build-ws02-public-tools.mjs` produces:

```text
artifacts/ws02-public-one-house-tools/
  index.html
  tools.css
  tools.js
  DEPLOYMENT_MANIFEST.json
```

Deploy the **contents** into the existing Hostinger directory serving `/tools/`:

```text
/public_html/tools/
  index.html        ← replace
  tools.css         ← add or replace
  tools.js          ← add or replace
  chat-atlas/       ← PRESERVE
  ...               ← preserve unrelated child directories
```

Do not replace or delete `/tools/chat-atlas/` during WS-02 deployment.

## Acceptance criteria

1. The public landing displays exactly four rooms.
2. Human Gate is visually separated from the four rooms.
3. Chat Atlas opens the verified public runtime.
4. Extension-only rooms point to the One House extension source rather than pretending to be public web runtimes.
5. The page supports ja/en/zh/ko locally.
6. No network transport is introduced by the portal runtime.
7. Desktop and mobile layouts remain readable.
8. Deployment bundle generation is reproducible and CI-tested.
