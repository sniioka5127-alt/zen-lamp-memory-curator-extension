import {
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertRoundtableComparisonIntegrity } from "./roundtable-comparison-engine.mjs";
import { assertRoundtableResponseIntegrity } from "./roundtable-response-store.mjs";

export const ROUNDTABLE_INTERPRETIVE_EXTRACTION_VERSION = "RT-04";
export const ROUNDTABLE_INTERPRETIVE_CONTRACT_VERSION = "rt-04-proposal-v0.1";

export const ROUNDTABLE_CONFLICT_TYPE = Object.freeze([
  "potential_direct_conflict",
  "different_assumption",
  "scope_difference",
  "priority_difference",
  "definition_difference",
  "unclear"
]);

const FORBIDDEN_DECISION_FIELDS = new Set([
  "winner",
  "decision",
  "truth",
  "majority_choice",
  "model_ranking",
  "recommended_provider",
  "best_provider",
  "correct_provider",
  "final_answer"
]);

function normalizeProvider(value) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("provider must be a non-empty string");
  return value.trim().toLowerCase();
}

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
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

function assertNoDecisionFields(value, path = "proposal") {
  if (!value || typeof value !== "object") return true;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_DECISION_FIELDS.has(key)) {
      throw new Error(`RT-04 interpretive proposal must not contain decision field: ${path}.${key}`);
    }
    assertNoDecisionFields(nested, `${path}.${key}`);
  }
  return true;
}

function responseSet(input, responses) {
  if (!input || input.input_version !== "RT-01" || input.status !== "prepared_not_executed") {
    throw new Error("RT-04 requires an intact RT-01 canonical input");
  }
  if (!Array.isArray(responses) || responses.length !== input.providers.length) {
    throw new Error("RT-04 requires exactly one RT-02 response for every RT-01 provider");
  }
  const map = new Map();
  for (const response of responses) {
    assertRoundtableResponseIntegrity(response, input);
    const provider = normalizeProvider(response.provider);
    if (map.has(provider)) throw new Error(`RT-04 received duplicate provider response: ${provider}`);
    map.set(provider, response);
  }
  const configured = input.providers.map(normalizeProvider);
  if (configured.some((provider) => !map.has(provider)) || map.size !== configured.length) {
    throw new Error("RT-04 response coverage does not match RT-01 providers");
  }
  return { configured, map };
}

function assertSources(input, comparison, responses) {
  assertRoundtableComparisonIntegrity(comparison, input, responses);
  const set = responseSet(input, responses);
  if (comparison.roundtable_input_id !== input.id || comparison.status !== "compared_not_decided") {
    throw new Error("RT-04 requires an intact RT-03 compared_not_decided source");
  }
  return set;
}

function extractJsonObject(text) {
  if (typeof text !== "string" || !text.trim()) throw new TypeError("RT-04 proposal text is required");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("RT-04 proposal does not contain a JSON object");
  return JSON.parse(candidate.slice(first, last + 1));
}

export function parseRoundtableInterpretiveProposal(text) {
  return extractJsonObject(text);
}

function locateQuote(rawResponse, evidence, provider) {
  if (!evidence || typeof evidence !== "object") throw new TypeError("RT-04 evidence entry must be an object");
  const quote = typeof evidence.quote === "string" ? evidence.quote : "";
  if (!quote.trim()) throw new TypeError("RT-04 evidence.quote must be a non-empty exact excerpt");

  const starts = [];
  let from = 0;
  while (from <= rawResponse.length - quote.length) {
    const index = rawResponse.indexOf(quote, from);
    if (index < 0) break;
    starts.push(index);
    from = index + Math.max(quote.length, 1);
  }
  if (!starts.length) throw new Error(`RT-04 evidence quote was not found verbatim in ${provider} raw response`);

  let occurrence = evidence.occurrence == null ? null : Number(evidence.occurrence);
  if (starts.length > 1 && occurrence == null) {
    throw new Error(`RT-04 evidence quote is ambiguous in ${provider}; occurrence is required`);
  }
  if (occurrence == null) occurrence = 1;
  if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > starts.length) {
    throw new Error(`RT-04 evidence occurrence is invalid for ${provider}`);
  }
  const start = starts[occurrence - 1];
  return {
    response_id: null,
    provider,
    start,
    end: start + quote.length,
    quote,
    occurrence,
    match_count: starts.length
  };
}

function normalizeEvidence(entries, provider, response) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error(`RT-04 ${provider} claim/assumption requires at least one verbatim evidence quote`);
  }
  return entries.map((entry) => {
    const located = locateQuote(response.raw_response, entry, provider);
    located.response_id = response.id;
    return located;
  });
}

