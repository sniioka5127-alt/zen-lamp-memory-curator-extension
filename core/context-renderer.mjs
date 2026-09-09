import {
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertContextPackageTransferReady } from "./context-package-store.mjs";
import { assertRedactedTransferViewReady } from "./context-redaction-layer.mjs";

export const CONTEXT_RENDERER_VERSION = "CB-04";

export const RENDER_PROFILE = Object.freeze([
  "generic",
  "gpt",
  "claude",
  "gemini"
]);

const GOVERNANCE_PREAMBLE = Object.freeze([
  "This context was selected and approved through HIRAKU Context Bridge.",
  "Use only the canonical payload below as transferred working context.",
  "Do not reconstruct, infer, or guess information that was omitted or redacted.",
  "Preserve uncertainty, constraints, and distinctions expressed by the context items."
]);

function normalizeProvider(value) {
  return assertRequiredString(value ?? "generic", "provider").toLowerCase();
}

export function resolveRenderProfile(provider) {
  const normalized = normalizeProvider(provider);
  if (["gpt", "chatgpt", "openai"].includes(normalized)) return "gpt";
  if (["claude", "anthropic"].includes(normalized)) return "claude";
  if (["gemini", "google"].includes(normalized)) return "gemini";
  return "generic";
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildCanonicalTransferPayload(pkg, view) {
  assertContextPackageTransferReady(pkg);
  assertRedactedTransferViewReady(view, pkg);

  return {
    schema_version: "0.1",
    purpose: pkg.purpose,
    items: view.items.map((item) => ({
      context_item_id: item.context_item_id,
      kind: item.kind,
      content: item.content
    }))
  };
}

export function fingerprintCanonicalPayload(payload) {
  const canonicalJson = stableStringify(payload);
  return {
    algorithm: "fnv1a32",
    value: fnv1a32(canonicalJson),
    canonical_json: canonicalJson
  };
}

function prettyCanonicalJson(payload) {
  return JSON.stringify(payload, null, 2);
}

function renderGeneric({ provider, fingerprint, canonicalJson }) {
  return [
    "HIRAKU CONTEXT BRIDGE — CANONICAL TRANSFER",
    `Provider: ${provider}`,
    `Semantic fingerprint: fnv1a32:${fingerprint}`,
    "",
    ...GOVERNANCE_PREAMBLE,
    "",
    "--- BEGIN CANONICAL CONTEXT JSON ---",
    canonicalJson,
    "--- END CANONICAL CONTEXT JSON ---"
  ].join("\n");
}

function renderGpt({ provider, fingerprint, canonicalJson }) {
  return [
    "# HIRAKU Context Bridge — Canonical Transfer",
    `Provider: ${provider}`,
    `Semantic fingerprint: \`fnv1a32:${fingerprint}\``,
    "",
    ...GOVERNANCE_PREAMBLE.map((line) => `- ${line}`),
    "",
    "```json",
    canonicalJson,
    "```"
  ].join("\n");
}

function renderClaude({ provider, fingerprint, canonicalJson }) {
  return [
    "HIRAKU_CONTEXT_BRIDGE",
    `provider=${provider}`,
    `semantic_fingerprint=fnv1a32:${fingerprint}`,
    "",
    ...GOVERNANCE_PREAMBLE,
    "",
    "BEGIN_CANONICAL_CONTEXT_JSON",
    canonicalJson,
    "END_CANONICAL_CONTEXT_JSON"
  ].join("\n");
}

function renderGemini({ provider, fingerprint, canonicalJson }) {
  return [
    "## HIRAKU Context Bridge | Canonical Transfer",
    `Provider profile: ${provider}`,
    `Semantic fingerprint: fnv1a32:${fingerprint}`,
    "",
    ...GOVERNANCE_PREAMBLE,
    "",
    "### Canonical context JSON",
    "```json",
    canonicalJson,
    "```"
  ].join("\n");
}

function renderByProfile(profile, args) {
  if (profile === "gpt") return renderGpt(args);
  if (profile === "claude") return renderClaude(args);
  if (profile === "gemini") return renderGemini(args);
  return renderGeneric(args);
}

export function assertRenderedContextEquivalent(renderings) {
  if (!Array.isArray(renderings) || renderings.length < 2) {
    throw new TypeError("At least two rendered contexts are required for equivalence validation");
  }
  const [first, ...rest] = renderings;
  for (const rendering of rest) {
    if (rendering.semantic_fingerprint?.algorithm !== first.semantic_fingerprint?.algorithm ||
        rendering.semantic_fingerprint?.value !== first.semantic_fingerprint?.value ||
        rendering.canonical_json !== first.canonical_json) {
      throw new Error("Rendered contexts do not share the same canonical semantic payload");
    }
  }
  return true;
}

export class ContextRenderer {
  constructor({ auditLog = null, clock = () => new Date() } = {}) {
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async render(pkg, view, {
    provider = "generic",
    actor = { type: "system" }
  } = {}) {
    const normalizedProvider = normalizeProvider(provider);
    const profile = resolveRenderProfile(normalizedProvider);
    const canonicalPayload = buildCanonicalTransferPayload(pkg, view);
    const fingerprint = fingerprintCanonicalPayload(canonicalPayload);
    const prettyJson = prettyCanonicalJson(canonicalPayload);
    const generatedAt = nowIso(this.clock);

    const rendering = {
      schema_version: "0.1",
      renderer_version: CONTEXT_RENDERER_VERSION,
      id: makeId("render"),
      project_id: pkg.project_id,
      package_id: pkg.id,
      package_revision: pkg.revision,
      transfer_view_id: view.id,
      provider: normalizedProvider,
      profile,
      authority: "derived_from_human_approved_transfer_view",
      status: "rendered_not_sent",
      semantic_fingerprint: {
        algorithm: fingerprint.algorithm,
        value: fingerprint.value
      },
      canonical_payload: deepClone(canonicalPayload),
      canonical_json: fingerprint.canonical_json,
      rendered_text: renderByProfile(profile, {
        provider: normalizedProvider,
        fingerprint: fingerprint.value,
        canonicalJson: prettyJson
      }),
      generated_at: generatedAt
    };

    await this.auditLog?.append({
      project_id: pkg.project_id,
      action: "context_rendered",
      actor,
      entity_type: "context_render",
      entity_id: rendering.id,
      metadata: {
        package_id: pkg.id,
        package_revision: pkg.revision,
        transfer_view_id: view.id,
        provider: normalizedProvider,
        profile,
        semantic_fingerprint: `fnv1a32:${fingerprint.value}`
      }
    });

    return deepClone(rendering);
  }

  async renderRoundtable(pkg, view, {
    platforms = null,
    actor = { type: "system" }
  } = {}) {
    assertContextPackageTransferReady(pkg);
    assertRedactedTransferViewReady(view, pkg);

    const requested = platforms ?? pkg.target?.platforms ?? [];
    if (!Array.isArray(requested)) throw new TypeError("platforms must be an array");
    const normalized = [...new Set(requested.map(normalizeProvider))];
    if (normalized.length < 2) {
      throw new Error("Roundtable rendering requires at least two distinct platforms");
    }

    const renderings = [];
    for (const provider of normalized) {
      renderings.push(await this.render(pkg, view, { provider, actor }));
    }
    assertRenderedContextEquivalent(renderings);

    return {
      schema_version: "0.1",
      renderer_version: CONTEXT_RENDERER_VERSION,
      mode: "roundtable",
      project_id: pkg.project_id,
      package_id: pkg.id,
      package_revision: pkg.revision,
      transfer_view_id: view.id,
      semantic_fingerprint: deepClone(renderings[0].semantic_fingerprint),
      canonical_json: renderings[0].canonical_json,
      providers: normalized,
      renderings,
      status: "rendered_not_sent",
      generated_at: nowIso(this.clock)
    };
  }
}
