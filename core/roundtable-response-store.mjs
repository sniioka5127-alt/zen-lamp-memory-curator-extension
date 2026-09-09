import {
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertStorageAdapter } from "./storage.mjs";
import { assertRoundtableCanonicalInputIntegrity } from "./roundtable-canonical-input.mjs";

export const ROUNDTABLE_RESPONSE_CAPTURE_VERSION = "RT-02";

export const ROUNDTABLE_RESPONSE_CAPTURE_METHOD = Object.freeze([
  "manual_paste",
  "manual_file",
  "other_manual"
]);

const RESPONSE_PREFIX = "roundtable-response:";

function requireHuman(actor) {
  if (actor?.type !== "human") {
    throw new Error("Human Gate required: RT-02 manual response capture may only be attested by a human actor");
  }
}

function actorIdentity(actor) {
  return actor?.id ?? actor?.name ?? "human";
}

function normalizeProvider(value) {
  return assertRequiredString(value, "provider").toLowerCase();
}

function normalizeCaptureMethod(value) {
  const method = assertRequiredString(value ?? "manual_paste", "capture_method");
  if (!ROUNDTABLE_RESPONSE_CAPTURE_METHOD.includes(method)) {
    throw new Error(`Unsupported RT-02 capture method: ${method}`);
  }
  return method;
}

function exactNonEmptyText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function optionalTrimmedString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function fingerprintRoundtableRawResponse(rawResponse) {
  const exact = exactNonEmptyText(rawResponse, "raw_response");
  return {
    algorithm: "fnv1a32",
    value: fnv1a32(exact),
    length: exact.length
  };
}

function assertRt01Shape(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("RT-01 Roundtable Canonical Input is required");
  }
  if (input.input_version !== "RT-01" || input.status !== "prepared_not_executed") {
    throw new Error("RT-02 requires an intact RT-01 prepared_not_executed input");
  }
  if (!Array.isArray(input.provider_inputs) || input.provider_inputs.length < 2) {
    throw new Error("RT-02 requires RT-01 provider inputs");
  }
}

function providerInputFor(input, provider) {
  const normalized = normalizeProvider(provider);
  const matches = input.provider_inputs.filter(
    (entry) => normalizeProvider(entry.provider) === normalized
  );
  if (matches.length !== 1) {
    throw new Error(`Provider is not uniquely present in the RT-01 input: ${normalized}`);
  }
  return matches[0];
}