function normalizeProposalItem(item, type, index, responseMap, externalRefs) {
  if (!item || typeof item !== "object") throw new TypeError(`RT-04 ${type} proposal must be an object`);
  const externalId = requiredText(item.id, `${type}.id`);
  if (externalRefs.has(externalId)) throw new Error(`RT-04 proposal id must be unique: ${externalId}`);
  const provider = normalizeProvider(item.provider);
  const response = responseMap.get(provider);
  if (!response) throw new Error(`RT-04 ${type} references provider outside RT-01: ${provider}`);
  const normalized = {
    id: `${type}_${String(index + 1).padStart(3, "0")}`,
    proposal_source_id: externalId,
    provider,
    statement: requiredText(item.statement, `${type}.statement`),
    evidence: normalizeEvidence(item.evidence, provider, response),
    interpretation_status: "proposed_not_validated"
  };
  externalRefs.set(externalId, { id: normalized.id, provider, type });
  return normalized;
}

function normalizeRefList(values, name, externalRefs, provider, expectedType) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  return values.map((value) => {
    const externalId = requiredText(value, name);
    const ref = externalRefs.get(externalId);
    if (!ref) throw new Error(`RT-04 conflict references unknown proposal id: ${externalId}`);
    if (ref.provider !== provider) {
      throw new Error(`RT-04 conflict side ${provider} cannot reference ${ref.provider} proposal: ${externalId}`);
    }
    if (ref.type !== expectedType) {
      throw new Error(`RT-04 conflict ${name} references wrong proposal type: ${externalId}`);
    }
    return ref.id;
  });
}

function normalizeConflict(conflict, index, responseMap, externalRefs, seenConflictIds) {
  if (!conflict || typeof conflict !== "object") throw new TypeError("RT-04 conflict proposal must be an object");
  const externalId = requiredText(conflict.id, "conflict.id");
  if (seenConflictIds.has(externalId) || externalRefs.has(externalId)) {
    throw new Error(`RT-04 proposal id must be unique: ${externalId}`);
  }
  seenConflictIds.add(externalId);
  const conflictType = requiredText(conflict.conflict_type, "conflict.conflict_type");
  if (!ROUNDTABLE_CONFLICT_TYPE.includes(conflictType)) {
    throw new Error(`Unsupported RT-04 conflict_type: ${conflictType}`);
  }
  if (!Array.isArray(conflict.sides) || conflict.sides.length < 2) {
    throw new Error("RT-04 conflict requires at least two provider sides");
  }

  const seenProviders = new Set();
  const sides = conflict.sides.map((side) => {
    const provider = normalizeProvider(side?.provider);
    if (!responseMap.has(provider)) throw new Error(`RT-04 conflict provider is outside RT-01: ${provider}`);
    if (seenProviders.has(provider)) throw new Error(`RT-04 conflict has duplicate provider side: ${provider}`);
    seenProviders.add(provider);
    const claimRefs = normalizeRefList(side.claim_ids, "conflict.claim_ids", externalRefs, provider, "claim");
    const assumptionRefs = normalizeRefList(side.assumption_ids, "conflict.assumption_ids", externalRefs, provider, "assumption");
    if (!claimRefs.length && !assumptionRefs.length) {
      throw new Error(`RT-04 conflict side requires at least one claim or assumption reference: ${provider}`);
    }
    return {
      provider,
      claim_ids: claimRefs,
      assumption_ids: assumptionRefs
    };
  });

  return {
    id: `conflict_${String(index + 1).padStart(3, "0")}`,
    proposal_source_id: externalId,
    topic: requiredText(conflict.topic, "conflict.topic"),
    conflict_type: conflictType,
    reason: requiredText(conflict.reason, "conflict.reason"),
    sides,
    resolution: "unresolved",
    truth_status: "not_evaluated",
    interpretation_status: "proposed_not_validated"
  };
}

function proposalCoreFingerprint(extraction) {
  const payload = {
    roundtable_input_id: extraction.roundtable_input_id,
    comparison_id: extraction.comparison_id,
    package_revision: extraction.package_revision,
    semantic_fingerprint: extraction.semantic_fingerprint,
    source_responses: extraction.source_responses,
    claims: extraction.claims,
    assumptions: extraction.assumptions,
    conflicts: extraction.conflicts,
    human_review: extraction.human_review,
    provenance: extraction.provenance
  };
  const serialized = stableStringify(payload);
  return {
    algorithm: "fnv1a32",
    value: fnv1a32(serialized)
  };
}

