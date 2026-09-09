import {
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertStorageAdapter } from "./storage.mjs";
import { assertRoundtableInterpretiveReviewIntegrity } from "./roundtable-interpretive-review-store.mjs";

export const HUMAN_DECISION_RECORD_VERSION = "HG-01";

export const HUMAN_DECISION_DISPOSITION = Object.freeze([
  "pending",
  "decided",
  "deferred",
  "no_action"
]);

export const HUMAN_DECISION_STATUS = Object.freeze([
  "draft_human_decision",
  "finalized_human_decision",
  "revoked_human_decision"
]);

const DECISION_PREFIX = "human-decision-record:";

function requireHuman(actor) {
  if (actor?.type !== "human") {
    throw new Error("Human Gate required: HG-01 Human Decision actions require a human actor");
  }
}

function actorIdentity(actor) {
  return actor?.id ?? actor?.name ?? "human";
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeTextList(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const text = optionalText(raw);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function normalizeDisposition(value, { allowPending = true } = {}) {
  const disposition = assertRequiredString(value ?? "pending", "HG-01 disposition").toLowerCase();
  if (!HUMAN_DECISION_DISPOSITION.includes(disposition) || (!allowPending && disposition === "pending")) {
    throw new Error(`Unsupported HG-01 disposition: ${disposition}`);
  }
  return disposition;
}

function normalizeRevisit(value = {}) {
  if (value == null) value = {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("revisit must be an object");
  return {
    trigger: optionalText(value.trigger),
    at: optionalText(value.at)
  };
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

function decisionFingerprintPayload(record) {
  return {
    decision_version: record.decision_version,
    status: record.status,
    revision: record.revision,
    authority: record.authority,
    decision_scope: record.decision_scope,
    truth_status: record.truth_status,
    execution_status: record.execution_status,
    project_id: record.project_id,
    roundtable_input_id: record.roundtable_input_id,
    comparison_id: record.comparison_id,
    extraction_id: record.extraction_id,
    review_id: record.review_id,
    review_revision: record.review_revision,
    package_id: record.package_id,
    package_revision: record.package_revision,
    transfer_view_id: record.transfer_view_id,
    semantic_fingerprint: record.semantic_fingerprint,
    interpretation_fingerprint: record.interpretation_fingerprint,
    review_fingerprint: record.review_fingerprint,
    decision_question: record.decision_question,
    disposition: record.disposition,
    decision_text: record.decision_text,
    rationale: record.rationale,
    supporting_subject_refs: record.supporting_subject_refs,
    alternatives_considered: record.alternatives_considered,
    unresolved_questions: record.unresolved_questions,
    conditions: record.conditions,
    revisit: record.revisit,
    human_gate: record.human_gate,
    supersedes_decision_id: record.supersedes_decision_id,
    revoked: record.revoked ?? null
  };
}

function fingerprintDecision(record) {
  return {
    algorithm: "fnv1a32",
    value: fnv1a32(stableStringify(decisionFingerprintPayload(record)))
  };
}

function reviewDecisionMap(review) {
  return new Map((review.decisions || []).map((entry) => [
    `${entry.subject_type}:${entry.subject_id}`,
    entry
  ]));
}

function normalizeSupportingRefs(refs = [], review) {
  if (!Array.isArray(refs)) throw new TypeError("supporting_subject_refs must be an array");
  const catalog = reviewDecisionMap(review);
  const seen = new Set();
  const out = [];
  for (const raw of refs) {
    const subject_type = assertRequiredString(raw?.subject_type, "supporting subject_type").toLowerCase();
    const subject_id = assertRequiredString(raw?.subject_id, "supporting subject_id");
    const key = `${subject_type}:${subject_id}`;
    if (seen.has(key)) throw new Error(`Duplicate HG-01 supporting subject reference: ${key}`);
    seen.add(key);
    const reviewed = catalog.get(key);
    if (!reviewed) throw new Error(`HG-01 supporting subject was not reviewed in RT-05: ${key}`);
    if (reviewed.decision !== "accept") {
      throw new Error(`HG-01 supporting subject must be Human-accepted in RT-05: ${key}`);
    }
    out.push({
      subject_type,
      subject_id,
      provider: reviewed.provider ?? null,
      review_decision: reviewed.decision
    });
  }
  return out;
}

function assertFinalizedReview(review, extraction, input, comparison, responses) {
  if (review?.status !== "finalized_human_review" || review?.human_gate?.state !== "finalized") {
    throw new Error("HG-01 requires an active finalized RT-05 Human review");
  }
  assertRoundtableInterpretiveReviewIntegrity(review, extraction, input, comparison, responses);
  return true;
}

function assertSourceBinding(record, review, extraction, input, comparison, responses) {
  assertFinalizedReview(review, extraction, input, comparison, responses);
  if (record.project_id !== review.project_id ||
      record.roundtable_input_id !== review.roundtable_input_id ||
      record.comparison_id !== review.comparison_id ||
      record.extraction_id !== review.extraction_id ||
      record.review_id !== review.id ||
      record.review_revision !== review.revision ||
      record.package_id !== review.package_id ||
      record.package_revision !== review.package_revision ||
      record.transfer_view_id !== review.transfer_view_id ||
      record.semantic_fingerprint?.algorithm !== review.semantic_fingerprint?.algorithm ||
      record.semantic_fingerprint?.value !== review.semantic_fingerprint?.value ||
      record.interpretation_fingerprint?.algorithm !== review.interpretation_fingerprint?.algorithm ||
      record.interpretation_fingerprint?.value !== review.interpretation_fingerprint?.value ||
      record.review_fingerprint?.algorithm !== review.review_fingerprint?.algorithm ||
      record.review_fingerprint?.value !== review.review_fingerprint?.value) {
    throw new Error("HG-01 decision record does not match its finalized RT-05 source");
  }
}

function assertSupportingRefs(record, review) {
  const normalized = normalizeSupportingRefs(record.supporting_subject_refs || [], review);
  if (JSON.stringify(normalized) !== JSON.stringify(record.supporting_subject_refs || [])) {
    throw new Error("HG-01 supporting subject references were modified");
  }
}

function assertFinalContent(record) {
  if (record.disposition === "pending") {
    throw new Error("HG-01 finalized decision cannot remain pending");
  }
  assertRequiredString(record.decision_text, "HG-01 decision_text");
  assertRequiredString(record.rationale, "HG-01 rationale");
  if (record.disposition === "deferred" && !record.revisit?.trigger && !record.revisit?.at) {
    throw new Error("HG-01 deferred decision requires a revisit trigger or time");
  }
}

export function assertHumanDecisionRecordIntegrity(record, review, extraction, input, comparison, responses) {
  if (!record || record.decision_version !== HUMAN_DECISION_RECORD_VERSION) {
    throw new Error("Human Decision Record was not produced by HG-01");
  }
  if (!HUMAN_DECISION_STATUS.includes(record.status)) throw new Error("HG-01 decision status is invalid");
  if (record.authority !== "human_authored_decision_record" ||
      record.decision_scope !== "human_judgment_only" ||
      record.truth_status !== "not_independently_verified" ||
      record.execution_status !== "not_executed_by_hg01") {
    throw new Error("HG-01 Human authority boundary was modified");
  }
  if (!Number.isInteger(record.revision) || record.revision < 1) throw new Error("HG-01 decision revision is invalid");
  assertRequiredString(record.decision_question, "HG-01 decision_question");
  normalizeDisposition(record.disposition);
  normalizeTextList(record.alternatives_considered, "alternatives_considered");
  normalizeTextList(record.unresolved_questions, "unresolved_questions");
  normalizeTextList(record.conditions, "conditions");
  const revisit = normalizeRevisit(record.revisit);
  if (JSON.stringify(revisit) !== JSON.stringify(record.revisit)) throw new Error("HG-01 revisit metadata was modified");

  assertSourceBinding(record, review, extraction, input, comparison, responses);
  assertSupportingRefs(record, review);

  if (record.human_gate?.required !== true || typeof record.human_gate?.owner !== "string" || !record.human_gate.owner) {
    throw new Error("HG-01 Human Gate metadata is invalid");
  }
  if (record.status === "draft_human_decision") {
    if (record.human_gate.state !== "draft" || record.human_gate.finalized_revision != null || record.human_gate.finalized_at != null) {
      throw new Error("HG-01 draft Human Gate state is invalid");
    }
  }
  if (record.status === "finalized_human_decision") {
    assertFinalContent(record);
    if (record.human_gate.state !== "finalized" ||
        record.human_gate.finalized_revision !== record.revision ||
        !record.human_gate.finalized_at ||
        !record.human_gate.finalized_by) {
      throw new Error("HG-01 finalized Human Gate must bind to the exact decision revision");
    }
  }
  if (record.status === "revoked_human_decision") {
    assertFinalContent(record);
    if (record.human_gate.state !== "revoked" || !record.revoked?.revoked_by || !record.revoked?.revoked_at) {
      throw new Error("HG-01 revoked Human Gate state is invalid");
    }
  }

  const expectedFingerprint = fingerprintDecision(record);
  if (record.decision_fingerprint?.algorithm !== expectedFingerprint.algorithm ||
      record.decision_fingerprint?.value !== expectedFingerprint.value) {
    throw new Error("HG-01 decision content or Human Gate metadata was modified");
  }
  return true;
}

export function assertFinalHumanDecisionRecord(record, review, extraction, input, comparison, responses) {
  assertHumanDecisionRecordIntegrity(record, review, extraction, input, comparison, responses);
  if (record.status !== "finalized_human_decision" || record.human_gate?.state !== "finalized") {
    throw new Error("HG-01 Human Decision Record is not finalized and active");
  }
  return true;
}

function assertStoredDecisionSelfIntegrity(record) {
  if (!record || record.decision_version !== HUMAN_DECISION_RECORD_VERSION) throw new Error("Superseded HG-01 record is invalid");
  if (!HUMAN_DECISION_STATUS.includes(record.status)) throw new Error("Superseded HG-01 record has invalid status");
  const expected = fingerprintDecision(record);
  if (record.decision_fingerprint?.algorithm !== expected.algorithm || record.decision_fingerprint?.value !== expected.value) {
    throw new Error("Superseded HG-01 record failed mutation detection");
  }
  return true;
}

export class HumanDecisionRecordStore {
  constructor(adapter, { auditLog = null, clock = () => new Date() } = {}) {
    this.adapter = assertStorageAdapter(adapter);
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async create(review, extraction, input, comparison, responses, {
    actor,
    decision_question,
    supersedes_decision_id = null
  } = {}) {
    requireHuman(actor);
    assertFinalizedReview(review, extraction, input, comparison, responses);

    let superseded = null;
    if (supersedes_decision_id != null) {
      superseded = await this.get(supersedes_decision_id);
      if (!superseded) throw new Error(`Superseded HG-01 decision not found: ${supersedes_decision_id}`);
      assertStoredDecisionSelfIntegrity(superseded);
      if (!["finalized_human_decision", "revoked_human_decision"].includes(superseded.status)) {
        throw new Error("HG-01 can supersede only a finalized or revoked Human Decision Record");
      }
      if (superseded.project_id !== review.project_id) {
        throw new Error("HG-01 superseding decision must remain in the same Human Project");
      }
    }

    const timestamp = nowIso(this.clock);
    const record = {
      schema_version: "0.1",
      decision_version: HUMAN_DECISION_RECORD_VERSION,
      id: makeId("hdr"),
      status: "draft_human_decision",
      revision: 1,
      authority: "human_authored_decision_record",
      decision_scope: "human_judgment_only",
      truth_status: "not_independently_verified",
      execution_status: "not_executed_by_hg01",
      project_id: review.project_id,
      roundtable_input_id: review.roundtable_input_id,
      comparison_id: review.comparison_id,
      extraction_id: review.extraction_id,
      review_id: review.id,
      review_revision: review.revision,
      package_id: review.package_id,
      package_revision: review.package_revision,
      transfer_view_id: review.transfer_view_id,
      semantic_fingerprint: deepClone(review.semantic_fingerprint),
      interpretation_fingerprint: deepClone(review.interpretation_fingerprint),
      review_fingerprint: deepClone(review.review_fingerprint),
      decision_question: assertRequiredString(decision_question, "HG-01 decision_question"),
      disposition: "pending",
      decision_text: null,
      rationale: null,
      supporting_subject_refs: [],
      alternatives_considered: [],
      unresolved_questions: [],
      conditions: [],
      revisit: { trigger: null, at: null },
      human_gate: {
        required: true,
        state: "draft",
        owner: actorIdentity(actor),
        finalized_revision: null,
        finalized_at: null,
        finalized_by: null
      },
      supersedes_decision_id: superseded?.id ?? null,
      revoked: null,
      created_at: timestamp,
      updated_at: timestamp
    };
    record.decision_fingerprint = fingerprintDecision(record);
    assertHumanDecisionRecordIntegrity(record, review, extraction, input, comparison, responses);
    await this.adapter.set(`${DECISION_PREFIX}${record.id}`, record);

    await this.auditLog?.append({
      project_id: record.project_id,
      action: "human_decision_started",
      actor,
      entity_type: "human_decision_record",
      entity_id: record.id,
      metadata: {
        review_id: record.review_id,
        review_revision: record.review_revision,
        review_fingerprint: `${record.review_fingerprint.algorithm}:${record.review_fingerprint.value}`,
        supersedes_decision_id: record.supersedes_decision_id
      }
    });
    return deepClone(record);
  }

  async update(id, review, extraction, input, comparison, responses, patch = {}, { actor } = {}) {
    requireHuman(actor);
    const record = await this.get(id);
    if (!record) throw new Error(`HG-01 decision not found: ${id}`);
    assertHumanDecisionRecordIntegrity(record, review, extraction, input, comparison, responses);
    if (record.status !== "draft_human_decision") {
      throw new Error("HG-01 finalized/revoked decisions are immutable; create a superseding decision instead");
    }

    if (patch.decision_question != null) {
      record.decision_question = assertRequiredString(patch.decision_question, "HG-01 decision_question");
    }
    if (patch.disposition != null) record.disposition = normalizeDisposition(patch.disposition);
    if (Object.prototype.hasOwnProperty.call(patch, "decision_text")) record.decision_text = optionalText(patch.decision_text);
    if (Object.prototype.hasOwnProperty.call(patch, "rationale")) record.rationale = optionalText(patch.rationale);
    if (patch.supporting_subject_refs != null) record.supporting_subject_refs = normalizeSupportingRefs(patch.supporting_subject_refs, review);
    if (patch.alternatives_considered != null) record.alternatives_considered = normalizeTextList(patch.alternatives_considered, "alternatives_considered");
    if (patch.unresolved_questions != null) record.unresolved_questions = normalizeTextList(patch.unresolved_questions, "unresolved_questions");
    if (patch.conditions != null) record.conditions = normalizeTextList(patch.conditions, "conditions");
    if (patch.revisit != null) record.revisit = normalizeRevisit(patch.revisit);

    record.revision += 1;
    record.updated_at = nowIso(this.clock);
    record.decision_fingerprint = fingerprintDecision(record);
    assertHumanDecisionRecordIntegrity(record, review, extraction, input, comparison, responses);
    await this.adapter.set(`${DECISION_PREFIX}${record.id}`, record);

    await this.auditLog?.append({
      project_id: record.project_id,
      action: "human_decision_updated",
      actor,
      entity_type: "human_decision_record",
      entity_id: record.id,
      metadata: {
        review_id: record.review_id,
        decision_revision: record.revision,
        disposition: record.disposition,
        supporting_subject_count: record.supporting_subject_refs.length,
        alternative_count: record.alternatives_considered.length,
        unresolved_count: record.unresolved_questions.length,
        condition_count: record.conditions.length
      }
    });
    return deepClone(record);
  }

  async finalize(id, review, extraction, input, comparison, responses, { actor } = {}) {
    requireHuman(actor);
    const record = await this.get(id);
    if (!record) throw new Error(`HG-01 decision not found: ${id}`);
    assertHumanDecisionRecordIntegrity(record, review, extraction, input, comparison, responses);
    if (record.status !== "draft_human_decision") throw new Error("HG-01 decision is not in draft state");
    assertFinalContent(record);

    const timestamp = nowIso(this.clock);
    record.status = "finalized_human_decision";
    record.revision += 1;
    record.human_gate.state = "finalized";
    record.human_gate.finalized_revision = record.revision;
    record.human_gate.finalized_at = timestamp;
    record.human_gate.finalized_by = actorIdentity(actor);
    record.updated_at = timestamp;
    record.decision_fingerprint = fingerprintDecision(record);
    assertFinalHumanDecisionRecord(record, review, extraction, input, comparison, responses);
    await this.adapter.set(`${DECISION_PREFIX}${record.id}`, record);

    await this.auditLog?.append({
      project_id: record.project_id,
      action: "human_decision_finalized",
      actor,
      entity_type: "human_decision_record",
      entity_id: record.id,
      metadata: {
        review_id: record.review_id,
        review_revision: record.review_revision,
        decision_revision: record.revision,
        decision_fingerprint: `${record.decision_fingerprint.algorithm}:${record.decision_fingerprint.value}`,
        disposition: record.disposition,
        supporting_subject_count: record.supporting_subject_refs.length,
        execution_status: record.execution_status
      }
    });
    return deepClone(record);
  }

  async revoke(id, review, extraction, input, comparison, responses, {
    actor,
    reason = null
  } = {}) {
    requireHuman(actor);
    const record = await this.get(id);
    if (!record) throw new Error(`HG-01 decision not found: ${id}`);
    assertFinalHumanDecisionRecord(record, review, extraction, input, comparison, responses);

    const timestamp = nowIso(this.clock);
    record.status = "revoked_human_decision";
    record.revision += 1;
    record.human_gate.state = "revoked";
    record.revoked = {
      revoked_by: actorIdentity(actor),
      revoked_at: timestamp,
      reason: optionalText(reason)
    };
    record.updated_at = timestamp;
    record.decision_fingerprint = fingerprintDecision(record);
    assertHumanDecisionRecordIntegrity(record, review, extraction, input, comparison, responses);
    await this.adapter.set(`${DECISION_PREFIX}${record.id}`, record);

    await this.auditLog?.append({
      project_id: record.project_id,
      action: "human_decision_revoked",
      actor,
      entity_type: "human_decision_record",
      entity_id: record.id,
      metadata: {
        review_id: record.review_id,
        decision_revision: record.revision,
        decision_fingerprint: `${record.decision_fingerprint.algorithm}:${record.decision_fingerprint.value}`,
        reason_present: Boolean(record.revoked.reason)
      }
    });
    return deepClone(record);
  }

  async get(id) {
    assertRequiredString(id, "HG-01 decision id");
    return deepClone(await this.adapter.get(`${DECISION_PREFIX}${id}`));
  }

  async listByProject(project_id) {
    assertRequiredString(project_id, "project_id");
    const rows = (await this.adapter.entries(DECISION_PREFIX)).map(([, value]) => value);
    return rows
      .filter((record) => record.project_id === project_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(deepClone);
  }

  async listByReview(review_id) {
    assertRequiredString(review_id, "review_id");
    const rows = (await this.adapter.entries(DECISION_PREFIX)).map(([, value]) => value);
    return rows
      .filter((record) => record.review_id === review_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(deepClone);
  }
}
