# WS-03 Deployment Checklist v0.1

Use the generated `ws02-ws03-public-one-house-tools` artifact for the Human-controlled Hostinger publication step.

- Replace `/public_html/tools/index.html`.
- Replace `/public_html/tools/tools.css`.
- Add or replace `/public_html/tools/global-header.css`.
- Replace `/public_html/tools/tools.js`.
- `DEPLOYMENT_MANIFEST.json` may remain in `/public_html/tools/` as deployment evidence.
- Preserve `/public_html/tools/chat-atlas/` completely.
- Preserve every unrelated child directory under `/public_html/tools/`.
- After upload, rerun the WS-03 deployment verifier and require all public-header checks plus Chat Atlas availability to pass.

A source merge is not evidence of production publication. Production remains pending until the public verification succeeds.