function validateProposalSourceEcho(proposal, input, comparison) {
  if (proposal.contract_version !== ROUNDTABLE_INTERPRETIVE_CONTRACT_VERSION) {
    throw new Error(`RT-04 proposal contract_version must be ${ROUNDTABLE_INTERPRETIVE_CONTRACT_VERSION}`);
  }
  if (proposal.roundtable_input_id !== input.id || proposal.comparison_id !== comparison.id) {
    throw new Error("RT-04 proposal source IDs do not match RT-01 / RT-03");
  }
  const fingerprint = proposal.semantic_fingerprint;
  if (fingerprint?.algorithm !== input.semantic_fingerprint?.algorithm ||
      fingerprint?.value !== input.semantic_fingerprint?.value) {
    throw new Error("RT-04 proposal semantic fingerprint does not match RT-01");
  }
}

export function normalizeRoundtableInterpretiveProposal(input, comparison, responses, proposal, {
  extractor_label = null
} = {}) {
  const { configured, map } = assertSources(input, comparison, responses);
  if (!proposal || typeof proposal !== "object") throw new TypeError("RT-04 proposal object is required");
  assertNoDecisionFields(proposal);
  validateProposalSourceEcho(proposal, input, comparison);

  const claimsInput = Array.isArray(proposal.claims) ? proposal.claims : [];
  const assumptionsInput = Array.isArray(proposal.assumptions) ? proposal.assumptions : [];
  const conflictsInput = Array.isArray(proposal.conflicts) ? proposal.conflicts : [];

  const externalRefs = new Map();
  const claims = claimsInput.map((item, index) => normalizeProposalItem(item, "claim", index, map, externalRefs));
  const assumptions = assumptionsInput.map((item, index) => normalizeProposalItem(item, "assumption", index, map, externalRefs));
  const seenConflictIds = new Set();
  const conflicts = conflictsInput.map((item, index) => normalizeConflict(item, index, map, externalRefs, seenConflictIds));

  const extraction = {
    schema_version: "0.1",
    extraction_version: ROUNDTABLE_INTERPRETIVE_EXTRACTION_VERSION,
    id: makeId("rtx"),
    status: "proposed_not_human_reviewed",
    authority: "interpretive_proposal_only",
    project_id: input.project_id,
    roundtable_input_id: input.id,
    comparison_id: comparison.id,
    package_id: input.package_id,
    package_revision: input.package_revision,
    transfer_view_id: input.transfer_view_id,
    providers: configured,
    semantic_fingerprint: deepClone(input.semantic_fingerprint),
    source_responses: configured.map((provider) => {
      const response = map.get(provider);
      return {
        provider,
        response_id: response.id,
        response_fingerprint: deepClone(response.response_fingerprint),
        rendering_id: response.rendering_id
      };
    }),
    claims,
    assumptions,
    conflicts,
    human_review: {
      required: true,
      state: "pending",
      note: "Claims, assumptions, and conflicts are interpretive proposals. Human review is required before any downstream adoption."
    },
    provenance: {
      method: "external_interpretive_output_import",
      extractor_label: optionalText(extractor_label),
      source_authenticity: "unverified_interpretive_output",
      comparison_version: comparison.comparison_version
    }
  };
  extraction.interpretation_fingerprint = proposalCoreFingerprint(extraction);
  return extraction;
}

