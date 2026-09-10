# WS-03｜Global Header Integration for Tools v0.1

Status: **Implementation candidate**

## Purpose

Connect the public One House Tools portal back to the broader ZEN LAMP PROJECT so that `/tools/` feels like one part of the same public site rather than a detached application surface.

## Public navigation model

The top global header exposes the same project-level destinations visible on the ZEN LAMP home experience:

- ZEN LAMP PROJECT home
- Why
- App
- HIRAKU
- Tools — current page
- Care
- 防災
- 小説
- 音楽
- Papers
- Founder
- ja / en / zh / ko language controls

The public Tools portal then provides a second, local navigation row for:

- Overview
- Chat Atlas
- Memory Curator
- Context Bridge
- Roundtable AI
- Human Gate

This keeps **site navigation** separate from **Tools workflow navigation**.

## Responsive contract

Desktop uses one global row where space permits. At narrower widths the global project navigation becomes a horizontally scrollable second row rather than hiding destinations behind JavaScript. The Tools-local navigation also remains horizontally scrollable. The implementation adds no new navigation state authority and no network calls.

## Human Agency boundary

WS-03 is navigation only. It does not:

- approve ContextItems
- persist memory
- transfer context
- execute Roundtable providers
- finalize Human decisions
- add provider API transport

The global header may move the user between ZEN LAMP surfaces, but it does not alter the authority state of One House artifacts.

## Deployment

WS-03 extends the existing public Tools bundle with:

- `index.html`
- `tools.css`
- `global-header.css`
- `tools.js`
- `DEPLOYMENT_MANIFEST.json`

Upload these files into `/public_html/tools/` while preserving `/public_html/tools/chat-atlas/` and all unrelated child directories.

Production is not verified until the public page and `global-header.css` pass the WS-03 deployment observation.
