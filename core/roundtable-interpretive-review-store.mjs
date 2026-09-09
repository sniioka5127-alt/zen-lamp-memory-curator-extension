import {
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertStorageAdapter } from "./storage.mjs";
import { assertRoundtableInterpretiveExtractionIntegrity } from "./roundtable-interpretive-extraction.mjs";

export const ROUNDTABLE_INTERPRETIVE_REVIEW_VERSION = "RT-05";

export const ROUNDTABLE_INTERPRETIVE_REVIEW_DECISION = Object.freeze([
  "accept",
  "reject",
  "hold"
]);

export const ROUNDTABLE_INTERPRETIVE_SUBJECT_TYPE = Object.freeze([
  "claim",
  "assumption",
  "conflict"
]);

const REVIEW_PREFIX = "roundtable-interpretive-review:";

function requireHuman(actor) {
  if (actor?.type !== "human") {
    throw new Error("Human Gate required: RT-05 interpretive review actions require a human actor");
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

function reviewFingerprintPayload(review) {
  return {
    review_version: review.review_version,
    status: review.status,
    revision: review.revision,
    authority: review.authority,
    review_scope: review.review_scope,
    truth_status: review.truth_status,
    final_decision_status: review.final_decision_status,
    project_id: review.project_id,
    roundtable_input_id: review.roundtable_input_id,
    comparison_id: review.comparison_id,
    extraction_id: review.extraction_id,
    package_id: review.package_id,
    package_revision: review.package_revision,
    transfer_view_id: review.transfer_view_id,
    semantic_fingerprint: review.semantic_fingerprint,
    interpretation_fingerprint: review.interpretation_fingerprint,
    source_responses: review.source_responses,
    decisions: review.decisions,
    human_gate: review.human_gate,
    supersedes_review_id: review.supersedes_review_id,
    revoked: review.revoked ?? null
  };
}

function fingerprintReview(review) {
  return {
    algorithm: "fnv1a32",
    value: fnv1a32(stableStringify(reviewFingerprintPayload(review)))
  };
}

function subjectCatalog(extraction) {
  const catalog = new Map();
  for (const claim of extraction.claims || []) {
    catalog.set(`claim:${claim.id}`, { subject_type: "claim", subject_id: claim.id, provider: claim.provider });
  }
  for (const assumption of extraction.assumptions || []) {
    catalog.set(`assumption:${assumption.id}`, { subject_type: "assumption", subject_id: assumption.id, provider: assumption.provider });
  }
  for (const conflict of extraction.conflicts || []) {
    catalog.set(`conflict:${conflict.id}`, { subject_type: "conflict", subject_id: conflict.id, provider: null });
  }
  return catalog;
}

function initialDecisions(extraction) {
  return [...subjectCatalog(extraction).values()].map((entry) => ({
    subject_type: entry.subject_type,
    subject_id: entry.subject_id,
    provider: entry.provider,
    decision: "pending",
    interpretation_effect: "not_reviewed",
    note: null,
    reviewed_by: null,
    reviewed_at: null
  }));
}

function normalizeDecision(value) {
  const decision = assertRequiredString(value, "RT-05 review decision").toLowerCase();
  if (!ROUNDTABLE_INTERPRETIVE_REVIEW_DECISION.includes(decision)) {
    throw new Error(`Unsupported RT-05 review decision: ${decision}`);
  }
  return decision;
}

function normalizeSubjectType(value) {
  const type = assertRequiredString(value, "RT-05 subject_type").toLowerCase();
  if (!ROUNDTABLE_INTERPRETIVE_SUBJECT_TYPE.includes(type)) {
    throw new Error(`Unsupported RT-05 subject_type: ${type}`);
  }
  return type;
}

function interpretationEffect(subjectType, decision) {
  if (decision === "hold") return "held_for_further_review";
  if (decision === "reject") return "rejected_as_interpretation";
  if (subjectType === "conflict") return "accepted_as_interpretive_conflict_only";
  return "accepted_for_downstream_deliberation_not_as_truth";
}

function assertSourceBinding(review, extraction, input, comparison, responses) {
  assertRoundtableInterpretiveExtractionIntegrity(extraction, input, comparison, responses);
  if (review.project_id !== extraction.project_id ||
      review.roundtable_input_id !== extraction.roundtable_input_id ||
      review.comparison_id !== extraction.comparison_id ||
      review.extraction_id !== extraction.id ||
      review.package_id !== extraction.package_id ||
      review.package_revision !== extraction.package_revision ||
      review.transfer_view_id !== extraction.transfer_view_id ||
      review.semantic_fingerprint?.algorithm !== extraction.semantic_fingerprint?.algorithm ||
      review.semantic_fingerprint?.value !== extraction.semantic_fingerprint?.value ||
      review.interpretation_fingerprint?.algorithm !== extraction.interpretation_fingerprint?.algorithm ||
      review.interpretation_fingerprint?.value !== extraction.interpretation_fingerprint?.value) {
    throw new Error("RT-05 review does not match its RT-04 interpretive source");
  }
  if (JSON.stringify(review.source_responses) !== JSON.stringify(extraction.source_responses)) {
    throw new Error("RT-05 source response bindings were modified");
  }
}

function assertDecisionCoverage(review, extraction) {
  const catalog = subjectCatalog(extraction);
  if (!Array.isArray(review.decisions) || review.decisions.length !== catalog.size) {
    throw new Error("RT-05 decision coverage does not match RT-04 subjects");
  }
  const seen = new Set();
  for (const decision of review.decisions) {
    const type = normalizeSubjectType(decision.subject_type);
    const key = `${type}:${decision.subject_id}`;
    const expected = catalog.get(key);
    if (!expected || seen.has(key)) {
      throw new Error(`RT-05 decision references an unknown or duplicate subject: ${key}`);
    }
    seen.add(key);
    if (decision.provider !== expected.provider) {
      throw new Error(`RT-05 decision provider binding was modified: ${key}`);
    }
    if (review.status === "draft_in_human_review") {
      if (decision.decision !== "pending" && !ROUNDTABLE_INTERPRETIVE_REVIEW_DECISION.includes(decision.decision)) {
        throw new Error(`RT-05 draft decision is invalid: ${key}`);
      }
    } else if (!ROUNDTABLE_INTERPRETIVE_REVIEW_DECISION.includes(decision.decision)) {
      throw new Error(`RT-05 finalized/revoked review cannot contain pending decisions: ${key}`);
    }
    if (decision.decision === "pending") {
      if (decision.interpretation_effect !== "not_reviewed") throw new Error(`RT-05 pending interpretation effect is invalid: ${key}`);
    } else if (decision.interpretation_effect !== interpretationEffect(type, decision.decision)) {
      throw new Error(`RT-05 interpretation effect was modified: ${key}`);
    }
  }
}

function summarizeDecisions(decisions) {
  const summary = {
    total: decisions.length,
    pending: 0,
    accept: 0,
    reject: 0,
    hold: 0,
    by_subject_type: {
      claim: { accept: 0, reject: 0, hold: 0, pending: 0 },
      assumption: { accept: 0, reject: 0, hold: 0, pending: 0 },
      conflict: { accept: 0, reject: 0, hold: 0, pending: 0 }
    }
  };
  for (const entry of decisions) {
    summary[entry.decision] += 1;
    summary.by_subject_type[entry.subject_type][entry.decision] += 1;
  }
  return summary;
}

export function assertRoundtableInterpretiveReviewIntegrity(review, extraction, input, comparison, responses) {
  if (!review || review.review_version !== ROUNDTABLE_INTERPRETIVE_REVIEW_VERSION) {
    throw new Error("Roundtable interpretive review was not produced by RT-05");
  }
  if (!["draft_in_human_review", "finalized_human_review", "revoked_human_review"].includes(review.status)) {
    throw new Error("RT-05 review status is invalid");
  }
  if (review.authority !== "human_reviewed_interpretation_not_truth_or_final_decision" ||
      review.review_scope !== "interpretive_structure_only" ||
      review.truth_status !== "not_evaluated" ||
      review.final_decision_status !== "not_created") {
    throw new Error("RT-05 review authority boundary was modified");
  }
  if (!Number.isInteger(review.revision) || review.revision < 1) throw new Error("RT-05 review revision is invalid");
  assertSourceBinding(review, extraction, input, comparison, responses);
  assertDecisionCoverage(review, extraction);

  const summary = summarizeDecisions(review.decisions);
  if (JSON.stringify(review.summary) !== JSON.stringify(summary)) {
    throw new Error("RT-05 review summary was modified");
  }

  if (review.human_gate?.required !== true || typeof review.human_gate?.reviewer !== "string" || !review.human_gate.reviewer) {
    throw new Error("RT-05 Human Gate metadata is invalid");
  }
  if (review.status === "draft_in_human_review") {
    if (review.human_gate.state !== "in_review" || review.human_gate.finalized_revision != null || review.human_gate.finalized_at != null) {
      throw new Error("RT-05 draft Human Gate state is invalid");
    }
  }
  if (review.status === "finalized_human_review") {
    if (review.human_gate.state !== "finalized" || review.human_gate.finalized_revision !== review.revision || !review.human_gate.finalized_at) {
      throw new Error("RT-05 finalized Human Gate must bind to the exact review revision");
    }
    if (summary.pending !== 0) throw new Error("RT-05 finalized review cannot contain pending subjects");
  }
  if (review.status === "revoked_human_review") {
    if (review.human_gate.state !== "revoked" || !review.revoked?.revoked_by || !review.revoked?.revoked_at) {
      throw new Error("RT-05 revoked Human Gate state is invalid");
    }
    if (summary.pending !== 0) throw new Error("RT-05 revoked review must originate from a fully finalized review");
  }

  const expectedFingerprint = fingerprintReview(review);
  if (review.review_fingerprint?.algorithm !== expectedFingerprint.algorithm ||
      review.review_fingerprint?.value !== expectedFingerprint.value) {
    throw new Error("RT-05 review content or Human Gate metadata was modified");
  }
  return true;
}

export function acceptedInterpretiveSubjectIds(review) {
  if (!review || !Array.isArray(review.decisions)) throw new TypeError("RT-05 review is required");
  if (review.status !== "finalized_human_review") {
    throw new Error("RT-05 accepted subject IDs are available only from a finalized Human review");
  }
  return review.decisions
    .filter((entry) => entry.decision === "accept")
    .map((entry) => ({ subject_type: entry.subject_type, subject_id: entry.subject_id }));
}

export class RoundtableInterpretiveReviewStore {
  constructor(adapter, { auditLog = null, clock = () => new Date() } = {}) {
    this.adapter = assertStorageAdapter(adapter);
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async create(extraction, input, comparison, responses, {
    actor,
    supersedes_review_id = null
  } = {}) {
    requireHuman(actor);
    assertRoundtableInterpretiveExtractionIntegrity(extraction, input, comparison, responses);

    let superseded = null;
    if (supersedes_review_id != null) {
      superseded = await this.get(supersedes_review_id);
      if (!superseded) throw new Error(`Superseded RT-05 review not found: ${supersedes_review_id}`);
      assertRoundtableInterpretiveReviewIntegrity(superseded, extraction, input, comparison, responses);
      if (!["finalized_human_review", "revoked_human_review"].includes(superseded.status)) {
        throw new Error("RT-05 can supersede only a finalized or revoked Human review");
      }
    }

    const timestamp = nowIso(this.clock);
    const review = {
      schema_version: "0.1",
      review_version: ROUNDTABLE_INTERPRETIVE_REVIEW_VERSION,
      id: makeId("rth"),
      status: "draft_in_human_review",
      revision: 1,
      authority: "human_reviewed_interpretation_not_truth_or_final_decision",
      review_scope: "interpretive_structure_only",
      truth_status: "not_evaluated",
      final_decision_status: "not_created",
      project_id: extraction.project_id,
      roundtable_input_id: extraction.roundtable_input_id,
      comparison_id: extraction.comparison_id,
      extraction_id: extraction.id,
      package_id: extraction.package_id,
      package_revision: extraction.package_revision,
      transfer_view_id: extraction.transfer_view_id,
      semantic_fingerprint: deepClone(extraction.semantic_fingerprint),
      interpretation_fingerprint: deepClone(extraction.interpretation_fingerprint),
      source_responses: deepClone(extraction.source_responses),
      decisions: initialDecisions(extraction),
      summary: null,
      human_gate: {
        required: true,
        state: "in_review",
        reviewer: actorIdentity(actor),
        finalized_revision: null,
        finalized_at: null
      },
      supersedes_review_id: superseded?.id ?? null,
      revoked: null,
      created_at: timestamp,
      updated_at: timestamp
    };
    review.summary = summarizeDecisions(review.decisions);
    review.review_fingerprint = fingerprintReview(review);
    assertRoundtableInterpretiveReviewIntegrity(review, extraction, input, comparison, responses);
    await this.adapter.set(`${REVIEW_PREFIX}${review.id}`, review);

    await this.auditLog?.append({
      project_id: review.project_id,
      action: "roundtable_interpretive_review_started",
      actor,
      entity_type: "roundtable_interpretive_review",
      entity_id: review.id,
      metadata: {
        roundtable_input_id: review.roundtable_input_id,
        comparison_id: review.comparison_id,
        extraction_id: review.extraction_id,
        interpretation_fingerprint: `${review.interpretation_fingerprint.algorithm}:${review.interpretation_fingerprint.value}`,
        subject_count: review.summary.total,
        supersedes_review_id: review.supersedes_review_id
      }
    });
    return deepClone(review);
  }

  async setDecision(id, extraction, input, comparison, responses, {
    subject_type,
    subject_id,
    decision,
    note = null,
    actor
  } = {}) {
    requireHuman(actor);
    const review = await this.get(id);
    if (!review) throw new Error(`RT-05 review not found: ${id}`);
    assertRoundtableInterpretiveReviewIntegrity(review, extraction, input, comparison, responses);
    if (review.status !== "draft_in_human_review") {
      throw new Error("RT-05 finalized/revoked review is immutable; create a superseding review instead");
    }

    const type = normalizeSubjectType(subject_type);
    const subjectId = assertRequiredString(subject_id, "RT-05 subject_id");
    const normalizedDecision = normalizeDecision(decision);
    const entry = review.decisions.find((row) => row.subject_type === type && row.subject_id === subjectId);
    if (!entry) throw new Error(`RT-05 review subject not found: ${type}:${subjectId}`);

    entry.decision = normalizedDecision;
    entry.interpretation_effect = interpretationEffect(type, normalizedDecision);
    entry.note = optionalText(note);
    entry.reviewed_by = actorIdentity(actor);
    entry.reviewed_at = nowIso(this.clock);
    review.revision += 1;
    review.updated_at = entry.reviewed_at;
    review.summary = summarizeDecisions(review.decisions);
    review.review_fingerprint = fingerprintReview(review);
    assertRoundtableInterpretiveReviewIntegrity(review, extraction, input, comparison, responses);
    await this.adapter.set(`${REVIEW_PREFIX}${review.id}`, review);

    await this.auditLog?.append({
      project_id: review.project_id,
      action: "roundtable_interpretive_review_item_recorded",
      actor,
      entity_type: "roundtable_interpretive_review",
      entity_id: review.id,
      metadata: {
        extraction_id: review.extraction_id,
        review_revision: review.revision,
        subject_type: type,
        subject_id: subjectId,
        review_decision: normalizedDecision
      }
    });
    return deepClone(review);
  }

  async finalize(id, extraction, input, comparison, responses, { actor } = {}) {
    requireHuman(actor);
    const review = await this.get(id);
    if (!review) throw new Error(`RT-05 review not found: ${id}`);
    assertRoundtableInterpretiveReviewIntegrity(review, extraction, input, comparison, responses);
    if (review.status !== "draft_in_human_review") throw new Error("RT-05 review is not in draft Human review state");
    if (review.summary.pending !== 0) throw new Error("RT-05 cannot finalize while Claim / Assumption / Conflict decisions remain pending");

    const timestamp = nowIso(this.clock);
    review.status = "finalized_human_review";
    review.revision += 1;
    review.human_gate.state = "finalized";
    review.human_gate.finalized_revision = review.revision;
    review.human_gate.finalized_at = timestamp;
    review.updated_at = timestamp;
    review.review_fingerprint = fingerprintReview(review);
    assertRoundtableInterpretiveReviewIntegrity(review, extraction, input, comparison, responses);
    await this.adapter.set(`${REVIEW_PREFIX}${review.id}`, review);

    await this.auditLog?.append({
      project_id: review.project_id,
      action: "roundtable_interpretive_review_finalized",
      actor,
      entity_type: "roundtable_interpretive_review",
      entity_id: review.id,
      metadata: {
        roundtable_input_id: review.roundtable_input_id,
        comparison_id: review.comparison_id,
        extraction_id: review.extraction_id,
        review_revision: review.revision,
        review_fingerprint: `${review.review_fingerprint.algorithm}:${review.review_fingerprint.value}`,
        accepted_count: review.summary.accept,
        rejected_count: review.summary.reject,
        held_count: review.summary.hold,
        truth_status: review.truth_status,
        final_decision_status: review.final_decision_status
      }
    });
    return deepClone(review);
  }

  async revoke(id, extraction, input, comparison, responses, {
    actor,
    reason = null
  } = {}) {
    requireHuman(actor);
    const review = await this.get(id);
    if (!review) throw new Error(`RT-05 review not found: ${id}`);
    assertRoundtableInterpretiveReviewIntegrity(review, extraction, input, comparison, responses);
    if (review.status !== "finalized_human_review") throw new Error("Only a finalized RT-05 Human review can be revoked");

    const timestamp = nowIso(this.clock);
    review.status = "revoked_human_review";
    review.revision += 1;
    review.human_gate.state = "revoked";
    review.revoked = {
      revoked_by: actorIdentity(actor),
      revoked_at: timestamp,
      reason: optionalText(reason)
    };
    review.updated_at = timestamp;
    review.review_fingerprint = fingerprintReview(review);
    assertRoundtableInterpretiveReviewIntegrity(review, extraction, input, comparison, responses);
    await this.adapter.set(`${REVIEW_PREFIX}${review.id}`, review);

    await this.auditLog?.append({
      project_id: review.project_id,
      action: "roundtable_interpretive_review_revoked",
      actor,
      entity_type: "roundtable_interpretive_review",
      entity_id: review.id,
      metadata: {
        extraction_id: review.extraction_id,
        review_revision: review.revision,
        review_fingerprint: `${review.review_fingerprint.algorithm}:${review.review_fingerprint.value}`,
        reason_present: Boolean(review.revoked.reason)
      }
    });
    return deepClone(review);
  }

  async get(id) {
    assertRequiredString(id, "RT-05 review id");
    return deepClone(await this.adapter.get(`${REVIEW_PREFIX}${id}`));
  }

  async listByExtraction(extraction_id) {
    assertRequiredString(extraction_id, "extraction_id");
    const rows = (await this.adapter.entries(REVIEW_PREFIX)).map(([, value]) => value);
    return rows
      .filter((review) => review.extraction_id === extraction_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(deepClone);
  }
}