export function assertRoundtableInterpretiveExtractionIntegrity(extraction, input, comparison, responses) {
  const { configured, map } = assertSources(input, comparison, responses);
  if (!extraction || extraction.extraction_version !== ROUNDTABLE_INTERPRETIVE_EXTRACTION_VERSION) {
    throw new Error("Roundtable interpretive extraction was not produced by RT-04");
  }
  if (extraction.status !== "proposed_not_human_reviewed" || extraction.authority !== "interpretive_proposal_only") {
    throw new Error("RT-04 extraction authority or status was modified");
  }
  if (extraction.roundtable_input_id !== input.id || extraction.comparison_id !== comparison.id ||
      extraction.package_id !== input.package_id || extraction.package_revision !== input.package_revision ||
      extraction.transfer_view_id !== input.transfer_view_id ||
      extraction.semantic_fingerprint?.algorithm !== input.semantic_fingerprint?.algorithm ||
      extraction.semantic_fingerprint?.value !== input.semantic_fingerprint?.value) {
    throw new Error("RT-04 extraction does not match its RT-01 / RT-03 source");
  }
  if (JSON.stringify(extraction.providers) !== JSON.stringify(configured)) {
    throw new Error("RT-04 extraction provider set was modified");
  }
  if (extraction.human_review?.required !== true || extraction.human_review?.state !== "pending") {
    throw new Error("RT-04 extraction must remain pending Human review");
  }
  if (extraction.provenance?.source_authenticity !== "unverified_interpretive_output") {
    throw new Error("RT-04 interpretive provenance was upgraded without evidence");
  }
  assertNoDecisionFields(extraction, "extraction");

  if (!Array.isArray(extraction.source_responses) || extraction.source_responses.length !== configured.length) {
    throw new Error("RT-04 source response bindings are incomplete");
  }
  for (let i = 0; i < configured.length; i += 1) {
    const provider = configured[i];
    const expected = map.get(provider);
    const actual = extraction.source_responses[i];
    if (actual?.provider !== provider || actual.response_id !== expected.id || actual.rendering_id !== expected.rendering_id ||
        actual.response_fingerprint?.algorithm !== expected.response_fingerprint?.algorithm ||
        actual.response_fingerprint?.value !== expected.response_fingerprint?.value ||
        actual.response_fingerprint?.length !== expected.response_fingerprint?.length) {
      throw new Error(`RT-04 source response binding was modified: ${provider}`);
    }
  }

  const ids = new Set();
  const itemById = new Map();
  for (const item of [...(extraction.claims || []), ...(extraction.assumptions || [])]) {
    if (ids.has(item.id)) throw new Error(`RT-04 duplicate normalized proposal id: ${item.id}`);
    ids.add(item.id);
    itemById.set(item.id, item);
    const response = map.get(normalizeProvider(item.provider));
    if (!response) throw new Error(`RT-04 proposal provider is outside the source set: ${item.provider}`);
    if (item.interpretation_status !== "proposed_not_validated") throw new Error(`RT-04 proposal status was modified: ${item.id}`);
    if (!Array.isArray(item.evidence) || !item.evidence.length) throw new Error("RT-04 proposal evidence is missing");
    for (const evidence of item.evidence) {
      if (evidence.response_id !== response.id || evidence.provider !== item.provider ||
          !Number.isInteger(evidence.start) || !Number.isInteger(evidence.end) ||
          evidence.start < 0 || evidence.end <= evidence.start || evidence.end > response.raw_response.length ||
          response.raw_response.slice(evidence.start, evidence.end) !== evidence.quote) {
        throw new Error(`RT-04 evidence binding was modified for ${item.id}`);
      }
    }
  }

  for (const conflict of extraction.conflicts || []) {
    if (conflict.resolution !== "unresolved" || conflict.truth_status !== "not_evaluated" ||
        conflict.interpretation_status !== "proposed_not_validated" ||
        !ROUNDTABLE_CONFLICT_TYPE.includes(conflict.conflict_type)) {
      throw new Error(`RT-04 conflict authority was modified: ${conflict.id}`);
    }
    if (!Array.isArray(conflict.sides) || conflict.sides.length < 2) throw new Error("RT-04 conflict sides are invalid");
    const providers = new Set();
    for (const side of conflict.sides) {
      const provider = normalizeProvider(side.provider);
      if (!map.has(provider) || providers.has(provider)) throw new Error(`RT-04 conflict provider side is invalid: ${provider}`);
      providers.add(provider);
      for (const ref of side.claim_ids || []) {
        const item = itemById.get(ref);
        if (!item || !ref.startsWith("claim_") || item.provider !== provider) {
          throw new Error(`RT-04 conflict claim reference is invalid: ${ref}`);
        }
      }
      for (const ref of side.assumption_ids || []) {
        const item = itemById.get(ref);
        if (!item || !ref.startsWith("assumption_") || item.provider !== provider) {
          throw new Error(`RT-04 conflict assumption reference is invalid: ${ref}`);
        }
      }
      if (!(side.claim_ids || []).length && !(side.assumption_ids || []).length) {
        throw new Error(`RT-04 conflict side has no evidence-backed proposal reference: ${provider}`);
      }
    }
  }

  const expectedFingerprint = proposalCoreFingerprint(extraction);
  if (extraction.interpretation_fingerprint?.algorithm !== expectedFingerprint.algorithm ||
      extraction.interpretation_fingerprint?.value !== expectedFingerprint.value) {
    throw new Error("RT-04 interpretive extraction content was modified");
  }
  return true;
}

