# ZEN LAMP Memory Curator Extension

A simple local browser extension for turning long AI conversations into usable memory.

This repository contains an early proof of concept from the ZEN LAMP PROJECT.

## What it does

Long AI conversations contain a mixture of:

- fixed rules
- project context
- discoveries
- temporary notes
- information that should not be carried forward
- handoff material for the next chat

A normal summary is not enough.

The goal is not to preserve everything.

**The goal is to help a human decide what deserves to continue.**

What we need is not simply more memory. We need memory governance.

## Privacy

This extension does not send conversation data to any external server.

It does not call an AI API.

Text remains in the browser unless the user explicitly copies it into an AI tool.

## How to use

1. Paste a long AI conversation into the extension.
2. Choose **Simple** or **Power User**.
3. Choose **INITIAL** or **UPDATE**.
4. Generate a Memory Curator prompt.
5. Paste the prompt into ChatGPT, Gemini, Claude, or another AI.
6. Review the structured memory proposal returned by the AI.

## Architecture direction — HIRAKU Tools

Memory Curator is now being defined as **Room 2** of a broader Human Agency workspace.

> One house, four rooms.

- **Chat Atlas** — see and understand what happened.
- **Memory Curator** — choose what remains.
- **Context Bridge** — choose what travels.
- **Roundtable AI** — compare multiple AI outputs without surrendering human judgment.

The product may be integrated as one workspace, while module responsibilities remain strictly separated in the architecture.

The following v0.1 architecture drafts are tracked in this repository:

- [`Human Agency Core v0.1`](docs/HUMAN_AGENCY_CORE_v0.1.md)
- [`Project Schema v0.1`](docs/PROJECT_SCHEMA_v0.1.md)
- [`ContextItem Schema v0.1`](docs/CONTEXT_ITEM_SCHEMA_v0.1.md)
- [`4 Module Boundary Spec v0.1`](docs/MODULE_BOUNDARY_SPEC_v0.1.md)

### Migration note

The current extension still includes legacy **Next Chat Handoff** responsibilities inside the Memory Curator prompt. Under the new architecture, those responsibilities are planned to move to **Context Bridge**. The current public runtime remains unchanged while the shared Core and module boundaries are specified first.

## Install on Chrome / Edge

1. Download or clone this repository.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Turn on Developer mode.
4. Click **Load unpacked**.
5. Select the folder containing `manifest.json`.

## Philosophy

This is not a tool for producing answers.

It is a tool for helping a human decide what should be remembered, updated, reviewed, or forgotten after a long AI conversation.

AI should not silently decide what becomes memory.

## License

MIT License