function receiptForProvider(receipts, provider) {
  if (receipts == null) return null;
  const normalized = normalizeProvider(provider);
  const matches = receipts.filter(
    (receipt) => normalizeProvider(receipt?.provider) === normalized
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one CB-05 handoff receipt for provider: ${normalized}`);
  }
  return matches[0];
}

function assertReceiptMatchesInput(receipt, input, providerInput) {
  if (!receipt) return true;
  if (receipt.status !== "handoff_confirmed" || receipt.delivery_status !== "unverified") {
    throw new Error("RT-02 handoff evidence must be a CB-05 Human-confirmed manual handoff receipt");
  }
  if (receipt.package_id !== input.package_id ||
      receipt.package_revision !== input.package_revision ||
      receipt.transfer_view_id !== input.transfer_view_id ||
      receipt.rendering_id !== providerInput.rendering_id ||
      normalizeProvider(receipt.provider) !== normalizeProvider(providerInput.provider) ||
      receipt.semantic_fingerprint?.algorithm !== input.semantic_fingerprint?.algorithm ||
      receipt.semantic_fingerprint?.value !== input.semantic_fingerprint?.value) {
    throw new Error("RT-02 handoff receipt does not match the RT-01 provider input");
  }
  if (!input.handoff_evidence?.receipt_ids?.includes(receipt.id)) {
    throw new Error("RT-02 handoff receipt was not part of the RT-01 provenance evidence");
  }
  return true;
}

export function assertRoundtableResponseIntegrity(response, input) {
  assertRt01Shape(input);
  if (!response || typeof response !== "object") {
    throw new TypeError("Roundtable provider response is required");
  }
  if (response.capture_version !== ROUNDTABLE_RESPONSE_CAPTURE_VERSION) {
    throw new Error("Roundtable provider response was not captured by RT-02");
  }
  if (response.status !== "captured_raw_uninterpreted") {
    throw new Error("RT-02 response must remain captured_raw_uninterpreted");
  }
  if (response.authority !== "evidence_only_no_interpretation") {
    throw new Error("RT-02 response authority was modified");
  }
  if (response.roundtable_input_id !== input.id ||
      response.project_id !== input.project_id ||
      response.package_id !== input.package_id ||
      response.package_revision !== input.package_revision ||
      response.transfer_view_id !== input.transfer_view_id) {
    throw new Error("RT-02 response does not match its RT-01 canonical input");
  }

  const providerInput = providerInputFor(input, response.provider);
  if (response.rendering_id !== providerInput.rendering_id ||
      response.profile !== providerInput.profile ||
      response.semantic_fingerprint?.algorithm !== input.semantic_fingerprint?.algorithm ||
      response.semantic_fingerprint?.value !== input.semantic_fingerprint?.value) {
    throw new Error("RT-02 response provenance does not match the provider canonical input");
  }

  const fingerprint = fingerprintRoundtableRawResponse(response.raw_response);
  if (response.response_fingerprint?.algorithm !== fingerprint.algorithm ||
      response.response_fingerprint?.value !== fingerprint.value ||
      response.response_fingerprint?.length !== fingerprint.length ||
      response.raw_response_length !== response.raw_response.length) {
    throw new Error("RT-02 raw response content or fingerprint was modified");
  }

  if (response.source_provenance?.source_authenticity !== "human_attested_unverified" ||
      !ROUNDTABLE_RESPONSE_CAPTURE_METHOD.includes(response.source_provenance?.capture_method)) {
    throw new Error("RT-02 response source provenance is invalid");
  }

  if (response.source_provenance?.handoff_receipt_id != null &&
      !input.handoff_evidence?.receipt_ids?.includes(response.source_provenance.handoff_receipt_id)) {
    throw new Error("RT-02 response references handoff evidence outside the RT-01 input");
  }

  if ("analysis" in response || "winner" in response || "decision" in response || "score" in response) {
    throw new Error("RT-02 response capture must not contain comparison or decision fields");
  }
  return true;
}

export class RoundtableResponseStore {
  constructor(adapter, { auditLog = null, clock = () => new Date() } = {}) {
    this.adapter = assertStorageAdapter(adapter);
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async capture(input, pkg, view, roundtable, {
    provider,
    raw_response,
    actor,
    capture_method = "manual_paste",
    source_label = null,
    claimed_model = null,
    receipts = null,
    supersedes_response_id = null
  } = {}) {
    requireHuman(actor);
    assertRoundtableCanonicalInputIntegrity(input, pkg, view, roundtable, { receipts });

    const normalizedProvider = normalizeProvider(provider);
    const providerInput = providerInputFor(input, normalizedProvider);
    const exactRawResponse = exactNonEmptyText(raw_response, "raw_response");
    const method = normalizeCaptureMethod(capture_method);
    const fingerprint = fingerprintRoundtableRawResponse(exactRawResponse);
    const receipt = receiptForProvider(receipts, normalizedProvider);
    assertReceiptMatchesInput(receipt, input, providerInput);

    let superseded = null;
    if (supersedes_response_id != null) {
      superseded = await this.get(supersedes_response_id);
      if (!superseded) {
        throw new Error(`Superseded RT-02 response not found: ${supersedes_response_id}`);
      }
      assertRoundtableResponseIntegrity(superseded, input);
      if (normalizeProvider(superseded.provider) !== normalizedProvider) {
        throw new Error("RT-02 replacement response must supersede the same provider");
      }
    }

    const timestamp = nowIso(this.clock);
    const response = {
      schema_version: "0.1",
      capture_version: ROUNDTABLE_RESPONSE_CAPTURE_VERSION,
      id: makeId("rtr"),
      status: "captured_raw_uninterpreted",
      authority: "evidence_only_no_interpretation",
      project_id: input.project_id,
      roundtable_input_id: input.id,
      package_id: input.package_id,
      package_revision: input.package_revision,
      transfer_view_id: input.transfer_view_id,
      provider: normalizedProvider,
      profile: providerInput.profile,
      rendering_id: providerInput.rendering_id,
      semantic_fingerprint: deepClone(input.semantic_fingerprint),
      raw_response: exactRawResponse,
      raw_response_length: exactRawResponse.length,
      response_fingerprint: fingerprint,
      source_provenance: {
        capture_method: method,
        captured_by: actorIdentity(actor),
        source_label: optionalTrimmedString(source_label),
        claimed_provider: normalizedProvider,
        claimed_model: optionalTrimmedString(claimed_model),
        source_authenticity: "human_attested_unverified",
        provider_delivery_status: input.handoff_evidence?.delivery_status ?? null,
        handoff_receipt_id: receipt?.id ?? null
      },
      supersedes_response_id: superseded?.id ?? null,
      captured_at: timestamp,
      created_at: timestamp
    };

    assertRoundtableResponseIntegrity(response, input);
    await this.adapter.set(`${RESPONSE_PREFIX}${response.id}`, response);

    await this.auditLog?.append({
      project_id: response.project_id,
      action: "roundtable_response_captured",
      actor,
      entity_type: "roundtable_response",
      entity_id: response.id,
      metadata: {
        roundtable_input_id: response.roundtable_input_id,
        package_id: response.package_id,
        package_revision: response.package_revision,
        transfer_view_id: response.transfer_view_id,
        provider: response.provider,
        rendering_id: response.rendering_id,
        semantic_fingerprint: `${response.semantic_fingerprint.algorithm}:${response.semantic_fingerprint.value}`,
        response_fingerprint: `${response.response_fingerprint.algorithm}:${response.response_fingerprint.value}`,
        response_length: response.raw_response_length,
        capture_method: method,
        source_authenticity: response.source_provenance.source_authenticity,
        handoff_receipt_id: response.source_provenance.handoff_receipt_id,
        supersedes_response_id: response.supersedes_response_id
      }
    });

    return deepClone(response);
  }

  async get(id) {
    assertRequiredString(id, "RT-02 response id");
    return deepClone(await this.adapter.get(`${RESPONSE_PREFIX}${id}`));
  }

  async listByInput(roundtable_input_id, { provider = null } = {}) {
    assertRequiredString(roundtable_input_id, "roundtable_input_id");
    const normalizedProvider = provider == null ? null : normalizeProvider(provider);
    const rows = (await this.adapter.entries(RESPONSE_PREFIX)).map(([, value]) => value);
    return rows
      .filter((entry) => entry.roundtable_input_id === roundtable_input_id)
      .filter((entry) => normalizedProvider == null || normalizeProvider(entry.provider) === normalizedProvider)
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at))
      .map(deepClone);
  }
}