export function buildRoundtableInterpretiveExtractionPrompt(input, comparison, responses) {
  const { configured, map } = assertSources(input, comparison, responses);
  const sourceBundle = {
    contract_version: ROUNDTABLE_INTERPRETIVE_CONTRACT_VERSION,
    roundtable_input_id: input.id,
    comparison_id: comparison.id,
    semantic_fingerprint: deepClone(input.semantic_fingerprint),
    purpose: input.purpose,
    providers: configured,
    responses: configured.map((provider) => ({
      provider,
      response_id: map.get(provider).id,
      raw_response: map.get(provider).raw_response
    })),
    rt03_descriptive_comparison: {
      exact_shared_wording: comparison.exact_shared_wording,
      provider_unique_segments: comparison.provider_unique_segments,
      pairwise_matrix: comparison.pairwise_matrix
    }
  };

  return [
    "HIRAKU Roundtable AI — RT-04 Claim / Assumption / Conflict Extraction",
    "",
    "You are performing interpretive extraction only. You are NOT the decision-maker.",
    "Do not declare a winner, truth, best model, majority choice, recommended provider, or final decision.",
    "Do not treat repeated wording or model majority as factual correctness.",
    "Preserve minority and provider-unique views.",
    "Every claim and assumption MUST cite at least one exact verbatim quote from that provider response.",
    "If the same quote occurs multiple times, add a 1-based occurrence number.",
    "Conflict entries are only potential interpretive conflicts; resolution remains unresolved and truth is not evaluated.",
    "",
    "Return exactly one JSON object with this shape:",
    JSON.stringify({
      contract_version: ROUNDTABLE_INTERPRETIVE_CONTRACT_VERSION,
      roundtable_input_id: input.id,
      comparison_id: comparison.id,
      semantic_fingerprint: input.semantic_fingerprint,
      claims: [{ id: "c1", provider: "gpt", statement: "...", evidence: [{ quote: "exact verbatim quote", occurrence: 1 }] }],
      assumptions: [{ id: "a1", provider: "gpt", statement: "...", evidence: [{ quote: "exact verbatim quote", occurrence: 1 }] }],
      conflicts: [{
        id: "x1",
        topic: "...",
        conflict_type: "potential_direct_conflict",
        reason: "...",
        sides: [
          { provider: "gpt", claim_ids: ["c1"], assumption_ids: [] },
          { provider: "claude", claim_ids: ["c2"], assumption_ids: [] }
        ]
      }]
    }, null, 2),
    "",
    "Allowed conflict_type values:",
    ROUNDTABLE_CONFLICT_TYPE.join(", "),
    "",
    "Do not output approval state, Human decision, winner, truth score, model ranking, recommendation, or final answer.",
    "",
    "--- BEGIN GOVERNED SOURCE BUNDLE ---",
    JSON.stringify(sourceBundle, null, 2),
    "--- END GOVERNED SOURCE BUNDLE ---"
  ].join("\n");
}

export class RoundtableInterpretiveExtractionEngine {
  constructor({ auditLog = null, clock = () => new Date() } = {}) {
    this.auditLog = auditLog;
    this.clock = clock;
  }

  buildPrompt(input, comparison, responses) {
    return buildRoundtableInterpretiveExtractionPrompt(input, comparison, responses);
  }

  async ingest(input, comparison, responses, proposalOrText, {
    actor = { type: "system" },
    extractor_label = null
  } = {}) {
    const proposal = typeof proposalOrText === "string"
      ? parseRoundtableInterpretiveProposal(proposalOrText)
      : proposalOrText;
    const extraction = normalizeRoundtableInterpretiveProposal(
      input,
      comparison,
      responses,
      proposal,
      { extractor_label }
    );
    extraction.extracted_at = nowIso(this.clock);
    assertRoundtableInterpretiveExtractionIntegrity(extraction, input, comparison, responses);

    await this.auditLog?.append({
      project_id: extraction.project_id,
      action: "roundtable_interpretive_extraction_proposed",
      actor,
      entity_type: "roundtable_interpretive_extraction",
      entity_id: extraction.id,
      metadata: {
        roundtable_input_id: extraction.roundtable_input_id,
        comparison_id: extraction.comparison_id,
        package_id: extraction.package_id,
        package_revision: extraction.package_revision,
        providers: deepClone(extraction.providers),
        response_ids: extraction.source_responses.map((entry) => entry.response_id),
        semantic_fingerprint: `${extraction.semantic_fingerprint.algorithm}:${extraction.semantic_fingerprint.value}`,
        interpretation_fingerprint: `${extraction.interpretation_fingerprint.algorithm}:${extraction.interpretation_fingerprint.value}`,
        claim_count: extraction.claims.length,
        assumption_count: extraction.assumptions.length,
        conflict_count: extraction.conflicts.length,
        human_review_state: extraction.human_review.state,
        source_authenticity: extraction.provenance.source_authenticity
      }
    });

    return deepClone(extraction);
  }
}
